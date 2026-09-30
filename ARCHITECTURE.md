# RYUKSAIDSO Architecture

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

## Service boundaries

- `apps/web`: Next.js control plane. Presentation and user interaction only.
- `apps/api`: Express HTTP boundary, auth, RBAC, persistence, policy records, run dispatch.
- `apps/worker`: BullMQ consumer. Executes durable agent runs and tool gateway actions.
- `packages/agent-runtime`: provider-agnostic run orchestration and trace persistence contract.
- PostgreSQL: source of truth.
- Redis: queue transport and coordination.
- Prometheus / Loki / Grafana: telemetry and operator visibility.

## Security model

- Tenant checks on protected data access.
- RBAC for administrative mutations.
- HTTP-only access/refresh sessions.
- Rotating refresh tokens stored hashed.
- CSRF protection for browser mutations.
- API keys stored hashed and supported through bearer auth.
- Rate limiting and request IDs.
- Side-effecting tools can require human approval.

## Reliability model

- Background jobs use retries and exponential backoff.
- Each execution step is persisted.
- Retry creates a new run instead of overwriting historical evidence.
- Health and readiness are separate.
- Metrics avoid unbounded request labels.
- Failed model calls remain visible as failed operational records.

## Next hardening layers for a public SaaS deployment

- SSO / enterprise OIDC.
- Object storage for large source files.
- Vector embeddings with pgvector for semantic retrieval at scale.
- Provider circuit breakers and budget enforcement.
- Dataset versioning and richer evaluation graders.
- Deployment promotion records and environment-scoped credentials.
- Alert rules, on-call routing, and distributed tracing.
