# RYUKSAIDSO Feature Map

## Agent platform

- Multi-tenant workspaces
- OWNER / ADMIN / AGENT / VIEWER workspace RBAC
- System RBAC (`User.userRole` ADMIN/USER) gating the Admin surface, bootstrapped via `SYSTEM_ADMIN_EMAILS`
- Projects and agent ownership
- Agent versions and publishing
- Async BullMQ execution
- Durable planner, tool-gateway and synthesizer traces
- Run retry and approval continuation
- Policy enforcement before side effects
- Knowledge retrieval scoped to the workspace
- Regression evaluations
- Tickets and support workflow retained as a first-class feature
- Custom system prompt per agent (optional; overrides instructions in every run stage)
- Category-grouped tool picker on the agent create form

## Agent tools

- Shared tool registry in `@ryuksaidso/agent-tools` — the API serves metadata, the worker executes, so the two never drift
- Knowledge (RAG): `search_knowledge` with OR-ed conversational retrieval and per-agent document scoping
- Tickets: `get_ticket`, `add_ticket_message` (approval-gated)
- Utilities: `current_time` (IANA timezones), `calculator` (safe expression evaluator, no eval), `current_weather` (Open-Meteo primary → Nominatim geocoding + met.no forecast fallbacks, no API key), `unit_convert` (temperature/length/mass/data/volume/speed/time, offline), `text_tools` (stats, base64 encode/decode, slugify, offline)
- Web: `web_search` (DuckDuckGo → Bing → Wikipedia fallback chain; `type` web/news/docs — news searches Google News RSS with publication dates and sources, docs biases toward documentation hosts; `domains` filter, `freshness` day/week/month/year recency filter, engine fallback reported in `note`), `fetch_page` (fetches a public page, strips it to readable text, optional `query` returns the most relevant passages, private/internal hosts and redirect hops are SSRF-checked), `currency_convert` (ECB reference rates via Frankfurter, no key), `dictionary` (Dictionary API with Wiktionary fallback, no key), `news` (Hacker News front page / topic search, no key)
- GitHub (discrete tools): `github_search_repositories`, `github_read_file`, `github_create_issue`, `github_update_issue`, `github_comment_issue`, `github_create_branch`, `github_get_pull_request`, `github_create_pull_request` (optional `GITHUB_TOKEN`; mutations approval-gated), plus the combined `github` tool
- Files: `fs_list`, `fs_read`, `fs_search`, `fs_write` (approval-gated) — sandboxed to `<FILES_ROOT>/<organizationId>`, path traversal rejected, works in the API, worker and agent runtime
- Email: `search_email`, `read_email` (automatic), `send_email`, `reply_email` (confirmation required) — IMAP inbox + SMTP out (`IMAP_*` optional, host derived from SMTP), sent mail persisted as `EmailRecord`, messages redacted before storage
- Calendar: `calendar_list_events` (automatic), `calendar_create_event`, `calendar_update_event`, `calendar_delete_event` (approval-gated) — org-scoped `CalendarEvent` records
- Database (system-admin only): `database_schema`, `database_query`, `database_explain`, `database_insert`, `database_update` — single statement, `SELECT`/`WITH` only, dangerous-function denylist, identifier regex, parameterized values, secret-column redaction, forced `organizationId` on writes
- Observability (system-admin only): `get_observability_summary`, `get_service_health`, `get_system_metrics`, `get_recent_errors`, `search_request_logs`, `prometheus_query`, `loki_query` — API-native request/log ring buffer works out of the box; Prometheus and Loki activate automatically when the stack is reachable; everything read-only, redacted and audit-logged
- MCP integrations: any MCP server configured through `MCP_SERVERS` (stdio command or HTTP URL) appears as `mcp__<server>__<tool>`; write-like tool names require human approval
- Tool errors return `{error}` payloads instead of failing the whole run; `adminOnly` tools (Database, Observability) throw `403` for callers who are not system admins and are hidden from their catalog

## Model routing

- Local Ollama
- OmniRoute OpenAI-compatible gateway
- Custom model providers: bring your own endpoint — OpenRouter, Groq, Together, a company gateway, or a local Ollama / LM Studio / vLLM server (`openai_compat` or `ollama` kind, optional API key, default model)
- Per-workspace provider CRUD at `/api/models/providers` (OWNER/ADMIN): encrypted API keys (AES-256-GCM), model discovery before activation, duplicate-name guard
- Endpoint policy: `http(s)` only, cloud metadata addresses blocked, loopback/private addresses allowed for local models, Docker localhost remapped to `host.docker.internal`
- Workspace default provider (OmniRoute for new workspaces) with one-click "Make default" for custom providers
- Per-run provider override
- Custom-provider-first routing with automatic fallback to the workspace built-ins (connection-level failures only)
- OmniRoute-first with automatic Ollama fallback for ticket runs and evaluations (connection-level failures only; HTTP errors surface instead of silently re-running)
- Provider model discovery, health probes (manual Test with optional chat probe plus a 15-minute worker sweep recording status/latency/last error)
- Persisted provider on each run
- Docker localhost-to-host routing

## Identity and security

