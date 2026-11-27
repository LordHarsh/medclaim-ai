/**
 * Sample claims for the public /demo page.
 *
 * Each sample is one of the evaluation test cases (see app/admin/eval/test-data.ts), paired with the trace the
 * real pipeline wrote for it. The traces in recorded-runs.json were read back from the claims table after a full
 * run of the test suite on the deployed system; nothing in them is hand-written. The page replays them.
 */
import recorded from "./recorded-runs.json";
import { TEST_CASES, type TestCase } from "@/app/admin/eval/test-data";
import type { ClaimLike } from "@/components/claim/model";

export interface TraceStep {
  step_name: string;
  step_order: number;
  status: string;
  summary?: string;
  details?: Record<string, unknown>;
}

export interface RecordedRun {
  recorded_at: string;
  duration_ms: number;
  status: string;
  decision: string | null;
  approved_amount: number | null;
  confidence_score: number | null;
  fraud_score: number | null;
  rejection_reasons: string[];
  error_message: string | null;
  trace: {
    steps: TraceStep[];
    degraded?: boolean;
    degradation_notes?: string[];
    pipeline_version?: string;
    final_decision?: Record<string, unknown>;
  };
}

export interface DemoSample {
  id: string;
  /** Short name for the picker. */
  title: string;
  /** Two or three words for the picker: what this case shows. */
  tag: string;
  /** One line on why this case is worth opening. Used as a tooltip. */
  why: string;
  testCase: TestCase;
  run: RecordedRun;
  /** Document images, served from /public/demo-docs. Synthetic, made by scripts/generate-test-documents.js. */
  documents: { name: string; url: string }[];
}

const ORDER: { id: string; title: string; tag: string; why: string }[] = [
  { id: "TC004", title: "Clean consultation", tag: "Co-pay", why: "The plain path: all five agents run and the claim is approved, less the 10% co-pay." },
  { id: "TC006", title: "Dental, part cosmetic", tag: "Line by line", why: "One bill, two verdicts. The root canal is paid and the teeth whitening is refused, line by line." },
  { id: "TC005", title: "Diabetes, too early", tag: "Waiting period", why: "A blocking rule fires. The member is 44 days into a 90-day waiting period, so the claim is rejected with the date it becomes eligible." },
  { id: "TC001", title: "Wrong documents", tag: "Missing bill", why: "The pipeline stops after the first agent and tells the member exactly which document is missing. No decision is made." },
  { id: "TC009", title: "Four claims in a day", tag: "Fraud signals", why: "The policy rules pass, but the fraud signals add up, so the claim goes to a person instead of being paid." },
  { id: "TC010", title: "Network hospital", tag: "Network discount", why: "Order of operations: the 20% network discount comes off before the 10% co-pay." },
];

const runs = recorded as unknown as Record<string, RecordedRun>;

export const DEMO_SAMPLES: DemoSample[] = ORDER.flatMap((o) => {
  const testCase = TEST_CASES.find((t) => t.case_id === o.id);
  const run = runs[o.id];
  if (!testCase || !run) return [];
  return [
    {
      ...o,
      testCase,
      run,
      documents: testCase.documents.map((d) => ({ name: d.file_name, url: `/demo-docs/${o.id}/${d.file_name}` })),
    },
  ];
});

/** A sample as the claim screens read it. */
export function claimOf(s: DemoSample): ClaimLike {
  return {
    category: s.testCase.input.claim_category,
    claimed_amount: s.testCase.input.claimed_amount,
    approved_amount: s.run.approved_amount,
    status: s.run.status,
    decision: s.run.decision,
    current_step: s.run.status === "COMPLETED" ? "COMPLETED" : "DOCUMENT_VERIFICATION",
    confidence_score: s.run.confidence_score,
    fraud_score: s.run.fraud_score,
    rejection_reasons: s.run.rejection_reasons,
    error_message: s.run.error_message,
    trace_json: s.run.trace,
  };
}
