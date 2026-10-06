import "server-only";

import { auth } from "@clerk/nextjs/server";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database";
import { supabaseAnonKey, supabaseUrl } from "@/lib/supabase/env";

/** User-scoped client. RLS applies. The Clerk session token is sent as the access token. */
export async function createUserClient() {
  const { getToken } = await auth();
  return createClient<Database>(supabaseUrl(), supabaseAnonKey(), {
    accessToken: async () => (await getToken()) ?? null,
  });
}
