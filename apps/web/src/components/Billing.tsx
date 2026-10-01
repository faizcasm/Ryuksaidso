"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  CircleCheck,
  CreditCard,
  IndianRupee,
  RefreshCw,
  ShieldCheck,
  Zap,
} from "lucide-react";
import { api } from "../lib/api";

type PlanLimits = {
  maxAgents: number;
  maxMembers: number;
  maxTicketsPerMonth: number;
  maxRunsPerMonth: number;
  maxApiKeys: number;
  apiAccess: boolean;
  analyticsAccess: boolean;
};

export type BillingPlan = {
  id: string;
  code: string;
  name: string;
  description: string;
  priceMonthly: number;
  priceYearly: number;
  currency: string;
  apiAccess: boolean;
  analyticsAccess: boolean;
  limits: {
    maxAgents: number;
    maxMembers: number;
    maxTicketsPerMonth: number;
    maxRunsPerMonth: number;
    maxApiKeys: number;
  };
  features: string[];
  isDefault: boolean;
  sortOrder: number;
};

export type BillingSubscription = {
  id: string;
  planId: string;
  status: string;
  period: string;
  amount: number;
  currency: string;
  cancelAtPeriodEnd: boolean;
  currentPeriodStart: string | null;
  currentPeriodEnd: string | null;
  canceledAt: string | null;
  endedAt: string | null;
  providerSubscriptionId: string;
  createdAt: string;
};

export type BillingPayment = {
  id: string;
  amount: number;
  currency: string;
  status: string;
  method: string;
  failureReason: string;
  invoiceNumber: string;
  capturedAt: string | null;
  createdAt: string;
  subscriptionId: string;
};

type SubscriptionResponse = {
  billingEnabled: boolean;
  enforced: boolean;
  provider: string;
  configured: boolean;
  environment: string;
  plan: BillingPlan | null;
  planCode: string;
  subscription: BillingSubscription | null;
  contact: { name: string; email: string; phone: string } | null;
  entitlements: PlanLimits;
  usage: {
    agents: number;
    tickets: number;
    runs: number;
    members: number;
    apiKeys: number;
    apiRequests: number;
    periodKey: string;
  };
};

type PlansResponse = {
  billingEnabled: boolean;
  provider: string;
  configured: boolean;
  environment: string;
  currency: string;
  plans: BillingPlan[];
};

type CheckoutResponse =
  | {
      mode: "checkout";
      provider: string;
      environment: "sandbox" | "production";
      subscriptionId: string;
      subsSessionId: string;
      planCode: string;
      planName: string;
      period: string;
      amount: number;
      currency: string;
      returnUrl: string;
    }
  | { mode: "downgraded"; planCode: string };

type AdminOverview = {
  billingEnabled: boolean;
  provider: string;
  configured: boolean;
  environment: string;
  currency: string;
  planCount: number;
  mrr: number;
  subscriptionCounts: Record<string, number>;
  payments: { status: string; count: number; totalAmount: number }[];
  webhookCounts: Record<string, number>;
};

type AdminPlan = {
  id: string;
  code: string;
  name: string;
  description: string;
  priceMonthly: number;
  priceYearly: number;
  currency: string;
  providerPlanMonthly: string;
  providerPlanYearly: string;
  maxAgents: number;
  maxMembers: number;
  maxTicketsPerMonth: number;
  maxRunsPerMonth: number;
  maxApiKeys: number;
  apiAccess: boolean;
  analyticsAccess: boolean;
  features: string[];
  isDefault: boolean;
  sortOrder: number;
  active: boolean;
  updatedAt: string;
};

type AdminSubscription = BillingSubscription & {
  organizationName: string;
  planCode: string;
  planName: string;
};

type AdminSettings = {
  billingEnabled: boolean;
  updatedBy: string;
  updatedAt: string;
  provider: string;
  configured: boolean;
  environment: string;
};

type WebhookRow = {
  eventId: string;
  eventType: string;
  status: string;
  error: string;
  receivedAt: string;
  processedAt: string | null;
};

type Message = { kind: "ok" | "err"; text: string } | null;

function inr(paise: number) {
  return `₹${(paise / 100).toLocaleString("en-IN")}`;
}

