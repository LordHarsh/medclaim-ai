/**
 * The visual parts a claim is shown with. Each one answers a single question at a glance:
 * where is it (track), what happened (verdict), where did the money go (split), which rules held (rule grid),
 * how suspicious is it (fraud meter), how sure is the system (confidence).
 */
import {
  Ban,
  Check,
  CircleAlert,
  Clock,
  FileCheck,
  FileText,
  Gavel,
  Hourglass,
  LoaderCircle,
  Minus,
  Scale,
  ScanText,
  ShieldAlert,
  TriangleAlert,
  Upload,
  X,
} from "lucide-react";
import { cx, inr, titleCase } from "@/components/ui";
import {
  AGENT_STEPS,
  OUTCOME,
  asList,
  fileName,
  str,
  type AgentStep,
  type Dict,
  type Money,
  type Outcome,
  type RuleResult,
  type StepState,
} from "./model";

/* ── Status pill ───────────────────────────────────────────────────────── */

const OUTCOME_ICON: Record<Outcome, React.ComponentType<{ className?: string; strokeWidth?: number }>> = {
  approved: Check,
  partial: Check,
  rejected: X,
  review: Hourglass,
  stopped: Upload,
  failed: CircleAlert,
  running: LoaderCircle,
  queued: Clock,
};

export function StatusPill({ outcome, label }: { outcome: Outcome; label?: string }) {
  const o = OUTCOME[outcome];
  const Icon = OUTCOME_ICON[outcome];
  return (
    <span className={cx("inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-[12px] font-medium", o.soft, o.text)}>
      <Icon className={cx("h-3 w-3", outcome === "running" && "animate-spin")} strokeWidth={2.6} />
      {label ?? o.label}
    </span>
  );
}

/* ── Pipeline track ────────────────────────────────────────────────────── */

export const STEP_ICON: Record<AgentStep, React.ComponentType<{ className?: string; strokeWidth?: number }>> = {
  DOCUMENT_VERIFICATION: FileCheck,
  DOCUMENT_EXTRACTION: ScanText,
  POLICY_ENGINE: Scale,
  FRAUD_DETECTION: ShieldAlert,
  FINAL_DECISION: Gavel,
};

const NODE: Record<StepState, string> = {
  waiting: "border-line-strong bg-surface text-ink-3",
  running: "border-wait bg-wait-soft text-wait",
  done: "border-ink bg-ink text-white",
  issue: "border-stop bg-stop-soft text-stop",
  failed: "border-bad bg-bad-soft text-bad",
  skipped: "border-dashed border-line-strong bg-surface text-ink-3 opacity-55",
};

const STATE_WORD: Record<StepState, string> = {
  waiting: "waiting",
  running: "running",
  done: "done",
  issue: "stopped here",
  failed: "failed",
  skipped: "not run",
};

/**
 * The five agents as a track that fills in from the left. Pass `onSelect` to make the steps clickable.
 */
export function PipelineTrack({
  states,
  selected,
  onSelect,
  size = "md",
}: {
  states: StepState[];
  selected?: AgentStep | null;
  onSelect?: (step: AgentStep) => void;
  size?: "md" | "lg";
}) {
  const box = size === "lg" ? "h-12 w-12" : "h-10 w-10";
  const icon = size === "lg" ? "h-5 w-5" : "h-[18px] w-[18px]";
  return (
    <ol className="grid grid-cols-5" aria-label="Pipeline progress">
      {AGENT_STEPS.map((a, i) => {
        const state = states[i] ?? "waiting";
        const Icon = STEP_ICON[a.step];
        const reached = state === "done" || state === "issue" || state === "failed";
        const on = selected === a.step;
        const clickable = !!onSelect && state !== "waiting" && state !== "skipped" && state !== "running";
        const node = (
          <span
            className={cx(
              "relative z-10 flex items-center justify-center rounded-full border-2 transition-colors duration-300",
              box,
              NODE[state],
              on && "ring-2 ring-ink ring-offset-2 ring-offset-surface",
            )}
          >
            {state === "running" ? <LoaderCircle className={cx(icon, "animate-spin")} /> : <Icon className={icon} strokeWidth={2} />}
          </span>
        );
        const label = (
          <span className={cx("mt-2 block text-center text-[12px] leading-tight sm:text-[13px]", on || state === "running" ? "font-semibold text-ink" : "text-ink-2", state === "skipped" && "opacity-55")}>
            <span className="sm:hidden">{a.short}</span>
            <span className="hidden sm:inline">{a.name}</span>
            <span className="sr-only">, {STATE_WORD[state]}</span>
          </span>
        );
        return (
          <li key={a.step} className="relative flex flex-col items-center">
            {i > 0 && (
              <span aria-hidden="true" className={cx("absolute right-1/2 h-0.5 w-full", size === "lg" ? "top-6" : "top-5", states[i] === "skipped" ? "border-t-2 border-dashed border-line-strong" : "bg-line-strong")}>
                {reached || state === "running" ? <span className="block h-full origin-left animate-fill bg-ink" /> : null}
              </span>
            )}
            {clickable ? (
              <button type="button" onClick={() => onSelect?.(a.step)} aria-pressed={on} className="flex flex-col items-center rounded-lg">
                {node}
                {label}
              </button>
            ) : (
              <span className="flex flex-col items-center">
                {node}
                {label}
              </span>
            )}
          </li>
        );
      })}
    </ol>
  );
}

