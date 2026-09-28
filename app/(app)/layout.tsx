import { auth, currentUser } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { AppShell } from "@/components/app-shell";
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
  const db = user ? await getUserDb(user.id) : null;
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
        return { username: null, connections: [], classmatesByCourseId: {}, notice };
      })
    : { username: null, connections: [], classmatesByCourseId: {}, notice: null };

  const name = data.profile?.name || meta.name || user?.fullName || user?.firstName || "Student";
  const email = user?.primaryEmailAddress?.emailAddress ?? "";

  return (
    <AppShell
      user={{
        name,
        initial: name.slice(0, 1).toUpperCase(),
        email,
        school: data.profile?.school ?? null,
        grade: data.profile?.grade ?? meta.grade ?? null,
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
      membersNotice={members.notice}
      classmatesByCourseId={members.classmatesByCourseId}
    >
      {children}
    </AppShell>
  );
}
