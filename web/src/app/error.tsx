"use client";

import { CircleAlert } from "lucide-react";
import { Button, Empty, LinkButton, Page, TopBar } from "@/components/ui";

export default function ErrorScreen({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="min-h-screen">
      <TopBar />
      <Page narrow>
        <Empty icon={<CircleAlert className="h-6 w-6" strokeWidth={1.6} />} title="That did not load">
          <Button onClick={reset}>Try again</Button>
          <LinkButton href="/" look="secondary">
            Home
          </LinkButton>
        </Empty>
      </Page>
    </div>
  );
}
