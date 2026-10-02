import { Suspense } from "react";
import { auth, currentUser } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { AppShell } from "@/components/app-shell";
import { LoadingMark } from "@/components/loading-mark";
import { loadCoursework } from "@/lib/coursework-data";
import { loadMembers } from "@/lib/members";
import type { OnboardingMetadata } from "@/lib/onboarding";
import { shouldAutoSync, syncFeed } from "@/lib/sync";
import { getUserDb } from "@/lib/user-db";
import { storedTimeZone } from "@/lib/user-timezone";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  await auth.protect();
  const user = await currentUser();
  const meta = (user?.publicMetadata ?? {}) as OnboardingMetadata;
  if (!meta.onboardingComplete) redirect("/onboarding");

  const timeZone = storedTimeZone(user);
  const email = user?.primaryEmailAddress?.emailAddress ?? "";
  const fallbackName = meta.name || user?.fullName || user?.firstName || "Student";

  return (
    <Suspense fallback={<LoadingMark />}>
      <ReadyShell
        clerkUserId={user?.id ?? null}
        timeZone={timeZone}
        email={email}
        fallbackName={fallbackName}
        fallbackGrade={meta.grade ?? null}
      >
        {children}
      </ReadyShell>
    </Suspense>
  );
}

async function ReadyShell({
  clerkUserId,
  timeZone,
  email,
  fallbackName,
  fallbackGrade,
  children,
}: {
  clerkUserId: string | null;
  timeZone: string | null;
  email: string;
  fallbackName: string;
  fallbackGrade: string | null;
  children: React.ReactNode;
}) {
  const db = clerkUserId ? await getUserDb(clerkUserId) : null;
  let data = await loadCoursework(db);

  if (db && data.feed) {
    const feed = { last_synced_at: data.feed.lastSyncedAt, updated_at: data.feed.updatedAt };
    if (shouldAutoSync(feed)) {
      if (!data.feed.lastSyncedAt) {
        await syncFeed(db.profileId, { timeZone }).catch((error) => console.error("sync failed", error));
        data = await loadCoursework(db);
      } else {
        const profileId = db.profileId;
        after(() => syncFeed(profileId, { timeZone }).catch((error) => console.error("sync failed", error)));
      }
    }
  }

  const members = db
    ? await loadMembers(db.profileId, data.courses).catch((error) => {
        console.error("loadMembers failed", error);
        const message = error instanceof Error ? error.message : "";
        const notice = /requester_classes|addressee_classes/i.test(message)
          ? "Choosing classes needs a database update. Run supabase/migrations/0006_connection_classes.sql."
          : "Adding people needs a database update. Run supabase/migrations/0005_members.sql, then 0006_connection_classes.sql.";
        return { username: null, connections: [], mutuals: [], classmatesByCourseId: {}, notice };
      })
    : { username: null, connections: [], mutuals: [], classmatesByCourseId: {}, notice: null };

  const name = data.profile?.name || fallbackName;

  return (
    <AppShell
      user={{
        name,
        initial: name.slice(0, 1).toUpperCase(),
        email,
        school: data.profile?.school ?? null,
        schoolLocation: data.profile?.school_location ?? null,
        grade: data.profile?.grade ?? fallbackGrade,
      }}
      knownTimeZone={timeZone}
      courses={data.courses}
      assignments={data.assignments}
      feed={
        data.feed
          ? {
              status: data.feed.status,
              lastSyncedAt: data.feed.lastSyncedAt,
              lastError: data.feed.lastError,
            }
          : null
      }
      username={members.username}
      connections={members.connections}
      mutuals={members.mutuals}
      membersNotice={members.notice}
      classmatesByCourseId={members.classmatesByCourseId}
    >
      {children}
    </AppShell>
  );
}
