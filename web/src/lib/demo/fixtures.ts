/**
 * Fixture data for the screen gallery (app/gallery), which renders the signed-in screens without a session.
 *
 * The decided claims are the recorded runs behind the public /demo page, reshaped into the rows the pages read
 * from the database. The two unfinished claims (one in progress, one failed) are made up, since the recorded
 * runs only contain finished claims. Nothing here is read by a production page.
 */
import { DEMO_SAMPLES, type DemoSample } from "./samples";
import type { DashboardClaim, DashboardStats } from "@/app/admin/actions";
import type { MemberRow } from "@/lib/types";

function idFor(caseId: string): string {
  const n = caseId.replace(/\D/g, "").padStart(4, "0");
  return `0c1a${n}-5b7e-4d21-9f3a-6e2b8c${n}d1f0`;
}

function fromSample(s: DemoSample): DashboardClaim {
  const done = new Date(s.run.recorded_at).getTime();
  const fraud = s.run.trace.steps.find((x) => x.step_name === "FRAUD_DETECTION");
  return {
    claim_id: idFor(s.id),
    member_id: s.testCase.input.member_id,
    category: s.testCase.input.claim_category,
    claimed_amount: s.testCase.input.claimed_amount,
    treatment_date: s.testCase.input.treatment_date,
    hospital_name: s.testCase.input.hospital_name ?? null,
    status: s.run.status,
    decision: s.run.decision,
    approved_amount: s.run.approved_amount,
    confidence_score: s.run.confidence_score,
    rejection_reasons: s.run.rejection_reasons,
    error_message: s.run.error_message,
    fraud_score: s.run.fraud_score,
    fraud_signals: (fraud?.details?.signals as unknown) ?? [],
    trace_json: s.run.trace as unknown as Record<string, unknown>,
    current_step: s.run.status === "COMPLETED" ? "COMPLETED" : "DOCUMENT_VERIFICATION",
    created_at: new Date(done - s.run.duration_ms).toISOString(),
    completed_at: s.run.recorded_at,
  };
}

const decided = DEMO_SAMPLES.map(fromSample);

const inProgress: DashboardClaim = {
  claim_id: "0c1a9001-5b7e-4d21-9f3a-6e2b8c9001d1",
  member_id: "EMP001",
  category: "PHARMACY",
  claimed_amount: 2350,
  treatment_date: "2024-11-02",
  hospital_name: "City Pharmacy",
  status: "PROCESSING",
  decision: null,
  approved_amount: null,
  confidence_score: null,
  rejection_reasons: null,
  error_message: null,
  fraud_score: null,
  fraud_signals: [],
  trace_json: null,
  current_step: "POLICY_ENGINE",
  created_at: "2024-11-03T09:12:00.000Z",
  completed_at: null,
};

const failed: DashboardClaim = {
  claim_id: "0c1a9002-5b7e-4d21-9f3a-6e2b8c9002d1",
  member_id: "EMP004",
  category: "DIAGNOSTIC",
  claimed_amount: 6200,
  treatment_date: "2024-11-01",
  hospital_name: null,
  status: "FAILED",
  decision: null,
  approved_amount: null,
  confidence_score: null,
  rejection_reasons: null,
  error_message: "Document verification could not be completed. Please try again.",
  fraud_score: null,
  fraud_signals: [],
  trace_json: null,
  current_step: "DOCUMENT_VERIFICATION",
  created_at: "2024-11-02T14:40:00.000Z",
  completed_at: null,
};

export const FIXTURE_CLAIMS: DashboardClaim[] = [inProgress, ...decided, failed];

/** One claim per state the screens have to draw. */
export const FIXTURE_BY_STATE: Record<string, DashboardClaim> = {
  approved: decided.find((c) => c.decision === "APPROVED") ?? decided[0],
  partial: decided.find((c) => c.decision === "PARTIAL") ?? decided[0],
  rejected: decided.find((c) => c.decision === "REJECTED") ?? decided[0],
  stopped: decided.find((c) => c.status === "NEEDS_REUPLOAD") ?? decided[0],
  review: decided.find((c) => c.decision === "MANUAL_REVIEW") ?? decided[0],
  progress: inProgress,
  failed,
};

export const FIXTURE_STATES = Object.keys(FIXTURE_BY_STATE);

/** Document thumbnails for a fixture claim, where the sample has them. */
export function fixtureDocuments(claimId: string): { name: string; url: string }[] {
  const s = DEMO_SAMPLES.find((x) => idFor(x.id) === claimId);
  return s ? s.documents : [];
}

export const FIXTURE_STATS: DashboardStats = (() => {
  const count = (d: string) => FIXTURE_CLAIMS.filter((c) => c.decision === d).length;
  const finished = FIXTURE_CLAIMS.filter((c) => c.completed_at);
  const avg =
    finished.reduce((sum, c) => sum + (new Date(c.completed_at as string).getTime() - new Date(c.created_at).getTime()), 0) /
    Math.max(finished.length, 1);
  return {
    total: FIXTURE_CLAIMS.length,
    approved: count("APPROVED"),
    rejected: count("REJECTED"),
    partial: count("PARTIAL"),
    manual_review: count("MANUAL_REVIEW"),
    completed: FIXTURE_CLAIMS.filter((c) => c.status === "COMPLETED").length,
    avg_processing_ms: avg,
  };
})();

export const FIXTURE_MEMBER: MemberRow = {
  member_id: "MBR_SAMPLE01",
  auth_user_id: null,
  name: "Sample Member",
  date_of_birth: "1990-01-01",
  gender: "F",
  relationship: "SELF",
  join_date: "2023-11-01",
  primary_member_id: null,
  dependents: [],
  created_at: "2023-11-01T00:00:00.000Z",
};
