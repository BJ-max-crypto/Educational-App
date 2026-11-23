import "server-only";

import { classmateInviteState, type ClassmateSearchHit, type IncomingClassInvite } from "@/lib/class-match";
import { requireClassMembership } from "@/lib/class-invites";
import { nameForViewer } from "@/lib/identity";
import { normalizeUsername } from "@/lib/members";
import { schoolKey } from "@/lib/school-feed";
import { addExplicitCourse } from "@/lib/school-courses";
import { createAdminClient } from "@/lib/supabase/admin";

export const CLASS_MEMBER_INVITE_MIGRATION =
  "Username invitations need a database update (supabase/migrations/0016_class_member_invites.sql).";

export type { ClassmateSearchHit };

type Admin = ReturnType<typeof createAdminClient>;

function missingInviteTable(message: string) {
  return /class_member_invites|schema cache/i.test(message);
}

function sameSchool(classSchool: string, personSchool: string | null | undefined) {
  const theirs = schoolKey(personSchool);
  return Boolean(theirs) && theirs === schoolKey(classSchool);
}

async function approvedNames(admin: Admin, profileId: string, ids: string[]) {
  const approved = new Set<string>();
  if (!ids.length) return approved;
  const { data, error } = await admin
    .from("connections")
    .select("requester_id, addressee_id, status")
    .eq("status", "accepted")
    .or(`requester_id.eq.${profileId},addressee_id.eq.${profileId}`);
  if (error) return approved;
  for (const row of data ?? []) {
    const other = row.requester_id === profileId ? row.addressee_id : row.requester_id;
    if (ids.includes(other)) approved.add(other);
  }
  return approved;
}

export async function searchClassUsernames(
  profileId: string,
  courseId: string,
  raw: string,
): Promise<{ ok: true; matches: ClassmateSearchHit[] } | { ok: false; error: string }> {
  const query = normalizeUsername(raw);
  if (query.length < 2 || !/^[a-z0-9_]+$/.test(query)) return { ok: true, matches: [] };
  const gate = await requireClassMembership(profileId, courseId);
  if (!gate.ok) return gate;

  const escaped = query.replace(/[\\%_]/g, (char) => `\\${char}`);
  const found = await gate.admin
    .from("profiles")
    .select("id, name, username, school")
    .like("username", `${escaped}%`)
    .neq("id", profileId)
    .limit(8);
  if (found.error) {
    console.error("searchClassUsernames failed", found.error.message);
    return { ok: false, error: "Couldn't search right now." };
  }
  const people = (found.data ?? []).filter((row) => row.username);
  const ids = people.map((row) => row.id);
  const [members, invites, friends] = await Promise.all([
    ids.length
      ? gate.admin.from("user_courses").select("user_id").eq("school_course_id", gate.group.id).in("user_id", ids)
      : Promise.resolve({ data: [], error: null }),
    ids.length
      ? gate.admin
          .from("class_member_invites")
          .select("invitee_id, status")
          .eq("school_course_id", gate.group.id)
          .in("invitee_id", ids)
      : Promise.resolve({ data: [], error: null }),
    approvedNames(gate.admin, profileId, ids),
  ]);
  if (members.error) return { ok: false, error: "Couldn't search right now." };
  const memberIds = new Set((members.data ?? []).map((row) => row.user_id));
  const pendingIds = new Set<string>();
  if (!invites.error) {
    for (const row of invites.data ?? []) {
      if (row.status === "pending") pendingIds.add(row.invitee_id);
    }
  }

  return {
    ok: true,
    matches: people.flatMap((person) => {
      const state = classmateInviteState({
        self: false,
        member: memberIds.has(person.id),
        pending: pendingIds.has(person.id),
        sameSchool: sameSchool(gate.group.school_name, person.school),
      });
      if (state === "self") return [];
      return [
        {
          profileId: person.id,
          username: person.username!,
          name: nameForViewer(friends.has(person.id), person.name),
          school: person.school?.trim() || null,
          state,
        },
      ];
    }),
  };
}

