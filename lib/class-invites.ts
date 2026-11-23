import "server-only";

import {
  CLASS_CODE,
  classInviteCode,
  invitationExpiry,
  invitationState,
  type ClassInvitePanel,
  type ClassMember,
  type ClassPreview,
} from "@/lib/class-match";
import { addExplicitCourse, ensureLinkedSchoolCourse } from "@/lib/school-courses";
import { schoolKey } from "@/lib/school-feed";
import { createAdminClient } from "@/lib/supabase/admin";

export const CLASS_INVITE_MIGRATION =
  "Class invitations need a database update (supabase/migrations/0015_class_invitations.sql).";

type Admin = ReturnType<typeof createAdminClient>;

type GroupRow = {
  id: string;
  school_name: string;
  name: string;
  teacher: string | null;
  period: string | null;
  academic_year: string | null;
  created_by: string | null;
};

type InviteRow = {
  id: string;
  school_course_id: string;
  code: string;
  created_by: string | null;
  expires_at: string | null;
  revoked_at: string | null;
  created_at: string;
};

function missingInviteTable(message: string) {
  return /class_invitations|schema cache/i.test(message);
}

function yearColumnMissing(message: string) {
  return /academic_year/i.test(message);
}

function roleColumnMissing(message: string) {
  return /\brole\b/i.test(message);
}

async function profileSchool(admin: Admin, profileId: string) {
  const { data, error } = await admin.from("profiles").select("school, name").eq("id", profileId).maybeSingle();
  if (error) throw new Error(error.message);
  return { school: (data?.school ?? "").trim(), name: (data?.name ?? "").trim() };
}

async function loadGroup(admin: Admin, schoolCourseId: string): Promise<GroupRow | null | "missing"> {
  const rich = await admin
    .from("school_courses")
    .select("id, school_name, name, teacher, period, academic_year, created_by")
    .eq("id", schoolCourseId)
    .maybeSingle();
  if (rich.error && yearColumnMissing(rich.error.message)) {
    const plain = await admin
      .from("school_courses")
      .select("id, school_name, name, teacher, period, created_by")
      .eq("id", schoolCourseId)
      .maybeSingle();
    if (plain.error) {
      if (/school_courses|schema cache/i.test(plain.error.message)) return "missing";
      throw new Error(plain.error.message);
    }
    if (!plain.data) return null;
    return { ...plain.data, academic_year: null };
  }
  if (rich.error) {
    if (/school_courses|schema cache/i.test(rich.error.message)) return "missing";
    throw new Error(rich.error.message);
  }
  return rich.data;
}

async function memberCount(admin: Admin, schoolCourseId: string) {
  const { count, error } = await admin
    .from("user_courses")
    .select("user_id", { count: "exact", head: true })
    .eq("school_course_id", schoolCourseId);
  if (error) return 0;
  return count ?? 0;
}

async function listMembers(admin: Admin, schoolCourseId: string): Promise<ClassMember[]> {
  const { data, error } = await admin
    .from("user_courses")
    .select("user_id, created_at")
    .eq("school_course_id", schoolCourseId)
    .order("created_at", { ascending: true })
    .limit(80);
  if (error) throw new Error(error.message);
  const ids = (data ?? []).map((row) => row.user_id);
  if (!ids.length) return [];
  const profiles = await admin.from("profiles").select("id, name, username").in("id", ids);
  if (profiles.error) throw new Error(profiles.error.message);
  const byId = new Map((profiles.data ?? []).map((row) => [row.id, row]));
  return ids.flatMap((id) => {
    const profile = byId.get(id);
    if (!profile) return [];
    return [
      {
        id,
        name: profile.name?.trim() || "Student",
        username: profile.username?.trim() || "",
      },
    ];
  });
}

