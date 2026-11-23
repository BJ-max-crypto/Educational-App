import "server-only";

import { academicYearLabel, canReuseClass, parseAcademicYear } from "@/lib/class-match";
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
  academicYear?: string;
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
  const rich = await admin
    .from("school_courses")
    .select("id, school_name, name, teacher, period, academic_year")
    .ilike("school_name", ilikeLiteral(school))
    .limit(1000);
  let data = rich.data;
  let error = rich.error;
  if (error && /academic_year/i.test(error.message)) {
    const plain = await admin
      .from("school_courses")
      .select("id, school_name, name, teacher, period")
      .ilike("school_name", ilikeLiteral(school))
      .limit(1000);
    data = plain.data?.map((row) => ({ ...row, academic_year: null })) ?? null;
    error = plain.error;
  }
  if (error) {
    if (missing(error.message)) return "missing";
    throw new Error(error.message);
  }
  const key = schoolKey(school);
  const rows = (data ?? []).filter((row) => schoolKey(row.school_name) === key);
  const counts = new Map<string, number>();
  if (rows.length) {
    const memberships = await admin
      .from("user_courses")
      .select("school_course_id")
      .in(
        "school_course_id",
        rows.map((row) => row.id),
      );
    if (!memberships.error) {
      for (const membership of memberships.data ?? []) {
        counts.set(membership.school_course_id, (counts.get(membership.school_course_id) ?? 0) + 1);
      }
    }
  }
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    teacher: row.teacher ?? "",
    period: row.period,
    school: row.school_name,
    academicYear: "academic_year" in row ? row.academic_year : null,
    members: counts.get(row.id) ?? 0,
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

async function rememberLink(
  admin: Admin,
  profileId: string,
  courseId: string,
  schoolCourseId: string,
  owner = false,
) {
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
  if (owner) {
    const roleWrite = await admin
      .from("user_courses")
      .update({ role: "owner" })
      .eq("user_id", profileId)
      .eq("school_course_id", schoolCourseId);
    if (roleWrite.error && !/role|schema cache/i.test(roleWrite.error.message)) throw new Error(roleWrite.error.message);
  }
  return true;
}

function identity(school: string, row: SchoolCourseHit): Parameters<typeof canReuseClass>[0] {
  return {
    school: row.school ?? school,
    name: row.name,
    teacher: row.teacher,
    period: row.period,
    academicYear: row.academicYear ?? null,
  };
}

async function exactSchoolCourse(
  admin: Admin,
  profileId: string,
  school: string,
  name: string,
  teacher: string,
  period: string | null,
  year: string,
) {
  const requested = { school, name, teacher, period, academicYear: year };
  const rows = await coursesAtSchool(admin, school);
  if (rows === "missing") return "missing" as const;
  const found = rows.find((row) => canReuseClass(identity(school, row), requested));
  if (found) {
    if (!parseAcademicYear(found.academicYear) && year) {
      const stamped = await admin.from("school_courses").update({ academic_year: year }).eq("id", found.id);
      if (stamped.error && !/academic_year/i.test(stamped.error.message)) throw new Error(stamped.error.message);
    }
    return { id: found.id, created: false, reused: true };
  }
  let inserted = await admin
    .from("school_courses")
    .insert({
      school_name: school,
      name,
      teacher,
      period,
      academic_year: year,
      created_by: profileId,
    })
    .select("id")
    .single();
  if (inserted.error && /academic_year/i.test(inserted.error.message)) {
    inserted = await admin
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
  }
  const { data, error } = inserted;
  if (error?.code === "23505") {
    const again = await coursesAtSchool(admin, school);
    if (again === "missing") return "missing" as const;
    const retry = again.find((row) => canReuseClass(identity(school, row), requested));
    if (retry) return { id: retry.id, created: false, reused: true };
  }
  if (error) {
    if (missing(error.message)) return "missing" as const;
    throw new Error(error.message);
  }
  if (!data) throw new Error("Couldn't save that class label.");
  return { id: data.id, created: true, reused: false };
}

/**
 * Creates the student's own course, then links a school label.
 * Passing `schoolCourseId` is the only way to attach an existing near-match.
 * Without it, an existing row is reused only when school, name, teacher, period,
 * and academic year match. A different teacher, period, or year stays a new group.
 */
export async function addExplicitCourse(profileId: string, input: CourseDraft): Promise<AddCourseResult> {
  const admin = createAdminClient();
  try {
    const school = await schoolName(admin, profileId);
    let name: string;
    let teacher: string;
    let period: string | null;
    let year = academicYearLabel();
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
      if (input.academicYear) {
        const parsedYear = parseAcademicYear(input.academicYear);
        if (!parsedYear) return { ok: false, error: "Choose an academic year." };
        year = parsedYear;
      }
    }

    const course = await personalCourse(admin, profileId, name, teacher, selectedId);
    if (!school) {
      return {
        ok: true,
        course,
        notice: "Add your school on your profile before this class name can be matched at your school.",
      };
    }

    const resolved = selectedId
      ? { id: selectedId, created: false, reused: false }
      : await exactSchoolCourse(admin, profileId, school, name, teacher, period, year);
    if (resolved === "missing") {
      return { ok: true, course, notice: `${SCHOOL_COURSE_MIGRATION} Your class was still saved on your account.` };
    }
    const linked = await rememberLink(admin, profileId, course.id, resolved.id, resolved.created);
    if (!linked) {
      return { ok: true, course, notice: `${SCHOOL_COURSE_MIGRATION} Your class was still saved on your account.` };
    }
    return {
      ok: true,
      course,
      notice: resolved.reused
        ? "Joined the class that already matches this name, teacher, period, and year."
        : null,
    };
  } catch (error) {
    console.error("addExplicitCourse failed", error instanceof Error ? error.message : error);
    return { ok: false, error: "Couldn't create that class. Try again." };
  }
}

/** Links one of the student's courses to a school group without creating a second course. */
export async function ensureLinkedSchoolCourse(profileId: string, courseId: string) {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("courses")
    .select("id, name, teacher, is_unsorted, school_course_id")
    .eq("id", courseId)
    .eq("user_id", profileId)
    .maybeSingle();
  if (error) {
    if (missing(error.message)) return { ok: false as const, error: SCHOOL_COURSE_MIGRATION };
    throw new Error(error.message);
  }
  if (!data || data.is_unsorted) return { ok: false as const, error: "That class can't be shared." };
  if (data.school_course_id) return { ok: true as const, schoolCourseId: data.school_course_id };
  const school = await schoolName(admin, profileId);
  if (!school) return { ok: false as const, error: "Add your school on your profile before inviting classmates." };
  const resolved = await exactSchoolCourse(
    admin,
    profileId,
    school,
    clean(data.name),
    clean(data.teacher),
    null,
    academicYearLabel(),
  );
  if (resolved === "missing") return { ok: false as const, error: SCHOOL_COURSE_MIGRATION };
  const linked = await rememberLink(admin, profileId, courseId, resolved.id, resolved.created);
  if (!linked) return { ok: false as const, error: SCHOOL_COURSE_MIGRATION };
  return { ok: true as const, schoolCourseId: resolved.id };
}
