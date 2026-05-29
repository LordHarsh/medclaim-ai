"use client";

import { createAuthClient } from "@neondatabase/auth";

let _client: ReturnType<typeof createAuthClient> | null = null;

export function getAuthClient() {
  if (!_client) {
    const baseUrl =
      typeof window !== "undefined"
        ? `${window.location.origin}/api/auth`
        : "http://localhost:3000/api/auth";
    _client = createAuthClient(baseUrl);
  }
  return _client;
}
