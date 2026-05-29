"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { validateAndBindMember } from "@/lib/actions/onboarding";

export default function OnboardingPage() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setLoading(true);

    const formData = new FormData(e.currentTarget);

    try {
      const result = await validateAndBindMember(formData);

      if (result.success) {
        router.push("/dashboard");
        router.refresh();
      } else {
        setError(result.error);
      }
    } catch {
      setError("An unexpected error occurred. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--canvas-soft)] px-4 py-12 sm:px-6 lg:px-8">
      <div className="w-full max-w-md space-y-8">
        {/* Logo and heading */}
        <div className="flex flex-col items-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-[var(--primary-indigo)]">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="h-6 w-6 text-white"
            >
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10" />
              <path d="m9 12 2 2 4-4" />
            </svg>
          </div>
          <h1 className="mt-6 display-md text-[var(--ink)] text-center">
            Link Your Member ID
          </h1>
          <p className="mt-3 body-md text-[var(--ink-mute)] text-center max-w-sm">
            One last step before you can start submitting claims
          </p>
        </div>

        {/* Card */}
        <div className="bg-[var(--canvas)] rounded-xl border border-[var(--hairline)] shadow-level-1 p-8">
          <form onSubmit={handleSubmit} className="space-y-5">
            {error && (
              <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 body-md text-red-700">
                {error}
              </div>
            )}

            <div className="space-y-2">
              <label
                htmlFor="member_id"
                className="block caption text-[var(--ink-secondary)] font-normal"
              >
                Employee/Member ID
              </label>
              <input
                id="member_id"
                name="member_id"
                type="text"
                placeholder="e.g., EMP001"
                required
                autoComplete="off"
                className="input-design w-full font-mono text-[var(--ink)]"
              />
              <p className="micro text-[var(--ink-mute)]">
                This is the alphanumeric ID on your insurance card or provided
                during enrollment.
              </p>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="btn-pill btn-pill-primary w-full py-3 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? "Verifying..." : "Link Member Profile"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
