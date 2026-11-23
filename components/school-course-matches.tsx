"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { searchSchoolCourses } from "@/app/(app)/actions";
import { CourseSuggest } from "@/components/course-suggest";
import { CLASS_CODE, displayAcademicYear, periodLabel } from "@/lib/class-match";
import type { SchoolCourseHit } from "@/lib/school-course-match";

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

  return (
    <div className="w-full space-y-2">
      {notice ? <p className="text-[12px] text-[#5b6478]">{notice}</p> : null}
      {suggestions.length > 0 ? (
        <>
          <p className="text-[12px] font-semibold tracking-[0.06em] text-[#5b6478]">IS THIS YOUR CLASS?</p>
          <ul className="space-y-1.5">
            {suggestions.map((course) => (
              <li key={course.id}>
                <button
                  type="button"
                  disabled={disabled}
                  data-m="tap"
                  onClick={() => onUse(course)}
                  className="w-full rounded-[16px] border border-white/90 bg-white/85 px-3 py-2.5 text-left disabled:opacity-60"
                >
                  <span className="block text-[14px] font-semibold text-[#14213d]">{course.name}</span>
                  <span className="mt-1 block text-[12px] font-medium leading-5 text-[#5b6478]">
                    {course.school ? `School: ${course.school}` : null}
                    {course.school ? <br /> : null}
                    Teacher: {course.teacher.trim() || "Not listed"}
                    <br />
                    Period: {periodLabel(course.period) || "Not listed"}
                    <br />
                    Academic year: {displayAcademicYear(course.academicYear) || "Not listed"}
                    <br />
                    Members: {course.members ?? 0}
                  </span>
                </button>
              </li>
            ))}
          </ul>
          <p className="text-[12px] text-[#5b6478]">Join one of these, or create a new class if none is yours.</p>
        </>
      ) : null}
      {query.length >= 2 ? (
        <CourseSuggest
          name={name}
          teacher={teacher}
          buttonLabel="Smarter match"
          disabled={disabled}
          onUseSchool={(course) => onUse(course)}
        />
      ) : null}
      <JoinWithCode />
    </div>
  );
}

function JoinWithCode() {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [problem, setProblem] = useState<string | null>(null);

  function join() {
    const next = code.trim().toLowerCase();
    if (!CLASS_CODE.test(next)) {
      setProblem("Enter the 8-character invitation code.");
      return;
    }
    router.push(`/c/${next}`);
  }

  return (
    <div className="rounded-[16px] bg-white/55 px-3 py-2.5">
      <p className="text-[12px] font-semibold tracking-[0.06em] text-[#5b6478]">JOIN WITH AN INVITATION</p>
      <div className="mt-1.5 flex gap-2">
        <input
          value={code}
          onChange={(event) => {
            setCode(event.target.value);
            setProblem(null);
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              join();
            }
          }}
          maxLength={16}
          placeholder="Invitation code"
          aria-label="Invitation code"
          data-m="tap"
          className="h-9 min-w-0 flex-1 rounded-full border border-white/90 bg-white/85 px-3 text-[13px] font-medium text-[#14213d] outline-none focus:border-[#4f7cff] focus:ring-4 focus:ring-[#4f7cff]/15"
        />
        <button
          type="button"
          data-m="tap"
          onClick={join}
          className="h-9 rounded-full bg-[#14213d] px-3.5 text-[13px] font-semibold text-white"
        >
          Join
        </button>
      </div>
      {problem ? <p className="mt-1.5 text-[12px] font-semibold text-[#e5484d]">{problem}</p> : null}
    </div>
  );
}
