import Link from "next/link";

export default function HomePage() {
  return (
    <div className="flex min-h-screen flex-col bg-[var(--canvas)]">
      {/* Navigation */}
      <header className="absolute top-0 left-0 right-0 z-10">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--primary-indigo)]">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="h-4.5 w-4.5 text-white"
              >
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10" />
                <path d="m9 12 2 2 4-4" />
              </svg>
            </div>
            <span className="text-lg font-light tracking-[-0.2px] text-[var(--ink)]">
              MedClaim AI
            </span>
          </div>
          <div className="flex items-center gap-3">
            <Link
              href="/auth/sign-in"
              className="body-md text-[var(--ink-mute)] hover:text-[var(--ink)] transition-colors px-3 py-2"
            >
              Sign In
            </Link>
            <Link
              href="/auth/sign-up"
              className="btn-pill btn-pill-primary inline-flex items-center"
            >
              Get Started
            </Link>
          </div>
        </div>
      </header>

      {/* Hero with Gradient Mesh */}
      <section className="gradient-mesh relative flex flex-col items-center justify-center px-4 pt-32 pb-24 sm:px-6 lg:px-8 min-h-[70vh]">
        <div className="mx-auto max-w-3xl text-center">
          <h1 className="display-xxl text-[var(--ink)]">
            Health claims,{" "}
            <span className="text-[var(--primary-indigo)]">processed intelligently</span>
          </h1>
          <p className="mt-6 body-lg text-[var(--ink-mute)] max-w-2xl mx-auto">
            Submit your health insurance claims and get AI-powered decisions in
            minutes, not weeks. Upload documents, track progress in real-time,
            and receive transparent explanations for every decision.
          </p>
          <div className="mt-10 flex items-center justify-center gap-4">
            <Link
              href="/auth/sign-up"
              className="btn-pill btn-pill-primary inline-flex items-center px-6 py-3 text-base"
            >
              Get Started
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="ml-2 h-4 w-4"
              >
                <line x1="5" y1="12" x2="19" y2="12" />
                <polyline points="12 5 19 12 12 19" />
              </svg>
            </Link>
          </div>
        </div>
      </section>

      {/* Features on canvas-soft */}
      <section className="bg-[var(--canvas-soft)] px-4 py-24 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-5xl">
          <div className="text-center mb-16">
            <h2 className="display-lg text-[var(--ink)]">
              Everything you need for claims processing
            </h2>
            <p className="mt-4 body-lg text-[var(--ink-mute)]">
              Powered by AI, designed for transparency
            </p>
          </div>

          <div className="grid grid-cols-1 gap-6 sm:grid-cols-3">
            {/* Document Verification */}
            <div className="card-feature">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[var(--primary-bg-subdued)]">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="h-5 w-5 text-[var(--primary-indigo)]"
                >
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                  <polyline points="14 2 14 8 20 8" />
                  <path d="m9 15 2 2 4-4" />
                </svg>
              </div>
              <h3 className="mt-5 heading-md text-[var(--ink)]">
                Document Verification
              </h3>
              <p className="mt-3 body-md text-[var(--ink-mute)]">
                AI-powered verification of prescriptions, bills, lab reports,
                and medical documents with fraud detection.
              </p>
            </div>

            {/* Policy Engine */}
            <div className="card-feature">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[var(--primary-bg-subdued)]">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="h-5 w-5 text-[var(--primary-indigo)]"
                >
                  <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10" />
                  <path d="m9 12 2 2 4-4" />
                </svg>
              </div>
              <h3 className="mt-5 heading-md text-[var(--ink)]">
                Policy Engine
              </h3>
              <p className="mt-3 body-md text-[var(--ink-mute)]">
                Intelligent evaluation against your policy terms with transparent
                calculation breakdowns for every decision.
              </p>
            </div>

            {/* Real-time Tracking */}
            <div className="card-feature">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[var(--primary-bg-subdued)]">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="h-5 w-5 text-[var(--primary-indigo)]"
                >
                  <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
                </svg>
              </div>
              <h3 className="mt-5 heading-md text-[var(--ink)]">
                Real-time Tracking
              </h3>
              <p className="mt-3 body-md text-[var(--ink-mute)]">
                Watch your claim progress through each verification step with
                live updates, status indicators, and instant notifications.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Cream band with stats */}
      <section className="bg-[var(--canvas-cream)] px-4 py-20 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-5xl">
          <div className="grid grid-cols-1 gap-12 sm:grid-cols-3 text-center">
            <div>
              <p className="display-lg text-[var(--ink)] tabular-nums">75K+</p>
              <p className="mt-2 body-md text-[var(--ink-mute)]">
                Claims processed
              </p>
            </div>
            <div>
              <p className="display-lg text-[var(--ink)] tabular-nums">10M</p>
              <p className="mt-2 body-md text-[var(--ink-mute)]">
                Lives covered target
              </p>
            </div>
            <div>
              <p className="display-lg text-[var(--ink)] tabular-nums">&lt;3 min</p>
              <p className="mt-2 body-md text-[var(--ink-mute)]">
                Average decision time
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-[var(--canvas)] border-t border-[var(--hairline)] px-4 py-12 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl text-center">
          <p className="caption text-[var(--ink-mute)]">
            MedClaim AI — AI-powered health insurance claims processing
          </p>
        </div>
      </footer>
    </div>
  );
}
