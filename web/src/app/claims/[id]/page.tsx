import Link from "next/link";
import { notFound } from "next/navigation";
import { requireMember } from "@/lib/auth/session";
import sql from "@/lib/db";
import { ClaimDetailClient } from "./client";
import type { ClaimRow } from "@/lib/types";

export const dynamic = "force-dynamic";

function getDecisionStyle(decision: string) {
  switch (decision) {
    case "APPROVED":
      return "bg-emerald-50 text-emerald-700 border-emerald-200";
    case "PARTIAL":
      return "bg-amber-50 text-amber-700 border-amber-200";
    case "REJECTED":
      return "bg-red-50 text-red-700 border-red-200";
    case "MANUAL_REVIEW":
      return "bg-purple-50 text-purple-700 border-purple-200";
    default:
      return "bg-[var(--canvas-soft)] text-[var(--ink-mute)]";
  }
}

function formatCurrency(amount: number | null) {
  if (!amount) return "-";
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(amount);
}

export default async function ClaimDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: claimId } = await params;
  const { member } = await requireMember();

  const claims = (await sql(
    `SELECT claim_id, category, claimed_amount, approved_amount, treatment_date,
            hospital_name, status, current_step, decision, confidence_score,
            rejection_reasons, error_message, fraud_score, trace_json,
            created_at, completed_at
     FROM claims
     WHERE claim_id = $1 AND member_id = $2`,
    [claimId, member.member_id]
  )) as unknown as ClaimRow[];

  if (!claims || claims.length === 0) {
    notFound();
  }

  const claim = claims[0];
  const isTerminal = ["COMPLETED", "FAILED", "NEEDS_REUPLOAD"].includes(
    claim.status
  );

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
      <main className="mx-auto max-w-4xl px-4 py-8 sm:px-6 lg:px-8">
        {/* Claim header */}
        <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="display-md text-[var(--ink)]">
              {claim.category.replace(/_/g, " ")} Claim
            </h1>
            <p className="mt-1 body-md text-[var(--ink-mute)]">
              Submitted on{" "}
              {new Date(claim.created_at).toLocaleDateString("en-IN", {
                day: "2-digit",
                month: "long",
                year: "numeric",
              })}
            </p>
          </div>
          <span
            className={`pill-tag px-3 py-1.5 text-xs font-normal ${
              claim.decision
                ? getDecisionStyle(claim.decision!)
                : "bg-[var(--primary-bg-subdued)] text-[var(--primary-deep)]"
            } border`}
          >
            {claim.decision || claim.status}
          </span>
        </div>

        <div className="grid gap-6 lg:grid-cols-3">
          {/* Left: Progress / Decision */}
          <div className="lg:col-span-2 space-y-6">
            {/* Decision Card (if complete) */}
            {isTerminal && claim.decision && (
              <div
                className={`rounded-xl border-2 p-6 ${
                  claim.decision === "APPROVED"
                    ? "border-emerald-200 bg-emerald-50"
                    : claim.decision === "PARTIAL"
                      ? "border-amber-200 bg-amber-50"
                      : claim.decision === "REJECTED"
                        ? "border-red-200 bg-red-50"
                        : "border-purple-200 bg-purple-50"
                }`}
              >
                <div className="flex items-center gap-3 mb-4">
                  {claim.decision === "APPROVED" && (
                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-100">
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        className="h-4 w-4 text-emerald-600"
                      >
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                    </div>
                  )}
                  {claim.decision === "REJECTED" && (
                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-red-100">
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        className="h-4 w-4 text-red-600"
                      >
                        <line x1="18" y1="6" x2="6" y2="18" />
                        <line x1="6" y1="6" x2="18" y2="18" />
                      </svg>
                    </div>
                  )}
                  {claim.decision === "PARTIAL" && (
                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-amber-100">
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        className="h-4 w-4 text-amber-600"
                      >
                        <path d="M12 9v4" />
                        <path d="M12 17h.01" />
                      </svg>
                    </div>
                  )}
                  {claim.decision === "MANUAL_REVIEW" && (
                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-purple-100">
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        className="h-4 w-4 text-purple-600"
                      >
                        <circle cx="12" cy="12" r="10" />
                        <path d="M12 16v-4" />
                        <path d="M12 8h.01" />
                      </svg>
                    </div>
                  )}
                  <h2 className="heading-md text-[var(--ink)]">
                    Decision: {claim.decision}
                  </h2>
                </div>

                <div className="space-y-3">
                  {claim.approved_amount && (
                    <div className="flex justify-between items-center">
                      <span className="body-md text-[var(--ink-mute)]">Approved Amount</span>
                      <span className="display-md text-emerald-700 tabular-nums">
                        {formatCurrency(claim.approved_amount)}
                      </span>
                    </div>
                  )}
                  {claim.confidence_score && (
                    <div className="flex justify-between items-center">
                      <span className="body-md text-[var(--ink-mute)]">Confidence Score</span>
                      <span className="body-tabular text-[var(--ink)]">
                        {(claim.confidence_score * 100).toFixed(0)}%
                      </span>
                    </div>
                  )}
                  {claim.rejection_reasons &&
                    claim.rejection_reasons.length > 0 && (
                      <div className="mt-4 pt-4 border-t border-current/10">
                        <p className="caption text-[var(--ink-secondary)] mb-2">Reasons:</p>
                        <ul className="list-inside list-disc body-md text-[var(--ink-mute)] space-y-1">
                          {claim.rejection_reasons.map((reason, i) => (
                            <li key={i}>{reason}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                </div>
              </div>
            )}

            {/* Error / Reupload Message */}
            {claim.status === "NEEDS_REUPLOAD" && (
              <div className="rounded-xl border-2 border-orange-200 bg-orange-50 p-6">
                <h2 className="heading-sm text-orange-800 mb-2">
                  Action Required: Re-upload Documents
                </h2>
                <p className="body-md text-orange-700">
                  {claim.error_message ||
                    "Some documents need to be re-uploaded. Please check the requirements and submit clearer documents."}
                </p>
                <Link
                  href="/claims/new"
                  className="btn-pill btn-pill-secondary inline-flex items-center mt-4 text-sm border-orange-300 text-orange-700"
                >
                  Submit New Claim
                </Link>
              </div>
            )}

            {claim.status === "FAILED" && (
              <div className="rounded-xl border-2 border-red-200 bg-red-50 p-6">
                <h2 className="heading-sm text-red-800 mb-2">Processing Failed</h2>
                <p className="body-md text-red-700">
                  {claim.error_message ||
                    "An error occurred while processing your claim. Our team has been notified. Please try again later."}
                </p>
              </div>
            )}

            {/* Real-time Progress (non-terminal) */}
            <ClaimDetailClient
              claimId={claimId}
              initialStatus={claim.status}
              initialStep={claim.current_step}
              traceJson={claim.trace_json}
              isTerminal={isTerminal}
            />
          </div>

          {/* Right: Claim summary */}
          <div className="space-y-6">
            <div className="bg-[var(--canvas)] rounded-xl border border-[var(--hairline)] shadow-level-1 overflow-hidden">
              <div className="px-5 py-4 border-b border-[var(--hairline)]">
                <h3 className="heading-sm text-[var(--ink)]">Claim Summary</h3>
              </div>
              <div className="p-5 space-y-4">
                <div className="flex justify-between items-center">
                  <span className="caption text-[var(--ink-mute)]">Category</span>
                  <span className="body-md text-[var(--ink)]">
                    {claim.category.replace(/_/g, " ")}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="caption text-[var(--ink-mute)]">Treatment Date</span>
                  <span className="body-md text-[var(--ink)]">
                    {new Date(claim.treatment_date).toLocaleDateString("en-IN")}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="caption text-[var(--ink-mute)]">Claimed Amount</span>
                  <span className="body-tabular text-[var(--ink)]">
                    {formatCurrency(claim.claimed_amount)}
                  </span>
                </div>
                {claim.approved_amount && (
                  <div className="flex justify-between items-center">
                    <span className="caption text-[var(--ink-mute)]">Approved Amount</span>
                    <span className="body-tabular text-emerald-700">
                      {formatCurrency(claim.approved_amount)}
                    </span>
                  </div>
                )}
                {claim.hospital_name && (
                  <div className="flex justify-between items-start">
                    <span className="caption text-[var(--ink-mute)]">Hospital</span>
                    <span className="body-md text-[var(--ink)] text-right max-w-[60%]">
                      {claim.hospital_name}
                    </span>
                  </div>
                )}
                {claim.fraud_score !== null && claim.fraud_score !== undefined && (
                  <div className="flex justify-between items-center">
                    <span className="caption text-[var(--ink-mute)]">Fraud Score</span>
                    <span
                      className={`body-tabular ${
                        claim.fraud_score >= 0.5
                          ? "text-red-600"
                          : claim.fraud_score >= 0.3
                            ? "text-amber-600"
                            : "text-emerald-600"
                      }`}
                    >
                      {(claim.fraud_score * 100).toFixed(0)}%
                    </span>
                  </div>
                )}
              </div>
            </div>

            <div className="bg-[var(--canvas)] rounded-xl border border-[var(--hairline)] shadow-level-1 overflow-hidden">
              <div className="px-5 py-4 border-b border-[var(--hairline)]">
                <h3 className="heading-sm text-[var(--ink)]">Claim ID</h3>
              </div>
              <div className="p-5">
                <code className="break-all rounded-md bg-[var(--canvas-soft)] border border-[var(--hairline)] px-3 py-2 block micro font-mono text-[var(--ink-mute)]">
                  {claimId}
                </code>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
