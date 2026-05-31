import AdminEvalClient from "./client";

export const metadata = {
  title: "Admin Evaluation Suite - MedClaim AI",
  description: "Internal evaluation tool for running test cases through the full claims pipeline.",
};

export default function AdminEvalPage() {
  return <AdminEvalClient />;
}
