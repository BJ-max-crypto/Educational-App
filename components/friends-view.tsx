"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  joinSchoolClass,
  removeConnection,
  requestConnection,
  schoolSuggestions,
  searchUsernames,
  setSharedClasses,
  setUsername,
  type UsernameMatch,
} from "@/app/(app)/member-actions";
import { GlassCard } from "@/components/glass-card";
import { MemberAvatar } from "@/components/member-avatar";
import { COURSE_COLORS } from "@/lib/course-colors";
import { initials } from "@/lib/dates";
import { useCoursework } from "@/lib/coursework";
import type { PersonConnection, Schoolmate, SharedClass } from "@/lib/types";

function memberColor(id: string) {
  let hash = 0;
  for (const char of id) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return COURSE_COLORS[hash % COURSE_COLORS.length];
}

const fieldClass =
  "h-11 w-full rounded-full border border-white/90 bg-white/85 px-4 text-[16px] text-[#14213d] outline-none focus:border-[#4f7cff] focus:ring-4 focus:ring-[#4f7cff]/15";

type CardPerson = {
  profileId: string;
  name: string;
  username: string;
  school: string | null;
  schoolLocation: string | null;
  grade: string | null;
  classes: string[];
  status: UsernameMatch["status"];
  connectionId: string | null;
};

export function FriendsView() {
  const { username, connections, membersNotice, courses, user } = useCoursework();
  const router = useRouter();
  const [name, setName] = useState("");
  const [query, setQuery] = useState("");
  const [matches, setMatches] = useState<UsernameMatch[] | null>(null);
  const [schoolmates, setSchoolmates] = useState<Schoolmate[] | null>(null);
  const [schoolNotice, setSchoolNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [open, setOpen] = useState<PersonConnection | null>(null);

  const mine = new Set(courses.filter((course) => !course.isUnsorted).map((course) => course.name.toLowerCase()));
  const friends = connections.filter((person) => person.status === "accepted");

  useEffect(() => {
    let current = true;
    void schoolSuggestions().then((result) => {
      if (!current) return;
      if (!result.ok) {
        setSchoolNotice(result.error);
        setSchoolmates([]);
        return;
      }
      setSchoolNotice(result.notice);
      setSchoolmates(result.people);
    });
    return () => {
      current = false;
    };
  }, [connections.length, courses.length]);

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
      return false;
    }
    router.refresh();
    return true;
  }

  function openFriend(profileId: string) {
    const person = connections.find((item) => item.profileId === profileId && item.status === "accepted");
    if (person) setOpen(person);
  }

  return (
    <div className="mx-auto w-full max-w-[760px]">
      <Link href="/profile" data-m="hit" className="text-[14px] font-medium text-[#5b6478]">
        ‹ Profile
      </Link>
      <h1 className="mt-2 text-[30px] font-semibold tracking-[-0.03em] text-[#14213d]">Add Friends</h1>
      <p className="mt-1 text-[14px] text-[#5b6478]">
        Search a username. People at {user.school || "your school"} show up here too, with the classes they created.
      </p>

      {membersNotice ? (
        <p role="alert" className="mt-4 text-[14px] font-semibold text-[#e5484d]">
          {membersNotice}
        </p>
      ) : (
        <>
          <GlassCard className="mt-5 p-5 sm:p-6">
            <form
              className="flex flex-wrap items-center gap-2"
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
            <label className="mt-3 block">
              <span className="sr-only">Search people</span>
              <input
                value={query}
                onChange={(event) => {
                  const next = event.target.value;
                  setQuery(next);
                  if (next.trim().replace(/^@/, "").length < 2) setMatches(null);
                }}
                placeholder="Search usernames"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                className={fieldClass}
              />
            </label>
            {matches ? (
              <div className="mt-4 space-y-3">
                {matches.length === 0 ? (
                  <p className="text-[14px] text-[#5b6478]">No account uses that username.</p>
                ) : (
                  matches.map((person) => (
                    <ProfileCard
                      key={person.profileId}
                      person={person}
                      mine={mine}
                      disabled={pending}
                      onOpen={() => openFriend(person.profileId)}
                      onAdd={() => void run(() => requestConnection(person.profileId))}
                      onJoin={(className) => void run(() => joinSchoolClass(className))}
                    />
                  ))
                )}
              </div>
            ) : null}
          </GlassCard>

          <section className="mt-6">
            <h2 className="text-[12px] font-semibold tracking-[0.08em] text-[#5b6478]">YOUR FRIENDS</h2>
            {friends.length === 0 ? (
              <p className="mt-2 text-[14px] text-[#5b6478]">Friends you add show up here. Click a profile to open it.</p>
            ) : (
              <div className="mt-3 space-y-3">
                {friends.map((person) => (
                  <ProfileCard
                    key={person.id}
                    person={{
                      profileId: person.profileId,
                      name: person.name,
                      username: person.username,
                      school: person.school,
                      schoolLocation: person.schoolLocation,
                      grade: person.grade,
                      classes: person.theirCourses,
                      status: "accepted",
                      connectionId: person.id,
                    }}
                    mine={mine}
                    disabled={pending}
                    onOpen={() => setOpen(person)}
                    onAdd={() => undefined}
                    onJoin={(className) => void run(() => joinSchoolClass(className))}
                  />
                ))}
              </div>
            )}
          </section>

          <section className="mt-6">
            <h2 className="text-[12px] font-semibold tracking-[0.08em] text-[#5b6478]">AT YOUR SCHOOL</h2>
            {schoolNotice ? (
              <p className="mt-2 text-[14px] text-[#5b6478]">{schoolNotice}</p>
            ) : !user.school || !user.schoolLocation ? (
              <p className="mt-2 text-[14px] text-[#5b6478]">
                Add your school and its location on your profile to see people there.
              </p>
            ) : schoolmates && schoolmates.length === 0 ? (
              <p className="mt-2 text-[14px] text-[#5b6478]">Nobody else from your school is here yet.</p>
            ) : (
              <div className="mt-3 space-y-3">
                {(schoolmates ?? []).map((person) => {
                  const link = connections.find((item) => item.profileId === person.profileId);
                  const card: CardPerson = {
                    ...person,
                    status: link?.status ?? "none",
                    connectionId: link?.id ?? null,
                  };
                  return (
                    <ProfileCard
                      key={person.profileId}
                      person={card}
                      mine={mine}
                      disabled={pending}
                      onOpen={() => openFriend(person.profileId)}
                      onAdd={() => void run(() => requestConnection(person.profileId))}
                      onJoin={(className) => void run(() => joinSchoolClass(className))}
                    />
                  );
                })}
              </div>
            )}
          </section>
        </>
      )}

      {error ? (
        <p role="alert" className="mt-3 text-[13px] font-semibold text-[#e5484d]">
          {error}
        </p>
      ) : null}

      {open ? (
        <FriendDialog
          person={open}
          mine={mine}
          disabled={pending}
          onClose={() => setOpen(null)}
          onShare={(keys) => void run(() => setSharedClasses(open.id, keys))}
          onRemove={() =>
            void run(() => removeConnection(open.id)).then((ok) => {
              if (ok) setOpen(null);
            })
          }
          onJoin={(className) => void run(() => joinSchoolClass(className))}
        />
      ) : null}
    </div>
  );
}

