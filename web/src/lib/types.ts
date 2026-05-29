export interface ClaimRow {
  claim_id: string;
  member_id: string;
  policy_id: string;
  category: string;
  claimed_amount: number;
  approved_amount: number | null;
  treatment_date: string;
  hospital_name: string | null;
  status: string;
  current_step: string;
  decision: string | null;
  confidence_score: number | null;
  rejection_reasons: string[] | null;
  error_message: string | null;
  fraud_score: number | null;
  fraud_signals: unknown;
  trace_json: Record<string, unknown> | null;
  sqs_message_id: string | null;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
}

export interface MemberRow {
  member_id: string;
  auth_user_id: string | null;
  name: string;
  date_of_birth: string;
  gender: string;
  relationship: string;
  join_date: string;
  primary_member_id: string | null;
  dependents: string[];
  created_at: string;
}

export interface ClaimDocumentRow {
  doc_id: string;
  claim_id: string;
  s3_key: string;
  original_name: string;
  content_type: string;
  size_bytes: number;
  detected_type: string | null;
  quality_score: number | null;
  is_readable: boolean | null;
  quality_issues: string[];
  patient_name_found: string | null;
  extraction_json: unknown;
  created_at: string;
}
