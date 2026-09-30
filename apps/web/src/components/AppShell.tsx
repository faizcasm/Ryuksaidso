"use client";

import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ComponentType,
  type FormEvent,
} from "react";
import {
  Activity,
  AlertTriangle,
  BarChart3,
  Bot,
  Check,
  ChevronRight,
  CircleCheck,
  Clock3,
  Code2,
  Database,
  FileClock,
  Gauge,
  Globe2,
  KeyRound,
  Layers3,
  LifeBuoy,
  LineChart,
  Lock,
  LogOut,
  Menu,
  Moon,
  Play,
  Plus,
  RefreshCw,
  Rocket,
  Search,
  Settings2,
  Shield,
  ShieldCheck,
  Sparkles,
  Sun,
  TestTube2,
  Ticket,
  UserRound,
  Users,
  Workflow,
  X,
  Zap,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import icon from "../app/icon.png";
import { api } from "../lib/api";
// System RBAC helper (User.userRole ADMIN|USER) — distinct from Membership.role.
import { isAdmin as isAdminRole } from "../lib/roles";

type User = {
  id: string;
  email: string;
  name: string;
  organizationId: string;
  role: string;
  /** System RBAC: 'ADMIN' | 'USER' (User.userRole) — gates the Admin tab. */
  userRole?: string;
};
type Profile = User & {
  bio?: string | null;
  jobTitle?: string | null;
  avatarUrl?: string | null;
  timezone?: string | null;
  theme: "system" | "dark" | "light";
  emailVerifiedAt?: string | null;
  createdAt: string;
};
type Project = {
  id: string;
  name: string;
  slug: string;
  description: string;
  status: string;
  productionVersion?: string | null;
  _count?: { runs: number; agents: number };
};
type Agent = {
  id: string;
  name: string;
  slug: string;
  instructions: string;
  systemPrompt?: string | null;
  enabled: boolean;
  tools: any;
  projectId?: string | null;
  project?: Project | null;
  versions?: {
    id: string;
    version: number;
    changelog?: string | null;
    publishedAt?: string | null;
  }[];
  _count?: { runs: number; versions: number };
};
type Step = {
  id: string;
  stepIndex: number;
  agent: string;
  action: string;
  status: string;
  input?: any;
  output?: any;
  durationMs?: number | null;
  tokens: number;
  error?: string | null;
};
type Approval = {
  id: string;
  action: string;
  payload: any;
  status: string;
  createdAt: string;
  runId: string;
  decidedAt?: string | null;
};
type Run = {
  id: string;
  status: string;
  trigger: string;
  environment: string;
  provider: string;
  input: any;
  output?: any;
  error?: string | null;
  tokenUsage: number;
  latencyMs?: number | null;
  startedAt?: string | null;
  finishedAt?: string | null;
  createdAt: string;
  agent?: Agent;
  project?: Project;
  agentVersion?: { version: number };
  steps?: Step[];
  approvals?: Approval[];
};
type Policy = {
  id: string;
  name: string;
  description: string;
  action: string;
  enabled: boolean;
  requiresApproval: boolean;
  severity: string;
};
type Ticket = {
  id: string;
  title: string;
  description: string;
  status: string;
  priority: string;
  requesterEmail?: string | null;
  createdAt: string;
  updatedAt: string;
  messages?: {
    id: string;
    role: string;
    content: string;
    createdAt: string;
  }[];
};
type DocumentRow = {
  id: string;
  title: string;
  source: string;
  content: string;
  createdAt: string;
  agentId?: string | null;
};
type ToolMeta = {
  name: string;
  description: string;
  category?: string;
  scope: string;
  requiresApproval: boolean;
};
type Evaluation = {
  id: string;
  name: string;
  agentId?: string | null;
  createdAt: string;
  dataset: unknown[];
  results?: {
    score?: number;
    results?: {
      id?: string | null;
      expected: string;
      predicted: string | null;
      passed: boolean;
      error?: string;
    }[];
  } | null;
};
type ApiKey = {
  id: string;
  name: string;
  prefix: string;
  lastUsedAt?: string | null;
  createdAt: string;
};
type Dashboard = {
  metrics: {
    runs24h: number;
    successRate: number;
    p95LatencyMs: number;
    failed24h: number;
    pendingApprovals: number;
    documents: number;
    provider: string;
    model?: string;
  };
  projects: Project[];
  agents: Agent[];
  latestRuns: Run[];
  latestEvaluation?: {
    id: string;
    name: string;
    score: number;
    createdAt: string;
  } | null;
};
type ProviderState = {
  current: "OLLAMA" | "OMNIROUTE";
  providers: {
    provider: "OLLAMA" | "OMNIROUTE";
    configured: boolean;
    models: string[];
    selectedModel: string;
    error?: string;
  }[];
};
type WorkspaceInvite = {
  id: string;
  email: string;
  role: string;
  expiresAt: string;
  acceptedAt?: string | null;
  createdAt: string;
};
type Workspace = {
  id: string;
  role: string;
  active: boolean;
  organization: {
    id: string;
    name: string;
    createdAt: string;
    _count: { members: number; agents: number; projects: number; runs: number };
  };
};
type AdminOverview = {
  organization: any;
  metrics: {
    members: number;
    projects: number;
    agents: number;
    documents: number;
    pendingApprovals: number;
    runs14d: number;
    completed14d: number;
    failed14d: number;
    tokens14d: number;
    avgLatencyMs: number;
    activeSessions: number;
    apiKeys: number;
    openTickets: number;
    verifiedMembers: number;
  };
  series: {
    date: string;
    runs: number;
    completed: number;
    failed: number;
    tokens: number;
  }[];
  topAgents: { name: string; runs: number; failures: number; tokens: number }[];
  providerSplit?: { provider: string; runs: number }[];
  statusSplit?: { status: string; runs: number }[];
  registrations?: { daily: { date: string; new: number }[]; beforeWindow: number };
  topTools?: { tool: string; runs: number; avgMs: number }[];
  health?: {
    db: { ok: boolean; latencyMs: number; error?: string };
    redis: { ok: boolean; latencyMs: number; error?: string };
    llm: {
      ok: boolean;
      latencyMs: number;
      provider: string;
      model: string | null;
      url: string;
      error?: string;
    };
    checkedAt: string;
  };
  generatedAt?: string;
  recentRuns: Run[];
  members: {
    id: string;
    role: string;
    user: {
      id: string;
      name: string;
      email: string;
      createdAt: string;
      emailVerifiedAt: string | null;
    };
  }[];
  auditLogs: {
    id: string;
    action: string;
    resource: string;
    resourceId?: string;
    createdAt: string;
  }[];
};

type IconType = ComponentType<{ size?: number; strokeWidth?: number }>;
const mainNav: Array<[string, IconType]> = [
  ["Command Center", Activity],
  ["Run Lab", Play],
  ["Agents", Bot],
  ["Projects", Layers3],
  ["Tickets", Ticket],
  ["Traces", Workflow],
  ["Evaluations", TestTube2],
  ["Approvals", ShieldCheck],
  ["Knowledge", Database],
  ["Policies", Shield],
  ["Developer", Code2],
  ["Docs", Globe2],
  ["Architecture", Layers3],
  ["Settings", Settings2],
];

export default function AppShell() {
  const router = useRouter();
  const pathname = usePathname();
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [authMode, setAuthMode] = useState<"login" | "signup" | "forgot">(
    "login",
  );
  const [authForm, setAuthForm] = useState({
    email: "",
    password: "",
    name: "",
    organizationName: "",
  });
  const [authError, setAuthError] = useState("");
  const [tab, setTab] = useState("Command Center");
  // --- toast system ---------------------------------------------------------
  // `setError` keeps its signature (40+ call sites treat it as "show a toast"),
  // but every message now auto-dismisses and renders as a modern toast card.
  // toastSeq bumps even when the same text repeats so the timer re-arms.
  const [error, setErrorRaw] = useState("");
  const [toastKind, setToastKind] = useState<"error" | "success">("error");
  const [toastSeq, setToastSeq] = useState(0);
  const toastHovered = useRef(false);
  const setError = (message: string) => {
    setToastKind("error");
    setToastSeq((s) => s + 1);
    setErrorRaw(message);
  };
  const notify = (message: string, kind: "error" | "success") => {
    setToastKind(kind);
    setToastSeq((s) => s + 1);
    setErrorRaw(message);
  };
  useEffect(() => {
    if (!error) return;
    // A fresh toast always starts un-hovered. Closing the previous card via the
    // × button unmounts it without ever firing mouseleave, which would leave
    // the hover-ref stuck at true and the auto-dismiss timer paused forever.
    toastHovered.current = false;
    // Auto-dismiss after 6s; hovering the toast pauses it (checked at fire
    // time), leaving re-arms a fresh window via the toastSeq bump.
    const timer = setTimeout(() => {
      if (!toastHovered.current) setErrorRaw("");
    }, 6000);
    return () => clearTimeout(timer);
  }, [error, toastSeq]);
  const dismissToast = () => {
    toastHovered.current = false;
    setErrorRaw("");
  };
  const pauseToast = () => {
    toastHovered.current = true;
  };
  const resumeToast = () => {
    toastHovered.current = false;
    setToastSeq((s) => s + 1);
  };
  const [refreshing, setRefreshing] = useState(false);
  const [adminUpdatedAt, setAdminUpdatedAt] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [theme, setTheme] = useState<"system" | "dark" | "light">("system");
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [runs, setRuns] = useState<Run[]>([]);
  const [approvals, setApprovals] = useState<Approval[]>([]);
  const [policies, setPolicies] = useState<Policy[]>([]);
  const [documents, setDocuments] = useState<DocumentRow[]>([]);
  const [apiKeys, setApiKeys] = useState<ApiKey[]>([]);
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [evaluations, setEvaluations] = useState<Evaluation[]>([]);
  const [toolCatalog, setToolCatalog] = useState<ToolMeta[]>([]);
  const [evalRunning, setEvalRunning] = useState(false);
  const [selectedRun, setSelectedRun] = useState<Run | null>(null);
  const [running, setRunning] = useState(false);
  const [runForm, setRunForm] = useState({
    agentId: "",
    projectId: "",
    prompt: "",
    environment: "development",
    provider: "OLLAMA",
  });
  const [providerState, setProviderState] = useState<ProviderState | null>(
    null,
  );
  const [providerModel, setProviderModel] = useState("");
  const [documentForm, setDocumentForm] = useState({
    title: "",
    source: "manual",
    content: "",
    // "" = shared with every agent; otherwise retrieval is scoped to that agent.
    agentId: "",
  });
  const [policyForm, setPolicyForm] = useState({
    name: "",
    description: "",
    action: "",
    severity: "medium",
    requiresApproval: true,
  });
  const [projectForm, setProjectForm] = useState({
    name: "",
    slug: "",
    description: "",
  });
  const [agentForm, setAgentForm] = useState({
    name: "",
    slug: "",
    instructions: "",
    systemPrompt: "",
    projectId: "",
    tools: ["search_knowledge", "get_ticket", "add_ticket_message"],
  });
  const [evalName, setEvalName] = useState("");
  const [evalAgentId, setEvalAgentId] = useState("");
  const [evalDataset, setEvalDataset] = useState(
    '[\n  {"id":"billing-01","input":"I was charged twice","expectedIntent":"billing"},\n  {"id":"auth-01","input":"I cannot sign in","expectedIntent":"auth"}\n]',
  );
  const [newKeyName, setNewKeyName] = useState("");
  const [newKeySecret, setNewKeySecret] = useState("");
  const [profileForm, setProfileForm] = useState<any>({
    name: "",
    bio: "",
    jobTitle: "",
    avatarUrl: "",
    timezone: "",
    theme: "system",
  });
  const [passwordForm, setPasswordForm] = useState({
    currentPassword: "",
    newPassword: "",
  });
  const [workspaceName, setWorkspaceName] = useState("");
  const [members, setMembers] = useState<AdminOverview["members"]>([]);
  const [adminData, setAdminData] = useState<AdminOverview | null>(null);
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [invites, setInvites] = useState<WorkspaceInvite[]>([]);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("VIEWER");
  const [inviteResult, setInviteResult] = useState<{
    email: string;
    role: string;
    inviteUrl: string;
    emailSent: boolean;
  } | null>(null);
  // Sending the invitation email is synchronous server-side and takes a few
  // seconds — without this flag the button looks dead while SMTP round-trips.
  const [sendingInvite, setSendingInvite] = useState(false);
  const [ticketForm, setTicketForm] = useState({
    title: "",
    description: "",
    requesterEmail: "",
    priority: "MEDIUM",
  });
  const coreRefreshRef = useRef<Promise<void> | null>(null);

  useEffect(() => {
    const saved = (
      typeof window !== "undefined"
        ? localStorage.getItem("ryuksaidso-theme")
        : null
    ) as any;
    setTheme(
      saved === "light" || saved === "dark" || saved === "system"
        ? saved
        : "system",
    );
  }, []);
  useEffect(() => {
    const apply = () => {
      const effective =
        theme === "system"
          ? window.matchMedia("(prefers-color-scheme: light)").matches
            ? "light"
            : "dark"
          : theme;
      document.documentElement.dataset.theme = effective;
    };
    apply();
    localStorage.setItem("ryuksaidso-theme", theme);
    if (theme !== "system") return;
    const media = window.matchMedia("(prefers-color-scheme: light)");
    media.addEventListener?.("change", apply);
    return () => media.removeEventListener?.("change", apply);
  }, [theme]);

  async function loadProviderState() {
    try {
      const p = await api<ProviderState>("/llm/providers");
      setProviderState(p);
      const currentProvider = p.providers.find((x) => x.provider === p.current);
      setProviderModel(
        (prev) =>
          prev ||
          currentProvider?.selectedModel ||
          currentProvider?.models[0] ||
          "",
      );
      setRunForm((x) => ({ ...x, provider: (p.current || x.provider) as any }));
      return p;
    } catch {
      return null;
    }
  }
  async function loadCore() {
    if (coreRefreshRef.current) return coreRefreshRef.current;
    const task = (async () => {
      const [dash, proj, ags, rs, aps, pol, docs, keys, tix, org, mem, evs] =
        await Promise.all([
          api<Dashboard>("/control/dashboard"),
          api<Project[]>("/control/projects"),
          api<Agent[]>("/control/agents"),
          api<Run[]>("/control/runs?limit=100"),
          api<Approval[]>("/approvals"),
          api<Policy[]>("/control/policies"),
          api<DocumentRow[]>("/documents"),
          api<ApiKey[]>("/api-keys").catch(() => []),
          api<Ticket[]>("/tickets").catch(() => []),
          api<any>("/organization").catch(() => null),
          api<AdminOverview["members"]>("/members").catch(() => []),
          api<Evaluation[]>("/evaluations").catch(() => []),
        ]);
      setDashboard(dash);
      setProjects(proj);
      setAgents(ags);
      setRuns(rs);
      setApprovals(aps);
      setPolicies(pol);
      setDocuments(docs);
      setApiKeys(keys);
      setTickets(tix);
      setEvaluations(evs);
      setWorkspaceName(org?.name || "");
      setMembers(mem);
      setProviderModel((prev) => prev || dash.metrics.model || "");
      setRunForm((x) => ({
        ...x,
        agentId: x.agentId || ags[0]?.id || "",
        projectId: x.projectId || ags[0]?.projectId || "",
        provider: (x.provider || dash.metrics.provider || "OLLAMA") as any,
      }));
    })();
    coreRefreshRef.current = task;
    try {
      await task;
    } finally {
      if (coreRefreshRef.current === task) coreRefreshRef.current = null;
    }
  }
  async function loadAdmin() {
    try {
      const data = await api<AdminOverview>("/admin/overview");
      setAdminData(data);
      setAdminUpdatedAt(data.generatedAt || new Date().toISOString());
    } catch (e) {
      setError(readError(e, "Could not load admin dashboard"));
    }
  }
  async function loadProfile() {
    try {
      const p = await api<Profile>("/profile");
      const localTheme =
        typeof window !== "undefined"
          ? localStorage.getItem("ryuksaidso-theme")
          : null;
      const resolvedTheme = (
        localTheme === "light" ||
        localTheme === "dark" ||
        localTheme === "system"
          ? localTheme
          : p.theme
      ) as "system" | "dark" | "light";
      setProfile(p);
      setProfileForm({
        name: p.name,
        bio: p.bio || "",
        jobTitle: p.jobTitle || "",
        avatarUrl: p.avatarUrl || "",
        timezone: p.timezone || "",
        theme: resolvedTheme,
      });
      setTheme(resolvedTheme);
    } catch {}
  }
  async function loadWorkspaceData() {
    try {
      const [ws, pending] = await Promise.all([
        api<Workspace[]>("/workspaces"),
        api<WorkspaceInvite[]>("/workspace/invitations").catch(() => []),
      ]);
      setWorkspaces(ws);
      setInvites(pending);
    } catch {}
  }
  async function pollRuns() {
    try {
      const [nextRuns, nextApprovals, nextTickets] = await Promise.all([
        api<Run[]>("/control/runs?limit=40"),
        api<Approval[]>("/approvals"),
        // Ticket threads change while a run is in flight (agent replies land
        // after approval) — refresh them with the same 5s poll.
        api<Ticket[]>("/tickets").catch(() => tickets),
      ]);
      setRuns(nextRuns);
      setApprovals(nextApprovals);
      setTickets(nextTickets);
      return nextRuns;
    } catch {
      return runs;
    }
  }
  async function acceptPendingInvitation() {
    const token =
      typeof window !== "undefined"
        ? localStorage.getItem("ryuksaidso_invite_token")
        : null;
    if (!token) return;
    try {
      const result = await api<{ user?: User }>(
        "/workspace/invitations/accept",
        { method: "POST", body: JSON.stringify({ token }) },
      );
      if (result.user) setUser(result.user);
      localStorage.removeItem("ryuksaidso_invite_token");
    } catch (e) {
      // A token that can never succeed (expired, revoked, or meant for another
      // mailbox) must not stay stored — otherwise every later sign-in retries it
      // and surfaces the same error. Transient failures keep the token so the
      // join can complete on the next attempt.
      const status = (e as { status?: number })?.status;
      if (status === 400 || status === 403 || status === 404) {
        localStorage.removeItem("ryuksaidso_invite_token");
      }
      setError(
        readError(
          e,
          "Signed in, but the workspace invitation could not be accepted.",
        ),
      );
    }
  }
  useEffect(() => {
    (async () => {
      try {
        const me = await api<{ user: User }>("/me");
        setUser(me.user);
        // Static tool catalog for the "add tools" section of the agent form.
        void api<ToolMeta[]>("/tools").then(setToolCatalog).catch(() => []);
        await acceptPendingInvitation();
        await Promise.all([
          loadProfile(),
          loadCore(),
          loadProviderState(),
          loadWorkspaceData(),
        ]);
      } catch {
      } finally {
        setLoading(false);
      }
    })();
  }, []);
  useEffect(() => {
    if (!user) return;
    const active = runs.some((r) =>
      ["QUEUED", "RUNNING", "WAITING_APPROVAL"].includes(r.status),
    );
    if (!active) return;
    let busy = false;
    const id = window.setInterval(async () => {
      if (busy) return;
      busy = true;
      try {
        await pollRuns();
      } finally {
        busy = false;
      }
    }, 5000);
    return () => window.clearInterval(id);
  }, [
    user,
    runs.some((r) =>
      ["QUEUED", "RUNNING", "WAITING_APPROVAL"].includes(r.status),
    ),
  ]);
  useEffect(() => {
    // Admin data loads only when the Admin tab actually renders — i.e. for a
    // system admin (User.userRole=ADMIN), NOT based on the workspace membership
    // role: a workspace OWNER who is not a system admin never opens this tab.
    if (isAdminRole(user?.userRole) && tab === "Admin") void loadAdmin();
  }, [tab, user]);
  useEffect(() => {
    // Keep the Admin surface live while it's on screen: soft-poll so charts,
    // health and audit rows reflect reality without anyone hammering Refresh.
    if (!isAdminRole(user?.userRole) || tab !== "Admin") return;
    const id = window.setInterval(() => {
      if (!document.hidden) void loadAdmin();
    }, 45_000);
    return () => window.clearInterval(id);
  }, [tab, user]);

  async function refreshEverything() {
    if (refreshing) return;
    setRefreshing(true);
    try {
      await loadCore();
      // The topbar Refresh used to skip admin data entirely — operators on the
      // Admin tab were looking at yesterday's numbers after clicking it.
      if (isAdminRole(user?.userRole) && tab === "Admin") await loadAdmin();
    } finally {
      setRefreshing(false);
    }
  }

  async function auth(e: FormEvent) {
    e.preventDefault();
    setAuthError("");
    try {
      if (authMode === "forgot") {
        await api("/auth/forgot-password", {
          method: "POST",
          body: JSON.stringify({ email: authForm.email }),
        });
        setAuthError(
          "If that email exists, a reset link has been sent. Check your inbox.",
        );
        return;
      }
      const path = authMode === "login" ? "/auth/login" : "/auth/register";
      const body =
        authMode === "login"
          ? { email: authForm.email, password: authForm.password }
          : {
              email: authForm.email,
              password: authForm.password,
              name: authForm.name,
              organizationName: authForm.organizationName || undefined,
            };
      const out = await api<{ user: User }>(path, {
        method: "POST",
        body: JSON.stringify(body),
      });
      setUser(out.user);
      setAuthForm({ email: "", password: "", name: "", organizationName: "" });
      await acceptPendingInvitation();
      await Promise.all([loadProfile(), loadCore(), loadWorkspaceData()]);
    } catch (e) {
      setAuthError(readError(e, "Authentication failed"));
    }
  }
  function oauth(provider: "google" | "github") {
    window.location.assign(
      `${process.env.NEXT_PUBLIC_API_URL || "http://localhost:4001/api"}/auth/oauth/${provider}`,
    );
  }
  async function logout() {
    await api("/auth/logout", { method: "POST" }).catch(() => {});
    setUser(null);
    setProfile(null);
    setDashboard(null);
    setAgents([]);
    setRuns([]);
  }
  async function startRun(e: FormEvent) {
    e.preventDefault();
    if (!runForm.agentId || !runForm.prompt.trim()) return;
    setRunning(true);
    setError("");
    try {
      const out = await api<{ runId: string; jobId: string }>("/control/runs", {
        method: "POST",
        body: JSON.stringify(runForm),
      });
      // Wait a bit for the job to be properly queued
      await new Promise(resolve => setTimeout(resolve, 500));
      // Refresh the runs list to show the queued status
      await pollRuns();
      setTab("Traces");
      // Load the specific run to show in the trace view
      const run = await api<Run>(`/control/runs/${out.runId}`);
      setSelectedRun(run);
      await loadCore();
    } catch (e) {
      setError(readError(e, "Could not start run"));
    } finally {
      setRunning(false);
    }
  }
  async function inspectRun(id: string) {
    try {
      setSelectedRun(await api<Run>(`/control/runs/${id}`));
      setTab("Traces");
    } catch (e) {
      setError(readError(e, "Could not load trace"));
    }
  }
  async function retryRun(id: string) {
    try {
      const out = await api<{ runId: string }>(`/control/runs/${id}/retry`, {
        method: "POST",
      });
      await inspectRun(out.runId);
      await loadCore();
    } catch (e) {
      setError(readError(e, "Could not retry run"));
    }
  }
  async function decision(id: string, approved: boolean) {
    try {
      await api(`/approvals/${id}/decision`, {
        method: "POST",
        body: JSON.stringify({ approved }),
      });
      await loadCore();
      if (selectedRun) await inspectRun(selectedRun.id);
    } catch (e) {
      setError(readError(e, "Could not record decision"));
    }
  }
  async function toggleAgent(a: Agent) {
    try {
      await api(`/control/agents/${a.id}`, {
        method: "PATCH",
        body: JSON.stringify({ enabled: !a.enabled }),
      });
      await loadCore();
    } catch (e) {
      setError(readError(e, "Could not update agent"));
    }
  }
  async function publishVersion(a: Agent) {
    try {
      await api(`/control/agents/${a.id}/versions`, {
        method: "POST",
        body: JSON.stringify({
          publish: true,
          changelog: "Promoted current working configuration",
        }),
      });
      await loadCore();
    } catch (e) {
      setError(readError(e, "Could not publish version"));
    }
  }
  async function createProject(e: FormEvent) {
    e.preventDefault();
    try {
      await api("/control/projects", {
        method: "POST",
        body: JSON.stringify({ ...projectForm, slug: toSlug(projectForm.slug || projectForm.name) }),
      });
      setProjectForm({ name: "", slug: "", description: "" });
      await loadCore();
    } catch (e) {
      setError(readError(e, "Could not create project"));
    }
  }
  async function createAgent(e: FormEvent) {
    e.preventDefault();
    try {
      await api("/control/agents", {
        method: "POST",
        body: JSON.stringify({
          ...agentForm,
          // Slug must match the API regex; normalize whatever was typed and
          // fall back to the name so a half-filled form still succeeds.
          slug: toSlug(agentForm.slug || agentForm.name),
          projectId: agentForm.projectId || undefined,
          // Custom system prompt: when set it overrides Instructions at run time.
          systemPrompt: agentForm.systemPrompt.trim() || undefined,
          // Tool checkboxes on the create form — an agent with no tools can
          // never reach the knowledge base or a ticket.
          tools: agentForm.tools.length ? agentForm.tools : ["search_knowledge"],
        }),
      });
      setAgentForm({
        name: "",
        slug: "",
        instructions: "",
        systemPrompt: "",
        projectId: "",
        tools: ["search_knowledge", "get_ticket", "add_ticket_message"],
      });
      await loadCore();
    } catch (e) {
      setError(readError(e, "Could not create agent"));
    }
  }
  async function createDocument(e: FormEvent) {
    e.preventDefault();
    try {
      await api("/documents", {
        method: "POST",
        body: JSON.stringify({
          ...documentForm,
          agentId: documentForm.agentId || null,
        }),
      });
      setDocumentForm({ title: "", source: "manual", content: "", agentId: "" });
      await loadCore();
    } catch (e) {
      setError(readError(e, "Could not add knowledge"));
    }
  }
  async function createPolicy(e: FormEvent) {
    e.preventDefault();
    try {
      await api("/control/policies", {
        method: "POST",
        body: JSON.stringify(policyForm),
      });
      setPolicyForm({
        name: "",
        description: "",
        action: "",
        severity: "medium",
        requiresApproval: true,
      });
      await loadCore();
    } catch (e) {
      setError(readError(e, "Could not create policy"));
    }
  }
  async function togglePolicy(p: Policy) {
    try {
      await api(`/control/policies/${p.id}`, {
        method: "PATCH",
        body: JSON.stringify({ enabled: !p.enabled }),
      });
      await loadCore();
    } catch (e) {
      setError(readError(e, "Could not update policy"));
    }
  }
  async function runEvaluation(e: FormEvent) {
    e.preventDefault();
    setEvalRunning(true);
    try {
      await api("/evaluations", {
        method: "POST",
        body: JSON.stringify({
          name: evalName || "Regression suite",
          agentId: evalAgentId || agents[0]?.id,
          dataset: JSON.parse(evalDataset),
        }),
      });
      setEvalName("");
      await loadCore();
    } catch (e) {
      setError(
        readError(
          e,
          "Evaluation failed. Check the dataset and provider connection",
        ),
      );
    } finally {
      setEvalRunning(false);
    }
  }
  async function createKey(e: FormEvent) {
    e.preventDefault();
    try {
      const k = await api<ApiKey & { secret: string }>("/api-keys", {
        method: "POST",
        body: JSON.stringify({ name: newKeyName }),
      });
      setNewKeySecret(k.secret);
      setNewKeyName("");
      await loadCore();
    } catch (e) {
      setError(readError(e, "Could not create API key"));
    }
  }
  async function saveProfile(e: FormEvent) {
    e.preventDefault();
    try {
      const p = await api<Profile>("/profile", {
        method: "PATCH",
        body: JSON.stringify(profileForm),
      });
      setProfile(p);
      setUser((x) => (x ? { ...x, name: p.name } : x));
      setTheme(p.theme);
      setError("");
    } catch (e) {
      setError(readError(e, "Could not update profile"));
    }
  }
  async function savePassword(e: FormEvent) {
    e.preventDefault();
    try {
      await api("/profile/password", {
        method: "POST",
        body: JSON.stringify(passwordForm),
      });
      setPasswordForm({ currentPassword: "", newPassword: "" });
      setError(
        "Password changed. Please sign in again if your session expires.",
      );
    } catch (e) {
      setError(readError(e, "Could not update password"));
    }
  }
  async function saveWorkspace(e: FormEvent) {
    e.preventDefault();
    try {
      await api("/organization", {
        method: "PATCH",
        body: JSON.stringify({ name: workspaceName }),
      });
      await loadCore();
    } catch (e) {
      setError(readError(e, "Could not update workspace"));
    }
  }
  async function saveProvider(e: FormEvent) {
    e.preventDefault();
    try {
      await api("/llm", {
        method: "PATCH",
        body: JSON.stringify({
          provider: runForm.provider,
          model: providerModel,
        }),
      });
      await loadProviderState();
      await loadCore();
    } catch (e) {
      setError(readError(e, "Could not save LLM provider"));
    }
  }
  async function switchWorkspace(id: string) {
    try {
      const out = await api<{ user: User }>(`/workspaces/${id}/switch`, {
        method: "POST",
      });
      setUser(out.user);
      setProfile(null);
      setSelectedRun(null);
      setAdminData(null);
      await Promise.all([
        loadProfile(),
        loadCore(),
        loadProviderState(),
        loadWorkspaceData(),
      ]);
      setTab("Command Center");
    } catch (e) {
      setError(readError(e, "Could not switch workspace"));
    }
  }
  async function sendInvite(e: FormEvent) {
    e.preventDefault();
    if (sendingInvite) return;
    setSendingInvite(true);
    try {
      const created = await api<{
        id: string;
        email: string;
        role: string;
        inviteUrl?: string;
        emailSent?: boolean;
      }>("/workspace/invitations", {
        method: "POST",
        body: JSON.stringify({ email: inviteEmail, role: inviteRole }),
      });
      setInviteResult({
        email: created.email,
        role: created.role,
        inviteUrl: created.inviteUrl || "",
        emailSent: created.emailSent !== false,
      });
      setInviteEmail("");
      setInviteRole("VIEWER");
      await loadWorkspaceData();
    } catch (e) {
      setError(readError(e, "Could not send workspace invitation"));
    } finally {
      setSendingInvite(false);
    }
  }
  async function revokeInvite(id: string) {
    try {
      await api(`/workspace/invitations/${id}`, { method: "DELETE" });
      await loadWorkspaceData();
    } catch (e) {
      setError(readError(e, "Could not revoke invitation"));
    }
  }
  async function requestVerification() {
    try {
      const out = await api<{ message: string }>("/profile/verify-email", {
        method: "POST",
      });
      // 202 also covers "SMTP unavailable right now" — only a real send (or an
      // already-verified account) is a success.
      notify(
        out.message,
        /could not deliver/i.test(out.message) ? "error" : "success",
      );
    } catch (e) {
      setError(readError(e, "Could not send verification email"));
    }
  }

  async function createTicket(e: FormEvent) {
    e.preventDefault();
    try {
      await api("/tickets", {
        method: "POST",
        body: JSON.stringify(ticketForm),
      });
      setTicketForm({
        title: "",
        description: "",
        requesterEmail: "",
        priority: "MEDIUM",
      });
      await loadCore();
    } catch (e) {
      setError(readError(e, "Could not create ticket"));
    }
  }
  async function runTicket(t: Ticket) {
    try {
      await api(`/tickets/${t.id}/run`, { method: "POST" });
      await loadCore();
    } catch (e) {
      setError(readError(e, "Could not run ticket"));
    }
  }
  async function changeRole(id: string, role: string) {
    try {
      await api(`/admin/members/${id}/role`, {
        method: "PATCH",
        body: JSON.stringify({ role }),
      });
      await loadAdmin();
      await loadCore();
    } catch (e) {
      setError(readError(e, "Could not change role"));
    }
  }
  async function removeMember(id: string) {
    try {
      await api(`/members/${id}`, { method: "DELETE" });
      await loadAdmin();
      await loadCore();
    } catch (e) {
      setError(readError(e, "Could not remove member"));
    }
  }
  async function revokeMemberSessions(id: string) {
    try {
      await api(`/admin/members/${id}/revoke-sessions`, { method: "POST" });
      await loadAdmin();
    } catch (e) {
      setError(readError(e, "Could not revoke member sessions"));
    }
  }

  // The /auth route is the sign-in surface; once authenticated, move to the command center.
  useEffect(() => {
    if (user && pathname === "/auth") router.replace("/dashboard");
  }, [user, pathname, router]);

  // Two independent RBAC layers — declared before the loading/auth early
  // returns so the hook order never changes between the auth screen and the
  // dashboard:
  //  - system RBAC    (User.userRole ADMIN|USER)  → Admin tab, matching the API's
  //    requireAdmin on the platform routes (/admin/users, …);
  //  - workspace RBAC (Membership OWNER|ADMIN|…)  → invites + member management,
  //    matching the API's requireRole(['OWNER','ADMIN']).
  const isSystemAdmin = isAdminRole(user?.userRole);
  const canManageWorkspace = user?.role === "OWNER" || user?.role === "ADMIN";
  // If the system role is revoked while the Admin tab is open, leave it.
  useEffect(() => {
    if (tab === "Admin" && !isSystemAdmin) setTab("Command Center");
  }, [tab, isSystemAdmin]);

  if (loading)
    return (
      <div className="boot">
        <div className="boot-orb">
          <Image src={icon} alt="" width={30} height={30} />
        </div>
        <b>RYUKSAIDSO</b>
        <span>loading control plane…</span>
      </div>
    );
  if (!user)
    return (
      <AuthScreen
        mode={authMode}
        setMode={setAuthMode}
        form={authForm}
        setForm={setAuthForm}
        error={authError}
        submit={auth}
        oauth={oauth}
      />
    );

  const isOwner = user.role === "OWNER";
  const selectedAgent = agents.find((a) => a.id === runForm.agentId);
  const nav = [
    ...mainNav,
    ...(isSystemAdmin ? [["Admin", BarChart3] as [string, IconType]] : []),
  ];

  return (
    <div className="app-shell">
      <aside className={`sidebar ${sidebarOpen ? "open" : ""}`}>
        <div className="brand">
          <div className="brand-mark">
            <Image src={icon} alt="ryuksaidso" width={28} height={28} />
          </div>
          <div>
            <strong>RYUKSAIDSO</strong>
            <span>agent control plane</span>
          </div>
        </div>
        <div className="workspace-badge">
          <span className="pulse" /> workspace <small>{user.role}</small>
        </div>
        <nav>
          {nav.map(([label, Icon]) => (
            <button
              key={label}
              className={tab === label ? "active" : ""}
              onClick={() => {
                setTab(label);
                setSidebarOpen(false);
              }}
            >
              <Icon size={15} />
              {label}
              {label === "Approvals" && approvals.length > 0 ? (
                <b>{approvals.length}</b>
              ) : null}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="identity">
            <div className="avatar">
              {(profile?.name || user.name).slice(0, 1).toUpperCase()}
            </div>
            <div>
              <b>{profile?.name || user.name}</b>
              <span>{user.email}</span>
            </div>
          </div>
          <button className="ghost-icon" onClick={logout} title="Sign out">
            <LogOut size={15} />
          </button>
        </div>
      </aside>
      <main className="main">
        <header className="topbar">
          <div className="crumb">
            <button
              className="mobile-menu"
              onClick={() => setSidebarOpen((x) => !x)}
            >
              <Menu size={18} />
            </button>
            <span>RYUKSAIDSO</span>
            <ChevronRight size={13} />
            <b>{tab}</b>
          </div>
          <div className="top-actions">
            <span className="runtime-chip">
              <span className="pulse" /> workers online
            </span>
            <button
              className="ghost-icon"
              onClick={() =>
                setTheme(
                  theme === "dark"
                    ? "light"
                    : theme === "light"
                      ? "system"
                      : "dark",
                )
              }
              title="Change theme"
            >
              {theme === "dark" ? (
                <Moon size={15} />
              ) : theme === "light" ? (
                <Sun size={15} />
              ) : (
                <Sparkles size={15} />
              )}
            </button>
            <button
              className="ghost-icon"
              onClick={() => void refreshEverything()}
              title={refreshing ? "Refreshing…" : "Refresh"}
              disabled={refreshing}
            >
              <RefreshCw size={15} className={refreshing ? "spin" : ""} />
            </button>
          </div>
        </header>
        <div className="content">
          {error && (
            <div
              className={`toast ${toastKind}`}
              role="status"
              onMouseEnter={pauseToast}
              onMouseLeave={resumeToast}
            >
              <span className="toast-icon">
                {toastKind === "success" ? (
                  <CircleCheck size={16} />
                ) : (
                  <AlertTriangle size={16} />
                )}
              </span>
              <span className="toast-msg">{error}</span>
              <button
                className="toast-close"
                onClick={dismissToast}
                aria-label="Dismiss notification"
              >
                <X size={14} />
              </button>
              <i className="toast-timer" key={toastSeq} />
            </div>
          )}
          {tab === "Command Center" && (
            <CommandCenter
              dashboard={dashboard}
              runs={runs}
              approvals={approvals}
              onRun={() => setTab("Run Lab")}
              onInspect={inspectRun}
              onDecide={decision}
            />
          )}
          {tab === "Run Lab" && (
            <RunLab
              agents={agents}
              projects={projects}
              form={runForm}
              setForm={setRunForm}
              selectedAgent={selectedAgent}
              running={running}
              providerState={providerState}
              onSubmit={startRun}
            />
          )}
          {tab === "Agents" && (
            <AgentsView
              agents={agents}
              projects={projects}
              form={agentForm}
              setForm={setAgentForm}
              toolCatalog={toolCatalog}
              onCreate={createAgent}
              onToggle={toggleAgent}
              onPublish={publishVersion}
            />
          )}
          {tab === "Projects" && (
            <ProjectsView
              projects={projects}
              form={projectForm}
              setForm={setProjectForm}
              onCreate={createProject}
            />
          )}
          {tab === "Tickets" && (
            <TicketsView
              tickets={tickets}
              form={ticketForm}
              setForm={setTicketForm}
              onCreate={createTicket}
              onRun={runTicket}
            />
          )}
          {tab === "Traces" && (
            <TracesView
              runs={runs}
              selected={selectedRun}
              onSelect={inspectRun}
              onRetry={retryRun}
            />
          )}
          {tab === "Evaluations" && (
            <EvaluationsView
              name={evalName}
              setName={setEvalName}
              agentId={evalAgentId}
              setAgentId={setEvalAgentId}
              dataset={evalDataset}
              setDataset={setEvalDataset}
              agents={agents}
              evaluations={evaluations}
              running={evalRunning}
              onSubmit={runEvaluation}
            />
          )}
          {tab === "Approvals" && (
            <ApprovalsView
              approvals={approvals}
              onDecision={decision}
              runs={runs}
            />
          )}
          {tab === "Knowledge" && (
            <KnowledgeView
              documents={documents}
              agents={agents}
              form={documentForm}
              setForm={setDocumentForm}
              onSubmit={createDocument}
            />
          )}
          {tab === "Policies" && (
            <PoliciesView
              policies={policies}
              form={policyForm}
              setForm={setPolicyForm}
              onCreate={createPolicy}
              onToggle={togglePolicy}
            />
          )}
          {tab === "Developer" && (
            <DeveloperView
              keys={apiKeys}
              name={newKeyName}
              setName={setNewKeyName}
              secret={newKeySecret}
              setSecret={setNewKeySecret}
              onCreate={createKey}
              providerState={providerState}
            />
          )}
          {tab === "Docs" && (
            <div className="page">
              <div className="hero compact">
                <div>
                  <span className="eyebrow">DOCUMENTATION</span>
                  <h1>Ryuksaidso Documentation</h1>
                  <p>Comprehensive guides and API references for the platform.</p>
                </div>
              </div>
              <div className="panel" style={{ padding: '40px', textAlign: 'center' }}>
                <p style={{ marginBottom: '20px', color: 'var(--muted)' }}>
                  Explore our detailed documentation covering all aspects of Ryuksaidso.
                </p>
                <button className="primary large" onClick={() => window.open('/docs', '_blank')}>
                  View Documentation
                </button>
              </div>
            </div>
          )}
          {tab === "Architecture" && (
            <div className="page">
              <div className="hero compact">
                <div>
                  <span className="eyebrow">SYSTEM ARCHITECTURE</span>
                  <h1>Interactive Architecture</h1>
                  <p>Explore the complete 3D visualization of Ryuksaidso system.</p>
                </div>
              </div>
              <div className="panel" style={{ padding: '40px', textAlign: 'center' }}>
                <p style={{ marginBottom: '20px', color: 'var(--muted)' }}>
                  View the interactive 3D architecture diagram showing all system components.
                </p>
                <button className="primary large" onClick={() => window.open('/architecture', '_blank')}>
                  View Architecture
                </button>
              </div>
            </div>
          )}
          {tab === "Settings" && (
            <SettingsView
              profile={profile}
              profileForm={profileForm}
              setProfileForm={setProfileForm}
              onProfile={saveProfile}
              onVerifyEmail={requestVerification}
              passwordForm={passwordForm}
              setPasswordForm={setPasswordForm}
              onPassword={savePassword}
              workspaceName={workspaceName}
              setWorkspaceName={setWorkspaceName}
              onWorkspace={saveWorkspace}
              providerState={providerState}
              provider={runForm.provider}
              setProvider={(x: any) => {
                setRunForm((y) => ({ ...y, provider: x }));
                setProviderModel(
                  providerState?.providers.find((p) => p.provider === x)
                    ?.selectedModel || "",
                );
              }}
              model={providerModel}
              setModel={setProviderModel}
              onProvider={saveProvider}
              members={members}
              canManageMembers={canManageWorkspace}
              onRole={changeRole}
              onRemove={removeMember}
              theme={theme}
              setTheme={setTheme}
              user={user}
              workspaces={workspaces}
              onSwitchWorkspace={switchWorkspace}
              invites={invites}
              inviteEmail={inviteEmail}
              setInviteEmail={setInviteEmail}
              inviteRole={inviteRole}
              setInviteRole={setInviteRole}
              onInvite={sendInvite}
              onRevokeInvite={revokeInvite}
              inviteResult={inviteResult}
              onDismissInvite={() => setInviteResult(null)}
              sendingInvite={sendingInvite}
            />
          )}
          {tab === "Admin" && isSystemAdmin && (
            <AdminView
              data={adminData}
              viewerRole={user.role}
              onRefresh={loadAdmin}
              onRole={changeRole}
              onRemove={removeMember}
              onRevokeSessions={revokeMemberSessions}
              onInspect={inspectRun}
              updatedAt={adminUpdatedAt}
            />
          )}
        </div>
      </main>
    </div>
  );
}

function AuthScreen({
  mode,
  setMode,
  form,
  setForm,
  error,
  submit,
  oauth,
}: {
  mode: "login" | "signup" | "forgot";
  setMode: (x: "login" | "signup" | "forgot") => void;
  form: any;
  setForm: (x: any) => void;
  error: string;
  submit: (e: FormEvent) => void;
  oauth: (provider: "google" | "github") => void;
}) {
  const [providers, setProviders] = useState({ google: false, github: false });
  useEffect(() => {
    void api<typeof providers>("/auth/providers")
      .then(setProviders)
      .catch(() => {});
  }, []);
  const isSignup = mode === "signup";
  const isForgot = mode === "forgot";
  return (
    <div className="auth-shell">
      <div className="auth-art">
        <div className="grid-fade" />
        <div className="auth-brand">
          <div className="brand-mark">
            <Image src={icon} alt="ryuksaidso" width={28} height={28} />
          </div>
          <div>
            <b>RYUKSAIDSO</b>
            <span>agent control plane</span>
          </div>
        </div>
        <div className="auth-copy">
          <span className="eyebrow">BUILD · OBSERVE · CONTROL · SHIP</span>
          <h1>Make agents behave like software.</h1>
          <p>
            Trace every step, enforce approval gates, compare models, replay
            failures, and ship agent versions with evidence instead of crossed
            fingers.
          </p>
          <div className="feature-grid">
            <div>
              <Workflow size={17} />
              <b>Durable traces</b>
              <span>Every run is persisted.</span>
            </div>
            <div>
              <Shield size={17} />
              <b>Policy gates</b>
              <span>Side effects pause.</span>
            </div>
            <div>
              <BarChart3 size={17} />
              <b>Admin analytics</b>
              <span>See usage and failures.</span>
            </div>
            <div>
              <Globe2 size={17} />
              <b>Dual LLM</b>
              <span>Ollama or OmniRoute.</span>
            </div>
          </div>
        </div>
        <div className="auth-foot">
          Built for engineers who are tired of debugging “the model felt weird.”
        </div>
      </div>
      <div className="auth-card">
        <Link href="/" className="auth-home">
          ← Back to home
        </Link>
        <div className="auth-tabs">
          <button
            className={mode === "login" ? "active" : ""}
            onClick={() => setMode("login")}
          >
            Sign in
          </button>
          <button
            className={mode === "signup" ? "active" : ""}
            onClick={() => setMode("signup")}
          >
            Create workspace
          </button>
        </div>
        <div className="auth-head">
          <span className="eyebrow">RYUKSAIDSO CONTROL PLANE</span>
          <h2>
            {isForgot
              ? "Recover your account"
              : mode === "login"
                ? "Welcome back."
                : "Build your agent stack."}
          </h2>
          <p>
            {isForgot
              ? "We’ll email a single-use reset link."
              : "Production-style infrastructure for agent reliability."}
          </p>
        </div>
        {error && <div className="inline-error">{error}</div>}
        {isForgot ? (
          <form onSubmit={submit} className="auth-form">
            <label>
              Email
              <input
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                placeholder="you@company.com"
                required
              />
            </label>
            <button className="primary large" type="submit">
              Email reset link
              <ChevronRight size={17} />
            </button>
            <button
              type="button"
              className="link-button"
              onClick={() => setMode("login")}
            >
              Back to sign in
            </button>
          </form>
        ) : (
          <>
            <form onSubmit={submit} className="auth-form">
              {isSignup && (
                <>
                  <label>
                    Name
                    <input
                      value={form.name}
                      onChange={(e) =>
                        setForm({ ...form, name: e.target.value })
                      }
                      placeholder="Your name"
                      required
                    />
                  </label>
                  <label>
                    Workspace
                    <input
                      value={form.organizationName}
                      onChange={(e) =>
                        setForm({ ...form, organizationName: e.target.value })
                      }
                      placeholder="Acme AI"
                    />
                  </label>
                </>
              )}
              <label>
                Email
                <input
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  placeholder="you@company.com"
                  required
                />
              </label>
              <label>
                Password
                <input
                  type="password"
                  value={form.password}
                  onChange={(e) =>
                    setForm({ ...form, password: e.target.value })
                  }
                  placeholder="At least 8 characters"
                  required
                />
              </label>
              <button className="primary large" type="submit">
                {isSignup ? "Create workspace" : "Enter control plane"}
                <ChevronRight size={17} />
              </button>
              <div className="auth-links">
                <button type="button" onClick={() => setMode("forgot")}>
                  Forgot password?
                </button>
              </div>
            </form>
            <div className="oauth-divider">
              <span>or continue with</span>
            </div>
            <div className="oauth-row">
              <button
                className="oauth"
                disabled={!providers.google}
                onClick={() => oauth("google")}
              >
                G <span>Google{providers.google ? "" : " · configure"}</span>
              </button>
              <button
                className="oauth"
                disabled={!providers.github}
                onClick={() => oauth("github")}
              >
                GH <span>GitHub{providers.github ? "" : " · configure"}</span>
              </button>
            </div>
          </>
        )}
        <div className="auth-note">
          <Lock size={14} /> HTTP-only sessions, tenant-scoped data, CSRF
          protection, RBAC, audit logs.
        </div>
      </div>
    </div>
  );
}

function CommandCenter({
  dashboard,
  runs,
  approvals,
  onRun,
  onInspect,
  onDecide,
}: {
  dashboard: Dashboard | null;
  runs: Run[];
  approvals: Approval[];
  onRun: () => void;
  onInspect: (id: string) => void;
  onDecide: (id: string, approved: boolean) => void;
}) {
  // --- derived from the live run feed (no extra round-trips) ---------------
  const hourly = useMemo(() => {
    const now = Date.now();
    const buckets = new Array(24).fill(0);
    const labels: string[] = [];
    for (const r of runs) {
      const ageH = Math.floor((now - new Date(r.createdAt).getTime()) / 3_600_000);
      if (ageH >= 0 && ageH < 24) buckets[23 - ageH] += 1;
    }
    for (let i = 23; i >= 0; i--) labels.push(`${new Date(now - i * 3_600_000).getHours()}:00`);
    return { buckets, labels };
  }, [runs]);
  const providerStats = useMemo(() => {
    const counts = new Map<string, number>();
    for (const r of runs) {
      const key = r.provider || "OLLAMA";
      counts.set(key, (counts.get(key) || 0) + 1);
    }
    return [...counts.entries()]
      .map(([provider, count]) => ({ provider, runs: count }))
      .sort((a, b) => b.runs - a.runs);
  }, [runs]);
  const statusStats = useMemo(() => {
    const counts = new Map<string, number>();
    for (const r of runs) counts.set(r.status, (counts.get(r.status) || 0) + 1);
    return [...counts.entries()]
      .map(([status, count]) => ({ status, runs: count }))
      .sort((a, b) => b.runs - a.runs);
  }, [runs]);
  const topAgents = useMemo(() => {
    const byAgent = new Map<string, { name: string; runs: number; failures: number }>();
    for (const r of runs) {
      const name = r.agent?.name || "Unassigned";
      const entry = byAgent.get(name) || { name, runs: 0, failures: 0 };
      entry.runs += 1;
      if (r.status === "FAILED") entry.failures += 1;
      byAgent.set(name, entry);
    }
    return [...byAgent.values()].sort((a, b) => b.runs - a.runs).slice(0, 5);
  }, [runs]);
  const pendingApprovals = useMemo(
    () => approvals.filter((a) => a.status === "PENDING").slice(0, 4),
    [approvals],
  );
  return (
    <div className="page">
      <div className="hero">
        <div>
          <span className="eyebrow">RYUKSAIDSO COMMAND CENTER</span>
          <h1>Agent operations, in one place.</h1>
          <p>
            Model traffic, reliability, safety gates and recent executions
            without opening seventeen tabs like civilized software forgot how to
            exist.
          </p>
        </div>
        <button className="primary" onClick={onRun}>
          <Play size={15} />
          Run an agent
        </button>
      </div>
      <div className="metric-grid">
        <Metric
          icon={Activity}
          label="Runs / 24h"
          value={dashboard?.metrics.runs24h ?? 0}
        />
        <Metric
          icon={CircleCheck}
          label="Success"
          value={
            dashboard
              ? `${Math.round(dashboard.metrics.successRate * 100)}%`
              : "0%"
          }
          tone="good"
        />
        <Metric
          icon={Clock3}
          label="P95 latency"
          value={`${dashboard?.metrics.p95LatencyMs ?? 0} ms`}
        />
        <Metric
          icon={AlertTriangle}
          label="Failures"
          value={dashboard?.metrics.failed24h ?? 0}
          tone="bad"
        />
        <Metric
          icon={ShieldCheck}
          label="Pending approvals"
          value={dashboard?.metrics.pendingApprovals ?? approvals.length}
          tone="warn"
        />
        <Metric
          icon={Database}
          label="Knowledge docs"
          value={dashboard?.metrics.documents ?? 0}
        />
      </div>
      <div className="command-grid">
        <section className="panel">
          <PanelHeader
            icon={LineChart}
            title="Execution pulse"
            sub={`${dashboard?.metrics.provider || "OLLAMA"} · ${dashboard?.metrics.model || "model not selected"}`}
          />
          <SparkBars
            values={runs
              .slice(0, 18)
              .reverse()
              .map((r) =>
                r.status === "COMPLETED"
                  ? 1
                  : r.status === "FAILED"
                    ? -0.8
                    : 0.35,
              )}
            labels={runs
              .slice(0, 18)
              .reverse()
              .map((r) => r.status.slice(0, 3))}
          />
          <div className="mini-kpis">
            <div>
              <span>Queue</span>
              <b>{runs.filter((r) => r.status === "QUEUED").length}</b>
            </div>
            <div>
              <span>Running</span>
              <b>{runs.filter((r) => r.status === "RUNNING").length}</b>
            </div>
            <div>
              <span>Approval</span>
              <b>
                {runs.filter((r) => r.status === "WAITING_APPROVAL").length}
              </b>
            </div>
            <div>
              <span>Provider</span>
              <b>{dashboard?.metrics.provider || "OLLAMA"}</b>
            </div>
          </div>
        </section>
        <section className="panel">
          <PanelHeader
            icon={Rocket}
            title="Ship signal"
            sub="Latest reliability snapshot"
          />
          <div className="ship-card">
            <div className="ship-ring">
              <span>
                {Math.round((dashboard?.metrics.successRate || 0) * 100)}%
              </span>
              <small>success</small>
            </div>
            <div>
              <b>{dashboard?.latestEvaluation?.name || "No evaluation yet"}</b>
              <p>
                {dashboard?.latestEvaluation
                  ? `Latest score ${Math.round(dashboard.latestEvaluation.score * 100)}%.`
                  : "Create a regression suite to quantify agent behavior."}
              </p>
            </div>
          </div>
          <div className="mini-list">
            <div>
              <span>Active agents</span>
              <b>{dashboard?.agents.length || 0}</b>
            </div>
            <div>
              <span>Projects</span>
              <b>{dashboard?.projects.length || 0}</b>
            </div>
            <div>
              <span>Safety gates</span>
              <b>{approvals.length}</b>
            </div>
          </div>
        </section>
      </div>
      <div className="command-grid">
        <section className="panel">
          <PanelHeader
            icon={LineChart}
            title="Throughput · last 24 hours"
            sub="Runs per hour across the workspace"
          />
          <AreaChart values={hourly.buckets} labels={hourly.labels} />
          <div className="status-mix">
            <div className="status-mix-bar">
              {statusStats.map((s, i) => (
                <i
                  key={s.status}
                  className={`seg ${s.status.toLowerCase()}`}
                  title={`${s.status}: ${s.runs}`}
                  style={{
                    width: `${(s.runs / Math.max(1, runs.length)) * 100}%`,
                    background:
                      s.status === "FAILED"
                        ? "var(--bad)"
                        : i === 0
                          ? "var(--accent)"
                          : "var(--line-strong)",
                  }}
                />
              ))}
            </div>
            <div className="status-mix-legend">
              {statusStats.map((s) => (
                <span key={s.status}>
                  <b>{s.runs}</b> {s.status.toLowerCase().replace(/_/g, " ")}
                </span>
              ))}
            </div>
          </div>
        </section>
        <section className="panel">
          <PanelHeader
            icon={Globe2}
            title="Provider split"
            sub="Which gateway served the recent runs"
          />
          <SegmentedDonut
            segments={providerStats.map((p, i) => ({
              label: p.provider,
              value: p.runs,
              color: i === 0 ? "var(--accent)" : "var(--accent2)",
            }))}
            centerValue={runs.length}
            centerLabel="runs"
          />
        </section>
      </div>
      <div className="layout-2">
        <section className="panel">
          <PanelHeader
            icon={Bot}
            title="Top agents right now"
            sub="Ranked by executions in the recent run feed"
          />
          <div className="agent-ranking">
            {topAgents.map((a) => (
              <div key={a.name}>
                <div>
                  <b>{a.name}</b>
                  <span>
                    {a.runs} runs{a.failures ? ` · ${a.failures} failed` : ""}
                  </span>
                </div>
                <div className="rank-track">
                  <i
                    style={{
                      width: `${Math.min(100, (a.runs / Math.max(1, topAgents[0]?.runs || 1)) * 100)}%`,
                    }}
                  />
                </div>
              </div>
            ))}
            {!topAgents.length && (
              <Empty
                title="No activity yet"
                text="Launch a run to populate the leaderboard."
              />
            )}
          </div>
        </section>
        <section className="panel">
          <PanelHeader
            icon={ShieldCheck}
            title="Awaiting approval"
            sub="Decide without leaving the command center"
          />
          <div className="approval-list">
            {pendingApprovals.map((a) => (
              <div className="approval-card" key={a.id}>
                <div className="risk-icon">
                  <Shield size={15} />
                </div>
                <div className="approval-copy">
                  <div>
                    <b>{a.action}</b>
                  </div>
                  <span>
                    run {a.runId.slice(-8)} · {formatWhen(a.createdAt)}
                  </span>
                </div>
                <div className="approval-actions">
                  <button
                    className="primary"
                    onClick={() => onDecide(a.id, true)}
                    title="Approve"
                  >
                    <Check size={13} />
                    Approve
                  </button>
                  <button
                    className="ghost"
                    onClick={() => onDecide(a.id, false)}
                    title="Reject"
                  >
                    <X size={13} />
                    Reject
                  </button>
                </div>
              </div>
            ))}
            {!pendingApprovals.length && (
              <Empty
                title="All clear"
                text="No approvals are waiting for a human right now."
              />
            )}
          </div>
        </section>
      </div>
      <section className="panel">
        <PanelHeader
          icon={FileClock}
          title="Latest runs"
          sub="Click a run to inspect the durable trace"
        />
        <div className="table-list">
          {runs.slice(0, 8).map((r) => (
            <RunRow key={r.id} run={r} onClick={onInspect} />
          ))}
          {!runs.length && (
            <Empty
              title="No runs yet"
              text="Launch your first agent execution from Run Lab."
            />
          )}
        </div>
      </section>
    </div>
  );
}

function RunLab({
  agents,
  projects,
  form,
  setForm,
  selectedAgent,
  running,
  providerState,
  onSubmit,
}: {
  agents: Agent[];
  projects: Project[];
  form: any;
  setForm: (x: any) => void;
  selectedAgent?: Agent;
  running: boolean;
  providerState: ProviderState | null;
  onSubmit: (e: FormEvent) => void;
}) {
  const selectedProvider = providerState?.providers.find(
    (p) => p.provider === form.provider,
  );
  return (
    <div className="page">
      <div className="hero compact">
        <div>
          <span className="eyebrow">EXECUTION LAB</span>
          <h1>Run a real execution.</h1>
          <p>
            Choose the model gateway, queue work, then inspect every persisted
            step.
          </p>
        </div>
        <span className="live-pill">
          <span className="pulse" />
          ASYNCHRONOUS WORKER
        </span>
      </div>
      <div className="lab-layout">
        <form className="panel lab-form" onSubmit={onSubmit}>
          <PanelHeader
            icon={Play}
            title="Execution request"
            sub="Ollama and OmniRoute use the same OpenAI-compatible contract."
          />
          <div className="provider-pills">
            <button
              type="button"
              className={form.provider === "OLLAMA" ? "active" : ""}
              onClick={() => setForm({ ...form, provider: "OLLAMA" })}
            >
              Ollama
            </button>
            <button
              type="button"
              className={form.provider === "OMNIROUTE" ? "active" : ""}
              onClick={() => setForm({ ...form, provider: "OMNIROUTE" })}
            >
              OmniRoute
            </button>
          </div>
          <label>
            Model
            <input
              list="models"
              value={
                providerState?.providers.find(
                  (p) => p.provider === form.provider,
                )?.selectedModel || ""
              }
              onChange={(e) => {
                const val = e.target.value;
                setForm({ ...form });
              }}
              placeholder="Configured in Settings"
              readOnly
            />
          </label>
          <datalist id="models">
            {selectedProvider?.models.map((m) => (
              <option key={m} value={m} />
            ))}
          </datalist>
          <label>
            Agent
            <select
              value={form.agentId}
              onChange={(e) =>
                setForm({
                  ...form,
                  agentId: e.target.value,
                  projectId:
                    agents.find((a) => a.id === e.target.value)?.projectId ||
                    "",
                })
              }
            >
              {agents.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                  {a.enabled ? "" : " · disabled"}
                </option>
              ))}
            </select>
          </label>
          <label>
            Project
            <select
              value={form.projectId}
              onChange={(e) => setForm({ ...form, projectId: e.target.value })}
            >
              <option value="">Agent default</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Environment
            <select
              value={form.environment}
              onChange={(e) =>
                setForm({ ...form, environment: e.target.value })
              }
            >
              <option>development</option>
              <option>staging</option>
              <option>production</option>
            </select>
          </label>
          <label>
            Prompt
            <textarea
              value={form.prompt}
              onChange={(e) => setForm({ ...form, prompt: e.target.value })}
              placeholder="Investigate the customer sign-in issue using relevant knowledge and return an evidence-backed response."
              rows={11}
              required
            />
          </label>
          <button
            className="primary large"
            disabled={running || !selectedAgent?.enabled}
          >
            {running ? "Queueing…" : "Start execution"}
            <Play size={17} />
          </button>
        </form>
        <div className="panel lab-side">
          <PanelHeader
            icon={Bot}
            title={selectedAgent?.name || "Select an agent"}
            sub={selectedAgent?.project?.name || "Agent profile"}
          />
          <div className="code-block">
            <div className="code-line">
              <span>provider</span>
              <b>{form.provider}</b>
            </div>
            <div className="code-line">
              <span>model</span>
              <b>
                {selectedProvider?.selectedModel || "Configure in Settings"}
              </b>
            </div>
            <div className="code-line">
              <span>tools</span>
              <b>
                {Array.isArray(selectedAgent?.tools)
                  ? selectedAgent?.tools.length
                  : 0}
              </b>
            </div>
            <div className="code-line">
              <span>approval</span>
              <b>policy gated</b>
            </div>
            <div className="code-line">
              <span>trace</span>
              <b>persistent</b>
            </div>
          </div>
          {selectedAgent && (
            <div className="agent-prompt">
              <span className="eyebrow">SYSTEM INSTRUCTIONS</span>
              <p>{selectedAgent.instructions}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function AgentsView({
  agents,
  projects,
  form,
  setForm,
  toolCatalog,
  onCreate,
  onToggle,
  onPublish,
}: {
  agents: Agent[];
  projects: Project[];
  form: any;
  setForm: (x: any) => void;
  toolCatalog: ToolMeta[];
  onCreate: (e: FormEvent) => void;
  onToggle: (a: Agent) => void;
  onPublish: (a: Agent) => void;
}) {
  return (
    <div className="page">
      <div className="hero compact">
        <div>
          <span className="eyebrow">AGENT REGISTRY</span>
          <h1>Agents with versions and controls.</h1>
          <p>
            Keep agent instructions, tool scopes, versions and runtime status in
            one registry.
          </p>
        </div>
      </div>
      <div className="layout-2">
        <section className="panel">
          <PanelHeader
            icon={Bot}
            title="Registered agents"
            sub={`${agents.length} agents in this workspace`}
          />
          <div className="agent-grid">
            {agents.map((a) => (
              <div className="agent-card" key={a.id}>
                <div className="agent-card-top">
                  <div className="agent-badge">
                    <Bot size={17} />
                  </div>
                  <div>
                    <b>{a.name}</b>
                    <span>
                      {a.project?.name || "Unassigned"} · {a._count?.runs || 0}{" "}
                      runs
                    </span>
                  </div>
                  <button
                    className={`toggle ${a.enabled ? "on" : ""}`}
                    onClick={() => onToggle(a)}
                  >
                    {a.enabled ? "ON" : "OFF"}
                  </button>
                </div>
                <p>{a.instructions}</p>
                <div className="agent-footer">
                  <span>
                    {a._count?.versions || a.versions?.length || 0} versions
                  </span>
                  <span
                    title={
                      Array.isArray(a.tools) ? a.tools.join(", ") : undefined
                    }
                  >
                    {Array.isArray(a.tools) ? a.tools.length : 0} tools
                  </span>
                  {a.systemPrompt ? (
                    <span className="prompt-badge" title={a.systemPrompt}>
                      custom prompt
                    </span>
                  ) : null}
                  <button className="ghost" onClick={() => onPublish(a)}>
                    Publish version
                  </button>
                </div>
              </div>
            ))}
            {!agents.length && (
              <Empty
                title="No agents"
                text="Create your first agent from the form."
              />
            )}
          </div>
        </section>
        <section className="panel">
          <PanelHeader
            icon={Plus}
            title="Create agent"
            sub="Every agent begins with a durable version."
          />
          <form className="stack-form" onSubmit={onCreate}>
            <label>
              Name
              <input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                required
              />
            </label>
            <label>
              Slug
              <input
                value={form.slug}
                onChange={(e) => setForm({ ...form, slug: toSlug(e.target.value) })}
                placeholder="research-agent"
                required
              />
            </label>
            <label>
              Project
              <select
                value={form.projectId}
                onChange={(e) =>
                  setForm({ ...form, projectId: e.target.value })
                }
              >
                <option value="">First active project</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Instructions
              <textarea
                rows={8}
                value={form.instructions}
                onChange={(e) =>
                  setForm({ ...form, instructions: e.target.value })
                }
                placeholder="Define goals, tool boundaries, output behavior and safety requirements."
                required
              />
            </label>
            <label>
              Custom system prompt <span className="muted">(optional)</span>
              <textarea
                rows={6}
                value={form.systemPrompt ?? ""}
                onChange={(e) =>
                  setForm({ ...form, systemPrompt: e.target.value })
                }
                placeholder="e.g. You are a terse support engineer. Always answer with bullet points, cite the tool evidence you used, and never invent facts."
              />
              <span className="field-hint">
                Overrides Instructions as the runtime system prompt when set —
                applied to the planner, tool drafts and the final answer.
              </span>
            </label>
            <div className="tool-picker">
              <span className="tool-picker-title">Tools this agent can use</span>
              {Object.entries(
                toolCatalog.reduce<Record<string, ToolMeta[]>>((groups, t) => {
                  const key = t.category || "Other";
                  (groups[key] ||= []).push(t);
                  return groups;
                }, {}),
              ).map(([category, list]) => (
                <div className="tool-group" key={category}>
                  <span className="tool-group-title">{category}</span>
                  {list.map((t) => {
                    const selected =
                      Array.isArray(form.tools) && form.tools.includes(t.name);
                    return (
                      <label className="checkbox" key={t.name}>
                        <input
                          type="checkbox"
                          checked={selected}
                          onChange={() =>
                            setForm({
                              ...form,
                              tools: selected
                                ? (form.tools as string[]).filter(
                                    (x) => x !== t.name,
                                  )
                                : [...((form.tools as string[]) ?? []), t.name],
                            })
                          }
                        />
                        <span className="tool-copy">
                          <b>{t.name}</b>
                          <i>{t.description}</i>
                          <em>
                            {t.scope}
                            {t.requiresApproval ? " · approval required" : ""}
                          </em>
                        </span>
                      </label>
                    );
                  })}
                </div>
              ))}
              {!toolCatalog.length && (
                <span className="muted">
                  Tool catalog unavailable — reload the page to pick tools.
                </span>
              )}
              {!!toolCatalog.length && (
                <span className="muted tool-mcp-hint">
                  Add GitHub / Notion / Slack / Linear tools by setting MCP_SERVERS
                  — they appear here as mcp__server__tool.
                </span>
              )}
            </div>
            <button className="primary" type="submit">
              <Plus size={15} />
              Create agent
            </button>
          </form>
        </section>
      </div>
    </div>
  );
}

function ProjectsView({
  projects,
  form,
  setForm,
  onCreate,
}: {
  projects: Project[];
  form: any;
  setForm: (x: any) => void;
  onCreate: (e: FormEvent) => void;
}) {
  return (
    <div className="page">
      <div className="hero compact">
        <div>
          <span className="eyebrow">PROJECTS</span>
          <h1>Organize agent systems by product.</h1>
          <p>
            Production versions, project health and agent ownership stay visible
            together.
          </p>
        </div>
      </div>
      <div className="layout-2">
        <section className="panel">
          <PanelHeader
            icon={Layers3}
            title="Projects"
            sub={`${projects.length} active workspaces`}
          />
          <div className="project-list">
            {projects.map((p) => (
              <div className="project-row" key={p.id}>
                <div className="project-icon">
                  <Layers3 size={16} />
                </div>
                <div>
                  <b>{p.name}</b>
                  <span>
                    {p.slug} · {p.status}
                  </span>
                  <p>{p.description}</p>
                </div>
                <div className="project-stats">
                  <b>{p._count?.agents || 0}</b>
                  <span>agents</span>
                  <b>{p._count?.runs || 0}</b>
                  <span>runs</span>
                </div>
              </div>
            ))}
            {!projects.length && (
              <Empty
                title="No projects"
                text="Create a project to organize your agents."
              />
            )}
          </div>
        </section>
        <section className="panel">
          <PanelHeader
            icon={Plus}
            title="Create project"
            sub="Keep the description useful. Humans will read it someday."
          />
          <form className="stack-form" onSubmit={onCreate}>
            <label>
              Name
              <input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                required
              />
            </label>
            <label>
              Slug
              <input
                value={form.slug}
                onChange={(e) => setForm({ ...form, slug: toSlug(e.target.value) })}
                placeholder="customer-ops"
                required
              />
            </label>
            <label>
              Description
              <textarea
                rows={7}
                value={form.description}
                onChange={(e) =>
                  setForm({ ...form, description: e.target.value })
                }
                required
              />
            </label>
            <button className="primary" type="submit">
              <Plus size={15} />
              Create project
            </button>
          </form>
        </section>
      </div>
    </div>
  );
}

function TicketsView({
  tickets,
  form,
  setForm,
  onCreate,
  onRun,
}: {
  tickets: Ticket[];
  form: any;
  setForm: (x: any) => void;
  onCreate: (e: FormEvent) => void;
  onRun: (t: Ticket) => void;
}) {
  return (
    <div className="page">
      <div className="hero compact">
        <div>
          <span className="eyebrow">SUPPORT OPERATIONS</span>
          <h1>Tickets are still first-class citizens.</h1>
          <p>
            The original support workflow remains available while agents operate
            as the infrastructure around it.
          </p>
        </div>
      </div>
      <div className="layout-2">
        <section className="panel">
          <PanelHeader
            icon={Ticket}
            title="Tickets"
            sub={`${tickets.length} organization-scoped tickets`}
          />
          <div className="ticket-list">
            {tickets.map((t) => (
              <div className="ticket-row" key={t.id}>
                <div>
                  <div className="ticket-title">
                    <b>{t.title}</b>
                    <span className={`tag ${t.priority.toLowerCase()}`}>
                      {t.priority}
                    </span>
                  </div>
                  <span>
                    {t.status} · {t.requesterEmail || "no requester email"}
                  </span>
                  <p>
                    {t.description.slice(0, 180)}
                    {t.description.length > 180 ? "…" : ""}
                  </p>
                  {!!t.messages?.length && (
                    <div className="ticket-thread">
                      {t.messages.map((m) => (
                        <div key={m.id} className={`msg ${m.role}`}>
                          <span>
                            {m.role === "assistant" ? "Agent" : "Human"} ·{" "}
                            {new Date(m.createdAt).toLocaleTimeString()}
                          </span>
                          <p>{m.content}</p>
                        </div>
                      ))}
                    </div>
                  )}
                  {!t.messages?.length && (
                    <span className="muted">
                      No replies yet — run the agent to start the thread.
                    </span>
                  )}
                </div>
                <button className="secondary" onClick={() => onRun(t)}>
                  <Play size={14} />
                  Run agent
                </button>
              </div>
            ))}
            {!tickets.length && (
              <Empty
                title="No tickets"
                text="Create a ticket and send it through the resolution agent."
              />
            )}
          </div>
        </section>
        <section className="panel">
          <PanelHeader
            icon={Plus}
            title="Create ticket"
            sub="Useful for testing tool-gated runs."
          />
          <form className="stack-form" onSubmit={onCreate}>
            <label>
              Title
              <input
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                required
              />
            </label>
            <label>
              Requester email
              <input
                type="email"
                value={form.requesterEmail}
                onChange={(e) =>
                  setForm({ ...form, requesterEmail: e.target.value })
                }
              />
            </label>
            <label>
              Description
              <textarea
                rows={10}
                value={form.description}
                onChange={(e) =>
                  setForm({ ...form, description: e.target.value })
                }
                required
              />
            </label>
            <button className="primary" type="submit">
              <Plus size={15} />
              Create ticket
            </button>
          </form>
        </section>
      </div>
    </div>
  );
}

function TracesView({
  runs,
  selected,
  onSelect,
  onRetry,
}: {
  runs: Run[];
  selected: Run | null;
  onSelect: (id: string) => void;
  onRetry: (id: string) => void;
}) {
  return (
    <div className="page">
      <div className="hero compact">
        <div>
          <span className="eyebrow">TRACE EXPLORER</span>
          <h1>See what every agent actually did.</h1>
          <p>
            Planner, tool gateway, synthesizer, approval state and runtime
            metrics are persisted per run.
          </p>
        </div>
      </div>
      <div className="trace-layout">
        <section className="panel trace-list">
          <PanelHeader
            icon={Workflow}
            title="Runs"
            sub={`${runs.length} recent executions`}
          />
          {runs.map((r) => (
            <button
              key={r.id}
              className={`trace-row ${selected?.id === r.id ? "selected" : ""}`}
              onClick={() => onSelect(r.id)}
            >
              <span className={`run-dot ${r.status.toLowerCase()}`} />
              <div>
                <b>{r.agent?.name || "Agent run"}</b>
                <span>
                  {r.provider} · {r.environment}
                </span>
              </div>
              <strong>{r.status}</strong>
              <small>
                {r.latencyMs ? `${r.latencyMs}ms` : formatWhen(r.createdAt)}
              </small>
            </button>
          ))}
          {!runs.length && (
            <Empty
              title="No trace data"
              text="Start an execution from Run Lab."
            />
          )}
        </section>
        <section className="panel trace-detail">
          {!selected ? (
            <div className="trace-empty">
              <Workflow size={30} />
              <h3>Select a run</h3>
              <p>
                The durable trace will show execution steps, tool outputs,
                approvals, tokens and latency.
              </p>
            </div>
          ) : (
            <>
              <div className="trace-head">
                <div>
                  <span className="eyebrow">RUN {selected.id.slice(-12)}</span>
                  <h2>
                    {selected.agent?.name || "Agent"}{" "}
                    <span>· {selected.provider}</span>
                  </h2>
                  <p>
                    {selected.environment} · {selected.status} ·{" "}
                    {new Date(selected.createdAt).toLocaleString()}
                  </p>
                </div>
                <div className="trace-actions">
                  <button
                    className="secondary"
                    onClick={() => onRetry(selected.id)}
                  >
                    <RefreshCw size={14} />
                    Retry
                  </button>
                </div>
              </div>
              <div className="trace-metrics">
                <div>
                  <span>Latency</span>
                  <b>{selected.latencyMs ?? 0} ms</b>
                </div>
                <div>
                  <span>Tokens</span>
                  <b>{selected.tokenUsage}</b>
                </div>
                <div>
                  <span>Steps</span>
                  <b>{selected.steps?.length || 0}</b>
                </div>
                <div>
                  <span>Approval</span>
                  <b>
                    {selected.approvals?.filter((a) => a.status === "PENDING")
                      .length || 0}
                  </b>
                </div>
              </div>
              <div className="trace-input">
                <span className="eyebrow">INPUT</span>
                <p>{String(selected.input?.prompt || "")}</p>
              </div>
              {selected.error && (
                <div className="step-error full">{selected.error}</div>
              )}
              <div className="trace-steps">
                {(selected.steps || []).map((step) => (
                  <div className="step" key={step.id}>
                    <div className="step-index">{step.stepIndex + 1}</div>
                    <div className="step-body">
                      <div className="step-top">
                        <div>
                          <b>{step.agent}</b>
                          <span>
                            {step.action} · {step.status}
                          </span>
                        </div>
                        <div>
                          <small>{step.durationMs ?? 0} ms</small>
                          <small>{step.tokens} tok</small>
                        </div>
                      </div>
                      <pre>{pretty(step.output ?? step.input)}</pre>
                      {step.error && (
                        <div className="step-error">{step.error}</div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </section>
      </div>
    </div>
  );
}

function EvaluationsView({
  name,
  setName,
  agentId,
  setAgentId,
  dataset,
  setDataset,
  agents,
  evaluations,
  running,
  onSubmit,
}: {
  name: string;
  setName: (x: string) => void;
  agentId: string;
  setAgentId: (x: string) => void;
  dataset: string;
  setDataset: (x: string) => void;
  agents: Agent[];
  evaluations: Evaluation[];
  running: boolean;
  onSubmit: (e: FormEvent) => void;
}) {
  return (
    <div className="page">
      <div className="hero compact">
        <div>
          <span className="eyebrow">EVALUATION LAB</span>
          <h1>Measure before you ship.</h1>
          <p>
            Build lightweight regression suites against the currently configured
            provider and agent instructions.
          </p>
        </div>
      </div>
      <div className="layout-2">
        <section className="panel">
          <PanelHeader
            icon={TestTube2}
            title="Regression suite"
            sub="Expected intent vs model prediction"
          />
          <form className="stack-form" onSubmit={onSubmit}>
            <label>
              Name
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Billing regression v1"
              />
            </label>
            <label>
              Agent
              <select
                value={agentId}
                onChange={(e) => setAgentId(e.target.value)}
              >
                {agents.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Dataset JSON
              <textarea
                rows={18}
                value={dataset}
                onChange={(e) => setDataset(e.target.value)}
              />
            </label>
            <button className="primary" type="submit" disabled={running}>
              <TestTube2 size={15} />
              {running ? "Running…" : "Run evaluation"}
            </button>
            {running && (
              <span className="muted">
                Classifying each case against the configured provider — this can
                take a moment.
              </span>
            )}
          </form>
        </section>
        <section className="panel">
          <PanelHeader
            icon={Gauge}
            title="Evaluation contract"
            sub="The API persists raw dataset and results."
          />
          <div className="security-list">
            <div>
              <CircleCheck size={16} />
              <span>Tenant-scoped dataset storage</span>
            </div>
            <div>
              <CircleCheck size={16} />
              <span>Provider selection inherited from workspace</span>
            </div>
            <div>
              <CircleCheck size={16} />
              <span>Results persisted for comparison</span>
            </div>
            <div>
              <CircleCheck size={16} />
              <span>Failed cases remain visible for debugging</span>
            </div>
          </div>
        </section>
      </div>
      <section className="panel">
        <PanelHeader
          icon={Gauge}
          title="Run history"
          sub={`${evaluations.length} suite${
            evaluations.length === 1 ? "" : "s"
          } persisted with per-case results`}
        />
        <div className="eval-list">
          {evaluations.map((ev) => {
            const score = ev.results?.score ?? 0;
            const cases = ev.results?.results ?? [];
            const agent = agents.find((a) => a.id === ev.agentId);
            return (
              <div className="eval-row" key={ev.id}>
                <div className="eval-head">
                  <b>{ev.name}</b>
                  <span className={score >= 0.5 ? "good-text" : "bad-text"}>
                    {Math.round(score * 100)}%
                  </span>
                  <span className="muted">
                    {agent?.name ?? "no agent"} · {cases.length} case
                    {cases.length === 1 ? "" : "s"} ·{" "}
                    {new Date(ev.createdAt).toLocaleString()}
                  </span>
                </div>
                <div className="eval-cases">
                  {cases.map((c, i) => (
                    <div
                      key={c.id ?? i}
                      className={`case ${c.passed ? "ok" : "bad"}`}
                    >
                      <span>{c.id || `case ${i + 1}`}</span>
                      <span>expected: {c.expected}</span>
                      <span>
                        {c.error
                          ? `error: ${c.error.slice(0, 90)}`
                          : `predicted: ${c.predicted ?? "—"}`}
                      </span>
                    </div>
                  ))}
                  {!cases.length && (
                    <span className="muted">No case results stored.</span>
                  )}
                </div>
              </div>
            );
          })}
          {!evaluations.length && (
            <Empty
              title="No evaluations yet"
              text="Run the suite — scores and per-case predictions will be persisted here."
            />
          )}
        </div>
      </section>
    </div>
  );
}

function ApprovalsView({
  approvals,
  onDecision,
  runs,
}: {
  approvals: Approval[];
  onDecision: (id: string, a: boolean) => void;
  runs: Run[];
}) {
  return (
    <div className="page">
      <div className="hero compact">
        <div>
          <span className="eyebrow">APPROVAL CENTER</span>
          <h1>Human review for risky actions.</h1>
          <p>
            Policies pause side effects before execution and create continuation
            runs after approval.
          </p>
        </div>
      </div>
      <div className="layout-2">
        <section className="panel">
          <PanelHeader
            icon={ShieldCheck}
            title="Pending approvals"
            sub={`${approvals.length} action${approvals.length === 1 ? "" : "s"} waiting`}
          />
          <div className="approval-list">
            {approvals.map((a) => (
              <div className="approval-card" key={a.id}>
                <div className="risk-icon">
                  <ShieldCheck size={18} />
                </div>
                <div className="approval-copy">
                  <div>
                    <b>{a.action}</b>
                    <span>Run {a.runId.slice(-10)}</span>
                  </div>
                  <p>
                    {typeof a.payload?.reason === "string"
                      ? a.payload.reason
                      : "Agent requested a gated action."}
                  </p>
                  <pre>{pretty(a.payload)}</pre>
                </div>
                <div className="approval-actions">
                  <button
                    className="secondary"
                    onClick={() => onDecision(a.id, false)}
                  >
                    Reject
                  </button>
                  <button
                    className="primary"
                    onClick={() => onDecision(a.id, true)}
                  >
                    Approve
                  </button>
                </div>
              </div>
            ))}
            {!approvals.length && (
              <Empty
                title="Nothing waiting"
                text="The policy gates are quiet. Enjoy the temporary illusion of control."
              />
            )}
          </div>
        </section>
        <section className="panel">
          <PanelHeader
            icon={ListIcon}
            title="Waiting runs"
            sub="The trace remains intact while approval is pending."
          />
          {runs
            .filter((r) => r.status === "WAITING_APPROVAL")
            .map((r) => (
              <RunRow key={r.id} run={r} onClick={() => {}} />
            ))}
          {!runs.some((r) => r.status === "WAITING_APPROVAL") && (
            <div className="empty-row">No runs are currently waiting.</div>
          )}
        </section>
      </div>
    </div>
  );
}
function ListIcon({ size = 16 }: { size?: number }) {
  return <FileClock size={size} />;
}

function KnowledgeView({
  documents,
  agents,
  form,
  setForm,
  onSubmit,
}: {
  documents: DocumentRow[];
  agents: Agent[];
  form: any;
  setForm: (x: any) => void;
  onSubmit: (e: FormEvent) => void;
}) {
  const agentName = (id?: string | null) =>
    id ? agents.find((a) => a.id === id)?.name ?? "Unknown agent" : null;
  return (
    <div className="page">
      <div className="hero compact">
        <div>
          <span className="eyebrow">TENANT KNOWLEDGE</span>
          <h1>Give agents evidence, not vibes.</h1>
          <p>
            Documents are retrieved by the agents they belong to — assign one to
            a specific agent or keep it shared across the workspace.
          </p>
        </div>
      </div>
      <div className="layout-2">
        <section className="panel">
          <PanelHeader
            icon={Database}
            title="Knowledge base"
            sub={`${documents.length} documents`}
          />
          <div className="doc-list">
            {documents.map((d) => (
              <div className="doc-row" key={d.id}>
                <div className="doc-icon">
                  <Database size={17} />
                </div>
                <div>
                  <b>{d.title}</b>
                  <span>
                    {d.source} · {new Date(d.createdAt).toLocaleString()} ·{" "}
                    {agentName(d.agentId)
                      ? `for ${agentName(d.agentId)}`
                      : "all agents"}
                  </span>
                  <p>
                    {d.content.slice(0, 220)}
                    {d.content.length > 220 ? "…" : ""}
                  </p>
                </div>
              </div>
            ))}
            {!documents.length && (
              <Empty
                title="Knowledge base is empty"
                text="Add a runbook, FAQ, policy or architecture note."
              />
            )}
          </div>
        </section>
        <section className="panel">
          <PanelHeader
            icon={Plus}
            title="Ingest document"
            sub="Stored in Postgres and exposed to scoped retrieval."
          />
          <form className="stack-form" onSubmit={onSubmit}>
            <label>
              Title
              <input
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                required
              />
            </label>
            <label>
              Source
              <input
                value={form.source}
                onChange={(e) => setForm({ ...form, source: e.target.value })}
              />
            </label>
            <label>
              Which agent is this knowledge for?
              <select
                value={form.agentId || ""}
                onChange={(e) =>
                  setForm({ ...form, agentId: e.target.value })
                }
              >
                <option value="">
                  All agents (shared across the workspace)
                </option>
                {agents.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Content
              <textarea
                rows={13}
                value={form.content}
                onChange={(e) => setForm({ ...form, content: e.target.value })}
                required
              />
            </label>
            <button className="primary" type="submit">
              <Plus size={15} />
              Add document
            </button>
          </form>
        </section>
      </div>
    </div>
  );
}

function PoliciesView({
  policies,
  form,
  setForm,
  onCreate,
  onToggle,
}: {
  policies: Policy[];
  form: any;
  setForm: (x: any) => void;
  onCreate: (e: FormEvent) => void;
  onToggle: (p: Policy) => void;
}) {
  return (
    <div className="page">
      <div className="hero compact">
        <div>
          <span className="eyebrow">SAFETY POLICIES</span>
          <h1>Turn guardrails into code.</h1>
          <p>Policy scopes map to tool permissions and approval gates.</p>
        </div>
      </div>
      <div className="layout-2">
        <section className="panel">
          <PanelHeader
            icon={Shield}
            title="Policy set"
            sub={`${policies.length} rules`}
          />
          <div className="policy-list">
            {policies.map((p) => (
              <div className="policy-row" key={p.id}>
                <div className={`severity ${p.severity}`} />
                <div className="policy-copy">
                  <div>
                    <b>{p.name}</b>
                    <span>{p.action}</span>
                  </div>
                  <p>{p.description}</p>
                  <div className="tag-row">
                    <span>{p.severity}</span>
                    <span>
                      {p.requiresApproval
                        ? "approval required"
                        : "auto allowed"}
                    </span>
                  </div>
                </div>
                <button
                  className={`toggle ${p.enabled ? "on" : ""}`}
                  onClick={() => onToggle(p)}
                >
                  {p.enabled ? "ON" : "OFF"}
                </button>
              </div>
            ))}
            {!policies.length && (
              <Empty
                title="No policy rules"
                text="A surprisingly bold way to deploy agents."
              />
            )}
          </div>
        </section>
        <section className="panel">
          <PanelHeader
            icon={Plus}
            title="New policy"
            sub="Action scope names match tool scopes."
          />
          <form className="stack-form" onSubmit={onCreate}>
            <label>
              Name
              <input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                required
              />
            </label>
            <label>
              Action scope
              <input
                value={form.action}
                onChange={(e) => setForm({ ...form, action: e.target.value })}
                required
              />
            </label>
            <label>
              Severity
              <select
                value={form.severity}
                onChange={(e) => setForm({ ...form, severity: e.target.value })}
              >
                <option>low</option>
                <option>medium</option>
                <option>high</option>
                <option>critical</option>
              </select>
            </label>
            <label>
              Description
              <textarea
                rows={6}
                value={form.description}
                onChange={(e) =>
                  setForm({ ...form, description: e.target.value })
                }
                required
              />
            </label>
            <label className="checkbox">
              <input
                type="checkbox"
                checked={form.requiresApproval}
                onChange={(e) =>
                  setForm({ ...form, requiresApproval: e.target.checked })
                }
              />
              Require human approval
            </label>
            <button className="primary" type="submit">
              <Plus size={15} />
              Create policy
            </button>
          </form>
        </section>
      </div>
    </div>
  );
}

function DeveloperView({
  keys,
  name,
  setName,
  secret,
  setSecret,
  onCreate,
  providerState,
}: {
  keys: ApiKey[];
  name: string;
  setName: (x: string) => void;
  secret: string;
  setSecret: (x: string) => void;
  onCreate: (e: FormEvent) => void;
  providerState: ProviderState | null;
}) {
  return (
    <div className="page">
      <div className="hero compact">
        <div>
          <span className="eyebrow">DEVELOPER SURFACE</span>
          <h1>Integrate without duct tape.</h1>
          <p>
            Bearer API keys, model gateways, and a stable control-plane
            contract.
          </p>
        </div>
      </div>
      <div className="layout-2">
        <section className="panel">
          <PanelHeader
            icon={KeyRound}
            title="API keys"
            sub="Secrets are hashed and shown only once."
          />
          <form className="inline-form" onSubmit={onCreate}>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="ci-runner"
              required
            />
            <button className="primary" type="submit">
              <Plus size={15} />
              Create key
            </button>
          </form>
          {secret && (
            <div className="secret-box">
              <span className="eyebrow">COPY NOW</span>
              <code>{secret}</code>
              <button className="ghost" onClick={() => setSecret("")}>
                Hide
              </button>
            </div>
          )}
          <div className="key-list">
            {keys.map((k) => (
              <div className="key-row" key={k.id}>
                <KeyRound size={16} />
                <div>
                  <b>{k.name}</b>
                  <span>
                    {k.prefix}•••• · created{" "}
                    {new Date(k.createdAt).toLocaleString()}
                  </span>
                </div>
              </div>
            ))}
            {!keys.length && (
              <Empty
                title="No API keys"
                text="Create one for CI, integrations or scripted agent runs."
              />
            )}
          </div>
        </section>
        <section className="panel">
          <PanelHeader
            icon={Code2}
            title="API contract"
            sub="Session cookies or workspace bearer keys."
          />
          <pre className="code-doc">{`curl -X POST http://localhost:4001/api/control/runs \\
  -H "Authorization: Bearer rsk_..." \\
  -H "Content-Type: application/json" \\
  -d '{\n    "agentId":"<agent-id>",\n    "provider":"${providerState?.current || "OLLAMA"}",\n    "prompt":"Investigate the incident"\n  }'`}</pre>
          <div className="hint">
            <Lock size={15} />
            Tenant isolation is enforced from the key’s workspace.
          </div>
        </section>
      </div>
    </div>
  );
}

function SettingsView({
  profile,
  profileForm,
  setProfileForm,
  onProfile,
  onVerifyEmail,
  passwordForm,
  setPasswordForm,
  onPassword,
  workspaceName,
  setWorkspaceName,
  onWorkspace,
  providerState,
  provider,
  setProvider,
  model,
  setModel,
  onProvider,
  members,
  canManageMembers,
  onRole,
  onRemove,
  theme,
  setTheme,
  user,
  workspaces,
  onSwitchWorkspace,
  invites,
  inviteEmail,
  setInviteEmail,
  inviteRole,
  setInviteRole,
  onInvite,
  onRevokeInvite,
  inviteResult,
  onDismissInvite,
  sendingInvite,
}: {
  profile: Profile | null;
  profileForm: any;
  setProfileForm: (x: any) => void;
  onProfile: (e: FormEvent) => void;
  onVerifyEmail: () => void;
  passwordForm: any;
  setPasswordForm: (x: any) => void;
  onPassword: (e: FormEvent) => void;
  workspaceName: string;
  setWorkspaceName: (x: string) => void;
  onWorkspace: (e: FormEvent) => void;
  providerState: ProviderState | null;
  provider: string;
  setProvider: (x: string) => void;
  model: string;
  setModel: (x: string) => void;
  onProvider: (e: FormEvent) => void;
  members: AdminOverview["members"];
  canManageMembers: boolean;
  onRole: (id: string, r: string) => void;
  onRemove: (id: string) => void;
  theme: "system" | "dark" | "light";
  setTheme: (x: any) => void;
  user: User;
  workspaces: Workspace[];
  onSwitchWorkspace: (id: string) => void;
  invites: WorkspaceInvite[];
  inviteEmail: string;
  setInviteEmail: (x: string) => void;
  inviteRole: string;
  setInviteRole: (x: string) => void;
  onInvite: (e: FormEvent) => void;
  onRevokeInvite: (id: string) => void;
  inviteResult: {
    email: string;
    role: string;
    inviteUrl: string;
    emailSent: boolean;
  } | null;
  onDismissInvite: () => void;
  sendingInvite: boolean;
}) {
  const providerInfo = providerState?.providers.find(
    (p) => p.provider === provider,
  );
  const [copied, setCopied] = useState(false);
  async function copyInvite() {
    const url = inviteResult?.inviteUrl;
    if (!url) return;
    let ok = false;
    try {
      await navigator.clipboard.writeText(url);
      ok = true;
    } catch {
      /* clipboard permission denied — fall back to a hidden textarea */
    }
    if (!ok) {
      try {
        const ta = document.createElement("textarea");
        ta.value = url;
        ta.style.position = "fixed";
        ta.style.opacity = "0";
        document.body.appendChild(ta);
        ta.select();
        ok = document.execCommand("copy");
        ta.remove();
      } catch {
        ok = false;
      }
    }
    if (ok) {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    }
  }
  return (
    <div className="page">
      <div className="hero compact">
        <div>
          <span className="eyebrow">SETTINGS</span>
          <h1>Identity, security, and model routing.</h1>
          <p>
            Profile details, workspace governance, model providers and
            appearance all live here.
          </p>
        </div>
      </div>
      <div className="settings-grid">
        <section className="panel">
          <PanelHeader
            icon={UserRound}
            title="Profile"
            sub="Update the identity shown across the workspace."
          />
          <form className="stack-form" onSubmit={onProfile}>
            <label>
              Name
              <input
                value={profileForm.name}
                onChange={(e) =>
                  setProfileForm({ ...profileForm, name: e.target.value })
                }
                required
              />
            </label>
            <label>
              Email
              <input value={profile?.email || ""} readOnly />
            </label>
            <label>
              Job title
              <input
                value={profileForm.jobTitle}
                onChange={(e) =>
                  setProfileForm({ ...profileForm, jobTitle: e.target.value })
                }
              />
            </label>
            <label>
              Bio
              <textarea
                rows={4}
                value={profileForm.bio}
                onChange={(e) =>
                  setProfileForm({ ...profileForm, bio: e.target.value })
                }
              />
            </label>
            <label>
              Avatar URL
              <input
                value={profileForm.avatarUrl}
                onChange={(e) =>
                  setProfileForm({ ...profileForm, avatarUrl: e.target.value })
                }
                placeholder="https://…"
              />
            </label>
            <label>
              Timezone
              <input
                value={profileForm.timezone}
                onChange={(e) =>
                  setProfileForm({ ...profileForm, timezone: e.target.value })
                }
                placeholder="Asia/Kolkata"
              />
            </label>
            <button className="primary" type="submit">
              <Check size={15} />
              Save profile
            </button>
          </form>
          <div className="verification-box">
            <div>
              <b>Email verification</b>
              <span>
                {profile?.emailVerifiedAt ? "Verified" : "Not verified"}
              </span>
            </div>
            {profile?.emailVerifiedAt ? (
              <span className="good-text">Verified</span>
            ) : (
              <button className="secondary" onClick={onVerifyEmail}>
                Send verification email
              </button>
            )}
          </div>
        </section>
        <section className="panel">
          <PanelHeader
            icon={KeyRound}
            title="Password"
            sub={
              profile?.emailVerifiedAt
                ? "Account security"
                : "You can also recover the account from the sign-in screen"
            }
          />
          <form className="stack-form" onSubmit={onPassword}>
            <label>
              Current password
              <input
                type="password"
                value={passwordForm.currentPassword}
                onChange={(e) =>
                  setPasswordForm({
                    ...passwordForm,
                    currentPassword: e.target.value,
                  })
                }
              />
            </label>
            <label>
              New password
              <input
                type="password"
                value={passwordForm.newPassword}
                onChange={(e) =>
                  setPasswordForm({
                    ...passwordForm,
                    newPassword: e.target.value,
                  })
                }
                placeholder="12+ characters"
                required
              />
            </label>
            <button className="secondary" type="submit">
              Change password
            </button>
          </form>
          <div className="security-list compact-list">
            <div>
              <CircleCheck size={15} />
              <span>Sessions are revoked when password changes.</span>
            </div>
            <div>
              <CircleCheck size={15} />
              <span>Reset tokens expire after 30 minutes.</span>
            </div>
          </div>
        </section>
        <section className="panel">
          <PanelHeader
            icon={Layers3}
            title="Workspace"
            sub="Switch between workspaces and manage the active tenant."
          />
          <label className="stack-label">
            Active workspace
            <select
              value={
                workspaces.find((w) => w.active)?.organization.id ||
                user.organizationId
              }
              onChange={(e) => onSwitchWorkspace(e.target.value)}
            >
              {workspaces.map((w) => (
                <option value={w.organization.id} key={w.organization.id}>
                  {w.organization.name} · {w.role}
                </option>
              ))}
            </select>
          </label>
          <form className="stack-form" onSubmit={onWorkspace}>
            <label>
              Workspace name
              <input
                value={workspaceName}
                onChange={(e) => setWorkspaceName(e.target.value)}
                minLength={2}
                maxLength={120}
                required
              />
            </label>
            <button
              className="secondary"
              type="submit"
              disabled={!canManageMembers}
            >
              <Check size={15} />
              Save workspace
            </button>
          </form>
          <div className="security-list compact-list">
            <div>
              <CircleCheck size={15} />
              <span>Data remains isolated to the active workspace.</span>
            </div>
            <div>
              <CircleCheck size={15} />
              <span>Membership roles control administrative access.</span>
            </div>
          </div>
        </section>
        <section className="panel">
          <PanelHeader
            icon={Sliders}
            title="Model provider"
            sub="Select a provider and model. The selection is persisted per workspace."
          />
          <form className="stack-form" onSubmit={onProvider}>
            <div className="provider-pills">
              <button
                type="button"
                className={provider === "OLLAMA" ? "active" : ""}
                onClick={() => {
                  setProvider("OLLAMA");
                  setModel(
                    providerState?.providers.find(
                      (p) => p.provider === "OLLAMA",
                    )?.selectedModel || "",
                  );
                }}
              >
                Ollama
              </button>
              <button
                type="button"
                className={provider === "OMNIROUTE" ? "active" : ""}
                onClick={() => {
                  setProvider("OMNIROUTE");
                  setModel(
                    providerState?.providers.find(
                      (p) => p.provider === "OMNIROUTE",
                    )?.selectedModel || "",
                  );
                }}
              >
                OmniRoute
              </button>
            </div>
            <label>
              Model
              <input
                list="settings-models"
                value={model}
                onChange={(e) => setModel(e.target.value)}
                placeholder="Select or type a model"
                required
              />
            </label>
            <datalist id="settings-models">
              {providerInfo?.models.map((m) => (
                <option key={m} value={m} />
              ))}
            </datalist>
            <div className="provider-status">
              {providerInfo?.error ? (
                <span className="bad-text">{providerInfo.error}</span>
              ) : (
                <span className="good-text">
                  {providerInfo?.models.length
                    ? `${providerInfo.models.length} models available.`
                    : "Provider is configured; enter the model name if model discovery is unavailable."}
                </span>
              )}
            </div>
            <button
              className="primary"
              type="submit"
              disabled={!canManageMembers}
            >
              <Globe2 size={15} />
              Save routing
            </button>
          </form>
        </section>
        <section className="panel">
          <PanelHeader
            icon={Sun}
            title="Appearance"
            sub="Choose how the control plane looks on this device."
          />
          <div className="theme-grid">
            {(["system", "dark", "light"] as const).map((x) => (
              <button
                key={x}
                type="button"
                className={theme === x ? "theme-option active" : "theme-option"}
                onClick={() => setTheme(x)}
              >
                {x === "system" ? (
                  <Sparkles size={17} />
                ) : x === "dark" ? (
                  <Moon size={17} />
                ) : (
                  <Sun size={17} />
                )}
                <b>{x}</b>
                <span>
                  {x === "system"
                    ? "Follow device"
                    : x === "dark"
                      ? "Dark interface"
                      : "Light interface"}
                </span>
              </button>
            ))}
          </div>
        </section>
        <section className="panel wide">
          <PanelHeader
            icon={Users}
            title="Invite teammates"
            sub="Owners and admins can invite users into this workspace."
          />
          <form className="inline-form" onSubmit={onInvite}>
            <input
              type="email"
              placeholder="teammate@company.com"
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              required
              disabled={!canManageMembers || sendingInvite}
            />
            <select
              value={inviteRole}
              onChange={(e) => setInviteRole(e.target.value)}
              disabled={!canManageMembers || sendingInvite}
            >
              <option value="VIEWER">Viewer</option>
              <option value="AGENT">Agent</option>
              <option value="ADMIN">Admin</option>
            </select>
            <button
              className="primary"
              type="submit"
              disabled={!canManageMembers || sendingInvite}
              aria-busy={sendingInvite}
            >
              {sendingInvite ? "Sending…" : "Invite"}
            </button>
          </form>

          {inviteResult && (
            <div className="secret-box" role="status">
              <b style={{ fontSize: 11 }}>
                Invitation ready for {inviteResult.email} as{" "}
                {inviteResult.role}
              </b>
              <p className="muted" style={{ margin: "6px 0 0" }}>
                {inviteResult.emailSent
                  ? "Invitation email sent. The link expires in 7 days and only works for that address."
                  : "The invitation email could not be delivered — copy the link below and share it yourself."}
              </p>
              {inviteResult.inviteUrl ? (
                <code>{inviteResult.inviteUrl}</code>
              ) : (
                <code>Invite link unavailable — ask the invitee to use the emailed link.</code>
              )}
              <div className="invite-actions">
                <button
                  className="primary"
                  type="button"
                  disabled={!inviteResult.inviteUrl}
                  onClick={copyInvite}
                >
                  {copied ? "Copied!" : "Copy invite link"}
                </button>
                <button
                  className="ghost"
                  type="button"
                  onClick={onDismissInvite}
                >
                  Dismiss
                </button>
              </div>
            </div>
          )}

          {invites
            .filter((x) => !x.acceptedAt)
            .map((i) => {
              const expired = new Date(i.expiresAt).getTime() < Date.now();
              return (
                <div className="invite-row" key={i.id}>
                  <div>
                    <b>{i.email}</b>
                    <span className={expired ? "bad-text" : undefined}>
                      {i.role} ·{" "}
                      {expired
                        ? `expired ${new Date(i.expiresAt).toLocaleDateString()}`
                        : `expires ${new Date(i.expiresAt).toLocaleDateString()}`}
                    </span>
                  </div>
                  <button
                    className="ghost"
                    onClick={() => onRevokeInvite(i.id)}
                    disabled={!canManageMembers}
                  >
                    Revoke
                  </button>
                </div>
              );
            })}
          {!invites.filter((x) => !x.acceptedAt).length && (
            <Empty
              title="No pending invitations"
              text="Invites appear here until they are accepted or revoked."
            />
          )}
        </section>
        <section className="panel wide">
          <PanelHeader
            icon={Users}
            title="Workspace members"
            sub={`${members.length} members · role changes require owner/admin access`}
          />
          <div className="member-table">
            {members.map((m) => (
              <div className="member-row" key={m.id}>
                <div className="avatar small">
                  {m.user.name.slice(0, 1).toUpperCase()}
                </div>
                <div>
                  <b>{m.user.name}</b>
                  <span>
                    {m.user.email} ·{" "}
                    {m.user.emailVerifiedAt ? "verified" : "unverified"}
                  </span>
                </div>
                <select
                  value={m.role}
                  disabled={!canManageMembers}
                  onChange={(e) => onRole(m.id, e.target.value)}
                >
                  {(user.role === "OWNER" || m.role === "OWNER") && (
                    <option value="OWNER" disabled={user.role !== "OWNER"}>
                      OWNER
                    </option>
                  )}
                  <option value="ADMIN">ADMIN</option>
                  <option>AGENT</option>
                  <option>VIEWER</option>
                </select>
                {m.user.id !== user.id && (
                  <button
                    className="ghost"
                    onClick={() => onRemove(m.id)}
                    disabled={!canManageMembers}
                  >
                    Remove
                  </button>
                )}
              </div>
            ))}
          </div>
        </section>
        <section className="panel wide">
          <PanelHeader
            icon={ShieldCheck}
            title="Security posture"
            sub="Current account and workspace controls"
          />
          <div className="security-grid">
            <div>
              <span>Role</span>
              <b>{user.role}</b>
            </div>
            <div>
              <span>Email</span>
              <b>{profile?.emailVerifiedAt ? "Verified" : "Not verified"}</b>
            </div>
            <div>
              <span>HTTP-only sessions</span>
              <b>Enabled</b>
            </div>
            <div>
              <span>CSRF</span>
              <b>Enabled</b>
            </div>
            <div>
              <span>Tenant isolation</span>
              <b>Enabled</b>
            </div>
            <div>
              <span>Audit log</span>
              <b>Enabled</b>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

function AdminView({
  data,
  viewerRole,
  onRefresh,
  onRole,
  onRemove,
  onRevokeSessions,
  onInspect,
  updatedAt,
}: {
  data: AdminOverview | null;
  viewerRole: string;
  onRefresh: () => Promise<void> | void;
  onRole: (id: string, r: string) => void;
  onRemove: (id: string) => void;
  onRevokeSessions: (id: string) => void;
  onInspect: (id: string) => void;
  updatedAt?: string | null;
}) {
  // Hooks first — the loading early-return below must not skip them.
  const [refreshing, setRefreshing] = useState(false);
  const handleRefresh = async () => {
    if (refreshing) return;
    setRefreshing(true);
    try {
      await onRefresh();
    } finally {
      setRefreshing(false);
    }
  };
  if (!data)
    return (
      <div className="page">
        <Empty
          title="Admin dashboard loading"
          text="The numbers are being fetched rather than conjured from thin air."
        />
      </div>
    );
  const max = Math.max(1, ...data.series.map((x) => x.runs));
  const maxTokens = Math.max(1, ...data.series.map((x) => x.tokens));
  const registrationDaily = data.registrations?.daily ?? [];
  const maxNew = Math.max(1, ...registrationDaily.map((x) => x.new));
  const memberBaseline = data.registrations?.beforeWindow ?? 0;
  const cumulativeMembers = registrationDaily.reduce<number[]>(
    (acc, day, i) => [...acc, (i ? acc[i - 1] : memberBaseline) + day.new],
    [],
  );
  const providerSplit = data.providerSplit ?? [];
  const statusSplit = data.statusSplit ?? [];
  const topTools = data.topTools ?? [];
  const failureRate =
    data.metrics.runs14d > 0
      ? Math.round((data.metrics.failed14d / data.metrics.runs14d) * 100)
      : 0;
  return (
    <div className="page">
      <div className="hero">
        <div>
          <span className="eyebrow">ADMIN CONTROL</span>
          <h1>Workspace command and analytics.</h1>
          <p>
            Members, agent activity, usage, failures, approvals and audit
            history from one administrative surface.
          </p>
        </div>
        <div className="hero-actions">
          {updatedAt && (
            <span className="refreshed-at">
              Updated {formatWhen(updatedAt)}
            </span>
          )}
          <button
            className="secondary"
            onClick={handleRefresh}
            disabled={refreshing}
          >
            <RefreshCw size={15} className={refreshing ? "spin" : ""} />
            {refreshing ? "Refreshing…" : "Refresh"}
          </button>
        </div>
      </div>
      <div className="metric-grid">
        <Metric icon={Users} label="Members" value={data.metrics.members} />
        <Metric icon={Layers3} label="Projects" value={data.metrics.projects} />
        <Metric icon={Bot} label="Agents" value={data.metrics.agents} />
        <Metric
          icon={Activity}
          label="Runs / 14d"
          value={data.metrics.runs14d}
        />
        <Metric
          icon={Zap}
          label="Tokens / 14d"
          value={data.metrics.tokens14d.toLocaleString()}
        />
        <Metric
          icon={Clock3}
          label="Avg latency"
          value={`${data.metrics.avgLatencyMs} ms`}
        />
        <Metric
          icon={AlertTriangle}
          label="Failure rate / 14d"
          value={`${failureRate}%`}
          tone={failureRate >= 20 ? "bad" : "good"}
        />
        <Metric
          icon={Database}
          label="Documents"
          value={data.metrics.documents}
        />
        <Metric
          icon={ShieldCheck}
          label="Pending approvals"
          value={data.metrics.pendingApprovals}
          tone="warn"
        />
        <Metric
          icon={Users}
          label="Active sessions"
          value={data.metrics.activeSessions}
        />
        <Metric icon={KeyRound} label="API keys" value={data.metrics.apiKeys} />
        <Metric
          icon={Ticket}
          label="Open tickets"
          value={data.metrics.openTickets}
        />
        <Metric
          icon={CircleCheck}
          label="Verified members"
          value={`${data.metrics.verifiedMembers}/${data.metrics.members}`}
        />
      </div>
      <div className="panel admin-provider-panel">
        <PanelHeader
          icon={Globe2}
          title="Model routing"
          sub="Workspace-wide execution defaults"
        />
        <div className="security-grid">
          <div>
            <span>Active provider</span>
            <b>{data.organization?.llmProvider || "OLLAMA"}</b>
          </div>
          <div>
            <span>Ollama model</span>
            <b>{data.organization?.ollamaModel || "Not configured"}</b>
          </div>
          <div>
            <span>OmniRoute model</span>
            <b>{data.organization?.omnirouteModel || "Not configured"}</b>
          </div>
        </div>
      </div>
      <div className="admin-grid">
        <section className="panel">
          <PanelHeader
            icon={BarChart3}
            title="Run volume"
            sub="Daily executions for the last 14 days"
          />
          <div className="chart-bars">
            {data.series.map((x) => (
              <div
                className="chart-bar-wrap"
                key={x.date}
                title={`${x.date}: ${x.runs} runs`}
              >
                <div
                  className="chart-bar"
                  style={{
                    height: `${Math.max(6, Math.round((x.runs / max) * 100))}%`,
                  }}
                />
                <span>{x.date.slice(5)}</span>
              </div>
            ))}
          </div>
        </section>
        <section className="panel">
          <PanelHeader
            icon={Gauge}
            title="Reliability mix"
            sub="Completed vs failed runs"
          />
          <div className="donut-wrap">
            <Donut
              value={
                data.metrics.completed14d /
                Math.max(1, data.metrics.completed14d + data.metrics.failed14d)
              }
            />
            <div>
              <b>{data.metrics.completed14d}</b>
              <span>completed</span>
              <b className="bad-text">{data.metrics.failed14d}</b>
              <span>failed</span>
              <b className="warn-text">{data.metrics.pendingApprovals}</b>
              <span>pending approval</span>
            </div>
          </div>
        </section>
      </div>
      <div className="admin-grid">
        <section className="panel">
          <PanelHeader
            icon={Zap}
            title="Token usage"
            sub="Daily token consumption for the last 14 days"
          />
          <AreaChart
            values={data.series.map((x) => x.tokens)}
            labels={data.series.map((x) => x.date.slice(5))}
          />
          <div className="chart-footnote">
            <span>peak {maxTokens.toLocaleString()} tokens/day</span>
            <span>{data.metrics.tokens14d.toLocaleString()} total</span>
          </div>
        </section>
        <section className="panel">
          <PanelHeader
            icon={Globe2}
            title="Provider split"
            sub="Where runs executed in the last 14 days"
          />
          <SegmentedDonut
            segments={providerSplit.map((p, i) => ({
              label: p.provider,
              value: p.runs,
              color: i === 0 ? "var(--accent)" : i === 1 ? "var(--accent2)" : "var(--warn)",
            }))}
            centerValue={data.metrics.runs14d}
            centerLabel="runs"
          />
        </section>
      </div>
      <div className="admin-grid">
        <section className="panel">
          <PanelHeader
            icon={Users}
            title="Member growth"
            sub="Cumulative members with daily signups underneath"
          />
          <AreaChart
            values={cumulativeMembers}
            labels={registrationDaily.map((x) => x.date.slice(5))}
          />
          <div className="chart-footnote">
            <span>
              {registrationDaily.reduce((n, d) => n + d.new, 0)} joined in window
            </span>
            <span>{memberBaseline} predate window</span>
          </div>
        </section>
        <section className="panel">
          <PanelHeader
            icon={Workflow}
            title="Top tools"
            sub="Most-executed agent tools in the last 14 days"
          />
          <div className="agent-ranking">
            {topTools.map((t) => (
              <div key={t.tool}>
                <div>
                  <b>{t.tool}</b>
                  <span>
                    {t.runs} runs · avg {t.avgMs} ms
                  </span>
                </div>
                <div className="rank-track">
                  <i
                    style={{
                      width: `${Math.min(100, (t.runs / Math.max(1, topTools[0]?.runs || 1)) * 100)}%`,
                    }}
                  />
                </div>
              </div>
            ))}
            {!topTools.length && (
              <Empty
                title="No tool activity"
                text="Agent runs that execute tools will populate this ranking."
              />
            )}
          </div>
        </section>
      </div>
      <section className="panel">
        <PanelHeader
          icon={ShieldCheck}
          title="System health"
          sub={
            data.health
              ? `Live dependency checks · ${formatWhen(data.health.checkedAt)}`
              : "Live dependency checks"
          }
        />
        <div className="health-grid">
          {(
            [
              {
                name: "PostgreSQL",
                ok: data.health?.db.ok,
                detail: data.health
                  ? `${data.health.db.latencyMs} ms round-trip`
                  : "not checked",
                error: data.health?.db.error,
              },
              {
                name: "Redis",
                ok: data.health?.redis.ok,
                detail: data.health
                  ? `${data.health.redis.latencyMs} ms round-trip`
                  : "not checked",
                error: data.health?.redis.error,
              },
              {
                name: `LLM · ${data.health?.llm.provider || data.organization?.llmProvider || "OLLAMA"}`,
                ok: data.health?.llm.ok,
                detail: data.health
                  ? `${data.health.llm.model || "default model"} · ${data.health.llm.latencyMs} ms`
                  : "not checked",
                error: data.health?.llm.error,
              },
            ] as { name: string; ok?: boolean; detail: string; error?: string }[]
          ).map((card) => (
            <div
              className={`health-card ${card.ok === undefined ? "unknown" : card.ok ? "up" : "down"}`}
              key={card.name}
            >
              <span className="health-dot" />
              <div>
                <b>{card.name}</b>
                <span>{card.ok === false ? card.error || "unreachable" : card.detail}</span>
              </div>
            </div>
          ))}
        </div>
        <div className="status-mix">
          {statusSplit.length > 0 && (
            <div className="status-mix-bar">
              {statusSplit.map((s, i) => (
                <i
                  key={s.status}
                  className={`seg ${s.status.toLowerCase()}`}
                  title={`${s.status}: ${s.runs}`}
                  style={{
                    width: `${(s.runs / Math.max(1, data.metrics.runs14d)) * 100}%`,
                    background:
                      i === 0
                        ? "var(--accent)"
                        : s.status === "FAILED"
                          ? "var(--bad)"
                          : "var(--line-strong)",
                  }}
                />
              ))}
            </div>
          )}
          <div className="status-mix-legend">
            {statusSplit.map((s) => (
              <span key={s.status}>
                <b>{s.runs}</b> {s.status.toLowerCase().replace(/_/g, " ")}
              </span>
            ))}
          </div>
        </div>
      </section>
      <div className="layout-2">
        <section className="panel">
          <PanelHeader
            icon={Bot}
            title="Top agents"
            sub="Most active in the last 14 days"
          />
          <div className="agent-ranking">
            {data.topAgents.map((a) => (
              <div key={a.name}>
                <div>
                  <b>{a.name}</b>
                  <span>
                    {a.runs} runs · {a.tokens.toLocaleString()} tokens
                  </span>
                </div>
                <div className="rank-track">
                  <i
                    style={{
                      width: `${Math.min(100, (a.runs / Math.max(1, data.topAgents[0]?.runs || 1)) * 100)}%`,
                    }}
                  />
                </div>
              </div>
            ))}
            {!data.topAgents.length && (
              <Empty
                title="No activity"
                text="Run some agents to populate the chart."
              />
            )}
          </div>
        </section>
        <section className="panel">
          <PanelHeader
            icon={Users}
            title="Members"
            sub="Administrative workspace roster"
          />
          <div className="member-table">
            {data.members.map((m) => (
              <div className="member-row" key={m.id}>
                <div className="avatar small">
                  {m.user.name.slice(0, 1).toUpperCase()}
                </div>
                <div>
                  <b>{m.user.name}</b>
                  <span>{m.user.email}</span>
                </div>
                <select
                  value={m.role}
                  onChange={(e) => onRole(m.id, e.target.value)}
                >
                  {(viewerRole === "OWNER" || m.role === "OWNER") && (
                    <option value="OWNER" disabled={viewerRole !== "OWNER"}>
                      OWNER
                    </option>
                  )}
                  <option value="ADMIN">ADMIN</option>
                  <option>AGENT</option>
                  <option>VIEWER</option>
                </select>
                {m.role !== "OWNER" && (
                  <button className="ghost" onClick={() => onRemove(m.id)}>
                    Remove
                  </button>
                )}
                <button
                  className="ghost"
                  onClick={() => onRevokeSessions(m.id)}
                >
                  Revoke sessions
                </button>
              </div>
            ))}
          </div>
        </section>
        <section className="panel">
          <PanelHeader
            icon={Activity}
            title="Recent runs"
            sub="Administrative visibility into the latest executions"
          />
          <div className="key-list">
            {data.recentRuns.map((r) => (
              <button
                key={r.id}
                className="run-row"
                onClick={() => onInspect(r.id)}
              >
                <span className={`run-dot ${r.status.toLowerCase()}`} />
                <div>
                  <b>{r.agent?.name || "Agent run"}</b>
                  <span>
                    {r.project?.name || "Unassigned"} · {r.provider}
                  </span>
                </div>
                <div className="run-row-right">
                  <strong>{r.status}</strong>
                  <small>{formatWhen(r.createdAt)}</small>
                </div>
              </button>
            ))}
          </div>
        </section>
      </div>
      <section className="panel">
        <PanelHeader
          icon={FileClock}
          title="Audit stream"
          sub="Recent administrative and security events"
        />
        <div className="audit-table">
          {data.auditLogs.map((x) => (
            <div key={x.id}>
              <span>{new Date(x.createdAt).toLocaleString()}</span>
              <b>{x.action}</b>
              <span>
                {x.resource}
                {x.resourceId ? ` · ${x.resourceId.slice(-10)}` : ""}
              </span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function Donut({ value }: { value: number }) {
  const pct = Math.max(0, Math.min(1, value));
  const deg = pct * 360;
  return (
    <div
      className="donut"
      style={{
        background: `conic-gradient(var(--accent) ${deg}deg, var(--line-strong) 0)`,
      }}
    >
      <div>{Math.round(pct * 100)}%</div>
    </div>
  );
}

/**
 * Smooth gradient area chart for trends (tokens/day, signups, hourly runs).
 * Pure SVG — no chart library, scales with the panel, theme-aware via vars.
 */
function AreaChart({
  values,
  labels,
  height = 170,
}: {
  values: number[];
  labels?: string[];
  height?: number;
}) {
  const gradientId = "area-" + useId().replace(/[^a-zA-Z0-9]/g, "");
  const points = values.length ? values : [0];
  const max = Math.max(1, ...points);
  const w = 100;
  const h = 60;
  const step = points.length > 1 ? w / (points.length - 1) : w;
  const xy = points.map(
    (v, i) => [i * step, h - (v / max) * (h - 6) - 3] as [number, number],
  );
  let line = `M ${xy[0][0]},${xy[0][1]}`;
  for (let i = 1; i < xy.length; i++) {
    const [x0, y0] = xy[i - 1];
    const [x1, y1] = xy[i];
    const midX = (x0 + x1) / 2;
    line += ` C ${midX},${y0} ${midX},${y1} ${x1},${y1}`;
  }
  const area = `${line} L ${xy[xy.length - 1][0]},${h} L 0,${h} Z`;
  return (
    <div className="area-chart" style={{ height }}>
      <div className="area-plot">
        <svg
          viewBox={`0 0 ${w} ${h}`}
          preserveAspectRatio="none"
          role="img"
          aria-label="trend chart"
        >
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" style={{ stopColor: "var(--accent)", stopOpacity: 0.34 }} />
              <stop offset="100%" style={{ stopColor: "var(--accent)", stopOpacity: 0 }} />
            </linearGradient>
          </defs>
          <path d={area} fill={`url(#${gradientId})`} />
          <path
            d={line}
            style={{ stroke: "var(--accent)" }}
            fill="none"
            strokeWidth="1.5"
            strokeLinecap="round"
            vectorEffect="non-scaling-stroke"
          />
        </svg>
      </div>
      {labels && labels.length > 1 && (
        <div className="area-labels">
          <span>{labels[0]}</span>
          <span>{labels[Math.floor(labels.length / 2)]}</span>
          <span>{labels[labels.length - 1]}</span>
        </div>
      )}
    </div>
  );
}

/**
 * Multi-segment donut (provider split, status mix) with a legend.
 */
function SegmentedDonut({
  segments,
  centerValue,
  centerLabel,
}: {
  segments: { label: string; value: number; color: string }[];
  centerValue?: number;
  centerLabel?: string;
}) {
  const total = segments.reduce((n, s) => n + s.value, 0);
  const shown = segments.filter((s) => s.value > 0);
  let acc = 0;
  const gradient = shown.length
    ? `conic-gradient(${shown
        .map((s) => {
          const start = (acc / Math.max(1, total)) * 360;
          acc += s.value;
          const end = (acc / Math.max(1, total)) * 360;
          return `${s.color} ${start}deg ${end}deg`;
        })
        .join(", ")})`
    : "conic-gradient(var(--line-strong) 0deg 360deg)";
  return (
    <div className="donut-wrap">
      <div className="donut" style={{ background: gradient }}>
        <div>
          {(centerValue ?? total).toLocaleString()}
          {centerLabel && <small>{centerLabel}</small>}
        </div>
      </div>
      <div className="donut-legend">
        {shown.map((s) => (
          <span key={s.label}>
            <i style={{ background: s.color }} />
            {s.label}
            <b>{s.value.toLocaleString()}</b>
          </span>
        ))}
        {!shown.length && <span>No runs in this window</span>}
      </div>
    </div>
  );
}
function SparkBars({ values, labels }: { values: number[]; labels: string[] }) {
  return (
    <div className="spark-bars">
      {values.map((v, i) => (
        <div
          key={i}
          className={v < 0 ? "negative" : ""}
          style={{ height: `${Math.max(12, Math.abs(v) * 70 + 10)}%` }}
          title={labels[i]}
        />
      ))}
    </div>
  );
}
function Metric({
  icon: Icon,
  label,
  value,
  tone = "",
}: {
  icon: IconType;
  label: string;
  value: any;
  tone?: string;
}) {
  return (
    <div className={`metric ${tone}`}>
      <div>
        <span>{label}</span>
        <Icon size={16} />
      </div>
      <b>{value}</b>
    </div>
  );
}
function PanelHeader({
  icon: Icon,
  title,
  sub,
}: {
  icon: IconType;
  title: string;
  sub: string;
}) {
  return (
    <div className="panel-header">
      <div className="panel-icon">
        <Icon size={16} />
      </div>
      <div>
        <h2>{title}</h2>
        <p>{sub}</p>
      </div>
    </div>
  );
}
function RunRow({ run, onClick }: { run: Run; onClick: (id: string) => void }) {
  return (
    <button className="run-row" onClick={() => onClick(run.id)}>
      <span className={`run-dot ${run.status.toLowerCase()}`} />
      <div>
        <b>{run.agent?.name || "Agent run"}</b>
        <span>
          {run.project?.name || "—"} · {run.provider}
        </span>
      </div>
      <div className="run-row-right">
        <strong>{run.status}</strong>
        <small>
          {run.latencyMs ? `${run.latencyMs} ms` : formatWhen(run.createdAt)}
        </small>
      </div>
    </button>
  );
}
function Empty({ title, text }: { title: string; text: string }) {
  return (
    <div className="empty">
      <div className="empty-icon">
        <LifeBuoy size={18} />
      </div>
      <b>{title}</b>
      <p>{text}</p>
    </div>
  );
}
function pretty(v: any) {
  try {
    return JSON.stringify(v, null, 2);
  } catch {
    return String(v);
  }
}
function formatWhen(value: string) {
  const d = new Date(value);
  const s = Math.max(1, Math.round((Date.now() - d.getTime()) / 1000));
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return d.toLocaleDateString();
}
function readError(e: unknown, fallback: string) {
  if (e instanceof Error) {
    try {
      const j = JSON.parse(e.message);
      return j.message || fallback;
    } catch {
      return e.message || fallback;
    }
  }
  return fallback;
}
/**
 * Normalize a slug to what the API accepts (`/^[a-z0-9]+(?:-[a-z0-9]+)*$/`):
 * lowercase words joined by single hyphens, capped at the 80-char limit.
 * Keeps the Slug input forgiving — "My Agent!" becomes "my-agent".
 */
function toSlug(v: string): string {
  return v
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80)
    .replace(/-+$/g, "");
}
function Sliders({ size = 16 }: { size?: number }) {
  return <Settings2 size={size} />;
}
