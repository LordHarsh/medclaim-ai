"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { submitClaim } from "@/lib/actions/claims";
import { CLAIM_CATEGORIES } from "@/lib/validations";
import { DocumentUpload } from "@/components/document-upload";

export default function NewClaimPage() {
  const router = useRouter();
  const [category, setCategory] = useState("");
  const [treatmentDate, setTreatmentDate] = useState("");
  const [claimedAmount, setClaimedAmount] = useState("");
  const [hospitalName, setHospitalName] = useState("");
  const [documentKeys, setDocumentKeys] = useState<string[]>([]);
  const [errors, setErrors] = useState<{ field?: string; message: string }[]>([]);
  const [loading, setLoading] = useState(false);

  // Generate a temporary claim ID for file uploads
  const [tempClaimId] = useState(() => crypto.randomUUID());

  const handleDocumentsChange = useCallback((keys: string[]) => {
    setDocumentKeys(keys);
  }, []);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErrors([]);
    setLoading(true);

    const formData = new FormData();
    formData.set("category", category);
    formData.set("treatment_date", treatmentDate);
    formData.set("claimed_amount", claimedAmount);
    formData.set("hospital_name", hospitalName);
    formData.set("document_keys", JSON.stringify(documentKeys));

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
                  onChange={(e) => setCategory(e.target.value)}
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

          {/* Document Upload Card */}
          <div className="bg-[var(--canvas)] rounded-xl border border-[var(--hairline)] shadow-level-1 overflow-hidden">
            <div className="px-6 py-5 border-b border-[var(--hairline)]">
              <h2 className="heading-sm text-[var(--ink)]">Supporting Documents</h2>
              <p className="mt-1 body-md text-[var(--ink-mute)]">
                Upload prescriptions, bills, lab reports, or pharmacy receipts.
                All documents must clearly show patient name and date.
              </p>
            </div>
            <div className="p-6">
              <DocumentUpload
                claimId={tempClaimId}
                onFilesChange={handleDocumentsChange}
              />
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
              disabled={loading || documentKeys.length === 0}
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
