import Link from "next/link";
import { notFound } from "next/navigation";
import { getClaimById } from "../../actions";
import { ClaimDetailClient } from "./client";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Claim Detail - MedClaim AI Ops",
  description: "Full claim detail view with pipeline trace and decision audit.",
};

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function ClaimDetailPage({ params }: PageProps) {
  const { id } = await params;
  const claim = await getClaimById(id);

  if (!claim) {
    notFound();
  }

  return (
    <div className="min-h-screen bg-[var(--canvas-soft)] flex flex-col">
      {/* Header */}
      <header className="bg-[var(--canvas)] border-b border-[var(--hairline)] shrink-0">
        <div className="max-w-[1440px] mx-auto px-6 py-4">
          <Link
            href="/admin"
            className="inline-flex items-center gap-1.5 text-[13px] font-normal text-[var(--ink-mute)] hover:text-[var(--ink)] transition-colors mb-3"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M10 12L6 8L10 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            Back to Dashboard
          </Link>
          <HeaderSection claim={claim} />
        </div>
      </header>

      {/* Content */}
      <main className="flex-1 max-w-[1440px] w-full mx-auto px-6 py-6">
        {/* Error banner for NEEDS_REUPLOAD or FAILED */}
        {(claim.status === "NEEDS_REUPLOAD" || claim.status === "FAILED") && claim.error_message && (
          <ErrorBanner claim={claim} />
        )}

        {/* Pipeline Trace */}
        <ClaimDetailClient claim={claim} />
      </main>
    </div>
  );
}

// ─── Header Section ──────────────────────────────────────────────────────────

