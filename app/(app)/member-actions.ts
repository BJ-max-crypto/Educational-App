"use server";

import { auth } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import { randomBytes } from "node:crypto";
import { nameForViewer } from "@/lib/identity";
import { courseKey, normalizeUsername, shareableKeys, validateUsername } from "@/lib/members";
import { countSchoolmates, joinNamedClass } from "@/lib/school-feed";
import { validateClassName } from "@/lib/onboarding";
import { createAdminClient } from "@/lib/supabase/admin";
import { getUserDb } from "@/lib/user-db";

type Result = { ok: true } | { ok: false; error: string };

const MIGRATION = "Adding people needs a database update (supabase/migrations/0005_members.sql).";
const INVITE_MIGRATION = "Invites need a database update (supabase/migrations/0009_invite_codes.sql).";
const INVITE_ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789";
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
  /** Null until both people have approved. */
  name: string | null;
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

  const approvedIds = ids.filter((id) => status.get(id)?.status === "accepted");
  const classes = new Map<string, string[]>();
  if (approvedIds.length) {
    const { data: courses, error: coursesError } = await who.admin
      .from("courses")
      .select("user_id, name, is_unsorted")
      .in("user_id", approvedIds)
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
      .map((row) => {
        const link = status.get(row.id);
        const approved = link?.status === "accepted";
        return {
        profileId: row.id,
        name: nameForViewer(approved, row.name),
        username: row.username!,
        school: row.school?.trim() || null,
        schoolLocation: (() => {
          if (!("school_location" in row)) return null;
          const value = row.school_location;
          return typeof value === "string" ? value.trim() || null : null;
        })(),
        grade: row.grade?.trim() || null,
        classes: approved ? (classes.get(row.id) ?? []).slice(0, 8) : [],
        status: link?.status ?? "none",
        connectionId: link?.connectionId ?? null,
        };
      }),
  };
}

export async function schoolPresence(): Promise<
  { ok: true; count: number | null; school: string | null; notice: string | null } | { ok: false; error: string }
> {
  const who = await caller();
  if (!("profileId" in who)) return { ok: false, error: who.error };
  try {
    const result = await countSchoolmates(who.profileId);
    return { ok: true, count: result.count, school: result.school, notice: result.notice };
  } catch (error) {
    console.error("schoolPresence failed", error);
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

/**
 * Records classes this person already has. It does not create courses on the other account.
 * A classmate only appears when both people added that course themselves.
 */
export async function setSharedClasses(connectionId: string, classKeys: string[]): Promise<Result> {
  const owned = await ownConnection(connectionId);
  if (!("row" in owned)) return { ok: false, error: "error" in owned ? owned.error : "Couldn't update that." };
  if (owned.row.status !== "accepted") {
    return { ok: false, error: "You can share classes after they approve." };
  }
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

function inviteCode() {
  const bytes = randomBytes(8);
  return [...bytes].map((byte) => INVITE_ALPHABET[byte % INVITE_ALPHABET.length]).join("");
}

export async function myInvite(): Promise<{ ok: true; code: string } | { ok: false; error: string }> {
  const who = await caller();
  if (!("profileId" in who)) return { ok: false, error: who.error };
  const existing = await who.admin.from("profiles").select("invite_code").eq("id", who.profileId).maybeSingle();
  if (existing.error) {
    if (/invite_code|schema cache/i.test(existing.error.message)) return { ok: false, error: INVITE_MIGRATION };
    return { ok: false, error: "Couldn't load your invite." };
  }
  if (existing.data?.invite_code) return { ok: true, code: existing.data.invite_code };
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const code = inviteCode();
    const { error } = await who.admin.from("profiles").update({ invite_code: code }).eq("id", who.profileId);
    if (!error) return { ok: true, code };
    if (/invite_code|schema cache/i.test(error.message)) return { ok: false, error: INVITE_MIGRATION };
    if (!/unique|duplicate/i.test(error.message)) return { ok: false, error: "Couldn't create your invite." };
  }
  return { ok: false, error: "Couldn't create your invite." };
}

export async function lookupInvite(
  raw: string,
): Promise<
  | {
      ok: true;
      username: string;
      profileId: string;
      name: string | null;
      status: UsernameMatch["status"];
      connectionId: string | null;
    }
  | { ok: false; error: string }
> {
  const code = raw.trim().toLowerCase();
  if (!/^[a-z0-9]{8}$/.test(code)) return { ok: false, error: "That invite isn't valid." };
  const who = await caller();
  if (!("profileId" in who)) return { ok: false, error: who.error };
  const found = await who.admin
    .from("profiles")
    .select("id, name, username")
    .eq("invite_code", code)
    .maybeSingle();
  if (found.error) {
    if (/invite_code|schema cache/i.test(found.error.message)) return { ok: false, error: INVITE_MIGRATION };
    return { ok: false, error: "Couldn't open that invite." };
  }
  const row = found.data;
  if (!row?.username) return { ok: false, error: "That invite isn't valid." };
  if (row.id === who.profileId) return { ok: false, error: "This is your invite. Share it with a classmate." };

  const { data: links, error: linksError } = await who.admin
    .from("connections")
    .select("id, requester_id, addressee_id, status")
    .or(`requester_id.eq.${who.profileId},addressee_id.eq.${who.profileId}`);
  if (linksError) return { ok: false, error: "Couldn't open that invite." };
  const link = (links ?? []).find((item) => item.requester_id === row.id || item.addressee_id === row.id);
  const status: UsernameMatch["status"] = !link
    ? "none"
    : link.status === "accepted"
      ? "accepted"
      : link.requester_id === who.profileId
        ? "outgoing"
        : "incoming";
  return {
    ok: true,
    username: row.username,
    profileId: row.id,
    name: nameForViewer(status === "accepted", row.name),
    status,
    connectionId: link?.id ?? null,
  };
}
