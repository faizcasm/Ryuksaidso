# RYUKSAIDSO Demo Script

## 5-minute demo

### 1. Start

```bash
cp .env.example .env
# set POSTGRES_PASSWORD, JWT_SECRET and GRAFANA_ADMIN_PASSWORD
docker compose up --build
```

Create a workspace at `http://localhost:3000`.

### 2. Run

Go to **Run Lab**.

Use a prompt such as:

> Investigate an authentication incident. Search internal knowledge for the relevant runbook and produce an evidence-backed response. Do not claim that an action was performed unless the tool actually executed it.

The worker queues the job, persists the planner step, executes retrieval and persists the final result.

### 3. Inspect

Open **Traces**.

Point out:

- run ID;
- agent version;
- environment;
- latency;
- token usage;
- each execution step;
- structured inputs and outputs;
- terminal status.

### 4. Gate

Open **Policies** and confirm `ticket:write` requires approval.

Run a prompt that requests a ticket write. The run should move to `WAITING_APPROVAL`.

Open **Approvals**. Approve the request.

RYUKSAIDSO creates a continuation run with `trigger=approval-resume` and the approved scope carried forward.

### 5. Evaluate

Open **Evaluations**, select the agent and run the default classification dataset.

The result is persisted and appears in the dashboard ship signal.

### 6. Integrate

Open **Developer** and create an API key. Use the documented `POST /api/control/runs` contract to queue runs from CI or an external service.
