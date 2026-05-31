"use client";

import { useState } from "react";
import type { DashboardClaim } from "../../actions";

// ─── Types ───────────────────────────────────────────────────────────────────

interface ParsedStep {
  step_name: string;
  status: string;
  duration_ms?: number;
  details?: Record<string, unknown>;
  error?: string;
}

// ─── Main Export ─────────────────────────────────────────────────────────────

export function ClaimDetailClient({ claim }: { claim: DashboardClaim }) {
  const [showRawJson, setShowRawJson] = useState(false);
  const trace = claim.trace_json;
  const steps = parseSteps(trace);

  return (
    <div className="flex flex-col gap-6">
      {/* Pipeline Trace heading */}
      <div>
        <h2 className="text-[18px] font-light tracking-[-0.18px] text-[var(--ink)]" style={{ fontFeatureSettings: '"ss01"' }}>
          Pipeline Trace
        </h2>
        <p className="text-[12px] text-[var(--ink-mute)] mt-0.5">
          {steps.length > 0 ? `${steps.length} steps executed` : "No trace data available"}
        </p>
      </div>

      {/* Steps */}
      {steps.length > 0 ? (
        <div className="flex flex-col gap-4">
          {steps.map((step, idx) => (
            <StepCard key={idx} step={step} index={idx} />
          ))}
        </div>
      ) : (
        <div className="bg-[var(--canvas)] border border-[var(--hairline)] rounded-[10px] px-5 py-8 text-center">
          <p className="text-[14px] text-[var(--ink-mute)]">
            {claim.status === "PROCESSING" || claim.status === "QUEUED"
              ? "Claim is still being processed. Trace data will appear once pipeline steps complete."
              : "No trace data available for this claim."}
          </p>
        </div>
      )}

      {/* Raw JSON toggle */}
      {trace && Object.keys(trace).length > 0 && (
        <div className="mt-2">
          <button
            onClick={() => setShowRawJson(!showRawJson)}
            className="px-4 py-2 rounded-[8px] border border-[var(--hairline)] text-[13px] font-normal text-[var(--ink-mute)] hover:text-[var(--ink)] hover:border-[var(--ink-mute)] transition-colors"
          >
            {showRawJson ? "Hide Raw Trace JSON" : "Show Raw Trace JSON"}
          </button>
          {showRawJson && (
            <pre className="mt-3 p-4 rounded-[10px] bg-[var(--canvas)] border border-[var(--hairline)] text-[11px] font-mono text-[var(--ink-secondary)] overflow-x-auto max-h-[600px] overflow-y-auto leading-[1.5]">
              {JSON.stringify(trace, null, 2)}
            </pre>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Step Card ───────────────────────────────────────────────────────────────

function StepCard({ step, index }: { step: ParsedStep; index: number }) {
  const isCompleted = step.status === "COMPLETED" || step.status === "SUCCESS";
  const isDegraded = step.status === "DEGRADED";
  const isFailed = step.status === "FAILED" || step.status === "ERROR";

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

  return (
    <div
      className="bg-[var(--canvas)] rounded-[10px] border overflow-hidden shadow-[rgba(0,55,112,0.04)_0_1px_2px]"
      style={{ borderColor }}
    >
      {/* Step header */}
      <div className="px-5 py-3 border-b flex items-center justify-between gap-4" style={{ borderColor }}>
        <div className="flex items-center gap-3">
          <span className="text-[11px] font-mono text-[var(--ink-mute)] tabular-nums">
            #{index + 1}
          </span>
          <span className="text-[13px] font-normal uppercase tracking-[0.3px]" style={{ color: headerColor }}>
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
          <span className="text-[12px] font-mono text-[var(--ink-mute)] tabular-nums">
            {formatDuration(step.duration_ms)}
          </span>
        )}
      </div>

      {/* Step error */}
      {(step.error || (step.details?.error_message as string)) && (
        <div className="px-5 py-3 bg-[rgba(234,34,97,0.03)] border-b" style={{ borderColor: "rgba(234,34,97,0.15)" }}>
          <p className="text-[12px] font-normal text-[var(--ruby)] leading-[1.5]">
            {(step.error || step.details?.error_message) as string}
          </p>
        </div>
      )}

      {/* Step content — rendered by step type */}
      <div className="px-5 py-4">
        {renderStepDetails(step)}
      </div>
    </div>
  );
}

// ─── Step Detail Renderers ───────────────────────────────────────────────────

function renderStepDetails(step: ParsedStep): React.ReactNode {
  const d = step.details || {};

  switch (step.step_name) {
    case "DOCUMENT_VERIFICATION":
      return <DocumentVerificationDetails details={d} />;
    case "DOCUMENT_EXTRACTION":
      return <DocumentExtractionDetails details={d} />;
    case "POLICY_ENGINE":
      return <PolicyEngineDetails details={d} />;
    case "FRAUD_DETECTION":
      return <FraudDetectionDetails details={d} />;
    case "FINAL_DECISION":
      return <FinalDecisionDetails details={d} />;
    default:
      return <GenericDetails details={d} />;
  }
}

// ─── DOCUMENT_VERIFICATION ──────────────────────────────────────────────────

function DocumentVerificationDetails({ details }: { details: Record<string, unknown> }) {
  const documents = details.documents as Array<Record<string, unknown>> | undefined;
  const typesDetected = details.types_detected as string[] | undefined;
  const missingTypes = details.missing_types as string[] | undefined;
  const patientNames = details.patient_names as string[] | undefined;
  const patientMismatch = details.patient_name_mismatch as boolean | undefined;
  const qualityScores = details.quality_scores as Record<string, number> | undefined;
  const earlyStopped = details.early_stop as boolean | undefined;

  return (
    <div className="flex flex-col gap-3">
      {/* Documents list */}
      {documents && documents.length > 0 && (
        <div>
          <SectionLabel>Documents Analyzed</SectionLabel>
          <div className="mt-1.5 flex flex-col gap-2">
            {documents.map((doc, i) => (
              <div key={i} className="flex items-center gap-3 px-3 py-2 rounded-[6px] bg-[var(--canvas-soft)] border border-[var(--hairline)]">
                <span className="text-[12px] font-mono text-[var(--ink)] min-w-[120px]">
                  {(doc.detected_type || doc.type || "UNKNOWN") as string}
                </span>
                {(doc.quality_score !== undefined) && (
                  <QualityBar score={Number(doc.quality_score)} />
                )}
                {doc.is_readable !== undefined && (
                  <span className={`text-[10px] uppercase tracking-[0.3px] ${doc.is_readable ? "text-[#059669]" : "text-[var(--ruby)]"}`}>
                    {doc.is_readable ? "Readable" : "Not Readable"}
                  </span>
                )}
                {doc.patient_name_found && (
                  <span className="text-[11px] text-[var(--ink-mute)]">
                    Patient: {doc.patient_name_found as string}
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Types detected (fallback if no documents array) */}
      {!documents && typesDetected && typesDetected.length > 0 && (
        <div>
          <SectionLabel>Types Detected</SectionLabel>
          <div className="mt-1 flex flex-wrap gap-1.5">
            {typesDetected.map((t, i) => (
              <span key={i} className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-[4px] bg-[var(--canvas-soft)] border border-[var(--hairline)] text-[11px] font-mono text-[var(--ink)]">
                {t}
                {qualityScores && qualityScores[t] !== undefined && (
                  <span className="text-[var(--ink-mute)]">({qualityScores[t].toFixed(2)})</span>
                )}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Missing types */}
      {missingTypes && missingTypes.length > 0 && (
        <div>
          <SectionLabel>Missing Document Types</SectionLabel>
          <div className="mt-1 flex flex-wrap gap-1.5">
            {missingTypes.map((t, i) => (
              <span key={i} className="inline-flex px-2 py-0.5 rounded-[4px] bg-[rgba(234,34,97,0.06)] border border-[rgba(234,34,97,0.15)] text-[11px] font-mono text-[var(--ruby)]">
                {t}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Patient names */}
      {patientNames && patientNames.length > 0 && (
        <div className="flex items-center gap-2">
          <SectionLabel>Patient Names:</SectionLabel>
          <span className="text-[12px] font-mono text-[var(--ink)]">{[...new Set(patientNames)].join(", ")}</span>
          {patientMismatch && (
            <span className="text-[10px] uppercase tracking-[0.3px] px-1.5 py-0.5 rounded-[4px] bg-[rgba(234,34,97,0.08)] text-[var(--ruby)]">
              MISMATCH
            </span>
          )}
        </div>
      )}

      {/* Early stop */}
      {earlyStopped && (
        <div className="px-3 py-2 rounded-[6px] bg-[rgba(217,119,6,0.06)] border border-[rgba(217,119,6,0.2)]">
          <p className="text-[11px] text-[#d97706]">Pipeline stopped early at this step</p>
        </div>
      )}
    </div>
  );
}

// ─── DOCUMENT_EXTRACTION ────────────────────────────────────────────────────

function DocumentExtractionDetails({ details }: { details: Record<string, unknown> }) {
  const prescription = details.prescription as Record<string, unknown> | undefined;
  const hospitalBill = details.hospital_bill as Record<string, unknown> | undefined;
  const labReport = details.lab_report as Record<string, unknown> | undefined;
  const extractionConfidence = details.extraction_confidence as number | undefined;

  // Fallback fields at top level
  const doctorName = (prescription?.doctor_name || details.doctor_name) as string | undefined;
  const doctorReg = (prescription?.registration_number || details.doctor_registration) as string | undefined;
  const patientName = (prescription?.patient_name || details.patient_name) as string | undefined;
  const diagnosis = (prescription?.diagnosis || details.diagnosis) as string | undefined;
  const medicines = (prescription?.medicines || details.medicines) as Array<Record<string, unknown>> | string[] | undefined;

  const hospitalName = (hospitalBill?.hospital_name || details.hospital_name) as string | undefined;
  const lineItems = (hospitalBill?.line_items || details.line_items) as Array<Record<string, unknown>> | undefined;
  const billTotal = (hospitalBill?.total || details.bill_total) as number | undefined;
  const lineItemsCount = details.line_items_count as number | undefined;

  return (
    <div className="flex flex-col gap-4">
      {/* Prescription */}
      {(doctorName || diagnosis || medicines) && (
        <div>
          <SectionLabel>Prescription</SectionLabel>
          <div className="mt-1.5 grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1 text-[12px]">
            {doctorName && <DataRow label="Doctor" value={doctorName} />}
            {doctorReg && <DataRow label="Registration" value={doctorReg} />}
            {patientName && <DataRow label="Patient" value={patientName} />}
            {diagnosis && <DataRow label="Diagnosis" value={diagnosis} />}
          </div>
          {medicines && Array.isArray(medicines) && medicines.length > 0 && (
            <div className="mt-2">
              <p className="text-[11px] text-[var(--ink-mute)] mb-1">Medicines:</p>
              <ul className="list-disc list-inside text-[12px] text-[var(--ink-secondary)] space-y-0.5 font-mono">
                {medicines.map((med, i) => (
                  <li key={i}>{typeof med === "string" ? med : (med.name as string) || JSON.stringify(med)}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* Hospital Bill */}
      {(hospitalName || lineItems || billTotal !== undefined) && (
        <div>
          <SectionLabel>Hospital Bill</SectionLabel>
          <div className="mt-1.5">
            {hospitalName && <DataRow label="Hospital" value={hospitalName} />}
            {lineItems && lineItems.length > 0 && (
              <div className="mt-2 border border-[var(--hairline)] rounded-[6px] overflow-hidden">
                <table className="w-full text-[11px]">
                  <thead>
                    <tr className="bg-[var(--canvas-soft)] border-b border-[var(--hairline)]">
                      <th className="text-left px-3 py-1.5 font-normal text-[var(--ink-mute)] uppercase tracking-[0.3px]">Description</th>
                      <th className="text-right px-3 py-1.5 font-normal text-[var(--ink-mute)] uppercase tracking-[0.3px]">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {lineItems.map((item, i) => (
                      <tr key={i} className="border-b border-[var(--hairline)] last:border-b-0">
                        <td className="px-3 py-1.5 text-[var(--ink-secondary)]">{(item.description || item.name || item.item || "--") as string}</td>
                        <td className="px-3 py-1.5 text-right font-mono text-[var(--ink)] tabular-nums">{item.amount !== undefined ? formatAmount(Number(item.amount)) : "--"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {lineItemsCount !== undefined && !lineItems && (
              <DataRow label="Line Items" value={String(lineItemsCount)} />
            )}
            {billTotal !== undefined && (
              <div className="mt-2">
                <DataRow label="Total" value={formatAmount(billTotal)} bold />
              </div>
            )}
          </div>
        </div>
      )}

      {/* Lab Report */}
      {labReport && (
        <div>
          <SectionLabel>Lab Report</SectionLabel>
          <div className="mt-1.5">
            <GenericDetails details={labReport} />
          </div>
        </div>
      )}

      {/* Extraction confidence */}
      {extractionConfidence !== undefined && (
        <div className="flex items-center gap-2">
          <SectionLabel>Extraction Confidence:</SectionLabel>
          <span className="text-[12px] font-mono text-[var(--ink)] tabular-nums">{extractionConfidence.toFixed(2)}</span>
        </div>
      )}
    </div>
  );
}

// ─── POLICY_ENGINE ──────────────────────────────────────────────────────────

function PolicyEngineDetails({ details }: { details: Record<string, unknown> }) {
  const ruleEvaluations = details.rule_evaluations as Array<Record<string, unknown>> | undefined;
  const breakdown = details.calculation_breakdown as Record<string, unknown> | undefined;
  const lineItemDecisions = details.line_item_decisions as Array<Record<string, unknown>> | undefined;
  const decision = details.decision as string | undefined;
  const rejectionReasons = details.rejection_reasons as string[] | undefined;

  return (
    <div className="flex flex-col gap-4">
      {/* Rule evaluations table */}
      {ruleEvaluations && ruleEvaluations.length > 0 && (
        <div>
          <SectionLabel>Rule Evaluations</SectionLabel>
          <div className="mt-1.5 border border-[var(--hairline)] rounded-[6px] overflow-hidden">
            <table className="w-full text-[11px]">
              <thead>
                <tr className="bg-[var(--canvas-soft)] border-b border-[var(--hairline)]">
                  <th className="text-left px-3 py-1.5 font-normal text-[var(--ink-mute)] uppercase tracking-[0.3px] w-[20px]"></th>
                  <th className="text-left px-3 py-1.5 font-normal text-[var(--ink-mute)] uppercase tracking-[0.3px]">Rule</th>
                  <th className="text-left px-3 py-1.5 font-normal text-[var(--ink-mute)] uppercase tracking-[0.3px]">Details</th>
                  <th className="text-center px-3 py-1.5 font-normal text-[var(--ink-mute)] uppercase tracking-[0.3px]">Blocking</th>
                </tr>
              </thead>
              <tbody>
                {ruleEvaluations.map((rule, i) => {
                  const passed = rule.passed !== false;
                  const blocking = rule.blocking === true;
                  return (
                    <tr
                      key={i}
                      className="border-b border-[var(--hairline)] last:border-b-0"
                      style={{ backgroundColor: passed ? undefined : "rgba(234,34,97,0.03)" }}
                    >
                      <td className="px-3 py-1.5 text-center">
                        {passed
                          ? <span className="text-[#059669]">&#10003;</span>
                          : <span className="text-[var(--ruby)]">&#10007;</span>
                        }
                      </td>
                      <td className="px-3 py-1.5 font-mono text-[var(--ink)]">{(rule.rule_name || rule.name || "Unknown") as string}</td>
                      <td className="px-3 py-1.5 text-[var(--ink-secondary)]">{(rule.reason || rule.details || rule.message || "--") as string}</td>
                      <td className="px-3 py-1.5 text-center">
                        {blocking && <span className="text-[var(--ruby)] font-normal">Yes</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Rejection reasons */}
      {rejectionReasons && rejectionReasons.length > 0 && (
        <div className="px-3 py-2 rounded-[6px] bg-[rgba(234,34,97,0.04)] border border-[rgba(234,34,97,0.15)]">
          <p className="text-[11px] uppercase tracking-[0.3px] text-[var(--ruby)] mb-1">Blocking Rules Triggered</p>
          <ul className="list-disc list-inside text-[12px] text-[var(--ruby)] space-y-0.5">
            {rejectionReasons.map((r, i) => <li key={i}>{r}</li>)}
          </ul>
        </div>
      )}

      {/* Calculation breakdown */}
      {breakdown && (
        <div>
          <SectionLabel>Calculation Breakdown</SectionLabel>
          <div className="mt-1.5 flex flex-col gap-1">
            <WaterfallRow label="Original Amount" value={breakdown.original_amount as number | undefined} />
            <WaterfallRow label="Eligible Amount" value={breakdown.eligible_amount as number | undefined} />
            {breakdown.network_discount_percent !== undefined && (
              <WaterfallRow
                label={`Network Discount (${breakdown.network_discount_percent}%)`}
                value={breakdown.after_network_discount as number | undefined}
                deduction
              />
            )}
            {breakdown.copay_percent !== undefined && (
              <WaterfallRow
                label={`Co-pay (${breakdown.copay_percent}%)`}
                value={breakdown.after_copay as number | undefined}
                deduction
                subtitle={breakdown.copay_amount !== undefined ? `Deducted: ${formatAmount(Number(breakdown.copay_amount))}` : undefined}
              />
            )}
            <WaterfallRow label="Final Approved" value={breakdown.final_approved_amount as number | undefined} highlight />
          </div>
        </div>
      )}

      {/* Line item decisions */}
      {lineItemDecisions && lineItemDecisions.length > 0 && (
        <div>
          <SectionLabel>Line Item Decisions</SectionLabel>
          <div className="mt-1.5 border border-[var(--hairline)] rounded-[6px] overflow-hidden">
            <table className="w-full text-[11px]">
              <thead>
                <tr className="bg-[var(--canvas-soft)] border-b border-[var(--hairline)]">
                  <th className="text-left px-3 py-1.5 font-normal text-[var(--ink-mute)] uppercase tracking-[0.3px]">Item</th>
                  <th className="text-right px-3 py-1.5 font-normal text-[var(--ink-mute)] uppercase tracking-[0.3px]">Amount</th>
                  <th className="text-center px-3 py-1.5 font-normal text-[var(--ink-mute)] uppercase tracking-[0.3px]">Decision</th>
                  <th className="text-left px-3 py-1.5 font-normal text-[var(--ink-mute)] uppercase tracking-[0.3px]">Reason</th>
                </tr>
              </thead>
              <tbody>
                {lineItemDecisions.map((item, i) => {
                  const approved = item.approved === true || item.decision === "APPROVED";
                  return (
                    <tr key={i} className="border-b border-[var(--hairline)] last:border-b-0">
                      <td className="px-3 py-1.5 text-[var(--ink)]">{(item.description || item.name || item.item || "--") as string}</td>
                      <td className="px-3 py-1.5 text-right font-mono tabular-nums text-[var(--ink)]">{item.amount !== undefined ? formatAmount(Number(item.amount)) : "--"}</td>
                      <td className="px-3 py-1.5 text-center">
                        <span className={`text-[10px] uppercase tracking-[0.3px] ${approved ? "text-[#059669]" : "text-[var(--ruby)]"}`}>
                          {approved ? "Approved" : "Rejected"}
                        </span>
                      </td>
                      <td className="px-3 py-1.5 text-[var(--ink-secondary)]">{(item.reason || "--") as string}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Decision result */}
      {decision && !ruleEvaluations && (
        <DataRow label="Decision" value={decision} />
      )}
    </div>
  );
}

// ─── FRAUD_DETECTION ────────────────────────────────────────────────────────

function FraudDetectionDetails({ details }: { details: Record<string, unknown> }) {
  const fraudScore = details.fraud_score as number | undefined;
  const riskLevel = details.risk_level as string | undefined;
  const signals = details.signals as Array<Record<string, unknown>> | string[] | undefined;
  const triggeredSignals = details.triggered_signals as Array<Record<string, unknown>> | undefined;

  const allSignals = triggeredSignals || (signals && typeof signals[0] === "object" ? signals as Array<Record<string, unknown>> : undefined);

  const scoreColor = fraudScore !== undefined
    ? fraudScore <= 20 ? "#059669" : fraudScore <= 50 ? "#d97706" : "var(--ruby)"
    : "var(--ink-mute)";

  const riskBg = riskLevel === "LOW" ? "rgba(5,150,105,0.08)"
    : riskLevel === "MEDIUM" ? "rgba(217,119,6,0.08)"
    : riskLevel === "HIGH" ? "rgba(234,34,97,0.08)"
    : "var(--canvas-soft)";

  const riskColor = riskLevel === "LOW" ? "#059669"
    : riskLevel === "MEDIUM" ? "#d97706"
    : riskLevel === "HIGH" ? "var(--ruby)"
    : "var(--ink-mute)";

  return (
    <div className="flex flex-col gap-4">
      {/* Score + Risk level */}
      <div className="flex items-center gap-6">
        {fraudScore !== undefined && (
          <div>
            <p className="text-[10px] uppercase tracking-[0.4px] text-[var(--ink-mute)] mb-0.5">Fraud Score</p>
            <p className="text-[28px] font-light tabular-nums" style={{ color: scoreColor, fontFeatureSettings: '"tnum", "ss01"' }}>
              {fraudScore}
            </p>
          </div>
        )}
        {riskLevel && (
          <div>
            <p className="text-[10px] uppercase tracking-[0.4px] text-[var(--ink-mute)] mb-0.5">Risk Level</p>
            <span
              className="inline-flex px-2.5 py-1 rounded-[9999px] text-[11px] font-normal uppercase tracking-[0.2px]"
              style={{ backgroundColor: riskBg, color: riskColor }}
            >
              {riskLevel}
            </span>
          </div>
        )}
      </div>

      {/* Signals table */}
      {allSignals && allSignals.length > 0 ? (
        <div>
          <SectionLabel>Triggered Signals</SectionLabel>
          <div className="mt-1.5 border border-[var(--hairline)] rounded-[6px] overflow-hidden">
            <table className="w-full text-[11px]">
              <thead>
                <tr className="bg-[var(--canvas-soft)] border-b border-[var(--hairline)]">
                  <th className="text-left px-3 py-1.5 font-normal text-[var(--ink-mute)] uppercase tracking-[0.3px]">Signal</th>
                  <th className="text-center px-3 py-1.5 font-normal text-[var(--ink-mute)] uppercase tracking-[0.3px]">Severity</th>
                  <th className="text-center px-3 py-1.5 font-normal text-[var(--ink-mute)] uppercase tracking-[0.3px]">Weight</th>
                  <th className="text-left px-3 py-1.5 font-normal text-[var(--ink-mute)] uppercase tracking-[0.3px]">Description</th>
                  <th className="text-left px-3 py-1.5 font-normal text-[var(--ink-mute)] uppercase tracking-[0.3px]">Evidence</th>
                </tr>
              </thead>
              <tbody>
                {allSignals.map((signal, i) => {
                  const severity = (signal.severity as string) || "UNKNOWN";
                  const sevColor = severity === "HIGH" ? "var(--ruby)" : severity === "MEDIUM" ? "#d97706" : "#059669";
                  return (
                    <tr key={i} className="border-b border-[var(--hairline)] last:border-b-0">
                      <td className="px-3 py-1.5 font-mono text-[var(--ink)]">{(signal.signal_type || signal.type || signal.name || "--") as string}</td>
                      <td className="px-3 py-1.5 text-center">
                        <span className="text-[10px] uppercase" style={{ color: sevColor }}>{severity}</span>
                      </td>
                      <td className="px-3 py-1.5 text-center font-mono tabular-nums text-[var(--ink)]">{signal.weight !== undefined ? String(signal.weight) : "--"}</td>
                      <td className="px-3 py-1.5 text-[var(--ink-secondary)]">{(signal.description || signal.message || "--") as string}</td>
                      <td className="px-3 py-1.5 text-[var(--ink-mute)] font-mono text-[10px]">{(signal.evidence || "--") as string}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="px-3 py-2 rounded-[6px] bg-[rgba(5,150,105,0.04)] border border-[rgba(5,150,105,0.15)]">
          <p className="text-[12px] text-[#059669]">No fraud signals detected</p>
        </div>
      )}

      {/* Simple string signals fallback */}
      {signals && typeof signals[0] === "string" && (signals as string[]).length > 0 && (
        <div>
          <SectionLabel>Signals</SectionLabel>
          <ul className="mt-1 list-disc list-inside text-[12px] text-[var(--ink-secondary)] space-y-0.5 font-mono">
            {(signals as string[]).map((s, i) => <li key={i}>{s}</li>)}
          </ul>
        </div>
      )}
    </div>
  );
}

// ─── FINAL_DECISION ─────────────────────────────────────────────────────────

function FinalDecisionDetails({ details }: { details: Record<string, unknown> }) {
  const decision = details.decision as string | undefined;
  const approvedAmount = details.approved_amount as number | undefined;
  const confidenceScore = details.confidence_score as number | undefined;
  const confidenceDeductions = details.confidence_deductions as Array<Record<string, unknown>> | undefined;
  const userMessage = details.user_message as string | undefined;
  const opsSummary = details.ops_summary as string | undefined;
  const recommendations = details.recommendations as string[] | undefined;

  const decisionColor = decision === "APPROVED" ? "#059669"
    : decision === "PARTIAL" ? "#d97706"
    : decision === "REJECTED" ? "var(--ruby)"
    : decision === "MANUAL_REVIEW" ? "#7c3aed"
    : "var(--ink)";

  return (
    <div className="flex flex-col gap-4">
      {/* Decision + Amount */}
      <div className="flex items-center gap-6 flex-wrap">
        {decision && (
          <div>
            <p className="text-[10px] uppercase tracking-[0.4px] text-[var(--ink-mute)] mb-0.5">Decision</p>
            <p className="text-[22px] font-light uppercase tracking-[-0.22px]" style={{ color: decisionColor, fontFeatureSettings: '"ss01"' }}>
              {decision}
            </p>
          </div>
        )}
        {approvedAmount !== undefined && (
          <div>
            <p className="text-[10px] uppercase tracking-[0.4px] text-[var(--ink-mute)] mb-0.5">Approved Amount</p>
            <p className="text-[22px] font-light tabular-nums tracking-[-0.44px] text-[var(--ink)]" style={{ fontFeatureSettings: '"tnum", "ss01"' }}>
              {formatAmount(approvedAmount)}
            </p>
          </div>
        )}
        {confidenceScore !== undefined && (
          <div>
            <p className="text-[10px] uppercase tracking-[0.4px] text-[var(--ink-mute)] mb-0.5">Confidence</p>
            <p className="text-[22px] font-light tabular-nums tracking-[-0.44px] text-[var(--ink)]" style={{ fontFeatureSettings: '"tnum", "ss01"' }}>
              {confidenceScore.toFixed(2)}
            </p>
          </div>
        )}
      </div>

      {/* Confidence deductions */}
      {confidenceDeductions && confidenceDeductions.length > 0 && (
        <div>
          <SectionLabel>Confidence Deductions</SectionLabel>
          <div className="mt-1.5 flex flex-col gap-1">
            {confidenceDeductions.map((ded, i) => (
              <div key={i} className="flex items-center gap-2 text-[12px]">
                <span className="text-[var(--ruby)] font-mono tabular-nums">-{(ded.amount || ded.deduction || 0) as number}</span>
                <span className="text-[var(--ink-secondary)]">{(ded.reason || ded.description || "Unknown") as string}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* User message */}
      {userMessage && (
        <div>
          <SectionLabel>User Message</SectionLabel>
          <p className="mt-1 text-[12px] text-[var(--ink-secondary)] leading-[1.5] bg-[var(--canvas-soft)] rounded-[6px] px-3 py-2 border border-[var(--hairline)]">
            {userMessage}
          </p>
        </div>
      )}

      {/* Ops summary */}
      {opsSummary && (
        <div>
          <SectionLabel>Ops Summary</SectionLabel>
          <p className="mt-1 text-[12px] text-[var(--ink-secondary)] leading-[1.5]">
            {opsSummary}
          </p>
        </div>
      )}

      {/* Recommendations */}
      {recommendations && recommendations.length > 0 && (
        <div>
          <SectionLabel>Recommendations</SectionLabel>
          <ul className="mt-1 list-disc list-inside text-[12px] text-[var(--ink-secondary)] space-y-0.5">
            {recommendations.map((r, i) => <li key={i}>{r}</li>)}
          </ul>
        </div>
      )}
    </div>
  );
}

// ─── Generic Details (fallback) ─────────────────────────────────────────────

function GenericDetails({ details }: { details: Record<string, unknown> }) {
  const entries = Object.entries(details);
  if (entries.length === 0) {
    return <p className="text-[12px] text-[var(--ink-mute)]">No details available</p>;
  }

  return (
    <div className="flex flex-col gap-1">
      {entries.map(([key, value]) => {
        if (value === null || value === undefined) return null;

        // Arrays
        if (Array.isArray(value)) {
          return (
            <div key={key}>
              <p className="text-[11px] text-[var(--ink-mute)] capitalize">{key.replace(/_/g, " ")}:</p>
              <ul className="list-disc list-inside text-[12px] text-[var(--ink-secondary)] ml-2 space-y-0.5">
                {value.map((item, i) => (
                  <li key={i} className="font-mono">{typeof item === "object" ? JSON.stringify(item) : String(item)}</li>
                ))}
              </ul>
            </div>
          );
        }

        // Objects with amount
        if (typeof value === "object" && "amount" in (value as Record<string, unknown>)) {
          const obj = value as Record<string, unknown>;
          return (
            <DataRow key={key} label={key.replace(/_/g, " ")} value={formatAmount(Number(obj.amount))} />
          );
        }

        // Other objects
        if (typeof value === "object") {
          return (
            <div key={key}>
              <p className="text-[11px] text-[var(--ink-mute)] capitalize">{key.replace(/_/g, " ")}:</p>
              <pre className="text-[10px] font-mono text-[var(--ink-secondary)] ml-2 bg-[var(--canvas-soft)] rounded px-2 py-1 overflow-x-auto">
                {JSON.stringify(value, null, 2)}
              </pre>
            </div>
          );
        }

        // Primitives
        return <DataRow key={key} label={key.replace(/_/g, " ")} value={String(value)} />;
      })}
    </div>
  );
}

// ─── Shared sub-components ──────────────────────────────────────────────────

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[11px] font-normal text-[var(--ink-mute)] uppercase tracking-[0.4px]">
      {children}
    </p>
  );
}

function DataRow({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div className="flex items-baseline gap-2 text-[12px]">
      <span className="text-[var(--ink-mute)] capitalize min-w-[80px]">{label}:</span>
      <span className={`text-[var(--ink)] font-mono ${bold ? "font-medium" : ""}`}>{value}</span>
    </div>
  );
}

function QualityBar({ score }: { score: number }) {
  const pct = Math.round(score * 100);
  const color = score >= 0.8 ? "#059669" : score >= 0.5 ? "#d97706" : "var(--ruby)";
  return (
    <div className="flex items-center gap-1.5">
      <div className="w-[50px] h-[4px] rounded-[2px] bg-[var(--canvas-soft)] border border-[var(--hairline)] overflow-hidden">
        <div className="h-full rounded-[2px]" style={{ width: `${pct}%`, backgroundColor: color }} />
      </div>
      <span className="text-[10px] font-mono tabular-nums" style={{ color }}>{score.toFixed(2)}</span>
    </div>
  );
}

function WaterfallRow({ label, value, deduction, highlight, subtitle }: {
  label: string;
  value: number | undefined;
  deduction?: boolean;
  highlight?: boolean;
  subtitle?: string;
}) {
  if (value === undefined) return null;
  return (
    <div className={`flex items-center justify-between px-3 py-1.5 rounded-[4px] ${highlight ? "bg-[rgba(5,150,105,0.04)] border border-[rgba(5,150,105,0.15)]" : ""}`}>
      <div>
        <span className={`text-[12px] ${highlight ? "text-[#059669] font-medium" : deduction ? "text-[var(--ink-secondary)]" : "text-[var(--ink)]"}`}>
          {label}
        </span>
        {subtitle && <span className="text-[10px] text-[var(--ink-mute)] ml-2">{subtitle}</span>}
      </div>
      <span className={`text-[12px] font-mono tabular-nums ${highlight ? "text-[#059669] font-medium" : deduction ? "text-[var(--ink-mute)]" : "text-[var(--ink)]"}`}>
        {formatAmount(value)}
      </span>
    </div>
  );
}

// ─── Utilities ───────────────────────────────────────────────────────────────

function parseSteps(trace_json: Record<string, unknown> | null): ParsedStep[] {
  if (!trace_json) return [];
  try {
    return (trace_json.steps as ParsedStep[]) || [];
  } catch {
    return [];
  }
}

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
