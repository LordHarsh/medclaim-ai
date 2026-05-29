"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { submitClaim } from "@/lib/actions/claims";
import {
  CLAIM_CATEGORIES,
  DOCUMENT_REQUIREMENTS,
  DOCUMENT_TYPE_LABELS,
  validateRequiredDocuments,
  type ClaimCategory,
  type DocumentType,
} from "@/lib/validations";
import { SingleDocUpload } from "@/components/document-upload";

interface UploadedDoc {
  name: string;
  size: number;
  s3Key: string;
}

export default function NewClaimPage() {
  const router = useRouter();
  const [category, setCategory] = useState<ClaimCategory | "">("");
  const [treatmentDate, setTreatmentDate] = useState("");
  const [claimedAmount, setClaimedAmount] = useState("");
  const [hospitalName, setHospitalName] = useState("");
  // Map: docType -> uploaded file info
  const [uploadedDocs, setUploadedDocs] = useState<Record<string, UploadedDoc>>({});
  const [errors, setErrors] = useState<{ field?: string; message: string }[]>([]);
  const [loading, setLoading] = useState(false);

  // Generate a temporary claim ID for file uploads
  const [tempClaimId] = useState(() => crypto.randomUUID());

  const handleUploadComplete = useCallback((docType: string, s3Key: string) => {
    setUploadedDocs((prev) => {
      // Extract filename from the s3Key (last segment)
      const parts = s3Key.split("/");
      const fullName = parts[parts.length - 1];
      // Remove the docType prefix we added
      const name = fullName.startsWith(`${docType}_`)
        ? fullName.slice(docType.length + 1)
        : fullName;
      return {
        ...prev,
        [docType]: { name, size: 0, s3Key },
      };
    });
  }, []);

  const handleRemoveDoc = useCallback((docType: string) => {
    setUploadedDocs((prev) => {
      const updated = { ...prev };
      delete updated[docType];
      return updated;
    });
  }, []);

  // Get document requirements for the selected category
  const docRequirements = category ? DOCUMENT_REQUIREMENTS[category] : null;

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErrors([]);

    // Validate required documents
    if (category) {
      const missingDocs = validateRequiredDocuments(
        category as ClaimCategory,
        // Build a mapping of s3Key -> docType for validation
        Object.fromEntries(
          Object.entries(uploadedDocs).map(([docType, info]) => [info.s3Key, docType])
        )
      );
      if (missingDocs.length > 0) {
        setErrors(
          missingDocs.map((doc) => ({
            field: "documents",
            message: `Missing required document: ${doc}`,
          }))
        );
        return;
      }
    }

    setLoading(true);

    // Build document_keys array and document_types mapping
    const documentKeys = Object.values(uploadedDocs).map((d) => d.s3Key);
    const documentTypes: Record<string, string> = {};
    for (const [docType, info] of Object.entries(uploadedDocs)) {
      documentTypes[info.s3Key] = docType;
    }

    const formData = new FormData();
    formData.set("category", category);
    formData.set("treatment_date", treatmentDate);
    formData.set("claimed_amount", claimedAmount);
    formData.set("hospital_name", hospitalName);
    formData.set("document_keys", JSON.stringify(documentKeys));
    formData.set("document_types", JSON.stringify(documentTypes));

    try {
      const result = await submitClaim(formData);

      if (result.success) {
        router.push(`/claims/${result.data.claim_id}`);
      } else {
        setErrors(result.errors);
      }
    } catch {
      setErrors([{ message: "An unexpected error occurred. Please try again." }]);
    } finally {
      setLoading(false);
    }
  }

  const today = new Date().toISOString().split("T")[0];

  // Check if all required docs are uploaded
  const allRequiredUploaded = (() => {
    if (!category || !docRequirements) return false;
    return docRequirements.required.every((dt) => uploadedDocs[dt]?.s3Key);
  })();

  return (
    <div className="min-h-screen bg-[var(--canvas-soft)]">
      {/* Header */}
      <header className="bg-[var(--canvas)] border-b border-[var(--hairline)]">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-2.5">
            <Link href="/dashboard" className="flex items-center gap-2.5">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--primary-indigo)]">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="h-4.5 w-4.5 text-white"
                >
                  <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10" />
                  <path d="m9 12 2 2 4-4" />
                </svg>
              </div>
              <span className="text-lg font-light tracking-[-0.2px] text-[var(--ink)]">
                MedClaim AI
              </span>
            </Link>
          </div>
          <Link
            href="/dashboard"
            className="btn-pill btn-pill-secondary inline-flex items-center text-sm"
          >
            Back to Dashboard
          </Link>
        </div>
      </header>

      {/* Content */}
      <main className="mx-auto max-w-2xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="mb-8">
          <h1 className="display-md text-[var(--ink)]">Submit New Claim</h1>
          <p className="mt-2 body-md text-[var(--ink-mute)]">
            Fill in the details below and upload your medical documents.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Errors */}
          {errors.length > 0 && (
            <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3">
              <ul className="list-inside list-disc body-md text-red-700">
                {errors.map((err, i) => (
                  <li key={i}>{err.message}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Claim Details Card */}
          <div className="bg-[var(--canvas)] rounded-xl border border-[var(--hairline)] shadow-level-1 overflow-hidden">
            <div className="px-6 py-5 border-b border-[var(--hairline)]">
              <h2 className="heading-sm text-[var(--ink)]">Claim Details</h2>
              <p className="mt-1 body-md text-[var(--ink-mute)]">
                Provide information about your treatment and expenses
              </p>
            </div>
            <div className="p-6 space-y-5">
              <div className="space-y-2">
                <label className="block caption text-[var(--ink-secondary)]">
                  Claim Category
                </label>
                <select
                  value={category}
                  onChange={(e) => {
                    setCategory(e.target.value as ClaimCategory | "");
                    // Clear uploaded docs when category changes
                    setUploadedDocs({});
                  }}
                  className="input-design w-full text-[var(--ink)] bg-[var(--canvas)] appearance-none cursor-pointer"
                  required
                >
                  <option value="" disabled>
                    Select a category
                  </option>
                  {CLAIM_CATEGORIES.map((cat) => (
                    <option key={cat} value={cat}>
                      {cat.replace(/_/g, " ")}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
                <div className="space-y-2">
                  <label
                    htmlFor="treatment_date"
                    className="block caption text-[var(--ink-secondary)]"
                  >
                    Treatment Date
                  </label>
                  <input
                    id="treatment_date"
                    type="date"
                    value={treatmentDate}
                    onChange={(e) => setTreatmentDate(e.target.value)}
                    max={today}
                    required
                    className="input-design w-full text-[var(--ink)]"
                  />
                </div>

                <div className="space-y-2">
                  <label
                    htmlFor="claimed_amount"
                    className="block caption text-[var(--ink-secondary)]"
                  >
                    Claimed Amount (INR)
                  </label>
                  <input
                    id="claimed_amount"
                    type="number"
                    min="500"
                    step="0.01"
                    placeholder="e.g., 1500"
                    value={claimedAmount}
                    onChange={(e) => setClaimedAmount(e.target.value)}
                    required
                    className="input-design w-full text-[var(--ink)] tabular-nums"
                  />
                  <p className="micro text-[var(--ink-mute)]">Minimum Rs. 500</p>
                </div>
              </div>

              <div className="space-y-2">
                <label
                  htmlFor="hospital_name"
                  className="block caption text-[var(--ink-secondary)]"
                >
                  Hospital/Clinic Name{" "}
                  <span className="text-[var(--ink-mute)]">(optional)</span>
                </label>
                <input
                  id="hospital_name"
                  type="text"
                  placeholder="e.g., Apollo Hospital, Mumbai"
                  value={hospitalName}
                  onChange={(e) => setHospitalName(e.target.value)}
                  maxLength={256}
                  className="input-design w-full text-[var(--ink)]"
                />
              </div>
            </div>
          </div>

          {/* Document Upload Card — Category-Aware */}
          <div className="bg-[var(--canvas)] rounded-xl border border-[var(--hairline)] shadow-level-1 overflow-hidden">
            <div className="px-6 py-5 border-b border-[var(--hairline)]">
              <h2 className="heading-sm text-[var(--ink)]">Supporting Documents</h2>
              <p className="mt-1 body-md text-[var(--ink-mute)]">
                {category
                  ? "Upload the required documents for your claim category."
                  : "Select a claim category above to see required documents."}
              </p>
            </div>
            <div className="p-6">
              {!category && (
                <div className="flex flex-col items-center justify-center rounded-lg border-2 border-dashed border-[var(--hairline)] px-6 py-10">
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[var(--canvas-soft)]">
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="h-6 w-6 text-[var(--ink-mute)]"
                    >
                      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                      <polyline points="14 2 14 8 20 8" />
                    </svg>
                  </div>
                  <p className="mt-3 body-md text-[var(--ink-mute)]">
                    Please select a claim category first
                  </p>
                </div>
              )}

              {category && docRequirements && (
                <div className="space-y-6">
                  {/* Required Documents */}
                  {docRequirements.required.length > 0 && (
                    <div className="space-y-3">
                      <div className="flex items-center gap-2">
                        <h3 className="caption text-[var(--ink-secondary)]">
                          Required Documents
                        </h3>
                        <span className="inline-flex items-center rounded-full bg-[var(--primary-bg-subdued)]/30 px-2 py-0.5 micro-cap text-[var(--primary-deep)]">
                          {docRequirements.required.filter((dt) => uploadedDocs[dt]?.s3Key).length}/{docRequirements.required.length}
                        </span>
                      </div>
                      <div className="space-y-2">
                        {docRequirements.required.map((docType) => (
                          <SingleDocUpload
                            key={docType}
                            claimId={tempClaimId}
                            docType={docType}
                            label={DOCUMENT_TYPE_LABELS[docType as DocumentType]}
                            required={true}
                            onUploadComplete={handleUploadComplete}
                            onRemove={handleRemoveDoc}
                            currentFile={uploadedDocs[docType] || null}
                          />
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Optional Documents */}
                  {docRequirements.optional.length > 0 && (
                    <div className="space-y-3">
                      <h3 className="caption text-[var(--ink-mute)]">
                        Optional Documents
                      </h3>
                      <div className="space-y-2">
                        {docRequirements.optional.map((docType) => (
                          <SingleDocUpload
                            key={docType}
                            claimId={tempClaimId}
                            docType={docType}
                            label={DOCUMENT_TYPE_LABELS[docType as DocumentType]}
                            required={false}
                            onUploadComplete={handleUploadComplete}
                            onRemove={handleRemoveDoc}
                            currentFile={uploadedDocs[docType] || null}
                          />
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Submit */}
          <div className="flex items-center justify-end gap-3 pt-2">
            <Link
              href="/dashboard"
              className="btn-pill btn-pill-secondary inline-flex items-center text-sm"
            >
              Cancel
            </Link>
            <button
              type="submit"
              disabled={loading || !allRequiredUploaded}
              className="btn-pill btn-pill-primary inline-flex items-center px-6 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? "Submitting..." : "Submit Claim"}
            </button>
          </div>
        </form>
      </main>
    </div>
  );
}
