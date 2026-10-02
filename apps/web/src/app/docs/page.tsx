"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  Activity,
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Boxes,
  Braces,
  Check,
  ChevronRight,
  Code2,
  Copy,
  Database,
  ExternalLink,
  Gauge,
  Home,
  Layers3,
  LifeBuoy,
  Lock,
  Menu,
  Play,
  Plug,
  Rocket,
  Search,
  Shield,
  Sparkles,
  TestTube2,
  Workflow,
  X,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import icon from "../icon.png";


const slug = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");

function CopyButton({ text, label = "Copy" }: { text: string; label?: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      className="dx-copy"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setDone(true);
          window.setTimeout(() => setDone(false), 1800);
        } catch {
          setDone(false);
        }
      }}
    >
      {done ? <Check size={12} /> : <Copy size={12} />}
      {done ? "Copied" : label}
    </button>
  );
}

function Code({ lang = "bash", code }: { lang?: string; code: string }) {
  return (
    <div className="dx-code">
      <div className="dx-code-head">
        <span>{lang}</span>
        <CopyButton text={code} />
      </div>
      <pre>
        <code>{code}</code>
      </pre>
    </div>
  );
}

function Lead({ children }: { children: ReactNode }) {
  return <p className="dx-lead">{children}</p>;
}

function H({ children }: { children: string }) {
  return (
    <h3 className="dx-h3" id={slug(children)}>
      {children}
    </h3>
  );
}

function Callout({
  tone = "note",
  title,
  children,
}: {
  tone?: "note" | "tip" | "warn";
  title: string;
  children: ReactNode;
}) {
  return (
    <div className={`dx-callout ${tone}`}>
      <b>{title}</b>
      <div>{children}</div>
    </div>
  );
}

function Bullets({ items }: { items: ReactNode[] }) {
  return (
    <ul className="dx-bullets">
      {items.map((x, i) => (
        <li key={i}>{x}</li>
      ))}
    </ul>
  );
}

function Steps({ items }: { items: { title: string; body?: ReactNode }[] }) {
  return (
    <ol className="dx-steps">
      {items.map((s, i) => (
        <li key={s.title}>
          <span className="dx-step-num">{i + 1}</span>
          <div>
            <b>{s.title}</b>
            {s.body ? <p>{s.body}</p> : null}
          </div>
        </li>
      ))}
    </ol>
  );
}

