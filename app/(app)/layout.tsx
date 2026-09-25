import { auth, currentUser } from "@clerk/nextjs/server";
import { AppShell } from "@/components/app-shell";
import { loadStoredProfile } from "@/lib/profile";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  await auth.protect();
  const user = await currentUser();
  const name = user?.fullName || user?.firstName || "Alex Morgan";
  const email = user?.primaryEmailAddress?.emailAddress ?? "";
  const stored = user ? await loadStoredProfile(user.id, name) : null;

  return (
    <AppShell
      name={name}
      initial={(user?.firstName || name).slice(0, 1).toUpperCase()}
      email={email}
      school={stored?.school ?? null}
      grade={stored?.grade ?? null}
    >
      {children}
    </AppShell>
  );
}
