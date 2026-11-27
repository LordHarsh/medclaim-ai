"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { AGENTS, type DemoSample, type TraceStep } from "@/lib/demo/samples";

/* ───────────────────────── small helpers ───────────────────────── */

type Dict = Record<string, unknown>;
const asDict = (v: unknown): Dict => (v && typeof v === "object" && !Array.isArray(v) ? (v as Dict) : {});
const asList = (v: unknown): Dict[] => (Array.isArray(v) ? (v as Dict[]) : []);
const str = (v: unknown): string => (v === null || v === undefined ? "" : String(v));
const rupees = (v: unknown): string =>
  typeof v === "number" ? `Rs. ${v.toLocaleString("en-IN", { maximumFractionDigits: 2 })}` : "--";
const titleCase = (s: string) =>
  s
    .toLowerCase()
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");

const DECISION_STYLE: Record<string, string> = {
  APPROVED: "bg-emerald-50 text-emerald-700 border-emerald-200",
  PARTIAL: "bg-amber-50 text-amber-700 border-amber-200",
  REJECTED: "bg-red-50 text-red-700 border-red-200",
  MANUAL_REVIEW: "bg-violet-50 text-violet-700 border-violet-200",
  NEEDS_REUPLOAD: "bg-sky-50 text-sky-700 border-sky-200",
};

function outcomeOf(sample: DemoSample): string {
  return sample.run.decision ?? sample.run.status;
}

