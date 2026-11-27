import { requireMember } from "@/lib/auth/session";
import { listClaims } from "@/lib/actions/claims";
import { toClaim } from "@/components/claim/model";
import { DashboardView, type DashboardClaimRow } from "@/components/screens/dashboard-view";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const { member } = await requireMember();
  const result = await listClaims();
  const claims = result.success ? result.data.claims : [];

  return (
    <DashboardView
      memberName={member.name}
      claims={claims.map((c) => ({
        ...toClaim(c),
        claim_id: c.claim_id,
        treatment_date: String(c.treatment_date),
        hospital_name: c.hospital_name,
        created_at: String(c.created_at),
      })) as DashboardClaimRow[]}
    />
  );
}
