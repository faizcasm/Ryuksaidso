import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, CircleHelp } from "lucide-react";
import FaqExplorer from "@/components/Faq";
import { FAQ_ITEMS } from "@/lib/faq";

export const metadata: Metadata = {
  title: "FAQ",
  description:
    "Answers to 60+ frequently asked questions about RYUKSAIDSO — what the agent control plane is, who founded it, traces, approvals, integrations, model providers, pricing, security and support.",
  alternates: { canonical: "/faq" },
};

const jsonLd = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: FAQ_ITEMS.map((item) => ({
    "@type": "Question",
    name: item.q,
    acceptedAnswer: {
      "@type": "Answer",
      text: item.link ? `${item.a} ${item.link.label}: ${item.link.href}` : item.a,
    },
  })),
};

export default function FaqPage() {
  return (
    <div className="pricing-page">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
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

      <article className="legal-doc faq-doc">
        <span className="eyebrow">
          <CircleHelp size={12} /> FAQ
        </span>
        <h1>Frequently asked questions</h1>
        <p className="legal-intro">
          Everything worth knowing about RYUKSAIDSO — the product, the founder,
          how traces and approvals work, which integrations and model providers
          are supported, what it costs and how to get help. {FAQ_ITEMS.length}{" "}
          answers, searchable below.
        </p>

        <FaqExplorer />
      </article>

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
