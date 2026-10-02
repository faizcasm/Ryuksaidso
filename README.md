# RYUKSAIDSO

**RYUKSAIDSO is an Agent Reliability & Control Plane for production AI systems.**

**Live site:** **https://ryuksaidso.faizcasm.me** · Docs: https://ryuksaidso.faizcasm.me/docs · Architecture: https://ryuksaidso.faizcasm.me/architecture · Playground: https://ryuksaidso.faizcasm.me/playground

**Founder: Faizan Hameed (aka Faizcasm).**

It is built for the engineering loop around agents, not another chat wrapper:

> **Design → Run → Trace → Gate → Evaluate → Retry → Ship**

The original support-workspace codebase has been reworked into a multi-tenant platform where teams operate agents like software systems: versioned configuration, immutable history, permission scopes, human approval gates, regression evaluations, audit trails and operational dashboards.

## What is implemented

- Multi-tenant organizations with OWNER / ADMIN / AGENT / VIEWER workspace RBAC, plus a system RBAC layer (`User.userRole`) bootstrapped through `SYSTEM_ADMIN_EMAILS`.
- HTTP-only access + rotating refresh sessions, CSRF double-submit protection, password recovery, email verification, workspace invitations and Google/GitHub OAuth.
- Workspace API keys using `Authorization: Bearer rsk_...` with SHA-256-hashed secrets.
- Projects that isolate agent ownership and execution history.
- Agent registry with enabled/disabled state and immutable version records (publishing pins `project.productionVersion`).
- Async execution using Redis + BullMQ with retries and backoff.
- Durable agent runs with persisted planner/tool/synthesizer trace steps.
- Tool gateway with tenant-scoped retrieval and policy-gated write tools (46 built-in tools — knowledge, tickets, calculator/weather/news/currency/unit/dictionary/text, web search with news/docs/domain/recency filters, page fetch, 8 discrete GitHub tools, workspace file system, email, calendar — plus system-admin-only database and observability tools and MCP servers via `MCP_SERVERS`).
- Human approval queue for consequential actions, including continuation runs after approval.
- Run retry flow that creates a new persisted run instead of mutating history.
- Knowledge documents stored in PostgreSQL with organization-scoped retrieval.
- Evaluation endpoint for persisted regression datasets and pass/fail scores.
- Prometheus metrics, Loki logs, health/readiness endpoints and Grafana provisioning.
- Admin-gated observability: a live Admin section and `get_observability_summary` / `get_recent_errors` / `search_request_logs` / `prometheus_query` / `loki_query` tools backed by the API-native request/log ring buffer (auto-detects Prometheus and Loki when the stack runs), with secret redaction and audit-logged executions.
- Responsive control-plane UI for dashboard, run lab, agent registry, projects, tickets, traces, evaluations, approvals, knowledge, policies, developer keys and admin analytics.

## Monorepo layout

```text
apps/
  api/        Express 5 + Prisma HTTP boundary (auth, RBAC, persistence, run dispatch)
  web/        Next.js 15 control-plane UI (App Router, standalone output)
  worker/     BullMQ consumer that executes durable agent runs and tool actions
packages/
  agent-runtime/  provider-agnostic run orchestration contract
  agent-tools/    shared tool registry (built-in tools + MCP loader) used by API and worker
infra/
  nginx/      reverse proxy / load balancer config (plain + TLS templates)
  loki/ promtail/ prometheus.yml/ grafana/   observability stack config
  llm-proxy.js  loopback forwarder for Ollama/OmniRoute from containers
.github/workflows/  ci.yml, docker.yml, deploy.yml
docker-compose.yml         local development stack
docker-compose.prod.yml    production stack (nginx, api replicas, worker, web, postgres, redis, migrate, llm-proxy, optional observability profile)
docker-compose.tls.yml     certbot + HTTPS redirect + TLS vhost overlay
.env.example               local environment template
.env.production.example    server-side production environment template
API.md · ARCHITECTURE.md · CONTRIBUTING.md · QUICK_START.md · DETAILRYUKSAIDSO.md · docs/
```

## Tech stack

