"use server";

import { auth } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import { syncFeed } from "@/lib/sync";
import type { AssignmentStatus } from "@/lib/types";
import { getUserDb } from "@/lib/user-db";

export type ActionResult = { ok: true } | { ok: false; error: string };

const STATUSES: AssignmentStatus[] = ["not_started", "in_progress", "submitted"];

export async function setAssignmentStatus(
  assignmentId: string,
  status: AssignmentStatus,
): Promise<ActionResult> {
  const { userId } = await auth();
  if (!userId) return { ok: false, error: "Your session ended. Sign in again." };
  if (!STATUSES.includes(status)) return { ok: false, error: "Unknown status." };

  const db = await getUserDb(userId);
  if (!db) return { ok: false, error: "Finish onboarding first." };

  const { data, error } = await db.supabase
    .from("assignments")
    .update({
      status: status === "submitted" ? "done" : status,
      status_source: "manual",
      updated_at: new Date().toISOString(),
    })
    .eq("id", assignmentId)
    .eq("user_id", db.profileId)
    .select("id");
  if (error || !data?.length) return { ok: false, error: "Couldn't save that. Try again." };
  return { ok: true };
}

export async function syncNow(): Promise<ActionResult> {
  const { userId } = await auth();
  if (!userId) return { ok: false, error: "Your session ended. Sign in again." };
  const db = await getUserDb(userId);
  if (!db) return { ok: false, error: "Finish onboarding first." };

  const { data: feed } = await db.supabase
    .from("feeds")
    .select("updated_at")
    .eq("user_id", db.profileId)
    .maybeSingle();
  if (feed && Date.now() - new Date(feed.updated_at).getTime() < 20_000) {
    return { ok: false, error: "Synced a moment ago. Try again in a few seconds." };
  }

  const result = await syncFeed(db.profileId);
  revalidatePath("/", "layout");
  return result.ok ? { ok: true } : result;
}
