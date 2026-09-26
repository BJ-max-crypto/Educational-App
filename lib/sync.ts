import "server-only";

import { decryptSecret } from "@/lib/crypto";
import { parseIcal } from "@/lib/ical/parse";
import { validateIcalUrl } from "@/lib/onboarding";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Database } from "@/lib/supabase/database";

type AssignmentInsert = Database["public"]["Tables"]["assignments"]["Insert"];

export type SyncResult = { ok: true; imported: number } | { ok: false; error: string };

/** A synced feed older than this refreshes in the background on the next page load. */
export const STALE_AFTER_MS = 30 * 60 * 1000;
/** Minimum gap between automatic attempts, so a failing feed is not retried on every request. */
export const RETRY_AFTER_MS = 10 * 60 * 1000;
/** Items due before this window are skipped. The feed cannot say what was already turned in. */
const LOOKBACK_MS = 14 * 24 * 60 * 60 * 1000;
const MAX_BYTES = 5 * 1024 * 1024;
const FETCH_TIMEOUT_MS = 15_000;
const UNSORTED = "Unsorted";

/** Assigned to courses in the order they are first seen. */
const COURSE_COLORS = ["#4f7cff", "#c43b6e", "#1b7f60", "#c4552b", "#9a5b0a", "#5b45d6", "#2f6f9f", "#7a4ea3"];

class SyncError extends Error {}

