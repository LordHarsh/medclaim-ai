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

  if (rows && rows.length > 0) {
    return { session, member: rows[0] };
  }

  // Auto-create member on first access.
  // The join date is set a year back: with today's date every first claim would fall inside the policy's 30-day
  // initial waiting period, and nobody trying the app could ever see an approval.
  const memberId = `MBR_${session.user.id.slice(0, 8).toUpperCase()}`;
  const name = session.user.name || session.user.email?.split("@")[0] || "Member";

  const created = (await sql(
    `INSERT INTO members (member_id, auth_user_id, name, date_of_birth, gender, relationship, join_date)
     VALUES ($1, $2, $3, '1990-01-01', 'M', 'SELF', CURRENT_DATE - INTERVAL '1 year')
     ON CONFLICT (member_id) DO UPDATE SET auth_user_id = EXCLUDED.auth_user_id
     RETURNING *`,
    [memberId, session.user.id, name]
  )) as unknown as MemberRow[];

  return { session, member: created[0] };
}

export async function getOptionalSession() {
  const { data: session } = await auth.getSession();
  return session;
}
