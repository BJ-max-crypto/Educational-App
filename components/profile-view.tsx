"use client";

import { useClerk } from "@clerk/nextjs";
import { useState } from "react";
import { EditProfileForm } from "@/components/edit-profile-form";
import { GlassCard } from "@/components/glass-card";
import { GoogleCalendarConnect } from "@/components/google-calendar-connect";
import { SyncButton, useSyncLabel } from "@/components/sync-status";
import { initials } from "@/lib/dates";
import { useCoursework } from "@/lib/coursework";

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-white/70 py-2.5 last:border-b-0">
      <span className="text-[14px] text-[#5b6478]">{label}</span>
      <span className="text-right text-[14px] font-medium text-[#14213d]">{value}</span>
    </div>
  );
}

export function ProfileView() {
  const { signOut } = useClerk();
  const { user, courses, upcomingCount, overdueCount } = useCoursework();
  const syncLabel = useSyncLabel();
  const [editing, setEditing] = useState(false);
  const [saved, setSaved] = useState(false);
  const school = user.school || null;
  const grade = user.grade || null;
  const subtitle = [grade ? `Grade ${grade}` : null, school].filter(Boolean).join(" · ");

  return (
    <div className="grid items-start gap-6 lg:grid-cols-[360px_minmax(0,1fr)]">
      <GlassCard className="flex flex-col items-center px-8 py-10 text-center">
        <span className="flex size-[120px] items-center justify-center rounded-full bg-[#4f7cff] text-[40px] font-semibold text-white">
          {initials(user.name)}
        </span>
        <h1 className="mt-5 text-[26px] font-semibold tracking-[-0.03em] text-[#14213d]">
          {user.name}
        </h1>
        {subtitle ? <p className="mt-2 text-[14px] text-[#5b6478]">{subtitle}</p> : null}
        <div className="mt-6 grid w-full grid-cols-3">
          <Stat value={String(courses.length)} label="Courses" />
          <Stat value={String(upcomingCount())} label="Upcoming" />
          <Stat value={String(overdueCount())} label="Overdue" />
        </div>
        <button
          type="button"
          onClick={() => {
            setEditing(true);
            setSaved(false);
          }}
          disabled={editing}
          className="mt-8 rounded-full bg-white/95 px-7 py-3 text-[15px] font-semibold text-[#14213d] shadow-[0_4px_12px_rgba(51,64,128,0.12)] transition-[transform,box-shadow] duration-200 ease-out hover:-translate-y-0.5 hover:shadow-[0_10px_22px_rgba(51,64,128,0.18)] disabled:opacity-60 disabled:hover:translate-y-0 motion-reduce:transition-none"
        >
          Edit profile
        </button>
        <button
          type="button"
          onClick={() => signOut({ redirectUrl: "/sign-in" })}
          className="mt-4 text-[14px] font-semibold text-[#5b6478]"
        >
          Sign out
        </button>
      </GlassCard>

      <GlassCard className="space-y-4 p-6 sm:p-8">
        <section className="rounded-[24px] bg-white/55 px-6 py-5">
          <h2 className="text-[12px] font-semibold tracking-[0.08em] text-[#5b6478]">
            PERSONAL INFO
          </h2>
          {editing ? (
            <EditProfileForm
              initial={{ name: user.name, school: school ?? "", grade: grade ?? "" }}
              onDone={(didSave) => {
                setEditing(false);
                setSaved(didSave);
              }}
            />
          ) : (
            <div className="mt-2">
              {saved ? (
                <p role="status" className="mb-2 rounded-full bg-[rgba(47,174,134,0.16)] px-3.5 py-1.5 text-[13px] font-semibold text-[#1b7f60]">
                  Profile saved
                </p>
              ) : null}
              <InfoRow label="Full name" value={user.name} />
              <InfoRow label="Email" value={user.email || "No email on this account"} />
              <InfoRow label="School" value={school ?? "Not set"} />
              <InfoRow label="Grade" value={grade ?? "Not set"} />
            </div>
          )}
        </section>

        <section className="rounded-[24px] bg-white/55 px-6 py-5">
          <h2 className="text-[12px] font-semibold tracking-[0.08em] text-[#5b6478]">COURSES</h2>
          <div className="mt-3 flex flex-wrap gap-2.5">
            {courses.map((course) => (
              <span
                key={course.id}
                className="inline-flex items-center gap-2 rounded-full bg-white/80 px-3.5 py-2 text-[14px] font-medium text-[#14213d]"
              >
                <span
                  className="size-2.5 rounded-full"
                  style={{ backgroundColor: course.color }}
                  aria-hidden
                />
                {course.name}
              </span>
            ))}
          </div>
        </section>

        <section className="rounded-[24px] bg-white/55 px-6 py-5">
          <h2 className="text-[12px] font-semibold tracking-[0.08em] text-[#5b6478]">
            PREFERENCES
          </h2>
          <div className="mt-2">
            <InfoRow label="Notifications" value="On" />
            <div className="flex items-center justify-between gap-4 border-b border-white/70 py-2.5 last:border-b-0">
              <span className="text-[14px] text-[#5b6478]">Calendar sync</span>
              <span className="flex items-center gap-3">
                <span
                  className={`text-right text-[14px] font-medium ${syncLabel.error ? "text-[#e5484d]" : "text-[#14213d]"}`}
                >
                  {syncLabel.text}
                </span>
                <SyncButton />
              </span>
            </div>
            <GoogleCalendarConnect />
            <InfoRow label="Appearance" value="Light" />
          </div>
        </section>
      </GlassCard>
    </div>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div>
      <p className="text-[22px] font-semibold text-[#14213d]">{value}</p>
      <p className="text-[12px] text-[#5b6478]">{label}</p>
    </div>
  );
}
