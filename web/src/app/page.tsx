import { ArrowRight } from "lucide-react";
import { LinkButton, TopBar } from "@/components/ui";
import { HeroReplay } from "@/components/screens/hero-replay";
import { DEMO_SAMPLES } from "@/lib/demo/samples";

const REPO = "https://github.com/LordHarsh/medclaim-ai";

/** The claims the landing page cycles through: one paid in part, one refused, one sent to a person. */
const SHOWN = ["TC006", "TC010", "TC005", "TC009"];

export default function HomePage() {
  const samples = SHOWN.flatMap((id) => DEMO_SAMPLES.filter((s) => s.id === id));
  return (
    <div className="flex min-h-screen flex-col">
      <TopBar>
        <LinkButton href={REPO} look="ghost" small external>
          Source
        </LinkButton>
        <LinkButton href="/auth/sign-in" look="secondary" small>
          Sign in
        </LinkButton>
      </TopBar>
      <main className="mx-auto grid w-full max-w-6xl flex-1 items-center gap-10 px-4 py-10 sm:px-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] lg:gap-14">
        <div>
          <h1 className="text-[40px] font-semibold leading-[1.05] tracking-[-0.03em] sm:text-[56px]">
            Five agents decide a health claim.
          </h1>
          <p className="mt-4 text-[17px] text-ink-2">Every step is on the record.</p>
          <div className="mt-8 flex flex-wrap gap-2.5">
            <LinkButton href="/demo">
              Run a sample claim <ArrowRight className="h-4 w-4" />
            </LinkButton>
            <LinkButton href="/auth/sign-up" look="secondary">
              Create account
            </LinkButton>
          </div>
        </div>
        <HeroReplay samples={samples.length > 0 ? samples : DEMO_SAMPLES} />
      </main>
    </div>
  );
}
