import Link from "next/link";

export default function HomePage() {
  return (
    <div className="gradient-mesh flex min-h-screen flex-col items-center justify-center px-4">
      <div className="flex flex-col items-center text-center max-w-2xl">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[var(--primary-indigo)] mb-8">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="h-7 w-7 text-white"
          >
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10" />
            <path d="m9 12 2 2 4-4" />
          </svg>
        </div>

        <h1 className="display-xxl text-[var(--ink)]">
          Health claims,<br />
          <span className="text-[var(--primary-indigo)]">processed intelligently</span>
        </h1>

        <p className="mt-6 body-lg text-[var(--ink-mute)] max-w-lg">
          AI-powered decisions in minutes. Upload documents, get transparent explanations.
        </p>

        <Link
          href="/auth/sign-up"
          className="btn-pill btn-pill-primary inline-flex items-center px-8 py-3.5 text-base mt-10"
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

        <Link
          href="/auth/sign-in"
          className="mt-4 body-md text-[var(--ink-mute)] hover:text-[var(--primary-indigo)] transition-colors"
        >
          Already have an account? Sign in
        </Link>
      </div>
    </div>
  );
}
