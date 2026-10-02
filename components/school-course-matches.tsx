"use client";

import { useEffect, useState } from "react";
import { searchSchoolCourses } from "@/app/(app)/actions";
import { formatSchoolCourse, type SchoolCourseHit } from "@/lib/school-course-match";

export function SchoolCourseMatches({
  name,
  teacher = "",
  disabled,
  onUse,
}: {
  name: string;
  teacher?: string;
  disabled?: boolean;
  onUse: (course: SchoolCourseHit) => void;
}) {
  const [result, setResult] = useState<{
    query: string;
    teacher: string;
    suggestions: SchoolCourseHit[];
    notice: string | null;
  } | null>(null);

  useEffect(() => {
    const query = name.trim();
    const teacherQuery = teacher.trim();
    if (query.length < 2) return;
    let cancel = false;
    const timer = setTimeout(() => {
      void searchSchoolCourses(query, teacherQuery)
        .then((found) => {
          if (cancel) return;
          setResult({ query, teacher: teacherQuery, suggestions: found.suggestions, notice: found.notice });
        })
        .catch(() => {
          if (cancel) return;
          setResult({ query, teacher: teacherQuery, suggestions: [], notice: null });
        });
    }, 250);
    return () => {
      cancel = true;
      clearTimeout(timer);
    };
  }, [name, teacher]);

  const query = name.trim();
  const teacherQuery = teacher.trim();
  const current =
    result && query.length >= 2 && result.query === query && result.teacher === teacherQuery ? result : null;
  const suggestions = current?.suggestions ?? [];
  const notice = current?.notice ?? null;

  if (!suggestions.length && !notice) return null;

  return (
    <div className="w-full space-y-1.5">
      {notice ? <p className="text-[12px] text-[#5b6478]">{notice}</p> : null}
      {suggestions.length > 0 ? (
        <>
          <p className="text-[12px] font-semibold tracking-[0.06em] text-[#5b6478]">AT YOUR SCHOOL</p>
          <ul className="space-y-1">
            {suggestions.map((course) => (
              <li key={course.id}>
                <button
                  type="button"
                  disabled={disabled}
                  data-m="tap"
                  onClick={() => onUse(course)}
                  className="w-full rounded-[14px] border border-white/90 bg-white/85 px-3 py-2 text-left text-[13px] font-semibold text-[#14213d] disabled:opacity-60"
                >
                  {formatSchoolCourse(course)}
                </button>
              </li>
            ))}
          </ul>
          <p className="text-[12px] text-[#5b6478]">Click a class to use it. Create keeps a separate name.</p>
        </>
      ) : null}
    </div>
  );
}
