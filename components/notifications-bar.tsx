"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { answerClassInvite, readIncomingClassInvites } from "@/app/(app)/class-actions";
import { respondToConnection } from "@/app/(app)/member-actions";
import type { IncomingClassInvite } from "@/lib/class-match";
import { GlassCard } from "@/components/glass-card";
import { publicLabel } from "@/lib/identity";
import { batchSimilar } from "@/lib/suggest";
import { useCoursework } from "@/lib/coursework";

export function NotificationsBadge() {
  const router = useRouter();
  const pathname = usePathname();
  const { connections, assignments, courseById } = useCoursework();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [classInvites, setClassInvites] = useState<IncomingClassInvite[]>([]);
  const panel = useRef<HTMLDivElement>(null);
  const incoming = connections.filter((person) => person.status === "incoming");
  const batches = useMemo(
    () =>
      batchSimilar(
        assignments
          .filter((item) => courseById.get(item.courseId)?.isUnsorted)
          .map((item) => ({ id: item.id, title: item.title, description: null, url: item.url ?? null })),
      ),
    [assignments, courseById],
  );
  const count = incoming.length + batches.length + classInvites.length;
  const shown = open && count > 0;

  useEffect(() => {
    let current = true;
    void readIncomingClassInvites().then((rows) => {
      if (current) setClassInvites(rows);
    });
    return () => {
      current = false;
    };
  }, [incoming.length, pathname]);

  useEffect(() => {
    if (!shown) return;
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
  }, [shown]);

  async function answerClass(id: string, accept: boolean) {
    setPending(true);
    setError(null);
    const result = await answerClassInvite(id, accept).catch(() => ({
      ok: false as const,
      error: "Couldn't update that invitation.",
    }));
    setPending(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setClassInvites((current) => current.filter((item) => item.id !== id));
    router.refresh();
  }

  async function answer(id: string, accept: boolean) {
    setPending(true);
    setError(null);
    const result = await respondToConnection(id, accept).catch(() => ({
      ok: false as const,
      error: "Couldn't update that request.",
    }));
    setPending(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    router.refresh();
  }

  if (count === 0) return null;

  const label = count === 1 ? "1 notification" : `${count} notifications`;

  return (
    <div ref={panel}>
      <button
        type="button"
        aria-expanded={shown}
        aria-label={shown ? `Collapse ${label}` : label}
        onClick={() => setOpen((value) => !value)}
        className="absolute -right-1 -top-1 z-30 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-[#e5484d] px-1 text-[11px] font-semibold leading-none text-white shadow-[0_2px_6px_rgba(229,72,77,0.35)]"
      >
        {count > 9 ? "9+" : count}
      </button>
      {shown ? (
        <div data-m="notes" className="absolute right-0 top-14 z-30 w-[min(20rem,calc(100vw-2rem))]">
        <GlassCard className="p-4 text-left">
          <ul className="space-y-3">
            {classInvites.map((invite) => (
              <li key={invite.id}>
                <p className="text-[14px] text-[#14213d]">
                  <span className="font-semibold">@{invite.username}</span> invited you to {invite.courseName}.
                </p>
                <div className="mt-2 flex gap-2">
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => void answerClass(invite.id, true)}
                    className="h-8 rounded-full bg-[#14213d] px-3 text-[13px] font-semibold text-white disabled:opacity-60"
                  >
                    Join
                  </button>
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => void answerClass(invite.id, false)}
                    className="h-8 rounded-full px-2 text-[13px] font-semibold text-[#5b6478] disabled:opacity-60"
                  >
                    Decline
                  </button>
                </div>
              </li>
            ))}
            {incoming.map((person) => (
              <li key={person.id}>
                <p className="text-[14px] text-[#14213d]">
                  <span className="font-semibold">{publicLabel(person.name, person.username)}</span> wants to connect.
                </p>
                <div className="mt-2 flex gap-2">
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => void answer(person.id, true)}
                    className="h-8 rounded-full bg-[#14213d] px-3 text-[13px] font-semibold text-white disabled:opacity-60"
                  >
                    Approve
                  </button>
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => void answer(person.id, false)}
                    className="h-8 rounded-full px-2 text-[13px] font-semibold text-[#5b6478] disabled:opacity-60"
                  >
                    Decline
                  </button>
                </div>
              </li>
            ))}
            {batches.length > 0 ? (
              <li className="text-[14px] text-[#14213d]">
                {batches.length === 1 ? "A group of similar items" : `${batches.length} groups of similar items`} can be
                named as {batches.length === 1 ? "a class" : "classes"}.{" "}
                <Link href="/tag#batches" className="font-semibold underline-offset-2 hover:underline">
                  Name them
                </Link>
              </li>
            ) : null}
          </ul>
          {error ? (
            <p role="alert" className="mt-2 text-[13px] font-semibold text-[#e5484d]">
              {error}
            </p>
          ) : null}
        </GlassCard>
        </div>
      ) : null}
    </div>
  );
}
