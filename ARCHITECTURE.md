# RYUKSAIDSO Architecture

**Founder: Faizan Hameed (aka Faizcasm)** · Live: https://ryuksaidso.faizcasm.me · Interactive 3D view: https://ryuksaidso.faizcasm.me/architecture

## Product boundary

RYUKSAIDSO is a multi-tenant control plane for AI agents. The primary entity is an **AgentRun**, not a support ticket.

A run is durable from creation to terminal state and contains:

- the project and agent version used;
- the trigger and environment;
- the original input;
- ordered execution steps;
- tool calls and retrieved evidence;
- token usage and latency;
- approval records;
- final output or failure reason.

## Runtime pipeline

```text
Prompt
  ↓
Planner
  ↓
Policy / tool gateway
  ├── read tool → execute
  └── write tool → approval record → WAITING_APPROVAL
                                   ↓
                           approval / rejection
                                   ↓
                           continuation run / failure
  ↓
Synthesizer
  ↓
COMPLETED trace
```

Agents are treated as untrusted decision-makers. The worker does not let a model directly mutate application state. Tool calls are mapped to server-side implementations, tenant-scoped, and policy checked before execution.

## Execution topology

Local development (`docker-compose.yml` or `pnpm dev`):

```text
Browser ──► Next.js web :3000 ──► Express API :4001 ──► PostgreSQL :5433
                                        │                      (pgvector/pg16)
                                        ├──► Redis :6379 ◄──── Worker
                                        │     (BullMQ "agent-runs")
                                        └──────────────────────► llm-proxy ──► Ollama :11434
                                                                   │         OmniRoute :20128
                                     Prometheus :9090 / Loki :3100 / Grafana :3001
```

Production (`docker-compose.prod.yml`, optional `docker-compose.tls.yml`):

```text
                    Internet
                       │  :80 / :443
                ┌──────▼───────┐
                │ nginx        │  reverse proxy + load balancer
                │ rate limits  │  /healthz, /metrics (private ranges only)
                │ TLS (overlay)│  ACME webroot → certbot
                └───┬───────┬──┘
        /api, /health│       │ everything else
            round-robin      │
        ┌───────────▼──┐  ┌──▼──────────────┐
        │ api ×N       │  │ web ×1          │  Next.js standalone
        │ (API_REPLICAS)│ │ :3000           │
        └───┬───────┬──┘  └──┬──────────────┘
            │       │        │
   ┌────────▼─┐ ┌───▼────────▼──┐
   │ Postgres │ │ Redis         │  AOF-persisted, BullMQ queue
   │ pg16+vec │ │ "agent-runs"  │
   └────▲─────┘ └──────▲────────┘
        │              │ consume
   ┌────┴──────────────┴────┐        ┌───────────────┐
   │ worker ×WORKER_REPLICAS│───────►│ llm-proxy     │ host network
   │ WORKER_CONCURRENCY     │        │ 11435→11434   │ → Ollama / OmniRoute
   └────────────────────────┘        │ 20129→20128   │
                                     └───────────────┘
   migrate (one-shot: prisma migrate deploy, runs before api/worker start)

   --profile observability: Prometheus · Grafana (127.0.0.1:3001) · Loki · Promtail
```

Key properties:

- **nginx** is the only published entry point (80/443). The `api_backend` upstream resolves the `api` service name through Docker DNS, so `API_REPLICAS` containers are round-robined with `proxy_next_upstream` failover. `/api/auth/` gets a stricter rate-limit zone; `/metrics` is denied from public ranges.
- **Ordering**: `migrate` must complete successfully before `api`/`worker` start; `api` must be healthcheck-healthy before `nginx`/`web` start.
- **llm-proxy** exists because provider runtimes bind host loopback, which containers cannot reach; it forwards `11435 → 127.0.0.1:11434` and `20129 → 127.0.0.1:20128` with host networking. `DOCKER_RUNTIME=true` additionally rewrites any localhost provider URL to `host.docker.internal`.
- **Observability** is opt-in via the compose profile; scrapes `GET /metrics`, ships container logs Promtail → Loki, dashboards in Grafana.

## Service boundaries

