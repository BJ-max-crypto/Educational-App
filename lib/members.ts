import "server-only";

import { initials } from "@/lib/dates";
import { nameForViewer } from "@/lib/identity";
import { COURSE_COLORS } from "@/lib/course-colors";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Classmate, Course, PersonConnection } from "@/lib/types";

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

/** Class keys this person can share: only classes they already have. */
export function shareableKeys(requested: string[], ownKeys: string[]) {
  const allowed = new Set(ownKeys.map(courseKey));
  return [...new Set(requested.map(courseKey).filter((key) => allowed.has(key)))].slice(0, 40);
}

function missingTable(message: string) {
  return /connections|username|requester_classes|addressee_classes/i.test(message);
}

/**
 * Connections for the signed-in profile, plus classmates per course.
 * A classmate is an accepted connection who also added that course themselves.
 * The full name is included only after this pair's connection is accepted.
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
  const people = new Map<
    string,
    {
      name: string | null;
      username: string | null;
      grade: string | null;
      school: string | null;
      school_location: string | null;
    }
  >();
  if (otherIds.length) {
    const full = await admin
      .from("profiles")
      .select("id, name, username, grade, school, school_location")
      .in("id", otherIds);
    const result =
      full.error && /school_location/i.test(full.error.message)
        ? await admin.from("profiles").select("id, name, username, grade, school").in("id", otherIds)
        : full;
    if (result.error) throw new Error(result.error.message);
    for (const row of result.data ?? []) {
      people.set(row.id, {
        name: row.name,
        username: row.username,
        grade: row.grade,
        school: row.school,
        school_location: (() => {
          if (!("school_location" in row)) return null;
          const value = row.school_location;
          return typeof value === "string" ? value : null;
        })(),
      });
    }
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
    const iAsked = row.requester_id === profileId;
    const accepted = row.status === "accepted";
    const theirs = namesByPerson.get(otherId);
    const both = accepted ? [...mine.keys()].filter((key) => theirs?.has(key)) : [];
    connections.push({
      id: row.id,
      profileId: otherId,
      name: nameForViewer(accepted, person.name),
      username: person.username,
      school: person.school?.trim() || null,
      schoolLocation: person.school_location?.trim() || null,
      grade: person.grade?.trim() || null,
      theirCourses: accepted ? [...(theirs?.values() ?? [])].sort((a, b) => a.localeCompare(b)) : [],
      status: accepted ? "accepted" : iAsked ? "outgoing" : "incoming",
      sharedClasses: both
        .map((key) => ({ key, name: mine.get(key) ?? key }))
        .sort((a, b) => a.name.localeCompare(b.name)),
      myClasses: both,
      theirClasses: both,
    });
  }
  connections.sort((a, b) => (a.name ?? a.username).localeCompare(b.name ?? b.username));

  const classmatesByCourseId: Record<string, Classmate[]> = {};
  for (const course of courses) {
    if (course.isUnsorted) {
      classmatesByCourseId[course.id] = [];
      continue;
    }
    const key = courseKey(course.name);
    classmatesByCourseId[course.id] = connections
      .filter((item) => item.status === "accepted" && namesByPerson.get(item.profileId)?.has(key))
      .map((item) => {
        const label = item.name ?? item.username;
        return {
        id: item.profileId,
        name: label,
        username: item.username,
        initials: initials(label),
        color: memberColor(item.profileId),
        grade: people.get(item.profileId)?.grade ?? null,
      };
      });
  }

  return {
    username: me.data?.username ?? null,
    connections,
    classmatesByCourseId,
    notice: null,
  };
}
