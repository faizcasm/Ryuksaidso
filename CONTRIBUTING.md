# Contributing to RYUKSAIDSO

## Development principles

1. Preserve tenant isolation in every query.
2. Never allow an LLM response to directly mutate persistence without a server-side tool implementation.
3. New writes should be auditable.
4. Prefer durable records over transient UI state.
5. Keep the control plane provider-agnostic through the OpenAI-compatible API boundary.
6. Add tests for authorization, run lifecycle and policy behavior when changing execution paths.

## Commands

```bash
pnpm install
pnpm typecheck
pnpm test
pnpm build
docker compose up --build
```

## Pull requests

Explain the operational behavior being changed, the persistence impact, the security impact and how the change was validated.