const DOT: Record<StepState, string> = {
  waiting: "bg-line-strong",
  running: "bg-wait animate-pulse",
  done: "bg-ink",
  issue: "bg-stop",
  failed: "bg-bad",
  skipped: "bg-line",
};

/** The same track, small enough for a table row. */
export function MiniTrack({ states }: { states: StepState[] }) {
  const done = states.filter((s) => s === "done").length;
  return (
    <span className="inline-flex items-center gap-1" role="img" aria-label={`${done} of 5 steps done`}>
      {states.map((s, i) => (
        <span key={i} className={cx("h-1.5 w-4 rounded-full", DOT[s])} />
      ))}
    </span>
  );
}

/* ── Money split ───────────────────────────────────────────────────────── */

export function MoneySplit({ money, payer = "You pay" }: { money: Money; payer?: string }) {
  const { claimed, covered, copay, discount, notCovered, youPay } = money;
  const pct = (v: number) => `${Math.max((v / Math.max(claimed, 1)) * 100, 0)}%`;
  const decided = covered !== null;
  return (
    <div>
      <div className="grid grid-cols-3 gap-3">
        <Figure label="Claimed" value={inr(claimed)} />
        <Figure label="Covered" value={decided ? inr(covered) : "Pending"} tone={decided ? (covered > 0 ? "text-ok" : "text-bad") : "text-ink-3"} />
        <Figure label={payer} value={youPay !== null ? inr(youPay) : "Pending"} tone={youPay === null ? "text-ink-3" : undefined} />
      </div>
      <div
        className="mt-4 flex h-3 w-full overflow-hidden rounded-full bg-sunken"
        role="img"
        aria-label={
          decided
            ? `Of ${inr(claimed)} claimed: ${inr(covered)} covered, ${inr(copay)} co-pay, ${inr(discount)} network discount, ${inr(notCovered)} not covered`
            : "Not decided yet"
        }
      >
        {decided && (
          <>
            <span className="h-full bg-ok" style={{ width: pct(covered) }} />
            <span className="h-full bg-wait" style={{ width: pct(discount) }} />
            <span className="h-full bg-ink-3" style={{ width: pct(copay) }} />
            <span className="hatch h-full" style={{ width: pct(notCovered) }} />
          </>
        )}
      </div>
      {!decided && money.wouldCover !== null && (
        <p className="mt-2.5 text-[12px] text-ink-2">
          If approved: <span className="tabular-nums text-ink">{inr(money.wouldCover)}</span>
        </p>
      )}
      {decided && (
        <ul className="mt-2.5 flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-ink-2">
          {covered > 0 && <Key swatch="bg-ok" label="Covered" value={inr(covered)} />}
          {discount > 0 && <Key swatch="bg-wait" label={`Network discount ${money.discountPercent}%`} value={inr(discount)} />}
          {copay > 0 && <Key swatch="bg-ink-3" label={`Co-pay ${money.copayPercent}%`} value={inr(copay)} />}
          {notCovered > 0 && <Key swatch="hatch" label="Not covered" value={inr(notCovered)} />}
        </ul>
      )}
    </div>
  );
}

function Figure({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div>
      <p className="text-[11px] font-medium uppercase tracking-[0.06em] text-ink-3">{label}</p>
      <p className={cx("mt-0.5 text-[20px] font-semibold leading-tight tracking-[-0.01em] tabular-nums sm:text-[22px]", tone)}>{value}</p>
    </div>
  );
}

function Key({ swatch, label, value }: { swatch: string; label: string; value: string }) {
  return (
    <li className="flex items-center gap-1.5">
      <span className={cx("h-2.5 w-2.5 rounded-[3px]", swatch)} aria-hidden="true" />
      {label} <span className="tabular-nums text-ink">{value}</span>
    </li>
  );
}

/* ── Rule grid ─────────────────────────────────────────────────────────── */

