"""
Database access layer for Neon PostgreSQL.
Handles all read/write operations for the claims pipeline.
"""

import json
import logging
from contextlib import contextmanager
from datetime import datetime
from typing import Optional

import psycopg2
import psycopg2.extras

from config import DATABASE_URL

logger = logging.getLogger(__name__)

psycopg2.extras.register_uuid()


@contextmanager
def get_connection():
    """Get a database connection with RLS bypass (service role) and auto-commit."""
    conn = psycopg2.connect(DATABASE_URL)
    try:
        with conn.cursor() as cur:
            cur.execute("SET app.bypass_rls = 'on'")
        conn.commit()
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def fetch_claim(claim_id: str) -> Optional[dict]:
    """Fetch claim record by ID."""
    with get_connection() as conn:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute(
                """
                SELECT claim_id, member_id, policy_id, category, claimed_amount,
                       treatment_date, hospital_name, status, current_step,
                       sqs_message_id, trace_json, created_at
                FROM claims
                WHERE claim_id = %s
                """,
                (claim_id,),
            )
            row = cur.fetchone()
            return dict(row) if row else None


def fetch_claim_documents(claim_id: str) -> list:
    """Fetch all documents for a claim."""
    with get_connection() as conn:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute(
                """
                SELECT doc_id, s3_key, original_name, content_type, size_bytes,
                       detected_type, quality_score, is_readable, quality_issues,
                       patient_name_found, extraction_json
                FROM claim_documents
                WHERE claim_id = %s
                ORDER BY created_at
                """,
                (claim_id,),
            )
            return [dict(row) for row in cur.fetchall()]


def fetch_member(member_id: str) -> Optional[dict]:
    """Fetch member record."""
    with get_connection() as conn:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute(
                """
                SELECT member_id, name, date_of_birth, gender, relationship,
                       join_date, primary_member_id, dependents
                FROM members
                WHERE member_id = %s
                """,
                (member_id,),
            )
            row = cur.fetchone()
            return dict(row) if row else None


def fetch_policy_config(policy_id: str) -> Optional[dict]:
    """Fetch policy configuration JSON."""
    with get_connection() as conn:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute(
                "SELECT config_json FROM policy_config WHERE policy_id = %s",
                (policy_id,),
            )
            row = cur.fetchone()
            if row:
                config = row["config_json"]
                return config if isinstance(config, dict) else json.loads(config)
            return None


def fetch_claim_history(member_id: str) -> list:
    """Fetch claim history for fraud detection."""
    with get_connection() as conn:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute(
                """
                SELECT claim_id, claim_date, amount, provider, category, status
                FROM claim_history
                WHERE member_id = %s
                ORDER BY claim_date DESC
                LIMIT 100
                """,
                (member_id,),
            )
            return [dict(row) for row in cur.fetchall()]


def fetch_ytd_approved_total(member_id: str, policy_start_date: str) -> float:
    """Calculate year-to-date approved amount for the member."""
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT COALESCE(SUM(approved_amount), 0)
                FROM claims
                WHERE member_id = %s
                  AND decision = 'APPROVED'
                  AND created_at >= %s
                """,
                (member_id, policy_start_date),
            )
            return float(cur.fetchone()[0])


def update_claim_status(claim_id: str, status: str, current_step: str = None):
    """Update claim processing status."""
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                UPDATE claims
                SET status = %s,
                    current_step = COALESCE(%s, current_step),
                    updated_at = NOW()
                WHERE claim_id = %s
                """,
                (status, current_step, claim_id),
            )


def update_claim_step(claim_id: str, current_step: str, step_trace: dict = None):
    """Update current step and append to trace."""
    with get_connection() as conn:
        with conn.cursor() as cur:
            if step_trace:
                cur.execute(
                    """
                    UPDATE claims
                    SET current_step = %s,
                        updated_at = NOW(),
                        trace_json = jsonb_set(
                            COALESCE(trace_json, '{"steps": []}'),
                            '{steps}',
                            COALESCE(trace_json->'steps', '[]'::jsonb) || %s::jsonb
                        )
                    WHERE claim_id = %s
                    """,
                    (current_step, json.dumps(step_trace), claim_id),
                )
            else:
                cur.execute(
                    """
                    UPDATE claims
                    SET current_step = %s, updated_at = NOW()
                    WHERE claim_id = %s
                    """,
                    (current_step, claim_id),
                )


def persist_final_result(
    claim_id: str,
    decision: str,
    approved_amount: Optional[float],
    confidence_score: float,
    rejection_reasons: list,
    fraud_score: Optional[float],
    fraud_signals: list,
    trace_json: dict,
    error_message: Optional[str] = None,
):
    """Write final decision and full trace to the claims table."""
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                UPDATE claims
                SET status = 'COMPLETED',
                    decision = %s,
                    approved_amount = %s,
                    confidence_score = %s,
                    rejection_reasons = %s,
                    fraud_score = %s,
                    fraud_signals = %s,
                    trace_json = %s,
                    error_message = %s,
                    completed_at = NOW(),
                    updated_at = NOW()
                WHERE claim_id = %s
                """,
                (
                    decision,
                    approved_amount,
                    confidence_score,
                    rejection_reasons,
                    fraud_score,
                    json.dumps(fraud_signals),
                    json.dumps(trace_json),
                    error_message,
                    claim_id,
                ),
            )


def persist_early_stop(
    claim_id: str,
    reason: str,
    message: str,
    trace_json: dict,
):
    """Write early stop result (NEEDS_REUPLOAD)."""
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                UPDATE claims
                SET status = 'NEEDS_REUPLOAD',
                    error_message = %s,
                    trace_json = %s,
                    completed_at = NOW(),
                    updated_at = NOW()
                WHERE claim_id = %s
                """,
                (message, json.dumps(trace_json), claim_id),
            )


def check_idempotency(claim_id: str, sqs_message_id: str) -> bool:
    """
    Check if this SQS message has already been processed.
    Returns True if already processed (should skip).
    """
    with get_connection() as conn:
        with conn.cursor() as cur:
            # Try to set the sqs_message_id; unique index prevents duplicates
            try:
                cur.execute(
                    """
                    UPDATE claims
                    SET sqs_message_id = %s
                    WHERE claim_id = %s AND sqs_message_id IS NULL
                    """,
                    (sqs_message_id, claim_id),
                )
                conn.commit()
                return cur.rowcount == 0  # 0 means already had a message_id
            except psycopg2.errors.UniqueViolation:
                conn.rollback()
                return True


def update_document_verification(claim_id: str, doc_results: list):
    """Update claim_documents with verification results."""
    with get_connection() as conn:
        with conn.cursor() as cur:
            for doc in doc_results:
                cur.execute(
                    """
                    UPDATE claim_documents
                    SET detected_type = %s,
                        quality_score = %s,
                        is_readable = %s,
                        quality_issues = %s,
                        patient_name_found = %s
                    WHERE claim_id = %s AND s3_key = %s
                    """,
                    (
                        doc.get("detected_type"),
                        doc.get("quality_score"),
                        doc.get("is_readable"),
                        doc.get("quality_issues", []),
                        doc.get("patient_name_found"),
                        claim_id,
                        doc.get("s3_key"),
                    ),
                )
