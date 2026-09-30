# RYUKSAIDSO API

Base URL: `http://localhost:4001/api` locally, **`https://ryuksaidso.faizcasm.me/api`** in production (nginx terminates TLS and proxies to the API replicas); the runtime endpoints (`/health`, `/ready`, `/metrics`, `/healthz`) are **not** under `/api` and are served directly by nginx/API.

All responses are JSON. Every response carries an `x-request-id` header (taken from the request or generated).

## Authentication

Three authentication mechanisms exist:

1. **Session cookies** (browser) — issued by `/auth/login`, `/auth/register`, `/auth/refresh`, OAuth callback and workspace switching.
   - `ryuksaidso_access` — HTTP-only JWT access token (default TTL 15m, `ACCESS_TOKEN_TTL`), valid on any path.
   - `ryuksaidso_refresh` — HTTP-only rotating refresh token (default 30 days, `REFRESH_TOKEN_TTL_DAYS`), scoped to path `/api` and read only by `/auth/refresh`.
   - `ryuksaidso_csrf` — readable (non-HTTP-only) double-submit CSRF token, 24h.
2. **Workspace API key** — `Authorization: Bearer rsk_...` created via `POST /api-keys`. The secret is shown once at creation and stored SHA-256 hashed. A key authenticates as an OWNER-role member of its organization (last-used timestamp is updated on every call). API keys are rejected by the system-admin routes (`/admin/users*`).
3. **Public routes** — `/auth/*` (except where noted), `/docs*`, `/architecture*`, `/health`, `/ready`, `/metrics`.

### CSRF rule

Every non-`GET`/`HEAD`/`OPTIONS` request under `/api` must send `x-csrf-token` matching the `ryuksaidso_csrf` cookie, otherwise `403 { "error": "Forbidden", "message": "CSRF validation failed" }`.

Exemptions (no CSRF header needed):

- `/api/auth/login`, `/api/auth/register`, `/api/auth/refresh`, `/api/auth/forgot-password`, `/api/auth/reset-password`, `/api/auth/verify-email`
- anything under `/api/auth/oauth/`
- requests authenticated with `Authorization: Bearer rsk_...` (machine clients)

### Role model

- **Workspace roles** (`Membership.role`): `OWNER`, `ADMIN`, `AGENT`, `VIEWER`. Most reads require only authentication; writes are gated per route (documented below).
- **System roles** (`User.userRole`): `USER`, `ADMIN`. Only system admins pass `requireAdmin` on `/admin/users*`; the other `/admin/*` routes accept workspace `OWNER`/`ADMIN` or a system admin.

## Error envelope

Errors use `{ "error": "<Code>", "message": "<human readable>" }`:

| Status | `error` | When |
|---|---|---|
| 400 | `ValidationError` | Zod body/query validation failed (response includes `issues[]`), or an explicit field/state error |
| 400 | `InvalidToken` / `InvalidInvitation` | Expired/used/unknown verification, reset or invitation token |
| 401 | `Unauthorized` | Missing/invalid access token, refresh session missing/expired, invalid API key |
| 403 | `Forbidden` | Insufficient role, CSRF failure, admin-only route, OAuth/invitation mismatch |
| 404 | `NotFound` | Resource missing or outside the caller's organization |
| 409 | `Conflict` / `ProviderNotConfigured` | Duplicate email (409 `Conflict`), disabled agent (409 `Conflict`), no model configured (409 `ProviderNotConfigured`), missing resolution agent (409 `Conflict`), Prisma `P2002` unique violation |
| 429 | `RateLimitExceeded` | Rate limiter (see below) |
| 500 | `InternalServerError` | Unhandled failure (`requestId` included) |
| 503 | `Unavailable` / `ProviderUnavailable` | OAuth provider not configured; LLM provider unreachable; run could not be queued |

Rate limits: all `/api` traffic is limited to `RATE_LIMIT_MAX` requests per `RATE_LIMIT_WINDOW_MS` (default 600/min). Credential endpoints (`register`, `login`, `verify-email`) allow 20 failed attempts / 15 min; `forgot-password` and `reset-password` allow 6 / 15 min. nginx additionally applies 30 r/s to `/api/` and 5 r/s to `/api/auth/`.

## Runtime endpoints (no `/api` prefix, no auth)

### `GET /health`

Liveness. `200 { "status": "ok", "service": "ryuksaidso-api", "time": "..." }` — never touches dependencies.

### `GET /ready`

