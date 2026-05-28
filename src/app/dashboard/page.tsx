import Link from "next/link";
import { requireMember } from "@/lib/auth/session";
import { listClaims } from "@/lib/actions/claims";
import type { ClaimRow } from "@/lib/types";

export const dynamic = "force-dynamic";

function getStatusStyle(status: string) {
  switch (status) {
    case "COMPLETED":
      return "bg-emerald-50 text-emerald-700 border border-emerald-200";
    case "PROCESSING":
      return "bg-[var(--primary-bg-subdued)] text-[var(--primary-deep)]";
    case "QUEUED":
      return "bg-amber-50 text-amber-700 border border-amber-200";
    case "FAILED":
      return "bg-red-50 text-red-700 border border-red-200";
    case "NEEDS_REUPLOAD":
      return "bg-orange-50 text-orange-700 border border-orange-200";
    default:
      return "bg-[var(--canvas-soft)] text-[var(--ink-mute)]";
  }
}

function getDecisionStyle(decision: string | null) {
  switch (decision) {
    case "APPROVED":
      return "bg-emerald-50 text-emerald-700 border border-emerald-200";
    case "PARTIAL":
      return "bg-amber-50 text-amber-700 border border-amber-200";
    case "REJECTED":
      return "bg-red-50 text-red-700 border border-red-200";
    case "MANUAL_REVIEW":
      return "bg-purple-50 text-purple-700 border border-purple-200";
    default:
      return "";
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

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export default async function DashboardPage() {
  const { member } = await requireMember();
  const result = await listClaims();

  const claims: ClaimRow[] = result.success ? result.data.claims : [];

  // Compute stats
  const totalClaims = claims.length;
  const approvedAmount = claims.reduce(
    (sum, c) => sum + (c.approved_amount || 0),
    0
  );
  const pendingClaims = claims.filter(
    (c) => c.status === "PROCESSING" || c.status === "QUEUED"
  ).length;

  return (
    <div className="min-h-screen bg-[var(--canvas-soft)]">
      {/* Header */}
      <header className="bg-[var(--canvas)] border-b border-[var(--hairline)]">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-2.5">
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
          </div>
          <div className="flex items-center gap-4">
            <span className="caption text-[var(--ink-mute)]">
              {member.name} ({member.member_id})
            </span>
            <Link
              href="/claims/new"
              className="btn-pill btn-pill-primary inline-flex items-center text-sm"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="mr-1.5 h-3.5 w-3.5"
              >
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
              New Claim
            </Link>
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        {/* Stats Row */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3 mb-8">
          <div className="bg-[var(--canvas)] rounded-xl border border-[var(--hairline)] shadow-level-1 p-6">
            <p className="caption text-[var(--ink-mute)]">Total Claims</p>
            <p className="mt-1 display-md text-[var(--ink)] tabular-nums">
              {totalClaims}
            </p>
          </div>
          <div className="bg-[var(--canvas)] rounded-xl border border-[var(--hairline)] shadow-level-1 p-6">
            <p className="caption text-[var(--ink-mute)]">Approved Amount</p>
            <p className="mt-1 display-md text-emerald-700 tabular-nums">
              {formatCurrency(approvedAmount || null)}
            </p>
          </div>
          <div className="bg-[var(--canvas)] rounded-xl border border-[var(--hairline)] shadow-level-1 p-6">
            <p className="caption text-[var(--ink-mute)]">Pending Claims</p>
            <p className="mt-1 display-md text-[var(--primary-indigo)] tabular-nums">
              {pendingClaims}
            </p>
          </div>
        </div>

        {/* Section heading */}
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="heading-lg text-[var(--ink)]">My Claims</h1>
            <p className="mt-1 body-md text-[var(--ink-mute)]">
              Track and manage your health insurance claims
            </p>
          </div>
        </div>

        {claims.length === 0 ? (
          <div className="bg-[var(--canvas)] rounded-xl border border-[var(--hairline)] shadow-level-1 p-16 text-center">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="mx-auto h-12 w-12 text-[var(--ink-mute)]"
            >
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
              <line x1="16" y1="13" x2="8" y2="13" />
              <line x1="16" y1="17" x2="8" y2="17" />
              <polyline points="10 9 9 9 8 9" />
            </svg>
            <h3 className="mt-4 heading-sm text-[var(--ink)]">No claims yet</h3>
            <p className="mt-2 body-md text-[var(--ink-mute)]">
              Submit your first health insurance claim to get started.
            </p>
            <Link
              href="/claims/new"
              className="btn-pill btn-pill-primary inline-flex items-center mt-6"
            >
              Submit Your First Claim
            </Link>
          </div>
        ) : (
          <div className="grid gap-3">
            {claims.map((claim) => (
              <Link
                key={claim.claim_id}
                href={`/claims/${claim.claim_id}`}
              >
                <div className="bg-[var(--canvas)] rounded-xl border border-[var(--hairline)] shadow-level-1 p-5 transition-all duration-200 hover:shadow-level-2 hover:border-[var(--primary-bg-subdued)]">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="heading-sm text-[var(--ink)]">
                      {claim.category.replace(/_/g, " ")}
                    </h3>
                    <div className="flex items-center gap-2">
                      <span
                        className={`pill-tag ${getStatusStyle(claim.status)}`}
                      >
                        {claim.status}
                      </span>
                      {claim.decision && (
                        <span
                          className={`pill-tag ${getDecisionStyle(claim.decision)}`}
                        >
                          {claim.decision}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                    <div>
                      <p className="micro text-[var(--ink-mute)]">Treatment Date</p>
                      <p className="caption text-[var(--ink)] mt-0.5">
                        {formatDate(claim.treatment_date)}
                      </p>
                    </div>
                    <div>
                      <p className="micro text-[var(--ink-mute)]">Claimed Amount</p>
                      <p className="body-tabular text-[var(--ink)] mt-0.5">
                        {formatCurrency(claim.claimed_amount)}
                      </p>
                    </div>
                    <div>
                      <p className="micro text-[var(--ink-mute)]">Approved Amount</p>
                      <p className="body-tabular text-emerald-700 mt-0.5">
                        {formatCurrency(claim.approved_amount)}
                      </p>
                    </div>
                    <div>
                      <p className="micro text-[var(--ink-mute)]">Submitted</p>
                      <p className="caption text-[var(--ink)] mt-0.5">
                        {formatDate(claim.created_at)}
                      </p>
                    </div>
                  </div>
                  {claim.hospital_name && (
                    <p className="mt-3 micro text-[var(--ink-mute)]">
                      Hospital: {claim.hospital_name}
                    </p>
                  )}
                </div>
              </Link>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
