import "server-only";

import { AI_MIGRATION } from "@/lib/ai";
import { createAdminClient } from "@/lib/supabase/admin";

const MISSING = /ai_notes|schema cache/i;
export const AI_REFRESH_COOLDOWN_MS = 60_000;

export type AiNote = {
  payload: Record<string, unknown>;
  generatedAt: string;
  forDate: string;
};

export async function readAiNote(profileId: string, kind: string, subject: string): Promise<AiNote | "missing" | null> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("ai_notes")
    .select("payload, generated_at, for_date")
    .eq("user_id", profileId)
    .eq("kind", kind)
    .eq("subject", subject)
    .maybeSingle();
  if (error) {
    if (MISSING.test(error.message)) return "missing";
    throw new Error(error.message);
  }
  if (!data) return null;
  const payload = data.payload;
  return {
    payload: payload && typeof payload === "object" && !Array.isArray(payload) ? payload : {},
    generatedAt: data.generated_at,
    forDate: data.for_date,
  };
}

export async function writeAiNote(
  profileId: string,
  kind: string,
  subject: string,
  note: { forDate: string; timeZone: string; payload: Record<string, unknown>; model: string; generatedAt: string },
) {
  const admin = createAdminClient();
  const { error } = await admin.from("ai_notes").upsert({
    user_id: profileId,
    kind,
    subject,
    for_date: note.forDate,
    time_zone: note.timeZone,
    payload: note.payload,
    model: note.model,
    generated_at: note.generatedAt,
  });
  if (error) {
    if (MISSING.test(error.message)) throw new Error(AI_MIGRATION);
    console.error("ai_notes save failed", error.message);
  }
}

export function cacheIsFresh(note: AiNote, today: string, refresh: boolean, now: number) {
  const fresh = note.forDate === today;
  const coolingDown = now - new Date(note.generatedAt).getTime() < AI_REFRESH_COOLDOWN_MS;
  return (fresh && !refresh) || (refresh && coolingDown && fresh);
}
