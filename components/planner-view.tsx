"use client";

import { AssignmentRow } from "@/components/assignment-row";
import { CourseSelect } from "@/components/course-select";
import { GlassCard } from "@/components/glass-card";
import { WeekSchedule } from "@/components/week-schedule";
import { plannerWhen } from "@/lib/dates";
import { useCoursework } from "@/lib/coursework";
import type { PlannerBucket } from "@/lib/types";

const sections: { id: PlannerBucket; label: string }[] = [
  { id: "overdue", label: "Overdue" },
  { id: "today", label: "Today" },
  { id: "tomorrow", label: "Tomorrow" },
  { id: "week", label: "This week" },
];

export function PlannerView() {
  const { ready, now, plannerGroups, toggleDone, courseById, assignCourse } = useCoursework();
  const groups = plannerGroups();
  const total = sections.reduce((sum, section) => sum + groups[section.id].length, 0);
  const clock = now ?? new Date();

  return (
    <>
      <WeekSchedule />
      <GlassCard className="mx-auto w-full max-w-[880px] px-6 py-8 print:hidden sm:px-10">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-[32px] font-semibold leading-tight tracking-[-0.03em] text-[#14213d]">
              Planner
            </h1>
            <p className="mt-1 text-[15px] text-[#5b6478]">
              {ready
                ? `${total} ${total === 1 ? "thing" : "things"} to do this week`
                : "Loading your list"}
            </p>
          </div>
          <button
            type="button"
            onClick={() => window.print()}
            className="mt-1 shrink-0 rounded-full bg-white/95 px-4 py-2 text-[13px] font-semibold text-[#14213d] shadow-[0_4px_12px_rgba(51,64,128,0.12)] transition-[transform,box-shadow] duration-200 ease-out hover:-translate-y-0.5 hover:shadow-[0_8px_18px_rgba(51,64,128,0.16)] motion-reduce:transition-none"
          >
            Print week
          </button>
        </div>
        <div className="mt-8 space-y-7">
          {sections.map((section) => {
            const items = groups[section.id];
            if (!ready || items.length === 0) return null;
            return (
              <section key={section.id}>
                <h2 className="text-[12px] font-semibold tracking-[0.08em] text-[#5b6478] uppercase">
                  {section.label}
                </h2>
                <div className="mt-2">
                  {items.map((item) => {
                    const course = courseById.get(item.courseId);
                    return (
                      <AssignmentRow
                        key={item.id}
                        variant="plain"
                        title={item.title}
                        done={false}
                        onToggle={() => toggleDone(item.id)}
                        courseName={course?.name}
                        courseColor={course?.color}
                        when={plannerWhen(item.dueAt, clock)}
                        chip={
                          course?.isUnsorted ? (
                            <CourseSelect
                              label={`Course for ${item.title}`}
                              value={null}
                              onSelect={(courseId) => void assignCourse([item.id], courseId)}
                            />
                          ) : undefined
                        }
                      />
                    );
                  })}
                </div>
              </section>
            );
          })}
          {ready && total === 0 ? (
            <p className="text-[15px] text-[#5b6478]">Nothing due this week.</p>
          ) : null}
        </div>
      </GlassCard>
    </>
  );
}