function normalizePhone(raw: string) {
  const digits = String(raw ?? "").replace(/[^0-9]/g, "");
  return digits.length === 12 && digits.startsWith("91") ? digits.slice(2) : digits;
}

function readError(e: unknown, fallback: string) {
  if (e instanceof Error && e.message.trim()) return e.message.trim();
  return fallback;
}

function formatWhen(value: string) {
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

let cashfreeLoader: Promise<(options: { mode: string }) => any> | null = null;

function loadCashfree() {
  const w = window as any;
  if (w.Cashfree) return Promise.resolve(w.Cashfree);
  if (!cashfreeLoader) {
    cashfreeLoader = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = "https://sdk.cashfree.com/js/v3/cashfree.js";
      script.async = true;
      script.onload = () => {
        if (w.Cashfree) resolve(w.Cashfree);
        else {
          cashfreeLoader = null;
          reject(new Error("The Cashfree checkout script loaded incorrectly"));
        }
      };
      script.onerror = () => {
        cashfreeLoader = null;
        reject(new Error("Could not load the Cashfree checkout script — check your network"));
      };
      document.head.appendChild(script);
    });
  }
  return cashfreeLoader;
}

function statusPill(status: string) {
  const tone =
    status === "ACTIVE"
      ? "ok"
      : status === "PENDING" || status === "CREATED"
        ? "warn"
        : status === "HALTED" || status === "EXPIRED"
          ? "bad"
          : "muted";
  return <span className={`pill ${tone}`}>{status.toLowerCase()}</span>;
}

function hookPill(status: string) {
  const tone =
    status === "PROCESSED"
      ? "ok"
      : status === "DUPLICATE"
        ? "muted"
        : status === "FAILED"
          ? "bad"
          : "warn";
  return <span className={`pill ${tone}`}>{status.toLowerCase()}</span>;
}

