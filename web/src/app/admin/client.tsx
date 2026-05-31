"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { DashboardClaim } from "./actions";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatAmount(amount: number | null | undefined): string {
  if (amount === null || amount === undefined) return "--";
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(amount);
}

function formatDuration(ms: number | null | undefined): string {
  if (ms === null || ms === undefined) return "--";
  if (ms < 1000) return `${Math.round(ms)}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function formatTime(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleString("en-IN", {
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
  } catch {
    return iso;
  }
}

function shortId(id: string): string {
  if (!id) return "--";
  // Show last 8 chars for UUID-style IDs
  if (id.length > 12) return id.slice(-8);
  return id;
}

// ─── Trace parser ─────────────────────────────────────────────────────────────

interface ParsedStep {
  step_name: string;
  status: string;
  duration_ms?: number;
  details?: Record<string, unknown>;
  error?: string;
}

function parseSteps(trace_json: Record<string, unknown> | null): ParsedStep[] {
  if (!trace_json) return [];
  try {
    return (trace_json.steps as ParsedStep[]) || [];
  } catch {
    return [];
  }
}

function getStepSummaryLines(step: ParsedStep): string[] {
  const d = step.details || {};
  const lines: string[] = [];

  switch (step.step_name) {
    case "DOCUMENT_VERIFICATION": {
      const types = (d.types_detected as string[]) || [];
      const names = (d.patient_names as string[]) || [];
      const quality = d.quality_scores as Record<string, number> | undefined;
      if (types.length) {
        const typeParts = types.map((t, i) => {
          const score = quality && quality[t];
          return score !== undefined ? `${t} (${score.toFixed(2)})` : t;
        });
        lines.push(`Documents: ${typeParts.join(", ")}`);
      }
      if (names.length) {
        const unique = [...new Set(names)];
        const consistent = unique.length === 1;
        lines.push(`Patient: "${unique.join(", ")}" (${consistent ? "consistent" : "MISMATCH"})`);
      }
      break;
    }
    case "DOCUMENT_EXTRACTION": {
      const doctor = d.doctor_name as string;
      const diagnosis = d.diagnosis as string;
      const billTotal = d.bill_total as number;
      const lineItems = d.line_items_count as number;
      if (diagnosis) lines.push(`Diagnosis: ${diagnosis}`);
      if (doctor) lines.push(`Doctor: ${doctor}`);
      if (billTotal !== undefined) lines.push(`Bill total: ${formatAmount(billTotal)}`);
      if (lineItems !== undefined) lines.push(`Line items: ${lineItems}`);
      break;
    }
    case "POLICY_ENGINE": {
      const breakdown = d.calculation_breakdown as Record<string, unknown> | undefined;
      const ruleEvals = d.rule_evaluations as Array<{ rule_name?: string; passed?: boolean; reason?: string }> | undefined;
      if (ruleEvals) {
        const passed = ruleEvals.filter((r) => r.passed !== false).length;
        lines.push(`Rules: ${ruleEvals.length} evaluated, ${passed} passed`);
        const failed = ruleEvals.filter((r) => r.passed === false);
        if (failed.length > 0) {
          for (const f of failed) {
            lines.push(`FAILED: ${f.rule_name || "unknown"}${f.reason ? ` - ${f.reason}` : ""}`);
          }
        }
      }
      if (breakdown) {
        const discount = breakdown.network_discount_percent as number;
        const copay = breakdown.copay_percent as number;
        const copayAmt = breakdown.copay_amount as number;
        const final = breakdown.final_approved_amount as number;
        const parts: string[] = [];
        if (discount !== undefined) parts.push(`Network discount: ${discount}%`);
        if (copay !== undefined && copayAmt !== undefined) parts.push(`Co-pay: ${copay}% (${formatAmount(copayAmt)})`);
        if (parts.length) lines.push(parts.join(" | "));
        if (final !== undefined) lines.push(`Final amount: ${formatAmount(final)}`);
      }
      break;
    }
    case "FRAUD_DETECTION": {
      const score = d.fraud_score as number;
      const risk = d.risk_level as string;
      const signals = d.signals as string[] | undefined;
      const parts: string[] = [];
      if (score !== undefined) parts.push(`Score: ${score}`);
      if (risk) parts.push(`Risk: ${risk}`);
      if (signals !== undefined) parts.push(`Signals: ${signals.length === 0 ? "none" : signals.join(", ")}`);
      if (parts.length) lines.push(parts.join(" | "));
      break;
    }
    case "FINAL_DECISION": {
      const decision = d.decision as string;
      const confidence = d.confidence_score as number;
      const approvedAmt = d.approved_amount as number;
      const userMsg = d.user_message as string;
      const opsSummary = d.ops_summary as string;
      const parts: string[] = [];
      if (decision) parts.push(`Decision: ${decision}`);
      if (confidence !== undefined) parts.push(`Confidence: ${confidence.toFixed(2)}`);
      if (parts.length) lines.push(parts.join(" | "));
      if (approvedAmt !== undefined) lines.push(`Approved: ${formatAmount(approvedAmt)}`);
      if (opsSummary) lines.push(opsSummary);
      else if (userMsg) lines.push(userMsg);
      break;
    }
    default: {
      const keys = Object.keys(d).slice(0, 4);
      for (const k of keys) {
        const val = d[k];
        if (typeof val === "string" || typeof val === "number") {
          lines.push(`${k}: ${val}`);
        }
      }
    }
  }
  return lines;
}

// ─── Status/Decision badge configs ────────────────────────────────────────────

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

// ─── Main component ───────────────────────────────────────────────────────────

interface OpsDashboardClientProps {
  claims: DashboardClaim[];
}

export default function OpsDashboardClient({ claims }: OpsDashboardClientProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const toggleRow = (id: string) => {
    setExpandedId((prev) => (prev === id ? null : id));
  };

  return (
    <div className="bg-[var(--canvas)] border border-[var(--hairline)] rounded-[12px] overflow-hidden shadow-[rgba(0,55,112,0.08)_0_1px_3px]">
      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-[var(--hairline)] bg-[var(--canvas-soft)]">
              <th className="text-left px-4 py-3 text-[11px] font-normal text-[var(--ink-mute)] uppercase tracking-[0.5px]">
                Claim ID
              </th>
              <th className="text-left px-4 py-3 text-[11px] font-normal text-[var(--ink-mute)] uppercase tracking-[0.5px]">
                Member
              </th>
              <th className="text-left px-4 py-3 text-[11px] font-normal text-[var(--ink-mute)] uppercase tracking-[0.5px]">
                Category
              </th>
              <th className="text-right px-4 py-3 text-[11px] font-normal text-[var(--ink-mute)] uppercase tracking-[0.5px]">
                Amount
              </th>
              <th className="text-center px-4 py-3 text-[11px] font-normal text-[var(--ink-mute)] uppercase tracking-[0.5px]">
                Status
              </th>
              <th className="text-center px-4 py-3 text-[11px] font-normal text-[var(--ink-mute)] uppercase tracking-[0.5px]">
                Decision
              </th>
              <th className="text-right px-4 py-3 text-[11px] font-normal text-[var(--ink-mute)] uppercase tracking-[0.5px]">
                Confidence
              </th>
              <th className="text-right px-4 py-3 text-[11px] font-normal text-[var(--ink-mute)] uppercase tracking-[0.5px]">
                Time
              </th>
            </tr>
          </thead>
          <tbody>
            {claims.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-12 text-center text-[14px] text-[var(--ink-mute)]">
                  No claims found
                </td>
              </tr>
            )}
            {claims.map((claim) => {
              const isExpanded = expandedId === claim.claim_id;
              const statusStyle = STATUS_STYLES[claim.status] || STATUS_STYLES.QUEUED;
              const decisionStyle = claim.decision ? DECISION_STYLES[claim.decision] || null : null;

              return (
                <ClaimRow
                  key={claim.claim_id}
                  claim={claim}
                  isExpanded={isExpanded}
                  statusStyle={statusStyle}
                  decisionStyle={decisionStyle}
                  onToggle={() => toggleRow(claim.claim_id)}
                />
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Claim row + expandable trace ─────────────────────────────────────────────

function ClaimRow({
  claim,
  isExpanded,
  statusStyle,
  decisionStyle,
  onToggle,
}: {
  claim: DashboardClaim;
  isExpanded: boolean;
  statusStyle: { bg: string; color: string };
  decisionStyle: { bg: string; color: string } | null;
  onToggle: () => void;
}) {
  const router = useRouter();

  return (
    <>
      <tr
        onClick={onToggle}
        className="border-b border-[var(--hairline)] cursor-pointer hover:bg-[var(--canvas-soft)] transition-colors"
        style={{ backgroundColor: isExpanded ? "var(--canvas-soft)" : undefined }}
      >
        <td className="px-4 py-3 text-[13px] font-mono text-[var(--ink)] tracking-[-0.26px]">
          <button
            onClick={(e) => {
              e.stopPropagation();
              router.push(`/admin/claims/${claim.claim_id}`);
            }}
            className="hover:text-[var(--primary-indigo)] hover:underline underline-offset-2 transition-colors text-left"
            title="View full claim detail"
          >
            {shortId(claim.claim_id)}
          </button>
        </td>
        <td className="px-4 py-3 text-[13px] text-[var(--ink-secondary)] tracking-[-0.26px]">
          {claim.member_id}
        </td>
        <td className="px-4 py-3 text-[13px] text-[var(--ink-secondary)] tracking-[-0.26px]">
          {claim.category}
        </td>
        <td className="px-4 py-3 text-[13px] text-[var(--ink)] tracking-[-0.26px] text-right tabular-nums">
          {formatAmount(claim.claimed_amount)}
        </td>
        <td className="px-4 py-3 text-center">
          <span
            className="inline-flex px-2 py-0.5 rounded-[9999px] text-[10px] font-normal tracking-[0.1px] uppercase"
            style={{ backgroundColor: statusStyle.bg, color: statusStyle.color }}
          >
            {claim.status}
          </span>
        </td>
        <td className="px-4 py-3 text-center">
          {decisionStyle ? (
            <span
              className="inline-flex px-2 py-0.5 rounded-[9999px] text-[10px] font-normal tracking-[0.1px] uppercase"
              style={{ backgroundColor: decisionStyle.bg, color: decisionStyle.color }}
            >
              {claim.decision}
            </span>
          ) : (
            <span className="text-[12px] text-[var(--ink-mute)]">--</span>
          )}
        </td>
        <td className="px-4 py-3 text-[13px] text-[var(--ink)] tracking-[-0.26px] text-right tabular-nums">
          {claim.confidence_score !== null ? claim.confidence_score.toFixed(2) : "--"}
        </td>
        <td className="px-4 py-3 text-[12px] text-[var(--ink-mute)] tracking-[-0.24px] text-right tabular-nums">
          {formatTime(claim.created_at)}
        </td>
      </tr>

      {/* Expanded trace */}
      {isExpanded && (
        <tr className="border-b border-[var(--hairline)]">
          <td colSpan={8} className="p-0">
            <TraceViewer claim={claim} />
          </td>
        </tr>
      )}
    </>
  );
}

// ─── Trace viewer ─────────────────────────────────────────────────────────────

function TraceViewer({ claim }: { claim: DashboardClaim }) {
  const steps = parseSteps(claim.trace_json);

  return (
    <div className="px-6 py-5 bg-[var(--canvas-soft)] border-t border-[var(--hairline)]">
      {/* Error / NEEDS_REUPLOAD banner */}
      {claim.status === "NEEDS_REUPLOAD" && claim.error_message && (
        <div className="mb-4 px-4 py-3 rounded-[8px] bg-[rgba(217,119,6,0.06)] border border-[rgba(217,119,6,0.2)]">
          <p className="text-[11px] font-normal uppercase tracking-[0.4px] text-[#d97706] mb-1">Reupload Required</p>
          <p className="text-[13px] font-normal text-[var(--ink)] leading-[1.5]">{claim.error_message}</p>
        </div>
      )}

      {/* Rejection reasons banner */}
      {claim.decision === "REJECTED" && claim.rejection_reasons && claim.rejection_reasons.length > 0 && (
        <div className="mb-4 px-4 py-3 rounded-[8px] bg-[rgba(234,34,97,0.04)] border border-[rgba(234,34,97,0.15)]">
          <p className="text-[11px] font-normal uppercase tracking-[0.4px] text-[var(--ruby)] mb-1">Rejection Reasons</p>
          <div className="flex flex-wrap gap-2">
            {claim.rejection_reasons.map((reason, i) => (
              <span
                key={i}
                className="inline-flex px-2 py-0.5 rounded-[4px] bg-[rgba(234,34,97,0.08)] text-[12px] font-mono text-[var(--ruby)]"
              >
                {reason}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Pipeline steps */}
      {steps.length > 0 ? (
        <div className="flex flex-col gap-0">
          {steps.map((step, idx) => {
            const isCompleted = step.status === "COMPLETED" || step.status === "SUCCESS";
            const isDegraded = step.status === "DEGRADED";
            const isFailed = step.status === "FAILED" || step.status === "ERROR";
            const summaryLines = getStepSummaryLines(step);

            const borderColor = isCompleted
              ? "rgba(5,150,105,0.2)"
              : isDegraded
                ? "rgba(217,119,6,0.2)"
                : isFailed
                  ? "rgba(234,34,97,0.2)"
                  : "var(--hairline)";

            const headerColor = isCompleted
              ? "#059669"
              : isDegraded
                ? "#d97706"
                : isFailed
                  ? "var(--ruby)"
                  : "var(--ink-mute)";

            const isFirst = idx === 0;
            const isLast = idx === steps.length - 1;

            return (
              <div
                key={idx}
                className="border-l border-r bg-[var(--canvas)]"
                style={{
                  borderColor: borderColor,
                  borderTopWidth: isFirst ? "1px" : "0",
                  borderBottomWidth: "1px",
                  borderTopLeftRadius: isFirst ? "8px" : "0",
                  borderTopRightRadius: isFirst ? "8px" : "0",
                  borderBottomLeftRadius: isLast ? "8px" : "0",
                  borderBottomRightRadius: isLast ? "8px" : "0",
                }}
              >
                <div className="px-4 py-3">
                  {/* Step header */}
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex items-center gap-2">
                      <span
                        className="text-[12px] font-normal uppercase tracking-[0.3px]"
                        style={{ color: headerColor }}
                      >
                        {step.step_name.replace(/_/g, " ")}
                      </span>
                      <span
                        className="text-[10px] font-normal px-1.5 py-0.5 rounded-[4px]"
                        style={{
                          backgroundColor: isCompleted
                            ? "rgba(5,150,105,0.08)"
                            : isDegraded
                              ? "rgba(217,119,6,0.08)"
                              : isFailed
                                ? "rgba(234,34,97,0.08)"
                                : "var(--canvas-soft)",
                          color: headerColor,
                        }}
                      >
                        {step.status}
                      </span>
                    </div>
                    {step.duration_ms !== undefined && (
                      <span className="text-[11px] font-normal text-[var(--ink-mute)] tabular-nums">
                        {formatDuration(step.duration_ms)}
                      </span>
                    )}
                  </div>

                  {/* Error message */}
                  {(step.error || step.details?.error_message) && (
                    <p className="mt-1.5 text-[12px] font-normal text-[var(--ruby)] leading-[1.4]">
                      {(step.error || step.details?.error_message) as string}
                    </p>
                  )}

                  {/* Summary lines */}
                  {summaryLines.length > 0 && (
                    <div className="mt-1.5 flex flex-col gap-0.5">
                      {summaryLines.map((line, li) => (
                        <span
                          key={li}
                          className="text-[12px] font-normal text-[var(--ink-mute)] tracking-[-0.24px] font-mono"
                        >
                          {line}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <p className="text-[13px] text-[var(--ink-mute)]">
          No trace data available for this claim.
        </p>
      )}

      {/* Claim metadata footer */}
      <div className="mt-4 flex flex-wrap gap-x-5 gap-y-1 text-[11px] font-normal text-[var(--ink-mute)] tracking-[-0.22px]">
        <span>Claim: {claim.claim_id}</span>
        <span>Hospital: {claim.hospital_name || "N/A"}</span>
        <span>Treatment: {claim.treatment_date}</span>
        {claim.fraud_score !== null && <span>Fraud score: {claim.fraud_score}</span>}
        {claim.completed_at && (
          <span>
            Processing time: {formatDuration(
              new Date(claim.completed_at).getTime() - new Date(claim.created_at).getTime()
            )}
          </span>
        )}
      </div>
    </div>
  );
}
