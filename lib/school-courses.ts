import "server-only";

import { COURSE_COLORS } from "@/lib/course-colors";
import { rankSchoolCourses, type SchoolCourseHit } from "@/lib/school-course-match";
import { schoolKey } from "@/lib/school-feed";
import { createAdminClient } from "@/lib/supabase/admin";

export const SCHOOL_COURSE_MIGRATION =
  "Matching class names needs a database update (supabase/migrations/0008_school_courses.sql).";

const MISSING = /school_courses|user_courses|school_course_id|schema cache/i;

type Admin = ReturnType<typeof createAdminClient>;

export type OwnedCourse = { id: string; name: string; color: string; teacher: string };

export type AddCourseResult =
  | { ok: true; course: OwnedCourse; notice: string | null }
  | { ok: false; error: string };

export type SchoolCourseSearch = { suggestions: SchoolCourseHit[]; notice: string | null };

type CourseDraft = {
  name?: string;
  teacher?: string;
  period?: string;
  /** Set only after the student clicks a suggestion. Never inferred from text. */
  schoolCourseId?: string;
};

function clean(value: string | null | undefined) {
  return (value ?? "").trim().replace(/\s+/g, " ");
}

function sameText(a: string | null | undefined, b: string | null | undefined) {
  return clean(a).toLowerCase() === clean(b).toLowerCase();
}

function missing(message: string) {
  return MISSING.test(message);
}

function validateDraft(input: CourseDraft): { name: string; teacher: string; period: string | null } | { error: string } {
  const name = clean(input.name);
  const teacher = clean(input.teacher);
  const period = clean(input.period);
  if (!name) return { error: "Enter a class name." };
  if (name.length > 60) return { error: "Keep the class name under 60 characters." };
  if (name.toLowerCase() === "unsorted") return { error: "Pick a different name." };
  if (teacher.length > 80) return { error: "Keep the teacher name under 80 characters." };
  if (period.length > 40) return { error: "Keep the period under 40 characters." };
  return { name, teacher, period: period || null };
}

async function schoolName(admin: Admin, profileId: string) {
  const { data, error } = await admin.from("profiles").select("school").eq("id", profileId).maybeSingle();
  if (error) throw new Error(error.message);
  return clean(data?.school);
}

function ilikeLiteral(value: string) {
  return value.replace(/[%_\\]/g, "\\$&");
}

async function coursesAtSchool(admin: Admin, school: string): Promise<SchoolCourseHit[] | "missing"> {
  const { data, error } = await admin
    .from("school_courses")
    .select("id, school_name, name, teacher, period")
    .ilike("school_name", ilikeLiteral(school))
    .limit(1000);
  if (error) {
    if (missing(error.message)) return "missing";
    throw new Error(error.message);
  }
  const key = schoolKey(school);
  return (data ?? [])
    .filter((row) => schoolKey(row.school_name) === key)
    .map((row) => ({
      id: row.id,
      name: row.name,
      teacher: row.teacher ?? "",
      period: row.period,
    }));
}

export async function findSchoolCourseSuggestions(
  profileId: string,
  name: string,
  teacher = "",
): Promise<SchoolCourseSearch> {
  const school = await schoolName(createAdminClient(), profileId);
  if (!school) {
    return { suggestions: [], notice: "Add your school on your profile before Pane can match a class name." };
  }
  if (clean(name).length < 2) return { suggestions: [], notice: null };
  const rows = await coursesAtSchool(createAdminClient(), school);
  if (rows === "missing") return { suggestions: [], notice: SCHOOL_COURSE_MIGRATION };
  return { suggestions: rankSchoolCourses({ name, teacher }, rows), notice: null };
}

type PersonalCourse = OwnedCourse & { isUnsorted: boolean; schoolCourseId: string | null };

async function listPersonal(admin: Admin, profileId: string): Promise<PersonalCourse[]> {
  const withLink = await admin
    .from("courses")
    .select("id, name, color, teacher, is_unsorted, school_course_id")
    .eq("user_id", profileId);
  if (withLink.error && missing(withLink.error.message)) {
    const plain = await admin.from("courses").select("id, name, color, teacher, is_unsorted").eq("user_id", profileId);
    if (plain.error) throw new Error(plain.error.message);
    return (plain.data ?? []).map((row) => ({
      id: row.id,
      name: row.name,
      color: row.color,
      teacher: row.teacher ?? "",
      isUnsorted: row.is_unsorted,
      schoolCourseId: null,
    }));
  }
  if (withLink.error) throw new Error(withLink.error.message);
  return (withLink.data ?? []).map((row) => ({
    id: row.id,
    name: row.name,
    color: row.color,
    teacher: row.teacher ?? "",
    isUnsorted: row.is_unsorted,
    schoolCourseId: row.school_course_id,
  }));
}

