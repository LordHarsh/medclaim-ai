import { notFound } from "next/navigation";
import { requireMember } from "@/lib/auth/session";
import sql from "@/lib/db";
import { toClaim } from "@/components/claim/model";
import { ClaimDetailView, type ClaimDetail } from "@/components/screens/claim-detail-view";
import type { ClaimRow } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function ClaimDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: claimId } = await params;
  const { member } = await requireMember();

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
    notFound();
  }

  const row = claims[0];
  const claim: ClaimDetail = {
    ...toClaim(row),
    claim_id: row.claim_id,
    treatment_date: String(row.treatment_date),
    hospital_name: row.hospital_name,
    created_at: String(row.created_at),
  };

  return <ClaimDetailView claim={claim} />;
}