function PanelHead({
  icon: Icon,
  title,
  sub,
}: {
  icon: any;
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

function limitText(value: number, unit: string) {
  return value === 0 ? `Unlimited ${unit}` : `${value.toLocaleString("en-IN")} ${unit}`;
}

export function PlanCards({
  plans,
  period,
  currentPlanCode,
  onChoose,
  busy,
  canChoose,
  includeFree,
}: {
  plans: BillingPlan[];
  period: "MONTHLY" | "YEARLY";
  currentPlanCode?: string;
  onChoose?: (plan: BillingPlan) => void;
  busy?: string;
  canChoose?: boolean;
  includeFree?: boolean;
}) {
  const paid = includeFree
    ? [...plans].sort((a, b) => a.sortOrder - b.sortOrder)
    : plans.filter((plan) => plan.code !== "free");
  return (
    <div className="plan-cards">
      {paid.map((plan) => {
        const current = currentPlanCode === plan.code;
        const amount = period === "MONTHLY" ? plan.priceMonthly : plan.priceYearly;
        return (
          <div className={`plan-card ${current ? "current" : ""}`} key={plan.id}>
            <div className="plan-card-top">
              <h3>{plan.name}</h3>
              {current && <span className="pill ok">current</span>}
            </div>
            <div className="plan-price">
              {inr(amount)}
              <small> / {period === "MONTHLY" ? "month" : "year"}</small>
            </div>
            <p className="plan-desc">{plan.description}</p>
            <ul>
              {plan.features.map((feature) => (
                <li key={feature}>{feature}</li>
              ))}
            </ul>
            {onChoose ? (
              <button
                className="primary"
                disabled={busy === plan.code || current || !canChoose}
                onClick={() => onChoose(plan)}
                title={
                  current
                    ? "This is your current plan"
                    : canChoose
                      ? undefined
                      : "Only workspace owners and admins can change billing"
                }
              >
                {busy === plan.code ? "Opening…" : current ? "Current plan" : `Choose ${plan.name}`}
              </button>
            ) : (
              <Link className="primary" href="/auth">
                Start with {plan.name}
              </Link>
            )}
          </div>
        );
      })}
    </div>
  );
}

export function BillingSection({ canManage }: { canManage: boolean }) {
  const [state, setState] = useState<SubscriptionResponse | null>(null);
  const [plans, setPlans] = useState<BillingPlan[]>([]);
  const [payments, setPayments] = useState<BillingPayment[]>([]);
  const [period, setPeriod] = useState<"MONTHLY" | "YEARLY">("MONTHLY");
  const [busy, setBusy] = useState("");
  const [loading, setLoading] = useState(true);
  const [verifying, setVerifying] = useState(false);
  const [message, setMessage] = useState<Message>(null);
  const [phoneFor, setPhoneFor] = useState("");
  const [phone, setPhone] = useState("");

  const load = useCallback(async () => {
    try {
      const [subscription, planRows, paymentRows] = await Promise.all([
        api<SubscriptionResponse>("/billing/subscription"),
        api<PlansResponse>("/billing/plans"),
        api<BillingPayment[]>("/billing/payments").catch(() => [] as BillingPayment[]),
      ]);
      setState(subscription);
      setPlans(planRows.plans);
      setPayments(paymentRows);
      if (subscription.contact?.phone) {
        setPhone((prev) => prev || normalizePhone(subscription.contact?.phone ?? ""));
      }
    } catch (e) {
      setMessage({ kind: "err", text: readError(e, "Could not load billing details") });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const raw = sessionStorage.getItem("ryuksaidso_checkout");
    if (!raw) return;
    sessionStorage.removeItem("ryuksaidso_checkout");
    let cancelled = false;
    (async () => {
      try {
        const parsed = JSON.parse(raw) as { subscriptionId?: string; at?: number };
        if (!parsed.subscriptionId || Date.now() - (parsed.at ?? 0) > 45 * 60_000) return;
        setVerifying(true);
        const out = await api<{ verified: boolean; subscription: BillingSubscription }>(
          "/billing/checkout/verify",
          { method: "POST", body: JSON.stringify({ subscriptionId: parsed.subscriptionId }) },
        );
        if (cancelled) return;
        const status = out.subscription.status;
        if (status === "ACTIVE") {
          setMessage({ kind: "ok", text: "Payment received — your subscription is now active." });
        } else if (status === "PENDING") {
          setMessage({
            kind: "ok",
            text: "Mandate submitted. Access unlocks automatically once the bank approves it.",
          });
        } else if (status === "CREATED") {
          setMessage({
            kind: "err",
            text: "Checkout was not completed. Choose your plan again to reopen the payment page.",
          });
        } else {
          setMessage({ kind: "ok", text: `Subscription status: ${status.toLowerCase()}.` });
        }
        await load();
      } catch (e) {
        if (!cancelled) {
          setMessage({
            kind: "err",
            text: readError(
              e,
              "Could not confirm the payment yet — it settles automatically once the mandate is approved.",
            ),
          });
        }
      } finally {
        if (!cancelled) setVerifying(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [load]);

  async function startCheckout(planCode: string) {
    if (busy) return;
    if (!canManage) {
      setMessage({ kind: "err", text: "Only workspace owners and admins can change billing." });
      return;
    }
    if (planCode === "free") {
      setBusy("free");
      try {
        await api("/billing/checkout", {
          method: "POST",
          body: JSON.stringify({ planCode: "free" }),
        });
        setMessage({ kind: "ok", text: "Switched to the Free plan." });
        await load();
      } catch (e) {
        setMessage({ kind: "err", text: readError(e, "Could not switch to the Free plan") });
      } finally {
        setBusy("");
      }
      return;
    }
    const digits = normalizePhone(phone);
    if (!/^[6-9]\d{9}$/.test(digits)) {
      setPhoneFor(planCode);
      setMessage({
        kind: "err",
        text: "Enter a 10-digit Indian mobile number — Cashfree needs it for the payment mandate.",
      });
      return;
    }
    setBusy(planCode);
    try {
      const result = await api<CheckoutResponse>("/billing/checkout", {
        method: "POST",
        body: JSON.stringify({ planCode, period, phone: digits }),
      });
      if (result.mode === "downgraded") {
        setMessage({ kind: "ok", text: "Switched to the Free plan." });
        setPhoneFor("");
        await load();
        return;
      }
      sessionStorage.setItem(
        "ryuksaidso_checkout",
        JSON.stringify({ subscriptionId: result.subscriptionId, at: Date.now() }),
      );
      const cashfreeCtor = await loadCashfree();
      const cashfree = cashfreeCtor({ mode: result.environment });
      await cashfree.subscriptionsCheckout({
        subsSessionId: result.subsSessionId,
        redirectTarget: "_self",
      });
    } catch (e) {
      setMessage({ kind: "err", text: readError(e, "Could not start the checkout") });
      setBusy("");
    }
  }

  async function cancelSubscription(mode: "immediate" | "at_period_end") {
    if (busy) return;
    setBusy(`cancel-${mode}`);
    try {
      await api("/billing/subscription/cancel", {
        method: "POST",
        body: JSON.stringify({ mode }),
      });
      setMessage({
        kind: "ok",
        text:
          mode === "immediate"
            ? "Subscription cancelled."
            : "Subscription will stop renewing at the end of the paid period.",
      });
      await load();
    } catch (e) {
      setMessage({ kind: "err", text: readError(e, "Could not cancel the subscription") });
    } finally {
      setBusy("");
    }
  }

  const usage = state?.usage;
  const limits = state?.entitlements;
  const subscription = state?.subscription;
  const currentPlan = state?.plan;
  const running =
    subscription && ["ACTIVE", "PENDING", "CREATED", "PAUSED"].includes(subscription.status);

  const usageRows: Array<{ label: string; used: number; max: number }> = usage && limits
    ? [
        { label: "AI agents", used: usage.agents, max: limits.maxAgents },
        { label: "Members", used: usage.members, max: limits.maxMembers },
        { label: "Tickets / month", used: usage.tickets, max: limits.maxTicketsPerMonth },
        { label: "Agent runs / month", used: usage.runs, max: limits.maxRunsPerMonth },
        { label: "API keys", used: usage.apiKeys, max: limits.maxApiKeys },
      ]
    : [];

  return (
    <section className="panel wide">
      <PanelHead
        icon={CreditCard}
        title="Billing & plan"
        sub="Subscription, plan limits and payment history"
      />
      {loading && <div className="bill-note">Loading billing details…</div>}
      {!loading && message && <Banner message={message} onClose={() => setMessage(null)} />}
      {verifying && <div className="bill-note">Confirming your payment with Cashfree…</div>}
      {state && !state.billingEnabled && (
        <div className="bill-note">
          Billing is switched off on this deployment — plan limits are bypassed and every feature
          is unlocked. An administrator can enforce subscriptions from Admin → Billing.
        </div>
      )}
      {state && state.billingEnabled && !state.configured && (
        <div className="bill-banner bad">
          <span className="bill-banner-icon">
            <AlertTriangle size={15} />
          </span>
          <span className="bill-banner-text">
            Payments are not configured on the server yet. Add the CASHFREE_* credentials to accept
            subscriptions.
          </span>
        </div>
      )}
      {state && (
        <>
          <div className="billing-top">
            <div className="billing-current">
              <span className="bill-label">Current plan</span>
              <b>{currentPlan?.name ?? "Free"}</b>
              <span className="bill-sub">
                {currentPlan && currentPlan.code !== "free"
                  ? `${subscription ? inr(subscription.amount) : ""} / ${
                      subscription?.period === "YEARLY" ? "year" : "month"
                    }`
                  : "No payment required"}
              </span>
              {subscription && (
                <div className="bill-status-row">
                  {statusPill(subscription.status)}
                  {subscription.cancelAtPeriodEnd && (
                    <span className="pill warn">ends at period end</span>
                  )}
                </div>
              )}
              {subscription?.currentPeriodEnd && running && (
                <span className="bill-sub">
                  {subscription.cancelAtPeriodEnd ? "Access until" : "Renews on"}{" "}
                  {formatWhen(subscription.currentPeriodEnd)}
                </span>
              )}
            </div>
            <div className="billing-features">
              <span className={`pill ${limits?.apiAccess ? "ok" : "muted"}`}>
                API {limits?.apiAccess ? "included" : "locked"}
              </span>
              <span className={`pill ${limits?.analyticsAccess ? "ok" : "muted"}`}>
                Analytics {limits?.analyticsAccess ? "included" : "locked"}
              </span>
              <span className="pill muted">{state.enforced ? "limits enforced" : "bypassed"}</span>
            </div>
          </div>

          {usageRows.length > 0 && limits && (
            <div className="usage-list">
              {usageRows.map((row) => {
                const pct =
                  row.max > 0 ? Math.min(100, Math.round((row.used / row.max) * 100)) : 0;
                const full = row.max > 0 && row.used >= row.max;
                return (
                  <div className="usage-row" key={row.label}>
                    <span>{row.label}</span>
                    <span className={`usage-track ${full ? "full" : ""}`}>
                      <i style={{ width: row.max > 0 ? `${pct}%` : "100%" }} />
                    </span>
                    <b>
                      {row.used} / {row.max > 0 ? row.max : "∞"}
                    </b>
                  </div>
                );
              })}
            </div>
          )}

          {running && canManage && (
            <div className="bill-cancel-row">
              <span className="bill-sub">Need to step down?</span>
              <button
                className="secondary"
                onClick={() => cancelSubscription("at_period_end")}
                disabled={!!busy || subscription?.status !== "ACTIVE"}
              >
                {busy === "cancel-at_period_end" ? "Pausing…" : "Cancel at period end"}
              </button>
              <button
                className="ghost"
                onClick={() => cancelSubscription("immediate")}
                disabled={!!busy}
              >
                {busy === "cancel-immediate" ? "Cancelling…" : "Cancel now"}
              </button>
            </div>
          )}

          {state.billingEnabled && (
            <>
          <div className="price-toggle">
            <button
              className={period === "MONTHLY" ? "on" : ""}
              onClick={() => setPeriod("MONTHLY")}
            >
              Monthly
            </button>
            <button
              className={period === "YEARLY" ? "on" : ""}
              onClick={() => setPeriod("YEARLY")}
            >
              Yearly
            </button>
          </div>

          <PlanCards
            plans={plans}
            period={period}
            currentPlanCode={currentPlan?.code}
            onChoose={(plan) => startCheckout(plan.code)}
            busy={busy}
            canChoose={canManage}
          />

          {currentPlan && currentPlan.code !== "free" && canManage && (
            <div className="bill-cancel-row">
              <span className="bill-sub">Downgrade?</span>
              <button
                className="ghost"
                onClick={() => startCheckout("free")}
                disabled={!!busy}
              >
                {busy === "free" ? "Switching…" : "Switch to Free plan"}
              </button>
            </div>
          )}

          {phoneFor && (
            <form
              className="phone-row"
              onSubmit={(e) => {
                e.preventDefault();
                const digits = normalizePhone(phone);
                if (!/^[6-9]\d{9}$/.test(digits)) {
                  setMessage({ kind: "err", text: "Enter a valid 10-digit Indian mobile number." });
                  return;
                }
                const target = phoneFor;
                setPhoneFor("");
                void startCheckout(target);
              }}
            >
              <label>
                Mobile number for the mandate
                <input
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="9876543210"
                  inputMode="numeric"
                  maxLength={12}
                  autoFocus
                />
              </label>
              <button className="primary" type="submit" disabled={!!busy}>
                <Zap size={14} /> Continue to payment
              </button>
              <button className="ghost" type="button" onClick={() => setPhoneFor("")}>
                Cancel
              </button>
            </form>
          )}
            </>
          )}

          <div className="bill-payments">
            <div className="bill-section-title">
              <h3>Payment history</h3>
              <span>last {payments.length || 0} of 60</span>
            </div>
            {payments.length ? (
              <div className="bill-table">
                <div className="head bill-cols-pay">
                  <span>Date</span>
                  <span>Amount</span>
                  <span>Status</span>
                  <span>Method</span>
                </div>
                {payments.slice(0, 8).map((payment) => (
                  <div className="bill-cols-pay" key={payment.id}>
                    <span>{formatWhen(payment.createdAt)}</span>
                    <b>
                      {inr(payment.amount)}{" "}
                      <i className="bill-method">{payment.method || "—"}</i>
                    </b>
                    <span>
                      {statusPill(payment.status)}
                      {payment.failureReason && (
                        <i className="bad-text bill-reason">{payment.failureReason}</i>
                      )}
                    </span>
                    <span className="muted-text">
                      {payment.capturedAt ? formatWhen(payment.capturedAt) : "—"}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="bill-note">No payments on this workspace yet.</div>
            )}
          </div>
        </>
      )}
    </section>
  );
}

export function BillingAdminSection() {
  const [overview, setOverview] = useState<AdminOverview | null>(null);
  const [plans, setPlans] = useState<AdminPlan[]>([]);
  const [subscriptions, setSubscriptions] = useState<AdminSubscription[]>([]);
  const [settings, setSettings] = useState<AdminSettings | null>(null);
  const [payments, setPayments] = useState<(BillingPayment & { organizationName: string })[]>([]);
  const [webhooks, setWebhooks] = useState<WebhookRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState<Message>(null);

  const load = useCallback(async () => {
    try {
      const [ov, pl, subs, st, pay, hooks] = await Promise.all([
        api<AdminOverview>("/admin/billing/overview"),
        api<AdminPlan[]>("/admin/billing/plans"),
        api<AdminSubscription[]>("/admin/billing/subscriptions"),
        api<AdminSettings>("/admin/billing/settings"),
        api<(BillingPayment & { organizationName: string })[]>("/admin/billing/payments").catch(
          () => [],
        ),
        api<WebhookRow[]>("/admin/billing/webhooks").catch(() => []),
      ]);
      setOverview(ov);
      setPlans(pl);
      setSubscriptions(subs);
      setSettings(st);
      setPayments(pay);
      setWebhooks(hooks);
    } catch (e) {
      setMessage({ kind: "err", text: readError(e, "Could not load billing administration") });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function toggleEnforcement() {
    if (!settings || busy) return;
    setBusy("toggle");
    try {
      const next = await api<AdminSettings>("/admin/billing/settings", {
        method: "PUT",
        body: JSON.stringify({ billingEnabled: !settings.billingEnabled }),
      });
      setSettings(next);
      setMessage({
        kind: "ok",
        text: next.billingEnabled
          ? "Plan limits are now enforced across every workspace."
          : "Billing bypass enabled — every workspace has full access.",
      });
      await load();
    } catch (e) {
      setMessage({ kind: "err", text: readError(e, "Could not update the billing setting") });
    } finally {
      setBusy("");
    }
  }

  async function patchPlan(planId: string, body: Record<string, unknown>, label: string) {
    setBusy(`plan-${planId}`);
    try {
      await api(`/admin/billing/plans/${planId}`, { method: "PATCH", body: JSON.stringify(body) });
      setMessage({ kind: "ok", text: `Plan ${label} updated.` });
      await load();
    } catch (e) {
      setMessage({ kind: "err", text: readError(e, "Could not update the plan") });
    } finally {
      setBusy("");
    }
  }

  async function subscriptionAction(subscriptionId: string, action: "cancel" | "sync") {
    setBusy(`${action}-${subscriptionId}`);
    try {
      await api(`/admin/billing/subscriptions/${subscriptionId}/action`, {
        method: "POST",
        body: JSON.stringify({ action }),
      });
      setMessage({
        kind: "ok",
        text: action === "cancel" ? "Subscription cancelled at the gateway." : "Subscription synced with Cashfree.",
      });
      await load();
    } catch (e) {
      setMessage({ kind: "err", text: readError(e, "Subscription action failed") });
    } finally {
      setBusy("");
    }
  }

  async function setSubscriptionStatus(subscriptionId: string, status: string) {
    setBusy(`status-${subscriptionId}`);
    try {
      await api(`/admin/billing/subscriptions/${subscriptionId}`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      });
      setMessage({ kind: "ok", text: `Subscription status forced to ${status.toLowerCase()}.` });
      await load();
    } catch (e) {
      setMessage({ kind: "err", text: readError(e, "Could not change the status") });
    } finally {
      setBusy("");
    }
  }

  if (loading) {
    return (
      <section className="panel">
        <PanelHead icon={IndianRupee} title="Billing administration" sub="Loading billing data…" />
      </section>
    );
  }

  const statusRows = Object.entries(overview?.subscriptionCounts ?? {});
  const webhookRows = Object.entries(overview?.webhookCounts ?? {});

  return (
    <>
      <section className="panel">
        <PanelHead
          icon={IndianRupee}
          title="Billing administration"
          sub="Global enforcement, plans, subscriptions and gateway health"
        />
        {message && <Banner message={message} onClose={() => setMessage(null)} />}
        <div className="toggle-row">
          <div>
            <b>Subscription enforcement</b>
            <span>
              {settings?.billingEnabled
                ? "Plan limits are active — free workspaces are capped."
                : "Bypass mode — every workspace has full access."}{" "}
              {overview?.configured
                ? `Gateway: ${overview.provider} (${overview.environment})`
                : "Gateway credentials missing"}
            </span>
          </div>
          <button
            className={`switch ${settings?.billingEnabled ? "on" : ""}`}
            onClick={toggleEnforcement}
            disabled={busy === "toggle"}
            aria-label="Toggle subscription enforcement"
          >
            <i />
          </button>
        </div>
        <div className="bill-summary">
          <div>
            <span>MRR</span>
            <b>{inr(overview?.mrr ?? 0)}</b>
          </div>
          <div>
            <span>Active subscriptions</span>
            <b>{overview?.subscriptionCounts?.ACTIVE ?? 0}</b>
          </div>
          <div>
            <span>Needs attention</span>
            <b>
              {(overview?.subscriptionCounts?.PENDING ?? 0) +
                (overview?.subscriptionCounts?.HALTED ?? 0)}
            </b>
          </div>
          <div>
            <span>Captured payments</span>
            <b>
              {inr(overview?.payments?.find((p) => p.status === "CAPTURED")?.totalAmount ?? 0)}
            </b>
          </div>
          <div>
            <span>Webhooks</span>
            <b>
              {webhookRows.length
                ? webhookRows.map(([key, value]) => `${value} ${key.toLowerCase()}`).join(" · ")
                : "none yet"}
            </b>
          </div>
          <div>
            <span>Subscription mix</span>
            <b>
              {statusRows.length
                ? statusRows.map(([key, value]) => `${value} ${key.toLowerCase()}`).join(" · ")
                : "none yet"}
            </b>
          </div>
        </div>
      </section>

      <section className="panel">
        <PanelHead
          icon={ShieldCheck}
          title="Plans"
          sub="Prices are in rupees; changing a price resets the Cashfree plan id"
        />
        <div className="bill-table">
          <div className="head bill-cols-plans">
            <span>Plan</span>
            <span>Monthly ₹</span>
            <span>Yearly ₹</span>
            <span>Limits</span>
            <span>Active</span>
          </div>
          {plans.map((plan) => (
            <div className="bill-cols-plans" key={plan.id}>
              <span>
                <b>{plan.name}</b>
                <i className="bill-method">{plan.code}</i>
              </span>
              <input
                type="number"
                min={0}
                defaultValue={Math.round(plan.priceMonthly / 100)}
                disabled={busy === `plan-${plan.id}`}
                onBlur={(e) => {
                  const rupees = Math.max(0, Math.round(Number(e.target.value)));
                  if (rupees * 100 !== plan.priceMonthly) {
                    void patchPlan(plan.id, { priceMonthly: rupees * 100 }, plan.code);
                  }
                }}
              />
              <input
                type="number"
                min={0}
                defaultValue={Math.round(plan.priceYearly / 100)}
                disabled={busy === `plan-${plan.id}`}
                onBlur={(e) => {
                  const rupees = Math.max(0, Math.round(Number(e.target.value)));
                  if (rupees * 100 !== plan.priceYearly) {
                    void patchPlan(plan.id, { priceYearly: rupees * 100 }, plan.code);
                  }
                }}
              />
              <span className="bill-limits">
                {limitText(plan.maxAgents, "agents")} ·{" "}
                {limitText(plan.maxTicketsPerMonth, "tickets")}
              </span>
              <input
                type="checkbox"
                checked={plan.active}
                disabled={busy === `plan-${plan.id}`}
                onChange={(e) => void patchPlan(plan.id, { active: e.target.checked }, plan.code)}
                aria-label={`Toggle ${plan.name}`}
              />
            </div>
          ))}
        </div>
      </section>

      <section className="panel">
        <PanelHead
          icon={RefreshCw}
          title="Subscriptions"
          sub="Latest 100 subscriptions across every workspace"
        />
        <div className="bill-table">
          <div className="head bill-cols-subs">
            <span>Workspace</span>
            <span>Plan</span>
            <span>Status</span>
            <span>Amount</span>
            <span>Actions</span>
          </div>
          {subscriptions.map((subscription) => (
            <div className="bill-cols-subs" key={subscription.id}>
              <span>
                <b>{subscription.organizationName}</b>
                <i className="bill-method">{subscription.providerSubscriptionId.slice(0, 24)}</i>
              </span>
              <span>
                {subscription.planName || subscription.planCode || "—"} · {subscription.period}
              </span>
              <select
                value={subscription.status}
                disabled={busy === `status-${subscription.id}`}
                onChange={(e) => void setSubscriptionStatus(subscription.id, e.target.value)}
              >
                {["ACTIVE", "PENDING", "HALTED", "PAUSED", "CANCELLED", "COMPLETED", "EXPIRED"].map(
                  (status) => (
                    <option key={status} value={status}>
                      {status}
                    </option>
                  ),
                )}
              </select>
              <b>
                {inr(subscription.amount)}{" "}
                <i className="bill-method">
                  {subscription.currentPeriodEnd
                    ? `until ${formatWhen(subscription.currentPeriodEnd)}`
                    : "no period"}
                </i>
              </b>
              <span className="bill-actions">
                <button
                  className="ghost"
                  disabled={busy === `sync-${subscription.id}`}
                  onClick={() => void subscriptionAction(subscription.id, "sync")}
                >
                  Sync
                </button>
                <button
                  className="ghost"
                  disabled={busy === `cancel-${subscription.id}`}
                  onClick={() => void subscriptionAction(subscription.id, "cancel")}
                >
                  Cancel
                </button>
              </span>
            </div>
          ))}
          {!subscriptions.length && <div className="bill-note">No subscriptions yet.</div>}
        </div>
      </section>

      <div className="layout-2">
        <section className="panel">
          <PanelHead icon={CreditCard} title="Recent payments" sub="Newest 40 across all plans" />
          <div className="bill-table">
            <div className="head bill-cols-pay">
              <span>Date</span>
              <span>Amount</span>
              <span>Status</span>
              <span>Workspace</span>
            </div>
            {payments.slice(0, 40).map((payment) => (
              <div className="bill-cols-pay" key={payment.id}>
                <span>{formatWhen(payment.createdAt)}</span>
                <b>{inr(payment.amount)}</b>
                <span>{statusPill(payment.status)}</span>
                <span className="muted-text">{payment.organizationName || "unknown"}</span>
              </div>
            ))}
            {!payments.length && <div className="bill-note">No payments recorded yet.</div>}
          </div>
        </section>
        <section className="panel">
          <PanelHead
            icon={RefreshCw}
            title="Webhook deliveries"
            sub="Cashfree events with idempotency and retry status"
          />
          <div className="bill-table">
            <div className="head bill-cols-hooks">
              <span>Received</span>
              <span>Event</span>
              <span>Status</span>
            </div>
            {webhooks.map((hook) => (
              <div className="bill-cols-hooks" key={hook.eventId} title={hook.error || undefined}>
                <span>{formatWhen(hook.receivedAt)}</span>
                <span>{hook.eventType}</span>
                <span>{hookPill(hook.status)}</span>
              </div>
            ))}
            {!webhooks.length && <div className="bill-note">No webhook deliveries yet.</div>}
          </div>
        </section>
      </div>
    </>
  );
}

export function EvalLockBanner({ onUpgrade }: { onUpgrade: () => void }) {
  return (
    <div className="bill-banner bad">
      <span className="bill-banner-icon">
        <AlertTriangle size={15} />
      </span>
      <span className="bill-banner-text">
        Analytics is not included in your current plan — upgrade in Settings → Billing to run
        evaluation suites.
      </span>
      <button className="secondary" onClick={onUpgrade}>
        Open billing
      </button>
    </div>
  );
}

export function BillingStatusNote({ children }: { children: ReactNode }) {
  return <div className="bill-note">{children}</div>;
}