async function membershipRole(admin: Admin, profileId: string, schoolCourseId: string) {
  const rich = await admin
    .from("user_courses")
    .select("role")
    .eq("user_id", profileId)
    .eq("school_course_id", schoolCourseId)
    .maybeSingle();
  if (rich.error && roleColumnMissing(rich.error.message)) {
    const plain = await admin
      .from("user_courses")
      .select("user_id")
      .eq("user_id", profileId)
      .eq("school_course_id", schoolCourseId)
      .maybeSingle();
    if (plain.error) throw new Error(plain.error.message);
    return plain.data ? ("unknown" as const) : null;
  }
  if (rich.error) throw new Error(rich.error.message);
  if (!rich.data) return null;
  return rich.data.role === "owner" ? ("owner" as const) : ("member" as const);
}

async function invitesFor(admin: Admin, schoolCourseId: string): Promise<InviteRow[] | "missing"> {
  const { data, error } = await admin
    .from("class_invitations")
    .select("id, school_course_id, code, created_by, expires_at, revoked_at, created_at")
    .eq("school_course_id", schoolCourseId)
    .order("created_at", { ascending: false })
    .limit(20);
  if (error) {
    if (missingInviteTable(error.message)) return "missing";
    throw new Error(error.message);
  }
  return data ?? [];
}

function openRow(rows: InviteRow[]) {
  return rows.find((row) => invitationState({ revokedAt: row.revoked_at, expiresAt: row.expires_at }) === "open") ?? null;
}

function canManage(input: {
  role: "owner" | "member" | "unknown" | null;
  classCreator: string | null;
  profileId: string;
  inviteCreator: string | null;
}) {
  if (input.role === "owner") return true;
  if (input.classCreator && input.classCreator === input.profileId) return true;
  if (input.inviteCreator && input.inviteCreator === input.profileId) return true;
  return false;
}

async function insertInvite(admin: Admin, schoolCourseId: string, profileId: string, academicYear: string | null) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const code = classInviteCode();
    const { error } = await admin.from("class_invitations").insert({
      school_course_id: schoolCourseId,
      code,
      created_by: profileId,
      expires_at: invitationExpiry(academicYear),
    });
    if (!error) return code;
    if (error.code === "23505") {
      const rows = await invitesFor(admin, schoolCourseId);
      if (rows === "missing") return "missing" as const;
      const live = openRow(rows);
      if (live) return live.code;
      continue;
    }
    if (missingInviteTable(error.message)) return "missing" as const;
    throw new Error(error.message);
  }
  throw new Error("Couldn't create an invitation.");
}

async function revokeOpen(admin: Admin, schoolCourseId: string) {
  const { error } = await admin
    .from("class_invitations")
    .update({ revoked_at: new Date().toISOString() })
    .eq("school_course_id", schoolCourseId)
    .is("revoked_at", null);
  if (error) {
    if (missingInviteTable(error.message)) return "missing" as const;
    throw new Error(error.message);
  }
  return "ok" as const;
}

async function personalCourseId(admin: Admin, profileId: string, schoolCourseId: string) {
  const { data, error } = await admin
    .from("courses")
    .select("id")
    .eq("user_id", profileId)
    .eq("school_course_id", schoolCourseId)
    .limit(1);
  if (error) return null;
  return data?.[0]?.id ?? null;
}

async function inviteByCode(admin: Admin, code: string): Promise<InviteRow | null | "missing"> {
  const { data, error } = await admin
    .from("class_invitations")
    .select("id, school_course_id, code, created_by, expires_at, revoked_at, created_at")
    .eq("code", code)
    .maybeSingle();
  if (error) {
    if (missingInviteTable(error.message)) return "missing";
    throw new Error(error.message);
  }
  return data;
}

function previewFrom(group: GroupRow, extra: Omit<Extract<ClassPreview, { ok: true }>, "ok" | "name" | "school" | "teacher" | "period" | "academicYear" | "memberCount"> & { memberCount: number }): ClassPreview {
  return {
    ok: true,
    name: group.name,
    school: group.school_name,
    teacher: group.teacher?.trim() || "",
    period: group.period,
    academicYear: group.academic_year,
    memberCount: extra.memberCount,
    state: extra.state,
    already: extra.already,
    courseId: extra.courseId,
    sameSchool: extra.sameSchool,
  };
}

