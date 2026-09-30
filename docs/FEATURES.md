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
- Web: `web_search` (DuckDuckGo → Bing → Wikipedia fallback chain), `github` (search repos / repo details / issues; optional `GITHUB_TOKEN`), `currency_convert` (ECB reference rates via Frankfurter, no key), `dictionary` (Dictionary API with Wiktionary fallback, no key), `news` (Hacker News front page / topic search, no key)
- MCP integrations: any MCP server configured through `MCP_SERVERS` (stdio command or HTTP URL) appears as `mcp__<server>__<tool>`; write-like tool names require human approval
- Tool errors return `{error}` payloads instead of failing the whole run

## Model routing

- Local Ollama
- OmniRoute OpenAI-compatible gateway
- Workspace default provider
- Per-run provider override
- OmniRoute-first with automatic Ollama fallback for ticket runs and evaluations (connection-level failures only; HTTP errors surface instead of silently re-running)
- Provider model discovery
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
- Traces
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

## Observability

- Prometheus metrics
- Loki logs
- Grafana dashboard provisioning
- `/health` liveness endpoint
- `/ready` dependency readiness endpoint
- Request IDs
- HTTP request duration metrics
