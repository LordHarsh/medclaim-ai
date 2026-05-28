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
