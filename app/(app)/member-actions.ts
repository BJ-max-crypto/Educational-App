"use server";

import { auth } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import { COURSE_COLORS } from "@/lib/course-colors";
import { courseKey, normalizeUsername, shareableKeys, validateUsername } from "@/lib/members";
import { joinNamedClass, listSchoolmates } from "@/lib/school-feed";
import type { Schoolmate } from "@/lib/types";
import { validateClassName } from "@/lib/onboarding";
import { createAdminClient } from "@/lib/supabase/admin";
import { getUserDb } from "@/lib/user-db";

type Result = { ok: true } | { ok: false; error: string };

const MIGRATION = "Adding people needs a database update (supabase/migrations/0005_members.sql).";
const CLASS_MIGRATION =
  "Choosing classes needs a database update (supabase/migrations/0006_connection_classes.sql).";

function unavailable(message: string) {
  return /connections|username|requester_classes|addressee_classes|schema cache/i.test(message);
}

function migrationError(message: string) {
  return /requester_classes|addressee_classes/i.test(message) ? CLASS_MIGRATION : MIGRATION;
}

type Caller = { profileId: string; admin: ReturnType<typeof createAdminClient> };

async function caller(): Promise<Caller | { error: string }> {
  const { userId } = await auth();
  if (!userId) return { error: "Your session ended. Sign in again." };
  const db = await getUserDb(userId);
  if (!db) return { error: "Finish onboarding first." };
  return { profileId: db.profileId, admin: createAdminClient() };
}

export async function setUsername(raw: string): Promise<Result> {
  const parsed = validateUsername(raw);
  if ("error" in parsed) return { ok: false, error: parsed.error };
  const who = await caller();
  if (!("profileId" in who)) return { ok: false, error: who.error };
  const { error } = await who.admin
    .from("profiles")
    .update({ username: parsed.value })
    .eq("id", who.profileId);
  if (error) {
    if (unavailable(error.message)) return { ok: false, error: migrationError(error.message) };
    if (/unique|duplicate/i.test(error.message)) return { ok: false, error: "That username is taken." };
    console.error("setUsername failed", error.message);
    return { ok: false, error: "Couldn't save that username. Try again." };
  }
  revalidatePath("/", "layout");
  return { ok: true };
}

export type UsernameMatch = {
  profileId: string;
  name: string;
  username: string;
  school: string | null;
  schoolLocation: string | null;
  grade: string | null;
  classes: string[];
  status: "none" | "incoming" | "outgoing" | "accepted";
  connectionId: string | null;
};

export async function searchUsernames(
  raw: string,
): Promise<{ ok: true; matches: UsernameMatch[] } | { ok: false; error: string }> {
  const query = normalizeUsername(raw);
  if (query.length < 2) return { ok: true, matches: [] };
  if (!/^[a-z0-9_]+$/.test(query)) return { ok: true, matches: [] };
  const who = await caller();
  if (!("profileId" in who)) return { ok: false, error: who.error };

  const escaped = query.replace(/[\\%_]/g, (char) => `\\${char}`);
  const full = await who.admin
    .from("profiles")
    .select("id, name, username, school, school_location, grade")
    .like("username", `${escaped}%`)
    .neq("id", who.profileId)
    .limit(8);
  const looked =
    full.error && /school_location/i.test(full.error.message)
      ? await who.admin
          .from("profiles")
          .select("id, name, username, school, grade")
          .like("username", `${escaped}%`)
          .neq("id", who.profileId)
          .limit(8)
      : full;
  if (looked.error) {
    if (unavailable(looked.error.message)) return { ok: false, error: migrationError(looked.error.message) };
    console.error("searchUsernames failed", looked.error.message);
    return { ok: false, error: "Couldn't search right now." };
  }
  const data = looked.data ?? [];

  const ids = (data ?? []).map((row) => row.id);
  const status = new Map<string, { status: UsernameMatch["status"]; connectionId: string }>();
  if (ids.length) {
    const { data: links, error: linksError } = await who.admin
      .from("connections")
      .select("id, requester_id, addressee_id, status")
      .or(`requester_id.eq.${who.profileId},addressee_id.eq.${who.profileId}`);
    if (linksError) {
      if (unavailable(linksError.message)) return { ok: false, error: migrationError(linksError.message) };
      return { ok: false, error: "Couldn't search right now." };
    }
    for (const row of links ?? []) {
      const other = row.requester_id === who.profileId ? row.addressee_id : row.requester_id;
      if (!ids.includes(other)) continue;
      status.set(other, {
        connectionId: row.id,
        status:
          row.status === "accepted"
            ? "accepted"
            : row.requester_id === who.profileId
              ? "outgoing"
              : "incoming",
      });
    }
  }

  const classes = new Map<string, string[]>();
  if (ids.length) {
    const { data: courses, error: coursesError } = await who.admin
      .from("courses")
      .select("user_id, name, is_unsorted")
      .in("user_id", ids)
      .eq("is_unsorted", false);
    if (coursesError) return { ok: false, error: "Couldn't search right now." };
    for (const course of courses ?? []) {
      const list = classes.get(course.user_id) ?? [];
      if (!list.some((name) => courseKey(name) === courseKey(course.name))) list.push(course.name);
      classes.set(course.user_id, list);
    }
  }

  return {
    ok: true,
    matches: data
      .filter((row) => row.username)
      .map((row) => ({
        profileId: row.id,
        name: row.name?.trim() || row.username!,
        username: row.username!,
        school: row.school?.trim() || null,
        schoolLocation: (() => {
          if (!("school_location" in row)) return null;
          const value = row.school_location;
          return typeof value === "string" ? value.trim() || null : null;
        })(),
        grade: row.grade?.trim() || null,
        classes: (classes.get(row.id) ?? []).slice(0, 8),
        status: status.get(row.id)?.status ?? "none",
        connectionId: status.get(row.id)?.connectionId ?? null,
      })),
  };
}

