/** A calendar day, with month numbered 1–12. */
export type CivilDate = { year: number; month: number; day: number };

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function utcDay(date: CivilDate) {
  return Date.UTC(date.year, date.month - 1, date.day);
}

/** 0 = Monday … 6 = Sunday. */
export function daysFromMonday(date: CivilDate) {
  return (new Date(utcDay(date)).getUTCDay() + 6) % 7;
}

/** Monday of the calendar week that contains `date`, as YYYY-M-D. */
export function weekKey(date: CivilDate) {
  const monday = new Date(utcDay(date) - daysFromMonday(date) * 86_400_000);
  return `${monday.getUTCFullYear()}-${monday.getUTCMonth() + 1}-${monday.getUTCDate()}`;
}

export function inCurrentWeek(due: CivilDate, now: CivilDate) {
  return weekKey(due) === weekKey(now);
}

export function civilDayDiff(due: CivilDate, now: CivilDate) {
  return Math.round((utcDay(due) - utcDay(now)) / 86_400_000);
}

export function longWeekday(date: CivilDate) {
  return WEEKDAYS[new Date(utcDay(date)).getUTCDay()];
}

/** "Monday, Mar 2" — a real date, for anything outside the current week. */
export function datedDay(date: CivilDate) {
  return `${longWeekday(date)}, ${MONTHS[date.month - 1]} ${date.day}`;
}

/**
 * How to name a day. "this Monday" is only the Monday of the same Monday–Sunday
 * week as `now`. Every other week is the weekday plus the date.
 */
export function dayPhrase(due: CivilDate, now: CivilDate) {
  if (inCurrentWeek(due, now)) return `this ${longWeekday(due)}`;
  return datedDay(due);
}

/** today / tomorrow / yesterday, otherwise `dayPhrase`. */
export function spokenDay(due: CivilDate, now: CivilDate) {
  const diff = civilDayDiff(due, now);
  if (diff === 0) return "today";
  if (diff === 1) return "tomorrow";
  if (diff === -1) return "yesterday";
  return dayPhrase(due, now);
}

export function dueDetailPhrase(due: CivilDate, now: CivilDate, time: string) {
  const diff = civilDayDiff(due, now);
  if (diff === 0) return `Due today · ${time}`;
  if (diff === 1) return `Due tomorrow · ${time}`;
  if (diff === -1) return "Overdue · Yesterday";
  const when = dayPhrase(due, now);
  if (diff < 0) return `Overdue · ${when} · ${time}`;
  return `Due ${when} · ${time}`;
}

export function plannerWhenPhrase(due: CivilDate, now: CivilDate, time: string) {
  const diff = civilDayDiff(due, now);
  if (diff === 0) return time;
  if (diff === 1) return "Tomorrow";
  if (diff === -1) return "Yesterday";
  return dayPhrase(due, now);
}
