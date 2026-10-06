import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";

/** Shown when a listed person has used their credits. */
export const PLUS_WALL = "Get Pane Plus";

/** Default cap when a listed person has no per-person credit_cap. Matches the migration. */
export const DEFAULT_CREDIT_CAP = 15;

const MISSING = /plus_limits|ai_credit_settings|ai_credit_use|schema cache/i;

export class PlusWallError extends Error {
  constructor() {
    super(PLUS_WALL);
    this.name = "PlusWallError";
  }
}

export function isPlusWall(error: unknown) {
  return error instanceof PlusWallError || (error instanceof Error && error.message === PLUS_WALL);
}

type Gate = { charge: false } | { charge: true; used: number };

/**
 * The cap applies only when plus_limits has an active row for this profile.
 * A missing table means the migration has not been run, so nobody is limited.
 */
async function beginAiCredit(profileId: string): Promise<Gate> {
  const admin = createAdminClient();
  const limit = await admin.from("plus_limits").select("active, credit_cap").eq("user_id", profileId).maybeSingle();
  if (limit.error) {
    if (MISSING.test(limit.error.message)) return { charge: false };
    throw new Error(limit.error.message);
  }
  if (!limit.data?.active) return { charge: false };

  const settings = await admin.from("ai_credit_settings").select("credit_cap").eq("singleton", true).maybeSingle();
  const fallback =
    settings.error || settings.data?.credit_cap == null ? DEFAULT_CREDIT_CAP : settings.data.credit_cap;
  const cap = limit.data.credit_cap ?? fallback;

  const use = await admin.from("ai_credit_use").select("used").eq("user_id", profileId).maybeSingle();
  if (use.error && !MISSING.test(use.error.message)) throw new Error(use.error.message);
  const used = use.data?.used ?? 0;
  if (used >= cap) throw new PlusWallError();
  return { charge: true, used };
}

async function finishAiCredit(profileId: string, used: number) {
  try {
    const admin = createAdminClient();
    const { error } = await admin.from("ai_credit_use").upsert({
      user_id: profileId,
      used: used + 1,
      updated_at: new Date().toISOString(),
    });
    if (error) console.error("ai credit save failed", error.message);
  } catch (error) {
    console.error("ai credit save failed", error);
  }
}

/** Runs a model call. A credit is spent only after the call succeeds, and only for people the limit affects. */
export async function withAiCredit<T>(profileId: string, run: () => Promise<T>) {
  const gate = await beginAiCredit(profileId);
  const result = await run();
  if (gate.charge) await finishAiCredit(profileId, gate.used);
  return result;
}