export async function schoolSuggestions(): Promise<
  { ok: true; people: Schoolmate[]; notice: string | null } | { ok: false; error: string }
> {
  const who = await caller();
  if (!("profileId" in who)) return { ok: false, error: who.error };
  try {
    const result = await listSchoolmates(who.profileId);
    return { ok: true, ...result };
  } catch (error) {
    console.error("schoolSuggestions failed", error);
    return { ok: false, error: "Couldn't look up your school right now." };
  }
}

export async function joinSchoolClass(rawName: string): Promise<Result> {
  const parsed = validateClassName(rawName);
  if ("error" in parsed) return { ok: false, error: parsed.error };
  const who = await caller();
  if (!("profileId" in who)) return { ok: false, error: who.error };
  const joined = await joinNamedClass(who.profileId, parsed.value).catch(() => ({
    ok: false as const,
    error: "Couldn't add that class.",
  }));
  if (!joined.ok) return joined;
  revalidatePath("/", "layout");
  return { ok: true };
}

export async function requestConnection(profileId: string): Promise<Result> {
  const who = await caller();
  if (!("profileId" in who)) return { ok: false, error: who.error };
  if (profileId === who.profileId) return { ok: false, error: "That's you." };

  const { data: person, error: personError } = await who.admin
    .from("profiles")
    .select("id, username")
    .eq("id", profileId)
    .maybeSingle();
  if (personError) {
    if (unavailable(personError.message)) return { ok: false, error: migrationError(personError.message) };
    return { ok: false, error: "Couldn't send that request." };
  }
  if (!person?.username) return { ok: false, error: "That person doesn't have a username." };

  const { data: existing, error: existingError } = await who.admin
    .from("connections")
    .select("id, requester_id, status")
    .or(
      `and(requester_id.eq.${who.profileId},addressee_id.eq.${profileId}),and(requester_id.eq.${profileId},addressee_id.eq.${who.profileId})`,
    );
  if (existingError) {
    if (unavailable(existingError.message)) return { ok: false, error: migrationError(existingError.message) };
    return { ok: false, error: "Couldn't send that request." };
  }
  const row = existing?.[0];
  if (row?.status === "accepted") return { ok: false, error: "You're already connected." };
  if (row?.status === "pending" && row.requester_id === who.profileId) {
    return { ok: false, error: "They already have your request." };
  }
  if (row?.status === "pending") return { ok: false, error: "They already asked you. Approve it below." };

  const { error } = await who.admin.from("connections").insert({
    requester_id: who.profileId,
    addressee_id: profileId,
    status: "pending",
    requester_classes: [],
    addressee_classes: [],
  });
  if (error) {
    if (unavailable(error.message)) return { ok: false, error: migrationError(error.message) };
    if (/unique|duplicate/i.test(error.message)) return { ok: false, error: "They already have your request." };
    console.error("requestConnection failed", error.message);
    return { ok: false, error: "Couldn't send that request." };
  }
  revalidatePath("/", "layout");
  return { ok: true };
}

async function ownConnection(connectionId: string) {
  const who = await caller();
  if (!("profileId" in who)) return who;
  const { data, error } = await who.admin
    .from("connections")
    .select("id, requester_id, addressee_id, status")
    .eq("id", connectionId)
    .maybeSingle();
  if (error) {
    if (unavailable(error.message)) return { error: migrationError(error.message) } as const;
    return { error: "Couldn't update that request." } as const;
  }
  if (!data) return { error: "That request is gone." } as const;
  if (data.requester_id !== who.profileId && data.addressee_id !== who.profileId) {
    return { error: "That request isn't yours." } as const;
  }
  return { ...who, row: data } as const;
}