export async function previewClassInvite(rawCode: string, profileId: string | null): Promise<ClassPreview> {
  const code = rawCode.trim().toLowerCase();
  if (!CLASS_CODE.test(code)) return { ok: false, error: "That invitation link isn't valid." };
  try {
    const admin = createAdminClient();
    const invite = await inviteByCode(admin, code);
    if (invite === "missing") return { ok: false, error: CLASS_INVITE_MIGRATION };
    if (!invite) return { ok: false, error: "That invitation isn't valid." };
    const group = await loadGroup(admin, invite.school_course_id);
    if (group === "missing") return { ok: false, error: CLASS_INVITE_MIGRATION };
    if (!group) return { ok: false, error: "That class is no longer available." };
    const state = invitationState({ revokedAt: invite.revoked_at, expiresAt: invite.expires_at });
    const visible = state === "missing" ? "revoked" : state;
    const count = await memberCount(admin, group.id);
    if (!profileId) {
      return previewFrom(group, { state: visible, memberCount: count, already: false, courseId: null, sameSchool: true });
    }
    const viewer = await profileSchool(admin, profileId);
    const sameSchool = Boolean(viewer.school) && schoolKey(viewer.school) === schoolKey(group.school_name);
    const courseId = sameSchool ? await personalCourseId(admin, profileId, group.id) : null;
    return previewFrom(group, {
      state: visible,
      memberCount: count,
      already: Boolean(courseId),
      courseId,
      sameSchool,
    });
  } catch (error) {
    console.error("previewClassInvite failed", error instanceof Error ? error.message : error);
    return { ok: false, error: "Couldn't open that invitation." };
  }
}

export async function joinClassByCode(profileId: string, rawCode: string) {
  const code = rawCode.trim().toLowerCase();
  if (!CLASS_CODE.test(code)) return { ok: false as const, error: "That invitation code isn't valid." };
  try {
    const admin = createAdminClient();
    const invite = await inviteByCode(admin, code);
    if (invite === "missing") return { ok: false as const, error: CLASS_INVITE_MIGRATION };
    if (!invite) return { ok: false as const, error: "That invitation isn't valid." };
    const state = invitationState({ revokedAt: invite.revoked_at, expiresAt: invite.expires_at });
    if (state === "revoked") return { ok: false as const, error: "This invitation was turned off." };
    if (state === "expired" || state === "missing") return { ok: false as const, error: "This invitation has expired." };
    const group = await loadGroup(admin, invite.school_course_id);
    if (group === "missing") return { ok: false as const, error: CLASS_INVITE_MIGRATION };
    if (!group) return { ok: false as const, error: "That class is no longer available." };
    const viewer = await profileSchool(admin, profileId);
    if (!viewer.school) return { ok: false as const, error: "Add your school on your profile before joining a class." };
    if (schoolKey(viewer.school) !== schoolKey(group.school_name)) {
      return { ok: false as const, error: "This class is at another school, so you can't join it from this account." };
    }
    const existing = await personalCourseId(admin, profileId, group.id);
    if (existing) return { ok: true as const, courseId: existing, already: true };
    const added = await addExplicitCourse(profileId, { schoolCourseId: group.id });
    if (!added.ok) return added;
    return { ok: true as const, courseId: added.course.id, already: false };
  } catch (error) {
    console.error("joinClassByCode failed", error instanceof Error ? error.message : error);
    return { ok: false as const, error: "Couldn't join that class." };
  }
}

