"use client";

import { useSignIn, useSignUp } from "@clerk/nextjs/legacy";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { allowOAuthSignup, createEmailAccount } from "@/app/(auth)/signup-actions";
import { GlassCard } from "@/components/glass-card";
import { AGE_REJECTED } from "@/lib/age-copy";

const inputClass =
  "w-full rounded-[18px] border border-white/90 bg-white/80 px-4 py-3.5 text-[16px] text-[#14213d] outline-none focus:border-[#4f7cff] focus:ring-4 focus:ring-[#4f7cff]/15";

export function SignUpForm() {
  const router = useRouter();
  const params = useSearchParams();
  const { signIn, setActive, isLoaded: signInLoaded } = useSignIn();
  const { signUp, isLoaded: signUpLoaded } = useSignUp();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [birthdate, setBirthdate] = useState("");
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [error, setError] = useState<string | null>(
    params.get("rejected") === "age" ? AGE_REJECTED : null,
  );
  const [pending, setPending] = useState<"email" | "google" | null>(null);

  async function createWithEmail(event: React.FormEvent) {
    event.preventDefault();
    if (!signInLoaded || !signIn || !setActive) return;
    setPending("email");
    setError(null);
    const created = await createEmailAccount({ email, password, birthdate, termsAccepted }).catch(() => ({
      ok: false as const,
      error: "Couldn't create the account. Try again.",
    }));
    if (!created.ok) {
      setPending(null);
      setError(created.error);
      return;
    }
    try {
      const attempt = await signIn.create({ strategy: "ticket", ticket: created.ticket });
      if (attempt.status === "complete" && attempt.createdSessionId) {
        await setActive({ session: attempt.createdSessionId });
        router.push("/onboarding");
        return;
      }
      setError("Couldn't sign in to the new account. Try signing in.");
    } catch {
      setError("Couldn't sign in to the new account. Try signing in.");
    } finally {
      setPending(null);
    }
  }

  async function createWithGoogle() {
    if (!signUpLoaded || !signUp) return;
    setPending("google");
    setError(null);
    const allowed = await allowOAuthSignup({ birthdate, termsAccepted }).catch(() => ({
      ok: false as const,
      error: "Couldn't start Google sign-up. Try again.",
    }));
    if (!allowed.ok) {
      setPending(null);
      setError(allowed.error);
      return;
    }
    try {
      await signUp.authenticateWithRedirect({
        strategy: "oauth_google",
        redirectUrl: "/sign-up/sso-callback",
        redirectUrlComplete: "/onboarding",
      });
    } catch {
      setPending(null);
      setError("Couldn't start Google sign-up. Try again.");
    }
  }

  return (
    <GlassCard className="w-full p-7 sm:p-9">
      <h1 className="text-[26px] font-semibold tracking-[-0.03em] text-[#14213d]">Create your account</h1>
      <p className="mt-2 text-[14px] text-[#5b6478]">Pane is for students 13 and older.</p>

      <form onSubmit={(event) => void createWithEmail(event)} className="mt-6 space-y-4" noValidate>
        <label className="block">
          <span className="text-[13px] font-medium text-[#5b6478]">Email</span>
          <input
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className={`${inputClass} mt-1`}
          />
        </label>
        <label className="block">
          <span className="text-[13px] font-medium text-[#5b6478]">Password</span>
          <input
            type="password"
            autoComplete="new-password"
            required
            minLength={8}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className={`${inputClass} mt-1`}
          />
        </label>
        <label className="block">
          <span className="text-[13px] font-medium text-[#5b6478]">Date of birth</span>
          <input
            type="date"
            required
            value={birthdate}
            onChange={(event) => setBirthdate(event.target.value)}
            className={`${inputClass} mt-1`}
          />
        </label>
        <label className="flex items-start gap-3 text-[14px] text-[#14213d]">
          <input
            type="checkbox"
            checked={termsAccepted}
            onChange={(event) => setTermsAccepted(event.target.checked)}
            className="mt-1 size-4 accent-[#4f7cff]"
            required
          />
          <span>
            I have read and agree to the{" "}
            <Link href="/terms" className="font-semibold underline-offset-2 hover:underline">
              Terms of Service
            </Link>{" "}
            and{" "}
            <Link href="/privacy" className="font-semibold underline-offset-2 hover:underline">
              Privacy Policy
            </Link>
            .
          </span>
        </label>
        {error ? (
          <p role="alert" className="text-[14px] font-semibold text-[#e5484d]">
            {error}
          </p>
        ) : null}
        <button
          type="submit"
          disabled={pending !== null}
          className="w-full rounded-full bg-[#14213d] px-7 py-3 text-[15px] font-semibold text-white shadow-[0_8px_20px_rgba(20,33,61,0.2)] disabled:opacity-60"
        >
          {pending === "email" ? "Creating account…" : "Create account"}
        </button>
      </form>

      <div className="my-5 flex items-center gap-3 text-[12px] font-semibold tracking-[0.08em] text-[#5b6478]">
        <span className="h-px flex-1 bg-white/80" />
        OR
        <span className="h-px flex-1 bg-white/80" />
      </div>

      <button
        type="button"
        disabled={pending !== null}
        onClick={() => void createWithGoogle()}
        className="w-full rounded-full border border-white/90 bg-white/85 px-7 py-3 text-[15px] font-semibold text-[#14213d] disabled:opacity-60"
      >
        {pending === "google" ? "Continuing to Google…" : "Continue with Google"}
      </button>
      <p className="mt-3 text-[12px] text-[#5b6478]">
        Google uses the same date of birth and agreement above. Pane does not save the date itself.
      </p>
      <p className="mt-6 text-center text-[14px] text-[#5b6478]">
        Already have an account?{" "}
        <Link href="/sign-in" className="font-semibold text-[#14213d] underline-offset-2 hover:underline">
          Sign in
        </Link>
      </p>
    </GlassCard>
  );
}
