# Development Changelog

## Architecture & Infrastructure

- Next.js 16 frontend deployed on Vercel
- Python Lambda worker (container image) on AWS
- AWS S3 for document storage, SQS for job queue, ECR for images
- Neon PostgreSQL with Row Level Security
- Neon Auth (Better Auth) for authentication
- LangSmith for LLM tracing
- Logfire for Lambda observability
- GitHub Actions CI/CD for Lambda auto-deploy on push

## Worker Pipeline (LangGraph)

- 5-agent multi-agent pipeline: doc_verify → doc_extract → policy_engine → fraud_detection → final_decision
- `PipelineNode` class wraps each agent with timing, DB status updates, and error handling
- CRITICAL steps (doc_verify) crash → SQS retries
- DEGRADABLE steps catch errors, reduce confidence by 0.15, continue
- Pipeline graph exported as Mermaid diagram in `docs/`

## Policy Engine (Config-Driven Orchestrator)

- Dynamic orchestrator reads `evaluation_rules` from policy config
- 10 individual evaluator classes in `agents/evaluators/`
- Registry pattern maps rule IDs to classes
- Adding a new rule = new class + register + config entry (zero pipeline code changes)
- Per-evaluator Logfire spans for rule-level observability
- All thresholds from `policy.fraud_thresholds` config (nothing hardcoded)

## Document Processing

- Claude Vision for document classification and data extraction
- Edge API route (`/api/classify-document`) for real-time classification on upload
- Gemini 2.5 Flash for text classification and message generation
- Fuzzy patient name matching (thefuzz, 75% threshold) for OCR tolerance
- `detect_mime_type` from magic bytes (not file extension)

## Database & Models

- SQLAlchemy ORM with typed models (Member, Claim, ClaimDocument, ClaimHistory, PolicyConfig)
- Pydantic `PolicyConfig` model validates the full policy JSON structure
- Connection reuse per Lambda invocation with `pool_pre_ping`
- RLS bypass via `SET app.bypass_rls` on engine connect event
- `ON DELETE CASCADE` on foreign keys
- `claim_metadata` JSONB column for input flags (e.g., simulate_component_failure)

## Frontend Features

- Claim submission form with category-aware document upload slots
- Real-time document classification badge after upload (Gemini via edge function)
- Submit blocked until all required docs uploaded + classified + type matches
- SSE real-time progress streaming during pipeline processing
- User sees: decision + amount + message (no trace/technical details)
- Dashboard with claims list and status badges

## Admin / Ops

- `/admin` — Operations dashboard with all claims table
- `/admin/claims/[id]` — Full claim detail page with complete pipeline trace
  - Document verification: types, quality bars, patient names
  - Extraction: doctor, diagnosis, medicines, line items
  - Policy engine: rule evaluations table (pass/fail), calculation waterfall
  - Fraud detection: score, risk level, signal cards
  - Final decision: confidence deductions, user message, ops summary
- `/admin/eval` — Test case evaluation runner (12 test cases against live pipeline)

## Security

- Scoped IAM user for Vercel (PutObject + GetObject + SendMessage only)
- Lambda IAM role scoped to specific S3 prefix + SQS queue
- Admin actions require authenticated session
- Middleware protects /claims, /dashboard, /admin routes
- No secrets in git (all in .env / Vercel env vars)

## Observability

- LangSmith traces every LLM call with inputs/outputs
- Logfire spans per pipeline step + per evaluator rule
- `trace_json` stored in DB with full pipeline audit trail
- Confidence deductions itemized in trace (explainability)
- Extraction data included in trace

## Test Cases (12)

- TC001-TC003: Document verification (wrong type, unreadable, patient mismatch)
- TC004: Full approval (₹1,350 with 10% co-pay)
- TC005: Waiting period (diabetes, 90 days)
- TC006: Partial approval (dental, cosmetic exclusion, ₹8,000)
- TC007: Pre-auth rejection (MRI > ₹10,000)
- TC008: Per-claim limit exceeded (₹7,500 > ₹5,000)
- TC009: Fraud signals (multiple same-day claims → manual review)
- TC010: Network hospital discount (20% discount THEN 10% co-pay → ₹3,240)
- TC011: Graceful degradation (component failure, reduced confidence)
- TC012: Excluded condition (bariatric/obesity)

## Generated Test Documents

- 24 document images generated via Gemini Imagen
- Prompts in `resources/document_prompts.json` with all test case values verified
- Pre-uploaded to S3 under `test-cases/` prefix

## Key Design Decisions

- Policy as config (not hardcoded) — all rules from `policy_terms.json`
- Network discount applied BEFORE co-pay (verified against test cases)
- DENTAL/VISION exempt from per_claim_limit (use procedure coverage instead)
- Early-stop claims → COMPLETED + REJECTED (not separate NEEDS_REUPLOAD status)
- LLM messages forbidden from making payment/timeline promises (liability)
- Dual LLM: Claude Vision for OCR, Gemini Flash for text (cost optimization)
- No silent fallbacks — failures raise or degrade with visible confidence reduction
