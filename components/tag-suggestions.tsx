"use client";

import { useState } from "react";
import { GlassCard } from "@/components/glass-card";
import { useCoursework, type TagSuggestions } from "@/lib/coursework";

/** Offers Unsorted items that look like the course just tagged. Only checked items get tagged. */
export function TagSuggestionsPanel() {
  const { tagSuggestions } = useCoursework();
  if (!tagSuggestions) return null;
  const key = `${tagSuggestions.courseId}:${tagSuggestions.items.map((item) => item.id).join(",")}`;
  return <Panel key={key} suggestions={tagSuggestions} />;
}

function Panel({ suggestions }: { suggestions: TagSuggestions }) {
  const { courseById, acceptSuggestions, dismissSuggestions } = useCoursework();
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const course = courseById.get(suggestions.courseId);
  const { items } = suggestions;
  const allChecked = items.length > 0 && items.every((item) => checked.has(item.id));

  function toggle(id: string) {
    setChecked((all) => {
      const copy = new Set(all);
      if (copy.has(id)) copy.delete(id);
      else copy.add(id);
      return copy;
    });
  }

  async function accept() {
    setSaving(true);
    await acceptSuggestions([...checked]);
    setSaving(false);
  }

  return (
    <div className="fixed inset-x-3 bottom-3 z-40 print:hidden sm:inset-x-auto sm:right-6 sm:bottom-6 sm:w-[420px]">
      <GlassCard className="flex max-h-[70vh] flex-col bg-[#eef3ff]/95 px-5 py-5 supports-[backdrop-filter]:bg-[rgba(232,240,255,0.82)]">
        <div className="flex items-start gap-3">
          {course ? (
            <span className="mt-1.5 size-2.5 shrink-0 rounded-full" style={{ backgroundColor: course.color }} />
          ) : null}
          <div className="min-w-0 flex-1">
            <h2 className="text-[16px] font-semibold text-[#14213d]">
              {suggestions.loading
                ? "Looking for similar items…"
                : items.length
                  ? `Also in ${course?.name ?? "this course"}?`
                  : "No similar items found"}
            </h2>
            <p className="mt-0.5 text-[12.5px] text-[#5b6478]">
              {items.length
                ? "Schoology doesn't say which class these are from. They look similar. Check the ones that belong."
                : suggestions.error ?? (suggestions.loading ? "" : "Everything left in Unsorted looks unrelated.")}
            </p>
          </div>
          <button
            type="button"
            onClick={dismissSuggestions}
            aria-label="Close suggestions"
            className="-mr-1 -mt-1 flex size-8 items-center justify-center rounded-full text-[18px] text-[#5b6478] transition-colors hover:bg-white/70"
          >
            ×
          </button>
        </div>

        {items.length ? (
          <>
            <button
              type="button"
              onClick={() => setChecked(allChecked ? new Set() : new Set(items.map((item) => item.id)))}
              className="mt-3 self-start text-[12.5px] font-semibold text-[#4f7cff]"
            >
              {allChecked ? "Clear" : `Check all ${items.length}`}
            </button>
            <ul className="mt-2 -mx-1 flex-1 space-y-1 overflow-y-auto px-1">
              {items.map((item) => (
                <li key={item.id}>
                  <label className="flex cursor-pointer items-start gap-3 rounded-2xl px-2.5 py-2 transition-colors hover:bg-white/60">
                    <input
                      type="checkbox"
                      checked={checked.has(item.id)}
                      onChange={() => toggle(item.id)}
                      className="mt-0.5 size-4 shrink-0 accent-[#4f7cff]"
                    />
                    <span className="min-w-0">
                      <span className="block truncate text-[14px] font-medium text-[#14213d]">{item.title}</span>
                      {item.reasons.map((reason) => (
                        <span key={reason} className="block text-[12px] leading-snug text-[#5b6478]">
                          {reason}
                        </span>
                      ))}
                    </span>
                  </label>
                </li>
              ))}
            </ul>
            <div className="mt-3 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={dismissSuggestions}
                className="text-[13px] font-semibold text-[#5b6478]"
              >
                Not these
              </button>
              <button
                type="button"
                disabled={!checked.size || saving}
                onClick={accept}
                className="h-9 rounded-full bg-[#14213d] px-4 text-[13px] font-semibold text-white transition-opacity disabled:opacity-40"
              >
                {saving ? "Tagging…" : checked.size ? `Tag ${checked.size} as ${course?.name ?? "course"}` : "Tag checked"}
              </button>
            </div>
          </>
        ) : null}
      </GlassCard>
    </div>
  );
}
