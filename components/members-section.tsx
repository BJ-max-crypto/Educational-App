"use client";

import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import {
  answerMemberRequest,
  cancelMemberRequest,
  getMemberHub,
  removeMember,
  searchMembers,
  sendMemberRequest,
  setUsername,
} from "@/app/(app)/member-actions";
import { MemberAvatar } from "@/components/member-avatar";
import { sharedCourseNames, validateUsername } from "@/lib/classmates";
import { useCoursework } from "@/lib/coursework";
import { MEMBERS_MIGRATION, type MemberHub, type MemberLink, type MemberSearchHit } from "@/lib/member-types";
import type { Classmate } from "@/lib/types";

const fieldClass =
  "w-full rounded-[14px] border border-white/90 bg-white/85 px-3.5 py-2.5 text-[15px] text-[#14213d] outline-none transition-shadow duration-200 ease-out placeholder:text-[#5b6478]/70 focus:border-[#4f7cff] focus:ring-4 focus:ring-[#4f7cff]/15";
const pillClass =
  "rounded-full bg-white/95 px-3.5 py-2 text-[13px] font-semibold text-[#14213d] shadow-[0_4px_12px_rgba(51,64,128,0.12)] transition-[transform,box-shadow] duration-200 ease-out hover:-translate-y-0.5 hover:shadow-[0_8px_18px_rgba(51,64,128,0.16)] disabled:opacity-60 disabled:hover:translate-y-0 motion-reduce:transition-none";
const quietClass = "text-[13px] font-semibold text-[#5b6478]";

function gradeLabel(grade: string | null) {
  return grade ? `Grade ${grade}` : null;
}

function PersonFace({
  person,
  detail,
  showSchool,
}: {
  person: Classmate;
  detail?: string | null;
  showSchool?: boolean;
}) {
  const extra = [gradeLabel(person.grade), detail].filter(Boolean).join(" · ");
  return (
    <div className="flex min-w-0 items-center gap-3">
      <MemberAvatar initials={person.initials} color={person.color} size={40} imageUrl={person.avatarUrl} />
      <span className="min-w-0">
        <span className="block truncate text-[14px] font-medium text-[#14213d]">{person.name}</span>
        <span className="block truncate text-[12px] text-[#5b6478]">@{person.username}</span>
        {showSchool ? (
          <span className="block truncate text-[12px] text-[#5b6478]">
            {person.school?.trim() || "No school listed"}
          </span>
        ) : null}
        {!showSchool && extra ? (
          <span className="block truncate text-[12px] text-[#5b6478]">{extra}</span>
        ) : null}
      </span>
    </div>
  );
}

