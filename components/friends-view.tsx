"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  joinSchoolClass,
  removeConnection,
  requestConnection,
  schoolPresence,
  searchUsernames,
  setUsername,
  type UsernameMatch,
} from "@/app/(app)/member-actions";
import { GlassCard } from "@/components/glass-card";
import { MemberAvatar } from "@/components/member-avatar";
import { COURSE_COLORS } from "@/lib/course-colors";
import { initials } from "@/lib/dates";
import { connectionLabel, publicLabel } from "@/lib/identity";
import { useCoursework } from "@/lib/coursework";
import type { MutualContact, PersonConnection } from "@/lib/types";
import { SchoolInvite } from "@/components/school-invite";

function memberColor(id: string) {
  let hash = 0;
  for (const char of id) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return COURSE_COLORS[hash % COURSE_COLORS.length];
}

const fieldClass =
  "h-11 w-full rounded-full border border-white/90 bg-white/85 px-4 text-[16px] text-[#14213d] outline-none focus:border-[#4f7cff] focus:ring-4 focus:ring-[#4f7cff]/15";

type CardPerson = {
  profileId: string;
  name: string | null;
  username: string;
  school: string | null;
  schoolLocation: string | null;
  grade: string | null;
  classes: string[];
  status: UsernameMatch["status"];
  connectionId: string | null;
  connectionCount: number;
};

export function FriendsView() {
  const { username, connections, mutuals, membersNotice, courses, user } = useCoursework();
  const router = useRouter();
  const [name, setName] = useState("");
  const [query, setQuery] = useState("");
  const [matches, setMatches] = useState<UsernameMatch[] | null>(null);
  const [schoolCount, setSchoolCount] = useState<number | null>(null);
  const [schoolNotice, setSchoolNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [open, setOpen] = useState<PersonConnection | null>(null);

  const mine = new Set(courses.filter((course) => !course.isUnsorted).map((course) => course.name.toLowerCase()));
  const friends = connections.filter((person) => person.status === "accepted");

  useEffect(() => {
    let current = true;
    void schoolPresence().then((result) => {
      if (!current) return;
      if (!result.ok) {
        setSchoolNotice(result.error);
        setSchoolCount(null);
        return;
      }
      setSchoolNotice(result.notice);
      setSchoolCount(result.count);
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
        Search a username, or share your invite with someone at {user.school || "your school"}. Names stay hidden until you both approve.
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
                      connectionCount: person.connectionCount,
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

          {mutuals.length > 0 ? (
            <section className="mt-6">
              <h2 className="text-[12px] font-semibold tracking-[0.08em] text-[#5b6478]">CONNECTIONS</h2>
              <div className="mt-3 space-y-3">
                {mutuals.map((person) => (
                  <ProfileCard
                    key={person.profileId}
                    person={cardFromMutual(person)}
                    mine={mine}
                    disabled={pending}
                    onOpen={() => undefined}
                    onAdd={() => void run(() => requestConnection(person.profileId))}
                    onJoin={() => undefined}
                  />
                ))}
              </div>
            </section>
          ) : null}

          <section className="mt-6">
            <h2 className="text-[12px] font-semibold tracking-[0.08em] text-[#5b6478]">AT YOUR SCHOOL</h2>
            {schoolNotice ? (
              <p className="mt-2 text-[14px] text-[#5b6478]">{schoolNotice}</p>
            ) : !user.school ? (
              <p className="mt-2 text-[14px] text-[#5b6478]">Add your school on your profile, then share your invite.</p>
            ) : (
              <p className="mt-2 text-[14px] text-[#5b6478]">
                {schoolCount != null
                  ? `${schoolCount} other Pane ${schoolCount === 1 ? "user" : "users"} at ${user.school}. `
                  : null}
                Share your invite with a classmate. Pane never lists names from your school.
              </p>
            )}
            <div className="mt-3">
              <SchoolInvite />
            </div>
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

function cardFromMutual(person: MutualContact): CardPerson {
  return {
    profileId: person.profileId,
    name: null,
    username: person.username,
    school: person.school,
    schoolLocation: person.schoolLocation,
    grade: person.grade,
    classes: [],
    status: person.status,
    connectionId: person.connectionId,
    connectionCount: person.connectionCount,
  };
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
          <MemberAvatar initials={initials(person.name ?? person.username)} color={memberColor(person.profileId)} size={52} />
          <span className="min-w-0">
            <span className="block truncate text-[16px] font-semibold text-[#14213d]">
              {publicLabel(person.name, person.username)}
            </span>
            {person.name ? <span className="block truncate text-[13px] text-[#5b6478]">@{person.username}</span> : null}
            {person.connectionCount > 0 ? (
              <span className="mt-1 block text-[13px] font-semibold text-[#14213d]">
                {connectionLabel(person.connectionCount)}
              </span>
            ) : null}
            <span className="mt-1 block text-[13px] text-[#5b6478]">
              {[person.grade ? `Grade ${person.grade}` : null, person.school, person.schoolLocation]
                .filter(Boolean)
                .join(" · ") || "No school on their profile"}
            </span>
          </span>
        </button>
        <CardAction person={person} disabled={disabled} onAdd={onAdd} onOpen={onOpen} />
      </div>
      {friend && person.classes.length > 0 ? (
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
  onRemove,
  onJoin,
}: {
  person: PersonConnection;
  mine: Set<string>;
  disabled: boolean;
  onClose: () => void;
  onRemove: () => void;
  onJoin: (className: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const label = publicLabel(person.name, person.username);

  return (
    <div data-m="dialog" className="fixed inset-0 z-50 flex items-end justify-center overflow-y-auto bg-[#14213d]/35 p-4 sm:items-center">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="friend-title"
        className="max-h-[min(640px,calc(100vh-2rem))] w-full max-w-md overflow-y-auto rounded-[28px] border border-white/90 bg-white/95 p-6 shadow-[0_12px_32px_rgba(51,64,128,0.16)] backdrop-blur-[14px]"
      >
        <div className="flex items-start gap-3">
          <MemberAvatar initials={initials(label)} color={memberColor(person.profileId)} size={64} />
          <div className="min-w-0 flex-1">
            <h2 id="friend-title" className="truncate text-[20px] font-semibold text-[#14213d]">
              {label}
            </h2>
            {person.name ? <p className="text-[14px] text-[#5b6478]">@{person.username}</p> : null}
            {person.connectionCount > 0 ? (
              <p className="mt-1 text-[14px] font-semibold text-[#14213d]">{connectionLabel(person.connectionCount)}</p>
            ) : null}
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
            {person.sharedClasses.length === 0 ? (
              <p className="text-[12px] text-[#5b6478]">
                You both have to add a class yourselves before it shows here.
              </p>
            ) : (
              <ul className="space-y-1">
                {person.sharedClasses.map((item) => (
                  <li key={item.key} className="text-[14px] font-medium text-[#14213d]">
                    {item.name}
                  </li>
                ))}
              </ul>
            )}
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
