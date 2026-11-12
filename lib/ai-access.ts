import "server-only";

import { AI_ACCESS_MESSAGE, type AiAccessCode } from "@/lib/billing-config";
import { readAiUsage, recentEntitlement, refreshEntitlement, releaseAiAnswer, reserveAiAnswer } from "@/lib/subscription";

const ENTITLEMENT_CACHE_MS = 15 * 60 * 1000;

export class AiAccessError extends Error {
  code: AiAccessCode;

  constructor(code: AiAccessCode) {
    super(AI_ACCESS_MESSAGE[code]);
    this.name = "AiAccessError";
    this.code = code;
  }
}

export function aiAccessResult(error: unknown) {
  if (!(error instanceof AiAccessError)) return null;
  return { error: error.message, code: error.code };
}

/**
 * Blocks premium AI unless Stripe currently grants pane_pro_ai.
 * A Stripe outage can use an entitlement synced in the last 15 minutes.
 */
export async function assertPremium(profileId: string) {
  let active = false;
  try {
    active = await refreshEntitlement(profileId);
  } catch (error) {
    if (error instanceof Error && error.message === AI_ACCESS_MESSAGE.billing_setup) throw new AiAccessError("billing_setup");
    const cached = await recentEntitlement(profileId, ENTITLEMENT_CACHE_MS).catch(() => null);
    if (cached == null) throw error;
    active = cached;
  }
  const access = await readAiUsage(profileId);
  if (access.setupError) throw new AiAccessError("billing_setup");
  if (!active) throw new AiAccessError("pro_required");
  return access;
}

/**
 * Reserves one AI answer, then runs the generator.
 * The reservation is returned when the generator throws.
 * Call `release` when a later save fails and the user does not receive the answer.
 */
export async function withPremiumAi<T>(profileId: string, run: () => Promise<T>) {
  const access = await assertPremium(profileId);
  const used = await reserveAiAnswer(profileId, access.periodStart, access.allowance);
  if (used == null) throw new AiAccessError("limit_reached");
  try {
    const value = await run();
    return {
      value,
      used,
      release: () => releaseAiAnswer(profileId, access.periodStart),
    };
  } catch (error) {
    await releaseAiAnswer(profileId, access.periodStart);
    throw error;
  }
}
