import "server-only";

import { createUserClient } from "@/lib/supabase/server";

export type StoredProfile = {
  name: string | null;
  school: string | null;
  grade: string | null;
};

/**
 * Reads the signed-in user's profile through RLS.
 * Returns null when the Clerk third-party integration or migration is not in place yet;
 * callers fall back to the answers kept in Clerk public metadata.
 */
export async function loadStoredProfile(clerkUserId: string): Promise<StoredProfile | null> {
  try {
    const supabase = await createUserClient();
    const { data, error } = await supabase
      .from("profiles")
      .select("name, school, grade")
      .eq("clerk_user_id", clerkUserId)
      .maybeSingle();
    if (error || !data) return null;
    return data;
  } catch {
    return null;
  }
}
