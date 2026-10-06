import { localDate } from "@/lib/timezone";

export type PriorityTier = "A" | "B" | "C";

/** Whole local days from today until the due date. Negative means overdue. */
export function dueDayOffset(dueAt: string, now: number, timeZone: string) {
  const due = localDate(new Date(dueAt).getTime(), timeZone);
  const today = localDate(now, timeZone);
  return Math.round((Date.parse(`${due}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000);
}

/**
 * Keeps the model's letter inside the fixed A/B/C rules.
 * A is overdue, today, or tomorrow. B is only about two days. Everything else is C.
 */
export function coerceTier(offset: number, raw: string | undefined): PriorityTier {
  const model = raw === "A" || raw === "B" || raw === "C" ? raw : "C";
  if (offset <= 1) return "A";
  if (offset === 2 || offset === 3) return model === "C" ? "C" : "B";
  return "C";
}

export function tierMeaning(tier: PriorityTier) {
  if (tier === "A") return "Due tomorrow or sooner. High urgency.";
  if (tier === "B") return "Due in about two days. Worth staying current if it will be reviewed later.";
  return "Not due soon. Skipping these over and over adds up.";
}
