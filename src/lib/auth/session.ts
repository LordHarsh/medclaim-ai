import { auth } from "./server";
import { redirect } from "next/navigation";
import sql from "@/lib/db";
import type { MemberRow } from "@/lib/types";

export async function requireAuth() {
  const { data: session } = await auth.getSession();
  if (!session?.user) {
    redirect("/auth/sign-in");
  }
  return session;
}

export async function requireMember() {
  const session = await requireAuth();

  const rows = (await sql(
    "SELECT * FROM members WHERE auth_user_id = $1",
    [session.user.id]
  )) as unknown as MemberRow[];

  if (!rows || rows.length === 0) {
    redirect("/onboarding");
  }

  return { session, member: rows[0] };
}

export async function getOptionalSession() {
  const { data: session } = await auth.getSession();
  return session;
}
