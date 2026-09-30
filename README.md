# RYUKSAIDSO

**RYUKSAIDSO is an Agent Reliability & Control Plane for production AI systems.**

It is built for the engineering loop around agents, not another chat wrapper:

> **Design → Run → Trace → Gate → Evaluate → Retry → Ship**

The original support-workspace codebase has been reworked into a multi-tenant platform where teams can operate agents like software systems.

## What is implemented

- Multi-tenant organizations with OWNER / ADMIN / AGENT / VIEWER RBAC.
- HTTP-only access + rotating refresh sessions, CSRF protection, password recovery, and Google/GitHub OAuth.
- Workspace API keys using `Authorization: Bearer rsk_...` with hashed secrets.
- Projects that isolate agent ownership and execution history.
- Agent registry with enabled/disabled state and immutable version records.
- Async execution using Redis + BullMQ with retries and backoff.
- Durable agent runs with persisted planner/tool/synthesizer trace steps.
- Tool gateway with tenant-scoped retrieval and policy-gated write tools.
- Human approval queue for consequential actions, including continuation runs after approval.
- Run retry flow that creates a new persisted run instead of mutating history.
- Knowledge documents stored in PostgreSQL with organization-scoped full-text retrieval.
- Evaluation endpoint for persisted regression datasets and pass/fail scores.
- Prometheus metrics, Loki logs, health/readiness endpoints and Grafana provisioning.
- Responsive control-plane UI for dashboard, run lab, agent registry, projects, traces, evaluations, approvals, knowledge, policies and developer keys.

## Architecture

```text
                    ┌───────────────────────┐
                    │   Next.js Control UI   │
                    └───────────┬───────────┘
                                │ HTTP / cookies / API key
                    ┌───────────▼───────────┐
                    │     Express API       │
                    │ auth · RBAC · policy  │
                    └───────┬────────┬──────┘
                            │        │
                    ┌───────▼───┐  ┌─▼──────────────┐
                    │ PostgreSQL │  │ Redis / BullMQ │
                    │ source of  │  │ async execution│
                    │ truth      │  └──────┬─────────┘
                    └────────────┘         │
                                      ┌────▼────────────┐
                                      │ Agent Worker    │
                                      │ planner → tools │
                                      │ → synthesizer   │
                                      └────┬────────────┘
                                           │
                                      OpenAI-compatible
                                      LLM / Ollama
```

## Local setup

```bash
cp .env.example .env
```

Set a real `POSTGRES_PASSWORD`, `JWT_SECRET` and `GRAFANA_ADMIN_PASSWORD`.

For the default local model runtime:

```bash
ollama serve
ollama pull qwen2.5-coder:3b-instruct-q4_K_M
```

Then start the stack:

```bash
docker compose up --build
```

Open `http://localhost:3000` and create a workspace.

## Useful services

| Service | URL |
|---|---|
| Control plane | http://localhost:3000 |
| API | http://localhost:4001 |
| OmniRoute gateway (when `omniroute serve` is running) | http://localhost:20128 |
| Prometheus | http://localhost:9090 |
| Grafana | http://localhost:3001 |
| Loki | http://localhost:3100 |

## First serious workflow

1. Create a workspace.
2. Open **Run Lab** and run the default Resolution Agent with a real operational prompt.
3. Open **Traces** and inspect the persisted planner, tool and synthesizer steps.
4. Add a knowledge document and rerun the same question to observe retrieval evidence.
5. In **Policies**, require approval for `ticket:write`.
6. Run a prompt that causes a write-capable tool request. The execution pauses in **Approvals**.
7. Approve it. RYUKSAIDSO creates a continuation run rather than silently mutating the original history.
8. Build a regression dataset in **Evaluations** and persist the result before promoting a release.

## LLM compatibility

RYUKSAIDSO uses an OpenAI-compatible `/chat/completions` interface. You can route runs through local Ollama or an OmniRoute gateway and switch the workspace default from **Settings → Model provider**:

```text
OMNIROUTE_URL=http://localhost:20128/v1
OMNIROUTE_API=<your Omniroute API key>
OMNIROUTE_MODEL=auto/smart            # must be an id from GET /v1/models

OLLAMA_URL=http://localhost:11434/v1
OLLAMA_API=ollama
OLLAMA_MODEL=qwen2.5-coder:3b-instruct-q4_K_M
```

Inside Docker Compose the containers use `OLLAMA_URL_DOCKER` /
`OMNIROUTE_URL_DOCKER` instead: the host loopback is unreachable from a
container, so the bundled `llm-proxy` service forwards `:11435 → 127.0.0.1:11434`
and `:20129 → 127.0.0.1:20128`. See `docs/PRODUCTION-SETUP.md`.

Each run records the selected provider so traces remain reproducible even if the workspace default changes later.

No fake fallback answers are returned when the model is unavailable. Runs fail and remain visible as failed operational records.

## Account, OAuth and administration

- Users can update profile details, theme, timezone, job title, bio and avatar URL from **Settings**.
- Password recovery is rate-limited, single-use and expires after 30 minutes. Configure SMTP variables in `.env` for real email delivery.
- Google and GitHub OAuth are supported when their client credentials and callback URLs are configured.
- OWNER and ADMIN members get an **Admin** surface with run volume charts, reliability mix, token usage, active agents, member management, recent executions and audit history.

For local OAuth clients, use these callback URLs:

```text
Google: http://localhost:4001/api/auth/oauth/google/callback
GitHub: http://localhost:4001/api/auth/oauth/github/callback
```

## Production hardening still expected outside the repo

For an actual public deployment, use managed PostgreSQL and Redis, TLS, a secret manager, backups, object storage for large source material, centralized alerting, and provider-level quotas. The repository provides the application controls, not your cloud provider's willingness to save you from yourself.

## Product thesis

RYUKSAIDSO is deliberately positioned around **agent reliability** rather than a vertical support use case. That makes the repository useful as a portfolio system for backend engineering, distributed jobs, Postgres modeling, observability, authentication, policy enforcement, and GenAI systems engineering.