export function MembersSection() {
  const router = useRouter();
  const { courses } = useCoursework();
  const listId = useId();
  const [hub, setHub] = useState<MemberHub | null>(null);
  const [username, setUsernameDraft] = useState("");
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<{ query: string; people: MemberSearchHit[] }>({ query: "", people: [] });
  const [open, setOpen] = useState(false);
  const [searching, setSearching] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<{ kind: "send" | "approve" | "remove"; id: string } | null>(null);
  const searchSeq = useRef(0);

  async function reload() {
    const next = await getMemberHub();
    setHub(next);
    setUsernameDraft(next.username ?? "");
    return next;
  }

  useEffect(() => {
    let cancelled = false;
    getMemberHub()
      .then((next) => {
        if (cancelled) return;
        setHub(next);
        setUsernameDraft(next.username ?? "");
      })
      .catch(() => {
        if (!cancelled) setError("Couldn't load members. Try Refresh.");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) return;
    const seq = ++searchSeq.current;
    const timer = setTimeout(() => {
      setSearching(true);
      void searchMembers(q)
        .then((result) => {
          if (searchSeq.current !== seq) return;
          if (!result.ok) {
            setError(result.error);
            setHits({ query: q, people: [] });
            return;
          }
          setHits({ query: q, people: result.hits });
          setOpen(true);
        })
        .catch(() => {
          if (searchSeq.current === seq) setError("Couldn't search right now. Try again.");
        })
        .finally(() => {
          if (searchSeq.current === seq) setSearching(false);
        });
    }, 250);
    return () => clearTimeout(timer);
  }, [query]);

  async function run(id: string, action: () => Promise<{ ok: true } | { ok: false; error: string }>, success: string) {
    setBusy(id);
    setError(null);
    setMessage(null);
    try {
      const result = await action();
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setConfirm(null);
      setMessage(success);
      await reload();
      if (query.trim().length >= 2) {
        const again = await searchMembers(query);
        if (again.ok) setHits({ query: query.trim(), people: again.hits });
      }
      router.refresh();
    } catch {
      setError("Something went wrong. Try again.");
    } finally {
      setBusy(null);
    }
  }

  async function saveName(event: React.FormEvent) {
    event.preventDefault();
    const parsed = validateUsername(username);
    if ("error" in parsed) {
      setError(parsed.error);
      return;
    }
    await run("username", () => setUsername(parsed.value), `Your username is @${parsed.value}.`);
  }

  const incoming = hub?.links.filter((link) => link.status === "pending" && link.direction === "incoming") ?? [];
  const outgoing = hub?.links.filter((link) => link.status === "pending" && link.direction === "outgoing") ?? [];
  const connected = hub?.links.filter((link) => link.status === "accepted") ?? [];
  const trimmedQuery = query.trim();
  const resultsReady = hits.query === trimmedQuery;
  const visibleHits = resultsReady ? hits.people : [];
  const waiting = trimmedQuery.length >= 2 && (!resultsReady || searching);
  const showResults = open && trimmedQuery.length >= 2;

  return (
    <section id="members" className="scroll-mt-8 rounded-[24px] bg-white/55 px-6 py-5">
      <h2 className="text-[12px] font-semibold tracking-[0.08em] text-[#5b6478]">MEMBERS</h2>
      <p className="mt-2 text-[14px] leading-relaxed text-[#5b6478]">
        Add someone you know who also has a Pane account. Both of you have to approve before you show up in a class you share.
      </p>

      {error ? (
        <p role="alert" className="mt-3 text-[14px] font-medium text-[#e5484d]">
          {error}
        </p>
      ) : null}
      {message ? (
        <p role="status" className="mt-3 text-[14px] font-medium text-[#1b7f60]">
          {message}
        </p>
      ) : null}

      {hub && !hub.schemaReady ? <p className="mt-3 text-[14px] text-[#5b6478]">{MEMBERS_MIGRATION}</p> : null}

      {!hub ? (
        <div className="mt-4 space-y-2" aria-busy="true" aria-label="Loading members">
          <div className="h-10 animate-pulse rounded-full bg-white/70" />
          <div className="h-10 w-2/3 animate-pulse rounded-full bg-white/70" />
        </div>
      ) : null}

      {hub?.schemaReady ? (
        <div className="mt-4 space-y-5">
          {incoming.length > 0 ? (
            <div className="space-y-2">
              <h3 className="text-[12px] font-semibold tracking-[0.08em] text-[#5b6478]">WAITING FOR YOU</h3>
              {incoming.map((link) => (
                <VerifyCard
                  key={link.id}
                  link={link}
                  busy={busy === link.id}
                  confirming={confirm?.kind === "approve" && confirm.id === link.id}
                  onApprove={() => setConfirm({ kind: "approve", id: link.id })}
                  onDecline={() =>
                    void run(link.id, () => answerMemberRequest(link.id, false), `Declined @${link.person.username}.`)
                  }
                  onConfirm={() =>
                    void run(
                      link.id,
                      () => answerMemberRequest(link.id, true),
                      `You're connected with ${link.person.name}.`,
                    )
                  }
                  onCancelConfirm={() => setConfirm(null)}
                />
              ))}
            </div>
          ) : null}

          {outgoing.length > 0 ? (
            <div className="space-y-2">
              <h3 className="text-[12px] font-semibold tracking-[0.08em] text-[#5b6478]">WAITING FOR THEM</h3>
              {outgoing.map((link) => (
                <div key={link.id} className="flex items-center justify-between gap-3 rounded-[18px] bg-white/70 px-3 py-3">
                  <PersonFace person={link.person} detail="Needs their approval" />
                  <button
                    type="button"
                    className={quietClass}
                    disabled={busy === link.id}
                    onClick={() => void run(link.id, () => cancelMemberRequest(link.id), "Request canceled.")}
                  >
                    Cancel
                  </button>
                </div>
              ))}
            </div>
          ) : null}

          <form onSubmit={saveName} className="space-y-2">
            <label htmlFor="pane-username" className="text-[12px] font-semibold tracking-[0.08em] text-[#5b6478]">
              YOUR USERNAME
            </label>
            <div className="flex gap-2">
              <input
                id="pane-username"
                value={username}
                onChange={(event) => {
                  setUsernameDraft(event.target.value);
                  setError(null);
                }}
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                placeholder="maya"
                className={fieldClass}
              />
              <button type="submit" className={pillClass} disabled={busy === "username"}>
                Save
              </button>
            </div>
            <p className="text-[12px] text-[#5b6478]">
              {hub.username
                ? `Classmates search for @${hub.username}.`
                : "Pick a username so people you know can find you."}
            </p>
          </form>

          <div className="relative">
            <label htmlFor="member-search" className="text-[12px] font-semibold tracking-[0.08em] text-[#5b6478]">
              SEARCH USERNAMES
            </label>
            <input
              id="member-search"
              role="combobox"
              aria-expanded={showResults}
              aria-controls={listId}
              aria-autocomplete="list"
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setOpen(true);
                setError(null);
                setConfirm(null);
              }}
              onFocus={() => setOpen(true)}
              onKeyDown={(event) => {
                if (event.key === "Escape") setOpen(false);
              }}
              placeholder="Search a username"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              className={`${fieldClass} mt-2`}
            />
            {showResults ? (
              <ul
                id={listId}
                role="listbox"
                onMouseDown={(event) => event.preventDefault()}
                className="absolute z-20 mt-2 max-h-80 w-full overflow-auto rounded-[18px] border border-white/90 bg-white p-2 shadow-[0_16px_40px_rgba(51,64,128,0.18)]"
              >
                {waiting && visibleHits.length === 0 ? (
                  <li className="px-3 py-3 text-[14px] text-[#5b6478]">Searching…</li>
                ) : null}
                {!waiting && visibleHits.length === 0 ? (
                  <li className="px-3 py-3 text-[14px] text-[#5b6478]">No account uses that username.</li>
                ) : null}
                {visibleHits.map((hit) => (
                  <li key={hit.profileId} role="option" aria-selected={false} className="rounded-[14px] px-2 py-2">
                    <div className="flex items-center justify-between gap-3">
                      <PersonFace person={hit} showSchool />
                      <HitAction
                        hit={hit}
                        busy={busy === hit.profileId || busy === hit.connectionId}
                        confirming={confirm?.kind === "send" && confirm.id === hit.profileId}
                        onAdd={() => {
                          if (!hub.username) {
                            setError("Pick your username first, so they know it's you.");
                            return;
                          }
                          setConfirm({ kind: "send", id: hit.profileId });
                        }}
                        onApprove={() => hit.connectionId && setConfirm({ kind: "approve", id: hit.connectionId })}
                      />
                    </div>
                    {confirm?.kind === "send" && confirm.id === hit.profileId ? (
                      <ConfirmNote
                        text={`Send a request to ${hit.name} (@${hit.username})? They have to approve before you show up in each other's classes.`}
                        confirmLabel="Send request"
                        busy={busy === hit.profileId}
                        onConfirm={() =>
                          void run(
                            hit.profileId,
                            () => sendMemberRequest(hit.profileId),
                            `Request sent to @${hit.username}. They still have to approve.`,
                          )
                        }
                        onCancel={() => setConfirm(null)}
                      />
                    ) : null}
                    {confirm?.kind === "approve" && confirm.id === hit.connectionId ? (
                      <ConfirmNote
                        text={`Approve ${hit.name} (@${hit.username})? Only approve someone you know. You'll both show up in classes you share.`}
                        confirmLabel="Approve"
                        busy={busy === hit.connectionId}
                        onConfirm={() =>
                          hit.connectionId
                            ? void run(
                                hit.connectionId,
                                () => answerMemberRequest(hit.connectionId!, true),
                                `You're connected with ${hit.name}.`,
                              )
                            : undefined
                        }
                        onCancel={() => setConfirm(null)}
                      />
                    ) : null}
                  </li>
                ))}
              </ul>
            ) : null}
          </div>

          <div className="space-y-2">
            <h3 className="text-[12px] font-semibold tracking-[0.08em] text-[#5b6478]">CONNECTED</h3>
            {connected.length === 0 ? (
              <p className="text-[14px] text-[#5b6478]">No one is connected yet.</p>
            ) : (
              connected.map((link) => {
                const shared = sharedCourseNames(courses, link.person.courseNames);
                return (
                  <div key={link.id} className="rounded-[18px] bg-white/70 px-3 py-3">
                    <div className="flex items-center justify-between gap-3">
                      <PersonFace
                        person={link.person}
                        detail={shared.length ? shared.join(", ") : "No class in common yet"}
                      />
                      <button
                        type="button"
                        className="text-[13px] font-semibold text-[#e5484d]"
                        onClick={() => setConfirm({ kind: "remove", id: link.id })}
                      >
                        Remove
                      </button>
                    </div>
                    {confirm?.kind === "remove" && confirm.id === link.id ? (
                      <ConfirmNote
                        text={`Remove ${link.person.name}? You won't show up in each other's classes anymore.`}
                        confirmLabel="Remove"
                        busy={busy === link.id}
                        onConfirm={() =>
                          void run(link.id, () => removeMember(link.id), `Removed @${link.person.username}.`)
                        }
                        onCancel={() => setConfirm(null)}
                      />
                    ) : null}
                  </div>
                );
              })
            )}
          </div>
        </div>
      ) : null}
    </section>
  );
}

