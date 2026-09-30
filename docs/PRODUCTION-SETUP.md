# RYUKSAIDSO Production Setup

## LLM routing

RYUKSAIDSO supports two OpenAI-compatible providers. The workspace default is selected under **Settings → Model provider**, and every `AgentRun` stores the provider used so historical traces stay reproducible.

```env
OMNIROUTE_URL=http://localhost:20128/v1
OMNIROUTE_API=<your Omniroute API key>
OMNIROUTE_MODEL=<model id>

OLLAMA_URL=http://localhost:11434/v1
OLLAMA_API=ollama
OLLAMA_MODEL=qwen2.5-coder:3b-instruct-q4_K_M
DOCKER_RUNTIME=true
```

Docker containers automatically translate a localhost provider URL to `host.docker.internal` for the API and worker. The browser does not call the model provider directly.

Because Ollama only binds `127.0.0.1:11434`, containers cannot dial it directly —
loopback is unreachable from the bridge network. The stack ships a tiny forwarder
(`llm-proxy`, `infra/llm-proxy.js`, host networking) that exposes it to containers:

| Provider | Host (npm run dev) | From containers (compose) |
| --- | --- | --- |
| Ollama | `http://localhost:11434/v1` | `http://host.docker.internal:11435/v1` → 127.0.0.1:11434 |
| OmniRoute | `http://localhost:20128/v1` | `http://host.docker.internal:20129/v1` → 127.0.0.1:20128 |

These are set by `OLLAMA_URL_DOCKER` / `OMNIROUTE_URL_DOCKER` in `.env`. The
per-organization model (`Organization.ollamaModel`, editable via `PATCH /api/llm`)
is what runs actually execute with; the env value is only the fallback.

## Password recovery

Set SMTP variables before enabling public password recovery:

```env
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=<smtp user>
SMTP_PASSWORD=<smtp password>
EMAIL_FROM=RYUKSAIDSO <no-reply@example.com>
```

Reset tokens are single-use, hashed at rest, expire after 30 minutes, and revoke existing sessions after a successful reset. The forgot-password endpoint returns the same response for known and unknown emails to reduce account enumeration.

In development, when SMTP is not configured, the API logs the generated reset URL so the complete flow can still be tested locally.

## Google OAuth

Configure:

```env
GOOGLE_CLIENT_ID=<client id>
GOOGLE_CLIENT_SECRET=<client secret>
GOOGLE_REDIRECT_URI=http://localhost:4001/api/auth/oauth/google/callback
```

The Google OAuth app should register the exact callback URL above for local development.

## GitHub OAuth

Configure:

```env
GITHUB_CLIENT_ID=<client id>
GITHUB_CLIENT_SECRET=<client secret>
GITHUB_REDIRECT_URI=http://localhost:4001/api/auth/oauth/github/callback
```

The GitHub OAuth app should register the exact callback URL above.

## Admin surface

Two independent RBAC layers exist:

- **System RBAC** — `User.userRole` (`ADMIN` | `USER`). Only system admins get the
  **Admin** navigation item; they also unlock the platform routes gated by
  `requireAdmin` (`GET /api/admin/users`, `PATCH /api/admin/users/:id/role`).
- **Workspace RBAC** — `Membership.role` (`OWNER`/`ADMIN`/`AGENT`/`VIEWER`).
  `OWNER` and `ADMIN` members manage invites and member roles from **Settings**,
  matching `requireRole(['OWNER','ADMIN'])` on the API.

The first system admin is bootstrapped with the `SYSTEM_ADMIN_EMAILS` allowlist
(comma-separated emails in `.env`): listed accounts are promoted to `ADMIN` at
sign-in, refresh and on every `/me` call. The allowlist only promotes — explicit
grants/revocations through `PATCH /api/admin/users/:id/role` stay authoritative.
Leave it empty to disable auto-promotion entirely.

The admin dashboard includes:

- 14-day run volume
- completed vs failed reliability mix
- token usage and average latency
- pending approvals and document counts
- top agents
- recent executions with trace navigation
- member role management and removal
- model-routing visibility
- recent audit events

The backend also exposes `/api/admin/runs` and `/api/admin/audit` for operational tooling.

## Security controls

The application includes HTTP-only session cookies, rotating refresh sessions, CSRF protection, workspace-scoped bearer API keys, RBAC, rate limits, password reset token hashing, tenant-scoped queries, policy-gated tool execution, human approval gates, audit logs, health/readiness endpoints, and Prometheus metrics.

For a public deployment, put the API and web app behind TLS, use a secret manager, managed PostgreSQL/Redis, backups, and an external alerting pipeline.
