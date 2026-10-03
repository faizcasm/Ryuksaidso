"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import icon from "../app/icon.png";
import {
  ArrowRight,
  BarChart3,
  Bot,
  Check,
  CheckCircle2,
  Copy,
  Database,
  Facebook,
  FileSearch,
  GitBranch,
  Instagram,
  Layers3,
  Linkedin,
  Menu,
  Play,
  ShieldCheck,
  Sparkles,
  TestTube2,
  Twitter,
  Workflow,
  X,
  Zap,
} from "lucide-react";
import { FOUNDER_URL, SOCIALS } from "@/lib/site";

const SOCIAL_ICONS: Record<string, typeof Instagram> = {
  Instagram,
  Facebook,
  X: Twitter,
  LinkedIn: Linkedin,
};

function HeroCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let width = 0;
    let height = 0;
    let dpr = 1;
    let raf = 0;

    const t = (1 + Math.sqrt(5)) / 2;
    const base: Array<[number, number, number]> = [
      [-1, t, 0], [1, t, 0], [-1, -t, 0], [1, -t, 0],
      [0, -1, t], [0, 1, t], [0, -1, -t], [0, 1, -t],
      [t, 0, -1], [t, 0, 1], [-t, 0, -1], [-t, 0, 1],
    ];
    const verts = base.map(([x, y, z]) => {
      const len = Math.hypot(x, y, z);
      return { x: x / len, y: y / len, z: z / len };
    });
    const edges: Array<[number, number]> = [];
    for (let i = 0; i < verts.length; i++) {
      for (let j = i + 1; j < verts.length; j++) {
        const d = Math.hypot(
          verts[i].x - verts[j].x,
          verts[i].y - verts[j].y,
          verts[i].z - verts[j].z,
        );
        if (d < 1.1) edges.push([i, j]);
      }
    }

    const stars = Array.from({ length: 220 }, () => ({
      x: (Math.random() - 0.5) * 1600,
      y: (Math.random() - 0.5) * 1200,
      z: Math.random() * 960 + 40,
      s: Math.random() * 1.4 + 0.5,
    }));

    const rings = [
      { r: 250, tiltX: 0.5, tiltZ: 0.15, speed: 0.00022, phase: 0 },
      { r: 320, tiltX: -0.35, tiltZ: 0.6, speed: -0.00016, phase: 2.1 },
      { r: 395, tiltX: 1.15, tiltZ: -0.4, speed: 0.00011, phase: 4.2 },
    ];

    let pointerX = 0;
    let pointerY = 0;
    let targetX = 0;
    let targetY = 0;

    const onPointer = (e: PointerEvent) => {
      targetX = (e.clientX / window.innerWidth - 0.5) * 2;
      targetY = (e.clientY / window.innerHeight - 0.5) * 2;
    };
    window.addEventListener("pointermove", onPointer, { passive: true });

    const resize = () => {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = canvas.clientWidth;
      height = canvas.clientHeight;
      canvas.width = Math.max(1, Math.floor(width * dpr));
      canvas.height = Math.max(1, Math.floor(height * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener("resize", resize);

    const project = (
      p: { x: number; y: number; z: number },
      cx: number,
      cy: number,
      scale: number,
    ) => {
      const depth = Math.max(80, 760 - p.z);
      const k = (520 / depth) * scale;
      return { x: cx + p.x * k, y: cy + p.y * k, k, depth };
    };

    const rotate = (
      v: { x: number; y: number; z: number },
      ax: number,
      ay: number,
    ) => {
      const cosY = Math.cos(ay);
      const sinY = Math.sin(ay);
      let x = v.x * cosY - v.z * sinY;
      let z = v.x * sinY + v.z * cosY;
      const cosX = Math.cos(ax);
      const sinX = Math.sin(ax);
      let y = v.y * cosX - z * sinX;
      z = v.y * sinX + z * cosX;
      return { x, y, z };
    };

    const draw = (time: number) => {
      pointerX += (targetX - pointerX) * 0.05;
      pointerY += (targetY - pointerY) * 0.05;

      const cx = width / 2;
      const cy = height * 0.52;
      const scale = Math.min(width, height) / 760;

      ctx.clearRect(0, 0, width, height);

      const glow = ctx.createRadialGradient(cx, cy, 0, cx, cy, 460 * scale);
      glow.addColorStop(0, "rgba(139,92,246,0.16)");
      glow.addColorStop(0.45, "rgba(34,211,238,0.05)");
      glow.addColorStop(1, "rgba(8,10,15,0)");
      ctx.fillStyle = glow;
      ctx.fillRect(0, 0, width, height);

      for (const s of stars) {
        if (!reduced) {
          s.z -= 1.6;
          if (s.z <= 30) {
            s.z = 1000;
            s.x = (Math.random() - 0.5) * 1600;
            s.y = (Math.random() - 0.5) * 1200;
          }
        }
        const depth = Math.max(40, 1000 - s.z);
        const k = 340 / depth;
        const px = cx + s.x * k * 0.9;
        const py = cy + s.y * k * 0.9;
        if (px < -20 || px > width + 20 || py < -20 || py > height + 20) continue;
        const alpha = Math.min(0.75, (1000 - s.z) / 1100);
        ctx.fillStyle = `rgba(180,205,255,${alpha})`;
        ctx.beginPath();
        ctx.arc(px, py, Math.max(0.5, s.s * k), 0, Math.PI * 2);
        ctx.fill();
      }

      rings.forEach((ring, idx) => {
        const phase = ring.phase + (reduced ? 0 : time * ring.speed);
        ctx.beginPath();
        for (let a = 0; a <= 64; a++) {
          const ang = (a / 64) * Math.PI * 2;
          let p = {
            x: Math.cos(ang) * ring.r,
            y: Math.sin(ang) * ring.r,
            z: 0,
          };
          p = rotate(p, ring.tiltX + pointerY * 0.12, ring.tiltZ + phase);
          const pr = project(p, cx, cy, scale);
          if (a === 0) ctx.moveTo(pr.x, pr.y);
          else ctx.lineTo(pr.x, pr.y);
        }
        ctx.strokeStyle =
          idx % 2 === 0 ? "rgba(139,92,246,0.22)" : "rgba(34,211,238,0.18)";
        ctx.lineWidth = 1;
        ctx.stroke();

        let sat = {
          x: Math.cos(phase * 3 + idx) * ring.r,
          y: Math.sin(phase * 3 + idx) * ring.r,
          z: 0,
        };
        sat = rotate(sat, ring.tiltX + pointerY * 0.12, ring.tiltZ + phase);
        const sp = project(sat, cx, cy, scale);
        ctx.fillStyle = idx % 2 === 0 ? "#a78bfa" : "#67e8f9";
        ctx.beginPath();
        ctx.arc(sp.x, sp.y, 3.2, 0, Math.PI * 2);
        ctx.fill();
      });

      const ay = (reduced ? 0.6 : time * 0.00028) + pointerX * 0.5;
      const ax = (reduced ? 0.35 : Math.sin(time * 0.00021) * 0.5) + pointerY * 0.35;
      const radius = 210;

      const transformed = verts.map(v =>
        rotate({ x: v.x * radius, y: v.y * radius, z: v.z * radius }, ax, ay),
      );
      const projected = transformed.map(v => project(v, cx, cy, scale));

      edges.forEach(([i, j]) => {
        const a = projected[i];
        const b = projected[j];
        const depth = (a.depth + b.depth) / 2;
        const closeness = Math.min(1, Math.max(0, (760 - depth) / 420));
        const grad = ctx.createLinearGradient(a.x, a.y, b.x, b.y);
        grad.addColorStop(0, `rgba(139,92,246,${0.2 + closeness * 0.75})`);
        grad.addColorStop(1, `rgba(34,211,238,${0.16 + closeness * 0.6})`);
        ctx.strokeStyle = grad;
        ctx.lineWidth = 0.7 + closeness * 1.5;
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
      });

      projected.forEach((p, i) => {
        const closeness = Math.min(1, Math.max(0, (760 - p.depth) / 420));
        const r = 1.6 + closeness * 3.4;
        ctx.fillStyle = `rgba(226,232,255,${0.35 + closeness * 0.6})`;
        ctx.beginPath();
        ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
        ctx.fill();
        if (i % 5 === 0) {
          ctx.fillStyle = `rgba(139,92,246,${0.12 + closeness * 0.2})`;
          ctx.beginPath();
          ctx.arc(p.x, p.y, r * 3.2, 0, Math.PI * 2);
          ctx.fill();
        }
      });

      const pulse = 0.5 + Math.sin(time * 0.0016) * 0.5;
      const core = ctx.createRadialGradient(cx, cy, 0, cx, cy, 90 * scale);
      core.addColorStop(0, `rgba(139,92,246,${0.28 + pulse * 0.18})`);
      core.addColorStop(0.5, `rgba(34,211,238,${0.08 + pulse * 0.08})`);
      core.addColorStop(1, "rgba(8,10,15,0)");
      ctx.fillStyle = core;
      ctx.beginPath();
      ctx.arc(cx, cy, 90 * scale, 0, Math.PI * 2);
      ctx.fill();

      if (!reduced) raf = requestAnimationFrame(draw);
    };

    raf = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      window.removeEventListener("pointermove", onPointer);
    };
  }, []);

  return <canvas ref={canvasRef} className="hero-canvas" aria-hidden="true" />;
}

