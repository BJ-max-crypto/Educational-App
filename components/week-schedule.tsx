"use client";

import { addDays, isSubmitted, startOfDay, startOfWeek } from "@/lib/dates";
import { useCoursework } from "@/lib/coursework";
import type { Assignment, Course } from "@/lib/types";

function subjectOf(course: Course | undefined) {
  if (!course || course.isUnsorted || course.name.trim().toLowerCase() === "unsorted") return "No subject";
  return course.name;
}

function timeLabel(dueAt: string) {
  return new Date(dueAt).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

function dayHeading(day: Date) {
  return day.toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" });
}

function weekRange(start: Date) {
  const end = addDays(start, 6);
  const sameMonth = start.getMonth() === end.getMonth() && start.getFullYear() === end.getFullYear();
  if (sameMonth) {
    const month = start.toLocaleDateString("en-US", { month: "long" });
    return `${month} ${start.getDate()}–${end.getDate()}, ${start.getFullYear()}`;
  }
  const left = start.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  const right = end.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  return `${left} – ${right}`;
}

function onDay(items: Assignment[], day: Date) {
  const start = startOfDay(day).getTime();
  const end = addDays(startOfDay(day), 1).getTime();
  return items
    .filter((item) => {
      const due = new Date(item.dueAt).getTime();
      return due >= start && due < end;
    })
    .sort((a, b) => new Date(a.dueAt).getTime() - new Date(b.dueAt).getTime());
}

function ScheduleTable({
  rows,
  showDate = false,
}: {
  rows: { id: string; date?: string; time: string; subject: string; title: string }[];
  showDate?: boolean;
}) {
  const span = showDate ? 4 : 3;
  return (
    <table className="mt-2 w-full border-collapse text-left text-[11pt] text-[#14213d]">
      <thead>
        <tr className="border-b border-[#14213d] text-[9pt] tracking-[0.06em] uppercase">
          {showDate ? <th className="w-[9.5rem] py-1 pr-4 font-semibold">Date</th> : null}
          <th className="w-[6.5rem] py-1 pr-4 font-semibold">Time</th>
          <th className="w-[11rem] py-1 pr-4 font-semibold">Subject</th>
          <th className="py-1 font-semibold">Work</th>
        </tr>
      </thead>
      <tbody>
        {rows.length === 0 ? (
          <tr>
            <td colSpan={span} className="py-2 text-[#5b6478]">
              Nothing due
            </td>
          </tr>
        ) : (
          rows.map((row) => (
            <tr key={row.id} className="border-b border-[#d5dbe8]">
              {showDate ? <td className="py-1.5 pr-4 align-top whitespace-nowrap">{row.date}</td> : null}
              <td className="py-1.5 pr-4 align-top whitespace-nowrap">{row.time}</td>
              <td className="py-1.5 pr-4 align-top font-medium">{row.subject}</td>
              <td className="py-1.5 align-top">{row.title}</td>
            </tr>
          ))
        )}
      </tbody>
    </table>
  );
}

/** Paper schedule for the current Monday–Sunday week. Hidden on screen. */
export function WeekSchedule() {
  const { now, assignments, courseById, user } = useCoursework();
  const clock = now ?? new Date();
  const open = assignments.filter((item) => !isSubmitted(item));
  const monday = startOfWeek(clock);
  const days = Array.from({ length: 7 }, (_, index) => addDays(monday, index));
  const earlier = open
    .filter((item) => new Date(item.dueAt).getTime() < monday.getTime())
    .sort((a, b) => new Date(a.dueAt).getTime() - new Date(b.dueAt).getTime());

  return (
    <article className="print-sheet mx-auto w-full max-w-[880px]">
      <header className="border-b-2 border-[#14213d] pb-3">
        <p className="text-[11pt] font-semibold tracking-[0.08em] text-[#14213d] uppercase">Weekly schedule</p>
        <h1 className="mt-1 text-[22pt] font-semibold tracking-[-0.03em] text-[#14213d]">{user.name}</h1>
        <p className="mt-1 text-[12pt] text-[#14213d]">{weekRange(monday)}</p>
      </header>

      {days.map((day) => {
        const rows = onDay(open, day).map((item) => ({
          id: item.id,
          time: timeLabel(item.dueAt),
          subject: subjectOf(courseById.get(item.courseId)),
          title: item.title,
        }));
        return (
          <section key={day.toISOString()} className="mt-5 break-inside-avoid">
            <h2 className="text-[13pt] font-semibold text-[#14213d]">{dayHeading(day)}</h2>
            <ScheduleTable rows={rows} />
          </section>
        );
      })}

      {earlier.length > 0 ? (
        <section className="mt-8 break-inside-avoid">
          <h2 className="text-[13pt] font-semibold text-[#14213d]">Still open from earlier</h2>
          <p className="mt-0.5 text-[10pt] text-[#5b6478]">These are before this week, so the date is the real due date.</p>
          <ScheduleTable
            showDate
            rows={earlier.map((item) => ({
              id: item.id,
              date: dayHeading(new Date(item.dueAt)),
              time: timeLabel(item.dueAt),
              subject: subjectOf(courseById.get(item.courseId)),
              title: item.title,
            }))}
          />
        </section>
      ) : null}
    </article>
  );
}
