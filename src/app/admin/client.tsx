"use client";

import { useState, useCallback, useRef } from "react";
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

  // For early-stop cases (TC001-TC003), check status is NEEDS_REUPLOAD
  if (expected.early_stop) {
    return outcome.status === "NEEDS_REUPLOAD";
  }

  // Check decision matches
  if (expected.decision && outcome.decision !== expected.decision) {
    return false;
  }

  // Check approved amount (with tolerance for TC011)
  if (expected.approved_amount !== undefined && expected.approved_amount !== null) {
    if (outcome.approved_amount === null) return false;
    const tolerance = tc.case_id === "TC011" ? 500 : 1;
    if (Math.abs(outcome.approved_amount - expected.approved_amount) > tolerance) {
      return false;
    }
  }

  // Check rejection reasons
  if (expected.rejection_reasons && expected.rejection_reasons.length > 0) {
    if (!outcome.rejection_reasons) return false;
    for (const reason of expected.rejection_reasons) {
      if (!outcome.rejection_reasons.includes(reason)) return false;
    }
  }

  // Check confidence threshold
  if (expected.confidence_above !== undefined) {
    if (
      outcome.confidence_score === null ||
      outcome.confidence_score < expected.confidence_above
    ) {
      return false;
    }
  }

  // If we get here and the status is COMPLETED or matches expectation, pass
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

