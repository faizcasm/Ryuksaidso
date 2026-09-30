"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import {
  Activity,
  BookOpen,
  Check,
  ChevronDown,
  Database,
  Home,
  Layers3,
  Play,
  RotateCcw,
  Shield,
  ShieldCheck,
  Sparkles,
  Terminal,
  TrendingUp,
  X,
  Zap,
} from "lucide-react";
import icon from "../icon.png";

/* ================================================================== */
/*  Types + the scripted runs that drive the playground               */
/* ================================================================== */

type StepState = "pending" | "running" | "done" | "failed";
type Kind = "plan" | "tool" | "gate" | "synth";
type Phase = "idle" | "queued" | "running" | "waiting" | "completed" | "failed";

type Step = {
  id: string;
  kind: Kind;
  name: string;
  detail: string;
  ms: number; // playback time
  real: string; // display duration
  tokens: number;
  scope?: string;
  payload: string;
  error?: string;
};

type RunMeta = {
  key: string;
  label: string;
  agent: string;
  environment: string;
  trigger: string;
  started: string;
  interactive: boolean;
  status: Phase;
  steps: Step[];
  evalScore?: number;
  evalDelta?: string;
  error?: string;
};

const TRIAGE_STEPS: Step[] = [
  {
    id: "s1",
    kind: "plan",
    name: "plan",
    detail: "Classify the incident → pick tools → draft an execution plan",
    ms: 900,
    real: "120 ms",
    tokens: 214,
    payload:
      '{\n  "intent": "incident.triage",\n  "tools": ["search_knowledge", "get_ticket", "add_ticket_message"],\n  "confidence": 0.94\n}',
  },
  {
    id: "s2",
    kind: "tool",
    name: "search_knowledge",
    detail: "3 chunks · incident-runbook.md, sso-faq.md",
    ms: 1250,
    real: "840 ms",
    tokens: 402,
    scope: "knowledge:read",
    payload:
      '{\n  "query": "SSO outage escalation runbook",\n  "matches": 3,\n  "top": "incident-runbook.md#escalation"\n}',
  },
  {
    id: "s3",
    kind: "tool",
    name: "get_ticket",
    detail: "ticket #4821 · severity high · open 11m",
    ms: 850,
    real: "310 ms",
    tokens: 96,
    scope: "ticket:read",
    payload:
      '{\n  "ticketId": "4821",\n  "severity": "high",\n  "status": "open"\n}',
  },
  {
    id: "s4",
    kind: "gate",
    name: "add_ticket_message",
    detail: "gated by policy “high-risk write” · severity high",
    ms: 700,
    real: "paused",
    tokens: 0,
    scope: "ticket:write",
    payload:
      '{\n  "ticketId": "4821",\n  "message": "Root cause: expired IdP signing key. Rotating key + flushing sessions.",\n  "internal": true\n}',
  },
  {
    id: "s5",
    kind: "synth",
    name: "synthesize",
    detail: "Answer with citations · confidence 0.91",
    ms: 1300,
    real: "1.1 s",
    tokens: 668,
    payload:
      '{\n  "citations": ["incident-runbook.md", "sso-faq.md"],\n  "confidence": 0.91\n}',
  },
];

const REFUND_RUN: RunMeta = {
  key: "refund",
  label: "Refund eligibility check",
  agent: "billing-refund-agent",
  environment: "production",
  trigger: "api",
  started: "2m 14s ago",
  interactive: false,
  status: "completed",
  evalScore: 88,
  evalDelta: "+3 vs v2",
  steps: [
    {
      id: "r1",
      kind: "plan",
      name: "plan",
      detail: "Check order history → apply refund policy → decide",
      ms: 0,
      real: "96 ms",
      tokens: 188,
      payload: '{\n  "intent": "billing.refund",\n  "confidence": 0.89\n}',
    },
    {
      id: "r2",
      kind: "tool",
      name: "search_knowledge",
      detail: "2 chunks · refund-policy.md",
      ms: 0,
      real: "610 ms",
      tokens: 344,
      scope: "knowledge:read",
      payload: '{\n  "query": "refund window 30 days",\n  "matches": 2\n}',
    },
    {
      id: "r3",
      kind: "tool",
      name: "get_ticket",
      detail: "ticket #8812 · order 8812 · eligible",
      ms: 0,
      real: "240 ms",
      tokens: 84,
      scope: "ticket:read",
      payload: '{\n  "orderId": "8812",\n  "eligible": true,\n  "amount": 49.0\n}',
    },
    {
      id: "r4",
      kind: "synth",
      name: "synthesize",
      detail: "Refund approved within policy · confidence 0.96",
      ms: 0,
      real: "870 ms",
      tokens: 512,
      payload: '{\n  "decision": "approve",\n  "confidence": 0.96\n}',
    },
  ],
};

const EXPORT_RUN: RunMeta = {
  key: "export",
  label: "Quarterly invoice export",
  agent: "export-orchestrator",
  environment: "production",
  trigger: "schedule",
  started: "11m ago",
  interactive: false,
  status: "failed",
  error:
    "ConnectorTimeout: billing-service did not respond within 5000ms — run failed at step 3, retry available.",
  steps: [
    {
      id: "e1",
      kind: "plan",
      name: "plan",
      detail: "Resolve date range → page invoices → stream CSV",
      ms: 0,
      real: "141 ms",
      tokens: 206,
      payload: '{\n  "intent": "billing.export",\n  "range": "2026-Q3"\n}',
    },
    {
      id: "e2",
      kind: "tool",
      name: "search_knowledge",
      detail: "1 chunk · export-format.md",
      ms: 0,
      real: "520 ms",
      tokens: 262,
      scope: "knowledge:read",
      payload: '{\n  "query": "csv column order invoices",\n  "matches": 1\n}',
    },
    {
      id: "e3",
      kind: "tool",
      name: "stream_invoices",
      detail: "billing-service · timed out after 5000ms",
      ms: 0,
      real: "5.0 s",
      tokens: 0,
      scope: "billing:read",
      error: "ConnectorTimeout",
      payload: '{\n  "batch": 1,\n  "cursor": null\n}',
    },
    {
      id: "e4",
      kind: "synth",
      name: "synthesize",
      detail: "never reached — the run failed at step 3",
      ms: 0,
      real: "—",
      tokens: 0,
      payload: "{}",
    },
  ],
};

const RUNS: RunMeta[] = [
  {
    key: "triage",
    label: "Incident triage",
    agent: "triage-agent",
    environment: "staging",
    trigger: "ci",
    started: "just now",
    interactive: true,
    status: "idle",
    steps: TRIAGE_STEPS,
    evalScore: 92,
    evalDelta: "+6 vs v3",
  },
  REFUND_RUN,
  EXPORT_RUN,
];

