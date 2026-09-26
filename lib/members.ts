import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { COURSE_COLORS } from "@/lib/course-colors";
import { initials } from "@/lib/dates";
import { MEMBERS_MIGRATION, type MemberHub, type MemberLink, type MemberRelation, type MemberSearchHit } from "@/lib/member-types";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Database } from "@/lib/supabase/database";
import type { Classmate } from "@/lib/types";

type Admin = SupabaseClient<Database>;
type ConnectionRow = Database["public"]["Tables"]["member_connections"]["Row"];

const EMPTY_HUB: MemberHub = { username: null, links: [], schemaReady: true };

function memberColor(seed: string) {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = (Math.imul(hash, 31) + seed.charCodeAt(i)) >>> 0;
  return COURSE_COLORS[hash % COURSE_COLORS.length];
}

function missingSchema(error: { code?: string; message?: string } | null) {
  if (!error) return false;
  const message = error.message ?? "";
  return (
    error.code === "42P01" ||
    error.code === "42703" ||
    error.code === "PGRST204" ||
    error.code === "PGRST205" ||
    /member_connections|username/i.test(message)
  );
}

function toClassmate(
  row: { id: string; name: string | null; username: string | null; grade: string | null },
  courseNames: string[],
): Classmate {
  const name = row.name?.trim() || "Student";
  const username = row.username ?? "";
  return {
    profileId: row.id,
    name,
    username,
    grade: row.grade,
    initials: initials(name),
    color: memberColor(username || row.id),
    courseNames,
  };
}

function relationFor(row: ConnectionRow | undefined, profileId: string): {
  relation: MemberRelation;
  connectionId: string | null;
} {
  if (!row || row.status === "declined") return { relation: "none", connectionId: null };
  if (row.status === "accepted") return { relation: "accepted", connectionId: row.id };
  if (row.requester_id === profileId) return { relation: "pending_out", connectionId: row.id };
  return { relation: "pending_in", connectionId: row.id };
}

async function connectionsFor(admin: Admin, profileId: string) {
  return admin
    .from("member_connections")
    .select("id, requester_id, addressee_id, status, created_at, updated_at")
    .or(`requester_id.eq.${profileId},addressee_id.eq.${profileId}`);
}

async function peopleById(admin: Admin, ids: string[]) {
  const unique = [...new Set(ids)];
  if (unique.length === 0) return new Map<string, Classmate>();
  const [profiles, courses] = await Promise.all([
    admin.from("profiles").select("id, name, username, grade").in("id", unique),
    admin.from("courses").select("user_id, name, is_unsorted").in("user_id", unique).eq("is_unsorted", false),
  ]);
  if (profiles.error) {
    if (missingSchema(profiles.error)) return null;
    console.error("member profiles", profiles.error.message);
    return new Map<string, Classmate>();
  }
  if (courses.error) console.error("member courses", courses.error.message);
  const names = new Map<string, string[]>();
  for (const course of courses.data ?? []) {
    const list = names.get(course.user_id) ?? [];
    list.push(course.name);
    names.set(course.user_id, list);
  }
  return new Map((profiles.data ?? []).map((row) => [row.id, toClassmate(row, names.get(row.id) ?? [])]));
}

async function linksFor(admin: Admin, profileId: string): Promise<MemberLink[] | null> {
  const { data, error } = await connectionsFor(admin, profileId);
  if (error) {
    if (missingSchema(error)) return null;
    console.error("member connections", error.message);
    return [];
  }
  const rows = (data ?? []).filter((row) => row.status === "pending" || row.status === "accepted");
  const people = await peopleById(
    admin,
    rows.map((row) => (row.requester_id === profileId ? row.addressee_id : row.requester_id)),
  );
  if (!people) return null;
  return rows.flatMap((row) => {
    const otherId = row.requester_id === profileId ? row.addressee_id : row.requester_id;
    const person = people.get(otherId);
    if (!person) return [];
    return [
      {
        id: row.id,
        direction: row.addressee_id === profileId ? "incoming" : "outgoing",
        status: row.status as "pending" | "accepted",
        person,
      },
    ];
  });
}

