# Low-Level Design: MedClaim AI

## 1. Overview

MedClaim AI is an automated health insurance claims processing system that accepts OPD claims with supporting documents, runs them through a 5-stage AI pipeline (document verification, data extraction, policy evaluation, fraud detection, final decision), and returns explainable verdicts in real-time. It serves insured employees via a Next.js frontend and processes claims asynchronously via an AWS Lambda worker orchestrated by LangGraph.

## 2. Functional Requirements

1. Accept claims with document uploads (prescription, hospital bill, lab report, pharmacy bill)
2. Detect document quality problems (unreadable, wrong type, patient mismatch) and request re-upload
3. Extract structured data from documents using Vision LLMs
4. Evaluate policy eligibility deterministically (10 configurable rules in sequence)
5. Compute fraud risk score from behavioral signals (8 checks)
6. Render explainable decisions (APPROVED / PARTIAL / REJECTED / MANUAL_REVIEW) with full trace
7. Stream processing progress to the user via SSE
8. Gracefully degrade when non-critical agents fail (route to MANUAL_REVIEW)

## 3. Non-Functional Requirements

| Requirement | Target |
|---|---|
| End-to-end latency (claim submission to decision) | < 60 seconds |
| Lambda timeout | 300 seconds |
| Concurrent claims | Limited by SQS throughput + Lambda concurrency (default 10) |
| Observability | Every LLM call traced (LangSmith), every span traced (Logfire) |
| Idempotency | SQS message deduplication via `sqs_message_id` column |
| Availability | Vercel (frontend), Lambda (worker), Neon (DB) — all managed |
| Data retention | Full trace JSON stored per claim indefinitely |

## 4. Architecture

### 4.1 Component Summary

| Component | Technology | Purpose |
|---|---|---|
| Frontend | Next.js 16, Tailwind, shadcn/ui | Claim submission UI, real-time status |
| Auth | Neon Auth | Session-based authentication, RLS context |
| Object Storage | AWS S3 (`medclaim-docs-prod`) | Document image storage |
| Queue | AWS SQS (standard) | Async claim processing trigger |
| Worker | AWS Lambda (container, Python 3.12) | LangGraph pipeline execution |
| Database | Neon PostgreSQL | Claims, members, policy config, traces |
| Vision LLM | Gemini 2.5 Flash | Document classification + OCR extraction |
| Text LLM | Claude Sonnet 4 | Condition/exclusion classification, message generation |
| Tracing | LangSmith | LLM call traces per pipeline run |
| Observability | Pydantic Logfire | Spans, errors, Lambda metrics |

### 4.2 Claim Processing Flow

```
User ──► Next.js UI ──► S3 (presigned PUT)
              │
              ▼
         Server Action ──► INSERT claims + claim_documents
              │
              ▼
           SQS Queue ──────────────────────────────────┐
                                                       ▼
                                              Lambda (handler.py)
                                                       │
                                          ┌────────────┼────────────┐
                                          ▼            ▼            ▼
                                     Fetch DB    Download S3   Build State
                                          └────────────┼────────────┘
                                                       ▼
                                              LangGraph Pipeline
                                              (5 agents + persist)
                                                       │
                                                       ▼
                                              UPDATE claims (result)
                                                       │
              ┌────────────────────────────────────────┘
              ▼
         SSE Stream (poll) ──► UI updates in real-time
```

### 4.3 Pipeline Graph (LangGraph State Machine)

```
                    ┌──────────────┐
                    │  doc_verify  │  (CRITICAL)
                    └──────┬───────┘
                           │
                    should_stop_early?
                     /            \
                  YES              NO
                   │                │
     ┌─────────────▼──┐    ┌───────▼──────┐
     │persist_early_stop│    │  doc_extract  │ (degradable)
     └────────┬────────┘    └───────┬──────┘
              │                     │
              ▼                     ▼
             END            ┌──────────────┐
                            │ policy_engine │ (degradable)
                            └──────┬───────┘
                                   │
                            ┌──────▼───────┐
                            │fraud_detection│ (degradable)
                            └──────┬───────┘
                                   │
                            ┌──────▼───────┐
                            │final_decision │ (degradable)
                            └──────┬───────┘
                                   │
                            ┌──────▼───────┐
                            │persist_result │
                            └──────┬───────┘
                                   │
                                  END
```

## 5. API Design and Contracts

### 5.1 Claim Submission (Server Action)

**Function:** `submitClaim(formData: FormData)`

