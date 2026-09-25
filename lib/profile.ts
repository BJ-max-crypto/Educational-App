import "server-only";

import { createUserClient } from "@/lib/supabase/server";

export type StoredProfile = {
  name: string;
  school: string | null;
  grade: string | null;
};

/**
 * Reads the signed-in user's profile through RLS and creates the row on first visit.
 * Returns null when the Clerk third-party integration or clerk_user_id column is not
 * ready yet, so the screens can still render.
 */
export async function loadStoredProfile(
  clerkUserId: string,
  name: string,
): Promise<StoredProfile | null> {
  try {
    const supabase = await createUserClient();
    const { data, error } = await supabase
      .from("profiles")
      .select("name, school, grade")
      .eq("clerk_user_id", clerkUserId)
      .maybeSingle();

    if (error) return null;
    if (data) {
      return { name: data.name || name, school: data.school, grade: data.grade };
    }

    const { error: insertError } = await supabase.from("profiles").insert({
      id: crypto.randomUUID(),
      clerk_user_id: clerkUserId,
      name,
    });
    if (insertError) return null;
    return { name, school: null, grade: null };
  } catch {
    return null;
  }
}
