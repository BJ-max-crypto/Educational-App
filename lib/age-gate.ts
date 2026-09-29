import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { clerkClient, type User } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { AGE_REJECTED, MIN_AGE, TERMS_REQUIRED } from "@/lib/age-copy";
import { createAdminClient } from "@/lib/supabase/admin";

export { AGE_REJECTED, MIN_AGE, TERMS_REQUIRED };

const COOKIE = "pane_age_ok";
const MAX_AGE_SECONDS = 15 * 60;

export type BirthdateCheck = { ok: true } | { ok: false; error: string };

/** Full years between a YYYY-MM-DD birthdate and today. The date itself is not stored. */
export function assessBirthdate(value: string, now = new Date()): BirthdateCheck {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!match) return { ok: false, error: "Enter your date of birth." };
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const birth = new Date(Date.UTC(year, month - 1, day));
  if (
    birth.getUTCFullYear() !== year ||
    birth.getUTCMonth() !== month - 1 ||
    birth.getUTCDate() !== day
  ) {
    return { ok: false, error: "Enter your date of birth." };
  }
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  if (birth.getTime() > today.getTime()) return { ok: false, error: "Enter your date of birth." };
  let age = today.getUTCFullYear() - year;
  const beforeBirthday =
    today.getUTCMonth() < month - 1 || (today.getUTCMonth() === month - 1 && today.getUTCDate() < day);
  if (beforeBirthday) age -= 1;
  if (age < MIN_AGE) return { ok: false, error: AGE_REJECTED };
  if (age > 120) return { ok: false, error: "Enter your date of birth." };
  return { ok: true };
}

export function signupAllowed(birthdate: string, termsAccepted: boolean): BirthdateCheck {
  if (termsAccepted !== true) return { ok: false, error: TERMS_REQUIRED };
  return assessBirthdate(birthdate);
}

function hmacKey() {
  const raw = process.env.FEED_ENCRYPTION_KEY;
  if (!raw) throw new Error("Missing FEED_ENCRYPTION_KEY");
  return raw;
}

function sign(exp: number) {
  const mac = createHmac("sha256", hmacKey()).update(String(exp)).digest("base64url");
  return `${exp}.${mac}`;
}

function validToken(token: string | undefined, now = Date.now()) {
  try {
    if (!token) return false;
    const [expRaw, mac] = token.split(".");
    const exp = Number(expRaw);
    if (!mac || !Number.isFinite(exp) || exp * 1000 < now) return false;
    const expected = createHmac("sha256", hmacKey()).update(String(exp)).digest("base64url");
    const a = Buffer.from(mac);
    const b = Buffer.from(expected);
    return a.length === b.length && timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

export async function grantAgeProof() {
  const exp = Math.floor(Date.now() / 1000) + MAX_AGE_SECONDS;
  const jar = await cookies();
  jar.set(COOKIE, sign(exp), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: MAX_AGE_SECONDS,
  });
}

async function takeAgeProof() {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (!validToken(token)) return false;
  jar.delete(COOKIE);
  return true;
}

export function isMissingClerkUser(error: unknown) {
  const status = (error as { status?: number }).status;
  const code = (error as { errors?: { code?: string }[] }).errors?.[0]?.code;
  return status === 404 || code === "resource_not_found";
}

/**
 * Server-side gate for every account, including Google.
 * A new Clerk user with no Pane profile and no prior onboarding is deleted
 * unless this request carries the signed proof from `signupAllowed`.
 * Nothing is written to Supabase here.
 */
export async function enforceAccountAge(user: User | null) {
  if (!user) return;
  const meta = (user.publicMetadata ?? {}) as { age13Plus?: boolean; onboardingComplete?: boolean };
  if (meta.age13Plus === true || meta.onboardingComplete === true) return;

  const admin = createAdminClient();
  const existing = await admin.from("profiles").select("id").eq("clerk_user_id", user.id).maybeSingle();
  if (existing.error || existing.data) return;

  const clerk = await clerkClient();
  if (await takeAgeProof()) {
    await clerk.users.updateUserMetadata(user.id, {
      publicMetadata: { ...user.publicMetadata, age13Plus: true, termsAccepted: true },
    });
    return;
  }

  await clerk.users.deleteUser(user.id);
  redirect("/sign-up?rejected=age");
}
