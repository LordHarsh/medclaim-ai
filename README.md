# MedClaim AI

AI-powered health insurance claims processing system with real-time decision tracking and full explainability.

## Live Demo

**URL:** https://medclaim-ai-six.vercel.app
**Admin/Ops:** https://medclaim-ai-six.vercel.app/admin
**Eval Suite:** https://medclaim-ai-six.vercel.app/admin/eval

---

## Architecture

```
User → Next.js 16 (Vercel)
         │
         ├── Upload docs → S3 (presigned)
         ├── Classify docs → Gemini Flash (edge function)
         ├── Submit claim → Neon DB + SQS
         │
         └── SSE stream ← polls DB for updates
                                    ↑
SQS → Lambda (Container) → LangGraph Pipeline → Neon DB
         │
         ├── Doc Verification (Gemini Vision)
         ├── Doc Extraction (Gemini Vision)
         ├── Policy Engine (config-driven orchestrator)
         ├── Fraud Detection (deterministic)
         └── Final Decision (Gemini text)
```

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 16, Tailwind CSS, Neon Auth |
| Edge Functions | Document classification (Gemini Flash) |
| Worker | Python 3.12, LangGraph, AWS Lambda (container) |
| LLM | Gemini 2.5 Flash (Vision + text), Claude Sonnet (fallback) |
| Database | Neon PostgreSQL + SQLAlchemy ORM |
| Queue | AWS SQS (standard + DLQ) |
| Storage | AWS S3 (presigned URLs) |
| Observability | LangSmith (LLM traces), Logfire (spans) |
| CI/CD | GitHub Actions → ECR → Lambda auto-deploy |

---

## Local Setup

### Prerequisites

- Node.js 20+, Python 3.12+, Docker, AWS CLI

### Frontend

```bash
cd web
pnpm install
cp .env.example .env.local   # fill in values
pnpm dev
```

### Worker

```bash
cd worker
python -m venv venv && source venv/bin/activate
pip install -r requirements.txt
python handler.py <claim_id>   # local test
```

### Database

```sql
-- Apply in Neon SQL Editor:
-- 1. database/schema.sql
-- 2. database/seed.sql
-- 3. database/rls.sql
```

---

## Project Structure

```
medclaim-ai/
├── web/                       # Next.js 16 frontend (Vercel)
│   ├── src/app/              # Pages: /, /claims, /dashboard, /admin
│   ├── src/components/       # Document upload, progress stepper, trace viewer
│   └── src/lib/              # Server actions, auth, DB, S3, SQS, validations
│
├── worker/                    # Python Lambda worker
│   ├── handler.py            # Lambda entry point
│   ├── core/                 # Pipeline, DB (SQLAlchemy), config, state, utils
│   ├── agents/               # 5 pipeline agents
│   │   ├── doc_verification.py
│   │   ├── doc_extraction.py
│   │   ├── policy_engine.py  # Dynamic orchestrator
│   │   ├── fraud_detection.py
│   │   ├── final_decision.py
│   │   └── evaluators/       # 10 individual rule evaluators
│   ├── models/               # ORM (SQLAlchemy) + Pydantic schemas + PolicyConfig
│   └── prompts/              # LLM prompt templates (dynamic from policy)
│
├── database/                  # schema.sql, seed.sql, rls.sql
├── resources/                 # policy_terms.json, test_cases.json, document prompts
├── scripts/                   # Document image generation, S3 upload
├── docs/                      # LLD, POLICY.md, diagrams
└── .github/workflows/         # Lambda CI/CD
```

---

## How It Works

### Claim Submission
1. User selects category → form shows required document types
2. User uploads each document → edge function classifies instantly via Gemini
3. Submit blocked until all required docs uploaded AND classified as matching
4. On submit: records created in DB, message sent to SQS

### Pipeline Processing (Lambda)
5. SQS triggers Lambda → idempotency check → load context from DB + S3
6. **Doc Verification** (CRITICAL) — classify types, check quality, detect patient mismatch
7. **Doc Extraction** (degradable) — extract structured data via Gemini Vision
8. **Policy Engine** (degradable) — run 10 evaluators from config in order
9. **Fraud Detection** (degradable) — 8 deterministic signals, weighted score
10. **Final Decision** (degradable) — synthesize verdict, generate explanation
11. Result persisted to DB with full trace JSON

### Real-time Updates
12. Frontend SSE stream polls DB every 2s → shows step-by-step progress
13. On completion: user sees decision + approved amount + message

---

## Policy Engine (Config-Driven)

Rules are defined in `policy_terms.json` → loaded into `policy_config` table → read by orchestrator at runtime.

```json
"evaluation_rules": [
  {"id": "member_eligibility", "type": "deterministic", "blocking": true, "order": 1},
  {"id": "submission_deadline", "type": "deterministic", "blocking": true, "order": 2},
  {"id": "condition_waiting_period", "type": "llm_classification", "blocking": true, "order": 5},
  {"id": "exclusion_check", "type": "llm_classification", "blocking": true, "order": 6},
  ...
]
```

Adding a new rule = new evaluator class + register in registry + add config entry. Zero pipeline code changes.

---

## Key Design Decisions

| Decision | Rationale |
|----------|-----------|
| Policy as config, not code | All rules from `policy_terms.json` — changing thresholds requires no deploy |
| Discount BEFORE co-pay | Verified against test cases (TC010: ₹4,500 → 20% → ₹3,600 → 10% → ₹3,240) |
| Dynamic orchestrator | Each rule is its own class — testable, swappable, config-ordered |
| Gemini for Vision + text | Cost-optimized (10x cheaper than Claude for text classification) |
| Early stop = COMPLETED + REJECTED | All terminal states are consistent — no separate NEEDS_REUPLOAD status |
| No hardcoded examples in prompts | Generic classification rules — no test-case-specific values |
| Eval date override | Historical test dates simulated via `ctx.today` override, not time-freezing |
| Per-evaluator Logfire spans | Rule-level observability without multi-agent graph overhead |

---

## Test Results (12 Test Cases)

| TC | Scenario | Expected | Status |
|----|----------|----------|--------|
| TC001 | Wrong document uploaded | REJECTED (doc error) | ✅ |
| TC002 | Unreadable document | REJECTED (blurry) | ✅ |
| TC003 | Patient name mismatch | REJECTED (mismatch) | ✅ |
| TC004 | Clean consultation | APPROVED ₹1,350 | ✅ |
| TC005 | Diabetes waiting period | REJECTED | ✅ |
| TC006 | Dental partial (cosmetic) | PARTIAL ₹8,000 | ✅ |
| TC007 | MRI without pre-auth | REJECTED | Depends on LLM |
| TC008 | Per-claim limit exceeded | REJECTED | ✅ |
| TC009 | Fraud signals (same-day) | MANUAL_REVIEW | ✅ |
| TC010 | Network hospital discount | APPROVED ₹3,240 | ✅ |
| TC011 | Component failure | APPROVED (degraded) | ✅ |
| TC012 | Excluded treatment | REJECTED | Depends on LLM |

---

## Documentation

| Document | Description |
|----------|-------------|
| `docs/LLD.md` | Low-Level Design (architecture, contracts, flows, error handling) |
| `docs/POLICY.md` | Policy terms explained (all rules, calculations, members) |
| `docs/worker-pipeline-diagram.md` | Mermaid diagrams of Lambda internals |
| `docs/infra-diagram.png` | Infrastructure diagram |
| `resources/test_cases.json` | 12 test cases with expected outcomes |
| `resources/policy_terms.json` | Full policy configuration |