- `apps/web`: Next.js 15 control plane (standalone output in Docker). Presentation and user interaction only.
- `apps/api`: Express 5 HTTP boundary — auth, RBAC, CSRF, persistence, policy records, run dispatch, `/health` `/ready` `/metrics`.
- `apps/worker`: BullMQ consumer. Executes durable agent runs and tool gateway actions with retries/backoff.
- `packages/agent-runtime`: provider-agnostic run orchestration and trace persistence contract.
- `packages/agent-tools`: single tool registry shared by API (metadata) and worker (execution), plus MCP loading — the two sides cannot drift.
- PostgreSQL (pgvector/pg16): source of truth, Prisma migrations.
- Redis: queue transport (`agent-runs`), OAuth state, coordination.
- nginx / certbot: edge routing, TLS, rate limits.
- Prometheus / Loki / Grafana / Promtail: telemetry and operator visibility.

## Request lifecycle

1. Browser or machine client authenticates (session cookies or `Bearer rsk_` API key); non-GET cookie requests carry `x-csrf-token`.
2. Express applies request ID, Helmet, CORS, compression, rate limits, then route-level Zod validation and tenant-scoped queries.
3. Writes are recorded in the audit log; consequential tool actions create approval records instead of executing.
4. `POST /control/runs` (or ticket runs/retries/approval continuations) persists a `QUEUED` run and enqueues a BullMQ job; enqueue failure marks the run `FAILED` and returns `503`.
5. The worker executes planner → policy/tool gateway → synthesizer, persisting every step; gated actions park the run in `WAITING_APPROVAL`.
6. Approval creates a **continuation run** (`trigger=approval-resume`) rather than mutating history; rejection terminally fails the waiting run.
7. State is observable through the UI, `GET /health` / `GET /ready`, `/metrics`, and the optional Grafana/Loki stack.

## Security model

- Tenant checks on protected data access.
- Two RBAC layers: workspace roles (`OWNER`/`ADMIN`/`AGENT`/`VIEWER`) and system roles (`User.userRole` ADMIN/USER, bootstrapped by `SYSTEM_ADMIN_EMAILS`).
- HTTP-only access/refresh sessions; refresh tokens rotated and stored hashed, path-scoped to `/api`.
- CSRF double-submit token for every cookie-authenticated mutation (exempt: login/register/refresh/reset/verify/oauth and API-key clients).
- API keys stored SHA-256 hashed, OWNER-scoped, rejected on system-admin routes.
- Rate limiting at both the application and the nginx edge; request IDs on every response.
- Side-effecting tools can require human approval; policies decide per action scope.
- Password reset/verification tokens hashed, single-use, 30-minute expiry; password change and reset revoke sessions.

## Reliability model

- Background jobs use retries and exponential backoff.
- Each execution step is persisted; retry and approval produce new records instead of overwriting evidence.
- Health (`/health`) and readiness (`/ready`) are separate, with bounded probes (2 s) so a hung dependency cannot hang the endpoint.
- Health-gated deploys: the GitHub Actions workflow records `.last-good-tag` and rolls back automatically when `/healthz` + `/health` do not pass within 3 minutes.
- Metrics avoid unbounded request labels (method/route/status only).
- Failed model calls remain visible as failed operational records — no fake fallback answers.

## Next hardening layers for a public SaaS deployment

- SSO / enterprise OIDC.
- Object storage for large source files.
- Vector embeddings with pgvector for semantic retrieval at scale (schema supports `vector(1536)`; retrieval today is full-text).
- Provider circuit breakers and budget enforcement.
- Dataset versioning and richer evaluation graders.
- Deployment promotion records and environment-scoped credentials.
- Alert rules, on-call routing, and distributed tracing.
- Off-instance backups and a secret manager (the runbook covers on-instance dumps only).
- Real-time run updates: the UI currently polls run status (≈5 s) instead of streaming over WebSocket/SSE.
- Asynchronous email pipeline: verification, reset and invitation mails are sent synchronously in the request; move them onto BullMQ with templates and delivery logging.
- Housekeeping jobs (expired workspace invitations/tokens cleanup) and an SMTP test endpoint.
