"use server";

import { query } from "@/lib/db";
import type { ClaimRow } from "@/lib/types";

export interface DashboardClaim {
  claim_id: string;
  member_id: string;
  category: string;
  claimed_amount: number;
  treatment_date: string;
  hospital_name: string | null;
  status: string;
  decision: string | null;
  approved_amount: number | null;
  confidence_score: number | null;
  rejection_reasons: string[] | null;
  error_message: string | null;
  fraud_score: number | null;
  fraud_signals: unknown;
  trace_json: Record<string, unknown> | null;
  current_step: string;
  created_at: string;
  completed_at: string | null;
}

export interface DashboardStats {
  total: number;
  approved: number;
  rejected: number;
  partial: number;
  manual_review: number;
  completed: number;
  avg_processing_ms: number | null;
}

export async function getAllClaims(): Promise<DashboardClaim[]> {
  const rows = (await query(
    `SELECT claim_id, member_id, category, claimed_amount, treatment_date,
            hospital_name, status, decision, approved_amount, confidence_score,
            rejection_reasons, error_message, fraud_score, fraud_signals,
            trace_json, current_step, created_at, completed_at
     FROM claims
     ORDER BY created_at DESC
     LIMIT 100`
  )) as unknown as ClaimRow[];

  return rows.map((row) => ({
    claim_id: row.claim_id,
    member_id: row.member_id,
    category: row.category,
    claimed_amount: row.claimed_amount != null ? Number(row.claimed_amount) : 0,
    treatment_date: String(row.treatment_date),
    hospital_name: row.hospital_name,
    status: row.status,
    decision: row.decision,
    approved_amount: row.approved_amount != null ? Number(row.approved_amount) : null,
    confidence_score: row.confidence_score != null ? Number(row.confidence_score) : null,
    rejection_reasons: row.rejection_reasons,
    error_message: row.error_message,
    fraud_score: row.fraud_score != null ? Number(row.fraud_score) : null,
    fraud_signals: row.fraud_signals,
    trace_json: row.trace_json,
    current_step: row.current_step,
    created_at: row.created_at ? String(row.created_at) : "",
    completed_at: row.completed_at ? String(row.completed_at) : null,
  }));
}

export async function getClaimById(claimId: string): Promise<DashboardClaim | null> {
  const rows = (await query(
    `SELECT claim_id, member_id, category, claimed_amount, treatment_date,
            hospital_name, status, decision, approved_amount, confidence_score,
            rejection_reasons, error_message, fraud_score, fraud_signals,
            trace_json, current_step, created_at, completed_at
     FROM claims WHERE claim_id = $1`,
    [claimId]
  )) as unknown as ClaimRow[];

  if (!rows || rows.length === 0) return null;

  const row = rows[0];
  return {
    claim_id: row.claim_id,
    member_id: row.member_id,
    category: row.category,
    claimed_amount: row.claimed_amount != null ? Number(row.claimed_amount) : 0,
    treatment_date: String(row.treatment_date),
    hospital_name: row.hospital_name,
    status: row.status,
    decision: row.decision,
    approved_amount: row.approved_amount != null ? Number(row.approved_amount) : null,
    confidence_score: row.confidence_score != null ? Number(row.confidence_score) : null,
    rejection_reasons: row.rejection_reasons,
    error_message: row.error_message,
    fraud_score: row.fraud_score != null ? Number(row.fraud_score) : null,
    fraud_signals: row.fraud_signals,
    trace_json: row.trace_json,
    current_step: row.current_step,
    created_at: row.created_at ? String(row.created_at) : "",
    completed_at: row.completed_at ? String(row.completed_at) : null,
  };
}

export async function getDashboardStats(): Promise<DashboardStats> {
  const rows = await query(
    `SELECT
       COUNT(*)::int AS total,
       COUNT(*) FILTER (WHERE decision = 'APPROVED')::int AS approved,
       COUNT(*) FILTER (WHERE decision = 'REJECTED')::int AS rejected,
       COUNT(*) FILTER (WHERE decision = 'PARTIAL')::int AS partial,
       COUNT(*) FILTER (WHERE decision = 'MANUAL_REVIEW')::int AS manual_review,
       COUNT(*) FILTER (WHERE status = 'COMPLETED')::int AS completed,
       AVG(EXTRACT(EPOCH FROM (completed_at - created_at)) * 1000)
         FILTER (WHERE completed_at IS NOT NULL) AS avg_processing_ms
     FROM claims`
  );

  const row = rows[0] || {};
  return {
    total: Number(row.total) || 0,
    approved: Number(row.approved) || 0,
    rejected: Number(row.rejected) || 0,
    partial: Number(row.partial) || 0,
    manual_review: Number(row.manual_review) || 0,
    completed: Number(row.completed) || 0,
    avg_processing_ms: row.avg_processing_ms != null ? Number(row.avg_processing_ms) : null,
  };
}
