"use server";

import { auth } from "@/lib/auth/server";
import sql from "@/lib/db";
import { bindMemberSchema } from "@/lib/validations";
import { redirect } from "next/navigation";

export type OnboardingResult =
  | { success: true }
  | { success: false; error: string };

export async function validateAndBindMember(
  formData: FormData
): Promise<OnboardingResult> {
  const { data: session } = await auth.getSession();
  if (!session?.user) {
    redirect("/auth/sign-in");
  }

  const rawInput = {
    member_id: (formData.get("member_id") as string)?.trim(),
  };

  const validation = bindMemberSchema.safeParse(rawInput);
  if (!validation.success) {
    return {
      success: false,
      error: validation.error.issues[0].message,
    };
  }

  const { member_id } = validation.data;

  try {
    // Check if member exists
    const members = await sql(
      "SELECT member_id, auth_user_id, name FROM members WHERE member_id = $1",
      [member_id]
    );

    if (!members || members.length === 0) {
      return {
        success: false,
        error:
          "Member ID not found. Please check your Employee/Member ID and try again.",
      };
    }

    const member = members[0];

    // Check if already bound to another user
    if (member.auth_user_id && member.auth_user_id !== session.user.id) {
      return {
        success: false,
        error:
          "This Member ID is already linked to another account. Please contact support.",
      };
    }

    // Check if this user already has a member bound
    const existingBinding = await sql(
      "SELECT member_id FROM members WHERE auth_user_id = $1",
      [session.user.id]
    );

    if (existingBinding && existingBinding.length > 0) {
      return {
        success: false,
        error: "Your account is already linked to a member profile.",
      };
    }

    // Bind the member
    await sql(
      "UPDATE members SET auth_user_id = $1 WHERE member_id = $2",
      [session.user.id, member_id]
    );

    return { success: true };
  } catch (error) {
    console.error("Failed to bind member:", error);
    return {
      success: false,
      error: "An unexpected error occurred. Please try again.",
    };
  }
}
