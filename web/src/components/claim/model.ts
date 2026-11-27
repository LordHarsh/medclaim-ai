/**
 * How the screens read a claim. Everything here is plain data in, plain data out, so the same reading is used by
 * the public replay, the member's claim page, the operations pages and the test runner.
 */

export type Dict = Record<string, unknown>;
export const asDict = (v: unknown): Dict => (v && typeof v === "object" && !Array.isArray(v) ? (v as Dict) : {});
export const asList = (v: unknown): Dict[] => (Array.isArray(v) ? (v as Dict[]) : []);
export const str = (v: unknown): string => (v === null || v === undefined ? "" : String(v));
export const num = (v: unknown): number | null => (typeof v === "number" && !Number.isNaN(v) ? v : null);

/** The fields of a claim the screens draw from. Rows from the database and recorded runs both fit this. */
export interface ClaimLike {
  claim_id?: string;
  category: string;
  claimed_amount: number;
  approved_amount: number | null;
  status: string;
  decision: string | null;
  current_step?: string | null;
  confidence_score: number | null;
  fraud_score: number | null;
  rejection_reasons?: string[] | null;
  error_message?: string | null;
  trace_json: unknown;
}

const n = (v: unknown): number | null => (v === null || v === undefined || v === "" || Number.isNaN(Number(v)) ? null : Number(v));

/** Database rows carry amounts and scores as strings. This makes them numbers once, at the edge. */
export function toClaim<T extends object>(row: T): T & ClaimLike {
  const r = row as Record<string, unknown>;
  return {
    ...row,
    category: str(r.category),
    status: str(r.status),
    decision: (r.decision as string | null) ?? null,
    current_step: (r.current_step as string | null) ?? null,
    claimed_amount: n(r.claimed_amount) ?? 0,
    approved_amount: n(r.approved_amount),
    confidence_score: n(r.confidence_score),
    fraud_score: n(r.fraud_score),
    rejection_reasons: (r.rejection_reasons as string[] | null) ?? null,
    error_message: (r.error_message as string | null) ?? null,
    trace_json: r.trace_json ?? null,
  };
}

export interface Step {
  step_name: string;
  status: string;
  duration_ms?: number;
  summary?: string;
  error?: string;
  details?: Dict;
}

export function stepsOf(trace: unknown): Step[] {
  const steps = asDict(trace).steps;
  return Array.isArray(steps) ? (steps as Step[]) : [];
}

/* ── Outcome: the one word a person needs ─────────────────────────────── */

export type Outcome = "approved" | "partial" | "rejected" | "review" | "stopped" | "failed" | "running" | "queued";

export function outcomeOf(c: { status: string; decision: string | null }): Outcome {
  if (c.status === "NEEDS_REUPLOAD") return "stopped";
  if (c.status === "FAILED") return "failed";
  switch (c.decision) {
    case "APPROVED":
      return "approved";
    case "PARTIAL":
      return "partial";
    case "REJECTED":
      return "rejected";
    case "MANUAL_REVIEW":
      return "review";
  }
  if (c.status === "PROCESSING") return "running";
  if (c.status === "COMPLETED") return "review";
  return "queued";
}

export const OUTCOME: Record<Outcome, { label: string; text: string; soft: string; solid: string; ring: string }> = {
  approved: { label: "Approved", text: "text-ok", soft: "bg-ok-soft", solid: "bg-ok", ring: "border-ok/30" },
  partial: { label: "Partly approved", text: "text-part", soft: "bg-part-soft", solid: "bg-part", ring: "border-part/30" },
  rejected: { label: "Rejected", text: "text-bad", soft: "bg-bad-soft", solid: "bg-bad", ring: "border-bad/30" },
  review: { label: "In review", text: "text-review", soft: "bg-review-soft", solid: "bg-review", ring: "border-review/30" },
  stopped: { label: "Re-upload needed", text: "text-stop", soft: "bg-stop-soft", solid: "bg-stop", ring: "border-stop/30" },
  failed: { label: "Failed", text: "text-bad", soft: "bg-bad-soft", solid: "bg-bad", ring: "border-bad/30" },
  running: { label: "Processing", text: "text-wait", soft: "bg-wait-soft", solid: "bg-wait", ring: "border-wait/30" },
  queued: { label: "Queued", text: "text-ink-2", soft: "bg-sunken", solid: "bg-ink-3", ring: "border-line-strong" },
};

