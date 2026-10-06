"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import type { PriorityLabelsResponse } from "@/app/api/priority-labels/route";
import type { WeekReviewResponse } from "@/app/api/week-review/route";
import { AiToolsMenu } from "@/components/ai-tools-menu";
import { AssignmentRow } from "@/components/assignment-row";
import { CourseSelect } from "@/components/course-select";
import { GlassCard } from "@/components/glass-card";
import { WeekReviewPrint } from "@/components/week-review-print";
import { clientTimeZone } from "@/lib/client-zone";
import { plannerWhen } from "@/lib/dates";
import { useCoursework } from "@/lib/coursework";
import type { PriorityTier } from "@/lib/priority-tier";
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
  const [labels, setLabels] = useState<Record<string, PriorityTier> | null>(null);
  const [labelError, setLabelError] = useState<string | null>(null);
  const [review, setReview] = useState<WeekReviewResponse | null>(null);
  const [printNonce, setPrintNonce] = useState(0);
  const hasLabels = Boolean(labels && Object.keys(labels).length);

  useEffect(() => {
    if (!review?.review) return;
    let second = 0;
    const first = requestAnimationFrame(() => {
      second = requestAnimationFrame(() => window.print());
    });
    return () => {
      cancelAnimationFrame(first);
      cancelAnimationFrame(second);
    };
  }, [review, printNonce]);

  useEffect(() => {
    let cancel = false;
    fetch(`/api/priority-labels?tz=${encodeURIComponent(clientTimeZone())}`, { cache: "no-store" })
      .then((response) => response.json() as Promise<PriorityLabelsResponse>)
      .then((data) => {
        if (cancel) return;
        setLabels(data.labels);
      })
      .catch(() => {
        if (!cancel) setLabels(null);
      });
    return () => {
      cancel = true;
    };
  }, []);

  return (
    <>
    <GlassCard className="mx-auto w-full max-w-[880px] px-6 py-8 sm:px-10">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-[32px] font-semibold leading-tight tracking-[-0.03em] text-[#14213d]">
            Planner
          </h1>
          <p className="mt-1 text-[15px] text-[#5b6478]">
            {ready
              ? `${total} ${total === 1 ? "thing" : "things"} to do this week`
              : "Loading your list"}
          </p>
          {hasLabels ? <p className="mt-1 text-[13px] text-[#5b6478]">Pane&apos;s priority estimate</p> : null}
          {labelError ? (
            <p role="alert" className="mt-2 text-[14px] font-medium text-[#e5484d]">
              {labelError}
            </p>
          ) : null}
        </div>
        <AiToolsMenu
          hasLabels={hasLabels}
          onResult={(data) => {
            setLabels(data.labels);
            setLabelError(data.error ?? null);
          }}
          onReview={(data) => {
            setReview(data);
            setPrintNonce((value) => value + 1);
          }}
        />
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
                      assignmentId={item.id}
                      priority={labels?.[item.id]}
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
    {review?.review && review.heading
      ? createPortal(
          <WeekReviewPrint review={review.review} heading={review.heading} items={review.items} />,
          document.body,
        )
      : null}
    </>
  );
}