Readiness. Checks Postgres (`SELECT 1`, 2s bound), Redis (`PING`, 2s bound) and both LLM providers' model discovery. `200 { "status": "ready", "dependencies": {...}, "providers": [...] }` when at least one provider is reachable, otherwise `503`.

### `GET /metrics`

Prometheus exposition (text/plain; version=0.0.4): HTTP request counters/duration histograms (method/route/status labels only), agent run counters, queue metrics. In production nginx only allows `127.0.0.1` and RFC1918 ranges to reach it.

nginx also serves a static `GET /healthz` (`200 ok`) used by the deploy health gate.

## Auth — `/api/auth` (public)

| Method | Path | Body / notes | Responses |
|---|---|---|---|
| GET | `/auth/providers` | — | `200 { google: bool, github: bool }` |
| POST | `/auth/register` | `{ email, password ≥8, name, organizationName? }` | `200 { user }` + session cookies; creates org (OWNER), provisions default project/policies/agents, sends verification email. `409 Conflict` email taken. Rate-limited |
| POST | `/auth/login` | `{ email, password }` | `200 { user }` + cookies; `401` bad credentials; `403` no workspace membership |
| POST | `/auth/verify-email` | `{ token }` | `200 { verified: true }`; `400 InvalidToken` |
| POST | `/auth/forgot-password` | `{ email }` | `202` always (same body for unknown emails); single-use token, 30 min TTL |
| POST | `/auth/reset-password` | `{ token, password ≥12 }` | `200 { message }`, revokes all sessions, clears cookies; `400 InvalidToken` |
| POST | `/auth/refresh` | reads `ryuksaidso_refresh` cookie | `200 { user }` + rotated cookies; `401` missing/expired (cookies cleared) |
| POST | `/auth/logout` | reads refresh cookie | `204`, revokes session and clears cookies |
| GET | `/auth/oauth/:provider` | `:provider` = `google` \| `github`; PKCE state stored in Redis (10 min) | `302` to provider; `404` unknown provider; `503 Unavailable` when not configured |
| GET | `/auth/oauth/:provider/callback` | `?state&code` | `302` to `/auth/callback` on success (issues cookies) or `/auth/error?reason=...` on failure |

## Control plane — `/api/control` (authenticated)

All routes require auth. Mutations marked with roles beyond authentication are enforced by `requireRole` (`403` otherwise).

### Dashboard

- `GET /control/dashboard` — 24h metrics (`runs24h`, `successRate`, `p95LatencyMs`, `failed24h`, `pendingApprovals`, `documents`, provider/model), projects, agents, latest 8 runs, latest evaluation.

### Projects

- `GET /control/projects` — projects with agent summaries and run counts.
- `POST /control/projects` — **OWNER/ADMIN**. Body: `{ name, slug, description }`. `201` project.
- `PATCH /control/projects/:id` — **OWNER/ADMIN**. Body: any of `{ name?, description?, status?: ACTIVE|PAUSED|ARCHIVED, productionVersion? }` (at least one key). `404` if not in org.

### Agents

- `GET /control/agents` — agents with project and the 5 latest versions.
- `POST /control/agents` — **OWNER/ADMIN**. Body: `{ projectId?, name, slug, instructions, systemPrompt?, tools? }` (defaults to the oldest ACTIVE project when `projectId` is omitted). Creates version 1. `201 { ...agent, version }`; `400` when no project exists; `404` unknown project.
- `PATCH /control/agents/:id` — **OWNER/ADMIN**. Body: any of `{ name?, instructions?, systemPrompt?, enabled?, projectId?, tools? }`. `404` unknown agent/project.
- `POST /control/agents/:id/versions` — **OWNER/ADMIN**. Body: `{ changelog?, config?, publish?: boolean }`. Creates the next immutable version inside a `FOR UPDATE` transaction; when `publish: true` it pins the owning project's `productionVersion` to `"<slug>@v<N>"`. `201` version.

### Runs

- `GET /control/runs?limit=&status=&projectId=` — `limit` clamped 1–200 (default 50); `status` must be a valid `RunStatus` else `400`. Includes agent, project, version number and ordered steps.
- `GET /control/runs/:id` — full run with agent, agent version, project, ordered steps and approvals. `404` if not in org.
- `POST /control/runs` — **OWNER/ADMIN/AGENT**. Body: `{ agentId, prompt, projectId?, provider?: OLLAMA|OMNIROUTE, environment?, trigger?, metadata? }` (defaults `environment: "development"`, `trigger: "playground"`). `202 { runId, jobId }`. Errors: `404` agent/project unknown, `409 Conflict` agent disabled, `409 ProviderNotConfigured` no model for the provider, `400` agent not in selected project, `503` enqueue failure (run is marked `FAILED`).
- `POST /control/runs/:id/retry` — **OWNER/ADMIN/AGENT**. Clones the run as a new `QUEUED` record with `trigger: "retry"`; history is never mutated. `202 { runId }`; `404` unknown; `503` enqueue failure.

