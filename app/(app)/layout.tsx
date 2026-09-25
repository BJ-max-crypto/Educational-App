import { auth, currentUser } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import type { OnboardingMetadata } from "@/lib/onboarding";
import { loadStoredProfile } from "@/lib/profile";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  await auth.protect();
  const user = await currentUser();
  const meta = (user?.publicMetadata ?? {}) as OnboardingMetadata;
  if (!meta.onboardingComplete) redirect("/onboarding");

  const stored = user ? await loadStoredProfile(user.id) : null;
  const name = stored?.name || meta.name || user?.fullName || user?.firstName || "Student";
  const email = user?.primaryEmailAddress?.emailAddress ?? "";

  return (
    <AppShell
      name={name}
      initial={name.slice(0, 1).toUpperCase()}
      email={email}
      school={stored?.school ?? null}
      grade={stored?.grade ?? meta.grade ?? null}
    >
      {children}
    </AppShell>
  );
}
