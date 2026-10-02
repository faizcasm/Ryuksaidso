"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Cpu, Globe2, RefreshCw, Trash2, Zap } from "lucide-react";
import { api } from "../lib/api";

type ModelProviderRow = {
  id: string;
  name: string;
  kind: string;
  baseUrl: string;
  hasKey: boolean;
  defaultModel: string;
  models: string[];
  enabled: boolean;
  status: string;
  latencyMs: number | null;
  lastCheckedAt: string | null;
  lastError: string;
  isDefault: boolean;
  createdAt: string;
};

type Message = { kind: "ok" | "err"; text: string } | null;

const KIND_LABELS: Record<string, string> = {
  openai_compat: "OpenAI-compatible",
  ollama: "Ollama / local",
};

function readError(e: unknown, fallback: string) {
  if (e instanceof Error && e.message.trim()) return e.message.trim();
  return fallback;
}

function statusPill(row: ModelProviderRow) {
  if (!row.enabled) return <span className="pill muted">disabled</span>;
  const tone =
    row.status === "HEALTHY"
      ? "ok"
      : row.status === "DEGRADED"
        ? "warn"
        : row.status === "ERROR"
          ? "bad"
          : "muted";
  return (
    <span className={`pill ${tone}`}>
      {row.status === "UNKNOWN" ? "not tested" : row.status.toLowerCase()}
    </span>
  );
}