export async function inviteClassmate(
  profileId: string,
  courseId: string,
  inviteeId: string,
): Promise<{ ok: true; state: "invited" | "member" } | { ok: false; error: string }> {
  if (!inviteeId || inviteeId === profileId) return { ok: false, error: "Choose someone else." };
  const gate = await requireClassMembership(profileId, courseId);
  if (!gate.ok) return gate;

  const person = await gate.admin.from("profiles").select("id, username, school").eq("id", inviteeId).maybeSingle();
  if (person.error) return { ok: false, error: "Couldn't send that invitation." };
  if (!person.data?.username) return { ok: false, error: "That person doesn't have a username." };
  if (!sameSchool(gate.group.school_name, person.data.school)) {
    return { ok: false, error: "They need to be at this school before they can join." };
  }

  const membership = await gate.admin
    .from("user_courses")
    .select("user_id")
    .eq("user_id", inviteeId)
    .eq("school_course_id", gate.group.id)
    .maybeSingle();
  if (membership.error) return { ok: false, error: "Couldn't send that invitation." };
  if (membership.data) return { ok: true, state: "member" };

  const existing = await gate.admin
    .from("class_member_invites")
    .select("id, status")
    .eq("school_course_id", gate.group.id)
    .eq("invitee_id", inviteeId)
    .maybeSingle();
  if (existing.error) {
    if (missingInviteTable(existing.error.message)) return { ok: false, error: CLASS_MEMBER_INVITE_MIGRATION };
    return { ok: false, error: "Couldn't send that invitation." };
  }
  if (existing.data?.status === "pending") return { ok: true, state: "invited" };

  const now = new Date().toISOString();
  const saved = existing.data
    ? await gate.admin
        .from("class_member_invites")
        .update({ status: "pending", inviter_id: profileId, updated_at: now })
        .eq("id", existing.data.id)
    : await gate.admin.from("class_member_invites").insert({
        school_course_id: gate.group.id,
        inviter_id: profileId,
        invitee_id: inviteeId,
        status: "pending",
      });
  if (saved.error) {
    if (missingInviteTable(saved.error.message)) return { ok: false, error: CLASS_MEMBER_INVITE_MIGRATION };
    if (saved.error.code === "23505") return { ok: true, state: "invited" };
    console.error("inviteClassmate failed", saved.error.message);
    return { ok: false, error: "Couldn't send that invitation." };
  }
  return { ok: true, state: "invited" };
}

export async function incomingClassInvites(profileId: string): Promise<IncomingClassInvite[]> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("class_member_invites")
    .select("id, school_course_id, inviter_id")
    .eq("invitee_id", profileId)
    .eq("status", "pending")
    .order("created_at", { ascending: false })
    .limit(20);
  if (error) {
    if (!missingInviteTable(error.message)) console.error("incomingClassInvites failed", error.message);
    return [];
  }
  const rows = data ?? [];
  if (!rows.length) return [];
  const courseIds = [...new Set(rows.map((row) => row.school_course_id))];
  const inviterIds = [...new Set(rows.map((row) => row.inviter_id))];
  const [courses, people] = await Promise.all([
    admin.from("school_courses").select("id, name").in("id", courseIds),
    admin.from("profiles").select("id, username").in("id", inviterIds),
  ]);
  const names = new Map((courses.data ?? []).map((row) => [row.id, row.name.trim()]));
  const usernames = new Map((people.data ?? []).map((row) => [row.id, row.username?.trim() || ""]));
  return rows.flatMap((row) => {
    const username = usernames.get(row.inviter_id) ?? "";
    const courseName = names.get(row.school_course_id) ?? "";
    if (!username || !courseName) return [];
    return [{ id: row.id, courseName, username }];
  });
}

export async function respondClassInvite(
  profileId: string,
  inviteId: string,
  accept: boolean,
): Promise<{ ok: true; courseId?: string } | { ok: false; error: string }> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("class_member_invites")
    .select("id, school_course_id, invitee_id, status")
    .eq("id", inviteId)
    .maybeSingle();
  if (error) {
    if (missingInviteTable(error.message)) return { ok: false, error: CLASS_MEMBER_INVITE_MIGRATION };
    return { ok: false, error: "Couldn't update that invitation." };
  }
  if (!data || data.invitee_id !== profileId || data.status !== "pending") {
    return { ok: false, error: "That invitation is no longer open." };
  }
  if (!accept) {
    const declined = await admin
      .from("class_member_invites")
      .update({ status: "declined", updated_at: new Date().toISOString() })
      .eq("id", inviteId)
      .eq("invitee_id", profileId)
      .eq("status", "pending");
    if (declined.error) return { ok: false, error: "Couldn't update that invitation." };
    return { ok: true };
  }
  const existing = await admin
    .from("courses")
    .select("id")
    .eq("user_id", profileId)
    .eq("school_course_id", data.school_course_id)
    .limit(1);
  if (existing.data?.[0]) {
    await admin
      .from("class_member_invites")
      .update({ status: "accepted", updated_at: new Date().toISOString() })
      .eq("id", inviteId)
      .eq("status", "pending");
    return { ok: true, courseId: existing.data[0].id };
  }
  const added = await addExplicitCourse(profileId, { schoolCourseId: data.school_course_id });
  if (!added.ok) return added;
  const accepted = await admin
    .from("class_member_invites")
    .update({ status: "accepted", updated_at: new Date().toISOString() })
    .eq("id", inviteId)
    .eq("invitee_id", profileId)
    .eq("status", "pending");
  if (accepted.error) return { ok: false, error: "You joined, but the invitation could not be closed." };
  return { ok: true, courseId: added.course.id };
}
