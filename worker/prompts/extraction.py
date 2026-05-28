"""
Prompts for the Document Extraction Agent.
"""

PRESCRIPTION_EXTRACTION_PROMPT = """Extract structured data from this Indian medical prescription.

Look for these fields:
- Doctor name, registration number (format: STATE/XXXXX/YYYY or AYUR/STATE/XXXXX/YYYY)
- Doctor specialization if mentioned
- Patient name, age, gender
- Date of consultation
- Diagnosis (primary and secondary)
- Medicines with: name, dosage, frequency (1-1-1 means morning-afternoon-night), duration
- Tests ordered
- Hospital/clinic name

Common Indian medical abbreviations:
- HTN = Hypertension
- T2DM = Type 2 Diabetes Mellitus
- BD = Twice daily
- TDS = Three times daily
- OD = Once daily
- Tab = Tablet, Cap = Capsule, Syp = Syrup, Inj = Injection
- 1-1-1 = Morning-Afternoon-Night
- 1-0-1 = Morning and Night only

Return structured output with confidence scores for each field."""

HOSPITAL_BILL_EXTRACTION_PROMPT = """Extract structured data from this Indian hospital/clinic bill.

Look for these fields:
- Hospital/clinic name and address
- GSTIN if present
- Bill number and date
- Patient name, age, gender
- Each line item with description and amount
- Subtotal, GST (if any), total amount
- Payment mode

Note: Small clinics may not have printed formats. Bills may be handwritten.
Amounts in Indian Rupees (Rs. or INR or just numbers).

Return structured output with confidence scores for each field."""

LAB_REPORT_EXTRACTION_PROMPT = """Extract structured data from this Indian diagnostic/lab report.

Look for these fields:
- Lab name, NABL accreditation status
- Patient name, age, gender
- Referring doctor
- Sample date and report date
- Each test: name, result value, unit, normal range
- Pathologist name and registration
- Any remarks or interpretation

Return structured output."""

PHARMACY_BILL_EXTRACTION_PROMPT = """Extract structured data from this Indian pharmacy bill.

Look for these fields:
- Pharmacy name, drug license number
- Bill number, date
- Patient name
- Prescribing doctor name
- Each medicine: name, batch number, expiry, quantity, MRP, amount
- Discount if any
- Net amount

Return structured output."""

EXTRACTION_SYSTEM_PROMPT = """You are a medical document data extraction specialist for Indian health insurance.

Extract information precisely as written on the document.
For fields you cannot read or that are not present, return null.
Provide confidence scores (0.0-1.0) for key fields based on how clearly you can read them.

Important:
- Preserve exact spelling of names (even if they seem incorrect)
- Amounts should be numeric (no currency symbols)
- Dates in ISO format (YYYY-MM-DD) when possible
- If handwritten and unclear, provide best guess with low confidence"""
