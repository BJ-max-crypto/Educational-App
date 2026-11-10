import "server-only";

import { AI_ACCESS_MESSAGE, type AiAccessCode } from "@/lib/billing-config";
import { incrementAiUsage, readAiUsage } from "@/lib/subscription";

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

/** Blocks premium AI for anyone who is not on an active Pane Pro subscription. */
export async function assertPremium(profileId: string) {
  const access = await readAiUsage(profileId);
  if (access.setupError) throw new AiAccessError("billing_setup");
  if (access.tier !== "pro") throw new AiAccessError("pro_required");
  return access;
}

/**
 * Runs a model call for a Pro subscriber.
 * Call `commit` only after the answer is accepted. A throw, an unreadable answer,
 * or a cache hit should not call it, so those do not use an AI answer.
 */
export async function withPremiumAi<T>(profileId: string, run: () => Promise<T>) {
  const access = await assertPremium(profileId);
  if (access.used >= access.allowance) throw new AiAccessError("limit_reached");
  const value = await run();
  return {
    value,
    commit: () => incrementAiUsage(profileId, access.periodStart, access.used),
  };
}
