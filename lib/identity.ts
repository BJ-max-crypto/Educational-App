/** A count below this can point at a specific person, so it is not shown. */
export const SCHOOL_COUNT_FLOOR = 5;

/**
 * The other person's full name. Returns null unless this pair is approved.
 * Callers must omit the raw name from any response when this returns null.
 */
export function nameForViewer(approved: boolean, name: string | null | undefined): string | null {
  if (!approved) return null;
  const trimmed = name?.trim();
  return trimmed || null;
}

/** Heading for a person. Uses the full name only when `nameForViewer` provided one. */
export function publicLabel(name: string | null, username: string) {
  return name?.trim() || `@${username}`;
}

/** Mutual friends: people you are connected to who are also connected to this person. */
export function connectionLabel(count: number) {
  return `${count} ${count === 1 ? "Connection" : "Connections"}`;
}

export function visibleSchoolCount(others: number): number | null {
  if (!Number.isInteger(others) || others < SCHOOL_COUNT_FLOOR) return null;
  return others;
}
