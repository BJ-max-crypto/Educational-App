"use client";

import { CoursePortalCard } from "@/components/course-portal-card";
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
      <div className="mt-8 grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-3">
        {courses.map((course) => (
          <CoursePortalCard key={course.id} course={course} />
        ))}
      </div>
    </div>
  );
}
