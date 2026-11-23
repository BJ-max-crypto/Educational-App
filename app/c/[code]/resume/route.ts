import { auth, currentUser } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { CLASS_CODE, CLASS_INVITE_COOKIE } from "@/lib/class-match";
import type { OnboardingMetadata } from "@/lib/onboarding";

export const dynamic = "force-dynamic";

function cookie(response: NextResponse, code: string) {
  response.cookies.set(CLASS_INVITE_COOKIE, code, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 14,
  });
  return response;
}

export async function GET(request: Request, context: { params: Promise<{ code: string }> }) {
  const { code } = await context.params;
  const normalized = code.trim().toLowerCase();
  if (!CLASS_CODE.test(normalized)) {
    const response = NextResponse.redirect(new URL("/dashboard", request.url));
    response.cookies.set(CLASS_INVITE_COOKIE, "", { path: "/", maxAge: 0 });
    return response;
  }
  const { userId } = await auth();
  if (!userId) return cookie(NextResponse.redirect(new URL("/sign-up", request.url)), normalized);
  const user = await currentUser();
  const meta = (user?.publicMetadata ?? {}) as OnboardingMetadata;
  if (!meta.onboardingComplete) return cookie(NextResponse.redirect(new URL("/onboarding", request.url)), normalized);
  const response = NextResponse.redirect(new URL(`/c/${normalized}`, request.url));
  response.cookies.set(CLASS_INVITE_COOKIE, "", { path: "/", maxAge: 0 });
  return response;
}
