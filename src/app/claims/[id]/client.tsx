"use client";

import { useState, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Processing Progress</CardTitle>
          </CardHeader>
          <CardContent>
            <ClaimProgress
              claimId={claimId}
              initialStatus={initialStatus}
              initialStep={initialStep}
              onDecision={handleDecision}
              onError={handleError}
            />
          </CardContent>
        </Card>
      )}

      {/* Live Decision received */}
      {decision && (
        <Card
          className={`border-2 ${
            decision.decision === "APPROVED"
              ? "border-green-200 bg-green-50"
              : decision.decision === "PARTIAL"
                ? "border-amber-200 bg-amber-50"
                : decision.decision === "REJECTED"
                  ? "border-red-200 bg-red-50"
                  : "border-purple-200 bg-purple-50"
          }`}
        >
          <CardHeader>
            <CardTitle>Decision: {decision.decision}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {decision.approved_amount && (
              <p className="text-lg font-bold text-green-700">
                Approved:{" "}
                {new Intl.NumberFormat("en-IN", {
                  style: "currency",
                  currency: "INR",
                  maximumFractionDigits: 0,
                }).format(decision.approved_amount)}
              </p>
            )}
            {decision.confidence_score && (
              <p className="text-sm text-gray-600">
                Confidence: {(decision.confidence_score * 100).toFixed(0)}%
              </p>
            )}
            <p className="text-sm text-gray-600">
              Refresh the page to see the full trace and breakdown.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Live Error received */}
      {error && (
        <Card className="border-2 border-red-200 bg-red-50">
          <CardHeader>
            <CardTitle className="text-red-800">
              {error.error_code === "NEEDS_REUPLOAD"
                ? "Action Required"
                : "Error"}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-red-700">{error.message}</p>
          </CardContent>
        </Card>
      )}

      {/* Trace Viewer (for terminal states with trace data) */}
      {isTerminal && traceJson && (
        <div>
          <button
            onClick={() => setShowTrace(!showTrace)}
            className="flex items-center gap-2 text-sm font-medium text-blue-600 hover:text-blue-800"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className={`h-4 w-4 transition-transform ${
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
