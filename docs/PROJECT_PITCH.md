# RYUKSAIDSO: Portfolio / Interview Pitch

## One sentence

RYUKSAIDSO is a multi-tenant control plane for production AI agents that makes every agent execution observable, policy-gated, retryable and evaluatable.

## Why it is interesting

Most AI demos stop at prompt → answer. RYUKSAIDSO focuses on the engineering surface around that answer:

- durable execution records;
- versioned agent configuration;
- asynchronous work with BullMQ;
- tenant-scoped Postgres persistence;
- tool permission scopes;
- human approval for side effects;
- continuation runs after approval;
- runtime latency and token metrics;
- persisted regression evaluations;
- API keys for machine-to-machine execution;
- Prometheus + Loki + Grafana operational visibility.

## Stack

- TypeScript
- Next.js 15 / React 19
- Express 5
- PostgreSQL + pgvector
- Redis + BullMQ
- Prisma
- OpenAI-compatible LLM providers / Ollama
- Prometheus / Loki / Grafana
- Docker Compose

## Interview walkthrough

1. Show the Run Lab and start a real execution.
2. Open the Trace Explorer and explain the planner → tool gateway → synthesizer lifecycle.
3. Create or enable a `ticket:write` policy and demonstrate that a model request cannot directly mutate the database.
4. Open Approvals, approve the action, and point out that RYUKSAIDSO creates a continuation run rather than rewriting history.
5. Open Agents and publish a new version.
6. Open Evaluations and run a regression dataset against a selected agent.
7. Open Developer and create an API key, then show the documented curl contract.
8. Explain tenant isolation, RBAC, refresh sessions, rate limiting, audit records and background retries.
