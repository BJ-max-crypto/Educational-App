"use server";

import { auth, clerkClient, currentUser } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import { COURSE_COLORS } from "@/lib/course-colors";
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

export type CreateCourseResult =
  | { ok: true; course: { id: string; name: string; color: string } }
  | { ok: false; error: string };

export async function createCourse(rawName: string): Promise<CreateCourseResult> {
  const { userId } = await auth();
  if (!userId) return { ok: false, error: "Your session ended. Sign in again." };
  const name = rawName.trim().replace(/\s+/g, " ");
  if (!name) return { ok: false, error: "Enter a course name." };
  if (name.length > 60) return { ok: false, error: "Keep the course name under 60 characters." };
  if (name.toLowerCase() === "unsorted") return { ok: false, error: "Pick a different name." };

  try {
    const db = await getUserDb(userId);
    if (!db) return { ok: false, error: "Finish onboarding first." };
    const { data: existing } = await db.supabase
      .from("courses")
      .select("id, name, color")
      .eq("user_id", db.profileId);
    const same = existing?.find((course) => course.name.toLowerCase() === name.toLowerCase());
    if (same) return { ok: true, course: same };

    const named = (existing ?? []).filter((course) => course.name !== "Unsorted").length;
    const { data, error } = await db.supabase
      .from("courses")
      .insert({
        user_id: db.profileId,
        name,
        color: COURSE_COLORS[named % COURSE_COLORS.length],
        is_unsorted: false,
      })
      .select("id, name, color")
      .single();
    if (error || !data) {
      if (error) console.error("createCourse failed", error.message);
      return { ok: false, error: "Couldn't create that course. Try again." };
    }
    revalidatePath("/", "layout");
    return { ok: true, course: data };
  } catch (error) {
    console.error("createCourse failed", error);
    return { ok: false, error: "Couldn't create that course. Try again." };
  }
}

/**
 * Tags assignments with a course. The choice is saved per Schoology UID in
 * assignment_course_overrides so every later sync applies it. `courseId: null` moves the
 * items back to Unsorted and forgets the tag.
 */
export async function setAssignmentCourses(
  assignmentIds: string[],
  courseId: string | null,
): Promise<ActionResult> {
  const { userId } = await auth();
  if (!userId) return { ok: false, error: "Your session ended. Sign in again." };
  const ids = [...new Set(assignmentIds)].slice(0, 500);
  if (ids.length === 0) return { ok: true };

  try {
    const db = await getUserDb(userId);
    if (!db) return { ok: false, error: "Finish onboarding first." };
    const { supabase, profileId } = db;

    const { data: courses, error: coursesError } = await supabase
      .from("courses")
      .select("id, name, is_unsorted")
      .eq("user_id", profileId);
    if (coursesError) throw new Error(coursesError.message);
    let target = courseId ? courses.find((course) => course.id === courseId) : undefined;
    if (courseId && !target) return { ok: false, error: "That course isn't on your list." };
    if (target?.is_unsorted) {
      target = undefined;
      courseId = null;
    }

    let unsortedId = courses.find((course) => course.is_unsorted)?.id;
    if (!courseId && !unsortedId) {
      const { data: created, error } = await supabase
        .from("courses")
        .upsert(
          { user_id: profileId, name: "Unsorted", color: COURSE_COLORS[0], is_unsorted: true },
          { onConflict: "user_id,name" },
        )
        .select("id")
        .single();
      if (error || !created) throw new Error(error?.message ?? "no unsorted course");
      unsortedId = created.id;
    }

    const { data: rows, error: rowsError } = await supabase
      .from("assignments")
      .select("id, external_uid")
      .eq("user_id", profileId)
      .in("id", ids);
    if (rowsError) throw new Error(rowsError.message);
    if (!rows.length) return { ok: false, error: "Those items aren't on your list." };
    const uids = rows.map((row) => row.external_uid);
    const now = new Date().toISOString();

    if (courseId) {
      const { error } = await supabase.from("assignment_course_overrides").upsert(
        uids.map((uid) => ({
          user_id: profileId,
          schoology_uid: uid,
          course_id: courseId!,
          updated_at: now,
        })),
        { onConflict: "user_id,schoology_uid" },
      );
      if (error) {
        console.error("override save failed", error.message);
        return {
          ok: false,
          error: /assignment_course_overrides/.test(error.message)
            ? "Course tags need a database update (supabase/migrations/0004_assignment_course_overrides.sql)."
            : "Couldn't save that tag. Try again.",
        };
      }
    } else {
      const { error } = await supabase
        .from("assignment_course_overrides")
        .delete()
        .eq("user_id", profileId)
        .in("schoology_uid", uids);
      if (error) console.error("override delete failed", error.message);
    }

    const { error: updateError } = await supabase
      .from("assignments")
      .update({
        course_id: courseId ?? unsortedId!,
        course_source: courseId ? "manual" : "unsorted",
        updated_at: now,
      })
      .eq("user_id", profileId)
      .in(
        "id",
        rows.map((row) => row.id),
      );
    if (updateError) throw new Error(updateError.message);
  } catch (error) {
    console.error("setAssignmentCourses failed", error);
    return { ok: false, error: "Couldn't save that tag. Try again." };
  }

  revalidatePath("/", "layout");
  return { ok: true };
}
