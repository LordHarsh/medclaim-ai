import Link from "next/link";
import { getAllClaims, getDashboardStats } from "./actions";
import OpsDashboardClient from "./client";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Operations Dashboard - MedClaim AI",
  description: "Operations team dashboard for reviewing claim decisions, pipeline traces, and system output.",
};

function formatDuration(ms: number | null): string {
  if (ms === null) return "--";
  if (ms < 1000) return `${Math.round(ms)}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

export default async function AdminDashboardPage() {
  const [claims, stats] = await Promise.all([getAllClaims(), getDashboardStats()]);

  const approvalRate =
    stats.completed > 0
      ? ((stats.approved + stats.partial) / stats.completed * 100).toFixed(1)
      : null;

  return (
    <div className="min-h-screen bg-[var(--canvas-soft)] flex flex-col">
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <header className="bg-[var(--canvas)] border-b border-[var(--hairline)] shrink-0">
        <div className="max-w-[1440px] mx-auto px-6 py-5">
          <div className="flex items-center justify-between gap-4">
            {/* Title */}
            <div className="flex items-center gap-6 min-w-0">
              <div>
                <h1
                  className="text-[28px] font-light tracking-[-0.56px] text-[var(--ink)]"
                  style={{ fontFeatureSettings: '"ss01"' }}
                >
                  Operations Dashboard
                </h1>
                <p className="text-[13px] font-normal text-[var(--ink-mute)] mt-0.5 tracking-[-0.39px]">
                  Claim decisions, traces, and audit trail
                </p>
              </div>

              {/* Quick stats */}
              <div className="hidden md:flex items-center gap-4">
                <StatPill label="Total" value={String(stats.total)} />
                <StatPill
                  label="Approval Rate"
                  value={approvalRate ? `${approvalRate}%` : "--"}
                  color="#059669"
                />
                <StatPill
                  label="Avg Time"
                  value={formatDuration(stats.avg_processing_ms)}
                />
              </div>
            </div>

            {/* Nav link */}
            <Link
              href="/admin/eval"
              className="px-4 py-2 rounded-[9999px] border border-[var(--hairline)] text-[var(--ink-mute)]
                         text-[14px] font-normal hover:border-[var(--ink-mute)] hover:text-[var(--ink)]
                         transition-colors shrink-0"
            >
              Test Runner
            </Link>
          </div>
        </div>
      </header>

      {/* ── Content ────────────────────────────────────────────────────────── */}
      <main className="flex-1 max-w-[1440px] w-full mx-auto px-6 py-6">
        {/* Summary cards */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
          <SummaryCard label="Total Claims" value={stats.total} />
          <SummaryCard label="Approved" value={stats.approved} color="#059669" />
          <SummaryCard label="Partial" value={stats.partial} color="#d97706" />
          <SummaryCard label="Rejected" value={stats.rejected} color="var(--ruby)" />
          <SummaryCard label="Manual Review" value={stats.manual_review} color="#7c3aed" />
          <SummaryCard label="Avg Processing" value={formatDuration(stats.avg_processing_ms)} />
        </div>

        {/* Claims table */}
        <OpsDashboardClient claims={claims} />
      </main>
    </div>
  );
}

// ─── Stat pill (header) ──────────────────────────────────────────────────────

function StatPill({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="flex items-center gap-2 px-3 py-1.5 rounded-[8px] bg-[var(--canvas-soft)] border border-[var(--hairline)]">
      <span className="text-[12px] font-normal text-[var(--ink-mute)] tracking-[-0.24px]">{label}:</span>
      <span
        className="text-[14px] font-normal tabular-nums tracking-[-0.28px]"
        style={{ color: color || "var(--ink)" }}
      >
        {value}
      </span>
    </div>
  );
}

// ─── Summary card ─────────────────────────────────────────────────────────────

function SummaryCard({ label, value, color }: { label: string; value: number | string; color?: string }) {
  return (
    <div className="bg-[var(--canvas)] border border-[var(--hairline)] rounded-[10px] px-4 py-3 shadow-[rgba(0,55,112,0.04)_0_1px_2px]">
      <p className="text-[11px] font-normal text-[var(--ink-mute)] uppercase tracking-[0.4px] mb-1">{label}</p>
      <p
        className="text-[20px] font-light tabular-nums tracking-[-0.4px]"
        style={{ color: color || "var(--ink)" }}
      >
        {value}
      </p>
    </div>
  );
}