function ProfileCard({
  person,
  mine,
  disabled,
  onOpen,
  onAdd,
  onJoin,
}: {
  person: CardPerson;
  mine: Set<string>;
  disabled: boolean;
  onOpen: () => void;
  onAdd: () => void;
  onJoin: (className: string) => void;
}) {
  const friend = person.status === "accepted";
  return (
    <GlassCard className="p-4 sm:p-5">
      <div className="flex items-start gap-3">
        <button type="button" onClick={friend ? onOpen : undefined} className="flex min-w-0 flex-1 items-start gap-3 text-left">
          <MemberAvatar initials={initials(person.name)} color={memberColor(person.profileId)} size={52} />
          <span className="min-w-0">
            <span className="block truncate text-[16px] font-semibold text-[#14213d]">{person.name}</span>
            <span className="block truncate text-[13px] text-[#5b6478]">@{person.username}</span>
            <span className="mt-1 block text-[13px] text-[#5b6478]">
              {[person.grade ? `Grade ${person.grade}` : null, person.school, person.schoolLocation]
                .filter(Boolean)
                .join(" · ") || "No school on their profile"}
            </span>
          </span>
        </button>
        <CardAction person={person} disabled={disabled} onAdd={onAdd} onOpen={onOpen} />
      </div>
      {person.classes.length > 0 ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {person.classes.map((className) => {
            const joined = mine.has(className.toLowerCase());
            return (
              <span
                key={className}
                className="inline-flex items-center gap-2 rounded-full bg-white/80 px-3 py-1.5 text-[13px] font-medium text-[#14213d]"
              >
                {className}
                {joined ? (
                  <span className="text-[12px] font-semibold text-[#1b7f60]">Joined</span>
                ) : (
                  <button
                    type="button"
                    disabled={disabled}
                    onClick={() => onJoin(className)}
                    className="text-[12px] font-semibold text-[#4f7cff] disabled:opacity-60"
                  >
                    Add class
                  </button>
                )}
              </span>
            );
          })}
        </div>
      ) : null}
      {friend ? (
        <button type="button" onClick={onOpen} className="mt-3 text-[13px] font-semibold text-[#4f7cff]">
          Open profile
        </button>
      ) : null}
    </GlassCard>
  );
}

