"use client";

import { CoursePortalCard } from "@/components/course-portal-card";
import { GlassCard } from "@/components/glass-card";
import { SyncStatus } from "@/components/sync-status";
import { firstName, greeting } from "@/lib/dates";
import { useCoursework } from "@/lib/coursework";

export function DashboardView() {
  const { user, courses, ready, now, overdueCount, dueThisWeekCount } = useCoursework();

  return (
    <div>
      <h1 className="text-[36px] font-semibold leading-[44px] tracking-[-0.03em] text-[#14213d]">
        {ready && now ? `${greeting(now)}, ${firstName(user.name)}` : `Hello, ${firstName(user.name)}`}
      </h1>
      <p className="mt-1.5 text-[15px] text-[#5b6478]">
        {ready
          ? `${overdueCount()} overdue and ${dueThisWeekCount()} due this week`
          : "Loading your courses"}
      </p>
      <SyncStatus className="mt-3" />
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
