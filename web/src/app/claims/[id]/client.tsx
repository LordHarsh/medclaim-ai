"use client";

import { useState, useCallback } from "react";
import { ClaimProgress } from "@/components/claim-progress";
import { TraceViewer } from "@/components/trace-viewer";

interface DecisionData {
  decision: string;
  approved_amount: number | null;
  confidence_score: number | null;
}

interface ErrorData {
  error_code: string;
  message: string;
}

interface ClaimDetailClientProps {
  claimId: string;
  initialStatus: string;
  initialStep: string;
  traceJson: Record<string, unknown> | null;
  isTerminal: boolean;
}

export function ClaimDetailClient({
  claimId,
  initialStatus,
  initialStep,
  traceJson,
  isTerminal,
}: ClaimDetailClientProps) {
  const [decision, setDecision] = useState<DecisionData | null>(null);
  const [error, setError] = useState<ErrorData | null>(null);
  const [showTrace, setShowTrace] = useState(false);

  const handleDecision = useCallback((data: DecisionData) => {
    setDecision(data);
  }, []);

  const handleError = useCallback((data: ErrorData) => {
    setError(data);
  }, []);

  return (
    <div className="space-y-6">
      {/* Live Progress */}
      {!isTerminal && (
        <div className="bg-[var(--canvas)] rounded-xl border border-[var(--hairline)] shadow-level-1 overflow-hidden">
          <div className="px-5 py-4 border-b border-[var(--hairline)]">
            <h3 className="heading-sm text-[var(--ink)]">Processing Progress</h3>
          </div>
          <div className="p-5">
            <ClaimProgress
              claimId={claimId}
              initialStatus={initialStatus}
              initialStep={initialStep}
              onDecision={handleDecision}
              onError={handleError}
            />
          </div>
        </div>
      )}

      {/* Live Decision received */}
      {decision && (
        <div
          className={`rounded-xl border-2 p-6 ${
            decision.decision === "APPROVED"
              ? "border-emerald-200 bg-emerald-50"
              : decision.decision === "PARTIAL"
                ? "border-amber-200 bg-amber-50"
                : decision.decision === "REJECTED"
                  ? "border-red-200 bg-red-50"
                  : "border-purple-200 bg-purple-50"
          }`}
        >
          <h3 className="heading-md text-[var(--ink)] mb-3">
            Decision: {decision.decision}
          </h3>
          <div className="space-y-2">
            {decision.approved_amount && (
              <p className="display-md text-emerald-700 tabular-nums">
                Approved:{" "}
                {new Intl.NumberFormat("en-IN", {
                  style: "currency",
                  currency: "INR",
                  maximumFractionDigits: 0,
                }).format(decision.approved_amount)}
              </p>
            )}
            {decision.confidence_score && (
              <p className="body-md text-[var(--ink-mute)]">
                Confidence: {(decision.confidence_score * 100).toFixed(0)}%
              </p>
            )}
            <p className="body-md text-[var(--ink-mute)] mt-2">
              Refresh the page to see the full trace and breakdown.
            </p>
          </div>
        </div>
      )}

      {/* Live Error received */}
      {error && (
        <div className="rounded-xl border-2 border-red-200 bg-red-50 p-6">
          <h3 className="heading-sm text-red-800 mb-2">
            {error.error_code === "NEEDS_REUPLOAD"
              ? "Action Required"
              : "Error"}
          </h3>
          <p className="body-md text-red-700">{error.message}</p>
        </div>
      )}

      {/* Trace Viewer (for terminal states with trace data) */}
      {isTerminal && traceJson && (
        <div>
          <button
            onClick={() => setShowTrace(!showTrace)}
            className="flex items-center gap-2 body-md text-[var(--primary-indigo)] hover:text-[var(--primary-deep)] transition-colors"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className={`h-4 w-4 transition-transform duration-200 ${
                showTrace ? "rotate-90" : ""
              }`}
            >
              <polyline points="9 18 15 12 9 6" />
            </svg>
            {showTrace ? "Hide" : "Show"} Processing Trace
          </button>

          {showTrace && (
            <div className="mt-4">
              <TraceViewer trace={traceJson as never} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
