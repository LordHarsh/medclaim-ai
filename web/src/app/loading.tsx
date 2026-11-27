import { Page, Skeleton, TopBar } from "@/components/ui";

/** Shown while a signed-in screen fetches its data. */
export default function Loading() {
  return (
    <div className="min-h-screen" aria-busy="true" aria-label="Loading">
      <TopBar />
      <Page>
        <div className="grid grid-cols-3 gap-3">
          <Skeleton className="h-[74px] rounded-card" />
          <Skeleton className="h-[74px] rounded-card" />
          <Skeleton className="h-[74px] rounded-card" />
        </div>
        <Skeleton className="mt-6 h-[72px] rounded-card" />
        <Skeleton className="mt-2 h-[72px] rounded-card" />
        <Skeleton className="mt-2 h-[72px] rounded-card" />
      </Page>
    </div>
  );
}
