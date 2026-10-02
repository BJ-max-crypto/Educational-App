"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { leaveCourse } from "@/app/(app)/actions";
import { useCoursework } from "@/lib/coursework";

export function LeaveClassButton({ courseId, courseName }: { courseId: string; courseName: string }) {
  const router = useRouter();
  const { openAssignments, completedAssignments } = useCoursework();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const bodyId = useId();
  const itemCount = openAssignments(courseId).length + completedAssignments(courseId).length;

  useEffect(() => {
    if (!open) return;
    cancelRef.current?.focus();
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  async function confirm() {
    setPending(true);
    setError(null);
    const result = await leaveCourse(courseId).catch(() => ({
      ok: false as const,
      error: "Couldn't leave that class. Try again.",
    }));
    setPending(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setOpen(false);
    router.push("/dashboard");
    router.refresh();
  }

  return (
    <>
      <button
        type="button"
        data-m="tap"
        onClick={() => {
          setError(null);
          setOpen(true);
        }}
        className="rounded-full px-4 py-2 text-[13px] font-semibold text-[#e5484d] transition-colors duration-200 hover:bg-[#e5484d]/10 motion-reduce:transition-none"
      >
        Leave class
      </button>
      {open ? (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center overflow-y-auto bg-[#14213d]/35 p-4 sm:items-center"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !pending) setOpen(false);
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            aria-describedby={bodyId}
            className="w-full max-w-md rounded-[28px] border border-white/90 bg-white/95 p-6 shadow-[0_18px_40px_rgba(51,64,128,0.2)]"
          >
            <h2 id={titleId} className="text-[22px] font-semibold tracking-[-0.02em] text-[#14213d]">
              Leave {courseName}?
            </h2>
            <p id={bodyId} className="mt-2 text-[14px] leading-relaxed text-[#5b6478]">
              You will be removed from this class. People you share it with will no longer see you here.
              {itemCount > 0
                ? ` ${itemCount} ${itemCount === 1 ? "item moves" : "items move"} to Unsorted and ${itemCount === 1 ? "is" : "are"} not deleted.`
                : " Work in this class is not deleted."}
            </p>
            {error ? (
              <p role="alert" className="mt-3 text-[13px] font-semibold text-[#e5484d]">
                {error}
              </p>
            ) : null}
            <div className="mt-5 flex flex-wrap justify-end gap-2">
              <button
                ref={cancelRef}
                type="button"
                data-m="tap"
                disabled={pending}
                onClick={() => setOpen(false)}
                className="h-11 rounded-full bg-[#14213d] px-4 text-[14px] font-semibold text-white disabled:opacity-60"
              >
                Stay in class
              </button>
              <button
                type="button"
                data-m="tap"
                disabled={pending}
                onClick={() => void confirm()}
                className="h-11 rounded-full px-4 text-[14px] font-semibold text-[#e5484d] disabled:opacity-60"
              >
                {pending ? "Leaving…" : "Leave class"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
