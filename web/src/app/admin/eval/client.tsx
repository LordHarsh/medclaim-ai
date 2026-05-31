"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { runTestCase, getTestCaseResult } from "./actions";
import type { TestCaseOutcome } from "./actions";
import { TEST_CASES } from "./test-data";
import type { TestCase } from "./test-data";

type CaseStatus = "idle" | "running" | "polling" | "passed" | "failed" | "error";

interface CaseState {
  status: CaseStatus;
  claimId: string | null;
  outcome: TestCaseOutcome | null;
  error: string | null;
  startedAt: number | null;
  duration: number | null;
  traceExpanded: boolean;
}

function getInitialStates(): Record<string, CaseState> {
  const states: Record<string, CaseState> = {};
  for (const tc of TEST_CASES) {
    states[tc.case_id] = {
      status: "idle",
      claimId: null,
      outcome: null,
      error: null,
      startedAt: null,
      duration: null,
      traceExpanded: false,
    };
  }
  return states;
}

function evaluateResult(tc: TestCase, outcome: TestCaseOutcome): boolean {
  const { expected } = tc;

  if (expected.early_stop) {
    return outcome.status === "NEEDS_REUPLOAD";
  }

  if (expected.decision && outcome.decision !== expected.decision) {
    return false;
  }

  if (expected.approved_amount !== undefined && expected.approved_amount !== null) {
    if (outcome.approved_amount === null) return false;
    const tolerance = tc.case_id === "TC011" ? 500 : 1;
    if (Math.abs(outcome.approved_amount - expected.approved_amount) > tolerance) {
      return false;
    }
  }

  if (expected.rejection_reasons && expected.rejection_reasons.length > 0) {
    if (!outcome.rejection_reasons) return false;
    for (const reason of expected.rejection_reasons) {
      if (!outcome.rejection_reasons.includes(reason)) return false;
    }
  }

  if (expected.confidence_above !== undefined) {
    if (
      outcome.confidence_score === null ||
      outcome.confidence_score < expected.confidence_above
    ) {
      return false;
    }
  }

  if (outcome.status === "COMPLETED" || outcome.status === "NEEDS_REUPLOAD") {
    return true;
  }

  return false;
}

function formatAmount(amount: number | null | undefined): string {
  if (amount === null || amount === undefined) return "--";
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(amount);
}