export async function loadMemberHub(profileId: string): Promise<MemberHub> {
  try {
    const admin = createAdminClient();
    const mine = await admin.from("profiles").select("username").eq("id", profileId).maybeSingle();
    if (mine.error) {
      if (missingSchema(mine.error)) return { username: null, links: [], schemaReady: false };
      console.error("loadMemberHub profile", mine.error.message);
      return EMPTY_HUB;
    }
    const links = await linksFor(admin, profileId);
    if (!links) return { username: mine.data?.username ?? null, links: [], schemaReady: false };
    return { username: mine.data?.username ?? null, links, schemaReady: true };
  } catch (error) {
    console.error("loadMemberHub", error);
    return { username: null, links: [], schemaReady: false };
  }
}

/** Accepted connections, with the courses each person has tagged. */
export async function loadClassmates(profileId: string): Promise<Classmate[]> {
  try {
    const links = await linksFor(createAdminClient(), profileId);
    if (!links) return [];
    return links.filter((link) => link.status === "accepted").map((link) => link.person);
  } catch (error) {
    console.error("loadClassmates", error);
    return [];
  }
}

export async function searchUsernames(profileId: string, raw: string): Promise<MemberSearchHit[] | "missing"> {
  const query = raw.trim().toLowerCase().replace(/^@/, "").replace(/[%_\\]/g, "");
  if (query.length < 2 || query.length > 20) return [];
  const admin = createAdminClient();
  const found = await admin
    .from("profiles")
    .select("id, name, username, grade")
    .not("username", "is", null)
    .ilike("username", `${query}%`)
    .neq("id", profileId)
    .order("username")
    .limit(8);
  if (found.error) {
    if (missingSchema(found.error)) return "missing";
    console.error("searchUsernames", found.error.message);
    return [];
  }
  const connections = await connectionsFor(admin, profileId);
  if (connections.error) {
    if (missingSchema(connections.error)) return "missing";
    console.error("searchUsernames connections", connections.error.message);
  }
  const byOther = new Map<string, ConnectionRow>();
  for (const row of connections.data ?? []) {
    const otherId = row.requester_id === profileId ? row.addressee_id : row.requester_id;
    byOther.set(otherId, row);
  }
  return (found.data ?? []).flatMap((row) => {
    if (!row.username) return [];
    const relation = relationFor(byOther.get(row.id), profileId);
    return [{ ...toClassmate(row, []), ...relation }];
  });
}

export async function saveUsername(profileId: string, username: string) {
  const admin = createAdminClient();
  const { error } = await admin
    .from("profiles")
    .update({ username })
    .eq("id", profileId)
    .select("id");
  if (!error) return { ok: true as const };
  if (error.code === "23505") return { ok: false as const, error: "That username is taken." };
  if (missingSchema(error)) return { ok: false as const, error: MEMBERS_MIGRATION };
  console.error("saveUsername", error.message);
  return { ok: false as const, error: "Couldn't save that username. Try again." };
}

