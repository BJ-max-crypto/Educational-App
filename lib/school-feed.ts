import "server-only";

import { COURSE_COLORS } from "@/lib/course-colors";
import { courseKey } from "@/lib/members";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Schoolmate } from "@/lib/types";

export const SCHOOL_MIGRATION =
  "School classes need a database update (supabase/migrations/0007_school_and_shared_feed.sql).";

const MISSING = /school_location|school_classes|school_class_items|school_class_members|schema cache/i;

type Admin = ReturnType<typeof createAdminClient>;

export function schoolKey(value: string | null | undefined) {
  return (value ?? "").trim().replace(/\s+/g, " ").toLowerCase();
}

export function locationKey(value: string | null | undefined) {
  return (value ?? "").trim().replace(/\s+/g, " ").toLowerCase();
}

export function isSchoolMigrationError(message: string) {
  return MISSING.test(message);
}

async function place(admin: Admin, profileId: string) {
  const { data, error } = await admin
    .from("profiles")
    .select("school, school_location")
    .eq("id", profileId)
    .maybeSingle();
  if (error) {
    if (MISSING.test(error.message)) return { missing: true as const };
    throw new Error(error.message);
  }
  const school = schoolKey(data?.school);
  if (!school) return { missing: false as const, place: null };
  return {
    missing: false as const,
    place: {
      school,
      location: locationKey(data?.school_location),
      schoolName: data?.school?.trim() || "",
      locationName: data?.school_location?.trim() || "",
    },
  };
}

async function ensureClass(admin: Admin, profileId: string, name: string, color: string) {
  const located = await place(admin, profileId);
  if (located.missing || !located.place) return null;
  const where = located.place;
  const nameKey = courseKey(name);
  const { error: insertError } = await admin.from("school_classes").upsert(
    {
      school_key: where.school,
      location_key: where.location,
      name: name.trim(),
      name_key: nameKey,
      color,
      created_by: profileId,
    },
    { onConflict: "school_key,location_key,name_key", ignoreDuplicates: true },
  );
  if (insertError) {
    if (MISSING.test(insertError.message)) return null;
    throw new Error(insertError.message);
  }
  const { data, error } = await admin
    .from("school_classes")
    .select("id, name, color")
    .eq("school_key", where.school)
    .eq("location_key", where.location)
    .eq("name_key", nameKey)
    .maybeSingle();
  if (error) {
    if (MISSING.test(error.message)) return null;
    throw new Error(error.message);
  }
  if (!data) return null;
  const { error: memberError } = await admin.from("school_class_members").upsert(
    { school_class_id: data.id, profile_id: profileId },
    { onConflict: "school_class_id,profile_id", ignoreDuplicates: true },
  );
  if (memberError && !MISSING.test(memberError.message)) throw new Error(memberError.message);
  return { id: data.id, name: data.name, color: data.color };
}

async function ensurePersonalCourse(admin: Admin, profileId: string, name: string, color: string) {
  const { data: existing, error } = await admin
    .from("courses")
    .select("id, name, color, is_unsorted")
    .eq("user_id", profileId);
  if (error) throw new Error(error.message);
  const found = (existing ?? []).find((course) => !course.is_unsorted && courseKey(course.name) === courseKey(name));
  if (found) return found;
  const named = (existing ?? []).filter((course) => !course.is_unsorted).length;
  const { data, error: insertError } = await admin
    .from("courses")
    .insert({
      user_id: profileId,
      name: name.trim(),
      color: color || COURSE_COLORS[named % COURSE_COLORS.length],
      is_unsorted: false,
    })
    .select("id, name, color, is_unsorted")
    .single();
  if (insertError || !data) {
    if (insertError && /duplicate|unique/i.test(insertError.message)) {
      const { data: again } = await admin
        .from("courses")
        .select("id, name, color, is_unsorted")
        .eq("user_id", profileId);
      const retry = (again ?? []).find((course) => !course.is_unsorted && courseKey(course.name) === courseKey(name));
      if (retry) return retry;
    }
    throw new Error(insertError?.message ?? "Couldn't create that class.");
  }
  return data;
}

