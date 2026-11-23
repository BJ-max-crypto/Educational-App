"use client";

import { useEffect, useState } from "react";
import { readClassInvite, regenerateClassInvite, revokeClassInvite } from "@/app/(app)/class-actions";
import { ClassLink } from "@/components/class-link";
import { ClassUsernameInvite } from "@/components/class-username-invite";
import { GlassCard } from "@/components/glass-card";
import { MemberAvatar } from "@/components/member-avatar";
import { StatusChip } from "@/components/status-chip";
import { displayAcademicYear, periodLabel, type ClassInvitePanel, type ClassMember } from "@/lib/class-match";
import type { Classmate } from "@/lib/types";

const COLORS = ["#4f7cff", "#7c5cbf", "#e07a5f", "#2a9d8f", "#e9b44c", "#14213d"];

function initials(name: string) {
  const parts = name.trim().split(/\s+/).slice(0, 2);
  const letters = parts.map((part) => part[0]?.toUpperCase() ?? "").join("");
  return letters || "?";
}

function colorFor(id: string) {
  let hash = 0;
  for (const char of id) hash = (hash + char.charCodeAt(0)) % COLORS.length;
  return COLORS[hash] ?? COLORS[0];
}

export function ClassInvite({
  courseId,
  courseName,
  friends,
}: {
  courseId: string;
  courseName: string;
  friends: Classmate[];
}) {
  const [panel, setPanel] = useState<ClassInvitePanel | null>(null);
  const [pending, setPending] = useState(false);
  const [copied, setCopied] = useState<"link" | "code" | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancel = false;
    void readClassInvite(courseId)
      .then((result) => {
        if (!cancel) setPanel(result);
      })
      .catch(() => {
        if (!cancel) setPanel({ ok: false, error: "Couldn't load the invitation." });
      });
    return () => {
      cancel = true;
    };
  }, [courseId]);

  const live = panel?.ok && panel.available ? panel : null;
  const people: Array<ClassMember & { initials: string; color: string }> = live
    ? live.members.map((member) => ({ ...member, initials: initials(member.name), color: colorFor(member.id) }))
    : friends.map((member) => ({
        id: member.id,
        name: member.name,
        username: member.username,
        initials: member.initials,
        color: member.color,
      }));
  const count = live ? live.memberCount : friends.length;

  async function copy(value: string, kind: "link" | "code") {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(kind);
      setError(null);
      window.setTimeout(() => setCopied(null), 2000);
    } catch {
      setCopied(null);
      setError(value);
    }
  }

  async function share(url: string) {
    if (typeof navigator.share === "function") {
      try {
        await navigator.share({ title: courseName, text: `Join ${courseName} on Pane`, url });
        return;
      } catch (shareError) {
        if (shareError instanceof DOMException && shareError.name === "AbortError") return;
      }
    }
    await copy(url, "link");
  }

  async function change(action: "regenerate" | "revoke") {
    setPending(true);
    setError(null);
    setMessage(null);
    const saved =
      action === "regenerate"
        ? await regenerateClassInvite(courseId).catch(() => ({ ok: false as const, error: "Couldn't update that invitation." }))
        : await revokeClassInvite(courseId).catch(() => ({ ok: false as const, error: "Couldn't update that invitation." }));
    setPending(false);
    if (!saved.ok) {
      setError(saved.error);
      return;
    }
    setPanel(saved);
    setMessage(action === "regenerate" ? "New invitation ready." : "Invitation turned off.");
  }

  const link = live?.code && typeof window !== "undefined" ? `${window.location.origin}/c/${live.code}` : "";

  return (
    <GlassCard className="p-7">
      <h2 className="text-[22px] font-semibold text-[#14213d]">Invite classmates</h2>
      <p className="mt-1 text-[14px] text-[#5b6478]">
        Share one link, or search a username, so everyone in this class joins the same group.
      </p>
      <ClassUsernameInvite courseId={courseId} />
      {live?.code ? (
        <div className="mt-4">
          <p className="text-[13px] text-[#5b6478]">
            {[live.school, live.teacher, periodLabel(live.period), displayAcademicYear(live.academicYear)]
              .filter(Boolean)
              .join(" · ")}
          </p>
          <p className="mt-3 text-[20px] font-semibold tracking-[0.14em] text-[#14213d]">{live.code}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              data-m="tap"
              onClick={() => void copy(link, "link")}
              className="h-9 rounded-full bg-[#14213d] px-4 text-[13px] font-semibold text-white"
            >
              {copied === "link" ? "Link copied" : "Copy link"}
            </button>
            <button
              type="button"
              data-m="tap"
              onClick={() => void share(link)}
              className="h-9 rounded-full bg-white px-4 text-[13px] font-semibold text-[#14213d]"
            >
              Share
            </button>
            <button
              type="button"
              data-m="tap"
              onClick={() => void copy(live.code ?? "", "code")}
              className="h-9 rounded-full bg-white px-4 text-[13px] font-semibold text-[#14213d]"
            >
              {copied === "code" ? "Code copied" : "Copy code"}
            </button>
          </div>
        </div>
      ) : live ? (
        <p className="mt-3 text-[14px] text-[#5b6478]">
          {live.state === "revoked"
            ? "This invitation is turned off."
            : "This class doesn't have an open invitation."}
        </p>
      ) : panel?.ok && !panel.available ? (
        <div className="mt-3">
          <p className="text-[14px] text-[#5b6478]">{panel.notice}</p>
          <ClassLink courseId={courseId} courseName={courseName} />
        </div>
      ) : (
        <p className="mt-3 text-[14px] text-[#5b6478]">{panel && !panel.ok ? panel.error : "Loading invitation…"}</p>
      )}
      {live?.canManage ? (
        <div className="mt-3 flex flex-wrap gap-3">
          <button
            type="button"
            disabled={pending}
            data-m="hit"
            onClick={() => void change("regenerate")}
            className="text-[13px] font-semibold text-[#5b6478] disabled:opacity-60"
          >
            {pending ? "Saving…" : "Regenerate link"}
          </button>
          {live.code ? (
            <button
              type="button"
              disabled={pending}
              data-m="hit"
              onClick={() => void change("revoke")}
              className="text-[13px] font-semibold text-[#5b6478] disabled:opacity-60"
            >
              Revoke
            </button>
          ) : null}
        </div>
      ) : null}
      {message ? <p className="mt-2 text-[13px] font-medium text-[#14213d]">{message}</p> : null}
      {error ? (
        <p role="alert" className="mt-2 break-all text-[13px] font-semibold text-[#e5484d]">
          {error}
        </p>
      ) : null}

      <div className="mt-6 flex items-center gap-3">
        <h3 className="text-[18px] font-semibold text-[#14213d]">Members</h3>
        <StatusChip tone="neutral">
          {count} {count === 1 ? "member" : "members"}
        </StatusChip>
      </div>
      {people.length > 0 ? (
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
          {people.map((member) => (
            <div key={member.id} className="flex flex-col items-center rounded-[22px] bg-white/60 px-2 py-4 text-center">
              <MemberAvatar initials={member.initials} color={member.color} size={52} />
              <p className="mt-2 text-[14px] font-medium text-[#14213d]">{member.name}</p>
              {member.username ? <p className="text-[12px] text-[#5b6478]">@{member.username}</p> : null}
            </div>
          ))}
        </div>
      ) : (
        <p className="mt-4 text-[14px] text-[#5b6478]">Nobody has joined this class yet.</p>
      )}
    </GlassCard>
  );
}