const EVAL_CASES = [
  { id: "auth-01", input: "SSO login failures across the org", pass: true },
  { id: "billing-01", input: "Refund request for order 8812", pass: true },
  { id: "export-01", input: "Export invoices as CSV", pass: true },
  { id: "latency-01", input: "P95 latency spiked after rollout", pass: true },
  { id: "edge-01", input: "Vague request with no ticket context", pass: false },
];

/* ================================================================== */
/*  Page                                                               */
/* ================================================================== */

const RUN_IDS: Record<string, string> = {
  triage: "run_8f31c2",
  refund: "run_5a90de",
  export: "run_77c1ab",
};

/* state of a static (pre-recorded) run's step at index i */
const staticState = (run: RunMeta, i: number): StepState => {
  if (run.status !== "failed") return "done";
  const failAt = run.steps.findIndex(s => !!s.error);
  if (failAt < 0) return "done";
  if (i < failAt) return "done";
  return i === failAt ? "failed" : "pending";
};

const kindIcon = (kind: Kind) => {
  if (kind === "plan") return Layers3;
  if (kind === "gate") return ShieldCheck;
  if (kind === "synth") return Sparkles;
  return Database;
};

const STATUS_LABEL: Record<Phase, string> = {
  idle: "READY",
  queued: "QUEUED",
  running: "RUNNING",
  waiting: "WAITING APPROVAL",
  completed: "COMPLETED",
  failed: "FAILED",
};

