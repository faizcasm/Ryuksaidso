import type { Metadata } from "next";
import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowRight, ShieldCheck } from "lucide-react";
import { SITE_NAME } from "@/lib/site";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description:
    "How RYUKSAIDSO collects, uses, stores and protects your personal information — accounts, agent runs, connected integrations, payments and your privacy rights.",
  alternates: { canonical: "/privacy" },
  openGraph: {
    url: "/privacy",
    title: `Privacy Policy · ${SITE_NAME}`,
    description:
      "How RYUKSAIDSO collects, uses, stores and protects your personal information — accounts, agent runs, connected integrations, payments and your privacy rights.",
  },
};

function Section({
  n,
  title,
  children,
}: {
  n: number;
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="legal-section">
      <h2>
        <span>{n}</span>
        {title}
      </h2>
      {children}
    </section>
  );
}

export default function PrivacyPage() {
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

      <article className="legal-doc">
        <span className="eyebrow">
          <ShieldCheck size={12} /> PRIVACY POLICY
        </span>
        <h1>Privacy Policy</h1>
        <p className="legal-updated">Last updated: October 2, 2026</p>
        <p className="legal-intro">
          This policy explains how RYUKSAIDSO (&quot;we&quot;, &quot;us&quot;)
          collects, uses and protects your personal information when you use
          our agent control plane and related services. By using the service
          you agree to the practices described here. If you do not agree,
          please do not use the service.
        </p>

        <Section n={1} title="Information we collect">
          <ul>
            <li>
              <b>Account data</b> — your name, email address, hashed password,
              workspace membership and role.
            </li>
            <li>
              <b>Workspace content</b> — the agents, prompts, evaluations,
              documents you upload for knowledge sync, chat-widget
              conversations and other content you create inside a workspace.
            </li>
            <li>
              <b>Run data</b> — agent run inputs and outputs, traces, steps,
              tool calls and timings, which power the platform&apos;s tracing,
              approval and reliability features.
            </li>
            <li>
              <b>Integration data</b> — OAuth access and refresh tokens for the
              third-party accounts you choose to connect, plus the data those
              connections return while syncing or running tools.
            </li>
            <li>
              <b>Support messages</b> — messages you send through the in-app
              customer support channel, together with your name, email and
              workspace so we can reply.
            </li>
            <li>
              <b>Payment data</b> — plan, subscription status, invoices and
              payment confirmations processed by our payment provider. Card,
              UPI and net-banking credentials never touch our servers.
            </li>
            <li>
              <b>Technical data</b> — request logs, IP address, browser user
              agent, timestamps and error traces used for security, rate
              limiting and debugging.
            </li>
          </ul>
        </Section>

        <Section n={2} title="How we use your information">
          <ul>
            <li>
              Provide and operate the service: authentication, workspaces,
              agent runs, traces, approvals and evaluations.
            </li>
            <li>
              Secure the service: session validation, CSRF protection, rate
              limiting, abuse prevention and audit logging.
            </li>
            <li>
              Send transactional email — email verification, password resets
              and billing notices.
            </li>
            <li>
              Manage subscriptions, process payments and keep required billing
              records.
            </li>
            <li>
              Answer your support messages and improve the product based on
              feedback.
            </li>
          </ul>
          <p>
            We do <b>not</b> sell your personal data, and we do not use your
            workspace content to train AI models.
          </p>
        </Section>

        <Section n={3} title="AI model processing">
          <p>
            To execute agents, the relevant prompt content — including data
            pulled from connected integrations or uploaded documents — is sent
            to the model provider configured for your workspace. That is the
            default OmniRoute gateway, a local Ollama instance, or a custom
            model endpoint added by a workspace admin. Those providers process
            the content under their own privacy policies.
          </p>
          <p>
            Model responses are stored as part of your run history so traces,
            evaluations and rollbacks work as designed.
          </p>
        </Section>

        <Section n={4} title="Integrations and connected accounts">
          <p>
            Third-party connections (such as Gmail, Google Drive, Slack,
            Notion, GitHub and others) use OAuth 2.0 — you approve the requested
            scopes on the provider&apos;s own consent screen and we never see
            or store your third-party password. We store the resulting tokens
            encrypted at rest and only use them to sync content and run the
            tools you enable.
          </p>
          <p>
            You can disconnect an integration at any time from Integrations,
            which deletes its stored credentials and stops further syncing.
          </p>
        </Section>

        <Section n={5} title="Payments">
          <p>
            Checkout happens on our payment provider&apos;s (Cashfree) hosted
            page. We receive confirmation of the transaction — reference IDs,
            amount, status and plan — but never your card number, UPI PIN or
            banking password.
          </p>
        </Section>

        <Section n={6} title="Cookies and local storage">
          <ul>
            <li>
              <b>Essential cookies</b> — access, refresh and CSRF cookies that
              keep you signed in and protect form submissions. The service
              cannot function without them.
            </li>
            <li>
              <b>Local storage</b> — your theme preference (dark / light /
              system) is stored in your browser only.
            </li>
          </ul>
          <p>
            We do not use advertising or cross-site tracking cookies.
          </p>
        </Section>

        <Section n={7} title="Who we share data with">
          <p>We share data only with the subprocessors needed to run the service:</p>
          <ul>
            <li>
              <b>Cloud hosting (AWS)</b> — where the application, database and
              logs live.
            </li>
            <li>
              <b>Cashfree</b> — payment processing and webhooks.
            </li>
            <li>
              <b>Model providers</b> — the OmniRoute gateway, Ollama, or any
              custom endpoint your workspace admin configures, solely to
              execute runs (see section 3).
            </li>
            <li>
              <b>Transactional email provider</b> — verification and reset
              emails.
            </li>
            <li>
              <b>Connected app providers</b> — only when you explicitly connect
              an integration.
            </li>
          </ul>
          <p>
            We may also disclose information if required by law or to protect
            the rights, safety and property of our users or the public. We do
            not sell data to anyone.
          </p>
        </Section>

        <Section n={8} title="Data retention and deletion">
          <p>
            We keep your information for as long as your account is active so
            the workspace functions — runs, traces and documents stay available
            to your team. When you delete content or close an account, we
            remove the corresponding personal data from active systems within a
            reasonable period, except records (such as invoices) we must retain
            to comply with legal, tax or accounting obligations.
          </p>
          <p>
            Request deletion any time by contacting us at the address below —
            account deletion is honored for every workspace owner.
          </p>
        </Section>

        <Section n={9} title="Security">
          <p>
            Data is encrypted in transit with TLS. Integration credentials and
            custom model-provider API keys are encrypted at rest with
            AES-256-GCM, passwords are stored only as salted bcrypt hashes and
            platform API keys are stored as hashes. Access to production
            infrastructure is restricted, logged and audited.
          </p>
          <p>
            No system is perfectly secure — if we learn of a breach affecting
            your personal data, we will notify you and the relevant authorities
            as required by law.
          </p>
        </Section>

        <Section n={10} title="Your rights">
          <p>
            Depending on where you live (including under India&apos;s Digital
            Personal Data Protection Act, the GDPR and similar laws), you may
            have the right to access, correct, export or delete your personal
            data, withdraw consent, and object to or restrict certain
            processing.
          </p>
          <p>
            To exercise any of these rights, contact us at{" "}
            <a href="mailto:faizanhameed690@gmail.com">
              faizanhameed690@gmail.com
            </a>{" "}
            or through the in-app support channel. We respond to verified
            requests within the timeframe required by applicable law.
          </p>
        </Section>

        <Section n={11} title="Children&apos;s privacy">
          <p>
            The service is built for professional and organizational use and
            is not directed at children under 16. We do not knowingly collect
            personal information from children — if you believe a child has
            provided us data, contact us and we will delete it.
          </p>
        </Section>

        <Section n={12} title="Changes to this policy">
          <p>
            We may update this policy from time to time. The &quot;Last
            updated&quot; date at the top always reflects the latest revision,
            and material changes will be announced in the app or by email.
            Continued use of the service after an update means you accept the
            revised policy.
          </p>
        </Section>

        <Section n={13} title="Contact us">
          <p>
            Questions about this policy or your data? Reach the founder
            directly — RYUKSAIDSO is operated by Faizan Hameed.
          </p>
          <p>
            Email:{" "}
            <a href="mailto:faizanhameed690@gmail.com">
              faizanhameed690@gmail.com
            </a>{" "}
            · In-app: the support icon in the top bar sends a message straight
            to the CEO.
          </p>
        </Section>
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
