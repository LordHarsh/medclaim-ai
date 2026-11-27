"use client";

import ErrorScreen from "@/app/error";

/** The error screen takes a function, so it has to be mounted from a client component. */
export function GalleryError() {
  return <ErrorScreen error={new Error("fixture")} reset={() => {}} />;
}
