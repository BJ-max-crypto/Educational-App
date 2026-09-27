import "server-only";

import { initials } from "@/lib/dates";
import { COURSE_COLORS } from "@/lib/course-colors";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Classmate, Course, PersonConnection } from "@/lib/types";

export type MemberDirectory = {
  username: string | null;
  connections: PersonConnection[];
  classmatesByCourseId: Record<string, Classmate[]>;
  /** The 0005 migration has not been applied yet. */
  unavailable: boolean;
};

const EMPTY: MemberDirectory = {
  username: null,
  connections: [],
  classmatesByCourseId: {},
  unavailable: false,
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

function courseKey(name: string) {
  return name.trim().toLowerCase();
}

function missingTable(message: string) {
  return /connections|username/i.test(message);
}

/**
 * Connections for the signed-in profile, plus classmates per course.
 * A classmate is an accepted connection who has a course with the same name.
 * Reads other people only through the service role, and only their name, username, and course names.
 */
export async function loadMembers(profileId: string, courses: Course[]): Promise<MemberDirectory> {
  const admin = createAdminClient();
  const [me, links] = await Promise.all([
    admin.from("profiles").select("username").eq("id", profileId).maybeSingle(),
    admin
      .from("connections")
      .select("id, requester_id, addressee_id, status")
      .or(`requester_id.eq.${profileId},addressee_id.eq.${profileId}`),
  ]);
  if ((me.error && missingTable(me.error.message)) || (links.error && missingTable(links.error.message))) {
    return { ...EMPTY, unavailable: true };
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

  const connections: PersonConnection[] = [];
  for (const row of links.data ?? []) {
    const otherId = row.requester_id === profileId ? row.addressee_id : row.requester_id;
    const person = people.get(otherId);
    if (!person?.username) continue;
    connections.push({
      id: row.id,
      profileId: otherId,
      name: person.name?.trim() || person.username,
      username: person.username,
      status:
        row.status === "accepted"
          ? "accepted"
          : row.requester_id === profileId
            ? "outgoing"
            : "incoming",
    });
  }
  connections.sort((a, b) => a.name.localeCompare(b.name));

  const acceptedIds = connections.filter((item) => item.status === "accepted").map((item) => item.profileId);
  const namesByPerson = new Map<string, Set<string>>();
  if (acceptedIds.length) {
    const { data, error } = await admin
      .from("courses")
      .select("user_id, name, is_unsorted")
      .in("user_id", acceptedIds)
      .eq("is_unsorted", false);
    if (error) throw new Error(error.message);
    for (const row of data ?? []) {
      const key = courseKey(row.name);
      if (!key) continue;
      const set = namesByPerson.get(row.user_id) ?? new Set<string>();
      set.add(key);
      namesByPerson.set(row.user_id, set);
    }
  }

  const classmatesByCourseId: Record<string, Classmate[]> = {};
  for (const course of courses) {
    if (course.isUnsorted) {
      classmatesByCourseId[course.id] = [];
      continue;
    }
    const key = courseKey(course.name);
    classmatesByCourseId[course.id] = connections
      .filter((item) => item.status === "accepted" && namesByPerson.get(item.profileId)?.has(key))
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
    unavailable: false,
  };
}
