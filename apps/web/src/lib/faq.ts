export type FaqItem = {
  cat: string;
  q: string;
  a: string;
  link?: { label: string; href: string };
};

export const FAQ_CATEGORIES = [
  "Basics",
  "Features",
  "Agents & runs",
  "Integrations",
  "Models",
  "API & security",
  "Billing",
  "Support",
] as const;

export const FAQ_ITEMS: FaqItem[] = [
  {
    cat: "Basics",
    q: "What is RYUKSAIDSO?",
    a: "RYUKSAIDSO is the agent reliability and control plane for production AI agents. It gives you one workspace to plan, trace, approve, evaluate and roll back LLM agent runs — policy gates, durable traces, human-in-the-loop approvals and multi-provider failover in a single platform.",
    link: { label: "Read the docs", href: "/docs" },
  },
  {
    cat: "Basics",
    q: "Who is the founder and CEO of RYUKSAIDSO?",
    a: "Faizan Hameed — also known by his handle Faizcasm — is the founder and CEO of RYUKSAIDSO. You can reach him directly through the in-app support channel or at faizanhameed690@gmail.com.",
    link: { label: "Faizan Hameed on the web", href: "https://faizcasm.me" },
  },
  {
    cat: "Basics",
    q: "Who created RYUKSAIDSO?",
    a: "RYUKSAIDSO was created by Faizan Hameed, who designed and built the platform as the control plane he wished existed when shipping AI agents into production.",
  },
  {
    cat: "Basics",
    q: "What is the use of RYUKSAIDSO?",
    a: "It turns black-box agents into operating-grade software: every run is traced step by step, sensitive actions can require human approval, policies can gate tools, agent versions can be published and rolled back, outputs can be evaluated, and model failures fail over across providers automatically.",
  },
  {
    cat: "Basics",
    q: "Who is RYUKSAIDSO for?",
    a: "Developers, product teams and AI engineers who run LLM agents in production — customer support agents, knowledge and research agents, email triage, internal automation — and anyone who needs auditability, approvals and reliability instead of a demo that works on the happy path.",
  },
  {
    cat: "Basics",
    q: "Is RYUKSAIDSO an AI model?",
    a: "No. RYUKSAIDSO is a control plane, not a model. You bring the models: the built-in OmniRoute gateway, a local Ollama server, or your own custom OpenAI-compatible endpoints — RYUKSAIDSO orchestrates, observes and gates whatever runs underneath.",
  },
  {
    cat: "Basics",
    q: "What does the name RYUKSAIDSO mean?",
    a: "RYUKSAIDSO is the personal brand of founder Faizan Hameed (Faizcasm). The product carries that name end to end — opinionated by design, built from real production experience with AI agents.",
  },
  {
    cat: "Basics",
    q: "What can I build with RYUKSAIDSO?",
    a: "Customer-facing support agents with an embeddable chat widget, internal knowledge agents over GitHub/Drive/Notion, email agents over Gmail/Outlook, workflow agents wired to Slack, Jira, Linear, HubSpot and more — with traces, approvals and evaluations applied to all of them.",
  },
  {
    cat: "Basics",
    q: "Is there a free plan?",
    a: "Yes. RYUKSAIDSO has a free tier alongside paid Starter, Pro and Business plans, billed monthly or yearly.",
    link: { label: "See pricing", href: "/pricing" },
  },
  {
    cat: "Features",
    q: "What is a trace?",
    a: "A trace is the complete, step-by-step record of one agent run: inputs, reasoning steps, tool calls, outputs, tokens, latency and status. Traces stream live while the run executes, so you can follow the agent in real time — not just inspect it afterwards.",
  },
  {
    cat: "Features",
    q: "What are human approvals?",
    a: "Runs that touch sensitive tools can pause in WAITING_APPROVAL state. An OWNER or ADMIN reviews the exact action from the Approvals tab and approves or rejects it. Every decision is recorded in the audit log.",
  },
  {
    cat: "Features",
    q: "What are policies?",
    a: "Policies are deployment-level rules that decide what agents and tools are allowed to do. When policy enforcement is enabled on a deployment, policy decisions gate tool calls and surface in run traces.",
  },
  {
    cat: "Features",
    q: "Can I roll back agent changes?",
    a: "Yes. Agents are versioned — every change creates an agent version you can diff, publish or revert. Rolling back restores the previous instructions, model and tool configuration instantly.",
  },
  {
    cat: "Features",
    q: "What are evaluations?",
    a: "Evaluations are automated quality checks that score agent outputs against your criteria, so you can catch regressions after prompt, model or tool changes — before your users do.",
  },
  {
    cat: "Features",
    q: "What is tool governance?",
    a: "Every agent tool in the 46-tool registry passes through governance: system-admin-only tool gating, SQL and file-system guards, secret redaction, approval flags on dangerous operations and search filters — so an agent can never quietly do something it shouldn't.",
  },
  {
    cat: "Features",
    q: "What observability features are included?",
    a: "Prometheus metrics at /metrics, structured request logs, a recent-errors view, backend health for LLM providers, and an Admin dashboard with run series, status mixes, top agents and audit streams. Prometheus and Loki can be connected for deeper dashboards.",
  },
  {
    cat: "Features",
    q: "What does the dashboard show?",
    a: "Workspace health at a glance: run activity over time, token consumption, status mixes, top agents, recent approvals, integrations status — plus system-wide metrics for platform admins.",
  },
  {
    cat: "Features",
    q: "Is there a playground?",
    a: "Yes. The playground is a sandbox for trying an agent end to end without touching production workflows — ideal for iterating on prompts before wiring an agent into real traffic.",
    link: { label: "Open the playground", href: "/playground" },
  },
  {
    cat: "Features",
    q: "Does RYUKSAIDSO stream traces live?",
    a: "Yes — traces stream as the run executes, step by step, so you can watch tool calls and outputs appear in real time and stop a bad run early instead of discovering it after completion.",
  },
  {
    cat: "Agents & runs",
    q: "What is an agent?",
    a: "An agent is a versioned bundle: instructions (prompt), model configuration, tool access and its project context. Agents live inside projects in your workspace and every edit creates a new version.",
  },
  {
    cat: "Agents & runs",
    q: "What is an agent run?",
    a: "A run is a single execution of an agent. It moves through statuses — QUEUED, RUNNING, WAITING_APPROVAL, COMPLETED or FAILED — and carries a full trace with every step, tool call, token count and latency measurement.",
  },
  {
    cat: "Agents & runs",
    q: "Do runs survive restarts or downtime?",
    a: "Yes. Runs are enqueued in a durable Redis-backed queue and processed by a background worker, so nothing is lost if a process restarts mid-flight.",
  },
  {
    cat: "Agents & runs",
    q: "What happens when a model provider fails?",
    a: "Chat and agent runs use fallback ordering — your workspace's custom provider first, then the OmniRoute gateway, then Ollama. Failures carry a clear reason (for example HTTP 401 or a timeout) so you can see exactly why a provider was skipped.",
  },
  {
    cat: "Agents & runs",
    q: "How do agents use my own documents?",
    a: "Connect a knowledge source (GitHub repo, Google Drive folder, Notion database) and sync turns its files into chunked documents your agents can search — retrieval-augmented generation on your own material.",
  },
  {
    cat: "Agents & runs",
    q: "What collaboration roles exist?",
    a: "Workspace roles are OWNER, ADMIN, AGENT and VIEWER, enforced server-side on every route. Platform operators can additionally hold a system-wide ADMIN role for cross-workspace administration.",
    link: { label: "RBAC details", href: "/docs" },
  },
  {
    cat: "Agents & runs",
    q: "Can agents call external APIs?",
    a: "Yes — through governed tools: HTTP, code execution, database queries and provider-specific tools (Gmail, Jira, Linear…). Dangerous operations can be flagged to require approval first.",
  },
  {
    cat: "Agents & runs",
    q: "How do projects and workspaces relate?",
    a: "Each account belongs to a workspace (organization) with its own members, agents, projects and billing. Projects group related agents inside a workspace, so teams can run many use cases side by side.",
  },
  {
    cat: "Integrations",
    q: "Which integrations are supported?",
    a: "Fifteen in the marketplace: Gmail, Google Drive, Outlook, Slack, Microsoft Teams, WhatsApp Business, Notion, GitHub, Jira, Linear, HubSpot, Shopify, Zapier, Make and n8n.",
    link: { label: "Open the marketplace", href: "/docs" },
  },
  {
    cat: "Integrations",
    q: "How do connections authenticate?",
    a: "OAuth 2.0 — you authorize at the provider's own consent screen and RYUKSAIDSO stores only the resulting tokens, encrypted with AES-256-GCM. We never see your third-party passwords, and token values are never shown back to you.",
  },
  {
    cat: "Integrations",
    q: "How do I sync a GitHub repository?",
    a: "Go to Integrations → Knowledge → add a source with provider GitHub, give it a name, and paste either owner/repo or the full remote URL (https://github.com/owner/repo.git). With GitHub connected, sources are created immediately — no server-side GITHUB_TOKEN needed.",
  },
  {
    cat: "Integrations",
    q: "What is knowledge sync?",
    a: "Knowledge sync pulls files from a connected source, chunks them into documents and stores them in your workspace so agents can search them. Sources support an auto-sync option to stay fresh as the upstream content changes.",
  },
  {
    cat: "Integrations",
    q: "What is the chat widget?",
    a: "An embeddable chat bubble for your website, wired to one of your agents. Enable it, set the title, greeting, accent and allowed origins, paste the script tag on your site — conversations show up as widget sessions with their own transcripts.",
  },
  {
    cat: "Integrations",
    q: "What are webhooks?",
    a: "Webhook endpoints let external systems subscribe to workspace events. Every delivery carries a signed payload and your endpoint's secret, with automatic retries and a delivery log showing status per attempt.",
  },
  {
    cat: "Integrations",
    q: "Do you support Slack and Microsoft Teams?",
    a: "Yes — both are supported connections in the marketplace (Teams via incoming-webhook URL, Slack via OAuth), so agent activity and workflows can plug into your team's channels.",
  },
  {
    cat: "Integrations",
    q: "What about HubSpot, Shopify, Jira and Linear?",
    a: "All four connect through the marketplace so agents and knowledge sync can pull CRM, store, issue and project context into your workflows.",
  },
  {
    cat: "Integrations",
    q: "What are token-type connections?",
    a: "Some providers don't use OAuth — Microsoft Teams connects with an incoming-webhook URL (HTTPS only) and WhatsApp Business with an access token plus phone number ID. Both are stored encrypted like OAuth tokens.",
  },
  {
    cat: "Integrations",
    q: "Can I disconnect an integration?",
    a: "Yes — disconnecting deletes its stored credentials and stops further syncing. You can reconnect at any time; existing synced documents remain until you remove the knowledge source.",
  },
  {
    cat: "Models",
    q: "Which model providers are supported?",
    a: "The built-in OmniRoute gateway, a local or remote Ollama server, and any custom OpenAI-compatible or Ollama endpoint you add with your own base URL and API key.",
  },
  {
    cat: "Models",
    q: "How do I add my own LLM provider?",
    a: "Open Model Providers, add a provider: name, type (OpenAI-compatible or Ollama), base URL, API key and models — then test the connection, discover available models, and make it the workspace default.",
  },
  {
    cat: "Models",
    q: "How are my LLM API keys stored?",
    a: "Encrypted at rest with AES-256-GCM, keyed from a server secret. Keys are masked after saving and never returned by the API; only the server can decrypt them to call your provider.",
  },
  {
    cat: "Models",
    q: "Which provider does a run actually use?",
    a: "Routing follows the workspace's active custom provider first, then the OmniRoute gateway, then Ollama — each step falling through only when the previous provider fails, with the failure reason recorded.",
  },
  {
    cat: "Models",
    q: "What are health probes?",
    a: "Background sweeps check every provider roughly every 15 minutes (plus on-demand via the Test button), measuring latency and status. Providers show a HEALTHY/DOWN badge with the last error — for example HTTP 401 when a key is wrong.",
  },
  {
    cat: "Models",
    q: "What is OmniRoute?",
    a: "OmniRoute is the default model gateway built into RYUKSAIDSO: a unified endpoint that routes and fails over across upstream models, so runs keep working when one backend has a bad day.",
  },
  {
    cat: "Models",
    q: "Can I use local models?",
    a: "Yes — point a custom provider at your Ollama server (loopback and private network endpoints are allowed for self-hosted models) and route workspace runs to local models like llama3 or qwen.",
  },
  {
    cat: "Models",
    q: "Do I need my own API keys?",
    a: "Not to start — the built-in gateway works out of the box. Bring your own OpenAI-compatible or Ollama keys when you want to use your own accounts, custom models or private endpoints.",
  },
  {
    cat: "API & security",
    q: "Is there an API?",
    a: "Yes — a REST API under /api authenticated with sessions or API keys (rsk_…), with the full endpoint reference documented in API.md and browsable on the docs page.",
    link: { label: "API reference", href: "/docs" },
  },
  {
    cat: "API & security",
    q: "How does authentication work?",
    a: "Email and password (bcrypt-hashed) with httpOnly session cookies plus CSRF protection, email verification, password reset — and Google and GitHub single sign-on.",
  },
  {
    cat: "API & security",
    q: "How is my data protected?",
    a: "TLS in transit; passwords hashed with bcrypt; API keys stored as hashes; integration tokens and model keys encrypted with AES-256-GCM; role checks enforced server-side on every route; and an audit log of administrative and security actions.",
  },
  {
    cat: "API & security",
    q: "Do you use my data to train AI models?",
    a: "No. Your workspace content — prompts, runs, documents, messages — is never used to train models. It's processed only to run your agents and show you your data.",
    link: { label: "Privacy Policy", href: "/privacy" },
  },
  {
    cat: "API & security",
    q: "What rate limits apply?",
    a: "API traffic is rate limited per client with standard rate-limit headers, and sensitive flows add their own cooldowns (for example, sending a support message is limited to one per short window).",
  },
  {
    cat: "API & security",
    q: "Can I scope API keys?",
    a: "Yes — API keys are workspace-scoped, revocable from settings, stored only as hashes (a lost key can never be read back), and every call with a key is attributed in logs and metrics.",
  },
  {
    cat: "API & security",
    q: "How does RYUKSAIDSO handle RBAC?",
    a: "Every workspace route checks the caller's role server-side — OWNER, ADMIN, AGENT or VIEWER — and platform-wide administration requires the system ADMIN role. Client-side hiding is cosmetic; the server never trusts it.",
    link: { label: "Roles in the docs", href: "/docs" },
  },
  {
    cat: "Billing",
    q: "What plans does RYUKSAIDSO offer?",
    a: "Free, Starter, Pro and Business — billed monthly or yearly, with limits that reset every billing period.",
    link: { label: "Compare plans", href: "/pricing" },
  },
  {
    cat: "Billing",
    q: "What payment methods are accepted?",
    a: "UPI (Google Pay, PhonePe, Paytm), credit and debit cards, and net banking — processed by Cashfree. Prices are in INR and include GST where applicable.",
  },
  {
    cat: "Billing",
    q: "What happens when I hit a plan limit?",
    a: "Requests return a 402 PaymentRequired with an upgrade banner in the app. Hitting a limit never deletes your existing data — runs, documents and integrations stay intact until you upgrade or downgrade on your own terms.",
  },
  {
    cat: "Billing",
    q: "Is checkout secure?",
    a: "Yes — checkout happens on Cashfree's hosted page, so card, UPI and mandate details never touch RYUKSAIDSO's servers. We only receive transaction references, amounts and statuses.",
  },
  {
    cat: "Billing",
    q: "How do I cancel a subscription?",
    a: "Cancel any time from Settings → Billing. Your plan stays active until the end of the paid period, then reverts to the free tier — no data is deleted in the process.",
  },
  {
    cat: "Billing",
    q: "Can admins control when billing is enforced?",
    a: "Yes — platform admins can toggle entitlement enforcement from Admin → Billing, and subscriptions settle automatically from Cashfree webhook events (with idempotency protection).",
  },
  {
    cat: "Support",
    q: "How do I contact support?",
    a: "Click the support icon in the top bar of the app — it opens a direct line to CEO Faizan Hameed. Messages land in the CEO inbox and replies come to your account email. You can also write to faizanhameed690@gmail.com.",
  },
  {
    cat: "Support",
    q: "Who actually answers my support message?",
    a: "The founder and CEO himself. There is no ticket queue or chatbot in between — every message from the support channel is read personally by Faizan Hameed.",
  },
  {
    cat: "Support",
    q: "Where can I learn how everything works?",
    a: "The docs page covers the product end to end, the architecture page shows how the services fit together, and the playground lets you try an agent hands on.",
    link: { label: "Read the docs", href: "/docs" },
  },
  {
    cat: "Support",
    q: "Where is RYUKSAIDSO hosted?",
    a: "Production runs on AWS behind TLS at ryuksaidso.faizcasm.me, with separate web, API, worker, database, cache and model-gateway services plus health and readiness endpoints.",
    link: { label: "Architecture overview", href: "/architecture" },
  },
  {
    cat: "Support",
    q: "Do you have a privacy policy?",
    a: "Yes — the privacy policy explains what we collect, how integrations and AI providers process your data, retention, security and your rights.",
    link: { label: "Privacy Policy", href: "/privacy" },
  },
  {
    cat: "Support",
    q: "How do I know the service is healthy?",
    a: "Public /health and /ready endpoints report liveness and readiness, Prometheus scrapes /metrics, and the Admin dashboard surfaces provider health and recent errors for operators.",
  },
  {
    cat: "Support",
    q: "How do I get started?",
    a: "Create a free account, start a project, add an agent, test it in the playground, then turn on approvals and traces before pointing real traffic at it.",
    link: { label: "Create your workspace", href: "/auth" },
  },
];