export const isFinished = (status: string) => ["COMPLETED", "FAILED", "NEEDS_REUPLOAD"].includes(status);

/* ── The five agents ───────────────────────────────────────────────────── */

export const AGENT_STEPS = [
  { step: "DOCUMENT_VERIFICATION", short: "Check", name: "Check documents" },
  { step: "DOCUMENT_EXTRACTION", short: "Read", name: "Read documents" },
  { step: "POLICY_ENGINE", short: "Policy", name: "Apply policy" },
  { step: "FRAUD_DETECTION", short: "Fraud", name: "Fraud check" },
  { step: "FINAL_DECISION", short: "Decide", name: "Decide" },
] as const;

export type AgentStep = (typeof AGENT_STEPS)[number]["step"];
export type StepState = "waiting" | "running" | "done" | "issue" | "failed" | "skipped";

/**
 * What each of the five steps should look like.
 * A finished claim reads its trace. An unfinished one reads `current_step`, which the worker updates as it goes.
 */
export function stepStates(c: Pick<ClaimLike, "status" | "decision" | "current_step" | "trace_json">): StepState[] {
  const steps = stepsOf(c.trace_json);
  const finished = isFinished(c.status);

  if (finished && steps.length > 0) {
    return AGENT_STEPS.map((a) => {
      const s = steps.find((x) => x.step_name === a.step);
      if (!s) return "skipped";
      if (s.status === "FAILED" || s.status === "ERROR") return "failed";
      if (s.status === "DEGRADED") return "issue";
      if (a.step === "DOCUMENT_VERIFICATION" && asDict(s.details).should_stop_early === true) return "issue";
      return "done";
    });
  }

  const at = AGENT_STEPS.findIndex((a) => a.step === c.current_step);
  if (c.status === "FAILED") return AGENT_STEPS.map((_, i) => (at < 0 ? "skipped" : i < at ? "done" : i === at ? "failed" : "skipped"));
  if (c.status === "NEEDS_REUPLOAD") return AGENT_STEPS.map((_, i) => (i === 0 ? "issue" : "skipped"));
  if (finished || c.current_step === "COMPLETED") return AGENT_STEPS.map(() => "done");
  return AGENT_STEPS.map((_, i) => (at < 0 ? "waiting" : i < at ? "done" : i === at ? "running" : "waiting"));
}

/** The step worth opening first: the one that settled the outcome. */
export function decidingStep(c: Pick<ClaimLike, "status" | "decision" | "trace_json">): AgentStep {
  const o = outcomeOf(c);
  const has = (s: AgentStep) => stepsOf(c.trace_json).some((x) => x.step_name === s);
  if (o === "stopped") return "DOCUMENT_VERIFICATION";
  if (o === "review" && has("FRAUD_DETECTION")) return "FRAUD_DETECTION";
  if (has("POLICY_ENGINE")) return "POLICY_ENGINE";
  return "DOCUMENT_VERIFICATION";
}

/* ── Money ─────────────────────────────────────────────────────────────── */

export interface Money {
  claimed: number;
  /** What the policy pays. Null while nothing is decided. */
  covered: number | null;
  copay: number;
  copayPercent: number;
  discount: number;
  discountPercent: number;
  notCovered: number;
  /** Co-pay plus anything the policy would not cover. The network discount is taken off the bill, not paid by the member. */
  youPay: number | null;
  /** What the rules worked out, kept even when a person still has to sign it off. */
  wouldCover: number | null;
}

