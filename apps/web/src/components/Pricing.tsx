"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, CreditCard, Sparkles } from "lucide-react";
import { api } from "../lib/api";
import { PlanCards, type BillingPlan } from "./Billing";

const METHOD_NOTES = [
  "UPI, Google Pay, PhonePe and Paytm",
  "Credit and debit cards",
  "Net banking via netc-fast",
  "Recurring monthly or yearly mandates",
];

export default function PricingView() {
  const [plans, setPlans] = useState<BillingPlan[] | null>(null);
  const [error, setError] = useState("");
  const [period, setPeriod] = useState<"MONTHLY" | "YEARLY">("MONTHLY");

  useEffect(() => {
    api<{ plans: BillingPlan[] }>("/billing/plans")
      .then((response) => setPlans(response.plans))
      .catch((e) =>
        setError(
          e instanceof Error && e.message.trim()
            ? e.message.trim()
            : "Could not load plans right now",
        ),
      );
  }, []);

  return (
    <div className="pricing-page">
      <header className="pricing-nav">
        <Link href="/" className="pricing-brand">
          <b>RYUKSAIDSO</b>
          <small>agent control plane</small>
        </Link>
        <nav>
          <Link href="/docs">Docs</Link>
          <Link href="/architecture">Architecture</Link>
          <Link href="/playground">Playground</Link>
        </nav>
        <div className="pricing-actions">
          <Link href="/auth" className="ghost">
            Sign in
          </Link>
          <Link href="/auth" className="primary">
            Get started <ArrowRight size={15} />
          </Link>
        </div>
      </header>

      <section className="pricing-hero">
        <div>
          <span className="eyebrow">
            <Sparkles size={12} /> PRICING
          </span>
          <h1>
            Start free. Upgrade when the
            <span className="grad"> workload</span> does.
          </h1>
          <p>
            Every plan ships the full control plane — tickets, agents, durable
            traces, approvals and policy gates. Paid plans raise the limits and
            unlock the API and analytics.
          </p>
        </div>
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
      </section>

      {error && (
        <div className="bill-banner bad">
          <span className="bill-banner-icon">
            <ArrowRight size={15} />
          </span>
          <span className="bill-banner-text">{error}</span>
        </div>
      )}
      {!plans && !error && <div className="bill-note">Loading plans…</div>}

      {plans && (
        <PlanCards
          plans={plans}
          period={period}
          includeFree
        />
      )}

      <section className="panel pricing-notes">
        <div className="panel-header">
          <div className="panel-icon">
            <CreditCard size={16} />
          </div>
          <div>
            <h2>Payments in India, handled by Cashfree</h2>
            <p>
              Checkout happens on Cashfree&apos;s hosted page — card and mandate
              details never touch our servers.
            </p>
          </div>
        </div>
        <ul className="pricing-methods">
          {METHOD_NOTES.map((note) => (
            <li key={note}>{note}</li>
          ))}
        </ul>
        <p className="pricing-fine">
          Prices are in INR and include GST where applicable. Subscriptions
          renew automatically until cancelled — cancel any time from Settings →
          Billing. Limits reset every billing month; hitting a limit never
          deletes existing data.
        </p>
      </section>

      <footer className="pricing-footer">
        <span>RYUKSAIDSO — agent reliability &amp; control plane</span>
        <nav>
          <Link href="/docs">Docs</Link>
          <Link href="/architecture">Architecture</Link>
          <Link href="/auth">Sign in</Link>
        </nav>
      </footer>
    </div>
  );
}
