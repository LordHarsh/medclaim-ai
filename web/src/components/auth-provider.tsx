"use client";

import { NeonAuthUIProvider } from "@neondatabase/auth-ui";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { getAuthClient } from "@/lib/auth/client";

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const authClient = getAuthClient();

  return (
    <NeonAuthUIProvider
      authClient={authClient}
      navigate={(href) => router.push(href)}
      Link={Link}
      credentials={{ forgotPassword: true }}
      redirectTo="/dashboard"
    >
      {children}
    </NeonAuthUIProvider>
  );
}
