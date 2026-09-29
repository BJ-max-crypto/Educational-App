"use server";

import { clerkClient } from "@clerk/nextjs/server";
import { grantAgeProof, signupAllowed } from "@/lib/age-gate";

type Result = { ok: true; ticket: string } | { ok: false; error: string };
type Allow = { ok: true } | { ok: false; error: string };

function clerkMessage(error: unknown) {
  const errors = (error as { errors?: { message?: string; code?: string }[] })?.errors;
  const code = errors?.[0]?.code ?? "";
  const message = errors?.[0]?.message ?? "";
  if (/identifier_exists|already exists|form_identifier_exists/i.test(`${code} ${message}`)) {
    return "An account with that email already exists. Sign in instead.";
  }
  if (/password/i.test(`${code} ${message}`)) return "Use a stronger password (at least 8 characters).";
  return "Couldn't create the account. Try again.";
}

/** Email sign-up. Under 13 or a missing terms box returns before Clerk is called. */
export async function createEmailAccount(input: {
  email: string;
  password: string;
  birthdate: string;
  termsAccepted: boolean;
}): Promise<Result> {
  const gate = signupAllowed(input.birthdate, input.termsAccepted);
  if (!gate.ok) return gate;

  const email = input.email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { ok: false, error: "Enter a valid email." };
  if (input.password.length < 8) return { ok: false, error: "Use a password of at least 8 characters." };

  try {
    const clerk = await clerkClient();
    const user = await clerk.users.createUser({
      emailAddress: [email],
      password: input.password,
      publicMetadata: { age13Plus: true, termsAccepted: true },
      legalAcceptedAt: new Date(),
    });
    const ticket = await clerk.signInTokens.createSignInToken({
      userId: user.id,
      expiresInSeconds: 60,
    });
    return { ok: true, ticket: ticket.token };
  } catch (error) {
    console.error("createEmailAccount failed", error instanceof Error ? error.message : "clerk error");
    return { ok: false, error: clerkMessage(error) };
  }
}

/**
 * Google sign-up. The birthdate is checked here and discarded.
 * Only a short-lived signed cookie is kept so the OAuth return can be tied to this check.
 */
export async function allowOAuthSignup(input: {
  birthdate: string;
  termsAccepted: boolean;
}): Promise<Allow> {
  const gate = signupAllowed(input.birthdate, input.termsAccepted);
  if (!gate.ok) return gate;
  try {
    await grantAgeProof();
  } catch {
    return { ok: false, error: "Pane isn't fully set up yet. Try again later." };
  }
  return { ok: true };
}
