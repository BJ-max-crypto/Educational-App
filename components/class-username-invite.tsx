"use client";

import { useEffect, useState } from "react";
import { inviteClassmateToClass, searchClassmates } from "@/app/(app)/class-actions";
import { MemberAvatar } from "@/components/member-avatar";
import { publicLabel } from "@/lib/identity";
import type { ClassmateSearchHit } from "@/lib/class-match";

const COLORS = ["#4f7cff", "#7c5cbf", "#e07a5f", "#2a9d8f", "#e9b44c", "#14213d"];

function initials(value: string) {
  const clean = value.replace(/^@/, "").trim();
  return (clean[0] ?? "?").toUpperCase();
}

function colorFor(id: string) {
  let hash = 0;
  for (const char of id) hash = (hash + char.charCodeAt(0)) % COLORS.length;
  return COLORS[hash] ?? COLORS[0];
}

const fieldClass =
  "h-11 w-full rounded-full border border-white/90 bg-white/85 px-4 text-[16px] text-[#14213d] outline-none focus:border-[#4f7cff] focus:ring-4 focus:ring-[#4f7cff]/15";

export function ClassUsernameInvite({ courseId }: { courseId: string }) {
  const [query, setQuery] = useState("");
  const [matches, setMatches] = useState<ClassmateSearchHit[] | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    const text = query.trim().replace(/^@/, "");
    if (text.length < 2 || !/^[a-z0-9_]+$/i.test(text)) return;
    let current = true;
    const timer = window.setTimeout(() => {
      void searchClassmates(courseId, text).then((result) => {
        if (!current) return;
        if (!result.ok) {
          setError(result.error);
          setMatches([]);
          return;
        }
        setError(null);
        setMatches(result.matches);
      });
    }, 250);
    return () => {
      current = false;
      window.clearTimeout(timer);
    };
  }, [courseId, query]);

  async function invite(person: ClassmateSearchHit) {
    setPendingId(person.profileId);
    setError(null);
    setNotice(null);
    const saved = await inviteClassmateToClass(courseId, person.profileId).catch(() => ({
      ok: false as const,
      error: "Couldn't send that invitation.",
    }));
    setPendingId(null);
    if (!saved.ok) {
      setError(saved.error);
      return;
    }
    setMatches((current) =>
      current?.map((item) => (item.profileId === person.profileId ? { ...item, state: saved.state } : item)) ?? current,
    );
    setNotice(saved.state === "member" ? `@${person.username} is already in this class.` : `Invitation sent to @${person.username}.`);
  }

  return (
    <div className="mt-5">
      <label className="block">
        <span className="text-[13px] font-semibold text-[#14213d]">Add by username</span>
        <input
          value={query}
          onChange={(event) => {
            const next = event.target.value;
            setQuery(next);
            setNotice(null);
            if (next.trim().replace(/^@/, "").length < 2) setMatches(null);
          }}
          placeholder="Search a username"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          className={`${fieldClass} mt-2`}
        />
      </label>
      {matches ? (
        <div className="mt-3 space-y-2">
          {matches.length === 0 ? (
            <p className="text-[14px] text-[#5b6478]">No account uses that username.</p>
          ) : (
            matches.map((person) => (
              <div key={person.profileId} className="flex items-center gap-3 rounded-[20px] bg-white/60 px-3 py-2">
                <MemberAvatar initials={initials(person.name ?? person.username)} color={colorFor(person.profileId)} size={36} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[14px] font-medium text-[#14213d]">
                    {publicLabel(person.name, person.username)}
                  </p>
                  {person.name || person.school ? (
                    <p className="truncate text-[12px] text-[#5b6478]">
                      {[person.name ? `@${person.username}` : null, person.school].filter(Boolean).join(" · ")}
                    </p>
                  ) : null}
                </div>
                {person.state === "invite" ? (
                  <button
                    type="button"
                    disabled={pendingId === person.profileId}
                    data-m="tap"
                    onClick={() => void invite(person)}
                    className="h-8 shrink-0 rounded-full bg-[#14213d] px-3 text-[13px] font-semibold text-white disabled:opacity-60"
                  >
                    {pendingId === person.profileId ? "Sending…" : "Invite"}
                  </button>
                ) : (
                  <span className="shrink-0 text-[12px] font-semibold text-[#5b6478]">
                    {person.state === "member" ? "In class" : person.state === "invited" ? "Invited" : "Another school"}
                  </span>
                )}
              </div>
            ))
          )}
        </div>
      ) : null}
      {notice ? <p className="mt-2 text-[13px] font-medium text-[#14213d]">{notice}</p> : null}
      {error ? (
        <p role="alert" className="mt-2 text-[13px] font-semibold text-[#e5484d]">
          {error}
        </p>
      ) : null}
    </div>
  );
}
