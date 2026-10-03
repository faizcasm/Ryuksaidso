"use client";

import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ComponentType,
  type FormEvent,
  type ReactNode,
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
  Copy,
  Database,
  FileClock,
  Gauge,
  Globe2,
  Headset,
  KeyRound,
  Layers3,
  LifeBuoy,
  LineChart,
  Lock,
  LogOut,
  Menu,
  Moon,
  Pencil,
  Play,
  Plug,
  Plus,
  RefreshCw,
  Rocket,
  Search,
  Settings2,
  Shield,
  ShieldCheck,
  Sparkles,
  Store,
  Sun,
  TestTube2,
  Ticket,
  Trash2,
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
import { api, API } from "../lib/api";
import { isAdmin as isAdminRole } from "../lib/roles";
import { BillingAdminSection, BillingSection, EvalLockBanner } from "./Billing";
import {
  CeoSupportModal,
  SupportInboxList,
  type SupportInbox,
} from "./CeoSupport";
import { IntegrationsView } from "./Integrations";
import { MarketplaceView } from "./Marketplace";
import { ModelProvidersSection } from "./ModelProviders";

type User = {
  id: string;
  email: string;
  name: string;
  organizationId: string;
  role: string;
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
  current: string;
  providers: {
    provider: string;
    name?: string;
    kind?: string;
    custom?: boolean;
    baseUrl?: string;
    configured: boolean;
    models: string[];
    selectedModel: string;
    status?: string;
    latencyMs?: number | null;
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

type SystemUsersOverview = {
  totals: {
    users: number;
    admins: number;
    verified: number;
    workspaces: number;
    activeSessions: number;
    projects: number;
    agents: number;
    runs: number;
    tokens: number;
  };
  registrations: { daily: { date: string; new: number }[]; beforeWindow: number };
  roleSplit: { role: string; users: number }[];
  topUsers: { id: string; name: string; runs: number; tokens: number }[];
  users: {
    id: string;
    name: string;
    email: string;
    userRole: string;
    verified: boolean;
    status: "active" | "idle" | "new";
    createdAt: string;
    lastActiveAt: string | null;
    activeSessions: number;
    projects: number;
    agents: number;
    runs: number;
    tokens: number;
    orgs: {
      id: string;
      name: string;
      role: string;
      projects: number;
      agents: number;
      runs: number;
      tokens: number;
    }[];
  }[];
  truncated: boolean;
  generatedAt: string;
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
  ["Integrations", Plug],
  ["Marketplace", Store],
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
    toastHovered.current = false;
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
  const [evalLocked, setEvalLocked] = useState(false);
  const [toolCatalog, setToolCatalog] = useState<ToolMeta[]>([]);
  const [evalRunning, setEvalRunning] = useState(false);
  const [selectedRun, setSelectedRun] = useState<Run | null>(null);
  const [running, setRunning] = useState(false);
  const [runForm, setRunForm] = useState({
    agentId: "",
    projectId: "",
    prompt: "",
    environment: "development",
    provider: "OMNIROUTE",
  });
  const [providerState, setProviderState] = useState<ProviderState | null>(
    null,
  );
  const [providerModel, setProviderModel] = useState("");
  const [documentForm, setDocumentForm] = useState({
    title: "",
    source: "manual",
    content: "",
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
  const [adminUsers, setAdminUsers] = useState<SystemUsersOverview | null>(null);
  const [supportInbox, setSupportInbox] = useState<SupportInbox | null>(null);
  const [supportOpen, setSupportOpen] = useState(false);
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
          api<Evaluation[]>("/evaluations")
            .then((rows) => {
              setEvalLocked(false);
              return rows;
            })
            .catch((e) => {
              if ((e as { status?: number })?.status === 402) setEvalLocked(true);
              return [];
            }),
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
        provider: (x.provider || dash.metrics.provider || "OMNIROUTE") as any,
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
      const [data, users, inbox] = await Promise.all([
        api<AdminOverview>("/admin/overview"),
        api<SystemUsersOverview>("/admin/users/overview").catch(() => null),
        api<SupportInbox>("/admin/support").catch(() => null),
      ]);
      setAdminData(data);
      setAdminUsers(users);
      setSupportInbox(inbox);
      setAdminUpdatedAt(data.generatedAt || new Date().toISOString());
    } catch (e) {
      setError(readError(e, "Could not load admin dashboard"));
    }
  }
  async function markSupportRead(id: string) {
    try {
      await api(`/admin/support/${id}/read`, { method: "PATCH" });
      setSupportInbox((current) =>
        current
          ? {
              unread: Math.max(0, current.unread - 1),
              messages: current.messages.map((m) =>
                m.id === id
                  ? { ...m, status: "READ", readAt: new Date().toISOString() }
                  : m,
              ),
            }
          : current,
      );
    } catch (e) {
      setError(readError(e, "Could not update the support message"));
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
        api<Ticket[]>("/tickets").catch(() => tickets),
      ]);
      setRuns(nextRuns);
      setApprovals(nextApprovals);
      setTickets(nextTickets);
      setSelectedRun((prev) => {
        if (!prev) return prev;
        const fresh = nextRuns.find((r) => r.id === prev.id);
        if (!fresh) return prev;
        return { ...fresh, approvals: prev.approvals };
      });
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
    if (isAdminRole(user?.userRole) && tab === "Admin") void loadAdmin();
  }, [tab, user]);
  useEffect(() => {
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
      if (isAdminRole(user?.userRole) && tab === "Admin") await loadAdmin();
    } catch (e) {
      setError(readError(e, "Could not refresh data"));
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
        notify(
          "If that email exists, a reset link has been sent. Check your inbox.",
          "success",
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
    window.location.assign(`${API}/auth/oauth/${provider}`);
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
      await new Promise(resolve => setTimeout(resolve, 500));
      await pollRuns();
      setTab("Traces");
      const run = await api<Run>(`/control/runs/${out.runId}`);
      setSelectedRun(run);
      await loadCore();
      notify("Run queued — the trace is streaming in.", "success");
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
      notify("Run retried — a fresh attempt is queued.", "success");
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
      notify(approved ? "Approval granted." : "Approval rejected.", "success");
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
      notify(a.enabled ? `${a.name} disabled.` : `${a.name} enabled.`, "success");
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
      notify(`Version published for ${a.name}.`, "success");
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
      notify("Project created.", "success");
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
          slug: toSlug(agentForm.slug || agentForm.name),
          projectId: agentForm.projectId || undefined,
          systemPrompt: agentForm.systemPrompt.trim() || undefined,
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
      notify("Agent created with a draft version.", "success");
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
      notify("Knowledge added.", "success");
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
      notify("Policy created.", "success");
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
      notify(p.enabled ? "Policy disabled." : "Policy enabled.", "success");
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
      notify("Evaluation completed.", "success");
    } catch (e) {
      if ((e as { status?: number })?.status === 402) setEvalLocked(true);
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
      notify("API key created — copy it now, it is shown once.", "success");
    } catch (e) {
      setError(readError(e, "Could not create API key"));
    }
  }
  async function renameKey(id: string, name: string) {
    try {
      await api(`/api-keys/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ name }),
      });
      await loadCore();
      notify(`API key renamed to “${name}”.`, "success");
    } catch (e) {
      setError(readError(e, "Could not rename API key"));
    }
  }
  async function deleteKey(id: string) {
    try {
      await api(`/api-keys/${id}`, { method: "DELETE" });
      await loadCore();
      notify("API key deleted.", "success");
    } catch (e) {
      setError(readError(e, "Could not delete API key"));
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
      notify("Profile updated.", "success");
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
      notify(
        "Password changed. Please sign in again if your session expires.",
        "success",
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
      notify("Workspace updated.", "success");
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
      notify(`Routing saved — ${runForm.provider} · ${providerModel || "default model"}.`, "success");
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
      notify("Workspace switched.", "success");
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
      notify(
        created.emailSent === false
          ? `Invitation created for ${created.email} — share the link below.`
          : `Invitation sent to ${created.email}.`,
        "success",
      );
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
      notify("Invitation revoked.", "success");
    } catch (e) {
      setError(readError(e, "Could not revoke invitation"));
    }
  }
  async function requestVerification() {
    try {
      const out = await api<{ message: string }>("/profile/verify-email", {
        method: "POST",
      });
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
      notify("Ticket created.", "success");
    } catch (e) {
      setError(readError(e, "Could not create ticket"));
    }
  }
  async function runTicket(t: Ticket) {
    try {
      await api(`/tickets/${t.id}/run`, { method: "POST" });
      await loadCore();
      notify("Ticket run queued.", "success");
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
      notify(`Role updated to ${role}.`, "success");
    } catch (e) {
      setError(readError(e, "Could not change role"));
    }
  }
  async function removeMember(id: string) {
    try {
      await api(`/members/${id}`, { method: "DELETE" });
      await loadAdmin();
      await loadCore();
      notify("Member removed from the workspace.", "success");
    } catch (e) {
      setError(readError(e, "Could not remove member"));
    }
  }
  async function revokeMemberSessions(id: string) {
    try {
      await api(`/admin/members/${id}/revoke-sessions`, { method: "POST" });
      await loadAdmin();
      notify("Member sessions revoked.", "success");
    } catch (e) {
      setError(readError(e, "Could not revoke member sessions"));
    }
  }

  useEffect(() => {
    if (user && pathname === "/auth") router.replace("/dashboard");
  }, [user, pathname, router]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("billing") === "checkout") {
      setTab("Settings");
      window.history.replaceState({}, "", window.location.pathname);
      return;
    }
    const connected = params.get("connected");
    const connectError = params.get("connect_error");
    if (connected || connectError) {
      setTab("Integrations");
      if (connected) {
        notify(`The ${connected} integration is connected.`, "success");
      } else {
        notify(`Connection failed: ${decodeURIComponent(connectError || "")}`, "error");
      }
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, []);

  const isSystemAdmin = isAdminRole(user?.userRole);
  const canManageWorkspace = user?.role === "OWNER" || user?.role === "ADMIN";
  useEffect(() => {
    if (tab === "Admin" && !isSystemAdmin) setTab("Command Center");
  }, [tab, isSystemAdmin]);

  const toastNode = error ? (
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
  ) : null;

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
      <>
        <AuthScreen
          mode={authMode}
          setMode={setAuthMode}
          form={authForm}
          setForm={setAuthForm}
          error={authError}
          submit={auth}
          oauth={oauth}
        />
        {toastNode}
      </>
    );

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
              className="ghost-icon support-btn"
              onClick={() => setSupportOpen(true)}
              title="Customer support — message the CEO"
              aria-label="Customer support — message the CEO"
            >
              <Headset size={15} />
            </button>
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
        {supportOpen && (
          <CeoSupportModal
            email={profile?.email ?? user.email}
            onClose={() => setSupportOpen(false)}
          />
        )}
        <div className="content">
          {toastNode}
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
              locked={evalLocked}
              onUpgrade={() => setTab("Settings")}
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
              onRename={renameKey}
              onDelete={deleteKey}
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
          {tab === "Integrations" && (
            <IntegrationsView
              canManage={canManageWorkspace}
              systemRole={user?.userRole ?? null}
              agents={agents}
            />
          )}
          {tab === "Marketplace" && (
            <MarketplaceView
              canManage={canManageWorkspace}
              systemRole={user?.userRole ?? null}
              onGoIntegrations={() => setTab("Integrations")}
            />
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
              onProviderChanged={loadProviderState}
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
              users={adminUsers}
              support={supportInbox}
              viewerRole={user.role}
              viewerSystemRole={user.userRole ?? "USER"}
              providerState={providerState}
              onRefresh={loadAdmin}
              onRole={changeRole}
              onRemove={removeMember}
              onRevokeSessions={revokeMemberSessions}
              onInspect={inspectRun}
              onReadMessage={markSupportRead}
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
      const key = r.provider || "OMNIROUTE";
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
            sub={`${dashboard?.metrics.provider || "OMNIROUTE"} · ${dashboard?.metrics.model || "model not selected"}`}
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
              <b>{dashboard?.metrics.provider || "OMNIROUTE"}</b>
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
            sub="OmniRoute, Ollama and your own providers share one OpenAI-compatible contract."
          />
          <div className="provider-pills">
            <button
              type="button"
              className={form.provider === "OMNIROUTE" ? "active" : ""}
              onClick={() => setForm({ ...form, provider: "OMNIROUTE" })}
            >
              <b>OmniRoute</b>
              <small
                className={
                  providerState?.providers.find(
                    (p) => p.provider === "OMNIROUTE",
                  )?.configured
                    ? "good-text"
                    : "bad-text"
                }
              >
                {providerState?.providers.find(
                  (p) => p.provider === "OMNIROUTE",
                )?.configured
                  ? "configured"
                  : "unconfigured"}
              </small>
            </button>
            <button
              type="button"
              className={form.provider === "OLLAMA" ? "active" : ""}
              onClick={() => setForm({ ...form, provider: "OLLAMA" })}
            >
              <b>Ollama</b>
              <small
                className={
                  providerState?.providers.find(
                    (p) => p.provider === "OLLAMA",
                  )?.configured
                    ? "good-text"
                    : "bad-text"
                }
              >
                {providerState?.providers.find(
                  (p) => p.provider === "OLLAMA",
                )?.configured
                  ? "configured"
                  : "unconfigured"}
              </small>
            </button>
            {providerState?.providers
              .filter((p) => p.custom)
              .map((p) => (
                <button
                  key={p.provider}
                  type="button"
                  className={form.provider === p.provider ? "active" : ""}
                  onClick={() => setForm({ ...form, provider: p.provider })}
                >
                  <b>{p.name}</b>
                  <small className={p.configured ? "good-text" : "bad-text"}>
                    {p.configured ? "configured" : "unconfigured"}
                  </small>
                </button>
              ))}
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
  const [copiedId, setCopiedId] = useState("");
  async function copyId(id: string) {
    try {
      await navigator.clipboard.writeText(id);
      setCopiedId(id);
      window.setTimeout(() => setCopiedId((x) => (x === id ? "" : x)), 1800);
    } catch {}
  }
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
                    <button
                      type="button"
                      className="agent-id"
                      title="Copy agent ID"
                      onClick={() => copyId(a.id)}
                    >
                      {copiedId === a.id ? "copied ✓" : a.id}
                    </button>
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

function traceInputText(run: Run): string {
  const input: unknown = run.input;
  if (input && typeof input === "object") {
    const record = input as Record<string, unknown>;
    const text = record.prompt ?? record.message;
    if (typeof text === "string" && text.trim()) return text;
    return JSON.stringify(input, null, 2);
  }
  return String(input ?? "");
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
  const detailRef = useRef<HTMLElement | null>(null);
  const selectedId = selected?.id ?? null;
  useEffect(() => {
    if (!selectedId || typeof window === "undefined") return;
    if (window.innerWidth <= 850) {
      detailRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [selectedId]);
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
        <section className="panel trace-detail" ref={detailRef}>
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
                <p>{traceInputText(selected)}</p>
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
                      <StepOutput step={step} />
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
  locked,
  onUpgrade,
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
  locked: boolean;
  onUpgrade: () => void;
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
      {locked && <EvalLockBanner onUpgrade={onUpgrade} />}
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
  onRename,
  onDelete,
  providerState,
}: {
  keys: ApiKey[];
  name: string;
  setName: (x: string) => void;
  secret: string;
  setSecret: (x: string) => void;
  onCreate: (e: FormEvent) => void;
  onRename: (id: string, name: string) => void;
  onDelete: (id: string) => void;
  providerState: ProviderState | null;
}) {
  const [editingId, setEditingId] = useState("");
  const [editName, setEditName] = useState("");
  const [confirmId, setConfirmId] = useState("");
  const [copiedContract, setCopiedContract] = useState(false);
  const contract = `curl https://ryuksaidso.faizcasm.me/api/control/agents \\
  -H "Authorization: Bearer rsk_..."

curl -X POST https://ryuksaidso.faizcasm.me/api/control/runs \\
  -H "Authorization: Bearer rsk_..." \\
  -H "Content-Type: application/json" \\
  -d '{"agentId":"<agent-id>","provider":"${providerState?.current || "OMNIROUTE"}","prompt":"Investigate the incident"}'`;
  async function copyContract() {
    try {
      await navigator.clipboard.writeText(contract);
      setCopiedContract(true);
      window.setTimeout(() => setCopiedContract(false), 2000);
    } catch {}
  }
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
                <div className="key-copy">
                  {editingId === k.id ? (
                    <form
                      className="key-edit"
                      onSubmit={(e) => {
                        e.preventDefault();
                        const trimmed = editName.trim();
                        if (trimmed.length < 2) return;
                        onRename(k.id, trimmed);
                        setEditingId("");
                      }}
                    >
                      <input
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        minLength={2}
                        maxLength={80}
                        autoFocus
                        aria-label="API key name"
                      />
                      <button className="primary" type="submit">
                        Save
                      </button>
                      <button
                        className="ghost"
                        type="button"
                        onClick={() => setEditingId("")}
                      >
                        Cancel
                      </button>
                    </form>
                  ) : (
                    <>
                      <b>{k.name}</b>
                      <span>
                        {k.prefix}•••• · created{" "}
                        {new Date(k.createdAt).toLocaleString()}
                      </span>
                    </>
                  )}
                </div>
                {editingId !== k.id && (
                  <div className="key-actions">
                    <button
                      className="ghost-icon"
                      title="Rename key"
                      onClick={() => {
                        setEditingId(k.id);
                        setEditName(k.name);
                        setConfirmId("");
                      }}
                    >
                      <Pencil size={14} />
                    </button>
                    {confirmId === k.id ? (
                      <>
                        <button
                          className="danger"
                          onClick={() => {
                            onDelete(k.id);
                            setConfirmId("");
                          }}
                        >
                          Delete
                        </button>
                        <button
                          className="ghost-icon"
                          title="Cancel"
                          onClick={() => setConfirmId("")}
                        >
                          <X size={14} />
                        </button>
                      </>
                    ) : (
                      <button
                        className="ghost-icon"
                        title="Delete key"
                        onClick={() => setConfirmId(k.id)}
                      >
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>
                )}
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
          <div className="code-head">
            <span>GET /api/control/agents · POST /api/control/runs</span>
            <button className="ghost" onClick={copyContract}>
              {copiedContract ? (
                <>
                  <CircleCheck size={14} />
                  Copied
                </>
              ) : (
                <>
                  <Copy size={14} />
                  Copy
                </>
              )}
            </button>
          </div>
          <pre className="code-doc">{contract}</pre>
          <div className="hint">
            <Lock size={15} />
            Call <b>GET /api/control/agents</b> first to resolve an{" "}
            <b>agentId</b>. Tenant isolation is enforced from the key’s
            workspace.
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
  onProviderChanged,
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
  onProviderChanged: () => void;
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
  const omniInfo = providerState?.providers.find(
    (p) => p.provider === "OMNIROUTE",
  );
  const ollamaInfo = providerState?.providers.find(
    (p) => p.provider === "OLLAMA",
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
                className={provider === "OMNIROUTE" ? "active" : ""}
                onClick={() => {
                  setProvider("OMNIROUTE");
                  setModel(omniInfo?.selectedModel || "");
                }}
              >
                <b>OmniRoute</b>
                <small className={omniInfo?.configured ? "good-text" : "bad-text"}>
                  {omniInfo?.configured ? "configured" : "unconfigured"}
                </small>
              </button>
              <button
                type="button"
                className={provider === "OLLAMA" ? "active" : ""}
                onClick={() => {
                  setProvider("OLLAMA");
                  setModel(ollamaInfo?.selectedModel || "");
                }}
              >
                <b>Ollama</b>
                <small className={ollamaInfo?.configured ? "good-text" : "bad-text"}>
                  {ollamaInfo?.configured ? "configured" : "unconfigured"}
                </small>
              </button>
              {providerState?.providers
                .filter((p) => p.custom)
                .map((p) => (
                  <button
                    key={p.provider}
                    type="button"
                    className={provider === p.provider ? "active" : ""}
                    onClick={() => {
                      setProvider(p.provider);
                      setModel(p.selectedModel || "");
                    }}
                  >
                    <b>{p.name}</b>
                    <small className={p.configured ? "good-text" : "bad-text"}>
                      {p.configured
                        ? p.status === "ERROR"
                          ? "unreachable"
                          : "configured"
                        : "unconfigured"}
                    </small>
                  </button>
                ))}
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
        <ModelProvidersSection
          canManage={canManageMembers}
          onChanged={onProviderChanged}
        />
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
        <BillingSection canManage={canManageMembers} />
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
  users,
  support,
  viewerRole,
  viewerSystemRole,
  providerState,
  onRefresh,
  onRole,
  onRemove,
  onRevokeSessions,
  onInspect,
  onReadMessage,
  updatedAt,
}: {
  data: AdminOverview | null;
  users: SystemUsersOverview | null;
  support: SupportInbox | null;
  viewerRole: string;
  viewerSystemRole: string;
  providerState: ProviderState | null;
  onRefresh: () => Promise<void> | void;
  onRole: (id: string, r: string) => void;
  onRemove: (id: string) => void;
  onRevokeSessions: (id: string) => void;
  onInspect: (id: string) => void;
  onReadMessage: (id: string) => void;
  updatedAt?: string | null;
}) {
  const [refreshing, setRefreshing] = useState(false);
  const omniInfo = providerState?.providers.find(
    (p) => p.provider === "OMNIROUTE",
  );
  const ollamaInfo = providerState?.providers.find(
    (p) => p.provider === "OLLAMA",
  );
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
            <b>
              {data.organization?.llmProvider &&
              !["OMNIROUTE", "OLLAMA"].includes(data.organization.llmProvider)
                ? data.health?.llm.provider || "Custom provider"
                : data.organization?.llmProvider || "OMNIROUTE"}
            </b>
          </div>
          <div>
            <span>
              OmniRoute ·{" "}
              {omniInfo?.configured ? "configured" : "unconfigured"}
            </span>
            <b>
              {data.organization?.omnirouteModel ||
                omniInfo?.selectedModel ||
                "Not configured"}
            </b>
          </div>
          <div>
            <span>
              Ollama · {ollamaInfo?.configured ? "configured" : "unconfigured"}
            </span>
            <b className={ollamaInfo?.configured ? "" : "bad-text"}>
              {ollamaInfo?.configured
                ? data.organization?.ollamaModel ||
                  ollamaInfo?.selectedModel ||
                  "Not configured"
                : "Unconfigured"}
            </b>
          </div>
        </div>
      </div>
      <ObservabilitySection viewerSystemRole={viewerSystemRole} />
      {viewerSystemRole === "ADMIN" && <BillingAdminSection />}
      {viewerSystemRole === "ADMIN" && users && <SystemUsersSection users={users} />}
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
                name: `LLM · ${data.health?.llm.provider || data.organization?.llmProvider || "OMNIROUTE"}`,
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
          icon={Headset}
          title="CEO inbox"
          sub="Direct customer support messages from the top bar"
          badge={
            support && support.unread > 0 ? `${support.unread} unread` : null
          }
        />
        <SupportInboxList inbox={support} onRead={onReadMessage} />
      </section>
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

function SystemUsersSection({ users }: { users: SystemUsersOverview }) {
  const [query, setQuery] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const daily = users.registrations.daily;
  const cumulative = daily.reduce<number[]>(
    (acc, day, i) => [...acc, (i ? acc[i - 1] : users.registrations.beforeWindow) + day.new],
    [],
  );
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return users.users;
    return users.users.filter(
      (u) =>
        u.name.toLowerCase().includes(q) ||
        u.email.toLowerCase().includes(q) ||
        u.orgs.some((o) => o.name.toLowerCase().includes(q)),
    );
  }, [query, users.users]);
  const joinedInWindow = daily.reduce((n, day) => n + day.new, 0);
  const topTokens = Math.max(1, users.topUsers[0]?.tokens ?? 1);
  return (
    <>
      <section className="panel admin-users-panel" id="system-users">
        <PanelHeader
          icon={Users}
          title="System users"
          sub={`${users.totals.users} accounts across ${users.totals.workspaces} workspace${users.totals.workspaces === 1 ? "" : "s"}${users.truncated ? " · newest 500 shown" : ""}`}
        />
        <div className="metric-grid admin-user-metrics">
          <Metric icon={Users} label="Total users" value={users.totals.users} />
          <Metric icon={ShieldCheck} label="System admins" value={users.totals.admins} />
          <Metric icon={CircleCheck} label="Verified emails" value={`${users.totals.verified}/${users.totals.users}`} />
          <Metric icon={Layers3} label="Workspaces" value={users.totals.workspaces} />
          <Metric icon={Activity} label="Active sessions" value={users.totals.activeSessions} />
          <Metric icon={Play} label="Total runs" value={users.totals.runs.toLocaleString()} />
          <Metric icon={Bot} label="Agents" value={users.totals.agents.toLocaleString()} />
          <Metric icon={Zap} label="Tokens consumed" value={users.totals.tokens.toLocaleString()} />
        </div>
        <div className="user-table">
          <div className="user-table-tools">
            <Search size={14} />
            <input
              className="user-search"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setExpandedId(null);
              }}
              placeholder="Filter by name, email or workspace…"
            />
          </div>
          <div className="user-table-head">
            <span>User</span>
            <span>Role</span>
            <span>Workspaces</span>
            <span className="num">Projects</span>
            <span className="num">Agents</span>
            <span className="num">Runs</span>
            <span className="num">Tokens</span>
            <span>Last active</span>
          </div>
          {filtered.map((u) => (
            <div className="user-entry" key={u.id}>
              <button
                type="button"
                className={`user-row ${expandedId === u.id ? "open" : ""}`}
                aria-expanded={expandedId === u.id}
                onClick={() => setExpandedId(expandedId === u.id ? null : u.id)}
              >
                <div className="user-identity">
                  <div className="avatar small">{u.name.slice(0, 1).toUpperCase()}</div>
                  <div>
                    <b>
                      {u.name}
                      {u.verified && <Check size={12} className="user-verified" />}
                    </b>
                    <span>{u.email}</span>
                  </div>
                </div>
                <span className={`user-role ${u.userRole === "ADMIN" ? "admin" : ""}`} data-label="Role">
                  {u.userRole}
                </span>
                <span className="user-orgs" data-label="Workspaces">
                  {u.orgs.length ? u.orgs.map((o) => o.name).join(", ") : "No workspace"}
                </span>
                <b className="num" data-label="Projects">
                  {u.projects}
                </b>
                <b className="num" data-label="Agents">
                  {u.agents}
                </b>
                <b className="num" data-label="Runs">
                  {u.runs.toLocaleString()}
                </b>
                <b className="num" data-label="Tokens">
                  {u.tokens.toLocaleString()}
                </b>
                <small data-label="Last active">{u.lastActiveAt ? formatWhen(u.lastActiveAt) : "Never"}</small>
              </button>
              {expandedId === u.id && (
                <div className="user-detail">
                  <div className="user-detail-facts">
                    <span className={`user-status ${u.status}`}>{u.status}</span>
                    <span>Joined {formatWhen(u.createdAt)}</span>
                    <span>
                      {u.activeSessions} active session{u.activeSessions === 1 ? "" : "s"}
                    </span>
                    <span>{u.verified ? "Email verified" : "Email unverified"}</span>
                  </div>
                  {u.orgs.length ? (
                    <div className="user-org-table">
                      <div className="user-org-head">
                        <span>Workspace</span>
                        <span>Role</span>
                        <span className="num">Projects</span>
                        <span className="num">Agents</span>
                        <span className="num">Runs</span>
                        <span className="num">Tokens</span>
                      </div>
                      {u.orgs.map((o) => (
                        <div className="user-org-row" key={o.id}>
                          <b>{o.name}</b>
                          <span className={`user-role ${o.role === "OWNER" || o.role === "ADMIN" ? "admin" : ""}`} data-label="Role">
                            {o.role}
                          </span>
                          <b className="num" data-label="Projects">
                            {o.projects}
                          </b>
                          <b className="num" data-label="Agents">
                            {o.agents}
                          </b>
                          <b className="num" data-label="Runs">
                            {o.runs.toLocaleString()}
                          </b>
                          <b className="num" data-label="Tokens">
                            {o.tokens.toLocaleString()}
                          </b>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="user-detail-empty">Not a member of any workspace yet.</p>
                  )}
                </div>
              )}
            </div>
          ))}
          {!filtered.length && (
            <Empty title="No matching users" text="Clear the filter to see every registered account." />
          )}
        </div>
      </section>
      <div className="admin-grid">
        <section className="panel">
          <PanelHeader
            icon={LineChart}
            title="User growth"
            sub="Cumulative registrations with daily signups"
          />
          <AreaChart values={cumulative} labels={daily.map((d) => d.date.slice(5))} />
          <div className="chart-footnote">
            <span>{joinedInWindow} joined in window</span>
            <span>{users.registrations.beforeWindow} predate window</span>
          </div>
        </section>
        <section className="panel">
          <PanelHeader icon={Gauge} title="Top users" sub="Ranked by tokens consumed" />
          <div className="agent-ranking">
            {users.topUsers.map((u) => (
              <div key={u.id}>
                <div>
                  <b>{u.name}</b>
                  <span>
                    {u.runs} runs · {u.tokens.toLocaleString()} tokens
                  </span>
                </div>
                <div className="rank-track">
                  <i style={{ width: `${Math.min(100, (u.tokens / topTokens) * 100)}%` }} />
                </div>
              </div>
            ))}
            {!users.topUsers.length && (
              <Empty title="No users yet" text="Registered accounts will show up here." />
            )}
          </div>
        </section>
      </div>
    </>
  );
}

function StepOutput({ step }: { step: any }) {
  const raw = step?.output ?? step?.input;
  const presentation = presentationOf(raw);
  if (presentation) return <ObsCard data={presentation} />;
  if (raw && typeof raw === "object") {
    const answer = (raw as any).answer;
    if (typeof answer === "string" && answer.trim()) {
      const toolResults = Array.isArray((raw as any).toolResults) ? (raw as any).toolResults : [];
      const cards = toolResults
        .map((entry: any) => presentationOf(entry?.result ?? entry?.result?.output))
        .filter(Boolean) as ObsPresentationData[];
      return (
        <div className="step-answer">
          <p>{answer}</p>
          {cards.map((card, index) => (
            <ObsCard data={card} key={index} />
          ))}
          <RawDetails raw={raw} />
        </div>
      );
    }
    const nested = presentationOf((raw as any).output);
    if (nested) return <ObsCard data={nested} />;
  }
  return <pre>{prettyPreview(raw)}</pre>;
}

function RawDetails({ raw }: { raw: any }) {
  const ref = useRef<HTMLDetailsElement | null>(null);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const onToggle = () => setOpen(el.open);
    el.addEventListener("toggle", onToggle);
    return () => el.removeEventListener("toggle", onToggle);
  }, []);
  return (
    <details className="step-raw" ref={ref}>
      <summary>Plan &amp; tool details</summary>
      {open && <pre>{prettyPreview(raw)}</pre>}
    </details>
  );
}

type ObsMetricChip = { label: string; value: string; tone?: "good" | "warn" | "bad" };
type ObsServiceCard = {
  name: string;
  ok?: boolean | null;
  detail?: string;
  latencyMs?: number | null;
};
type ObsErrorRow = {
  t?: string;
  level?: string;
  source?: string;
  status?: number;
  method?: string;
  path?: string;
  requestId?: string | null;
  message?: string;
  meta?: any;
};
type ObsPresentationData = {
  kind?: string;
  title?: string;
  status?: "healthy" | "degraded" | "critical" | "unknown";
  generatedAt?: string;
  metrics?: ObsMetricChip[];
  services?: ObsServiceCard[];
  errors?: ObsErrorRow[];
  rootCause?: string;
  actions?: Array<{ label: string; url: string; disabled?: boolean }>;
  sources?: string[];
};

function presentationOf(value: any): ObsPresentationData | null {
  if (!value || typeof value !== "object") return null;
  if (value.presentation && typeof value.presentation === "object" && value.presentation.kind === "observability")
    return value.presentation as ObsPresentationData;
  if (value.kind === "observability") return value as ObsPresentationData;
  return null;
}

function ObsCard({ data }: { data: ObsPresentationData }) {
  const status = data.status ?? "unknown";
  const errors = (data.errors ?? []).slice(0, 4);
  return (
    <div className={`obs-card obs-${status}`}>
      <div className="obs-card-head">
        <span className={`obs-status-pill ${status}`}>{status.toUpperCase()}</span>
        <b>{data.title || "Observability"}</b>
        {data.generatedAt && <small>{formatWhen(data.generatedAt)}</small>}
      </div>
      {!!(data.metrics ?? []).length && (
        <div className="obs-metrics-row">
          {(data.metrics ?? []).map((metric) => (
            <span className={`obs-chip ${metric.tone ?? ""}`} key={metric.label}>
              <small>{metric.label}</small>
              <b>{metric.value}</b>
            </span>
          ))}
        </div>
      )}
      {!!(data.services ?? []).length && (
        <div className="obs-services-mini">
          {(data.services ?? []).map((service) => (
            <span key={service.name} className={service.ok === false ? "down" : service.ok ? "up" : ""} title={service.detail}>
              <i className="obs-dot" />
              {service.name}
            </span>
          ))}
        </div>
      )}
      {!!errors.length && (
        <div className="obs-errors-mini">
          {errors.map((error, index) => (
            <div key={index}>
              <code>{error.t ? new Date(error.t).toLocaleTimeString() : "--:--:--"}</code>
              {error.status ? (
                <b className="obs-code bad">{error.status}</b>
              ) : (
                <b className="obs-code warn">{String(error.level ?? "error")}</b>
              )}
              <span>{error.method ? `${error.method} ${error.path}` : String(error.message ?? "").slice(0, 140)}</span>
              {error.requestId && <code className="obs-rid">{error.requestId}</code>}
            </div>
          ))}
        </div>
      )}
      {data.rootCause && <p className="obs-rootcause">{data.rootCause}</p>}
      <div className="obs-card-foot">
        <div className="obs-sources">
          {(data.sources ?? []).map((source) => (
            <span className="obs-source" key={source}>
              {source}
            </span>
          ))}
        </div>
        {(data.actions ?? []).map((action) => (
          <a className="obs-action" href={action.url} target="_blank" rel="noreferrer" key={action.label}>
            {action.label} →
          </a>
        ))}
      </div>
    </div>
  );
}

function ObservabilitySection({ viewerSystemRole }: { viewerSystemRole: string }) {
  const allowed = viewerSystemRole === "ADMIN";
  const [summary, setSummary] = useState<any>(null);
  const [errorsData, setErrorsData] = useState<any>(null);
  const [requests, setRequests] = useState<any>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!allowed) return;
    let alive = true;
    const load = async () => {
      try {
        const [nextSummary, nextErrors] = await Promise.all([
          api<any>("/admin/observability/summary"),
          api<any>("/admin/observability/errors?sinceMinutes=60&limit=12"),
        ]);
        if (!alive) return;
        setSummary(nextSummary);
        setErrorsData(nextErrors);
        setLoadError(null);
      } catch (error) {
        if (!alive) return;
        const status = (error as { status?: number })?.status;
        setLoadError(status === 403 ? null : String((error as Error)?.message ?? "Observability unavailable"));
      }
    };
    void load();
    const timer = window.setInterval(load, 30_000);
    return () => {
      alive = false;
      window.clearInterval(timer);
    };
  }, [allowed]);

  const refresh = async () => {
    setBusy(true);
    try {
      const [nextSummary, nextErrors] = await Promise.all([
        api<any>("/admin/observability/summary"),
        api<any>("/admin/observability/errors?sinceMinutes=60&limit=12"),
      ]);
      setSummary(nextSummary);
      setErrorsData(nextErrors);
      setLoadError(null);
    } catch (error) {
      const status = (error as { status?: number })?.status;
      if (status !== 403) setLoadError(String((error as Error)?.message ?? "Observability unavailable"));
    } finally {
      setBusy(false);
    }
  };

  const loadRequests = async () => {
    if (requests) {
      setRequests(null);
      return;
    }
    try {
      setRequests(await api<any>("/admin/observability/requests?sinceMinutes=1440&limit=40"));
    } catch {}
  };

  if (!allowed) return null;
  const presentation: ObsPresentationData | null = summary?.presentation ?? null;
  const status = presentation?.status ?? "unknown";
  const stats = summary?.stats ?? null;
  const backends = summary?.backends ?? null;
  const errorRows: ObsErrorRow[] = errorsData?.errors ?? [];
  const grafanaUrl = backends?.grafana?.url as string | undefined;
  const grafanaReady = Boolean(backends?.grafana?.configured && grafanaUrl);

  return (
    <section className="panel obs-panel" id="observability">
      <PanelHeader
        icon={Activity}
        title="Observability"
        sub={summary ? `Live system status · updated ${formatWhen(summary.generatedAt)}` : "Live system status"}
      />
      <div className="obs-toolbar">
        <span className={`obs-status-pill ${status}`}>
          {summary ? status.toUpperCase() : "LOADING"}
        </span>
        <div className="obs-sources">
          {(backends?.sources ?? ["api-native"]).map((source: string) => (
            <span className="obs-source" key={source}>
              {source}
            </span>
          ))}
        </div>
        <div className="obs-actions">
          <button className="ghost" onClick={() => void refresh()} disabled={busy}>
            <RefreshCw size={13} className={busy ? "spin" : ""} />
            {busy ? "Refreshing…" : "Refresh"}
          </button>
          <button className="ghost" onClick={() => void loadRequests()}>
            {requests ? "Hide requests" : "Request logs"}
          </button>
          {grafanaReady ? (
            <a className="ghost obs-action" href={grafanaUrl} target="_blank" rel="noreferrer">
              Open Grafana
            </a>
          ) : (
            <button className="ghost" disabled title="Set GRAFANA_URL to expose Grafana in the browser">
              Open Grafana
            </button>
          )}
        </div>
      </div>
      {loadError && <p className="obs-note">{loadError}</p>}
      <div className="obs-stat-grid">
        {(presentation?.metrics ?? []).map((metric) => (
          <div className={`obs-stat ${metric.tone ?? ""}`} key={metric.label}>
            <span>{metric.label}</span>
            <b>{metric.value}</b>
          </div>
        ))}
        {!summary && !loadError && (
          <p className="obs-empty">Collecting live metrics…</p>
        )}
        {summary && !(presentation?.metrics ?? []).length && (
          <p className="obs-empty">No metrics available.</p>
        )}
      </div>
      {presentation?.rootCause && (
        <div className="obs-rootcause">
          <AlertTriangle size={14} />
          <span>{presentation.rootCause}</span>
        </div>
      )}
      <div className="obs-columns">
        <div>
          <h3>Service health</h3>
          <div className="obs-services">
            {(summary?.services ?? []).map((service: ObsServiceCard) => (
              <div
                className={`health-card ${service.ok === undefined ? "unknown" : service.ok ? "up" : "down"}`}
                key={service.name}
              >
                <span className="health-dot" />
                <div>
                  <b>{service.name}</b>
                  <span>{service.detail}</span>
                </div>
              </div>
            ))}
            {!(summary?.services ?? []).length && <p className="obs-empty">No service checks yet.</p>}
          </div>
        </div>
        <div>
          <h3>
            Traffic <small>· last {stats?.windowMinutes ?? 60} min</small>
          </h3>
          {stats ? (
            <div className="obs-traffic">
              <div className="obs-traffic-row">
                <span>Requests</span>
                <b>{stats.total}</b>
              </div>
              <div className="obs-traffic-row">
                <span>Requests / min</span>
                <b>{stats.requestsPerMinute}</b>
              </div>
              <div className="obs-traffic-row">
                <span>Avg / p95 latency</span>
                <b>
                  {stats.avgMs} ms / {stats.p95Ms} ms
                </b>
              </div>
              <div className="obs-traffic-row">
                <span>4xx / 5xx</span>
                <b className={stats.errors5xx ? "bad-text" : ""}>
                  {stats.clientErrors4xx} / {stats.errors5xx}
                </b>
              </div>
              <div className="obs-status-chips">
                {(stats.byStatus ?? []).slice(0, 8).map((entry: { status: number; count: number }) => (
                  <span
                    key={entry.status}
                    className={`obs-code ${entry.status >= 500 ? "bad" : entry.status >= 400 ? "warn" : "ok"}`}
                  >
                    {entry.status} × {entry.count}
                  </span>
                ))}
              </div>
              {!!(stats.topErrorPaths ?? []).length && (
                <div className="obs-errorpaths">
                  {(stats.topErrorPaths as any[]).map((entry, index) => (
                    <div key={index}>
                      <b className="obs-code bad">{entry.status}</b>
                      <span>{entry.path}</span>
                      <small>{entry.count}×</small>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <p className="obs-empty">No request data yet.</p>
          )}
        </div>
      </div>
      <div className="obs-errors" id="obs-errors">
        <h3>
          Recent errors <small>· {errorsData?.count ?? errorRows.length}</small>
        </h3>
        {!errorRows.length && <p className="obs-empty">No errors captured in this window.</p>}
        {errorRows.map((error, index) => (
          <details className="obs-error-row" key={index}>
            <summary>
              <code>{error.t ? new Date(error.t).toLocaleTimeString() : "--:--:--"}</code>
              {error.status ? (
                <b className="obs-code bad">{error.status}</b>
              ) : (
                <b className="obs-code warn">{String(error.level ?? "error")}</b>
              )}
              <span className="obs-error-msg">
                {error.method ? `${error.method} ${error.path}` : String(error.message ?? "").slice(0, 140)}
              </span>
              {error.requestId && <code className="obs-rid">{error.requestId}</code>}
              <span className="obs-src">{error.source}</span>
            </summary>
            <div className="obs-error-detail">
              <p>{error.message}</p>
              {error.meta && <pre>{pretty(error.meta)}</pre>}
            </div>
          </details>
        ))}
      </div>
      {requests && (
        <div className="obs-requests">
          <h3>
            Request logs <small>· last {requests.sinceMinutes} min · {requests.entries?.length ?? 0} of {requests.totalMatched ?? 0}</small>
          </h3>
          <div className="obs-table">
            {(requests.entries ?? []).map((entry: any, index: number) => (
              <div key={index}>
                <code>{new Date(entry.t).toLocaleTimeString()}</code>
                <b>{entry.method}</b>
                <span>{entry.path}</span>
                <b className={`obs-code ${entry.status >= 500 ? "bad" : entry.status >= 400 ? "warn" : "ok"}`}>
                  {entry.status}
                </b>
                <small>{entry.ms} ms</small>
                {entry.requestId && <code className="obs-rid">{entry.requestId}</code>}
              </div>
            ))}
            {!(requests.entries ?? []).length && <p className="obs-empty">No requests in this window.</p>}
          </div>
        </div>
      )}
      {errorsData?.lokiNote && <p className="obs-note">{errorsData.lokiNote}</p>}
    </section>
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
  badge,
}: {
  icon: IconType;
  title: string;
  sub: string;
  badge?: ReactNode;
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
      {badge ? <span className="panel-badge">{badge}</span> : null}
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
const PREVIEW_CAP = 60000;
function prettyPreview(v: any) {
  let text: string;
  try {
    text = JSON.stringify(v, null, 2) ?? String(v);
  } catch {
    text = String(v);
  }
  if (text.length <= PREVIEW_CAP) return text;
  return `${text.slice(0, PREVIEW_CAP)}\n… [truncated ${text.length - PREVIEW_CAP} characters]`;
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
