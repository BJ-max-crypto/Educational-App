"use client";

import Link from "next/link";
import { Background } from "@/components/background";
import { SaveErrorBanner } from "@/components/sync-status";
import { TopNav } from "@/components/top-nav";
import { CourseworkProvider, type ShellUser } from "@/lib/coursework";
import type { Assignment, Course, FeedSummary } from "@/lib/types";

export function AppShell({
  user,
  courses,
  assignments,
  feed,
  children,
}: {
  user: ShellUser;
  courses: Course[];
  assignments: Assignment[];
  feed: FeedSummary | null;
  children: React.ReactNode;
}) {
  const initial = user.initial;
  return (
    <CourseworkProvider user={user} courses={courses} assignments={assignments} feed={feed}>
      <Background />
      <div className="relative mx-auto min-h-screen w-full max-w-[1440px]">
        <header className="flex flex-col items-center gap-4 px-4 pt-6 md:h-[108px] md:flex-row md:px-[84px] md:pt-7">
          <div className="flex w-full items-center justify-between md:contents">
            <Link href="/dashboard" className="text-[22px] font-semibold tracking-[-0.03em] text-[#14213d]">
              Pane
            </Link>
            <Link
              href="/profile"
              aria-label="Profile"
              className="flex size-11 items-center justify-center rounded-full border border-white/90 bg-white/80 text-[16px] font-semibold text-[#14213d] shadow-[0_8px_20px_rgba(51,64,128,0.12)] md:ml-auto"
            >
              {initial}
            </Link>
          </div>
          <div className="md:absolute md:left-1/2 md:-translate-x-1/2">
            <TopNav />
          </div>
        </header>
        <main className="px-4 pb-16 pt-4 md:px-[84px] md:pt-2">
          <SaveErrorBanner />
          {children}
        </main>
      </div>
    </CourseworkProvider>
  );
}
