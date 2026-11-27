# Policy Reference: PLUM_GHI_2024

This document is the definitive reference for every field in
`resources/policy_terms.json`. It covers what each value means, how the
policy engine enforces it, and includes worked examples drawn from the
test-case suite.

---

## Table of Contents

1. [Overview](#1-overview)
2. [Coverage Limits](#2-coverage-limits)
3. [OPD Categories](#3-opd-categories)
4. [Waiting Periods](#4-waiting-periods)
5. [Exclusions](#5-exclusions)
6. [Pre-Authorization](#6-pre-authorization)
7. [Network Hospitals](#7-network-hospitals)
8. [Submission Rules](#8-submission-rules)
9. [Document Requirements](#9-document-requirements)
10. [Fraud Thresholds](#10-fraud-thresholds)
11. [Members Roster](#11-members-roster)
12. [Amount Calculation Algorithm](#12-amount-calculation-algorithm)

---

## 1. Overview

| Field | Value | Meaning |
|---|---|---|
| `policy_id` | `PLUM_GHI_2024` | Unique identifier used in every claim submission |
| `policy_name` | Group Health Insurance: Standard Plan | Human-readable name |
| `insurer` | ICICI Lombard General Insurance | The insurance company underwriting the policy |
| `policy_holder.company_name` | TechCorp Solutions Pvt Ltd | The corporate client whose employees are covered |
| `policy_holder.employee_count` | 500 | Headcount at the time of policy issuance |
| `policy_holder.policy_start_date` | 2024-04-01 | Coverage begins on this date |
| `policy_holder.policy_end_date` | 2025-03-31 | Coverage ends at midnight on this date |
| `policy_holder.renewal_status` | `ACTIVE` | Policy is currently live; claims can be processed |

The policy runs for exactly one financial year (April 2024 – March 2025).
If `renewal_status` is not `ACTIVE`, Rule 1 (Member Eligibility) blocks
every claim immediately.

---

## 2. Coverage Limits

### 2.1 `sum_insured_per_employee`: ₹5,00,000

The maximum total payout the insurer will make for **in-patient /
hospitalisation** claims for a single employee in the policy year.
OPD claims are governed by the separate `annual_opd_limit` below.

Example: If Rajesh Kumar (EMP001) incurs a ₹4,00,000 surgery and later
a ₹2,00,000 procedure, the second claim would be capped at ₹1,00,000 because
only ₹1,00,000 of the sum insured remains.

### 2.2 `annual_opd_limit`: ₹50,000

The maximum aggregate the insurer will pay across **all OPD claims**
(consultation, diagnostics, pharmacy, dental, vision, alternative medicine)
for one employee in the policy year. This is checked as the final step
of every calculation.

Example: If EMP001 has already received ₹48,000 in OPD reimbursements
and submits a valid consultation claim for ₹3,000 that would otherwise
pay ₹2,700, the final approved amount is capped at ₹2,000 (the remaining
headroom).

### 2.3 `per_claim_limit`: ₹5,000

The maximum the insurer pays on any **single OPD claim** for categories
that do not carry their own procedure coverage lists. This prevents a
single visit from consuming a disproportionate share of the annual limit.

**Important exemption:** Categories that carry explicit
`covered_procedures` / `excluded_procedures` / `covered_items` /
`excluded_items` lists (DENTAL and VISION) are exempt from this limit.
Their sub_limit and procedure-level decisions act as the cap instead.
This is why TC006 (Dental: ₹8,000 Root Canal) is approved at ₹8,000
rather than being capped at ₹5,000.

Applies to: CONSULTATION, DIAGNOSTIC, PHARMACY, ALTERNATIVE_MEDICINE.

### 2.4 `family_floater`

| Sub-field | Value | Meaning |
|---|---|---|
| `enabled` | `true` | The policy runs as a floater: all covered family members share a common pool |
| `combined_limit` | ₹1,50,000 | Maximum aggregate payout for the entire family unit in the policy year |
| `covered_relationships` | SELF, SPOUSE, CHILDREN, PARENTS | Only these relationships qualify for coverage under the floater |

A family floater means that if EMP001's spouse (DEP001) makes a claim, it
draws from the same ₹1,50,000 pool as EMP001's own claims. The `annual_opd_limit`
of ₹50,000 is per-employee, while the `combined_limit` of ₹1,50,000 is
the ceiling across all family members collectively.

---

## 3. OPD Categories

### How co-pay and network discount interact

**Co-pay** means the member bears a percentage of the bill themselves.
The insurer pays the remainder.

**Network discount** is a pre-negotiated rate reduction from hospitals
in the insurer's network. This discount is applied **before** co-pay is
calculated: the member's co-pay percentage is applied to the
already-discounted amount, not the original bill.

Order: `original → subtract network discount → apply co-pay → get approved amount`

Full worked example is in [Section 12](#12-amount-calculation-algorithm).

---

### 3.1 CONSULTATION

| Field | Value |
|---|---|
| `sub_limit` | ₹2,000 per claim |
| `copay_percent` | 10% |
| `network_discount_percent` | 20% |
| `requires_prescription` | Yes |
| `requires_pre_auth` | No |
| `covered` | Yes |

A doctor's consultation visit. The member must submit a prescription
(required) and the hospital bill (required). No pre-authorisation is
needed regardless of amount, but the claim is hard-capped by the
`per_claim_limit` of ₹5,000.

The 10% co-pay means the member always pays 10% of the eligible
(post-discount) amount out of pocket.

**TC004 example:** Rajesh Kumar visits City Clinic (not a network
hospital) and claims ₹1,500.
- No network discount (non-network hospital)
- 10% co-pay on ₹1,500 = ₹150 deducted
- Approved: ₹1,350

---

### 3.2 DIAGNOSTIC

| Field | Value |
|---|---|
| `sub_limit` | ₹10,000 per claim |
| `copay_percent` | 0% |
| `network_discount_percent` | 10% |
| `requires_prescription` | Yes |
| `requires_pre_auth` | No (unless high-value test: see below) |
| `pre_auth_threshold` | ₹10,000 |
| `high_value_tests_requiring_pre_auth` | MRI, CT Scan, PET Scan |
| `covered` | Yes |

Covers laboratory tests, imaging, and other investigations. No co-pay
applies, but a 10% network discount is available.

**Pre-auth rule:** If the claim includes an MRI, CT Scan, or PET Scan
**and** the claimed amount exceeds ₹10,000, pre-authorisation must have
been obtained before the test. Without it, the claim is rejected with
reason `PRE_AUTH_MISSING`.

**TC007 example:** MRI Lumbar Spine at ₹15,000 submitted without
pre-auth. The test is in `high_value_tests_requiring_pre_auth` and the
amount exceeds ₹10,000, so the claim is rejected.

Required documents: PRESCRIPTION, LAB_REPORT, HOSPITAL_BILL.

---

### 3.3 PHARMACY

| Field | Value |
|---|---|
| `sub_limit` | ₹15,000 per claim |
| `copay_percent` | 0% (generic drugs) |
| `branded_drug_copay_percent` | 30% |
| `generic_mandatory` | Yes |
| `requires_prescription` | Yes |
| `covered` | Yes |

Covers medicines purchased against a valid prescription. Generic drugs
have zero co-pay. If a branded drug is dispensed when a generic
equivalent is available, a 30% co-pay applies to that line item.

`generic_mandatory: true` signals that the policy actively encourages
generic substitution. Members should ask pharmacists for generic
alternatives to avoid the 30% co-pay on branded medicines.

Required documents: PRESCRIPTION, PHARMACY_BILL.

---

### 3.4 DENTAL

| Field | Value |
|---|---|
| `sub_limit` | ₹10,000 per claim |
| `copay_percent` | 0% |
| `requires_prescription` | No |
| `requires_dental_report` | Yes (recommended) |
| `covered` | Yes |

**Covered procedures:**
- Root Canal Treatment
- Tooth Extraction
- Dental Filling
- Scaling and Polishing
- Dental X-Ray
- Crown Placement
- Gum Treatment

**Excluded procedures (cosmetic dental):**
- Teeth Whitening
- Veneers
- Orthodontic Treatment (Braces)
- Implants (Cosmetic)
- Bleaching

The policy engine evaluates each **line item** in the dental bill
individually using fuzzy matching against both lists. Items that match
an excluded procedure are rejected at the line level; covered items are
approved. The claim receives a `PARTIAL` decision if some items pass and
others do not.

DENTAL is exempt from the ₹5,000 `per_claim_limit`. The effective cap
is the `sub_limit` of ₹10,000.

**TC006 example:** Priya Singh (EMP002) submits a dental bill for:
- Root Canal Treatment: ₹8,000 → **APPROVED** (covered procedure)
- Teeth Whitening: ₹4,000 → **REJECTED** (cosmetic exclusion)

Decision: `PARTIAL`: approved amount ₹8,000.

Required documents: HOSPITAL_BILL (required); PRESCRIPTION and
DENTAL_REPORT (optional).

---

### 3.5 VISION

| Field | Value |
|---|---|
| `sub_limit` | ₹5,000 per claim |
| `copay_percent` | 0% |
| `requires_prescription` | Yes |
| `covered` | Yes |

**Covered items:**
- Glasses
- Contact Lenses
- Eye Examination
- Cataract Surgery

**Excluded items:**
- LASIK Surgery
- Cosmetic Eye Surgery
- Refractive Surgery

Like DENTAL, the policy engine evaluates each line item against the
covered/excluded lists. VISION is also exempt from the ₹5,000
`per_claim_limit`; the `sub_limit` of ₹5,000 is the effective ceiling.

Note: Cataract Surgery appears in both this category's `covered_items`
and in the specific conditions waiting period (365 days). A member must
satisfy the 365-day cataract waiting period before a cataract claim
will pass.

Required documents: PRESCRIPTION, HOSPITAL_BILL.

---

### 3.6 ALTERNATIVE_MEDICINE

| Field | Value |
|---|---|
| `sub_limit` | ₹8,000 per year |
| `copay_percent` | 0% |
| `requires_prescription` | Yes |
| `requires_registered_practitioner` | Yes |
| `max_sessions_per_year` | 20 |
| `covered` | Yes |

**Covered systems (AYUSH):**
- Ayurveda
- Homeopathy
- Unani
- Siddha
- Naturopathy

The practitioner must be a registered practitioner in the relevant
system. The annual sub_limit of ₹8,000 and the 20-session cap apply
across all AYUSH claims in the policy year combined.

**TC011 example:** Kavita Nair (EMP006) claims ₹4,000 for Panchakarma
Therapy (5 sessions). With no co-pay and within the ₹8,000 sub_limit
and 20-session cap, the claim is approved: subject to fraud checks and
document validation.

Required documents: PRESCRIPTION, HOSPITAL_BILL.

---

## 4. Waiting Periods

A waiting period is a window of time after joining during which claims
for certain conditions are not payable. The policy engine computes:

```
days_enrolled = treatment_date - member.join_date
```

If `days_enrolled < required_days` the rule fails and the claim is
rejected with reason `WAITING_PERIOD`. The output includes the date
from which the member becomes eligible.

### 4.1 `initial_waiting_period_days`: 30 days

Every new member must wait **30 days** from their `join_date` before
any OPD claim is payable, regardless of the condition. This applies
universally.

Example: A member joining on 2024-04-01 can submit claims for
treatment dated 2024-05-01 or later.

### 4.2 `pre_existing_conditions_days`: 365 days

Conditions that existed before the policy join date are not covered
for the first 365 days (one full policy year). The LLM-based condition
classifier determines whether a diagnosis constitutes a pre-existing
condition.

### 4.3 Specific Condition Waiting Periods

| Condition | Required Days | Eligible From (if joined 2024-04-01) |
|---|---|---|
| `diabetes` | 90 days | 2024-06-30 |
| `hypertension` | 90 days | 2024-06-30 |
| `thyroid_disorders` | 90 days | 2024-06-30 |
| `mental_health` | 180 days | 2024-09-28 |
| `maternity` | 270 days | 2025-01-26 |
| `obesity_treatment` | 365 days | 2025-04-01 |
| `hernia` | 365 days | 2025-04-01 |
| `cataract` | 365 days | 2025-04-01 |
| `joint_replacement` | 730 days | 2026-03-31 |

The policy engine uses an LLM to classify the diagnosis text from the
extracted prescription against this table. If the diagnosis matches a
condition (e.g., "Type 2 Diabetes Mellitus" matches `diabetes`), the
required days are looked up and compared against `days_enrolled`.

**TC005 example:** Vikram Joshi (EMP005) joined 2024-09-01.
- Treatment date: 2024-10-15
- days_enrolled: 44 days
- Diagnosis: Type 2 Diabetes Mellitus → matches `diabetes`
- Required days: 90
- 44 < 90 → **REJECTED** with reason `WAITING_PERIOD`
- Eligible from: 2024-11-30 (join_date + 90 days)

This is why EMP005's late join date (September instead of April) matters
specifically for conditions with a 90-day waiting period: it pushes
their eligibility date later into the policy year.

---

## 5. Exclusions

### 5.1 General Exclusions (`conditions`)

These conditions are **never** covered under any category, regardless
of when the member joined:

| Exclusion | What It Means |
|---|---|
| Self-inflicted injuries | Intentional harm; accidents are covered, deliberate injury is not |
| War or nuclear hazard | Any claim arising from armed conflict or radioactive events |
| Substance abuse treatment | Detox, rehab, or treatment specifically for addiction |
| Experimental treatments | Treatments not approved by the relevant medical regulatory body |
| Infertility and assisted reproduction | IVF, IUI, surrogacy, and related procedures |
| Obesity and weight loss programs | Diet plans, weight management programs, bariatric consultations |
| Bariatric surgery | Gastric bypass, sleeve gastrectomy, and similar procedures |
| Cosmetic or aesthetic procedures | Any procedure whose primary purpose is appearance, not medical necessity |
| Vaccination (non-medically necessary) | Routine/travel vaccinations; medically-indicated vaccines (e.g., post-bite rabies) are covered |
| Health supplements and tonics | Vitamins, protein powders, nutraceuticals: items sold without a medical indication |

The LLM-based exclusion classifier reads the diagnosis and treatment
text from the extracted prescription and checks against this list. A
match triggers an `EXCLUDED_CONDITION` rejection.

**TC012 example:** Anita Desai (EMP009) submits for "Bariatric
Consultation and Customised Diet Plan" with diagnosis "Morbid Obesity , 
BMI 37". Both `Bariatric surgery` and `Obesity and weight loss programs`
are on the exclusion list. The claim is rejected with reason
`EXCLUDED_CONDITION` (confidence > 0.90).

### 5.2 Dental-Specific Exclusions (`dental_exclusions`)

- Teeth whitening
- Orthodontic treatment
- Cosmetic dental procedures

These overlap with the DENTAL category's `excluded_procedures` list
and are enforced at the line-item level during procedure coverage
checking (see Section 3.4).

### 5.3 Vision-Specific Exclusions (`vision_exclusions`)

- LASIK
- Refractive surgery

Enforced at the line-item level during procedure coverage checking
(see Section 3.5).

---

## 6. Pre-Authorization

Pre-authorisation is advance approval from the insurer obtained
**before** the treatment takes place.

### When it is required (`required_for`)

| Trigger | Condition |
|---|---|
| MRI scan | Amount > ₹10,000 |
| CT scan | Amount > ₹10,000 |
| PET scan | Any amount |
| Major surgical procedures | Always |
| Planned hospitalization | Always |

In the policy engine, the pre-auth check for OPD claims is driven by
the `pre_auth_threshold` and `high_value_tests_requiring_pre_auth`
fields on the DIAGNOSTIC category config. If the prescription's
`tests_ordered` or the bill's line items contain MRI, CT Scan, or PET
Scan, and the total claimed amount exceeds ₹10,000, the claim is
rejected with `PRE_AUTH_MISSING`.

### `validity_days`: 30 days

An approved pre-authorisation is valid for 30 days from the date it
was issued. If treatment does not occur within this window, a fresh
pre-auth must be obtained.

---

## 7. Network Hospitals

The insurer has negotiated discounted rates with the following hospitals:

| # | Hospital Name |
|---|---|
| 1 | Apollo Hospitals |
| 2 | Fortis Healthcare |
| 3 | Max Healthcare |
| 4 | Manipal Hospitals |
| 5 | Narayana Health |
| 6 | Medanta |
| 7 | Kokilaben Dhirubhai Ambani Hospital |
| 8 | Aster CMI Hospital |
| 9 | Columbia Asia |
| 10 | Sakra World Hospital |

### How the discount works

When a claim is submitted with a `hospital_name` that fuzzy-matches
(≥ 80% token-set ratio) one of the above, the category's
`network_discount_percent` is applied to reduce the eligible amount
**before** co-pay is calculated.

**Discount rates by category:**

| Category | Network Discount |
|---|---|
| CONSULTATION | 20% |
| DIAGNOSTIC | 10% |
| PHARMACY | 0% (not applicable) |
| DENTAL | 0% (not applicable) |
| VISION | 0% (not applicable) |
| ALTERNATIVE_MEDICINE | 0% (not applicable) |

**TC010 worked example: Apollo Hospitals consultation:**

```
Claimed amount:          ₹4,500
Hospital:                Apollo Hospitals (NETWORK)
Category:                CONSULTATION
Network discount:        20%

Step 1: Eligible amount = ₹4,500 (all line items covered)
Step 2: Network discount = 20% × ₹4,500 = ₹900 off
        Amount after discount = ₹3,600
Step 3: Co-pay = 10% × ₹3,600 = ₹360 (member pays this)
        Amount after co-pay = ₹3,240
Step 4: YTD approved = ₹8,000; remaining = ₹50,000 − ₹8,000 = ₹42,000
        ₹3,240 < ₹42,000 → no annual-limit cap
Step 5: Final approved amount = ₹3,240
```

This matches the TC010 expected output exactly. The critical rule is
that the **discount is applied before co-pay**, not after. Applying
co-pay first would produce a different (incorrect) result.

---

## 8. Submission Rules

| Field | Value | Meaning |
|---|---|---|
| `deadline_days_from_treatment` | 30 | The claim must be submitted within 30 calendar days of the treatment date. If `today − treatment_date > 30`, the claim is rejected with `SUBMISSION_DEADLINE_EXCEEDED`. |
| `minimum_claim_amount` | ₹500 | Claims below ₹500 are rejected with `BELOW_MINIMUM`. This prevents administrative overhead for trivial amounts. |
| `currency` | INR | All monetary values throughout the policy are in Indian Rupees. |

---

## 9. Document Requirements

The table below shows which documents are **required** (claim cannot
proceed without them) and which are **optional** (submitted to
strengthen the claim but not mandatory).

| Category | Required Documents | Optional Documents |
|---|---|---|
| CONSULTATION | PRESCRIPTION, HOSPITAL_BILL | LAB_REPORT, DIAGNOSTIC_REPORT |
| DIAGNOSTIC | PRESCRIPTION, LAB_REPORT, HOSPITAL_BILL | DISCHARGE_SUMMARY |
| PHARMACY | PRESCRIPTION, PHARMACY_BILL |: |
| DENTAL | HOSPITAL_BILL | PRESCRIPTION, DENTAL_REPORT |
| VISION | PRESCRIPTION, HOSPITAL_BILL |: |
| ALTERNATIVE_MEDICINE | PRESCRIPTION, HOSPITAL_BILL |: |

**Important notes:**

- DENTAL is the only category that does **not** require a prescription.
  A dental bill alone is sufficient for required documents.
- DIAGNOSTIC requires three documents (prescription + lab report +
  hospital bill), more than any other category.
- If a required document type is missing, the doc-verification stage
  halts before the policy engine runs and asks the member to supply
  the missing type.
- If a document is present but unreadable (e.g., a blurry photo), the
  system asks the member to re-upload that specific document rather
  than outright rejecting the claim (TC002 behaviour).
- If documents from different patients are detected (TC003), processing
  halts with the specific names found on each document surfaced to the
  member.

---

## 10. Fraud Thresholds

All fraud thresholds are read from `policy.fraud_thresholds` at runtime.
The fraud detection agent is **fully deterministic**: it runs 8
signal checks and combines their weighted scores.

### 10.1 Configured Thresholds

| Field | Value | What It Controls |
|---|---|---|
| `same_day_claims_limit` | 2 | Maximum number of prior claims on the same treatment date before a fraud signal fires |
| `monthly_claims_limit` | 6 | Maximum number of prior claims in the same calendar month |
| `high_value_claim_threshold` | ₹25,000 | Single-claim amount above which a HIGH_VALUE_CLAIM signal fires |
| `auto_manual_review_above` | ₹25,000 | Claims above this amount are automatically routed to manual review regardless of fraud score |
| `fraud_score_manual_review_threshold` | 0.80 | Fraud scores at or above this level trigger CRITICAL risk and manual review |

### 10.2 All Eight Fraud Signals

| Signal | Trigger | Severity | Weight |
|---|---|---|---|
| `SAME_DAY_CLAIMS_EXCEEDED` | Prior claims on same day ≥ `same_day_claims_limit` (2) | 0.8 | 1.0 |
| `MONTHLY_CLAIMS_EXCEEDED` | Prior claims in same month ≥ `monthly_claims_limit` (6) | 0.6 | 0.7 |
| `HIGH_VALUE_CLAIM` | `claimed_amount > high_value_claim_threshold` (₹25,000) | 0.4 | 0.5 |
| `MULTIPLE_PROVIDERS_SAME_DAY` | More than 2 distinct providers on the same date | 0.7 | 0.9 |
| `DOCUMENT_ALTERATION` | Document quality issues include "ALTERED" flag | 0.5 | 0.6 |
| `AMOUNT_MISMATCH` | Bill total differs from claimed amount by more than 5% | 0.6 | 0.8 |
| `DATE_INCONSISTENCY` | Bill date does not match treatment date | 0.3 | 0.4 |
| `DUPLICATE_CLAIM` | Same member, amount, date, and provider as a prior claim | 0.9 | 1.0 |

### 10.3 Score Calculation

```
raw_score  = sum(signal.severity × signal.weight)  for all triggered signals
fraud_score = min(1.0,  raw_score / 2.5)
```

The divisor 2.5 is a normalisation factor. A single DUPLICATE_CLAIM
signal (0.9 × 1.0 = 0.9) scores 0.9 / 2.5 = 0.36 (MEDIUM risk).
Two simultaneous high-severity signals can push the score above 0.80
into CRITICAL.

### 10.4 Risk Levels and Actions

| Fraud Score | Risk Level | Action |
|---|---|---|
| ≥ 0.80 | CRITICAL | Manual review required |
| ≥ 0.50 | HIGH | Manual review required |
| ≥ 0.30 | MEDIUM | Noted in output; no automatic hold |
| < 0.30 | LOW | No action |

Claims above ₹25,000 (`auto_manual_review_above`) are routed to manual
review regardless of their fraud score.

**TC009 example:** Ravi Menon (EMP008) submits a 4th claim on the
same day (3 prior claims already on 2024-10-30 from 3 different
clinics). The `SAME_DAY_CLAIMS_EXCEEDED` signal fires (3 ≥ limit of 2)
with severity 0.8 and `MULTIPLE_PROVIDERS_SAME_DAY` also fires
(4 distinct providers). The claim is routed to `MANUAL_REVIEW`: not
auto-rejected: so that a human adjudicator can verify whether the
activity is legitimate.

---

## 11. Members Roster

The policy JSON includes 12 members: 10 primary employees and 2
registered dependents.

### Primary Employees

| member_id | Name | Date of Birth | Gender | Join Date | Dependents |
|---|---|---|---|---|---|
| EMP001 | Rajesh Kumar | 1985-03-15 | M | 2024-04-01 | DEP001, DEP002 |
| EMP002 | Priya Singh | 1990-07-22 | F | 2024-04-01 |: |
| EMP003 | Amit Verma | 1988-11-05 | M | 2024-04-01 | DEP003 |
| EMP004 | Sneha Reddy | 1992-02-28 | F | 2024-04-01 |: |
| EMP005 | Vikram Joshi | 1979-09-10 | M | **2024-09-01** |: |
| EMP006 | Kavita Nair | 1983-06-18 | F | 2024-04-01 |: |
| EMP007 | Suresh Patil | 1975-12-30 | M | 2024-04-01 | DEP004, DEP005 |
| EMP008 | Ravi Menon | 1987-04-14 | M | 2024-04-01 |: |
| EMP009 | Anita Desai | 1993-08-25 | F | 2024-04-01 |: |
| EMP010 | Deepak Shah | 1980-01-07 | M | 2024-04-01 | DEP006 |

### Registered Dependents

| member_id | Name | Date of Birth | Gender | Relationship | Primary Member |
|---|---|---|---|---|---|
| DEP001 | Sunita Kumar | 1987-05-20 | F | SPOUSE | EMP001 |
| DEP002 | Arjun Kumar | 2015-08-12 | M | CHILD | EMP001 |

(DEP003 through DEP006 are referenced in the employee records but not
fully defined in this policy file.)

### EMP005's Special Join Date

Vikram Joshi joined on **2024-09-01**: five months after everyone else.
This matters because all waiting periods run from the individual
member's `join_date`, not the policy start date.

Consequence for **TC005:**
- His initial 30-day waiting period ends: 2024-10-01
- His diabetes 90-day waiting period ends: 2024-11-30
- A diabetes claim on 2024-10-15 (only 44 days after joining) is
  therefore **rejected**, even though other April-joiners would have
  been eligible for diabetes claims from 2024-06-30 onwards.

This correctly reflects the real-world behaviour of group health
policies: mid-year joiners carry their own waiting period clocks.

---

## 12. Amount Calculation Algorithm

The policy engine computes the approved amount in five sequential steps.
All five steps happen inside Rule 10 (AMOUNT_CALCULATION) of the engine.

### Step 1: Determine `eligible_amount`

If the category has no procedure-level coverage lists
(CONSULTATION, DIAGNOSTIC, PHARMACY, ALTERNATIVE_MEDICINE):

```
eligible_amount = claimed_amount
```

If the category has `covered_procedures` / `excluded_procedures` /
`covered_items` / `excluded_items` (DENTAL, VISION):

```
eligible_amount = sum of amounts for all approved line items
```

Line items are matched against covered and excluded lists using fuzzy
string matching (≥ 70% threshold for covered, ≥ 75% for excluded).
Excluded items are checked first; if an item matches an exclusion, it
is rejected regardless of whether it also matches the covered list.

### Step 2: Apply network discount (if network hospital)

```
discount_amount    = eligible_amount × (network_discount_percent / 100)
amount_after_discount = eligible_amount − discount_amount
```

If the hospital does **not** appear in the network list, `discount_amount = 0`
and `amount_after_discount = eligible_amount`.

### Step 3: Apply co-pay

```
copay_amount      = amount_after_discount × (copay_percent / 100)
amount_after_copay = amount_after_discount − copay_amount
```

The member pays `copay_amount` out of pocket. The insurer pays
`amount_after_copay`.

### Step 4: Cap at remaining annual OPD limit

```
remaining     = annual_opd_limit − ytd_approved_total
               = 50,000 − (total approved so far this policy year)
final_amount  = min(amount_after_copay, remaining)
```

`ytd_approved_total` is passed in with the claim submission. If the
member has already consumed most of their annual limit, even a
fully-valid claim may be partially capped here.

### Step 5: Floor at zero

```
final_amount = max(0, round(final_amount, 2))
```

Ensures the approved amount is never negative (can occur in edge cases
involving rounding).

---

### Full Examples

#### TC004: Non-network consultation, partial co-pay

```
Member:              EMP001 (Rajesh Kumar)
Category:            CONSULTATION
Claimed amount:      ₹1,500
Hospital:            City Clinic, Bengaluru (NOT a network hospital)
YTD approved:        ₹5,000

Step 1: eligible_amount = ₹1,500 (no procedure list; amount ≤ per_claim_limit ₹5,000)
Step 2: No network discount → amount_after_discount = ₹1,500
Step 3: 10% co-pay → copay_amount = ₹150 → amount_after_copay = ₹1,350
Step 4: remaining = ₹50,000 − ₹5,000 = ₹45,000; ₹1,350 < ₹45,000 → no cap
Step 5: final_amount = ₹1,350

Decision: APPROVED: ₹1,350
```

#### TC006: Dental partial approval with procedure exclusion

```
Member:              EMP002 (Priya Singh)
Category:            DENTAL
Claimed amount:      ₹12,000
Hospital:            Smile Dental Clinic

Line items:
  Root Canal Treatment  ₹8,000  → matches covered_procedures → APPROVED
  Teeth Whitening       ₹4,000  → matches excluded_procedures → REJECTED

Step 1: eligible_amount = ₹8,000 (only approved line items sum)
        (Note: DENTAL exempt from ₹5,000 per_claim_limit)
Step 2: No network discount → amount_after_discount = ₹8,000
Step 3: 0% co-pay → amount_after_copay = ₹8,000
Step 4: Assume sufficient remaining headroom → no cap
Step 5: final_amount = ₹8,000

Decision: PARTIAL: ₹8,000
  - Root Canal Treatment: APPROVED (₹8,000)
  - Teeth Whitening: REJECTED (Excluded procedure: Teeth Whitening)
```

#### TC010: Network hospital discount then co-pay

```
Member:              EMP010 (Deepak Shah)
Category:            CONSULTATION
Claimed amount:      ₹4,500
Hospital:            Apollo Hospitals (NETWORK: 20% discount)
YTD approved:        ₹8,000

Step 1: eligible_amount = ₹4,500 (within ₹5,000 per_claim_limit)
Step 2: Network discount 20% → ₹900 off → amount_after_discount = ₹3,600
Step 3: Co-pay 10% on ₹3,600 → ₹360 off → amount_after_copay = ₹3,240
Step 4: remaining = ₹50,000 − ₹8,000 = ₹42,000; ₹3,240 < ₹42,000 → no cap
Step 5: final_amount = ₹3,240

Decision: APPROVED: ₹3,240
```

---

*This document was generated from `resources/policy_terms.json` and
the implementation in `worker/agents/policy_engine.py` and
`worker/agents/fraud_detection.py`. If the JSON is updated, this
document should be regenerated to stay in sync.*
