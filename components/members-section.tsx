"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  listSharedClasses,
  removeConnection,
  requestConnection,
  respondToConnection,
  searchUsernames,
  setMyClasses,
  setUsername,
  type UsernameMatch,
} from "@/app/(app)/member-actions";
import { useCoursework } from "@/lib/coursework";
import type { PersonConnection, SharedClass } from "@/lib/types";

const fieldClass =
  "h-11 w-full rounded-full border border-white/90 bg-white/85 px-4 text-[16px] text-[#14213d] outline-none focus:border-[#4f7cff] focus:ring-4 focus:ring-[#4f7cff]/15";

export function MembersSection() {
  const { username, connections, membersNotice } = useCoursework();
  const router = useRouter();
  const [name, setName] = useState("");
  const [query, setQuery] = useState("");
  const [matches, setMatches] = useState<UsernameMatch[] | null>(null);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [picking, setPicking] = useState<string | null>(null);
  const [shared, setShared] = useState<SharedClass[]>([]);
  const [checked, setChecked] = useState<string[]>([]);
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

  async function startAdd(profileId: string) {
    setPicking(profileId);
    setChecked([]);
    setShared([]);
    setError(null);
    const result = await listSharedClasses(profileId).catch(() => ({
      ok: false as const,
      error: "Couldn't load your shared classes.",
    }));
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setShared(result.classes);
  }

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
        Search a username and check the classes you both have. They do the same when they approve.
        You show up on a class only when both of you checked it.
      </p>

      {membersNotice ? (
        <p role="alert" className="mt-3 text-[14px] font-semibold text-[#e5484d]">
          {membersNotice}
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
              <ul className="absolute z-20 mt-2 max-h-80 w-full overflow-y-auto rounded-2xl border border-white/90 bg-white/95 py-1 text-left shadow-[0_12px_32px_rgba(51,64,128,0.16)]">
                {matches.length === 0 ? (
                  <li className="px-4 py-3 text-[14px] text-[#5b6478]">No account uses that username.</li>
                ) : (
                  matches.map((person) => (
                    <li key={person.profileId} className="px-3 py-2">
                      <div className="flex items-center gap-3">
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[14px] font-semibold text-[#14213d]">
                            {person.name}
                          </span>
                          <span className="block truncate text-[12px] text-[#5b6478]">@{person.username}</span>
                        </span>
                        <MatchAction
                          person={person}
                          disabled={pending}
                          picking={picking === person.profileId}
                          onAdd={() => void startAdd(person.profileId)}
                        />
                      </div>
                      {picking === person.profileId ? (
                        <div className="mt-2">
                          <ClassChecks
                            classes={shared}
                            checked={checked}
                            disabled={pending}
                            onToggle={(key) =>
                              setChecked((current) =>
                                current.includes(key) ? current.filter((item) => item !== key) : [...current, key],
                              )
                            }
                          />
                          <button
                            type="button"
                            disabled={pending}
                            data-m="tap"
                            onClick={() => void run(() => requestConnection(person.profileId, checked))}
                            className="mt-2 h-9 rounded-full bg-[#14213d] px-3 text-[13px] font-semibold text-white disabled:opacity-60"
                          >
                            Send request
                          </button>
                        </div>
                      ) : null}
                    </li>
                  ))
                )}
              </ul>
            ) : null}
          </div>

          {incoming.length > 0 ? (
            <ul className="mt-4 space-y-2">
              {incoming.map((person) => (
                <ConnectionRow
                  key={`${person.id}:${person.myClasses.join(",")}`}
                  person={person}
                  note="Wants to connect"
                  disabled={pending}
                  onApprove={(keys) => void run(() => respondToConnection(person.id, true, keys))}
                  onSecondary={() => void run(() => respondToConnection(person.id, false))}
                  secondaryLabel="Decline"
                />
              ))}
            </ul>
          ) : null}

          {outgoing.length > 0 ? (
            <ul className="mt-3 space-y-2">
              {outgoing.map((person) => (
                <ConnectionRow
                  key={`${person.id}:${person.myClasses.join(",")}`}
                  person={person}
                  note="Waiting for them to approve"
                  disabled={pending}
                  onChange={(keys) => void run(() => setMyClasses(person.id, keys))}
                  onSecondary={() => void run(() => removeConnection(person.id))}
                  secondaryLabel="Cancel"
                />
              ))}
            </ul>
          ) : null}

          {accepted.length > 0 ? (
            <ul className="mt-3 space-y-2">
              {accepted.map((person) => (
                <ConnectionRow
                  key={`${person.id}:${person.myClasses.join(",")}`}
                  person={person}
                  note="Connected"
                  disabled={pending}
                  onChange={(keys) => void run(() => setMyClasses(person.id, keys))}
                  onSecondary={() => void run(() => removeConnection(person.id))}
                  secondaryLabel="Remove"
                />
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
  picking,
  onAdd,
}: {
  person: UsernameMatch;
  disabled: boolean;
  picking: boolean;
  onAdd: () => void;
}) {
  if (person.status === "accepted") {
    return <span className="text-[12px] font-semibold text-[#1b7f60]">Connected</span>;
  }
  if (person.status === "outgoing") {
    return <span className="text-[12px] font-semibold text-[#5b6478]">Requested</span>;
  }
  if (person.status === "incoming") {
    return <span className="text-[12px] font-semibold text-[#5b6478]">Answer below</span>;
  }
  if (picking) return null;
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

function ClassChecks({
  classes,
  checked,
  disabled,
  onToggle,
}: {
  classes: SharedClass[];
  checked: string[];
  disabled: boolean;
  onToggle: (key: string) => void;
}) {
  if (classes.length === 0) {
    return <p className="text-[12px] text-[#5b6478]">You don&apos;t share a class yet.</p>;
  }
  return (
    <ul className="space-y-1">
      {classes.map((item) => (
        <li key={item.key}>
          <label data-m="tap" className="flex items-center gap-2 text-[14px] font-medium text-[#14213d]">
            <input
              type="checkbox"
              className="size-4 accent-[#4f7cff]"
              checked={checked.includes(item.key)}
              disabled={disabled}
              onChange={() => onToggle(item.key)}
            />
            {item.name}
          </label>
        </li>
      ))}
    </ul>
  );
}

function ConnectionRow({
  person,
  note,
  disabled,
  onChange,
  onApprove,
  onSecondary,
  secondaryLabel,
}: {
  person: PersonConnection;
  note: string;
  disabled: boolean;
  onChange?: (keys: string[]) => void;
  onApprove?: (keys: string[]) => void;
  onSecondary: () => void;
  secondaryLabel: string;
}) {
  const [checked, setChecked] = useState(person.myClasses);
  const theirs = person.sharedClasses
    .filter((item) => person.theirClasses.includes(item.key))
    .map((item) => item.name);

  function toggle(key: string) {
    const next = checked.includes(key) ? checked.filter((item) => item !== key) : [...checked, key];
    setChecked(next);
    onChange?.(next);
  }

  return (
    <li className="rounded-2xl bg-white/70 px-3 py-2.5">
      <div className="flex flex-wrap items-center gap-2">
        <PersonText name={person.name} username={person.username} note={note} />
        {onApprove ? (
          <button
            type="button"
            disabled={disabled}
            data-m="tap"
            onClick={() => onApprove(checked)}
            className="h-9 rounded-full bg-[#14213d] px-3 text-[13px] font-semibold text-white disabled:opacity-60"
          >
            Approve
          </button>
        ) : null}
        <button
          type="button"
          disabled={disabled}
          data-m="tap"
          onClick={onSecondary}
          className="h-9 rounded-full px-3 text-[13px] font-semibold text-[#5b6478] disabled:opacity-60"
        >
          {secondaryLabel}
        </button>
      </div>
      <div className="mt-2">
        <ClassChecks classes={person.sharedClasses} checked={checked} disabled={disabled} onToggle={toggle} />
        <p className="mt-1 text-[12px] text-[#5b6478]">
          {theirs.length ? `They checked ${theirs.join(", ")}.` : "They haven't checked a class."}
        </p>
      </div>
    </li>
  );
}
