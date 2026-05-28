/**
 * Test cases data and expected outcomes for the admin evaluation system.
 * Derived from resources/test_cases.json — embedded here for runtime access.
 */

export interface TestCaseDocument {
  file_id: string;
  file_name: string;
  s3_key: string;
}

export interface ClaimHistoryEntry {
  claim_id: string;
  date: string;
  amount: number;
  provider: string;
}

export interface TestCaseInput {
  member_id: string;
  policy_id: string;
  claim_category: string;
  treatment_date: string;
  claimed_amount: number;
  hospital_name?: string;
  claims_history?: ClaimHistoryEntry[];
}

export interface TestCaseExpected {
  decision: string | null;
  approved_amount?: number | null;
  rejection_reasons?: string[];
  confidence_above?: number;
  system_must?: string[];
  notes?: string;
  /** For early-stop cases, the claim status should be NEEDS_REUPLOAD */
  early_stop?: boolean;
}

export interface TestCase {
  case_id: string;
  case_name: string;
  description: string;
  input: TestCaseInput;
  expected: TestCaseExpected;
  documents: TestCaseDocument[];
}

/**
 * S3 keys mapping for test documents.
 * This matches the structure produced by scripts/upload-test-docs.js
 */
export const TEST_DOCUMENTS_S3_KEYS: Record<string, TestCaseDocument[]> = {
  TC001: [
    { file_id: "F001", file_name: "another_prescription.jpg", s3_key: "test-cases/TC001/another_prescription.jpg" },
    { file_id: "F002", file_name: "dr_sharma_prescription.jpg", s3_key: "test-cases/TC001/dr_sharma_prescription.jpg" },
  ],
  TC002: [
    { file_id: "F003", file_name: "blurry_bill.jpg", s3_key: "test-cases/TC002/blurry_bill.jpg" },
    { file_id: "F004", file_name: "prescription.jpg", s3_key: "test-cases/TC002/prescription.jpg" },
  ],
  TC003: [
    { file_id: "F005", file_name: "bill_arjun.jpg", s3_key: "test-cases/TC003/bill_arjun.jpg" },
    { file_id: "F006", file_name: "prescription_rajesh.jpg", s3_key: "test-cases/TC003/prescription_rajesh.jpg" },
  ],
  TC004: [
    { file_id: "F007", file_name: "hospital_bill_tc004.jpg", s3_key: "test-cases/TC004/hospital_bill_tc004.jpg" },
    { file_id: "F008", file_name: "prescription_tc004.jpg", s3_key: "test-cases/TC004/prescription_tc004.jpg" },
  ],
  TC005: [
    { file_id: "F009", file_name: "hospital_bill_tc005.jpg", s3_key: "test-cases/TC005/hospital_bill_tc005.jpg" },
    { file_id: "F010", file_name: "prescription_tc005.jpg", s3_key: "test-cases/TC005/prescription_tc005.jpg" },
  ],
  TC006: [
    { file_id: "F011", file_name: "dental_bill_tc006.jpg", s3_key: "test-cases/TC006/dental_bill_tc006.jpg" },
  ],
  TC007: [
    { file_id: "F012", file_name: "hospital_bill_tc007.jpg", s3_key: "test-cases/TC007/hospital_bill_tc007.jpg" },
    { file_id: "F013", file_name: "mri_report_tc007.jpg", s3_key: "test-cases/TC007/mri_report_tc007.jpg" },
    { file_id: "F014", file_name: "prescription_tc007.jpg", s3_key: "test-cases/TC007/prescription_tc007.jpg" },
  ],
  TC008: [
    { file_id: "F015", file_name: "hospital_bill_tc008.jpg", s3_key: "test-cases/TC008/hospital_bill_tc008.jpg" },
    { file_id: "F016", file_name: "prescription_tc008.jpg", s3_key: "test-cases/TC008/prescription_tc008.jpg" },
  ],
  TC009: [
    { file_id: "F017", file_name: "hospital_bill_tc009.jpg", s3_key: "test-cases/TC009/hospital_bill_tc009.jpg" },
    { file_id: "F018", file_name: "prescription_tc009.jpg", s3_key: "test-cases/TC009/prescription_tc009.jpg" },
  ],
  TC010: [
    { file_id: "F019", file_name: "hospital_bill_tc010.jpg", s3_key: "test-cases/TC010/hospital_bill_tc010.jpg" },
    { file_id: "F020", file_name: "prescription_tc010.jpg", s3_key: "test-cases/TC010/prescription_tc010.jpg" },
  ],
  TC011: [
    { file_id: "F021", file_name: "hospital_bill_tc011.jpg", s3_key: "test-cases/TC011/hospital_bill_tc011.jpg" },
    { file_id: "F022", file_name: "prescription_tc011.jpg", s3_key: "test-cases/TC011/prescription_tc011.jpg" },
  ],
  TC012: [
    { file_id: "F023", file_name: "hospital_bill_tc012.jpg", s3_key: "test-cases/TC012/hospital_bill_tc012.jpg" },
    { file_id: "F024", file_name: "prescription_tc012.jpg", s3_key: "test-cases/TC012/prescription_tc012.jpg" },
  ],
};

