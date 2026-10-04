"use client";

import { useClerk } from "@clerk/nextjs";
import Image from "next/image";
import Link from "next/link";

export function OnboardingLogo() {
  const { signOut } = useClerk();

  return (
    <Link
      href="/sign-in"
      aria-label="Back to sign in"
      onClick={(event) => {
        event.preventDefault();
        void signOut({ redirectUrl: "/sign-in" });
      }}
      className="mb-6"
    >
      <Image src="/logo.png" alt="" width={84} height={96} priority className="h-24 w-auto" />
    </Link>
  );
}
