import { z } from "zod";

export const CLAIM_CATEGORIES = [
  "CONSULTATION",
  "DIAGNOSTIC",
  "PHARMACY",
  "DENTAL",
  "VISION",
  "ALTERNATIVE_MEDICINE",
] as const;

export type ClaimCategory = (typeof CLAIM_CATEGORIES)[number];

export const DOCUMENT_TYPES = [
  "PRESCRIPTION",
  "HOSPITAL_BILL",
  "LAB_REPORT",
  "DIAGNOSTIC_REPORT",
  "DISCHARGE_SUMMARY",
  "PHARMACY_BILL",
  "DENTAL_REPORT",
] as const;

export type DocumentType = (typeof DOCUMENT_TYPES)[number];

/**
 * Document requirements per category.
 * Sourced from policy_terms.json — kept as a constant here for frontend use.
 */
export const DOCUMENT_REQUIREMENTS: Record<
  ClaimCategory,
  { required: DocumentType[]; optional: DocumentType[] }
> = {
  CONSULTATION: {
    required: ["PRESCRIPTION", "HOSPITAL_BILL"],
    optional: ["LAB_REPORT", "DIAGNOSTIC_REPORT"],
  },
  DIAGNOSTIC: {
    required: ["PRESCRIPTION", "LAB_REPORT", "HOSPITAL_BILL"],
    optional: ["DISCHARGE_SUMMARY"],
  },
  PHARMACY: {
    required: ["PRESCRIPTION", "PHARMACY_BILL"],
    optional: [],
  },
  DENTAL: {
    required: ["HOSPITAL_BILL"],
    optional: ["PRESCRIPTION", "DENTAL_REPORT"],
  },
  VISION: {
    required: ["PRESCRIPTION", "HOSPITAL_BILL"],
    optional: [],
  },
  ALTERNATIVE_MEDICINE: {
    required: ["PRESCRIPTION", "HOSPITAL_BILL"],
    optional: [],
  },
};

/**
 * Human-readable labels for document types.
 */
export const DOCUMENT_TYPE_LABELS: Record<DocumentType, string> = {
  PRESCRIPTION: "Prescription",
  HOSPITAL_BILL: "Hospital Bill",
  LAB_REPORT: "Lab Report",
  DIAGNOSTIC_REPORT: "Diagnostic Report",
  DISCHARGE_SUMMARY: "Discharge Summary",
  PHARMACY_BILL: "Pharmacy Bill",
  DENTAL_REPORT: "Dental Report",
};

export const submitClaimSchema = z.object({
  category: z.enum(CLAIM_CATEGORIES, {
    error: "Please select a valid claim category",
  }),
  treatment_date: z
    .string()
    .refine(
      (val) => {
        const date = new Date(val);
        return !isNaN(date.getTime()) && date <= new Date();
      },
      { message: "Treatment date cannot be in the future" }
    ),
  claimed_amount: z
    .number({ error: "Amount must be a number" })
    .min(500, "Minimum claim amount is Rs. 500")
    .max(500000, "Maximum claim amount is Rs. 5,00,000"),
  hospital_name: z.string().max(256).optional().nullable(),
  document_keys: z
    .array(z.string())
    .min(1, "At least one document is required")
    .max(10, "Maximum 10 documents allowed"),
  document_types: z
    .record(z.string(), z.string())
    .optional()
    .default({}),
});

export const bindMemberSchema = z.object({
  member_id: z
    .string()
    .min(1, "Member ID is required")
    .max(20, "Member ID must be 20 characters or fewer")
    .regex(
      /^[a-zA-Z0-9_-]+$/,
      "Member ID must contain only letters, numbers, hyphens, and underscores"
    ),
});

export type SubmitClaimInput = z.infer<typeof submitClaimSchema>;
export type BindMemberInput = z.infer<typeof bindMemberSchema>;

/**
 * Validates that all required documents for a given category have been uploaded.
 * Returns an array of missing document type labels, or empty if all requirements are met.
 */
export function validateRequiredDocuments(
  category: ClaimCategory,
  uploadedDocTypes: Record<string, string>
): string[] {
  const requirements = DOCUMENT_REQUIREMENTS[category];
  if (!requirements) return [];

  const missing: string[] = [];
  for (const reqType of requirements.required) {
    const hasDoc = Object.values(uploadedDocTypes).includes(reqType);
    if (!hasDoc) {
      missing.push(DOCUMENT_TYPE_LABELS[reqType]);
    }
  }
  return missing;
}
