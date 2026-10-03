"use client";

import { useCallback, useEffect, useRef, useState, type ComponentType } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  BadgeCheck,
  Bot,
  BookOpen,
  Bug,
  Calendar,
  Check,
  ChevronLeft,
  ChevronRight,
  CircleCheck,
  Clock,
  Download,
  ExternalLink,
  FileText,
  GitFork,
  Globe,
  Mail,
  Megaphone,
  MessageSquare,
  Pencil,
  Play,
  Plug,
  Radar,
  Rocket,
  Search,
  Send,
  ShoppingBag,
  Sparkles,
  Star,
  Store,
  Trash2,
  Users,
  Wand2,
  Zap,
} from "lucide-react";
import { api } from "../lib/api";

type Message = { kind: "ok" | "err"; text: string } | null;
type IconType = ComponentType<{ size?: number | string; strokeWidth?: number }>;

type AgentCard = {
  id: string;
  slug: string;
  name: string;
  summary: string;
  category: string;
  logoIcon: string;
  logoColor: string;
  pricing: string;
  priceAmount: number;
  pricePeriod: string;
  pricePerRun: number;
  avgCostMicros: number;
  status: string;
  visibility: string;
  suspended: boolean;
  verified: boolean;
  featured: boolean;
  installs: number;
  tries: number;
  ratingAvg: number;
  ratingCount: number;
  currentVersion: number;
  latestVersion: number;
  executions: number;
  successRate: number | null;
  organizationId: string;
  canEdit: boolean;
  creator: { id: string; handle: string; displayName: string; verified: boolean } | null;
  createdAt: string;
  updatedAt: string;
};

type AgentConfig = { instructions: string; systemPrompt?: string; tools: string[] };

type Review = {
  id: string;
  userId: string;
  userName: string;
  rating: number;
  title: string;
  body: string;
  version: number;
  createdAt: string;
};

type AgentDetail = AgentCard & {
  description: string;
  reviewReason: string;
  forkedFrom: { slug: string; name: string } | null;
  config: AgentConfig;
  changelog: string;
  requiredIntegrations: string[];
  requiredTools: string[];
  requiredModels: string[];
  permissions: string[];
  histogram: { rating: number; count: number }[];
  reviews: Review[];
  myInstall: { id: string; status: string; installedAgentId: string | null } | null;
  myReview: Review | null;
  canModerate: boolean;
};

type ListResponse = {
  total: number;
  page: number;
  limit: number;
  categories: { category: string; count: number }[];
  agents: AgentCard[];
};

type InstallRow = {
  id: string;
  status: string;
  source: string;
  version: number;
  createdAt: string;
  agent: { slug: string; name: string; summary: string; logoIcon: string; logoColor: string; category: string; verified: boolean } | null;
  installedAgent: { id: string; name: string; slug: string; enabled: boolean } | null;
};

type InstallResult = {
  install: { id: string };
  agent: { id: string; name: string; slug: string; enabled: boolean };
  missing: { integrations: string[]; tools: string[]; modelReady: boolean };
  marketplace: { slug: string; name: string; version: number };
};

type CreatorProfile = {
  id: string;
  userId: string | null;
  handle: string;
  displayName: string;
  bio: string;
  website: string;
  verified: boolean;
  isMe: boolean;
  stats: { agentCount: number; totalInstalls: number; totalExecutions: number; ratingAvg: number };
  agents: AgentCard[];
};

type VersionRow = { version: number; changelog: string; createdBy: string; createdAt: string; isCurrent: boolean };

type AnalyticsData = {
  installs: number;
  installs30d: number;
  tries: number;
  executions: number;
  completed: number;
  failed: number;
  successRate: number | null;
  totalTokens: number;
  ratingAvg: number;
  ratingCount: number;
  histogram: { rating: number; count: number }[];
  avgCostMicros: number;
};

type QueueRow = {
  id: string;
  slug: string;
  name: string;
  status: string;
  summary: string;
  description: string;
  category: string;
  pricing: string;
  priceAmount: number;
  pricePerRun: number;
  config: AgentConfig;
  requiredIntegrations: string[];
  requiredModels: string[];
  permissions: string[];
  creator: { id: string; handle: string; displayName: string; verified: boolean } | null;
  createdAt: string;
  updatedAt: string;
};

type AdminCreator = {
  id: string;
  userId: string | null;
  handle: string;
  displayName: string;
  verified: boolean;
  publishedAgents: number;
};

type ToolMeta = { name: string; description: string; category?: string };

type SectionKey = "browse" | "mine" | "installs" | "queue";
type View =
  | { kind: "list" }
  | { kind: "detail"; slug: string }
  | { kind: "creator"; handle: string }
  | { kind: "publish"; slug: string | null };

type PublishForm = {
  name: string;
  summary: string;
  description: string;
  category: string;
  logoIcon: string;
  logoColor: string;
  pricing: string;
  priceAmount: string;
  pricePeriod: string;
  pricePerRun: string;
  avgCost: string;
  integrations: string[];
  models: string;
  permissions: string;
  instructions: string;
  systemPrompt: string;
  tools: string[];
  changelog: string;
};

const CATEGORY_LABELS: Record<string, string> = {
  support: "Support",
  sales: "Sales",
  marketing: "Marketing",
  research: "Research",
  productivity: "Productivity",
  development: "Development",
  operations: "Operations",
  other: "Other",
};

const PERIOD_SUFFIX: Record<string, string> = { MONTHLY: "/mo", YEARLY: "/yr", ONE_TIME: " once" };

const MK_ICONS: Record<string, IconType> = {
  mail: Mail,
  calendar: Calendar,
  radar: Radar,
  bug: Bug,
  users: Users,
  megaphone: Megaphone,
  bot: Bot,
  globe: Globe,
  file: FileText,
  zap: Zap,
  book: BookOpen,
  message: MessageSquare,
  sparkles: Sparkles,
  wand: Wand2,
  rocket: Rocket,
  shopping: ShoppingBag,
  code: Plug,
  star: Star,
};

const SECTION_LABELS: Record<SectionKey, string> = {
  browse: "Discover",
  mine: "My agents",
  installs: "Installed",
  queue: "Review queue",
};

function mkIcon(name: string): IconType {
  return MK_ICONS[name] ?? Sparkles;
}

function readError(e: unknown, fallback: string) {
  if (e instanceof Error && e.message.trim()) return e.message.trim();
  return fallback;
}

