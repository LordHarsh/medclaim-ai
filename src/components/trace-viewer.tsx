"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

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
      <Card>
        <CardContent className="py-8 text-center text-sm text-gray-500">
          Trace data not yet available. Processing may still be in progress.
        </CardContent>
      </Card>
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
    <div className="space-y-4">
      {/* Summary */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">Pipeline Trace</CardTitle>
            <div className="flex items-center gap-2">
              {trace.degraded && (
                <Badge variant="outline" className="bg-yellow-50 text-yellow-700 border-yellow-200">
                  Degraded
                </Badge>
              )}
              {trace.total_duration_ms && (
                <span className="text-xs text-gray-500">
                  {(trace.total_duration_ms / 1000).toFixed(1)}s total
                </span>
              )}
            </div>
          </div>
        </CardHeader>
      </Card>

      {/* Steps */}
      {trace.steps.map((step, index) => (
        <Card key={index} className="overflow-hidden">
          <button
            onClick={() => toggleStep(index)}
            className="flex w-full items-center justify-between px-6 py-4 text-left hover:bg-gray-50"
          >
            <div className="flex items-center gap-3">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-gray-100 text-xs font-medium text-gray-600">
                {step.step_order}
              </span>
              <div>
                <p className="text-sm font-medium text-gray-900">
                  {step.step_name.replace(/_/g, " ")}
                </p>
                <p className="text-xs text-gray-500">{step.summary}</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Badge
                variant="outline"
                className={
                  step.status === "COMPLETED"
                    ? "bg-green-50 text-green-700 border-green-200"
                    : step.status === "DEGRADED"
                      ? "bg-yellow-50 text-yellow-700 border-yellow-200"
                      : "bg-red-50 text-red-700 border-red-200"
                }
              >
                {step.status}
              </Badge>
              <span className="text-xs text-gray-400">
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
                className={`h-4 w-4 text-gray-400 transition-transform ${
                  expandedSteps.has(index) ? "rotate-180" : ""
                }`}
              >
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </div>
          </button>

          {expandedSteps.has(index) && (
            <CardContent className="border-t bg-gray-50 pt-4">
              <pre className="overflow-x-auto whitespace-pre-wrap rounded-md bg-white p-4 text-xs text-gray-700 font-mono border">
                {JSON.stringify(step.details, null, 2)}
              </pre>
            </CardContent>
          )}
        </Card>
      ))}

      {/* Final Decision */}
      {trace.final_decision && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Calculation Breakdown</CardTitle>
          </CardHeader>
          <CardContent>
            {trace.final_decision.user_message && (
              <p className="mb-4 text-sm text-gray-700">
                {trace.final_decision.user_message}
              </p>
            )}
            {trace.final_decision.calculation_breakdown && (
              <pre className="overflow-x-auto whitespace-pre-wrap rounded-md bg-gray-50 p-4 text-xs text-gray-700 font-mono border">
                {JSON.stringify(trace.final_decision.calculation_breakdown, null, 2)}
              </pre>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