export default function PlaygroundPage() {
  const [activeKey, setActiveKey] = useState("triage");
  const [phase, setPhase] = useState<Phase>("idle");
  const [cursor, setCursor] = useState(0);
  const [stepStates, setStepStates] = useState<StepState[]>(() =>
    TRIAGE_STEPS.map(() => "pending"),
  );
  const [decision, setDecision] = useState<"approved" | "rejected" | null>(null);
  const [speed, setSpeed] = useState(1);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [elapsedRef, setElapsedRef] = useState(0);

  const activeRun = RUNS.find(r => r.key === activeKey) ?? RUNS[0];
  const isInteractive = activeRun.interactive;

  /* ----- playback driver ----- */
  useEffect(() => {
    if (!isInteractive) return;

    if (phase === "queued") {
      const t = window.setTimeout(() => {
        setStepStates(s => s.map((st, i) => (i === 0 ? "running" : st)));
        setPhase("running");
      }, 700);
      return () => window.clearTimeout(t);
    }

    if (phase === "running") {
      const step = TRIAGE_STEPS[cursor];
      if (!step) {
        setPhase("completed");
        return;
      }
      const t = window.setTimeout(() => {
        if (step.kind === "gate") {
          setPhase("waiting");
          return;
        }
        const next = cursor + 1;
        setStepStates(s =>
          s.map((st, i) =>
            i === cursor ? "done" : next < TRIAGE_STEPS.length && i === next ? "running" : st,
          ),
        );
        if (next >= TRIAGE_STEPS.length) setPhase("completed");
        else setCursor(next);
      }, Math.max(320, step.ms / speed));
      return () => window.clearTimeout(t);
    }
  }, [phase, cursor, speed, isInteractive]);

  /* ----- live elapsed clock ----- */
  useEffect(() => {
    if (!isInteractive) return;
    if (phase !== "queued" && phase !== "running" && phase !== "waiting") return;
    const started = Date.now() - elapsedRef;
    const id = window.setInterval(() => {
      const value = Date.now() - started;
      setElapsed(value);
      setElapsedRef(value);
    }, 100);
    return () => window.clearInterval(id);
  }, [phase, isInteractive, elapsedRef]);

  /* ----- actions ----- */
  const resetTriage = (start: boolean) => {
    setDecision(null);
    setCursor(0);
    setExpanded(null);
    setElapsed(0);
    setElapsedRef(0);
    setStepStates(TRIAGE_STEPS.map(() => "pending"));
    setPhase(start ? "queued" : "idle");
  };

  const selectRun = (key: string) => {
    if (key === activeKey) return;
    setActiveKey(key);
    if (key === "triage") resetTriage(false);
  };

  const decide = (approved: boolean) => {
    setDecision(approved ? "approved" : "rejected");
    if (approved) {
      const next = cursor + 1;
      setStepStates(s =>
        s.map((st, i) => (i === cursor ? "done" : i === next ? "running" : st)),
      );
      setCursor(next);
      setPhase("running");
    } else {
      setStepStates(s => s.map((st, i) => (i === cursor ? "failed" : st)));
      setPhase("failed");
    }
  };

  /* ----- derived ----- */
  const tokens = useMemo(() => {
    if (isInteractive)
      return stepStates.reduce(
        (sum, st, i) => (st === "done" ? sum + TRIAGE_STEPS[i].tokens : sum),
        0,
      );
    return activeRun.steps
      .filter((_, i) => staticState(activeRun, i) === "done")
      .reduce((sum, s) => sum + s.tokens, 0);
  }, [isInteractive, stepStates, activeRun]);

  const doneCount = isInteractive
    ? stepStates.filter(s => s === "done").length
    : activeRun.steps.filter((_, i) => staticState(activeRun, i) === "done").length;

  const toolCalls = isInteractive
    ? TRIAGE_STEPS.filter((s, i) => s.kind === "tool" && stepStates[i] === "done").length
    : activeRun.steps.filter(s => s.kind === "tool").length;

  const gateStep = TRIAGE_STEPS[3];

  /* ================================================================== */
  /*  JSX                                                               */
  /* ================================================================== */

  return (
    <div className="pg">
      <header className="pg-top">
        <Link href="/" className="pg-brand">
          <span className="pg-mark">
            <Image src={icon} alt="" width={22} height={22} />
          </span>
          <span className="pg-brand-copy">
            <b>RYUKSAIDSO</b>
            <small>live playground</small>
          </span>
        </Link>

        <div className="pg-chips">
          <span>
            <Check size={11} /> no signup
          </span>
          <span>
            <Zap size={11} /> scripted, instant, offline
          </span>
        </div>

        <nav>
          <Link href="/docs">Docs</Link>
          <Link href="/" className="pg-home">
            <Home size={14} />
            Home
          </Link>
        </nav>
      </header>

      <div className="pg-body">
        {/* ---------------- run rail ---------------- */}
        <aside className="pg-rail">
          <span className="pg-label">Runs</span>

          <div className="pg-runlist">
            {RUNS.map(r => (
              <button
                key={r.key}
                type="button"
                className={`pg-run ${r.key === activeKey ? "active" : ""}`}
                onClick={() => selectRun(r.key)}
              >
                <span
                  className="pg-run-dot"
                  data-status={
                    r.key === activeKey && isInteractive ? phase : r.status
                  }
                />
                <span className="pg-run-copy">
                  <b>{r.label}</b>
                  <small>{r.agent}</small>
                </span>
                <span className="pg-run-env">{r.environment.slice(0, 4)}</span>
              </button>
            ))}
          </div>

          <button
            type="button"
            className="pg-queue"
            onClick={() => {
              setActiveKey("triage");
              resetTriage(true);
            }}
          >
            <Play size={14} />
            Queue a new run
          </button>

          <p className="pg-rail-note">
            Everything here is a deterministic simulation — no account, no API
            keys, no network calls. The real control plane does exactly this
            with your data.
          </p>
        </aside>

        {/* ---------------- run detail ---------------- */}
        <main className="pg-main">
          <div className="pg-runhead">
            <div className="pg-runhead-left">
              <span
                className="pg-status"
                data-status={isInteractive ? phase : activeRun.status}
              >
                <i />
                {STATUS_LABEL[isInteractive ? phase : activeRun.status]}
              </span>
              <b>{activeRun.agent}</b>
              <small>
                {RUN_IDS[activeKey]} · {activeRun.environment} ·{" "}
                {activeRun.trigger} trigger · {activeRun.started}
              </small>
            </div>

            <div className="pg-runhead-right">
              {isInteractive && (phase === "running" || phase === "waiting") && (
                <span className="pg-elapsed">
                  {(elapsed / 1000).toFixed(1)}s
                </span>
              )}
              <div className="pg-speed" aria-label="Playback speed">
                {[1, 2].map(s => (
                  <button
                    key={s}
                    type="button"
                    className={speed === s ? "active" : ""}
                    onClick={() => setSpeed(s)}
                  >
                    {s}×
                  </button>
                ))}
              </div>
              {isInteractive && phase !== "running" && phase !== "waiting" && (
                <button
                  type="button"
                  className="pg-play"
                  onClick={() =>
                    resetTriage(phase === "idle" ? true : true)
                  }
                >
                  {phase === "idle" ? <Play size={14} /> : <RotateCcw size={14} />}
                  {phase === "idle" ? "Queue run" : "Run again"}
                </button>
              )}
            </div>
          </div>

          {/* progress segments */}
          <div className="pg-progress">
            {(isInteractive ? TRIAGE_STEPS : activeRun.steps).map((s, i) => (
              <span
                key={s.id}
                data-state={
                  isInteractive ? stepStates[i] : staticState(activeRun, i)
                }
              />
            ))}
          </div>

          {/* timeline */}
          <ol className="pg-steps">
            {(isInteractive ? TRIAGE_STEPS : activeRun.steps).map((step, i) => {
              const state: StepState = isInteractive
                ? stepStates[i]
                : staticState(activeRun, i);
              const Icon = kindIcon(step.kind);
              const key = `${activeKey}-${step.id}`;
              const open = expanded === key;
              const waitingHere =
                isInteractive && phase === "waiting" && i === cursor;

              return (
                <li
                  key={step.id}
                  className={`pg-step ${state}`}
                  data-kind={step.kind}
                  data-waiting={waitingHere}
                >
                  <button
                    type="button"
                    className="pg-step-main"
                    onClick={() => setExpanded(open ? null : key)}
                    aria-expanded={open}
                  >
                    <span className="pg-step-icon">
                      <Icon size={15} />
                    </span>

                    <span className="pg-step-copy">
                      <b>{step.name}</b>
                      <span>{step.detail}</span>
                      {step.scope && <code>{step.scope}</code>}
                    </span>

                    <span className="pg-step-side">
                      <span className="pg-step-time">
                        {state === "pending"
                          ? "queued"
                          : waitingHere
                            ? "paused"
                            : state === "failed"
                              ? step.error ?? "failed"
                              : step.real}
                      </span>
                      <span className="pg-step-tok">
                        {step.tokens ? `${step.tokens} tok` : "—"}
                      </span>
                      <ChevronDown
                        size={14}
                        className={`pg-caret ${open ? "open" : ""}`}
                      />
                    </span>
                  </button>

                  {open && (
                    <pre className="pg-payload">
                      <code>{step.payload}</code>
                    </pre>
                  )}
                </li>
              );
            })}
          </ol>

          {/* decision persists after the gate unmounts */}
          {isInteractive && decision !== null && phase !== "waiting" && (
            <div className={`pg-decision ${decision}`}>
              {decision === "approved" ? <Check size={15} /> : <X size={15} />}
              <span>
                {decision === "approved"
                  ? "Gate approved by you — a continuation was queued with the grant recorded against your identity. Execution continues."
                  : "Gate rejected by you — the run failed terminally instead of failing silently. Your decision is in the audit trail."}
              </span>
            </div>
          )}

          {/* approval gate */}
          {isInteractive && phase === "waiting" && (
            <section className="pg-approval">
              <header>
                <span className="pg-approval-icon">
                  <ShieldCheck size={17} />
                </span>
                <div>
                  <b>Approval required</b>
                  <span>policy “high-risk write” · severity high</span>
                </div>
                <span className="pg-waiting">
                  <i /> waiting for a human
                </span>
              </header>

              <dl>
                <div>
                  <dt>Action</dt>
                  <dd>
                    <code>{gateStep.scope}</code>
                  </dd>
                </div>
                <div>
                  <dt>Requested by</dt>
                  <dd>triage-agent · run_8f31c2</dd>
                </div>
                <div>
                  <dt>Scope</dt>
                  <dd>post an internal note on ticket #4821</dd>
                </div>
                <div>
                  <dt>Waiting</dt>
                  <dd>{(elapsed / 1000).toFixed(1)}s · SLA 15m</dd>
                </div>
              </dl>

              <pre className="pg-payload static">
                <code>{gateStep.payload}</code>
              </pre>

              {decision === null ? (
                <div className="pg-approval-actions">
                  <button
                    type="button"
                    className="pg-approve"
                    onClick={() => decide(true)}
                  >
                    <Check size={15} />
                    Approve &amp; continue
                  </button>
                  <button
                    type="button"
                    className="pg-reject"
                    onClick={() => decide(false)}
                  >
                    <X size={15} />
                    Reject run
                  </button>
                </div>
              ) : (
                <div className={`pg-decision ${decision}`}>
                  {decision === "approved" ? <Check size={15} /> : <X size={15} />}
                  <span>
                    {decision === "approved"
                      ? "Approved by you — a continuation was queued with the grant recorded against your identity. Execution continues."
                      : "Rejected by you — the run failed terminally instead of failing silently. Your decision is in the audit trail."}
                  </span>
                </div>
              )}
            </section>
          )}

          {/* outcome: failure */}
          {isInteractive && phase === "failed" && (
            <section className="pg-outcome failed">
              <span className="pg-outcome-icon">
                <X size={16} />
              </span>
              <div>
                <b>Run failed — approval rejected</b>
                <p>
                  The waiting run terminated with{" "}
                  <code>ApprovalRejected</code> on step{" "}
                  {cursor + 1}. Nothing was written to ticket #4821, and the
                  original trace is preserved exactly as it happened.
                </p>
              </div>
              <button type="button" onClick={() => resetTriage(true)}>
                <RotateCcw size={14} />
                Retry run
              </button>
            </section>
          )}

          {/* outcome: evaluation */}
          {((isInteractive && phase === "completed") ||
            (!isInteractive && activeRun.status === "completed")) && (
            <section className="pg-eval">
              <div className="pg-eval-score">
                <div className="pg-ring">
                  <svg viewBox="0 0 80 80" aria-hidden="true">
                    <circle cx="40" cy="40" r="33" className="track" />
                    <circle
                      cx="40"
                      cy="40"
                      r="33"
                      className="value"
                      style={{
                        strokeDashoffset:
                          207 - (207 * (activeRun.evalScore ?? 0)) / 100,
                      }}
                    />
                  </svg>
                  <div>
                    <b>{activeRun.evalScore}</b>
                    <small>score</small>
                  </div>
                </div>
                <div className="pg-eval-copy">
                  <b>
                    Evaluation passed ·{" "}
                    <span className="pg-delta">{activeRun.evalDelta}</span>
                  </b>
                  <p>
                    The run&rsquo;s transcript was scored against the
                    regression suite the moment it completed — this is the
                    evidence you pin a version with.
                  </p>
                  <span className="pg-eval-suite">
                    <TrendingUp size={12} /> incident-triage-regression · 4/5
                    pass
                  </span>
                </div>
              </div>

              <ul className="pg-cases">
                {EVAL_CASES.map(c => (
                  <li key={c.id} data-pass={c.pass}>
                    <span>{c.pass ? "pass" : "fail"}</span>
                    <code>{c.id}</code>
                    <em>{c.input}</em>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {/* outcome: static failure */}
          {!isInteractive && activeRun.status === "failed" && (
            <section className="pg-outcome failed">
              <span className="pg-outcome-icon">
                <X size={16} />
              </span>
              <div>
                <b>Run failed at step 3</b>
                <p>{activeRun.error}</p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setActiveKey("triage");
                  resetTriage(true);
                }}
              >
                <Play size={14} />
                Queue a working run
              </button>
            </section>
          )}
        </main>

        {/* ---------------- side rail ---------------- */}
        <aside className="pg-side">
          <section className="pg-metrics">
            <h4>
              <Activity size={13} /> Live metrics
            </h4>
            <div className="pg-metric">
              <b>
                {isInteractive
                  ? `${(elapsed / 1000).toFixed(1)}s`
                  : activeRun.started}
              </b>
              <span>{isInteractive ? "elapsed" : "started"}</span>
            </div>
            <div className="pg-metric">
              <b>{tokens.toLocaleString()}</b>
              <span>tokens used</span>
            </div>
            <div className="pg-metric">
              <b>
                {doneCount}/
                {isInteractive ? TRIAGE_STEPS.length : activeRun.steps.length}
              </b>
              <span>steps complete</span>
            </div>
            <div className="pg-metric">
              <b>{toolCalls}</b>
              <span>tool calls</span>
            </div>
          </section>

          <section className="pg-learn">
            <h4>
              <BookOpen size={13} /> What you&rsquo;re seeing
            </h4>
            <Link href="/docs#runs">
              <span className="pg-learn-icon">
                <Layers3 size={14} />
              </span>
              <span>
                <b>Durable traces</b>
                <small>Every step stored, replayable, timed</small>
              </span>
            </Link>
            <Link href="/docs#approvals">
              <span className="pg-learn-icon amber">
                <Shield size={14} />
              </span>
              <span>
                <b>Approval gates</b>
                <small>Risky calls wait for a person</small>
              </span>
            </Link>
            <Link href="/docs#evaluations">
              <span className="pg-learn-icon green">
                <TrendingUp size={14} />
              </span>
              <span>
                <b>Evidence &amp; evals</b>
                <small>Scores that gate what ships</small>
              </span>
            </Link>
            <Link href="/docs#api" className="pg-learn-cta">
              <Terminal size={13} />
              Do this over HTTP
              <Play size={11} />
            </Link>
          </section>
        </aside>
      </div>

      <footer className="pg-foot">
        <span>
          <Sparkles size={13} /> Playground · deterministic simulation of the
          control plane, running entirely in your browser
        </span>
        <div>
          <Link href="/docs">Docs</Link>
          <Link href="/architecture">Architecture</Link>
          <a href="http://faizcasm.me" target="_blank" rel="noopener noreferrer">
            Faizan Hameed
          </a>
        </div>
      </footer>
<style jsx>{`
  .pg {
    min-height: 100vh;
    background: var(--bg);
    color: var(--text);
    display: flex;
    flex-direction: column;
    font-size: 15px;
    padding-bottom: 0;
  }

  /* ---------------- top bar ---------------- */
  .pg-top {
    position: sticky;
    top: 0;
    z-index: 30;
    display: flex;
    align-items: center;
    gap: 18px;
    padding: 14px clamp(16px, 3vw, 32px);
    background: color-mix(in srgb, var(--bg) 86%, transparent);
    backdrop-filter: blur(14px);
    border-bottom: 1px solid var(--line);
  }
  /* Links render their <a> inside next/link, so styled-jsx cannot scope them —
     any rule ending on a Link anchor must use :global() or it never applies. */
  .pg-top :global(.pg-brand) {
    display: flex;
    align-items: center;
    gap: 11px;
    text-decoration: none;
    color: inherit;
  }
  .pg-mark {
    width: 34px;
    height: 34px;
    border-radius: 10px;
    background: linear-gradient(150deg, var(--accent), var(--accent2));
    display: grid;
    place-items: center;
    overflow: hidden;
    box-shadow: 0 8px 22px rgba(139, 92, 246, 0.32);
  }
  .pg-brand-copy {
    display: flex;
    flex-direction: column;
    line-height: 1.15;
  }
  .pg-brand-copy b {
    font-size: 13px;
    letter-spacing: 0.16em;
  }
  .pg-brand-copy small {
    font-size: 11px;
    color: var(--muted);
  }
  .pg-chips {
    display: flex;
    gap: 8px;
    margin-left: 4px;
  }
  .pg-chips span {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    font-size: 11px;
    color: var(--muted);
    border: 1px solid var(--line);
    background: var(--panel2);
    padding: 4px 9px;
    border-radius: 999px;
    white-space: nowrap;
  }
  .pg-top nav {
    margin-left: auto;
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .pg-top nav :global(a) {
    font-size: 13px;
    color: var(--muted);
    text-decoration: none;
    padding: 8px 12px;
    border-radius: 9px;
    transition: 0.16s;
  }
  .pg-top nav :global(a:hover) {
    color: var(--text);
    background: var(--panel);
  }
  .pg-top nav :global(.pg-home) {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    border: 1px solid var(--line);
    color: var(--text);
  }

  /* ---------------- layout ---------------- */
  .pg-body {
    flex: 1;
    display: grid;
    grid-template-columns: 258px minmax(0, 1fr) 268px;
    gap: 22px;
    padding: 26px clamp(16px, 3vw, 32px);
    align-items: start;
    max-width: 1480px;
    width: 100%;
    margin: 0 auto;
  }

  /* ---------------- run rail ---------------- */
  .pg-rail {
    position: sticky;
    top: 84px;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .pg-label {
    font-size: 11px;
    letter-spacing: 0.16em;
    text-transform: uppercase;
    color: var(--muted);
    padding-left: 2px;
  }
  .pg-runlist {
    display: flex;
    flex-direction: column;
    gap: 7px;
  }
  .pg-run {
    display: flex;
    align-items: center;
    gap: 10px;
    width: 100%;
    text-align: left;
    padding: 11px 12px;
    border-radius: 12px;
    border: 1px solid var(--line);
    background: var(--panel2);
    color: var(--text);
    cursor: pointer;
    transition: 0.16s;
  }
  .pg-run:hover {
    border-color: var(--line-strong, rgba(255, 255, 255, 0.18));
    transform: translateY(-1px);
  }
  .pg-run.active {
    border-color: var(--accent);
    background: color-mix(in srgb, var(--accent) 9%, var(--panel2));
    box-shadow: 0 10px 26px rgba(139, 92, 246, 0.16);
  }
  .pg-run-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    flex: none;
    background: var(--muted);
  }
  .pg-run-dot[data-status='completed'],
  .pg-run-dot[data-status='done'] {
    background: var(--good);
  }
  .pg-run-dot[data-status='failed'] {
    background: var(--bad);
  }
  .pg-run-dot[data-status='waiting'] {
    background: var(--warn);
    animation: pgPulse 1.1s ease-in-out infinite;
  }
  .pg-run-dot[data-status='running'],
  .pg-run-dot[data-status='queued'] {
    background: var(--accent2);
    animation: pgPulse 1.1s ease-in-out infinite;
  }
  .pg-run-copy {
    display: flex;
    flex-direction: column;
    min-width: 0;
    flex: 1;
  }
  .pg-run-copy b {
    font-size: 13px;
    font-weight: 600;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .pg-run-copy small {
    font-size: 11px;
    color: var(--muted);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .pg-run-env {
    font-size: 10px;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--muted);
    border: 1px solid var(--line);
    padding: 2px 6px;
    border-radius: 6px;
    flex: none;
  }
  .pg-queue {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 7px;
    margin-top: 4px;
    padding: 11px 12px;
    border-radius: 12px;
    border: 1px dashed var(--line-strong, rgba(255, 255, 255, 0.18));
    background: transparent;
    color: var(--text);
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
    transition: 0.16s;
  }
  .pg-queue:hover {
    border-style: solid;
    border-color: var(--accent);
    color: var(--accent2);
    background: color-mix(in srgb, var(--accent) 8%, transparent);
  }
  .pg-rail-note {
    margin: 8px 2px 0;
    font-size: 11.5px;
    line-height: 1.6;
    color: var(--muted);
    border-top: 1px dashed var(--line);
    padding-top: 12px;
  }

  /* ---------------- main column ---------------- */
  .pg-main {
    display: flex;
    flex-direction: column;
    gap: 18px;
    min-width: 0;
  }
  .pg-runhead {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 16px;
    flex-wrap: wrap;
  }
  .pg-runhead-left {
    display: flex;
    flex-direction: column;
    gap: 6px;
    min-width: 0;
  }
  .pg-runhead-left b {
    font-size: clamp(20px, 2.4vw, 26px);
    letter-spacing: -0.02em;
  }
  .pg-runhead-left small {
    font-size: 12px;
    color: var(--muted);
    font-family: var(--mono, ui-monospace, monospace);
  }
  .pg-status {
    display: inline-flex;
    align-items: center;
    gap: 7px;
    align-self: flex-start;
    font-size: 10.5px;
    font-weight: 700;
    letter-spacing: 0.14em;
    padding: 5px 10px;
    border-radius: 999px;
    border: 1px solid var(--line);
    background: var(--panel2);
    color: var(--muted);
  }
  .pg-status i {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: currentColor;
  }
  .pg-status[data-status='completed'] {
    color: var(--good);
    border-color: color-mix(in srgb, var(--good) 45%, transparent);
    background: color-mix(in srgb, var(--good) 10%, transparent);
  }
  .pg-status[data-status='failed'] {
    color: var(--bad);
    border-color: color-mix(in srgb, var(--bad) 45%, transparent);
    background: color-mix(in srgb, var(--bad) 10%, transparent);
  }
  .pg-status[data-status='waiting'] {
    color: var(--warn);
    border-color: color-mix(in srgb, var(--warn) 45%, transparent);
    background: color-mix(in srgb, var(--warn) 10%, transparent);
  }
  .pg-status[data-status='running'],
  .pg-status[data-status='queued'] {
    color: var(--accent2);
    border-color: color-mix(in srgb, var(--accent2) 45%, transparent);
    background: color-mix(in srgb, var(--accent2) 10%, transparent);
  }
  .pg-status[data-status='running'] i,
  .pg-status[data-status='waiting'] i,
  .pg-status[data-status='queued'] i {
    animation: pgPulse 1.1s ease-in-out infinite;
  }
  .pg-runhead-right {
    display: flex;
    align-items: center;
    gap: 10px;
    flex-wrap: wrap;
  }
  .pg-elapsed {
    font-family: var(--mono, ui-monospace, monospace);
    font-size: 13px;
    color: var(--accent2);
    background: var(--panel2);
    border: 1px solid var(--line);
    padding: 8px 11px;
    border-radius: 10px;
    min-width: 62px;
    text-align: center;
  }
  .pg-speed {
    display: inline-flex;
    padding: 3px;
    gap: 3px;
    border: 1px solid var(--line);
    border-radius: 10px;
    background: var(--panel2);
  }
  .pg-speed button {
    border: 0;
    background: transparent;
    color: var(--muted);
    font-size: 12px;
    font-weight: 600;
    padding: 5px 9px;
    border-radius: 7px;
    cursor: pointer;
    transition: 0.14s;
  }
  .pg-speed button.active {
    background: color-mix(in srgb, var(--accent) 22%, transparent);
    color: var(--text);
  }
  .pg-play {
    display: inline-flex;
    align-items: center;
    gap: 7px;
    padding: 10px 15px;
    border-radius: 10px;
    border: 1px solid transparent;
    background: linear-gradient(135deg, var(--accent), var(--accent2));
    color: #0a0b10;
    font-size: 13px;
    font-weight: 700;
    cursor: pointer;
    transition: 0.16s;
    box-shadow: 0 12px 26px rgba(139, 92, 246, 0.3);
  }
  .pg-play:hover {
    transform: translateY(-1px);
    filter: brightness(1.06);
  }

  /* progress */
  .pg-progress {
    display: flex;
    gap: 5px;
  }
  .pg-progress span {
    flex: 1;
    height: 4px;
    border-radius: 99px;
    background: var(--line);
    transition: 0.3s;
  }
  .pg-progress span[data-state='running'] {
    background: var(--accent2);
    animation: pgSlide 1.1s ease-in-out infinite;
  }
  .pg-progress span[data-state='done'] {
    background: var(--good);
  }
  .pg-progress span[data-state='failed'] {
    background: var(--bad);
  }

  /* ---------------- timeline ---------------- */
  .pg-steps {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 9px;
  }
  .pg-step {
    border: 1px solid var(--line);
    border-radius: 14px;
    background: var(--panel2);
    overflow: hidden;
    transition: 0.2s;
    position: relative;
  }
  .pg-step::before {
    content: '';
    position: absolute;
    left: 0;
    top: 12px;
    bottom: 12px;
    width: 3px;
    border-radius: 99px;
    background: transparent;
    transition: 0.2s;
  }
  .pg-step[data-kind='gate']::before {
    background: color-mix(in srgb, var(--warn) 65%, transparent);
  }
  .pg-step.done {
    border-color: color-mix(in srgb, var(--good) 30%, var(--line));
  }
  .pg-step.done::before {
    background: color-mix(in srgb, var(--good) 65%, transparent);
  }
  .pg-step.running {
    border-color: color-mix(in srgb, var(--accent2) 55%, var(--line));
    background: color-mix(in srgb, var(--accent2) 6%, var(--panel2));
    box-shadow: 0 12px 30px rgba(34, 211, 238, 0.12);
  }
  .pg-step.running::before {
    background: var(--accent2);
    animation: pgPulse 1.1s ease-in-out infinite;
  }
  .pg-step.failed {
    border-color: color-mix(in srgb, var(--bad) 55%, var(--line));
    background: color-mix(in srgb, var(--bad) 7%, var(--panel2));
  }
  .pg-step.failed::before {
    background: var(--bad);
  }
  .pg-step[data-waiting='true'] {
    border-color: color-mix(in srgb, var(--warn) 60%, var(--line));
    background: color-mix(in srgb, var(--warn) 7%, var(--panel2));
  }
  .pg-step.pending {
    opacity: 0.55;
  }
  .pg-step-main {
    display: flex;
    align-items: center;
    gap: 13px;
    width: 100%;
    text-align: left;
    padding: 13px 15px 13px 18px;
    background: transparent;
    border: 0;
    color: var(--text);
    cursor: pointer;
  }
  .pg-step-main:hover {
    background: color-mix(in srgb, var(--text) 4%, transparent);
  }
  .pg-step-icon {
    width: 32px;
    height: 32px;
    border-radius: 10px;
    flex: none;
    display: grid;
    place-items: center;
    background: var(--panel);
    border: 1px solid var(--line);
    color: var(--muted);
  }
  .pg-step.done .pg-step-icon {
    color: var(--good);
    border-color: color-mix(in srgb, var(--good) 40%, transparent);
  }
  .pg-step.running .pg-step-icon {
    color: var(--accent2);
    border-color: color-mix(in srgb, var(--accent2) 45%, transparent);
  }
  .pg-step.failed .pg-step-icon {
    color: var(--bad);
    border-color: color-mix(in srgb, var(--bad) 45%, transparent);
  }
  .pg-step[data-kind='gate'] .pg-step-icon {
    color: var(--warn);
    border-color: color-mix(in srgb, var(--warn) 45%, transparent);
  }
  .pg-step-copy {
    display: flex;
    flex-direction: column;
    gap: 3px;
    min-width: 0;
    flex: 1;
  }
  .pg-step-copy b {
    font-family: var(--mono, ui-monospace, monospace);
    font-size: 13.5px;
    letter-spacing: -0.01em;
  }
  .pg-step-copy span {
    font-size: 12.5px;
    color: var(--muted);
    line-height: 1.5;
  }
  .pg-step-copy code {
    justify-self: start;
    align-self: flex-start;
    font-size: 10.5px;
    letter-spacing: 0.04em;
    color: var(--warn);
    background: color-mix(in srgb, var(--warn) 12%, transparent);
    border: 1px solid color-mix(in srgb, var(--warn) 35%, transparent);
    padding: 2px 7px;
    border-radius: 6px;
  }
  .pg-step-side {
    display: flex;
    align-items: center;
    gap: 14px;
    flex: none;
    font-size: 11.5px;
    color: var(--muted);
  }
  .pg-step-time {
    font-family: var(--mono, ui-monospace, monospace);
    min-width: 74px;
    text-align: right;
  }
  .pg-step.running .pg-step-time {
    color: var(--accent2);
  }
  .pg-step.failed .pg-step-time {
    color: var(--bad);
  }
  .pg-step-tok {
    min-width: 56px;
    text-align: right;
    font-family: var(--mono, ui-monospace, monospace);
  }
  .pg-caret {
    transition: transform 0.18s;
    color: var(--muted);
  }
  .pg-caret.open {
    transform: rotate(180deg);
  }
  .pg-payload {
    margin: 0;
    padding: 13px 18px 15px;
    border-top: 1px dashed var(--line);
    background: color-mix(in srgb, var(--bg) 65%, var(--panel2));
    font-family: var(--mono, ui-monospace, monospace);
    font-size: 12px;
    line-height: 1.65;
    color: color-mix(in srgb, var(--text) 80%, var(--muted));
    overflow-x: auto;
    white-space: pre;
  }
  .pg-payload.static {
    border: 1px dashed var(--line);
    border-radius: 11px;
    padding: 12px 14px;
    background: color-mix(in srgb, var(--bg) 65%, var(--panel2));
  }

  /* ---------------- approval gate ---------------- */
  .pg-approval {
    border: 1px solid color-mix(in srgb, var(--warn) 55%, transparent);
    background: color-mix(in srgb, var(--warn) 8%, var(--panel));
    border-radius: 16px;
    padding: 18px;
    display: flex;
    flex-direction: column;
    gap: 15px;
    box-shadow: 0 24px 60px rgba(245, 158, 11, 0.14);
    animation: pgRise 0.35s ease both;
  }
  .pg-approval header {
    display: flex;
    align-items: center;
    gap: 12px;
    flex-wrap: wrap;
  }
  .pg-approval-icon {
    width: 38px;
    height: 38px;
    border-radius: 12px;
    display: grid;
    place-items: center;
    background: color-mix(in srgb, var(--warn) 22%, transparent);
    color: var(--warn);
    border: 1px solid color-mix(in srgb, var(--warn) 45%, transparent);
    flex: none;
  }
  .pg-approval header div {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .pg-approval header b {
    font-size: 15.5px;
  }
  .pg-approval header span {
    font-size: 12px;
    color: var(--muted);
  }
  .pg-waiting {
    margin-left: auto;
    display: inline-flex;
    align-items: center;
    gap: 7px;
    font-size: 11px;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: var(--warn);
    font-weight: 700;
  }
  .pg-waiting i {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: var(--warn);
    animation: pgPulse 1.1s ease-in-out infinite;
  }
  .pg-approval dl {
    margin: 0;
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(170px, 1fr));
    gap: 12px 20px;
    border-top: 1px dashed color-mix(in srgb, var(--warn) 35%, transparent);
    border-bottom: 1px dashed color-mix(in srgb, var(--warn) 35%, transparent);
    padding: 14px 0;
  }
  .pg-approval dt {
    font-size: 10.5px;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: var(--muted);
    margin-bottom: 4px;
  }
  .pg-approval dd {
    margin: 0;
    font-size: 13px;
  }
  .pg-approval dd code {
    font-family: var(--mono, ui-monospace, monospace);
    color: var(--warn);
    background: color-mix(in srgb, var(--warn) 14%, transparent);
    padding: 2px 7px;
    border-radius: 6px;
    font-size: 12px;
  }
  .pg-approval-actions {
    display: flex;
    gap: 11px;
    flex-wrap: wrap;
  }
  .pg-approve,
  .pg-reject {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    padding: 12px 20px;
    border-radius: 11px;
    font-size: 13.5px;
    font-weight: 700;
    cursor: pointer;
    transition: 0.16s;
    border: 1px solid transparent;
  }
  .pg-approve {
    background: color-mix(in srgb, var(--good) 88%, black);
    color: #04140e;
    box-shadow: 0 14px 30px rgba(52, 211, 153, 0.26);
  }
  .pg-approve:hover {
    transform: translateY(-1px);
    filter: brightness(1.07);
  }
  .pg-reject {
    background: transparent;
    color: var(--bad);
    border-color: color-mix(in srgb, var(--bad) 55%, transparent);
  }
  .pg-reject:hover {
    background: color-mix(in srgb, var(--bad) 14%, transparent);
  }
  .pg-decision {
    display: flex;
    align-items: flex-start;
    gap: 10px;
    padding: 13px 15px;
    border-radius: 12px;
    font-size: 13px;
    line-height: 1.6;
    animation: pgRise 0.3s ease both;
  }
  .pg-decision span {
    flex: 1;
  }
  .pg-decision.approved {
    background: color-mix(in srgb, var(--good) 14%, transparent);
    border: 1px solid color-mix(in srgb, var(--good) 45%, transparent);
    color: color-mix(in srgb, var(--good) 85%, var(--text));
  }
  .pg-decision.rejected {
    background: color-mix(in srgb, var(--bad) 14%, transparent);
    border: 1px solid color-mix(in srgb, var(--bad) 45%, transparent);
    color: color-mix(in srgb, var(--bad) 85%, var(--text));
  }

  /* ---------------- outcomes ---------------- */
  .pg-outcome {
    display: flex;
    align-items: flex-start;
    gap: 13px;
    padding: 17px 18px;
    border-radius: 16px;
    animation: pgRise 0.35s ease both;
    flex-wrap: wrap;
  }
  .pg-outcome.failed {
    border: 1px solid color-mix(in srgb, var(--bad) 55%, transparent);
    background: color-mix(in srgb, var(--bad) 9%, var(--panel));
  }
  .pg-outcome-icon {
    width: 34px;
    height: 34px;
    border-radius: 11px;
    display: grid;
    place-items: center;
    flex: none;
    background: color-mix(in srgb, var(--bad) 22%, transparent);
    color: var(--bad);
  }
  .pg-outcome > div {
    flex: 1;
    min-width: 220px;
  }
  .pg-outcome b {
    font-size: 15px;
  }
  .pg-outcome p {
    margin: 6px 0 0;
    font-size: 13px;
    line-height: 1.65;
    color: var(--muted);
  }
  .pg-outcome p code {
    font-family: var(--mono, ui-monospace, monospace);
    color: var(--bad);
    background: color-mix(in srgb, var(--bad) 13%, transparent);
    padding: 1px 6px;
    border-radius: 6px;
    font-size: 12px;
  }
  .pg-outcome > button {
    display: inline-flex;
    align-items: center;
    gap: 7px;
    padding: 10px 16px;
    border-radius: 10px;
    border: 1px solid var(--line-strong, rgba(255, 255, 255, 0.18));
    background: var(--panel2);
    color: var(--text);
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
    transition: 0.16s;
  }
  .pg-outcome > button:hover {
    border-color: var(--accent);
    color: var(--accent2);
  }

  /* ---------------- evaluation ---------------- */
  .pg-eval {
    border: 1px solid color-mix(in srgb, var(--good) 40%, transparent);
    background: color-mix(in srgb, var(--good) 7%, var(--panel));
    border-radius: 16px;
    padding: 18px;
    display: flex;
    flex-direction: column;
    gap: 16px;
    animation: pgRise 0.35s ease both;
  }
  .pg-eval-score {
    display: flex;
    align-items: center;
    gap: 18px;
    flex-wrap: wrap;
  }
  .pg-ring {
    position: relative;
    width: 88px;
    height: 88px;
    flex: none;
  }
  .pg-ring svg {
    width: 100%;
    height: 100%;
    transform: rotate(-90deg);
  }
  .pg-ring circle {
    fill: none;
    stroke-width: 7;
    stroke-linecap: round;
  }
  .pg-ring .track {
    stroke: color-mix(in srgb, var(--good) 18%, transparent);
  }
  .pg-ring .value {
    stroke: var(--good);
    stroke-dasharray: 207;
    animation: pgRing 1.1s cubic-bezier(0.2, 0.7, 0.3, 1) both;
  }
  .pg-ring > div {
    position: absolute;
    inset: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    line-height: 1;
  }
  .pg-ring b {
    font-size: 25px;
    letter-spacing: -0.03em;
    color: var(--good);
  }
  .pg-ring small {
    font-size: 10px;
    color: var(--muted);
    margin-top: 3px;
    text-transform: uppercase;
    letter-spacing: 0.12em;
  }
  .pg-eval-copy {
    flex: 1;
    min-width: 220px;
  }
  .pg-eval-copy b {
    font-size: 15.5px;
  }
  .pg-delta {
    color: var(--good);
    font-family: var(--mono, ui-monospace, monospace);
    font-size: 13px;
  }
  .pg-eval-copy p {
    margin: 7px 0 10px;
    font-size: 13px;
    line-height: 1.65;
    color: var(--muted);
  }
  .pg-eval-suite {
    display: inline-flex;
    align-items: center;
    gap: 7px;
    font-size: 11.5px;
    color: var(--good);
    background: color-mix(in srgb, var(--good) 12%, transparent);
    border: 1px solid color-mix(in srgb, var(--good) 35%, transparent);
    padding: 5px 10px;
    border-radius: 999px;
  }
  .pg-cases {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 7px;
  }
  .pg-cases li {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 9px 13px;
    border-radius: 11px;
    background: color-mix(in srgb, var(--bg) 55%, transparent);
    border: 1px solid var(--line);
    font-size: 12.5px;
    flex-wrap: wrap;
  }
  .pg-cases span {
    font-size: 10px;
    font-weight: 800;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    padding: 3px 8px;
    border-radius: 6px;
    flex: none;
  }
  .pg-cases li[data-pass='true'] span {
    color: var(--good);
    background: color-mix(in srgb, var(--good) 15%, transparent);
  }
  .pg-cases li[data-pass='false'] span {
    color: var(--bad);
    background: color-mix(in srgb, var(--bad) 15%, transparent);
  }
  .pg-cases code {
    font-family: var(--mono, ui-monospace, monospace);
    color: var(--muted);
    font-size: 11.5px;
    min-width: 76px;
  }
  .pg-cases em {
    font-style: normal;
    color: color-mix(in srgb, var(--text) 85%, var(--muted));
  }

  /* ---------------- side rail ---------------- */
  .pg-side {
    position: sticky;
    top: 84px;
    display: flex;
    flex-direction: column;
    gap: 16px;
  }
  .pg-metrics,
  .pg-learn {
    border: 1px solid var(--line);
    background: var(--panel2);
    border-radius: 16px;
    padding: 16px;
    display: flex;
    flex-direction: column;
    gap: 11px;
  }
  .pg-metrics h4,
  .pg-learn h4 {
    margin: 0;
    display: flex;
    align-items: center;
    gap: 7px;
    font-size: 11px;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: var(--muted);
  }
  .pg-metric {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 10px;
    padding-bottom: 9px;
    border-bottom: 1px dashed var(--line);
  }
  .pg-metric:last-child {
    border-bottom: 0;
    padding-bottom: 0;
  }
  .pg-metric b {
    font-size: 19px;
    letter-spacing: -0.02em;
    font-family: var(--mono, ui-monospace, monospace);
  }
  .pg-metric span {
    font-size: 11.5px;
    color: var(--muted);
  }
  .pg-learn :global(a) {
    display: flex;
    align-items: center;
    gap: 11px;
    padding: 9px 10px;
    border-radius: 11px;
    text-decoration: none;
    color: var(--text);
    border: 1px solid transparent;
    transition: 0.15s;
  }
  .pg-learn :global(a:hover) {
    background: var(--panel);
    border-color: var(--line);
  }
  .pg-learn-icon {
    width: 30px;
    height: 30px;
    border-radius: 9px;
    display: grid;
    place-items: center;
    flex: none;
    background: color-mix(in srgb, var(--accent) 16%, transparent);
    color: var(--accent2);
  }
  .pg-learn-icon.amber {
    background: color-mix(in srgb, var(--warn) 16%, transparent);
    color: var(--warn);
  }
  .pg-learn-icon.green {
    background: color-mix(in srgb, var(--good) 16%, transparent);
    color: var(--good);
  }
  .pg-learn :global(a) > span:last-child {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
  }
  .pg-learn :global(a) b {
    font-size: 13px;
  }
  .pg-learn :global(a) small {
    font-size: 11.5px;
    color: var(--muted);
  }
  .pg-learn :global(.pg-learn-cta) {
    justify-content: center;
    gap: 8px;
    border: 1px dashed var(--line-strong, rgba(255, 255, 255, 0.18));
    font-size: 12.5px;
    font-weight: 600;
    margin-top: 3px;
  }
  .pg-learn :global(.pg-learn-cta:hover) {
    border-style: solid;
    border-color: var(--accent);
    color: var(--accent2);
  }

  /* ---------------- footer ---------------- */
  .pg-foot {
    border-top: 1px solid var(--line);
    padding: 16px clamp(16px, 3vw, 32px);
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 14px;
    flex-wrap: wrap;
    font-size: 12px;
    color: var(--muted);
    background: var(--panel2);
  }
  .pg-foot span {
    display: inline-flex;
    align-items: center;
    gap: 8px;
  }
  .pg-foot div {
    display: flex;
    gap: 16px;
  }
  .pg-foot :global(a) {
    color: var(--muted);
    text-decoration: none;
    transition: 0.15s;
  }
  .pg-foot :global(a:hover) {
    color: var(--text);
  }

  /* ---------------- motion ---------------- */
  @keyframes pgPulse {
    0%,
    100% {
      opacity: 1;
    }
    50% {
      opacity: 0.35;
    }
  }
  @keyframes pgSlide {
    0% {
      opacity: 0.5;
    }
    50% {
      opacity: 1;
    }
    100% {
      opacity: 0.5;
    }
  }
  @keyframes pgRise {
    from {
      opacity: 0;
      transform: translateY(10px);
    }
    to {
      opacity: 1;
      transform: none;
    }
  }
  @keyframes pgRing {
    from {
      stroke-dashoffset: 207;
    }
  }

  /* ---------------- responsive ---------------- */
  @media (max-width: 1180px) {
    .pg-body {
      grid-template-columns: minmax(0, 1fr) 260px;
    }
    .pg-rail {
      grid-column: 1 / -1;
      position: static;
      flex-direction: row;
      align-items: center;
      flex-wrap: wrap;
      gap: 9px;
      padding-bottom: 4px;
      border-bottom: 1px dashed var(--line);
    }
    .pg-rail .pg-label {
      width: 100%;
    }
    .pg-runlist {
      flex-direction: row;
      flex-wrap: wrap;
      flex: 1;
    }
    .pg-run {
      width: auto;
      min-width: 190px;
    }
    .pg-rail-note {
      display: none;
    }
  }
  @media (max-width: 900px) {
    .pg-body {
      grid-template-columns: minmax(0, 1fr);
    }
    .pg-side {
      position: static;
      flex-direction: row;
      flex-wrap: wrap;
    }
    .pg-metrics,
    .pg-learn {
      flex: 1;
      min-width: 240px;
    }
    .pg-chips {
      display: none;
    }
    .pg-step-side {
      gap: 9px;
    }
    .pg-step-tok {
      display: none;
    }
    .pg-step-time {
      min-width: 64px;
    }
  }
  @media (max-width: 560px) {
    .pg-top nav :global(a:not(.pg-home)) {
      display: none;
    }
    .pg-step-main {
      flex-wrap: wrap;
      gap: 10px;
    }
    .pg-step-side {
      width: 100%;
      justify-content: flex-end;
    }
    .pg-waiting {
      margin-left: 0;
      width: 100%;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    * {
      animation-duration: 0.01ms !important;
      transition-duration: 0.01ms !important;
    }
  }
`}</style>
    </div>
  );
}