- Email/password sign-in
- Workspace creation and workspace switching
- Workspace invitations (email link, 7-day single-use token)
- Email verification (registration + re-send from Settings)
- Google OAuth
- GitHub OAuth
- Forgot-password email flow
- Single-use reset tokens
- Session revocation after password reset and on password change
- HTTP-only cookies
- CSRF protection
- API-key authentication (hashed secrets, shown once)
- Audit logging
- Rate limiting with `RateLimitExceeded` responses

## Control plane

- Command Center
- Run Lab
- Agents
- Projects
- Tickets (threaded agent replies + approval-gated writes)
- Traces (planner/tool/synthesizer steps rendered as visual observability cards, answer prose and collapsible raw details)
- Evaluations (persisted per-case scores, run history)
- Approval Center
- Knowledge Base (per-agent scoping, conversational retrieval)
- Policies
- Developer/API keys
- Docs and Architecture pages
- Profile editing
- Password management
- Workspace settings
- LLM routing settings
- System / light / dark theme switching

## Administration

- 14-day operational analytics
- Run volume graph
- Completion/failure donut
- Token and latency metrics
- Top-agent activity
- Recent run inspection
- Member management
- Role controls
- Audit stream
- Provider/model visibility
- Live observability section (status pill, system metrics, service health, traffic, error stream with request IDs, request logs, Grafana link)

## Billing and subscriptions

- Cashfree gateway: UPI, Google Pay, PhonePe, Paytm, cards and net banking
- Hosted checkout with recurring monthly/yearly mandates
- Plans: Free, Starter (₹499), Pro (₹1,999), Business (₹4,999) — admin-editable prices and limits
- Webhook receiver with HMAC signature verification and idempotent event ledger
- Automatic subscription status sync (created → pending → active → paused/completed/cancelled)
- Entitlements: agents, members, tickets/month, runs/month, API keys, API access, analytics
- Grace periods: `PENDING` bank approval and cancel-at-period-end keep access until the paid period ends
- Plan changes settle the previous subscription automatically (pause at cycle end)
- Failed-payment and refund recording with reasons
- Payment history per workspace
- Public `/pricing` page + Settings → Billing section with usage meters
- Admin → Billing dashboard: global enforcement toggle, MRR, plans CRUD, subscription override/sync/cancel, payment and webhook inspection
- Global bypass: billing off (default) = full access everywhere; billing outage fails open
- Provider-neutral schema and `BillingProvider` interface so Stripe can be added without touching routes
- `402 PaymentRequired` error envelope with upgrade banners in the app

## Integrations and automation

- 15-provider marketplace: Gmail, Google Drive, Outlook, Slack, Microsoft Teams, WhatsApp Business, Notion, GitHub, Jira, Linear, HubSpot, Shopify, Zapier, Make and n8n
- OAuth 2.0 connection system (authorize URL builder, code exchange, refresh with skew, per-provider probes) with signed short-lived state in Redis
- Credentials encrypted at rest with AES-256-GCM keyed from `JWT_SECRET`; summaries and responses never expose tokens
- Token-type connections for Microsoft Teams (incoming-webhook URL, https-only) and WhatsApp Business (access token + phone number id)
- Agent tool integrations: ~23 soft-fail tools (Gmail search/read/send, Drive read/search, Slack messages, Teams/WhatsApp notify, Notion search/append, Jira/Linear/HubSpot/Shopify records) that use the org's stored connection and fall back to env tokens where allowed
- Knowledge-base integrations with automatic syncing: Google Drive, Notion and GitHub sources upsert `Document`s (15-minute staleness sweep, manual "Sync now", pause/resume)
- Website AI chat widget: embeddable loader script, shadow-DOM bubble, session + run materialization, origin allow-list, email capture, per-workspace public key
- Outbound webhooks with HMAC-SHA256 signatures (`x-ryuksaidso-*` headers), 3 attempts with backoff, delivery log, manual retry, test delivery
- Public event catalog: ticket/run/approval/document/integration/member/widget events
- Zapier / Make / n8n presets create signed webhook endpoints in one click
- Integration activity log and agent tool-call history (from the trace steps) in the dashboard
- Health/status monitoring: connection status, `lastCheckedAt`, per-endpoint delivery success/failure (24h window), platform error feed
- Admin controls: platform-wide enable switch and per-provider kill switches, platform overview, cross-workspace integration logs
- Master switch semantics: disabling integrations blocks connects, agent tools and syncs; org webhook endpoints and the chat widget keep working

## Observability

- Prometheus metrics
- Loki logs
- Grafana dashboard provisioning
- API-native ring buffer: morgan captures requests (with request IDs) and Winston/pino capture error logs into Redis (2-day TTL) for the Admin section and observability tools even when the metrics stack is off
- Admin-only tools: `get_observability_summary`, `get_recent_errors`, `search_request_logs`, `prometheus_query`, `loki_query`, `get_service_health`, `get_system_metrics` (auto-detect Prometheus/Loki, redacted, audit-logged)
- `/health` liveness endpoint
- `/ready` dependency readiness endpoint
- Request IDs
- HTTP request duration metrics
