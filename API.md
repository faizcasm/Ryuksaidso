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
- **System roles** (`User.userRole`): `USER`, `ADMIN`. Only system admins pass `requireAdmin` on `/admin/users*` (including `GET /admin/users/overview`), and only system admins pass the `systemAdmin()` resolver on `/admin/observability/*`; the other `/admin/*` routes accept workspace `OWNER`/`ADMIN` or a system admin.

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
- `GET /tools` — merged tool metadata (built-in registry + configured MCP tools), `execute` functions stripped. Admin-only tools (`adminOnly`) are filtered out unless the caller's system role is `ADMIN` — 46 entries for system admins, 34 otherwise (workspace `OWNER`/`ADMIN` members included).

## Account & workspace — `/api` (authenticated)

| Method | Path | Roles / notes | Responses |
|---|---|---|---|
| GET | `/profile` | self | `200` profile; `404` |
| PATCH | `/profile` | self; `{ name ≥2, bio?, jobTitle?, avatarUrl?, timezone?, theme?: light\|dark\|system }` | `200` profile; `400` invalid name |
| POST | `/profile/verify-email` | self; re-issues verification token (30 min) | `200` already verified; `202` sent / `202` delivery failure |
| POST | `/profile/password` | `{ currentPassword, newPassword ≥12 }`; revokes other sessions, keeps current one | `204`; `400` wrong current password or OAuth-only account |
| GET | `/llm/providers` | — | `200 { current, providers[] }` — built-in OLLAMA/OMNIROUTE plus custom providers (each entry carries `custom`, `name`, `kind`, `baseUrl`, `status`, `latencyMs`), with per-provider model discovery |
| GET | `/llm` | — | `200 { llmProvider, ollamaModel, omnirouteModel }` |
| PATCH | `/llm` | **OWNER/ADMIN**; `{ provider: OLLAMA\|OMNIROUTE\|<custom provider id>, model }`; probes the endpoint and validates the model exists (a custom id also stores the model as that provider's `defaultModel`) | `200`; `400 ModelUnavailable`; `503 ProviderUnavailable` |
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
| PATCH | `/api-keys/:id` | **OWNER/ADMIN**; `{ name }` renames the key | `200 { id, name, prefix, lastUsedAt, createdAt }`; `400` invalid name; `404` |
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
- Both endpoints return **`402 PaymentRequired`** when the workspace plan has no analytics access and billing is enforced (the Evaluations tab then shows an upgrade banner).

## Billing — `/api/billing`

`requireAuth` for everything except `GET /plans` and `POST /webhook`. Amounts are integers in **paise**. See [docs/BILLING.md](docs/BILLING.md) for the full flow.

- `GET /billing/plans` — **public**. `{ billingEnabled, provider, configured, environment, currency, plans[] }` for the `/pricing` page (plan definitions only, no org data).
- `GET /billing/subscription` — `{ billingEnabled, enforced, provider, configured, environment, plan, planCode, subscription, contact, entitlements, usage }` — the entitled plan, current subscription, billing contact and monthly usage counters.
- `GET /billing/payments` — the workspace's payment history (newest 60), each with amount, status, method, failure reason and invoice number.
- `POST /billing/checkout` — body `{ planCode, period: MONTHLY|YEARLY, phone? }` (phone required for paid plans, 10-digit Indian mobile). Creates/reuses a local `CREATED` subscription and the Cashfree hosted-checkout session → `{ mode: 'checkout', provider, environment, subscriptionId, subsSessionId, planCode, planName, period, amount, currency, returnUrl }`. Switching to `free` returns `{ mode: 'downgraded', planCode }` and cancels the current subscription immediately. `409` when already subscribed to that plan; `400` invalid phone.
- `POST /billing/checkout/verify` — body `{ subscriptionId }`. Fetches the subscription + payments from Cashfree, settles the previous subscriptions on the `ACTIVE` transition → `{ verified, subscription, payments[] }`. Webhooks remain the source of truth.
- `POST /billing/subscription/change` — alias of checkout for plan changes from the billing section.
- `POST /billing/subscription/cancel` — body `{ mode: 'immediate' | 'at_period_end' }` (default `at_period_end`). `at_period_end` pauses the mandate remotely (entitlement continues until `currentPeriodEnd`); `immediate` cancels. `502` when the gateway answers with neither `PAUSED` nor a terminal status.
- `POST /billing/webhook` — **public, CSRF-exempt, raw body + HMAC signature**. Cashfree webhook receiver; `200` processed/ignored/duplicate, `401` bad signature, `400` missing raw body/type, `500` retryable failure.

Quota hooks elsewhere answer **`402 PaymentRequired`** when a limit is hit: `POST /control/agents`, `POST /tickets`, `POST /control/runs`, `POST /tickets/:id/run`, `POST /account/workspace/invitations`, `POST /account/api-keys`, and every `rsk_` API-key request when the plan has no API access.


## Admin — `/api/admin`

`requireAuth` for all; system `ADMIN` for `/admin/users*` and `/admin/observability/*`; workspace `OWNER`/`ADMIN` or system `ADMIN` for the rest.

- `GET /admin/users` — **system ADMIN**. All users with system role and this workspace's membership role.
- `PATCH /admin/users/:userId/role` — **system ADMIN**. `{ userRole: USER | ADMIN }`. `400` invalid role or self-demotion; `404` unknown user.
- `GET /admin/users/overview` — **system ADMIN**. Cross-workspace user details: `{ totals, registrations, roleSplit, topUsers, users, truncated, generatedAt }` — per-user status (`active`/`idle`/`new`), projects, agents, runs and tokens attributed through the user's organization memberships, plus a daily registration series and a token/run leaderboard. Capped at the 500 newest accounts (`truncated: true` beyond that).
- `GET /admin/me/role` — `{ user, isAdmin }` for the caller.
- `GET /admin/overview` — 14-day operational overview: org + provider, counts (members/projects/agents/documents/pending approvals/sessions/api keys/open tickets/verified members), daily run series, top agents, provider/status splits, registrations, top tools, live health probes (Postgres/Redis/LLM with latencies), recent runs, members, audit logs. `Cache-Control: no-store`.
- `GET /admin/runs?limit=` — `limit` 1–250 (default 100) runs with approvals and ordered steps.
- `GET /admin/observability/summary?sinceMinutes=` — **system ADMIN**. Service health probes (Postgres/Redis/API/Web/LLM/OmniRoute), system metrics (CPU/memory/disk/load), request statistics from the Redis ring buffer, Prometheus/Loki/Grafana backend detection and a presentational payload (`{ status, stats, services, system, backends, presentation }`). `403` for everyone else.
- `GET /admin/observability/errors?sinceMinutes=&limit=&source=` — **system ADMIN**. Merged error stream (ring-buffer request 5xx/4xx + captured error logs + Loki when reachable), secrets redacted, `rootCause` hint and a visual `presentation`. `403` for everyone else.
- `GET /admin/observability/requests?sinceMinutes=&status=&method=&path=&q=&limit=` — **system ADMIN**. Searchable request log with request IDs. `403` for everyone else.
- `GET /admin/observability/backends` — **system ADMIN**. `{ prometheus, loki, grafana, sources }` capability report (configured/reachable per backend). `403` for everyone else.
- All four set `Cache-Control: no-store` and resolve the caller's system role from the database on every request; an API key passes only when its owner is a system admin.
- `GET /admin/audit?limit=` — `limit` 1–500 (default 200) audit entries.
- `PATCH /admin/members/:id/role` — workspace role change with the same guard rails as `/members/:id/role` (plus self-demotion blocked).
- `POST /admin/members/:id/revoke-sessions` — revokes all sessions of the member behind the membership. `204`; `404`.

## Billing administration — `/api/admin/billing`

`requireAuth` + **system `ADMIN` resolved from the database on every request** (`403` otherwise); every endpoint writes an audit entry. Full guide: [docs/BILLING.md](docs/BILLING.md).

- `GET /admin/billing/overview` — `{ billingEnabled, provider, configured, environment, currency, planCount, mrr, subscriptionCounts, payments[], webhookCounts, metrics }`. MRR counts yearly subscriptions divided by 12.
- `GET /admin/billing/plans` — all plans (seeds the defaults on first call).
- `POST /admin/billing/plans` — body `{ code, name, description?, priceMonthly?, priceYearly?, sortOrder?, features?, ...limits }` (prices in paise). `409` duplicate code.
- `PATCH /admin/billing/plans/:planId` — partial update; changing `priceMonthly`/`priceYearly` clears the stored Cashfree plan id so the next checkout recreates it at the new price. `{ isDefault: true }` demotes the other defaults. `404` unknown plan.
- `DELETE /admin/billing/plans/:planId` — refuses the default plan (`409`) and plans with subscriptions (`409`, deactivate instead).
- `GET /admin/billing/subscriptions?status=` — newest 100 subscriptions with workspace name and plan code.
- `POST /admin/billing/subscriptions/:subscriptionId/action` — `{ action: 'cancel' | 'sync' }` — remote cancel through the gateway or a status re-sync from Cashfree. `409` when the gateway is not configured.
- `PATCH /admin/billing/subscriptions/:subscriptionId` — `{ status }` manual override (terminal statuses stamp `canceledAt`/`endedAt`; `ACTIVE` clears them).
- `GET /admin/billing/payments?status=` — newest 200 payments across workspaces.
- `GET /admin/billing/webhooks` — newest 100 webhook deliveries (`eventId, eventType, status, error, receivedAt, processedAt`).
- `GET /admin/billing/settings`, `PUT /admin/billing/settings` — `{ billingEnabled }` **global enforcement toggle**: off (default) = every workspace bypasses plan limits, on = quotas and feature gates are active.

## Integrations — `/api/integrations`

`requireAuth` for everything except the OAuth callback. Reads (catalog, connections, activity, widget settings) are open to every workspace member; connect/disconnect, sources, webhooks and widget writes require `OWNER|ADMIN`. Full guide: [docs/INTEGRATIONS.md](docs/INTEGRATIONS.md).

- `GET /integrations/catalog` — `{ enabled, disabledProviders[], providers[] }` — the 16-provider marketplace with per-provider connection state (`connected`, `status`, `configured`, `comingSoon`, `setupHint`, `redirectUri`, token/tool/event lists). `redirectUri` is the exact callback URL (`<origin>/api/integrations/<provider>/callback`) the provider console must have registered — the dashboard shows it with a copy button. Credentials are never included.
- `GET /integrations/connections` — `{ connections[] }`: `id`, `provider`, `name`, `status`, `scopes`, `profile`, `lastSyncAt`, `lastCheckedAt`, `lastError`, timestamps — no encrypted tokens.
- `POST /integrations/connections/:provider/connect` — **OWNER|ADMIN**. Starts the OAuth dance (signed state in Redis, 10-minute TTL) → `{ url, redirectUri, expiresIn: 600 }`. `404` unknown provider, `400` non-OAuth provider or missing `{ shop }` for Shopify, `403` platform/provider disabled, `503` OAuth env vars missing.
- `GET /integrations/:provider/callback` — **public, CSRF-exempt**. Exchanges the code (client-credentials-in-body or HTTP Basic per provider), encrypts the tokens with AES-256-GCM keyed from `JWT_SECRET`, upserts the `(organizationId, provider)` connection, writes an integration log, emits `integration.connected` and redirects to `${FRONTEND_URL}/dashboard?connected=<provider>` — failures redirect with `?connect_error=<reason>`.
- `POST /integrations/connections/token` — body `{ provider, fields }` for token-type providers (Microsoft Teams `webhookUrl` must be https; WhatsApp `accessToken` + `phoneNumberId`). `201` connection summary, `400` validation.
- `POST /integrations/connections/:id/test` — probes the provider API → `{ ok, detail, status }`.
- `DELETE /integrations/connections/:id` — removes the credentials and emits `integration.disconnected`. `204`; `404` when the connection is not yours.
- `GET /integrations/sources` · `POST /integrations/sources` — knowledge sources for Google Drive, Notion and GitHub (`{ provider, name, connectionId?, remotePath?, autoSync }`). `400` when the provider does not support sources or has no connection/`GITHUB_TOKEN`.
- `PATCH /integrations/sources/:id` · `DELETE /integrations/sources/:id` — rename/re-path, pause auto-sync, or remove (`204`).
- `POST /integrations/sources/:id/sync` — synchronous sync → `{ status, created, updated, unchanged, skipped, error? }`; the source row records `lastSyncAt`/`lastError`.
- `GET /integrations/webhooks` — `{ endpoints[], deliveries[] (last 30), events[] }`.
- `POST /integrations/webhooks` — body `{ name, url, events[] }` → `201` endpoint **including its `whsec_` signing secret (shown once)**. Private/internal URLs are rejected (`400`); unknown event names are rejected (`400`).
- `DELETE /integrations/webhooks/:id` · `POST /integrations/webhooks/:id/test` — remove an endpoint (`204`) or queue a `webhook.test` delivery.
- `POST /integrations/webhooks/deliveries/:id/retry` — retries a `FAILED` delivery → `{ ok, status, attempts }`.
- `GET /integrations/activity?provider=&limit=` — the workspace's integration log (connects, syncs, refresh failures).
- `GET /integrations/tool-activity?limit=` — agent tool-call history from `AgentStep`: `{ items[] }` with `tool`, `status`, `durationMs`, `error`, `runStatus`, `trigger`.
- `GET /integrations/widget` · `PUT /integrations/widget` — widget settings (`{ enabled, agentId, title, greeting, accent, allowedOrigins[], collectEmail }`); the GET returns `{ setting, agent, embedPath }` including the `publicKey`.
- `POST /integrations/widget/regenerate-key` — **OWNER|ADMIN**. New `publicKey` → `{ publicKey }`.

## Chat widget — `/api/widget` (public, CSRF-exempt)

Each route sets its own CORS headers (origin reflected, `Cross-Origin-Resource-Policy: cross-origin`) so the embed works from any site; rate-limited to 120 messages/min/IP.

- `GET /widget.js` — the embeddable loader script (shadow-DOM bubble, polls for replies).
- `GET /widget/:key/config` — `{ title, greeting, accent, collectEmail, agentName }`. `404` unknown key, `403` widget disabled or origin outside `allowedOrigins`.
- `POST /widget/:key/messages` — body `{ content, sessionId?, email?, visitorId? }`. Verifies quota **before** creating anything (`402 PaymentRequired`), then creates the session + a `trigger: 'widget'` agent run and enqueues it → `201 { sessionId, pending: true }`. `400` invalid body, `403` origin, `429` rate limit.
- `GET /widget/:key/sessions/:sessionId` — `{ pending, messages[] }` — materializes the assistant reply from the finished run's `output.answer`.

## Integration administration — `/api/admin/integrations`

`requireAuth` + **system `ADMIN` resolved from the database on every request** (`403` otherwise).

- `GET /admin/integrations/overview` — `{ settings, connections { total, byStatus, byProvider }, sources { total, byStatus }, webhooks { endpoints, delivery24h }, recentErrors[], catalog { providers } }`.
- `GET /admin/integrations/settings` · `PUT /admin/integrations/settings` — `{ enabled, disabledProviders[] }` — the platform-wide switch plus per-provider kill switches (`400` on unknown provider keys). Audit-logged as `admin.integration_settings_updated`.
- `GET /admin/integrations/logs?level=&limit=` — newest platform-wide integration log entries with workspace names.

## Model providers — `/api/models`

`requireAuth` for everything. Reads are open to every workspace member; create/update/delete/test/discover require `OWNER|ADMIN`. API keys are stored AES-256-GCM-encrypted (keyed from `JWT_SECRET`) and never returned — summaries expose `hasKey` only. Endpoint URLs must be `http(s)`; cloud metadata addresses (`169.254.*`, `metadata.google.internal`) are rejected while loopback and private addresses stay allowed so models running on your own machines work.

- `GET /models/providers` — `{ current, providers[] }` — each summary: `id`, `name`, `kind` (`openai_compat`|`ollama`), `baseUrl`, `hasKey`, `defaultModel`, `models[]`, `enabled`, `status` (`UNKNOWN|HEALTHY|DEGRADED|ERROR`), `latencyMs`, `lastCheckedAt`, `lastError`, `isDefault`, `createdAt`.
- `POST /models/providers` — `{ name, kind?, baseUrl, apiKey?, defaultModel?, models?, enabled? }` → `201` summary; audit-logged as `model_provider.created`. `400` invalid URL or duplicate name.
- `PUT /models/providers/:id` — partial update; an omitted `apiKey` keeps the stored key, a provided one replaces it. `200`; `404`.
- `DELETE /models/providers/:id` — `200 { deleted, reverted }`; when the deleted provider was the workspace default, routing reverts to `OMNIROUTE`.
- `POST /models/providers/:id/test` — body `{ chat?: boolean }` → `{ ok, latencyMs, models[], error?, chat?, provider }` and records `status`/`latencyMs`/`lastCheckedAt`/`lastError` (discovery result saved back to `models[]`).
- `POST /models/discover` — `{ kind, baseUrl, apiKey? }` → `{ models[], latencyMs }` probes an endpoint without saving it; `503` unreachable.

Workspace routing: `PATCH /llm` accepts a custom provider id — it probes the endpoint, verifies the model, stores it as the provider's `defaultModel` and sets `Organization.llmProvider` to the id. Runs (playground, tickets, widget) store that id on `AgentRun.provider`; the worker calls the custom endpoint first and automatically falls back to the workspace OmniRoute/Ollama built-ins on connection-level failures. The worker also sweeps every enabled provider every 15 minutes (`GET {base}/models`) to keep `status`/`latencyMs` fresh, and admin health reports probe the active custom provider instead of the built-ins.

## Customer support — `/api/support`

A direct line to the CEO from the app's top bar. Any signed-in member may send; messages are stored with the sender's workspace context, audited as `support.message_sent` and throttled per user with a 15-second cooldown (Redis `NX`, fails open if Redis is unreachable).

- `POST /api/support` — `{ message }` (trimmed, 10–4000 chars) → `201 { id, status, createdAt }`. `400` validation, `429 RateLimitExceeded` inside the cooldown window.
- `GET /api/admin/support` — system admin → `{ messages[100], unread }` newest-first (`id`, `organizationId`, `userId`, `userName`, `userEmail`, `message`, `status` `OPEN|READ`, `readAt`, `createdAt`).
- `PATCH /api/admin/support/:id/read` — system admin → `200` updated message; `404` unknown id. Both admin routes use `requireAdmin` (API keys rejected, `403` for regular users).

The admin inbox renders in the Admin dashboard as the **CEO inbox** panel with an unread badge and per-message mark-as-read.

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
