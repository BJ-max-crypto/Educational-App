"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { CourseSelect } from "@/components/course-select";
import { GlassCard } from "@/components/glass-card";
import { cn } from "@/lib/cn";
import { useCoursework } from "@/lib/coursework";

type Filter = "all" | "assignment" | "event";

function kindOf(url: string | undefined): Exclude<Filter, "all"> | null {
  if (url && /\/assignment\/\d+/.test(url)) return "assignment";
  if (url && /\/event\/\d+/.test(url)) return "event";
  return null;
}

export function QuickTagView() {
  const { ready, assignments, unsortedAssignments, courseById, assignCourse } = useCoursework();
  // Items tagged during this visit stay on screen (with their new course) so the list doesn't jump.
  const [ids] = useState(() => unsortedAssignments.map((item) => item.id));
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState<Filter>("all");
  const [savingIds, setSavingIds] = useState<Set<string>>(new Set());

  const byId = useMemo(() => new Map(assignments.map((item) => [item.id, item])), [assignments]);
  const rows = ids
    .map((id) => byId.get(id))
    .filter((item) => item !== undefined)
    .filter((item) => filter === "all" || kindOf(item.url) === filter);
  const remaining = rows.filter((item) => courseById.get(item.courseId)?.isUnsorted).length;
  const visibleIds = rows.map((item) => item.id);
  const allSelected = visibleIds.length > 0 && visibleIds.every((id) => selected.has(id));

  async function tag(targetIds: string[], courseId: string | null) {
    setSavingIds((all) => new Set([...all, ...targetIds]));
    const ok = await assignCourse(targetIds, courseId);
    setSavingIds((all) => {
      const copy = new Set(all);
      for (const id of targetIds) copy.delete(id);
      return copy;
    });
    if (ok) setSelected(new Set());
  }

  function toggle(id: string) {
    setSelected((all) => {
      const copy = new Set(all);
      if (copy.has(id)) copy.delete(id);
      else copy.add(id);
      return copy;
    });
  }

  return (
    <GlassCard className="mx-auto w-full max-w-[960px] px-5 py-7 sm:px-9">
      <Link href="/dashboard" className="text-[14px] font-medium text-[#5b6478]">
        ‹ Dashboard
      </Link>
      <h1 className="mt-2 text-[30px] font-semibold leading-tight tracking-[-0.03em] text-[#14213d]">
        Quick tag
      </h1>
      <p className="mt-1 max-w-[640px] text-[14px] text-[#5b6478]">
        Schoology&apos;s calendar feed doesn&apos;t say which class an item belongs to. Tag each one
        once. Pane remembers it by its Schoology ID and applies it on every sync.
      </p>

      <div className="mt-5 flex flex-wrap items-center gap-2">
        {(["all", "assignment", "event"] as const).map((option) => (
          <button
            key={option}
            type="button"
            onClick={() => setFilter(option)}
            aria-pressed={filter === option}
            className={cn(
              "rounded-full px-3.5 py-1.5 text-[13px] font-semibold transition-colors duration-150 ease-out",
              filter === option ? "bg-white/95 text-[#14213d] shadow-[0_4px_12px_rgba(51,64,128,0.12)]" : "text-[#5b6478] hover:bg-white/60",
            )}
          >
            {option === "all" ? "All" : option === "assignment" ? "Assignments" : "Calendar events"}
          </button>
        ))}
        <span className="ml-auto text-[13px] font-medium text-[#5b6478]">
          {remaining} untagged
        </span>
      </div>

      <div className="sticky top-2 z-10 mt-4 flex flex-wrap items-center gap-3 rounded-[20px] border border-white/90 bg-white/80 px-4 py-2.5 shadow-[0_8px_20px_rgba(51,64,128,0.10)] backdrop-blur-[14px]">
        <label className="flex items-center gap-2 text-[13px] font-semibold text-[#14213d]">
          <input
            type="checkbox"
            checked={allSelected}
            onChange={() => setSelected(allSelected ? new Set() : new Set(visibleIds))}
            className="size-4 accent-[#4f7cff]"
          />
          Select all
        </label>
        <span className="text-[13px] text-[#5b6478]">{selected.size} selected</span>
        <CourseSelect
          label="Course for selected items"
          value={null}
          placeholder={selected.size ? `Tag ${selected.size} as…` : "Select items first"}
          disabled={selected.size === 0}
          onSelect={(courseId) => void tag([...selected], courseId)}
          className="ml-auto"
        />
      </div>

      {rows.length === 0 ? (
        <p className="mt-6 text-[15px] text-[#5b6478]">Nothing here needs a course.</p>
      ) : (
        <ul className="mt-3 divide-y divide-white/70">
          {rows.map((item) => {
            const course = courseById.get(item.courseId);
            const tagged = course && !course.isUnsorted;
            const kind = kindOf(item.url);
            return (
              <li
                key={item.id}
                className="-mx-2 flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-[14px] px-2 py-2.5 transition-colors duration-150 ease-out hover:bg-white/50"
              >
                <input
                  type="checkbox"
                  checked={selected.has(item.id)}
                  onChange={() => toggle(item.id)}
                  aria-label={`Select ${item.title}`}
                  className="size-4 shrink-0 accent-[#4f7cff]"
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[15px] font-semibold text-[#14213d]">{item.title}</p>
                  <p className="text-[12px] text-[#5b6478]">
                    {ready
                      ? new Date(item.dueAt).toLocaleDateString("en-US", {
                          weekday: "short",
                          month: "short",
                          day: "numeric",
                        })
                      : " "}
                    {kind ? ` · ${kind === "assignment" ? "Assignment" : "Calendar event"}` : ""}
                    {item.url ? (
                      <>
                        {" · "}
                        <a
                          href={item.url.replace(/^http:/, "https:")}
                          target="_blank"
                          rel="noreferrer"
                          className="font-semibold underline-offset-2 hover:underline"
                        >
                          Open in Schoology
                        </a>
                      </>
                    ) : null}
                  </p>
                </div>
                {tagged ? (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-[rgba(47,174,134,0.16)] px-3 py-1 text-[12px] font-semibold text-[#1b7f60]">
                    <span className="size-2 rounded-full" style={{ backgroundColor: course.color }} aria-hidden />
                    {course.name}
                  </span>
                ) : null}
                <CourseSelect
                  label={`Course for ${item.title}`}
                  value={tagged ? item.courseId : null}
                  allowUnsorted
                  placeholder={savingIds.has(item.id) ? "Saving…" : "Tag course…"}
                  disabled={savingIds.has(item.id)}
                  onSelect={(courseId) => void tag([item.id], courseId)}
                />
              </li>
            );
          })}
        </ul>
      )}
    </GlassCard>
  );
}
