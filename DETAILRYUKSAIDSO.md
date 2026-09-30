# DETAIL RYUKSAIDSO — The Complete Project Document

> **Everything about RYUKSAIDSO: what it is, what it does, how it works, why it helps, and every technical detail.**
>
> Version **2.0.0** · Monorepo · TypeScript-first · Last updated: September 2026

---

## Table of contents

1. [What is RYUKSAIDSO?](#1-what-is-ryuksaidso)
2. [What does it do?](#2-what-does-it-do)
3. [Why is it helpful?](#3-why-is-it-helpful)
4. [The engineering loop](#4-the-engineering-loop)
5. [Product surfaces (the UI)](#5-product-surfaces-the-ui)
6. [Architecture](#6-architecture)
7. [Tech stack](#7-tech-stack)
8. [Repository structure](#8-repository-structure)
9. [Data model (database)](#9-data-model-database)
10. [The API](#10-the-api)
11. [Agent runtime pipeline](#11-agent-runtime-pipeline)
12. [Tool gateway and the 13 built-in tools](#12-tool-gateway-and-the-13-built-in-tools)
13. [Model routing (LLM providers)](#13-model-routing-llm-providers)
14. [Async execution & reliability](#14-async-execution--reliability)
15. [Security model](#15-security-model)
16. [Observability](#16-observability)
17. [Admin portal & analytics](#17-admin-portal--analytics)
18. [UX, theming and design system](#18-ux-theming-and-design-system)
19. [Configuration reference (.env)](#19-configuration-reference-env)
20. [Running the project](#20-running-the-project)
21. [Testing & verification](#21-testing--verification)
22. [Current status & feature completeness](#22-current-status--feature-completeness)
23. [Known limitations & future hardening](#23-known-limitations--future-hardening)
24. [Documentation index](#24-documentation-index)

---

## 1. What is RYUKSAIDSO?

**RYUKSAIDSO is a multi-tenant Agent Reliability & Control Plane for production AI systems.**

In one sentence: *a platform that makes every AI-agent execution observable, policy-gated, retryable and evaluatable.*

Most AI demos stop at **prompt → answer** (a chat wrapper). RYUKSAIDSO is deliberately built for the **engineering loop around that answer** — the unglamorous, essential production surface:

> **Design → Run → Trace → Gate → Evaluate → Retry → Ship**

The codebase started life as a support workspace and was reworked into a multi-tenant platform where teams operate agents **like software systems**: versioned configuration, immutable history, permission scopes, human approval gates, regression evaluations, audit trails and operational dashboards.

### Core philosophy

- **The primary entity is an `AgentRun`, not a chat message.** A run is a durable, auditable operational record.
- **Agents are untrusted decision-makers.** A language model is never allowed to mutate application state directly — every side effect flows through a server-side tool gateway with scopes, policies and (when required) human approval.
- **History is immutable.** Retries and approvals create *new* records instead of overwriting evidence.
- **No fake answers.** If the model is unavailable, the run fails and stays visible as a failed operational record — the system never silently invents a fallback answer.
- **Operational realism over demo polish**: health vs. readiness, hashed secrets, rate limits, request IDs, metrics without unbounded labels.

---

## 2. What does it do?

### 2.1 The short list

| Capability | What happens |
|---|---|
| **Design agents** | Create agents in Projects with instructions, an optional **custom system prompt**, a tool allowlist and a knowledge scope; publish **immutable versions** |
| **Run them asynchronously** | `POST /control/runs` enqueues work in **Redis + BullMQ**; a worker executes with retries and backoff |
| **Trace every execution** | Planner, tool-gateway and synthesizer **steps are persisted** with inputs, outputs, latency and token usage |
| **Gate side effects** | Policies + tool scopes can require **human approval** before any write; the run parks in `WAITING_APPROVAL` |
| **Continue after approval** | Approving creates a **continuation run** with the approved scope recorded — the original history is never rewritten |
| **Retry safely** | Retry creates a **new run record** so historical evidence is preserved |
| **Evaluate regressions** | Persisted evaluation datasets with per-case results and pass/fail scores, answered **OmniRoute-first with Ollama fallback** |
| **Serve knowledge** | Documents in PostgreSQL with **organization-scoped full-text retrieval** (RAG) via `search_knowledge` |
| **Operate a support workflow** | Tickets with threaded agent replies, priority/status, approval-gated writes (retained as a first-class feature) |
| **Observe everything** | Prometheus metrics, Loki logs, Grafana dashboards, `/health`, `/ready`, `/metrics` |
| **Administer** | Admin portal with 14-day charts, system health probes, member/role management and an audit stream |

### 2.2 Concrete workflows it supports

1. **Incident investigation agent** — a CI pipeline triggers a run with `environment: staging, trigger: ci`; the planner picks `search_knowledge` + `get_ticket`; the synthesizer answers with evidence; the trace proves where every fact came from.
2. **Support ticket automation** — a customer opens a ticket → `POST /tickets/:id/run` → the agent drafts a reply → the `ticket:write` tool is approval-gated → a human approves in the Approvals center → a continuation run posts the reply → the thread shows both messages.
3. **Release gating** — build a regression dataset in Evaluations, run it against a published agent version, and only promote when the persisted score passes.
4. **Machine-to-machine execution** — create an API key (`rsk_...`), call the REST API from another service with tenant-scoped bearer auth.
5. **Cost & reliability review** — the Admin portal shows token usage per day, provider split, failure rate, top tools by latency and live DB/Redis/LLM health.

---

## 3. Why is it helpful?

### For engineering teams running agents in production
- **Auditability**: every step, tool call, approval and token is persisted. When an agent does something surprising, you can answer *why* from the trace.
- **Safety**: models cannot bypass policy. Write-capable tools require human approval; policies are scoped (`ticket:write`, `knowledge:read`, …) and recorded in the audit log.
- **Reliability**: background jobs retry with exponential backoff; failed runs remain visible instead of disappearing; connection-level provider failures automatically fall back (OmniRoute → Ollama).
- **Change control**: agent configuration is versioned and published immutably, so a production run can always be tied to the exact configuration that produced it.
- **Regression protection**: evaluations persist scores over time — you find out *before* shipping that a prompt change broke intent handling.

### For the business
- **Visibility into cost**: token usage charts and per-run token records make LLM spend measurable.
- **Compliance posture**: hashed API keys/sessions, CSRF, rate limiting, revocation flows, audit trail — the controls reviewers ask about.
- **Vendor flexibility**: OpenAI-compatible routing means you can swap local Ollama for an OmniRoute gateway (or change models) per workspace **without code changes**, and each run records which provider actually answered.

### For developers / as a portfolio system
It demonstrates a wide, genuinely hard backend surface end-to-end:

- distributed job processing (BullMQ), Postgres data modeling (23 models), multi-tenant RBAC, session/OAuth security, policy enforcement, LLM provider resilience, observability, and a full React control plane.

### For the AI-engineering discipline
It encodes the thesis that **an agent is a system, not a prompt**: untrusted planner → deterministic gateway → evidence-backed synthesis, with humans in the loop exactly where consequences are irreversible.

---

## 4. The engineering loop

```text
        ┌──────────────────────────────────────────────────────────┐
        │                    DESIGN                                │
        │  Agents · versions · system prompt · tool allowlist      │
        └──────────────────────────┬───────────────────────────────┘
                                   ▼
        ┌──────────────────────────────────────────────────────────┐
        │                      RUN                                 │
        │  POST /control/runs → BullMQ → worker (concurrency 4)    │
        └──────────────────────────┬───────────────────────────────┘
                                   ▼
        ┌──────────────────────────────────────────────────────────┐
        │                     TRACE                                │
        │  Planner → tool gateway → synthesizer steps persisted    │
        └──────────────────────────┬───────────────────────────────┘
                                   ▼
        ┌──────────────────────────────────────────────────────────┐
        │                      GATE                                │
        │  Policies · scopes · WAITING_APPROVAL → human decision   │
        └──────────────────────────┬───────────────────────────────┘
                                   ▼
        ┌──────────────────────────────────────────────────────────┐
        │                   EVALUATE                               │
        │  Regression datasets → per-case results → score          │
        └──────────────────────────┬───────────────────────────────┘
                                   ▼
        ┌──────────────────────────────────────────────────────────┐
        │        RETRY (new run)  →  SHIP (published version)      │
        └──────────────────────────────────────────────────────────┘
```

---

## 5. Product surfaces (the UI)

The control plane is a single responsive app (`apps/web`) with **14 main sections + a system Admin surface**:

| Tab | What it does |
|---|---|
| **Command Center** | Live operational overview: KPI cards, **24-hour throughput area chart**, status-mix bar, **provider-split donut**, **top agents leaderboard**, **awaiting-approval panel with inline Approve/Reject**, latest runs |
| **Run Lab** | Launch a run against any agent with prompt/environment/trigger; live wait states (`QUEUED → RUNNING → WAITING_APPROVAL → COMPLETED/FAILED`) |
| **Agents** | Agent registry: create/edit with instructions, **custom system prompt**, **category-grouped tool picker** (13 tools with approval markers), knowledge scope, enable/disable, version publishing, "custom prompt" badge |
| **Projects** | Isolate agent ownership and execution history per project |
| **Tickets** | Support workflow: create/inspect tickets, run the agent on them, **conversation thread** (human + assistant messages), approval-gated replies |
| **Traces** | Trace explorer: list runs, inspect ordered planner/tool/synthesizer steps with JSON payloads, latency, tokens, errors; retry action |
| **Evaluations** | Persisted regression datasets: create a run over cases, per-case pass/fail, score history |
| **Approvals** | Human decision queue for gated actions: approve (→ continuation run) or reject (→ terminal failure) |
| **Knowledge Base** | Upload documents (org-scoped, per-agent scoping), full-text retrieval evidence |
| **Policies** | Rules mapped to tool scopes with severity (`low/medium/high/critical`) and on/off toggles |
| **Developer** | Workspace API keys (`Authorization: Bearer rsk_...`), create/revoke, secret reveal once |
| **Docs** | In-app documentation: tool gateway & MCP, tool table (all 13 with scopes), auth API, LangChain/LangGraph/MCP explainers |
| **Architecture** | Visualized architecture of the running system |
| **Settings** | Profile (name/title/bio/avatar/timezone), password change, **email verification**, sessions & revoke-all, workspace switch, invitations, **LLM provider routing**, **theme (system/light/dark)** |
| **Admin** *(system admins only)* | 14-day analytics: metric cards (incl. failure rate), token-usage chart, provider split, member growth, top tools with avg latency, **live system health (PostgreSQL/Redis/LLM probes)**, run volume, reliability donut, member management, audit stream |

Global UX elements: sticky topbar with **theme toggle** and a **Refresh button that re-syncs everything (including admin data)**, auto-dismissing modern **toast notifications** (6 s, hover-to-pause, error/success variants), mobile-responsive sidebar.

---

## 6. Architecture

### 6.1 High-level diagram

```text
                    ┌────────────────────────────┐
                    │   Next.js 15 Control UI    │  :3000
                    │  (presentation only)       │
                    └─────────────┬──────────────┘
                                  │ HTTP · cookies (access/refresh) · API keys
                    ┌─────────────▼──────────────┐
                    │      Express 5 API         │  :4001
                    │ auth · RBAC · CSRF · rate  │
                    │ limits · policy records ·  │
                    │ validation (zod) · dispatch│
                    └───┬───────────────┬────────┘
                        │               │
            ┌───────────▼─────┐   ┌─────▼───────────────────┐
            │   PostgreSQL 16 │   │  Redis 7 + BullMQ       │
            │  (pgvector img) │   │  queue 'agent-runs'     │
            │  source of truth│   │  retries · backoff      │
            └─────────────────┘   └─────┬───────────────────┘
                                        │ job: agent-execution
                                  ┌─────▼───────────────────┐
                                  │   Agent Worker          │
                                  │   planner → tool gateway│
                                  │   → synthesizer         │
                                  │   (agent-runtime +      │
                                  │    agent-tools)         │
                                  └─────┬───────────────────┘
                                        │ OpenAI-compatible /chat/completions
                          ┌─────────────▼──────────────┐
                          │ OmniRoute gateway (first)  │ :20128
                          │ Ollama local (fallback)    │ :11434
                          │  ↳ llm-proxy bridges       │
                          │    docker → host loopback  │
                          └────────────────────────────┘

        Observability sidecar: Prometheus :9090 · Loki :3100 · Grafana :3001 · Promtail
```

### 6.2 Service boundaries (Docker Compose — 11 services)

| Service | Image / build | Role |
|---|---|---|
| `postgres` | `pgvector/pgvector:pg16` | Source of truth; full-text retrieval; port 5433→5432 |
| `redis` | `redis:7-alpine` | Queue transport, coordination; append-only persistence |
| `migrate` | `apps/api/Dockerfile` | One-shot `prisma migrate deploy` with wait-retry; `api`/`worker` depend on it |
| `api` | `apps/api/Dockerfile` | HTTP boundary, health-checked (`/health`), port 4001 |
| `worker` | `apps/worker/Dockerfile` | BullMQ consumer, `WORKER_CONCURRENCY=4`, plain `node:22-alpine` (no browser bloat) |
| `web` | `apps/web/Dockerfile` | Next.js production server, port 3000, waits for healthy API |
| `llm-proxy` | `node:22-alpine` | Tiny TCP bridge (`infra/llm-proxy.js`) so containers can reach LLM gateways bound to host loopback (`11435→11434`, `20129→20128`) |
| `prometheus` | `prom/prometheus:v3.5.0` | Scrapes API metrics |
| `loki` | `grafana/loki:3.5.5` | Log aggregation |
| `promtail` | `grafana/promtail:3.5.5` | Ships Docker container logs → Loki |
| `grafana` | `grafana/grafana:12.1.1` | Provisioned dashboards, port 3001 |

### 6.3 Design decisions worth knowing

- **Web never talks to the database.** It is presentation + React Query state; all persistence goes through the API.
- **The worker, not the API, executes tools.** Long-running LLM/tool work happens off the request path.
- **Shared packages prevent drift.** `@ryuksaidso/agent-tools` is imported by *both* the API (to serve `/tools` metadata) and the worker (to execute), so the picker and the executor can never disagree.
- **Container-to-host networking is explicit.** Ollama binds `127.0.0.1` on the host, which containers can't reach; `llm-proxy` with `network_mode: host` bridges the docker bridge (`172.17.0.1`) to host loopback.
- **Health vs. readiness are separate endpoints** so orchestrators can distinguish "process alive" from "dependencies usable".

---

## 7. Tech stack

### Languages & tooling
| Layer | Choice | Version |
|---|---|---|
| Language | TypeScript everywhere | 5.9.2 |
| Runtime | Node.js | 22 (alpine images) |
| Package manager | pnpm workspaces | 10.15.0 |
| Repo layout | monorepo: `apps/*` + `packages/*` | — |

### Frontend (`apps/web`)
| Piece | Choice | Version |
|---|---|---|
| Framework | Next.js (App Router) | 15.5.2 |
| UI library | React | 19.1.1 |
| Server state | TanStack React Query | 5.90.5 |
| Styling | Tailwind CSS | 4.1.13 |
| Icons | lucide-react | 0.468.0 |
| Charts | Hand-rolled SVG/`conic-gradient` primitives (`AreaChart`, `SegmentedDonut`, `Donut`, bar/spark components) — no chart library |
| Main UI file | `components/AppShell.tsx` (~4,900 lines) + `globals.css` (dense, ~230 rule-blocks incl. full light-theme override) |

### Backend (`apps/api`)
| Piece | Choice | Version |
|---|---|---|
| HTTP framework | Express | 5.1.0 |
| ORM | Prisma | 6.19.0 |
| Validation | zod | 4.1.5 |
| Queue | BullMQ + ioredis | 5.56.2 / 5.7.0 |
| Auth primitives | jsonwebtoken, bcryptjs | 9.0.2 / 3.0.2 |
| Hardening | helmet, cors, compression, express-rate-limit | 8.1.0 / 2.8.5 / 1.8.1 / 8.2.1 |
| Logging/metrics | winston + morgan, prom-client | 3.17.0 / 1.10.1 / 15.1.3 |
| Email | nodemailer | 7.0.6 |

### Worker & packages
| Package | Contents |
|---|---|
| `apps/worker` | BullMQ consumer (`agent-runs`), pino logging, provider retry wrapper |
| `packages/agent-runtime` | `executeAgentRun()` — planner → tool gateway → synthesizer orchestration + step persistence |
| `packages/agent-tools` | Tool registry: `calc.ts`, `data.ts` (offline/data tools), `external.ts` (network tools), `mcp.ts`, `index.ts`, `types.ts`, `util.ts` (~1,100 lines) + `@modelcontextprotocol/sdk` |

### Data & infra
| Piece | Choice |
|---|---|
| Database | PostgreSQL 16 (pgvector image — vector-ready) |
| Cache/queue | Redis 7 (append-only) |
| LLM access | OpenAI-compatible `/chat/completions`: **OmniRoute** (gateway) and **Ollama** (local) |
| Default local model | `qwen2.5-coder:3b-instruct-q4_K_M` |
| Observability | Prometheus 3.5, Loki 3.5.5, Promtail, Grafana 12.1.1 |
| Tests | Vitest 3.2.4 + supertest (API), scripted browser E2E (Playwright used *as a test harness only*, never shipped in product images) |
| CI | GitHub Actions (`.github/`) |

---

## 8. Repository structure

```text
ryuksaidsoproductionready/
├── apps/
│   ├── api/                  # Express 5 HTTP boundary (30 TS files, ~4,100 lines)
│   │   ├── src/
│   │   │   ├── server.ts
│   │   │   ├── routes/       # auth, account, admin, app, approvals, control, docs, evaluations
│   │   │   ├── middleware/   # requestId, csrf, auth, tenant checks, rate limit
│   │   │   ├── services/     # email, llm (providers+fallback), queue, tools
│   │   │   ├── agents/       # runtime.ts, evaluate.ts
│   │   │   ├── lib/          # auth, config, db, logger, metrics, redis
│   │   │   └── __tests__/    # 5 vitest suites (29 tests)
│   │   └── prisma/           # schema.prisma (423 lines) + 8 migrations
│   ├── web/                  # Next.js 15 control plane
│   │   └── src/
│   │       ├── app/          # routes: /, /auth, /dashboard, /docs, /architecture,
│   │       │                 #         /playground, /invite, /reset-password, /verify-email
│   │       └── components/   # AppShell.tsx (all views), AdminGuard.tsx
│   └── worker/               # BullMQ consumer (index.ts, ~220 lines)
├── packages/
│   ├── agent-runtime/        # executeAgentRun pipeline (index.ts, ~12.7 KB)
│   └── agent-tools/          # 13 built-in tools + MCP bridge (~1,115 lines)
├── infra/                    # prometheus.yml, loki/, promtail/, grafana/provisioning/, llm-proxy.js
├── docs/                     # FEATURES.md, PROJECT_PITCH.md, PRODUCTION-SETUP.md, DEMO.md
├── docker-compose.yml        # 11 services
├── .env.example              # full configuration template
├── README.md · ARCHITECTURE.md · API.md · QUICK_START.md
├── ALL_BUGS_FIXED.md         # full fix history across batches
└── (many historical docs: FIXES, RBAC, PRODUCTION_*, COMPREHENSIVE_FIXES…)
```

**Scale**: ~20,300 lines of TS/TSX across apps + packages (excluding build output).

---

## 9. Data model (database)

**23 models + 8 enums** in `apps/api/prisma/schema.prisma`.

### Identity & tenancy
| Model | Purpose |
|---|---|
| `Organization` | Tenant/workspace (owner, slug, settings) |
| `User` | Global identity; `userRole: USER \| ADMIN` = **system RBAC** for the Admin surface |
| `Membership` | User↔Org with workspace `Role`: **OWNER / ADMIN / AGENT / VIEWER** |
| `OAuthAccount` | Linked Google/GitHub identities |
| `Session` | Rotating refresh sessions (hashed), revocation |
| `WorkspaceInvitation` | Invite by email with role |
| `EmailVerificationToken`, `PasswordResetToken` | Single-use, expiring, hashed tokens |
| `ApiKey` | `rsk_...` workspace keys, hashed secrets |

### Agent platform
| Model | Purpose |
|---|---|
| `Project` | Ownership boundary, status |
| `Agent` | Instructions, `systemPrompt` (nullable), enabled flag, tool allowlist, knowledge scope |
| `AgentVersion` | Immutable config snapshot (config JSON includes systemPrompt), publishable |
| `AgentRun` | The central record: status, trigger, environment, provider, input, output, latency, tokens, timestamps |
| `AgentStep` | Ordered trace steps: `Planner` / tool executions / `Synthesizer` with action, status, input/output, durationMs |
| `Approval` | Gate records: action/scope, status PENDING→APPROVED/REJECTED, decidedBy/at |
| `Policy` | Scope rules with severity + enabled toggle |

### Work & knowledge
| Model | Purpose |
|---|---|
| `Ticket`, `Message` | Support workflow + conversation thread (requester, priority, status; roles) |
| `Document`, `DocumentChunk` | Knowledge base with agent scoping + full-text retrieval |
| `Memory` | `MemoryKind`-typed memory entries |
| `Evaluation` | Persisted datasets, per-case results, score, provider used |
| `AuditLog` | Security/audit stream (actor, action, target, request id) |

### Key enums
`Role` (OWNER/ADMIN/AGENT/VIEWER) · `UserRole` (USER/ADMIN) · `TicketStatus` · `Priority` · `RunStatus` (QUEUED/RUNNING/WAITING_APPROVAL/COMPLETED/FAILED) · `MemoryKind` · `LLMProvider` (OMNIROUTE/OLLAMA) · `ProjectStatus`

### Migrations
8 migrations including `workspace_security`, `document_agent_scope`, `agent_system_prompt`, `set_ollama_model_default`, `add_user_role` — applied automatically by the `migrate` service on `docker compose up`.

---

## 10. The API

**Base URL:** `http://localhost:4001/api` — **72 endpoints** across 8 routers.

### Auth modes
1. **Browser sessions** — HTTP-only cookies: short-lived access token + rotating refresh token (both hashed at rest), `x-csrf-token` required for mutations.
2. **Machine clients** — `Authorization: Bearer rsk_<key>` (workspace API key, hashed secret).
Every protected route is **tenant-scoped from the authenticated organization**.

### Endpoint map

| Router | Count | Highlights |
|---|---|---|
| `/auth` | 10 | `register`, `login`, `refresh`, `logout`, `forgot-password`, `reset-password`, `verify-email`, `oauth/:provider(+callback)`, `providers` |
| `/account` | 25 | profile (+verify-email, password), LLM providers/settings, organization, members & role changes, workspace switch, invitations, sessions & revoke-all, API keys, audit, security |
| `/control` | 6 | `dashboard` (24 h metrics), `projects` CRUD, `agents` CRUD, `runs` create/list |
| `/app` | 10 | `me`, tickets CRUD + `tickets/:id/run`, runs, documents, agents, **`tools` (the 13-tool registry)** |
| `/approvals` | 2 | list, `:id/decision` (approve → continuation run) |
| `/evaluations` | 2 | list, create (runs dataset, records provider + per-case results) |
| `/admin` | 8 | system users, role grant, `me/role`, **`overview` (analytics payload)**, runs, audit, member role/revoke |
| `/docs` | 9 | in-app docs, architecture (+`/visualize`), agents/langchain/langgraph/mcp explainers, auth API |

**Runtime endpoints:** `GET /health` (liveness) · `GET /ready` (dependency readiness) · `GET /metrics` (Prometheus)

### The Admin overview payload (`GET /admin/overview`)
Fresh data every call (`Cache-Control: no-store`, `Pragma: no-cache`), 14-day window:
`metrics` (members, projects, agents, runs, tokens, avg latency, failure rate, pending approvals, sessions, API keys, tickets, verified members) · `series` (daily runs/tokens) · `providerSplit` · `statusSplit` · `registrations` (daily signups + pre-window baseline) · `topTools` (AgentStep aggregation with avg duration) · `health` (time-boxed PostgreSQL `SELECT 1`, Redis `ping`, LLM `/models` probes with latency) · `generatedAt`.

---

## 11. Agent runtime pipeline

Execution lives in `packages/agent-runtime` → `executeAgentRun(deps, runId, user, emit)`:

```text
Prompt (+ agent instructions / custom system prompt as persona)
   │
   ▼
┌─────────────┐  LLM returns strict JSON:
│   PLANNER   │  { goal, risk: low|medium|high|critical,
│             │    toolCalls: [ {tool, reason, input} ] (max 6),
└──────┬──────┘    answerStrategy }
       │            Tools are chosen ONLY from the supplied catalog;
       ▼            never invented.
┌──────────────────────────────┐
│       TOOL GATEWAY           │  for each requested call:
│  1. validate input (schema)  │  ← bad calls never reach the handler
│  2. authorize scope + tenant │  ← knowledge:read, ticket:write, …
│  3. policy check             │  ← matching policy / requiresApproval?
│       ├─ read  → execute     │
│       └─ write → Approval record → run status WAITING_APPROVAL
│                              │            │
│  4. execute handler (ctx:    │     human decision
│     org, runId, user)        │       ├─ approve → CONTINUATION RUN
│  5. append AgentStep         │       └─ reject  → terminal FAILED
└──────┬───────────────────────┘
       │ (ticket runs also draft the reply text here, so a ticket
       │  always gets a coherent response even if synthesis is skipped)
       ▼
┌──────────────┐  LLM synthesizes an evidence-backed answer from
│ SYNTHESIZER  │  { prompt, planner, toolResults } with confidence
└──────┬───────┘  (risk low → high confidence, else "review")
       ▼
COMPLETED run + persisted output { answer, confidence, plan, toolResults }
```

Key properties:

- **Steps are persisted as they happen** (`AgentStep` rows: Planner, each tool execution, Synthesizer) — the Trace explorer reads exactly this.
- **Emit hook** streams runtime events for live UI updates.
- **Persona precedence**: custom `Agent.systemPrompt` (if set) overrides `instructions` in every stage — planner, ticket-reply draft and synthesizer.
- **Soft tool failures**: external tools return `{ error }` payloads instead of throwing, so the synthesizer can explain the outage and the run still completes.
- **Ticket guidance**: the planner is told never to call `get_ticket`/`add_ticket_message` unless a `ticketId` is present.

---

## 12. Tool gateway and the 13 built-in tools

One shared registry (`packages/agent-tools`) — **the API serves metadata, the worker executes, so the two never drift.**

| # | Tool | Category | Scope | Approval | Source / notes |
|---|---|---|---|---|---|
| 1 | `search_knowledge` | Knowledge | `knowledge:read` | Never | OR-ed conversational full-text retrieval, per-agent document scoping |
| 2 | `get_ticket` | Tickets | `ticket:read` | Never | Tenant-scoped |
| 3 | `add_ticket_message` | Tickets | `ticket:write` | **Always** | Side effect → approval-gated |
| 4 | `current_time` | Utilities | `time:read` | Never | IANA timezones |
| 5 | `calculator` | Utilities | `calculator:use` | Never | Hand-rolled parser — **no `eval`**; powers, functions, constants |
| 6 | `current_weather` | Utilities | `weather:read` | Never | Open-Meteo primary → **Nominatim geocode + met.no forecast fallbacks**; 15 s budget |
| 7 | `unit_convert` | Utilities | `unit:use` | Never | Offline: temperature/length/mass/data/volume/speed/time; word aliases; rejects cross-family |
| 8 | `text_tools` | Utilities | `text:use` | Never | Offline: stats, base64 encode/decode (unicode-safe), slugify |
| 9 | `web_search` | Web | `web:read` | Never | DuckDuckGo → Wikipedia fallback |
| 10 | `github` | Web | `github:read` | Never | search_repos / get_repo / list_issues / search_issues; optional `GITHUB_TOKEN` |
| 11 | `currency_convert` | Web | `currency:read` | Never | ECB reference rates via Frankfurter (keyless) |
| 12 | `dictionary` | Web | `dictionary:read` | Never | Dictionary API → **Wiktionary REST fallback** |
| 13 | `news` | Web | `news:read` | Never | Hacker News front page/topic search via Algolia (keyless) |

**Categories for the grouped picker:** Knowledge · Tickets · Utilities · Web · Integrations.

### MCP (Model Context Protocol)
- Configure any MCP server via `MCP_SERVERS` (stdio command or HTTP URL).
- Tools appear as `mcp__<server>__<tool>` with input hints parsed from the MCP schema.
- **Write-like tool names require human approval**; a broken server degrades to "tools absent" instead of failing the product.

### Gateway guarantees
- Input validated against the tool schema before the handler runs.
- Scope + membership authorization on every call; policy records checked before side effects.
- Tool errors return `{error}` payloads — **a tool failure never fails the whole run**.
- No `execute()` functions leak into `/tools` metadata (verified by E2E).
- Network policy: single-source tools get a **15 s budget** (slow networks stall ~10 s); tools with fast fallbacks use shorter budgets so failover engages quickly.

---

## 13. Model routing (LLM providers)

```text
                      getResilientProvider(order = [OMNIROUTE, OLLAMA])
                                     │
              ┌──────────────────────┴──────────────────────┐
              ▼                                             ▼
     OpenAICompatibleProvider                        OpenAICompatibleProvider
     OMNIROUTE (gateway)                            OLLAMA (local)
     · connection retry ×3 w/ backoff               · same retry behavior
              │ connection-level failure only              │
              └──────────────► automatic fallback ◄────────┘
                     HTTP errors surface (never silently re-run)
```

- **Workspace default** set in Settings → Model provider; **per-run override** possible; **model discovery** via `GET /v1/models`.
- Each run **records the provider that actually answered** → traces stay reproducible even after the default changes.
- Ticket runs and evaluations use the resilient **OmniRoute-first, Ollama-fallback** path (connection-level failures only; HTTP errors surface instead of silently re-running).
- **Docker bridging**: containers use `OLLAMA_URL_DOCKER`/`OMNIROUTE_URL_DOCKER` (`host.docker.internal:11435/20129`) via the `llm-proxy` sidecar.
- Config keys: `OMNIROUTE_URL/API/MODEL`, `OLLAMA_URL/API/MODEL` (+`*_DOCKER` variants).
- **No fabricated fallback answers**: when all providers fail, the run fails visibly.

---

## 14. Async execution & reliability

- **Queue**: BullMQ `agent-runs`, job `agent-execution`, payload `{ runId, organizationId, user }`.
- **Retries**: `attempts: 3`, exponential backoff starting at **1.5 s**; worker-level retry of the primary provider up to 3× on connection errors.
- **Concurrency**: `WORKER_CONCURRENCY` (default 4).
- **Durable lifecycle**: `QUEUED → RUNNING → (WAITING_APPROVAL) → COMPLETED | FAILED` — persisted at every transition.
- **Retry creates a new run** rather than mutating history (original evidence preserved).
- **Approval continuation**: approve → new run continues the work with scope recorded; reject → waiting run fails terminally.
- **Rate limiting**: API (`RATE_LIMIT_MAX/WINDOW_MS`, default 600/min) plus stricter credential endpoints (`credentialLimiter` on login/reset/verify) and worker rate limits (`WORKER_RATE_LIMIT_MAX/DURATION_MS`).
- **Failure honesty**: model outages and provider HTTP errors are recorded as failures, not hidden.

---

## 15. Security model

| Layer | Implementation |
|---|---|
| **Sessions** | HTTP-only cookies; short-lived access + **rotating refresh** tokens stored **hashed**; TTLs via `ACCESS_TOKEN_TTL`, `REFRESH_TOKEN_TTL_DAYS`, `SESSION_EXPIRES_DAYS` |
| **CSRF** | `x-csrf-token` required on browser mutations (`csrfProtection` middleware), SameSite configurable (`COOKIE_SAME_SITE`) |
| **Passwords** | bcryptjs; reset tokens **single-use + 30-minute expiry**, rate-limited; password change **revokes sessions** |
| **OAuth** | Google + GitHub with configured client IDs/secrets and callback URLs |
| **Workspace RBAC** | `Role`: OWNER / ADMIN / AGENT / VIEWER — gates administrative mutations (member management, policy edits, …) |
| **System RBAC** | `User.userRole` ADMIN (bootstrapped from `SYSTEM_ADMIN_EMAILS` at sign-in) gates the Admin surface |
| **Tenant isolation** | Every protected query scoped to the authenticated `organizationId` |
| **API keys** | `Authorization: Bearer rsk_...`, secret hashed, list/revoke UI, audit-logged |
| **Hardening middleware** | helmet, CORS allowlist (`CORS_ORIGIN`), compression, request IDs on every request, morgan + winston logging |
| **Side-effect control** | Tool scopes + `requiresApproval` + policies; decisions written to `Approval` and the audit trail |
| **Audit** | `AuditLog` stream surfaced in UI (account settings + Admin) |
| **Email flows** | Verification and recovery; SMTP configurable; dev mode prints the verification URL when delivery fails |

---

## 16. Observability

- **Metrics** — `prom-client` (v15): HTTP request duration histogram with **bounded labels** (no unbounded request labels), exposed at `GET /metrics`, scraped by Prometheus `:9090`.
- **Logs** — winston/morgan on the API, **pino** on worker/runtime, structured with request IDs; Promtail ships Docker container logs to **Loki `:3100`**.
- **Dashboards** — Grafana `:3001` provisioned from `infra/grafana/provisioning` with Prometheus + Loki datasources.
- **Endpoints** — `/health` (liveness) and `/ready` (DB/Redis dependency readiness) as separate concepts.
- **In-product health** — the Admin portal's System Health cards run **time-boxed probes** (PostgreSQL `SELECT 1`, Redis `ping`, LLM `GET /models`) so a dead dependency degrades one card instead of the whole dashboard.

---

## 17. Admin portal & analytics

Available only to **system admins** (`userRole=ADMIN`), separate from workspace ownership:

**Freshness**
- Topbar **Refresh** reloads core *and* admin data (previously it skipped admin data).
- Hero **Refresh** button with spinner + **"Updated Ns ago"** stamp.
- Responses sent with `Cache-Control: no-store`; the tab soft-polls every **45 s** while visible (skipped when the tab is hidden).

**Panels (14-day window)**
- **Metric cards**: members, projects, agents, runs, tokens, avg latency, **failure rate**, documents, pending approvals, active sessions, API keys, open tickets, verified members.
- **Token usage** — area chart with gradient fill, peak/total footnotes.
- **Provider split** — donut with center total + legend.
- **Member growth** — daily signups area chart (+ pre-window baseline).
- **Top tools** — rank bars with run count and **average latency**.
- **System health** — PostgreSQL / Redis / LLM cards with live latency, status dots, and model info.
- **Run volume bars**, **reliability donut**, **status-mix stacked bar**, model routing, recent executions, member management (role change / revoke sessions), audit stream.

---

## 18. UX, theming and design system

- **Themes**: `system | light | dark` — resolved via `html[data-theme]` + CSS custom properties; persisted to `localStorage` (`ryuksaidso-theme`); toggle in the topbar.
  - Dark is the designed default (violet `#8b5cf6` + cyan `#22d3ee` accents on deep slate surfaces).
  - **Light theme** is a full override layer (≈100 rules): nav text, buttons, labels, code blocks, badges, threads, eval rows, charts, health cards, toasts — every hardcoded light-on-dark grey flips to a dark equivalent, every white-alpha border flips to slate-alpha.
- **Toasts**: fixed top-right modern card — icon chip, rose (error) / green (success) accent border, **6-second auto-dismiss** with a shrinking countdown bar, hover-to-pause (timer + CSS), manual × close, slide-in animation, mobile-full-width. Success/error kinds (e.g. verification-email result).
- **Charts**: dependency-free — `AreaChart` (smooth SVG path + gradient, theme-aware vars), `SegmentedDonut` (conic-gradient + legend), `Donut`, rank bars, spark bars, status-mix bars.
- **Responsive**: sidebar collapses to a drawer under 850 px; grids collapse progressively (1100/850/700/520 px breakpoints).
- **Auth screens**: split art/card layout with feature grid, OAuth buttons, tabbed sign-in/register, forgot/reset/verify pages.

---

## 19. Configuration reference (.env)

`.env.example` documents every knob (copy to `.env`; `POSTGRES_PASSWORD`, `JWT_SECRET`, `GRAFANA_ADMIN_PASSWORD` are mandatory):

| Group | Variables |
|---|---|
| **Core** | `NODE_ENV`, `APP_NAME`, `APP_URL`, `API_URL`, `NEXT_PUBLIC_API_URL`, `API_PORT=4001`, `FRONTEND_URL`, `CORS_ORIGIN`, `COOKIE_SAME_SITE`, `LOG_LEVEL` |
| **Database/Redis** | `POSTGRES_USER/PASSWORD/DB/HOST_PORT`, `DATABASE_URL`, `REDIS_URL/HOST/PORT/PASSWORD` |
| **Auth** | `JWT_SECRET`, `ACCESS_TOKEN_TTL`, `REFRESH_TOKEN_TTL_DAYS`, `PASSWORD_RESET_EXPIRES_MINUTES`, `SESSION_EXPIRES_DAYS`, `SYSTEM_ADMIN_EMAILS` |
| **Rate limits** | `RATE_LIMIT_MAX` (600), `RATE_LIMIT_WINDOW_MS` (60000) |
| **LLM** | `OMNIROUTE_URL/API/MODEL` (+`_DOCKER`), `OLLAMA_URL/API/MODEL` (+`_DOCKER`), `DOCKER_RUNTIME` |
| **OAuth** | `GOOGLE_CLIENT_ID/SECRET/REDIRECT_URI`, `GITHUB_CLIENT_ID/SECRET/REDIRECT_URI`, `ENABLE_OAUTH` |
| **Tools** | `GITHUB_TOKEN`, `MCP_SERVERS` |
| **Email** | `SMTP_HOST/PORT/SECURE/USER/PASSWORD`, `EMAIL_FROM`, `ENABLE_PASSWORD_RESET` |
| **Worker** | `WORKER_CONCURRENCY` (4), `WORKER_RATE_LIMIT_MAX`, `WORKER_RATE_LIMIT_DURATION_MS` |
| **Observability** | `GRAFANA_ADMIN_USER/PASSWORD`, `PROMETHEUS_URL`, `LOKI_URL`, `GRAFANA_URL` |
| **Feature flags** | `ENABLE_ADMIN`, `ENABLE_KNOWLEDGE_BASE`, `ENABLE_EVALUATIONS`, `ENABLE_APPROVALS`, `ENABLE_POLICIES` |

---

## 20. Running the project

### Prerequisites
- Docker + Docker Compose
- For the local model runtime: Ollama on the host — `ollama serve && ollama pull qwen2.5-coder:3b-instruct-q4_K_M`
- (Optional) OmniRoute gateway on `:20128`

### Start

```bash
cp .env.example .env        # set POSTGRES_PASSWORD, JWT_SECRET, GRAFANA_ADMIN_PASSWORD
docker compose up --build   # migrate → api → worker → web (+ telemetry)
```

Open **http://localhost:3000** and create a workspace.

### Ports

| Service | URL |
|---|---|
| Control plane | http://localhost:3000 |
| API | http://localhost:4001 |
| Postgres | localhost:5433 |
| Redis | localhost:6379 |
| OmniRoute (host) | http://localhost:20128 (proxied to `:20129` in Docker) |
| Ollama (host) | :11434 (proxied to `:11435` in Docker) |
| Prometheus | http://localhost:9090 |
| Grafana | http://localhost:3001 |
| Loki | http://localhost:3100 |

### Day-one workflow (the "first serious" path)
1. Create a workspace → 2. Run the default agent in **Run Lab** → 3. Inspect the trace in **Traces** → 4. Add a knowledge document and re-ask → 5. Add a `ticket:write` policy → 6. Trigger a write and watch the run park in **Approvals** → 7. Approve and see the **continuation run** → 8. Build an evaluation dataset and persist a score.

### Development (outside Docker)

```bash
pnpm install
pnpm dev        # api + web + worker in parallel (tsx watch / next dev)
pnpm typecheck  # 5 workspaces
pnpm test       # vitest (API suites)
```

### Rebuild notes
- `docker compose build api web worker && docker compose up -d api web worker` for app changes.
- Schema changes additionally need `docker compose build migrate && docker compose run --rm migrate`.

---

## 21. Testing & verification

| Layer | Tool | Current state |
|---|---|---|
| **Unit/integration** | Vitest (`apps/api`) | **29 tests / 5 suites passing** — calculator safety, knowledge terms, 13-tool registry & metadata, `unit_convert`, `text_tools`, **weather two-source fallback (stubbed fetch)**, auth, server routes, LLM fallback (OmniRoute→Ollama), evaluator |
| **Static** | `tsc --noEmit` | **5/5 workspaces clean** |
| **UI regression (browser)** | scripted Playwright harness (test-only, never shipped) | `ux-ui.mjs` → **33/33** (panels, charts, refresh, toast dismiss/close, theming, zero console errors); `tools-ui.mjs` → all pass (13 tools in picker, prompt badge) |
| **End-to-end** | `tools-e2e.sh` against the live Docker stack | **ALL PASS (50+ checks)**: registry, agent+prompt persistence, 4 completed LLM runs (time/calculator, weather with real conditions, web_search, github, dedicated **new-tools run**), system-prompt persona in answers, ticket → OmniRoute → approval → continuation + reply, evaluation answered by OmniRoute with per-case results |
| **Live smokes** | curl/node against running services | 72 °F→22.22 °C, 10 km→6.21 mi, unicode base64 round-trip, 250 USD→23955 INR (ECB), Wiktionary fallback, HN list, weather London 18.6 °C + forced-fallback Tokyo 21.2 °C, admin overview payload, `no-store` headers |

Full fix/verification history is logged in **`ALL_BUGS_FIXED.md`** (batches: control plane, RBAC, tooling/providers, slug validation, Chromium removal, UX & analytics).

---

## 22. Current status & feature completeness

**Status: production-ready application running fully in Docker (11 services, healthy).**

Working end-to-end today:
- ✅ Multi-tenant sign-up/login (password + Google/GitHub OAuth), verification, recovery, sessions, API keys
- ✅ Projects, agents, immutable versions, custom system prompts, grouped tool picker
- ✅ Async runs with full trace persistence, retry-as-new-run, approval continuation
- ✅ 13 built-in tools + MCP, tenant-scoped knowledge retrieval, policy gating
- ✅ Tickets with threaded replies; evaluations with persisted scores
- ✅ OmniRoute-first/Ollama-fallback routing with per-run provider recording
- ✅ Admin portal with fresh data, charts and live system health
- ✅ Command Center with charts and approval quick-actions
- ✅ Dark/light/system themes, auto-dismissing toasts, responsive layout
- ✅ Prometheus/Loki/Grafana observability, health/readiness endpoints
- ✅ Tests (29 unit), typecheck (5/5), browser suites and full E2E all green

---

## 23. Known limitations & future hardening

Deliberate boundaries (documented in `ARCHITECTURE.md` / `README.md`):

| Area | What a public SaaS deployment still needs |
|---|---|
| **Retrieval** | pgvector embeddings for semantic retrieval at scale (schema already on a pgvector image); object storage for large source files |
| **Models** | Provider circuit breakers, budget enforcement, per-tenant quotas |
| **Identity** | SSO / enterprise OIDC |
| **Eval** | Dataset versioning, richer graders (LLM-as-judge), canary promotion records |
| **Ops** | Managed Postgres/Redis, TLS, secret manager, backups, alert rules, on-call routing, distributed tracing |
| **Extensibility** | Environment-scoped credentials, deployment promotion records |

Engineering hygiene notes:
- Worker integration tests are deferred to the E2E harness (they require live Redis/Postgres).
- The Playwright browser exists **only** in the local test harness; the shipped worker image is plain `node:22-alpine` (Chromium tooling was built, then removed on request — `web_search` covers lookups without a browser).
- The repo is currently **not a git repository** — changes are uncommitted on disk.

---

## 24. Documentation index

| File | Contents |
|---|---|
| `README.md` | Product overview, quick start, LLM compatibility, first workflow |
| `ARCHITECTURE.md` | Product boundary, pipeline, service/security/reliability models |
| `API.md` | REST endpoint contract + API-key auth |
| `docs/FEATURES.md` | Full feature map (platform, tools, routing, security, UI, admin, observability) |
| `docs/PROJECT_PITCH.md` | One-sentence pitch + interview walkthrough |
| `docs/PRODUCTION-SETUP.md` | Production environment setup (incl. Docker LLM routing) |
| `docs/DEMO.md` | Demo script |
| `QUICK_START.md` | Extended quick start |
| `ALL_BUGS_FIXED.md` | Chronological fix log with verification records (authoritative history) |
| `RBAC_*.md`, `PRODUCTION_*.md`, `FIXES*.md`, `COMPREHENSIVE_FIXES.md`, `IMPLEMENTATION_SUMMARY.md` | Historical batch documentation |
| `DETAILRYUKSAIDSO.md` | **This document — the complete reference** |

---

### TL;DR

**RYUKSAIDSO = a production control plane for AI agents.** Teams design versioned agents, run them asynchronously on Redis/BullMQ, trace every planner/tool/synthesis step, gate side effects behind human approvals, evaluate regressions, and watch it all on charts — with PostgreSQL as the source of truth, OmniRoute/Ollama model routing with automatic fallback, 13 built-in tools plus MCP, full security hardening (tenancy, RBAC, hashed rotating sessions, CSRF, rate limits, audit), and Prometheus/Loki/Grafana observability. Stack: **TypeScript · Next.js 15 / React 19 · Express 5 · Prisma / PostgreSQL · Redis / BullMQ · Docker Compose.**