- TypeScript everywhere; pnpm workspaces monorepo (`pnpm@10.15.0`).
- **Web**: Next.js 15.5, React 19.
- **API**: Express 5.1, Zod 4 validation, Helmet, CORS, express-rate-limit, morgan → structured logger.
- **Data**: PostgreSQL 16 (`pgvector/pgvector:pg16`, Prisma 6, pgvector extension), Redis 7 (BullMQ queue `agent-runs`).
- **LLM**: OpenAI-compatible `/chat/completions` — local Ollama and/or an OmniRoute gateway, with automatic fallback for connection-level failures.
- **Observability**: Prometheus, Loki, Promtail, Grafana (optional `observability` compose profile).
- **Infra**: Docker images built from frozen lockfiles, nginx reverse proxy/load balancer, certbot TLS, GitHub Actions CI/CD to AWS EC2.

## Local development quick start

```bash
pnpm install
cp .env.example .env
```

Set real values for `POSTGRES_PASSWORD`, `JWT_SECRET` and `GRAFANA_ADMIN_PASSWORD`:

```bash
openssl rand -base64 48   # JWT_SECRET
openssl rand -base64 32   # POSTGRES_PASSWORD
openssl rand -base64 24   # GRAFANA_ADMIN_PASSWORD
```

For the default local model runtime:

```bash
ollama serve
ollama pull qwen2.5-coder:3b-instruct-q4_K_M
```

Full stack in Docker:

```bash
docker compose up --build
```

Or run the apps directly against the compose-managed Postgres/Redis:

```bash
pnpm db:generate
pnpm db:migrate
pnpm dev        # api (:4001) + web (:3000) + worker in parallel
```

Open `http://localhost:3000` and create a workspace.

| Service | URL |
|---|---|
| Control plane | http://localhost:3000 |
| API | http://localhost:4001/api |
| Postgres | localhost:5433 |
| Redis | localhost:6379 |
| OmniRoute gateway (when `omniroute serve` is running) | http://localhost:20128 |
| Prometheus | http://localhost:9090 |
| Grafana | http://localhost:3001 |
| Loki | http://localhost:3100 |

OAuth callbacks for local clients: `http://localhost:4001/api/auth/oauth/google/callback` and `http://localhost:4001/api/auth/oauth/github/callback`.

## Developer quick curl (live site)

Everything the dashboard does is plain HTTP against https://ryuksaidso.faizcasm.me — no local install needed:

```bash
curl https://ryuksaidso.faizcasm.me/healthz
curl https://ryuksaidso.faizcasm.me/health
curl https://ryuksaidso.faizcasm.me/ready
curl https://ryuksaidso.faizcasm.me/api/docs
curl https://ryuksaidso.faizcasm.me/api/architecture
curl -X POST https://ryuksaidso.faizcasm.me/api/control/runs \
  -H "Authorization: Bearer rsk_..." \
  -H "Content-Type: application/json" \
  -d '{"prompt":"Summarise yesterday\'s tickets","agentId":"..."}'
curl -X POST https://ryuksaidso.faizcasm.me/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"you@example.com","password":"..."}'
```

`GET /api/me` answers `401` when logged out — that is the expected unauthenticated probe. Page routes are all served over HTTPS with an HTTP→HTTPS redirect, and every response carries HSTS.

## Environment variables

`.env.example` is the complete template for local development (application URLs, Postgres, Redis, API/CORS, JWT/session TTLs, LLM providers, OAuth, agent tools, SMTP/IMAP and file sandbox, worker, observability, integration OAuth clients, feature flags); every value is self-describing or a clearly-marked placeholder. `.env.production.example` is the server-side template used by `docker-compose.prod.yml` on the instance (copy it to `/opt/ryuksaidso/.env`, which is the name compose reads).

Key variables:

| Variable | Purpose |
|---|---|
| `POSTGRES_PASSWORD`, `JWT_SECRET` | Required secrets; production compose refuses to start without them |
| `CORS_ORIGIN`, `FRONTEND_URL` | Allowed origin and UI base URL (comma-separated origins supported) |
| `COOKIE_SAME_SITE`, `COOKIE_SECURE` | Cookie policy; `COOKIE_SECURE` defaults to whether `FRONTEND_URL` is `https://`, so plain-HTTP deployments still log in |
| `DOMAIN`, `CERT_NAME` | TLS overlay (`docker-compose.tls.yml`) certificate names |
| `DOCKERHUB_USERNAME`, `IMAGE_TAG` | Image coordinates for the production compose files |
| `API_REPLICAS`, `WORKER_REPLICAS`, `WORKER_CONCURRENCY` | Horizontal scaling of API/worker containers |
| `OLLAMA_URL` / `OMNIROUTE_URL` (+ `_DOCKER` variants in dev compose) | OpenAI-compatible provider endpoints; containers reach host loopback through the `llm-proxy` service (`:11435 → 11434`, `:20129 → 20128`) |
| `SYSTEM_ADMIN_EMAILS` | Comma-separated allowlist promoted to system `ADMIN` at sign-in/refresh |
| `SMTP_*`, `EMAIL_FROM` | Real email delivery for verification/reset/invite mails (dev falls back to logging the URL) |
| `GRAFANA_ADMIN_USER`, `GRAFANA_ADMIN_PASSWORD` | Grafana bootstrap credentials |

The workspace default provider/model is selected per organization in **Settings → Model provider** (`PATCH /api/llm`); new workspaces default to **OmniRoute** and unconfigured providers (for example Ollama without a reachable server) are labelled `unconfigured` in the UI. Env values are only the fallback.

## Quality commands

```bash
pnpm lint         # ESLint flat config (eslint.config.mjs), no-unused-vars etc.
pnpm typecheck    # tsc --noEmit across api/web/worker/packages
pnpm test         # vitest — 309 tests in apps/api/src/__tests__
pnpm build        # prisma generate + tsc for api/worker/packages, next build for web
pnpm db:generate  # prisma client
pnpm db:migrate   # apply Prisma migrations
```

Project convention: **source files must not contain comments** — no `//`, no `/* */`, no JSDoc/TSDoc in anything under `apps/` or `packages/`. See [CONTRIBUTING.md](CONTRIBUTING.md).

## Testing summary

- 16 vitest files, **309 tests**, all green: validation schemas, auth helpers (bcrypt round trips), middleware (CSRF, API-key and admin gates), config/provider normalization, LLM fallback behaviour, agent tools, tool governance (system-admin-only gating, SQL/file-system guards, secret redaction, approval flags, search filters), system users overview builder, evaluator, regressions, billing (Cashfree signature verification, webhook idempotency, entitlements/quotas, plan-change settling), integrations (credential crypto, OAuth exchange, webhook signing/delivery, knowledge sync, widget routes, marketplace/admin guards), model providers (custom endpoint CRUD, encrypted API keys, endpoint URL guards, health probes, workspace routing and run fallback) and HTTP server routes.
- Tests are hermetic (mocked Prisma/Redis) and run in CI after `pnpm db:generate`.
- The worker/agent-runtime packages have no standalone unit tests; their behaviour is exercised through the API harness and the running stack.

## CI/CD overview

`.github/workflows/`:

- **ci.yml** — on push/PR to `main`: `pnpm install --frozen-lockfile` → `db:generate` → lint, typecheck, test; a full `pnpm build`; `docker compose config` validation for all three compose files; `nginx -t` for the plain and rendered-TLS configs; and a build-only container image matrix (api/web/worker) with GHA layer caching.
- **docker.yml** — on push to `main`, on `v*.*.*` tags and manually: builds and pushes `ryuksaidso-api|web|worker` images to Docker Hub with `sha-<full>`, branch, semver (`v1.2.3` → `1.2.3`, `1.2`) and `latest` tags. Uses secrets `DOCKERHUB_USERNAME` and `DOCKERHUB_TOKEN`; the web image build reads the optional repo variable `NEXT_PUBLIC_API_URL`. Without those secrets it still builds every image and only skips the login/push.
- **deploy.yml** — triggered after a successful Docker push to `main` (or manually with an explicit tag): syncs `docker-compose.prod.yml`, `docker-compose.tls.yml` and `infra/` over SSH to the instance, pulls the new images, restarts the stack, health-gates on `/healthz` (nginx) and `/health` (API) for up to 3 minutes, records `.last-good-tag` on success and rolls back to the previous tag on failure. It keeps an active TLS overlay applied and gates over HTTPS when one is detected. Uses secrets `EC2_HOST`, `EC2_USER`, `EC2_PORT`, `EC2_SSH_KEY`; with no `EC2_HOST` it logs a skip notice and succeeds.