```json
// Input (FormData fields)
{
  "category": "CONSULTATION | DIAGNOSTIC | PHARMACY | DENTAL | VISION | ALTERNATIVE_MEDICINE",
  "treatment_date": "2024-11-15",
  "claimed_amount": 3500.00,
  "hospital_name": "Apollo Clinic",
  "document_keys": "[\"claims/abc/rx.jpg\"]",
  "document_types": "{\"claims/abc/rx.jpg\": \"PRESCRIPTION\"}"
}

// Output
{ "success": true, "data": { "claim_id": "uuid" } }
// or
{ "success": false, "errors": [{ "field": "category", "message": "..." }] }
```

### 5.2 Document Classification (Edge Function)

**Endpoint:** `POST /api/classify-document`

```json
// Request
{ "s3_key": "claims/abc/doc.jpg", "content_type": "image/jpeg" }

// Response
{ "detected_type": "PRESCRIPTION", "confidence": 0.95 }
```

Uses Gemini 2.5 Flash with inline image data for real-time classification during upload.

### 5.3 SSE Stream

**Endpoint:** `GET /api/claims/[id]/stream`

Polls DB every 2s, emits events on state change. Max duration: 120s.

| Event | Payload | When |
|---|---|---|
| `step_update` | `{ step, status, message }` | `current_step` changes |
| `decision` | `{ decision, approved_amount, confidence_score }` | status = COMPLETED |
| `error` | `{ error_code, message }` | status = FAILED / NEEDS_REUPLOAD |
| `done` | `{}` | Terminal — client should close |

### 5.4 Admin APIs (Server Actions)

| Action | Input | Output |
|---|---|---|
| `listClaims()` | (session) | `{ claims: ClaimRow[], total }` |
| `getClaimStatus(claimId)` | claim UUID | Full `ClaimRow` with trace |
| `getClaimTrace(claimId)` | claim UUID | `trace_json` object |

All actions enforce ownership via `auth_user_id -> member_id -> claim.member_id`.

## 6. Database Schema

### `members`

| Column | Type | Description |
|---|---|---|
| member_id | VARCHAR(20) PK | Employee/dependent ID |
| auth_user_id | VARCHAR(64) UNIQUE | Neon Auth user link |
| name | VARCHAR(128) | Full name |
| date_of_birth | DATE | DOB |
| gender | CHAR(1) | M/F |
| relationship | VARCHAR(20) | SELF, SPOUSE, CHILDREN, PARENTS |
| join_date | DATE | Policy enrollment date |
| primary_member_id | VARCHAR(20) FK | NULL for primary, references self for dependents |
| dependents | TEXT[] | Array of dependent member_ids |

### `claims`

| Column | Type | Description |
|---|---|---|
| claim_id | UUID PK | Auto-generated |
| member_id | VARCHAR(20) FK | Submitting member |
| policy_id | VARCHAR(50) | Policy config reference |
| category | VARCHAR(30) | CONSULTATION, DIAGNOSTIC, PHARMACY, DENTAL, VISION, ALTERNATIVE_MEDICINE |
| claimed_amount | NUMERIC(10,2) | Amount claimed |
| treatment_date | DATE | Date of treatment |
| hospital_name | VARCHAR(256) | Provider name (nullable) |
| status | VARCHAR(20) | QUEUED, PROCESSING, COMPLETED, FAILED, NEEDS_REUPLOAD |
| current_step | VARCHAR(50) | Pipeline progress indicator |
| decision | VARCHAR(20) | APPROVED, PARTIAL, REJECTED, MANUAL_REVIEW |
| approved_amount | NUMERIC(10,2) | Final approved amount |
| confidence_score | NUMERIC(4,3) | Pipeline confidence (0.0-1.0) |
| rejection_reasons | TEXT[] | Human-readable rejection reasons |
| fraud_score | NUMERIC(4,3) | Weighted fraud risk score |
| fraud_signals | JSONB | Array of detected fraud signals |
| trace_json | JSONB | Full pipeline trace for explainability |
| claim_metadata | JSONB | Arbitrary input metadata (e.g., test flags) |
| sqs_message_id | VARCHAR(128) UNIQUE | Idempotency key |

### `claim_documents`

| Column | Type | Description |
|---|---|---|
| doc_id | UUID PK | Auto-generated |
| claim_id | UUID FK | Parent claim |
| s3_key | VARCHAR(512) | S3 object key |
| original_name | VARCHAR(256) | Upload filename |
| content_type | VARCHAR(100) | MIME type |
| size_bytes | INTEGER | File size |
| detected_type | VARCHAR(30) | LLM-detected document type |
| quality_score | NUMERIC(3,2) | 0.0-1.0 readability score |
| is_readable | BOOLEAN | Pass/fail readability |
| quality_issues | TEXT[] | List of detected issues |
| patient_name_found | VARCHAR(128) | Name extracted from document |

