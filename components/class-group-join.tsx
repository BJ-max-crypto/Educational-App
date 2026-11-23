"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { SignOutButton } from "@clerk/nextjs";
import { joinClassInvite } from "@/app/(app)/class-actions";
import { GlassCard } from "@/components/glass-card";
import { displayAcademicYear, periodLabel, type ClassPreview } from "@/lib/class-match";

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-t border-white/80 py-2.5">
      <dt className="text-[13px] text-[#5b6478]">{label}</dt>
      <dd className="text-right text-[14px] font-medium text-[#14213d]">{value}</dd>
    </div>
  );
}

export function ClassGroupJoin({
  code,
  preview,
  signedIn,
  viewerName,
}: {
  code: string;
  preview: ClassPreview;
  signedIn: boolean;
  viewerName: string | null;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function join() {
    setPending(true);
    setError(null);
    const saved = await joinClassInvite(code).catch(() => ({ ok: false as const, error: "Couldn't join that class." }));
    setPending(false);
    if (!saved.ok) {
      setError(saved.error);
      return;
    }
    router.push(`/courses/${saved.courseId}`);
    router.refresh();
  }

  const course = preview.ok ? preview : null;
  const blocked = course
    ? course.state === "revoked"
      ? "This invitation was turned off."
      : course.state === "expired"
        ? "This invitation has expired."
        : signedIn && !course.sameSchool
          ? "This class is at another school, so you can't join it from this account."
          : null
    : null;

  return (
    <GlassCard className="w-full p-7">
      {!course ? (
        <>
          <h1 className="text-[26px] font-semibold tracking-[-0.03em] text-[#14213d]">Invitation unavailable</h1>
          <p className="mt-2 text-[15px] text-[#5b6478]">{preview.ok ? "" : preview.error}</p>
        </>
      ) : (
        <>
          <p className="text-[13px] font-semibold tracking-[0.06em] text-[#5b6478]">CLASS INVITATION</p>
          <h1 className="mt-2 text-[28px] font-semibold tracking-[-0.03em] text-[#14213d]">{course.name}</h1>
          <dl className="mt-4">
            <Fact label="School" value={course.school || "Not listed"} />
            <Fact label="Teacher" value={course.teacher || "Not listed"} />
            <Fact label="Period" value={periodLabel(course.period) || "Not listed"} />
            <Fact label="Academic year" value={displayAcademicYear(course.academicYear) || "Not listed"} />
            <Fact label="Members" value={String(course.memberCount)} />
          </dl>
          {signedIn && viewerName ? (
            <p className="mt-4 text-[13px] text-[#5b6478]">Signed in as {viewerName}.</p>
          ) : null}
          {blocked ? <p className="mt-4 text-[14px] text-[#5b6478]">{blocked}</p> : null}
          {error ? (
            <p role="alert" className="mt-3 text-[13px] font-semibold text-[#e5484d]">
              {error}
            </p>
          ) : null}
          <div className="mt-5 flex flex-wrap items-center gap-3">
            {course.already && course.courseId ? (
              <Link
                href={`/courses/${course.courseId}`}
                data-m="tap"
                className="inline-flex h-10 items-center rounded-full bg-[#14213d] px-4 text-[14px] font-semibold text-white"
              >
                Open class
              </Link>
            ) : null}
            {!course.already && signedIn && !blocked ? (
              <button
                type="button"
                disabled={pending}
                data-m="tap"
                onClick={() => void join()}
                className="h-10 rounded-full bg-[#14213d] px-4 text-[14px] font-semibold text-white disabled:opacity-60"
              >
                {pending ? "Joining…" : "Join class"}
              </button>
            ) : null}
            {!signedIn && !blocked ? (
              <Link
                href={`/c/${code}/resume`}
                data-m="tap"
                className="inline-flex h-10 items-center rounded-full bg-[#14213d] px-4 text-[14px] font-semibold text-white"
              >
                Sign in or create an account
              </Link>
            ) : null}
            {signedIn ? (
              <SignOutButton redirectUrl={`/c/${code}`}>
                <button type="button" data-m="hit" className="text-[13px] font-semibold text-[#5b6478]">
                  Use a different account
                </button>
              </SignOutButton>
            ) : null}
          </div>
        </>
      )}
    </GlassCard>
  );
}
