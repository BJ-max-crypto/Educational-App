import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { REFERRAL_CODE } from "@/lib/referral-rules";

export const dynamic = "force-dynamic";

export async function GET(request: Request, context: { params: Promise<{ code: string }> }) {
  const { code } = await context.params;
  const normalized = code.trim().toLowerCase();
  const { userId } = await auth();
  const destination = new URL(userId ? "/dashboard" : "/sign-up", request.url);
  const response = NextResponse.redirect(destination);
  if (!userId && REFERRAL_CODE.test(normalized)) {
    response.cookies.set("pane_ref", normalized, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 60 * 24 * 30,
    });
  }
  return response;
}
