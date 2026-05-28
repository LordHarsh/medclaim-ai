import Link from "next/link";
import { notFound } from "next/navigation";
import { requireMember } from "@/lib/auth/session";
import sql from "@/lib/db";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ClaimDetailClient } from "./client";
import type { ClaimRow } from "@/lib/types";

export const dynamic = "force-dynamic";

function getDecisionColor(decision: string) {
  switch (decision) {
    case "APPROVED":
      return "bg-green-100 text-green-800 border-green-200";
    case "PARTIAL":
      return "bg-amber-100 text-amber-800 border-amber-200";
    case "REJECTED":
      return "bg-red-100 text-red-800 border-red-200";
    case "MANUAL_REVIEW":
      return "bg-purple-100 text-purple-800 border-purple-200";
    default:
      return "bg-gray-100 text-gray-800";
  }
}

function formatCurrency(amount: number | null) {
  if (!amount) return "-";
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(amount);
}

export default async function ClaimDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: claimId } = await params;
  const { member } = await requireMember();

  const claims = (await sql(
    `SELECT claim_id, category, claimed_amount, approved_amount, treatment_date,
            hospital_name, status, current_step, decision, confidence_score,
            rejection_reasons, error_message, fraud_score, trace_json,
            created_at, completed_at
     FROM claims
     WHERE claim_id = $1 AND member_id = $2`,
    [claimId, member.member_id]
  )) as unknown as ClaimRow[];

  if (!claims || claims.length === 0) {
    notFound();
  }

  const claim = claims[0];
  const isTerminal = ["COMPLETED", "FAILED", "NEEDS_REUPLOAD"].includes(
    claim.status
  );

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="border-b bg-white shadow-sm">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-2">
            <Link href="/dashboard" className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-600">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="h-5 w-5 text-white"
                >
                  <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10" />
                  <path d="m9 12 2 2 4-4" />
                </svg>
              </div>
              <span className="text-xl font-bold text-gray-900">MedClaim AI</span>
            </Link>
          </div>
          <Link href="/dashboard">
            <Button variant="outline">Back to Dashboard</Button>
          </Link>
        </div>
      </header>

      {/* Content */}
      <main className="mx-auto max-w-4xl px-4 py-8 sm:px-6 lg:px-8">
        {/* Claim header */}
        <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">
              {(claim.category).replace(/_/g, " ")} Claim
            </h1>
            <p className="mt-1 text-sm text-gray-500">
              Submitted on{" "}
              {new Date(claim.created_at).toLocaleDateString("en-IN", {
                day: "2-digit",
                month: "long",
                year: "numeric",
              })}
            </p>
          </div>
          <Badge
            variant="outline"
            className={`text-sm px-3 py-1 ${
              claim.decision
                ? getDecisionColor(claim.decision!)
                : "bg-blue-50 text-blue-700 border-blue-200"
            }`}
          >
            {(claim.decision!) || (claim.status)}
          </Badge>
        </div>

        <div className="grid gap-6 lg:grid-cols-3">
          {/* Left: Progress / Decision */}
          <div className="lg:col-span-2 space-y-6">
            {/* Decision Card (if complete) */}
            {isTerminal && claim.decision && (
              <Card
                className={`border-2 ${
                  claim.decision === "APPROVED"
                    ? "border-green-200 bg-green-50"
                    : claim.decision === "PARTIAL"
                      ? "border-amber-200 bg-amber-50"
                      : claim.decision === "REJECTED"
                        ? "border-red-200 bg-red-50"
                        : "border-purple-200 bg-purple-50"
                }`}
              >
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    {claim.decision === "APPROVED" && (
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        className="h-6 w-6 text-green-600"
                      >
                        <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                        <polyline points="22 4 12 14.01 9 11.01" />
                      </svg>
                    )}
                    {claim.decision === "REJECTED" && (
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        className="h-6 w-6 text-red-600"
                      >
                        <circle cx="12" cy="12" r="10" />
                        <line x1="15" y1="9" x2="9" y2="15" />
                        <line x1="9" y1="9" x2="15" y2="15" />
                      </svg>
                    )}
                    Decision: {claim.decision!}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {claim.approved_amount && (
                    <div className="flex justify-between">
                      <span className="text-sm text-gray-600">Approved Amount</span>
                      <span className="text-lg font-bold text-green-700">
                        {formatCurrency(claim.approved_amount)}
                      </span>
                    </div>
                  )}
                  {claim.confidence_score && (
                    <div className="flex justify-between">
                      <span className="text-sm text-gray-600">Confidence Score</span>
                      <span className="text-sm font-medium">
                        {((claim.confidence_score) * 100).toFixed(0)}%
                      </span>
                    </div>
                  )}
                  {claim.rejection_reasons &&
                    (claim.rejection_reasons).length > 0 && (
                      <div className="mt-3 border-t pt-3">
                        <p className="text-sm font-medium text-gray-700">Reasons:</p>
                        <ul className="mt-1 list-inside list-disc text-sm text-gray-600">
                          {(claim.rejection_reasons).map(
                            (reason, i) => (
                              <li key={i}>{reason}</li>
                            )
                          )}
                        </ul>
                      </div>
                    )}
                </CardContent>
              </Card>
            )}

            {/* Error / Reupload Message */}
            {claim.status === "NEEDS_REUPLOAD" && (
              <Card className="border-2 border-orange-200 bg-orange-50">
                <CardHeader>
                  <CardTitle className="text-orange-800">
                    Action Required: Re-upload Documents
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-orange-700">
                    {(claim.error_message) ||
                      "Some documents need to be re-uploaded. Please check the requirements and submit clearer documents."}
                  </p>
                  <Link href="/claims/new" className="mt-4 inline-block">
                    <Button variant="outline">Submit New Claim</Button>
                  </Link>
                </CardContent>
              </Card>
            )}

            {claim.status === "FAILED" && (
              <Card className="border-2 border-red-200 bg-red-50">
                <CardHeader>
                  <CardTitle className="text-red-800">Processing Failed</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-red-700">
                    {(claim.error_message) ||
                      "An error occurred while processing your claim. Our team has been notified. Please try again later."}
                  </p>
                </CardContent>
              </Card>
            )}

            {/* Real-time Progress (non-terminal) */}
            <ClaimDetailClient
              claimId={claimId}
              initialStatus={claim.status}
              initialStep={claim.current_step}
              traceJson={claim.trace_json}
              isTerminal={isTerminal}
            />
          </div>

          {/* Right: Claim summary */}
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Claim Summary</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Category</span>
                  <span className="font-medium">
                    {(claim.category).replace(/_/g, " ")}
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Treatment Date</span>
                  <span className="font-medium">
                    {new Date(claim.treatment_date).toLocaleDateString(
                      "en-IN"
                    )}
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Claimed Amount</span>
                  <span className="font-medium">
                    {formatCurrency(claim.claimed_amount)}
                  </span>
                </div>
                {claim.approved_amount && (
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500">Approved Amount</span>
                    <span className="font-medium text-green-700">
                      {formatCurrency(claim.approved_amount)}
                    </span>
                  </div>
                )}
                {claim.hospital_name && (
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500">Hospital</span>
                    <span className="font-medium text-right max-w-[60%]">
                      {claim.hospital_name}
                    </span>
                  </div>
                )}
                {claim.fraud_score !== null && claim.fraud_score !== undefined && (
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500">Fraud Score</span>
                    <span
                      className={`font-medium ${
                        (claim.fraud_score) >= 0.5
                          ? "text-red-600"
                          : (claim.fraud_score) >= 0.3
                            ? "text-yellow-600"
                            : "text-green-600"
                      }`}
                    >
                      {((claim.fraud_score) * 100).toFixed(0)}%
                    </span>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Claim ID</CardTitle>
              </CardHeader>
              <CardContent>
                <code className="break-all rounded bg-gray-100 px-2 py-1 text-xs text-gray-700">
                  {claimId}
                </code>
              </CardContent>
            </Card>
          </div>
        </div>
      </main>
    </div>
  );
}