export async function requestConnection(profileId: string, otherId: string) {
  if (otherId === profileId) return { ok: false as const, error: "That's you." };
  const admin = createAdminClient();
  const other = await admin.from("profiles").select("id, username").eq("id", otherId).maybeSingle();
  if (other.error) {
    if (missingSchema(other.error)) return { ok: false as const, error: MEMBERS_MIGRATION };
    return { ok: false as const, error: "Couldn't find that account." };
  }
  if (!other.data?.username) return { ok: false as const, error: "That account can't be added yet." };
  const mine = await admin.from("profiles").select("username").eq("id", profileId).maybeSingle();
  if (!mine.data?.username) {
    return { ok: false as const, error: "Pick your username first, so they know it's you." };
  }

  const existing = await connectionsFor(admin, profileId);
  if (existing.error) {
    if (missingSchema(existing.error)) return { ok: false as const, error: MEMBERS_MIGRATION };
    return { ok: false as const, error: "Couldn't send that request. Try again." };
  }
  const row = (existing.data ?? []).find(
    (item) =>
      (item.requester_id === profileId && item.addressee_id === otherId) ||
      (item.requester_id === otherId && item.addressee_id === profileId),
  );
  if (row?.status === "accepted") return { ok: false as const, error: "You're already connected." };
  if (row?.status === "pending" && row.requester_id === profileId) return { ok: true as const };
  if (row?.status === "pending") {
    return { ok: false as const, error: "They already asked you. Approve their request below." };
  }

  const now = new Date().toISOString();
  const write = row
    ? await admin
        .from("member_connections")
        .update({ requester_id: profileId, addressee_id: otherId, status: "pending", updated_at: now })
        .eq("id", row.id)
    : await admin.from("member_connections").insert({ requester_id: profileId, addressee_id: otherId });
  if (write.error) {
    if (write.error.code === "23505") return { ok: true as const };
    if (missingSchema(write.error)) return { ok: false as const, error: MEMBERS_MIGRATION };
    console.error("requestConnection", write.error.message);
    return { ok: false as const, error: "Couldn't send that request. Try again." };
  }
  return { ok: true as const };
}

async function ownedConnection(profileId: string, connectionId: string) {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("member_connections")
    .select("id, requester_id, addressee_id, status, created_at, updated_at")
    .eq("id", connectionId)
    .maybeSingle();
  if (error) {
    return {
      ok: false as const,
      error: missingSchema(error) ? MEMBERS_MIGRATION : "Couldn't update that connection. Try again.",
    };
  }
  if (!data || (data.requester_id !== profileId && data.addressee_id !== profileId)) {
    return { ok: false as const, error: "That connection isn't yours." };
  }
  return { ok: true as const, admin, row: data };
}

export async function respondToConnection(profileId: string, connectionId: string, accept: boolean) {
  const owned = await ownedConnection(profileId, connectionId);
  if (!owned.ok) return owned;
  if (owned.row.addressee_id !== profileId || owned.row.status !== "pending") {
    return { ok: false as const, error: "Only the person who was asked can approve this." };
  }
  const { error } = await owned.admin
    .from("member_connections")
    .update({ status: accept ? "accepted" : "declined", updated_at: new Date().toISOString() })
    .eq("id", connectionId)
    .eq("addressee_id", profileId)
    .eq("status", "pending");
  if (error) {
    console.error("respondToConnection", error.message);
    return { ok: false as const, error: "Couldn't update that request. Try again." };
  }
  return { ok: true as const };
}

export async function cancelConnection(profileId: string, connectionId: string) {
  const owned = await ownedConnection(profileId, connectionId);
  if (!owned.ok) return owned;
  if (owned.row.requester_id !== profileId || owned.row.status !== "pending") {
    return { ok: false as const, error: "That request can't be canceled." };
  }
  const { error } = await owned.admin
    .from("member_connections")
    .delete()
    .eq("id", connectionId)
    .eq("requester_id", profileId)
    .eq("status", "pending");
  if (error) return { ok: false as const, error: "Couldn't cancel that request. Try again." };
  return { ok: true as const };
}

export async function removeConnection(profileId: string, connectionId: string) {
  const owned = await ownedConnection(profileId, connectionId);
  if (!owned.ok) return owned;
  if (owned.row.status !== "accepted") return { ok: false as const, error: "You're not connected." };
  const { error } = await owned.admin.from("member_connections").delete().eq("id", connectionId);
  if (error) return { ok: false as const, error: "Couldn't remove that connection. Try again." };
  return { ok: true as const };
}