/** Copies the shared class feed onto one person's list. Checkmarks stay their own. */
async function copyFeed(admin: Admin, profileId: string, schoolClassId: string, className: string, color: string) {
  const course = await ensurePersonalCourse(admin, profileId, className, color);
  const { data: items, error: itemsError } = await admin
    .from("school_class_items")
    .select("external_uid, title, description, due_at, url")
    .eq("school_class_id", schoolClassId)
    .limit(400);
  if (itemsError) {
    if (MISSING.test(itemsError.message)) return;
    throw new Error(itemsError.message);
  }
  const { data: existing, error: existingError } = await admin
    .from("assignments")
    .select("id, external_uid, course_id, course_source")
    .eq("user_id", profileId);
  if (existingError) throw new Error(existingError.message);
  const byUid = new Map((existing ?? []).map((row) => [row.external_uid, row]));
  const now = new Date().toISOString();
  const inserts: {
    user_id: string;
    course_id: string;
    external_uid: string;
    title: string;
    description: string | null;
    due_at: string | null;
    url: string | null;
    status: "not_started";
    status_source: "inferred";
    course_source: "manual";
    missing_from_feed: boolean;
  }[] = [];
  const overrides: { user_id: string; schoology_uid: string; course_id: string; updated_at: string }[] = [];

  for (const item of items ?? []) {
    if (!item.external_uid || item.external_uid.startsWith("class:")) continue;
    const own = byUid.get(item.external_uid);
    if (own) {
      if (own.course_id !== course.id && own.course_source !== "manual") {
        await admin
          .from("assignments")
          .update({ course_id: course.id, course_source: "manual", updated_at: now })
          .eq("id", own.id)
          .eq("user_id", profileId);
        overrides.push({
          user_id: profileId,
          schoology_uid: item.external_uid,
          course_id: course.id,
          updated_at: now,
        });
      }
      continue;
    }
    const copyUid = `class:${schoolClassId}:${item.external_uid}`;
    if (byUid.has(copyUid)) continue;
    inserts.push({
      user_id: profileId,
      course_id: course.id,
      external_uid: copyUid,
      title: item.title,
      description: item.description,
      due_at: item.due_at,
      url: item.url,
      status: "not_started",
      status_source: "inferred",
      course_source: "manual",
      missing_from_feed: false,
    });
  }

  for (let i = 0; i < inserts.length; i += 200) {
    const { error } = await admin.from("assignments").upsert(inserts.slice(i, i + 200), {
      onConflict: "user_id,external_uid",
      ignoreDuplicates: true,
    });
    if (error) throw new Error(error.message);
  }
  if (overrides.length) {
    const { error } = await admin.from("assignment_course_overrides").upsert(overrides, {
      onConflict: "user_id,schoology_uid",
    });
    if (error && !/assignment_course_overrides/i.test(error.message)) throw new Error(error.message);
  }
}

async function fanOut(admin: Admin, schoolClassId: string, className: string, color: string) {
  const { data: members, error } = await admin
    .from("school_class_members")
    .select("profile_id")
    .eq("school_class_id", schoolClassId);
  if (error) {
    if (MISSING.test(error.message)) return;
    throw new Error(error.message);
  }
  for (const member of members ?? []) {
    await copyFeed(admin, member.profile_id, schoolClassId, className, color);
  }
}