async function fetchCalendar(url: string) {
  let response: Response;
  try {
    response = await fetch(url, {
      headers: { Accept: "text/calendar, */*;q=0.5", "User-Agent": "Pane/1.0 (+calendar sync)" },
      redirect: "follow",
      cache: "no-store",
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
  } catch (error) {
    if (error instanceof Error && error.name === "TimeoutError") {
      throw new SyncError("Schoology took too long to respond. Try again in a minute.");
    }
    throw new SyncError("Couldn't reach Schoology. Try again in a minute.");
  }

  const finalHost = new URL(response.url || url).hostname.toLowerCase();
  if (finalHost !== "schoology.com" && !finalHost.endsWith(".schoology.com")) {
    throw new SyncError("The calendar link redirected away from Schoology.");
  }
  if (response.status === 401 || response.status === 403 || response.status === 404) {
    throw new SyncError("Schoology rejected this calendar link. Copy a fresh iCal link from Schoology.");
  }
  if (!response.ok) throw new SyncError(`Schoology returned an error (${response.status}).`);

  const declared = Number(response.headers.get("content-length") ?? 0);
  if (declared > MAX_BYTES) throw new SyncError("That calendar is too large to import.");
  const text = await response.text();
  if (text.length > MAX_BYTES) throw new SyncError("That calendar is too large to import.");
  if (!/BEGIN:VCALENDAR/i.test(text)) {
    throw new SyncError("That link didn't return a calendar. Copy the iCal link from Schoology.");
  }
  return text;
}

async function recordFailure(profileId: string, message: string) {
  const supabase = createAdminClient();
  await supabase
    .from("feeds")
    .update({ status: "error", last_error: message, updated_at: new Date().toISOString() })
    .eq("user_id", profileId);
}

/**
 * Pulls the user's Schoology iCal feed and upserts courses and assignments.
 * Uses the service role (the encrypted URL and writes are server-side only); every
 * query is filtered to `profileId`, which callers resolve from the verified Clerk user id.
 * Assignment status is never overwritten: iCal has no submission state.
 */
export async function syncFeed(profileId: string): Promise<SyncResult> {
  const supabase = createAdminClient();
  const startedAt = new Date();
  const startedIso = startedAt.toISOString();

  try {
    const { data: feed, error: feedError } = await supabase
      .from("feeds")
      .select("ical_url_encrypted")
      .eq("user_id", profileId)
      .maybeSingle();
    if (feedError) throw new Error(`feed lookup: ${feedError.message}`);
    if (!feed?.ical_url_encrypted) throw new SyncError("No calendar link saved yet.");

    await supabase.from("feeds").update({ updated_at: startedIso }).eq("user_id", profileId);

    let url: string;
    try {
      url = decryptSecret(feed.ical_url_encrypted);
    } catch {
      throw new SyncError("Your saved calendar link can't be read. Add it again.");
    }
    const checked = validateIcalUrl(url);
    if ("error" in checked) throw new SyncError(checked.error);

    const { events } = parseIcal(await fetchCalendar(checked.value));
    const cutoff = startedAt.getTime() - LOOKBACK_MS;
    const items = events.filter((event) => event.dueAt && new Date(event.dueAt).getTime() >= cutoff);

    const { data: existingCourses, error: coursesError } = await supabase
      .from("courses")
      .select("id, name")
      .eq("user_id", profileId);
    if (coursesError) throw new Error(`courses lookup: ${coursesError.message}`);

    const courseIds = new Map(existingCourses.map((course) => [course.name, course.id]));
    const wanted = [...new Set(items.map((item) => item.courseHint ?? UNSORTED))];
    const missing = wanted.filter((name) => !courseIds.has(name));
    if (missing.length > 0) {
      const { data: created, error } = await supabase
        .from("courses")
        .upsert(
          missing.map((name, index) => ({
            user_id: profileId,
            name,
            color: COURSE_COLORS[(existingCourses.length + index) % COURSE_COLORS.length],
            is_unsorted: name === UNSORTED,
          })),
          { onConflict: "user_id,name", ignoreDuplicates: true },
        )
        .select("id, name");
      if (error) throw new Error(`course insert: ${error.message}`);
      for (const course of created ?? []) courseIds.set(course.name, course.id);
      if (missing.some((name) => !courseIds.has(name))) {
        const { data: again } = await supabase.from("courses").select("id, name").eq("user_id", profileId);
        for (const course of again ?? []) courseIds.set(course.name, course.id);
      }
    }

    const { data: existingAssignments, error: assignmentsError } = await supabase
      .from("assignments")
      .select("id, external_uid, course_id, course_source, missing_from_feed")
      .eq("user_id", profileId);
    if (assignmentsError) throw new Error(`assignments lookup: ${assignmentsError.message}`);
    const byUid = new Map(existingAssignments.map((row) => [row.external_uid, row]));

    const rows: AssignmentInsert[] = items.map((item) => {
      const previous = byUid.get(item.uid);
      const keepManual = previous?.course_source === "manual";
      const courseName = item.courseHint ?? UNSORTED;
      return {
        user_id: profileId,
        external_uid: item.uid,
        title: item.title,
        description: item.description,
        due_at: item.dueAt,
        url: item.url,
        course_id: keepManual ? previous.course_id : courseIds.get(courseName)!,
        course_source: keepManual ? "manual" : item.courseHint ? "inferred" : "unsorted",
        last_seen_in_feed_at: startedIso,
        missing_from_feed: false,
      };
    });

    for (let i = 0; i < rows.length; i += 500) {
      const { error } = await supabase
        .from("assignments")
        .upsert(rows.slice(i, i + 500), { onConflict: "user_id,external_uid" });
      if (error) throw new Error(`assignment upsert: ${error.message}`);
    }

    const seen = new Set(items.map((item) => item.uid));
    const gone = existingAssignments
      .filter((row) => !seen.has(row.external_uid) && !row.missing_from_feed)
      .map((row) => row.id);
    for (let i = 0; i < gone.length; i += 200) {
      const { error } = await supabase
        .from("assignments")
        .update({ missing_from_feed: true })
        .eq("user_id", profileId)
        .in("id", gone.slice(i, i + 200));
      if (error) throw new Error(`mark missing: ${error.message}`);
    }

    await supabase
      .from("feeds")
      .update({
        status: "ok",
        last_error: null,
        last_synced_at: startedIso,
        updated_at: new Date().toISOString(),
      })
      .eq("user_id", profileId);

    return { ok: true, imported: rows.length };
  } catch (error) {
    const message =
      error instanceof SyncError ? error.message : "Something went wrong syncing your calendar.";
    if (!(error instanceof SyncError)) console.error("sync failed", profileId, error);
    await recordFailure(profileId, message).catch(() => {});
    return { ok: false, error: message };
  }
}

export function shouldAutoSync(feed: {
  last_synced_at: string | null;
  updated_at: string;
}, now = Date.now()) {
  const lastAttempt = new Date(feed.updated_at).getTime();
  if (now - lastAttempt < RETRY_AFTER_MS) return false;
  if (!feed.last_synced_at) return true;
  return now - new Date(feed.last_synced_at).getTime() > STALE_AFTER_MS;
}