export const TEST_CASES: TestCase[] = [
  {
    case_id: "TC001",
    case_name: "Wrong Document Uploaded",
    description: "Member submits two prescriptions for a consultation claim that requires a prescription and a hospital bill.",
    input: {
      member_id: "EMP001",
      policy_id: "PLUM_GHI_2024",
      claim_category: "CONSULTATION",
      treatment_date: "2024-11-01",
      claimed_amount: 1500,
    },
    expected: {
      decision: null,
      early_stop: true,
      system_must: [
        "Stop before making any claim decision",
        "Tell the member specifically what document type was uploaded and what is needed instead",
        "Not return a generic error",
      ],
    },
    documents: TEST_DOCUMENTS_S3_KEYS["TC001"],
  },
  {
    case_id: "TC002",
    case_name: "Unreadable Document",
    description: "Member uploads a valid prescription but a blurry, unreadable photo of their pharmacy bill.",
    input: {
      member_id: "EMP004",
      policy_id: "PLUM_GHI_2024",
      claim_category: "PHARMACY",
      treatment_date: "2024-10-25",
      claimed_amount: 800,
    },
    expected: {
      decision: null,
      early_stop: true,
      system_must: [
        "Identify that the pharmacy bill cannot be read",
        "Ask the member to re-upload that specific document",
        "Not reject the claim outright",
      ],
    },
    documents: TEST_DOCUMENTS_S3_KEYS["TC002"],
  },
  {
    case_id: "TC003",
    case_name: "Documents Belong to Different Patients",
    description: "The prescription is for Rajesh Kumar but the hospital bill is for a different patient, Arjun Mehta.",
    input: {
      member_id: "EMP001",
      policy_id: "PLUM_GHI_2024",
      claim_category: "CONSULTATION",
      treatment_date: "2024-11-01",
      claimed_amount: 1500,
    },
    expected: {
      decision: null,
      early_stop: true,
      system_must: [
        "Detect that the documents belong to different people",
        "Surface this to the member with the specific names found on each document",
        "Not proceed to a claim decision",
      ],
    },
    documents: TEST_DOCUMENTS_S3_KEYS["TC003"],
  },
  {
    case_id: "TC004",
    case_name: "Clean Consultation — Full Approval",
    description: "Complete, valid consultation claim with correct documents, valid member, covered treatment, within all limits.",
    input: {
      member_id: "EMP001",
      policy_id: "PLUM_GHI_2024",
      claim_category: "CONSULTATION",
      treatment_date: "2024-11-01",
      claimed_amount: 1500,
    },
    expected: {
      decision: "APPROVED",
      approved_amount: 1350,
      confidence_above: 0.85,
      notes: "10% co-pay applied on consultation category",
    },
    documents: TEST_DOCUMENTS_S3_KEYS["TC004"],
  },
  {
    case_id: "TC005",
    case_name: "Waiting Period — Diabetes",
    description: "Member joined 2024-09-01. Claims for diabetes treatment on 2024-10-15, within the 90-day waiting period.",
    input: {
      member_id: "EMP005",
      policy_id: "PLUM_GHI_2024",
      claim_category: "CONSULTATION",
      treatment_date: "2024-10-15",
      claimed_amount: 3000,
    },
    expected: {
      decision: "REJECTED",
      rejection_reasons: ["WAITING_PERIOD"],
      system_must: ["State the date from which the member will be eligible for diabetes-related claims"],
    },
    documents: TEST_DOCUMENTS_S3_KEYS["TC005"],
  },
  {
    case_id: "TC006",
    case_name: "Dental Partial Approval — Cosmetic Exclusion",
    description: "Bill includes root canal (covered) and teeth whitening (cosmetic, excluded).",
    input: {
      member_id: "EMP002",
      policy_id: "PLUM_GHI_2024",
      claim_category: "DENTAL",
      treatment_date: "2024-10-15",
      claimed_amount: 12000,
    },
    expected: {
      decision: "PARTIAL",
      approved_amount: 8000,
      system_must: [
        "Itemize which line items were approved and which were rejected",
        "State the reason for each rejection at the line-item level",
      ],
    },
    documents: TEST_DOCUMENTS_S3_KEYS["TC006"],
  },
  {
    case_id: "TC007",
    case_name: "MRI Without Pre-Authorization",
    description: "MRI scan costing 15,000 submitted without pre-authorization. Policy requires pre-auth for MRI above 10,000.",
    input: {
      member_id: "EMP007",
      policy_id: "PLUM_GHI_2024",
      claim_category: "DIAGNOSTIC",
      treatment_date: "2024-11-02",
      claimed_amount: 15000,
    },
    expected: {
      decision: "REJECTED",
      rejection_reasons: ["PRE_AUTH_MISSING"],
      system_must: [
        "Explain that pre-authorization was required and not obtained",
        "Tell the member what they should do to resubmit with pre-auth",
      ],
    },
    documents: TEST_DOCUMENTS_S3_KEYS["TC007"],
  },
  {
    case_id: "TC008",
    case_name: "Per-Claim Limit Exceeded",
    description: "Claimed amount of 7,500 exceeds the per-claim limit of 5,000.",
    input: {
      member_id: "EMP003",
      policy_id: "PLUM_GHI_2024",
      claim_category: "CONSULTATION",
      treatment_date: "2024-10-20",
      claimed_amount: 7500,
    },
    expected: {
      decision: "REJECTED",
      rejection_reasons: ["PER_CLAIM_EXCEEDED"],
      system_must: [
        "State the per-claim limit and the claimed amount clearly in the rejection message",
      ],
    },
    documents: TEST_DOCUMENTS_S3_KEYS["TC008"],
  },
  {
    case_id: "TC009",
    case_name: "Fraud Signal — Multiple Same-Day Claims",
    description: "Member EMP008 has already submitted 3 claims today. This is the 4th claim from the same member on the same day.",
    input: {
      member_id: "EMP008",
      policy_id: "PLUM_GHI_2024",
      claim_category: "CONSULTATION",
      treatment_date: "2024-10-30",
      claimed_amount: 4800,
      claims_history: [
        { claim_id: "CLM_0081", date: "2024-10-30", amount: 1200, provider: "City Clinic A" },
        { claim_id: "CLM_0082", date: "2024-10-30", amount: 1800, provider: "City Clinic B" },
        { claim_id: "CLM_0083", date: "2024-10-30", amount: 2100, provider: "Wellness Center" },
      ],
    },
    expected: {
      decision: "MANUAL_REVIEW",
      system_must: [
        "Flag the unusual same-day claim pattern",
        "Route to manual review rather than auto-rejecting",
        "Include the specific signals that triggered the flag in the output",
      ],
    },
    documents: TEST_DOCUMENTS_S3_KEYS["TC009"],
  },
  {
    case_id: "TC010",
    case_name: "Network Hospital — Discount Applied",
    description: "Valid claim at Apollo Hospitals (network hospital). Network discount must be applied before co-pay.",
    input: {
      member_id: "EMP010",
      policy_id: "PLUM_GHI_2024",
      claim_category: "CONSULTATION",
      treatment_date: "2024-11-03",
      claimed_amount: 4500,
      hospital_name: "Apollo Hospitals",
    },
    expected: {
      decision: "APPROVED",
      approved_amount: 3240,
      notes: "Network discount (20%) applied first on 4,500 = 3,600. Co-pay (10%) on 3,600 = 360 deducted. Final: 3,240.",
      system_must: [
        "Apply network discount before co-pay, not after",
        "Show the breakdown of discount and co-pay in the decision output",
      ],
    },
    documents: TEST_DOCUMENTS_S3_KEYS["TC010"],
  },
  {
    case_id: "TC011",
    case_name: "Component Failure — Graceful Degradation",
    description: "One component fails mid-processing. Pipeline must continue with reduced confidence.",
    input: {
      member_id: "EMP006",
      policy_id: "PLUM_GHI_2024",
      claim_category: "ALTERNATIVE_MEDICINE",
      treatment_date: "2024-10-28",
      claimed_amount: 4000,
    },
    expected: {
      decision: "APPROVED",
      system_must: [
        "Not crash or return a 500 error",
        "Indicate in the output that a component failed and was skipped",
        "Return a confidence score lower than a normal full-pipeline approval",
        "Include a note that manual review is recommended due to incomplete processing",
      ],
    },
    documents: TEST_DOCUMENTS_S3_KEYS["TC011"],
  },
  {
    case_id: "TC012",
    case_name: "Excluded Treatment",
    description: "Member claims for bariatric consultation and diet program. Obesity treatment is explicitly excluded.",
    input: {
      member_id: "EMP009",
      policy_id: "PLUM_GHI_2024",
      claim_category: "CONSULTATION",
      treatment_date: "2024-10-18",
      claimed_amount: 8000,
    },
    expected: {
      decision: "REJECTED",
      rejection_reasons: ["EXCLUDED_CONDITION"],
      confidence_above: 0.9,
    },
    documents: TEST_DOCUMENTS_S3_KEYS["TC012"],
  },
];
