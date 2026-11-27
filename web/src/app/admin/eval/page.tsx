import AdminEvalClient from "./client";

export const metadata = {
  title: "Test runner - MedClaim AI",
  description: "Twelve prepared claims, run through the live pipeline and checked against what should happen.",
};

export default function AdminEvalPage() {
  return <AdminEvalClient />;
}
