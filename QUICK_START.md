# Ryuksaidso — Quick Start

A condensed getting-started guide. For the full picture use [README.md](README.md); for production use [docs/PRODUCTION-SETUP.md](docs/PRODUCTION-SETUP.md).

## Prerequisites

- Node.js 22 + `pnpm` 10.15 (`corepack enable`)
- Docker with the compose plugin
- Optional, for the default local model runtime: [Ollama](https://ollama.com)

## 1. Configure the environment

```bash
cp .env.example .env

openssl rand -base64 48   # -> JWT_SECRET
openssl rand -hex 32      # -> POSTGRES_PASSWORD (alphanumeric so it fits DATABASE_URL)
openssl rand -base64 24   # -> GRAFANA_ADMIN_PASSWORD
```

Edit `.env` and set those three values. Everything else has working local defaults.

## 2. Start the stack

**Option A — everything in Docker (recommended first run):**

```bash
ollama serve                                  # optional, separate terminal
ollama pull qwen2.5-coder:3b-instruct-q4_K_M  # optional
docker compose up --build
```

**Option B — apps on the host, data in Docker:**

```bash
docker compose up -d postgres redis
pnpm install
pnpm db:generate && pnpm db:migrate
pnpm dev
```

## 3. Open the control plane

Production runs at **https://ryuksaidso.faizcasm.me** — you can try it without installing anything:

| Service | URL |
|---|---|
| **Live control plane** | https://ryuksaidso.faizcasm.me |
| **Live API base** | https://ryuksaidso.faizcasm.me/api |
| Control plane (local) | http://localhost:3000 |
| API (base for all client calls) | http://localhost:4001/api |
| API liveness / readiness / metrics | http://localhost:4001/health · /ready · /metrics |
| Postgres | localhost:5433 |
| Redis | localhost:6379 |
| Prometheus | http://localhost:9090 |
| Grafana | http://localhost:3001 |
| Loki | http://localhost:3100 |

Create a workspace at http://localhost:3000 (the first account becomes OWNER of a new organization with a default project, four agents and three policies provisioned).

## 4. Run the first workflow

1. **Run Lab** → run the default Resolution Agent with a real operational prompt.
2. **Traces** → inspect the persisted planner, tool and synthesizer steps (run ID, agent version, environment, latency, token usage, terminal status).
3. **Knowledge** → add a document, rerun the same question, and see retrieval evidence appear in the trace.
4. **Policies** → keep `ticket:write` approval-required; ask for a ticket write and watch the run park in `WAITING_APPROVAL` under **Approvals**.
5. Approve it → a continuation run (`trigger=approval-resume`) is queued; the original history is untouched.
6. **Evaluations** → persist a regression dataset result; it shows up as the dashboard ship signal.
7. **Developer** → create an API key (`rsk_...`, shown once) and queue a run from CI with `POST /api/control/runs` (see [API.md](API.md)).

## 5. Know the quality commands

```bash
pnpm lint        # ESLint flat config
pnpm typecheck   # tsc --noEmit, all workspaces
pnpm test        # vitest — 411 tests (apps/api/src/__tests__)
pnpm build       # prisma + tsc + next build
```

All four run in CI on every push/PR to `main`. Project convention: **no comments in source files** — see [CONTRIBUTING.md](CONTRIBUTING.md).

## 6. Documentation map

- [README.md](README.md) — product, layout, stack, env vars, CI/CD, deployment overview
- [API.md](API.md) — complete endpoint reference (auth, CSRF, bodies, errors)
- [ARCHITECTURE.md](ARCHITECTURE.md) — runtime pipeline and production topology
- [docs/PRODUCTION-SETUP.md](docs/PRODUCTION-SETUP.md) — AWS EC2 runbook
- [docs/FEATURES.md](docs/FEATURES.md) · [docs/DEMO.md](docs/DEMO.md) · [docs/PROJECT_PITCH.md](docs/PROJECT_PITCH.md)
- [DETAILRYUKSAIDSO.md](DETAILRYUKSAIDSO.md) — long-form project document
- In-app: https://ryuksaidso.faizcasm.me/docs and https://ryuksaidso.faizcasm.me/architecture (locally: http://localhost:3000/docs and http://localhost:3000/architecture)

## Troubleshooting quick hits

- `/ready` returns 503 → no LLM provider reachable; start Ollama or set `OMNIROUTE_*`, then check `curl http://localhost:4001/ready`.
- Port already in use → `docker compose ps` and stop the conflicting service (3000/4001/5433/6379).
- Reset local data → `docker compose down -v` (destroys Postgres/Redis volumes), then `pnpm db:migrate` and start again.
- Migration issues → `pnpm db:generate && pnpm db:migrate`.

---

**Founder**: Faizan Hameed (aka Faizcasm) · https://faizcasm.me · RYUKSAIDSO v2.0.0 · Live: https://ryuksaidso.faizcasm.me