/** The person who was asked approves or declines. Classes stay hidden until they approve. */
export async function respondToConnection(connectionId: string, accept: boolean): Promise<Result> {
  const owned = await ownConnection(connectionId);
  if ("error" in owned && !("row" in owned)) return { ok: false, error: owned.error };
  if (!("row" in owned)) return { ok: false, error: "Couldn't update that request." };
  if (owned.row.addressee_id !== owned.profileId || owned.row.status !== "pending") {
    return { ok: false, error: "Only the person who was asked can approve this." };
  }
  const now = new Date().toISOString();
  const query = accept
    ? owned.admin.from("connections").update({ status: "accepted", updated_at: now }).eq("id", connectionId)
    : owned.admin.from("connections").delete().eq("id", connectionId);
  const { error } = await query;
  if (error) {
    console.error("respondToConnection failed", error.message);
    return { ok: false, error: "Couldn't update that request." };
  }
  revalidatePath("/", "layout");
  return { ok: true };
}

/** Gives the other person a course with this name when they don't already have it. */
async function ensureCourse(
  admin: ReturnType<typeof createAdminClient>,
  profileId: string,
  name: string,
  color: string,
) {
  const key = courseKey(name);
  const { data, error } = await admin.from("courses").select("name, is_unsorted").eq("user_id", profileId);
  if (error) throw new Error(error.message);
  if ((data ?? []).some((row) => !row.is_unsorted && courseKey(row.name) === key)) return;
  const named = (data ?? []).filter((row) => !row.is_unsorted).length;
  const { error: insertError } = await admin.from("courses").insert({
    user_id: profileId,
    name,
    color: color || COURSE_COLORS[named % COURSE_COLORS.length],
    is_unsorted: false,
  });
  if (insertError && !/unique|duplicate/i.test(insertError.message)) throw new Error(insertError.message);
}

/**
 * After both people have approved, either person checks the classes they want to share.
 * Each checked class is created for the other person when they don't have it, and both
 * are marked as sharing it.
 */
export async function setSharedClasses(connectionId: string, classKeys: string[]): Promise<Result> {
  const owned = await ownConnection(connectionId);
  if (!("row" in owned)) return { ok: false, error: "error" in owned ? owned.error : "Couldn't update that." };
  if (owned.row.status !== "accepted") {
    return { ok: false, error: "You can share classes after they approve." };
  }
  const otherId =
    owned.row.requester_id === owned.profileId ? owned.row.addressee_id : owned.row.requester_id;
  const { data, error } = await owned.admin
    .from("courses")
    .select("user_id, name, color, is_unsorted")
    .eq("user_id", owned.profileId);
  if (error) {
    if (unavailable(error.message)) return { ok: false, error: migrationError(error.message) };
    return { ok: false, error: "Couldn't update those classes." };
  }
  const mine = new Map<string, { name: string; color: string }>();
  for (const row of data ?? []) {
    if (row.is_unsorted) continue;
    const key = courseKey(row.name);
    if (key && !mine.has(key)) mine.set(key, { name: row.name.trim(), color: row.color });
  }
  const chosen = shareableKeys(classKeys, [...mine.keys()]);

  const { data: link, error: linkError } = await owned.admin
    .from("connections")
    .select("requester_classes, addressee_classes")
    .eq("id", connectionId)
    .maybeSingle();
  if (linkError || !link) {
    if (linkError && unavailable(linkError.message)) return { ok: false, error: migrationError(linkError.message) };
    return { ok: false, error: "Couldn't update those classes." };
  }
  const previous = [...new Set([...link.requester_classes, ...link.addressee_classes])];
  const next = [...chosen, ...previous.filter((key) => !mine.has(key))].slice(0, 40);

  try {
    for (const key of chosen) {
      const source = mine.get(key);
      if (!source) continue;
      await ensureCourse(owned.admin, otherId, source.name, source.color);
    }
  } catch (caught) {
    console.error("setSharedClasses course", caught);
    return { ok: false, error: "Couldn't add that class for them." };
  }

  const { error: updateError } = await owned.admin
    .from("connections")
    .update({
      requester_classes: next,
      addressee_classes: next,
      updated_at: new Date().toISOString(),
    })
    .eq("id", connectionId);
  if (updateError) {
    if (unavailable(updateError.message)) return { ok: false, error: migrationError(updateError.message) };
    console.error("setSharedClasses failed", updateError.message);
    return { ok: false, error: "Couldn't update those classes." };
  }
  revalidatePath("/", "layout");
  return { ok: true };
}

/** The sender withdraws a request, or either person ends an accepted connection. */
export async function removeConnection(connectionId: string): Promise<Result> {
  const owned = await ownConnection(connectionId);
  if (!("row" in owned)) return { ok: false, error: "error" in owned ? owned.error : "Couldn't update that." };
  if (owned.row.status === "pending" && owned.row.requester_id !== owned.profileId) {
    return { ok: false, error: "Decline the request instead." };
  }
  const { error } = await owned.admin.from("connections").delete().eq("id", connectionId);
  if (error) {
    console.error("removeConnection failed", error.message);
    return { ok: false, error: "Couldn't update that." };
  }
  revalidatePath("/", "layout");
  return { ok: true };
}