### `claim_history`

| Column | Type | Description |
|---|---|---|
| id | UUID PK | Auto-generated |
| member_id | VARCHAR(20) | Member reference |
| claim_id | UUID FK | Claim reference |
| claim_date | DATE | Treatment date |
| amount | NUMERIC(10,2) | Claimed amount |
| provider | VARCHAR(256) | Hospital/clinic name |
| category | VARCHAR(30) | Claim category |
| status | VARCHAR(20) | Claim status |

### `policy_config`

| Column | Type | Description |
|---|---|---|
| policy_id | VARCHAR(50) PK | e.g., `PLUM_GHI_2024` |
| config_json | JSONB | Full policy configuration (see `PolicyConfig` model) |
| updated_at | TIMESTAMPTZ | Last modification |

## 7. Policy Engine (Dynamic Orchestrator)

The policy engine is fully config-driven. Rules are defined in `policy_config.config_json.evaluation_rules` and executed by the orchestrator in order.

### Architecture

```
PolicyConfig.evaluation_rules[]  ──►  Orchestrator (run_policy_engine)
                                            │
                                    for rule in sorted(rules, key=order):
                                            │
                                    ┌───────▼────────┐
                                    │EVALUATOR_REGISTRY│
                                    │  [rule.id]()   │
                                    └───────┬────────┘
                                            │
                                    RuleEvaluation(passed, details)
                                            │
                                    if !passed && blocking: REJECT + stop
```

### EvaluationRule Schema

```python
class EvaluationRule:
    id: str          # "member_eligibility", "exclusion_check", etc.
    type: str        # "deterministic" or "llm_classification"
    blocking: bool   # True = rejection stops pipeline
    order: int       # Execution order (1-10)
    config: dict     # Rule-specific parameters
```

### Registry (10 evaluators)

| Order | Rule ID | Type | Blocking | Purpose |
|---|---|---|---|---|
| 1 | member_eligibility | deterministic | Yes | Policy active, member enrolled |
| 2 | submission_deadline | deterministic | Yes | Within N days of treatment |
| 3 | minimum_amount | deterministic | Yes | Above minimum claim threshold |
| 4 | initial_waiting_period | deterministic | Yes | Past initial waiting period |
| 5 | condition_waiting_period | LLM | Yes | Pre-existing condition check |
| 6 | exclusion_check | LLM | Yes | Excluded conditions/procedures |
| 7 | pre_authorization | deterministic | Yes | Pre-auth required and valid |
| 8 | per_claim_limit | deterministic | Yes | Under per-claim maximum |
| 9 | procedure_coverage | deterministic | No | Line-item eligibility + sub-limits |
| 10 | amount_calculation | deterministic | No | Network discount, co-pay, annual cap |

### EvaluationContext

Shared mutable context passed to all evaluators:

```python
class EvaluationContext:
    policy, member, category, claimed_amount, treatment_date
    hospital_name, extracted_data, ytd_approved, cat_config
    eligible_amount: float   # mutated by procedure_coverage
    line_item_decisions: list # mutated by procedure_coverage, read by amount_calculation
```

## 8. Processing Flow (Step by Step)

1. **SQS message received** — Lambda handler parses `{ claim_id }` from record body
2. **Idempotency check** — Atomic UPDATE sets `sqs_message_id` WHERE NULL; skip if already set
3. **Load context** — Fetch claim, member, policy config, documents, claim history, YTD total from Neon
4. **Download documents** — Fetch image bytes from S3 for each `claim_document.s3_key`
5. **Build ClaimState** — Assemble TypedDict with all loaded data + empty agent output slots
6. **doc_verify** (CRITICAL) — Vision LLM classifies each document, checks quality (readability score), detects patient name, validates type matches. If unreadable/wrong docs: sets `should_stop_early=True`
7. **Conditional edge** — If early stop: persist REJECTED + reason, write doc results, END
8. **doc_extract** (degradable) — Vision LLM extracts structured data (line items, amounts, dates, diagnosis) from each document type
9. **policy_engine** (degradable) — Orchestrator runs 10 evaluators in order. Short-circuits on blocking failure. Calculates approved amount (network discount applied before co-pay)
10. **fraud_detection** (degradable) — 8 signal checks against claim history and thresholds from policy config. Computes weighted risk score
11. **final_decision** (degradable) — Synthesizes policy evaluation + fraud score into final verdict, generates user-facing message and ops summary
12. **persist_result** — Writes decision, approved_amount, fraud_score, trace_json to claims table. Updates document verification results in claim_documents table
13. **SSE delivery** — Frontend poll detects `status=COMPLETED`, emits `decision` event to user

