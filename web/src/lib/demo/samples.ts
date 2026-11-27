/**
 * Sample claims for the public /demo page.
 *
 * Each sample is one of the evaluation test cases (see app/admin/eval/test-data.ts), paired with the trace the
 * real pipeline wrote for it. The traces in recorded-runs.json were read back from the claims table after a full
 * run of the test suite on the deployed system; nothing in them is hand-written. The page replays them.
 */
import recorded from "./recorded-runs.json";
import { TEST_CASES, type TestCase } from "@/app/admin/eval/test-data";

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
  /** One line on why this case is worth opening. */
  why: string;
  testCase: TestCase;
  run: RecordedRun;
  /** Document images, served from /public/demo-docs. Synthetic, made by scripts/generate-test-documents.js. */
  documents: { name: string; url: string }[];
}

const ORDER: { id: string; title: string; why: string }[] = [
  { id: "TC004", title: "Clean consultation", why: "The plain path: all five agents run and the claim is approved, less the 10% co-pay." },
  { id: "TC006", title: "Dental, part cosmetic", why: "One bill, two verdicts. The root canal is paid and the teeth whitening is refused, line by line." },
  { id: "TC005", title: "Diabetes, too early", why: "A blocking rule fires. The member is 44 days into a 90-day waiting period, so the claim is rejected with the date it becomes eligible." },
  { id: "TC001", title: "Wrong documents", why: "The pipeline stops after the first agent and tells the member exactly which document is missing. No decision is made." },
  { id: "TC009", title: "Four claims in a day", why: "The policy rules pass, but the fraud signals add up, so the claim goes to a person instead of being paid." },
  { id: "TC010", title: "Network hospital", why: "Order of operations: the 20% network discount comes off before the 10% co-pay." },
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

/** The five agents, in the order the graph runs them. What each one is, is taken from worker/core/pipeline.py. */
export const AGENTS: {
  step: string;
  name: string;
  kind: string;
  onFailure: string;
  does: string;
}[] = [
  {
    step: "DOCUMENT_VERIFICATION",
    name: "Document verification",
    kind: "Gemini vision",
    onFailure: "Critical: a failure here is retried by SQS",
    does: "Reads each upload, names its type, scores how readable it is, and checks every document is for the same patient. If the set is wrong, the pipeline stops here.",
  },
  {
    step: "DOCUMENT_EXTRACTION",
    name: "Document extraction",
    kind: "Gemini vision",
    onFailure: "Degradable",
    does: "Turns the images into structured data: diagnosis, medicines, bill line items and totals, each with its own confidence.",
  },
  {
    step: "POLICY_ENGINE",
    name: "Policy engine",
    kind: "10 rule evaluators, 2 of them LLM-backed",
    onFailure: "Degradable",
    does: "Runs the rules listed in the policy config, in the order the config gives. A blocking rule that fails ends the evaluation. The last rule works out the amount.",
  },
  {
    step: "FRAUD_DETECTION",
    name: "Fraud detection",
    kind: "Deterministic",
    onFailure: "Degradable",
    does: "Checks eight signals against the member's claim history and the extracted data, and adds them into one weighted score.",
  },
  {
    step: "FINAL_DECISION",
    name: "Final decision",
    kind: "Rules for the verdict, an LLM for the wording",
    onFailure: "Degradable",
    does: "Takes the policy result, sends it to manual review if the fraud step asked for that or if confidence is under 0.60, and itemises every confidence deduction. An LLM then writes one message for the member and one for the operations team; fixed templates take over if it fails.",
  },
];
