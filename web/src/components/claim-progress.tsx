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
        <div className="flex items-center gap-2">
          <div
            className={`h-2 w-2 rounded-full ${
              connected
                ? "bg-[var(--primary-indigo)] animate-pulse"
                : "bg-[var(--ink-mute)]"
            }`}
          />
          <span className="caption text-[var(--ink-mute)]">
            {connected ? "Live tracking active" : "Connecting..."}
          </span>
        </div>
      )}

      {/* Vertical stepper */}
      <div className="space-y-0">
        {STEP_ORDER.slice(0, -1).map((step, index) => {
          const isComplete = index < currentStepIndex;
          const isCurrent = index === currentStepIndex;
          const isPending = index > currentStepIndex;
          const stepMessage = steps.find((s) => s.step === step)?.message;

          return (
            <div key={step} className="flex items-start gap-4">
              {/* Step indicator with connecting line */}
              <div className="flex flex-col items-center">
                <div
                  className={`flex h-7 w-7 items-center justify-center rounded-full border-2 transition-all duration-300 ${
                    isComplete
                      ? "border-[var(--primary-indigo)] bg-[var(--primary-indigo)]"
                      : isCurrent
                        ? "border-[var(--primary-indigo)] bg-[var(--canvas)]"
                        : "border-[var(--hairline)] bg-[var(--canvas)]"
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
                      className="h-3.5 w-3.5 text-white"
                    >
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  ) : isCurrent ? (
                    <div className="h-2.5 w-2.5 rounded-full bg-[var(--primary-indigo)] animate-pulse" />
                  ) : (
                    <div className="h-2 w-2 rounded-full bg-[var(--hairline)]" />
                  )}
                </div>
                {index < STEP_ORDER.length - 2 && (
                  <div
                    className={`w-0.5 h-8 transition-colors duration-300 ${
                      isComplete
                        ? "bg-[var(--primary-indigo)]"
                        : "bg-[var(--hairline)]"
                    }`}
                  />
                )}
              </div>

              {/* Step content */}
              <div className="flex-1 pb-4 -mt-0.5">
                <p
                  className={`body-md transition-colors ${
                    isComplete
                      ? "text-[var(--primary-indigo)]"
                      : isCurrent
                        ? "text-[var(--ink)]"
                        : "text-[var(--ink-mute)]"
                  }`}
                >
                  {STEP_LABELS[step] || step}
                </p>
                {(isCurrent || isComplete) && stepMessage && (
                  <p className="mt-0.5 micro text-[var(--ink-mute)]">
                    {stepMessage}
                  </p>
                )}
                {isCurrent && !isPending && (
                  <p className="mt-0.5 micro text-[var(--primary-indigo)] animate-pulse">
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