export function ModelProvidersSection({
  canManage,
  onChanged,
}: {
  canManage: boolean;
  onChanged?: () => void;
}) {
  const [rows, setRows] = useState<ModelProviderRow[] | null>(null);
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState<Message>(null);
  const [discovered, setDiscovered] = useState<string[]>([]);
  const [form, setForm] = useState({
    name: "",
    kind: "openai_compat",
    baseUrl: "",
    apiKey: "",
    defaultModel: "",
  });

  const load = useCallback(async () => {
    try {
      const data = await api<{ providers: ModelProviderRow[] }>(
        "/models/providers",
      );
      setRows(data.providers);
    } catch (e) {
      setMessage({ kind: "err", text: readError(e, "Could not load model providers") });
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function discover() {
    setBusy("discover");
    setMessage(null);
    try {
      const result = await api<{ models: string[]; latencyMs: number }>(
        "/models/discover",
        {
          method: "POST",
          body: JSON.stringify({
            kind: form.kind,
            baseUrl: form.baseUrl,
            apiKey: form.apiKey || undefined,
          }),
        },
      );
      setDiscovered(result.models);
      setForm((prev) => ({
        ...prev,
        defaultModel: prev.defaultModel || result.models[0] || "",
      }));
      setMessage({
        kind: "ok",
        text: `${result.models.length} model${result.models.length === 1 ? "" : "s"} found in ${result.latencyMs} ms.`,
      });
      if (!result.models.length) {
        setMessage({ kind: "err", text: "The endpoint answered but listed no models. Type the model name manually." });
      }
    } catch (e) {
      setMessage({ kind: "err", text: readError(e, "Could not reach the endpoint") });
    } finally {
      setBusy("");
    }
  }

  async function createProvider(e: FormEvent) {
    e.preventDefault();
    setBusy("create");
    setMessage(null);
    try {
      await api("/models/providers", {
        method: "POST",
        body: JSON.stringify({
          name: form.name,
          kind: form.kind,
          baseUrl: form.baseUrl,
          apiKey: form.apiKey || undefined,
          defaultModel: form.defaultModel,
        }),
      });
      setMessage({ kind: "ok", text: `${form.name} added. Test it, then make it the workspace default.` });
      setForm({ name: "", kind: form.kind, baseUrl: "", apiKey: "", defaultModel: "" });
      setDiscovered([]);
      await load();
      onChanged?.();
    } catch (e) {
      setMessage({ kind: "err", text: readError(e, "Could not add the provider") });
    } finally {
      setBusy("");
    }
  }

  async function testProvider(row: ModelProviderRow) {
    setBusy(`test:${row.id}`);
    setMessage(null);
    try {
      const result = await api<{
        ok: boolean;
        latencyMs: number;
        models: string[];
        error: string | null;
      }>(`/models/providers/${row.id}/test`, { method: "POST", body: "{}" });
      if (result.ok) {
        setMessage({
          kind: "ok",
          text: `${row.name} answered in ${result.latencyMs} ms with ${result.models.length} model${result.models.length === 1 ? "" : "s"}.`,
        });
      } else {
        setMessage({ kind: "err", text: `${row.name}: ${result.error ?? "endpoint unreachable"}` });
      }
      await load();
      onChanged?.();
    } catch (e) {
      setMessage({ kind: "err", text: readError(e, `Could not test ${row.name}`) });
    } finally {
      setBusy("");
    }
  }

  async function makeDefault(row: ModelProviderRow) {
    if (!row.defaultModel) {
      setMessage({ kind: "err", text: `${row.name} has no default model yet — delete and re-add it with a model name.` });
      return;
    }
    setBusy(`use:${row.id}`);
    setMessage(null);
    try {
      await api("/llm", {
        method: "PATCH",
        body: JSON.stringify({ provider: row.id, model: row.defaultModel }),
      });
      setMessage({ kind: "ok", text: `Workspace runs now use ${row.name} · ${row.defaultModel}.` });
      await load();
      onChanged?.();
    } catch (e) {
      setMessage({ kind: "err", text: readError(e, `Could not switch to ${row.name}`) });
    } finally {
      setBusy("");
    }
  }

  async function deleteProvider(row: ModelProviderRow) {
    setBusy(`delete:${row.id}`);
    setMessage(null);
    try {
      const result = await api<{ reverted: boolean }>(
        `/models/providers/${row.id}`,
        { method: "DELETE" },
      );
      setMessage({
        kind: "ok",
        text: `${row.name} removed${result.reverted ? " — workspace routing reverted to OmniRoute" : ""}.`,
      });
      await load();
      onChanged?.();
    } catch (e) {
      setMessage({ kind: "err", text: readError(e, `Could not remove ${row.name}`) });
    } finally {
      setBusy("");
    }
  }

  return (
    <section className="panel">
      <div className="panel-header">
        <div className="panel-icon">
          <Cpu size={16} />
        </div>
        <div>
          <h2>Custom model providers</h2>
          <p>
            Bring your own endpoint — a cloud API key, an OpenAI-compatible
            gateway, or a model running on this machine.
          </p>
        </div>
      </div>

      {message && (
        <div className="int-note">
          <b className={message.kind === "ok" ? "good-text" : "bad-text"}>
            {message.text}
          </b>
        </div>
      )}

      {rows === null ? (
        <div className="int-note">Loading providers…</div>
      ) : rows.length === 0 ? (
        <div className="int-note">
          No custom providers yet. Add OpenRouter, Groq, Together, a company
          gateway, or a local Ollama / LM Studio / vLLM server — anything that
          speaks the OpenAI chat contract.
        </div>
      ) : (
        <div className="int-table">
          <div className="head int-cols-provider">
            <span>Provider</span>
            <span>Endpoint</span>
            <span>Model</span>
            <span>Status</span>
            <span>Actions</span>
          </div>
          {rows.map((row) => (
            <div className="int-cols-provider" key={row.id}>
              <span>
                <b>
                  {row.name}
                  {row.isDefault ? " · default" : ""}
                </b>
                <i className="int-sub">
                  {KIND_LABELS[row.kind] ?? row.kind}
                  {row.hasKey ? " · api key" : " · no key"}
                </i>
              </span>
              <span className="int-mono">{row.baseUrl}</span>
              <span>
                <b>{row.defaultModel || "—"}</b>
                {row.latencyMs !== null && (
                  <i className="int-sub">{row.latencyMs} ms</i>
                )}
              </span>
              <span>
                {statusPill(row)}
                {row.lastError && <i className="int-bad">{row.lastError}</i>}
              </span>
              <span className="int-actions">
                <button
                  className="secondary"
                  disabled={!!busy || !canManage}
                  onClick={() => void testProvider(row)}
                >
                  {busy === `test:${row.id}` ? "Testing…" : "Test"}
                </button>
                <button
                  className="ghost"
                  disabled={!!busy || !canManage || row.isDefault}
                  onClick={() => void makeDefault(row)}
                >
                  <Zap size={13} />
                  Make default
                </button>
                <button
                  className="ghost"
                  disabled={!!busy || !canManage}
                  onClick={() => void deleteProvider(row)}
                >
                  <Trash2 size={13} />
                </button>
              </span>
            </div>
          ))}
        </div>
      )}

      {canManage && (
        <>
          <div className="bill-section-title int-gap">
            <h3>Add a provider</h3>
            <span>cloud or local</span>
          </div>
          <form className="int-form inline" onSubmit={(e) => void createProvider(e)}>
            <label>
              Name
              <input
                value={form.name}
                onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
                placeholder="My OpenAI"
                maxLength={60}
                required
              />
            </label>
            <label>
              Type
              <select
                value={form.kind}
                onChange={(e) => setForm((prev) => ({ ...prev, kind: e.target.value }))}
              >
                <option value="openai_compat">OpenAI-compatible</option>
                <option value="ollama">Ollama / local</option>
              </select>
            </label>
            <label>
              Base URL
              <input
                value={form.baseUrl}
                onChange={(e) => setForm((prev) => ({ ...prev, baseUrl: e.target.value }))}
                placeholder="https://api.openai.com/v1"
                maxLength={300}
                required
              />
            </label>
            <label>
              API key {form.kind === "ollama" ? "(optional)" : ""}
              <input
                type="password"
                value={form.apiKey}
                onChange={(e) => setForm((prev) => ({ ...prev, apiKey: e.target.value }))}
                placeholder="Stored encrypted"
                autoComplete="off"
                maxLength={400}
              />
            </label>
            <label>
              Default model
              <input
                list="model-provider-models"
                value={form.defaultModel}
                onChange={(e) => setForm((prev) => ({ ...prev, defaultModel: e.target.value }))}
                placeholder="gpt-4o-mini"
                maxLength={200}
              />
            </label>
            <datalist id="model-provider-models">
              {discovered.map((m) => (
                <option key={m} value={m} />
              ))}
            </datalist>
            <div className="int-actions">
              <button
                type="button"
                className="secondary"
                disabled={!!busy || !form.baseUrl}
                onClick={() => void discover()}
              >
                <RefreshCw size={13} />
                {busy === "discover" ? "Fetching…" : "Fetch models"}
              </button>
              <button className="primary" type="submit" disabled={!!busy}>
                <Globe2 size={13} />
                Add provider
              </button>
            </div>
          </form>
        </>
      )}
    </section>
  );
}