function CardAction({
  person,
  disabled,
  onAdd,
  onOpen,
}: {
  person: CardPerson;
  disabled: boolean;
  onAdd: () => void;
  onOpen: () => void;
}) {
  if (person.status === "accepted") {
    return (
      <button type="button" onClick={onOpen} className="text-[12px] font-semibold text-[#1b7f60]">
        Connected
      </button>
    );
  }
  if (person.status === "outgoing") return <span className="text-[12px] font-semibold text-[#5b6478]">Requested</span>;
  if (person.status === "incoming") return <span className="text-[12px] font-semibold text-[#5b6478]">Answer in notifications</span>;
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

function FriendDialog({
  person,
  mine,
  disabled,
  onClose,
  onShare,
  onRemove,
  onJoin,
}: {
  person: PersonConnection;
  mine: Set<string>;
  disabled: boolean;
  onClose: () => void;
  onShare: (keys: string[]) => void;
  onRemove: () => void;
  onJoin: (className: string) => void;
}) {
  const [checked, setChecked] = useState(person.myClasses);
  const [expanded, setExpanded] = useState(false);

  function toggle(key: string) {
    const next = checked.includes(key) ? checked.filter((item) => item !== key) : [...checked, key];
    setChecked(next);
    onShare(next);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center overflow-y-auto bg-[#14213d]/35 p-4 sm:items-center">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="friend-title"
        className="w-full max-w-md rounded-[28px] border border-white/90 bg-white/95 p-6 shadow-[0_12px_32px_rgba(51,64,128,0.16)] backdrop-blur-[14px]"
      >
        <div className="flex items-start gap-3">
          <MemberAvatar initials={initials(person.name)} color={memberColor(person.profileId)} size={64} />
          <div className="min-w-0 flex-1">
            <h2 id="friend-title" className="truncate text-[20px] font-semibold text-[#14213d]">
              {person.name}
            </h2>
            <p className="text-[14px] text-[#5b6478]">@{person.username}</p>
            <p className="mt-1 text-[14px] text-[#5b6478]">
              {[person.grade ? `Grade ${person.grade}` : null, person.school, person.schoolLocation]
                .filter(Boolean)
                .join(" · ") || "No school on their profile"}
            </p>
          </div>
        </div>
        {person.theirCourses.length > 0 ? (
          <div className="mt-4 flex flex-wrap gap-2">
            {person.theirCourses.map((className) => (
              <span key={className} className="inline-flex items-center gap-2 rounded-full bg-[#eef3fb] px-3 py-1.5 text-[13px] font-medium text-[#14213d]">
                {className}
                {mine.has(className.toLowerCase()) ? null : (
                  <button type="button" disabled={disabled} onClick={() => onJoin(className)} className="font-semibold text-[#4f7cff]">
                    Add class
                  </button>
                )}
              </span>
            ))}
          </div>
        ) : null}
        <button
          type="button"
          aria-expanded={expanded}
          onClick={() => setExpanded((value) => !value)}
          className="mt-4 text-[14px] font-semibold text-[#14213d]"
        >
          {expanded ? "Hide" : "Show"} classes you share
        </button>
        {expanded ? (
          <div className="mt-2">
            <ClassChecks classes={person.sharedClasses} checked={checked} disabled={disabled} onToggle={toggle} />
            {person.sharedClasses.length > 0 ? (
              <p className="mt-1 text-[12px] text-[#5b6478]">
                Checking a class adds them to it, even if they hadn&apos;t added that class.
              </p>
            ) : null}
          </div>
        ) : null}
        <div className="mt-5 flex items-center justify-between">
          <button type="button" disabled={disabled} onClick={onRemove} className="text-[14px] font-semibold text-[#e5484d]">
            Remove
          </button>
          <button
            type="button"
            onClick={onClose}
            data-m="tap"
            className="rounded-full bg-[#14213d] px-5 py-2.5 text-[14px] font-semibold text-white"
          >
            Close
          </button>
        </div>
      </div>
    </div>
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
    return <p className="text-[12px] text-[#5b6478]">You don&apos;t have a class to share yet.</p>;
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
