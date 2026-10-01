# RYUKSAIDSO RBAC Reference

Two independent authorization layers protect the platform. Both are enforced **on the server**; frontend checks are only for display.

## 1. Workspace RBAC (`Membership.role`)

Roles: `OWNER`, `ADMIN`, `AGENT`, `VIEWER` — stored per `(user, organization)` membership.

| Capability | OWNER | ADMIN | AGENT | VIEWER |
|---|---|---|---|---|
| Read dashboard/runs/traces/knowledge/policies/evaluations | ✓ | ✓ | ✓ | ✓ |
| Queue runs, retry, decide approvals, create evaluations/tickets/documents | ✓ | ✓ | ✓ | — |
| Projects, agents, versions, policies, LLM provider, org settings | ✓ | ✓ | — | — |
| Members: change roles, remove, invitations, API keys | ✓ | ✓ | — | — |
| Grant the `OWNER` role | ✓ | — | — | — |

Server-side guards are `requireRole([...])` inside routes (returns `403 Insufficient permissions`) — e.g. `POST /api/control/projects` requires `OWNER|ADMIN`, `POST /api/control/runs` allows `OWNER|ADMIN|AGENT`. Rules enforced in handlers:

- Only an owner can grant `OWNER`.
- The owner cannot demote themselves; the last owner cannot be demoted or removed.
- You cannot remove yourself from a workspace.
- Role changes revoke the target member's active sessions.
- Invitations can only grant `ADMIN|AGENT|VIEWER` (default `VIEWER`) and must be accepted by the invited email address.
- Billing changes (checkout, plan switch, cancellation) are restricted to `OWNER|ADMIN` and, when the global enforcement toggle is on, quota/feature limits answer `402 PaymentRequired` after the role and validation checks — see [BILLING.md](BILLING.md).

Listed endpoints: `GET/PATCH /api/members`, `DELETE /api/members/:id`, `GET/POST /api/workspace/invitations`, `DELETE /api/workspace/invitations/:id`, `POST /api/workspace/invitations/accept`, `GET/POST/PATCH /api/api-keys` and `DELETE /api/api-keys/:id` (OWNER/ADMIN only), mirrored by `PATCH /api/admin/members/:id/role` and `POST /api/admin/members/:id/revoke-sessions`.

## 2. System RBAC (`User.userRole`)

Roles: `USER` (default at registration), `ADMIN`.

- Gates the **Admin** navigation item, the **System users** panel and the observability UI/API routes. System-admin API routes enforced by the `requireAdmin` middleware: `GET /api/admin/users`, `PATCH /api/admin/users/:userId/role` (`{ "userRole": "USER" | "ADMIN" }`) and `GET /api/admin/users/overview` (cross-workspace user details with per-user projects, agents, runs and tokens).
- Gates the entire billing administration surface: `/api/admin/billing/*` (overview, plans CRUD, subscriptions list/action/status override, payments, webhooks, enforcement toggle) resolves the caller's system role from the database on every request (`systemAdmin()`) and returns `403` for everyone else. Every billing admin action is audit-logged.
- `requireAdmin` **rejects API keys** (`403`) — system-admin actions require a session.
- `GET /api/admin/observability/*` (summary, errors, requests, backends) resolves the caller's system role directly from the database (`systemAdmin()`) and returns `403` for everyone else; an API key passes only when its owner is a system admin.
- Self-demotion to `USER` is blocked (`400`).
- Bootstrap: emails listed in the `SYSTEM_ADMIN_EMAILS` env var (comma-separated, lowercased) are promoted to `ADMIN` at sign-in, token refresh and `/me`. The allowlist only promotes; explicit grants/revocations through the endpoint stay authoritative. Leave it empty to disable auto-promotion.
- Other `/api/admin/*` routes (`overview`, `runs`, `audit`, member role management) accept workspace `OWNER`/`ADMIN` **or** a system admin via the `admin()` resolver.

### Admin-only agent tools