const RULE: Record<RuleResult["state"], string> = {
  pass: "border-line bg-surface text-ink",
  fail: "border-bad/40 bg-bad-soft text-bad",
  "not-run": "border-dashed border-line-strong bg-transparent text-ink-3",
};

export function RuleGrid({ rules }: { rules: RuleResult[] }) {
  const failed = rules.filter((r) => r.state === "fail");
  const passed = rules.filter((r) => r.state === "pass").length;
  return (
    <div>
      <ul className="grid grid-cols-2 gap-1.5 sm:grid-cols-5" aria-label={`${passed} of ${rules.length} rules passed`}>
        {rules.map((r) => (
          <li key={r.name} title={r.detail || "Not run"} className={cx("flex items-center gap-1.5 rounded-ctl border px-2 py-1.5 text-[12px] leading-tight", RULE[r.state])}>
            {r.state === "pass" ? (
              <Check className="h-3.5 w-3.5 shrink-0 text-ok" strokeWidth={3} aria-hidden="true" />
            ) : r.state === "fail" ? (
              <X className="h-3.5 w-3.5 shrink-0" strokeWidth={3} aria-hidden="true" />
            ) : (
              <Minus className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            )}
            <span className="truncate">{r.short}</span>
            <span className="sr-only">{r.state === "pass" ? "passed" : r.state === "fail" ? "failed" : "not run"}</span>
          </li>
        ))}
      </ul>
      {failed.map((r) => (
        <p key={r.name} className="mt-2.5 flex gap-2 text-[13px] text-ink">
          <Ban className="mt-0.5 h-3.5 w-3.5 shrink-0 text-bad" aria-hidden="true" />
          <span>{sentence(r.detail)}</span>
        </p>
      ))}
    </div>
  );
}

const sentence = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

/* ── Fraud meter ───────────────────────────────────────────────────────── */

