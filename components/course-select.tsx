"use client";

import { useState } from "react";
import { cn } from "@/lib/cn";
import { useCoursework } from "@/lib/coursework";

const CREATE = "__create__";
const UNSORTED = "__unsorted__";

const controlClass =
  "h-9 rounded-full border border-white/90 bg-white/85 px-3 text-[13px] font-medium text-[#14213d] outline-none transition-shadow duration-150 ease-out focus:border-[#4f7cff] focus:ring-4 focus:ring-[#4f7cff]/15 disabled:opacity-60";

/**
 * Course picker for tagging. `value` is a course id, or null for Unsorted.
 * "Create new course…" swaps in a name field and selects the new course once created.
 */
export function CourseSelect({
  value,
  onSelect,
  disabled,
  allowUnsorted = false,
  placeholder = "Tag course…",
  label,
  className,
}: {
  value: string | null;
  onSelect: (courseId: string | null) => void;
  disabled?: boolean;
  allowUnsorted?: boolean;
  placeholder?: string;
  label: string;
  className?: string;
}) {
  const { taggableCourses, createCourse } = useCoursework();
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function submitNew(event: React.FormEvent) {
    event.preventDefault();
    if (!name.trim()) {
      setError("Enter a course name.");
      return;
    }
    setPending(true);
    const result = await createCourse(name);
    setPending(false);
    if ("error" in result) {
      setError(result.error);
      return;
    }
    setCreating(false);
    setName("");
    setError(null);
    onSelect(result.id);
  }

  if (creating) {
    return (
      <form onSubmit={submitNew} className={cn("flex flex-wrap items-center gap-2", className)}>
        <input
          autoFocus
          value={name}
          onChange={(event) => {
            setName(event.target.value);
            setError(null);
          }}
          onKeyDown={(event) => event.key === "Escape" && setCreating(false)}
          maxLength={60}
          placeholder="Course name"
          aria-label="New course name"
          data-m="tap"
          className={cn(controlClass, "w-44")}
        />
        <button
          type="submit"
          disabled={pending}
          data-m="tap"
          className="h-9 rounded-full bg-[#14213d] px-3.5 text-[13px] font-semibold text-white disabled:opacity-60"
        >
          {pending ? "Adding…" : "Add"}
        </button>
        <button
          type="button"
          onClick={() => {
            setCreating(false);
            setError(null);
          }}
          data-m="hit"
          className="text-[13px] font-semibold text-[#5b6478]"
        >
          Cancel
        </button>
        {error ? (
          <p role="alert" className="w-full text-[12px] font-semibold text-[#e5484d]">
            {error}
          </p>
        ) : null}
      </form>
    );
  }

  const current = value && taggableCourses.some((course) => course.id === value) ? value : "";

  return (
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
      className={cn(controlClass, "max-w-[190px]", className)}
    >
      <option value="" disabled>
        {placeholder}
      </option>
      {taggableCourses.map((course) => (
        <option key={course.id} value={course.id}>
          {course.name}
        </option>
      ))}
      {allowUnsorted && current ? <option value={UNSORTED}>Move to Unsorted</option> : null}
      <option value={CREATE}>+ Create new course…</option>
    </select>
  );
}
