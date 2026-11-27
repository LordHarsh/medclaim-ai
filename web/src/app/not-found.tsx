import { SearchX } from "lucide-react";
import { Empty, LinkButton, Page, TopBar } from "@/components/ui";

export default function NotFound() {
  return (
    <div className="min-h-screen">
      <TopBar />
      <Page narrow>
        <Empty icon={<SearchX className="h-6 w-6" strokeWidth={1.6} />} title="Nothing here">
          <LinkButton href="/">Home</LinkButton>
          <LinkButton href="/demo" look="secondary">
            Sample claims
          </LinkButton>
        </Empty>
      </Page>
    </div>
  );
}
