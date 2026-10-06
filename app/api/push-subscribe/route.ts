import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isValidZone } from "@/lib/timezone";
import { getUserDb } from "@/lib/user-db";

export const dynamic = "force-dynamic";

const MISSING = /push_subscriptions|schema cache/i;

export async function POST(request: Request) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ ok: false, error: "Sign in again." }, { status: 401 });
  const db = await getUserDb(userId);
  if (!db) return NextResponse.json({ ok: false, error: "Finish onboarding first." }, { status: 404 });
  const body = (await request.json().catch(() => null)) as {
    endpoint?: unknown;
    p256dh?: unknown;
    auth?: unknown;
    timeZone?: unknown;
  } | null;
  const endpoint = typeof body?.endpoint === "string" ? body.endpoint : "";
  const p256dh = typeof body?.p256dh === "string" ? body.p256dh : "";
  const authKey = typeof body?.auth === "string" ? body.auth : "";
  const timeZone = typeof body?.timeZone === "string" && isValidZone(body.timeZone) ? body.timeZone : "UTC";
  if (!endpoint.startsWith("https://") || !p256dh || !authKey) {
    return NextResponse.json({ ok: false, error: "That push subscription is incomplete." }, { status: 400 });
  }
  const admin = createAdminClient();
  const { error } = await admin.from("push_subscriptions").upsert(
    { user_id: db.profileId, endpoint, p256dh, auth: authKey, time_zone: timeZone },
    { onConflict: "endpoint" },
  );
  if (error) {
    if (MISSING.test(error.message)) {
      return NextResponse.json({ ok: false, error: "Push needs a database update (supabase/migrations/0011_plus_limits_and_push.sql)." });
    }
    console.error("push subscribe failed", error.message);
    return NextResponse.json({ ok: false, error: "Couldn't save that notification subscription." }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
