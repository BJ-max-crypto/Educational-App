"use server";

import { auth, clerkClient, currentUser } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import { getBusyBlocks } from "@/lib/google-calendar";
import { validateGrade, validateName, validateSchool } from "@/lib/onboarding";
import { syncFeed } from "@/lib/sync";
import type { AssignmentStatus } from "@/lib/types";
import { isValidZone } from "@/lib/timezone";
import { getUserDb } from "@/lib/user-db";
import { storedTimeZone } from "@/lib/user-timezone";

export type ActionResult = { ok: true } | { ok: false; error: string };

const STATUSES: AssignmentStatus[] = ["not_started", "in_progress", "submitted"];

export async function setAssignmentStatus(
  assignmentId: string,
  status: AssignmentStatus,
): Promise<ActionResult> {
  const { userId } = await auth();
  if (!userId) return { ok: false, error: "Your session ended. Sign in again." };
  if (!STATUSES.includes(status)) return { ok: false, error: "Unknown status." };

  const db = await getUserDb(userId);
  if (!db) return { ok: false, error: "Finish onboarding first." };

  const { data, error } = await db.supabase
    .from("assignments")
    .update({
      status: status === "submitted" ? "done" : status,
      status_source: "manual",
      updated_at: new Date().toISOString(),
    })
    .eq("id", assignmentId)
    .eq("user_id", db.profileId)
    .select("id");
  if (error || !data?.length) return { ok: false, error: "Couldn't save that. Try again." };
  return { ok: true };
}

export async function syncNow(): Promise<ActionResult> {
  const { userId } = await auth();
  if (!userId) return { ok: false, error: "Your session ended. Sign in again." };
  const db = await getUserDb(userId);
  if (!db) return { ok: false, error: "Finish onboarding first." };

  const { data: feed } = await db.supabase
    .from("feeds")
    .select("updated_at")
    .eq("user_id", db.profileId)
    .maybeSingle();
  if (feed && Date.now() - new Date(feed.updated_at).getTime() < 20_000) {
    return { ok: false, error: "Synced a moment ago. Try again in a few seconds." };
  }

  const result = await syncFeed(db.profileId, { timeZone: storedTimeZone(await currentUser()) });
  revalidatePath("/", "layout");
  return result.ok ? { ok: true } : result;
}

export type ProfileInput = { name: string; school: string; grade: string };

export async function updateProfile(input: ProfileInput): Promise<ActionResult> {
  const { userId } = await auth();
  if (!userId) return { ok: false, error: "Your session ended. Sign in again." };

  const name = validateName(input.name);
  if ("error" in name) return { ok: false, error: name.error };
  const school = validateSchool(input.school);
  if ("error" in school) return { ok: false, error: school.error };
  const grade = validateGrade(input.grade);
  if ("error" in grade) return { ok: false, error: grade.error };

  try {
    const db = await getUserDb(userId);
    if (!db) return { ok: false, error: "Finish onboarding first." };
    const { data, error } = await db.supabase
      .from("profiles")
      .update({ name: name.value, school: school.value, grade: grade.value })
      .eq("id", db.profileId)
      .select("id");
    if (error || !data?.length) {
      if (error) console.error("updateProfile failed", error.message);
      return { ok: false, error: "Couldn't save your profile. Try again." };
    }
    const clerk = await clerkClient();
    await clerk.users.updateUserMetadata(userId, {
      publicMetadata: { name: name.value, grade: grade.value },
    });
  } catch (error) {
    console.error("updateProfile failed", error);
    return { ok: false, error: "Couldn't save your profile. Try again." };
  }

  revalidatePath("/", "layout");
  return { ok: true };
}

export type CalendarStatus =
  | { status: "connected"; busyCount: number; fetchedAt: string }
  | { status: "not_connected" }
  | { status: "reconnect" | "error"; message: string };

/** Pulls (or reuses, up to an hour old) the next 7 days of Google busy blocks. */
export async function refreshCalendar(force = false): Promise<CalendarStatus> {
  const { userId } = await auth();
  if (!userId) return { status: "error", message: "Your session ended. Sign in again." };
  try {
    const db = await getUserDb(userId);
    if (!db) return { status: "error", message: "Finish onboarding first." };
    const state = await getBusyBlocks(userId, db.profileId, { force });
    if (state.status === "connected") {
      return { status: "connected", busyCount: state.busy.length, fetchedAt: state.fetchedAt };
    }
    return state;
  } catch (error) {
    console.error("refreshCalendar failed", error);
    return { status: "error", message: "Couldn't read Google Calendar." };
  }
}

/**
 * Saves the browser's time zone. The Schoology feed names none, so all-day items need it to
 * land at 11:59 PM local instead of UTC. A change re-syncs so stored due times are corrected.
 */
export async function rememberTimeZone(timeZone: string): Promise<{ changed: boolean }> {
  const user = await currentUser();
  if (!user || !isValidZone(timeZone) || storedTimeZone(user) === timeZone) return { changed: false };
  try {
    const clerk = await clerkClient();
    await clerk.users.updateUserMetadata(user.id, { privateMetadata: { timeZone } });
    const db = await getUserDb(user.id);
    if (db) await syncFeed(db.profileId, { timeZone });
  } catch (error) {
    console.error("rememberTimeZone failed", error);
    return { changed: false };
  }
  revalidatePath("/", "layout");
  return { changed: true };
}
