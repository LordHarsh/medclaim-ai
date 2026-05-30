from datetime import date, datetime
from typing import Optional
import uuid

from sqlalchemy import ARRAY, Boolean, Column, Date, DateTime, Integer, Numeric, String, Text
from sqlalchemy.dialects.postgresql import JSON, UUID
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


class Base(DeclarativeBase):
    @classmethod
    def get(cls, session, pk):
        return session.get(cls, pk)


class Member(Base):
    __tablename__ = "members"

    member_id: Mapped[str] = mapped_column(String(20), primary_key=True)
    auth_user_id: Mapped[Optional[str]] = mapped_column(String(64), unique=True)
    name: Mapped[str] = mapped_column(String(128))
    date_of_birth: Mapped[date] = mapped_column(Date)
    gender: Mapped[str] = mapped_column(String(1))
    relationship: Mapped[str] = mapped_column(String(20))
    join_date: Mapped[date] = mapped_column(Date)
    primary_member_id: Mapped[Optional[str]] = mapped_column(String(20))
    dependents: Mapped[list] = mapped_column(ARRAY(Text), default=list)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))

    def __repr__(self) -> str:
        return f"<Member member_id={self.member_id!r} name={self.name!r}>"


class Claim(Base):
    __tablename__ = "claims"

    claim_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    member_id: Mapped[str] = mapped_column(String(20))
    policy_id: Mapped[str] = mapped_column(String(50))
    category: Mapped[str] = mapped_column(String(30))
    claimed_amount: Mapped[float] = mapped_column(Numeric(10, 2))
    treatment_date: Mapped[date] = mapped_column(Date)
    hospital_name: Mapped[Optional[str]] = mapped_column(String(256))
    status: Mapped[str] = mapped_column(String(20), default="QUEUED")
    current_step: Mapped[Optional[str]] = mapped_column(String(50))
    decision: Mapped[Optional[str]] = mapped_column(String(20))
    approved_amount: Mapped[Optional[float]] = mapped_column(Numeric(10, 2))
    confidence_score: Mapped[Optional[float]] = mapped_column(Numeric(4, 3))
    rejection_reasons: Mapped[list] = mapped_column(ARRAY(Text), default=list)
    error_message: Mapped[Optional[str]] = mapped_column(Text)
    fraud_score: Mapped[Optional[float]] = mapped_column(Numeric(4, 3))
    fraud_signals: Mapped[Optional[dict]] = mapped_column(JSON, default=list)
    trace_json: Mapped[Optional[dict]] = mapped_column(JSON, default=dict)
    sqs_message_id: Mapped[Optional[str]] = mapped_column(String(128))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    completed_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))

    def __repr__(self) -> str:
        return f"<Claim claim_id={self.claim_id!r} member_id={self.member_id!r} status={self.status!r}>"


class ClaimDocument(Base):
    __tablename__ = "claim_documents"

    doc_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    claim_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True))
    s3_key: Mapped[str] = mapped_column(String(512))
    original_name: Mapped[str] = mapped_column(String(256))
    content_type: Mapped[str] = mapped_column(String(100))
    size_bytes: Mapped[int] = mapped_column(Integer)
    detected_type: Mapped[Optional[str]] = mapped_column(String(30))
    quality_score: Mapped[Optional[float]] = mapped_column(Numeric(3, 2))
    is_readable: Mapped[Optional[bool]] = mapped_column(Boolean)
    quality_issues: Mapped[list] = mapped_column(ARRAY(Text), default=list)
    patient_name_found: Mapped[Optional[str]] = mapped_column(String(128))
    extraction_json: Mapped[Optional[dict]] = mapped_column(JSON)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))

    def __repr__(self) -> str:
        return f"<ClaimDocument doc_id={self.doc_id!r} claim_id={self.claim_id!r} s3_key={self.s3_key!r}>"


class ClaimHistory(Base):
    __tablename__ = "claim_history"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    member_id: Mapped[str] = mapped_column(String(20))
    claim_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True))
    claim_date: Mapped[date] = mapped_column(Date)
    amount: Mapped[float] = mapped_column(Numeric(10, 2))
    provider: Mapped[Optional[str]] = mapped_column(String(256))
    category: Mapped[Optional[str]] = mapped_column(String(30))
    status: Mapped[Optional[str]] = mapped_column(String(20))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))

    def __repr__(self) -> str:
        return f"<ClaimHistory id={self.id!r} member_id={self.member_id!r} claim_date={self.claim_date!r}>"


class PolicyConfig(Base):
    __tablename__ = "policy_config"

    policy_id: Mapped[str] = mapped_column(String(50), primary_key=True)
    config_json: Mapped[dict] = mapped_column(JSON)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))

    def __repr__(self) -> str:
        return f"<PolicyConfig policy_id={self.policy_id!r}>"
