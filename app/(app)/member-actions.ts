"use server";

import { auth } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import { normalizeUsername, validateUsername } from "@/lib/members";
import { createAdminClient } from "@/lib/supabase/admin";
import { getUserDb } from "@/lib/user-db";

type Result = { ok: true } | { ok: false; error: string };

const MIGRATION = "Adding people needs a database update (supabase/migrations/0005_members.sql).";

function unavailable(message: string) {
  return /connections|username|schema cache/i.test(message);
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
    if (unavailable(error.message)) return { ok: false, error: MIGRATION };
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
    if (unavailable(error.message)) return { ok: false, error: MIGRATION };
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
      if (unavailable(linksError.message)) return { ok: false, error: MIGRATION };
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
    if (unavailable(personError.message)) return { ok: false, error: MIGRATION };
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
    if (unavailable(existingError.message)) return { ok: false, error: MIGRATION };
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
  });
  if (error) {
    if (unavailable(error.message)) return { ok: false, error: MIGRATION };
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
    if (unavailable(error.message)) return { error: MIGRATION } as const;
    return { error: "Couldn't update that request." } as const;
  }
  if (!data) return { error: "That request is gone." } as const;
  if (data.requester_id !== who.profileId && data.addressee_id !== who.profileId) {
    return { error: "That request isn't yours." } as const;
  }
  return { ...who, row: data } as const;
}

/** The person who was asked approves or declines. */
export async function respondToConnection(connectionId: string, accept: boolean): Promise<Result> {
  const owned = await ownConnection(connectionId);
  if ("error" in owned && !("row" in owned)) return { ok: false, error: owned.error };
  if (!("row" in owned)) return { ok: false, error: "Couldn't update that request." };
  if (owned.row.addressee_id !== owned.profileId || owned.row.status !== "pending") {
    return { ok: false, error: "Only the person who was asked can approve this." };
  }
  const now = new Date().toISOString();
  const query = accept
    ? owned.admin
        .from("connections")
        .update({ status: "accepted", updated_at: now })
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
