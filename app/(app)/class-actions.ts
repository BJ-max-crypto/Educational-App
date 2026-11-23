"use server";

import { auth } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import { changeClassInvite, joinClassByCode, loadClassInvite } from "@/lib/class-invites";
import { getUserDb } from "@/lib/user-db";

async function profileId() {
  const { userId } = await auth();
  if (!userId) return null;
  const db = await getUserDb(userId);
  return db?.profileId ?? null;
}

export async function readClassInvite(courseId: string) {
  const id = await profileId();
  if (!id) return { ok: false as const, error: "Your session ended. Sign in again." };
  return loadClassInvite(id, courseId);
}

export async function regenerateClassInvite(courseId: string) {
  const id = await profileId();
  if (!id) return { ok: false as const, error: "Your session ended. Sign in again." };
  const result = await changeClassInvite(id, courseId, "regenerate");
  if (result.ok) revalidatePath("/", "layout");
  return result;
}

export async function revokeClassInvite(courseId: string) {
  const id = await profileId();
  if (!id) return { ok: false as const, error: "Your session ended. Sign in again." };
  const result = await changeClassInvite(id, courseId, "revoke");
  if (result.ok) revalidatePath("/", "layout");
  return result;
}

export async function joinClassInvite(code: string) {
  const id = await profileId();
  if (!id) return { ok: false as const, error: "Your session ended. Sign in again." };
  const result = await joinClassByCode(id, code);
  if (result.ok) revalidatePath("/", "layout");
  return result;
}