const FEATURES = [
  {
    icon: ShieldCheck,
    title: "Approval gates",
    copy: "Human-in-the-loop checkpoints pause every risky side effect until someone signs off.",
  },
  {
    icon: Workflow,
    title: "Durable traces",
    copy: "Each run persists planner, tool and synthesis steps with timing and token usage.",
  },
  {
    icon: TestTube2,
    title: "Evaluation suites",
    copy: "Regression datasets score every agent version so changes ship with evidence.",
  },
  {
    icon: Database,
    title: "Knowledge base",
    copy: "Postgres full-text retrieval grounds answers in your own documents and tickets.",
  },
  {
    icon: GitBranch,
    title: "Versioned agents",
    copy: "Draft, publish and roll back agent versions with changelogs and production pins.",
  },
  {
    icon: Zap,
    title: "Multi-provider LLMs",
    copy: "Route across Ollama and OmniRoute with automatic retries and failover built in.",
  },
];

const SHOWCASE = [
  {
    href: "/architecture",
    icon: Layers3,
    label: "Architecture",
    title: "Explore the system in 3D",
    copy: "Rotate a live diagram of every service, queue and data path in the platform.",
  },
  {
    href: "/docs",
    icon: FileSearch,
    label: "Documentation",
    title: "Read the full docs",
    copy: "Guides for runs, approvals, policies, evaluations and the HTTP API.",
  },
  {
    href: "/playground",
    icon: Play,
    label: "Playground",
    title: "Open the live playground",
    copy: "Queue a run, watch the trace stream in, then approve or reject it yourself.",
  },
];

const STATS = [
  { value: "99.9%", label: "Target uptime" },
  { value: "<8s", label: "Median run" },
  { value: "2", label: "LLM providers" },
  { value: "100%", label: "Runs traced" },
];

const TOUR_TABS = [
  { id: "traces", label: "Durable traces", icon: Workflow },
  { id: "approvals", label: "Approval gates", icon: ShieldCheck },
  { id: "evaluations", label: "Evaluations", icon: TestTube2 },
] as const;

type TourTabId = (typeof TOUR_TABS)[number]["id"];

const TRACE_STEPS = [
  {
    icon: Layers3,
    name: "plan",
    detail: "Classify request → choose tools → draft execution plan",
    ms: "120 ms",
    tok: "214 tok",
    tone: "ok",
  },
  {
    icon: Database,
    name: "search_knowledge",
    detail: "3 chunks · incident-runbook.md, sso-faq.md",
    ms: "840 ms",
    tok: "402 tok",
    tone: "ok",
  },
  {
    icon: ShieldCheck,
    name: "ticket:write",
    detail: "gated by policy “high-risk write” → human approved",
    ms: "+2m 04s",
    tok: "—",
    tone: "gate",
  },
  {
    icon: Zap,
    name: "synthesize",
    detail: "Final answer with cited evidence · confidence 0.91",
    ms: "1.1 s",
    tok: "668 tok",
    tone: "ok",
  },
];

const EVAL_ROWS = [
  { id: "billing-01", input: "I was charged twice this month", pass: true },
  { id: "auth-01", input: "I cannot sign in after the SSO change", pass: true },
  { id: "refund-01", input: "Where is my refund from order 8812?", pass: true },
  { id: "export-01", input: "Export all invoices as CSV", pass: false },
];

const FLOW_STEPS = [
  {
    icon: Bot,
    title: "Define an agent",
    copy: "Instructions, tool allowlist and knowledge scope. Save a draft, iterate freely.",
  },
  {
    icon: Play,
    title: "Trigger a run",
    copy: "From the Run Lab, CI, a webhook or the API. Runs are queued as durable jobs.",
  },
  {
    icon: ShieldCheck,
    title: "Gate the side effects",
    copy: "Policies pause risky tool calls until a human approves — or reject them outright.",
  },
  {
    icon: BarChart3,
    title: "Ship with evidence",
    copy: "Every step, token and decision is stored, scored and replayable against evals.",
  },
];

const RUN_SNIPPET = `curl -X POST https://ryuksaidso.faizcasm.me/api/control/runs \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer rsk_live_..." \\
  -d '{
    "agentId": "clx_agent_42",
    "prompt": "Investigate the authentication incident and use internal evidence.",
    "environment": "staging",
    "trigger": "ci"
  }'`;

function CopySnippet({ label, code }: { label: string; code: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="snippet" data-reveal>
      <div className="snippet-head">
        <span className="snippet-label">{label}</span>
        <button
          type="button"
          className="snippet-copy"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(code);
              setCopied(true);
              window.setTimeout(() => setCopied(false), 1800);
            } catch {
              setCopied(false);
            }
          }}
        >
          {copied ? <Check size={13} /> : <Copy size={13} />}
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <pre>
        <code>{code}</code>
      </pre>

      <style jsx>{`
        .snippet {
          display: flex;
          flex-direction: column;
          border: 1px solid var(--line);
          border-radius: 16px;
          overflow: hidden;
          background: #0a0d12;
          height: 100%;
        }
        .snippet-head {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
          padding: 10px 14px;
          border-bottom: 1px solid var(--line);
          background: rgba(255, 255, 255, 0.03);
        }
        .snippet-label {
          font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
          font-size: 11px;
          letter-spacing: 0.06em;
          color: var(--muted);
        }
        .snippet-copy {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          font-size: 11px;
          font-weight: 700;
          font-family: inherit;
          color: var(--muted);
          background: rgba(255, 255, 255, 0.05);
          border: 1px solid var(--line);
          border-radius: 99px;
          padding: 5px 11px;
          cursor: pointer;
          transition: color 0.2s, border-color 0.2s, background 0.2s;
        }
        .snippet-copy:hover {
          color: var(--text);
          border-color: rgba(139, 92, 246, 0.45);
          background: rgba(139, 92, 246, 0.12);
        }
        .snippet pre {
          margin: 0;
          padding: 16px;
          overflow-x: auto;
          font-size: 12px;
          line-height: 1.7;
          color: #a8b5c7;
          flex: 1;
        }
        .snippet pre code {
          font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
          color: inherit;
        }
      `}</style>
    </div>
  );
}

