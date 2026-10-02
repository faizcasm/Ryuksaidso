"use client";

import { useCallback, useEffect, useState, type ComponentType } from "react";
import {
  AlertTriangle,
  Box,
  CircleCheck,
  Contact,
  Copy,
  Github,
  HardDrive,
  Hexagon,
  Mail,
  MessageCircle,
  MessageSquare,
  MessagesSquare,
  NotebookPen,
  Play,
  Plug,
  RefreshCw,
  Send,
  ShoppingBag,
  Trash2,
  Unplug,
  Webhook,
  Workflow,
  Zap,
} from "lucide-react";
import { API, api } from "../lib/api";

type Message = { kind: "ok" | "err"; text: string } | null;
type IconType = ComponentType<{ size?: number | string; strokeWidth?: number }>;

function readError(e: unknown, fallback: string) {
  if (e instanceof Error && e.message.trim()) return e.message.trim();
  return fallback;
}

function formatWhen(value: string | null | undefined) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

const STATUS_TONES: Record<string, string> = {
  CONNECTED: "ok",
  ACTIVE: "ok",
  SUCCESS: "ok",
  CONNECTED_RECENTLY: "ok",
  DEGRADED: "warn",
  PENDING: "warn",
  EXPIRED: "bad",
  ERROR: "bad",
  FAILED: "bad",
  DISCONNECTED: "muted",
  PAUSED: "muted",
};

function statusPill(status: string | null | undefined, label?: string) {
  if (!status) return null;
  const tone = STATUS_TONES[status] ?? "muted";
  return <span className={`pill ${tone}`}>{label ?? status.toLowerCase()}</span>;
}