## Production deployment overview

Production runs from `/opt/ryuksaidso` on the instance with `docker-compose.prod.yml` (+ `docker-compose.tls.yml` for HTTPS):

- **nginx** reverse proxy / load balancer on 80/443, round-robining across `API_REPLICAS` API containers, rate-limiting `/api/auth`, restricting `/metrics` to private ranges and serving `/healthz`.
- **api** replicas behind nginx, **worker** replicas on the BullMQ queue, **web** (Next.js standalone), **migrate** one-shot job that runs `prisma migrate deploy` before API start, **postgres** (pgvector/pg16, named volume), **redis** (AOF persistence), **llm-proxy** forwarding provider ports to the host.
- Optional `--profile observability` adds Prometheus, Grafana, Loki and Promtail.
- TLS: certbot obtains/renews certificates through the ACME webroot, nginx redirects HTTP→HTTPS and terminates TLS from the rendered `tls.conf.template`.

Full step-by-step EC2 runbook — instance/security group setup, Docker install, `.env.production` generation, GitHub secrets, first deploy, automatic deploys, certbot, scaling, logs/metrics, backups, rollback and troubleshooting — is in **[docs/PRODUCTION-SETUP.md](docs/PRODUCTION-SETUP.md)**.

## Documentation

| Document | Contents |
|---|---|
| [API.md](API.md) | Complete endpoint reference: methods, paths, auth/CSRF rules, bodies, responses, error codes |
| [ARCHITECTURE.md](ARCHITECTURE.md) | Product boundary, runtime pipeline, real production topology, security and reliability model |
| [CONTRIBUTING.md](CONTRIBUTING.md) | Development principles, commands, PR expectations, no-comments convention |
| [QUICK_START.md](QUICK_START.md) | Condensed getting-started guide |
| [DETAILRYUKSAIDSO.md](DETAILRYUKSAIDSO.md) | Long-form project document (data model, tools, ops, configuration reference) |
| [docs/PRODUCTION-SETUP.md](docs/PRODUCTION-SETUP.md) | AWS EC2 production runbook |
| [docs/FEATURES.md](docs/FEATURES.md) | Feature map |
| [docs/RBAC.md](docs/RBAC.md) | Workspace + system RBAC reference, frontend helpers |
| [docs/DEMO.md](docs/DEMO.md) | 5-minute demo script |
| [docs/PROJECT_PITCH.md](docs/PROJECT_PITCH.md) | Portfolio / interview pitch |

In-app: **https://ryuksaidso.faizcasm.me/docs** (interactive documentation) and **https://ryuksaidso.faizcasm.me/architecture** (3D topology view). Locally: `http://localhost:3000/docs` and `http://localhost:3000/architecture`.

## First serious workflow

1. Create a workspace.
2. Open **Run Lab** and run the default Resolution Agent with a real operational prompt.
3. Open **Traces** and inspect the persisted planner, tool and synthesizer steps.
4. Add a knowledge document and rerun the same question to observe retrieval evidence.
5. In **Policies**, require approval for `ticket:write`.
6. Run a prompt that causes a write-capable tool request. The execution pauses in **Approvals**.
7. Approve it. RYUKSAIDSO creates a continuation run rather than silently mutating the original history.
8. Build a regression dataset in **Evaluations** and persist the result before promoting a release.

## Product thesis

RYUKSAIDSO is deliberately positioned around **agent reliability** rather than a vertical support use case. That makes the repository useful as a portfolio system for backend engineering, distributed jobs, Postgres modeling, observability, authentication, policy enforcement, and GenAI systems engineering.

For an actual public deployment beyond this repo's controls: managed PostgreSQL and Redis, a secret manager, backups, object storage for large source material, centralized alerting and provider-level quotas remain your responsibility.
