"use client";

import { useState } from "react";
import { CourseSuggest } from "@/components/course-suggest";
import { SchoolCourseMatches } from "@/components/school-course-matches";
import { cn } from "@/lib/cn";
import { useCoursework } from "@/lib/coursework";
import type { SchoolCourseHit } from "@/lib/school-course-match";

const CREATE = "__create__";
const UNSORTED = "__unsorted__";

const controlClass =
  "h-9 rounded-full border border-white/90 bg-white/85 px-3 text-[13px] font-medium text-[#14213d] outline-none transition-shadow duration-150 ease-out focus:border-[#4f7cff] focus:ring-4 focus:ring-[#4f7cff]/15 disabled:opacity-60";

/**
 * Course picker for tagging. `value` is a course id, or null for Unsorted.
 * Creating a course searches school labels and links one only after a click.
 */
export function CourseSelect({
  value,
  onSelect,
  disabled,
  allowUnsorted = false,
  placeholder = "Tag course…",
  label,
  className,
  assignmentId,
}: {
  value: string | null;
  onSelect: (courseId: string | null) => void;
  disabled?: boolean;
  allowUnsorted?: boolean;
  placeholder?: string;
  label: string;
  className?: string;
  assignmentId?: string;
}) {
  const { taggableCourses, createCourse } = useCoursework();
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [teacher, setTeacher] = useState("");
  const [period, setPeriod] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  function close() {
    setCreating(false);
    setName("");
    setTeacher("");
    setPeriod("");
    setError(null);
    setNote(null);
  }

  async function finish(result: { id: string; notice: string | null } | { error: string }) {
    setPending(false);
    if ("error" in result) {
      setError(result.error);
      return;
    }
    setError(null);
    setNote(result.notice);
    setCreating(false);
    setName("");
    setTeacher("");
    setPeriod("");
    onSelect(result.id);
  }

  async function submitNew(event: React.FormEvent) {
    event.preventDefault();
    if (!name.trim()) {
      setError("Enter a course name.");
      return;
    }
    setPending(true);
    setError(null);
    const result = await createCourse({ name, teacher, period });
    await finish(result);
  }

  async function chooseExisting(course: SchoolCourseHit) {
    setPending(true);
    setError(null);
    const result = await createCourse({
      name: course.name,
      teacher: course.teacher,
      period: course.period ?? undefined,
      schoolCourseId: course.id,
    });
    await finish(result);
  }

  if (creating) {
    return (
      <form onSubmit={submitNew} className={cn("flex w-full min-w-[240px] max-w-[320px] flex-col gap-2", className)}>
        <input
          autoFocus
          value={name}
          onChange={(event) => {
            setName(event.target.value);
            setError(null);
          }}
          onKeyDown={(event) => event.key === "Escape" && close()}
          maxLength={60}
          placeholder="Course name"
          aria-label="New course name"
          data-m="tap"
          className={controlClass}
        />
        <input
          value={teacher}
          onChange={(event) => {
            setTeacher(event.target.value);
            setError(null);
          }}
          maxLength={80}
          placeholder="Teacher"
          aria-label="Teacher"
          data-m="tap"
          className={controlClass}
        />
        <input
          value={period}
          onChange={(event) => setPeriod(event.target.value)}
          maxLength={40}
          placeholder="Period (optional)"
          aria-label="Period"
          data-m="tap"
          className={controlClass}
        />
        <SchoolCourseMatches name={name} teacher={teacher} disabled={pending} onUse={(course) => void chooseExisting(course)} />
        <div className="flex items-center gap-2">
          <button
            type="submit"
            disabled={pending}
            data-m="tap"
            className="h-9 rounded-full bg-[#14213d] px-3.5 text-[13px] font-semibold text-white disabled:opacity-60"
          >
            {pending ? "Saving…" : "Create course"}
          </button>
          <button type="button" onClick={close} data-m="hit" className="text-[13px] font-semibold text-[#5b6478]">
            Cancel
          </button>
        </div>
        {error ? (
          <p role="alert" className="text-[12px] font-semibold text-[#e5484d]">
            {error}
          </p>
        ) : null}
        {note ? <p className="text-[12px] text-[#5b6478]">{note}</p> : null}
      </form>
    );
  }

  const current = value && taggableCourses.some((course) => course.id === value) ? value : "";

  return (
    <div className={cn("flex flex-col gap-1", className)}>
      <select
        aria-label={label}
        data-m="tap"
        value={current}
        disabled={disabled}
        onClick={(event) => event.stopPropagation()}
        onChange={(event) => {
          const next = event.target.value;
          if (next === CREATE) setCreating(true);
          else if (next === UNSORTED) onSelect(null);
          else if (next) onSelect(next);
        }}
        className={cn(controlClass, "max-w-[190px]")}
      >
        <option value="" disabled>
          {placeholder}
        </option>
        {taggableCourses.map((course) => (
          <option key={course.id} value={course.id}>
            {course.teacher ? `${course.name} · ${course.teacher}` : course.name}
          </option>
        ))}
        {allowUnsorted && current ? <option value={UNSORTED}>Move to Unsorted</option> : null}
        <option value={CREATE}>+ Create new course…</option>
      </select>
      {note ? <p className="max-w-[240px] text-[12px] text-[#5b6478]">{note}</p> : null}
      {error ? (
        <p role="alert" className="max-w-[240px] text-[12px] font-semibold text-[#e5484d]">
          {error}
        </p>
      ) : null}
      {assignmentId ? (
        <CourseSuggest
          assignmentId={assignmentId}
          buttonLabel="Suggest a course"
          onUseCourse={(courseId) => onSelect(courseId)}
          onUseSchool={(course) => void chooseExisting(course)}
        />
      ) : null}
      </div>
    );
  }
