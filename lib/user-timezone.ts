import "server-only";

import { isValidZone } from "@/lib/timezone";

/** The student's IANA time zone, kept in Clerk private metadata (server-only). */
export function storedTimeZone(user: { privateMetadata?: Record<string, unknown> } | null) {
  const value = user?.privateMetadata?.timeZone;
  return typeof value === "string" && isValidZone(value) ? value : null;
}
