"use client";

/**
 * One claim, drawn the same way everywhere: the verdict and where the money went on top, the five agents as a
 * track underneath, and the detail of whichever agent is selected. Members and the operations team see the same
 * shapes; operations get a little more (the internal note, rule wording, the raw trace).
 */
import { useState } from "react";
import { Check, CircleAlert, FileWarning, TriangleAlert, Users } from "lucide-react";
import { Card, Code, Label, More, Notice, cx, duration, inr, titleCase } from "@/components/ui";
import {
  AGENT_STEPS,
  OUTCOME,
  asDict,
  asList,
  decidingStep,
  isFinished,
  moneyOf,
  outcomeOf,
  rulesOf,
  stepStates,
  stepsOf,
  str,
  type AgentStep,
  type ClaimLike,
  type Dict,
  type Outcome,
  type Step,
  type StepState,
} from "./model";
import { Confidence, DocThumbs, FraudMeter, LineItems, MoneySplit, PipelineTrack, RuleGrid, STEP_ICON, StatusPill, docsFrom } from "./pieces";

export type Audience = "member" | "ops";

export interface ClaimResultProps {
  claim: ClaimLike;
  audience: Audience;
  /** Images of the uploaded documents, when the screen has them. */
  documents?: { name: string; url: string }[];
  /** Replay control: draw the track from these states instead of the claim's own, and hide the verdict until told. */
  states?: StepState[];
  hideVerdict?: boolean;
  selected?: AgentStep | null;
  onSelect?: (step: AgentStep) => void;
  /** Extra controls placed beside the verdict (for example a link to upload again). */
  actions?: React.ReactNode;
  /** Put the verdict under the track, where a replay arrives at it. */
  verdictLast?: boolean;
}

export function ClaimResult({ claim, audience, documents = [], states, hideVerdict = false, selected, onSelect, actions, verdictLast = false }: ClaimResultProps) {
  const steps = stepsOf(claim.trace_json);
  const own = stepStates(claim);
  const shown = states ?? own;
  const [picked, setPicked] = useState<AgentStep | null>(null);
  const controlled = selected !== undefined;
  const current = controlled ? selected : (picked ?? (steps.length > 0 ? decidingStep(claim) : null));
  const select = (s: AgentStep) => (controlled ? onSelect?.(s) : setPicked(s));

  const outcome = outcomeOf(claim);
  const finished = isFinished(claim.status);
  const trace = asDict(claim.trace_json);
  const final = asDict(steps.find((s) => s.step_name === "FINAL_DECISION")?.details ?? trace.final_decision);
  const showMoney = finished && !hideVerdict && outcome !== "stopped" && outcome !== "failed";
  const step = current ? steps.find((s) => s.step_name === current) : undefined;
  const stepIndex = current ? AGENT_STEPS.findIndex((a) => a.step === current) : -1;
  const stepVisible = step && stepIndex >= 0 && (shown[stepIndex] === "done" || shown[stepIndex] === "issue" || shown[stepIndex] === "failed");

  const verdict = !hideVerdict && (
    <div id="verdict" className={cx("grid scroll-mt-20 gap-4", showMoney && "lg:grid-cols-2")}>
      <Verdict claim={claim} outcome={outcome} final={final} audience={audience} actions={actions} />
      {showMoney && (
        <Card className="animate-rise p-5">
          <MoneySplit money={moneyOf(claim)} payer={audience === "member" ? "You pay" : "Member pays"} />
        </Card>
      )}
    </div>
  );

  return (
    <div className="space-y-4">
      {!verdictLast && verdict}

      {audience === "ops" && trace.degraded === true && (
        <Notice tone="stop" icon={<TriangleAlert className="h-4 w-4" />} title="Ran degraded">
          {Array.isArray(trace.degradation_notes) ? (trace.degradation_notes as unknown[]).map(str).join(" · ") : null}
        </Notice>
      )}

      <Card className="p-5">
        <PipelineTrack states={shown} selected={stepVisible ? current : null} onSelect={steps.length > 0 ? select : undefined} />
        {stepVisible && step && (
          <div key={step.step_name} className="mt-5 animate-rise border-t border-line pt-5">
            <StepPanel step={step} audience={audience} documents={documents} />
          </div>
        )}
      </Card>

      {verdictLast && verdict}

      {audience === "ops" && !hideVerdict && Object.keys(trace).length > 0 && (
        <More label="Raw trace">
          <Code>{JSON.stringify(claim.trace_json, null, 2)}</Code>
        </More>
      )}
    </div>
  );
}

/* ── Verdict ───────────────────────────────────────────────────────────── */