### Policies

- `GET /control/policies` — all policies for the workspace.
- `POST /control/policies` — **OWNER/ADMIN**. Body: `{ name, description, action, enabled?, requiresApproval?, severity?: low|medium|high|critical, conditions? }`. `201` policy.
- `PATCH /control/policies/:id` — **OWNER/ADMIN**. Any subset of the same fields. `404` unknown.

### Tool catalog

- `GET /control/tools` — static metadata for the three core tools (`search_knowledge`, `get_ticket`, `add_ticket_message`) with scope and risk.

## Core app — `/api` (authenticated)

- `GET /me` — `{ user: { ...jwtClaims, userRole } }`.
- `GET /tickets` — tickets with ordered messages.
- `POST /tickets` — **OWNER/ADMIN/AGENT**. `{ title, description, requesterEmail? }`. `201` ticket (first message created with it).
- `POST /tickets/:id/run` — **OWNER/ADMIN/AGENT**. Queues a run of the enabled `resolution` agent against the ticket. `202 { jobId, runId }`; `404` ticket unknown; `409 Conflict` resolution agent missing; `409 ProviderNotConfigured` no model configured.
- `GET /runs` — latest 30 runs with steps and ticket (compact list view).
- `GET /documents` — knowledge documents, newest first.
- `POST /documents` — **OWNER/ADMIN/AGENT**. `{ title, content, source?, agentId?, metadata? }` (content max 2 MB). `201` document; `404` when `agentId` is not in the workspace.
- `GET /agents` — flat agent list (name-ordered).
- `PATCH /agents/:id` — **OWNER/ADMIN**. Same body as `PATCH /control/agents/:id`.
- `GET /tools` — merged tool metadata (built-in registry + configured MCP tools), `execute` functions stripped.

## Account & workspace — `/api` (authenticated)

| Method | Path | Roles / notes | Responses |
|---|---|---|---|
| GET | `/profile` | self | `200` profile; `404` |
| PATCH | `/profile` | self; `{ name ≥2, bio?, jobTitle?, avatarUrl?, timezone?, theme?: light\|dark\|system }` | `200` profile; `400` invalid name |
| POST | `/profile/verify-email` | self; re-issues verification token (30 min) | `200` already verified; `202` sent / `202` delivery failure |
| POST | `/profile/password` | `{ currentPassword, newPassword ≥12 }`; revokes other sessions, keeps current one | `204`; `400` wrong current password or OAuth-only account |
| GET | `/llm/providers` | — | `200 { current, providers[] }` with per-provider model discovery |
| GET | `/llm` | — | `200 { llmProvider, ollamaModel, omnirouteModel }` |
| PATCH | `/llm` | **OWNER/ADMIN**; `{ provider: OLLAMA\|OMNIROUTE, model }`; validates the model exists | `200`; `400 ModelUnavailable`; `503 ProviderUnavailable` |
| GET | `/organization` | — | `200` org + counts |
| PATCH | `/organization` | **OWNER/ADMIN**; `{ name }` | `200` org |
| GET | `/members` | — | `200` memberships with user summaries |
| PATCH | `/members/:id/role` | **OWNER/ADMIN**; `{ role: OWNER\|ADMIN\|AGENT\|VIEWER }`; only OWNER can grant OWNER; demoting the last owner or yourself is rejected; revokes the member's sessions | `200`; `400`/`403`/`404` |
| DELETE | `/members/:id` | **OWNER/ADMIN**; cannot remove yourself or an owner | `204`; `400`/`404` |
| GET | `/workspaces` | — | `200` memberships incl. `active` flag |
| POST | `/workspaces/:organizationId/switch` | requires refresh cookie; re-issues tokens scoped to that org | `200 { user }`; `401` no refresh; `403` not a member |
| GET | `/workspace/invitations` | **OWNER/ADMIN**; latest 100 | `200` |
| POST | `/workspace/invitations` | **OWNER/ADMIN**; `{ email, role?: ADMIN\|AGENT\|VIEWER }` (default VIEWER) | `201 { ..., emailSent, inviteUrl }` (7-day token); `409` already a member |
| DELETE | `/workspace/invitations/:id` | **OWNER/ADMIN** | `204`; `404` |
| POST | `/workspace/invitations/accept` | self; `{ token }`; e-mail must match the invitee | `201 { membership, organization, user }` and switches session; `400 InvalidInvitation`; `403` wrong email |
| GET | `/sessions` | active sessions (id, createdAt, expiresAt) | `200` |
| POST | `/sessions/revoke-all` | revokes all of the caller's sessions (including current refresh) | `204` |
| GET | `/api-keys` | returns `[]` for non OWNER/ADMIN; otherwise metadata only (no secret) | `200` |
| POST | `/api-keys` | **OWNER/ADMIN**; `{ name }` | `201 { id, name, prefix, secret, createdAt }` — `secret` (`rsk_...`) shown once |
| DELETE | `/api-keys/:id` | **OWNER/ADMIN** | `204`; `404` |
| GET | `/audit?limit=` | `limit` 1–250 (default 100) | `200` audit log entries |
| GET | `/security` | — | `200 { rbac, role, members, pendingApprovals, activeSessions, apiKeys, auditTrail, httpOnlySession }` |

