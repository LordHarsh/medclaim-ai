# Low-Level Design: Health Insurance Claims Processing System

## Table of Contents

1. [System Architecture](#1-system-architecture)
2. [Authentication Flow](#2-authentication-flow-neon-auth)
3. [Database Schema](#3-database-schema)
4. [API Contracts](#4-api-contracts)
5. [LangGraph Pipeline Design](#5-langgraph-pipeline-design)
6. [Agent Designs](#6-agent-designs)
7. [File Upload Flow](#7-file-upload-flow)
8. [SSE Real-time Updates](#8-sse-real-time-updates)
9. [Policy Engine Logic](#9-policy-engine-logic)
10. [Fraud Detection Logic](#10-fraud-detection-logic)
11. [Error Handling & Graceful Degradation](#11-error-handling--graceful-degradation)
12. [Observability](#12-observability)
13. [Security Considerations](#13-security-considerations)
14. [Component Contracts](#14-component-contracts)
15. [Infrastructure](#15-infrastructure)
16. [Design Decisions & Trade-offs](#16-design-decisions--trade-offs)

---

## 1. System Architecture

### Component Diagram

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                           CLIENT (Vercel Edge Network)                           │
│                                                                                 │
│  ┌───────────────────────────────────────────────────────────────────────────┐  │
│  │  Next.js 16 (App Router)                                                  │  │
│  │                                                                           │  │
│  │  Pages:                                                                   │  │
│  │    /auth/sign-in, /auth/sign-up     (Neon Auth)                          │  │
│  │    /onboarding                       (Member binding)                     │  │
│  │    /claims/new                       (Submit claim + upload docs)         │  │
│  │    /claims/[id]                      (Real-time status + decision)        │  │
│  │    /dashboard                        (All claims + trace viewer)          │  │
│  │                                                                           │  │
│  │  Server Actions:  submitClaim | getClaimStatus | getClaimTrace | listClaims│  │
│  │  Route Handlers:  GET /api/upload-url | GET /api/claims/[id]/stream (SSE) │  │
│  │  Auth API:        /api/auth/[...path] (Neon Auth proxy)                   │  │
│  └───────────────────────────────────────────────────────────────────────────┘  │
└──────────┬──────────────────┬──────────────────┬────────────────────────────────┘
           │                  │                  │
           ▼                  ▼                  ▼
┌──────────────────┐ ┌──────────────────┐ ┌──────────────────┐
│     AWS S3       │ │   Neon Postgres  │ │     AWS SQS      │
│   (documents)    │ │  (all data +     │ │  (job queue)     │
│                  │ │   neon_auth)     │ │                  │
│ claims/{id}/     │ │                  │ │ medclaim-        │
│   doc1.jpg       │ │ members          │ │   processing     │
│   doc2.pdf       │ │ claims           │ │                  │
│                  │ │ claim_documents  │ │ DLQ: medclaim-   │
│                  │ │ claim_history    │ │   dlq            │
│                  │ │ policy_config    │ │                  │
│                  │ │ neon_auth.*      │ │                  │
└────────┬─────────┘ └────────┬─────────┘ └────────┬─────────┘
         │                    │                     │
         │                    │           SQS Event Source Mapping
         │                    │                     │
         │                    │                     ▼
         │                    │  ┌─────────────────────────────────────────────────┐
         │                    │  │  AWS Lambda (Container Image via ECR)            │
         │                    │  │  "medclaim-worker"                               │
         │   fetch docs       │  │                                                 │
         │◄───────────────────┼──│  ┌───────────────────────────────────────────┐  │
         │                    │  │  │        LangGraph State Machine             │  │
         │                    │  │  │                                           │  │
         │                    │◄─│  │  START → load_context                     │  │
         │   read/write       │  │  │              │                            │  │
         │                    │  │  │              ▼                            │  │
         │                    │  │  │  ┌─────────────────────┐                 │  │
         │                    │  │  │  │ 1. Doc Verification │──(fail)──→ STOP │  │
         │                    │  │  │  └──────────┬──────────┘                 │  │
         │                    │  │  │             ▼                            │  │
         │                    │  │  │  ┌─────────────────────┐                 │  │
         │                    │  │  │  │ 2. Doc Extraction   │                 │  │
         │                    │  │  │  └──────────┬──────────┘                 │  │
         │                    │  │  │             ▼                            │  │
         │                    │  │  │  ┌─────────────────────┐                 │  │
         │                    │  │  │  │ 3. Policy Engine    │                 │  │
         │                    │  │  │  └──────────┬──────────┘                 │  │
         │                    │  │  │             ▼                            │  │
         │                    │  │  │  ┌─────────────────────┐                 │  │
         │                    │  │  │  │ 4. Fraud Detection  │                 │  │
         │                    │  │  │  └──────────┬──────────┘                 │  │
         │                    │  │  │             ▼                            │  │
         │                    │  │  │  ┌─────────────────────┐                 │  │
         │                    │  │  │  │ 5. Final Decision   │                 │  │
         │                    │  │  │  └──────────┬──────────┘                 │  │
         │                    │  │  │             ▼                            │  │
         │                    │  │  │         persist → END                    │  │
         │                    │  │  └───────────────────────────────────────────┘  │
         │                    │  │                    │                             │
         │                    │  │                    ▼                             │
         │                    │  │  ┌───────────────────────────────────────────┐  │
         │                    │  │  │  Anthropic Claude Sonnet API              │  │
         │                    │  │  │  (Vision + Text reasoning)                │  │
         │                    │  │  └───────────────────────────────────────────┘  │
         │                    │  │                    │                             │
         │                    │  │                    ▼                             │
         │                    │  │  ┌───────────────────────────────────────────┐  │
         │                    │  │  │  LangSmith (trace export)                 │  │
         │                    │  │  └───────────────────────────────────────────┘  │
         │                    │  └─────────────────────────────────────────────────┘
```

### Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Auth | Neon Auth (Better Auth) | Auth data in same DB; direct SQL joins; no external service; branch-aware |
| Worker | Lambda (container image) | Auto-scales with SQS; no idle cost; 15-min timeout sufficient for 20-60s processing |
| Queue | SQS + DLQ | Native Lambda trigger; at-least-once delivery; dead letter for 3x failures |
| File storage | S3 presigned URLs | Direct client upload bypasses Vercel 4.5MB body limit; cheap; durable |
| Real-time | SSE polling Neon | Vercel serverless cannot hold WebSocket; polling is simple and reliable |
| LLM | Claude (Vision) + Gemini (text) | Claude for document OCR/classification; Gemini Flash for text classification and message generation. Configurable via LLM_PROVIDER_OVERRIDE env var |
| Orchestration | LangGraph | State machine with conditional edges; native LangSmith integration; production-tested |
| Batch size | 1 claim per Lambda | Isolates failures; each claim independent; simplifies error handling |

---

## 2. Authentication Flow (Neon Auth)

### Architecture

Neon Auth is a managed Better Auth service that stores all authentication data directly in the Neon PostgreSQL database under the `neon_auth` schema.

```
┌──────────────┐        ┌──────────────┐        ┌──────────────────────────┐
│  Browser     │◄──────►│  Next.js 16  │◄──────►│  Neon Auth Service       │
│  (cookies)   │        │  (proxy)     │        │  (managed Better Auth)   │
└──────────────┘        └──────────────┘        └───────────┬──────────────┘
                                                            │
                                                            ▼
                                                ┌──────────────────────────┐
                                                │  Neon PostgreSQL         │
                                                │  neon_auth.user          │
                                                │  neon_auth.session       │
                                                │  neon_auth.account       │
                                                │  neon_auth.verification  │
                                                └──────────────────────────┘
```

### Tables Created Automatically

| Table | Purpose |
|-------|---------|
| `neon_auth.user` | User profiles: id, email, emailVerified, name, createdAt |
| `neon_auth.session` | Active sessions: id, userId, expiresAt, token |
| `neon_auth.account` | Credentials: hashed passwords, OAuth tokens |
| `neon_auth.verification` | Email verification tokens |

### Environment Variables

```bash
NEON_AUTH_BASE_URL=https://ep-xxx.neonauth.us-east-1.aws.neon.tech/neondb/auth
NEON_AUTH_COOKIE_SECRET=<32+ characters, generated via: openssl rand -base64 32>
```

### Key Files

| File | Purpose |
|------|---------|
| `lib/auth/server.ts` | `createNeonAuth({ baseUrl, cookies: { secret } })` |
| `lib/auth/client.ts` | `createAuthClient()` for browser-side operations |
| `app/api/auth/[...path]/route.ts` | `export { GET, POST } from auth.handler()` |
| `proxy.ts` | `auth.middleware({ loginUrl: '/auth/sign-in' })` (Next.js 16 uses proxy.ts) |

### Session Access

```typescript
// Server Components, Server Actions, API Routes:
const { data: session } = await auth.getSession();
// session?.user → { id, name, email }
```

### Member Binding Flow

```
1. User signs up via email/password
2. After first login → redirect to /onboarding
3. User enters their member_id (e.g., EMP001)
4. Server Action: validateAndBindMember()
   a. Verify member_id exists in members table
   b. Verify member.auth_user_id IS NULL (not yet bound)
   c. UPDATE members SET auth_user_id = session.user.id WHERE member_id = $1
5. Subsequent requests: getSession() → user.id → SELECT member_id FROM members WHERE auth_user_id = $1
```

### Route Protection

```typescript
// proxy.ts (Next.js 16)
export default auth.middleware({ loginUrl: '/auth/sign-in' });

export const config = {
  matcher: ['/claims/:path*', '/dashboard/:path*', '/onboarding/:path*'],
};
```

### Authorization Pattern (every server action)

```
1. const { data: session } = await auth.getSession()
2. if (!session?.user) → redirect('/auth/sign-in')
3. SELECT * FROM members WHERE auth_user_id = session.user.id
4. if (!member) → redirect('/onboarding')
5. For claim-specific actions: verify claim.member_id === member.member_id
```

---

## 3. Database Schema

### members

```sql
CREATE TABLE members (
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
```

### claims

```sql
CREATE TABLE claims (
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

CREATE INDEX idx_claims_member_status ON claims(member_id, status);
CREATE INDEX idx_claims_member_date ON claims(member_id, treatment_date);
CREATE INDEX idx_claims_status ON claims(status) WHERE status = 'QUEUED';
CREATE UNIQUE INDEX idx_claims_sqs_idempotent ON claims(sqs_message_id)
    WHERE sqs_message_id IS NOT NULL;
```

### claim_documents

```sql
CREATE TABLE claim_documents (
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

CREATE INDEX idx_docs_claim ON claim_documents(claim_id);
```

### claim_history

```sql
CREATE TABLE claim_history (
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

CREATE INDEX idx_history_member_date ON claim_history(member_id, claim_date);
CREATE INDEX idx_history_member_month ON claim_history(member_id, date_trunc('month', claim_date));
```

### policy_config

```sql
CREATE TABLE policy_config (
    policy_id         VARCHAR(50) PRIMARY KEY,
    config_json       JSONB NOT NULL,
    updated_at        TIMESTAMPTZ DEFAULT NOW()
);
```

### Trace JSON Structure

Stored in `claims.trace_json`. This is the primary explainability artifact.

```json
{
  "pipeline_version": "1.0.0",
  "total_duration_ms": 12450,
  "degraded": false,
  "degradation_notes": [],
  "steps": [
    {
      "step_name": "DOCUMENT_VERIFICATION",
      "step_order": 1,
      "status": "COMPLETED",
      "duration_ms": 3200,
      "summary": "All required documents present and readable",
      "details": {
        "documents_analyzed": 2,
        "types_detected": ["PRESCRIPTION", "HOSPITAL_BILL"],
        "required_types": ["PRESCRIPTION", "HOSPITAL_BILL"],
        "missing_types": [],
        "quality_scores": [0.92, 0.88],
        "patient_names": ["Rajesh Kumar", "Rajesh Kumar"]
      },
      "confidence_contribution": 1.0
    }
  ],
  "final_decision": {
    "decision": "APPROVED",
    "approved_amount": 1350.00,
    "confidence_score": 0.92,
    "calculation_breakdown": { "..." },
    "user_message": "Your claim has been approved for Rs. 1,350...",
    "ops_summary": "Clean consultation claim. All rules passed..."
  }
}
```

---

## 4. API Contracts

### Server Actions

#### submitClaim

```
Input:
  member_id: string
  policy_id: string (default: "PLUM_GHI_2024")
  category: "CONSULTATION" | "DIAGNOSTIC" | "PHARMACY" | "DENTAL" | "VISION" | "ALTERNATIVE_MEDICINE"
  treatment_date: ISO-8601 date
  claimed_amount: number (positive, INR)
  hospital_name?: string
  document_keys: string[] (S3 keys from prior upload)

Output (success):
  { success: true, claim_id: string }

Output (failure):
  { success: false, errors: [{ field: string, message: string }] }

Side effects:
  1. Verify auth session + member binding
  2. Validate all inputs
  3. INSERT into claims (status: QUEUED)
  4. INSERT into claim_documents
  5. Send SQS message: { claim_id }
  6. INSERT into claim_history

Errors: UNAUTHORIZED, MEMBER_NOT_FOUND, INVALID_CATEGORY, INVALID_DATE,
        BELOW_MINIMUM, NO_DOCUMENTS, TOO_MANY_DOCUMENTS
```

#### getClaimStatus

```
Input: claim_id (UUID)
Output: { status, current_step, decision?, approved_amount?, confidence_score?, error_message? }
Auth: Verify session → member → claim ownership
```

#### getClaimTrace

```
Input: claim_id (UUID)
Output: Full trace_json from claims table
Auth: Verify ownership
```

#### listClaims

```
Input: { status?: string, page?: number, limit?: number }
Output: { claims: ClaimSummary[], total: number, page: number }
Auth: Returns only claims belonging to authenticated member
```

### Route Handlers

#### GET /api/upload-url

```
Query: claim_id, filename, content_type, size_bytes
Response: { presigned_url: string, s3_key: string, expires_in: 300 }
Auth: Verify session
Validation: content_type in [image/jpeg, image/png, image/webp, application/pdf], size <= 10MB
```

#### GET /api/claims/[id]/stream

```
Response: SSE (text/event-stream)
Events:
  step_update  → { step, status, message }
  decision     → { decision, approved_amount, confidence_score }
  error        → { error_code, message }
  done         → {}
Behavior: Poll Neon every 2s, max 120s, heartbeat every 15s
Auth: Verify session + claim ownership
```

### Lambda (SQS-triggered, not HTTP)

```
SQS Message Body: { "claim_id": "uuid-string" }

Handler:
  1. Parse claim_id from SQS event record
  2. Fetch claim + documents + member + policy from Neon
  3. Check idempotency (sqs_message_id unique index)
  4. UPDATE claims SET status = 'PROCESSING'
  5. Run LangGraph pipeline
  6. Write final decision + trace to Neon
  7. Return successfully (SQS auto-deletes message)
```

---

## 5. LangGraph Pipeline Design

### State Definition

```python
class ClaimState(TypedDict):
    # Loaded at start
    claim_id: str
    member: dict
    policy: dict
    category: str
    claimed_amount: float
    treatment_date: str
    hospital_name: Optional[str]
    documents: list[dict]       # [{s3_key, content_type, image_bytes}]
    claim_history: list[dict]

    # Populated by agents
    doc_verification: Optional[dict]
    extracted_data: Optional[dict]
    policy_evaluation: Optional[dict]
    fraud_evaluation: Optional[dict]
    final_decision: Optional[dict]

    # Control flow
    should_stop_early: bool
    early_stop_reason: Optional[str]
    early_stop_message: Optional[str]
    degraded_steps: list[str]
    confidence_score: float
    current_step: str
```

### Graph Structure

```
Nodes:
  load_context       → Fetch all data from Neon + S3
  doc_verify         → Document Verification Agent
  doc_extract        → Document Extraction Agent
  policy_engine      → Policy Engine Agent
  fraud_detection    → Fraud Detection Agent
  final_decision     → Final Decision Agent
  persist_result     → Write complete results to Neon
  persist_early_stop → Write error to Neon (status: NEEDS_REUPLOAD)

Conditional Edges:
  START → load_context → doc_verify
  doc_verify → [if should_stop_early] → persist_early_stop → END
  doc_verify → [if verified] → doc_extract → policy_engine → fraud_detection → final_decision → persist_result → END
```

### Error Wrapping

Each node is wrapped:
```python
def safe_node(func, step_name, is_critical):
    try:
        result = func(state)
        update_neon(claim_id, current_step=step_name, partial_trace=result)
        return result
    except Exception as e:
        if is_critical:
            raise  # Lambda fails, SQS retries
        else:
            state["degraded_steps"].append(step_name)
            state["confidence_score"] -= 0.15
            update_neon(claim_id, current_step=step_name, degraded=True)
            return default_result_for(step_name)
```

### DB Update After Each Node

```sql
UPDATE claims
SET current_step = $step,
    updated_at = NOW(),
    trace_json = jsonb_set(trace_json, '{steps,-1}', $step_trace::jsonb)
WHERE claim_id = $claim_id;
```

---

## 6. Agent Designs

### 6.1 Document Verification Agent

**Responsibility:** Classify documents, check quality, detect patient mismatches. Handles TC001, TC002, TC003.

**Input:**
- Document images (bytes from S3)
- Claim category
- Required document types (from policy.document_requirements)
- Expected patient name (from member record)

**Output:**
```python
{
    "verified": bool,
    "documents": [{
        "s3_key": str,
        "detected_type": str,            # PRESCRIPTION | HOSPITAL_BILL | LAB_REPORT | PHARMACY_BILL | UNKNOWN
        "classification_confidence": float,
        "quality_score": float,           # 0.0-1.0
        "is_readable": bool,
        "quality_issues": [str],          # BLURRY | PARTIAL | ALTERED | STAMP_OVER_TEXT | HANDWRITTEN_ILLEGIBLE
        "patient_name_found": str | None
    }],
    "missing_required_types": [str],
    "patient_mismatch": {
        "detected": bool,
        "names_found": [{"document_type": str, "name": str}]
    } | None,
    "should_stop_early": bool,
    "early_stop_reason": str | None,      # WRONG_DOCUMENTS | UNREADABLE | PATIENT_MISMATCH
    "error_message": str | None,          # Specific, actionable, user-facing
    "confidence": float
}
```

**LLM Strategy:** One Claude Vision call per document:
```
System: "Classify this Indian medical document and assess its quality.

Determine:
1. Document type: PRESCRIPTION, HOSPITAL_BILL, LAB_REPORT, PHARMACY_BILL, or UNKNOWN
2. Quality score (0.0-1.0): readability considering blur, stamps, handwriting
3. Patient name exactly as written on the document
4. Quality issues present: BLURRY, PARTIAL, ALTERED, STAMP_OVER_TEXT, HANDWRITTEN_ILLEGIBLE

Return ONLY valid JSON:
{\"type\": str, \"confidence\": float, \"quality_score\": float, \"is_readable\": bool,
 \"quality_issues\": [str], \"patient_name\": str | null}"
```

**Error Messages (must be specific and actionable):**

| Scenario | Message Template |
|----------|-----------------|
| Wrong doc type | "You uploaded {count} {detected_types}, but a {category} claim requires {required_types}. Please upload your {missing_type}." |
| Unreadable | "Your {doc_type} ({filename}) is too blurry to read. Please re-upload a clearer photo. Tip: photograph in good lighting with the document flat on a surface." |
| Patient mismatch | "The {doc1_type} is for '{name1}' but the {doc2_type} shows '{name2}'. All documents must belong to the same patient. Please upload matching documents." |

---

### 6.2 Document Extraction Agent

**Responsibility:** Extract structured data from verified documents using Claude Vision.

**Input:** Verified documents with detected types

**Output:**
```python
{
    "prescription": {
        "doctor_name": str,
        "doctor_registration": str | None,
        "doctor_specialization": str | None,
        "patient_name": str,
        "patient_age": int | None,
        "patient_gender": str | None,
        "date": str | None,
        "diagnosis": [str],
        "medicines": [{"name": str, "dosage": str, "frequency": str, "duration": str}],
        "tests_ordered": [str],
        "hospital_name": str | None,
        "field_confidences": {"doctor_name": float, "patient_name": float, "diagnosis": float, ...}
    } | None,
    "hospital_bill": {
        "hospital_name": str,
        "patient_name": str,
        "date": str,
        "bill_number": str | None,
        "line_items": [{"description": str, "amount": float}],
        "total": float,
        "field_confidences": {...}
    } | None,
    "lab_report": {
        "lab_name": str,
        "patient_name": str,
        "tests": [{"name": str, "result": str, "unit": str, "normal_range": str}],
        "referring_doctor": str | None,
        "date": str
    } | None,
    "pharmacy_bill": {
        "pharmacy_name": str,
        "patient_name": str,
        "medicines": [{"name": str, "quantity": int, "amount": float}],
        "total": float,
        "prescribing_doctor": str | None
    } | None,
    "extraction_confidence": float
}
```

**LLM Strategy:** Type-specific prompts with:
- Indian medical format hints (reg number patterns: STATE/XXXXX/YYYY)
- Common abbreviations (HTN, T2DM, BD, TDS, OD)
- Medicine format (Tab, Cap, Syp, Inj)
- Dosage format ('1-1-1' = morning-afternoon-night)
- Required JSON schema with field_confidences

**Error handling:**
- Invalid JSON → retry once with stricter prompt
- Timeout → empty extraction, confidence 0.3, mark degraded
- Partial extraction → confidence from available field_confidences

---

### 6.3 Policy Engine Agent

**Responsibility:** Apply all policy rules deterministically. LLM only for diagnosis classification.

**Input:** extracted_data, member, policy, category, claimed_amount, treatment_date, hospital_name, YTD totals

**Output:**
```python
{
    "eligible": bool,
    "decision_suggestion": "APPROVED" | "PARTIAL" | "REJECTED",
    "approved_amount": float | None,
    "rejection_reasons": [str],
    "calculation_breakdown": {
        "original_amount": float,
        "eligible_amount": float,
        "network_discount_applied": bool,
        "network_discount_percent": int,
        "discount_amount": float,
        "amount_after_discount": float,
        "copay_percent": int,
        "copay_amount": float,
        "amount_after_copay": float,
        "final_approved_amount": float
    } | None,
    "rule_evaluations": [{"rule_name": str, "passed": bool, "details": str, "blocking": bool}],
    "line_item_decisions": [{"description": str, "amount": float, "approved": bool, "reason": str}] | None,
    "warnings": [str]
}
```

See [Section 9: Policy Engine Logic](#9-policy-engine-logic) for full algorithm.

---

### 6.4 Fraud Detection Agent

**Responsibility:** Compute fraud risk score. Fully deterministic (no LLM).

**Input:** member_id, treatment_date, claimed_amount, hospital_name, claim_history, doc quality_issues

**Output:**
```python
{
    "fraud_score": float,
    "risk_level": "LOW" | "MEDIUM" | "HIGH" | "CRITICAL",
    "requires_manual_review": bool,
    "signals": [{
        "signal_type": str,
        "severity": float,
        "weight": float,
        "description": str,
        "evidence": str
    }]
}
```

See [Section 10: Fraud Detection Logic](#10-fraud-detection-logic) for full algorithm.

---

### 6.5 Final Decision Agent

**Responsibility:** Synthesize all outputs into verdict. Generate user/ops messages via LLM.

**Input:** All prior agent outputs + degraded_steps + confidence

**Output:**
```python
{
    "decision": "APPROVED" | "PARTIAL" | "REJECTED" | "MANUAL_REVIEW",
    "approved_amount": float | None,
    "confidence_score": float,
    "rejection_reasons": [str],
    "user_message": str,
    "ops_summary": str,
    "calculation_breakdown": dict | None,
    "recommendations": [str]
}
```

**Decision Logic (priority order):**
1. If `fraud.requires_manual_review` → MANUAL_REVIEW
2. If `not policy.eligible` → REJECTED
3. If `policy.decision_suggestion == "PARTIAL"` → PARTIAL
4. Else → APPROVED

**Confidence Calculation:**
```
base = 0.95
- Per degraded step: -0.15
- extraction_confidence < 0.8: -(0.8 - extraction_confidence) * 0.3
- Any doc quality_score < 0.6: -0.05 per doc
- fraud_score > 0.3: -0.10
- LLM used for blocking rejection: -0.05

final_confidence = max(0.10, base - sum(deductions))

Safety: if confidence < 0.60 and decision in (APPROVED, PARTIAL) → force MANUAL_REVIEW
```

---

## 7. File Upload Flow

```
Client                         Next.js (Vercel)                 S3
  │                               │                             │
  │  GET /api/upload-url          │                             │
  │  ?filename=x&content_type=y   │                             │
  ├──────────────────────────────►│                             │
  │                               │  generatePresignedUrl()     │
  │                               ├────────────────────────────►│
  │  { presigned_url, s3_key }    │                             │
  │◄──────────────────────────────│                             │
  │                               │                             │
  │  PUT presigned_url            │                             │
  │  Body: file bytes             │                             │
  ├───────────────────────────────┼────────────────────────────►│
  │                               │                             │
  │  (repeat for each file)       │                             │
  │                               │                             │
  │  submitClaim(s3_keys)         │                             │
  ├──────────────────────────────►│  HEAD each key (verify)     │
  │                               ├────────────────────────────►│
  │                               │  INSERT claim + docs        │
  │                               │  Send SQS message           │
  │  { claim_id }                 │                             │
  │◄──────────────────────────────│                             │
```

**S3 Configuration:**
- Key format: `claims/{claim_id}/{index}_{sanitized_filename}`
- Presigned URL expiry: 300 seconds
- Max file size: 10MB per file
- Allowed MIME types: image/jpeg, image/png, image/webp, application/pdf
- Bucket: private, SSE-S3 encryption, 90-day lifecycle deletion

---

## 8. SSE Real-time Updates

### Route Handler: GET /api/claims/[id]/stream

**Behavior:**
1. Verify auth session + claim ownership
2. Create ReadableStream
3. Poll Neon every 2 seconds for `current_step` and `status` changes
4. Emit events on change
5. Heartbeat every 15 seconds
6. Close after terminal state or 120s max

**Event Schema:**

| Event | Trigger | Data |
|-------|---------|------|
| `step_update` | `current_step` changes | `{ step, status, message }` |
| `decision` | `status` → COMPLETED | `{ decision, approved_amount, confidence_score }` |
| `error` | `status` → FAILED/NEEDS_REUPLOAD | `{ error_code, message }` |
| `done` | Terminal state reached | `{}` |

**Progress Messages:**
```
"Verifying your documents..."
"Documents verified - Extracting information..."
"Information extracted - Checking policy eligibility..."
"Eligibility checked - Running fraud detection..."
"Finalizing decision..."
"Decision ready: APPROVED - Rs. 1,350"
```

**Fallback:** Client detects EventSource error → falls back to polling `getClaimStatus()` every 5s.

---

## 9. Policy Engine Logic

### Rule Evaluation Order (short-circuits on blocking failure)

```
RULE 1: MEMBER_ELIGIBILITY
  - member_id exists in members table
  - policy renewal_status == "ACTIVE"
  - treatment_date within [policy_start_date, policy_end_date]
  → Fail: REJECT(MEMBER_NOT_ELIGIBLE)

RULE 2: SUBMISSION_DEADLINE
  - (current_date - treatment_date).days <= 30
  → Fail: REJECT(SUBMISSION_DEADLINE_EXCEEDED)
  → Message: "Claim submitted {days} days after treatment. Maximum: 30 days."

RULE 3: MINIMUM_AMOUNT
  - claimed_amount >= 500
  → Fail: REJECT(BELOW_MINIMUM)

RULE 4: INITIAL_WAITING_PERIOD
  - (treatment_date - member.join_date).days >= 30
  → Fail: REJECT(WAITING_PERIOD)
  → Message: "30-day initial waiting period. Eligible from {join_date + 30d}."

RULE 5: CONDITION_WAITING_PERIOD
  - LLM classifies diagnosis against waiting period conditions
  - Conditions: diabetes(90d), hypertension(90d), thyroid(90d), joint_replacement(730d),
    maternity(270d), mental_health(180d), obesity(365d), hernia(365d), cataract(365d)
  - If match AND days_enrolled < required_days:
  → Fail: REJECT(WAITING_PERIOD)
  → Message: "{condition} has {days}-day waiting period. Eligible from {date}."

RULE 6: EXCLUSION_CHECK
  - LLM matches diagnosis/treatment against exclusion list
  - Exclusions: self-inflicted, substance abuse, experimental, infertility, obesity programs,
    bariatric surgery, cosmetic procedures, health supplements
  - Category-specific: dental (whitening, orthodontics, cosmetic), vision (LASIK, refractive)
  → Fail: REJECT(EXCLUDED_CONDITION)

RULE 7: PRE_AUTHORIZATION (DIAGNOSTIC category only)
  - If tests include MRI/CT/PET AND claimed_amount > 10,000:
  → Fail: REJECT(PRE_AUTH_MISSING)
  → Message: "Pre-authorization required for {test} above Rs. 10,000. Please obtain pre-auth and resubmit."

RULE 8: PER_CLAIM_LIMIT
  - claimed_amount <= 5,000
  → Fail: REJECT(PER_CLAIM_EXCEEDED)
  → Message: "Claimed Rs. {amount} exceeds per-claim limit of Rs. 5,000."

RULE 9: PROCEDURE_COVERAGE (DENTAL/VISION only)
  - Classify each line item against covered/excluded procedure lists
  - All excluded → REJECT(PROCEDURE_NOT_COVERED)
  - Mixed → PARTIAL (eligible_amount = sum of covered items)
  - Include line-item-level decisions with reasons

RULE 10: AMOUNT_CALCULATION (only if all blocking rules pass)
```

### Amount Calculation Algorithm

```
Step A: Determine eligible_amount
  - Default: claimed_amount
  - If PARTIAL: sum of approved line items only

Step B: Network Discount (APPLIED FIRST)
  - is_network = fuzzy_match(hospital_name, policy.network_hospitals)
  - discount_pct = category.network_discount_percent (if network) else 0
  - discount_amount = eligible_amount * (discount_pct / 100)
  - amount_after_discount = eligible_amount - discount_amount

Step C: Co-pay (APPLIED AFTER discount)
  - copay_pct = category.copay_percent
  - copay_amount = amount_after_discount * (copay_pct / 100)
  - amount_after_copay = amount_after_discount - copay_amount

Step D: Annual OPD Limit
  - remaining = annual_opd_limit - ytd_approved_total
  - final = min(amount_after_copay, remaining)

Step E: Floor
  - final = max(0, round(final, 2))
```

### Test Case Verification

| TC | Input | Calculation | Expected | Match |
|----|-------|-------------|----------|-------|
| TC004 | Rs. 1,500, non-network, CONSULTATION | 1500 - 0 discount - 150 copay(10%) = 1350 | APPROVED Rs. 1,350 | YES |
| TC005 | EMP005, joined 2024-09-01, diabetes, claim 2024-10-15 | 44 days < 90 required | REJECTED | YES |
| TC006 | Rs. 12,000 DENTAL, root canal(8k) + whitening(4k) | 8000 covered, 4000 excluded, 0% copay | PARTIAL Rs. 8,000 | YES |
| TC007 | MRI Rs. 15,000, DIAGNOSTIC | 15000 > 10000, MRI requires pre-auth | REJECTED | YES |
| TC008 | Rs. 7,500, CONSULTATION | 7500 > per_claim_limit 5000 | REJECTED | YES |
| TC010 | Rs. 4,500, Apollo (network), CONSULTATION | 4500 * 0.8 = 3600, 3600 * 0.9 = 3240 | APPROVED Rs. 3,240 | YES |
| TC012 | "Morbid Obesity BMI 37", "Bariatric" | Matches exclusion: obesity + bariatric | REJECTED | YES |

---

## 10. Fraud Detection Logic

### Signal Detection

| # | Signal | Condition | Severity | Weight |
|---|--------|-----------|----------|--------|
| 1 | SAME_DAY_CLAIMS_EXCEEDED | Prior same-day claims >= 2 | 0.8 | 1.0 |
| 2 | MONTHLY_CLAIMS_EXCEEDED | Prior same-month claims >= 6 | 0.6 | 0.7 |
| 3 | HIGH_VALUE_CLAIM | claimed_amount > 25,000 | 0.4 | 0.5 |
| 4 | MULTIPLE_PROVIDERS_SAME_DAY | Distinct providers same day > 2 | 0.7 | 0.9 |
| 5 | DOCUMENT_ALTERATION | quality_issues contains ALTERED | 0.5 | 0.6 |
| 6 | AMOUNT_MISMATCH | abs(bill_total - claimed) > 5% | 0.6 | 0.8 |
| 7 | DATE_INCONSISTENCY | bill_date != treatment_date | 0.3 | 0.4 |
| 8 | DUPLICATE_CLAIM | Same member + amount + date + provider exists | 0.9 | 1.0 |

### Scoring Algorithm

```
raw_score = sum(signal.severity * signal.weight) for triggered signals
fraud_score = min(1.0, raw_score / 2.5)

Risk levels:
  fraud_score >= 0.80 → CRITICAL → requires_manual_review = true
  fraud_score >= 0.50 → HIGH     → requires_manual_review = true
  fraud_score >= 0.30 → MEDIUM   → flag, continue processing
  fraud_score <  0.30 → LOW      → no action

Hard override:
  claimed_amount > 25,000 → requires_manual_review = true (regardless of score)
```

### TC009 Walkthrough

```
Input: EMP008, 4th claim today (3 prior from different providers), Rs. 4,800

Signals triggered:
  1. SAME_DAY_CLAIMS_EXCEEDED: 3 prior >= limit of 2 → severity 0.8, weight 1.0
  4. MULTIPLE_PROVIDERS_SAME_DAY: 4 distinct providers → severity 0.7, weight 0.9

raw_score = (0.8 * 1.0) + (0.7 * 0.9) = 1.43
fraud_score = min(1.0, 1.43 / 2.5) = 0.572

risk_level = HIGH (>= 0.50)
requires_manual_review = true

→ Decision: MANUAL_REVIEW with both signals listed in output
```

---

## 11. Error Handling & Graceful Degradation

### Step Criticality

| Step | Criticality | On Failure |
|------|-------------|------------|
| load_context | CRITICAL | Lambda fails → SQS retries |
| doc_verify | CRITICAL | Lambda fails → SQS retries |
| doc_extract | DEGRADABLE | Use claimed_amount as-is, confidence -= 0.15 |
| policy_engine | DEGRADABLE | Route to MANUAL_REVIEW, confidence -= 0.15 |
| fraud_detection | DEGRADABLE | Skip fraud check, confidence -= 0.15 |
| final_decision | DEGRADABLE | Use template messages, confidence -= 0.15 |

### Failure Mode Table

| Failure | Handler | User Impact |
|---------|---------|-------------|
| Claude API timeout | Retry once with 60s timeout, then degrade | Reduced confidence |
| Claude invalid JSON | Retry with stricter prompt, then degrade | Reduced confidence |
| S3 fetch failure | Retry 2x exponential backoff | If all fail → FAILED status |
| Neon write failure | Retry 3x exponential backoff | Status update delayed |
| Lambda exceeds 300s | SQS visibility timeout expires → retry | Processing delayed |
| 3x total Lambda failures | Message sent to DLQ | Ops alert, manual investigation |

### TC011 Implementation

```
Input: Alternative Medicine claim, simulate_component_failure = true

Pipeline execution:
  1. load_context → SUCCESS
  2. doc_verify → SUCCESS (PRESCRIPTION + HOSPITAL_BILL found)
  3. doc_extract → SUCCESS (structured data extracted)
  4. policy_engine → SUCCESS (eligible, Rs. 4,000 approved, 0% copay)
  5. fraud_detection → EXCEPTION CAUGHT
     → degraded_steps = ["fraud_detection"]
     → confidence = 0.95 - 0.15 = 0.80
  6. final_decision → APPROVED
     → confidence_score: 0.80
     → trace includes: "Fraud detection skipped due to component failure"
     → recommendations: ["Manual review recommended due to incomplete processing"]

Satisfies TC011 requirements:
  [x] Does not crash or return 500
  [x] Indicates component failed and was skipped
  [x] Confidence lower than normal (0.80 vs 0.92+)
  [x] Includes manual review recommendation note
```

---

## 12. Observability

### LangSmith Trace Structure

```
Configuration:
  LANGCHAIN_TRACING_V2=true
  LANGCHAIN_API_KEY=<secret>
  LANGCHAIN_PROJECT=medclaim-production

Per-claim trace hierarchy:
  claim_{claim_id} (run)
    ├── load_context (retriever) — DB + S3 fetches
    ├── doc_verify (chain)
    │   ├── classify_doc_0 (llm) — Claude Vision
    │   ├── classify_doc_1 (llm) — Claude Vision
    │   └── validate_requirements (tool) — deterministic checks
    ├── doc_extract (chain)
    │   ├── extract_prescription (llm) — Claude Vision
    │   └── extract_bill (llm) — Claude Vision
    ├── policy_engine (chain)
    │   ├── classify_condition (llm) — text classification
    │   ├── classify_exclusion (llm) — text classification
    │   └── calculate_amount (tool) — deterministic math
    ├── fraud_detection (tool) — fully deterministic
    └── final_decision (chain)
        └── generate_messages (llm) — user/ops message generation
```

### Logging Layers

| Layer | Data | Purpose |
|-------|------|---------|
| LangSmith | Full LLM inputs/outputs, latencies, token counts | Debug prompts, optimize costs |
| claims.trace_json | Decision trace with breakdown | User-facing explainability (20% eval weight) |
| CloudWatch | Lambda duration, errors, memory, SQS depth, DLQ count | Operational health |
| CloudWatch Alarms | DLQ depth > 0, Lambda error rate > 5% | Incident alerting |

### Key Metrics

```
Claims:
  claims_submitted_total (counter, by category)
  claims_completed_total (counter, by decision)
  claims_processing_duration_ms (histogram)
  claims_confidence_score (histogram)
  claims_degraded_pipeline_total (counter)

LLM:
  llm_calls_total (counter, by agent step)
  llm_latency_ms (histogram)
  llm_tokens_used (counter, input/output)
  llm_retries_total (counter)
  llm_failures_total (counter)

Fraud:
  fraud_signals_triggered (counter, by signal_type)
  fraud_manual_review_rate (gauge)

Infrastructure:
  sqs_queue_depth (gauge)
  sqs_dlq_depth (gauge, alert if > 0)
  lambda_concurrent_executions (gauge)
  lambda_errors_total (counter)
```

---

## 13. Security Considerations

### Input Validation

| Input | Validation |
|-------|-----------|
| File upload | Max 10MB, MIME whitelist (jpeg/png/webp/pdf), extension check |
| member_id | Alphanumeric, max 20 chars, must exist in DB |
| claimed_amount | Positive number, max 500,000 (sum insured) |
| treatment_date | Valid date, not future, within policy period |
| category | Strict enum match |
| hospital_name | String, max 256 chars, sanitized |

### Document Access Control

- S3 bucket: Block All Public Access enabled
- Upload: Presigned PUT URLs scoped to specific key, 5-min expiry, matching Content-Type required
- Read (Lambda): IAM role with s3:GetObject scoped to `claims/*` prefix
- Display (UI): Generate short-lived (60s) presigned GET URL on demand for admin/trace viewer
- No PII in S3 key names (use UUIDs)

### Rate Limiting

- Max 5 claims per member per hour (server action level)
- Max 3 SSE connections per user
- Max 10 concurrent Lambda invocations (reserved concurrency)

### Secrets Management

**Lambda environment variables (encrypted):**
- ANTHROPIC_API_KEY
- NEON_DATABASE_URL
- LANGCHAIN_API_KEY
- SQS_QUEUE_URL
- S3_BUCKET_NAME

**Vercel environment variables (server-only):**
- NEON_AUTH_BASE_URL
- NEON_AUTH_COOKIE_SECRET
- NEON_DATABASE_URL
- AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY
- SQS_QUEUE_URL
- S3_BUCKET_NAME

### SQS Security

- Server-side encryption (SSE-SQS with AWS KMS)
- Idempotency: `sqs_message_id` unique index prevents double-processing
- DLQ: messages that fail 3x move to dead letter queue for investigation

---

## 14. Component Contracts

### Contract 1: ClaimSubmissionService

```
INTERFACE: ClaimSubmissionService
PURPOSE: Accept and validate new claim submissions from authenticated users.
METHOD: submitClaim(input) → result

INPUT:
  authenticated_user_id: string (from Neon Auth session)
  member_id: string
  policy_id: string
  category: ClaimCategory
  treatment_date: ISO-8601 date
  claimed_amount: number (positive, INR)
  hospital_name: string | null
  documents: [{s3_key, filename, content_type, size_bytes}]

OUTPUT (success): { success: true, claim_id: UUID }
OUTPUT (error): { success: false, error_code: string, errors: [{field, message}] }

ERRORS:
  UNAUTHORIZED — user not authenticated or not bound to member_id
  MEMBER_NOT_FOUND — member_id not in database
  INVALID_CATEGORY — category not in allowed enum
  INVALID_DATE — treatment_date is future or outside policy period
  BELOW_MINIMUM — claimed_amount < 500
  EXCEEDS_LIMIT — claimed_amount > 500,000
  NO_DOCUMENTS — documents array empty
  TOO_MANY_DOCUMENTS — documents.length > 10

SIDE EFFECTS: INSERT claims + claim_documents, SEND SQS message, INSERT claim_history
IDEMPOTENCY: Not idempotent (each call creates new claim)
PERFORMANCE: < 500ms
```

### Contract 2: DocumentVerificationAgent

```
INTERFACE: DocumentVerificationAgent
PURPOSE: Classify, validate, and quality-check uploaded documents.
METHOD: verify(input) → output

INPUT:
  document_images: [{s3_key, image_bytes}]
  category: ClaimCategory
  required_document_types: [DocumentType]
  expected_patient_name: string

OUTPUT: VerificationOutput (see Section 6.1)

ERRORS THROWN:
  DocumentFetchError — cannot retrieve from S3
  LLMTimeoutError — Claude unresponsive after retries

ERROR HANDLING:
  Single doc LLM failure → classify as UNKNOWN, quality 0.5
  Total failure → re-raise (CRITICAL step, Lambda retries via SQS)

PERFORMANCE: 3-8 seconds
DEPENDENCIES: S3 client, Anthropic Claude API (Vision)
```

### Contract 3: DocumentExtractionAgent

```
INTERFACE: DocumentExtractionAgent
PURPOSE: Extract structured medical data from classified documents.
METHOD: extract(input) → output

INPUT:
  documents: [{s3_key, detected_type, image_bytes, is_readable}]
  category: ClaimCategory

OUTPUT: ExtractionOutput (see Section 6.2)

ERROR HANDLING:
  Single doc failure → null for that doc type, reduced confidence
  All docs fail → confidence 0.3, empty structures, mark degraded
  NEVER throws to pipeline

PERFORMANCE: 5-15 seconds (parallelized Vision calls)
DEPENDENCIES: S3 client, Anthropic Claude API (Vision)
```

### Contract 4: PolicyEngineAgent

```
INTERFACE: PolicyEngineAgent
PURPOSE: Apply all policy rules and calculate approved amount.
METHOD: evaluate(input) → output

INPUT:
  extracted_data: ExtractionOutput
  member: MemberRecord
  policy: PolicyConfig
  category: ClaimCategory
  claimed_amount: float
  treatment_date: date
  hospital_name: string | null
  ytd_approved_total: float
  ytd_category_total: float

OUTPUT: PolicyOutput (see Section 6.3)

ERROR HANDLING:
  LLM classification timeout → assume no match (conservative), reduce confidence
  DB query failure → use cached/provided data

PERFORMANCE: 2-5 seconds
DEPENDENCIES: Anthropic Claude API (text), Neon DB (YTD queries)
```

### Contract 5: FraudDetectionAgent

```
INTERFACE: FraudDetectionAgent
PURPOSE: Compute fraud risk score from behavioral and document signals.
METHOD: detect(input) → output

INPUT:
  member_id: string
  treatment_date: date
  claimed_amount: float
  hospital_name: string | null
  claim_history: [{claim_id, date, amount, provider}]
  document_quality_issues: [{doc_type, issues: [str]}]

OUTPUT: FraudOutput (see Section 6.4)

ERROR HANDLING:
  DB query failure → return score 0.0, risk LOW, note degradation
  NEVER throws to pipeline

PERFORMANCE: < 1 second (deterministic, no LLM)
DEPENDENCIES: Neon DB (claim_history queries)
```

### Contract 6: FinalDecisionAgent

```
INTERFACE: FinalDecisionAgent
PURPOSE: Synthesize all evaluations into final decision with explanations.
METHOD: decide(input) → output

INPUT:
  policy_evaluation: PolicyOutput
  fraud_evaluation: FraudOutput
  extracted_data: ExtractionOutput
  doc_verification: VerificationOutput
  degraded_steps: [str]
  current_confidence: float

OUTPUT: DecisionOutput (see Section 6.5)

ERROR HANDLING:
  LLM message generation failure → use template messages, reduce confidence
  NEVER throws to pipeline

PERFORMANCE: 1-3 seconds
DEPENDENCIES: Anthropic Claude API (text, for message generation)
```

---

## 15. Infrastructure

### AWS Resources

| Resource | Name | Configuration |
|----------|------|---------------|
| S3 Bucket | medclaim-docs-{env} | ap-south-1, SSE-S3, private, Block Public Access, 90-day lifecycle, CORS for frontend domain |
| SQS Queue | medclaim-processing | VisibilityTimeout: 300s, MaxReceiveCount: 3, MessageRetention: 4 days |
| SQS DLQ | medclaim-dlq | MessageRetention: 14 days |
| Lambda | medclaim-worker | Container image (ECR), 1024MB memory, 300s timeout, reserved concurrency: 10 |
| ECR | medclaim-worker | Stores Lambda container image |
| IAM Role | medclaim-lambda-role | Policies: SQS consume, S3 read (claims/*), outbound HTTPS |

### Lambda Container Image

```dockerfile
FROM public.ecr.aws/lambda/python:3.12

COPY requirements.txt .
RUN pip install -r requirements.txt

COPY src/ ${LAMBDA_TASK_ROOT}/

CMD ["handler.lambda_handler"]
```

### Deployment Topology

| Component | Platform | Domain |
|-----------|----------|--------|
| Frontend + API | Vercel | medclaim.vercel.app |
| Auth Service | Neon (managed) | ep-xxx.neonauth.us-east-1.aws.neon.tech |
| Database | Neon | ep-xxx.us-east-1.aws.neon.tech |
| Worker | AWS Lambda | (SQS-triggered, no public endpoint) |
| Documents | AWS S3 | medclaim-docs-prod.s3.ap-south-1.amazonaws.com |
| Queue | AWS SQS | sqs.ap-south-1.amazonaws.com |
| Traces | LangSmith | smith.langchain.com |

---

## 16. Design Decisions & Trade-offs

### Conscious Trade-offs

| Decision | Trade-off | Rationale |
|----------|-----------|-----------|
| sub_limit not enforced as per-claim cap | May not match insurer's intent for all edge cases | Test cases TC004 (Rs. 1,350) and TC010 (Rs. 3,240) both exceed the Rs. 2,000 consultation sub_limit, proving it cannot be a per-claim cap. Documented and movable. |
| Dual LLM (Claude Vision + Gemini text) | Two provider dependencies | Claude is best-in-class for document OCR; Gemini Flash is 10x cheaper for text classification. Switchable via single env var. |
| Neon Auth (Beta) over Clerk (stable) | Beta service risk | Benefits outweigh risk for a demo: zero webhook sync, direct SQL joins, same DB. For production, monitor Neon Auth stability and have Clerk as fallback. |
| No CDK/Terraform | Manual AWS setup, not reproducible | 2-3 day timeline. Document that production would use IaC. |
| SSE via Neon polling (not WebSocket) | 2-second latency in updates | Vercel serverless cannot hold WebSocket. Acceptable for claims (users expect minutes, not seconds). |
| Lambda over ECS | Cold start risk (5-10s on first claim) | Claims are async; user isn't waiting synchronously. Provisioned concurrency can eliminate this in prod if needed. |
| Fraud detection fully deterministic | No ML model for anomaly detection | Predictable, explainable, testable. ML-based fraud detection is a future enhancement documented in roadmap. |

### Limitations & Future Improvements

| Limitation | Impact | Solution at 10x Scale |
|------------|--------|----------------------|
| Lambda cold start | 5-10s added to first claim of the day | Provisioned concurrency or migrate to ECS Fargate |
| Neon free tier (0.5GB) | Sufficient for demo/testing | Scale to Neon Pro or self-hosted Postgres |
| Single-region deployment | Higher latency for non-Mumbai users | Multi-region with SQS per region |
| No ML fraud model | Only rule-based detection | Train anomaly detection on historical claims |
| Manual AWS setup | Not reproducible | CDK/Terraform for infrastructure as code |
| No document versioning | Can't compare re-uploads | S3 versioning + audit trail |
| Polling-based SSE | 2s update granularity | Consider Neon's listen/notify or managed WebSocket (AWS API Gateway) |
