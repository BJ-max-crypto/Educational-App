"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  removeConnection,
  requestConnection,
  respondToConnection,
  searchUsernames,
  setUsername,
  type UsernameMatch,
} from "@/app/(app)/member-actions";
import { useCoursework } from "@/lib/coursework";

const fieldClass =
  "h-11 w-full rounded-full border border-white/90 bg-white/85 px-4 text-[16px] text-[#14213d] outline-none focus:border-[#4f7cff] focus:ring-4 focus:ring-[#4f7cff]/15";

export function MembersSection() {
  const { username, connections, membersUnavailable } = useCoursework();
  const router = useRouter();
  const [name, setName] = useState("");
  const [query, setQuery] = useState("");
  const [matches, setMatches] = useState<UsernameMatch[] | null>(null);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onPointer(event: MouseEvent) {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
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

  useEffect(() => {
    const text = query.trim().replace(/^@/, "");
    if (text.length < 2 || !/^[a-z0-9_]+$/i.test(text)) return;
    let current = true;
    const timer = window.setTimeout(() => {
      void searchUsernames(text).then((result) => {
        if (!current) return;
        if (!result.ok) {
          setError(result.error);
          setMatches([]);
          return;
        }
        setError(null);
        setMatches(result.matches);
        setOpen(true);
      });
    }, 250);
    return () => {
      current = false;
      window.clearTimeout(timer);
    };
  }, [query]);

  async function run(action: () => Promise<{ ok: boolean; error?: string }>) {
    setPending(true);
    setError(null);
    const result = await action().catch(() => ({ ok: false as const, error: "Something went wrong. Try again." }));
    setPending(false);
    if (!result.ok) {
      setError(result.error ?? "Something went wrong. Try again.");
      return;
    }
    setOpen(false);
    router.refresh();
  }

  const incoming = connections.filter((item) => item.status === "incoming");
  const outgoing = connections.filter((item) => item.status === "outgoing");
  const accepted = connections.filter((item) => item.status === "accepted");

  return (
    <section id="members" className="scroll-mt-28 rounded-[24px] bg-white/55 px-6 py-5">
      <h2 className="text-[12px] font-semibold tracking-[0.08em] text-[#5b6478]">MEMBERS</h2>
      <p className="mt-2 text-[14px] text-[#5b6478]">
        Search a username. They approve the request on their profile before you&apos;re connected.
        Once you both have the same course, they show up on that class.
      </p>

      {membersUnavailable ? (
        <p role="alert" className="mt-3 text-[14px] font-semibold text-[#e5484d]">
          Adding people needs a database update (supabase/migrations/0005_members.sql).
        </p>
      ) : (
        <>
          <form
            className="mt-4 flex flex-wrap items-center gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              void run(() => setUsername(name || username || ""));
            }}
          >
            <label className="min-w-0 flex-1">
              <span className="sr-only">Your username</span>
              <input
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder={username ? `@${username}` : "Pick a username"}
                maxLength={20}
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                className={fieldClass}
              />
            </label>
            <button
              type="submit"
              disabled={pending}
              data-m="tap"
              className="h-11 rounded-full bg-[#14213d] px-4 text-[14px] font-semibold text-white disabled:opacity-60"
            >
              {username ? "Change" : "Save"}
            </button>
          </form>

          <div ref={root} className="relative mt-3">
            <label className="block">
              <span className="sr-only">Search usernames</span>
              <input
                value={query}
                onChange={(event) => {
                  const next = event.target.value;
                  setQuery(next);
                  if (next.trim().replace(/^@/, "").length < 2) {
                    setMatches(null);
                    setOpen(false);
                  } else {
                    setOpen(true);
                  }
                }}
                onFocus={() => matches && setOpen(true)}
                placeholder="Search usernames"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                className={fieldClass}
              />
            </label>
            {open && matches ? (
              <ul className="absolute z-20 mt-2 max-h-64 w-full overflow-y-auto rounded-2xl border border-white/90 bg-white/95 py-1 text-left shadow-[0_12px_32px_rgba(51,64,128,0.16)]">
                {matches.length === 0 ? (
                  <li className="px-4 py-3 text-[14px] text-[#5b6478]">No account uses that username.</li>
                ) : (
                  matches.map((person) => (
                    <li key={person.profileId} className="flex items-center gap-3 px-3 py-2">
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[14px] font-semibold text-[#14213d]">
                          {person.name}
                        </span>
                        <span className="block truncate text-[12px] text-[#5b6478]">@{person.username}</span>
                      </span>
                      <MatchAction
                        person={person}
                        disabled={pending}
                        onAdd={() => void run(() => requestConnection(person.profileId))}
                        onApprove={() =>
                          person.connectionId
                            ? void run(() => respondToConnection(person.connectionId!, true))
                            : undefined
                        }
                      />
                    </li>
                  ))
                )}
              </ul>
            ) : null}
          </div>

          {incoming.length > 0 ? (
            <ul className="mt-4 space-y-2">
              {incoming.map((person) => (
                <li key={person.id} className="flex flex-wrap items-center gap-2 rounded-2xl bg-white/70 px-3 py-2.5">
                  <PersonText name={person.name} username={person.username} note="Wants to connect" />
                  <button
                    type="button"
                    disabled={pending}
                    data-m="tap"
                    onClick={() => void run(() => respondToConnection(person.id, true))}
                    className="h-9 rounded-full bg-[#14213d] px-3 text-[13px] font-semibold text-white disabled:opacity-60"
                  >
                    Approve
                  </button>
                  <button
                    type="button"
                    disabled={pending}
                    data-m="tap"
                    onClick={() => void run(() => respondToConnection(person.id, false))}
                    className="h-9 rounded-full px-3 text-[13px] font-semibold text-[#5b6478] disabled:opacity-60"
                  >
                    Decline
                  </button>
                </li>
              ))}
            </ul>
          ) : null}

          {outgoing.length > 0 ? (
            <ul className="mt-3 space-y-2">
              {outgoing.map((person) => (
                <li key={person.id} className="flex flex-wrap items-center gap-2 rounded-2xl bg-white/70 px-3 py-2.5">
                  <PersonText name={person.name} username={person.username} note="Waiting for them to approve" />
                  <button
                    type="button"
                    disabled={pending}
                    data-m="tap"
                    onClick={() => void run(() => removeConnection(person.id))}
                    className="h-9 rounded-full px-3 text-[13px] font-semibold text-[#5b6478] disabled:opacity-60"
                  >
                    Cancel
                  </button>
                </li>
              ))}
            </ul>
          ) : null}

          {accepted.length > 0 ? (
            <ul className="mt-3 space-y-2">
              {accepted.map((person) => (
                <li key={person.id} className="flex flex-wrap items-center gap-2 rounded-2xl bg-white/70 px-3 py-2.5">
                  <PersonText name={person.name} username={person.username} note="Connected" />
                  <button
                    type="button"
                    disabled={pending}
                    data-m="tap"
                    onClick={() => void run(() => removeConnection(person.id))}
                    className="h-9 rounded-full px-3 text-[13px] font-semibold text-[#5b6478] disabled:opacity-60"
                  >
                    Remove
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </>
      )}

      {error ? (
        <p role="alert" className="mt-3 text-[13px] font-semibold text-[#e5484d]">
          {error}
        </p>
      ) : null}
    </section>
  );
}

function PersonText({ name, username, note }: { name: string; username: string; note: string }) {
  return (
    <span className="min-w-0 flex-1">
      <span className="block truncate text-[14px] font-semibold text-[#14213d]">
        {name} <span className="font-medium text-[#5b6478]">@{username}</span>
      </span>
      <span className="block text-[12px] text-[#5b6478]">{note}</span>
    </span>
  );
}

function MatchAction({
  person,
  disabled,
  onAdd,
  onApprove,
}: {
  person: UsernameMatch;
  disabled: boolean;
  onAdd: () => void;
  onApprove: () => void;
}) {
  if (person.status === "accepted") {
    return <span className="text-[12px] font-semibold text-[#1b7f60]">Connected</span>;
  }
  if (person.status === "outgoing") {
    return <span className="text-[12px] font-semibold text-[#5b6478]">Requested</span>;
  }
  if (person.status === "incoming") {
    return (
      <button
        type="button"
        disabled={disabled}
        onClick={onApprove}
        data-m="tap"
        className="h-9 rounded-full bg-[#14213d] px-3 text-[13px] font-semibold text-white disabled:opacity-60"
      >
        Approve
      </button>
    );
  }
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onAdd}
      data-m="tap"
      className="h-9 rounded-full bg-[#14213d] px-3 text-[13px] font-semibold text-white disabled:opacity-60"
    >
      Add
    </button>
  );
}
