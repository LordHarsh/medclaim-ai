"use server";

import { auth } from "@/lib/auth/server";
import { query } from "@/lib/db";
import { sendClaimForProcessing } from "@/lib/sqs";
import { TEST_CASES } from "./test-data";
import type { ClaimRow } from "@/lib/types";

async function requireAdmin() {
  const { data: session } = await auth.getSession();
  if (!session?.user) {
    throw new Error("Unauthorized: sign in required");
  }
  return session;
}

export interface RunTestCaseResult {
  claim_id: string;
  case_id: string;
}

export interface TestCaseOutcome {
  claim_id: string;
  status: string;
  decision: string | null;
  approved_amount: number | null;
  confidence_score: number | null;
  rejection_reasons: string[] | null;
  error_message: string | null;
  fraud_score: number | null;
  fraud_signals: unknown;
  trace_json: Record<string, unknown> | null;
  current_step: string | null;
  completed_at: string | null;
  created_at: string;
}

/**
 * Run a single test case through the full pipeline.
 * Creates a claim in the DB with the test case's documents and sends it to SQS.
 */
export async function runTestCase(caseId: string): Promise<RunTestCaseResult> {
  await requireAdmin();

  const testCase = TEST_CASES.find((tc) => tc.case_id === caseId);
  if (!testCase) {
    throw new Error(`Test case ${caseId} not found`);
  }

  const { input, documents } = testCase;

  // Use EXACT treatment dates from test_cases.json: no overrides.
  // Lambda uses freezegun to freeze time so submission_deadline passes naturally.
  // eval_freeze_date = treatment_date + 1 day (simulates submitting the day after treatment)
  const treatmentDate = input.treatment_date;
  const freezeDate = new Date(treatmentDate);
  freezeDate.setDate(freezeDate.getDate() + 1);
  const evalFreezeDate = freezeDate.toISOString().split("T")[0];

  // For TC009 fraud history, use the treatment_date (not today)
  const today = treatmentDate;

  // Build metadata: eval_freeze_date tells Lambda to freeze time during processing
  const metadata: Record<string, unknown> = { eval_freeze_date: evalFreezeDate };
  if (input.simulate_component_failure) {
    metadata.simulate_component_failure = true;
  }

  // 1. Insert the claim
  const claimRows = await query(
    `INSERT INTO claims (member_id, policy_id, category, claimed_amount, treatment_date, hospital_name, status, current_step, claim_metadata)
     VALUES ($1, $2, $3, $4, $5, $6, 'QUEUED', 'SUBMITTED', $7)
     RETURNING claim_id`,
    [
      input.member_id,
      input.policy_id,
      input.claim_category,
      input.claimed_amount,
      treatmentDate,
      input.hospital_name || null,
      JSON.stringify(metadata),
    ]
  );

  const claimId = claimRows[0].claim_id as string;

  // 2. Insert claim documents with the pre-uploaded S3 keys
  for (const doc of documents) {
    const ext = doc.file_name.split(".").pop()?.toLowerCase();
    const contentType =
      ext === "pdf"
        ? "application/pdf"
        : ext === "png"
          ? "image/png"
          : ext === "webp"
            ? "image/webp"
            : "image/jpeg";

    await query(
      `INSERT INTO claim_documents (claim_id, s3_key, original_name, content_type, size_bytes)
       VALUES ($1, $2, $3, $4, $5)`,
      [claimId, doc.s3_key, doc.file_name, contentType, 0]
    );
  }

  // 3. For TC009: Insert prior claim history records
  const seededHistoryClaimIds: string[] = [];
  if (input.claims_history && input.claims_history.length > 0) {
    for (const histEntry of input.claims_history) {
      // Create a dummy completed claim for the history
      const histClaimRows = await query(
        `INSERT INTO claims (member_id, policy_id, category, claimed_amount, treatment_date, hospital_name, status, decision, current_step)
         VALUES ($1, $2, $3, $4, $5, $6, 'COMPLETED', 'APPROVED', 'DONE')
         RETURNING claim_id`,
        [
          input.member_id,
          input.policy_id,
          input.claim_category,
          histEntry.amount,
          histEntry.date,
          histEntry.provider,
        ]
      );
      const histClaimId = histClaimRows[0].claim_id as string;
      seededHistoryClaimIds.push(histClaimId);

      await query(
        `INSERT INTO claim_history (member_id, claim_id, claim_date, amount, provider, category, status)
         VALUES ($1, $2, $3, $4, $5, $6, 'COMPLETED')`,
        [
          input.member_id,
          histClaimId,
          today,           // use today so fraud signals trigger correctly
          histEntry.amount,
          histEntry.provider,
          input.claim_category,
        ]
      );
    }
  }

  // 4. Insert claim_history for the current claim
  await query(
    `INSERT INTO claim_history (member_id, claim_id, claim_date, amount, provider, category, status)
     VALUES ($1, $2, $3, $4, $5, $6, 'QUEUED')`,
    [
      input.member_id,
      claimId,
      today,
      input.claimed_amount,
      input.hospital_name || null,
      input.claim_category,
    ]
  );

  // 5. Tell the worker which history belongs to this case. The cases share members and every run
  //    leaves claims behind; the worker ignores everything not listed here for a test-runner claim.
  await query(
    `UPDATE claims SET claim_metadata = claim_metadata || $1::jsonb WHERE claim_id = $2`,
    [JSON.stringify({ eval_history_claim_ids: seededHistoryClaimIds }), claimId]
  );

  // 6. Send to SQS for processing (Lambda claims the message_id via idempotency check)
  await sendClaimForProcessing(claimId);

  return { claim_id: claimId, case_id: caseId };
}

/**
 * Get the result of a test case claim.
 * Returns the full claim row once it's done processing.
 */
export async function getTestCaseResult(
  claimId: string
): Promise<TestCaseOutcome | null> {
  await requireAdmin();

  const rows = (await query(
    `SELECT claim_id, status, decision, approved_amount, confidence_score,
            rejection_reasons, error_message, fraud_score, fraud_signals,
            trace_json, current_step, completed_at, created_at
     FROM claims
     WHERE claim_id = $1`,
    [claimId]
  )) as unknown as ClaimRow[];

  if (!rows || rows.length === 0) {
    return null;
  }

  const row = rows[0];
  return {
    claim_id: row.claim_id,
    status: row.status,
    decision: row.decision,
    // Postgres NUMERIC returns as string: cast to number
    approved_amount: row.approved_amount != null ? Number(row.approved_amount) : null,
    confidence_score: row.confidence_score != null ? Number(row.confidence_score) : null,
    fraud_score: row.fraud_score != null ? Number(row.fraud_score) : null,
    rejection_reasons: row.rejection_reasons,
    error_message: row.error_message,
    fraud_signals: row.fraud_signals,
    trace_json: row.trace_json,
    current_step: row.current_step,
    completed_at: row.completed_at,
    created_at: row.created_at,
  };
}
