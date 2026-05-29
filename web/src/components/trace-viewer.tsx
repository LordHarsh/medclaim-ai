"use client";

import { useState } from "react";

interface TraceStep {
  step_name: string;
  step_order: number;
  status: string;
  duration_ms: number;
  summary: string;
  details: Record<string, unknown>;
  confidence_contribution: number;
}

interface TraceData {
  pipeline_version?: string;
  total_duration_ms?: number;
  degraded?: boolean;
  degradation_notes?: string[];
  steps?: TraceStep[];
  final_decision?: {
    decision: string;
    approved_amount: number;
    confidence_score: number;
    calculation_breakdown?: Record<string, unknown>;
    user_message?: string;
    ops_summary?: string;
  };
}

interface TraceViewerProps {
  trace: TraceData | null;
}

export function TraceViewer({ trace }: TraceViewerProps) {
  const [expandedSteps, setExpandedSteps] = useState<Set<number>>(new Set());

  if (!trace || !trace.steps || trace.steps.length === 0) {
    return (
      <div className="bg-[var(--canvas)] rounded-xl border border-[var(--hairline)] shadow-level-1 p-8 text-center">
        <p className="body-md text-[var(--ink-mute)]">
          Trace data not yet available. Processing may still be in progress.
        </p>
      </div>
    );
  }

  const toggleStep = (index: number) => {
    setExpandedSteps((prev) => {
      const next = new Set(prev);
      if (next.has(index)) {
        next.delete(index);
      } else {
        next.add(index);
      }
      return next;
    });
  };

  return (
    <div className="space-y-3">
      {/* Summary header */}
      <div className="bg-[var(--canvas)] rounded-xl border border-[var(--hairline)] shadow-level-1 px-5 py-4">
        <div className="flex items-center justify-between">
          <h3 className="heading-sm text-[var(--ink)]">Pipeline Trace</h3>
          <div className="flex items-center gap-3">
            {trace.degraded && (
              <span className="pill-tag bg-amber-50 text-amber-700 border border-amber-200">
                Degraded
              </span>
            )}
            {trace.total_duration_ms && (
              <span className="caption text-[var(--ink-mute)] tabular-nums">
                {(trace.total_duration_ms / 1000).toFixed(1)}s total
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Steps accordion */}
      {trace.steps.map((step, index) => (
        <div
          key={index}
          className="bg-[var(--canvas)] rounded-xl border border-[var(--hairline)] shadow-level-1 overflow-hidden"
        >
          <button
            onClick={() => toggleStep(index)}
            className="flex w-full items-center justify-between px-5 py-4 text-left hover:bg-[var(--canvas-soft)] transition-colors"
          >
            <div className="flex items-center gap-3">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[var(--canvas-soft)] border border-[var(--hairline)] caption text-[var(--ink-mute)]">
                {step.step_order}
              </span>
              <div>
                <p className="body-md text-[var(--ink)]">
                  {step.step_name.replace(/_/g, " ")}
                </p>
                <p className="micro text-[var(--ink-mute)]">{step.summary}</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <span
                className={`pill-tag ${
                  step.status === "COMPLETED"
                    ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                    : step.status === "DEGRADED"
                      ? "bg-amber-50 text-amber-700 border border-amber-200"
                      : "bg-red-50 text-red-700 border border-red-200"
                }`}
              >
                {step.status}
              </span>
              <span className="caption text-[var(--ink-mute)] tabular-nums">
                {step.duration_ms}ms
              </span>
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className={`h-4 w-4 text-[var(--ink-mute)] transition-transform duration-200 ${
                  expandedSteps.has(index) ? "rotate-180" : ""
                }`}
              >
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </div>
          </button>

          {expandedSteps.has(index) && (
            <div className="border-t border-[var(--hairline)] bg-[var(--canvas-soft)] p-5">
              <pre className="overflow-x-auto whitespace-pre-wrap rounded-lg bg-[var(--canvas)] border border-[var(--hairline)] p-4 micro font-mono text-[var(--ink-mute)] leading-relaxed">
                {JSON.stringify(step.details, null, 2)}
              </pre>
            </div>
          )}
        </div>
      ))}

      {/* Final Decision */}
      {trace.final_decision && (
        <div className="bg-[var(--canvas)] rounded-xl border border-[var(--hairline)] shadow-level-1 overflow-hidden">
          <div className="px-5 py-4 border-b border-[var(--hairline)]">
            <h3 className="heading-sm text-[var(--ink)]">Calculation Breakdown</h3>
          </div>
          <div className="p-5">
            {trace.final_decision.user_message && (
              <p className="body-md text-[var(--ink-mute)] mb-4">
                {trace.final_decision.user_message}
              </p>
            )}
            {trace.final_decision.calculation_breakdown && (
              <pre className="overflow-x-auto whitespace-pre-wrap rounded-lg bg-[var(--canvas-soft)] border border-[var(--hairline)] p-4 micro font-mono text-[var(--ink-mute)] leading-relaxed">
                {JSON.stringify(trace.final_decision.calculation_breakdown, null, 2)}
              </pre>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