## Approvals — `/api` (authenticated)

- `GET /approvals` — only `PENDING` approvals for the workspace, newest first.
- `POST /approvals/:id/decision` — **OWNER/ADMIN/AGENT**. Body `{ approved: boolean }`. Claim is atomic (`updateMany` on `PENDING`).
  - Approve: creates a continuation run (`trigger: "approval-resume"`, approved scope appended to `approvedScopes`), marks the source run `COMPLETED` with `{ state: "APPROVED", continuationRunId }`, enqueues it. `200` approval incl. `continuationRunId`.
  - Reject: terminally fails the waiting run (`FAILED`). `200` approval.
  - `404` when the approval is missing, not pending, or already decided.

## Evaluations — `/api` (authenticated)

- `GET /evaluations` — evaluation history, newest first.
- `POST /evaluations` — **OWNER/ADMIN/AGENT**. Body: `{ agentId?, projectId?, name?, dataset: [{ id?, input, expectedIntent }] }` (max 500 cases). Runs intent classification per case through the workspace provider with OmniRoute→Ollama fallback, persists `{ score, results, provider }`. `201` evaluation; `404` unknown agent/project; `403` viewer.

## Admin — `/api/admin`

`requireAuth` for all; workspace `OWNER`/`ADMIN` or system `ADMIN` for most; `requireAdmin` (system `ADMIN`, session auth only — API keys rejected) for the first two.

- `GET /admin/users` — **system ADMIN**. All users with system role and this workspace's membership role.
- `PATCH /admin/users/:userId/role` — **system ADMIN**. `{ userRole: USER | ADMIN }`. `400` invalid role or self-demotion; `404` unknown user.
- `GET /admin/me/role` — `{ user, isAdmin }` for the caller.
- `GET /admin/overview` — 14-day operational overview: org + provider, counts (members/projects/agents/documents/pending approvals/sessions/api keys/open tickets/verified members), daily run series, top agents, provider/status splits, registrations, top tools, live health probes (Postgres/Redis/LLM with latencies), recent runs, members, audit logs. `Cache-Control: no-store`.
- `GET /admin/runs?limit=` — `limit` 1–250 (default 100) runs with approvals and ordered steps.
- `GET /admin/audit?limit=` — `limit` 1–500 (default 200) audit entries.
- `PATCH /admin/members/:id/role` — workspace role change with the same guard rails as `/members/:id/role` (plus self-demotion blocked).
- `POST /admin/members/:id/revoke-sessions` — revokes all sessions of the member behind the membership. `204`; `404`.

## Documentation endpoints — `/api` (public, no auth)

Static JSON used by the in-app docs/architecture pages:

- `GET /docs` — documentation table of contents.
- `GET /architecture` — architecture snapshot (components, layers, data flow, security, observability).
- `GET /architecture/visualize` — scene description for the 3D view.
- `GET /docs/agents` — agent types and lifecycle.
- `GET /docs/langchain`, `GET /docs/langgraph`, `GET /docs/mcp` — integration notes.
- `GET /docs/api/auth` — auth endpoint summary.
- `GET /` → `{ redirect: "/docs" }`.

## Example: queue a run with an API key

```bash
curl -X POST https://ryuksaidso.faizcasm.me/api/control/runs \
  -H "Authorization: Bearer rsk_..." \
  -H "Content-Type: application/json" \
  -d '{"agentId":"clx...","prompt":"Investigate the authentication incident.","environment":"staging","trigger":"ci"}'
```

API-key calls skip the CSRF header; cookie-authenticated browser calls must send `x-csrf-token`.
