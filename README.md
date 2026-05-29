# MedClaim AI

AI-powered health insurance claims processing system with real-time decision tracking and full explainability.

## Live Demo

**URL:** https://medclaim-ai-six.vercel.app

## Architecture

```
Next.js 16 (Vercel) → AWS S3 + SQS → Lambda (LangGraph Pipeline) → Neon PostgreSQL
                                                    ↓
                                        Claude Vision + Gemini
                                                    ↓
                                              LangSmith Traces
```

**Frontend:** Next.js 16, Tailwind CSS, shadcn/ui, Neon Auth
**Worker:** Python, LangGraph (5-agent pipeline), Claude Vision, Gemini Flash
**Infrastructure:** AWS S3, SQS, Lambda (container), Neon PostgreSQL, LangSmith

## Local Setup

### Prerequisites

- Node.js 20+
- Python 3.12+
- Docker (for Lambda worker)
- AWS CLI configured
- Neon database with Auth enabled

### Frontend

```bash
# Install dependencies
npm install

# Copy env template and fill in values
cp .env.example .env

# Run development server
cd web\nnpm run dev
```

### Worker (Lambda Pipeline)

```bash
cd worker

# Create virtual environment
python -m venv venv
source venv/bin/activate  # or venv\Scripts\activate on Windows

# Install dependencies
pip install -r requirements.txt

# Run locally against a specific claim
python handler.py <claim_id>
```

### Database

```bash
# Run schema (requires psql or use the Neon SQL Editor)
# Apply: database/schema.sql
# Seed: database/seed.sql
# RLS: database/rls.sql
```

### Generate Test Documents

```bash
cd web\nnpm run generate-docs
```

## Environment Variables

See `.env.example` for the full list. Key variables:

| Variable | Purpose |
|----------|---------|
| `DATABASE_URL` | Neon PostgreSQL connection string |
| `NEON_AUTH_BASE_URL` | Neon Auth service endpoint |
| `NEON_AUTH_COOKIE_SECRET` | Cookie signing secret (32+ chars) |
| `ANTHROPIC_API_KEY` | Claude API for Vision/OCR |
| `GEMINI_API_KEY` | Gemini API for text classification |
| `AWS_REGION` | AWS region (ap-south-1) |
| `S3_BUCKET_NAME` | Document storage bucket |
| `SQS_QUEUE_URL` | Claims processing queue |
| `LANGSMITH_API_KEY` | LangSmith tracing |

## Project Structure

```
medclaim-ai/
├── src/                    # Next.js 16 frontend
│   ├── app/               # App Router pages
│   ├── components/        # UI components
│   └── lib/               # Server actions, auth, DB, validations
├── worker/                # Python Lambda worker
│   ├── agents/            # 5 LangGraph agents
│   ├── prompts/           # LLM prompt templates (dynamic from policy)
│   ├── models/            # Pydantic schemas
│   ├── pipeline.py        # LangGraph state machine
│   ├── handler.py         # Lambda entry point
│   └── Dockerfile         # Container image for Lambda
├── database/              # SQL schema, seed, RLS policies
├── resources/             # Assignment docs, test cases, generated documents
├── scripts/               # Document generation scripts
└── docs/                  # LLD (architecture document)
```

## Pipeline Flow

1. User submits claim with documents via UI
2. Documents uploaded to S3 via presigned URLs
3. Claim record created in Neon, message sent to SQS
4. Lambda triggered, runs 5-agent LangGraph pipeline:
   - **Document Verification** — classify types, check quality, detect mismatches
   - **Document Extraction** — extract structured data via Claude Vision
   - **Policy Engine** — apply rules deterministically (10 rules in sequence)
   - **Fraud Detection** — compute risk score from 8 behavioral signals
   - **Final Decision** — synthesize verdict, generate explanations
5. Each step updates DB (SSE streams progress to UI in real-time)
6. Final decision + full trace stored for explainability

## Key Design Decisions

- **LLM cost optimization:** Claude for Vision/OCR only, Gemini for text classification (configurable via `LLM_PROVIDER_OVERRIDE`)
- **Policy as config:** All rules read from `policy_config` table (seeded from `policy_terms.json`), not hardcoded
- **Network discount before co-pay:** Critical calculation order verified against test cases
- **Graceful degradation:** Non-critical agents can fail without crashing the pipeline
- **Row Level Security:** Postgres RLS with session variables for user isolation

## Test Cases

12 test cases covering: wrong documents, unreadable docs, patient mismatches, approvals, waiting periods, exclusions, pre-auth, per-claim limits, fraud signals, network discounts, component failures.

See `resources/test_cases.json` for details and `docs/LLD.md` for how each is handled.