function Table({ head, rows }: { head: string[]; rows: ReactNode[][] }) {
  return (
    <div className="dx-table-wrap">
      <table className="dx-table">
        <thead>
          <tr>
            {head.map(h => (
              <th key={h}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>
              {r.map((c, j) => (
                <td key={j}>{c}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Cards({ items }: { items: { title: string; text: string }[] }) {
  return (
    <div className="dx-cards">
      {items.map(c => (
        <div key={c.title}>
          <b>{c.title}</b>
          <p>{c.text}</p>
        </div>
      ))}
    </div>
  );
}

function Endpoints({ items }: { items: [string, string, string][] }) {
  return (
    <div className="dx-endpoints">
      {items.map(([method, path, desc]) => (
        <div key={method + path}>
          <span className={`dx-method ${method.toLowerCase()}`}>{method}</span>
          <code>{path}</code>
          <span className="dx-ep-desc">{desc}</span>
        </div>
      ))}
    </div>
  );
}


type Section = {
  id: string;
  title: string;
  kicker: string;
  icon: typeof BookOpen;
  group: string;
  toc: string[];
  keywords: string;
  body: ReactNode;
};

const SECTIONS: Section[] = [
  {
    id: "overview",
    title: "Overview",
    kicker: "What Ryuksaidso is, and the words it uses",
    icon: BookOpen,
    group: "Start here",
    toc: ["What you get", "How the platform fits together", "Vocabulary"],
    keywords: "intro introduction overview what is platform pillars concepts",
    body: (
      <>
        <Lead>
          Ryuksaidso is an agent control plane — a single place to define AI
          agents, execute them as durable jobs, pause their risky side effects
          for a human decision, and keep the evidence that proves they behave.
          It is the tooling you wish you had the first time an agent did
          something &ldquo;weird&rdquo; in production and nobody could say why.
        </Lead>

        <H>What you get</H>
        <Cards
          items={[
            {
              title: "Durable traces",
              text: "Every run persists its planner, tool and synthesis steps with inputs, outputs, latency and token usage. Nothing lives only in a log line.",
            },
            {
              title: "Approval gates",
              text: "Policies pause dangerous tool calls until a person approves or rejects. Approvals are scoped, timed and written to the audit trail.",
            },
            {
              title: "Versioned agents",
              text: "Draft freely, publish immutable versions with changelogs, pin one to production and roll back without redeploying anything.",
            },
            {
              title: "Evaluations",
              text: "Regression datasets score intent accuracy for every draft, so a version ships because it beat the last one — not because it felt right.",
            },
            {
              title: "Knowledge grounding",
              text: "Postgres full-text retrieval keeps answers anchored in your own documents, scoped to your workspace.",
            },
            {
              title: "Multi-provider LLMs",
              text: "Route between Ollama (local) and OmniRoute (cloud), switch models from the UI, and let the worker fail over automatically.",
            },
          ]}
        />

        <H>How the platform fits together</H>
        <Table
          head={["Piece", "Technology", "Job"]}
          rows={[
            ["Web", "Next.js 15 · React 19", "Control plane UI at :3000"],
            ["API", "Express · Zod · Prisma", "REST endpoints, auth, rate limits at :4001"],
            ["Worker", "BullMQ on Redis", "Executes runs, tools, approvals and evals"],
            ["Database", "PostgreSQL (pgvector)", "Agents, runs, traces, knowledge, audit"],
            ["Cache & queue", "Redis 7", "Sessions, rate limits, durable job queue"],
            ["LLM providers", "Ollama · OmniRoute", "Model inference for agents and evals"],
          ]}
        />

        <H>Vocabulary</H>
        <Table
          head={["Term", "Meaning"]}
          rows={[
            ["Workspace", "The tenant boundary. Every row in the database is scoped to one."],
            ["Project", "A grouping for related agents, with its own production version pin."],
            ["Agent", "Instructions, a tool allowlist and a knowledge scope. Editable draft."],
            ["Version", "An immutable snapshot of an agent, published with a changelog."],
            ["Run", "One execution of an agent version, queued as a durable job."],
            ["Step", "A single action inside a run — plan, tool call or synthesis."],
            ["Policy", "A rule that decides whether an action needs human approval."],
            ["Approval", "The pending decision a human must make before a run continues."],
            ["Evaluation", "A dataset run against an agent to score its behaviour."],
          ]}
        />

        <Callout tone="tip" title="New here?">
          Head to the <b>Quick start</b> and you will have a traced, approval-gated
          run in a few minutes. Everything else on this page assumes that baseline.
        </Callout>
      </>
    ),
  },
  {
    id: "quickstart",
    title: "Quick start",
    kicker: "From clone to first traced run",
    icon: Rocket,
    group: "Start here",
    toc: ["Prerequisites", "1 · Clone and install", "2 · Configure the environment", "3 · Start the stack", "4 · Create a workspace", "5 · Run your first agent", "Ports at a glance", "Verify the install"],
    keywords: "install setup docker compose getting started clone env ports quickstart",
    body: (
      <>
        <Lead>
          The whole platform runs from Docker Compose: PostgreSQL, Redis, the
          API, the web app, the worker and Prometheus/Grafana for metrics. Ollama
          is optional if you already have a model server.
        </Lead>

        <H>Prerequisites</H>
        <Bullets
          items={[
            <>Docker with the Compose plugin (v2+)</>,
            <>Node.js 20+ and pnpm 9+ if you run services locally</>,
            <>A local model through Ollama, or an OmniRoute key</>,
            <>Ports 3000, 4001, 5433 and 6379 free on your machine</>,
          ]}
        />

        <H>1 · Clone and install</H>
        <Code
          code={`git clone https://github.com/your-org/ryuksaidso.git
cd ryuksaidso
pnpm install`}
        />

        <H>2 · Configure the environment</H>
        <Code
          code={`cp .env.example .env

# the values that actually matter on day one
DATABASE_URL=postgresql://user:password@localhost:5433/ryuksaidso?schema=public
REDIS_URL=redis://localhost:6379
NEXT_PUBLIC_API_URL=http://localhost:4001/api
OLLAMA_URL=http://localhost:11434/v1
OLLAMA_MODEL=qwen2.5-coder:3b-instruct-q4_K_M`}
        />
        <Callout tone="note" title="Secrets are validated on boot">
          The API refuses to start with weak or missing secrets. Set a real
          JWT/session secret before leaving dev mode, and never commit .env.
        </Callout>

        <H>3 · Start the stack</H>
        <Code code={`docker compose up --build`} />
        <Bullets
          items={[
            <>PostgreSQL on :5433 (mapped from the container&rsquo;s 5432)</>,
            <>Redis on :6379</>,
            <>API on :4001, web on :3000</>,
            <>Prometheus :9090, Grafana :3001, Loki :3100</>,
          ]}
        />

        <H>4 · Create a workspace</H>
        <Steps
          items={[
            { title: "Open the app", body: "Visit https://ryuksaidso.faizcasm.me (or http://localhost:3000 when running locally) and choose Get started." },
            { title: "Register", body: "Email and password (or Google/GitHub once configured). The first user of a new workspace becomes its OWNER." },
            { title: "Look around", body: "Sample agents are provisioned for you, so Command Center and Run Lab are never empty." },
          ]}
        />

        <H>5 · Run your first agent</H>
        <Steps
          items={[
            { title: "Open Run Lab", body: "Pick an agent, choose development as the environment and write a prompt." },
            { title: "Queue the run", body: "The API creates a QUEUED run and hands a job to the worker through Redis." },
            { title: "Watch the trace", body: "The Traces view streams each step — plan, tool calls, synthesis — with timing and tokens." },
            { title: "Approve if asked", body: "If a policy gates a tool, the run parks in WAITING_APPROVAL until someone decides." },
          ]}
        />

        <H>Ports at a glance</H>
        <Table
          head={["Service", "Port", "Notes"]}
          rows={[
            ["Web UI", "3000", "Next.js, served by the web container"],
            ["API", "4001", "REST under /api, health checks at the root"],
            ["PostgreSQL", "5433", "Host mapping; container listens on 5432"],
            ["Redis", "6379", "Queue, cache and rate-limit counters"],
            ["Grafana", "3001", "Dashboards, anonymous viewer enabled in dev"],
            ["Prometheus", "9090", "Scrapes the API /metrics endpoint"],
            ["Loki", "3100", "Log aggregation for API and worker"],
          ]}
        />

        <H>Verify the install</H>
        <Code
          code={`curl https://ryuksaidso.faizcasm.me/health
# {"status":"ok","service":"ryuksaidso-api",...}

curl http://localhost:4001/ready
# checks Postgres, Redis and that at least one LLM provider answers`}
        />

        <Callout tone="warn" title="If /ready returns 503">
          Postgres and Redis are fine — no LLM provider is reachable. Start
          Ollama (ollama serve) or set OMNIROUTE_URL and OMNIROUTE_MODEL in .env,
          then restart the API container.
        </Callout>
      </>
    ),
  },
  {
    id: "agents",
    title: "Agents & workflows",
    kicker: "Define, version and roll out agent behaviour",
    icon: Workflow,
    group: "Core concepts",
    toc: ["Anatomy of an agent", "The lifecycle", "Create one over the API", "Versioning rules"],
    keywords: "agent instructions tools version publish pin rollback workflow draft",
    body: (
      <>
        <Lead>
          An agent is a draft you can edit safely because nothing you change
          reaches production until you publish a version and pin it. Runs always
          execute a published snapshot, so a run from last Tuesday still replays
          exactly as it happened.
        </Lead>

        <H>Anatomy of an agent</H>
        <Table
          head={["Field", "Purpose"]}
          rows={[
            ["name / slug", "Human label plus a URL-safe identifier unique in the workspace"],
            ["instructions", "The system prompt: role, rules, tone, output contract"],
            ["tools", "Allowlist of tool names the agent may call, e.g. search_knowledge"],
            ["projectId", "Optional project grouping; carries the production version pin"],
            ["enabled", "Hard switch — a disabled agent refuses new runs"],
            ["versions", "Published snapshots, each with a changelog and timestamp"],
          ]}
        />

        <H>The lifecycle</H>
        <Steps
          items={[
            { title: "Draft", body: "Create the agent with instructions and a minimal tool allowlist." },
            { title: "Exercise it", body: "Run prompts from Run Lab and read the trace step by step." },
            { title: "Publish a version", body: "Snapshot the current configuration with a changelog entry." },
            { title: "Evaluate it", body: "Run a regression dataset and compare the score to the previous version." },
            { title: "Pin to production", body: "Point the project at the version you trust." },
            { title: "Roll back if needed", body: "Re-pin an older version — no redeploy, no downtime." },
          ]}
        />

        <H>Create one over the API</H>
        <Code
          lang="http"
          code={`POST /api/control/agents
Content-Type: application/json
Authorization: Bearer rsk_live_...

{
  "name": "Triage agent",
  "slug": "triage-agent",
  "instructions": "Classify the request, cite internal evidence, never invent ticket data.",
  "projectId": "clx_project_01",
  "tools": ["search_knowledge", "get_ticket"]
}`}
        />

        <H>Versioning rules</H>
        <Bullets
          items={[
            <>Versions are <b>immutable</b>: publishing copies the draft, it does not lock it.</>,
            <>A version records <b>who</b> published it, <b>when</b> and <b>why</b> (changelog).</>,
            <>A project pins exactly one production version at a time.</>,
            <>Runs store the version they executed, so traces stay truthful after edits.</>,
          ]}
        />

        <Callout tone="tip" title="Working habits that pay off">
          Keep instructions short and testable, grant the fewest tools that get
          the job done, and treat every instruction edit like code: publish,
          evaluate, then pin.
        </Callout>
      </>
    ),
  },
  {
    id: "runs",
    title: "Runs & traces",
    kicker: "How an execution moves from queue to evidence",
    icon: Activity,
    group: "Core concepts",
    toc: ["Run lifecycle", "Trigger a run", "Inside a trace", "Retries and replay"],
    keywords: "run trace queue status retry steps latency tokens execution trigger",
    body: (
      <>
        <Lead>
          A run is a durable job, not a request that must stay open. The API
          records it, the worker picks it up from Redis, and every step it takes
          is written back as it happens — so a crashed browser or a restarted
          container never loses the story.
        </Lead>

        <H>Run lifecycle</H>
        <Table
          head={["Status", "Meaning"]}
          rows={[
            ["QUEUED", "Accepted and waiting for a worker to pick the job up"],
            ["RUNNING", "A worker owns the run and is executing steps"],
            ["WAITING_APPROVAL", "Paused at a policy gate until a human decides"],
            ["COMPLETED", "Finished normally; output and token usage stored"],
            ["FAILED", "Terminal failure — error captured on the run and its step"],
          ]}
        />

        <H>Trigger a run</H>
        <Code
          lang="http"
          code={`POST /api/control/runs
Content-Type: application/json

{
  "agentId": "clx_agent_42",
  "prompt": "Investigate the authentication incident and use internal evidence.",
  "environment": "staging",
  "trigger": "ci"
}`}
        />
        <Bullets
          items={[
            <>Tells you the run id and the queue job id straight away.</>,
            <>Picks up the agent&rsquo;s current production version unless told otherwise.</>,
            <>Ticket, API and dashboard triggers all land in the same queue.</>,
          ]}
        />

        <H>Inside a trace</H>
        <Table
          head={["Captured per step", "Why it matters"]}
          rows={[
            ["action + agent", "Which phase ran and who ran it"],
            ["input / output", "Exact payloads, not a paraphrase"],
            ["durationMs", "Where the latency actually went"],
            ["tokens", "Cost attribution per run and per agent"],
            ["error", "Failure message with the step it happened on"],
          ]}
        />

        <H>Retries and replay</H>
        <Callout tone="note" title="Retry never mutates history">
          Retrying a failed run creates a <b>new</b> run that links back to the
          original. The old trace stays exactly as it was, which is the whole
          point of keeping evidence around.
        </Callout>
        <Code lang="http" code={`POST /api/control/runs/:id/retry`} />
      </>
    ),
  },
  {
    id: "approvals",
    title: "Approvals & policies",
    kicker: "Human-in-the-loop gates for risky side effects",
    icon: Lock,
    group: "Core concepts",
    toc: ["Policy model", "The gate flow", "Making a decision", "Create a policy"],
    keywords: "approval policy gate human in the loop reject approve security risk severity",
    body: (
      <>
        <Lead>
          The cheapest way to trust an agent is to make its dangerous moves wait.
          A policy watches each tool call, and when the call matches, the run
          parks in WAITING_APPROVAL until a person decides what happens next.
        </Lead>

        <H>Policy model</H>
        <Table
          head={["Field", "Meaning"]}
          rows={[
            ["action", "Tool scope the rule applies to, such as ticket:write"],
            ["requiresApproval", "Whether matching calls must wait for a human"],
            ["severity", "How loud the queue should be about it (low → critical)"],
            ["enabled", "Toggle a rule without deleting it"],
            ["description", "Shown to the reviewer next to the decision buttons"],
          ]}
        />

        <H>The gate flow</H>
        <Steps
          items={[
            { title: "Agent asks for a tool", body: "The worker validates the call against the tool schema." },
            { title: "Policies are consulted", body: "Matching rules decide whether a gate is required." },
            { title: "An approval is created", body: "Payload, scope and requester are stored; the run parks." },
            { title: "A human decides", body: "Approve or reject from the Approvals view or the API." },
            { title: "Execution continues or stops", body: "Approval queues a continuation run; rejection fails the run terminally." },
          ]}
        />

        <H>Making a decision</H>
        <Code
          lang="http"
          code={`POST /api/approvals/:id/decision
Content-Type: application/json

{ "approved": true }`}
        />
        <Bullets
          items={[
            <><b>Approve</b> — a continuation run is queued with the granted scope recorded against your identity.</>,
            <><b>Reject</b> — the waiting run fails on purpose, with the reason available in the trace.</>,
            <>Both outcomes land in the audit log with actor, timestamp and payload.</>,
          ]}
        />

        <H>Create a policy</H>
        <Code
          lang="http"
          code={`POST /api/control/policies
Content-Type: application/json

{
  "name": "High-risk writes",
  "description": "Any ticket mutation needs a human sign-off",
  "action": "ticket:write",
  "severity": "high",
  "requiresApproval": true
}`}
        />

        <Callout tone="warn" title="Fail closed, not open">
          If you are unsure whether an action should be gated, gate it. A
          rejected run is recoverable; a silently executed side effect is not.
        </Callout>
      </>
    ),
  },
  {
    id: "knowledge",
    title: "Knowledge base",
    kicker: "Ground answers in your own documents",
    icon: Database,
    group: "Core concepts",
    toc: ["Add a document", "How retrieval works", "Keeping it healthy"],
    keywords: "knowledge documents rag retrieval search full text grounding embedding",
    body: (
      <>
        <Lead>
          Agents answer better when they can look things up. The knowledge base
          is Postgres full-text search over your own documents, scoped to your
          workspace — no external index, no data leaving your database.
        </Lead>

        <H>Add a document</H>
        <Code
          lang="http"
          code={`POST /api/documents
Content-Type: application/json

{
  "title": "Incident runbook — SSO outage",
  "source": "runbook",
  "content": "1. Confirm the identity provider status page..."
}`}
        />

        <H>How retrieval works</H>
        <Steps
          items={[
            { title: "The agent calls search_knowledge", body: "With a query derived from the user's question." },
            { title: "The worker searches", body: "PostgreSQL full-text ranking over documents in your organization only." },
            { title: "Chunks come back ranked", body: "Top matches, with enough context to quote safely." },
            { title: "The answer cites them", body: "Synthesis is instructed to stay inside the retrieved evidence." },
          ]}
        />

        <H>Keeping it healthy</H>
        <Bullets
          items={[
            <>One document per concept beats one giant FAQ blob.</>,
            <>Set <code>source</code> honestly (runbook, policy, faq) — it shows up in traces.</>,
            <>Rewrite stale pages instead of stacking corrections on top of them.</>,
            <>Knowledge is tenant-scoped: a document never leaks across workspaces.</>,
          ]}
        />
      </>
    ),
  },
  {
    id: "integrations",
    title: "Integrations",
    kicker: "Connect email, chat, docs and webhooks",
    icon: Plug,
    group: "Core concepts",
    toc: ["Connect a provider", "Knowledge sync", "Chat widget", "Outbound webhooks", "Admin controls"],
    keywords: "integrations gmail outlook slack teams whatsapp drive notion github jira linear hubspot shopify zapier make n8n oauth webhook widget marketplace connect",
    body: (
      <>
        <Lead>
          Integrations are how the platform reaches outside itself: OAuth
          connections to the tools you use, knowledge sync that keeps answers
          current, an embeddable chat widget, and signed webhooks into Zapier,
          Make, n8n or your own service. Every write is gated by workspace
          roles and the same audit trail as the rest of the control plane.
        </Lead>

        <H>Connect a provider</H>
        <Endpoints
          items={[
            ["GET", "/api/integrations/catalog", "15-provider marketplace with connection state — members can read, owners connect."],
            ["POST", "/api/integrations/connections/:provider/connect", "Starts OAuth; returns the authorize URL and a 10-minute signed state."],
            ["GET", "/api/integrations/:provider/callback", "Public callback: exchanges the code, encrypts tokens, redirects with ?connected=."],
            ["POST", "/api/integrations/connections/token", "Token-type providers (Teams webhook URL, WhatsApp access token)."],
          ]}
        />
        <Bullets
          items={[
            <>Tokens are encrypted with AES-256-GCM keyed from <code>JWT_SECRET</code> and never leave the server in a response.</>,
            <>Providers without env credentials show a setup hint instead of a connect button.</>,
            <>A <b>Test</b> action probes the provider and refreshes health timestamps.</>,
            <>Disable anything you do not want from Integrations → Platform admin.</>,
          ]}
        />

        <H>Knowledge sync</H>
        <Bullets
          items={[
            <>Google Drive, Notion and GitHub sources upsert into the knowledge base as <code>Document</code> rows.</>,
            <>A worker sweep re-syncs stale sources every 15 minutes while the platform switch is on.</>,
            <>Manual sync, pause/resume and per-source <code>lastError</code> are in the dashboard.</>,
          ]}
        />

        <H>Chat widget</H>
        <Code
          lang="html"
          code={`<script src="https://your-api.example.com/api/widget.js"
        data-key="wgt_..."
        async></script>`}
        />
        <Bullets
          items={[
            <>One script tag gives any site a shadow-DOM chat bubble wired to your agents.</>,
            <>Origin allow-lists, quota checks (402) and a 120/min/IP rate limit are enforced server-side.</>,
            <>Conversations appear as normal runs with <code>trigger: widget</code> — traces, approvals and all.</>,
          ]}
        />

        <H>Outbound webhooks</H>
        <Bullets
          items={[
            <>Events: ticket/run/approval/document/integration/member/widget — subscribed per endpoint.</>,
            <>Each delivery carries <code>x-ryuksaidso-signature</code>: HMAC-SHA256 of <code>timestamp.body</code> with your <code>whsec_</code> secret.</>,
            <>Three attempts with backoff, a delivery log, and manual retry from the dashboard.</>,
            <>Private/internal URLs are refused (SSRF guard).</>,
          ]}
        />

        <H>Admin controls</H>
        <Bullets
          items={[
            <>System admins get a platform-wide switch plus per-provider kill switches (Admin → Integrations).</>,
            <>Off means no connects, no integration agent tools and no syncs — stored credentials stay put.</>,
            <>Platform overview: connection health, source status, 24-hour delivery success and a cross-workspace error feed.</>,
          ]}
        />
      </>
    ),
  },
  {
    id: "evaluations",
    title: "Evaluations",
    kicker: "Quantify behaviour before you publish",
    icon: TestTube2,
    group: "Core concepts",
    toc: ["Dataset format", "Run an evaluation", "Reading the score", "Gate your releases"],
    keywords: "evaluation eval dataset score accuracy regression intent testing quality",
    body: (
      <>
        <Lead>
          An evaluation is a plain JSON dataset of inputs and expected intents.
          The evaluator classifies each input, compares it to the expectation and
          reports how many cases passed — a number you can argue with, instead of
          a vibe.
        </Lead>

        <H>Dataset format</H>
        <Code
          lang="json"
          code={`[
  { "id": "billing-01", "input": "I was charged twice", "expectedIntent": "billing" },
  { "id": "auth-01", "input": "I cannot sign in", "expectedIntent": "auth" },
  { "id": "export-01", "input": "Export my invoices as CSV", "expectedIntent": "export" }
]`}
        />

        <H>Run an evaluation</H>
        <Code
          lang="http"
          code={`POST /api/evaluations
Content-Type: application/json

{
  "name": "Triage regression suite",
  "agentId": "clx_agent_42",
  "dataset": [
    { "id": "billing-01", "input": "I was charged twice", "expectedIntent": "billing" }
  ]
}`}
        />

        <H>Reading the score</H>
        <Table
          head={["Signal", "How to read it"]}
          rows={[
            ["Cases passed", "Straight intent accuracy across the dataset"],
            ["predictedIntent per case", "What the agent actually decided, so failures are debuggable"],
            ["Score vs. previous run", "Whether your change helped or hurt"],
            ["Latest evaluation on Command Center", "The most recent score, surfaced where you work"],
          ]}
        />

        <H>Gate your releases</H>
        <Bullets
          items={[
            <>Keep the dataset in git next to the instructions it tests.</>,
            <>Run it on every draft; publish only versions that beat the production pin.</>,
            <>Add a case the moment a real conversation surprises you.</>,
          ]}
        />

        <Callout tone="tip" title="Small datasets beat big promises">
          Twenty cases you actually care about will catch more regressions than
          five hundred synthetic rows nobody has read.
        </Callout>
      </>
    ),
  },
  {
    id: "tools",
    title: "Tool gateway & MCP",
    kicker: "One contract for everything an agent can do",
    icon: Code2,
    group: "Core concepts",
    toc: ["Tool shape", "Execution flow", "Built-in tools and scopes"],
    keywords: "tools mcp gateway schema scope execute handler contract",
    body: (
      <>
        <Lead>
          Tools go through a single gateway with an MCP-compatible shape: a
          name, a description, a schema and a scope. Because every call funnels
          through one door, validation, policy checks and audit happen in the
          same place every time.
        </Lead>

        <H>Tool shape</H>
        <Code
          lang="typescript"
          code={`type ToolDef = {
  name: string;              // search_knowledge
  description: string;       // what the model is told it does
  scope: string;             // knowledge:read
  requiresApproval: boolean; // hard gate, independent of policies
  execute: (input, ctx) => Promise<unknown>;
};`}
        />

        <H>Execution flow</H>
        <Steps
          items={[
            { title: "Validate", body: "Input is checked against the tool schema; bad calls never reach the handler." },
            { title: "Authorize", body: "Scope and workspace membership decide whether this agent may act at all." },
            { title: "Gate", body: "requiresApproval and matching policies can park the run for a human." },
            { title: "Execute", body: "The handler runs with the run's context (ids, org, trace parent)." },
            { title: "Record", body: "Input, output, duration and outcome are appended to the trace." },
          ]}
        />

        <H>Built-in tools and scopes</H>
        <Table
          head={["Tool", "Scope", "Approval"]}
          rows={[
            [<code>search_knowledge</code>, <code>knowledge:read</code>, "Never"],
            [<code>get_ticket</code>, <code>ticket:read</code>, "Never"],
            [<code>add_ticket_message</code>, <code>ticket:write</code>, "Always"],
            [<code>current_time</code>, <code>time:read</code>, "Never"],
            [<code>calculator</code>, <code>calculator:use</code>, "Never"],
            [<code>current_weather</code>, <code>weather:read</code>, "Never"],
            [<code>web_search</code>, <code>web:read</code>, "Never"],
            [<code>github</code>, <code>github:read</code>, "Never"],
            [<code>currency_convert</code>, <code>currency:read</code>, "Never"],
            [<code>unit_convert</code>, <code>unit:use</code>, "Never"],
            [<code>dictionary</code>, <code>dictionary:read</code>, "Never"],
            [<code>news</code>, <code>news:read</code>, "Never"],
            [<code>text_tools</code>, <code>text:use</code>, "Never"],
          ]}
        />

        <Callout tone="note" title="Two independent switches">
          <code>requiresApproval</code> on the tool is unconditional, while the
          same flag on a policy only fires when the action matches that policy.
          A tool call is gated when either one says so.
        </Callout>
      </>
    ),
  },
  {
    id: "security",
    title: "Security & RBAC",
    kicker: "Sessions, keys, roles and everything tenant-scoped",
    icon: Shield,
    group: "Run it in production",
    toc: ["Authenticating", "Roles", "What is enforced for you", "Audit and sessions"],
    keywords: "security rbac roles owner admin agent viewer api key csrf session oauth auth",
    body: (
      <>
        <Lead>
          Every request is authenticated and then scoped to exactly one
          workspace. There is no global table to mis-query: the organization id
          comes from your identity, not from the request body.
        </Lead>

        <H>Authenticating</H>
        <Bullets
          items={[
            <><b>Browser</b> — HTTP-only session cookie issued by login or register. Not readable from JavaScript.</>,
            <><b>OAuth</b> — Google and GitHub once you configure the client ids and redirect URIs.</>,
            <><b>Machine</b> — a workspace API key sent as a bearer token.</>,
          ]}
        />
        <Code
          lang="bash"
          code={`curl https://ryuksaidso.faizcasm.me/api/control/dashboard \\
  -H "Authorization: Bearer rsk_live_..."`}
        />
        <Callout tone="note" title="CSRF only applies to cookies">
          Cookie-authenticated writes must send the <code>x-csrf-token</code>{" "}
          header. Bearer keys (<code>rsk_…</code>) are exempt, which is exactly
          why machine clients should use keys.
        </Callout>

        <H>Roles</H>
        <Table
          head={["Role", "Can do"]}
          rows={[
            ["OWNER", "Everything, including ownership transfer and workspace deletion"],
            ["ADMIN", "Members, roles, settings, policies, runs and approvals"],
            ["AGENT", "Run agents, decide approvals, execute evaluations"],
            ["VIEWER", "Read dashboards, traces, runs and audit history"],
          ]}
        />

        <H>What is enforced for you</H>
        <Bullets
          items={[
            <>Zod validation on every inbound body — malformed input is a 400, not a crash.</>,
            <>bcrypt password hashing and SHA-256 hashed API key secrets (the plaintext is shown once).</>,
            <>Rate limiting on /api: 100 requests per minute by default, configurable per environment.</>,
            <>Helmet headers, strict CORS origin list and SameSite cookies.</>,
            <>Prisma parameterized queries throughout — no hand-built SQL.</>,
          ]}
        />

        <H>Audit and sessions</H>
        <Bullets
          items={[
            <>Mutating actions write an audit row: actor, action, resource, timestamp.</>,
            <>Inspect your own sessions and revoke everything in one click.</>,
            <>Owners can revoke another member&rsquo;s sessions instantly.</>,
          ]}
        />
      </>
    ),
  },
  {
    id: "observability",
    title: "Monitoring & metrics",
    kicker: "Know what is happening before your users do",
    icon: Gauge,
    group: "Run it in production",
    toc: ["Health endpoints", "What is measured", "The bundled stack", "Reading traces"],
    keywords: "observability monitoring metrics prometheus grafana loki health ready alerts",
    body: (
      <>
        <Lead>
          The API exposes first-class health, readiness and Prometheus metrics
          endpoints, and the Compose stack ships with Prometheus, Grafana and
          Loki already wired together.
        </Lead>

        <H>Health endpoints</H>
        <Code
          lang="bash"
          code={`curl https://ryuksaidso.faizcasm.me/health   # process liveness
curl https://ryuksaidso.faizcasm.me/ready    # Postgres + Redis + at least one LLM
curl http://127.0.0.1:4001/metrics           # Prometheus text format (instance-local)`}
        />
        <Bullets
          items={[
            <><code>/health</code> answers &ldquo;is this process alive&rdquo; — use it for container health checks.</>,
            <><code>/ready</code> answers &ldquo;can it serve&rdquo; and returns 503 until dependencies answer.</>,
            <><code>/metrics</code> is scraped by Prometheus on :9090.</>,
          ]}
        />

        <H>What is measured</H>
        <Table
          head={["Metric family", "Breakdown"]}
          rows={[
            ["HTTP request duration", "By method, route and status code"],
            ["HTTP request counts", "Same labels, for rate and error budgets"],
            ["Agent runs", "completed vs. failed counters"],
            ["Queue health", "Job depth and processing latency from the worker"],
            ["Tokens & cost", "Per run, attributable to an agent"],
          ]}
        />

        <H>The bundled stack</H>
        <Table
          head={["Tool", "Port", "Role"]}
          rows={[
            ["Prometheus", "9090", "Scrapes /metrics, stores time series"],
            ["Grafana", "3001", "Dashboards for traffic, runs and queue depth"],
            ["Loki", "3100", "Log aggregation"],
            ["Promtail", "—", "Ships container logs into Loki"],
          ]}
        />

        <H>Reading traces</H>
        <Bullets
          items={[
            <>Start from Command Center when something looks off — success rate, p95 latency and failures sit at the top.</>,
            <>Open a run to see the step timeline; the slowest step is usually the whole story.</>,
            <>Compare a failing run against the last passing one before you touch prompts.</>,
          ]}
        />
      </>
    ),
  },
  {
    id: "deployment",
    title: "Deployment",
    kicker: "From laptop to a production-shaped stack",
    icon: Boxes,
    group: "Run it in production",
    toc: ["Compose services", "Environment variables", "Scaling out", "Production checklist"],
    keywords: "deploy deployment docker compose kubernetes scale production env checklist",
    body: (
      <>
        <Lead>
          Docker Compose is the reference deployment: one file that brings up
          the database, queue, API, worker and web app with health checks and
          the right wiring between them.
        </Lead>

        <H>Compose services</H>
        <Table
          head={["Service", "Image / role", "Port"]}
          rows={[
            ["web", "Next.js production build", "3000"],
            ["api", "Express API with /health check", "4001"],
            ["worker", "BullMQ consumer for runs, tools and evals", "—"],
            ["postgres", "pgvector/pgvector:pg16", "5433"],
            ["redis", "redis:7-alpine", "6379"],
            ["prometheus · grafana · loki · promtail", "Observability bundle", "9090 · 3001 · 3100"],
          ]}
        />
        <Code
          lang="bash"
          code={`docker compose up -d --build
docker compose ps       # everything healthy?
docker compose logs -f worker`}
        />

        <H>Environment variables</H>
        <Table
          head={["Variable", "Notes"]}
          rows={[
            ["DATABASE_URL", "Postgres connection string, include ?schema=public"],
            ["REDIS_URL", "Shared by the queue, cache and rate limiter"],
            ["NEXT_PUBLIC_API_URL", "Baked into the browser bundle at build time"],
            ["CORS_ORIGIN", "Comma-separated allowed origins — the web origin only"],
            ["OLLAMA_URL / OLLAMA_MODEL", "Local provider; default model is qwen2.5-coder:3b-instruct-q4_K_M"],
            ["OMNIROUTE_URL / OMNIROUTE_MODEL", "Cloud provider, if you use it"],
            ["RATE_LIMIT_MAX / _WINDOW_MS", "Defaults: 100 requests per 60s"],
            ["SESSION_EXPIRES_DAYS", "Session lifetime, default 30 days"],
          ]}
        />

        <H>Scaling out</H>
        <Bullets
          items={[
            <>Run more worker replicas — they are stateless and compete on the queue.</>,
            <>Put the API behind a load balancer; it holds no in-process job state.</>,
            <>Move Postgres to a primary + replica setup and Redis to a managed HA tier.</>,
            <>Keep Grafana alerts on queue depth, failure rate and p95 latency.</>,
          ]}
        />

        <H>Production checklist</H>
        <Bullets
          items={[
            <>Rotate every secret in .env and store them in a secret manager.</>,
            <>Force HTTPS and set COOKIE_SAME_SITE accordingly (SameSite=None requires TLS).</>,
            <>Restrict CORS_ORIGIN to the exact origins you serve.</>,
            <>Gate every tool with write semantics behind an approval policy.</>,
            <>Back up Postgres and test a restore before you need one.</>,
            <>Point /health and /ready at your orchestrator&rsquo;s probes.</>,
          ]}
        />
      </>
    ),
  },
  {
    id: "api",
    title: "API reference",
    kicker: "Every endpoint, with the shape of a real call",
    icon: Braces,
    group: "Reference",
    toc: ["Base URL & auth", "Error envelope", "Control plane", "Approvals, knowledge, evaluations", "Account & runtime", "Limits"],
    keywords: "api reference http endpoints rest curl errors rate limit base url",
    body: (
      <>
        <Lead>
          Everything the dashboard does is available over HTTP. The API is
          REST-ish JSON: predictable paths, Zod-validated bodies, and errors
          that always come back in the same envelope.
        </Lead>

        <H>Base URL &amp; auth</H>
        <Code
          lang="bash"
          code={`Base URL   https://ryuksaidso.faizcasm.me/api

# browser: HTTP-only session cookie (plus x-csrf-token on writes)
# machine: Authorization: Bearer rsk_live_...`}
        />

        <H>Error envelope</H>
        <Code
          lang="json"
          code={`{
  "error": "ValidationError",
  "message": "prompt: Required",
  "issues": [ { "path": "prompt", "message": "Required" } ]
}`}
        />
        <Bullets
          items={[
            <><code>400</code> — validation failed; <code>issues</code> lists the fields.</>,
            <><code>401</code> — missing or expired credentials.</>,
            <><code>403</code> — authenticated, but your role is not allowed.</>,
            <><code>404</code> — not found, or not visible in your workspace.</>,
            <><code>429</code> — rate limited; retry after the window resets.</>,
          ]}
        />

        <H>Control plane</H>
        <Endpoints
          items={[
            ["GET", "/control/dashboard", "24h metrics, projects, agents, latest runs"],
            ["GET", "/control/projects", "List projects"],
            ["POST", "/control/projects", "Create a project"],
            ["PATCH", "/control/projects/:id", "Update a project"],
            ["GET", "/control/agents", "List agents with versions"],
            ["POST", "/control/agents", "Create an agent draft"],
            ["PATCH", "/control/agents/:id", "Update draft, toggle enabled"],
            ["POST", "/control/agents/:id/versions", "Publish an immutable version"],
            ["GET", "/control/runs", "List runs (?limit=… )"],
            ["GET", "/control/runs/:id", "Full trace: steps and approvals"],
            ["POST", "/control/runs", "Queue a run"],
            ["POST", "/control/runs/:id/retry", "Retry as a new run"],
            ["GET", "/control/policies", "List policies"],
            ["POST", "/control/policies", "Create a policy"],
            ["PATCH", "/control/policies/:id", "Enable, disable or edit"],
          ]}
        />

        <H>Approvals, knowledge, evaluations</H>
        <Endpoints
          items={[
            ["GET", "/approvals", "Pending decisions for your workspace"],
            ["POST", "/approvals/:id/decision", "Approve or reject { approved: boolean }"],
            ["GET", "/documents", "Knowledge documents"],
            ["POST", "/documents", "Add a document"],
            ["GET", "/evaluations", "Evaluation history"],
            ["POST", "/evaluations", "Run a dataset against an agent"],
          ]}
        />

        <H>Account &amp; runtime</H>
        <Endpoints
          items={[
            ["GET", "/profile", "Your profile"],
            ["PATCH", "/profile", "Update profile, theme, timezone"],
            ["GET", "/organization", "Workspace details"],
            ["GET", "/members", "Workspace members"],
            ["GET", "/api-keys", "List keys (never returns secrets)"],
            ["POST", "/api-keys", "Mint a key — secret shown once"],
            ["DELETE", "/api-keys/:id", "Revoke a key"],
            ["GET", "/audit", "Audit history"],
            ["GET", "/health", "Liveness, at the API root"],
            ["GET", "/ready", "Dependency readiness, at the API root"],
            ["GET", "/metrics", "Prometheus metrics, at the API root"],
          ]}
        />

        <H>Limits</H>
        <Bullets
          items={[
            <>100 requests per minute per client by default (RATE_LIMIT_MAX / RATE_LIMIT_WINDOW_MS).</>,
            <>Request bodies are capped at 1 MB; URL-encoded bodies at 100 KB.</>,
            <>Every response carries an <code>x-request-id</code> — quote it in bug reports.</>,
          ]}
        />
      </>
    ),
  },
  {
    id: "playground",
    title: "Playground guide",
    kicker: "The interactive demo, and what it proves",
    icon: Play,
    group: "Reference",
    toc: [
      "Where it lives",
      "What you can do",
      "How the simulation works",
      "What it demonstrates",
    ],
    keywords:
      "playground demo live run trace gate approval eval simulation interactive homepage",
    body: (
      <>
        <Lead>
          The playground is a self-contained simulation of the control plane you
          can try without an account. You queue a run, watch its trace stream in
          step by step, get stopped at an approval gate, and decide what happens
          next — the same loop operators run every day.
        </Lead>

        <H>Where it lives</H>
        <Bullets
          items={[
            <>Reach it from the homepage: header nav, the hero CTA and the Explore card all lead to <code>/playground</code>.</>,
            <>It is intentionally <b>not</b> in the dashboard — the control plane is for operating agents, not for demos.</>,
            <>Everything runs in your browser: no account, no API keys, no network calls.</>,
          ]}
        />

        <H>What you can do</H>
        <Steps
          items={[
            { title: "Queue a run", body: "Kick off a triage-agent run, or pick a completed or failed sample run from the rail." },
            { title: "Watch the trace stream", body: "Planner, tool calls and synthesis appear in order with timings, token counts and expandable payloads." },
            { title: "Decide at the gate", body: "The write to ticket #4821 is held by policy. Approve it and the run continues; reject it and the run fails with ApprovalRejected." },
            { title: "Read the evidence", body: "A completed run is scored against its regression suite — the record you pin a version with." },
          ]}
        />
        <div className="dx-inline-cta">
          <Link href="/playground" className="dx-btn primary">
            Open the playground <ArrowRight size={14} />
          </Link>
        </div>

        <H>How the simulation works</H>
        <Bullets
          items={[
            <>Steps are scripted and deterministic — replay produces the same trace every time, with a 1× / 2× playback toggle.</>,
            <>The gate is simulated in execution but real in behaviour: your decision changes the outcome exactly as it would in production.</>,
            <>Nothing is stored or sent anywhere; reload the page and it starts over.</>,
          ]}
        />
        <Callout tone="tip" title="Why a simulation?">
          A demo that depends on a live model, a microphone or a third-party
          service fails at the worst possible moment. This one cannot — it is
          the product&rsquo;s core loop with the variability removed.
        </Callout>

        <H>What it demonstrates</H>
        <Cards
          items={[
            { title: "Durable traces", text: "Every step stored with timing, tokens and payloads — replayable exactly as it happened." },
            { title: "Human gates", text: "Risky tool calls wait for a person instead of failing silently, and the decision lands in the audit trail." },
            { title: "Evidence", text: "Completion produces a score against your suite, which is what gates a version from staging to production." },
          ]}
        />
      </>
    ),
  },
  {
    id: "faq",
    title: "Troubleshooting & FAQ",
    kicker: "The things that bite people on day one",
    icon: LifeBuoy,
    group: "Reference",
    toc: ["Common problems", "Good questions"],
    keywords: "faq troubleshooting help errors stuck broken problems 503 cors rate limit",
    body: (
      <>
        <Lead>
          Most problems land in one of four buckets: a dependency is down, the
          worker is not running, CORS is blocking the browser, or you are being
          rate limited. Here is how to rule each one out quickly.
        </Lead>

        <H>Common problems</H>

        <details className="dx-faq" open>
          <summary>Runs stay QUEUED forever</summary>
          <p>
            The API accepted the run but no worker is consuming the queue. Check{" "}
            <code>docker compose ps</code> for the worker container and read{" "}
            <code>docker compose logs -f worker</code>. Redis being down has the
            same symptom.
          </p>
        </details>

        <details className="dx-faq">
          <summary>/ready returns 503</summary>
          <p>
            Postgres and Redis are reachable — no LLM provider is. Run{" "}
            <code>ollama serve</code> and confirm OLLAMA_URL, or configure the
            OmniRoute variables, then restart the API.
          </p>
        </details>

        <details className="dx-faq">
          <summary>The browser reports CORS errors</summary>
          <p>
            CORS_ORIGIN must list the exact web origin (default
            http://localhost:3000 locally, https://ryuksaidso.faizcasm.me in
            production) with no trailing slash. After changing it,
            restart the API container — it is read at boot.
          </p>
        </details>

        <details className="dx-faq">
          <summary>I get 429 RateLimitExceeded</summary>
          <p>
            The default is 100 requests per minute per client. Back off and
            retry, or raise RATE_LIMIT_MAX and RATE_LIMIT_WINDOW_MS for your
            environment. Automated clients should use an API key.
          </p>
        </details>

        <details className="dx-faq">
          <summary>An approval never resolves</summary>
          <p>
            Approvals stay PENDING until decided or revoked. Open Approvals in
            the dashboard — the badge in the sidebar shows how many are waiting —
            and decide, or reject to fail the run cleanly instead of leaving it
            parked.
          </p>
        </details>

        <details className="dx-faq">
          <summary>Password reset email never arrives</summary>
          <p>
            With SMTP blank the API runs in dev mode and logs the reset URL
            instead of sending it. Read <code>docker compose logs -f api</code>{" "}
            and follow the link from there.
          </p>
        </details>

        <H>Good questions</H>

        <details className="dx-faq">
          <summary>Where does my data live?</summary>
          <p>
            In your Postgres instance, scoped by organization id on every table.
            Nothing is sent anywhere except to the LLM provider you selected for
            inference.
          </p>
        </details>

        <details className="dx-faq">
          <summary>Can I swap models without changing agents?</summary>
          <p>
            Yes. Settings → LLM switches provider and model workspace-wide;
            agents reference the active provider at run time, and the run records
            which provider and model actually answered.
          </p>
        </details>

        <details className="dx-faq">
          <summary>Do retries overwrite history?</summary>
          <p>
            Never. A retry creates a new run linked to the original, so the
            failing trace stays available as evidence.
          </p>
        </details>

        <details className="dx-faq">
          <summary>Is there a way to try it without signing up?</summary>
          <p>
            Yes — the <Link href="/playground">live playground</Link> and the{" "}
            <Link href="/architecture">3D architecture map</Link> are both open.
          </p>
        </details>

        <Callout tone="tip" title="Still stuck?">
          Grab the <code>x-request-id</code> from the failed response and the
          matching line from the API logs — that pair identifies the exact
          request across every service.
        </Callout>
      </>
    ),
  },
];

const GROUPS = Array.from(new Set(SECTIONS.map(s => s.group)));

export default function DocsPage() {
  const [active, setActive] = useState(SECTIONS[0].id);
  const [activeToc, setActiveToc] = useState("");
  const [query, setQuery] = useState("");
  const [navOpen, setNavOpen] = useState(false);
  const [progress, setProgress] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const index = Math.max(
    0,
    SECTIONS.findIndex(s => s.id === active),
  );
  const current = SECTIONS[index];
  const prev = SECTIONS[index - 1];
  const next = SECTIONS[index + 1];

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return SECTIONS;
    return SECTIONS.filter(s =>
      `${s.title} ${s.kicker} ${s.group} ${s.keywords}`.toLowerCase().includes(q),
    );
  }, [query]);

  const go = (id: string) => {
    setActive(id);
    setActiveToc("");
    setNavOpen(false);
    setQuery("");
    window.scrollTo({ top: 0, behavior: "auto" });
  };

  const jump = (label: string) => {
    const el = document.getElementById(slug(label));
    if (!el) return;
    const y = el.getBoundingClientRect().top + window.scrollY - 96;
    window.scrollTo({ top: y, behavior: "smooth" });
  };

  useEffect(() => {
    const id = window.location.hash.replace("#", "");
    if (!id || !SECTIONS.some(s => s.id === id)) return;
    setActive(id);
    setActiveToc("");
    window.scrollTo({ top: 0, behavior: "auto" });
  }, []);

  useEffect(() => {
    const onScroll = () => {
      const h = document.documentElement;
      const max = h.scrollHeight - h.clientHeight;
      setProgress(max > 0 ? (h.scrollTop / max) * 100 : 0);
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, []);

  useEffect(() => {
    const ids = current.toc.map(slug);
    const onScroll = () => {
      let found = "";
      for (const id of ids) {
        const el = document.getElementById(id);
        if (el && el.getBoundingClientRect().top <= 140) found = id;
      }
      setActiveToc(found);
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [current]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (document.activeElement as HTMLElement | null)?.tagName;
      if (e.key === "/" && tag !== "INPUT" && tag !== "TEXTAREA") {
        e.preventDefault();
        inputRef.current?.focus();
      }
      if (e.key === "Escape") setNavOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className="dx">
      <div className="dx-progress" style={{ width: `${progress}%` }} />

      <header className="dx-header">
        <Link href="/" className="dx-brand">
          <span className="dx-mark">
            <Image src={icon} alt="" width={22} height={22} />
          </span>
          <span className="dx-brand-copy">
            <b>RYUKSAIDSO</b>
            <small>documentation</small>
          </span>
        </Link>

        <div className="dx-search">
          <Search size={14} />
          <input
            ref={inputRef}
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={e => {
              if (e.key === "Enter" && filtered[0]) go(filtered[0].id);
            }}
            placeholder="Search the docs…"
            aria-label="Search documentation"
          />
          <kbd>/</kbd>
        </div>

        <nav className="dx-actions">
          <Link href="/architecture">Architecture</Link>
          <Link href="/playground">Live playground</Link>
          <Link href="/" className="dx-btn">
            <Home size={14} />
            Home
          </Link>
          <button
            type="button"
            className="dx-menu"
            onClick={() => setNavOpen(x => !x)}
            aria-label="Toggle navigation"
          >
            {navOpen ? <X size={18} /> : <Menu size={18} />}
          </button>
        </nav>
      </header>

      <div className="dx-body">
        <aside className={`dx-nav ${navOpen ? "open" : ""}`}>
          <div className="dx-nav-scroll">
            {GROUPS.map(group => {
              const items = filtered.filter(s => s.group === group);
              if (!items.length) return null;
              return (
                <div className="dx-group-block" key={group}>
                  <span className="dx-group-label">{group}</span>
                  {items.map(s => (
                    <button
                      key={s.id}
                      type="button"
                      className={s.id === active ? "active" : ""}
                      onClick={() => go(s.id)}
                    >
                      <s.icon size={15} />
                      <span>{s.title}</span>
                      {s.id === active ? <ChevronRight size={14} /> : null}
                    </button>
                  ))}
                </div>
              );
            })}

            {!filtered.length && (
              <p className="dx-noresults">
                Nothing matches “{query}”. Try “runs”, “approval” or “api”.
              </p>
            )}
          </div>

          <div className="dx-nav-foot">
            <Link href="/architecture">
              <Layers3 size={14} /> 3D architecture
            </Link>
            <Link href="/playground">
              <Play size={14} /> Live playground
            </Link>
            <a
              href="https://faizcasm.me"
              target="_blank"
              rel="noopener noreferrer"
            >
              <ExternalLink size={14} /> Faizan Hameed
            </a>
          </div>
        </aside>

        <main className="dx-main">
          <div className="dx-hero">
            <span className="dx-eyebrow">
              <Sparkles size={11} /> {current.group}
            </span>
            <div className="dx-title">
              <span className="dx-title-icon">
                <current.icon size={19} />
              </span>
              <h1>{current.title}</h1>
            </div>
            <p>{current.kicker}</p>
            <div className="dx-meta">
              <span>v2.0.0</span>
              <span>Updated Sep 25, 2026</span>
              <span>{current.toc.length} headings</span>
            </div>
          </div>

          <article className="dx-content">{current.body}</article>

          <nav className="dx-pager">
            {prev ? (
              <button type="button" onClick={() => go(prev.id)}>
                <ArrowLeft size={14} />
                <span>
                  <small>Previous</small>
                  <b>{prev.title}</b>
                </span>
              </button>
            ) : (
              <span />
            )}
            {next ? (
              <button type="button" className="next" onClick={() => go(next.id)}>
                <span>
                  <small>Next</small>
                  <b>{next.title}</b>
                </span>
                <ArrowRight size={14} />
              </button>
            ) : (
              <span />
            )}
          </nav>

          <footer className="dx-foot">
            <BookOpen size={14} />
            <span>
              RYUKSAIDSO docs · built for people who ship agents for a living
            </span>
          </footer>
        </main>

        <aside className="dx-toc">
          <span>On this page</span>
          {current.toc.map(t => (
            <button
              key={t}
              type="button"
              className={activeToc === slug(t) ? "active" : ""}
              onClick={() => jump(t)}
            >
              {t}
            </button>
          ))}
          <div className="dx-toc-hr" />
          <button type="button" className="dx-toc-top" onClick={() => go(SECTIONS[0].id)}>
            Back to top
          </button>
        </aside>
      </div>

      <style jsx global>{`
        .dx {
          min-height: 100vh;
          background:
            radial-gradient(1100px 500px at 50% -10%, rgba(139, 92, 246, 0.12), transparent 65%),
            var(--bg, #080a0f);
          color: var(--text);
        }
        .dx-progress {
          position: fixed;
          top: 0;
          left: 0;
          height: 2px;
          z-index: 60;
          background: linear-gradient(90deg, #8b5cf6, #22d3ee);
          box-shadow: 0 0 12px rgba(139, 92, 246, 0.7);
          transition: width 0.15s linear;
        }

        .dx-header {
          position: sticky;
          top: 0;
          z-index: 50;
          display: flex;
          align-items: center;
          gap: 18px;
          padding: 12px 22px;
          border-bottom: 1px solid var(--line);
          background: rgba(8, 10, 15, 0.85);
          backdrop-filter: blur(14px);
        }
        .dx-brand {
          display: flex;
          align-items: center;
          gap: 10px;
          text-decoration: none;
          color: inherit;
          flex-shrink: 0;
        }
        .dx-mark {
          width: 32px;
          height: 32px;
          border-radius: 10px;
          display: grid;
          place-items: center;
          background: linear-gradient(145deg, #8b5cf6, #3b82f6);
          box-shadow: 0 0 24px rgba(139, 92, 246, 0.4);
        }
        .dx-brand-copy b {
          display: block;
          font-size: 11.5px;
          letter-spacing: 0.18em;
        }
        .dx-brand-copy small {
          display: block;
          font-size: 9px;
          letter-spacing: 0.14em;
          text-transform: uppercase;
          color: var(--muted);
          margin-top: 1px;
        }

        .dx-search {
          display: flex;
          align-items: center;
          gap: 9px;
          flex: 1;
          max-width: 420px;
          margin: 0 auto;
          padding: 8px 12px;
          border: 1px solid var(--line);
          border-radius: 11px;
          background: rgba(255, 255, 255, 0.04);
          color: var(--muted);
          transition: border-color 0.2s, box-shadow 0.2s;
        }
        .dx-search:focus-within {
          border-color: rgba(139, 92, 246, 0.55);
          box-shadow: 0 0 0 3px rgba(139, 92, 246, 0.14);
          color: var(--text);
        }
        .dx-search input {
          flex: 1;
          min-width: 0;
          background: transparent;
          border: none;
          outline: none;
          color: var(--text);
          font-size: 13px;
          font-family: inherit;
        }
        .dx-search input::placeholder {
          color: var(--muted);
        }
        .dx-search kbd {
          font-size: 10px;
          font-family: inherit;
          color: var(--muted);
          border: 1px solid var(--line);
          border-radius: 5px;
          padding: 2px 6px;
          background: rgba(255, 255, 255, 0.05);
        }

        .dx-actions {
          display: flex;
          align-items: center;
          gap: 16px;
          flex-shrink: 0;
        }
        .dx-actions > a {
          font-size: 12px;
          color: var(--muted);
          text-decoration: none;
          transition: color 0.2s;
        }
        .dx-actions > a:hover {
          color: var(--text);
        }
        .dx-btn {
          display: inline-flex;
          align-items: center;
          gap: 7px;
          padding: 8px 14px;
          border: 1px solid var(--line);
          border-radius: 10px;
          font-size: 12px;
          font-weight: 700;
          color: var(--text) !important;
          background: rgba(255, 255, 255, 0.05);
          text-decoration: none;
          transition: all 0.2s;
        }
        .dx-btn:hover {
          border-color: rgba(139, 92, 246, 0.5);
          background: rgba(139, 92, 246, 0.14);
        }
        .dx-btn.primary {
          color: #fff !important;
          background: linear-gradient(135deg, #8b5cf6, #4f46e5);
          border-color: transparent;
          box-shadow: 0 8px 26px rgba(79, 70, 229, 0.35);
        }
        .dx-menu {
          display: none;
          border: 1px solid var(--line);
          background: transparent;
          color: var(--text);
          border-radius: 9px;
          padding: 7px;
          cursor: pointer;
        }

        .dx-body {
          display: grid;
          grid-template-columns: 264px minmax(0, 1fr) 208px;
          gap: 0;
          max-width: 1480px;
          margin: 0 auto;
        }

        .dx-nav {
          position: sticky;
          top: 57px;
          align-self: start;
          height: calc(100vh - 57px);
          display: flex;
          flex-direction: column;
          border-right: 1px solid var(--line);
          padding: 22px 0 0;
        }
        .dx-nav-scroll {
          flex: 1;
          overflow-y: auto;
          padding: 0 14px 16px;
        }
        .dx-group-block + .dx-group-block {
          margin-top: 22px;
        }
        .dx-group-label {
          display: block;
          font-size: 9.5px;
          font-weight: 800;
          letter-spacing: 0.18em;
          text-transform: uppercase;
          color: var(--muted);
          padding: 0 10px 8px;
        }
        .dx-nav-scroll button {
          width: 100%;
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 9px 11px;
          border: 1px solid transparent;
          border-radius: 10px;
          background: transparent;
          color: var(--muted);
          font-size: 12.5px;
          font-family: inherit;
          text-align: left;
          cursor: pointer;
          transition: all 0.18s ease;
        }
        .dx-nav-scroll button span {
          flex: 1;
        }
        .dx-nav-scroll button svg {
          flex-shrink: 0;
          opacity: 0.85;
        }
        .dx-nav-scroll button:hover {
          background: rgba(255, 255, 255, 0.05);
          color: var(--text);
        }
        .dx-nav-scroll button.active {
          background: linear-gradient(90deg, rgba(139, 92, 246, 0.22), transparent);
          border-color: rgba(139, 92, 246, 0.35);
          color: var(--text);
        }
        .dx-nav-scroll button.active svg:last-child {
          color: #a78bfa;
        }
        .dx-noresults {
          font-size: 12px;
          line-height: 1.6;
          color: var(--muted);
          padding: 12px 10px;
          border: 1px dashed var(--line);
          border-radius: 10px;
        }
        .dx-nav-foot {
          display: flex;
          flex-direction: column;
          gap: 4px;
          padding: 12px 14px 16px;
          border-top: 1px solid var(--line);
        }
        .dx-nav-foot a {
          display: flex;
          align-items: center;
          gap: 9px;
          padding: 8px 10px;
          border-radius: 9px;
          font-size: 12px;
          color: var(--muted);
          text-decoration: none;
          transition: all 0.18s;
        }
        .dx-nav-foot a:hover {
          background: rgba(255, 255, 255, 0.05);
          color: var(--text);
        }
        .dx-main {
          padding: 34px 42px 70px;
          min-width: 0;
        }
        .dx-hero {
          padding-bottom: 26px;
          border-bottom: 1px solid var(--line);
          margin-bottom: 30px;
        }
        .dx-eyebrow {
          display: inline-flex;
          align-items: center;
          gap: 7px;
          font-size: 9.5px;
          font-weight: 800;
          letter-spacing: 0.18em;
          text-transform: uppercase;
          color: #b7c0d0;
          border: 1px solid var(--line);
          background: rgba(255, 255, 255, 0.04);
          border-radius: 99px;
          padding: 6px 12px;
        }
        .dx-eyebrow svg {
          color: #a78bfa;
        }
        .dx-title {
          display: flex;
          align-items: center;
          gap: 14px;
          margin: 18px 0 8px;
        }
        .dx-title-icon {
          width: 44px;
          height: 44px;
          border-radius: 13px;
          display: grid;
          place-items: center;
          color: #c4b5fd;
          background: rgba(139, 92, 246, 0.14);
          border: 1px solid rgba(139, 92, 246, 0.28);
          flex-shrink: 0;
        }
        .dx-title h1 {
          margin: 0;
          font-size: clamp(26px, 3.4vw, 36px);
          letter-spacing: -0.035em;
        }
        .dx-hero > p {
          margin: 0;
          font-size: 14px;
          color: var(--muted);
          line-height: 1.6;
        }
        .dx-meta {
          display: flex;
          gap: 8px;
          flex-wrap: wrap;
          margin-top: 16px;
        }
        .dx-meta span {
          font-size: 10.5px;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          color: var(--muted);
          border: 1px solid var(--line);
          border-radius: 99px;
          padding: 5px 11px;
          background: rgba(255, 255, 255, 0.03);
        }

        .dx-content {
          max-width: 780px;
          display: grid;
          gap: 26px;
        }
        .dx-lead {
          margin: 0;
          font-size: 15.5px;
          line-height: 1.75;
          color: var(--text);
          border-left: 3px solid rgba(139, 92, 246, 0.65);
          padding-left: 18px;
        }
        .dx-h3 {
          margin: 14px 0 -6px;
          font-size: 19px;
          letter-spacing: -0.02em;
          scroll-margin-top: 96px;
        }
        .dx-content p {
          margin: 0;
          font-size: 14px;
          line-height: 1.75;
          color: var(--muted);
        }
        .dx-content b {
          color: var(--text);
        }
        .dx-content code {
          font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
          font-size: 0.9em;
          color: #c4b5fd;
          background: rgba(139, 92, 246, 0.12);
          border: 1px solid rgba(139, 92, 246, 0.2);
          border-radius: 6px;
          padding: 1px 6px;
        }

        .dx-bullets {
          margin: 0;
          padding-left: 4px;
          list-style: none;
          display: grid;
          gap: 11px;
        }
        .dx-bullets li {
          position: relative;
          padding-left: 26px;
          font-size: 14px;
          line-height: 1.7;
          color: var(--muted);
        }
        .dx-bullets li::before {
          content: "";
          position: absolute;
          left: 4px;
          top: 10px;
          width: 7px;
          height: 7px;
          border-radius: 2px;
          background: linear-gradient(135deg, #8b5cf6, #22d3ee);
        }

        .dx-steps {
          margin: 0;
          padding: 0;
          list-style: none;
          display: grid;
          gap: 12px;
          counter-reset: step;
        }
        .dx-steps li {
          display: grid;
          grid-template-columns: 30px 1fr;
          gap: 14px;
          align-items: start;
          border: 1px solid var(--line);
          border-radius: 14px;
          padding: 15px 17px;
          background: rgba(255, 255, 255, 0.03);
        }
        .dx-step-num {
          width: 30px;
          height: 30px;
          border-radius: 50%;
          display: grid;
          place-items: center;
          font-size: 12px;
          font-weight: 800;
          color: #06070c;
          background: linear-gradient(135deg, #8b5cf6, #22d3ee);
        }
        .dx-steps b {
          display: block;
          font-size: 14px;
          margin-bottom: 4px;
        }
        .dx-steps p {
          font-size: 13px;
          line-height: 1.65;
        }

        .dx-table-wrap {
          border: 1px solid var(--line);
          border-radius: 14px;
          overflow-x: auto;
        }
        .dx-table {
          width: 100%;
          border-collapse: collapse;
          font-size: 13.5px;
        }
        .dx-table th {
          text-align: left;
          font-size: 10px;
          letter-spacing: 0.14em;
          text-transform: uppercase;
          color: var(--muted);
          background: rgba(255, 255, 255, 0.04);
          padding: 11px 15px;
          border-bottom: 1px solid var(--line);
          white-space: nowrap;
        }
        .dx-table td {
          padding: 12px 15px;
          border-bottom: 1px solid var(--line);
          color: var(--muted);
          line-height: 1.6;
          vertical-align: top;
        }
        .dx-table tr:last-child td {
          border-bottom: none;
        }
        .dx-table td:first-child {
          color: var(--text);
          font-weight: 600;
          white-space: nowrap;
        }

        .dx-cards {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 12px;
        }
        .dx-cards > div {
          border: 1px solid var(--line);
          border-radius: 14px;
          padding: 17px;
          background: linear-gradient(160deg, rgba(255, 255, 255, 0.045), rgba(255, 255, 255, 0.015));
          transition: border-color 0.2s, transform 0.2s;
        }
        .dx-cards > div:hover {
          border-color: rgba(139, 92, 246, 0.4);
          transform: translateY(-3px);
        }
        .dx-cards b {
          display: block;
          font-size: 14px;
          margin-bottom: 6px;
        }
        .dx-cards p {
          font-size: 13px;
          line-height: 1.65;
        }

        .dx-endpoints {
          display: grid;
          gap: 8px;
        }
        .dx-endpoints > div {
          display: grid;
          grid-template-columns: 58px minmax(0, auto) 1fr;
          gap: 14px;
          align-items: center;
          border: 1px solid var(--line);
          border-radius: 12px;
          padding: 11px 14px;
          background: rgba(255, 255, 255, 0.03);
        }
        .dx-endpoints code {
          background: none !important;
          border: none !important;
          padding: 0 !important;
          color: var(--text) !important;
          font-size: 12.5px !important;
        }
        .dx-method {
          font-size: 9.5px;
          font-weight: 800;
          letter-spacing: 0.1em;
          text-align: center;
          border-radius: 6px;
          padding: 4px 0;
          border: 1px solid;
        }
        .dx-method.get {
          color: #7dd3fc;
          background: rgba(14, 165, 233, 0.12);
          border-color: rgba(14, 165, 233, 0.3);
        }
        .dx-method.post {
          color: #6ee7b7;
          background: rgba(16, 185, 129, 0.12);
          border-color: rgba(16, 185, 129, 0.3);
        }
        .dx-method.patch,
        .dx-method.put {
          color: #fcd34d;
          background: rgba(245, 158, 11, 0.12);
          border-color: rgba(245, 158, 11, 0.3);
        }
        .dx-method.delete {
          color: #fda4af;
          background: rgba(244, 63, 94, 0.12);
          border-color: rgba(244, 63, 94, 0.3);
        }
        .dx-ep-desc {
          font-size: 12.5px;
          color: var(--muted);
          line-height: 1.55;
        }

        .dx-code {
          border: 1px solid var(--line);
          border-radius: 14px;
          overflow: hidden;
          background: #0a0d12;
        }
        .dx-code-head {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
          padding: 9px 14px;
          border-bottom: 1px solid var(--line);
          background: rgba(255, 255, 255, 0.03);
        }
        .dx-code-head > span {
          font-size: 10px;
          font-weight: 700;
          letter-spacing: 0.16em;
          text-transform: uppercase;
          color: var(--muted);
        }
        .dx-copy {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          font-size: 11px;
          font-weight: 700;
          font-family: inherit;
          color: var(--muted);
          background: rgba(255, 255, 255, 0.05);
          border: 1px solid var(--line);
          border-radius: 99px;
          padding: 4px 11px;
          cursor: pointer;
          transition: all 0.2s;
        }
        .dx-copy:hover {
          color: var(--text);
          border-color: rgba(139, 92, 246, 0.5);
          background: rgba(139, 92, 246, 0.14);
        }
        .dx-code pre {
          margin: 0;
          padding: 16px;
          overflow-x: auto;
          font-size: 12.5px;
          line-height: 1.75;
          color: #a8b5c7;
        }
        .dx-code pre code {
          background: none;
          border: none;
          padding: 0;
          color: inherit;
          font-size: inherit;
        }

        .dx-callout {
          border: 1px solid;
          border-radius: 14px;
          padding: 16px 18px;
          display: grid;
          gap: 7px;
        }
        .dx-callout b {
          font-size: 12.5px;
          letter-spacing: 0.02em;
        }
        .dx-callout > div {
          font-size: 13.5px;
          line-height: 1.7;
          color: var(--muted);
        }
        .dx-callout.note {
          border-color: rgba(139, 92, 246, 0.32);
          background: linear-gradient(120deg, rgba(139, 92, 246, 0.12), rgba(139, 92, 246, 0.03));
        }
        .dx-callout.note b {
          color: #c4b5fd;
        }
        .dx-callout.tip {
          border-color: rgba(34, 211, 238, 0.3);
          background: linear-gradient(120deg, rgba(34, 211, 238, 0.1), rgba(34, 211, 238, 0.02));
        }
        .dx-callout.tip b {
          color: #67e8f9;
        }
        .dx-callout.warn {
          border-color: rgba(245, 158, 11, 0.34);
          background: linear-gradient(120deg, rgba(245, 158, 11, 0.1), rgba(245, 158, 11, 0.02));
        }
        .dx-callout.warn b {
          color: #fcd34d;
        }

        .dx-faq {
          border: 1px solid var(--line);
          border-radius: 13px;
          background: rgba(255, 255, 255, 0.03);
          overflow: hidden;
        }
        .dx-faq summary {
          cursor: pointer;
          list-style: none;
          padding: 14px 44px 14px 17px;
          font-size: 14px;
          font-weight: 700;
          position: relative;
          transition: background 0.2s;
        }
        .dx-faq summary::-webkit-details-marker {
          display: none;
        }
        .dx-faq summary::after {
          content: "+";
          position: absolute;
          right: 17px;
          top: 50%;
          transform: translateY(-50%);
          font-size: 17px;
          color: #a78bfa;
          transition: transform 0.2s;
        }
        .dx-faq[open] summary::after {
          transform: translateY(-50%) rotate(45deg);
        }
        .dx-faq summary:hover {
          background: rgba(255, 255, 255, 0.04);
        }
        .dx-faq p {
          padding: 0 17px 16px;
          font-size: 13.5px;
        }
        .dx-faq a {
          color: #a78bfa;
        }

        .dx-inline-cta {
          display: flex;
        }

        .dx-pager {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 12px;
          margin-top: 44px;
          padding-top: 26px;
          border-top: 1px solid var(--line);
        }
        .dx-pager button {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 15px 17px;
          border: 1px solid var(--line);
          border-radius: 14px;
          background: rgba(255, 255, 255, 0.03);
          color: var(--text);
          font-family: inherit;
          cursor: pointer;
          transition: all 0.2s;
        }
        .dx-pager button:hover {
          border-color: rgba(139, 92, 246, 0.45);
          background: rgba(139, 92, 246, 0.1);
          transform: translateY(-2px);
        }
        .dx-pager button.next {
          justify-content: flex-end;
          text-align: right;
        }
        .dx-pager small {
          display: block;
          font-size: 10px;
          letter-spacing: 0.14em;
          text-transform: uppercase;
          color: var(--muted);
          margin-bottom: 3px;
        }
        .dx-pager b {
          font-size: 13.5px;
        }
        .dx-foot {
          display: flex;
          align-items: center;
          gap: 9px;
          margin-top: 30px;
          font-size: 11.5px;
          color: var(--muted);
        }
        .dx-foot svg {
          color: #a78bfa;
        }

        .dx-toc {
          position: sticky;
          top: 57px;
          align-self: start;
          height: calc(100vh - 57px);
          padding: 34px 20px;
          display: flex;
          flex-direction: column;
          gap: 3px;
          border-left: 1px solid var(--line);
        }
        .dx-toc > span {
          font-size: 9.5px;
          font-weight: 800;
          letter-spacing: 0.18em;
          text-transform: uppercase;
          color: var(--muted);
          margin-bottom: 9px;
        }
        .dx-toc button {
          text-align: left;
          border: none;
          background: transparent;
          color: var(--muted);
          font-size: 12px;
          font-family: inherit;
          line-height: 1.5;
          padding: 6px 0 6px 12px;
          border-left: 2px solid transparent;
          cursor: pointer;
          transition: color 0.18s, border-color 0.18s;
        }
        .dx-toc button:hover {
          color: var(--text);
        }
        .dx-toc button.active {
          color: #a78bfa;
          border-left-color: #8b5cf6;
        }
        .dx-toc-hr {
          height: 1px;
          background: var(--line);
          margin: 14px 0;
        }
        .dx-toc .dx-toc-top {
          padding-left: 0;
          border-left: none;
          font-weight: 700;
        }

        @media (max-width: 1180px) {
          .dx-body {
            grid-template-columns: 250px minmax(0, 1fr);
          }
          .dx-toc {
            display: none;
          }
        }
        @media (max-width: 940px) {
          .dx-body {
            grid-template-columns: minmax(0, 1fr);
          }
          .dx-nav {
            position: fixed;
            top: 57px;
            left: 0;
            width: 280px;
            z-index: 40;
            background: rgba(9, 11, 17, 0.98);
            transform: translateX(-100%);
            transition: transform 0.28s ease;
            box-shadow: 12px 0 40px rgba(0, 0, 0, 0.5);
          }
          .dx-nav.open {
            transform: translateX(0);
          }
          .dx-menu {
            display: grid;
            place-items: center;
          }
          .dx-actions > a {
            display: none;
          }
          .dx-search {
            margin: 0;
          }
          .dx-main {
            padding: 26px 22px 60px;
          }
        }
        @media (max-width: 640px) {
          .dx-brand-copy {
            display: none;
          }
          .dx-search kbd {
            display: none;
          }
          .dx-cards {
            grid-template-columns: 1fr;
          }
          .dx-endpoints > div {
            grid-template-columns: 58px 1fr;
            row-gap: 6px;
          }
          .dx-ep-desc {
            grid-column: 1 / -1;
          }
          .dx-pager {
            grid-template-columns: 1fr;
          }
          .dx-lead {
            font-size: 14.5px;
            padding-left: 14px;
          }
        }

        @media (prefers-reduced-motion: reduce) {
          .dx-progress,
          .dx-nav,
          .dx-cards > div,
          .dx-pager button {
            transition: none;
          }
        }

      `}</style>
    </div>
  );
}





