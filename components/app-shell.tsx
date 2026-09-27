"use client";

import Image from "next/image";
import { useUser } from "@clerk/nextjs";
import Link from "next/link";
import { Background } from "@/components/background";
import { SaveErrorBanner } from "@/components/sync-status";
import { TagSuggestionsPanel } from "@/components/tag-suggestions";
import { TopNav } from "@/components/top-nav";
import { TimeZoneReporter } from "@/components/time-zone-reporter";
import { CourseworkProvider, type ShellUser } from "@/lib/coursework";
import type { Assignment, Classmate, Course, FeedSummary, PersonConnection } from "@/lib/types";

export function AppShell({
  user,
  knownTimeZone,
  courses,
  assignments,
  feed,
  username,
  connections,
  membersUnavailable,
  classmatesByCourseId,
  children,
}: {
  user: ShellUser;
  knownTimeZone: string | null;
  courses: Course[];
  assignments: Assignment[];
  feed: FeedSummary | null;
  username: string | null;
  connections: PersonConnection[];
  membersUnavailable: boolean;
  classmatesByCourseId: Record<string, Classmate[]>;
  children: React.ReactNode;
}) {
  const { user: account } = useUser();
  const initial = user.initial;
  return (
    <CourseworkProvider
      user={user}
      courses={courses}
      assignments={assignments}
      feed={feed}
      username={username}
      connections={connections}
      membersUnavailable={membersUnavailable}
      classmatesByCourseId={classmatesByCourseId}
    >
      <TimeZoneReporter known={knownTimeZone} />
      <Background />
      <div className="relative mx-auto min-h-screen w-full max-w-[1440px]">
        <header data-m="header" className="flex flex-col items-center gap-4 px-4 pt-6 md:h-[108px] md:flex-row md:px-[84px] md:pt-7">
          <div className="flex w-full items-center justify-between md:contents">
            <Link href="/dashboard" data-m="hit" aria-label="Pane" className="flex shrink-0 items-center">
              <Image src="/logo.png" alt="" width={34} height={40} priority className="h-10 w-auto" />
            </Link>
            <Link
              href="/profile"
              aria-label="Profile"
              className="flex size-11 items-center justify-center overflow-hidden rounded-full border border-white/90 bg-white/80 text-[16px] font-semibold text-[#14213d] shadow-[0_8px_20px_rgba(51,64,128,0.12)] md:ml-auto"
            >
              {account?.hasImage ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={account.imageUrl} alt="" className="size-full object-cover" />
              ) : (
                initial
              )}
            </Link>
          </div>
          <div data-m="nav-wrap" className="md:absolute md:left-1/2 md:-translate-x-1/2">
            <TopNav />
          </div>
        </header>
        <main data-m="main" className="px-4 pb-16 pt-4 md:px-[84px] md:pt-2">
          <SaveErrorBanner />
          {children}
        </main>
      </div>
      <TagSuggestionsPanel />
    </CourseworkProvider>
  );
}