## 9. Error Handling

| Scenario | Layer | Handling |
|---|---|---|
| Invalid SQS message (bad JSON/missing claim_id) | Lambda handler | Log error, skip record (no retry) |
| Claim not found in DB | handler.process_claim | Log error, return (message consumed) |
| Member/policy not found | handler.process_claim | Set status=FAILED, return |
| S3 download failure | handler.process_claim | Set `image_bytes=None`, continue (Vision will fail gracefully) |
| doc_verify fails (exception) | PipelineNode | CRITICAL — re-raise, SQS retries |
| doc_verify detects bad docs | Pipeline | Set `should_stop_early`, persist REJECTED |
| Degradable agent fails | PipelineNode | Catch, reduce confidence by 0.15, use safe defaults, add to `degraded_steps` |
| All degradable agents fail | Pipeline | Final decision = MANUAL_REVIEW, confidence = 0.5 |
| persist_result fails | persist_result_node | Log error (non-fatal — result exists in state) |
| SQS duplicate delivery | Idempotency check | Skip processing, log skip |
| Lambda timeout (300s) | AWS | Message returns to queue, retried |
| DB connection stale after freeze | SQLAlchemy | `pool_pre_ping=True` detects and reconnects |

## 10. Observability

| Component | Tool | What's Traced |
|---|---|---|
| Lambda handler | Logfire | `claim.process.start`, batch counts, exceptions |
| Pipeline steps | Logfire | Step name, duration_ms, pass/fail, degradation |
| LLM calls (Vision, Classification) | LangSmith | Full prompt/response, token counts, latency |
| Policy evaluators | Logfire | Each rule ID, type, passed/failed, details |
| Fraud signals | Logfire | Signal type, severity, evidence |
| DB writes | Logfire | persist_final_result, persist_early_stop |
| SSE stream | Console (Vercel) | Poll errors, connection lifecycle |

**Trace correlation:** Each pipeline invocation is wrapped in a Logfire span with `claim_id` + `category`. LangSmith project is `MedClaim.AI`.

## 11. Security

- **Authentication:** Neon Auth (session cookies, 32+ char secret)
- **Authorization:** All frontend queries enforce `auth_user_id -> member_id` ownership chain
- **Row Level Security:** Postgres RLS policies on claims/documents; Lambda bypasses via `SET app.bypass_rls = 'on'`
- **IAM:** Lambda role scoped to specific S3 bucket + SQS queue + VPC (if applicable)
- **Input validation:** Zod schema on frontend (`submitClaimSchema`), Pydantic models on worker
- **Secrets management:** Environment variables via Vercel (frontend) and Lambda configuration (worker)
- **S3 access:** Presigned URLs with 5-minute expiry for uploads; direct SDK access from Lambda only
- **SQL injection:** Parameterized queries throughout (Neon serverless driver + SQLAlchemy)

## 12. Infrastructure

| Resource | Configuration | Purpose |
|---|---|---|
| S3 Bucket | `medclaim-docs-prod`, ap-south-1, private | Document storage |
| SQS Queue | Standard queue, visibility timeout 360s | Claim processing trigger |
| Lambda | Container image (ECR), 1024MB RAM, 300s timeout, Python 3.12 | Pipeline worker |
| ECR Repository | `medclaim-worker` | Lambda container image registry |
| IAM Role (Lambda) | S3 GetObject, SQS ReceiveMessage/DeleteMessage, CloudWatch Logs | Worker permissions |
| Neon PostgreSQL | Serverless, auto-scaling, connection pooling | Primary datastore |
| Vercel | Next.js 16, Edge + Serverless functions | Frontend hosting |
| LangSmith | Project: `MedClaim.AI` | LLM tracing |
| Logfire | Service: `medclaim-worker` | Application observability |

## 13. Document History

| Version | Date | Author | Changes |
|---|---|---|---|
| 1.0 | 2025-05 | Harsh Banka | Initial LLD |
| 2.0 | 2025-06 | Harsh Banka | Rewrite: config-driven policy engine, evaluator registry, fraud detection, degradation model |
