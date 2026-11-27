import { getAllClaims, getDashboardStats } from "./actions";
import { AdminView } from "@/components/screens/admin-view";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Operations - MedClaim AI",
  description: "Every claim the pipeline has decided, with its trace.",
};

export default async function AdminDashboardPage() {
  const [claims, stats] = await Promise.all([getAllClaims(), getDashboardStats()]);
  return <AdminView claims={claims} stats={stats} />;
}