export default function LandingPage() {
  const [tourTab, setTourTab] = useState<TourTabId>("traces");
  const [decision, setDecision] = useState<"approved" | "rejected" | null>(null);
  const [navOpen, setNavOpen] = useState(false);

  useEffect(() => {
    const nodes = Array.from(document.querySelectorAll<HTMLElement>("[data-reveal]"));
    if (!("IntersectionObserver" in window)) {
      nodes.forEach(n => n.classList.add("in"));
      return;
    }
    const io = new IntersectionObserver(
      entries => {
        entries.forEach(e => {
          if (e.isIntersecting) {
            e.target.classList.add("in");
            io.unobserve(e.target);
          }
        });
      },
      { threshold: 0.15 },
    );
    nodes.forEach(n => io.observe(n));
    return () => io.disconnect();
  }, []);

  return (
    <div className="landing">
      <HeroCanvas />
      <div className="orb orb-a" />
      <div className="orb orb-b" />
      <div className="grid-fade" />

      {}
      <header className="site-header">
        <Link href="/" className="brand">
          <span className="brand-mark">
            <Image src={icon} alt="" width={26} height={26} />
          </span>
          <span className="brand-copy">
            <b>RYUKSAIDSO</b>
            <small>agent control plane</small>
          </span>
        </Link>

        <nav className="site-nav">
          <Link href="/docs">Docs</Link>
          <Link href="/architecture">Architecture</Link>
          <Link href="/playground">Playground</Link>
          <Link href="/pricing">Pricing</Link>
        </nav>

        <div className="header-actions">
          <Link href="/auth" className="btn ghost">
            Sign in
          </Link>
          <Link href="/auth" className="btn primary">
            Get started
            <ArrowRight size={15} />
          </Link>
        </div>

        <button
          type="button"
          className="nav-toggle"
          aria-label={navOpen ? "Close menu" : "Open menu"}
          aria-expanded={navOpen}
          onClick={() => setNavOpen(open => !open)}
        >
          {navOpen ? <X size={18} /> : <Menu size={18} />}
        </button>

        {navOpen && (
          <nav className="mobile-nav" aria-label="Mobile">
            <Link href="/docs" onClick={() => setNavOpen(false)}>
              Docs
            </Link>
            <Link href="/architecture" onClick={() => setNavOpen(false)}>
              Architecture
            </Link>
            <Link href="/playground" onClick={() => setNavOpen(false)}>
              Playground
            </Link>
            <Link href="/pricing" onClick={() => setNavOpen(false)}>
              Pricing
            </Link>
            <Link href="/auth" onClick={() => setNavOpen(false)}>
              Sign in
            </Link>
          </nav>
        )}
      </header>

      {}
      <section className="hero">
        <div className="hero-inner">
          <span className="eyebrow">
            <Sparkles size={12} /> Agent reliability &amp; control plane
          </span>
          <h1>
            Ship AI agents like you ship
            <span className="grad"> production software</span>.
          </h1>
          <p>
            Plan, trace, approve, evaluate and roll back every agent run from one
            control plane — with policy gates, durable traces and multi-provider
            failover already wired in.
          </p>

          <div className="cta-row">
            <Link href="/auth" className="btn primary xl">
              Get started
              <ArrowRight size={16} />
            </Link>
            <Link href="/playground" className="btn secondary xl">
              <Play size={15} />
              Try the live playground
            </Link>
          </div>

          <ul className="hero-pills">
            <li>
              <CheckCircle2 size={13} /> Docker compose in one command
            </li>
            <li>
              <CheckCircle2 size={13} /> Approval-gated tool calls
            </li>
            <li>
              <CheckCircle2 size={13} /> Automatic provider failover
            </li>
          </ul>
        </div>

        <div className="stats" data-reveal>
          {STATS.map(s => (
            <div key={s.label}>
              <b>{s.value}</b>
              <span>{s.label}</span>
            </div>
          ))}
        </div>
      </section>

      {}
      <section className="section">
        <div className="section-head" data-reveal>
          <span className="eyebrow">Platform</span>
          <h2>Everything you need to operate agents</h2>
          <p>
            From the first prompt to the production rollout — controls, evidence
            and observability in a single pane of glass.
          </p>
        </div>

        <div className="feature-grid">
          {FEATURES.map(f => (
            <article className="feature-card" key={f.title} data-reveal>
              <span className="feature-icon">
                <f.icon size={20} />
              </span>
              <h3>{f.title}</h3>
              <p>{f.copy}</p>
            </article>
          ))}
        </div>
      </section>

      {}
      <section className="section">
        <div className="section-head" data-reveal>
          <span className="eyebrow">Explore</span>
          <h2>See it before you sign up</h2>
          <p>Documentation, a 3D architecture map and a live run playground.</p>
        </div>

        <div className="showcase-grid">
          {SHOWCASE.map(s => (
            <Link href={s.href} className="showcase-card" key={s.href} data-reveal>
              <span className="showcase-icon">
                <s.icon size={22} />
              </span>
              <span className="showcase-label">{s.label}</span>
              <h3>{s.title}</h3>
              <p>{s.copy}</p>
              <span className="showcase-link">
                Open <ArrowRight size={14} />
              </span>
            </Link>
          ))}
        </div>
      </section>

      {}
      <section className="section" id="product-tour">
        <div className="section-head" data-reveal>
          <span className="eyebrow">Product tour</span>
          <h2>See the control plane at work</h2>
          <p>
            Three surfaces carry most of the weight: a durable trace for every
            run, a human gate in front of risky side effects, and evaluation
            scores that decide what ships.
          </p>
        </div>

        <div className="tour" data-reveal>
          <div className="tour-tabs" role="tablist" aria-label="Product tour">
            {TOUR_TABS.map(t => (
              <button
                key={t.id}
                role="tab"
                type="button"
                aria-selected={tourTab === t.id}
                className={tourTab === t.id ? "active" : ""}
                onClick={() => setTourTab(t.id)}
              >
                <t.icon size={15} />
                {t.label}
              </button>
            ))}
          </div>

          <div className="tour-panel">
            {}
            {tourTab === "traces" && (
              <div className="tour-body">
                <div className="tour-runhead">
                  <div>
                    <span className="status-chip ok">COMPLETED</span>
                    <b>triage-agent</b>
                    <small>run_8f31c2 · staging · v4</small>
                  </div>
                  <div className="tour-meta">
                    <span>4.2 s</span>
                    <span>1,284 tok</span>
                    <span>3 tools</span>
                  </div>
                </div>

                <ol className="trace">
                  {TRACE_STEPS.map(s => (
                    <li key={s.name} className={s.tone}>
                      <span className="trace-icon">
                        <s.icon size={15} />
                      </span>
                      <div className="trace-main">
                        <b>{s.name}</b>
                        <span>{s.detail}</span>
                      </div>
                      <div className="trace-side">
                        <span>{s.ms}</span>
                        <span>{s.tok}</span>
                      </div>
                    </li>
                  ))}
                </ol>

                <p className="tour-note">
                  Every step persists input, output, latency and token usage —
                  open any run to replay it, line by line.
                </p>
              </div>
            )}

            {}
            {tourTab === "approvals" && (
              <div className="tour-body">
                <div className="approval">
                  <div className="approval-head">
                    <span className="approval-icon">
                      <ShieldCheck size={17} />
                    </span>
                    <div>
                      <b>Approval required</b>
                      <span>policy “high-risk write” · severity high</span>
                    </div>
                    <span className="status-chip warn">WAITING</span>
                  </div>

                  <dl className="approval-grid">
                    <div>
                      <dt>Action</dt>
                      <dd>
                        <code>ticket:write</code>
                      </dd>
                    </div>
                    <div>
                      <dt>Requested by</dt>
                      <dd>triage-agent · run_8f31c2</dd>
                    </div>
                    <div>
                      <dt>Scope</dt>
                      <dd>close ticket #4821 as “resolved”</dd>
                    </div>
                    <div>
                      <dt>Waiting</dt>
                      <dd>2 m 04 s · SLA 15 m</dd>
                    </div>
                  </dl>

                  <pre className="approval-payload">
                    <code>{`{
  "ticketId": "4821",
  "status": "resolved",
  "resolution": "rotated leaked key, rotated session cookies"
}`}</code>
                  </pre>

                  {decision === null ? (
                    <div className="approval-actions">
                      <button
                        type="button"
                        className="btn primary"
                        onClick={() => setDecision("approved")}
                      >
                        <CheckCircle2 size={15} />
                        Approve &amp; continue
                      </button>
                      <button
                        type="button"
                        className="btn ghost"
                        onClick={() => setDecision("rejected")}
                      >
                        Reject run
                      </button>
                    </div>
                  ) : (
                    <div className={`approval-done ${decision}`}>
                      <Check size={15} />
                      <span>
                        {decision === "approved"
                          ? "Approved — a continuation run was queued with the granted scope recorded."
                          : "Rejected — the waiting run failed terminally, with your decision logged to the audit trail."}
                      </span>
                      <button
                        type="button"
                        onClick={() => setDecision(null)}
                        className="reset"
                      >
                        reset
                      </button>
                    </div>
                  )}
                </div>

                <p className="tour-note">
                  Approvals are scoped and audited: approving records who
                  granted what, and rejecting fails the run instead of failing
                  silently.
                </p>
              </div>
            )}

            {}
            {tourTab === "evaluations" && (
              <div className="tour-body">
                <div className="eval">
                  <div className="eval-score">
                    <div className="eval-ring">
                      <svg viewBox="0 0 80 80" aria-hidden="true">
                        <circle cx="40" cy="40" r="33" className="track" />
                        <circle cx="40" cy="40" r="33" className="value" />
                      </svg>
                      <div>
                        <b>92</b>
                        <small>score</small>
                      </div>
                    </div>
                    <div>
                      <b>Regression suite · main</b>
                      <p>
                        38 of 41 cases pass. Score is up{" "}
                        <strong>+6 pts</strong> versus the last published
                        version — safe to pin v4 to production.
                      </p>
                      <span className="status-chip ok">+6 vs v3</span>
                    </div>
                  </div>

                  <ul className="eval-rows">
                    {EVAL_ROWS.map(r => (
                      <li key={r.id}>
                        <span className={r.pass ? "pass" : "fail"}>
                          {r.pass ? "pass" : "fail"}
                        </span>
                        <code>{r.id}</code>
                        <span>{r.input}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                <p className="tour-note">
                  Datasets are plain JSON — run them on every draft and only
                  publish versions that beat the current production pin.
                </p>
              </div>
            )}
          </div>
        </div>
      </section>

      {}
      <section className="section" id="how-it-works">
        <div className="section-head" data-reveal>
          <span className="eyebrow">How it works</span>
          <h2>From prompt to evidence in four steps</h2>
          <p>
            No bespoke glue code: define an agent, queue a run, let policies
            decide what needs a human, then read the evidence.
          </p>
        </div>

        <ol className="flow" data-reveal>
          {FLOW_STEPS.map((s, i) => (
            <li key={s.title}>
              <span className="flow-num">{i + 1}</span>
              <span className="flow-icon">
                <s.icon size={18} />
              </span>
              <h3>{s.title}</h3>
              <p>{s.copy}</p>
            </li>
          ))}
        </ol>

        <div className="flow-snippet" data-reveal>
          <CopySnippet label="POST /api/control/runs" code={RUN_SNIPPET} />
          <div className="flow-aside">
            <h3>One endpoint away</h3>
            <p>
              Everything the dashboard does is available over HTTP with a
              workspace API key: create runs, read traces, decide approvals,
              push knowledge and trigger evaluations from CI.
            </p>
            <ul>
              <li>
                <CheckCircle2 size={13} /> Session cookies or{" "}
                <code>rsk_…</code> bearer keys
              </li>
              <li>
                <CheckCircle2 size={13} /> Tenant-scoped by default
              </li>
              <li>
                <CheckCircle2 size={13} /> Full reference in the docs
              </li>
            </ul>
            <Link href="/docs" className="btn secondary">
              Open the API reference
              <ArrowRight size={15} />
            </Link>
          </div>
        </div>
      </section>

      {}
      <section className="section">
        <div className="cta-panel" data-reveal>
          <span className="eyebrow">Get started</span>
          <h2>Your control plane is one click away</h2>
          <p>
            Create a workspace, provision the sample agents and run your first
            traced, approval-gated agent run in minutes.
          </p>
          <div className="cta-row center">
            <Link href="/auth" className="btn primary xl">
              Create your workspace
              <ArrowRight size={16} />
            </Link>
            <Link href="/architecture" className="btn secondary xl">
              <BarChart3 size={15} />
              View architecture
            </Link>
          </div>
        </div>
      </section>

      {}
      <footer className="site-footer">
        <div className="footer-brand">
          <span className="brand-mark footer-mark">
            <Image src={icon} alt="" width={22} height={22} />
          </span>
          <div className="footer-copy">
            <b>RYUKSAIDSO</b>
            <span>Agent reliability &amp; control plane</span>
          </div>
        </div>
        <nav>
          <Link href="/docs">Docs</Link>
          <Link href="/architecture">Architecture</Link>
          <Link href="/playground">Playground</Link>
          <Link href="/pricing">Pricing</Link>
          <Link href="/faq">FAQ</Link>
          <Link href="/privacy">Privacy</Link>
          <Link href="/auth">Sign in</Link>
        </nav>
        <div className="footer-social">
          {SOCIALS.map((social) => {
            const Icon = SOCIAL_ICONS[social.name];
            return (
              <a
                key={social.name}
                href={social.url}
                target="_blank"
                rel="me noopener noreferrer"
                aria-label={social.name}
                title={social.name}
              >
                <Icon size={14} />
              </a>
            );
          })}
        </div>
        <small>
          © {new Date().getFullYear()} RYUKSAIDSO · Founded by{" "}
          <a href={FOUNDER_URL} target="_blank" rel="noopener noreferrer">
            Faizan Hameed (Faizcasm)
          </a>{" "}
          · built for production agents.
        </small>
      </footer>

      <style jsx global>{`
        .landing {
          position: relative;
          min-height: 100vh;
          background: radial-gradient(1200px 600px at 50% -10%, rgba(139, 92, 246, 0.14), transparent 60%),
            linear-gradient(180deg, #080a0f 0%, #0a0d14 45%, #080a0f 100%);
          color: var(--text);
        }

        .hero-canvas {
          position: fixed;
          top: 70px;
          right: 0;
          bottom: 0;
          left: 0;
          width: 100%;
          height: calc(100% - 70px);
          z-index: 0;
          pointer-events: none;
        }

        .orb {
          position: fixed;
          border-radius: 50%;
          filter: blur(70px);
          z-index: 0;
          pointer-events: none;
          animation: drift 16s ease-in-out infinite;
        }
        .orb-a {
          width: 420px;
          height: 420px;
          top: 30px;
          right: -120px;
          background: radial-gradient(circle at 30% 30%, rgba(139, 92, 246, 0.35), transparent 70%);
        }
        .orb-b {
          width: 360px;
          height: 360px;
          bottom: -120px;
          left: -80px;
          background: radial-gradient(circle at 30% 30%, rgba(34, 211, 238, 0.22), transparent 70%);
          animation-delay: 5s;
        }
        @keyframes drift {
          0%, 100% { transform: translate3d(0, 0, 0); }
          50% { transform: translate3d(-40px, 50px, 0); }
        }

        .grid-fade {
          position: fixed;
          top: 70px;
          right: 0;
          bottom: 0;
          left: 0;
          z-index: 0;
          pointer-events: none;
          background-image: linear-gradient(rgba(255, 255, 255, 0.03) 1px, transparent 1px),
            linear-gradient(90deg, rgba(255, 255, 255, 0.03) 1px, transparent 1px);
          background-size: 46px 46px;
          mask-image: radial-gradient(circle at 50% 30%, black, transparent 78%);
        }

        .hero,
        .section,
        .site-footer {
          position: relative;
          z-index: 2;
          max-width: 1180px;
          margin: 0 auto;
          padding-left: 24px;
          padding-right: 24px;
        }

        .site-header {
          position: sticky;
          top: 0;
          z-index: 40;
          width: 100%;
          display: flex;
          align-items: center;
          flex-wrap: wrap;
          gap: 22px;
          padding-top: 16px;
          padding-bottom: 16px;
          padding-left: max(24px, calc((100% - 1180px) / 2));
          padding-right: max(24px, calc((100% - 1180px) / 2));
          background: rgba(8, 10, 15, 0.94);
          backdrop-filter: blur(16px);
          -webkit-backdrop-filter: blur(16px);
          border-bottom: 1px solid rgba(255, 255, 255, 0.06);
        }

        .nav-toggle {
          display: none;
          width: 38px;
          height: 38px;
          border-radius: 10px;
          border: 1px solid var(--line);
          background: rgba(255, 255, 255, 0.045);
          color: var(--text);
          place-items: center;
        }

        .mobile-nav {
          flex-basis: 100%;
          display: grid;
          gap: 2px;
          padding-top: 8px;
        }

        .mobile-nav a {
          color: var(--muted);
          font-size: 13px;
          text-decoration: none;
          padding: 11px 12px;
          border-radius: 10px;
        }

        .mobile-nav a:hover {
          color: var(--text);
          background: rgba(255, 255, 255, 0.05);
        }

        @media (min-width: 981px) {
          .mobile-nav {
            display: none;
          }
        }
        .brand {
          display: flex;
          align-items: center;
          gap: 11px;
          text-decoration: none;
          color: inherit;
        }
        .brand-mark {
          width: 38px;
          height: 38px;
          border-radius: 12px;
          display: grid;
          place-items: center;
          overflow: hidden;
          background: #0b0d14;
          border: 1px solid rgba(255, 255, 255, 0.1);
          box-shadow: 0 0 34px rgba(139, 92, 246, 0.35);
        }

        .brand-mark :global(img) {
          width: 100%;
          height: 100%;
          object-fit: cover;
          display: block;
        }
        .brand-copy b {
          display: block;
          font-size: 13px;
          letter-spacing: 0.2em;
        }
        .brand-copy small {
          display: block;
          font-size: 9px;
          color: var(--muted);
          letter-spacing: 0.14em;
          margin-top: 2px;
          text-transform: uppercase;
        }
        .site-nav {
          display: flex;
          gap: 22px;
          margin-left: auto;
        }
        .site-nav a {
          color: var(--muted);
          font-size: 12px;
          text-decoration: none;
          transition: color 0.2s;
        }
        .site-nav a:hover {
          color: var(--text);
        }
        .header-actions {
          display: flex;
          gap: 9px;
        }

        .btn {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          border: 1px solid transparent;
          border-radius: 11px;
          padding: 10px 15px;
          font-size: 12px;
          font-weight: 700;
          text-decoration: none;
          transition: transform 0.2s, box-shadow 0.2s, background 0.2s;
          white-space: nowrap;
        }
        .btn.primary {
          color: #fff;
          background: linear-gradient(135deg, #8b5cf6, #4f46e5);
          box-shadow: 0 10px 34px rgba(79, 70, 229, 0.32);
        }
        .btn.primary:hover {
          transform: translateY(-2px);
          box-shadow: 0 16px 42px rgba(79, 70, 229, 0.45);
        }
        .btn.secondary {
          color: #dbe2ee;
          background: rgba(255, 255, 255, 0.045);
          border-color: var(--line);
        }
        .btn.secondary:hover {
          background: rgba(255, 255, 255, 0.075);
          transform: translateY(-2px);
        }
        .btn.ghost {
          color: var(--muted);
          background: transparent;
          border-color: var(--line);
        }
        .btn.ghost:hover {
          color: var(--text);
          background: rgba(255, 255, 255, 0.05);
        }
        .btn.xl {
          padding: 14px 22px;
          font-size: 13px;
          border-radius: 13px;
        }

        .hero {
          padding-top: 70px;
          padding-bottom: 40px;
          text-align: center;
        }
        .hero-inner {
          max-width: 880px;
          margin: 0 auto;
        }
        .eyebrow {
          display: inline-flex;
          align-items: center;
          gap: 7px;
          font-size: 10px;
          letter-spacing: 0.18em;
          text-transform: uppercase;
          color: #b7c0d0;
          border: 1px solid var(--line);
          background: rgba(255, 255, 255, 0.04);
          padding: 7px 13px;
          border-radius: 99px;
        }
        .eyebrow :global(svg) {
          color: #a78bfa;
        }
        .hero h1 {
          font-size: clamp(38px, 6vw, 68px);
          line-height: 1.02;
          letter-spacing: -0.045em;
          margin: 22px 0 18px;
          font-weight: 800;
        }
        .grad {
          background: linear-gradient(115deg, #a78bfa 5%, #22d3ee 55%, #8b5cf6 100%);
          -webkit-background-clip: text;
          background-clip: text;
          -webkit-text-fill-color: transparent;
        }
        .hero p {
          color: var(--muted);
          font-size: clamp(14px, 1.6vw, 16px);
          line-height: 1.65;
          max-width: 660px;
          margin: 0 auto;
        }
        .cta-row {
          display: flex;
          gap: 12px;
          justify-content: center;
          flex-wrap: wrap;
          margin-top: 32px;
        }
        .cta-row.center {
          margin-top: 26px;
        }
        .hero-pills {
          list-style: none;
          padding: 0;
          margin: 30px auto 0;
          display: flex;
          gap: 10px;
          justify-content: center;
          flex-wrap: wrap;
        }
        .hero-pills li {
          display: inline-flex;
          align-items: center;
          gap: 7px;
          font-size: 11px;
          color: var(--muted);
          border: 1px solid var(--line);
          background: rgba(255, 255, 255, 0.03);
          padding: 7px 12px;
          border-radius: 99px;
        }
        .hero-pills :global(svg) {
          color: var(--good);
        }

        .stats {
          margin-top: 64px;
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 12px;
          border: 1px solid var(--line);
          background: linear-gradient(160deg, rgba(255, 255, 255, 0.045), rgba(255, 255, 255, 0.02));
          border-radius: 18px;
          padding: 22px 14px;
          backdrop-filter: blur(14px);
        }
        .stats div {
          text-align: center;
        }
        .stats b {
          display: block;
          font-size: clamp(22px, 3vw, 32px);
          letter-spacing: -0.03em;
          background: linear-gradient(135deg, #8b5cf6, #22d3ee);
          -webkit-background-clip: text;
          background-clip: text;
          -webkit-text-fill-color: transparent;
        }
        .stats span {
          display: block;
          margin-top: 6px;
          font-size: 9px;
          letter-spacing: 0.14em;
          text-transform: uppercase;
          color: var(--muted);
        }

        .section {
          padding-top: 84px;
        }
        .section-head {
          text-align: center;
          max-width: 640px;
          margin: 0 auto 38px;
        }
        .section-head h2 {
          font-size: clamp(26px, 3.6vw, 40px);
          letter-spacing: -0.035em;
          margin: 16px 0 12px;
        }
        .section-head p {
          color: var(--muted);
          font-size: 13px;
          line-height: 1.65;
          margin: 0;
        }

        .feature-grid {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 14px;
        }
        .feature-card {
          border: 1px solid var(--line);
          border-radius: 16px;
          padding: 22px;
          background: linear-gradient(160deg, rgba(255, 255, 255, 0.045), rgba(255, 255, 255, 0.016));
          transition: transform 0.25s, border-color 0.25s, box-shadow 0.25s;
        }
        .feature-card:hover {
          transform: translateY(-5px);
          border-color: rgba(139, 92, 246, 0.4);
          box-shadow: 0 18px 44px rgba(0, 0, 0, 0.4);
        }
        .feature-icon {
          width: 42px;
          height: 42px;
          border-radius: 12px;
          display: grid;
          place-items: center;
          color: #c4b5fd;
          background: rgba(139, 92, 246, 0.13);
          border: 1px solid rgba(139, 92, 246, 0.22);
        }
        .feature-card h3 {
          font-size: 15px;
          margin: 16px 0 8px;
        }
        .feature-card p {
          font-size: 12px;
          line-height: 1.65;
          color: var(--muted);
          margin: 0;
        }

        .showcase-grid {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 14px;
        }
        .showcase-card {
          position: relative;
          display: block;
          border: 1px solid var(--line);
          border-radius: 18px;
          padding: 24px;
          text-decoration: none;
          color: inherit;
          background: linear-gradient(160deg, rgba(34, 211, 238, 0.07), rgba(139, 92, 246, 0.05));
          transition: transform 0.25s, border-color 0.25s;
        }
        .showcase-card:hover {
          transform: translateY(-6px);
          border-color: rgba(34, 211, 238, 0.42);
        }
        .showcase-icon {
          width: 46px;
          height: 46px;
          border-radius: 13px;
          display: grid;
          place-items: center;
          color: #67e8f9;
          background: rgba(34, 211, 238, 0.1);
          border: 1px solid rgba(34, 211, 238, 0.2);
        }
        .showcase-label {
          display: block;
          margin-top: 16px;
          font-size: 9px;
          letter-spacing: 0.16em;
          text-transform: uppercase;
          color: var(--muted);
        }
        .showcase-card h3 {
          font-size: 17px;
          margin: 8px 0 8px;
        }
        .showcase-card p {
          font-size: 12px;
          line-height: 1.6;
          color: var(--muted);
          margin: 0;
        }
        .showcase-link {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          margin-top: 16px;
          font-size: 11px;
          font-weight: 700;
          color: #a78bfa;
        }

        .tour {
          border: 1px solid var(--line);
          border-radius: 22px;
          overflow: hidden;
          background: linear-gradient(165deg, rgba(14, 17, 26, 0.96), rgba(9, 11, 17, 0.96));
          box-shadow: 0 30px 80px rgba(0, 0, 0, 0.45);
        }
        .tour-tabs {
          display: flex;
          gap: 6px;
          padding: 12px;
          border-bottom: 1px solid var(--line);
          background: rgba(255, 255, 255, 0.03);
          flex-wrap: wrap;
        }
        .tour-tabs button {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          padding: 9px 15px;
          border: 1px solid transparent;
          border-radius: 99px;
          background: transparent;
          color: var(--muted);
          font-size: 12px;
          font-weight: 700;
          font-family: inherit;
          cursor: pointer;
          transition: all 0.22s ease;
        }
        .tour-tabs button:hover {
          color: var(--text);
          background: rgba(255, 255, 255, 0.05);
        }
        .tour-tabs button.active {
          color: #fff;
          background: linear-gradient(135deg, #8b5cf6, #4f46e5);
          border-color: rgba(139, 92, 246, 0.6);
          box-shadow: 0 8px 26px rgba(79, 70, 229, 0.38);
        }
        .tour-panel {
          padding: 24px;
        }
        .tour-body {
          display: grid;
          gap: 18px;
          animation: tourIn 0.35s ease;
        }
        @keyframes tourIn {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: none; }
        }

        .tour-runhead {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          gap: 16px;
          flex-wrap: wrap;
          padding-bottom: 16px;
          border-bottom: 1px dashed var(--line);
        }
        .tour-runhead b {
          display: block;
          margin-top: 9px;
          font-size: 15px;
          letter-spacing: -0.01em;
        }
        .tour-runhead small {
          display: block;
          margin-top: 3px;
          font-size: 11px;
          color: var(--muted);
        }
        .status-chip {
          display: inline-block;
          font-size: 9.5px;
          font-weight: 800;
          letter-spacing: 0.14em;
          padding: 4px 10px;
          border-radius: 99px;
          border: 1px solid;
        }
        .status-chip.ok {
          color: #6ee7b7;
          background: rgba(16, 185, 129, 0.1);
          border-color: rgba(16, 185, 129, 0.32);
        }
        .status-chip.warn {
          color: #fcd34d;
          background: rgba(245, 158, 11, 0.1);
          border-color: rgba(245, 158, 11, 0.32);
        }
        .tour-meta {
          display: flex;
          gap: 8px;
          flex-wrap: wrap;
        }
        .tour-meta span {
          font-size: 10.5px;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          color: var(--muted);
          border: 1px solid var(--line);
          border-radius: 99px;
          padding: 5px 11px;
          background: rgba(255, 255, 255, 0.03);
        }

        .trace {
          list-style: none;
          margin: 0;
          padding: 0;
          display: grid;
          gap: 10px;
        }
        .trace li {
          display: grid;
          grid-template-columns: 34px 1fr auto;
          gap: 14px;
          align-items: center;
          border: 1px solid var(--line);
          border-radius: 14px;
          padding: 13px 15px;
          background: rgba(255, 255, 255, 0.03);
          transition: border-color 0.2s, transform 0.2s;
        }
        .trace li:hover {
          transform: translateX(4px);
          border-color: rgba(139, 92, 246, 0.4);
        }
        .trace li.gate {
          border-color: rgba(245, 158, 11, 0.35);
          background: linear-gradient(100deg, rgba(245, 158, 11, 0.1), rgba(245, 158, 11, 0.02));
        }
        .trace li.gate:hover {
          border-color: rgba(245, 158, 11, 0.55);
        }
        .trace-icon {
          width: 34px;
          height: 34px;
          border-radius: 10px;
          display: grid;
          place-items: center;
          color: #c4b5fd;
          background: rgba(139, 92, 246, 0.13);
          border: 1px solid rgba(139, 92, 246, 0.24);
        }
        .trace li.gate .trace-icon {
          color: #fcd34d;
          background: rgba(245, 158, 11, 0.14);
          border-color: rgba(245, 158, 11, 0.3);
        }
        .trace-main b {
          display: block;
          font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
          font-size: 12.5px;
          color: var(--text);
        }
        .trace-main span {
          display: block;
          font-size: 11.5px;
          color: var(--muted);
          margin-top: 3px;
          line-height: 1.5;
        }
        .trace-side {
          text-align: right;
          display: grid;
          gap: 3px;
        }
        .trace-side span {
          font-size: 10.5px;
          color: var(--muted);
          letter-spacing: 0.04em;
        }
        .tour-note {
          font-size: 12px;
          color: var(--muted);
          line-height: 1.6;
          margin: 0;
          border-top: 1px dashed var(--line);
          padding-top: 14px;
        }

        .approval {
          border: 1px solid rgba(245, 158, 11, 0.3);
          border-radius: 18px;
          padding: 20px;
          background: linear-gradient(160deg, rgba(245, 158, 11, 0.08), rgba(255, 255, 255, 0.02));
          display: grid;
          gap: 16px;
        }
        .approval-head {
          display: flex;
          align-items: center;
          gap: 12px;
        }
        .approval-icon {
          width: 38px;
          height: 38px;
          border-radius: 11px;
          display: grid;
          place-items: center;
          color: #fcd34d;
          background: rgba(245, 158, 11, 0.14);
          border: 1px solid rgba(245, 158, 11, 0.3);
        }
        .approval-head > div {
          flex: 1;
        }
        .approval-head b {
          display: block;
          font-size: 14px;
        }
        .approval-head > div > span {
          display: block;
          font-size: 11px;
          color: var(--muted);
          margin-top: 2px;
        }
        .approval-grid {
          display: grid;
          grid-template-columns: repeat(4, minmax(0, 1fr));
          gap: 12px;
          margin: 0;
        }
        .approval-grid > div {
          border: 1px solid var(--line);
          border-radius: 12px;
          padding: 11px 13px;
          background: rgba(0, 0, 0, 0.25);
        }
        .approval-grid dt {
          font-size: 9.5px;
          letter-spacing: 0.14em;
          text-transform: uppercase;
          color: var(--muted);
        }
        .approval-grid dd {
          margin: 6px 0 0;
          font-size: 12.5px;
          color: var(--text);
        }
        .approval-grid code {
          font-size: 12px;
          color: #fcd34d;
        }
        .approval-payload {
          margin: 0;
          background: #0a0d12;
          border: 1px solid var(--line);
          border-radius: 12px;
          padding: 14px;
          font-size: 11.5px;
          line-height: 1.6;
          color: #a8b5c7;
          overflow-x: auto;
        }
        .approval-actions {
          display: flex;
          gap: 10px;
          flex-wrap: wrap;
        }
        .approval-done {
          display: flex;
          align-items: center;
          gap: 10px;
          border: 1px solid;
          border-radius: 12px;
          padding: 12px 14px;
          font-size: 12.5px;
          line-height: 1.5;
        }
        .approval-done.approved {
          color: #a7f3d0;
          border-color: rgba(52, 211, 153, 0.35);
          background: rgba(16, 185, 129, 0.1);
        }
        .approval-done.rejected {
          color: #fecdd3;
          border-color: rgba(244, 63, 94, 0.35);
          background: rgba(244, 63, 94, 0.1);
        }
        .approval-done .reset {
          margin-left: auto;
          background: none;
          border: none;
          color: inherit;
          text-decoration: underline;
          cursor: pointer;
          font-size: 11px;
          font-family: inherit;
          opacity: 0.75;
        }

        .eval {
          display: grid;
          gap: 16px;
        }
        .eval-score {
          display: grid;
          grid-template-columns: 96px 1fr;
          gap: 18px;
          align-items: center;
          border: 1px solid var(--line);
          border-radius: 16px;
          padding: 16px;
          background: rgba(255, 255, 255, 0.025);
        }
        .eval-ring {
          position: relative;
          width: 96px;
          height: 96px;
        }
        .eval-ring svg {
          width: 96px;
          height: 96px;
          transform: rotate(-90deg);
        }
        .eval-ring circle {
          fill: none;
          stroke-width: 7;
          stroke-linecap: round;
        }
        .eval-ring .track {
          stroke: rgba(255, 255, 255, 0.08);
        }
        .eval-ring .value {
          stroke: #8b5cf6;
          stroke-dasharray: 207;
          stroke-dashoffset: 17;
          filter: drop-shadow(0 0 6px rgba(139, 92, 246, 0.6));
        }
        .eval-ring > div {
          position: absolute;
          inset: 0;
          display: grid;
          place-content: center;
          text-align: center;
        }
        .eval-ring b {
          font-size: 23px;
          letter-spacing: -0.03em;
          background: linear-gradient(135deg, #a78bfa, #22d3ee);
          -webkit-background-clip: text;
          background-clip: text;
          -webkit-text-fill-color: transparent;
        }
        .eval-ring small {
          font-size: 8.5px;
          letter-spacing: 0.14em;
          text-transform: uppercase;
          color: var(--muted);
        }
        .eval-score > div > b {
          font-size: 14.5px;
        }
        .eval-score p {
          font-size: 12.5px;
          color: var(--muted);
          line-height: 1.6;
          margin: 7px 0 10px;
        }
        .eval-score p strong {
          color: #a7f3d0;
        }
        .eval-rows {
          list-style: none;
          margin: 0;
          padding: 0;
          display: grid;
          gap: 8px;
        }
        .eval-rows li {
          display: grid;
          grid-template-columns: 54px 96px 1fr;
          gap: 12px;
          align-items: center;
          border: 1px solid var(--line);
          border-radius: 12px;
          padding: 10px 13px;
          background: rgba(255, 255, 255, 0.03);
          font-size: 12.5px;
          color: var(--muted);
        }
        .eval-rows code {
          font-size: 11.5px;
          color: var(--text);
        }
        .eval-rows .pass,
        .eval-rows .fail {
          font-size: 9.5px;
          font-weight: 800;
          letter-spacing: 0.1em;
          text-transform: uppercase;
          text-align: center;
          border-radius: 99px;
          padding: 4px 0;
        }
        .eval-rows .pass {
          color: #6ee7b7;
          background: rgba(16, 185, 129, 0.12);
          border: 1px solid rgba(16, 185, 129, 0.3);
        }
        .eval-rows .fail {
          color: #fda4af;
          background: rgba(244, 63, 94, 0.12);
          border: 1px solid rgba(244, 63, 94, 0.3);
        }

        .flow {
          list-style: none;
          margin: 0;
          padding: 0;
          display: grid;
          grid-template-columns: repeat(4, minmax(0, 1fr));
          gap: 14px;
        }
        .flow li {
          position: relative;
          border: 1px solid var(--line);
          border-radius: 18px;
          padding: 22px;
          background: linear-gradient(160deg, rgba(255, 255, 255, 0.045), rgba(255, 255, 255, 0.016));
          transition: transform 0.25s, border-color 0.25s, box-shadow 0.25s;
        }
        .flow li:hover {
          transform: translateY(-5px);
          border-color: rgba(34, 211, 238, 0.4);
          box-shadow: 0 18px 44px rgba(0, 0, 0, 0.4);
        }
        .flow-num {
          position: absolute;
          top: 16px;
          right: 18px;
          font-size: 11px;
          font-weight: 800;
          color: var(--muted);
          letter-spacing: 0.1em;
        }
        .flow-icon {
          width: 40px;
          height: 40px;
          border-radius: 12px;
          display: grid;
          place-items: center;
          color: #67e8f9;
          background: rgba(34, 211, 238, 0.1);
          border: 1px solid rgba(34, 211, 238, 0.22);
        }
        .flow h3 {
          font-size: 14.5px;
          margin: 14px 0 7px;
        }
        .flow p {
          font-size: 12px;
          line-height: 1.65;
          color: var(--muted);
          margin: 0;
        }

        .flow-snippet {
          display: grid;
          grid-template-columns: 1.25fr 0.75fr;
          gap: 16px;
          margin-top: 18px;
          align-items: stretch;
        }
        .flow-aside {
          border: 1px solid var(--line);
          border-radius: 16px;
          padding: 22px;
          background: linear-gradient(160deg, rgba(139, 92, 246, 0.08), rgba(255, 255, 255, 0.02));
          display: flex;
          flex-direction: column;
          gap: 12px;
        }
        .flow-aside h3 {
          margin: 0;
          font-size: 16px;
        }
        .flow-aside p {
          margin: 0;
          font-size: 12.5px;
          line-height: 1.65;
          color: var(--muted);
        }
        .flow-aside ul {
          list-style: none;
          margin: 4px 0;
          padding: 0;
          display: grid;
          gap: 8px;
        }
        .flow-aside li {
          display: flex;
          align-items: center;
          gap: 8px;
          font-size: 12.5px;
          color: var(--muted);
        }
        .flow-aside li :global(svg) {
          color: var(--good);
          flex-shrink: 0;
        }
        .flow-aside li code {
          font-size: 11.5px;
          color: #c4b5fd;
        }
        .flow-aside .btn {
          align-self: flex-start;
          margin-top: auto;
        }

        .cta-panel {
          border: 1px solid rgba(139, 92, 246, 0.28);
          border-radius: 24px;
          padding: 54px 32px;
          text-align: center;
          background: radial-gradient(700px 260px at 50% 0%, rgba(139, 92, 246, 0.18), transparent 70%),
            linear-gradient(160deg, rgba(255, 255, 255, 0.05), rgba(255, 255, 255, 0.02));
          box-shadow: 0 30px 80px rgba(0, 0, 0, 0.4);
        }
        .cta-panel h2 {
          font-size: clamp(24px, 3.4vw, 38px);
          letter-spacing: -0.035em;
          margin: 16px 0 12px;
        }
        .cta-panel p {
          color: var(--muted);
          font-size: 13px;
          max-width: 540px;
          margin: 0 auto;
          line-height: 1.65;
        }

        .site-footer {
          margin-top: 96px;
          padding-top: 26px;
          padding-bottom: 40px;
          border-top: 1px solid var(--line);
          display: flex;
          align-items: center;
          gap: 20px;
          flex-wrap: wrap;
        }
        .footer-brand {
          display: flex;
          align-items: center;
          gap: 10px;
        }

        .footer-mark {
          width: 30px;
          height: 30px;
          border-radius: 9px;
        }

        .footer-brand b {
          display: block;
          font-size: 11px;
          letter-spacing: 0.18em;
        }

        .footer-copy span {
          display: block;
          font-size: 9px;
          color: var(--muted);
          margin-top: 2px;
        }
        .site-footer nav {
          display: flex;
          gap: 18px;
          margin-left: auto;
        }
        .site-footer nav a {
          color: var(--muted);
          font-size: 11px;
          text-decoration: none;
        }
        .site-footer nav a:hover {
          color: var(--text);
        }
        .footer-social {
          display: flex;
          gap: 8px;
          align-items: center;
        }
        .footer-social a {
          display: grid;
          place-items: center;
          width: 28px;
          height: 28px;
          border: 1px solid var(--line);
          border-radius: 8px;
          color: var(--muted);
          background: rgba(255, 255, 255, 0.03);
        }
        .footer-social a:hover {
          color: var(--text);
          background: rgba(255, 255, 255, 0.07);
        }
        .site-footer small {
          width: 100%;
          color: #666f7e;
          font-size: 10px;
        }

        .site-footer small :global(a) {
          color: #a78bfa;
          text-decoration: none;
        }

        .site-footer small :global(a):hover {
          text-decoration: underline;
        }

        .landing :global([data-reveal]) {
          opacity: 0;
          transform: translateY(26px);
          transition: opacity 0.7s ease, transform 0.7s ease;
        }
        .landing :global([data-reveal].in) {
          opacity: 1;
          transform: none;
        }

        @media (max-width: 980px) {
          .feature-grid,
          .showcase-grid {
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }
          .flow {
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }
          .flow-snippet {
            grid-template-columns: 1fr;
          }
          .approval-grid {
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }
          .site-nav {
            display: none;
          }
          .nav-toggle {
            display: grid;
          }
          .header-actions {
            margin-left: auto;
          }
          .site-header {
            gap: 12px;
            padding-top: 12px;
            padding-bottom: 12px;
          }
        }
        @media (max-width: 640px) {
          .feature-grid,
          .showcase-grid {
            grid-template-columns: 1fr;
          }
          .flow {
            grid-template-columns: 1fr;
          }
          .tour-panel {
            padding: 18px 14px;
          }
          .trace li {
            grid-template-columns: 34px 1fr;
            row-gap: 8px;
          }
          .trace-side {
            grid-column: 2;
            text-align: left;
            display: flex;
            gap: 12px;
          }
          .approval-grid {
            grid-template-columns: 1fr;
          }
          .eval-score {
            grid-template-columns: 1fr;
            justify-items: center;
            text-align: center;
          }
          .eval-rows li {
            grid-template-columns: 54px 1fr;
          }
          .eval-rows li > span:last-child {
            grid-column: 1 / -1;
          }
          .stats {
            grid-template-columns: repeat(2, 1fr);
            gap: 18px;
          }
          .hero {
            padding-top: 40px;
          }
          .header-actions .ghost {
            display: none;
          }
          .site-footer nav {
            margin-left: 0;
          }
        }

        @media (max-width: 480px) {
          .brand-copy small {
            display: none;
          }
          .brand-copy b {
            font-size: 12px;
          }
          .site-header,
          .hero,
          .section,
          .site-footer {
            padding-left: 16px;
            padding-right: 16px;
          }
          .btn {
            padding: 9px 12px;
          }
        }

        @media (prefers-reduced-motion: reduce) {
          .orb {
            animation: none;
          }
          .landing :global([data-reveal]) {
            opacity: 1;
            transform: none;
            transition: none;
          }
        }
      `}</style>
    </div>
  );
}
