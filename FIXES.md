# Bug Fixes — Agent Execution, Providers, Navigation

Date: 2026-09-22

## 1. Agent runs failing with `fetch failed`

**Root cause:** LLM providers are reached on the host (`host.docker.internal:11434` for
Ollama, `:20128` for OmniRoute). Ollama was not running on the host, so every run threw a
bare `fetch failed` with no retry and no fallback.

**Fixes** (`apps/worker/src/index.ts`):

- Extracted `providerSettings()` / `callProvider()` / `chatWithFallback()`.
- Docker-aware URL mapping: `localhost` / `127.0.0.1` / `::1` → `host.docker.internal`
  only when `DOCKER_RUNTIME=true`.
- **Retry** connection errors 3× with exponential backoff (500ms → 1s → 2s).
- **Automatic provider fallback:** if the primary provider stays unreachable, the run
  retries against the other configured provider and logs
  `LLM call succeeded after falling back to another provider`.
- Actionable error text instead of `fetch failed`:
  `OLLAMA is unreachable at http://host.docker.internal:11434/v1 (fetch failed). Check that
  the provider is running on the host and that OLLAMA_URL is correct...`
- Provider settings are logged once at startup instead of on every call.

**Same treatment for the API** (`apps/api/src/services/llm.ts`):

- `chat()` now retries transient network failures 3× and reports the provider URL + Docker
  remapping hint on failure.
- `models()` no longer leaks a raw `fetch failed` from the Ollama `/api/tags` probe.

## 2. Providers not configured correctly

- `GET /api/llm/providers` hardcoded `configured: provider === 'OLLAMA'`, so a down Ollama
  reported as configured and a working OmniRoute reported as not. Now `configured` reflects
  actual reachability, and errors explain why.
- `isModelAvailable()` (exported from `services/llm.ts`) matches routed model aliases:
  `auto` now matches `auto/chat`, `auto/coding:fast`, etc. Previously `auto` was rejected by
  `PATCH /api/llm` (`ModelUnavailable`) and by `GET /ready`, which made readiness return 503
  even though OmniRoute was healthy.
- `GET /ready` now returns `200` with per-provider detail (reachable provider listed under
  `dependencies.llm`, unreachable ones explained under `providers`).
- Run creation (`POST /api/control/runs`, `POST /api/tickets/:id/run`) no longer blocks with
  `ProviderNotConfigured` when the workspace has no model set: the workspace value is now an
  override on top of the `OLLAMA_MODEL` / `OMNIROUTE_MODEL` environment defaults.

## 3. Broken package build (would break Docker)

- `packages/agent-runtime` had its `build` script removed, but `apps/worker/Dockerfile` runs
  `pnpm --filter @ryuksaidso/agent-runtime build` and copies `dist/`.
- Removed dead `src/langgraph-agent.ts` (nothing imported it; missing LangChain/zod deps;
  contained `this.runId` type errors) and restored `"build": "tsc -p tsconfig.json"`.

## 4. Navigation

- Sidebar `mainNav` now includes **DemoAgent**, **Docs** and **Architecture**
  (`apps/web/src/app/page.tsx`), each with its own tab panel linking to
  `/demoagent`, `/docs` and `/architecture`.

## 5. Landing page (added later the same day)

- `/` is now a marketing **landing page** (`apps/web/src/app/page.tsx`): animated 3D canvas
  hero (starfield + rotating wireframe icosahedron + orbit rings, mouse parallax), scroll
  reveal sections, feature grid, showcase cards for Docs / Architecture / Demo agent, and
  **Get started → `/auth`**.
- The control plane moved out of `/`:
  - `apps/web/src/components/AppShell.tsx` — the former `app/page.tsx` (auth screen + dashboard),
    now exported as `AppShell`.
  - `/dashboard` → renders `AppShell` (command center; shows sign-in if there is no session).
  - `/auth` → renders `AppShell` (register/login) and `router.replace("/dashboard")` once
    the user is authenticated.
- Link updates: `auth/callback` → `/dashboard`; `auth/error`, `reset-password`,
  `verify-email`, `invite` → `/auth`; Demo-agent CTA → `/auth`; the sign-in screen gained a
  "← Back to home" link to `/`.
- Verified: `pnpm build` (15 routes) and `docker compose build web` green; `/`, `/auth`,
  `/dashboard`, `/docs`, `/architecture`, `/demoagent` all return 200.

## 6. Email system not sending (fixed)

**Root cause:** `.env` had `SMTP_PORT=465` with `SMTP_SECURE=false`. Port 465 is SMTPS —
TLS must begin *before* the SMTP greeting. Gmail drops a plaintext client, which surfaced
as `Connection closed` on every send (registration, verification, invites, password reset).

Verified from inside the API container:
`secure:false → FAILED (Connection closed)` / `secure:true → OK`.

Fixes in `apps/api/src/services/email.ts` (rewritten):
- **TLS auto-detection** — implicit TLS is enabled whenever `SMTP_PORT=465`, even if
  `SMTP_SECURE` is false/missing; `.env` also corrected to `SMTP_SECURE=true`.
- **Connection timeouts** (`connectionTimeout` 15s, `greetingTimeout` 15s, `socketTimeout` 30s)
  instead of hanging forever.
- **Retry with backoff** — up to 3 attempts for transient connection errors (never retries
  auth/envelope rejections); the cached transport is rebuilt after socket failures.
- **Actionable error messages** — e.g. auth failures say "check SMTP_USER/SMTP_PASSWORD
  (Gmail needs a 16-char App Password)", reachability failures list the exact host/port and
  the 465-TLS rule.
- **`verifyEmailTransport()`** — called at API startup, logs
  `SMTP connection verified — email delivery is ready` or a clear failure reason.

Route hardening:
- `POST /auth/forgot-password` no longer 500s in production when SMTP fails — it logs
  `Password reset email could not be sent` and still returns 202 (keeps the anti-enumeration
  contract instead of leaking account existence via HTTP status).
- `POST /account/profile/verify-email` returns an honest 202
  (`"We could not deliver the verification email right now…"`) instead of an unhandled 500.
- Both routes now import `logger` (they previously had no structured logging).

**Verified live:**
- Startup: `{"message":"SMTP connection verified — email delivery is ready","port":465,"secure":true}`
- Direct send: `Email sent successfully`, Gmail `messageId <7719a136-…@gmail.com>` delivered
- `POST /api/auth/forgot-password` → `202` and `Password reset email sent` with a real Gmail messageId
- Unregistered email → `202` (no enumeration, no crash)

## Verification


```
pnpm build                     # agent-runtime, api, web (13 pages), worker — all green
docker compose build           # all images build
docker compose up -d           # all 9 services up, api healthy
GET /ready                     # 200: OMNIROUTE ok, OLLAMA explained as unreachable
GET /api/llm/providers         # OLLAMA configured:false, OMNIROUTE configured:true + models
POST /api/control/runs (OLLAMA # down)  # -> COMPLETED via fallback to OmniRoute (7.4s, 522 tokens)
POST /api/control/runs (OMNIROUTE)      # -> COMPLETED (5.1s)
GET /demoagent /docs /architecture      # 200, 200, 200
```

Worker log evidence:

```
"LLM connection failed, retrying" ... "LLM provider unreachable after retries"
"provider":"OMNIROUTE" "msg":"LLM call succeeded after falling back to another provider"
"runId":"..." "latencyMs":7460 "msg":"agent run completed"
```
