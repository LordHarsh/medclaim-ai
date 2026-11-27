import { notFound } from "next/navigation";
import AdminEvalClient, { type CaseState } from "@/app/admin/eval/client";
import Loading from "@/app/loading";
import NotFound from "@/app/not-found";
import { AdminClaimView } from "@/components/screens/admin-claim-view";
import { AdminView } from "@/components/screens/admin-view";
import { ClaimDetailView } from "@/components/screens/claim-detail-view";
import { DashboardView } from "@/components/screens/dashboard-view";
import { NewClaimForm } from "@/components/screens/new-claim-form";
import { DEMO_SAMPLES } from "@/lib/demo/samples";
import { FIXTURE_BY_STATE, FIXTURE_CLAIMS, FIXTURE_MEMBER, FIXTURE_STATS, fixtureDocuments } from "@/lib/demo/fixtures";
import { galleryEnabled } from "@/lib/demo/gallery";
import { GalleryError } from "./error-sample";

export const metadata = { title: "Screen gallery - MedClaim AI", robots: { index: false } };
export const dynamic = "force-dynamic";

/** The test runner as it looks after a run: the six recorded cases finished, one still going. */
function evalStates(): Record<string, Partial<CaseState>> {
  const out: Record<string, Partial<CaseState>> = {};
  for (const s of DEMO_SAMPLES) {
    const c = FIXTURE_CLAIMS.find((x) => x.trace_json === (s.run.trace as unknown));
    if (!c) continue;
    out[s.id] = { status: "passed", claimId: c.claim_id, duration: s.run.duration_ms, outcome: { ...c } };
  }
  out.TC002 = {
    status: "polling",
    claimId: FIXTURE_BY_STATE.progress.claim_id,
    startedAt: 0,
    outcome: { ...FIXTURE_BY_STATE.progress, current_step: "POLICY_ENGINE" },
  };
  return out;
}

export default async function GalleryScreen({
  params,
  searchParams,
}: {
  params: Promise<{ screen: string }>;
  searchParams: Promise<{ s?: string }>;
}) {
  if (!galleryEnabled()) notFound();
  const { screen } = await params;
  const { s } = await searchParams;
  const claim = FIXTURE_BY_STATE[s ?? "approved"] ?? FIXTURE_BY_STATE.approved;

  switch (screen) {
    case "dashboard":
      return <DashboardView memberName={FIXTURE_MEMBER.name} claims={FIXTURE_CLAIMS} />;
    case "dashboard-empty":
      return <DashboardView memberName={FIXTURE_MEMBER.name} claims={[]} />;
    case "new":
      return <NewClaimForm />;
    case "claim":
      return <ClaimDetailView claim={claim} documents={fixtureDocuments(claim.claim_id)} offline />;
    case "admin":
      return <AdminView claims={FIXTURE_CLAIMS} stats={FIXTURE_STATS} />;
    case "admin-empty":
      return <AdminView claims={[]} stats={{ total: 0, approved: 0, rejected: 0, partial: 0, manual_review: 0, completed: 0, avg_processing_ms: null }} />;
    case "admin-claim":
      return <AdminClaimView claim={claim} documents={fixtureDocuments(claim.claim_id)} />;
    case "eval":
      return <AdminEvalClient />;
    case "eval-done":
      return <AdminEvalClient initial={evalStates()} select={s ?? "TC006"} />;
    case "loading":
      return <Loading />;
    case "error":
      return <GalleryError />;
    case "missing":
      return <NotFound />;
    default:
      notFound();
  }
}
