import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Database } from "@/lib/supabase/database";
import { createUserClient } from "@/lib/supabase/server";

export type UserDb = {
  supabase: SupabaseClient<Database>;
  profileId: string;
  viaRls: boolean;
};

let warned = false;

/**
 * Resolves the signed-in user's profile and a client to read it with.
 * Prefers the RLS client (Clerk session token). If Supabase rejects that token because the
 * Clerk third-party integration is not configured, falls back to the service-role client.
 * Callers must filter every query by `profileId`; the fallback does not enforce RLS.
 */
export async function getUserDb(clerkUserId: string): Promise<UserDb | null> {
  try {
    const supabase = await createUserClient();
    const { data, error } = await supabase
      .from("profiles")
      .select("id")
      .eq("clerk_user_id", clerkUserId)
      .maybeSingle();
    if (!error) return data ? { supabase, profileId: data.id, viaRls: true } : null;
    if (!warned) {
      warned = true;
      console.warn(
        "Supabase rejected the Clerk session token; reading with the service role. " +
          "Finish the Clerk ↔ Supabase third-party auth setup in README.",
        error.message,
      );
    }
  } catch {
    // Fall through to the admin client.
  }

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("profiles")
    .select("id")
    .eq("clerk_user_id", clerkUserId)
    .maybeSingle();
  if (error || !data) return null;
  return { supabase: admin, profileId: data.id, viaRls: false };
}