export function moneyOf(c: ClaimLike): Money {
  const steps = stepsOf(c.trace_json);
  const policy = asDict(steps.find((s) => s.step_name === "POLICY_ENGINE")?.details);
  const final = asDict(asDict(c.trace_json).final_decision);
  const calc = asDict(Object.keys(asDict(policy.calculation_breakdown)).length ? policy.calculation_breakdown : final.calculation_breakdown);
  const claimed = num(calc.original_amount) ?? c.claimed_amount;
  const eligible = num(calc.eligible_amount);
  const o = outcomeOf(c);

  const copay = num(calc.copay_amount) ?? 0;
  const discount = num(calc.discount_amount) ?? 0;
  const wouldCover = num(calc.final_approved_amount);

  if (o === "rejected") {
    return { claimed, covered: 0, copay: 0, copayPercent: 0, discount: 0, discountPercent: 0, notCovered: claimed, youPay: claimed, wouldCover: null };
  }
  if (o === "approved" || o === "partial") {
    const covered = c.approved_amount ?? wouldCover ?? 0;
    const notCovered = eligible !== null ? Math.max(claimed - eligible, 0) : Math.max(claimed - covered - copay - discount, 0);
    return {
      claimed,
      covered,
      copay,
      copayPercent: num(calc.copay_percent) ?? 0,
      discount,
      discountPercent: num(calc.network_discount_percent) ?? 0,
      notCovered,
      youPay: copay + notCovered,
      wouldCover,
    };
  }
  return { claimed, covered: null, copay: 0, copayPercent: 0, discount: 0, discountPercent: 0, notCovered: 0, youPay: null, wouldCover };
}

/* ── Policy rules, in the order the policy config runs them ───────────── */

export const RULES: { name: string; short: string }[] = [
  { name: "MEMBER_ELIGIBILITY", short: "Member active" },
  { name: "SUBMISSION_DEADLINE", short: "Filed in time" },
  { name: "MINIMUM_AMOUNT", short: "Minimum amount" },
  { name: "INITIAL_WAITING_PERIOD", short: "Initial wait" },
  { name: "CONDITION_WAITING_PERIOD", short: "Condition wait" },
  { name: "EXCLUSION_CHECK", short: "Exclusions" },
  { name: "PRE_AUTHORIZATION", short: "Pre-approval" },
  { name: "PER_CLAIM_LIMIT", short: "Claim limit" },
  { name: "PROCEDURE_COVERAGE", short: "Procedure cover" },
  { name: "AMOUNT_CALCULATION", short: "Amount" },
];

export interface RuleResult {
  name: string;
  short: string;
  state: "pass" | "fail" | "not-run";
  detail: string;
  blocking: boolean;
}

/** Every rule the policy has, with the ones a blocking failure skipped marked as not run. */
export function rulesOf(policyDetails: Dict): RuleResult[] {
  const ran = asList(policyDetails.rule_evaluations);
  const known = RULES.map((r) => {
    const hit = ran.find((x) => str(x.rule_name) === r.name);
    return {
      ...r,
      state: hit ? (hit.passed === true ? ("pass" as const) : ("fail" as const)) : ("not-run" as const),
      detail: hit ? str(hit.details) : "",
      blocking: hit ? hit.blocking === true : false,
    };
  });
  const extra = ran
    .filter((x) => !RULES.some((r) => r.name === str(x.rule_name)))
    .map((x) => ({
      name: str(x.rule_name),
      short: str(x.rule_name).toLowerCase().replace(/_/g, " "),
      state: x.passed === true ? ("pass" as const) : ("fail" as const),
      detail: str(x.details),
      blocking: x.blocking === true,
    }));
  return [...known, ...extra];
}

export const CATEGORY_LABEL: Record<string, string> = {
  CONSULTATION: "Consultation",
  DIAGNOSTIC: "Diagnostic",
  PHARMACY: "Pharmacy",
  DENTAL: "Dental",
  VISION: "Vision",
  ALTERNATIVE_MEDICINE: "Alternative medicine",
};

export const categoryLabel = (c: string) => CATEGORY_LABEL[c] ?? c.toLowerCase().replace(/_/g, " ");

export const fileName = (key: unknown) => str(key).split("/").pop() ?? "";
