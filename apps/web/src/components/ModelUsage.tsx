"use client";

import { useCallback, useEffect, useState } from "react";
import { BarChart3, Check, Circle, Copy, Cpu, Sparkles, Zap } from "lucide-react";
import { api } from "../lib/api";

type UsageProvider = {
  id: string;
  name: string;
  kind: "custom" | "platform";
  model: string;
  enabled: boolean;
  status: string;
  lastError: string | null;
  lastCheckedAt: string | null;
  runs: number;
  completed: number;
  failed: number;
  tokens: number;
  lastUsedAt: string | null;
};

type UsageModel = {
  provider: string;
  providerName: string;
  model: string;
  runs: number;
  tokens: number;
  lastUsedAt: string | null;
};

type UsageSeries = { date: string; runs: number; tokens: number };

type UsagePromo = {
  customProviders: number;
  runsThroughCustom: number;
  eligible: boolean;
  discountPercent: number;
  code: string | null;
  sentAt: string | null;
  emailSent: boolean;
};

type UsageResponse = {
  providers: UsageProvider[];
  models: UsageModel[];
  series: UsageSeries[];
  totals: { runs30d: number; tokens30d: number; models30d: number; customProviders: number };
  promo: UsagePromo;
};

function when(value: string | null): string {
  if (!value) return "never";
  const date = new Date(value);
  const diff = Date.now() - date.getTime();
  if (diff < 60_000) return "just now";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return date.toLocaleDateString();
}