export function FraudMeter({ score, risk, signals }: { score: number; risk?: string; signals: Dict[] }) {
  const tone = score >= 0.5 ? { bar: "bg-bad", text: "text-bad" } : score >= 0.3 ? { bar: "bg-part", text: "text-part" } : { bar: "bg-ok", text: "text-ok" };
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <p className={cx("text-[22px] font-semibold leading-none tabular-nums", tone.text)}>
          {score.toFixed(2)}
          <span className="ml-2 text-[13px] font-medium">{risk ? `${titleCase(risk)} risk` : ""}</span>
        </p>
        <p className="text-[12px] text-ink-3">Review at 0.50</p>
      </div>
      <div className="relative mt-2.5 h-3 rounded-full bg-sunken" role="img" aria-label={`Fraud score ${score.toFixed(2)} out of 1. A person reviews the claim at 0.50 or above.`}>
        <span className={cx("block h-full rounded-full", tone.bar)} style={{ width: `${Math.min(Math.max(score, 0.015), 1) * 100}%` }} />
        <span className="absolute -top-1 left-1/2 h-5 w-0.5 bg-ink" aria-hidden="true" />
      </div>
      {signals.length === 0 ? (
        <p className="mt-3 flex items-center gap-1.5 text-[13px] text-ink-2">
          <Check className="h-3.5 w-3.5 text-ok" strokeWidth={3} aria-hidden="true" /> No signals
        </p>
      ) : (
        <ul className="mt-3 space-y-1.5">
          {signals.map((s, i) => (
            <li key={i} className="flex items-start gap-2 rounded-ctl border border-line px-2.5 py-2 text-[13px]">
              <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0 text-bad" aria-hidden="true" />
              <span className="min-w-0">
                <span className="font-medium">{typeof s === "string" ? titleCase(s) : sentence(str(s.description) || titleCase(str(s.signal_type)))}</span>
                {typeof s !== "string" && s.evidence ? <span className="block text-[12px] text-ink-3">{str(s.evidence)}</span> : null}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/* ── Confidence ────────────────────────────────────────────────────────── */

export function Confidence({ score, deductions = [] }: { score: number; deductions?: Dict[] }) {
  const low = score < 0.6;
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <p className={cx("text-[22px] font-semibold leading-none tabular-nums", low && "text-review")}>{Math.round(score * 100)}%</p>
        <p className="text-[12px] text-ink-3">Review under 60%</p>
      </div>
      <div className="relative mt-2.5 h-3 rounded-full bg-sunken" role="img" aria-label={`Confidence ${Math.round(score * 100)} percent. A person reviews the claim under 60 percent.`}>
        <span className={cx("block h-full rounded-full", low ? "bg-review" : "bg-ink")} style={{ width: `${Math.min(Math.max(score, 0), 1) * 100}%` }} />
        <span className="absolute -top-1 left-[60%] h-5 w-0.5 bg-ink-3" aria-hidden="true" />
      </div>
      {deductions.length > 0 && (
        <ul className="mt-3 flex flex-wrap gap-1.5">
          {deductions.map((d, i) => (
            <li key={i} className="rounded-full bg-sunken px-2 py-0.5 text-[12px] text-ink-2">
              <span className="tabular-nums text-ink">−{Math.round(Number(d.deduction) * 100)}</span> {str(d.reason)}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/* ── Documents ─────────────────────────────────────────────────────────── */

export interface DocView {
  name: string;
  url?: string;
  type?: string;
  quality?: number | null;
  readable?: boolean;
  patient?: string;
}

/** Joins what the member uploaded (names, and images when we have them) with what the first agent read off each. */
export function docsFrom(verification: Dict, images: { name: string; url: string }[] = []): DocView[] {
  const read = asList(verification.documents);
  if (read.length === 0) return images.map((d) => ({ name: d.name, url: d.url }));
  return read.map((d) => {
    const name = fileName(d.s3_key ?? d.key) || "Document";
    return {
      name,
      url: images.find((x) => x.name === name)?.url,
      type: str(d.detected_type ?? d.type) || undefined,
      quality: typeof d.quality_score === "number" ? d.quality_score : null,
      readable: typeof d.is_readable === "boolean" ? d.is_readable : undefined,
      patient: str(d.patient_name_found ?? d.patient_name) || undefined,
    };
  });
}

export function DocThumbs({ docs }: { docs: DocView[] }) {
  if (docs.length === 0) return null;
  return (
    <ul className="flex flex-wrap gap-2.5">
      {docs.map((d, i) => {
        const bad = d.readable === false || (typeof d.quality === "number" && d.quality < 0.5);
        const body = (
          <>
            <span className="relative block h-24 w-full overflow-hidden bg-sunken">
              {d.url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={d.url} alt="" loading="lazy" className="h-full w-full object-cover object-top" />
              ) : (
                <span className="flex h-full w-full items-center justify-center text-ink-3">
                  <FileText className="h-7 w-7" strokeWidth={1.5} aria-hidden="true" />
                </span>
              )}
              {typeof d.quality === "number" && (
                <span className={cx("absolute right-1.5 top-1.5 rounded-full px-1.5 py-0.5 text-[10px] font-medium tabular-nums", bad ? "bg-bad text-white" : "bg-surface/95 text-ink-2")}>
                  {Math.round(d.quality * 100)}%
                </span>
              )}
            </span>
            <span className="block border-t border-line px-2 py-1.5">
              <span className={cx("block truncate text-[12px] font-medium", bad && "text-bad")}>{d.type ? titleCase(d.type) : d.name}</span>
              {d.type && <span className="block truncate text-[11px] text-ink-3">{d.patient ?? d.name}</span>}
            </span>
          </>
        );
        const cls = "block w-[132px] overflow-hidden rounded-ctl border border-line bg-surface text-left";
        return (
          <li key={`${d.name}-${i}`}>
            {d.url ? (
              <a href={d.url} target="_blank" rel="noreferrer" className={cx(cls, "hover:border-line-strong")} aria-label={`Open ${d.type ? titleCase(d.type) : d.name}`}>
                {body}
              </a>
            ) : (
              <span className={cls}>{body}</span>
            )}
          </li>
        );
      })}
    </ul>
  );
}

/* ── Line items ────────────────────────────────────────────────────────── */

export function LineItems({ items }: { items: Dict[] }) {
  if (items.length === 0) return null;
  const judged = items.some((i) => typeof i.approved === "boolean");
  return (
    <ul className="divide-y divide-line overflow-hidden rounded-ctl border border-line text-[13px]">
      {items.map((it, i) => {
        const ok = it.approved === true;
        return (
          <li key={i} className="flex items-center gap-2.5 px-3 py-2" title={str(it.reason)}>
            {judged &&
              (ok ? (
                <Check className="h-3.5 w-3.5 shrink-0 text-ok" strokeWidth={3} aria-label="Covered" />
              ) : (
                <X className="h-3.5 w-3.5 shrink-0 text-bad" strokeWidth={3} aria-label="Not covered" />
              ))}
            <span className={cx("min-w-0 flex-1 truncate", judged && !ok && "text-ink-3 line-through")}>{str(it.description)}</span>
            <span className={cx("tabular-nums", judged && !ok && "text-ink-3")}>{inr(typeof it.amount === "number" ? it.amount : null)}</span>
          </li>
        );
      })}
    </ul>
  );
}