function Verdict({
  claim,
  outcome,
  final,
  audience,
  actions,
}: {
  claim: ClaimLike;
  outcome: Outcome;
  final: Dict;
  audience: Audience;
  actions?: React.ReactNode;
}) {
  const o = OUTCOME[outcome];
  const money = moneyOf(claim);
  const verification = asDict(stepsOf(claim.trace_json).find((s) => s.step_name === "DOCUMENT_VERIFICATION")?.details);
  const missing = Array.isArray(verification.missing_required_types) ? (verification.missing_required_types as unknown[]).map(str) : [];
  const reasons = (claim.rejection_reasons ?? []).filter(Boolean);
  const note = audience === "ops" ? str(final.ops_summary) || str(final.user_message) : str(final.user_message);

  let headline: React.ReactNode = null;
  if (outcome === "approved" || outcome === "partial") {
    headline = (
      <p className="mt-3 text-[40px] font-semibold leading-none tracking-[-0.03em] tabular-nums">
        {inr(money.covered)}
        <span className="ml-2 text-[14px] font-normal tracking-normal text-ink-3">of {inr(money.claimed)}</span>
      </p>
    );
  } else if (outcome === "rejected") {
    headline = (
      <p className="mt-3 text-[40px] font-semibold leading-none tracking-[-0.03em] tabular-nums">
        ₹0<span className="ml-2 text-[14px] font-normal tracking-normal text-ink-3">of {inr(money.claimed)}</span>
      </p>
    );
  } else if (outcome === "review") {
    headline = (
      <p className="mt-3 text-[40px] font-semibold leading-none tracking-[-0.03em] tabular-nums">
        {inr(money.claimed)}
        <span className="ml-2 text-[14px] font-normal tracking-normal text-ink-3">on hold</span>
      </p>
    );
  }

  return (
    <Card className={cx("animate-rise p-5", o.ring)}>
      <div className="flex items-start justify-between gap-3">
        <StatusPill outcome={outcome} />
        {claim.confidence_score !== null && outcome !== "stopped" && outcome !== "failed" && (
          <span className="text-[12px] text-ink-3">
            Confidence <span className="tabular-nums text-ink">{Math.round(claim.confidence_score * 100)}%</span>
          </span>
        )}
      </div>
      {headline}

      {(reasons.length > 0 || missing.length > 0) && (
        <ul className="mt-3 flex flex-wrap gap-1.5">
          {missing.map((m) => (
            <li key={m} className={cx("rounded-full px-2 py-0.5 text-[12px] font-medium", o.soft, o.text)}>
              Missing: {titleCase(m)}
            </li>
          ))}
          {reasons.map((r) => (
            <li key={r} className={cx("rounded-full px-2 py-0.5 text-[12px] font-medium", o.soft, o.text)}>
              {titleCase(r)}
            </li>
          ))}
        </ul>
      )}

      {note && <p className="mt-3 text-[14px] text-ink-2">{note}</p>}
      {!note && (outcome === "stopped" || outcome === "failed") && claim.error_message && (
        <p className="mt-3 text-[14px] text-ink-2">{claim.error_message}</p>
      )}
      {(outcome === "running" || outcome === "queued") && <p className="mt-3 text-[14px] text-ink-2">About a minute.</p>}
      {actions && <div className="mt-4 flex flex-wrap gap-2">{actions}</div>}
    </Card>
  );
}

/* ── One agent's output ────────────────────────────────────────────────── */

function StepPanel({ step, audience, documents }: { step: Step; audience: Audience; documents: { name: string; url: string }[] }) {
  const d = asDict(step.details);
  const meta = AGENT_STEPS.find((a) => a.step === step.step_name);
  const Icon = meta ? STEP_ICON[meta.step] : CircleAlert;
  const errored = step.status === "FAILED" || step.status === "ERROR";
  return (
    <div>
      <div className="mb-4 flex items-center gap-2">
        <Icon className="h-4 w-4 text-ink-3" />
        <h3 className="text-[15px] font-semibold">{meta?.name ?? titleCase(step.step_name)}</h3>
        {step.status === "DEGRADED" && <StatusPill outcome="stopped" label="Degraded" />}
        {typeof step.duration_ms === "number" && <span className="ml-auto text-[12px] tabular-nums text-ink-3">{duration(step.duration_ms)}</span>}
      </div>
      {(errored || step.error) && (
        <div className="mb-4">
          <Notice tone="bad" icon={<CircleAlert className="h-4 w-4" />} title="This step failed">
            {str(step.error) || str(d.error_message)}
          </Notice>
        </div>
      )}
      {step.step_name === "DOCUMENT_VERIFICATION" && <Verification d={d} documents={documents} />}
      {step.step_name === "DOCUMENT_EXTRACTION" && <Extraction d={d} audience={audience} />}
      {step.step_name === "POLICY_ENGINE" && <Policy d={d} audience={audience} />}
      {step.step_name === "FRAUD_DETECTION" && <Fraud d={d} />}
      {step.step_name === "FINAL_DECISION" && <Decision d={d} audience={audience} />}
    </div>
  );
}