function PanelHead({ icon: Icon, title, sub }: { icon: IconType; title: string; sub: string }) {
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

const PROVIDER_ICONS: Record<string, IconType> = {
  Mail,
  MessageSquare,
  MessagesSquare,
  MessageCircle,
  HardDrive,
  NotebookPen,
  Github,
  Hexagon,
  Box,
  Contact,
  ShoppingBag,
  Zap,
  Workflow,
  Play,
};

type TokenField = {
  key: string;
  label: string;
  placeholder: string;
  secret: boolean;
};

type CatalogProvider = {
  key: string;
  name: string;
  category: string;
  authType: "oauth2" | "token" | "webhook";
  blurb: string;
  website: string;
  color: string;
  icon: string;
  knowledge: boolean;
  tools: string[];
  webhookEvents: string[];
  envKeys: string[];
  configured: boolean;
  setupHint: string;
  redirectUri: string | null;
  tokenFields: TokenField[];
  disabled: boolean;
  connected: boolean;
  status: string | null;
};

type CatalogResponse = {
  enabled: boolean;
  disabledProviders: string[];
  providers: CatalogProvider[];
};

type Connection = {
  id: string;
  provider: string;
  name: string;
  status: string;
  authType: string;
  scopes: string[];
  lastSyncAt: string | null;
  lastCheckedAt: string | null;
  lastError: string;
  createdAt: string;
};

type KnowledgeSource = {
  id: string;
  provider: string;
  connectionId: string;
  name: string;
  remotePath: string;
  status: string;
  autoSync: boolean;
  lastSyncAt: string | null;
  lastError: string;
  documentsSynced: number;
  createdAt: string;
};

type WebhookEndpoint = {
  id: string;
  name: string;
  url: string;
  events: string[];
  active: boolean;
  secret?: string;
  lastDeliveryAt: string | null;
  createdAt: string;
};

type WebhookDelivery = {
  id: string;
  event: string;
  eventId: string;
  status: string;
  attempts: number;
  lastError: string;
  createdAt: string;
  endpoint?: { name: string; url: string };
};

type WebhookEventInfo = { event: string; description: string };

type HooksResponse = {
  endpoints: WebhookEndpoint[];
  deliveries: WebhookDelivery[];
  events: WebhookEventInfo[];
};

type ActivityLog = {
  id: string;
  provider: string;
  event: string;
  level: string;
  message: string;
  createdAt: string;
};

type ToolActivityItem = {
  id: string;
  runId: string;
  tool: string;
  status: string;
  durationMs: number | null;
  error: string | null;
  createdAt: string;
  runStatus: string;
  trigger: string;
  agentId: string;
};

type WidgetSetting = {
  id: string;
  organizationId: string;
  publicKey: string;
  enabled: boolean;
  agentId: string | null;
  title: string;
  greeting: string;
  accent: string;
  allowedOrigins: string[];
  collectEmail: boolean;
};

type WidgetResponse = {
  setting: WidgetSetting;
  agent: { id: string; name: string } | null;
  embedPath: string;
};

type SyncResult = {
  sourceId: string;
  provider: string;
  status: "ok" | "error";
  created: number;
  updated: number;
  unchanged: number;
  skipped: number;
  error?: string;
};

type SectionKey = "marketplace" | "sources" | "widget" | "webhooks" | "activity" | "admin";

const SECTION_LABELS: Record<SectionKey, string> = {
  marketplace: "Marketplace",
  sources: "Knowledge sync",
  widget: "Chat widget",
  webhooks: "Webhooks",
  activity: "Activity",
  admin: "Platform admin",
};

const CATEGORY_FILTERS = ["all", "email", "messaging", "knowledge", "project", "crm", "commerce", "automation"];

export function IntegrationsView({
  canManage,
  systemRole,
  agents,
}: {
  canManage: boolean;
  systemRole?: string | null;
  agents: Array<{ id: string; name: string }>;
}) {
  const isSystemAdmin = systemRole === "ADMIN";
  const [section, setSection] = useState<SectionKey>("marketplace");
  const [catalog, setCatalog] = useState<CatalogResponse | null>(null);
  const [connections, setConnections] = useState<Connection[]>([]);
  const [sources, setSources] = useState<KnowledgeSource[] | null>(null);
  const [widget, setWidget] = useState<WidgetResponse | null>(null);
  const [widgetForm, setWidgetForm] = useState<{
    enabled: boolean;
    agentId: string;
    title: string;
    greeting: string;
    accent: string;
    origins: string;
    collectEmail: boolean;
  } | null>(null);
  const [hooks, setHooks] = useState<HooksResponse | null>(null);
  const [activity, setActivity] = useState<{ logs: ActivityLog[]; items: ToolActivityItem[] } | null>(null);
  const [message, setMessage] = useState<Message>(null);
  const [busy, setBusy] = useState("");
  const [category, setCategory] = useState("all");
  const [copied, setCopied] = useState("");
  const [tokenForm, setTokenForm] = useState<string | null>(null);
  const [tokenValues, setTokenValues] = useState<Record<string, string>>({});
  const [shopPrompt, setShopPrompt] = useState<string | null>(null);
  const [shopValue, setShopValue] = useState("");
  const [embed, setEmbed] = useState("");
  const [newSecret, setNewSecret] = useState("");
  const [sourceForm, setSourceForm] = useState({ provider: "", name: "", remotePath: "", autoSync: true });
  const [hookForm, setHookForm] = useState({ name: "", url: "", events: [] as string[] });

  const fail = (text: string) => setMessage({ kind: "err", text });
  const ok = (text: string) => setMessage({ kind: "ok", text });

  const loadCatalog = useCallback(async () => {
    try {
      const [cat, conn] = await Promise.all([
        api<CatalogResponse>("/integrations/catalog"),
        api<{ connections: Connection[] }>("/integrations/connections"),
      ]);
      setCatalog(cat);
      setConnections(conn.connections);
    } catch (e) {
      fail(readError(e, "Could not load the integration marketplace"));
    }
  }, []);

  const loadSources = useCallback(async () => {
    try {
      const out = await api<{ sources: KnowledgeSource[] }>("/integrations/sources");
      setSources(out.sources);
    } catch (e) {
      fail(readError(e, "Could not load knowledge sources"));
    }
  }, []);

  const loadWidget = useCallback(async () => {
    try {
      const out = await api<WidgetResponse>("/integrations/widget");
      setWidget(out);
      setWidgetForm({
        enabled: out.setting.enabled,
        agentId: out.setting.agentId ?? "",
        title: out.setting.title,
        greeting: out.setting.greeting,
        accent: out.setting.accent,
        origins: (out.setting.allowedOrigins ?? []).join("\n"),
        collectEmail: out.setting.collectEmail,
      });
    } catch (e) {
      fail(readError(e, "Could not load the chat widget settings"));
    }
  }, []);

  const loadHooks = useCallback(async () => {
    try {
      const out = await api<HooksResponse>("/integrations/webhooks");
      setHooks(out);
    } catch (e) {
      fail(readError(e, "Could not load webhook endpoints"));
    }
  }, []);

  const loadActivity = useCallback(async () => {
    try {
      const [logs, items] = await Promise.all([
        api<{ logs: ActivityLog[] }>("/integrations/activity"),
        api<{ items: ToolActivityItem[] }>("/integrations/tool-activity"),
      ]);
      setActivity({ logs: logs.logs, items: items.items });
    } catch (e) {
      fail(readError(e, "Could not load integration activity"));
    }
  }, []);

  useEffect(() => {
    void loadCatalog();
  }, [loadCatalog]);

  useEffect(() => {
    if (section === "sources" && sources === null) void loadSources();
    if (section === "widget" && widget === null) void loadWidget();
    if (section === "webhooks" && hooks === null) void loadHooks();
    if (section === "activity" && activity === null) void loadActivity();
  }, [section, sources, widget, hooks, activity, loadSources, loadWidget, loadHooks, loadActivity]);

  useEffect(() => {
    if (!widget?.setting.publicKey) {
      setEmbed("");
      return;
    }
    const base = API.startsWith("/")
      ? (typeof window !== "undefined" ? window.location.origin : "") + API
      : API;
    setEmbed(`<script src="${base}/widget.js" data-key="${widget.setting.publicKey}" async></script>`);
  }, [widget?.setting.publicKey]);

  function guardManage() {
    if (canManage) return true;
    fail("Only workspace owners and admins can manage integrations.");
    return false;
  }

  async function connectOAuth(provider: CatalogProvider, shop?: string) {
    if (!guardManage()) return;
    setBusy(provider.key);
    try {
      const out = await api<{ url: string }>(`/integrations/connections/${provider.key}/connect`, {
        method: "POST",
        body: JSON.stringify(shop ? { shop } : {}),
      });
      window.location.href = out.url;
    } catch (e) {
      setBusy("");
      setShopPrompt(null);
      fail(readError(e, `Could not start the ${provider.name} connection`));
    }
  }

  function startConnect(provider: CatalogProvider) {
    if (provider.disabled) return;
    if (provider.authType === "webhook") {
      setSection("webhooks");
      return;
    }
    if (provider.authType === "token") {
      if (!guardManage()) return;
      setTokenForm(provider.key);
      setTokenValues({});
      setShopPrompt(null);
      return;
    }
    if (provider.key === "shopify") {
      if (!guardManage()) return;
      setShopPrompt(provider.key);
      setShopValue("");
      setTokenForm(null);
      return;
    }
    void connectOAuth(provider);
  }

  async function submitTokenConnect() {
    if (!tokenForm || !guardManage()) return;
    const provider = catalog?.providers.find((p) => p.key === tokenForm);
    if (!provider) return;
    setBusy(tokenForm);
    try {
      await api("/integrations/connections/token", {
        method: "POST",
        body: JSON.stringify({ provider: provider.key, fields: tokenValues }),
      });
      ok(`${provider.name} connected.`);
      setTokenForm(null);
      setTokenValues({});
      await loadCatalog();
    } catch (e) {
      fail(readError(e, `Could not connect ${provider.name}`));
    } finally {
      setBusy("");
    }
  }

  async function testConnection(providerKey: string, connectionId: string) {
    if (!guardManage()) return;
    setBusy(`test:${providerKey}`);
    try {
      const out = await api<{ ok: boolean; detail: string }>(`/integrations/connections/${connectionId}/test`, {
        method: "POST",
      });
      if (out.ok) ok(out.detail || "Connection looks healthy.");
      else fail(out.detail || "The connection test failed.");
      await loadCatalog();
    } catch (e) {
      fail(readError(e, "The connection test failed"));
    } finally {
      setBusy("");
    }
  }

  async function disconnect(providerKey: string, connectionId: string) {
    if (!guardManage()) return;
    if (!window.confirm("Disconnect this integration? Stored credentials are removed.")) return;
    setBusy(`disconnect:${providerKey}`);
    try {
      await api(`/integrations/connections/${connectionId}`, { method: "DELETE" });
      ok(`${providerKey} disconnected.`);
      await loadCatalog();
      if (section === "sources") await loadSources();
    } catch (e) {
      fail(readError(e, "Could not disconnect"));
    } finally {
      setBusy("");
    }
  }

  async function createSource() {
    if (!guardManage()) return;
    if (!sourceForm.provider || !sourceForm.name.trim()) {
      fail("Pick a provider and give the source a name.");
      return;
    }
    setBusy("source:create");
    try {
      await api("/integrations/sources", {
        method: "POST",
        body: JSON.stringify({
          provider: sourceForm.provider,
          name: sourceForm.name.trim(),
          remotePath: sourceForm.remotePath.trim(),
          autoSync: sourceForm.autoSync,
        }),
      });
      ok(`Knowledge source "${sourceForm.name.trim()}" created.`);
      setSourceForm({ provider: "", name: "", remotePath: "", autoSync: true });
      await loadSources();
    } catch (e) {
      fail(readError(e, "Could not create the knowledge source"));
    } finally {
      setBusy("");
    }
  }

  async function syncSource(source: KnowledgeSource) {
    if (!guardManage()) return;
    setBusy(`sync:${source.id}`);
    try {
      const result = await api<SyncResult>(`/integrations/sources/${source.id}/sync`, { method: "POST" });
      if (result.status === "ok") {
        ok(`Synced "${source.name}" — ${result.created} added, ${result.updated} updated, ${result.unchanged} unchanged.`);
      } else {
        fail(result.error || `Sync of "${source.name}" failed.`);
      }
      await loadSources();
    } catch (e) {
      fail(readError(e, "Sync failed"));
    } finally {
      setBusy("");
    }
  }

  async function toggleSourceAutoSync(source: KnowledgeSource) {
    if (!guardManage()) return;
    setBusy(`patch:${source.id}`);
    try {
      await api(`/integrations/sources/${source.id}`, {
        method: "PATCH",
        body: JSON.stringify({ autoSync: !source.autoSync }),
      });
      await loadSources();
    } catch (e) {
      fail(readError(e, "Could not update the source"));
    } finally {
      setBusy("");
    }
  }

  async function deleteSource(source: KnowledgeSource) {
    if (!guardManage()) return;
    if (!window.confirm(`Delete the knowledge source "${source.name}"? Its synced documents stay in the library.`)) return;
    setBusy(`delete:${source.id}`);
    try {
      await api(`/integrations/sources/${source.id}`, { method: "DELETE" });
      ok(`Source "${source.name}" deleted.`);
      await loadSources();
    } catch (e) {
      fail(readError(e, "Could not delete the source"));
    } finally {
      setBusy("");
    }
  }

  async function saveWidget() {
    if (!guardManage() || !widgetForm) return;
    setBusy("widget:save");
    try {
      const origins = widgetForm.origins
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean);
      const updated = await api<WidgetSetting>("/integrations/widget", {
        method: "PUT",
        body: JSON.stringify({
          enabled: widgetForm.enabled,
          agentId: widgetForm.agentId || null,
          title: widgetForm.title,
          greeting: widgetForm.greeting,
          accent: widgetForm.accent,
          allowedOrigins: origins,
          collectEmail: widgetForm.collectEmail,
        }),
      });
      ok("Chat widget settings saved.");
      setWidget((prev) => (prev ? { ...prev, setting: updated } : prev));
    } catch (e) {
      fail(readError(e, "Could not save the widget settings"));
    } finally {
      setBusy("");
    }
  }

  async function regenerateWidgetKey() {
    if (!guardManage()) return;
    if (!window.confirm("Regenerate the public key? Existing embeds stop working until you update them.")) return;
    setBusy("widget:key");
    try {
      const out = await api<{ publicKey: string }>("/integrations/widget/regenerate-key", { method: "POST" });
      setWidget((prev) => (prev ? { ...prev, setting: { ...prev.setting, publicKey: out.publicKey } } : prev));
      ok("Widget public key regenerated — update your embed snippet.");
    } catch (e) {
      fail(readError(e, "Could not regenerate the key"));
    } finally {
      setBusy("");
    }
  }

  async function createWebhook() {
    if (!guardManage()) return;
    if (!hookForm.name.trim() || !hookForm.url.trim() || hookForm.events.length === 0) {
      fail("Name, URL and at least one event are required.");
      return;
    }
    setBusy("hook:create");
    try {
      const endpoint = await api<WebhookEndpoint>("/integrations/webhooks", {
        method: "POST",
        body: JSON.stringify({
          name: hookForm.name.trim(),
          url: hookForm.url.trim(),
          events: hookForm.events,
        }),
      });
      setNewSecret(endpoint.secret ?? "");
      setHookForm({ name: "", url: "", events: [] });
      ok("Webhook endpoint created.");
      await loadHooks();
    } catch (e) {
      fail(readError(e, "Could not create the webhook endpoint"));
    } finally {
      setBusy("");
    }
  }

  async function testWebhook(endpoint: WebhookEndpoint) {
    if (!guardManage()) return;
    setBusy(`hook:test:${endpoint.id}`);
    try {
      await api(`/integrations/webhooks/${endpoint.id}/test`, { method: "POST" });
      ok(`Test delivery queued for "${endpoint.name}".`);
      await loadHooks();
    } catch (e) {
      fail(readError(e, "Could not queue the test delivery"));
    } finally {
      setBusy("");
    }
  }

  async function deleteWebhook(endpoint: WebhookEndpoint) {
    if (!guardManage()) return;
    if (!window.confirm(`Delete the webhook endpoint "${endpoint.name}"?`)) return;
    setBusy(`hook:delete:${endpoint.id}`);
    try {
      await api(`/integrations/webhooks/${endpoint.id}`, { method: "DELETE" });
      ok(`Endpoint "${endpoint.name}" deleted.`);
      await loadHooks();
    } catch (e) {
      fail(readError(e, "Could not delete the endpoint"));
    } finally {
      setBusy("");
    }
  }

  async function retryDelivery(delivery: WebhookDelivery) {
    if (!guardManage()) return;
    setBusy(`hook:retry:${delivery.id}`);
    try {
      const out = await api<{ ok: boolean; status: string }>(`/integrations/webhooks/deliveries/${delivery.id}/retry`, {
        method: "POST",
      });
      if (out.ok) ok("Delivery succeeded on retry.");
      else fail(`Retry finished with status ${out.status.toLowerCase()}.`);
      await loadHooks();
    } catch (e) {
      fail(readError(e, "Could not retry the delivery"));
    } finally {
      setBusy("");
    }
  }

  async function copyText(key: string, text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(key);
      setTimeout(() => setCopied((prev) => (prev === key ? "" : prev)), 1600);
    } catch {
      fail("Could not copy to the clipboard.");
    }
  }

  const connByProvider = new Map(connections.map((row) => [row.provider, row]));
  const visibleProviders = (catalog?.providers ?? []).filter(
    (provider) => category === "all" || provider.category === category,
  );

  function renderMarketplace() {
    if (!catalog) return <div className="int-note">Loading the marketplace…</div>;
    const knowledgeConnected = (catalog.providers ?? []).filter((p) => p.knowledge && p.connected);
    return (
      <>
        {!catalog.enabled && (
          <div className="int-note">
            Integrations are switched off on this deployment by a platform administrator. Existing
            connections stay stored, but new connects, agent tools and syncs are paused.
          </div>
        )}
        <div className="int-filters">
          {CATEGORY_FILTERS.map((key) => (
            <button
              key={key}
              className={`int-filter ${category === key ? "on" : ""}`}
              onClick={() => setCategory(key)}
            >
              {key === "all" ? "All" : key}
            </button>
          ))}
        </div>
        <div className="int-grid">
          {visibleProviders.map((provider) => {
            const Icon = PROVIDER_ICONS[provider.icon] ?? Plug;
            const connection = connByProvider.get(provider.key) ?? null;
            const needsToken = provider.authType === "token";
            const isPreset = provider.authType === "webhook";
            return (
              <div
                className={`int-card ${provider.disabled ? "off" : ""}`}
                key={provider.key}
                style={{ ["--int-color" as string]: provider.color }}
              >
                <div className="int-card-top">
                  <span className="int-card-icon">
                    <Icon size={17} />
                  </span>
                  <div className="int-card-title">
                    <b>{provider.name}</b>
                    <span>{provider.category}</span>
                  </div>
                  {provider.disabled
                    ? statusPill("DISCONNECTED", "disabled")
                    : connection
                      ? statusPill(connection.status)
                      : statusPill("PENDING", "not connected")}
                </div>
                <p className="int-card-blurb">{provider.blurb}</p>
                <div className="int-card-meta">
                  <span className={`pill ${provider.knowledge ? "ok" : "muted"}`}>
                    {provider.knowledge ? "knowledge sync" : "no sync"}
                  </span>
                  <span className="pill muted">{provider.tools.length} agent tools</span>
                  {provider.webhookEvents.length > 0 && (
                    <span className="pill muted">{provider.webhookEvents.length} events</span>
                  )}
                </div>
                {provider.authType === "oauth2" && !provider.configured && (
                  <div className="int-hint">
                    {provider.setupHint || `Server env required: ${provider.envKeys.join(", ")}`}
                  </div>
                )}
                {provider.authType === "oauth2" && provider.redirectUri && !connection && (
                  <div className="int-callback">
                    <span>Callback URL to register in {provider.name}&apos;s console</span>
                    <div className="int-callback-row">
                      <code>{provider.redirectUri}</code>
                      <button
                        className="ghost"
                        onClick={() => void copyText(`cb:${provider.key}`, provider.redirectUri ?? "")}
                        title="Copy callback URL"
                      >
                        {copied === `cb:${provider.key}` ? "Copied" : <Copy size={12} />}
                      </button>
                    </div>
                  </div>
                )}
                <div className="int-card-foot">
                  {connection ? (
                    <>
                      <button
                        className="secondary"
                        disabled={!!busy || !canManage}
                        onClick={() => void testConnection(provider.key, connection.id)}
                      >
                        {busy === `test:${provider.key}` ? "Testing…" : "Test"}
                      </button>
                      <button
                        className="ghost"
                        disabled={!!busy || !canManage}
                        onClick={() => void disconnect(provider.key, connection.id)}
                      >
                        <Unplug size={13} /> Disconnect
                      </button>
                    </>
                  ) : isPreset ? (
                    <button className="secondary" onClick={() => setSection("webhooks")}>
                      <Webhook size={13} /> Create endpoint
                    </button>
                  ) : (
                    <button
                      className="primary"
                      disabled={
                        !!busy ||
                        !canManage ||
                        provider.disabled ||
                        (provider.authType === "oauth2" && !provider.configured)
                      }
                      title={!canManage ? "Owners and admins only" : undefined}
                      onClick={() => startConnect(provider)}
                    >
                      {busy === provider.key ? "Opening…" : needsToken ? "Connect" : "Connect"}
                    </button>
                  )}
                </div>
                {tokenForm === provider.key && (
                  <form
                    className="int-form"
                    onSubmit={(e) => {
                      e.preventDefault();
                      void submitTokenConnect();
                    }}
                  >
                    {provider.tokenFields.map((field) => (
                      <label key={field.key}>
                        {field.label}
                        <input
                          type={field.secret ? "password" : "text"}
                          value={tokenValues[field.key] ?? ""}
                          placeholder={field.placeholder}
                          onChange={(e) =>
                            setTokenValues((prev) => ({ ...prev, [field.key]: e.target.value }))
                          }
                          autoFocus={field === provider.tokenFields[0]}
                        />
                      </label>
                    ))}
                    <div className="int-form-row">
                      <button className="primary" type="submit" disabled={!!busy}>
                        <Send size={13} /> Save connection
                      </button>
                      <button
                        className="ghost"
                        type="button"
                        onClick={() => {
                          setTokenForm(null);
                          setTokenValues({});
                        }}
                      >
                        Cancel
                      </button>
                    </div>
                  </form>
                )}
                {shopPrompt === provider.key && (
                  <form
                    className="int-form"
                    onSubmit={(e) => {
                      e.preventDefault();
                      const shop = shopValue.trim().toLowerCase();
                      if (!/^[a-z0-9-]+\.myshopify\.com$/.test(shop)) {
                        fail("Enter your store domain, for example acme.myshopify.com");
                        return;
                      }
                      void connectOAuth(provider, shop);
                    }}
                  >
                    <label>
                      Shopify store domain
                      <input
                        value={shopValue}
                        placeholder="acme.myshopify.com"
                        onChange={(e) => setShopValue(e.target.value)}
                        autoFocus
                      />
                    </label>
                    <div className="int-form-row">
                      <button className="primary" type="submit" disabled={!!busy}>
                        Continue to Shopify
                      </button>
                      <button className="ghost" type="button" onClick={() => setShopPrompt(null)}>
                        Cancel
                      </button>
                    </div>
                  </form>
                )}
              </div>
            );
          })}
        </div>
        {knowledgeConnected.length > 0 && (
          <div className="int-note">
            {knowledgeConnected.length} connected provider
            {knowledgeConnected.length === 1 ? "" : "s"} can feed the knowledge base — add them under
            Knowledge sync.
          </div>
        )}
      </>
    );
  }

  function renderSources() {
    const knowledgeProviders = (catalog?.providers ?? []).filter(
      (provider) => provider.knowledge && (provider.connected || provider.key === "github"),
    );
    return (
      <>
        <div className="bill-section-title">
          <h3>Synced sources</h3>
          <span>{sources?.length ?? 0} total</span>
        </div>
        {sources === null ? (
          <div className="int-note">Loading sources…</div>
        ) : sources.length === 0 ? (
          <div className="int-note">
            No knowledge sources yet. Connect Google Drive, Notion or GitHub, then add a source to
            keep the agent knowledge base in sync automatically.
          </div>
        ) : (
          <div className="int-table">
            <div className="head int-cols-source">
              <span>Source</span>
              <span>Path</span>
              <span>Status</span>
              <span>Last sync</span>
              <span>Docs</span>
              <span>Actions</span>
            </div>
            {sources.map((source) => (
              <div className="int-cols-source" key={source.id}>
                <span>
                  <b>{source.name}</b>
                  <i className="int-sub">{source.provider}</i>
                </span>
                <span className="int-mono">{source.remotePath || "—"}</span>
                <span>
                  {statusPill(source.status)}
                  {source.autoSync ? (
                    <span className="pill muted">auto</span>
                  ) : (
                    <span className="pill muted">manual</span>
                  )}
                  {source.lastError && <i className="int-bad">{source.lastError}</i>}
                </span>
                <span className="int-muted">{formatWhen(source.lastSyncAt)}</span>
                <span className="int-muted">{source.documentsSynced}</span>
                <span className="int-actions">
                  <button
                    className="secondary"
                    disabled={!!busy || !canManage}
                    onClick={() => void syncSource(source)}
                  >
                    {busy === `sync:${source.id}` ? "Syncing…" : "Sync now"}
                  </button>
                  <button
                    className="ghost"
                    disabled={!!busy || !canManage}
                    onClick={() => void toggleSourceAutoSync(source)}
                  >
                    {source.autoSync ? "Pause" : "Resume"}
                  </button>
                  <button
                    className="ghost"
                    disabled={!!busy || !canManage}
                    onClick={() => void deleteSource(source)}
                  >
                    <Trash2 size={13} />
                  </button>
                </span>
              </div>
            ))}
          </div>
        )}

        <div className="bill-section-title int-gap">
          <h3>Add a source</h3>
          <span>automatic 15-minute refresh</span>
        </div>
        <form
          className="int-form inline"
          onSubmit={(e) => {
            e.preventDefault();
            void createSource();
          }}
        >
          <label>
            Provider
            <select
              value={sourceForm.provider}
              onChange={(e) => setSourceForm((prev) => ({ ...prev, provider: e.target.value }))}
            >
              <option value="">Choose…</option>
              {knowledgeProviders.map((provider) => (
                <option key={provider.key} value={provider.key}>
                  {provider.name}
                  {provider.connected ? "" : " (env token)"}
                </option>
              ))}
            </select>
          </label>
          <label>
            Name
            <input
              value={sourceForm.name}
              placeholder="Team handbook"
              onChange={(e) => setSourceForm((prev) => ({ ...prev, name: e.target.value }))}
            />
          </label>
          <label>
            Remote path
            <input
              value={sourceForm.remotePath}
              placeholder="owner/repo, folder id or database id"
              onChange={(e) => setSourceForm((prev) => ({ ...prev, remotePath: e.target.value }))}
            />
          </label>
          <label className="int-check">
            <input
              type="checkbox"
              checked={sourceForm.autoSync}
              onChange={(e) => setSourceForm((prev) => ({ ...prev, autoSync: e.target.checked }))}
            />
            Keep in sync automatically
          </label>
          <button className="primary" type="submit" disabled={!!busy || !canManage}>
            {busy === "source:create" ? "Creating…" : "Add source"}
          </button>
        </form>
      </>
    );
  }

  function renderWidget() {
    if (!widget || !widgetForm) return <div className="int-note">Loading widget settings…</div>;
    return (
      <div className="int-split">
        <form
          className="int-form"
          onSubmit={(e) => {
            e.preventDefault();
            void saveWidget();
          }}
        >
          <label className="int-check">
            <input
              type="checkbox"
              checked={widgetForm.enabled}
              onChange={(e) => setWidgetForm((prev) => (prev ? { ...prev, enabled: e.target.checked } : prev))}
            />
            Widget enabled — visitors can start conversations
          </label>
          <label>
            Title
            <input
              value={widgetForm.title}
              onChange={(e) => setWidgetForm((prev) => (prev ? { ...prev, title: e.target.value } : prev))}
            />
          </label>
          <label>
            Greeting
            <input
              value={widgetForm.greeting}
              onChange={(e) => setWidgetForm((prev) => (prev ? { ...prev, greeting: e.target.value } : prev))}
            />
          </label>
          <div className="int-form-row">
            <label>
              Accent colour
              <input
                type="color"
                value={widgetForm.accent}
                onChange={(e) => setWidgetForm((prev) => (prev ? { ...prev, accent: e.target.value } : prev))}
              />
            </label>
            <label>
              Agent
              <select
                value={widgetForm.agentId}
                onChange={(e) => setWidgetForm((prev) => (prev ? { ...prev, agentId: e.target.value } : prev))}
              >
                <option value="">Pick an agent…</option>
                {agents.map((agent) => (
                  <option key={agent.id} value={agent.id}>
                    {agent.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <label className="int-check">
            <input
              type="checkbox"
              checked={widgetForm.collectEmail}
              onChange={(e) => setWidgetForm((prev) => (prev ? { ...prev, collectEmail: e.target.checked } : prev))}
            />
            Ask visitors for their email address
          </label>
          <label>
            Allowed origins (one per line — blank allows any site)
            <textarea
              rows={3}
              value={widgetForm.origins}
              placeholder="https://www.example.com"
              onChange={(e) => setWidgetForm((prev) => (prev ? { ...prev, origins: e.target.value } : prev))}
            />
          </label>
          <div className="int-form-row">
            <button className="primary" type="submit" disabled={!!busy || !canManage}>
              {busy === "widget:save" ? "Saving…" : "Save widget"}
            </button>
            <button
              className="ghost"
              type="button"
              disabled={!!busy || !canManage}
              onClick={() => void regenerateWidgetKey()}
            >
              <RefreshCw size={13} /> Regenerate key
            </button>
          </div>
        </form>

        <div className="int-embed">
          <div className="bill-section-title">
            <h3>Embed on your website</h3>
            <span>paste before &lt;/body&gt;</span>
          </div>
          <div className="int-code">
            <code>{embed || "Loading embed snippet…"}</code>
            <button
              className="ghost"
              onClick={() => void copyText("embed", embed)}
              disabled={!embed}
              title="Copy snippet"
            >
              {copied === "embed" ? "Copied" : <Copy size={13} />}
            </button>
          </div>
          <div className="int-note">
            Public key <b className="int-mono">{widget.setting.publicKey}</b> — the loader script
            polls for replies, so conversations keep working without WebSockets. Requests outside the
            allowed origins are rejected by the API.
          </div>
          <div className="int-stat-grid">
            <div className="int-stat">
              <span>Widget</span>
              <b>{widget.setting.enabled ? "Live" : "Off"}</b>
            </div>
            <div className="int-stat">
              <span>Agent</span>
              <b>{widget.agent?.name ?? "Not assigned"}</b>
            </div>
            <div className="int-stat">
              <span>Origin checks</span>
              <b>{(widget.setting.allowedOrigins ?? []).length || "Any site"}</b>
            </div>
          </div>
        </div>
      </div>
    );
  }

  function renderWebhooks() {
    if (!hooks) return <div className="int-note">Loading webhook endpoints…</div>;
    return (
      <>
        <div className="bill-section-title">
          <h3>Endpoints</h3>
          <span>signed with HMAC-SHA256</span>
        </div>
        {hooks.endpoints.length === 0 ? (
          <div className="int-note">
            No endpoints yet. Point Ryuksaidso at Zapier, Make, n8n or your own service — every
            delivery carries <code>x-ryuksaidso-signature</code> so you can verify it.
          </div>
        ) : (
          <div className="int-table">
            <div className="head int-cols-hook">
              <span>Name</span>
              <span>URL</span>
              <span>Events</span>
              <span>Status</span>
              <span>Last delivery</span>
              <span>Actions</span>
            </div>
            {hooks.endpoints.map((endpoint) => (
              <div className="int-cols-hook" key={endpoint.id}>
                <span>
                  <b>{endpoint.name}</b>
                </span>
                <span className="int-mono">{endpoint.url}</span>
                <span className="int-muted">
                  {endpoint.events.length} event{endpoint.events.length === 1 ? "" : "s"}
                </span>
                <span>{endpoint.active ? statusPill("ACTIVE") : statusPill("PAUSED")}</span>
                <span className="int-muted">{formatWhen(endpoint.lastDeliveryAt)}</span>
                <span className="int-actions">
                  <button
                    className="secondary"
                    disabled={!!busy || !canManage}
                    onClick={() => void testWebhook(endpoint)}
                  >
                    {busy === `hook:test:${endpoint.id}` ? "Queueing…" : "Test"}
                  </button>
                  <button
                    className="ghost"
                    disabled={!!busy || !canManage}
                    onClick={() => void deleteWebhook(endpoint)}
                  >
                    <Trash2 size={13} />
                  </button>
                </span>
              </div>
            ))}
          </div>
        )}

        {newSecret && (
          <div className="bill-banner ok">
            <span className="bill-banner-icon">
              <CircleCheck size={15} />
            </span>
            <span className="bill-banner-text">
              Signing secret (shown once): <code className="int-mono">{newSecret}</code>
            </span>
            <button className="ghost" onClick={() => void copyText("secret", newSecret)}>
              {copied === "secret" ? "Copied" : <Copy size={13} />}
            </button>
          </div>
        )}

        <div className="bill-section-title int-gap">
          <h3>Recent deliveries</h3>
          <span>last 30</span>
        </div>
        {hooks.deliveries.length === 0 ? (
          <div className="int-note">No deliveries yet — events appear here as they fire.</div>
        ) : (
          <div className="int-table">
            <div className="head int-cols-delivery">
              <span>Time</span>
              <span>Event</span>
              <span>Endpoint</span>
              <span>Status</span>
              <span>Attempts</span>
              <span />
            </div>
            {hooks.deliveries.map((delivery) => (
              <div className="int-cols-delivery" key={delivery.id}>
                <span className="int-muted">{formatWhen(delivery.createdAt)}</span>
                <span className="int-mono">{delivery.event}</span>
                <span className="int-muted">{delivery.endpoint?.name ?? "—"}</span>
                <span>
                  {statusPill(delivery.status)}
                  {delivery.lastError && <i className="int-bad">{delivery.lastError}</i>}
                </span>
                <span className="int-muted">{delivery.attempts}/3</span>
                <span className="int-actions">
                  {delivery.status === "FAILED" && (
                    <button
                      className="secondary"
                      disabled={!!busy || !canManage}
                      onClick={() => void retryDelivery(delivery)}
                    >
                      {busy === `hook:retry:${delivery.id}` ? "Retrying…" : "Retry"}
                    </button>
                  )}
                </span>
              </div>
            ))}
          </div>
        )}

        <div className="bill-section-title int-gap">
          <h3>New endpoint</h3>
          <span>delivery: 3 attempts, signed</span>
        </div>
        <form
          className="int-form"
          onSubmit={(e) => {
            e.preventDefault();
            void createWebhook();
          }}
        >
          <div className="int-form-row">
            <label>
              Name
              <input
                value={hookForm.name}
                placeholder="Zapier bridge"
                onChange={(e) => setHookForm((prev) => ({ ...prev, name: e.target.value }))}
              />
            </label>
            <label className="grow">
              URL
              <input
                value={hookForm.url}
                placeholder="https://hooks.zapier.com/hooks/catch/…"
                onChange={(e) => setHookForm((prev) => ({ ...prev, url: e.target.value }))}
              />
            </label>
          </div>
          <span className="bill-label">Events</span>
          <div className="int-events">
            {hooks.events.map((entry) => {
              const checked = hookForm.events.includes(entry.event);
              return (
                <label key={entry.event} className={checked ? "on" : ""}>
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() =>
                      setHookForm((prev) => ({
                        ...prev,
                        events: checked
                          ? prev.events.filter((item) => item !== entry.event)
                          : [...prev.events, entry.event],
                      }))
                    }
                  />
                  <code>{entry.event}</code>
                  <span>{entry.description}</span>
                </label>
              );
            })}
          </div>
          <div className="int-form-row">
            <button className="primary" type="submit" disabled={!!busy || !canManage}>
              {busy === "hook:create" ? "Creating…" : "Create endpoint"}
            </button>
          </div>
        </form>
      </>
    );
  }

  function renderActivity() {
    if (!activity) return <div className="int-note">Loading activity…</div>;
    return (
      <>
        <div className="bill-section-title">
          <h3>Agent tool calls</h3>
          <span>integration tools used by runs</span>
        </div>
        {activity.items.length === 0 ? (
          <div className="int-note">
            No integration tool calls yet — they appear here the first time an agent uses a connected
            service.
          </div>
        ) : (
          <div className="int-table">
            <div className="head int-cols-tool">
              <span>Time</span>
              <span>Tool</span>
              <span>Step</span>
              <span>Duration</span>
              <span>Run</span>
              <span>Trigger</span>
            </div>
            {activity.items.map((item) => (
              <div className="int-cols-tool" key={item.id}>
                <span className="int-muted">{formatWhen(item.createdAt)}</span>
                <span className="int-mono">
                  {item.tool}
                  {item.error && <i className="int-bad">{item.error}</i>}
                </span>
                <span>{statusPill(item.status === "succeeded" ? "SUCCESS" : item.status === "failed" ? "FAILED" : "PENDING", item.status)}</span>
                <span className="int-muted">{item.durationMs != null ? `${item.durationMs}ms` : "—"}</span>
                <span className="int-muted">{item.runStatus.toLowerCase()}</span>
                <span className="int-muted">{item.trigger}</span>
              </div>
            ))}
          </div>
        )}

        <div className="bill-section-title int-gap">
          <h3>Connection activity</h3>
          <span>last 50 events</span>
        </div>
        {activity.logs.length === 0 ? (
          <div className="int-note">No integration events recorded yet.</div>
        ) : (
          <div className="int-table">
            <div className="head int-cols-log">
              <span>Time</span>
              <span>Provider</span>
              <span>Event</span>
              <span>Level</span>
              <span>Message</span>
            </div>
            {activity.logs.map((log) => (
              <div className="int-cols-log" key={log.id}>
                <span className="int-muted">{formatWhen(log.createdAt)}</span>
                <span className="int-mono">{log.provider}</span>
                <span>{log.event}</span>
                <span>{statusPill(log.level === "error" ? "FAILED" : log.level === "warn" ? "PENDING" : "SUCCESS", log.level)}</span>
                <span className="int-muted">{log.message || "—"}</span>
              </div>
            ))}
          </div>
        )}
      </>
    );
  }

  const sections: SectionKey[] = [
    "marketplace",
    "sources",
    "widget",
    "webhooks",
    "activity",
    ...(isSystemAdmin ? (["admin"] as SectionKey[]) : []),
  ];

  return (
    <div className="page">
      <div className="hero compact">
        <div>
          <span className="eyebrow">INTEGRATIONS</span>
          <h1>Connect your stack</h1>
          <p>
            OAuth connections, knowledge sync, the website chat widget, outbound webhooks and the
            agent tools that use them — all governed by the same policies and audit trail.
          </p>
        </div>
      </div>
      <section className="panel wide">
        <PanelHead
          icon={Plug}
          title="Integration platform"
          sub="Marketplace, credentials, syncs and delivery health"
        />
        {message && <Banner message={message} onClose={() => setMessage(null)} />}
        <div className="int-tabs">
          {sections.map((key) => (
            <button
              key={key}
              className={`int-tab ${section === key ? "on" : ""}`}
              onClick={() => setSection(key)}
            >
              {SECTION_LABELS[key]}
            </button>
          ))}
        </div>
        {section === "marketplace" && renderMarketplace()}
        {section === "sources" && renderSources()}
        {section === "widget" && renderWidget()}
        {section === "webhooks" && renderWebhooks()}
        {section === "activity" && renderActivity()}
        {section === "admin" && isSystemAdmin && <IntegrationAdminSection />}
      </section>
    </div>
  );
}

type AdminOverview = {
  settings: { enabled: boolean; disabledProviders: string[] };
  connections: { total: number; byStatus: Record<string, number>; byProvider: Record<string, number> };
  sources: { total: number; byStatus: Record<string, number> };
  webhooks: { endpoints: number; delivery24h: Record<string, number> };
  recentErrors: Array<{
    id: string;
    organizationName: string;
    provider: string;
    event: string;
    message: string;
    createdAt: string;
  }>;
  catalog: { providers: number };
};

type AdminSettings = {
  enabled: boolean;
  disabledProviders: string[];
  updatedBy: string;
  updatedAt: string | null;
};

export function IntegrationAdminSection() {
  const [overview, setOverview] = useState<AdminOverview | null>(null);
  const [settings, setSettings] = useState<AdminSettings | null>(null);
  const [providers, setProviders] = useState<CatalogProvider[]>([]);
  const [enabled, setEnabled] = useState(true);
  const [disabled, setDisabled] = useState<string[]>([]);
  const [message, setMessage] = useState<Message>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const [over, set, cat] = await Promise.all([
        api<AdminOverview>("/admin/integrations/overview"),
        api<AdminSettings>("/admin/integrations/settings"),
        api<CatalogResponse>("/integrations/catalog"),
      ]);
      setOverview(over);
      setSettings(set);
      setEnabled(set.enabled);
      setDisabled(set.disabledProviders);
      setProviders(cat.providers);
    } catch (e) {
      setMessage({
        kind: "err",
        text: e instanceof Error ? e.message.trim() || "Could not load integration administration" : "Could not load integration administration",
      });
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function save() {
    setBusy(true);
    try {
      const updated = await api<AdminSettings>("/admin/integrations/settings", {
        method: "PUT",
        body: JSON.stringify({ enabled, disabledProviders: disabled }),
      });
      setSettings(updated);
      setMessage({ kind: "ok", text: "Platform integration settings saved." });
      await load();
    } catch (e) {
      setMessage({
        kind: "err",
        text: e instanceof Error ? e.message.trim() || "Could not save the settings" : "Could not save the settings",
      });
    } finally {
      setBusy(false);
    }
  }

  function toggleProvider(key: string) {
    setDisabled((prev) => (prev.includes(key) ? prev.filter((item) => item !== key) : [...prev, key]));
  }

  return (
    <>
      {message && <Banner message={message} onClose={() => setMessage(null)} />}
      <div className="bill-section-title">
        <h3>Platform switch</h3>
        <span>applies to every workspace</span>
      </div>
      <div className="int-admin-row">
        <label className="int-check">
          <input
            type="checkbox"
            checked={enabled}
            onChange={(e) => setEnabled(e.target.checked)}
          />
          Third-party integrations enabled
        </label>
        <button className="primary" onClick={() => void save()} disabled={busy}>
          {busy ? "Saving…" : "Save settings"}
        </button>
      </div>
      {settings && (
        <div className="int-note">
          Last changed by {settings.updatedBy || "—"} at {formatWhen(settings.updatedAt)}.
        </div>
      )}
      <div className="bill-section-title int-gap">
        <h3>Provider switches</h3>
        <span>uncheck to disable for all orgs</span>
      </div>
      <div className="int-provider-switches">
        {providers.map((provider) => {
          const Icon = PROVIDER_ICONS[provider.icon] ?? Plug;
          const checked = !disabled.includes(provider.key);
          return (
            <label key={provider.key} className={checked ? "on" : ""}>
              <input
                type="checkbox"
                checked={checked}
                onChange={() => toggleProvider(provider.key)}
              />
              <span className="int-switch-icon" style={{ color: provider.color }}>
                <Icon size={14} />
              </span>
              <b>{provider.name}</b>
              <i>{provider.category}</i>
            </label>
          );
        })}
      </div>
      <div className="int-form-row">
        <button className="primary" onClick={() => void save()} disabled={busy}>
          {busy ? "Saving…" : "Save settings"}
        </button>
      </div>

      <div className="bill-section-title int-gap">
        <h3>Platform health</h3>
        <span>all workspaces</span>
      </div>
      {overview ? (
        <>
          <div className="int-stat-grid">
            <div className="int-stat">
              <span>Connections</span>
              <b>{overview.connections.total}</b>
              <i>
                {Object.entries(overview.connections.byStatus)
                  .map(([key, value]) => `${key} ${value}`)
                  .join(" · ") || "none"}
              </i>
            </div>
            <div className="int-stat">
              <span>Knowledge sources</span>
              <b>{overview.sources.total}</b>
              <i>
                {Object.entries(overview.sources.byStatus)
                  .map(([key, value]) => `${key} ${value}`)
                  .join(" · ") || "none"}
              </i>
            </div>
            <div className="int-stat">
              <span>Webhook endpoints</span>
              <b>{overview.webhooks.endpoints}</b>
              <i>
                24h — {overview.webhooks.delivery24h.SUCCESS ?? 0} delivered,{" "}
                {overview.webhooks.delivery24h.FAILED ?? 0} failed
              </i>
            </div>
            <div className="int-stat">
              <span>Catalog</span>
              <b>{overview.catalog.providers}</b>
              <i>providers available</i>
            </div>
          </div>
          <div className="bill-section-title int-gap">
            <h3>Recent errors</h3>
            <span>last 25</span>
          </div>
          {overview.recentErrors.length === 0 ? (
            <div className="int-note">No integration errors in the recent window.</div>
          ) : (
            <div className="int-table">
              <div className="head int-cols-error">
                <span>Time</span>
                <span>Workspace</span>
                <span>Provider</span>
                <span>Event</span>
                <span>Message</span>
              </div>
              {overview.recentErrors.map((row) => (
                <div className="int-cols-error" key={row.id}>
                  <span className="int-muted">{formatWhen(row.createdAt)}</span>
                  <span>{row.organizationName}</span>
                  <span className="int-mono">{row.provider}</span>
                  <span>{row.event}</span>
                  <span className="int-bad">{row.message}</span>
                </div>
              ))}
            </div>
          )}
        </>
      ) : (
        <div className="int-note">Loading platform health…</div>
      )}
    </>
  );
}

