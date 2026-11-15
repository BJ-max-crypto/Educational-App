"use client";

import { useState } from "react";
import type { ClassLabelHit, ClassLabelsResponse } from "@/app/api/class-labels/route";
import { useOpenProUpgrade } from "@/components/pro-upgrade-dialog";
import { UpgradeNote } from "@/components/upgrade-note";
import { clientTimeZone } from "@/lib/client-zone";
import { useCoursework } from "@/lib/coursework";

export function EnhanceClassLabels({ courseId, className }: { courseId?: string; className?: string }) {
  const { billing, assignCourse, courseById } = useCoursework();
  const openPro = useOpenProUpgrade();
  const locked = billing.tier !== "pro";
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [labels, setLabels] = useState<ClassLabelHit[]>([]);
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<ClassLabelsResponse | null>(null);

  async function enhance() {
    setOpen(true);
    setBusy(true);
    setNotice(null);
    setError(null);
    setLabels([]);
    const response = await fetch(`/api/class-labels?tz=${encodeURIComponent(clientTimeZone())}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ courseId }),
    }).catch(() => null);
    const data = (await response?.json().catch(() => null)) as ClassLabelsResponse | null;
    const next = data ?? { labels: [], generatedAt: null, error: "Couldn't label those classes. Try again." };
    setBusy(false);
    if (next.error) {
      setError(next);
      return;
    }
    setLabels(next.labels);
    setChecked(new Set(next.labels.map((label) => label.id)));
    setNotice(next.notice ?? (next.labels.length ? null : "Nothing in Unsorted looks like one of your classes."));
  }

  function toggle(id: string) {
    setChecked((all) => {
      const copy = new Set(all);
      if (copy.has(id)) copy.delete(id);
      else copy.add(id);
      return copy;
    });
  }

  async function apply() {
    const chosen = labels.filter((label) => checked.has(label.id));
    if (!chosen.length) return;
    setSaving(true);
    const groups = new Map<string, string[]>();
    for (const label of chosen) {
      const ids = groups.get(label.courseId) ?? [];
      ids.push(label.id);
      groups.set(label.courseId, ids);
    }
    for (const [id, assignmentIds] of groups) {
      const ok = await assignCourse(assignmentIds, id);
      if (!ok) {
        setSaving(false);
        return;
      }
    }
    setSaving(false);
    setOpen(false);
  }

  const buttonClass =
    className ??
    "rounded-full bg-white/95 px-4 py-2 text-[13px] font-semibold text-[#14213d] shadow-[0_4px_12px_rgba(51,64,128,0.12)]";

  return (
    <>
      <button
        type="button"
        disabled={locked ? !openPro : busy}
        onClick={() => {
          if (locked) {
            openPro?.();
            return;
          }
          void enhance();
        }}
        data-m="tap"
        className={buttonClass}
      >
        {busy ? "Labeling…" : courseId ? "Enhance labels" : "Enhance class labels"}
      </button>
      {open ? (
        <div data-m="dialog" className="fixed inset-0 z-50 flex items-end justify-center overflow-y-auto bg-[#14213d]/35 p-4 sm:items-center">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="class-label-title"
            className="max-h-[min(640px,calc(100vh-2rem))] w-full max-w-md overflow-y-auto rounded-[28px] border border-white/90 bg-white/95 p-6 shadow-[0_12px_32px_rgba(51,64,128,0.16)] backdrop-blur-[14px]"
          >
            <h2 id="class-label-title" className="text-[20px] font-semibold text-[#14213d]">
              Class labels
            </h2>
            <p className="mt-1 text-[14px] text-[#5b6478]">
              These are suggestions. Nothing is tagged until you apply the ones you check.
            </p>
            {busy ? <p className="mt-4 text-[14px] text-[#5b6478]">Looking through Unsorted…</p> : null}
            {error ? (
              <div className="mt-3">
                <UpgradeNote code={error.code} message={error.error} />
              </div>
            ) : null}
            {notice ? <p className="mt-3 text-[14px] text-[#5b6478]">{notice}</p> : null}
            {labels.length ? (
              <ul className="mt-4 space-y-2">
                {labels.map((label) => {
                  const course = courseById.get(label.courseId);
                  return (
                    <li key={label.id}>
                      <label className="flex cursor-pointer items-start gap-3 rounded-2xl px-2 py-2 hover:bg-white/70">
                        <input
                          type="checkbox"
                          checked={checked.has(label.id)}
                          onChange={() => toggle(label.id)}
                          className="mt-1 size-4 shrink-0 accent-[#4f7cff]"
                        />
                        <span className="min-w-0">
                          <span className="block text-[14px] font-medium text-[#14213d]">{label.title}</span>
                          <span className="mt-0.5 flex items-center gap-2 text-[12px] text-[#5b6478]">
                            {course ? (
                              <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: course.color }} />
                            ) : null}
                            {label.courseName}
                          </span>
                          <span className="block text-[12px] leading-snug text-[#5b6478]">{label.reason}</span>
                        </span>
                      </label>
                    </li>
                  );
                })}
              </ul>
            ) : null}
            <div className="mt-5 flex items-center justify-end gap-3">
              <button type="button" onClick={() => setOpen(false)} className="text-[14px] font-semibold text-[#5b6478]">
                Close
              </button>
              {labels.length ? (
                <button
                  type="button"
                  disabled={!checked.size || saving}
                  onClick={() => void apply()}
                  data-m="tap"
                  className="h-10 rounded-full bg-[#14213d] px-4 text-[14px] font-semibold text-white disabled:opacity-40"
                >
                  {saving ? "Tagging…" : `Apply ${checked.size}`}
                </button>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
