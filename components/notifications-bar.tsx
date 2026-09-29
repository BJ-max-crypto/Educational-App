"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { respondToConnection } from "@/app/(app)/member-actions";
import { GlassCard } from "@/components/glass-card";
import { batchSimilar } from "@/lib/suggest";
import { useCoursework } from "@/lib/coursework";

export function NotificationsBar() {
  const router = useRouter();
  const { connections, assignments, courseById } = useCoursework();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
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

  return (
    <GlassCard className="mb-4 px-4 py-3 sm:px-5">
      <p className="text-[12px] font-semibold tracking-[0.08em] text-[#5b6478]">NOTIFICATIONS</p>
      {incoming.length === 0 && batches.length === 0 ? (
        <p className="mt-1 text-[14px] text-[#5b6478]">You&apos;re all caught up.</p>
      ) : (
        <ul className="mt-2 space-y-2">
          {incoming.map((person) => (
            <li key={person.id} data-m="wrap" className="flex flex-wrap items-center gap-2">
              <p className="min-w-0 flex-1 text-[14px] text-[#14213d]">
                <span className="font-semibold">{person.name}</span> wants to connect.
              </p>
              <button
                type="button"
                disabled={pending}
                data-m="tap"
                onClick={() => void answer(person.id, true)}
                className="h-9 rounded-full bg-[#14213d] px-3 text-[13px] font-semibold text-white disabled:opacity-60"
              >
                Approve
              </button>
              <button
                type="button"
                disabled={pending}
                data-m="tap"
                onClick={() => void answer(person.id, false)}
                className="h-9 rounded-full px-3 text-[13px] font-semibold text-[#5b6478] disabled:opacity-60"
              >
                Decline
              </button>
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
      )}
      {error ? (
        <p role="alert" className="mt-2 text-[13px] font-semibold text-[#e5484d]">
          {error}
        </p>
      ) : null}
    </GlassCard>
  );
}
