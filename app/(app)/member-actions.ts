"use server";

import { auth } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import { validateUsername } from "@/lib/classmates";
import { MEMBERS_MIGRATION, type MemberHub, type MemberSearchHit } from "@/lib/member-types";
import {
  cancelConnection,
  loadMemberHub,
  removeConnection,
  requestConnection,
  respondToConnection,
  saveUsername,
  searchUsernames,
} from "@/lib/members";
import { getUserDb } from "@/lib/user-db";

export type MemberAction = { ok: true } | { ok: false; error: string };

async function profileId(): Promise<{ id: string } | { error: string }> {
  const { userId } = await auth();
  if (!userId) return { error: "Your session ended. Sign in again." };
  const db = await getUserDb(userId);
  if (!db) return { error: "Finish onboarding first." };
  return { id: db.profileId };
}

export async function getMemberHub(): Promise<MemberHub> {
  const me = await profileId();
  if ("error" in me) return { username: null, links: [], schemaReady: true };
  return loadMemberHub(me.id);
}

export async function searchMembers(
  raw: string,
): Promise<{ ok: true; hits: MemberSearchHit[] } | { ok: false; error: string }> {
  const me = await profileId();
  if ("error" in me) return { ok: false, error: me.error };
  try {
    const hits = await searchUsernames(me.id, raw);
    if (hits === "missing") return { ok: false, error: MEMBERS_MIGRATION };
    return { ok: true, hits };
  } catch (error) {
    console.error("searchMembers", error);
    return { ok: false, error: "Couldn't search right now. Try again." };
  }
}

export async function setUsername(raw: string): Promise<MemberAction> {
  const me = await profileId();
  if ("error" in me) return { ok: false, error: me.error };
  const username = validateUsername(raw);
  if ("error" in username) return { ok: false, error: username.error };
  const result = await saveUsername(me.id, username.value);
  if (result.ok) revalidatePath("/", "layout");
  return result;
}

export async function sendMemberRequest(otherId: string): Promise<MemberAction> {
  const me = await profileId();
  if ("error" in me) return { ok: false, error: me.error };
  const result = await requestConnection(me.id, otherId);
  if (result.ok) revalidatePath("/", "layout");
  return result;
}

export async function answerMemberRequest(connectionId: string, accept: boolean): Promise<MemberAction> {
  const me = await profileId();
  if ("error" in me) return { ok: false, error: me.error };
  const result = await respondToConnection(me.id, connectionId, accept);
  if (result.ok) revalidatePath("/", "layout");
  return result;
}

export async function cancelMemberRequest(connectionId: string): Promise<MemberAction> {
  const me = await profileId();
  if ("error" in me) return { ok: false, error: me.error };
  const result = await cancelConnection(me.id, connectionId);
  if (result.ok) revalidatePath("/", "layout");
  return result;
}

export async function removeMember(connectionId: string): Promise<MemberAction> {
  const me = await profileId();
  if ("error" in me) return { ok: false, error: me.error };
  const result = await removeConnection(me.id, connectionId);
  if (result.ok) revalidatePath("/", "layout");
  return result;
}