Twelve tools carry the `adminOnly` flag and are restricted to **system admins** (`User.userRole === 'ADMIN'`). Workspace membership roles (`OWNER`/`ADMIN`) do **not** grant them — system `USER` accounts never see these two tool categories:

- **Database** (read/write): `database_schema`, `database_query`, `database_explain`, `database_insert`, `database_update` — single-statement, `SELECT`/`WITH`-only queries, identifier validation, parameterized values, secret-column redaction and forced `organizationId` on writes.
- **Observability**: `get_observability_summary`, `get_service_health`, `get_system_metrics`, `get_recent_errors`, `search_request_logs`, `prometheus_query`, `loki_query` — read-only, secrets redacted at capture and read time, every execution audit-logged.

Enforced on the server in three layers:

1. `GET /api/tools` filters `adminOnly` tools out of the catalog unless the caller's system role is `ADMIN` (46 tools for system admins, 34 for everyone else — including workspace `OWNER`/`ADMIN` members).
2. The run-time tool gateway re-checks the caller's system role when a run starts and returns `403 Forbidden` (recorded as a `tool.denied` audit event) if an admin tool is invoked by a caller who is not a system admin. API-key-triggered runs inherit the system role of the key's owner.
3. Each admin tool's own `execute` throws `statusCode: 403` before touching the database or any backend.

All side-effecting tools (database writes, `fs_write`, `send_email`, `reply_email`, GitHub mutations, calendar mutations) set `requiresApproval: true` regardless of role — read-only tools (`search_email`, `read_email`, `fs_read`, `fs_list`, `fs_search`, GitHub reads, `fetch_page`, `web_search`, calendar reads) run automatically.

## 4. Frontend helpers (display only)

Located in `apps/web`:

- `src/lib/roles.ts` — `isAdmin`, `isRegularUser`, `getRoleDisplayName`, `getRoleBadgeColor`, `canPerformAdminAction`, `canManageUsers`.
- `src/hooks/useUserRole.ts` — `useUserRole()` (`{ user, isAdmin, isLoading, error, refetch }`), `useIsAdmin()`, `useManageUserRoles()` (`{ users, updateUserRole, fetchUsers }`, calls `PATCH /api/admin/users/:userId/role`).
- `src/components/AdminGuard.tsx` — `AdminGuard`, `AdminMenuItem`, `AdminTab`, `RoleBasedVisibility`, `AdminBadge`, `AdminWarning`.

Example:

```tsx
const { isAdmin } = useUserRole();
{isAdmin && <AdminMenuItem />}
```

## 5. Security rules

1. Never trust frontend role checks — every mutation is re-authorized on the API.
2. Use `requireAdmin` (session-only) for platform-level actions; use `requireRole` for workspace actions.
3. All role changes are written to the audit log (`audit()`).
4. Sessions are revoked whenever a membership role changes.
5. API keys authenticate as OWNER of their own organization only, never as system admins.
6. Prisma enums/types constrain role values; invalid roles return `400 ValidationError`.

## 6. Testing RBAC by hand

```bash
# who am I (system role)
curl -s http://localhost:4001/api/admin/me/role -H "Cookie: ryuksaidso_access=<token>"

# system admin only
curl -s http://localhost:4001/api/admin/users -H "Cookie: ryuksaidso_access=<admin token>"
curl -s -X PATCH http://localhost:4001/api/admin/users/<userId>/role \
  -H "Cookie: ryuksaidso_access=<admin token>; ryuksaidso_csrf=<csrf>" \
  -H "X-CSRF-Token: <csrf>" -H "Content-Type: application/json" \
  -d '{"userRole":"ADMIN"}'
```

Automated coverage lives in `apps/api/src/__tests__/middleware.test.ts` (CSRF, API-key and admin gates), `tool-governance.test.ts` (system-admin-only tool gating, 403 enforcement, SQL/file guards, redaction, admin endpoint gating) and `auth.test.ts` / `auth-helpers.test.ts` (session and password flows).
