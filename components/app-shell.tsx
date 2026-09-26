"use client";

import Image from "next/image";
import Link from "next/link";
import { Background } from "@/components/background";
import { SaveErrorBanner } from "@/components/sync-status";
import { TagSuggestionsPanel } from "@/components/tag-suggestions";
import { TopNav } from "@/components/top-nav";
import { TimeZoneReporter } from "@/components/time-zone-reporter";
import { CourseworkProvider, type ShellUser } from "@/lib/coursework";
import type { Assignment, Classmate, Course, FeedSummary } from "@/lib/types";

export function AppShell({
  user,
  knownTimeZone,
  classmates,
  courses,
  assignments,
  feed,
  children,
}: {
  user: ShellUser;
  knownTimeZone: string | null;
  classmates: Classmate[];
  courses: Course[];
  assignments: Assignment[];
  feed: FeedSummary | null;
  children: React.ReactNode;
}) {
  const initial = user.initial;
  return (
    <CourseworkProvider
      user={user}
      classmates={classmates}
      courses={courses}
      assignments={assignments}
      feed={feed}
    >
      <TimeZoneReporter known={knownTimeZone} />
      <Background />
      <div className="relative mx-auto flex min-h-screen w-full max-w-[1440px] flex-col">
        <header className="flex flex-col items-center gap-4 px-4 pt-6 md:h-[108px] md:flex-row md:px-[84px] md:pt-7">
          <div className="flex w-full items-center justify-between md:contents">
            <Link href="/dashboard" aria-label="Pane" className="inline-flex items-center">
              <Image src="/pane-logo.png" alt="" width={342} height={258} priority className="h-8 w-auto" />
            </Link>
            <Link
              href="/profile"
              aria-label="Profile"
              className="flex size-11 items-center justify-center rounded-full border border-white/90 bg-white/80 text-[16px] font-semibold text-[#14213d] shadow-[0_8px_20px_rgba(51,64,128,0.12)] md:ml-auto"
            >
              {user.avatarUrl ? (
                <img src={user.avatarUrl} alt="" className="size-11 rounded-full object-cover" />
              ) : (
                initial
              )}
            </Link>
          </div>
          <div className="md:absolute md:left-1/2 md:-translate-x-1/2">
            <TopNav />
          </div>
        </header>
        <main className="flex-1 px-4 pb-10 pt-4 md:px-[84px] md:pt-2">
          <SaveErrorBanner />
          {children}
        </main>
        <footer className="px-4 pb-8 text-center md:px-[84px]">
          <p className="text-[13px] font-semibold tracking-[0.28em] text-[#5b6478]">PANE</p>
        </footer>
      </div>
      <TagSuggestionsPanel />
    </CourseworkProvider>
  );
}
