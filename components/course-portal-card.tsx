"use client";

import Link from "next/link";
import { dueDetail, isOverdue } from "@/lib/dates";
import { useCoursework } from "@/lib/coursework";
import type { Course } from "@/lib/types";
import { MemberAvatar } from "@/components/member-avatar";
import { StatusChip } from "@/components/status-chip";

export function CoursePortalCard({ course }: { course: Course }) {
  const { nextUp, overdueCount, upcomingCount, now, classmatesFor } = useCoursework();
  const upcoming = nextUp(course.id);
  const overdue = overdueCount(course.id);
  const count = upcomingCount(course.id);
  const clock = now ?? new Date();
  const upcomingIsOverdue = upcoming ? isOverdue(upcoming, clock) : false;
  const classmates = classmatesFor(course);
  const shown = classmates.slice(0, 4);
  const extra = classmates.length - shown.length;

  return (
    <Link
      href={`/courses/${course.id}`}
      className="flex h-full min-h-[250px] flex-col justify-between rounded-[32px] border border-white/90 bg-[#e7eefe]/90 p-[22px] shadow-[0_12px_32px_rgba(51,64,128,0.12)] backdrop-blur-[14px] transition-[transform,box-shadow] duration-200 ease-out hover:-translate-y-0.5 hover:shadow-[0_18px_40px_rgba(51,64,128,0.18)] motion-reduce:transition-none motion-reduce:hover:translate-y-0 supports-[backdrop-filter]:bg-[rgba(220,231,255,0.42)]"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <span
            className="flex size-10 shrink-0 items-center justify-center rounded-[14px] text-[14px] font-bold text-white"
            style={{ backgroundColor: course.color }}
          >
            {course.initials}
          </span>
          <span className="min-w-0">
            <span className="block truncate text-[18px] font-semibold leading-tight text-[#14213d]">
              {course.name}
            </span>
            <span className="mt-0.5 block text-[13px] text-[#5b6478]">{course.teacher}</span>
          </span>
        </div>
        <StatusChip tone={overdue > 0 ? "overdue" : "on_track"}>
          {overdue > 0 ? `${overdue} overdue` : "On track"}
        </StatusChip>
      </div>

      <div className="mt-4 rounded-[22px] bg-white/60 px-4 py-3.5">
        <p className="text-[11px] font-semibold tracking-[0.08em] text-[#5b6478]">NEXT UP</p>
        {upcoming ? (
          <>
            <p className="mt-1 text-[17px] font-semibold text-[#14213d]">{upcoming.title}</p>
            <p
              className={`mt-1 text-[13px] font-semibold ${upcomingIsOverdue ? "text-[#e5484d]" : "text-[#5b6478]"}`}
            >
              {dueDetail(upcoming.dueAt, clock)}
            </p>
          </>
        ) : (
          <p className="mt-1 text-[17px] font-semibold text-[#14213d]">Nothing scheduled</p>
        )}
      </div>

      <div className="mt-4 flex items-center justify-between">
        <p className="text-[14px] font-medium text-[#14213d]">
          {count} upcoming
        </p>
        {shown.length > 0 ? (
          <div className="flex items-center">
            {shown.map((member) => (
              <MemberAvatar
                key={member.profileId}
                initials={member.initials}
                color={member.color}
                imageUrl={member.avatarUrl}
                className="-mr-2"
              />
            ))}
            {extra > 0 ? (
              <span className="pl-3 text-[12px] font-semibold text-[#5b6478]">+{extra}</span>
            ) : null}
          </div>
        ) : null}
      </div>
    </Link>
  );
}
