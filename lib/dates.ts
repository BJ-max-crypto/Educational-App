import type { Assignment, PlannerBucket } from "@/lib/types";

export function startOfDay(date: Date) {
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

export function addDays(date: Date, days: number) {
  const copy = new Date(date);
  copy.setDate(copy.getDate() + days);
  return copy;
}

export function atTime(now: Date, dayOffset: number, hours: number, minutes: number) {
  const copy = startOfDay(now);
  copy.setDate(copy.getDate() + dayOffset);
  copy.setHours(hours, minutes, 0, 0);
  return copy;
}

export function isSubmitted(assignment: Assignment) {
  return assignment.status === "submitted";
}

export function isOverdue(assignment: Assignment, now: Date) {
  return !isSubmitted(assignment) && new Date(assignment.dueAt).getTime() < startOfDay(now).getTime();
}

export function plannerBucket(assignment: Assignment, now: Date): PlannerBucket | null {
  if (isSubmitted(assignment)) return null;
  const due = new Date(assignment.dueAt).getTime();
  const today = startOfDay(now).getTime();
  const tomorrow = addDays(startOfDay(now), 1).getTime();
  const dayAfterTomorrow = addDays(startOfDay(now), 2).getTime();
  const weekEnd = addDays(startOfDay(now), 7).getTime();

  if (due < today) return "overdue";
  if (due < tomorrow) return "today";
  if (due < dayAfterTomorrow) return "tomorrow";
  if (due < weekEnd) return "week";
  return null;
}

export function dueThisWeek(assignment: Assignment, now: Date) {
  if (isSubmitted(assignment)) return false;
  const due = new Date(assignment.dueAt).getTime();
  const today = startOfDay(now).getTime();
  const weekEnd = addDays(startOfDay(now), 7).getTime();
  return due >= today && due < weekEnd;
}

function dayDiff(dueAt: string, now: Date) {
  const dueDay = startOfDay(new Date(dueAt)).getTime();
  const today = startOfDay(now).getTime();
  return Math.round((dueDay - today) / 86_400_000);
}

function clock(dueAt: string) {
  return new Date(dueAt).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });
}

function weekday(dueAt: string) {
  return new Date(dueAt).toLocaleDateString("en-US", { weekday: "short" });
}

/** Right-hand label on a planner row. */
export function plannerWhen(dueAt: string, now: Date) {
  const diff = dayDiff(dueAt, now);
  if (diff <= -2) return `${Math.abs(diff)} days ago`;
  if (diff === -1) return "Yesterday";
  if (diff === 0 || diff === 1) return clock(dueAt);
  return weekday(dueAt);
}

/** Second line on a course assignment or the next-up card. */
export function dueDetail(dueAt: string, now: Date) {
  const diff = dayDiff(dueAt, now);
  if (diff <= -2) return `Overdue · ${Math.abs(diff)} days ago`;
  if (diff === -1) return "Overdue · Yesterday";
  if (diff === 0) return `Due today · ${clock(dueAt)}`;
  if (diff === 1) return `Due tomorrow · ${clock(dueAt)}`;
  if (diff < 7) return `Due ${weekday(dueAt)} · ${clock(dueAt)}`;
  return `Due next ${weekday(dueAt)}`;
}

export function timeAgo(iso: string, now: Date) {
  const minutes = Math.round((now.getTime() - new Date(iso).getTime()) / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hr ago`;
  const days = Math.round(hours / 24);
  return `${days} ${days === 1 ? "day" : "days"} ago`;
}

export function greeting(now: Date) {
  const hour = now.getHours();
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

export function firstName(name: string) {
  return name.trim().split(/\s+/)[0] || name;
}

export function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}
