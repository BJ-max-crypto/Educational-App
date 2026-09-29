"use server";

import { auth } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import sharp from "sharp";
import { createAdminClient } from "@/lib/supabase/admin";
import { getUserDb } from "@/lib/user-db";

type Result = { ok: true; preview: string | null } | { ok: false; error: string };

const MIGRATION =
  "Schedule photos need a database update (supabase/migrations/0007_school_and_shared_feed.sql).";

function missing(message: string) {
  return /schedule_photos|schema cache/i.test(message);
}

async function owner() {
  const { userId } = await auth();
  if (!userId) return { error: "Your session ended. Sign in again." } as const;
  const db = await getUserDb(userId);
  if (!db) return { error: "Finish onboarding first." } as const;
  return { profileId: db.profileId } as const;
}

export async function schedulePreview(): Promise<{ preview: string | null }> {
  const who = await owner();
  if (!("profileId" in who) || typeof who.profileId !== "string") return { preview: null };
  const profileId = who.profileId;
  const { data, error } = await createAdminClient()
    .from("schedule_photos")
    .select("data")
    .eq("user_id", profileId)
    .maybeSingle();
  const encoded = data?.data;
  if (error || typeof encoded !== "string" || !encoded) return { preview: null };
  try {
    const thumb = await sharp(Buffer.from(encoded, "base64"))
      .resize({ width: 480, height: 480, fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 70 })
      .toBuffer();
    return { preview: `data:image/jpeg;base64,${thumb.toString("base64")}` };
  } catch {
    return { preview: null };
  }
}

export async function saveSchedulePhoto(formData: FormData): Promise<Result> {
  const who = await owner();
  if (!("profileId" in who) || typeof who.profileId !== "string") {
    return { ok: false, error: "error" in who ? who.error : "Finish onboarding first." };
  }
  const profileId = who.profileId;
  const file = formData.get("photo");
  if (!(file instanceof File) || file.size === 0) return { ok: false, error: "Choose a picture of your schedule." };
  if (!["image/jpeg", "image/png", "image/webp", "image/gif"].includes(file.type)) {
    return { ok: false, error: "Use a JPEG, PNG, or WebP picture." };
  }
  if (file.size > 8 * 1024 * 1024) return { ok: false, error: "That picture is larger than 8 MB." };

  let jpeg: Buffer;
  try {
    jpeg = await sharp(Buffer.from(await file.arrayBuffer()))
      .rotate()
      .resize({ width: 1600, height: 1600, fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 76 })
      .toBuffer();
  } catch {
    return { ok: false, error: "That file isn't a picture Pane can read." };
  }
  if (jpeg.length > 1_500_000) return { ok: false, error: "That picture is still too large. Try a smaller one." };

  const { error } = await createAdminClient()
    .from("schedule_photos")
    .upsert({
      user_id: profileId,
      content_type: "image/jpeg",
      data: jpeg.toString("base64"),
      updated_at: new Date().toISOString(),
    });
  if (error) {
    console.error("saveSchedulePhoto failed", error.message);
    return { ok: false, error: missing(error.message) ? MIGRATION : "Couldn't save that picture. Try again." };
  }
  revalidatePath("/planner");
  const thumb = await sharp(jpeg).resize({ width: 480, withoutEnlargement: true }).jpeg({ quality: 70 }).toBuffer();
  const preview = thumb.toString("base64");
  return { ok: true, preview: `data:image/jpeg;base64,${preview}` };
}

export async function removeSchedulePhoto(): Promise<Result> {
  const who = await owner();
  if (!("profileId" in who) || typeof who.profileId !== "string") {
    return { ok: false, error: "error" in who ? who.error : "Finish onboarding first." };
  }
  const { error } = await createAdminClient().from("schedule_photos").delete().eq("user_id", who.profileId);
  if (error) {
    return { ok: false, error: missing(error.message) ? MIGRATION : "Couldn't remove that picture." };
  }
  revalidatePath("/planner");
  return { ok: true, preview: null };
}