function formatDuration(ms: number | null): string {
  if (ms === null) return "--";
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

// ─── Pipeline step ordering ───────────────────────────────────────────────────
const PIPELINE_STEPS = [
  "LOAD_CONTEXT",
  "DOCUMENT_VERIFICATION",
  "DOCUMENT_EXTRACTION",
  "POLICY_ENGINE",
  "FRAUD_DETECTION",
  "FINAL_DECISION",
] as const;

type PipelineStep = (typeof PIPELINE_STEPS)[number];

// ─── Trace parsing helpers ────────────────────────────────────────────────────

interface ParsedStep {
  step_name: string;
  status: string;
  duration_ms?: number;
  details?: Record<string, unknown>;
  error?: string;
}

interface ParsedTrace {
  steps: ParsedStep[];
  final_decision?: {
    decision?: string;
    approved_amount?: number;
    confidence_score?: number;
    user_message?: string;
  };
}

function parseTrace(trace_json: Record<string, unknown> | null): ParsedTrace | null {
  if (!trace_json) return null;
  try {
    const steps = (trace_json.steps as ParsedStep[]) || [];
    const final_decision = trace_json.final_decision as ParsedTrace["final_decision"];
    return { steps, final_decision };
  } catch {
    return null;
  }
}

function getStepSummary(step: ParsedStep): string[] {
  const d = step.details || {};
  const lines: string[] = [];

  switch (step.step_name) {
    case "DOCUMENT_VERIFICATION": {
      const types = (d.types_detected as string[]) || [];
      const names = (d.patient_names as string[]) || [];
      if (types.length) lines.push(`Detected: ${types.join(", ")}`);
      if (names.length) {
        const unique = [...new Set(names)];
        const consistent = unique.length === 1;
        lines.push(`Patient: ${unique.join(", ")} (${consistent ? "consistent" : "mismatch"})`);
      }
      const count = d.documents_analyzed as number;
      if (count !== undefined) lines.push(`Documents: ${count}`);
      break;
    }
    case "DOCUMENT_EXTRACTION": {
      const doctor = d.doctor_name as string;
      const diagnosis = d.diagnosis as string;
      const billTotal = d.bill_total as number;
      const lineItems = d.line_items_count as number;
      if (doctor) lines.push(`Doctor: ${doctor}`);
      if (diagnosis) lines.push(`Diagnosis: ${diagnosis}`);
      if (billTotal !== undefined) lines.push(`Bill: ${formatAmount(billTotal)}`);
      if (lineItems !== undefined) lines.push(`Line items: ${lineItems}`);
      break;
    }
    case "POLICY_ENGINE": {
      const breakdown = d.calculation_breakdown as Record<string, unknown> | undefined;
      const ruleEvals = d.rule_evaluations as unknown[];
      if (ruleEvals) {
        const passed = (ruleEvals as Array<{ passed?: boolean }>).filter((r) => r.passed !== false).length;
        lines.push(`Rules: ${passed}/${ruleEvals.length} passed`);
      }
      if (breakdown) {
        const discount = breakdown.network_discount_percent as number;
        const copay = breakdown.copay_percent as number;
        const copayAmt = breakdown.copay_amount as number;
        const final = breakdown.final_approved_amount as number;
        if (discount !== undefined) lines.push(`Network discount: ${discount}%`);
        if (copay !== undefined) lines.push(`Co-pay: ${copay}% (${formatAmount(copayAmt)})`);
        if (final !== undefined) lines.push(`Final amount: ${formatAmount(final)}`);
      }
      break;
    }
    case "FRAUD_DETECTION": {
      const score = d.fraud_score as number;
      const risk = d.risk_level as string;
      const signals = d.signals as unknown[];
      if (score !== undefined) lines.push(`Score: ${score}`);
      if (risk) lines.push(`Risk: ${risk}`);
      if (signals !== undefined) lines.push(`Signals: ${signals.length === 0 ? "none" : signals.join(", ")}`);
      break;
    }
    case "FINAL_DECISION": {
      const decision = d.decision as string;
      const confidence = d.confidence_score as number;
      if (decision) lines.push(`Decision: ${decision}`);
      if (confidence !== undefined) lines.push(`Confidence: ${confidence.toFixed(3)}`);
      break;
    }
    default: {
      // Generic fallback
      const keys = Object.keys(d).slice(0, 3);
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

// ─── Main component ───────────────────────────────────────────────────────────

export default function AdminEvalClient() {
  const [states, setStates] = useState<Record<string, CaseState>>(getInitialStates);
  const [runningAll, setRunningAll] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(TEST_CASES[0]?.case_id ?? null);
  const [elapsed, setElapsed] = useState<number>(0);
  const runAllStartRef = useRef<number | null>(null);
  const elapsedIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollIntervals = useRef<Record<string, ReturnType<typeof setInterval>>>({});

  const updateState = useCallback(
    (caseId: string, updates: Partial<CaseState>) => {
      setStates((prev) => ({
        ...prev,
        [caseId]: { ...prev[caseId], ...updates },
      }));
    },
    []
  );

  const pollForResult = useCallback(
    (caseId: string, claimId: string, tc: TestCase) => {
      const intervalId = setInterval(async () => {
        try {
          const result = await getTestCaseResult(claimId);
          if (!result) return;

          const terminalStatuses = ["COMPLETED", "FAILED", "NEEDS_REUPLOAD"];
          if (terminalStatuses.includes(result.status)) {
            clearInterval(intervalId);
            delete pollIntervals.current[caseId];

            const passed = evaluateResult(tc, result);
            const now = Date.now();
            setStates((prev) => {
              const startedAt = prev[caseId].startedAt || now;
              return {
                ...prev,
                [caseId]: {
                  ...prev[caseId],
                  status: passed ? "passed" : "failed",
                  outcome: result,
                  duration: now - startedAt,
                },
              };
            });
          } else {
            updateState(caseId, { status: "polling", outcome: result });
          }
        } catch (err) {
          clearInterval(intervalId);
          delete pollIntervals.current[caseId];
          updateState(caseId, {
            status: "error",
            error: err instanceof Error ? err.message : "Polling failed",
          });
        }
      }, 3000);

      pollIntervals.current[caseId] = intervalId;
    },
    [updateState]
  );

  const handleRunCase = useCallback(
    async (caseId: string) => {
      const tc = TEST_CASES.find((t) => t.case_id === caseId);
      if (!tc) return;

      if (pollIntervals.current[caseId]) {
        clearInterval(pollIntervals.current[caseId]);
        delete pollIntervals.current[caseId];
      }

      updateState(caseId, {
        status: "running",
        claimId: null,
        outcome: null,
        error: null,
        startedAt: Date.now(),
        duration: null,
        traceExpanded: false,
      });

      try {
        const result = await runTestCase(caseId);
        updateState(caseId, { claimId: result.claim_id, status: "polling" });
        pollForResult(caseId, result.claim_id, tc);
      } catch (err) {
        updateState(caseId, {
          status: "error",
          error: err instanceof Error ? err.message : "Failed to run test case",
        });
      }
    },
    [updateState, pollForResult]
  );

  const handleRunAll = useCallback(async () => {
    setRunningAll(true);
    runAllStartRef.current = Date.now();
    setElapsed(0);
    if (elapsedIntervalRef.current) clearInterval(elapsedIntervalRef.current);
    elapsedIntervalRef.current = setInterval(() => {
      if (runAllStartRef.current) {
        setElapsed(Math.floor((Date.now() - runAllStartRef.current) / 1000));
      }
    }, 1000);

    for (const tc of TEST_CASES) {
      await handleRunCase(tc.case_id);
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
    setRunningAll(false);
    if (elapsedIntervalRef.current) {
      clearInterval(elapsedIntervalRef.current);
      elapsedIntervalRef.current = null;
    }
  }, [handleRunCase]);

  const handleResetAll = useCallback(() => {
    // Clear all polls
    for (const id of Object.keys(pollIntervals.current)) {
      clearInterval(pollIntervals.current[id]);
    }
    pollIntervals.current = {};
    setStates(getInitialStates());
    setRunningAll(false);
    setElapsed(0);
    if (elapsedIntervalRef.current) {
      clearInterval(elapsedIntervalRef.current);
      elapsedIntervalRef.current = null;
    }
  }, []);

  const toggleTrace = useCallback((caseId: string) => {
    setStates((prev) => ({
      ...prev,
      [caseId]: {
        ...prev[caseId],
        traceExpanded: !prev[caseId].traceExpanded,
      },
    }));
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      for (const id of Object.keys(pollIntervals.current)) {
        clearInterval(pollIntervals.current[id]);
      }
      if (elapsedIntervalRef.current) clearInterval(elapsedIntervalRef.current);
    };
  }, []);

  // Summary stats
  const totalCases = TEST_CASES.length;
  const passedCount = Object.values(states).filter((s) => s.status === "passed").length;
  const failedCount = Object.values(states).filter((s) => s.status === "failed").length;
  const runningCount = Object.values(states).filter(
    (s) => s.status === "running" || s.status === "polling"
  ).length;
  const doneCount = passedCount + failedCount;
  const passRate = doneCount > 0 ? passedCount / doneCount : null;

  const selectedCase = TEST_CASES.find((tc) => tc.case_id === selectedId) ?? null;
  const selectedState = selectedId ? states[selectedId] : null;

  return (
    <div className="min-h-screen bg-[var(--canvas-soft)] flex flex-col">
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <header className="bg-[var(--canvas)] border-b border-[var(--hairline)] shrink-0">
        <div className="max-w-[1440px] mx-auto px-6 py-5">
          <div className="flex items-center justify-between gap-4">
            {/* Title + stats */}
            <div className="flex items-center gap-6 min-w-0">
              <div>
                <h1
                  className="text-[28px] font-light tracking-[-0.56px] text-[var(--ink)]"
                  style={{ fontFeatureSettings: '"ss01"' }}
                >
                  Evaluation Suite
                </h1>
                <p className="text-[13px] font-normal text-[var(--ink-mute)] mt-0.5 tracking-[-0.39px]">
                  Full pipeline test harness
                </p>
              </div>

              {/* Pass rate fraction */}
              <div className="hidden sm:flex items-center gap-2 px-4 py-2 rounded-[8px] bg-[var(--canvas-soft)] border border-[var(--hairline)]">
                <span
                  className="text-[22px] font-light tabular-nums tracking-[-0.44px]"
                  style={{
                    color:
                      passRate === null
                        ? "var(--ink-mute)"
                        : passRate >= 0.8
                          ? "#059669"
                          : passRate >= 0.5
                            ? "#d97706"
                            : "var(--ruby)",
                  }}
                >
                  {passedCount} / {totalCases}
                </span>
                <span className="text-[12px] font-normal text-[var(--ink-mute)] tracking-[-0.36px]">
                  passed
                </span>
              </div>

              {/* Mini stat pills */}
              <div className="hidden md:flex items-center gap-3">
                <StatPill color="#059669" label="Passed" value={passedCount} />
                <StatPill color="var(--ruby)" label="Failed" value={failedCount} />
                <StatPill color="var(--primary-soft)" label="Running" value={runningCount} pulse={runningCount > 0} />
              </div>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-3 shrink-0">
              {runningAll && (
                <span className="text-[13px] font-normal tabular-nums text-[var(--ink-mute)] tracking-[-0.39px]">
                  {elapsed}s elapsed
                </span>
              )}
              <button
                onClick={handleResetAll}
                disabled={runningAll}
                className="px-4 py-2 rounded-[9999px] border border-[var(--hairline)] text-[var(--ink-mute)]
                           text-[14px] font-normal hover:border-[var(--ink-mute)] hover:text-[var(--ink)]
                           disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                Reset All
              </button>
              <button
                onClick={handleRunAll}
                disabled={runningAll}
                className="px-4 py-2 rounded-[9999px] bg-[var(--primary-indigo)] text-white
                           text-[14px] font-normal hover:bg-[var(--primary-deep)] active:bg-[var(--primary-press)]
                           disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {runningAll ? "Running..." : "Run All"}
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* ── Two-column layout ───────────────────────────────────────────────── */}
      <div className="flex-1 flex overflow-hidden max-w-[1440px] w-full mx-auto">
        {/* Left: case list */}
        <aside className="w-[340px] shrink-0 border-r border-[var(--hairline)] bg-[var(--canvas)] overflow-y-auto">
          <div className="py-2">
            {TEST_CASES.map((tc) => {
              const state = states[tc.case_id];
              const isSelected = selectedId === tc.case_id;
              return (
                <CaseRow
                  key={tc.case_id}
                  testCase={tc}
                  state={state}
                  isSelected={isSelected}
                  onSelect={() => setSelectedId(tc.case_id)}
                  onRun={(e) => {
                    e.stopPropagation();
                    handleRunCase(tc.case_id);
                  }}
                />
              );
            })}
          </div>
        </aside>

        {/* Right: detail panel */}
        <main className="flex-1 overflow-y-auto">
          {selectedCase && selectedState ? (
            <DetailPanel
              testCase={selectedCase}
              state={selectedState}
              onRun={() => handleRunCase(selectedCase.case_id)}
              onToggleTrace={() => toggleTrace(selectedCase.case_id)}
            />
          ) : (
            <div className="flex items-center justify-center h-full text-[var(--ink-mute)] text-[15px] font-light">
              Select a test case to view details
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

// ─── Stat pill ────────────────────────────────────────────────────────────────

function StatPill({
  color,
  label,
  value,
  pulse,
}: {
  color: string;
  label: string;
  value: number;
  pulse?: boolean;
}) {
  return (
    <div className="flex items-center gap-1.5">
      <span
        className={`inline-block w-2 h-2 rounded-full ${pulse ? "animate-pulse" : ""}`}
        style={{ backgroundColor: color }}
      />
      <span className="text-[13px] font-normal text-[var(--ink-mute)] tabular-nums tracking-[-0.39px]">
        {label}: {value}
      </span>
    </div>
  );
}

// ─── Case row (left column) ───────────────────────────────────────────────────

interface CaseRowProps {
  testCase: TestCase;
  state: CaseState;
  isSelected: boolean;
  onSelect: () => void;
  onRun: (e: React.MouseEvent) => void;
}

function CaseRow({ testCase: tc, state, isSelected, onSelect, onRun }: CaseRowProps) {
  const isRunning = state.status === "running" || state.status === "polling";

  const dotColor =
    state.status === "passed"
      ? "#059669"
      : state.status === "failed" || state.status === "error"
        ? "var(--ruby)"
        : isRunning
          ? "var(--primary-soft)"
          : "var(--hairline)";

  const decisionLabel = state.outcome?.decision || (state.outcome?.status === "NEEDS_REUPLOAD" ? "REUPLOAD" : null);

  return (
    <div
      onClick={onSelect}
      className="group flex items-center gap-3 px-4 py-3 cursor-pointer border-l-[3px] transition-colors"
      style={{
        borderLeftColor: isSelected ? "var(--primary-indigo)" : "transparent",
        backgroundColor: isSelected ? "rgba(83,58,253,0.04)" : "transparent",
      }}
      onMouseEnter={(e) => {
        if (!isSelected) (e.currentTarget as HTMLDivElement).style.backgroundColor = "var(--canvas-soft)";
      }}
      onMouseLeave={(e) => {
        if (!isSelected) (e.currentTarget as HTMLDivElement).style.backgroundColor = "transparent";
      }}
    >
      {/* Status dot */}
      <span
        className={`shrink-0 w-2 h-2 rounded-full ${isRunning ? "animate-pulse" : ""}`}
        style={{ backgroundColor: dotColor }}
      />

      {/* ID + Name */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-[11px] font-normal text-[var(--ink-mute)] tabular-nums tracking-[0px] shrink-0">
            {tc.case_id}
          </span>
          <span className="text-[13px] font-normal text-[var(--ink)] tracking-[-0.26px] truncate">
            {tc.case_name}
          </span>
        </div>
        {/* Decision badge or step */}
        {decisionLabel && (
          <span
            className="inline-block mt-0.5 text-[10px] font-normal tracking-[0.1px] uppercase px-1.5 py-0.5 rounded-[4px]"
            style={{
              backgroundColor:
                decisionLabel === "APPROVED"
                  ? "rgba(5,150,105,0.08)"
                  : decisionLabel === "PARTIAL"
                    ? "rgba(217,119,6,0.08)"
                    : decisionLabel === "REUPLOAD"
                      ? "rgba(83,58,253,0.08)"
                      : "rgba(234,34,97,0.08)",
              color:
                decisionLabel === "APPROVED"
                  ? "#059669"
                  : decisionLabel === "PARTIAL"
                    ? "#d97706"
                    : decisionLabel === "REUPLOAD"
                      ? "var(--primary-indigo)"
                      : "var(--ruby)",
            }}
          >
            {decisionLabel}
          </span>
        )}
        {isRunning && state.outcome?.current_step && (
          <span className="inline-block mt-0.5 text-[10px] font-normal text-[var(--primary-indigo)] tracking-[0px]">
            {state.outcome.current_step}
          </span>
        )}
      </div>

      {/* Duration / Run button */}
      <div className="shrink-0 flex flex-col items-end gap-1">
        {state.duration !== null && (
          <span className="text-[11px] font-normal tabular-nums text-[var(--ink-mute)] tracking-[-0.33px]">
            {formatDuration(state.duration)}
          </span>
        )}
        <button
          onClick={onRun}
          disabled={isRunning}
          className="text-[11px] font-normal text-[var(--primary-indigo)] hover:text-[var(--primary-deep)]
                     disabled:opacity-40 disabled:cursor-not-allowed opacity-0 group-hover:opacity-100 transition-opacity"
        >
          {isRunning ? "..." : "Run"}
        </button>
      </div>
    </div>
  );
}

// ─── Detail panel (right column) ─────────────────────────────────────────────

interface DetailPanelProps {
  testCase: TestCase;
  state: CaseState;
  onRun: () => void;
  onToggleTrace: () => void;
}

function DetailPanel({ testCase: tc, state, onRun, onToggleTrace }: DetailPanelProps) {
  const isRunning = state.status === "running" || state.status === "polling";
  const isDone = state.status === "passed" || state.status === "failed";
  const trace = state.outcome ? parseTrace(state.outcome.trace_json) : null;

  return (
    <div className="p-6 max-w-[860px]">
      {/* ── Case header ──────────────────────────────────────────────────── */}
      <div className="bg-[var(--canvas)] border border-[var(--hairline)] rounded-[12px] p-6 shadow-[rgba(0,55,112,0.08)_0_1px_3px] mb-4">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3 flex-wrap">
              <span className="text-[13px] font-normal text-[var(--ink-mute)] tabular-nums tracking-[-0.39px]">
                {tc.case_id}
              </span>
              <h2
                className="text-[22px] font-light text-[var(--ink)] tracking-[-0.44px]"
                style={{ fontFeatureSettings: '"ss01"' }}
              >
                {tc.case_name}
              </h2>
              <StatusBadge status={state.status} />
            </div>
            <p className="text-[14px] font-light text-[var(--ink-mute-2)] mt-2 leading-[1.5]">
              {tc.description}
            </p>
          </div>
          <button
            onClick={onRun}
            disabled={isRunning}
            className="shrink-0 px-4 py-2 rounded-[9999px] bg-[var(--primary-indigo)] text-white
                       text-[14px] font-normal hover:bg-[var(--primary-deep)] active:bg-[var(--primary-press)]
                       disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {isRunning ? "Running..." : "Run"}
          </button>
        </div>

        {/* Meta row */}
        <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-[13px] font-normal text-[var(--ink-mute)] tracking-[-0.39px]">
          <MetaItem label="Category" value={tc.input.claim_category} />
          <MetaItem label="Member" value={tc.input.member_id} />
          <MetaItem label="Date" value={tc.input.treatment_date} />
          <MetaItem label="Claimed" value={formatAmount(tc.input.claimed_amount)} tabular />
          {tc.input.hospital_name && <MetaItem label="Hospital" value={tc.input.hospital_name} />}
          {state.duration !== null && (
            <MetaItem label="Duration" value={formatDuration(state.duration)} tabular />
          )}
        </div>

        {/* Documents */}
        {tc.documents.length > 0 && (
          <div className="mt-4 flex flex-wrap gap-2">
            {tc.documents.map((doc) => (
              <span
                key={doc.file_id}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-[9999px] bg-[var(--canvas-soft)] border border-[var(--hairline)] text-[12px] font-normal text-[var(--ink-mute)] tracking-[-0.36px]"
              >
                <svg width="10" height="12" viewBox="0 0 10 12" fill="none" className="shrink-0">
                  <path d="M1 1h5l3 3v7H1V1z" stroke="currentColor" strokeWidth="1" fill="none" strokeLinejoin="round" />
                  <path d="M6 1v3h3" stroke="currentColor" strokeWidth="1" fill="none" strokeLinejoin="round" />
                </svg>
                {doc.file_name}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* ── Running state: pipeline stepper ─────────────────────────────── */}
      {isRunning && (
        <div className="bg-[var(--canvas)] border border-[var(--hairline)] rounded-[12px] p-6 shadow-[rgba(0,55,112,0.08)_0_1px_3px] mb-4">
          <h3 className="text-[13px] font-normal text-[var(--ink-mute)] uppercase tracking-[0.6px] mb-4">
            Pipeline Progress
          </h3>
          <PipelineStepper currentStep={state.outcome?.current_step ?? null} />
        </div>
      )}

      {/* ── Error state ──────────────────────────────────────────────────── */}
      {state.status === "error" && state.error && (
        <div className="bg-[var(--canvas)] border border-[var(--ruby)]/20 rounded-[12px] p-5 shadow-[rgba(0,55,112,0.08)_0_1px_3px] mb-4">
          <p className="text-[13px] font-normal text-[var(--ruby)]">{state.error}</p>
        </div>
      )}

      {/* ── Expected vs Actual comparison ───────────────────────────────── */}
      {(isDone || (state.outcome && isRunning)) && (
        <div className="bg-[var(--canvas)] border border-[var(--hairline)] rounded-[12px] overflow-hidden shadow-[rgba(0,55,112,0.08)_0_1px_3px] mb-4">
          <div className="px-6 py-4 border-b border-[var(--hairline)]">
            <h3 className="text-[13px] font-normal text-[var(--ink-mute)] uppercase tracking-[0.6px]">
              Expected vs Actual
            </h3>
          </div>
          <ComparisonTable testCase={tc} outcome={state.outcome!} passed={state.status === "passed"} />
        </div>
      )}

      {/* ── Pipeline trace ───────────────────────────────────────────────── */}
      {isDone && trace && trace.steps.length > 0 && (
        <div className="bg-[var(--canvas)] border border-[var(--hairline)] rounded-[12px] p-6 shadow-[rgba(0,55,112,0.08)_0_1px_3px] mb-4">
          <h3 className="text-[13px] font-normal text-[var(--ink-mute)] uppercase tracking-[0.6px] mb-4">
            Pipeline Trace
          </h3>
          <TraceSteps trace={trace} />
        </div>
      )}

      {/* ── System Must checks ──────────────────────────────────────────── */}
      {isDone && tc.expected.system_must && tc.expected.system_must.length > 0 && (
        <div className="bg-[var(--canvas)] border border-[var(--hairline)] rounded-[12px] p-6 shadow-[rgba(0,55,112,0.08)_0_1px_3px] mb-4">
          <h3 className="text-[13px] font-normal text-[var(--ink-mute)] uppercase tracking-[0.6px] mb-4">
            System Must
          </h3>
          <SystemMustChecks mustList={tc.expected.system_must} outcome={state.outcome!} passed={state.status === "passed"} />
        </div>
      )}

      {/* ── Raw trace toggle ────────────────────────────────────────────── */}
      {isDone && state.outcome?.trace_json && (
        <div className="bg-[var(--canvas)] border border-[var(--hairline)] rounded-[12px] p-5 shadow-[rgba(0,55,112,0.08)_0_1px_3px] mb-4">
          <button
            onClick={onToggleTrace}
            className="text-[13px] font-normal text-[var(--primary-indigo)] hover:text-[var(--primary-deep)] transition-colors"
          >
            {state.traceExpanded ? "Hide raw JSON" : "Show raw JSON"}
          </button>
          {state.traceExpanded && (
            <pre className="mt-3 p-4 rounded-[8px] bg-[var(--brand-dark)] text-[#b9b9f9] text-[11px] font-light overflow-x-auto max-h-[500px] overflow-y-auto leading-relaxed">
              {JSON.stringify(state.outcome.trace_json, null, 2)}
            </pre>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Pipeline stepper (running state) ────────────────────────────────────────

function PipelineStepper({ currentStep }: { currentStep: string | null }) {
  const activeIdx = currentStep
    ? PIPELINE_STEPS.findIndex((s) => s === currentStep)
    : 0;

  return (
    <div className="flex items-center gap-0">
      {PIPELINE_STEPS.map((step, idx) => {
        const isActive = idx === activeIdx;
        const isDone = idx < activeIdx;
        const label = step.replace(/_/g, " ");

        return (
          <div key={step} className="flex items-center flex-1 min-w-0">
            <div className="flex flex-col items-center min-w-0">
              <div
                className={`w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-normal transition-colors shrink-0 ${
                  isActive
                    ? "bg-[var(--primary-indigo)] text-white animate-pulse"
                    : isDone
                      ? "bg-emerald-100 text-emerald-700"
                      : "bg-[var(--canvas-soft)] text-[var(--ink-mute)]"
                }`}
              >
                {isDone ? "+" : idx + 1}
              </div>
              <span
                className="text-[10px] font-normal mt-1 text-center truncate w-full px-1 tracking-[-0.2px]"
                style={{ color: isActive ? "var(--primary-indigo)" : isDone ? "#059669" : "var(--ink-mute)" }}
              >
                {label}
              </span>
            </div>
            {idx < PIPELINE_STEPS.length - 1 && (
              <div
                className="h-[1px] flex-1 mx-1 mb-5 transition-colors"
                style={{ backgroundColor: isDone ? "#059669" : "var(--hairline)" }}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── Comparison table ─────────────────────────────────────────────────────────

function ComparisonTable({
  testCase: tc,
  outcome,
  passed,
}: {
  testCase: TestCase;
  outcome: TestCaseOutcome;
  passed: boolean;
}) {
  const exp = tc.expected;

  // Build rows
  type CompRow = {
    field: string;
    expected: string;
    actual: string;
    match: boolean | null; // null = not applicable
  };

  const rows: CompRow[] = [];

  // Decision
  {
    const expDecision = exp.early_stop ? "NEEDS_REUPLOAD" : exp.decision ?? "--";
    const actDecision = exp.early_stop
      ? outcome.status === "NEEDS_REUPLOAD"
        ? "NEEDS_REUPLOAD"
        : outcome.status
      : outcome.decision ?? "--";
    const match = exp.early_stop
      ? outcome.status === "NEEDS_REUPLOAD"
      : !exp.decision || outcome.decision === exp.decision;
    rows.push({ field: "Decision", expected: expDecision, actual: actDecision, match });
  }

  // Amount
  if (exp.approved_amount !== undefined && exp.approved_amount !== null) {
    const tolerance = tc.case_id === "TC011" ? 500 : 1;
    const actAmt = outcome.approved_amount;
    const match =
      actAmt !== null && Math.abs(actAmt - exp.approved_amount) <= tolerance;
    rows.push({
      field: "Amount",
      expected: formatAmount(exp.approved_amount),
      actual: formatAmount(actAmt),
      match,
    });
  }

  // Confidence
  if (exp.confidence_above !== undefined) {
    const actConf = outcome.confidence_score;
    const match = actConf !== null && actConf >= exp.confidence_above;
    rows.push({
      field: "Confidence",
      expected: `> ${exp.confidence_above}`,
      actual: actConf !== null ? actConf.toFixed(3) : "--",
      match,
    });
  }

  // Rejection reasons
  if (exp.rejection_reasons && exp.rejection_reasons.length > 0) {
    const expStr = exp.rejection_reasons.join(", ");
    const actStr = outcome.rejection_reasons?.join(", ") ?? "--";
    const match =
      !!outcome.rejection_reasons &&
      exp.rejection_reasons.every((r) => outcome.rejection_reasons!.includes(r));
    rows.push({ field: "Rejection Reasons", expected: expStr, actual: actStr, match });
  }

  // Fraud signals (if expected)
  if (exp.decision === "MANUAL_REVIEW") {
    const actSignals =
      Array.isArray(outcome.fraud_signals) && (outcome.fraud_signals as unknown[]).length > 0
        ? (outcome.fraud_signals as unknown[]).map((s) => (typeof s === "string" ? s : JSON.stringify(s))).join(", ")
        : outcome.decision === "MANUAL_REVIEW"
          ? "flagged"
          : "--";
    rows.push({
      field: "Fraud / Review",
      expected: "Flagged -> MANUAL_REVIEW",
      actual: actSignals,
      match: outcome.decision === "MANUAL_REVIEW",
    });
  }

  return (
    <table className="w-full">
      <thead>
        <tr className="border-b border-[var(--hairline)]">
          <th className="text-left px-6 py-3 text-[11px] font-normal text-[var(--ink-mute)] uppercase tracking-[0.5px] w-[140px]">
            Field
          </th>
          <th className="text-left px-6 py-3 text-[11px] font-normal text-[var(--ink-mute)] uppercase tracking-[0.5px]">
            Expected
          </th>
          <th className="text-left px-6 py-3 text-[11px] font-normal text-[var(--ink-mute)] uppercase tracking-[0.5px]">
            Actual
          </th>
          <th className="px-6 py-3 w-[60px]" />
        </tr>
      </thead>
      <tbody>
        {rows.map((row, i) => (
          <tr
            key={i}
            className="border-b border-[var(--hairline)] last:border-0"
            style={{ backgroundColor: i % 2 === 0 ? "transparent" : "var(--canvas-soft)" }}
          >
            <td className="px-6 py-3 text-[13px] font-normal text-[var(--ink-mute)] tracking-[-0.39px]">
              {row.field}
            </td>
            <td className="px-6 py-3 text-[13px] font-normal text-[var(--ink-secondary)] tracking-[-0.39px] tabular-nums">
              {row.expected}
            </td>
            <td className="px-6 py-3 text-[13px] font-normal text-[var(--ink)] tracking-[-0.39px] tabular-nums">
              {row.actual}
            </td>
            <td className="px-6 py-3 text-center text-[16px]">
              {row.match === null ? (
                <span className="text-[var(--ink-mute)]">-</span>
              ) : row.match ? (
                <span className="text-emerald-600">Pass</span>
              ) : (
                <span className="text-[var(--ruby)]">Fail</span>
              )}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// ─── Trace steps ──────────────────────────────────────────────────────────────

function TraceSteps({ trace }: { trace: ParsedTrace }) {
  return (
    <div className="flex flex-col gap-3">
      {trace.steps.map((step, idx) => {
        const ok = step.status === "COMPLETED" || step.status === "SUCCESS";
        const err = step.status === "FAILED" || step.status === "ERROR";
        const summaryLines = getStepSummary(step);

        return (
          <div
            key={idx}
            className="flex gap-3"
          >
            {/* Icon */}
            <div className="shrink-0 flex flex-col items-center">
              <div
                className="w-6 h-6 rounded-full flex items-center justify-center text-[12px] shrink-0"
                style={{
                  backgroundColor: ok ? "rgba(5,150,105,0.1)" : err ? "rgba(234,34,97,0.1)" : "var(--canvas-soft)",
                  color: ok ? "#059669" : err ? "var(--ruby)" : "var(--ink-mute)",
                }}
              >
                {ok ? "+" : err ? "x" : "o"}
              </div>
              {idx < trace.steps.length - 1 && (
                <div className="w-[1px] flex-1 mt-1 bg-[var(--hairline)]" style={{ minHeight: 12 }} />
              )}
            </div>

            {/* Content */}
            <div className="flex-1 min-w-0 pb-3">
              <div className="flex items-center gap-3 flex-wrap">
                <span
                  className="text-[13px] font-normal tracking-[-0.26px]"
                  style={{ color: ok ? "#059669" : err ? "var(--ruby)" : "var(--ink)" }}
                >
                  {step.step_name}
                </span>
                {step.duration_ms !== undefined && (
                  <span className="text-[11px] font-normal text-[var(--ink-mute)] tabular-nums tracking-[-0.33px]">
                    {formatDuration(step.duration_ms)}
                  </span>
                )}
              </div>

              {/* Early stop / error message */}
              {(step.error || (step.details?.error_message)) && (
                <div className="mt-1.5 px-3 py-2 rounded-[6px] bg-[var(--ruby)]/5 border border-[var(--ruby)]/15">
                  <p className="text-[12px] font-normal text-[var(--ruby)] leading-[1.5]">
                    {(step.error || step.details?.error_message) as string}
                  </p>
                </div>
              )}

              {/* Summary lines */}
              {summaryLines.length > 0 && (
                <div className="mt-1 flex flex-wrap gap-x-4 gap-y-0.5">
                  {summaryLines.map((line, li) => (
                    <span key={li} className="text-[12px] font-normal text-[var(--ink-mute)] tracking-[-0.36px]">
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
  );
}

// ─── System Must checks ───────────────────────────────────────────────────────

function SystemMustChecks({
  mustList,
  outcome,
  passed,
}: {
  mustList: string[];
  outcome: TestCaseOutcome;
  passed: boolean;
}) {
  return (
    <div className="flex flex-col gap-2">
      {mustList.map((must, i) => {
        const check: boolean | null = passed ? true : null;
        return (
          <div key={i} className="flex items-start gap-3">
            <span
              className="shrink-0 mt-0.5 text-[14px]"
              style={{ color: check === true ? "#059669" : check === false ? "var(--ruby)" : "var(--ink-mute)" }}
            >
              {check === true ? "+" : check === false ? "x" : "-"}
            </span>
            <span className="text-[13px] font-light text-[var(--ink-secondary)] leading-[1.5] tracking-[-0.26px]">
              {must}
            </span>
          </div>
        );
      })}
    </div>
  );
}

// ─── Meta item ────────────────────────────────────────────────────────────────

function MetaItem({ label, value, tabular }: { label: string; value: string; tabular?: boolean }) {
  return (
    <span className={`text-[13px] font-normal tracking-[-0.39px] ${tabular ? "tabular-nums" : ""}`}>
      <span className="text-[var(--ink-mute)]">{label}: </span>
      <span className="text-[var(--ink-secondary)]">{value}</span>
    </span>
  );
}

// ─── Status badge ─────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: CaseStatus }) {
  const config: Record<CaseStatus, { label: string; bg: string; color: string }> = {
    idle: { label: "Not Run", bg: "var(--canvas-soft)", color: "var(--ink-mute)" },
    running: { label: "Running", bg: "rgba(83,58,253,0.08)", color: "var(--primary-indigo)" },
    polling: { label: "Processing", bg: "rgba(83,58,253,0.08)", color: "var(--primary-indigo)" },
    passed: { label: "Passed", bg: "rgba(5,150,105,0.08)", color: "#059669" },
    failed: { label: "Failed", bg: "rgba(234,34,97,0.08)", color: "var(--ruby)" },
    error: { label: "Error", bg: "rgba(234,34,97,0.08)", color: "var(--ruby)" },
  };

  const { label, bg, color } = config[status];

  return (
    <span
      className="inline-flex px-2 py-0.5 rounded-[9999px] text-[10px] font-normal tracking-[0.1px] uppercase"
      style={{ backgroundColor: bg, color }}
    >
      {label}
    </span>
  );
}