async function personalCourse(admin: Admin, profileId: string, name: string, teacher: string, schoolCourseId: string | null) {
  const existing = await listPersonal(admin, profileId);
  const found =
    (schoolCourseId ? existing.find((course) => course.schoolCourseId === schoolCourseId) : undefined) ??
    existing.find((course) => !course.isUnsorted && sameText(course.name, name));
  if (found) {
    if (teacher && !sameText(found.teacher, teacher)) {
      await admin.from("courses").update({ teacher }).eq("id", found.id).eq("user_id", profileId);
    }
    return { id: found.id, name: found.name, color: found.color, teacher: teacher || found.teacher };
  }
  const named = existing.filter((course) => !course.isUnsorted).length;
  const { data, error } = await admin
    .from("courses")
    .insert({
      user_id: profileId,
      name,
      teacher: teacher || null,
      color: COURSE_COLORS[named % COURSE_COLORS.length],
      is_unsorted: false,
    })
    .select("id, name, color, teacher")
    .single();
  if (error || !data) {
    if (error && /duplicate|unique/i.test(error.message)) {
      const again = await listPersonal(admin, profileId);
      const retry = again.find((course) => !course.isUnsorted && sameText(course.name, name));
      if (retry) return { id: retry.id, name: retry.name, color: retry.color, teacher: teacher || retry.teacher };
    }
    throw new Error(error?.message ?? "Couldn't create that class.");
  }
  return { id: data.id, name: data.name, color: data.color, teacher: data.teacher ?? teacher };
}

async function rememberLink(admin: Admin, profileId: string, courseId: string, schoolCourseId: string) {
  const { error: joinError } = await admin.from("user_courses").upsert(
    { user_id: profileId, school_course_id: schoolCourseId },
    { onConflict: "user_id,school_course_id", ignoreDuplicates: true },
  );
  if (joinError && !missing(joinError.message)) throw new Error(joinError.message);
  const { error } = await admin
    .from("courses")
    .update({ school_course_id: schoolCourseId })
    .eq("id", courseId)
    .eq("user_id", profileId);
  if (error && !missing(error.message)) throw new Error(error.message);
  if ((joinError && missing(joinError.message)) || (error && missing(error.message))) return false;
  return true;
}

async function exactSchoolCourse(
  admin: Admin,
  profileId: string,
  school: string,
  name: string,
  teacher: string,
  period: string | null,
) {
  const rows = await coursesAtSchool(admin, school);
  if (rows === "missing") return "missing" as const;
  const found = rows.find(
    (row) => sameText(row.name, name) && sameText(row.teacher, teacher) && sameText(row.period, period),
  );
  if (found) return found.id;
  const { data, error } = await admin
    .from("school_courses")
    .insert({
      school_name: school,
      name,
      teacher,
      period,
      created_by: profileId,
    })
    .select("id")
    .single();
  if (error?.code === "23505") {
    const again = await coursesAtSchool(admin, school);
    if (again === "missing") return "missing" as const;
    const retry = again.find(
      (row) => sameText(row.name, name) && sameText(row.teacher, teacher) && sameText(row.period, period),
    );
    if (retry) return retry.id;
  }
  if (error) {
    if (missing(error.message)) return "missing" as const;
    throw new Error(error.message);
  }
  if (!data) throw new Error("Couldn't save that class label.");
  return data.id;
}

/**
 * Creates the student's own course, then links a school label.
 * Passing `schoolCourseId` is the only way to attach an existing near-match.
 * Without it, an existing row is reused only when name, teacher, and period are exact.
 */
export async function addExplicitCourse(profileId: string, input: CourseDraft): Promise<AddCourseResult> {
  const admin = createAdminClient();
  try {
    const school = await schoolName(admin, profileId);
    let name: string;
    let teacher: string;
    let period: string | null;
    let selectedId: string | null = null;

    if (input.schoolCourseId) {
      if (!school) return { ok: false, error: "Add your school on your profile before choosing a shared class." };
      const { data, error } = await admin
        .from("school_courses")
        .select("id, school_name, name, teacher, period")
        .eq("id", input.schoolCourseId)
        .maybeSingle();
      if (error) {
        if (missing(error.message)) return { ok: false, error: SCHOOL_COURSE_MIGRATION };
        throw new Error(error.message);
      }
      if (!data || schoolKey(data.school_name) !== schoolKey(school)) {
        return { ok: false, error: "That class isn't at your school. Create it if you still need it." };
      }
      name = clean(data.name);
      teacher = clean(data.teacher);
      period = clean(data.period) || null;
      selectedId = data.id;
    } else {
      const parsed = validateDraft(input);
      if ("error" in parsed) return { ok: false, error: parsed.error };
      name = parsed.name;
      teacher = parsed.teacher;
      period = parsed.period;
    }

    const course = await personalCourse(admin, profileId, name, teacher, selectedId);
    if (!school) {
      return {
        ok: true,
        course,
        notice: "Add your school on your profile before this class name can be matched at your school.",
      };
    }

    const schoolCourseId =
      selectedId ?? (await exactSchoolCourse(admin, profileId, school, name, teacher, period));
    if (schoolCourseId === "missing") {
      return { ok: true, course, notice: `${SCHOOL_COURSE_MIGRATION} Your class was still saved on your account.` };
    }
    const linked = await rememberLink(admin, profileId, course.id, schoolCourseId);
    if (!linked) {
      return { ok: true, course, notice: `${SCHOOL_COURSE_MIGRATION} Your class was still saved on your account.` };
    }
    return { ok: true, course, notice: null };
  } catch (error) {
    console.error("addExplicitCourse failed", error instanceof Error ? error.message : error);
    return { ok: false, error: "Couldn't create that class. Try again." };
  }
}
