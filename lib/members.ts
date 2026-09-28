import "server-only";

import { initials } from "@/lib/dates";
import { COURSE_COLORS } from "@/lib/course-colors";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Classmate, Course, PersonConnection, SharedClass } from "@/lib/types";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database";

export type MemberDirectory = {
  username: string | null;
  connections: PersonConnection[];
  classmatesByCourseId: Record<string, Classmate[]>;
  /** Set when 0005 or 0006 has not been applied yet. */
  notice: string | null;
};

const MEMBERS_NOTICE =
  "Adding people needs a database update. Run supabase/migrations/0005_members.sql, then 0006_connection_classes.sql.";
const CLASSES_NOTICE =
  "Choosing classes needs a database update. Run supabase/migrations/0006_connection_classes.sql.";

const EMPTY: MemberDirectory = {
  username: null,
  connections: [],
  classmatesByCourseId: {},
  notice: null,
};

export function memberColor(id: string) {
  let hash = 0;
  for (const char of id) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return COURSE_COLORS[hash % COURSE_COLORS.length];
}

export function normalizeUsername(raw: string) {
  return raw.trim().replace(/^@/, "").toLowerCase();
}

export function validateUsername(raw: string): { value: string } | { error: string } {
  const value = normalizeUsername(raw);
  if (!/^[a-z0-9_]{3,20}$/.test(value)) {
    return { error: "Use 3–20 letters, numbers, or underscores." };
  }
  return { value };
}

export function courseKey(name: string) {
  return name.trim().toLowerCase();
}

/** Classes both people have right now, labeled with the first person's course name. */
export async function coursesInCommon(
  admin: SupabaseClient<Database>,
  profileId: string,
  otherId: string,
): Promise<SharedClass[]> {
  const { data, error } = await admin
    .from("courses")
    .select("user_id, name, is_unsorted")
    .in("user_id", [profileId, otherId])
    .eq("is_unsorted", false);
  if (error) throw new Error(error.message);
  const mine = new Map<string, string>();
  const theirs = new Set<string>();
  for (const row of data ?? []) {
    const key = courseKey(row.name);
    if (!key) continue;
    if (row.user_id === profileId) {
      if (!mine.has(key)) mine.set(key, row.name.trim());
    } else {
      theirs.add(key);
    }
  }
  return [...mine.entries()]
    .filter(([key]) => theirs.has(key))
    .map(([key, name]) => ({ key, name }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** Keeps only class names both people actually have. */
export function checkedClasses(requested: string[], shared: SharedClass[]) {
  const allowed = new Set(shared.map((item) => item.key));
  return [...new Set(requested.map(courseKey).filter((key) => allowed.has(key)))].slice(0, 40);
}

function missingTable(message: string) {
  return /connections|username|requester_classes|addressee_classes/i.test(message);
}

/**
 * Connections for the signed-in profile, plus classmates per course.
 * A classmate is an accepted connection on a class both people checked.
 * Reads other people only through the service role, and only their name, username, and course names.
 */
export async function loadMembers(profileId: string, courses: Course[]): Promise<MemberDirectory> {
  const admin = createAdminClient();
  const [me, links] = await Promise.all([
    admin.from("profiles").select("username").eq("id", profileId).maybeSingle(),
    admin
      .from("connections")
      .select("id, requester_id, addressee_id, status, requester_classes, addressee_classes")
      .or(`requester_id.eq.${profileId},addressee_id.eq.${profileId}`),
  ]);
  const blocked = me.error?.message ?? links.error?.message ?? "";
  if (blocked && missingTable(blocked)) {
    return {
      ...EMPTY,
      notice: /requester_classes|addressee_classes/i.test(blocked) ? CLASSES_NOTICE : MEMBERS_NOTICE,
    };
  }
  if (me.error) throw new Error(me.error.message);
  if (links.error) throw new Error(links.error.message);

  const otherIds = [
    ...new Set(
      (links.data ?? []).map((row) =>
        row.requester_id === profileId ? row.addressee_id : row.requester_id,
      ),
    ),
  ];
  const people = new Map<string, { name: string | null; username: string | null; grade: string | null }>();
  if (otherIds.length) {
    const { data, error } = await admin
      .from("profiles")
      .select("id, name, username, grade")
      .in("id", otherIds);
    if (error) throw new Error(error.message);
    for (const row of data ?? []) people.set(row.id, row);
  }

  const courseIds = [...new Set([profileId, ...otherIds])];
  const namesByPerson = new Map<string, Map<string, string>>();
  if (courseIds.length) {
    const { data, error } = await admin
      .from("courses")
      .select("user_id, name, is_unsorted")
      .in("user_id", courseIds)
      .eq("is_unsorted", false);
    if (error) throw new Error(error.message);
    for (const row of data ?? []) {
      const key = courseKey(row.name);
      if (!key) continue;
      const named = namesByPerson.get(row.user_id) ?? new Map<string, string>();
      if (!named.has(key)) named.set(key, row.name.trim());
      namesByPerson.set(row.user_id, named);
    }
  }
  const mine = namesByPerson.get(profileId) ?? new Map<string, string>();

  const connections: PersonConnection[] = [];
  for (const row of links.data ?? []) {
    const otherId = row.requester_id === profileId ? row.addressee_id : row.requester_id;
    const person = people.get(otherId);
    if (!person?.username) continue;
    const theirs = namesByPerson.get(otherId) ?? new Map<string, string>();
    const iAsked = row.requester_id === profileId;
    connections.push({
      id: row.id,
      profileId: otherId,
      name: person.name?.trim() || person.username,
      username: person.username,
      status: row.status === "accepted" ? "accepted" : iAsked ? "outgoing" : "incoming",
      sharedClasses: [...mine.entries()]
        .filter(([key]) => theirs.has(key))
        .map(([key, name]) => ({ key, name }))
        .sort((a, b) => a.name.localeCompare(b.name)),
      myClasses: iAsked ? row.requester_classes : row.addressee_classes,
      theirClasses: iAsked ? row.addressee_classes : row.requester_classes,
    });
  }
  connections.sort((a, b) => a.name.localeCompare(b.name));

  const classmatesByCourseId: Record<string, Classmate[]> = {};
  for (const course of courses) {
    if (course.isUnsorted) {
      classmatesByCourseId[course.id] = [];
      continue;
    }
    const key = courseKey(course.name);
    classmatesByCourseId[course.id] = connections
      .filter(
        (item) =>
          item.status === "accepted" &&
          item.myClasses.includes(key) &&
          item.theirClasses.includes(key) &&
          namesByPerson.get(item.profileId)?.has(key),
      )
      .map((item) => ({
        id: item.profileId,
        name: item.name,
        username: item.username,
        initials: initials(item.name),
        color: memberColor(item.profileId),
        grade: people.get(item.profileId)?.grade ?? null,
      }));
  }

  return {
    username: me.data?.username ?? null,
    connections,
    classmatesByCourseId,
    notice: null,
  };
}