function rupees(paise: number): string {
  const value = paise / 100;
  return `₹${value.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
}

function priceLabel(agent: Pick<AgentCard, "pricing" | "priceAmount" | "pricePeriod" | "pricePerRun">): string {
  if (agent.pricing === "PAID") return `${rupees(agent.priceAmount)}${PERIOD_SUFFIX[agent.pricePeriod] ?? "/mo"}`;
  if (agent.pricing === "USAGE") return `${rupees(agent.pricePerRun)}/run`;
  return "Free";
}

function costLabel(micros: number): string {
  if (!micros) return "—";
  return `₹${(micros / 1_000_000).toLocaleString("en-IN", { maximumFractionDigits: 3 })}`;
}

function rateLabel(rate: number | null): string {
  return rate === null ? "—" : `${rate}%`;
}

function integrationLabel(key: string): string {
  return key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function splitList(value: string): string[] {
  return value
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function toPaise(value: string): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return 0;
  return Math.round(parsed * 100);
}

function toMicros(value: string): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return 0;
  return Math.round(parsed * 1_000_000);
}

function extractAnswer(output: unknown): string {
  if (typeof output === "string") return output;
  if (output && typeof output === "object") {
    const raw = output as Record<string, unknown>;
    if (typeof raw.answer === "string" && raw.answer.trim()) return raw.answer;
    if (typeof raw.content === "string" && raw.content.trim()) return raw.content;
    return JSON.stringify(raw, null, 2);
  }
  return "The preview finished without any output.";
}

const emptyForm: PublishForm = {
  name: "",
  summary: "",
  description: "",
  category: "support",
  logoIcon: "sparkles",
  logoColor: "#7c5cff",
  pricing: "FREE",
  priceAmount: "",
  pricePeriod: "MONTHLY",
  pricePerRun: "",
  avgCost: "",
  integrations: [],
  models: "",
  permissions: "",
  instructions: "",
  systemPrompt: "",
  tools: [],
  changelog: "",
};

function PanelHead({ icon: Icon, title, sub }: { icon: IconType; title: string; sub: string }) {
  return (
    <div className="int-card-top">
      <div className="int-card-icon">
        <Icon size={16} />
      </div>
      <div className="int-card-title">
        <b>{title}</b>
        <span>{sub}</span>
      </div>
    </div>
  );
}

function Banner({ message, onClose }: { message: NonNullable<Message>; onClose: () => void }) {
  return (
    <div className={`bill-banner ${message.kind === "err" ? "bad" : "ok"}`}>
      <span className="bill-banner-icon">
        {message.kind === "err" ? <AlertTriangle size={15} /> : <CircleCheck size={15} />}
      </span>
      <span className="bill-banner-text">{message.text}</span>
      <button className="ghost-icon" onClick={onClose} aria-label="Dismiss">
        ×
      </button>
    </div>
  );
}

function Stars({ value, count }: { value: number; count: number }) {
  const filled = Math.round(value);
  return (
    <span className="mk-stars" title={`${value.toFixed(1)} out of 5`}>
      {[1, 2, 3, 4, 5].map((step) => (
        <Star key={step} size={11} className={step <= filled ? "on" : ""} />
      ))}
      <span>{count ? `${value.toFixed(1)} (${count})` : "No reviews yet"}</span>
    </span>
  );
}

function LogoTile({ icon, color, size }: { icon: string; color: string; size?: number }) {
  const Icon = mkIcon(icon);
  const dimension = size ?? 34;
  return (
    <div
      className="mk-logo"
      style={{
        width: dimension,
        height: dimension,
        background: `${color}1c`,
        color,
        borderColor: `${color}59`,
      }}
    >
      <Icon size={Math.round(dimension * 0.48)} />
    </div>
  );
}

function StatTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="mk-stat">
      <span>{label}</span>
      <b>{value}</b>
    </div>
  );
}

export function MarketplaceView({
  canManage,
  systemRole,
  onGoIntegrations,
}: {
  canManage: boolean;
  systemRole: string | null;
  onGoIntegrations: () => void;
}) {
  const [message, setMessage] = useState<Message>(null);
  const [busy, setBusy] = useState("");
  const [section, setSection] = useState<SectionKey>("browse");
  const [view, setView] = useState<View>({ kind: "list" });

  const [cards, setCards] = useState<AgentCard[]>([]);
  const [total, setTotal] = useState(0);
  const [categories, setCategories] = useState<{ category: string; count: number }[]>([]);
  const [qInput, setQInput] = useState("");
  const [q, setQ] = useState("");
  const [category, setCategory] = useState<string | null>(null);
  const [pricing, setPricing] = useState<string | null>(null);
  const [sort, setSort] = useState("newest");
  const [page, setPage] = useState(1);
  const limit = 12;

  const [detail, setDetail] = useState<AgentDetail | null>(null);
  const [detailTab, setDetailTab] = useState<"overview" | "reviews" | "versions" | "try" | "analytics" | "edit">("overview");
  const [versions, setVersions] = useState<VersionRow[]>([]);
  const [analytics, setAnalytics] = useState<AnalyticsData | null>(null);
  const [installResult, setInstallResult] = useState<InstallResult | null>(null);

  const [tryMessages, setTryMessages] = useState<Array<{ role: "user" | "assistant"; text: string }>>([]);
  const [tryInput, setTryInput] = useState("");
  const [tryRun, setTryRun] = useState<string | null>(null);
  const [tryStatus, setTryStatus] = useState("");
  const pollCount = useRef(0);

  const [mine, setMine] = useState<AgentCard[]>([]);
  const [installs, setInstalls] = useState<InstallRow[]>([]);
  const [queue, setQueue] = useState<QueueRow[]>([]);
  const [adminCreators, setAdminCreators] = useState<AdminCreator[]>([]);
  const [rejectFor, setRejectFor] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");

  const [creator, setCreator] = useState<CreatorProfile | null>(null);
  const [form, setForm] = useState<PublishForm>(emptyForm);
  const [tools, setTools] = useState<ToolMeta[]>([]);
  const [providers, setProviders] = useState<{ key: string; name: string }[]>([]);
  const [revRating, setRevRating] = useState(5);
  const [revTitle, setRevTitle] = useState("");
  const [revBody, setRevBody] = useState("");

  const ok = (text: string) => setMessage({ kind: "ok", text });
  const fail = (text: string) => setMessage({ kind: "err", text });

  function guardManage() {
    if (!canManage) {
      fail("Only workspace owners and admins can manage the marketplace.");
      return false;
    }
    return true;
  }

  const loadBrowse = useCallback(
    async (opts: { q?: string; category?: string | null; pricing?: string | null; sort?: string; page?: number } = {}) => {
      const next = {
        q: opts.q ?? q,
        category: opts.category === undefined ? category : opts.category,
        pricing: opts.pricing === undefined ? pricing : opts.pricing,
        sort: opts.sort ?? sort,
        page: opts.page ?? 1,
      };
      setBusy("browse");
      try {
        const params = new URLSearchParams();
        if (next.q) params.set("q", next.q);
        if (next.category) params.set("category", next.category);
        if (next.pricing) params.set("pricing", next.pricing);
        params.set("sort", next.sort);
        params.set("page", String(next.page));
        params.set("limit", String(limit));
        const data = await api<ListResponse>(`/marketplace/agents?${params.toString()}`);
        setCards(data.agents);
        setTotal(data.total);
        setCategories(data.categories);
        setQInput(next.q);
        setQ(next.q);
        setCategory(next.category);
        setPricing(next.pricing);
        setSort(next.sort);
        setPage(data.page);
      } catch (e) {
        fail(readError(e, "Could not load the marketplace"));
      } finally {
        setBusy("");
      }
    },
    [q, category, pricing, sort],
  );

  useEffect(() => {
    void loadBrowse();
  }, []);

  async function openDetail(slug: string, tab: "overview" | "reviews" | "versions" | "try" | "analytics" | "edit" = "overview") {
    setBusy("detail");
    try {
      const data = await api<AgentDetail>(`/marketplace/agents/${slug}`);
      setDetail(data);
      setDetailTab(tab);
      setView({ kind: "detail", slug });
      setInstallResult(null);
      setVersions([]);
      setAnalytics(null);
      setRevRating(data.myReview?.rating ?? 5);
      setRevTitle(data.myReview?.title ?? "");
      setRevBody(data.myReview?.body ?? "");
      if (tab === "versions") await loadVersions(slug);
      if (tab === "analytics") await loadAnalytics(slug);
    } catch (e) {
      fail(readError(e, "Could not load the agent"));
    } finally {
      setBusy("");
    }
  }

  async function loadVersions(slug: string) {
    try {
      const data = await api<{ current: number; versions: VersionRow[] }>(`/marketplace/agents/${slug}/versions`);
      setVersions(data.versions);
    } catch (e) {
      fail(readError(e, "Could not load versions"));
    }
  }

  async function loadAnalytics(slug: string) {
    try {
      const data = await api<AnalyticsData>(`/marketplace/agents/${slug}/analytics`);
      setAnalytics(data);
    } catch (e) {
      fail(readError(e, "Could not load analytics"));
    }
  }

  async function loadMine() {
    setBusy("mine");
    try {
      setMine(await api<AgentCard[]>("/marketplace/agents/mine"));
    } catch (e) {
      fail(readError(e, "Could not load your agents"));
    } finally {
      setBusy("");
    }
  }

  async function loadInstalls() {
    setBusy("installs");
    try {
      setInstalls(await api<InstallRow[]>("/marketplace/installs"));
    } catch (e) {
      fail(readError(e, "Could not load installs"));
    } finally {
      setBusy("");
    }
  }

  async function loadQueue() {
    setBusy("queue");
    try {
      const [rows, creators] = await Promise.all([
        api<QueueRow[]>("/admin/marketplace/queue"),
        api<AdminCreator[]>("/admin/marketplace/creators"),
      ]);
      setQueue(rows);
      setAdminCreators(creators);
    } catch (e) {
      fail(readError(e, "Could not load the review queue"));
    } finally {
      setBusy("");
    }
  }

  async function openCreator(handle: string) {
    setBusy("creator");
    try {
      setCreator(await api<CreatorProfile>(`/marketplace/creators/${handle}`));
      setView({ kind: "creator", handle });
    } catch (e) {
      fail(readError(e, "Could not load the creator"));
    } finally {
      setBusy("");
    }
  }

  async function loadFormOptions() {
    if (tools.length && providers.length) return;
    try {
      const [toolRows, catalog] = await Promise.all([
        api<ToolMeta[]>("/tools"),
        api<{ providers: { key: string; name: string }[] }>("/integrations/catalog"),
      ]);
      setTools(toolRows);
      setProviders(catalog.providers);
    } catch (e) {
      fail(readError(e, "Could not load the publish options"));
    }
  }

  async function startPublish(slug: string | null) {
    if (!guardManage()) return;
    await loadFormOptions();
    if (slug) {
      let source = detail;
      if (!source || source.slug !== slug) {
        try {
          source = await api<AgentDetail>(`/marketplace/agents/${slug}`);
          setDetail(source);
        } catch (e) {
          fail(readError(e, "Could not load the agent"));
          return;
        }
      }
      const data = source!;
      setForm({
        name: data.name,
        summary: data.summary,
        description: data.description,
        category: data.category,
        logoIcon: data.logoIcon,
        logoColor: data.logoColor,
        pricing: data.pricing,
        priceAmount: data.priceAmount ? String(data.priceAmount / 100) : "",
        pricePeriod: data.pricePeriod,
        pricePerRun: data.pricePerRun ? String(data.pricePerRun / 100) : "",
        avgCost: data.avgCostMicros ? String(data.avgCostMicros / 1_000_000) : "",
        integrations: [...data.requiredIntegrations],
        models: data.requiredModels.join(", "),
        permissions: data.permissions.join(", "),
        instructions: data.config.instructions,
        systemPrompt: data.config.systemPrompt ?? "",
        tools: [...data.config.tools],
        changelog: "",
      });
    } else {
      setForm(emptyForm);
    }
    setView({ kind: "publish", slug });
  }

  function buildPayload(includeConfig: boolean) {
    const payload: Record<string, unknown> = {
      name: form.name.trim(),
      summary: form.summary.trim(),
      description: form.description.trim(),
      category: form.category,
      logoIcon: form.logoIcon.trim() || "sparkles",
      logoColor: form.logoColor.trim() || "#7c5cff",
      pricing: form.pricing,
      priceAmount: toPaise(form.priceAmount),
      pricePeriod: form.pricePeriod,
      pricePerRun: toPaise(form.pricePerRun),
      avgCostMicros: toMicros(form.avgCost),
      requiredIntegrations: form.integrations,
      requiredModels: splitList(form.models),
      permissions: splitList(form.permissions),
    };
    if (includeConfig) {
      payload.config = {
        instructions: form.instructions.trim(),
        ...(form.systemPrompt.trim() ? { systemPrompt: form.systemPrompt.trim() } : {}),
        tools: form.tools,
      };
    }
    return payload;
  }

  function validateForm(includeConfig: boolean): string | null {
    if (form.name.trim().length < 2) return "Give the agent a name with at least 2 characters.";
    if (form.summary.trim().length < 10) return "The summary needs at least 10 characters.";
    if (form.description.trim().length < 20) return "The description needs at least 20 characters.";
    if (includeConfig && form.instructions.trim().length < 10) return "Instructions need at least 10 characters.";
    if (form.pricing === "PAID" && toPaise(form.priceAmount) <= 0) return "Set a price for this paid agent.";
    if (form.pricing === "USAGE" && toPaise(form.pricePerRun) <= 0) return "Set a price per run for usage based agents.";
    return null;
  }

  async function savePublish(submitAfter: boolean) {
    if (!guardManage()) return;
    const isPublished = view.kind === "publish" && Boolean(view.slug) && detail?.status === "PUBLISHED";
    const includeConfig = !isPublished;
    const problem = validateForm(includeConfig);
    if (problem) {
      fail(problem);
      return;
    }
    setBusy("publish");
    try {
      if (view.kind === "publish" && view.slug) {
        await api(`/marketplace/agents/${view.slug}`, {
          method: "PATCH",
          body: JSON.stringify(buildPayload(includeConfig)),
        });
        if (submitAfter) await api(`/marketplace/agents/${view.slug}/submit`, { method: "POST" });
      } else {
        const created = await api<{ slug: string }>("/marketplace/agents", {
          method: "POST",
          body: JSON.stringify(buildPayload(true)),
        });
        if (submitAfter) await api(`/marketplace/agents/${created.slug}/submit`, { method: "POST" });
      }
      ok(submitAfter ? "Submitted for review. A system admin will approve it." : "Draft saved.");
      setView({ kind: "list" });
      setSection("mine");
      await loadMine();
    } catch (e) {
      fail(readError(e, "Could not save the agent"));
    } finally {
      setBusy("");
    }
  }

  async function publishVersionNow() {
    if (!guardManage() || !detail) return;
    const problem = validateForm(true);
    if (problem) {
      fail(problem);
      return;
    }
    setBusy("version");
    try {
      await api(`/marketplace/agents/${detail.slug}/versions`, {
        method: "POST",
        body: JSON.stringify({ config: buildPayload(true).config, changelog: form.changelog.trim() }),
      });
      ok("New version published.");
      await openDetail(detail.slug, "versions");
    } catch (e) {
      fail(readError(e, "Could not publish the version"));
    } finally {
      setBusy("");
    }
  }

  async function submitForReview() {
    if (!guardManage() || !detail) return;
    setBusy("submit");
    try {
      await api(`/marketplace/agents/${detail.slug}/submit`, { method: "POST" });
      ok("Submitted for review.");
      await openDetail(detail.slug, "overview");
      await loadMine();
    } catch (e) {
      fail(readError(e, "Could not submit the agent"));
    } finally {
      setBusy("");
    }
  }

  async function unpublish() {
    if (!guardManage() || !detail) return;
    setBusy("unpublish");
    try {
      await api(`/marketplace/agents/${detail.slug}/unpublish`, { method: "POST" });
      ok("Unpublished. It is back to a private draft.");
      await openDetail(detail.slug, "overview");
      await loadMine();
    } catch (e) {
      fail(readError(e, "Could not unpublish the agent"));
    } finally {
      setBusy("");
    }
  }

  async function removeAgent() {
    if (!guardManage() || !detail) return;
    if (!window.confirm(`Delete "${detail.name}" permanently? Versions, reviews and installs are removed too.`)) return;
    setBusy("delete");
    try {
      await api(`/marketplace/agents/${detail.slug}`, { method: "DELETE" });
      ok("Agent deleted.");
      setView({ kind: "list" });
      setSection("mine");
      setDetail(null);
      await loadMine();
    } catch (e) {
      fail(readError(e, "Could not delete the agent"));
    } finally {
      setBusy("");
    }
  }

  async function rollbackTo(version: number) {
    if (!guardManage() || !detail) return;
    setBusy(`rollback:${version}`);
    try {
      await api(`/marketplace/agents/${detail.slug}/rollback`, {
        method: "POST",
        body: JSON.stringify({ version }),
      });
      ok(`Rolled back to version ${version}.`);
      await openDetail(detail.slug, "versions");
    } catch (e) {
      fail(readError(e, "Could not roll back"));
    } finally {
      setBusy("");
    }
  }

  async function installAgent() {
    if (!guardManage() || !detail) return;
    setBusy("install");
    try {
      const result = await api<InstallResult>(`/marketplace/agents/${detail.slug}/install`, { method: "POST" });
      const slug = detail.slug;
      const tab = detailTab;
      await openDetail(slug, tab);
      setInstallResult(result);
      const parts: string[] = [`Installed "${result.marketplace.name}" into your workspace.`];
      if (result.missing.integrations.length) parts.push("Connect the required integrations to unlock it.");
      if (!result.missing.modelReady) parts.push("No model provider is configured yet.");
      ok(parts.join(" "));
    } catch (e) {
      fail(readError(e, "Could not install the agent"));
    } finally {
      setBusy("");
    }
  }

  async function forkAgent() {
    if (!guardManage() || !detail) return;
    setBusy("fork");
    try {
      const fork = await api<{ slug: string }>(`/marketplace/agents/${detail.slug}/fork`, { method: "POST" });
      ok("Forked into your private drafts. Edit it and submit when ready.");
      await openDetail(fork.slug, "overview");
    } catch (e) {
      fail(readError(e, "Could not fork the agent"));
    } finally {
      setBusy("");
    }
  }

  async function uninstallAgent(installId: string) {
    if (!guardManage()) return;
    setBusy(`uninstall:${installId}`);
    try {
      await api(`/marketplace/installs/${installId}/uninstall`, { method: "POST" });
      ok("Uninstalled. The workspace agent stays disabled.");
      await loadInstalls();
    } catch (e) {
      fail(readError(e, "Could not uninstall the agent"));
    } finally {
      setBusy("");
    }
  }

  async function tryAgent() {
    if (!detail) return;
    const message = tryInput.trim();
    if (!message) return;
    setTryInput("");
    setTryMessages((prev) => [...prev, { role: "user", text: message }]);
    setBusy("try");
    try {
      const res = await api<{ runId: string }>(`/marketplace/agents/${detail.slug}/try`, {
        method: "POST",
        body: JSON.stringify({ message }),
      });
      pollCount.current = 0;
      setTryRun(res.runId);
      setTryStatus("Queued…");
    } catch (e) {
      const text = readError(e, "Could not start the preview");
      fail(text);
      setTryMessages((prev) => [...prev, { role: "assistant", text }]);
    } finally {
      setBusy("");
    }
  }

  useEffect(() => {
    if (!tryRun) return;
    const timer = setInterval(async () => {
      pollCount.current += 1;
      if (pollCount.current > 45) {
        setTryRun(null);
        setTryStatus("");
        setTryMessages((prev) => [...prev, { role: "assistant", text: "The preview timed out. Try again in a moment." }]);
        return;
      }
      try {
        const runs = await api<Array<{ id: string; status: string; output?: unknown; error?: string | null }>>("/runs");
        const run = runs.find((entry) => entry.id === tryRun);
        if (!run) return;
        if (run.status === "COMPLETED") {
          setTryRun(null);
          setTryStatus("");
          setTryMessages((prev) => [...prev, { role: "assistant", text: extractAnswer(run.output) }]);
        } else if (run.status === "FAILED") {
          setTryRun(null);
          setTryStatus("");
          setTryMessages((prev) => [...prev, { role: "assistant", text: run.error || "The preview run failed." }]);
        } else {
          setTryStatus(`Running — ${run.status.toLowerCase()}…`);
        }
      } catch {
        setTryStatus("Checking run status…");
      }
    }, 1800);
    return () => clearInterval(timer);
  }, [tryRun]);

  async function submitReview() {
    if (!detail) return;
    setBusy("review");
    try {
      await api(`/marketplace/agents/${detail.slug}/reviews`, {
        method: "POST",
        body: JSON.stringify({ rating: revRating, title: revTitle.trim(), body: revBody.trim() }),
      });
      ok("Review saved.");
      await openDetail(detail.slug, "reviews");
    } catch (e) {
      fail(readError(e, "Could not save the review"));
    } finally {
      setBusy("");
    }
  }

  async function moderate(field: "verified" | "featured" | "suspend", value: boolean) {
    if (!detail) return;
    setBusy(`moderate:${field}`);
    try {
      await api(`/admin/marketplace/agents/${detail.id}/moderate`, {
        method: "POST",
        body: JSON.stringify({ [field]: value }),
      });
      ok("Moderation applied.");
      await openDetail(detail.slug, detailTab);
    } catch (e) {
      fail(readError(e, "Could not apply moderation"));
    } finally {
      setBusy("");
    }
  }

  async function queueDecision(id: string, action: "approve" | "reject") {
    setBusy(`queue:${id}:${action}`);
    try {
      await api(`/admin/marketplace/agents/${id}/review`, {
        method: "POST",
        body: JSON.stringify({ action, reason: rejectReason.trim() }),
      });
      ok(action === "approve" ? "Agent approved and published." : "Agent rejected with feedback.");
      setRejectFor(null);
      setRejectReason("");
      await loadQueue();
    } catch (e) {
      fail(readError(e, "Could not apply the decision"));
    } finally {
      setBusy("");
    }
  }

  async function moderateCreator(userId: string, verified: boolean) {
    setBusy(`creator:${userId}`);
    try {
      await api(`/admin/marketplace/creators/${userId}/moderate`, {
        method: "POST",
        body: JSON.stringify({ verified }),
      });
      ok(verified ? "Creator verified." : "Verification removed.");
      await loadQueue();
    } catch (e) {
      fail(readError(e, "Could not update the creator"));
    } finally {
      setBusy("");
    }
  }

  function switchSection(next: SectionKey) {
    setSection(next);
    setView({ kind: "list" });
    setInstallResult(null);
    if (next === "mine") void loadMine();
    if (next === "installs") void loadInstalls();
    if (next === "queue" && systemRole === "ADMIN") void loadQueue();
    if (next === "browse") void loadBrowse();
  }

  function backToList() {
    setView({ kind: "list" });
    setDetail(null);
    setCreator(null);
    setInstallResult(null);
    if (section === "mine") void loadMine();
    if (section === "installs") void loadInstalls();
    if (section === "queue" && systemRole === "ADMIN") void loadQueue();
    if (section === "browse") void loadBrowse();
  }

  function renderCard(agent: AgentCard) {
    const Icon = mkIcon(agent.logoIcon);
    return (
      <div
        key={agent.id}
        className={`int-card mk-card ${agent.featured ? "featured" : ""}`}
        role="button"
        tabIndex={0}
        onClick={() => void openDetail(agent.slug)}
        onKeyDown={(e) => {
          if (e.key === "Enter") void openDetail(agent.slug);
        }}
      >
        <div className="int-card-top">
          <div className="mk-logo" style={{ background: `${agent.logoColor}1c`, color: agent.logoColor, borderColor: `${agent.logoColor}59` }}>
            <Icon size={17} />
          </div>
          <div className="int-card-title">
            <b>
              {agent.name}
              {agent.verified && <BadgeCheck size={12} className="mk-verified-icon" aria-label="Verified" />}
            </b>
            <span>
              {agent.creator ? (
                <button
                  className="mk-link"
                  onClick={(e) => {
                    e.stopPropagation();
                    void openCreator(agent.creator!.handle);
                  }}
                >
                  @{agent.creator.handle}
                </button>
              ) : (
                CATEGORY_LABELS[agent.category] ?? agent.category
              )}
            </span>
          </div>
          <span className={`mk-price ${agent.pricing === "FREE" ? "free" : ""}`}>{priceLabel(agent)}</span>
        </div>
        <p className="int-card-blurb">{agent.summary}</p>
        <Stars value={agent.ratingAvg} count={agent.ratingCount} />
        <div className="int-card-meta">
          <span className="pill">{CATEGORY_LABELS[agent.category] ?? agent.category}</span>
          <span className="pill muted">{`${agent.installs} install${agent.installs === 1 ? "" : "s"}`}</span>
          {agent.executions > 0 && <span className="pill ok">{`${rateLabel(agent.successRate)} success`}</span>}
          <span className="pill muted">{`v${agent.currentVersion}`}</span>
          {agent.featured && <span className="pill warn">Featured</span>}
        </div>
        <div className="int-card-foot">
          <button
            className="secondary"
            onClick={(e) => {
              e.stopPropagation();
              void openDetail(agent.slug, "try");
            }}
          >
            <Play size={12} /> Try
          </button>
          <button
            className="primary"
            onClick={(e) => {
              e.stopPropagation();
              void openDetail(agent.slug);
            }}
          >
            View agent
          </button>
        </div>
      </div>
    );
  }

  function renderBrowse() {
    const pageCount = Math.max(1, Math.ceil(total / limit));
    return (
      <>
        <div className="int-form inline mk-toolbar">
          <label>
            Search
            <div className="mk-search">
              <Search size={13} />
              <input
                value={qInput}
                placeholder="inbox, research, triage…"
                onChange={(e) => setQInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void loadBrowse({ q: qInput, page: 1 });
                }}
              />
            </div>
          </label>
          <label>
            Pricing
            <select value={pricing ?? ""} onChange={(e) => void loadBrowse({ pricing: e.target.value || null, page: 1 })}>
              <option value="">Any pricing</option>
              <option value="FREE">Free</option>
              <option value="PAID">Paid</option>
              <option value="USAGE">Usage based</option>
            </select>
          </label>
          <label>
            Sort by
            <select value={sort} onChange={(e) => void loadBrowse({ sort: e.target.value, page: 1 })}>
              <option value="newest">Newest</option>
              <option value="popular">Most installed</option>
              <option value="rating">Highest rated</option>
              <option value="name">Name</option>
            </select>
          </label>
          <button className="secondary" onClick={() => void loadBrowse({ q: qInput, page: 1 })} disabled={busy === "browse"}>
            <Search size={13} /> Search
          </button>
        </div>
        <div className="int-filters">
          <button className={`int-tab ${category === null ? "on" : ""}`} onClick={() => void loadBrowse({ category: null, page: 1 })}>
            All
          </button>
          {categories.map((entry) => (
            <button
              key={entry.category}
              className={`int-tab ${category === entry.category ? "on" : ""}`}
              onClick={() => void loadBrowse({ category: entry.category, page: 1 })}
            >
              {CATEGORY_LABELS[entry.category] ?? entry.category} · {entry.count}
            </button>
          ))}
        </div>
        {busy === "browse" && !cards.length ? (
          <div className="empty">
            <b>Loading marketplace…</b>
          </div>
        ) : cards.length ? (
          <div className="int-grid">{cards.map(renderCard)}</div>
        ) : (
          <div className="empty">
            <div className="empty-icon">
              <Search size={16} />
            </div>
            <b>No agents match those filters</b>
            <p>Try a different category or clear the search.</p>
          </div>
        )}
        {pageCount > 1 && (
          <div className="mk-pager">
            <button className="ghost-icon" disabled={page <= 1} onClick={() => void loadBrowse({ page: page - 1 })}>
              <ChevronLeft size={14} />
            </button>
            <span>{`Page ${page} of ${pageCount}`}</span>
            <button className="ghost-icon" disabled={page >= pageCount} onClick={() => void loadBrowse({ page: page + 1 })}>
              <ChevronRight size={14} />
            </button>
          </div>
        )}
      </>
    );
  }

  function renderInstallBanner() {
    if (!installResult) return null;
    const { missing } = installResult;
    const needsConnect = missing.integrations.length > 0;
    return (
      <div className={`bill-banner ${needsConnect || !missing.modelReady ? "bad" : "ok"} mk-install-banner`}>
        <span className="bill-banner-icon">{needsConnect || !missing.modelReady ? <AlertTriangle size={15} /> : <CircleCheck size={15} />}</span>
        <span className="bill-banner-text">
          <b>Installed as “{installResult.agent.name}”.</b>{" "}
          {needsConnect && `Missing integrations: ${missing.integrations.map(integrationLabel).join(", ")}. `}
          {missing.tools.length > 0 && `Unavailable tools: ${missing.tools.join(", ")}. `}
          {!missing.modelReady && "No model provider is configured. "}
          <span className="mk-banner-note">The agent imported with its instructions, tools and permissions.</span>
        </span>
        {needsConnect && (
          <button className="secondary" onClick={onGoIntegrations}>
            <Plug size={12} /> Connect now
          </button>
        )}
        <button className="ghost-icon" onClick={() => setInstallResult(null)} aria-label="Dismiss">
          ×
        </button>
      </div>
    );
  }

  function renderOverview() {
    if (!detail) return null;
    return (
      <>
        {installResult && renderInstallBanner()}
        {detail.status !== "PUBLISHED" && detail.canEdit && (
          <div className="int-note">
            {detail.status === "IN_REVIEW"
              ? "In review — a system admin will approve or reject this draft."
              : detail.status === "REJECTED"
                ? `Rejected: ${detail.reviewReason || "no reason recorded"}. Edit the draft and submit again.`
                : "Private draft — only your workspace can see it. Submit it for review when ready."}
          </div>
        )}
        <div className="mk-stats">
          <StatTile label="Installs" value={String(detail.installs)} />
          <StatTile label="Rating" value={detail.ratingCount ? `${detail.ratingAvg.toFixed(1)} ★` : "—"} />
          <StatTile label="Success rate" value={rateLabel(detail.successRate)} />
          <StatTile label="Executions" value={String(detail.executions)} />
          <StatTile label="Avg cost / run" value={costLabel(detail.avgCostMicros)} />
          <StatTile label="Version" value={`v${detail.currentVersion}`} />
        </div>
        <div className="mk-section">
          <span className="bill-label">About this agent</span>
          <p className="mk-prose">{detail.description}</p>
        </div>
        <div className="mk-section">
          <span className="bill-label">Latest changelog</span>
          <p className="mk-prose">{detail.changelog || "No changelog yet."}</p>
          {detail.forkedFrom && (
            <p className="mk-prose muted">
              Forked from{" "}
              <button className="mk-link" onClick={() => void openDetail(detail.forkedFrom!.slug)}>
                {detail.forkedFrom.name}
              </button>
              .
            </p>
          )}
        </div>
        <div className="mk-requirements">
          <div className="mk-req">
            <span className="bill-label">Required integrations</span>
            <div className="int-card-meta">
              {detail.requiredIntegrations.length ? (
                detail.requiredIntegrations.map((key) => (
                  <button key={key} className="pill mk-req-pill" onClick={onGoIntegrations} title="Open integrations">
                    {integrationLabel(key)}
                  </button>
                ))
              ) : (
                <span className="pill muted">None</span>
              )}
            </div>
          </div>
          <div className="mk-req">
            <span className="bill-label">Tools</span>
            <div className="int-card-meta">
              {detail.requiredTools.length ? (
                detail.requiredTools.map((tool) => (
                  <span key={tool} className="pill muted">
                    {tool}
                  </span>
                ))
              ) : (
                <span className="pill muted">None</span>
              )}
            </div>
          </div>
          <div className="mk-req">
            <span className="bill-label">Model requirements</span>
            <div className="int-card-meta">
              {detail.requiredModels.length ? (
                detail.requiredModels.map((model) => (
                  <span key={model} className="pill muted">
                    {model}
                  </span>
                ))
              ) : (
                <span className="pill muted">Any configured model</span>
              )}
            </div>
          </div>
          <div className="mk-req">
            <span className="bill-label">Permissions</span>
            <div className="int-card-meta">
              {detail.permissions.length ? (
                detail.permissions.map((permission) => (
                  <span key={permission} className="pill warn">
                    {permission}
                  </span>
                ))
              ) : (
                <span className="pill muted">None</span>
              )}
            </div>
          </div>
        </div>
      </>
    );
  }

  function renderReviews() {
    if (!detail) return null;
    const maxCount = Math.max(1, ...detail.histogram.map((bucket) => bucket.count));
    return (
      <div className="mk-reviews">
        <div className="mk-review-summary">
          <div className="mk-review-score">
            <b>{detail.ratingCount ? detail.ratingAvg.toFixed(1) : "—"}</b>
            <Stars value={detail.ratingAvg} count={detail.ratingCount} />
          </div>
          <div className="mk-hist">
            {[5, 4, 3, 2, 1].map((star) => {
              const bucket = detail.histogram.find((entry) => entry.rating === star);
              const count = bucket?.count ?? 0;
              return (
                <div className="mk-hist-row" key={star}>
                  <span>{star} ★</span>
                  <span className="mk-hist-track">
                    <i style={{ width: `${(count / maxCount) * 100}%` }} />
                  </span>
                  <span>{count}</span>
                </div>
              );
            })}
          </div>
        </div>
        <div className="int-form mk-review-form">
          <span className="bill-label">{detail.myReview ? "Update your review" : "Leave a review"}</span>
          <div className="mk-rate-picker">
            {[1, 2, 3, 4, 5].map((step) => (
              <button key={step} type="button" className={step <= revRating ? "on" : ""} onClick={() => setRevRating(step)} aria-label={`${step} stars`}>
                <Star size={16} />
              </button>
            ))}
          </div>
          <label>
            Title
            <input value={revTitle} placeholder="Works great for triage" onChange={(e) => setRevTitle(e.target.value)} maxLength={160} />
          </label>
          <label>
            Review
            <textarea value={revBody} placeholder="What worked, what did not…" rows={3} onChange={(e) => setRevBody(e.target.value)} maxLength={3000} />
          </label>
          <button className="primary" disabled={busy === "review"} onClick={() => void submitReview()}>
            {busy === "review" ? "Saving…" : detail.myReview ? "Update review" : "Post review"}
          </button>
        </div>
        <div className="mk-review-list">
          {detail.reviews.length ? (
            detail.reviews.map((review) => (
              <div className="mk-review" key={review.id}>
                <div className="mk-review-head">
                  <b>{review.userName || "Member"}</b>
                  <Stars value={review.rating} count={0} />
                  <span className="pill muted">{`v${review.version}`}</span>
                  <span className="mk-review-date">{new Date(review.createdAt).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}</span>
                </div>
                {review.title && <b className="mk-review-title">{review.title}</b>}
                {review.body && <p>{review.body}</p>}
              </div>
            ))
          ) : (
            <div className="empty">
              <b>No reviews yet</b>
              <p>Be the first to rate this agent.</p>
            </div>
          )}
        </div>
      </div>
    );
  }

  function renderVersions() {
    if (!detail) return null;
    return (
      <>
        {detail.canEdit && (
          <div className="int-note">
            Publishing a version swaps the active config for everyone. Roll back anytime — older versions stay available.
          </div>
        )}
        <div className="mk-version-list">
          {versions.map((version) => (
            <div className="mk-version" key={version.version}>
              <div className="mk-version-head">
                <b>{`v${version.version}`}</b>
                {version.isCurrent && <span className="pill ok">Active</span>}
                <span className="mk-review-date">{new Date(version.createdAt).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}</span>
                {detail.canEdit && !version.isCurrent && (
                  <button className="secondary" disabled={busy === `rollback:${version.version}`} onClick={() => void rollbackTo(version.version)}>
                    Roll back
                  </button>
                )}
              </div>
              <p className="mk-prose">{version.changelog || "No changelog."}</p>
              <span className="bill-sub">{version.createdBy ? `Published by ${version.createdBy}` : ""}</span>
            </div>
          ))}
          {!versions.length && (
            <div className="empty">
              <b>No versions loaded</b>
              <p>Version history appears here.</p>
            </div>
          )}
        </div>
      </>
    );
  }

  function renderTry() {
    if (!detail) return null;
    return (
      <div className="mk-try">
        <div className="int-note">
          Try runs a live preview with this agent&apos;s instructions and tools in a sandboxed preview agent. Preview runs count against your
          workspace run quota.
        </div>
        <div className="mk-chat">
          {!tryMessages.length && (
            <div className="empty">
              <div className="empty-icon">
                <MessageSquare size={16} />
              </div>
              <b>Preview the agent</b>
              <p>Ask a question to see how this agent responds before installing it.</p>
            </div>
          )}
          {tryMessages.map((entry, index) => (
            <div className={`mk-msg ${entry.role}`} key={`${entry.role}:${index}`}>
              <span className="mk-msg-who">{entry.role === "user" ? "You" : detail.name}</span>
              <p>{entry.text}</p>
            </div>
          ))}
        </div>
        <div className="mk-try-input">
          <input
            value={tryInput}
            placeholder="Summarise my inbox from yesterday…"
            disabled={Boolean(tryRun)}
            onChange={(e) => setTryInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void tryAgent();
            }}
          />
          <button className="primary" disabled={busy === "try" || Boolean(tryRun) || !tryInput.trim()} onClick={() => void tryAgent()}>
            {busy === "try" ? "Starting…" : tryRun ? tryStatus || "Running…" : <Send size={13} />}
          </button>
        </div>
        {tryRun && <div className="mk-try-status"><Clock size={12} /> {tryStatus || "Running…"}</div>}
      </div>
    );
  }

  function renderAnalytics() {
    if (!detail) return null;
    if (!analytics) {
      return (
        <div className="empty">
          <b>Loading analytics…</b>
        </div>
      );
    }
    const maxCount = Math.max(1, ...analytics.histogram.map((bucket) => bucket.count));
    return (
      <>
        <div className="mk-stats">
          <StatTile label="Total installs" value={String(analytics.installs)} />
          <StatTile label="Installs · 30d" value={String(analytics.installs30d)} />
          <StatTile label="Preview tries" value={String(analytics.tries)} />
          <StatTile label="Executions" value={String(analytics.executions)} />
          <StatTile label="Success rate" value={rateLabel(analytics.successRate)} />
          <StatTile label="Tokens used" value={analytics.totalTokens.toLocaleString("en-IN")} />
          <StatTile label="Reviews" value={String(analytics.ratingCount)} />
          <StatTile label="Est. cost / run" value={costLabel(analytics.avgCostMicros)} />
        </div>
        <div className="mk-section">
          <span className="bill-label">Rating breakdown</span>
          <div className="mk-hist">
            {[5, 4, 3, 2, 1].map((star) => {
              const bucket = analytics.histogram.find((entry) => entry.rating === star);
              const count = bucket?.count ?? 0;
              return (
                <div className="mk-hist-row" key={star}>
                  <span>{star} ★</span>
                  <span className="mk-hist-track">
                    <i style={{ width: `${(count / maxCount) * 100}%` }} />
                  </span>
                  <span>{count}</span>
                </div>
              );
            })}
          </div>
        </div>
        <div className="mk-section">
          <span className="bill-label">Run outcomes</span>
          <div className="mk-stats">
            <StatTile label="Completed" value={String(analytics.completed)} />
            <StatTile label="Failed" value={String(analytics.failed)} />
            <StatTile label="Awaiting" value={String(Math.max(0, analytics.executions - analytics.completed - analytics.failed))} />
          </div>
        </div>
      </>
    );
  }

  function renderDetail() {
    if (!detail) {
      return (
        <div className="empty">
          <b>Loading agent…</b>
        </div>
      );
    }
    const tabs: Array<"overview" | "reviews" | "versions" | "try" | "analytics" | "edit"> = ["overview", "reviews", "versions", "try"];
    if (detail.canEdit) tabs.push("analytics", "edit");
    const Icon = mkIcon(detail.logoIcon);
    return (
      <>
        <button className="ghost mk-back" onClick={backToList}>
          <ArrowLeft size={13} /> Back to marketplace
        </button>
        {renderInstallBanner()}
        <div className="mk-detail-head">
          <div className="mk-detail-id">
            <div className="mk-logo lg" style={{ background: `${detail.logoColor}1c`, color: detail.logoColor, borderColor: `${detail.logoColor}59` }}>
              <Icon size={24} />
            </div>
            <div>
              <h2>
                {detail.name}
                {detail.verified && <BadgeCheck size={15} className="mk-verified-icon" aria-label="Verified" />}
              </h2>
              <div className="mk-subline">
                {detail.creator && (
                  <button className="mk-link" onClick={() => void openCreator(detail.creator!.handle)}>
                    @{detail.creator.handle}
                  </button>
                )}
                <span className="pill">{CATEGORY_LABELS[detail.category] ?? detail.category}</span>
                <span className={`pill ${detail.status === "PUBLISHED" ? "ok" : detail.status === "REJECTED" ? "bad" : "warn"}`}>{detail.status.replace("_", " ")}</span>
                {detail.suspended && <span className="pill bad">Suspended</span>}
                {detail.featured && <span className="pill warn">Featured</span>}
                <span className={`mk-price ${detail.pricing === "FREE" ? "free" : ""}`}>{priceLabel(detail)}</span>
              </div>
            </div>
          </div>
          <div className="mk-actions">
            <button className="secondary" onClick={() => setDetailTab("try")}>
              <Play size={13} /> Try agent
            </button>
            {detail.myInstall ? (
              <span className="pill ok mk-installed">
                <Check size={11} /> Installed
              </span>
            ) : (
              <button className="primary" disabled={busy === "install"} onClick={() => void installAgent()}>
                <Download size={13} /> {busy === "install" ? "Installing…" : "Install"}
              </button>
            )}
            <button className="secondary" disabled={busy === "fork"} onClick={() => void forkAgent()}>
              <GitFork size={13} /> Fork
            </button>
          </div>
        </div>
        <div className="int-tabs">
          {tabs.map((tab) => (
            <button
              key={tab}
              className={`int-tab ${detailTab === tab ? "on" : ""}`}
              onClick={() => {
                setDetailTab(tab);
                if (tab === "versions") void loadVersions(detail.slug);
                if (tab === "analytics") void loadAnalytics(detail.slug);
              }}
            >
              {tab === "edit" ? (detail.status === "PUBLISHED" ? "New version" : "Edit draft") : tab[0].toUpperCase() + tab.slice(1)}
            </button>
          ))}
          {detail.canEdit && detail.status === "DRAFT" && (
            <button className="int-tab mk-submit" disabled={busy === "submit"} onClick={() => void submitForReview()}>
              Submit for review
            </button>
          )}
          {detail.canEdit && detail.status === "PUBLISHED" && (
            <button className="int-tab mk-submit" disabled={busy === "unpublish"} onClick={() => void unpublish()}>
              Unpublish
            </button>
          )}
          {detail.canEdit && (
            <button className="int-tab" disabled={busy === "delete"} onClick={() => void removeAgent()}>
              <Trash2 size={11} /> Delete
            </button>
          )}
          {detail.canModerate && (
            <>
              <button className="int-tab" disabled={busy === "moderate:verified"} onClick={() => void moderate("verified", !detail.verified)}>
                {detail.verified ? "Remove verify" : "Verify agent"}
              </button>
              <button className="int-tab" disabled={busy === "moderate:featured"} onClick={() => void moderate("featured", !detail.featured)}>
                {detail.featured ? "Unfeature" : "Feature"}
              </button>
              <button className="int-tab" disabled={busy === "moderate:suspend"} onClick={() => void moderate("suspend", !detail.suspended)}>
                {detail.suspended ? "Reinstate" : "Suspend"}
              </button>
            </>
          )}
        </div>
        {detailTab === "overview" && renderOverview()}
        {detailTab === "reviews" && renderReviews()}
        {detailTab === "versions" && renderVersions()}
        {detailTab === "try" && renderTry()}
        {detailTab === "analytics" && detail.canEdit && renderAnalytics()}
        {detailTab === "edit" && detail.canEdit && renderPublishForm(true)}
      </>
    );
  }

  function renderMine() {
    return (
      <>
        <div className="mk-mine-head">
          <p className="bill-sub">Drafts, review state and published agents owned by your workspace.</p>
          <button className="primary" onClick={() => void startPublish(null)}>
            <Rocket size={13} /> Publish an agent
          </button>
        </div>
        {busy === "mine" && !mine.length ? (
          <div className="empty">
            <b>Loading your agents…</b>
          </div>
        ) : mine.length ? (
          <div className="int-grid">
            {mine.map((agent) => (
              <div className="int-card mk-card" key={agent.id}>
                <div className="int-card-top">
                  <div className="mk-logo" style={{ background: `${agent.logoColor}1c`, color: agent.logoColor, borderColor: `${agent.logoColor}59` }}>
                    {(() => {
                      const Icon = mkIcon(agent.logoIcon);
                      return <Icon size={17} />;
                    })()}
                  </div>
                  <div className="int-card-title">
                    <b>{agent.name}</b>
                    <span>{`@${agent.slug}`}</span>
                  </div>
                  <span className={`pill ${agent.status === "PUBLISHED" ? "ok" : agent.status === "REJECTED" ? "bad" : agent.status === "IN_REVIEW" ? "warn" : "muted"}`}>
                    {agent.status.replace("_", " ")}
                  </span>
                </div>
                <p className="int-card-blurb">{agent.summary}</p>
                <div className="int-card-meta">
                  <span className="pill">{CATEGORY_LABELS[agent.category] ?? agent.category}</span>
                  <span className="pill muted">{priceLabel(agent)}</span>
                  <span className="pill muted">{`${agent.installs} installs`}</span>
                </div>
                <div className="int-card-foot">
                  <button className="secondary" onClick={() => void startPublish(agent.slug)}>
                    <Pencil size={12} /> Edit
                  </button>
                  {agent.status === "PUBLISHED" ? (
                    <button className="primary" onClick={() => void openDetail(agent.slug)}>
                      View listing
                    </button>
                  ) : (
                    <button className="primary" onClick={() => void openDetail(agent.slug)}>
                      Open draft
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="empty">
            <div className="empty-icon">
              <Rocket size={16} />
            </div>
            <b>No agents yet</b>
            <p>Publish your first agent — write the instructions, pick the tools, and submit it for review.</p>
            <button className="primary" onClick={() => void startPublish(null)}>
              Publish an agent
            </button>
          </div>
        )}
      </>
    );
  }

  function renderInstalls() {
    return (
      <>
        <p className="bill-sub">Agents installed into this workspace, with their dependency state.</p>
        {busy === "installs" && !installs.length ? (
          <div className="empty">
            <b>Loading installs…</b>
          </div>
        ) : installs.length ? (
          <div className="mk-install-list">
            {installs.map((install) => (
              <div className="mk-install-row" key={install.id}>
                {install.agent ? (
                  <LogoTile icon={install.agent.logoIcon} color={install.agent.logoColor} size={36} />
                ) : (
                  <div className="mk-logo" style={{ width: 36, height: 36 }}>
                    <Sparkles size={16} />
                  </div>
                )}
                <div className="mk-install-info">
                  <b>
                    {install.agent?.name ?? "Removed agent"}
                    {install.agent?.verified && <BadgeCheck size={12} className="mk-verified-icon" />}
                  </b>
                  <span className="bill-sub">{install.installedAgent ? `Workspace agent: ${install.installedAgent.name}${install.installedAgent.enabled ? "" : " (disabled)"}` : "Workspace agent removed"}</span>
                </div>
                <span className={`pill ${install.status === "ACTIVE" ? "ok" : "muted"}`}>{install.status}</span>
                <span className="pill muted">{`v${install.version}`}</span>
                <div className="mk-install-actions">
                  {install.agent && (
                    <button className="secondary" onClick={() => void openDetail(install.agent!.slug)}>
                      <ExternalLink size={12} /> Listing
                    </button>
                  )}
                  {install.status === "ACTIVE" && (
                    <button className="ghost" disabled={busy === `uninstall:${install.id}`} onClick={() => void uninstallAgent(install.id)}>
                      <Trash2 size={12} /> Uninstall
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="empty">
            <div className="empty-icon">
              <Download size={16} />
            </div>
            <b>Nothing installed yet</b>
            <p>Browse the marketplace and install an agent to import it into your workspace.</p>
            <button className="primary" onClick={() => switchSection("browse")}>
              Discover agents
            </button>
          </div>
        )}
      </>
    );
  }

  function renderQueue() {
    return (
      <>
        <p className="bill-sub">Agents submitted by workspace creators. Approve to publish, reject with feedback to send it back.</p>
        {queue.length ? (
          <div className="mk-queue">
            {queue.map((row) => (
              <div className="mk-queue-row" key={row.id}>
                <div className="int-card-top">
                  <div className="int-card-icon">
                    <Bot size={16} />
                  </div>
                  <div className="int-card-title">
                    <b>{row.name}</b>
                    <span>{row.creator ? `@${row.creator.handle}` : row.slug}</span>
                  </div>
                  <span className="pill warn">{row.pricing}</span>
                </div>
                <p className="int-card-blurb">{row.summary}</p>
                <p className="mk-prose">{row.description}</p>
                <div className="mk-req">
                  <span className="bill-label">Instructions preview</span>
                  <p className="mk-prose mk-config-preview">{row.config.instructions}</p>
                </div>
                <div className="int-card-meta">
                  <span className="pill">{CATEGORY_LABELS[row.category] ?? row.category}</span>
                  {row.config.tools.map((tool) => (
                    <span className="pill muted" key={tool}>
                      {tool}
                    </span>
                  ))}
                  {row.requiredIntegrations.map((key) => (
                    <span className="pill" key={key}>
                      {integrationLabel(key)}
                    </span>
                  ))}
                </div>
                <div className="int-card-foot mk-queue-actions">
                  <button className="secondary" onClick={() => void openDetail(row.slug)}>
                    Open
                  </button>
                  <button className="ghost" onClick={() => setRejectFor(rejectFor === row.id ? null : row.id)}>
                    Reject
                  </button>
                  <button className="primary" disabled={busy === `queue:${row.id}:approve`} onClick={() => void queueDecision(row.id, "approve")}>
                    Approve & publish
                  </button>
                </div>
                {rejectFor === row.id && (
                  <div className="int-form">
                    <label>
                      Reason for rejection
                      <input value={rejectReason} placeholder="Instructions are too thin — add the tool policy." onChange={(e) => setRejectReason(e.target.value)} />
                    </label>
                    <div className="mk-queue-actions">
                      <button className="ghost" onClick={() => setRejectFor(null)}>
                        Cancel
                      </button>
                      <button className="primary" disabled={busy === `queue:${row.id}:reject`} onClick={() => void queueDecision(row.id, "reject")}>
                        Send rejection
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        ) : (
          <div className="empty">
            <div className="empty-icon">
              <Check size={16} />
            </div>
            <b>Review queue is clear</b>
            <p>Submitted agents appear here for approval.</p>
          </div>
        )}
        <div className="mk-section">
          <span className="bill-label">Creators</span>
          <div className="mk-creator-list">
            {adminCreators.map((entry) => (
              <div className="mk-install-row" key={entry.id}>
                <div className="mk-logo" style={{ width: 34, height: 34 }}>
                  <Users size={15} />
                </div>
                <div className="mk-install-info">
                  <b>{entry.displayName}</b>
                  <span className="bill-sub">{`@${entry.handle} · ${entry.publishedAgents} published`}</span>
                </div>
                <span className={`pill ${entry.verified ? "ok" : "muted"}`}>{entry.verified ? "Verified" : "Unverified"}</span>
                <button className="secondary" disabled={busy === `creator:${entry.id}`} onClick={() => void moderateCreator(entry.id, !entry.verified)}>
                  {entry.verified ? "Remove verification" : "Verify creator"}
                </button>
              </div>
            ))}
            {!adminCreators.length && <p className="bill-sub">No creators yet.</p>}
          </div>
        </div>
      </>
    );
  }

  function renderPublishForm(inline: boolean) {
    const isPublished = Boolean(inline && detail?.status === "PUBLISHED");
    const isEdit = inline ? Boolean(detail) : Boolean(view.kind === "publish" && view.slug);
    const toggle = (list: string[], value: string) =>
      list.includes(value) ? list.filter((entry) => entry !== value) : [...list, value];
    return (
      <div className={`int-form mk-publish ${inline ? "inline-edit" : ""}`}>
        {!inline && (
          <button className="ghost mk-back" onClick={backToList}>
            <ArrowLeft size={13} /> Cancel
          </button>
        )}
        <div className="int-form-row">
          <label>
            Name
            <input value={form.name} placeholder="Inbox Triage" onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))} />
          </label>
          <label>
            Category
            <select value={form.category} onChange={(e) => setForm((prev) => ({ ...prev, category: e.target.value }))}>
              {Object.entries(CATEGORY_LABELS).map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </select>
          </label>
        </div>
        <label>
          Summary
          <input value={form.summary} placeholder="One line that sells what this agent does." onChange={(e) => setForm((prev) => ({ ...prev, summary: e.target.value }))} />
        </label>
        <label>
          Description
          <textarea value={form.description} rows={4} placeholder="What it does, which workflows it fits, and what to expect." onChange={(e) => setForm((prev) => ({ ...prev, description: e.target.value }))} />
        </label>
        <div className="int-form-row">
          <label>
            Logo icon
            <select value={form.logoIcon} onChange={(e) => setForm((prev) => ({ ...prev, logoIcon: e.target.value }))}>
              {Object.keys(MK_ICONS).map((key) => (
                <option key={key} value={key}>
                  {integrationLabel(key)}
                </option>
              ))}
            </select>
          </label>
          <label>
            Logo color
            <input value={form.logoColor} placeholder="#7c5cff" onChange={(e) => setForm((prev) => ({ ...prev, logoColor: e.target.value }))} />
          </label>
        </div>
        <div className="int-form-row">
          <label>
            Pricing
            <select value={form.pricing} onChange={(e) => setForm((prev) => ({ ...prev, pricing: e.target.value }))}>
              <option value="FREE">Free</option>
              <option value="PAID">Paid subscription</option>
              <option value="USAGE">Usage based</option>
            </select>
          </label>
          {form.pricing === "PAID" && (
            <>
              <label>
                Price (₹)
                <input value={form.priceAmount} placeholder="499" inputMode="decimal" onChange={(e) => setForm((prev) => ({ ...prev, priceAmount: e.target.value }))} />
              </label>
              <label>
                Period
                <select value={form.pricePeriod} onChange={(e) => setForm((prev) => ({ ...prev, pricePeriod: e.target.value }))}>
                  <option value="MONTHLY">Monthly</option>
                  <option value="YEARLY">Yearly</option>
                  <option value="ONE_TIME">One time</option>
                </select>
              </label>
            </>
          )}
          {form.pricing === "USAGE" && (
            <label>
              Price per run (₹)
              <input value={form.pricePerRun} placeholder="2.5" inputMode="decimal" onChange={(e) => setForm((prev) => ({ ...prev, pricePerRun: e.target.value }))} />
            </label>
          )}
          <label>
            Est. cost / run (₹)
            <input value={form.avgCost} placeholder="0.05" inputMode="decimal" onChange={(e) => setForm((prev) => ({ ...prev, avgCost: e.target.value }))} />
          </label>
        </div>
        <div className="mk-req">
          <span className="bill-label">Required integrations</span>
          <div className="int-filters">
            {providers.map((provider) => (
              <button
                key={provider.key}
                type="button"
                className={`int-tab ${form.integrations.includes(provider.key) ? "on" : ""}`}
                onClick={() => setForm((prev) => ({ ...prev, integrations: toggle(prev.integrations, provider.key) }))}
              >
                {provider.name}
              </button>
            ))}
          </div>
        </div>
        <div className="mk-req">
          <span className="bill-label">Tools</span>
          <div className="int-filters">
            {tools.map((tool) => (
              <button
                key={tool.name}
                type="button"
                className={`int-tab ${form.tools.includes(tool.name) ? "on" : ""}`}
                title={tool.description}
                onClick={() => setForm((prev) => ({ ...prev, tools: toggle(prev.tools, tool.name) }))}
              >
                {tool.name}
              </button>
            ))}
            {!tools.length && <span className="pill muted">Loading tools…</span>}
          </div>
        </div>
        <div className="int-form-row">
          <label>
            Model requirements (comma separated)
            <input value={form.models} placeholder="chat, tools" onChange={(e) => setForm((prev) => ({ ...prev, models: e.target.value }))} />
          </label>
          <label>
            Permissions (comma separated)
            <input value={form.permissions} placeholder="email:send, web:read" onChange={(e) => setForm((prev) => ({ ...prev, permissions: e.target.value }))} />
          </label>
        </div>
        <label>
          Instructions
          <textarea value={form.instructions} rows={6} placeholder="You are an inbox triage assistant. For each new message…" onChange={(e) => setForm((prev) => ({ ...prev, instructions: e.target.value }))} />
        </label>
        <label>
          System prompt (optional)
          <textarea value={form.systemPrompt} rows={3} placeholder="Be concise. Cite sources." onChange={(e) => setForm((prev) => ({ ...prev, systemPrompt: e.target.value }))} />
        </label>
        {isPublished && (
          <div className="int-note">
            Published agents keep their metadata editable, while instructions and tools change through a new version. Write a changelog and
            publish it below.
          </div>
        )}
        {isPublished && (
          <label>
            Changelog for this version
            <input value={form.changelog} placeholder="Better draft quality, new tool policy." onChange={(e) => setForm((prev) => ({ ...prev, changelog: e.target.value }))} />
          </label>
        )}
        <div className="mk-publish-actions">
          {isPublished ? (
            <button className="primary" disabled={busy === "version"} onClick={() => void publishVersionNow()}>
              {busy === "version" ? "Publishing…" : "Publish new version"}
            </button>
          ) : (
            <>
              <button className="secondary" disabled={busy === "publish"} onClick={() => void savePublish(false)}>
                {busy === "publish" ? "Saving…" : isEdit ? "Save draft" : "Save draft"}
              </button>
              <button className="primary" disabled={busy === "publish"} onClick={() => void savePublish(true)}>
                {busy === "publish" ? "Submitting…" : "Save & submit for review"}
              </button>
            </>
          )}
        </div>
      </div>
    );
  }

  function renderCreator() {
    if (!creator) {
      return (
        <div className="empty">
          <b>Loading creator…</b>
        </div>
      );
    }
    return (
      <>
        <button className="ghost mk-back" onClick={backToList}>
          <ArrowLeft size={13} /> Back to marketplace
        </button>
        <div className="mk-creator-head">
          <div className="mk-logo lg">
            <Users size={24} />
          </div>
          <div>
            <h2>
              {creator.displayName}
              {creator.verified && <BadgeCheck size={15} className="mk-verified-icon" aria-label="Verified creator" />}
            </h2>
            <span className="mk-handle">{`@${creator.handle}`}</span>
            {creator.bio && <p className="mk-prose">{creator.bio}</p>}
            {creator.website && (
              <a className="mk-link" href={creator.website} target="_blank" rel="noreferrer">
                {creator.website}
              </a>
            )}
          </div>
          <div className="mk-stats">
            <StatTile label="Agents" value={String(creator.stats.agentCount)} />
            <StatTile label="Installs" value={String(creator.stats.totalInstalls)} />
            <StatTile label="Executions" value={String(creator.stats.totalExecutions)} />
            <StatTile label="Avg rating" value={creator.stats.ratingAvg ? `${creator.stats.ratingAvg} ★` : "—"} />
          </div>
        </div>
        <div className="int-grid">{creator.agents.map(renderCard)}</div>
        {!creator.agents.length && (
          <div className="empty">
            <b>No public agents yet</b>
          </div>
        )}
      </>
    );
  }

  const sections: SectionKey[] = ["browse", "mine", "installs", ...(systemRole === "ADMIN" ? (["queue"] as SectionKey[]) : [])];

  return (
    <div className="page">
      <div className="hero compact">
        <div>
          <span className="eyebrow">AGENT MARKETPLACE</span>
          <h1>Discover, install and publish agents</h1>
          <p>
            Browse community and official agents, preview them live, install with one click, fork your own copy, and publish back to the
            marketplace with reviews, versions and analytics.
          </p>
        </div>
      </div>
      <section className="panel wide">
        <PanelHead icon={Store} title="Agent marketplace" sub="Discover, install, fork and publish" />
        {message && <Banner message={message} onClose={() => setMessage(null)} />}
        {view.kind === "list" && (
          <div className="int-tabs">
            {sections.map((key) => (
              <button key={key} className={`int-tab ${section === key ? "on" : ""}`} onClick={() => switchSection(key)}>
                {SECTION_LABELS[key]}
              </button>
            ))}
          </div>
        )}
        {view.kind === "list" && section === "browse" && renderBrowse()}
        {view.kind === "list" && section === "mine" && renderMine()}
        {view.kind === "list" && section === "installs" && renderInstalls()}
        {view.kind === "list" && section === "queue" && systemRole === "ADMIN" && renderQueue()}
        {view.kind === "detail" && renderDetail()}
        {view.kind === "creator" && renderCreator()}
        {view.kind === "publish" && renderPublishForm(false)}
      </section>
    </div>
  );
}

type AdminAgent = {
  id: string;
  slug: string;
  name: string;
  status: string;
  suspended: boolean;
  verified: boolean;
  featured: boolean;
  category: string;
  pricing: string;
  logoIcon: string;
  logoColor: string;
  installs: number;
  tries: number;
  ratingAvg: number;
  ratingCount: number;
  organizationId: string;
  creator: { id: string; handle: string; displayName: string; verified: boolean } | null;
  updatedAt: string;
};

const STATUS_PILL: Record<string, string> = {
  DRAFT: "pill muted",
  IN_REVIEW: "pill warn",
  PUBLISHED: "pill ok",
  REJECTED: "pill bad",
};

export function MarketplaceAdminSection() {
  const [tab, setTab] = useState<"queue" | "agents" | "creators">("queue");
  const [queue, setQueue] = useState<QueueRow[]>([]);
  const [agents, setAgents] = useState<AdminAgent[]>([]);
  const [creators, setCreators] = useState<AdminCreator[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState<Message>(null);
  const [rejectFor, setRejectFor] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");

  const load = useCallback(async () => {
    try {
      const [rows, allAgents, creatorRows] = await Promise.all([
        api<QueueRow[]>("/admin/marketplace/queue"),
        api<AdminAgent[]>("/admin/marketplace/agents"),
        api<AdminCreator[]>("/admin/marketplace/creators"),
      ]);
      setQueue(rows);
      setAgents(allAgents);
      setCreators(creatorRows);
    } catch (e) {
      setMessage({ kind: "err", text: readError(e, "Could not load marketplace administration") });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function queueDecision(id: string, action: "approve" | "reject") {
    setBusy(`queue:${id}:${action}`);
    try {
      await api(`/admin/marketplace/agents/${id}/review`, {
        method: "POST",
        body: JSON.stringify({ action, reason: rejectReason.trim() }),
      });
      setMessage({ kind: "ok", text: action === "approve" ? "Agent approved and published." : "Agent rejected with feedback." });
      setRejectFor(null);
      setRejectReason("");
      await load();
    } catch (e) {
      setMessage({ kind: "err", text: readError(e, "Could not apply the decision") });
    } finally {
      setBusy("");
    }
  }

  async function moderateAgent(id: string, field: "verified" | "featured" | "suspend", value: boolean) {
    setBusy(`agent:${id}:${field}`);
    try {
      await api(`/admin/marketplace/agents/${id}/moderate`, {
        method: "POST",
        body: JSON.stringify({ [field]: value }),
      });
      setMessage({ kind: "ok", text: "Moderation applied." });
      await load();
    } catch (e) {
      setMessage({ kind: "err", text: readError(e, "Could not apply moderation") });
    } finally {
      setBusy("");
    }
  }

  async function moderateCreator(id: string, verified: boolean) {
    setBusy(`creator:${id}`);
    try {
      await api(`/admin/marketplace/creators/${id}/moderate`, {
        method: "POST",
        body: JSON.stringify({ verified }),
      });
      setMessage({ kind: "ok", text: verified ? "Creator verified." : "Verification removed." });
      await load();
    } catch (e) {
      setMessage({ kind: "err", text: readError(e, "Could not update the creator") });
    } finally {
      setBusy("");
    }
  }

  if (loading) {
    return (
      <section className="panel">
        <PanelHead icon={Store} title="Marketplace administration" sub="Loading submissions, agents and creators…" />
      </section>
    );
  }

  return (
    <section className="panel">
      <PanelHead
        icon={Store}
        title="Marketplace administration"
        sub="Review submissions, moderate published agents and verify creators"
      />
      {message && <Banner message={message} onClose={() => setMessage(null)} />}
      <div className="int-tabs">
        <button className={`int-tab ${tab === "queue" ? "on" : ""}`} onClick={() => setTab("queue")}>
          Review queue{queue.length ? ` (${queue.length})` : ""}
        </button>
        <button className={`int-tab ${tab === "agents" ? "on" : ""}`} onClick={() => setTab("agents")}>
          Agents ({agents.length})
        </button>
        <button className={`int-tab ${tab === "creators" ? "on" : ""}`} onClick={() => setTab("creators")}>
          Creators ({creators.length})
        </button>
      </div>

      {tab === "queue" && (
        <>
          <p className="bill-sub">Agents submitted by workspace creators. Approve to publish, reject with feedback to send it back.</p>
          {queue.length ? (
            <div className="mk-queue">
              {queue.map((row) => (
                <div className="mk-queue-row" key={row.id}>
                  <div className="int-card-top">
                    <div className="int-card-icon">
                      <Bot size={16} />
                    </div>
                    <div className="int-card-title">
                      <b>{row.name}</b>
                      <span>{row.creator ? `@${row.creator.handle}` : row.slug}</span>
                    </div>
                    <span className="pill warn">{row.pricing}</span>
                  </div>
                  <p className="int-card-blurb">{row.summary}</p>
                  <div className="mk-req">
                    <span className="bill-label">Instructions preview</span>
                    <p className="mk-prose mk-config-preview">{row.config.instructions}</p>
                  </div>
                  <div className="int-card-meta">
                    <span className="pill muted">{CATEGORY_LABELS[row.category] ?? row.category}</span>
                    {row.config.tools.map((tool) => (
                      <span className="pill muted" key={tool}>
                        {tool}
                      </span>
                    ))}
                    {row.requiredIntegrations.map((key) => (
                      <span className="pill" key={key}>
                        {integrationLabel(key)}
                      </span>
                    ))}
                  </div>
                  <div className="int-card-foot mk-queue-actions">
                    <button className="ghost" onClick={() => { setRejectFor(rejectFor === row.id ? null : row.id); setRejectReason(""); }}>
                      Reject
                    </button>
                    <button className="primary" disabled={busy === `queue:${row.id}:approve`} onClick={() => void queueDecision(row.id, "approve")}>
                      Approve &amp; publish
                    </button>
                  </div>
                  {rejectFor === row.id && (
                    <div className="int-form">
                      <label>
                        Reason for rejection
                        <input value={rejectReason} placeholder="Instructions are too thin — add the tool policy." onChange={(e) => setRejectReason(e.target.value)} />
                      </label>
                      <div className="mk-queue-actions">
                        <button className="ghost" onClick={() => setRejectFor(null)}>
                          Cancel
                        </button>
                        <button className="primary" disabled={busy === `queue:${row.id}:reject`} onClick={() => void queueDecision(row.id, "reject")}>
                          Send rejection
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="empty">
              <div className="empty-icon">
                <Check size={16} />
              </div>
              <b>Review queue is clear</b>
              <p>Submitted agents appear here for approval.</p>
            </div>
          )}
        </>
      )}

      {tab === "agents" && (
        <>
          <p className="bill-sub">Every agent in the marketplace — suspend rule-breakers, feature the good ones and manage verified badges.</p>
          {agents.length ? (
            <div className="mk-install-list">
              {agents.map((row) => (
                <div className="mk-install-row" key={row.id}>
                  <div className="mk-logo" style={{ background: `${row.logoColor}1c`, color: row.logoColor, borderColor: `${row.logoColor}59` }}>
                    {(() => {
                      const Icon = mkIcon(row.logoIcon);
                      return <Icon size={16} />;
                    })()}
                  </div>
                  <div className="mk-install-info">
                    <b>
                      {row.name}
                      {row.verified && <BadgeCheck size={13} className="mk-verified-icon" />}
                    </b>
                    <span className="bill-sub">{row.creator ? `@${row.creator.handle}` : row.slug} · {row.slug} · {row.installs} installs · {row.tries} tries</span>
                    <div className="int-card-meta">
                      <span className={STATUS_PILL[row.status] ?? "pill"}>{row.status.replace("_", " ")}</span>
                      {row.suspended && <span className="pill bad">Suspended</span>}
                      {row.featured && <span className="pill warn">Featured</span>}
                      <span className="pill muted">{row.pricing}</span>
                    </div>
                  </div>
                  <div className="mk-install-actions">
                    <button className="ghost" disabled={busy === `agent:${row.id}:suspend`} onClick={() => void moderateAgent(row.id, "suspend", !row.suspended)}>
                      {row.suspended ? "Restore" : "Suspend"}
                    </button>
                    <button className="secondary" disabled={busy === `agent:${row.id}:featured`} onClick={() => void moderateAgent(row.id, "featured", !row.featured)}>
                      {row.featured ? "Unfeature" : "Feature"}
                    </button>
                    <button className="ghost" disabled={busy === `agent:${row.id}:verified`} onClick={() => void moderateAgent(row.id, "verified", !row.verified)}>
                      {row.verified ? "Unverify" : "Verify"}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="empty">
              <div className="empty-icon">
                <Store size={16} />
              </div>
              <b>No marketplace agents yet</b>
              <p>Published and submitted agents appear here for moderation.</p>
            </div>
          )}
        </>
      )}

      {tab === "creators" && (
        <>
          <p className="bill-sub">Creator profiles behind the catalog. Verified creators get a badge on every card they own.</p>
          {creators.length ? (
            <div className="mk-creator-list">
              {creators.map((entry) => (
                <div className="mk-install-row" key={entry.id}>
                  <div className="mk-logo">
                    <Users size={15} />
                  </div>
                  <div className="mk-install-info">
                    <b>
                      {entry.displayName}
                      {entry.verified && <BadgeCheck size={13} className="mk-verified-icon" />}
                    </b>
                    <span className="bill-sub">{`@${entry.handle} · ${entry.publishedAgents} published`}</span>
                  </div>
                  <div className="mk-install-actions">
                    <span className={entry.verified ? "pill ok" : "pill muted"}>{entry.verified ? "Verified" : "Unverified"}</span>
                    <button className="secondary" disabled={busy === `creator:${entry.id}`} onClick={() => void moderateCreator(entry.id, !entry.verified)}>
                      {entry.verified ? "Remove verification" : "Verify creator"}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="empty">
              <div className="empty-icon">
                <Users size={16} />
              </div>
              <b>No creators yet</b>
              <p>Creator profiles appear as soon as agents are submitted.</p>
            </div>
          )}
        </>
      )}
    </section>
  );
}