function HeaderSection({ claim }: { claim: NonNullable<Awaited<ReturnType<typeof getClaimById>>> }) {
  const processingTime = claim.completed_at
    ? new Date(claim.completed_at).getTime() - new Date(claim.created_at).getTime()
    : null;

  return (
    <div className="flex flex-col gap-4">
      {/* Row 1: ID + Badges */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-[22px] font-light tracking-[-0.22px] text-[var(--ink)]" style={{ fontFeatureSettings: '"ss01"' }}>
            Claim Detail
          </h1>
          <p className="text-[13px] font-mono text-[var(--ink-mute)] mt-0.5 tracking-[-0.26px] select-all">
            {claim.claim_id}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <StatusBadge status={claim.status} large />
          {claim.decision && <DecisionBadge decision={claim.decision} large />}
        </div>
      </div>

      {/* Row 2: Metadata grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <MetaCell label="Member ID" value={claim.member_id} mono />
        <MetaCell label="Category" value={claim.category} />
        <MetaCell label="Treatment Date" value={claim.treatment_date} mono />
        <MetaCell label="Hospital" value={claim.hospital_name || "N/A"} />
        <MetaCell label="Current Step" value={claim.current_step.replace(/_/g, " ")} />
        <MetaCell label="Processing Time" value={processingTime !== null ? formatDuration(processingTime) : "In progress"} mono />
      </div>

      {/* Row 3: Amount + Confidence */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <AmountCard label="Claimed Amount" amount={claim.claimed_amount} />
        <AmountCard label="Approved Amount" amount={claim.approved_amount} highlight={claim.decision === "APPROVED"} />
        <ConfidenceCard score={claim.confidence_score} />
      </div>
    </div>
  );
}

// ─── Error banner ────────────────────────────────────────────────────────────

function ErrorBanner({ claim }: { claim: NonNullable<Awaited<ReturnType<typeof getClaimById>>> }) {
  const isReupload = claim.status === "NEEDS_REUPLOAD";
  const bgColor = isReupload ? "rgba(217,119,6,0.06)" : "rgba(234,34,97,0.06)";
  const borderColor = isReupload ? "rgba(217,119,6,0.25)" : "rgba(234,34,97,0.25)";
  const labelColor = isReupload ? "#d97706" : "var(--ruby)";
  const label = isReupload ? "Reupload Required" : "Processing Failed";

  return (
    <div
      className="mb-6 px-5 py-4 rounded-[10px] border"
      style={{ backgroundColor: bgColor, borderColor }}
    >
      <p className="text-[12px] font-normal uppercase tracking-[0.4px] mb-1.5" style={{ color: labelColor }}>
        {label}
      </p>
      <p className="text-[14px] font-normal text-[var(--ink)] leading-[1.5]">
        {claim.error_message}
      </p>
      {claim.current_step && (
        <p className="text-[12px] font-mono text-[var(--ink-mute)] mt-2">
          Failed at step: {claim.current_step}
        </p>
      )}
    </div>
  );
}

// ─── Sub-components ──────────────────────────────────────────────────────────

const STATUS_STYLES: Record<string, { bg: string; color: string }> = {
  QUEUED: { bg: "rgba(100,116,141,0.08)", color: "var(--ink-mute)" },
  PROCESSING: { bg: "rgba(83,58,253,0.08)", color: "var(--primary-indigo)" },
  COMPLETED: { bg: "rgba(5,150,105,0.08)", color: "#059669" },
  FAILED: { bg: "rgba(234,34,97,0.08)", color: "var(--ruby)" },
  NEEDS_REUPLOAD: { bg: "rgba(217,119,6,0.08)", color: "#d97706" },
};

const DECISION_STYLES: Record<string, { bg: string; color: string }> = {
  APPROVED: { bg: "rgba(5,150,105,0.08)", color: "#059669" },
  PARTIAL: { bg: "rgba(217,119,6,0.08)", color: "#d97706" },
  REJECTED: { bg: "rgba(234,34,97,0.08)", color: "var(--ruby)" },
  MANUAL_REVIEW: { bg: "rgba(139,92,246,0.08)", color: "#7c3aed" },
};

function StatusBadge({ status, large }: { status: string; large?: boolean }) {
  const style = STATUS_STYLES[status] || STATUS_STYLES.QUEUED;
  return (
    <span
      className={`inline-flex items-center rounded-[9999px] font-normal uppercase tracking-[0.1px] ${large ? "px-3 py-1 text-[12px]" : "px-2 py-0.5 text-[10px]"}`}
      style={{ backgroundColor: style.bg, color: style.color }}
    >
      {status}
    </span>
  );
}

function DecisionBadge({ decision, large }: { decision: string; large?: boolean }) {
  const style = DECISION_STYLES[decision] || { bg: "var(--canvas-soft)", color: "var(--ink-mute)" };
  return (
    <span
      className={`inline-flex items-center rounded-[9999px] font-normal uppercase tracking-[0.1px] ${large ? "px-3 py-1 text-[12px]" : "px-2 py-0.5 text-[10px]"}`}
      style={{ backgroundColor: style.bg, color: style.color }}
    >
      {decision}
    </span>
  );
}

function MetaCell({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="bg-[var(--canvas)] border border-[var(--hairline)] rounded-[8px] px-3 py-2">
      <p className="text-[10px] font-normal text-[var(--ink-mute)] uppercase tracking-[0.4px] mb-0.5">{label}</p>
      <p className={`text-[13px] font-normal text-[var(--ink)] tracking-[-0.26px] truncate ${mono ? "font-mono" : ""}`}>
        {value}
      </p>
    </div>
  );
}

function AmountCard({ label, amount, highlight }: { label: string; amount: number | null; highlight?: boolean }) {
  return (
    <div className="bg-[var(--canvas)] border border-[var(--hairline)] rounded-[10px] px-4 py-3 shadow-[rgba(0,55,112,0.04)_0_1px_2px]">
      <p className="text-[11px] font-normal text-[var(--ink-mute)] uppercase tracking-[0.4px] mb-1">{label}</p>
      <p
        className="text-[24px] font-light tabular-nums tracking-[-0.48px]"
        style={{ color: highlight ? "#059669" : "var(--ink)", fontFeatureSettings: '"tnum", "ss01"' }}
      >
        {amount !== null && amount !== undefined ? formatAmount(amount) : "--"}
      </p>
    </div>
  );
}

function ConfidenceCard({ score }: { score: number | null }) {
  const pct = score !== null ? Math.round(score * 100) : 0;
  const barColor = score !== null
    ? score >= 0.8 ? "#059669" : score >= 0.6 ? "#d97706" : "var(--ruby)"
    : "var(--hairline)";

  return (
    <div className="bg-[var(--canvas)] border border-[var(--hairline)] rounded-[10px] px-4 py-3 shadow-[rgba(0,55,112,0.04)_0_1px_2px]">
      <p className="text-[11px] font-normal text-[var(--ink-mute)] uppercase tracking-[0.4px] mb-1">Confidence</p>
      <div className="flex items-center gap-3">
        <p
          className="text-[24px] font-light tabular-nums tracking-[-0.48px]"
          style={{ color: barColor, fontFeatureSettings: '"tnum", "ss01"' }}
        >
          {score !== null ? score.toFixed(2) : "--"}
        </p>
        {score !== null && (
          <div className="flex-1 h-[6px] rounded-[3px] bg-[var(--canvas-soft)] border border-[var(--hairline)] overflow-hidden">
            <div
              className="h-full rounded-[3px] transition-all"
              style={{ width: `${pct}%`, backgroundColor: barColor }}
            />
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Utilities ───────────────────────────────────────────────────────────────

function formatAmount(amount: number): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(amount);
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60000).toFixed(1)}m`;
}
