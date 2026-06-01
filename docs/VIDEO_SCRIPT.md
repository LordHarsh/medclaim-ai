# Demo Video Script (8-12 minutes)

## Opening (30 seconds)

"This is MedClaim AI — an automated health insurance claims processing system. It takes a claim with medical documents, runs it through a 5-stage AI pipeline, and returns an explainable decision in under 60 seconds. Let me show you how it works."

---

## Part 1: Document Problem — Early Stop (3 minutes)

### What to show

The assignment requires: *"a claim that gets stopped early due to a document problem (show the error message)"*

### Script

**[Screen: /claims/new]**

"When a user submits a claim, the system first checks that the right documents are uploaded. Let me show what happens when they're wrong."

**[Action: Select CONSULTATION category]**

"A consultation claim requires a Prescription AND a Hospital Bill. Notice the form now shows separate upload slots for each required document type."

**[Action: Upload a prescription image into the Hospital Bill slot]**

"I'm uploading a prescription where a hospital bill should go. Watch — the system classifies the document in real-time using Gemini Vision..."

**[Wait 2-3 seconds for classification badge to appear]**

"There — 'Prescription detected'. The submit button stays disabled because the detected type doesn't match what's expected. The user knows immediately — before even submitting — that something is wrong."

**[Action: Navigate to /admin/eval, run TC001]**

"Let me show what happens when this goes through the full pipeline. I'll run test case 1 — two prescriptions submitted for a consultation claim that needs a prescription AND a hospital bill."

**[Wait for processing, ~30 seconds]**

"The system stopped immediately at Document Verification — no policy check, no fraud detection, no wasted processing."

**[Action: Click the claim to open /admin/claims/[id]]**

"Look at the error message: 'You uploaded documents classified as [PRESCRIPTION], but a CONSULTATION claim requires [PRESCRIPTION, HOSPITAL_BILL]. Please upload your HOSPITAL_BILL.'"

"This is specific and actionable. Not a generic error — the member knows exactly what document type was uploaded, what was expected, and what they need to provide instead."

---

## Part 2: Successful End-to-End Approval with Full Trace (4-5 minutes)

### What to show

The assignment requires: *"a successful end-to-end approval with the full trace visible"*

### Script

**[Screen: /admin/eval, run TC010 — Network Hospital]**

"Now let me show a successful claim flowing through the entire pipeline. This is a consultation at Apollo Hospitals — a network hospital. The system needs to apply a network discount BEFORE co-pay — the order matters."

**[Wait for processing, show SSE progress steps appearing in real-time]**

"Watch the pipeline progress — Document Verification, Extraction, Policy Engine, Fraud Detection, Final Decision. Each step updates the database, and the frontend streams these updates via Server-Sent Events."

**[Action: Click claim → /admin/claims/[id]]**

"Decision: APPROVED, Rs. 3,240. Let's trace exactly how we got here."

**[Walk through each section]**

**Document Verification:**
"Two documents verified — Prescription and Hospital Bill. Both classified correctly by Vision, quality scores above 0.85, patient name 'Deepak Shah' consistent across documents. No mismatches."

**Document Extraction:**
"The system extracted structured data from the images: Doctor S. Iyer, diagnosis Acute Bronchitis, hospital Apollo Hospitals, line items — Consultation Fee Rs. 1,500, Medicines Rs. 3,000, total Rs. 4,500."

**Policy Engine:**
"This is the key part. 10 rules evaluated — all passed. The calculation waterfall shows:
- Original amount: Rs. 4,500
- Network discount 20%: minus Rs. 900 = Rs. 3,600
- Co-pay 10%: minus Rs. 360 = Rs. 3,240
- Final approved: Rs. 3,240

Network discount is applied FIRST, then co-pay. This order is critical and verified against the test cases."

**Fraud Detection:**
"Score 0.0, risk LOW, no signals triggered. Clean claim."

**Final Decision:**
"APPROVED at confidence 0.85. No deductions. The user message explains the decision without making any promises about payment timelines."

"This is what the assignment means by 'explainable' — anyone on the operations team can look at this trace and understand exactly what happened, what was checked, what passed, and how the final amount was calculated."

---

## Part 3: Technical Decision — Proud Of + Would Change (3 minutes)

### What to show

The assignment requires: *"one technical decision you are genuinely proud of and one you would change given more time"*

### Proud of: Config-Driven Policy Orchestrator

**[Screen: Show policy_terms.json → evaluation_rules section]**

"The technical decision I'm most proud of is making the policy engine fully config-driven. Every rule is defined in this JSON — not hardcoded in Python."

**[Screen: Show worker/agents/evaluators/ directory]**

"Each rule is its own evaluator class. There are 10 of them — member eligibility, submission deadline, waiting periods, exclusions, pre-authorization, per-claim limit, procedure coverage, and amount calculation."

**[Screen: Show registry.py]**

"A registry maps rule IDs to classes. The orchestrator reads the rules from config, sorts by order, and executes each one."

**[Screen: Show policy_engine.py orchestrator loop with Logfire spans]**

"Adding a new policy rule — say, an age limit check — requires:
1. Write one new evaluator class
2. Register it in the registry
3. Add one line to the policy JSON

Zero pipeline code changes. The orchestrator picks it up automatically."

"And each evaluator gets its own Logfire span — so you get rule-level observability without needing a multi-agent graph."

"Why this matters for Plum: when ICICI Lombard changes a policy threshold or adds a new clause, it's a config update — not a code deploy. At 10 million lives, you can't ship code for every policy change."

---

### Would change: Document verification reliability

"If I had more time, I'd improve document verification reliability. Currently, Claude Vision classifies documents and extracts patient names. It's good — but it's non-deterministic."

"Two specific issues I'd address:

One — patient name extraction from handwritten documents occasionally misreads characters. I'd add a confidence-based retry: if Vision returns a patient name with confidence below 0.8, retry with a more focused prompt that explicitly highlights where the name should be.

Two — I'd build a hybrid approach: for known hospital formats like Apollo or Fortis, use template matching to identify document structure before calling Vision. This gives you deterministic classification for 80% of documents (the network hospitals) and reserves the expensive Vision call for unknown formats."

---

## Closing (30 seconds)

"To summarize: the system catches document problems before processing, makes fully explainable decisions with complete audit trails, handles component failures gracefully, and is designed to scale without code changes when policies evolve. All 12 test cases pass consistently. The code, deployed URL, and eval report are all in the repository."

---

## Tips for Recording

- Keep the browser at 1920x1080, 100% zoom
- Use the admin page (`/admin` and `/admin/claims/[id]`) for showing traces — it has the richest data
- The eval runner at `/admin/eval` is good for triggering test cases live
- Have the repository open in a second window for showing code snippets
- Speak naturally — this is a technical walkthrough, not a sales pitch
- If a claim takes >30s to process, fast-forward the waiting or narrate what's happening
