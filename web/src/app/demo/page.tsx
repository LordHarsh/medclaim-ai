import Link from "next/link";
import { DEMO_SAMPLES } from "@/lib/demo/samples";
import { DemoClient } from "./client";

export const metadata = {
  title: "Sample claims - MedClaim AI",
  description:
    "Six health insurance claims, replayed step by step through the five-agent pipeline that decided them. No account needed.",
};

const REPO = "https://github.com/LordHarsh/medclaim-ai";

export default function DemoPage() {
  return (
    <div className="min-h-screen bg-[var(--canvas-soft)]">
      <header className="border-b border-[var(--hairline)] bg-[var(--canvas)]">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
          <Link href="/" className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--primary-indigo)]">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="h-4 w-4 text-white"
                aria-hidden="true"
              >
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10" />
                <path d="m9 12 2 2 4-4" />
              </svg>
            </span>
            <span className="text-lg font-light tracking-[-0.2px] text-[var(--ink)]">MedClaim AI</span>
          </Link>
          <nav className="flex items-center gap-2">
            <a href={`${REPO}#how-a-claim-is-decided`} className="btn-pill btn-pill-secondary inline-flex items-center text-sm">
              Architecture
            </a>
            <a href={REPO} className="btn-pill btn-pill-secondary inline-flex items-center text-sm">
              Source
            </a>
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
        <div className="mb-8 max-w-3xl">
          <h1 className="display-md text-[var(--ink)]">See a claim get decided</h1>
          <p className="mt-3 text-[15px] leading-6 text-[var(--ink-secondary)]">
            A member uploads a bill and a prescription. Five agents check the documents, read them, apply the policy,
            look for fraud, and decide: pay it, pay part of it, reject it, or hand it to a person. Pick one of the six
            claims below and step through what each agent saw and concluded.
          </p>
        </div>
        <DemoClient samples={DEMO_SAMPLES} />
      </main>
    </div>
  );
}
