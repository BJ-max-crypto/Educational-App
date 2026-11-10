"use client";

import { useEffect, useRef, useState } from "react";
import type { AiAccessCode } from "@/lib/billing-config";
import type { PriorityLabelsResponse } from "@/app/api/priority-labels/route";
import type { WeekReviewResponse } from "@/app/api/week-review/route";
import { GlassCard } from "@/components/glass-card";
import { SparkleIcon } from "@/components/sparkle-icon";
import { UpgradeNote } from "@/components/upgrade-note";
import { clientTimeZone } from "@/lib/client-zone";
import { useCoursework } from "@/lib/coursework";
import { FEATURE } from "@/lib/pro";

export function AiToolsMenu({
  hasLabels,
  onResult,
  onReview,
}: {
  hasLabels: boolean;
  onResult: (data: PriorityLabelsResponse) => void;
  onReview: (data: WeekReviewResponse) => void;
}) {
  const { billing } = useCoursework();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<"generate" | "refresh" | "review" | null>(null);
  const [note, setNote] = useState<{ text: string; problem: boolean; code?: AiAccessCode } | null>(null);
  const panel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onPointer(event: MouseEvent) {
      if (!panel.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  async function run(refresh: boolean) {
    setBusy(refresh ? "refresh" : "generate");
    setNote(null);
    const query = refresh ? "&refresh=1" : "";
    const response = await fetch(`/api/priority-labels?tz=${encodeURIComponent(clientTimeZone())}${query}`, {
      method: "POST",
    }).catch(() => null);
    const data = (await response?.json().catch(() => null)) as PriorityLabelsResponse | null;
    const next = data ?? { labels: null, generatedAt: null, error: "Couldn't label priorities. Try again." };
    onResult(next);
    setNote(
      next.error
        ? { text: next.error, problem: true, code: next.code }
        : { text: "Priority labels are on this week's list.", problem: false },
    );
    setBusy(null);
  }

  async function printReview() {
    setBusy("review");
    setNote(null);
    const response = await fetch(`/api/week-review?tz=${encodeURIComponent(clientTimeZone())}`, {
      method: "POST",
    }).catch(() => null);
    const data = (await response?.json().catch(() => null)) as WeekReviewResponse | null;
    const next = data ?? {
      review: null,
      heading: null,
      items: [],
      generatedAt: null,
      error: "Couldn't write the week review. Try again.",
    };
    if (next.review && next.heading) {
      onReview(next);
      setOpen(false);
    } else {
      setNote({ text: next.error ?? "Couldn't write the week review. Try again.", problem: true, code: next.code });
    }
    setBusy(null);
  }

  return (
    <div ref={panel} className="relative">
      <button
        type="button"
        aria-expanded={open}
        aria-label="AI tools"
        onClick={() => setOpen((value) => !value)}
        className="flex size-10 items-center justify-center rounded-full bg-white/90 text-[#4f7cff] shadow-[0_4px_12px_rgba(51,64,128,0.12)]"
      >
        <SparkleIcon className="size-5" />
      </button>
      {open ? (
        <div data-m="ai-menu" className="absolute right-0 top-12 z-30 w-[min(18rem,calc(100vw-3rem))]">
          <GlassCard solid className="p-3 text-left">
            <p className="px-3 pb-1 text-[12px] font-semibold tracking-[0.06em] text-[#5b6478]">AI TOOLS</p>
            {billing.tier === "pro" ? (
              <p className="px-3 pb-2 text-[12px] text-[#5b6478]">
                {billing.remaining} of {billing.allowance} AI answers left this month.
              </p>
            ) : (
              <div className="px-3 pb-2">
                <p className="text-[12px] leading-relaxed text-[#5b6478]">
                  Priority labels mark this week A, B, or C. Print week review writes a page you can print. Both are part of Pane Pro.
                </p>
                <UpgradeNote code="pro_required" />
              </div>
            )}
            <button
              type="button"
              disabled={busy !== null || billing.tier !== "pro"}
              onClick={() => void run(false)}
              className="w-full rounded-[14px] px-3 py-2 text-left text-[14px] font-semibold text-[#14213d] hover:bg-white/70 disabled:opacity-60"
            >
              {busy === "generate" ? "Generating…" : "Generate priority labels"}
            </button>
            <button
              type="button"
              data-feature={FEATURE.weekReview}
              disabled={busy !== null || billing.tier !== "pro"}
              onClick={() => void printReview()}
              className="w-full rounded-[14px] px-3 py-2 text-left text-[14px] font-semibold text-[#14213d] hover:bg-white/70 disabled:opacity-60"
            >
              {busy === "review" ? "Writing…" : "Print week review"}
            </button>
            {hasLabels ? (
              <button
                type="button"
                disabled={busy !== null || billing.tier !== "pro"}
                onClick={() => void run(true)}
                className="w-full rounded-[14px] px-3 py-2 text-left text-[14px] font-semibold text-[#14213d] hover:bg-white/70 disabled:opacity-60"
              >
                {busy === "refresh" ? "Refreshing…" : "Refresh priority labels"}
              </button>
            ) : null}
            {note ? (
              <div className="px-3 py-2">
                {note.code ? (
                  <UpgradeNote code={note.code} message={note.text} />
                ) : (
                  <p role="status" className={`text-[12px] ${note.problem ? "font-medium text-[#e5484d]" : "text-[#5b6478]"}`}>
                    {note.text}
                  </p>
                )}
              </div>
            ) : null}
          </GlassCard>
        </div>
      ) : null}
    </div>
  );
}
