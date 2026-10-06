import "server-only";

import { initials } from "@/lib/dates";
import type { Assignment, Course, FeedSummary } from "@/lib/types";
import type { UserDb } from "@/lib/user-db";

export type StoredCoursework = {
  profile: {
    name: string | null;
    school: string | null;
    grade: string | null;
    school_location: string | null;
  } | null;
  courses: Course[];
  assignments: Assignment[];
  feed: (FeedSummary & { updatedAt: string }) | null;
};

const EMPTY: StoredCoursework = { profile: null, courses: [], assignments: [], feed: null };

export async function loadCoursework(db: UserDb | null): Promise<StoredCoursework> {
  if (!db) return EMPTY;
  const { supabase, profileId } = db;

  const profileQuery = await supabase
    .from("profiles")
    .select("name, school, grade, school_location")
    .eq("id", profileId)
    .maybeSingle();
  const profile =
    profileQuery.error && /school_location/i.test(profileQuery.error.message)
      ? await supabase.from("profiles").select("name, school, grade").eq("id", profileId).maybeSingle()
      : profileQuery;
  const [courses, assignments, feed] = await Promise.all([
    supabase
      .from("courses")
      .select("id, name, teacher, color, is_unsorted")
      .eq("user_id", profileId)
      .order("name"),
    supabase
      .from("assignments")
      .select("id, course_id, title, due_at, url, status, status_source")
      .eq("user_id", profileId)
      .eq("missing_from_feed", false)
      .not("due_at", "is", null)
      .order("due_at"),
    supabase
      .from("feeds")
      .select("status, last_synced_at, last_error, updated_at")
      .eq("user_id", profileId)
      .maybeSingle(),
  ]);

  for (const result of [profile, courses, assignments, feed]) {
    if (result.error) console.error("loadCoursework", result.error.message);
  }

  const mappedAssignments: Assignment[] = (assignments.data ?? []).map((row) => ({
    id: row.id,
    courseId: row.course_id,
    title: row.title,
    dueAt: row.due_at!,
    status: row.status === "done" ? "submitted" : row.status,
    statusSource: row.status_source,
    url: row.url ?? undefined,
  }));
  const usedCourses = new Set(mappedAssignments.map((item) => item.courseId));

  const mappedCourses: Course[] = (courses.data ?? [])
    .filter((course) => !course.is_unsorted || usedCourses.has(course.id))
    .sort((a, b) => Number(a.is_unsorted) - Number(b.is_unsorted))
    .map((course) => ({
      id: course.id,
      name: course.name,
      teacher: course.teacher ?? "",
      color: course.color,
      initials: initials(course.name),
      isUnsorted: course.is_unsorted,
    }));

  const profileRow = profile.data;
  return {
    profile: profileRow
      ? {
          name: profileRow.name,
          school: profileRow.school,
          grade: profileRow.grade,
          school_location: (() => {
            if (!("school_location" in profileRow)) return null;
            const value = profileRow.school_location;
            return typeof value === "string" ? value : null;
          })(),
        }
      : null,
    courses: mappedCourses,
    assignments: mappedAssignments,
    feed: feed.data
      ? {
          status: feed.data.status,
          lastSyncedAt: feed.data.last_synced_at,
          lastError: feed.data.last_error,
          updatedAt: feed.data.updated_at,
        }
      : null,
  };
}