function Verification({ d, documents }: { d: Dict; documents: { name: string; url: string }[] }) {
  const docs = docsFrom(d, documents);
  const stopped = d.should_stop_early === true;
  const missing = Array.isArray(d.missing_required_types) ? (d.missing_required_types as unknown[]).map(str) : [];
  const patients = [...new Set(docs.map((x) => x.patient).filter(Boolean))] as string[];
  return (
    <div className="space-y-4">
      <DocThumbs docs={docs} />
      {stopped ? (
        <Notice
          tone="stop"
          icon={<FileWarning className="h-4 w-4" />}
          title={missing.length > 0 ? `Missing: ${missing.map(titleCase).join(", ")}` : titleCase(str(d.early_stop_reason) || "Stopped")}
        >
          {str(d.error_message)}
        </Notice>
      ) : (
        patients.length > 0 && (
          <p className="flex items-center gap-1.5 text-[13px] text-ink-2">
            {patients.length === 1 ? <Check className="h-3.5 w-3.5 text-ok" strokeWidth={3} /> : <Users className="h-3.5 w-3.5 text-bad" />}
            {patients.length === 1 ? `Same patient: ${patients[0]}` : `Different patients: ${patients.join(", ")}`}
          </p>
        )
      )}
    </div>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  if (!value) return null;
  return (
    <div className="min-w-0">
      <Label>{label}</Label>
      <p className="mt-0.5 truncate text-[14px]" title={value}>
        {value}
      </p>
    </div>
  );
}

function Extraction({ d, audience }: { d: Dict; audience: Audience }) {
  const rx = asDict(d.prescription);
  const bill = Object.keys(asDict(d.hospital_bill)).length ? asDict(d.hospital_bill) : asDict(d.pharmacy_bill);
  const lab = asDict(d.lab_report);
  const diagnosis = Array.isArray(rx.diagnosis) ? (rx.diagnosis as unknown[]).map(str)[0] ?? "" : str(rx.diagnosis);
  const medicines = asList(rx.medicines);
  const conf = typeof d.extraction_confidence === "number" ? d.extraction_confidence : null;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-4">
        <Fact label="Diagnosis" value={diagnosis} />
        <Fact label="Doctor" value={str(rx.doctor_name)} />
        <Fact label="Billed by" value={str(bill.hospital_name ?? bill.pharmacy_name)} />
        <Fact label="Bill total" value={typeof bill.total === "number" ? inr(bill.total) : ""} />
      </div>
      <LineItems items={asList(bill.line_items)} />
      {(medicines.length > 0 || Object.keys(lab).length > 0 || conf !== null) && (
        <ul className="flex flex-wrap gap-1.5 text-[12px] text-ink-2">
          {conf !== null && <li className="rounded-full bg-sunken px-2 py-0.5">Read confidence {Math.round(conf * 100)}%</li>}
          {medicines.map((m, i) => (
            <li key={i} className="rounded-full bg-sunken px-2 py-0.5">
              {str(m.name)}
            </li>
          ))}
          {Object.keys(lab).length > 0 && <li className="rounded-full bg-sunken px-2 py-0.5">Lab report read</li>}
        </ul>
      )}
      {audience === "ops" && (
        <More label="Everything that was read">
          <Code>{JSON.stringify(d, null, 2)}</Code>
        </More>
      )}
    </div>
  );
}

function Policy({ d, audience }: { d: Dict; audience: Audience }) {
  const rules = rulesOf(d);
  const lines = asList(d.line_item_decisions);
  return (
    <div className="space-y-4">
      <RuleGrid rules={rules} />
      <LineItems items={lines} />
      <More label={audience === "ops" ? "Rule wording" : "What each rule checked"}>
        <ul className="space-y-1 text-[13px] text-ink-2">
          {rules
            .filter((r) => r.state !== "not-run")
            .map((r) => (
              <li key={r.name} className="flex gap-2">
                <span className={cx("w-28 shrink-0 font-medium", r.state === "fail" ? "text-bad" : "text-ink")}>{r.short}</span>
                <span className="min-w-0">{r.detail}</span>
              </li>
            ))}
        </ul>
      </More>
    </div>
  );
}

function Fraud({ d }: { d: Dict }) {
  const score = typeof d.fraud_score === "number" ? d.fraud_score : 0;
  const signals = Array.isArray(d.signals) ? (d.signals as Dict[]) : [];
  return <FraudMeter score={score} risk={str(d.risk_level)} signals={signals} />;
}

function Decision({ d, audience }: { d: Dict; audience: Audience }) {
  const score = typeof d.confidence_score === "number" ? d.confidence_score : null;
  const recs = Array.isArray(d.recommendations) ? (d.recommendations as unknown[]).map(str) : [];
  return (
    <div className="space-y-4">
      {score !== null && <Confidence score={score} deductions={asList(d.confidence_deductions)} />}
      {audience === "ops" && (str(d.user_message) || str(d.ops_summary)) && (
        <More label="Messages written">
          <div className="space-y-3">
            <Quote label="To the member" text={str(d.user_message)} />
            <Quote label="To operations" text={str(d.ops_summary)} />
          </div>
        </More>
      )}
      {audience === "ops" && recs.length > 0 && (
        <ul className="flex flex-wrap gap-1.5 text-[12px]">
          {recs.map((r, i) => (
            <li key={i} className="rounded-full bg-review-soft px-2 py-0.5 text-review">
              {r}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Quote({ label, text }: { label: string; text: string }) {
  if (!text) return null;
  return (
    <div>
      <Label>{label}</Label>
      <p className="mt-1 border-l-2 border-line-strong pl-3 text-[14px] text-ink-2">{text}</p>
    </div>
  );
}
