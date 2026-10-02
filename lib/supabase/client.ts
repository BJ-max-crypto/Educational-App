"use client";

import { useSession } from "@clerk/nextjs";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { useMemo } from "react";
import type { Database } from "@/lib/supabase/database";
import { supabaseAnonKey, supabaseUrl } from "@/lib/supabase/env";

/** Browser client. RLS applies through the signed-in Clerk session token. */
export function useSupabase(): SupabaseClient<Database> {
  const { session } = useSession();
  return useMemo(
    () =>
      createClient<Database>(supabaseUrl(), supabaseAnonKey(), {
        accessToken: async () => (await session?.getToken()) ?? null,
      }),
    [session],
  );
}
