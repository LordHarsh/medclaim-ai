import Link from "next/link";
import { notFound } from "next/navigation";
import { Card, Label, Page, TopBar } from "@/components/ui";
import { FIXTURE_STATES } from "@/lib/demo/fixtures";
import { galleryEnabled } from "@/lib/demo/gallery";

export const metadata = { title: "Screen gallery - MedClaim AI", robots: { index: false } };
export const dynamic = "force-dynamic";

const GROUPS: { name: string; links: [string, string][] }[] = [
  {
    name: "Member",
    links: [
      ["Dashboard", "dashboard"],
      ["Dashboard, empty", "dashboard-empty"],
      ["New claim", "new"],
      ...FIXTURE_STATES.map((s) => ["Claim, " + s, "claim?s=" + s] as [string, string]),
    ],
  },
  {
    name: "Operations",
    links: [["Claims", "admin"], ["Claims, empty", "admin-empty"], ...FIXTURE_STATES.map((s) => ["Claim, " + s, "admin-claim?s=" + s] as [string, string])],
  },
  {
    name: "Test runner",
    links: [
      ["Not run", "eval"],
      ["After a run", "eval-done"],
    ],
  },
  {
    name: "States",
    links: [
      ["Loading", "loading"],
      ["Error", "error"],
      ["Not found", "missing"],
    ],
  },
];

/** Every signed-in screen and state, drawn from fixtures. Not available on the production deployment. */
export default function GalleryIndex() {
  if (!galleryEnabled()) notFound();
  return (
    <div className="min-h-screen">
      <TopBar />
      <Page>
        <h1 className="text-[22px] font-semibold tracking-[-0.02em]">Screen gallery</h1>
        <p className="mt-1 text-[14px] text-ink-3">Fixture data. Buttons that call the backend do nothing here.</p>
        <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {GROUPS.map((g) => (
            <Card key={g.name} className="p-4">
              <Label>{g.name}</Label>
              <ul className="mt-2 space-y-1">
                {g.links.map(([label, href]) => (
                  <li key={href}>
                    <Link href={"/gallery/" + href} className="text-[14px] underline-offset-4 hover:underline">
                      {label}
                    </Link>
                  </li>
                ))}
              </ul>
            </Card>
          ))}
        </div>
      </Page>
    </div>
  );
}
