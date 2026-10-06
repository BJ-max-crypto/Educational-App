import { NextResponse } from "next/server";
import { dispatchAssignmentPushes } from "@/lib/send-push";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  const header = request.headers.get("authorization");
  if (!secret || header !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }
  try {
    const result = await dispatchAssignmentPushes();
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    console.error("assignment push dispatch failed", error);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
