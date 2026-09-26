/** Public page the share sheet links to. No account required. */
export const SHARE_PATH = "/welcome";

/** Monday 00:00 local time of the week that contains `now`. */
export function startOfWeek(now: Date) {
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  const daysFromMonday = (start.getDay() + 6) % 7;
  start.setDate(start.getDate() - daysFromMonday);
  return start;
}

/**
 * Assignments marked done whose due date falls in this Monday–Sunday week.
 * Titles, courses, and grades are not part of this count.
 */
export function countDoneThisWeek(items: { status: string; dueAt: string }[], now: Date) {
  const startDate = startOfWeek(now);
  const end = new Date(startDate);
  end.setDate(end.getDate() + 7);
  const start = startDate.getTime();
  const endMs = end.getTime();
  return items.filter((item) => {
    if (item.status !== "submitted") return false;
    const due = new Date(item.dueAt).getTime();
    return due >= start && due < endMs;
  }).length;
}

export function shareStatLine(overdue: number, done: number) {
  return `${overdue} overdue · ${done} done this week`;
}
