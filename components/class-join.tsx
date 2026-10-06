"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { joinClassLink, respondToConnection, type ClassLinkView } from "@/app/(app)/member-actions";
import { GlassCard } from "@/components/glass-card";
import { publicLabel } from "@/lib/identity";

type Lookup = ClassLinkView | { ok: false; error: string };

export function ClassJoin({ courseId, result }: { courseId: string; result: Lookup }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [joinedId, setJoinedId] = useState<string | null>(null);
  const [status, setStatus] = useState(result.ok ? result.status : "none");
  const [approved, setApproved] = useState(result.ok && result.status === "accepted");

  async function add() {
    setPending(true);
    setError(null);
    const saved = await joinClassLink(courseId).catch(() => ({
      ok: false as const,
      error: "Couldn't add that class.",
    }));
    setPending(false);
    if (!saved.ok) {
      setError(saved.error);
      return;
    }
    setJoinedId(saved.courseId);
    setStatus(saved.status);
    setApproved(saved.status === "accepted");
    router.refresh();
  }

  async function approve() {
    if (!result.ok || !result.connectionId) return;
    setPending(true);
    setError(null);
    const saved = await respondToConnection(result.connectionId, true).catch(() => ({
      ok: false as const,
      error: "Couldn't approve that.",
    }));
    setPending(false);
    if (!saved.ok) {
      setError(saved.error);
      return;
    }
    setApproved(true);
    setStatus("accepted");
    router.refresh();
  }

  const detail =
    result.ok && result.teacher
      ? result.period
        ? `${result.teacher} · ${result.period}`
        : result.teacher
      : result.ok
        ? result.period
        : null;

  return (
    <div className="mx-auto w-full max-w-md">
      <GlassCard className="p-7">
        {!result.ok ? (
          <>
            <h1 className="text-[26px] font-semibold tracking-[-0.03em] text-[#14213d]">Class link unavailable</h1>
            <p className="mt-2 text-[15px] text-[#5b6478]">{result.error}</p>
          </>
        ) : result.own ? (
          <>
            <h1 className="text-[26px] font-semibold tracking-[-0.03em] text-[#14213d]">This is your class</h1>
            <p className="mt-2 text-[15px] text-[#5b6478]">
              Share the link so a classmate can add {result.courseName}. They see your username.
            </p>
            <Link
              href={`/courses/${courseId}`}
              className="mt-6 inline-block text-[14px] font-semibold text-[#4f7cff]"
            >
              Back to {result.courseName}
            </Link>
          </>
        ) : (
          <>
            <h1 className="text-[26px] font-semibold tracking-[-0.03em] text-[#14213d]">
              {approved ? publicLabel(result.name, result.username) : `@${result.username} shared`}
            </h1>
            <p className="mt-2 text-[18px] font-semibold text-[#14213d]">{result.courseName}</p>
            {detail ? <p className="mt-1 text-[14px] text-[#5b6478]">{detail}</p> : null}
            {joinedId ? (
              <p className="mt-3 text-[15px] text-[#5b6478]">You&apos;re in {result.courseName}.</p>
            ) : null}
            {approved ? (
              <p className="mt-2 text-[15px] text-[#5b6478]">You&apos;re already connected.</p>
            ) : (
              <p className="mt-2 text-[15px] text-[#5b6478]">Their name stays hidden until you both approve.</p>
            )}
            {joinedId ? null : (
              <button
                type="button"
                disabled={pending}
                onClick={() => void add()}
                className="mt-6 rounded-full bg-[#14213d] px-6 py-3 text-[15px] font-semibold text-white disabled:opacity-60"
              >
                {pending ? "Adding…" : "Add class"}
              </button>
            )}
            {status === "incoming" && result.connectionId && !approved ? (
              <button
                type="button"
                disabled={pending}
                onClick={() => void approve()}
                className="mt-3 rounded-full bg-white px-6 py-3 text-[15px] font-semibold text-[#14213d] disabled:opacity-60"
              >
                {pending ? "Approving…" : "Approve"}
              </button>
            ) : null}
            {joinedId ? (
              <Link
                href={`/courses/${joinedId}`}
                className="mt-6 inline-block text-[14px] font-semibold text-[#4f7cff]"
              >
                Open {result.courseName}
              </Link>
            ) : null}
          </>
        )}
        {error ? (
          <p role="alert" className="mt-3 text-[14px] font-semibold text-[#e5484d]">
            {error}
          </p>
        ) : null}
      </GlassCard>
    </div>
  );
}
