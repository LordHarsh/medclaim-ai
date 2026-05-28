-- MedClaim.AI Database Schema
-- Target: Neon PostgreSQL
-- Note: neon_auth schema is managed by Neon Auth — do NOT create auth tables

-- ============================================================
-- MEMBERS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS members (
    member_id         VARCHAR(20) PRIMARY KEY,
    auth_user_id      VARCHAR(64) UNIQUE,
    name              VARCHAR(128) NOT NULL,
    date_of_birth     DATE NOT NULL,
    gender            CHAR(1) NOT NULL,
    relationship      VARCHAR(20) NOT NULL,
    join_date         DATE NOT NULL,
    primary_member_id VARCHAR(20) REFERENCES members(member_id),
    dependents        TEXT[] DEFAULT '{}',
    created_at        TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- CLAIMS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS claims (
    claim_id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    member_id         VARCHAR(20) NOT NULL REFERENCES members(member_id),
    policy_id         VARCHAR(50) NOT NULL,
    category          VARCHAR(30) NOT NULL CHECK (category IN (
                        'CONSULTATION','DIAGNOSTIC','PHARMACY',
                        'DENTAL','VISION','ALTERNATIVE_MEDICINE')),
    claimed_amount    NUMERIC(10,2) NOT NULL CHECK (claimed_amount > 0),
    treatment_date    DATE NOT NULL,
    hospital_name     VARCHAR(256),

    -- Processing state
    status            VARCHAR(20) NOT NULL DEFAULT 'QUEUED' CHECK (status IN (
                        'QUEUED','PROCESSING','COMPLETED','FAILED','NEEDS_REUPLOAD')),
    current_step      VARCHAR(50),

    -- Decision output
    decision          VARCHAR(20) CHECK (decision IN (
                        'APPROVED','PARTIAL','REJECTED','MANUAL_REVIEW')),
    approved_amount   NUMERIC(10,2),
    confidence_score  NUMERIC(4,3),
    rejection_reasons TEXT[] DEFAULT '{}',
    error_message     TEXT,
    fraud_score       NUMERIC(4,3),
    fraud_signals     JSONB DEFAULT '[]',

    -- Full trace for explainability
    trace_json        JSONB DEFAULT '{}',

    -- SQS idempotency
    sqs_message_id    VARCHAR(128),

    -- Timestamps
    created_at        TIMESTAMPTZ DEFAULT NOW(),
    updated_at        TIMESTAMPTZ DEFAULT NOW(),
    completed_at      TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_claims_member_status ON claims(member_id, status);
CREATE INDEX IF NOT EXISTS idx_claims_member_date ON claims(member_id, treatment_date);
CREATE INDEX IF NOT EXISTS idx_claims_status ON claims(status) WHERE status = 'QUEUED';
CREATE UNIQUE INDEX IF NOT EXISTS idx_claims_sqs_idempotent ON claims(sqs_message_id)
    WHERE sqs_message_id IS NOT NULL;

-- ============================================================
-- CLAIM DOCUMENTS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS claim_documents (
    doc_id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    claim_id          UUID NOT NULL REFERENCES claims(claim_id),
    s3_key            VARCHAR(512) NOT NULL,
    original_name     VARCHAR(256) NOT NULL,
    content_type      VARCHAR(100) NOT NULL,
    size_bytes        INTEGER NOT NULL,

    -- Populated by pipeline
    detected_type     VARCHAR(30),
    quality_score     NUMERIC(3,2),
    is_readable       BOOLEAN,
    quality_issues    TEXT[] DEFAULT '{}',
    patient_name_found VARCHAR(128),
    extraction_json   JSONB,

    created_at        TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_docs_claim ON claim_documents(claim_id);

-- ============================================================
-- CLAIM HISTORY TABLE (denormalized for fast fraud queries)
-- ============================================================
CREATE TABLE IF NOT EXISTS claim_history (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    member_id         VARCHAR(20) NOT NULL,
    claim_id          UUID NOT NULL REFERENCES claims(claim_id),
    claim_date        DATE NOT NULL,
    amount            NUMERIC(10,2) NOT NULL,
    provider          VARCHAR(256),
    category          VARCHAR(30),
    status            VARCHAR(20),
    created_at        TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_history_member_date ON claim_history(member_id, claim_date);
CREATE INDEX IF NOT EXISTS idx_history_member_month ON claim_history(member_id, (date_trunc('month', claim_date::timestamp)));

-- ============================================================
-- POLICY CONFIG TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS policy_config (
    policy_id         VARCHAR(50) PRIMARY KEY,
    config_json       JSONB NOT NULL,
    updated_at        TIMESTAMPTZ DEFAULT NOW()
);
