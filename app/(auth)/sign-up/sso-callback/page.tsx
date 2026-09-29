"use client";

import { AuthenticateWithRedirectCallback } from "@clerk/nextjs";

export default function SignUpCallbackPage() {
  return <AuthenticateWithRedirectCallback signUpForceRedirectUrl="/onboarding" />;
}