function HitAction({
  hit,
  busy,
  confirming,
  onAdd,
  onApprove,
}: {
  hit: MemberSearchHit;
  busy: boolean;
  confirming: boolean;
  onAdd: () => void;
  onApprove: () => void;
}) {
  if (hit.relation === "accepted") return <span className={quietClass}>Connected</span>;
  if (hit.relation === "pending_out") return <span className={quietClass}>Requested</span>;
  if (hit.relation === "pending_in") {
    return (
      <button type="button" className={pillClass} disabled={busy || confirming} onClick={onApprove}>
        Approve
      </button>
    );
  }
  return (
    <button type="button" className={pillClass} disabled={busy || confirming} onClick={onAdd}>
      Add
    </button>
  );
}

function VerifyCard({
  link,
  busy,
  confirming,
  onApprove,
  onDecline,
  onConfirm,
  onCancelConfirm,
}: {
  link: MemberLink;
  busy: boolean;
  confirming: boolean;
  onApprove: () => void;
  onDecline: () => void;
  onConfirm: () => void;
  onCancelConfirm: () => void;
}) {
  return (
    <div className="rounded-[18px] bg-white/80 px-3 py-3">
      <PersonFace person={link.person} />
      <p className="mt-2 text-[13px] leading-relaxed text-[#5b6478]">
        {link.person.name} wants to connect. Approve only if you know them. You will both show up in classes you share.
      </p>
      {confirming ? (
        <ConfirmNote
          text={`Approve ${link.person.name} (@${link.person.username})?`}
          confirmLabel="Approve connection"
          busy={busy}
          onConfirm={onConfirm}
          onCancel={onCancelConfirm}
        />
      ) : (
        <div className="mt-3 flex items-center gap-3">
          <button type="button" className={pillClass} disabled={busy} onClick={onApprove}>
            Approve
          </button>
          <button type="button" className={quietClass} disabled={busy} onClick={onDecline}>
            Decline
          </button>
        </div>
      )}
    </div>
  );
}

function ConfirmNote({
  text,
  confirmLabel,
  busy,
  onConfirm,
  onCancel,
}: {
  text: string;
  confirmLabel: string;
  busy: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="mt-3 rounded-[14px] bg-[#eef3ff] px-3 py-3">
      <p className="text-[13px] leading-relaxed text-[#14213d]">{text}</p>
      <div className="mt-3 flex items-center gap-3">
        <button type="button" className={pillClass} disabled={busy} onClick={onConfirm}>
          {busy ? "Saving…" : confirmLabel}
        </button>
        <button type="button" className={quietClass} disabled={busy} onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
  );
}