function OutcomePill({ outcome }: { outcome: string }) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[12px] font-medium ${
        DECISION_STYLE[outcome] ?? "bg-slate-50 text-slate-700 border-slate-200"
      }`}
    >
      {outcome === "NEEDS_REUPLOAD" ? "Stopped: re-upload" : titleCase(outcome)}
    </span>
  );
}

/* ───────────────────────── the page body ───────────────────────── */

/** How long each agent is shown as running during a replay. The real run took far longer (see the recorded time). */
const STEP_MS = 1100;

export function DemoClient({ samples }: { samples: DemoSample[] }) {
  const [activeId, setActiveId] = useState(samples[0]?.id ?? "");
  const sample = samples.find((s) => s.id === activeId) ?? samples[0];

  // revealed = how many agents have finished in the replay; running = the one in progress (or -1)
  const [revealed, setRevealed] = useState(0);
  const [running, setRunning] = useState(-1);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const stepsRun = sample.run.trace.steps.length; // 1 when the pipeline stopped early, 5 otherwise
  const finished = revealed >= stepsRun && running === -1;

  function stop() {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  }

  function play(from = 0) {
    stop();
    setRevealed(from);
    const tick = (i: number) => {
      if (i >= stepsRun) {
        setRunning(-1);
        return;
      }
      setRunning(i);
      timer.current = setTimeout(() => {
        setRevealed(i + 1);
        tick(i + 1);
      }, STEP_MS);
    };
    tick(from);
  }

  function showAll() {
    stop();
    setRunning(-1);
    setRevealed(stepsRun);
  }

  function choose(id: string) {
    stop();
    setRunning(-1);
    setRevealed(0);
    setActiveId(id);
  }

  useEffect(() => stop, []);

  const tc = sample.testCase;
  const outcome = outcomeOf(sample);
  const recordedOn = new Date(sample.run.recorded_at).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });

  return (
    <div className="space-y-8">
      {/* ── 1. pick a claim ── */}
      <section>
        <h2 className="heading-sm text-[var(--ink)]">1. Pick a claim</h2>
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {samples.map((s) => {
            const on = s.id === sample.id;
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => choose(s.id)}
                aria-pressed={on}
                className={`rounded-xl border bg-[var(--canvas)] p-4 text-left transition-colors ${
                  on
                    ? "border-[var(--primary-indigo)] ring-1 ring-[var(--primary-indigo)]"
                    : "border-[var(--hairline)] hover:border-[var(--ink-mute)]"
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <span className="text-[15px] font-medium text-[var(--ink)]">{s.title}</span>
                  <OutcomePill outcome={outcomeOf(s)} />
                </div>
                <p className="mt-2 text-[13px] leading-5 text-[var(--ink-mute)]">{s.why}</p>
              </button>
            );
          })}
        </div>
      </section>

      {/* ── 2. what was submitted ── */}
      <section className="rounded-xl border border-[var(--hairline)] bg-[var(--canvas)] shadow-level-1">
        <div className="border-b border-[var(--hairline)] px-5 py-4">
          <h2 className="heading-sm text-[var(--ink)]">2. What the member submitted</h2>
          <p className="mt-1 text-[13px] text-[var(--ink-mute)]">{tc.description}</p>
        </div>
        <div className="grid grid-cols-1 gap-6 p-5 lg:grid-cols-[minmax(0,260px)_1fr]">
          <dl className="space-y-2 text-[13px]">
            <Row k="Member" v={tc.input.member_id} />
            <Row k="Category" v={titleCase(tc.input.claim_category)} />
            <Row k="Treatment date" v={tc.input.treatment_date} />
            <Row k="Claimed" v={rupees(tc.input.claimed_amount)} />
            {tc.input.hospital_name && <Row k="Hospital" v={tc.input.hospital_name} />}
            {tc.input.claims_history && tc.input.claims_history.length > 0 && (
              <Row k="Earlier that day" v={`${tc.input.claims_history.length} other claims by this member`} />
            )}
          </dl>
          <div>
            <p className="text-[12px] uppercase tracking-[0.4px] text-[var(--ink-mute)]">
              Documents ({sample.documents.length}). Synthetic; click to open.
            </p>
            <div className="mt-2 flex flex-wrap gap-3">
              {sample.documents.map((d) => (
                <a
                  key={d.url}
                  href={d.url}
                  target="_blank"
                  rel="noreferrer"
                  className="block w-[220px] overflow-hidden rounded-lg border border-[var(--hairline)] hover:border-[var(--ink-mute)]"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={d.url} alt={`Sample document ${d.name}`} loading="lazy" className="h-[124px] w-full object-cover object-top" />
                  <span className="block truncate border-t border-[var(--hairline)] px-2 py-1 font-mono text-[11px] text-[var(--ink-mute)]">
                    {d.name}
                  </span>
                </a>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── 3. the pipeline ── */}
      <section className="rounded-xl border border-[var(--hairline)] bg-[var(--canvas)] shadow-level-1">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--hairline)] px-5 py-4">
          <div>
            <h2 className="heading-sm text-[var(--ink)]">3. Watch the pipeline decide it</h2>
            <p className="mt-1 text-[13px] text-[var(--ink-mute)]">
              A replay of the real run from {recordedOn}. Every value below was written by the pipeline; only the pacing
              is sped up (the real run took {(sample.run.duration_ms / 1000).toFixed(0)}s from queue to result).
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => play(0)} className="btn-pill btn-pill-primary inline-flex items-center px-5 text-sm">
              {revealed === 0 && running === -1 ? "Run the claim" : "Replay"}
            </button>
            {!finished && (
              <button type="button" onClick={showAll} className="btn-pill btn-pill-secondary inline-flex items-center text-sm">
                Skip to the end
              </button>
            )}
          </div>
        </div>

        <ol className="divide-y divide-[var(--hairline)]">
          {AGENTS.map((agent, i) => {
            const step = sample.run.trace.steps.find((s) => s.step_name === agent.step);
            const state: "waiting" | "running" | "done" | "skipped" =
              i >= stepsRun ? (finished ? "skipped" : "waiting") : i < revealed ? "done" : running === i ? "running" : "waiting";
            return (
              <li key={agent.step} className="px-5 py-4">
                <div className="flex items-start gap-3">
                  <StepDot n={i + 1} state={state} />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                      <span className="text-[15px] font-medium text-[var(--ink)]">{agent.name}</span>
                      <span className="text-[12px] text-[var(--ink-mute)]">{agent.kind}</span>
                      <span className="text-[12px] text-[var(--ink-mute)]">· {agent.onFailure}</span>
                    </div>
                    <p className="mt-1 text-[13px] leading-5 text-[var(--ink-mute)]">{agent.does}</p>

                    {state === "running" && (
                      <p className="mt-3 text-[13px] text-[var(--primary-indigo)]" role="status">
                        Running…
                      </p>
                    )}
                    {state === "skipped" && (
                      <p className="mt-3 rounded-lg bg-[var(--canvas-soft)] px-3 py-2 text-[13px] text-[var(--ink-mute)]">
                        Never ran. Verification stopped the pipeline, so no model time was spent past this point and no
                        decision was recorded.
                      </p>
                    )}
                    {state === "done" && step && (
                      <div className="mt-3">
                        <StepOutput step={step} />
                      </div>
                    )}
                  </div>
                </div>
              </li>
            );
          })}
        </ol>

        {finished && (
          <div className="border-t border-[var(--hairline)] bg-[var(--canvas-soft)] px-5 py-4">
            <div className="flex flex-wrap items-center gap-3">
              <span className="text-[13px] text-[var(--ink-mute)]">Result</span>
              <OutcomePill outcome={outcome} />
              {sample.run.approved_amount !== null && (
                <span className="text-[14px] tabular-nums text-[var(--ink)]">{rupees(sample.run.approved_amount)}</span>
              )}
              {sample.run.confidence_score !== null && (
                <span className="text-[13px] text-[var(--ink-mute)]">confidence {sample.run.confidence_score.toFixed(2)}</span>
              )}
            </div>
            <Expected sample={sample} />
            <details className="mt-3">
              <summary className="cursor-pointer text-[13px] text-[var(--primary-indigo)]">
                Raw trace JSON, as stored on the claim
              </summary>
              <pre className="mt-2 max-h-[420px] overflow-auto rounded-lg border border-[var(--hairline)] bg-[var(--canvas)] p-3 font-mono text-[11px] leading-4 text-[var(--ink-secondary)]">
                {JSON.stringify(sample.run.trace, null, 2)}
              </pre>
            </details>
          </div>
        )}
      </section>

      {/* ── 4. run it for real ── */}
      <section className="rounded-xl border border-[var(--hairline)] bg-[var(--canvas)] p-5 shadow-level-1">
        <h2 className="heading-sm text-[var(--ink)]">4. Run it live</h2>
        <p className="mt-2 max-w-3xl text-[14px] leading-6 text-[var(--ink-secondary)]">
          The replay above costs nothing and needs no account. To put the same claims through the deployed system (SQS,
          the Lambda worker, the models, the database), sign in and open the test runner. It can submit any of the twelve
          test cases, shows each one moving through the agents, and checks the result against what was expected. One
          claim takes about a minute.
        </p>
        <div className="mt-4 flex flex-wrap gap-3">
          <Link href="/admin/eval" className="btn-pill btn-pill-primary inline-flex items-center px-5 text-sm">
            Open the test runner
          </Link>
          <Link href="/admin" className="btn-pill btn-pill-secondary inline-flex items-center text-sm">
            Operations dashboard
          </Link>
          <Link href="/claims/new" className="btn-pill btn-pill-secondary inline-flex items-center text-sm">
            Submit your own claim
          </Link>
        </div>
        <p className="mt-3 text-[12px] text-[var(--ink-mute)]">
          All three ask you to create an account first. If you submit your own claim, the bill has to be dated within
          the last 30 days, or the submission-deadline rule will reject it.
        </p>
      </section>
    </div>
  );
}

