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

Listed endpoints: `GET/PATCH /api/members`, `DELETE /api/members/:id`, `GET/POST /api/workspace/invitations`, `DELETE /api/workspace/invitations/:id`, `POST /api/workspace/invitations/accept`, `GET/POST /api/api-keys` (OWNER/ADMIN only), mirrored by `PATCH /api/admin/members/:id/role` and `POST /api/admin/members/:id/revoke-sessions`.

## 2. System RBAC (`User.userRole`)

Roles: `USER` (default at registration), `ADMIN`.

- Gates the **Admin** navigation item and the system-admin API routes enforced by the `requireAdmin` middleware: `GET /api/admin/users` and `PATCH /api/admin/users/:userId/role` (`{ "userRole": "USER" | "ADMIN" }`).
- `requireAdmin` **rejects API keys** (`403`) — system-admin actions require a session.
- Self-demotion to `USER` is blocked (`400`).
- Bootstrap: emails listed in the `SYSTEM_ADMIN_EMAILS` env var (comma-separated, lowercased) are promoted to `ADMIN` at sign-in, token refresh and `/me`. The allowlist only promotes; explicit grants/revocations through the endpoint stay authoritative. Leave it empty to disable auto-promotion.
- Other `/api/admin/*` routes (`overview`, `runs`, `audit`, member role management) accept workspace `OWNER`/`ADMIN` **or** a system admin via the `admin()` resolver.

## 3. Frontend helpers (display only)

Located in `apps/web`:

- `src/lib/roles.ts` — `isAdmin`, `isRegularUser`, `getRoleDisplayName`, `getRoleBadgeColor`, `canPerformAdminAction`, `canManageUsers`.
- `src/hooks/useUserRole.ts` — `useUserRole()` (`{ user, isAdmin, isLoading, error, refetch }`), `useIsAdmin()`, `useManageUserRoles()` (`{ users, updateUserRole, fetchUsers }`, calls `PATCH /api/admin/users/:userId/role`).
- `src/components/AdminGuard.tsx` — `AdminGuard`, `AdminMenuItem`, `AdminTab`, `RoleBasedVisibility`, `AdminBadge`, `AdminWarning`.

Example:

```tsx
const { isAdmin } = useUserRole();
{isAdmin && <AdminMenuItem />}
```

## 4. Security rules

1. Never trust frontend role checks — every mutation is re-authorized on the API.
2. Use `requireAdmin` (session-only) for platform-level actions; use `requireRole` for workspace actions.
3. All role changes are written to the audit log (`audit()`).
4. Sessions are revoked whenever a membership role changes.
5. API keys authenticate as OWNER of their own organization only, never as system admins.
6. Prisma enums/types constrain role values; invalid roles return `400 ValidationError`.

## 5. Testing RBAC by hand

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

Automated coverage lives in `apps/api/src/__tests__/middleware.test.ts` (CSRF, API-key and admin gates) and `auth.test.ts` / `auth-helpers.test.ts` (session and password flows).