/** Puts this person's tagged items on the shared class feed and gives every member the same list. */
export async function publishCourse(profileId: string, courseId: string) {
  try {
    const admin = createAdminClient();
    const { data: course, error } = await admin
      .from("courses")
      .select("id, name, color, is_unsorted")
      .eq("id", courseId)
      .eq("user_id", profileId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!course || course.is_unsorted) return;
    const schoolClass = await ensureClass(admin, profileId, course.name, course.color);
    if (!schoolClass) return;
    const { data: rows, error: rowsError } = await admin
      .from("assignments")
      .select("external_uid, title, description, due_at, url")
      .eq("user_id", profileId)
      .eq("course_id", courseId);
    if (rowsError) throw new Error(rowsError.message);
    const items = (rows ?? []).filter((row) => row.external_uid && !row.external_uid.startsWith("class:")).slice(0, 400);
    if (items.length) {
      const now = new Date().toISOString();
      const { error: upsertError } = await admin.from("school_class_items").upsert(
        items.map((row) => ({
          school_class_id: schoolClass.id,
          external_uid: row.external_uid,
          title: row.title,
          description: row.description,
          due_at: row.due_at,
          url: row.url,
          updated_at: now,
        })),
        { onConflict: "school_class_id,external_uid" },
      );
      if (upsertError) {
        if (MISSING.test(upsertError.message)) return;
        throw new Error(upsertError.message);
      }
    }
    await fanOut(admin, schoolClass.id, schoolClass.name, schoolClass.color);
  } catch (error) {
    console.error("publishCourse failed", error);
  }
}

/** Joins a class name at this person's school and copies that class's feed onto their list. */
export async function joinNamedClass(profileId: string, name: string, color?: string) {
  const admin = createAdminClient();
  const located = await place(admin, profileId);
  if (located.missing) return { ok: false as const, error: SCHOOL_MIGRATION };
  if (!located.place) return { ok: false as const, error: "Add your school and its location first." };
  const chosen = color || COURSE_COLORS[0];
  const schoolClass = await ensureClass(admin, profileId, name, chosen);
  if (!schoolClass) return { ok: false as const, error: SCHOOL_MIGRATION };
  await copyFeed(admin, profileId, schoolClass.id, schoolClass.name, schoolClass.color);
  return { ok: true as const, courseName: schoolClass.name };
}

export async function listSchoolmates(profileId: string): Promise<{ people: Schoolmate[]; notice: string | null }> {
  const admin = createAdminClient();
  const located = await place(admin, profileId);
  if (located.missing) return { people: [], notice: SCHOOL_MIGRATION };
  if (!located.place) return { people: [], notice: null };
  if (!located.place.location) return { people: [], notice: null };
  const { data, error } = await admin
    .from("profiles")
    .select("id, name, username, school, school_location, grade")
    .ilike("school", located.place.schoolName)
    .neq("id", profileId)
    .limit(40);
  if (error) {
    if (MISSING.test(error.message)) return { people: [], notice: SCHOOL_MIGRATION };
    throw new Error(error.message);
  }
  const rows = (data ?? []).filter(
    (row) =>
      row.username &&
      schoolKey(row.school) === located.place!.school &&
      locationKey(row.school_location) === located.place!.location,
  );
  const ids = rows.map((row) => row.id);
  const classes = new Map<string, string[]>();
  if (ids.length) {
    const { data: courses, error: coursesError } = await admin
      .from("courses")
      .select("user_id, name, is_unsorted")
      .in("user_id", ids)
      .eq("is_unsorted", false);
    if (coursesError) throw new Error(coursesError.message);
    for (const course of courses ?? []) {
      const list = classes.get(course.user_id) ?? [];
      if (!list.some((name) => courseKey(name) === courseKey(course.name))) list.push(course.name);
      classes.set(course.user_id, list);
    }
  }
  return {
    notice: null,
    people: rows.slice(0, 12).map((row) => ({
      profileId: row.id,
      name: row.name?.trim() || row.username!,
      username: row.username!,
      school: row.school?.trim() || null,
      schoolLocation: row.school_location?.trim() || null,
      grade: row.grade?.trim() || null,
      classes: (classes.get(row.id) ?? []).slice(0, 8),
    })),
  };
}
