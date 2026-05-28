"use client";

import { useState, useEffect, useRef } from "react";

interface StepUpdate {
  step: string;
  status: string;
  message: string;
}

interface DecisionData {
  decision: string;
  approved_amount: number | null;
  confidence_score: number | null;
}

interface ErrorData {
  error_code: string;
  message: string;
}

const STEP_ORDER = [
  "SUBMITTED",
  "QUEUED",
  "DOCUMENT_VERIFICATION",
  "DOCUMENT_EXTRACTION",
  "POLICY_ENGINE",
  "FRAUD_DETECTION",
  "FINAL_DECISION",
  "COMPLETED",
];

const STEP_LABELS: Record<string, string> = {
  SUBMITTED: "Claim Submitted",
  QUEUED: "Queued for Processing",
  DOCUMENT_VERIFICATION: "Document Verification",
  DOCUMENT_EXTRACTION: "Data Extraction",
  POLICY_ENGINE: "Policy Evaluation",
  FRAUD_DETECTION: "Fraud Detection",
  FINAL_DECISION: "Final Decision",
  COMPLETED: "Complete",
};

interface ClaimProgressProps {
  claimId: string;
  initialStatus: string;
  initialStep: string;
  onDecision?: (data: DecisionData) => void;
  onError?: (data: ErrorData) => void;
}

export function ClaimProgress({
  claimId,
  initialStatus,
  initialStep,
  onDecision,
  onError,
}: ClaimProgressProps) {
  const [steps, setSteps] = useState<StepUpdate[]>([]);
  const [currentStep, setCurrentStep] = useState(initialStep);
  const [status, setStatus] = useState(initialStatus);
  const [connected, setConnected] = useState(false);
  const eventSourceRef = useRef<EventSource | null>(null);

  useEffect(() => {
    // Don't connect if already in a terminal state
    if (["COMPLETED", "FAILED", "NEEDS_REUPLOAD"].includes(initialStatus)) {
      return;
    }

    const es = new EventSource(`/api/claims/${claimId}/stream`);
    eventSourceRef.current = es;

    es.onopen = () => {
      setConnected(true);
    };

    es.addEventListener("step_update", ((event: MessageEvent) => {
      const data: StepUpdate = JSON.parse(event.data);
      setSteps((prev) => [...prev, data]);
      setCurrentStep(data.step);
      setStatus(data.status);
    }) as EventListener);

    es.addEventListener("decision", ((event: MessageEvent) => {
      const data: DecisionData = JSON.parse(event.data);
      setStatus("COMPLETED");
      setCurrentStep("COMPLETED");
      onDecision?.(data);
    }) as EventListener);

    es.addEventListener("error", ((event: MessageEvent) => {
      if (!event.data) return; // Connection error, not a data event
      const data: ErrorData = JSON.parse(event.data);
      setStatus(data.error_code);
      onError?.(data);
    }) as EventListener);

    es.addEventListener("done", () => {
      es.close();
      setConnected(false);
    });

    es.onerror = () => {
      setConnected(false);
      // Fallback: will retry automatically or page can refresh
    };

    return () => {
      es.close();
    };
  }, [claimId, initialStatus, onDecision, onError]);

  const currentStepIndex = STEP_ORDER.indexOf(currentStep);

  return (
    <div className="space-y-6">
      {/* Connection indicator */}
      {!["COMPLETED", "FAILED", "NEEDS_REUPLOAD"].includes(status) && (
        <div className="flex items-center gap-2 text-sm">
          <div
            className={`h-2 w-2 rounded-full ${
              connected ? "bg-green-500 animate-pulse" : "bg-gray-400"
            }`}
          />
          <span className="text-gray-600">
            {connected ? "Live tracking active" : "Connecting..."}
          </span>
        </div>
      )}

      {/* Progress steps */}
      <div className="space-y-3">
        {STEP_ORDER.slice(0, -1).map((step, index) => {
          const isComplete = index < currentStepIndex;
          const isCurrent = index === currentStepIndex;
          const isPending = index > currentStepIndex;
          const stepMessage = steps.find((s) => s.step === step)?.message;

          return (
            <div key={step} className="flex items-start gap-3">
              {/* Step indicator */}
              <div className="flex flex-col items-center">
                <div
                  className={`flex h-8 w-8 items-center justify-center rounded-full border-2 ${
                    isComplete
                      ? "border-green-500 bg-green-500"
                      : isCurrent
                        ? "border-blue-500 bg-blue-50"
                        : "border-gray-200 bg-white"
                  }`}
                >
                  {isComplete ? (
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="3"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="h-4 w-4 text-white"
                    >
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  ) : isCurrent ? (
                    <div className="h-3 w-3 animate-pulse rounded-full bg-blue-500" />
                  ) : (
                    <div className="h-3 w-3 rounded-full bg-gray-200" />
                  )}
                </div>
                {index < STEP_ORDER.length - 2 && (
                  <div
                    className={`h-6 w-0.5 ${
                      isComplete ? "bg-green-500" : "bg-gray-200"
                    }`}
                  />
                )}
              </div>

              {/* Step content */}
              <div className="flex-1 pb-2">
                <p
                  className={`text-sm font-medium ${
                    isComplete
                      ? "text-green-700"
                      : isCurrent
                        ? "text-blue-700"
                        : "text-gray-400"
                  }`}
                >
                  {STEP_LABELS[step] || step}
                </p>
                {(isCurrent || isComplete) && stepMessage && (
                  <p className="mt-0.5 text-xs text-gray-500">{stepMessage}</p>
                )}
                {isCurrent && !isPending && (
                  <p className="mt-0.5 text-xs text-blue-600 animate-pulse">
                    In progress...
                  </p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
