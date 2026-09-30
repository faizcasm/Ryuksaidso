# RYUKSAIDSO API

Base URL: `http://localhost:4001/api`

## Authentication

Browser clients use the HTTP-only session cookies issued by `/auth/login` or `/auth/register`.

Machine clients can use a workspace API key:

```http
Authorization: Bearer rsk_...
```

All protected routes are tenant-scoped from the authenticated organization.

## Control plane

### Dashboard

`GET /control/dashboard`

Returns 24-hour runtime metrics, projects, active agents, latest runs, pending approval count and latest evaluation signal.

### Projects

`GET /control/projects`

`POST /control/projects`

`PATCH /control/projects/:id`

### Agents

`GET /control/agents`

`POST /control/agents`

`PATCH /control/agents/:id`

`POST /control/agents/:id/versions`

The version endpoint creates an immutable configuration snapshot. A published version can pin a project production version.

### Runs

`GET /control/runs`

`GET /control/runs/:id`

`POST /control/runs`

Example:

```json
{
  "agentId": "cuid",
  "prompt": "Investigate the authentication incident and use internal evidence.",
  "environment": "staging",
  "trigger": "ci"
}
```

`POST /control/runs/:id/retry`

Retry always creates a new run record so historical evidence is preserved.

### Policies

`GET /control/policies`

`POST /control/policies`

`PATCH /control/policies/:id`

Policy actions correspond to tool scopes, such as `ticket:write` and `knowledge:read`.

## Approvals

`GET /approvals`

`POST /approvals/:id/decision`

Approving a gated action creates a continuation run with the approved scope recorded. Rejecting a gated action terminally fails the waiting run.

## Knowledge

`GET /documents`

`POST /documents`

Document retrieval is executed by the worker's `search_knowledge` tool and scoped to the authenticated organization.

## Evaluations

`GET /evaluations`

`POST /evaluations`

The current evaluator measures intent-classification accuracy using a JSON dataset.

## Account & security

`GET /profile`

`PATCH /profile`

`GET /organization`

`GET /members`

`GET /sessions`

`POST /sessions/revoke-all`

`GET /api-keys`

`POST /api-keys`

`DELETE /api-keys/:id`

`GET /audit`

`GET /security`

## Runtime endpoints

`GET /health`

`GET /ready`

`GET /metrics`
