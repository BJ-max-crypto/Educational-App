"use server";

import { auth } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import { checkedClasses, coursesInCommon, normalizeUsername, validateUsername } from "@/lib/members";
import type { SharedClass } from "@/lib/types";
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
  const { data, error } = await who.admin
    .from("profiles")
    .select("id, name, username")
    .like("username", `${escaped}%`)
    .neq("id", who.profileId)
    .limit(8);
  if (error) {
    if (unavailable(error.message)) return { ok: false, error: migrationError(error.message) };
    console.error("searchUsernames failed", error.message);
    return { ok: false, error: "Couldn't search right now." };
  }

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

  return {
    ok: true,
    matches: (data ?? [])
      .filter((row) => row.username)
      .map((row) => ({
        profileId: row.id,
        name: row.name?.trim() || row.username!,
        username: row.username!,
        status: status.get(row.id)?.status ?? "none",
        connectionId: status.get(row.id)?.connectionId ?? null,
      })),
  };
}

export async function listSharedClasses(
  profileId: string,
): Promise<{ ok: true; classes: SharedClass[] } | { ok: false; error: string }> {
  const who = await caller();
  if (!("profileId" in who)) return { ok: false, error: who.error };
  if (profileId === who.profileId) return { ok: true, classes: [] };
  try {
    const classes = await coursesInCommon(who.admin, who.profileId, profileId);
    return { ok: true, classes };
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (unavailable(message)) return { ok: false, error: migrationError(message) };
    console.error("listSharedClasses failed", error);
    return { ok: false, error: "Couldn't load your shared classes." };
  }
}

export async function requestConnection(profileId: string, classKeys: string[]): Promise<Result> {
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

  let classes: SharedClass[] = [];
  try {
    classes = await coursesInCommon(who.admin, who.profileId, profileId);
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (unavailable(message)) return { ok: false, error: migrationError(message) };
    return { ok: false, error: "Couldn't send that request." };
  }
  const { error } = await who.admin.from("connections").insert({
    requester_id: who.profileId,
    addressee_id: profileId,
    status: "pending",
    requester_classes: checkedClasses(classKeys, classes),
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

/** The person who was asked approves or declines. Approving saves the classes they checked. */
export async function respondToConnection(
  connectionId: string,
  accept: boolean,
  classKeys: string[] = [],
): Promise<Result> {
  const owned = await ownConnection(connectionId);
  if ("error" in owned && !("row" in owned)) return { ok: false, error: owned.error };
  if (!("row" in owned)) return { ok: false, error: "Couldn't update that request." };
  if (owned.row.addressee_id !== owned.profileId || owned.row.status !== "pending") {
    return { ok: false, error: "Only the person who was asked can approve this." };
  }
  const now = new Date().toISOString();
  let classes: SharedClass[] = [];
  if (accept) {
    try {
      classes = await coursesInCommon(owned.admin, owned.profileId, owned.row.requester_id);
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      if (unavailable(message)) return { ok: false, error: migrationError(message) };
      return { ok: false, error: "Couldn't update that request." };
    }
  }
  const query = accept
    ? owned.admin
        .from("connections")
        .update({
          status: "accepted",
          addressee_classes: checkedClasses(classKeys, classes),
          updated_at: now,
        })
        .eq("id", connectionId)
    : owned.admin.from("connections").delete().eq("id", connectionId);
  const { error } = await query;
  if (error) {
    console.error("respondToConnection failed", error.message);
    return { ok: false, error: "Couldn't update that request." };
  }
  revalidatePath("/", "layout");
  return { ok: true };
}

/** Either person changes the classes they checked. The other person's checks stay put. */
export async function setMyClasses(connectionId: string, classKeys: string[]): Promise<Result> {
  const owned = await ownConnection(connectionId);
  if (!("row" in owned)) return { ok: false, error: "error" in owned ? owned.error : "Couldn't update that." };
  const otherId =
    owned.row.requester_id === owned.profileId ? owned.row.addressee_id : owned.row.requester_id;
  let classes: SharedClass[] = [];
  try {
    classes = await coursesInCommon(owned.admin, owned.profileId, otherId);
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (unavailable(message)) return { ok: false, error: migrationError(message) };
    return { ok: false, error: "Couldn't update those classes." };
  }
  const chosen = checkedClasses(classKeys, classes);
  const patch =
    owned.row.requester_id === owned.profileId
      ? { requester_classes: chosen, updated_at: new Date().toISOString() }
      : { addressee_classes: chosen, updated_at: new Date().toISOString() };
  const { error } = await owned.admin.from("connections").update(patch).eq("id", connectionId);
  if (error) {
    if (unavailable(error.message)) return { ok: false, error: migrationError(error.message) };
    console.error("setMyClasses failed", error.message);
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
