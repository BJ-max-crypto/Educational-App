"use client";

import { useEffect, useRef, useState } from "react";
import type { AssignmentAiResponse } from "@/app/api/assignment-ai/route";
import { GlassCard } from "@/components/glass-card";
import { SparkleIcon } from "@/components/sparkle-icon";
import { clientTimeZone } from "@/lib/client-zone";

type Action = "breakdown" | "reason";

export function AssignmentAi({ assignmentId, title }: { assignmentId: string; title: string }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<Action | null>(null);
  const [shown, setShown] = useState<Action | null>(null);
  const [result, setResult] = useState<AssignmentAiResponse | null>(null);
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

  async function run(action: Action, refresh = false) {
    setBusy(action);
    setShown(action);
    const response = await fetch(`/api/assignment-ai?tz=${encodeURIComponent(clientTimeZone())}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ assignmentId, action, refresh }),
    }).catch(() => null);
    const data = (await response?.json().catch(() => null)) as AssignmentAiResponse | null;
    setResult({
      action,
      steps: data?.steps ?? null,
      text: data?.text ?? null,
      generatedAt: data?.generatedAt ?? null,
      error: data ? data.error : "Couldn't do that. Try again.",
    });
    setBusy(null);
  }

  const visible = result && result.action === shown ? result : null;

  return (
    <div ref={panel} className="relative" onClick={(event) => event.stopPropagation()}>
      <button
        type="button"
        aria-expanded={open}
        aria-label={`AI tools for ${title}`}
        onClick={() => setOpen((value) => !value)}
        className="flex size-8 items-center justify-center rounded-full text-[#4f7cff] hover:bg-white/80"
      >
        <SparkleIcon className="size-4" />
      </button>
      {open ? (
        <div data-m="ai-pop" className="absolute right-0 top-9 z-30 w-[min(20rem,calc(100vw-2rem))]">
          <GlassCard className="p-4 text-left">
            <p className="text-[12px] font-semibold tracking-[0.06em] text-[#5b6478]">THIS ASSIGNMENT</p>
            <div className="mt-2 flex flex-col gap-1">
              <button
                type="button"
                disabled={busy !== null}
                onClick={() => void run("breakdown")}
                className="rounded-[14px] px-3 py-2 text-left text-[14px] font-semibold text-[#14213d] hover:bg-white/70 disabled:opacity-60"
              >
                {busy === "breakdown" ? "Breaking it down…" : "Break this down"}
              </button>
              <button
                type="button"
                disabled={busy !== null}
                onClick={() => void run("reason")}
                className="rounded-[14px] px-3 py-2 text-left text-[14px] font-semibold text-[#14213d] hover:bg-white/70 disabled:opacity-60"
              >
                {busy === "reason" ? "Thinking…" : "Why this priority"}
              </button>
            </div>
            {visible?.steps ? (
              <ol className="mt-3 list-decimal space-y-1 pl-4 text-[13px] text-[#14213d]">
                {visible.steps.map((step, index) => (
                  <li key={`${index}-${step}`}>{step}</li>
                ))}
              </ol>
            ) : null}
            {visible?.text ? (
              <div className="mt-3">
                <p className="text-[12px] font-semibold text-[#5b6478]">Pane&apos;s estimate</p>
                <p className="mt-1 text-[13px] leading-relaxed text-[#14213d]">{visible.text}</p>
              </div>
            ) : null}
            {visible?.error ? (
              <p role="alert" className="mt-3 text-[13px] font-medium text-[#e5484d]">
                {visible.error}
              </p>
            ) : null}
            {visible && !visible.error && (visible.steps || visible.text) ? (
              <button
                type="button"
                disabled={busy !== null || shown === null}
                onClick={() => shown && void run(shown, true)}
                className="mt-3 text-[12px] font-semibold text-[#5b6478] disabled:opacity-60"
              >
                Refresh
              </button>
            ) : null}
          </GlassCard>
        </div>
      ) : null}
    </div>
  );
}