function PromoBanner({ promo }: { promo: UsagePromo }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    if (!promo.code) return;
    try {
      await navigator.clipboard.writeText(promo.code);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2500);
    } catch {
      setCopied(false);
    }
  };
  if (promo.eligible && promo.code) {
    return (
      <div className="mu-promo good">
        <span className="mu-promo-icon">
          <Sparkles size={15} />
        </span>
        <div className="mu-promo-copy">
          <b>
            {promo.discountPercent}% off unlocked — your BYO model provider is live
          </b>
          <span>
            Apply this code at Settings → Billing before checkout.
            {promo.sentAt
              ? ` We also emailed it on ${new Date(promo.sentAt).toLocaleDateString()}.`
              : " Email delivery is off on this deployment, so copy it from here."}
          </span>
        </div>
        <button className="secondary mu-code" onClick={copy} title="Copy promo code">
          {promo.code} <Copy size={13} />
        </button>
        {copied && <span className="mu-copied">copied</span>}
      </div>
    );
  }
  const steps = [
    { done: promo.customProviders > 0, label: "Add your own model provider in Settings → Models" },
    { done: promo.runsThroughCustom > 0, label: "Run an agent through it at least once" },
  ];
  return (
    <div className="mu-promo">
      <span className="mu-promo-icon">
        <Sparkles size={15} />
      </span>
      <div className="mu-promo-copy">
        <b>Bring your own model provider, get {promo.discountPercent}% off</b>
        <span>
          Connect a provider you own (OpenRouter, Groq, a company gateway, your own
          server…) and run an agent through it — we email you the promo code for{" "}
          {promo.discountPercent}% off your subscription.
        </span>
        <div className="mu-steps">
          {steps.map((step) => (
            <span key={step.label} className={step.done ? "done" : ""}>
              {step.done ? <Check size={11} /> : <Circle size={11} />}
              {step.label}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

export function ModelUsagePanel() {
  const [data, setData] = useState<UsageResponse | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      setData(await api<UsageResponse>("/models/usage"));
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load model usage");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (error) {
    return (
      <section className="panel">
        <div className="panel-header">
          <div className="panel-icon">
            <Cpu size={16} />
          </div>
          <div>
            <h2>Model providers &amp; usage</h2>
            <p>{error}</p>
          </div>
        </div>
      </section>
    );
  }
  if (!data) {
    return (
      <section className="panel">
        <div className="panel-header">
          <div className="panel-icon">
            <Cpu size={16} />
          </div>
          <div>
            <h2>Model providers &amp; usage</h2>
            <p>Loading provider and token stats…</p>
          </div>
        </div>
      </section>
    );
  }

  const maxRuns = Math.max(1, ...data.series.map((s) => s.runs));
  const providerTokens = data.providers
    .filter((p) => p.tokens > 0)
    .sort((a, b) => b.tokens - a.tokens);
  const maxTokens = Math.max(1, ...providerTokens.map((p) => p.tokens));

  return (
    <>
      <section className="panel">
        <div className="panel-header">
          <div className="panel-icon">
            <Cpu size={16} />
          </div>
          <div>
            <h2>Model providers &amp; usage</h2>
            <p>
              {data.totals.customProviders} custom · {data.totals.runs30d} runs ·{" "}
              {data.totals.tokens30d.toLocaleString()} tokens in the last 30 days
            </p>
          </div>
        </div>

        <PromoBanner promo={data.promo} />

        <div className="mu-grid">
          {data.providers.map((provider) => (
            <div className="mu-card" key={provider.id}>
              <div className="mu-card-head">
                <b>{provider.name}</b>
                <span className={`pill ${provider.kind === "custom" ? "ok" : "muted"}`}>
                  {provider.kind === "custom" ? "Custom" : "Platform"}
                </span>
                {provider.kind === "custom" && !provider.enabled && (
                  <span className="pill warn">off</span>
                )}
              </div>
              <span className="mu-model">{provider.model || "default model"}</span>
              <div className="mu-stats">
                <div>
                  <b>{provider.runs.toLocaleString()}</b>
                  <span>runs</span>
                </div>
                <div>
                  <b>{provider.tokens.toLocaleString()}</b>
                  <span>tokens</span>
                </div>
                <div>
                  <b>{provider.completed.toLocaleString()}</b>
                  <span>completed</span>
                </div>
              </div>
              <span className="mu-last">
                last used {when(provider.lastUsedAt)}
                {provider.failed ? ` · ${provider.failed} failed` : ""}
              </span>
            </div>
          ))}
          {!data.providers.length && (
            <div className="mu-empty">
              No model providers yet — connect one from Settings → Models.
            </div>
          )}
        </div>

        <div className="mu-table">
          <div className="head">
            <span>Model</span>
            <span>Provider</span>
            <span>Runs</span>
            <span>Tokens</span>
          </div>
          {data.models.slice(0, 10).map((row) => (
            <div key={`${row.provider}:${row.model}`}>
              <span>{row.model}</span>
              <span>{row.providerName}</span>
              <b>{row.runs.toLocaleString()}</b>
              <b>{row.tokens.toLocaleString()}</b>
            </div>
          ))}
          {!data.models.length && (
            <div className="mu-empty">
              No runs yet — launch an agent to populate model analytics.
            </div>
          )}
        </div>
      </section>

      <div className="admin-grid">
        <section className="panel">
          <div className="panel-header">
            <div className="panel-icon">
              <BarChart3 size={16} />
            </div>
            <div>
              <h2>Runs per day</h2>
              <p>All providers, last 14 days</p>
            </div>
          </div>
          <div className="chart-bars">
            {data.series.map((point) => (
              <div
                className="chart-bar-wrap"
                key={point.date}
                title={`${point.date}: ${point.runs} runs · ${point.tokens.toLocaleString()} tokens`}
              >
                <div
                  className="chart-bar"
                  style={{ height: `${Math.max(6, Math.round((point.runs / maxRuns) * 100))}%` }}
                />
                <span>{point.date.slice(5)}</span>
              </div>
            ))}
          </div>
          <div className="chart-footnote">
            <span>peak {maxRuns === 1 ? 0 : maxRuns} runs/day</span>
            <span>{data.totals.runs30d} runs / 30d</span>
          </div>
        </section>
        <section className="panel">
          <div className="panel-header">
            <div className="panel-icon">
              <Zap size={16} />
            </div>
            <div>
              <h2>Tokens per provider</h2>
              <p>Where your token budget is going</p>
            </div>
          </div>
          <div className="agent-ranking">
            {providerTokens.map((provider) => (
              <div key={provider.id}>
                <div>
                  <b>{provider.name}</b>
                  <span>{provider.tokens.toLocaleString()} tokens · {provider.runs} runs</span>
                </div>
                <div className="rank-track">
                  <i style={{ width: `${Math.max(4, Math.round((provider.tokens / maxTokens) * 100))}%` }} />
                </div>
              </div>
            ))}
            {!providerTokens.length && (
              <div className="mu-empty">No tokens recorded yet.</div>
            )}
          </div>
        </section>
      </div>
    </>
  );
}
