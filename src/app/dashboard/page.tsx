import Link from "next/link";
import { requireMember } from "@/lib/auth/session";
import { listClaims } from "@/lib/actions/claims";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { ClaimRow } from "@/lib/types";

export const dynamic = "force-dynamic";

function getStatusColor(status: string) {
  switch (status) {
    case "COMPLETED":
      return "bg-green-100 text-green-800";
    case "PROCESSING":
      return "bg-blue-100 text-blue-800";
    case "QUEUED":
      return "bg-yellow-100 text-yellow-800";
    case "FAILED":
      return "bg-red-100 text-red-800";
    case "NEEDS_REUPLOAD":
      return "bg-orange-100 text-orange-800";
    default:
      return "bg-gray-100 text-gray-800";
  }
}

function getDecisionColor(decision: string | null) {
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
      return "";
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

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export default async function DashboardPage() {
  const { member } = await requireMember();
  const result = await listClaims();

  const claims: ClaimRow[] = result.success ? result.data.claims : [];

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="border-b bg-white shadow-sm">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-2">
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
          </div>
          <div className="flex items-center gap-4">
            <span className="text-sm text-gray-600">
              {member.name} ({member.member_id})
            </span>
            <Link href="/claims/new">
              <Button>New Claim</Button>
            </Link>
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">My Claims</h1>
            <p className="mt-1 text-sm text-gray-600">
              Track and manage your health insurance claims
            </p>
          </div>
          <Link href="/claims/new">
            <Button size="lg">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="mr-2 h-4 w-4"
              >
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
              Submit New Claim
            </Button>
          </Link>
        </div>

        {claims.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-16">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="h-12 w-12 text-gray-400"
              >
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14 2 14 8 20 8" />
                <line x1="16" y1="13" x2="8" y2="13" />
                <line x1="16" y1="17" x2="8" y2="17" />
                <polyline points="10 9 9 9 8 9" />
              </svg>
              <h3 className="mt-4 text-lg font-medium text-gray-900">No claims yet</h3>
              <p className="mt-2 text-sm text-gray-600">
                Submit your first health insurance claim to get started.
              </p>
              <Link href="/claims/new" className="mt-6">
                <Button>Submit Your First Claim</Button>
              </Link>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4">
            {claims.map((claim) => (
              <Link
                key={claim.claim_id}
                href={`/claims/${claim.claim_id}`}
              >
                <Card className="transition-shadow hover:shadow-md">
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-base font-medium">
                        {claim.category}
                      </CardTitle>
                      <div className="flex items-center gap-2">
                        <Badge
                          variant="outline"
                          className={getStatusColor(claim.status)}
                        >
                          {claim.status}
                        </Badge>
                        {claim.decision ? (
                          <Badge
                            variant="outline"
                            className={getDecisionColor(claim.decision)}
                          >
                            {claim.decision}
                          </Badge>
                        ) : null}
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                      <div>
                        <p className="text-xs text-gray-500">Treatment Date</p>
                        <p className="text-sm font-medium">
                          {formatDate(claim.treatment_date)}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-500">Claimed Amount</p>
                        <p className="text-sm font-medium">
                          {formatCurrency(claim.claimed_amount)}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-500">Approved Amount</p>
                        <p className="text-sm font-medium text-green-700">
                          {formatCurrency(claim.approved_amount)}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-500">Submitted</p>
                        <p className="text-sm font-medium">
                          {formatDate(claim.created_at)}
                        </p>
                      </div>
                    </div>
                    {claim.hospital_name ? (
                      <p className="mt-2 text-xs text-gray-500">
                        Hospital: {claim.hospital_name}
                      </p>
                    ) : null}
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