async function panelFor(profileId: string, courseId: string, refresh: "keep" | "regenerate" | "revoke"): Promise<ClassInvitePanel> {
  const linked = await ensureLinkedSchoolCourse(profileId, courseId);
  if (!linked.ok) return { ok: true, available: false, notice: linked.error };
  const admin = createAdminClient();
  const group = await loadGroup(admin, linked.schoolCourseId);
  if (group === "missing" || !group) return { ok: true, available: false, notice: CLASS_INVITE_MIGRATION };
  const role = await membershipRole(admin, profileId, group.id);
  if (!role) return { ok: false, error: "You aren't in this class." };
  let rows = await invitesFor(admin, group.id);
  if (rows === "missing") return { ok: true, available: false, notice: CLASS_INVITE_MIGRATION };
  const manager = canManage({
    role,
    classCreator: group.created_by,
    profileId,
    inviteCreator: openRow(rows)?.created_by ?? rows[0]?.created_by ?? null,
  });
  if (refresh === "revoke" || refresh === "regenerate") {
    if (!manager) return { ok: false, error: "You can't change this invitation." };
    const revoked = await revokeOpen(admin, group.id);
    if (revoked === "missing") return { ok: true, available: false, notice: CLASS_INVITE_MIGRATION };
    if (refresh === "regenerate") {
      const created = await insertInvite(admin, group.id, profileId, group.academic_year);
      if (created === "missing") return { ok: true, available: false, notice: CLASS_INVITE_MIGRATION };
    }
    const again = await invitesFor(admin, group.id);
    if (again === "missing") return { ok: true, available: false, notice: CLASS_INVITE_MIGRATION };
    rows = again;
  }
  let live = openRow(rows);
  if (refresh === "keep" && !live) {
    const latest = rows[0] ?? null;
    const latestState = latest ? invitationState({ revokedAt: latest.revoked_at, expiresAt: latest.expires_at }) : "missing";
    if (!latest || latestState === "expired") {
      if (latest) {
        const revoked = await revokeOpen(admin, group.id);
        if (revoked === "missing") return { ok: true, available: false, notice: CLASS_INVITE_MIGRATION };
      }
      const created = await insertInvite(admin, group.id, profileId, group.academic_year);
      if (created === "missing") return { ok: true, available: false, notice: CLASS_INVITE_MIGRATION };
      const again = await invitesFor(admin, group.id);
      if (again === "missing") return { ok: true, available: false, notice: CLASS_INVITE_MIGRATION };
      rows = again;
      live = openRow(rows);
    }
  }
  const members = await listMembers(admin, group.id);
  const count = await memberCount(admin, group.id);
  const latest = rows[0] ?? null;
  const state = live
    ? "open"
    : latest && invitationState({ revokedAt: latest.revoked_at, expiresAt: latest.expires_at }) === "expired"
      ? "expired"
      : latest
        ? "revoked"
        : "none";
  return {
    ok: true,
    available: true,
    courseName: group.name,
    school: group.school_name,
    teacher: group.teacher?.trim() || "",
    period: group.period,
    academicYear: group.academic_year,
    members,
    memberCount: count,
    code: live?.code ?? null,
    canManage: canManage({
      role,
      classCreator: group.created_by,
      profileId,
      inviteCreator: live?.created_by ?? latest?.created_by ?? null,
    }),
    state,
  };
}

/** The signed-in student must already belong to this class group. */
export async function requireClassMembership(profileId: string, courseId: string) {
  try {
    const linked = await ensureLinkedSchoolCourse(profileId, courseId);
    if (!linked.ok) return { ok: false as const, error: linked.error };
    const admin = createAdminClient();
    const group = await loadGroup(admin, linked.schoolCourseId);
    if (group === "missing" || !group) return { ok: false as const, error: CLASS_INVITE_MIGRATION };
    const role = await membershipRole(admin, profileId, group.id);
    if (!role) return { ok: false as const, error: "You aren't in this class." };
    return { ok: true as const, admin, group };
  } catch (error) {
    console.error("requireClassMembership failed", error instanceof Error ? error.message : error);
    return { ok: false as const, error: "Couldn't open that class." };
  }
}

export async function loadClassInvite(profileId: string, courseId: string) {
  try {
    return await panelFor(profileId, courseId, "keep");
  } catch (error) {
    console.error("loadClassInvite failed", error instanceof Error ? error.message : error);
    return { ok: false as const, error: "Couldn't load the invitation." };
  }
}

export async function changeClassInvite(profileId: string, courseId: string, action: "regenerate" | "revoke") {
  try {
    return await panelFor(profileId, courseId, action);
  } catch (error) {
    console.error("changeClassInvite failed", error instanceof Error ? error.message : error);
    return { ok: false as const, error: "Couldn't update that invitation." };
  }
}
