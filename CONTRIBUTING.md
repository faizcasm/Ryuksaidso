# Contributing to RYUKSAIDSO

## Development principles

1. Preserve tenant isolation in every query.
2. Never allow an LLM response to directly mutate persistence without a server-side tool implementation.
3. New writes should be auditable.
4. Prefer durable records over transient UI state.
5. Keep the control plane provider-agnostic through the OpenAI-compatible API boundary.
6. Add tests for authorization, run lifecycle and policy behavior when changing execution paths.
7. **Code must not contain comments.** No `//` line comments, no `/* */` blocks, no JSDoc/TSDoc anywhere in `apps/` or `packages/`. Markdown documentation may of course contain normal prose — explain behavior in README/API.md/ARCHITECTURE.md/docs/ instead of inline.

## Commands

Run from the repository root:

```bash
pnpm install            # workspace install (CI uses --frozen-lockfile)
pnpm db:generate        # prisma client
pnpm db:migrate         # apply migrations to the local DATABASE_URL

pnpm lint               # ESLint flat config (eslint.config.mjs)
pnpm typecheck          # tsc --noEmit across all workspaces
pnpm test               # vitest — 278 tests in apps/api/src/__tests__
pnpm build              # api/worker/packages tsc + prisma, web next build

pnpm dev                # api (:4001) + web (:3000) + worker in parallel
docker compose up --build   # full local stack incl. postgres/redis/observability
```

All four quality gates (`lint`, `typecheck`, `test`, `build`) must pass; `.github/workflows/ci.yml` runs them plus compose and `nginx -t` validation on every push and pull request to `main`.

## Changing the API

- Register routes in `apps/api/src/server.ts` and the router files under `apps/api/src/routes/`.
- Validate bodies with Zod schemas in `apps/api/src/validation.ts`.
- Keep `API.md` in sync with every added, changed or removed endpoint (method, path, auth/CSRF rule, body, responses, error codes).

## Changing infrastructure

- Compose files, `infra/` and `.github/` define the production topology; CI validates `docker-compose.prod.yml`, the TLS overlay and both nginx configs on every change.
- Deployment behavior (tags, health gate, rollback) is described in `docs/PRODUCTION-SETUP.md` — update it when workflows change.

## Pull requests

Explain the operational behavior being changed, the persistence impact, the security impact and how the change was validated (`pnpm lint && pnpm typecheck && pnpm test && pnpm build`).
