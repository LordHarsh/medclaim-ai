"use client";

/**
 * A claim that is still being decided. The five-step track fills in from the server's event stream
 * (/api/claims/[id]/stream); when the decision arrives the page reloads its data and shows the result.
 */
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CircleAlert } from "lucide-react";
import { Card, LinkButton, Notice } from "@/components/ui";
import { AGENT_STEPS, stepStates } from "@/components/claim/model";
import { PipelineTrack, StatusPill } from "@/components/claim/pieces";

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

const FINISHED = ["COMPLETED", "FAILED", "NEEDS_REUPLOAD"];

interface ClaimProgressProps {
  claimId: string;
  initialStatus: string;
  initialStep: string;
  onDecision?: (data: DecisionData) => void;
  onError?: (data: ErrorData) => void;
  /** The gallery draws this screen from fixtures and must not open a stream. */
  offline?: boolean;
}

export function ClaimProgress({ claimId, initialStatus, initialStep, onDecision, onError, offline = false }: ClaimProgressProps) {
  const router = useRouter();
  const [message, setMessage] = useState<string | null>(null);
  const [currentStep, setCurrentStep] = useState(initialStep);
  const [status, setStatus] = useState(initialStatus);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<ErrorData | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);

  useEffect(() => {
    // Don't connect if already in a terminal state
    if (offline || FINISHED.includes(initialStatus)) {
      return;
    }

    const es = new EventSource(`/api/claims/${claimId}/stream`);
    eventSourceRef.current = es;

    es.onopen = () => {
      setConnected(true);
    };

    es.addEventListener("step_update", ((event: MessageEvent) => {
      const data: StepUpdate = JSON.parse(event.data);
      setMessage(data.message || null);
      setCurrentStep(data.step);
      setStatus(data.status);
    }) as EventListener);

    es.addEventListener("decision", ((event: MessageEvent) => {
      const data: DecisionData = JSON.parse(event.data);
      setStatus("COMPLETED");
      setCurrentStep("COMPLETED");
      onDecision?.(data);
      // The full result (amounts, rules, trace) is on the claim row now; reload the page's data to show it.
      router.refresh();
    }) as EventListener);

    es.addEventListener("error", ((event: MessageEvent) => {
      if (!event.data) return; // Connection error, not a data event
      const data: ErrorData = JSON.parse(event.data);
      setStatus(data.error_code);
      setError(data);
      onError?.(data);
      router.refresh();
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
  }, [claimId, initialStatus, onDecision, onError, offline, router]);

  const states = stepStates({ status, decision: null, current_step: currentStep, trace_json: null });
  const at = AGENT_STEPS.find((a) => a.step === currentStep);
  const live = !FINISHED.includes(status);

  return (
    <Card className="p-5 sm:p-6">
      <div className="flex items-center justify-between gap-3">
        <StatusPill outcome={live ? (at ? "running" : "queued") : status === "COMPLETED" ? "running" : "failed"} label={live ? (at ? at.name : "Queued") : status === "COMPLETED" ? "Finishing" : undefined} />
        {live && (
          <span className="flex items-center gap-1.5 text-[12px] text-ink-3" role="status">
            <span className={connected || offline ? "h-2 w-2 animate-pulse rounded-full bg-ok" : "h-2 w-2 rounded-full bg-line-strong"} />
            {connected || offline ? "Live" : "Connecting"}
          </span>
        )}
      </div>
      <div className="mt-6">
        <PipelineTrack states={states} size="lg" />
      </div>
      <p className="mt-5 min-h-5 text-center text-[13px] text-ink-3" aria-live="polite">
        {message ?? (live ? "About a minute." : "")}
      </p>
      {error && (
        <div className="mt-4">
          <Notice tone={error.error_code === "NEEDS_REUPLOAD" ? "stop" : "bad"} icon={<CircleAlert className="h-4 w-4" />} title={error.error_code === "NEEDS_REUPLOAD" ? "Re-upload needed" : "Something went wrong"}>
            <p>{error.message}</p>
            <div className="mt-3">
              <LinkButton href="/claims/new" look="secondary" small>
                New claim
              </LinkButton>
            </div>
          </Notice>
        </div>
      )}
    </Card>
  );
}
