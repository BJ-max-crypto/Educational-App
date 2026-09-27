"use client";

import Link from "next/link";
import { AssignmentRow } from "@/components/assignment-row";
import { CourseSelect } from "@/components/course-select";
import { GlassCard } from "@/components/glass-card";
import { MemberAvatar } from "@/components/member-avatar";
import { StatusChip, type ChipTone } from "@/components/status-chip";
import { dueDetail, isOverdue } from "@/lib/dates";
import { useCoursework } from "@/lib/coursework";
import type { Assignment, AssignmentStatus } from "@/lib/types";

function chipFor(assignment: Assignment, now: Date): { tone: ChipTone; label: string } {
  if (assignment.status === "submitted") return { tone: "submitted", label: "Submitted" };
  if (isOverdue(assignment, now)) return { tone: "overdue", label: "Overdue" };
  const labels: Record<AssignmentStatus, string> = {
    not_started: "Not started",
    in_progress: "In progress",
    submitted: "Submitted",
  };
  return {
    tone: assignment.status,
    label: labels[assignment.status],
  };
}

export function CoursePortalView({ courseId }: { courseId: string }) {
  const {
    ready,
    now,
    courseById,
    openAssignments,
    completedAssignments,
    toggleDone,
    assignCourse,
    findSimilar,
    unsortedAssignments,
    classmates,
  } = useCoursework();
  const people = classmates(courseId);
  const course = courseById.get(courseId);
  const clock = now ?? new Date();

  if (!course) {
    return (
      <GlassCard className="p-8">
        <p className="text-[18px] font-semibold">That course is not on your list.</p>
        <Link href="/dashboard" data-m="hit" className="mt-3 inline-block text-[14px] font-medium text-[#5b6478]">
          ‹ Dashboard
        </Link>
      </GlassCard>
    );
  }

  const tagControl = (id: string, title: string) => (
    <CourseSelect
      label={`Course for ${title}`}
      value={course.isUnsorted ? null : course.id}
      allowUnsorted={!course.isUnsorted}
      placeholder={course.isUnsorted ? "Tag course…" : "Change course…"}
      onSelect={(courseId) => void assignCourse([id], courseId)}
    />
  );

  const open = ready ? openAssignments(course.id) : [];
  const done = ready ? completedAssignments(course.id) : [];

  return (
    <div>
      <Link href="/dashboard" data-m="hit" className="text-[14px] font-medium text-[#5b6478]">
        ‹ Dashboard
      </Link>
      <div className="mt-3 flex items-center gap-4">
        <span
          className="flex size-14 items-center justify-center rounded-[18px] text-[18px] font-bold text-white"
          style={{ backgroundColor: course.color }}
        >
          {course.initials}
        </span>
        <div>
          <h1 className="text-[32px] font-semibold leading-none tracking-[-0.03em] text-[#14213d]">
            {course.name}
          </h1>
          <p className="mt-2 text-[14px] text-[#5b6478]">
            {course.period ? `${course.teacher} · ${course.period}` : course.teacher}
          </p>
        </div>
      </div>

      <div data-m="grid1" className="mt-8 grid items-start gap-6 lg:grid-cols-[minmax(0,1.55fr)_minmax(280px,0.95fr)]">
        <GlassCard className="p-7">
          <div data-m="wrap" className="flex items-center gap-3">
            <h2 className="text-[22px] font-semibold text-[#14213d]">Upcoming</h2>
            <StatusChip tone="neutral">
              {open.length} {open.length === 1 ? "item" : "items"}
            </StatusChip>
            {course.isUnsorted ? (
              <Link
                href="/tag"
                data-m="tap"
                className="ml-auto rounded-full bg-white/95 px-4 py-2 text-[13px] font-semibold text-[#14213d] shadow-[0_4px_12px_rgba(51,64,128,0.12)] transition-[transform,box-shadow] duration-200 ease-out hover:-translate-y-0.5 hover:shadow-[0_8px_18px_rgba(51,64,128,0.16)] motion-reduce:transition-none"
              >
                Quick tag all
              </Link>
            ) : unsortedAssignments.length ? (
              <button
                type="button"
                onClick={() => void findSimilar(course.id)}
                data-m="tap"
                className="ml-auto rounded-full bg-white/95 px-4 py-2 text-[13px] font-semibold text-[#14213d] shadow-[0_4px_12px_rgba(51,64,128,0.12)] transition-[transform,box-shadow] duration-200 ease-out hover:-translate-y-0.5 hover:shadow-[0_8px_18px_rgba(51,64,128,0.16)] motion-reduce:transition-none"
              >
                Find similar in Unsorted
              </button>
            ) : null}
          </div>
          <div className="mt-4 space-y-3">
            {open.map((item) => {
              const chip = chipFor(item, clock);
              const overdue = isOverdue(item, clock);
              return (
                <AssignmentRow
                  key={item.id}
                  variant="card"
                  title={item.title}
                  done={false}
                  onToggle={() => toggleDone(item.id)}
                  detail={dueDetail(item.dueAt, clock)}
                  detailTone={overdue ? "danger" : "muted"}
                  chip={
                    <>
                      <StatusChip tone={chip.tone}>{chip.label}</StatusChip>
                      {tagControl(item.id, item.title)}
                    </>
                  }
                />
              );
            })}
            {ready && open.length === 0 ? (
              <p className="text-[14px] text-[#5b6478]">Nothing coming up.</p>
            ) : null}
          </div>
          {done.length > 0 ? (
            <div className="mt-6">
              <h3 className="text-[12px] font-semibold tracking-[0.08em] text-[#5b6478]">
                COMPLETED
              </h3>
              <div className="mt-3 space-y-3">
                {done.map((item) => (
                  <AssignmentRow
                    key={item.id}
                    variant="card"
                    title={item.title}
                    done
                    onToggle={() => toggleDone(item.id)}
                    chip={
                      <>
                        <StatusChip tone="submitted">Submitted</StatusChip>
                        {tagControl(item.id, item.title)}
                      </>
                    }
                  />
                ))}
              </div>
            </div>
          ) : null}
        </GlassCard>

        <GlassCard className="p-7">
          <div className="flex items-center gap-3">
            <h2 className="text-[22px] font-semibold text-[#14213d]">Members</h2>
            <StatusChip tone="neutral">
              {people.length} {people.length === 1 ? "member" : "members"}
            </StatusChip>
          </div>
          {people.length > 0 ? (
            <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
              {people.map((member) => (
                <div
                  key={member.id}
                  className="flex flex-col items-center rounded-[22px] bg-white/60 px-2 py-4 text-center"
                >
                  <MemberAvatar initials={member.initials} color={member.color} size={52} />
                  <p className="mt-2 text-[14px] font-medium text-[#14213d]">{member.name}</p>
                  <p className="text-[12px] text-[#5b6478]">@{member.username}</p>
                </div>
              ))}
            </div>
          ) : (
            <p className="mt-4 text-[14px] text-[#5b6478]">
              Nobody you know is in this class yet.{" "}
              <Link href="/profile#members" className="font-semibold text-[#14213d] underline-offset-2 hover:underline">
                You can add people
              </Link>
            </p>
          )}
        </GlassCard>
      </div>
    </div>
  );
}
