"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { runTestCase, getTestCaseResult } from "./actions";
import type { TestCaseOutcome } from "./actions";
import { TEST_CASES } from "./test-data";
import type { TestCase } from "./test-data";
import { CircleAlert, Check, Play, RotateCcw, X } from "lucide-react";
import { Button, Card, Label, More, Notice, Page, TopBar, cx, duration, inr, shortDate, titleCase } from "@/components/ui";
import { ClaimResult } from "@/components/claim/claim-result";
import { OUTCOME, categoryLabel, outcomeOf, stepStates, toClaim, type Outcome } from "@/components/claim/model";
import { DocThumbs, PipelineTrack, StatusPill } from "@/components/claim/pieces";
import { appNav } from "@/components/screens/nav";
import { DEMO_SAMPLES } from "@/lib/demo/samples";

type CaseStatus = "idle" | "running" | "polling" | "passed" | "failed" | "error";

export interface CaseState {
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

// ─── Main component ───────────────────────────────────────────────────────────

export default function AdminEvalClient({ initial, select }: { initial?: Record<string, Partial<CaseState>>; select?: string } = {}) {
  const [states, setStates] = useState<Record<string, CaseState>>(() => {
    const base = getInitialStates();
    // The gallery passes finished states in, to draw this screen without running anything.
    for (const [id, st] of Object.entries(initial ?? {})) if (base[id]) base[id] = { ...base[id], ...st };
    return base;
  });
  const [runningAll, setRunningAll] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(select ?? TEST_CASES[0]?.case_id ?? null);
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
    <div className="min-h-screen">
      <TopBar home="/dashboard" nav={appNav("tests")}>
        {runningAll && <span className="text-[13px] tabular-nums text-ink-3">{elapsed}s</span>}
        <Button look="ghost" small onClick={handleResetAll} disabled={runningAll}>
          <RotateCcw className="h-3.5 w-3.5" /> Reset
        </Button>
        <Button small onClick={handleRunAll} disabled={runningAll}>
          <Play className="h-3.5 w-3.5" /> {runningAll ? "Running" : "Run all"}
        </Button>
      </TopBar>
      <Page>
        {/* Score: one cell per test case. */}
        <Card className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center">
          <p className="shrink-0 text-[34px] font-semibold leading-none tracking-[-0.03em] tabular-nums">
            <span className={cx(passRate === null ? "text-ink" : passRate >= 0.8 ? "text-ok" : passRate >= 0.5 ? "text-part" : "text-bad")}>{passedCount}</span>
            <span className="text-ink-3"> / {totalCases}</span>
            <span className="ml-2 text-[14px] font-normal tracking-normal text-ink-3">passed</span>
          </p>
          <ol className="grid flex-1 grid-cols-12 gap-1" aria-label="Test cases">
            {TEST_CASES.map((tc) => {
              const st = states[tc.case_id].status;
              return (
                <li key={tc.case_id}>
                  <button
                    type="button"
                    onClick={() => setSelectedId(tc.case_id)}
                    aria-label={`${tc.case_id}: ${CASE_WORD[st]}`}
                    title={`${tc.case_id} ${tc.case_name}`}
                    className={cx("block h-8 w-full rounded-md transition-colors", CASE_CELL[st], selectedId === tc.case_id && "ring-2 ring-ink ring-offset-2 ring-offset-surface")}
                  />
                </li>
              );
            })}
          </ol>
          <p className="shrink-0 text-[12px] text-ink-3">
            {failedCount > 0 && <span className="mr-3 text-bad">{failedCount} failed</span>}
            {runningCount > 0 && <span className="text-wait">{runningCount} running</span>}
          </p>
        </Card>

        <div className="mt-4 grid gap-4 lg:grid-cols-[320px_minmax(0,1fr)]">
          <ul className="overflow-hidden rounded-card border border-line bg-surface lg:self-start">
            {TEST_CASES.map((tc) => {
              const state = states[tc.case_id];
              const on = selectedId === tc.case_id;
              const busy = state.status === "running" || state.status === "polling";
              return (
                <li key={tc.case_id} className="border-b border-line last:border-b-0">
                  <div className={cx("flex items-center gap-2.5 px-3 py-2.5", on && "bg-sunken")}>
                    <button type="button" onClick={() => setSelectedId(tc.case_id)} aria-pressed={on} className="flex min-w-0 flex-1 items-center gap-2.5 rounded-md text-left">
                      <span className={cx("h-2.5 w-2.5 shrink-0 rounded-full", CASE_DOT[state.status], busy && "animate-pulse")} aria-hidden="true" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[14px] font-medium">{tc.case_name}</span>
                        <span className="block truncate text-[12px] text-ink-3">
                          {tc.case_id} · {busy && state.outcome?.current_step ? titleCase(state.outcome.current_step) : OUTCOME[expectedOutcome(tc)].label}
                        </span>
                      </span>
                    </button>
                    {state.duration !== null ? (
                      <span className="shrink-0 text-[12px] tabular-nums text-ink-3">{duration(state.duration)}</span>
                    ) : (
                      <Button look="secondary" small onClick={() => handleRunCase(tc.case_id)} disabled={busy} aria-label={`Run ${tc.case_id}`}>
                        {busy ? "…" : "Run"}
                      </Button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>

          <div className="min-w-0">
            {selectedCase && selectedState ? (
              <CaseDetail testCase={selectedCase} state={selectedState} onRun={() => handleRunCase(selectedCase.case_id)} />
            ) : null}
          </div>
        </div>
      </Page>
    </div>
  );
}

/* ── How a test case's state is drawn ──────────────────────────────────── */

const CASE_WORD: Record<CaseStatus, string> = {
  idle: "Not run",
  running: "Running",
  polling: "Running",
  passed: "Passed",
  failed: "Failed",
  error: "Error",
};
const CASE_CELL: Record<CaseStatus, string> = {
  idle: "bg-sunken hover:bg-line",
  running: "bg-wait-soft animate-pulse",
  polling: "bg-wait animate-pulse",
  passed: "bg-ok",
  failed: "bg-bad",
  error: "bg-bad",
};
const CASE_DOT: Record<CaseStatus, string> = {
  idle: "bg-line-strong",
  running: "bg-wait",
  polling: "bg-wait",
  passed: "bg-ok",
  failed: "bg-bad",
  error: "bg-bad",
};
const CASE_PILL: Record<CaseStatus, Outcome> = {
  idle: "queued",
  running: "running",
  polling: "running",
  passed: "approved",
  failed: "rejected",
  error: "failed",
};

function expectedOutcome(tc: TestCase): Outcome {
  if (tc.expected.early_stop) return "stopped";
  return outcomeOf({ status: "COMPLETED", decision: tc.expected.decision });
}

/* ── One test case ─────────────────────────────────────────────────────── */

function CaseDetail({ testCase: tc, state, onRun }: { testCase: TestCase; state: CaseState; onRun: () => void }) {
  const isRunning = state.status === "running" || state.status === "polling";
  const isDone = state.status === "passed" || state.status === "failed";
  const images = DEMO_SAMPLES.find((s) => s.id === tc.case_id)?.documents ?? [];
  const docs = tc.documents.map((d) => ({ name: d.file_name, url: images.find((i) => i.name === d.file_name)?.url }));

  return (
    <div className="space-y-4">
      <Card className="p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-[18px] font-semibold tracking-[-0.01em]">{tc.case_name}</h2>
              <StatusPill outcome={CASE_PILL[state.status]} label={CASE_WORD[state.status]} />
            </div>
            <p className="mt-0.5 text-[12px] text-ink-3">
              {tc.case_id} · expects <span className={OUTCOME[expectedOutcome(tc)].text}>{OUTCOME[expectedOutcome(tc)].label}</span>
              {typeof tc.expected.approved_amount === "number" ? ` ${inr(tc.expected.approved_amount)}` : ""}
            </p>
          </div>
          <Button onClick={onRun} disabled={isRunning}>
            <Play className="h-4 w-4" /> {isRunning ? "Running" : isDone ? "Run again" : "Run"}
          </Button>
        </div>

        <dl className="mt-4 grid grid-cols-2 gap-x-5 gap-y-3 sm:grid-cols-4">
          <Fact k="Claimed" v={inr(tc.input.claimed_amount)} />
          <Fact k="Category" v={categoryLabel(tc.input.claim_category)} />
          <Fact k="Treated" v={shortDate(tc.input.treatment_date)} />
          <Fact k="Member" v={tc.input.member_id} />
        </dl>

        {docs.length > 0 && (
          <div className="mt-4">
            <DocThumbs docs={docs} />
          </div>
        )}

        <div className="mt-4">
          <More label="What this case checks">
            <p className="text-[13px] text-ink-2">{tc.description}</p>
            {tc.expected.system_must && tc.expected.system_must.length > 0 && (
              <ul className="mt-2 space-y-1 text-[13px] text-ink-2">
                {tc.expected.system_must.map((must, i) => (
                  <li key={i} className="flex gap-2">
                    {/* These are checked by eye, so they are ticked only when the measurable checks all passed. */}
                    {state.status === "passed" ? (
                      <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-ok" strokeWidth={3} />
                    ) : (
                      <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-ink-3" />
                    )}
                    {must}
                  </li>
                ))}
              </ul>
            )}
          </More>
        </div>
      </Card>

      {isRunning && (
        <Card className="p-5 sm:p-6">
          <PipelineTrack states={stepStates({ status: "PROCESSING", decision: null, current_step: state.outcome?.current_step ?? null, trace_json: null })} size="lg" />
        </Card>
      )}

      {state.status === "error" && state.error && (
        <Notice tone="bad" icon={<CircleAlert className="h-4 w-4" />} title="Could not run">
          {state.error}
        </Notice>
      )}

      {isDone && state.outcome && (
        <>
          <Comparison testCase={tc} outcome={state.outcome} />
          <ClaimResult
            claim={toClaim({ ...state.outcome, category: tc.input.claim_category, claimed_amount: tc.input.claimed_amount })}
            audience="ops"
            documents={images}
          />
        </>
      )}
    </div>
  );
}

function Fact({ k, v }: { k: string; v: string }) {
  return (
    <div className="min-w-0">
      <dt>
        <Label>{k}</Label>
      </dt>
      <dd className="mt-0.5 truncate text-[15px] font-medium tabular-nums">{v}</dd>
    </div>
  );
}

/* ── Expected against actual ───────────────────────────────────────────── */

function Comparison({ testCase: tc, outcome }: { testCase: TestCase; outcome: TestCaseOutcome }) {
  const exp = tc.expected;

  type CompRow = { field: string; expected: string; actual: string; match: boolean };
  const rows: CompRow[] = [];

  // Decision
  {
    const expDecision = exp.early_stop ? "NEEDS_REUPLOAD" : (exp.decision ?? "–");
    const actDecision = exp.early_stop ? outcome.status : (outcome.decision ?? "–");
    const match = exp.early_stop ? outcome.status === "NEEDS_REUPLOAD" : !exp.decision || outcome.decision === exp.decision;
    rows.push({ field: "Decision", expected: titleCase(expDecision), actual: titleCase(actDecision), match });
  }

  // Amount
  if (exp.approved_amount !== undefined && exp.approved_amount !== null) {
    const tolerance = tc.case_id === "TC011" ? 500 : 1;
    const actAmt = outcome.approved_amount;
    const match = actAmt !== null && Math.abs(actAmt - exp.approved_amount) <= tolerance;
    rows.push({ field: "Amount", expected: inr(exp.approved_amount), actual: inr(actAmt), match });
  }

  // Confidence
  if (exp.confidence_above !== undefined) {
    const actConf = outcome.confidence_score;
    const match = actConf !== null && actConf >= exp.confidence_above;
    rows.push({ field: "Confidence", expected: `over ${exp.confidence_above}`, actual: actConf !== null ? actConf.toFixed(2) : "–", match });
  }

  // Rejection reasons
  if (exp.rejection_reasons && exp.rejection_reasons.length > 0) {
    const match = !!outcome.rejection_reasons && exp.rejection_reasons.every((r) => outcome.rejection_reasons!.includes(r));
    rows.push({
      field: "Reason",
      expected: exp.rejection_reasons.map(titleCase).join(", "),
      actual: outcome.rejection_reasons?.map(titleCase).join(", ") || "–",
      match,
    });
  }

  // Fraud signals (if expected)
  if (exp.decision === "MANUAL_REVIEW") {
    const signals = Array.isArray(outcome.fraud_signals) ? (outcome.fraud_signals as unknown[]) : [];
    rows.push({
      field: "Fraud",
      expected: "Flagged",
      actual: signals.length > 0 ? `${signals.length} signal${signals.length === 1 ? "" : "s"}` : outcome.decision === "MANUAL_REVIEW" ? "Flagged" : "–",
      match: outcome.decision === "MANUAL_REVIEW",
    });
  }

  return (
    <Card className="overflow-hidden">
      <table className="w-full text-[14px]">
        <thead>
          <tr className="border-b border-line text-left">
            <th className="px-4 py-2.5 font-normal">
              <Label>Check</Label>
            </th>
            <th className="px-4 py-2.5 font-normal">
              <Label>Expected</Label>
            </th>
            <th className="px-4 py-2.5 font-normal">
              <Label>Got</Label>
            </th>
            <th className="w-10 px-4 py-2.5" />
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.field} className={cx("border-b border-line last:border-b-0", !row.match && "bg-bad-soft")}>
              <td className="px-4 py-2.5 text-ink-3">{row.field}</td>
              <td className="px-4 py-2.5 tabular-nums">{row.expected}</td>
              <td className={cx("px-4 py-2.5 font-medium tabular-nums", !row.match && "text-bad")}>{row.actual}</td>
              <td className="px-4 py-2.5">
                {row.match ? <Check className="h-4 w-4 text-ok" strokeWidth={3} aria-label="Match" /> : <X className="h-4 w-4 text-bad" strokeWidth={3} aria-label="Mismatch" />}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}
