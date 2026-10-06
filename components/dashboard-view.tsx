"use client";

import Link from "next/link";
import { CoursePortalCard } from "@/components/course-portal-card";
import { GlassCard } from "@/components/glass-card";
import { SyncStatus } from "@/components/sync-status";
import { firstName, greeting } from "@/lib/dates";
import { useCoursework } from "@/lib/coursework";
import { cn } from "@/lib/cn";

export function DashboardView() {
  const { user, courses, ready, now, overdueCount, dueThisWeekCount, unsortedAssignments } =
    useCoursework();
  const greetingLine = ready && now ? `${greeting(now)}, ${firstName(user.name)}` : null;

  return (
    <div>
      <h1
        key={greetingLine ?? "greeting"}
        className={cn(
          "text-[36px] font-semibold leading-[44px] tracking-[-0.03em] text-[#14213d]",
          greetingLine ? "pane-fade-in" : "opacity-0",
        )}
      >
        {greetingLine ?? "\u00a0"}
      </h1>
      <p className="mt-1.5 text-[15px] text-[#5b6478]">
        {ready
          ? `${overdueCount()} overdue and ${dueThisWeekCount()} due this week`
          : "Loading your courses"}
      </p>
      <SyncStatus className="mt-3" />
      {unsortedAssignments.length > 0 ? (
        <div className="mt-5 flex max-w-[720px] flex-wrap items-center gap-3 rounded-[22px] border border-white/90 bg-white/60 px-5 py-3.5">
          <p className="text-[14px] text-[#14213d]">
            <span className="font-semibold">{unsortedAssignments.length} items have no course.</span>{" "}
            Schoology&apos;s feed doesn&apos;t include class names, so tag them once and Pane remembers.
          </p>
          <Link
            href="/tag"
            data-m="tap"
            className="ml-auto rounded-full bg-[#14213d] px-4 py-2 text-[13px] font-semibold text-white transition-[transform,box-shadow] duration-200 ease-out hover:-translate-y-0.5 hover:shadow-[0_8px_18px_rgba(20,33,61,0.25)] motion-reduce:transition-none"
          >
            Quick tag
          </Link>
        </div>
      ) : null}
      {courses.length === 0 ? (
        <GlassCard className="mt-8 max-w-[560px] p-8">
          <p className="text-[18px] font-semibold text-[#14213d]">No coursework yet</p>
          <p className="mt-2 text-[14px] text-[#5b6478]">
            Assignments from your Schoology calendar show up here after a sync. Items due more
            than two weeks ago are skipped.
          </p>
        </GlassCard>
      ) : (
        <div className="mt-8 grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-3">
          {courses.map((course) => (
            <CoursePortalCard key={course.id} course={course} />
          ))}
        </div>
      )}
    </div>
  );
}
