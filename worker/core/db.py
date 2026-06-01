import json
import uuid
from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import create_engine, event, func, text, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import sessionmaker

from core.config import DATABASE_URL
from models.orm import Claim, ClaimDocument, ClaimHistory, Member
from models.orm import PolicyConfig as PolicyConfigORM
from models.policy import PolicyConfig


# ---------------------------------------------------------------------------
# Engine + session factory (module-level; reused across warm Lambda invocations)
# ---------------------------------------------------------------------------

engine = create_engine(
    DATABASE_URL,
    pool_pre_ping=True,   # detect stale connections after Lambda freeze/thaw
    pool_size=1,          # Lambda is single-threaded per invocation
    max_overflow=0,
)


@event.listens_for(engine, "connect")
def _set_rls_bypass(dbapi_connection, connection_record):
    """Automatically bypass RLS on every new physical connection."""
    cursor = dbapi_connection.cursor()
    cursor.execute("SET app.bypass_rls = 'on'")
    cursor.close()


Session = sessionmaker(bind=engine, expire_on_commit=False)


# ---------------------------------------------------------------------------
# Read functions
# ---------------------------------------------------------------------------

def fetch_claim(claim_id: str) -> Optional[Claim]:
    """Fetch claim record by ID."""
    try:
        claim_uuid = uuid.UUID(claim_id)
    except ValueError:
        return None
    with Session() as session:
        claim = session.get(Claim, claim_uuid)
        if not claim:
            return None
        session.expunge(claim)
        return claim


def fetch_claim_documents(claim_id: str) -> list[ClaimDocument]:
    """Fetch all documents for a claim, ordered by created_at."""
    with Session() as session:
        docs = (
            session.query(ClaimDocument)
            .filter(ClaimDocument.claim_id == uuid.UUID(claim_id))
            .order_by(ClaimDocument.created_at)
            .all()
        )
        session.expunge_all()
        return docs


def fetch_member(member_id: str) -> Optional[Member]:
    """Fetch member record."""
    with Session() as session:
        member = session.get(Member, member_id)
        if not member:
            return None
        session.expunge(member)
        return member


def fetch_policy_config(policy_id: str) -> Optional[PolicyConfig]:
    """Fetch and parse policy configuration into a typed PolicyConfig Pydantic model."""
    with Session() as session:
        config = session.get(PolicyConfigORM, policy_id)
        if not config:
            return None
        raw = config.config_json if isinstance(config.config_json, dict) else json.loads(config.config_json)
        return PolicyConfig.model_validate(raw)


def fetch_claim_history(member_id: str) -> list[ClaimHistory]:
    """Fetch claim history for fraud detection (most recent 100 records)."""
    with Session() as session:
        rows = (
            session.query(ClaimHistory)
            .filter(ClaimHistory.member_id == member_id)
            .order_by(ClaimHistory.claim_date.desc())
            .limit(100)
            .all()
        )
        session.expunge_all()
        return rows


def fetch_ytd_approved_total(member_id: str, policy_start_date: str) -> float:
    """Calculate year-to-date approved amount for the member."""
    with Session() as session:
        result = (
            session.query(func.coalesce(func.sum(Claim.approved_amount), 0))
            .filter(
                Claim.member_id == member_id,
                Claim.decision == "APPROVED",
                Claim.created_at >= policy_start_date,
            )
            .scalar()
        )
        return float(result)


# ---------------------------------------------------------------------------
# Write functions
# ---------------------------------------------------------------------------

def update_claim_status(claim_id: str, status: str, current_step: str = None) -> None:
    """Update claim processing status."""
    with Session() as session:
        values = {"status": status, "updated_at": datetime.now(timezone.utc)}
        if current_step is not None:
            values["current_step"] = current_step
        session.execute(
            update(Claim).where(Claim.claim_id == uuid.UUID(claim_id)).values(**values)
        )
        session.commit()


def update_claim_step(claim_id: str, current_step: str, step_trace: dict = None) -> None:
    """Update current step and, optionally, append to trace via raw SQL."""
    with Session() as session:
        if step_trace:
            session.execute(
                text(
                    """
                    UPDATE claims
                    SET current_step = :step,
                        updated_at   = NOW(),
                        trace_json   = jsonb_set(
                            COALESCE(trace_json, '{"steps": []}'),
                            '{steps}',
                            COALESCE(trace_json->'steps', '[]'::jsonb) || :trace::jsonb
                        )
                    WHERE claim_id = :claim_id
                    """
                ),
                {
                    "step": current_step,
                    "trace": json.dumps(step_trace),
                    "claim_id": claim_id,
                },
            )
        else:
            session.execute(
                update(Claim)
                .where(Claim.claim_id == uuid.UUID(claim_id))
                .values(current_step=current_step, updated_at=datetime.now(timezone.utc))
            )
        session.commit()


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
) -> None:
    """Write final decision and full trace to the claims table."""
    now = datetime.now(timezone.utc)
    with Session() as session:
        session.execute(
            update(Claim)
            .where(Claim.claim_id == uuid.UUID(claim_id))
            .values(
                status="COMPLETED",
                decision=decision,
                approved_amount=approved_amount,
                confidence_score=confidence_score,
                rejection_reasons=rejection_reasons,
                fraud_score=fraud_score,
                fraud_signals=fraud_signals,
                trace_json=trace_json,
                error_message=error_message,
                completed_at=now,
                updated_at=now,
            )
        )
        session.commit()


def persist_early_stop(
    claim_id: str,
    reason: str,
    message: str,
    trace_json: dict,
) -> None:
    """Write early stop — NO decision made. Just tells the user what to fix.

    Per test cases TC001-TC003: decision must be null, system must not reject,
    just stop and ask for correct documents.
    """
    now = datetime.now(timezone.utc)
    with Session() as session:
        session.execute(
            update(Claim)
            .where(Claim.claim_id == uuid.UUID(claim_id))
            .values(
                status="NEEDS_REUPLOAD",
                decision=None,
                error_message=message,
                trace_json=trace_json,
                completed_at=now,
                updated_at=now,
            )
        )
        session.commit()


def check_idempotency(claim_id: str, sqs_message_id: str) -> bool:
    """
    Check if this SQS message has already been processed.
    Returns True if already processed (should skip).

    Atomically sets sqs_message_id where it is currently NULL.
    rowcount == 0 means a message ID was already present → duplicate.
    The unique index on sqs_message_id catches concurrent races.
    """
    with Session() as session:
        try:
            result = session.execute(
                update(Claim)
                .where(Claim.claim_id == uuid.UUID(claim_id), Claim.sqs_message_id.is_(None))
                .values(sqs_message_id=sqs_message_id)
            )
            session.commit()
            return result.rowcount == 0  # 0 → already had a message_id
        except IntegrityError:
            session.rollback()
            return True


def update_document_verification(claim_id: str, doc_results: list) -> None:
    """Update claim_documents with Vision/LLM verification results (detected_type, quality, patient name)."""
    with Session() as session:
        for doc in doc_results:
            session.execute(
                update(ClaimDocument)
                .where(
                    ClaimDocument.claim_id == uuid.UUID(claim_id),
                    ClaimDocument.s3_key == doc.get("s3_key"),
                )
                .values(
                    detected_type=doc.get("detected_type"),
                    quality_score=doc.get("quality_score"),
                    is_readable=doc.get("is_readable"),
                    quality_issues=doc.get("quality_issues", []),
                    patient_name_found=doc.get("patient_name_found"),
                )
            )
        session.commit()