export default function AdminEvalClient() {
  const [states, setStates] = useState<Record<string, CaseState>>(getInitialStates);
  const [runningAll, setRunningAll] = useState(false);
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

      // Clear any existing poll
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
    for (const tc of TEST_CASES) {
      await handleRunCase(tc.case_id);
      // Stagger launches by 500ms to avoid overwhelming SQS
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
    setRunningAll(false);
  }, [handleRunCase]);

  const toggleTrace = useCallback((caseId: string) => {
    setStates((prev) => ({
      ...prev,
      [caseId]: {
        ...prev[caseId],
        traceExpanded: !prev[caseId].traceExpanded,
      },
    }));
  }, []);

  // Summary stats
  const totalCases = TEST_CASES.length;
  const passedCount = Object.values(states).filter((s) => s.status === "passed").length;
  const failedCount = Object.values(states).filter((s) => s.status === "failed").length;
  const runningCount = Object.values(states).filter(
    (s) => s.status === "running" || s.status === "polling"
  ).length;

  return (
    <div className="min-h-screen bg-[var(--canvas-soft)]">
      {/* Header */}
      <header className="bg-[var(--canvas)] border-b border-[var(--hairline)]">
        <div className="max-w-[1200px] mx-auto px-6 py-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="font-[var(--font-heading)] text-[32px] font-light tracking-[-0.64px] text-[var(--ink)]">
                Evaluation Suite
              </h1>
              <p className="text-[15px] font-light text-[var(--ink-mute)] mt-1">
                Run test cases through the full claims processing pipeline
              </p>
            </div>
            <button
              onClick={handleRunAll}
              disabled={runningAll}
              className="px-4 py-2 rounded-[9999px] bg-[var(--primary-indigo)] text-white text-[16px] font-normal
                         hover:bg-[var(--primary-deep)] active:bg-[var(--primary-press)]
                         disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {runningAll ? "Running..." : "Run All"}
            </button>
          </div>

          {/* Summary bar */}
          <div className="flex gap-6 mt-4 pt-4 border-t border-[var(--hairline)]">
            <div className="flex items-center gap-2">
              <span className="inline-block w-2 h-2 rounded-full bg-[var(--ink-mute)]" />
              <span className="text-[13px] font-normal text-[var(--ink-mute)] tracking-[-0.39px]">
                Total: {totalCases}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className="inline-block w-2 h-2 rounded-full bg-emerald-500" />
              <span className="text-[13px] font-normal text-[var(--ink-mute)] tabular-nums tracking-[-0.39px]">
                Passed: {passedCount}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className="inline-block w-2 h-2 rounded-full bg-[var(--ruby)]" />
              <span className="text-[13px] font-normal text-[var(--ink-mute)] tabular-nums tracking-[-0.39px]">
                Failed: {failedCount}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className="inline-block w-2 h-2 rounded-full bg-[var(--primary-soft)] animate-pulse" />
              <span className="text-[13px] font-normal text-[var(--ink-mute)] tabular-nums tracking-[-0.39px]">
                Running: {runningCount}
              </span>
            </div>
          </div>
        </div>
      </header>

      {/* Test cases grid */}
      <main className="max-w-[1200px] mx-auto px-6 py-8">
        <div className="flex flex-col gap-4">
          {TEST_CASES.map((tc) => {
            const state = states[tc.case_id];
            return (
              <TestCaseCard
                key={tc.case_id}
                testCase={tc}
                state={state}
                onRun={() => handleRunCase(tc.case_id)}
                onToggleTrace={() => toggleTrace(tc.case_id)}
              />
            );
          })}
        </div>
      </main>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────── */

interface TestCaseCardProps {
  testCase: TestCase;
  state: CaseState;
  onRun: () => void;
  onToggleTrace: () => void;
}

function TestCaseCard({ testCase, state, onRun, onToggleTrace }: TestCaseCardProps) {
  const tc = testCase;
  const isRunning = state.status === "running" || state.status === "polling";

  return (
    <div
      className="bg-[var(--canvas)] border border-[var(--hairline)] rounded-[12px] p-6
                 shadow-[rgba(0,55,112,0.08)_0_1px_3px]"
    >
      {/* Top row: ID, Name, Status, Run Button */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3">
            <span className="text-[13px] font-normal text-[var(--ink-mute)] tracking-[-0.39px] tabular-nums">
              {tc.case_id}
            </span>
            <h3 className="text-[18px] font-light text-[var(--ink)] tracking-[0px] truncate">
              {tc.case_name}
            </h3>
            <StatusBadge status={state.status} />
          </div>
          <p className="text-[14px] font-light text-[var(--ink-mute-2)] mt-1 line-clamp-1">
            {tc.description}
          </p>
        </div>
        <button
          onClick={onRun}
          disabled={isRunning}
          className="shrink-0 px-3 py-1.5 rounded-[9999px] border border-[var(--primary-indigo)] text-[var(--primary-indigo)]
                     text-[14px] font-normal hover:bg-[var(--primary-indigo)] hover:text-white
                     disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          {isRunning ? "Running..." : "Run"}
        </button>
      </div>

      {/* Expected row */}
      <div className="mt-4 flex flex-wrap gap-x-6 gap-y-2 text-[13px] font-normal text-[var(--ink-mute)] tracking-[-0.39px]">
        <span>
          Category: <strong className="text-[var(--ink-secondary)] font-normal">{tc.input.claim_category}</strong>
        </span>
        <span className="tabular-nums">
          Claimed: <strong className="text-[var(--ink-secondary)] font-normal">{formatAmount(tc.input.claimed_amount)}</strong>
        </span>
        <span>
          Expected:{" "}
          <strong className="text-[var(--ink-secondary)] font-normal">
            {tc.expected.early_stop
              ? "NEEDS_REUPLOAD"
              : tc.expected.decision || "--"}
          </strong>
        </span>
        {tc.expected.approved_amount !== undefined && tc.expected.approved_amount !== null && (
          <span className="tabular-nums">
            Exp. Amount: <strong className="text-[var(--ink-secondary)] font-normal">{formatAmount(tc.expected.approved_amount)}</strong>
          </span>
        )}
      </div>

      {/* Result section (when done) */}
      {state.outcome && (state.status === "passed" || state.status === "failed") && (
        <div className="mt-4 pt-4 border-t border-[var(--hairline)]">
          <div className="flex flex-wrap gap-x-6 gap-y-2 text-[13px] font-normal tracking-[-0.39px]">
            <span className="text-[var(--ink-mute)]">
              Status:{" "}
              <strong className="text-[var(--ink)] font-normal">{state.outcome.status}</strong>
            </span>
            <span className="text-[var(--ink-mute)]">
              Decision:{" "}
              <strong className="text-[var(--ink)] font-normal">{state.outcome.decision || "--"}</strong>
            </span>
            <span className="text-[var(--ink-mute)] tabular-nums">
              Amount:{" "}
              <strong className="text-[var(--ink)] font-normal">{formatAmount(state.outcome.approved_amount)}</strong>
            </span>
            <span className="text-[var(--ink-mute)] tabular-nums">
              Confidence:{" "}
              <strong className="text-[var(--ink)] font-normal">
                {state.outcome.confidence_score !== null
                  ? state.outcome.confidence_score.toFixed(3)
                  : "--"}
              </strong>
            </span>
            <span className="text-[var(--ink-mute)] tabular-nums">
              Time: <strong className="text-[var(--ink)] font-normal">{formatDuration(state.duration)}</strong>
            </span>
          </div>

          {/* Error message if present */}
          {state.outcome.error_message && (
            <div className="mt-3 p-3 rounded-[8px] bg-[var(--canvas-soft)] text-[13px] font-light text-[var(--ink-secondary)]">
              <span className="font-normal text-[var(--ink-mute)]">Error: </span>
              {state.outcome.error_message}
            </div>
          )}

          {/* Rejection reasons */}
          {state.outcome.rejection_reasons && state.outcome.rejection_reasons.length > 0 && (
            <div className="mt-2 flex gap-2 flex-wrap">
              {state.outcome.rejection_reasons.map((reason, i) => (
                <span
                  key={i}
                  className="px-2 py-0.5 rounded-[9999px] bg-[var(--ruby)]/10 text-[var(--ruby)] text-[10px] font-normal tracking-[0.1px] uppercase"
                >
                  {reason}
                </span>
              ))}
            </div>
          )}

          {/* Fraud signals */}
          {Array.isArray(state.outcome.fraud_signals) &&
            (state.outcome.fraud_signals as string[]).length > 0 && (
              <div className="mt-2 flex gap-2 flex-wrap">
                <span className="text-[11px] font-light text-[var(--ink-mute)]">Fraud signals:</span>
                {(state.outcome.fraud_signals as string[]).map((signal, i) => (
                  <span
                    key={i}
                    className="px-2 py-0.5 rounded-[9999px] bg-[var(--lemon)]/10 text-[var(--lemon)] text-[10px] font-normal tracking-[0.1px]"
                  >
                    {typeof signal === "string" ? signal : JSON.stringify(signal)}
                  </span>
                ))}
              </div>
            )}

          {/* Trace viewer */}
          <div className="mt-3">
            <button
              onClick={onToggleTrace}
              className="text-[13px] font-normal text-[var(--primary-indigo)] hover:text-[var(--primary-deep)] transition-colors"
            >
              {state.traceExpanded ? "Hide Trace" : "Show Trace"}
            </button>
            {state.traceExpanded && state.outcome.trace_json && (
              <pre className="mt-2 p-4 rounded-[8px] bg-[var(--brand-dark)] text-[var(--on-primary)] text-[11px] font-light overflow-x-auto max-h-[400px] overflow-y-auto leading-relaxed">
                {JSON.stringify(state.outcome.trace_json, null, 2)}
              </pre>
            )}
          </div>
        </div>
      )}

      {/* Error state */}
      {state.status === "error" && state.error && (
        <div className="mt-4 pt-4 border-t border-[var(--hairline)]">
          <p className="text-[13px] font-normal text-[var(--ruby)]">{state.error}</p>
        </div>
      )}

      {/* Polling state */}
      {state.status === "polling" && state.outcome && (
        <div className="mt-4 pt-4 border-t border-[var(--hairline)]">
          <div className="flex items-center gap-2 text-[13px] font-normal text-[var(--ink-mute)]">
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-[var(--primary-soft)] animate-pulse" />
            Processing... Step: {state.outcome.current_step || "QUEUED"}
          </div>
        </div>
      )}
    </div>
  );
}

/* ────────────────────────────────────────────────────────────── */

function StatusBadge({ status }: { status: CaseStatus }) {
  const config: Record<CaseStatus, { label: string; classes: string }> = {
    idle: {
      label: "Not Run",
      classes: "bg-[var(--canvas-soft)] text-[var(--ink-mute)]",
    },
    running: {
      label: "Running",
      classes: "bg-[var(--primary-bg-subdued)] text-[var(--primary-deep)]",
    },
    polling: {
      label: "Processing",
      classes: "bg-[var(--primary-bg-subdued)] text-[var(--primary-deep)]",
    },
    passed: {
      label: "Passed",
      classes: "bg-emerald-50 text-emerald-700",
    },
    failed: {
      label: "Failed",
      classes: "bg-[var(--ruby)]/10 text-[var(--ruby)]",
    },
    error: {
      label: "Error",
      classes: "bg-[var(--ruby)]/10 text-[var(--ruby)]",
    },
  };

  const { label, classes } = config[status];

  return (
    <span
      className={`inline-flex px-2 py-0.5 rounded-[9999px] text-[10px] font-normal tracking-[0.1px] uppercase ${classes}`}
    >
      {label}
    </span>
  );
}
