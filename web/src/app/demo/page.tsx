import { LinkButton, Page, TopBar } from "@/components/ui";
import { REPO, appNav } from "@/components/screens/nav";
import { DEMO_SAMPLES } from "@/lib/demo/samples";
import { DemoClient } from "./client";

export const metadata = {
  title: "Sample claims - MedClaim AI",
  description: "Six health insurance claims, replayed through the five agents that decided them. No account needed.",
};

export default function DemoPage() {
  return (
    <div className="min-h-screen">
      <TopBar nav={appNav("samples")}>
        <LinkButton href={REPO} look="ghost" small external>
          Source
        </LinkButton>
      </TopBar>
      <Page>
        <DemoClient samples={DEMO_SAMPLES} />
      </Page>
    </div>
  );
}
