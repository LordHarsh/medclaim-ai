"use server";

import { auth } from "@/lib/auth/server";
import sql from "@/lib/db";
import { submitClaimSchema } from "@/lib/validations";
import { sendClaimForProcessing } from "@/lib/sqs";
import { redirect } from "next/navigation";
import type { ClaimRow, MemberRow } from "@/lib/types";

export type ActionResult<T = unknown> =
  | { success: true; data: T }
  | { success: false; errors: { field?: string; message: string }[] };

export async function submitClaim(
  formData: FormData
): Promise<ActionResult<{ claim_id: string }>> {
  const { data: session } = await auth.getSession();
  if (!session?.user) {
    return {
      success: false,
      errors: [{ message: "You must be signed in to submit a claim" }],
    };
  }

  // Get member
  const members = (await sql(
    "SELECT * FROM members WHERE auth_user_id = $1",
    [session.user.id]
  )) as unknown as MemberRow[];

  if (!members || members.length === 0) {
    return {
      success: false,
      errors: [{ message: "Please complete onboarding first" }],
    };
  }

  const member = members[0];

  // Parse form data
  const rawInput = {
    category: formData.get("category") as string,
    treatment_date: formData.get("treatment_date") as string,
    claimed_amount: parseFloat(formData.get("claimed_amount") as string),
    hospital_name: (formData.get("hospital_name") as string) || null,
    document_keys: JSON.parse(
      (formData.get("document_keys") as string) || "[]"
    ),
  };

  // Validate
  const validation = submitClaimSchema.safeParse(rawInput);
  if (!validation.success) {
    return {
      success: false,
      errors: validation.error.issues.map((issue) => ({
        field: issue.path.join("."),
        message: issue.message,
      })),
    };
  }

  const input = validation.data;

  try {
    // Insert claim
    const claimRows = await sql(
      `INSERT INTO claims (member_id, policy_id, category, claimed_amount, treatment_date, hospital_name, status, current_step)
       VALUES ($1, $2, $3, $4, $5, $6, 'QUEUED', 'SUBMITTED')
       RETURNING claim_id`,
      [
        member.member_id,
        "PLUM_GHI_2024",
        input.category,
        input.claimed_amount,
        input.treatment_date,
        input.hospital_name,
      ]
    );

    const claimId = claimRows[0].claim_id as string;

    // Insert documents
    for (const docKey of input.document_keys) {
      const parts = docKey.split("/");
      const filename = parts[parts.length - 1];
      const ext = filename.split(".").pop()?.toLowerCase();
      const contentType =
        ext === "pdf"
          ? "application/pdf"
          : ext === "png"
            ? "image/png"
            : ext === "webp"
              ? "image/webp"
              : "image/jpeg";

      await sql(
        `INSERT INTO claim_documents (claim_id, s3_key, original_name, content_type, size_bytes)
         VALUES ($1, $2, $3, $4, $5)`,
        [claimId, docKey, filename, contentType, 0]
      );
    }

    // Insert into claim_history
    await sql(
      `INSERT INTO claim_history (member_id, claim_id, claim_date, amount, provider, category, status)
       VALUES ($1, $2, $3, $4, $5, $6, 'QUEUED')`,
      [
        member.member_id,
        claimId,
        input.treatment_date,
        input.claimed_amount,
        input.hospital_name,
        input.category,
      ]
    );

    // Send to SQS for processing
    const messageId = await sendClaimForProcessing(claimId);

    // Update claim with SQS message ID
    if (messageId) {
      await sql(
        "UPDATE claims SET sqs_message_id = $1 WHERE claim_id = $2",
        [messageId, claimId]
      );
    }

    return { success: true, data: { claim_id: claimId } };
  } catch (error) {
    console.error("Failed to submit claim:", error);
    return {
      success: false,
      errors: [
        { message: "Failed to submit claim. Please try again." },
      ],
    };
  }
}

export async function listClaims(): Promise<ActionResult<{ claims: ClaimRow[]; total: number }>> {
  const { data: session } = await auth.getSession();
  if (!session?.user) {
    redirect("/auth/sign-in");
  }

  const members = (await sql(
    "SELECT * FROM members WHERE auth_user_id = $1",
    [session.user.id]
  )) as unknown as MemberRow[];

  if (!members || members.length === 0) {
    redirect("/onboarding");
  }

  const member = members[0];

  const claims = (await sql(
    `SELECT claim_id, category, claimed_amount, approved_amount, treatment_date,
            hospital_name, status, current_step, decision, confidence_score,
            created_at, completed_at
     FROM claims
     WHERE member_id = $1
     ORDER BY created_at DESC`,
    [member.member_id]
  )) as unknown as ClaimRow[];

  return {
    success: true,
    data: { claims: claims || [], total: claims?.length || 0 },
  };
}

export async function getClaimStatus(claimId: string): Promise<ActionResult<ClaimRow>> {
  const { data: session } = await auth.getSession();
  if (!session?.user) {
    return { success: false, errors: [{ message: "Unauthorized" }] };
  }

  const members = (await sql(
    "SELECT * FROM members WHERE auth_user_id = $1",
    [session.user.id]
  )) as unknown as MemberRow[];

  if (!members || members.length === 0) {
    return { success: false, errors: [{ message: "Member not found" }] };
  }

  const member = members[0];

  const claims = (await sql(
    `SELECT claim_id, category, claimed_amount, approved_amount, treatment_date,
            hospital_name, status, current_step, decision, confidence_score,
            rejection_reasons, error_message, fraud_score, trace_json,
            created_at, completed_at
     FROM claims
     WHERE claim_id = $1 AND member_id = $2`,
    [claimId, member.member_id]
  )) as unknown as ClaimRow[];

  if (!claims || claims.length === 0) {
    return { success: false, errors: [{ message: "Claim not found" }] };
  }

  return { success: true, data: claims[0] };
}

export async function getClaimTrace(claimId: string): Promise<ActionResult<Record<string, unknown> | null>> {
  const { data: session } = await auth.getSession();
  if (!session?.user) {
    return { success: false, errors: [{ message: "Unauthorized" }] };
  }

  const members = (await sql(
    "SELECT * FROM members WHERE auth_user_id = $1",
    [session.user.id]
  )) as unknown as MemberRow[];

  if (!members || members.length === 0) {
    return { success: false, errors: [{ message: "Member not found" }] };
  }

  const member = members[0];

  const claims = (await sql(
    `SELECT trace_json FROM claims WHERE claim_id = $1 AND member_id = $2`,
    [claimId, member.member_id]
  )) as unknown as Pick<ClaimRow, "trace_json">[];

  if (!claims || claims.length === 0) {
    return { success: false, errors: [{ message: "Claim not found" }] };
  }

  return { success: true, data: claims[0].trace_json };
}
