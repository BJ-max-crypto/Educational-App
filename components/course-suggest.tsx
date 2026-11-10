"use client";

import { useState } from "react";
import type { CourseMatchResponse } from "@/app/api/course-match/route";
import { UpgradeNote } from "@/components/upgrade-note";
import { clientTimeZone } from "@/lib/client-zone";
import { useCoursework } from "@/lib/coursework";
import type { SchoolCourseHit } from "@/lib/school-course-match";

export function CourseSuggest({
  assignmentId,
  name = "",
  teacher = "",
  buttonLabel,
  disabled,
  onUseCourse,
  onUseSchool,
}: {
  assignmentId?: string;
  name?: string;
  teacher?: string;
  buttonLabel: string;
  disabled?: boolean;
  onUseCourse?: (courseId: string) => void;
  onUseSchool?: (course: SchoolCourseHit) => void;
}) {
  const { billing } = useCoursework();
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<CourseMatchResponse | null>(null);
  const ready = Boolean(assignmentId) || name.trim().length >= 2;
  if (!ready && !result) return null;

  async function suggest() {
    setBusy(true);
    const response = await fetch(`/api/course-match?tz=${encodeURIComponent(clientTimeZone())}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        assignmentId,
        name: assignmentId ? undefined : name,
        teacher: assignmentId ? undefined : teacher,
      }),
    }).catch(() => null);
    const data = (await response?.json().catch(() => null)) as CourseMatchResponse | null;
    setResult(data ?? { courseId: null, schoolCourseId: null, name: null, teacher: null, period: null, label: null, generatedAt: null, error: "Couldn't suggest a course. Try again." });
    setBusy(false);
  }

  const hit =
    result?.schoolCourseId && result.name
      ? { id: result.schoolCourseId, name: result.name, teacher: result.teacher ?? "", period: result.period }
      : null;

  return (
    <div className="max-w-[240px]">
      <button
        type="button"
        disabled={!ready || busy || disabled || billing.tier !== "pro"}
        onClick={() => void suggest()}
        className="text-left text-[12px] font-semibold text-[#4f7cff] disabled:opacity-60"
      >
        {busy ? "Checking…" : buttonLabel}
      </button>
      {billing.tier === "pro" ? null : (
        <div className="mt-1">
          <p className="text-[12px] text-[#5b6478]">A course suggestion is part of Pane Pro. Nothing is applied until you choose it.</p>
          <UpgradeNote code="pro_required" />
        </div>
      )}
      {result?.error ? (
        <div className="mt-1">
          <UpgradeNote code={result.code} message={result.error} />
        </div>
      ) : null}
      {result && !result.error && result.label ? (
        <p className="mt-1 text-[12px] text-[#14213d]">
          {result.label}{" "}
          {result.courseId && onUseCourse ? (
            <button
              type="button"
              onClick={() => {
                if (result.courseId) onUseCourse(result.courseId);
              }}
              className="font-semibold text-[#4f7cff]"
            >
              Use this
            </button>
          ) : null}
          {hit && onUseSchool ? (
            <button type="button" onClick={() => onUseSchool(hit)} className="font-semibold text-[#4f7cff]">
              Use this
            </button>
          ) : null}
        </p>
      ) : null}
      {result && !result.error && !result.label ? (
        <p className="mt-1 text-[12px] text-[#5b6478]">No matching course.</p>
      ) : null}
    </div>
  );
}