/* ───────────────────────── pieces ───────────────────────── */

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-[var(--ink-mute)]">{k}</dt>
      <dd className="text-right text-[var(--ink)]">{v}</dd>
    </div>
  );
}

function StepDot({ n, state }: { n: number; state: "waiting" | "running" | "done" | "skipped" }) {
  const cls =
    state === "done"
      ? "bg-[var(--primary-indigo)] text-white border-[var(--primary-indigo)]"
      : state === "running"
        ? "border-[var(--primary-indigo)] text-[var(--primary-indigo)] animate-pulse"
        : state === "skipped"
          ? "border-[var(--hairline)] text-[var(--ink-mute)] opacity-60"
          : "border-[var(--hairline)] text-[var(--ink-mute)]";
  return (
    <span className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-[12px] font-medium ${cls}`}>
      {state === "done" ? "✓" : n}
    </span>
  );
}

function Expected({ sample }: { sample: DemoSample }) {
  const exp = sample.testCase.expected;
  const expectedOutcome = exp.early_stop ? "NEEDS_REUPLOAD" : (exp.decision ?? "");
  const got = outcomeOf(sample);
  const amountOk =
    exp.approved_amount === undefined || exp.approved_amount === null || exp.approved_amount === sample.run.approved_amount;
  const ok = expectedOutcome === got && amountOk;
  return (
    <p className="mt-2 text-[13px] text-[var(--ink-mute)]">
      The test case expects{" "}
      <span className="text-[var(--ink)]">
        {exp.early_stop ? "a stop before any decision" : titleCase(expectedOutcome)}
        {typeof exp.approved_amount === "number" ? ` for ${rupees(exp.approved_amount)}` : ""}
      </span>
      . {ok ? "This run matched it." : "This run did not match it."}
      {exp.notes ? ` ${exp.notes}` : ""}
    </p>
  );
}

function Box({ children }: { children: React.ReactNode }) {
  return <div className="rounded-lg border border-[var(--hairline)] bg-[var(--canvas-soft)] p-3 text-[13px] text-[var(--ink-secondary)]">{children}</div>;
}

function StepOutput({ step }: { step: TraceStep }) {
  const d = asDict(step.details);
  switch (step.step_name) {
    case "DOCUMENT_VERIFICATION":
      return <Verification d={d} />;
    case "DOCUMENT_EXTRACTION":
      return <Extraction d={d} />;
    case "POLICY_ENGINE":
      return <Policy d={d} />;
    case "FRAUD_DETECTION":
      return <Fraud d={d} />;
    case "FINAL_DECISION":
      return <Decision d={d} />;
    default:
      return null;
  }
}

function Verification({ d }: { d: Dict }) {
  const docs = asList(d.documents);
  const stopped = d.should_stop_early === true;
  return (
    <Box>
      <ul className="space-y-1">
        {docs.map((doc, i) => (
          <li key={i} className="flex flex-wrap gap-x-3">
            <span className="font-mono text-[12px]">{str(doc.s3_key).split("/").pop()}</span>
            <span>
              read as <b className="font-medium text-[var(--ink)]">{titleCase(str(doc.detected_type))}</b>
            </span>
            <span>quality {str(doc.quality_score)}</span>
            {doc.patient_name_found ? <span>patient: {str(doc.patient_name_found)}</span> : null}
          </li>
        ))}
      </ul>
      {stopped ? (
        <p className="mt-2 rounded-md border border-sky-200 bg-sky-50 px-3 py-2 text-sky-800">
          <b className="font-medium">Stopped ({titleCase(str(d.early_stop_reason))}).</b>{" "}Message sent to the member:{" "}
          &ldquo;{str(d.error_message)}&rdquo;
        </p>
      ) : (
        <p className="mt-2">Right documents for this category, readable, and all for the same patient. The pipeline continues.</p>
      )}
    </Box>
  );
}

function Extraction({ d }: { d: Dict }) {
  const rx = asDict(d.prescription);
  const bill = Object.keys(asDict(d.hospital_bill)).length ? asDict(d.hospital_bill) : asDict(d.pharmacy_bill);
  const diagnosis = Array.isArray(rx.diagnosis) ? (rx.diagnosis as unknown[]).map(str).join(", ") : str(rx.diagnosis);
  const items = asList(bill.line_items);
  return (
    <Box>
      <dl className="grid grid-cols-1 gap-x-6 gap-y-1 sm:grid-cols-2">
        {diagnosis && <Row k="Diagnosis" v={diagnosis} />}
        {rx.doctor_name ? <Row k="Doctor" v={str(rx.doctor_name)} /> : null}
        {bill.hospital_name ? <Row k="Billed by" v={str(bill.hospital_name)} /> : null}
        {typeof bill.total === "number" ? <Row k="Bill total" v={rupees(bill.total)} /> : null}
      </dl>
      {items.length > 0 && (
        <ul className="mt-2 space-y-0.5 border-t border-[var(--hairline)] pt-2">
          {items.map((it, i) => (
            <li key={i} className="flex justify-between gap-4">
              <span>{str(it.description)}</span>
              <span className="tabular-nums">{rupees(it.amount)}</span>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-2 text-[12px] text-[var(--ink-mute)]">
        Extraction confidence {str(d.extraction_confidence)}. Values are shown exactly as the model read them, mistakes
        included.
      </p>
    </Box>
  );
}

function Policy({ d }: { d: Dict }) {
  const rules = asList(d.rule_evaluations);
  const calc = asDict(d.calculation_breakdown);
  const lines = asList(d.line_item_decisions);
  return (
    <Box>
      <ul className="space-y-1">
        {rules.map((r, i) => {
          const passed = r.passed === true;
          return (
            <li key={i} className="flex gap-2">
              <span className={passed ? "text-emerald-600" : "text-red-600"} aria-hidden="true">
                {passed ? "✓" : "✕"}
              </span>
              <span>
                <b className="font-medium text-[var(--ink)]">{titleCase(str(r.rule_name))}</b>
                <span className="sr-only">{passed ? " passed" : " failed"}</span>: {str(r.details)}
                {!passed && r.blocking === true ? " (blocking: the rules after it were not run)" : ""}
              </span>
            </li>
          );
        })}
      </ul>
      {lines.length > 0 && (
        <ul className="mt-2 space-y-0.5 border-t border-[var(--hairline)] pt-2">
          {lines.map((l, i) => (
            <li key={i} className="flex justify-between gap-4">
              <span>
                {str(l.description)}: {l.approved === true ? "paid" : "not paid"} ({str(l.reason)})
              </span>
              <span className="tabular-nums">{rupees(l.amount)}</span>
            </li>
          ))}
        </ul>
      )}
      {typeof calc.final_approved_amount === "number" && (
        <p className="mt-2 border-t border-[var(--hairline)] pt-2 tabular-nums">
          {rupees(calc.eligible_amount)} eligible, less {str(calc.network_discount_percent)}% network discount (
          {rupees(calc.discount_amount)}), less {str(calc.copay_percent)}% co-pay ({rupees(calc.copay_amount)}) ={" "}
          <b className="font-medium text-[var(--ink)]">{rupees(calc.final_approved_amount)}</b>
        </p>
      )}
    </Box>
  );
}

function Fraud({ d }: { d: Dict }) {
  const signals = asList(d.signals);
  return (
    <Box>
      <p>
        Score <b className="font-medium text-[var(--ink)]">{str(d.fraud_score)}</b>, risk {titleCase(str(d.risk_level))}.{" "}
        {d.requires_manual_review === true
          ? "That forces a manual review (a score of 0.50 or more, or a claim above the policy's review amount, does)."
          : "Below 0.50, so it does not force a manual review."}
      </p>
      {signals.length === 0 ? (
        <p className="mt-1">None of the eight signals fired.</p>
      ) : (
        <ul className="mt-2 space-y-1">
          {signals.map((s, i) => (
            <li key={i}>
              <b className="font-medium text-[var(--ink)]">{titleCase(str(s.signal_type))}</b>: {str(s.description)}. Evidence:{" "}
              {str(s.evidence)} (severity {str(s.severity)} × weight {str(s.weight)})
            </li>
          ))}
        </ul>
      )}
    </Box>
  );
}

function Decision({ d }: { d: Dict }) {
  const deductions = asList(d.confidence_deductions);
  return (
    <Box>
      <div className="flex flex-wrap items-center gap-3">
        <OutcomePill outcome={str(d.decision)} />
        {typeof d.approved_amount === "number" && <span className="tabular-nums text-[var(--ink)]">{rupees(d.approved_amount)}</span>}
        <span>confidence {str(d.confidence_score)}</span>
      </div>
      {deductions.length > 0 && (
        <p className="mt-2">
          Confidence starts at 0.95. Deducted: {deductions.map((x) => `${str(x.deduction)} for ${str(x.reason)}`).join("; ")}.
        </p>
      )}
      <p className="mt-2">
        <span className="text-[var(--ink-mute)]">To the member: </span>
        {str(d.user_message)}
      </p>
      <p className="mt-2">
        <span className="text-[var(--ink-mute)]">To operations: </span>
        {str(d.ops_summary)}
      </p>
    </Box>
  );
}
