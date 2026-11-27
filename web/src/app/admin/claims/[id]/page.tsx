import { notFound } from "next/navigation";
import { getClaimById } from "../../actions";
import { AdminClaimView } from "@/components/screens/admin-claim-view";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Claim - MedClaim AI",
  description: "One claim: the decision, the money, and what each agent found.",
};

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function ClaimDetailPage({ params }: PageProps) {
  const { id } = await params;
  const claim = await getClaimById(id);

  if (!claim) {
    notFound();
  }

  return <AdminClaimView claim={claim} />;
}
