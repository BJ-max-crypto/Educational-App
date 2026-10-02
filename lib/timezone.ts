export function isValidZone(timeZone: string | undefined | null): timeZone is string {
  if (!timeZone) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone });
    return true;
  } catch {
    return false;
  }
}

/** Wall-clock fields of `instant` in `timeZone`. */
export function zonedParts(instant: number, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(new Date(instant));
  const get = (type: string) => Number(parts.find((part) => part.type === type)?.value);
  return {
    year: get("year"),
    month: get("month"),
    day: get("day"),
    hour: get("hour"),
    minute: get("minute"),
    second: get("second"),
  };
}

/** Offset of `timeZone` from UTC, in ms, at the given instant. */
function zoneOffset(instant: number, timeZone: string) {
  const p = zonedParts(instant, timeZone);
  return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - instant;
}

/** Converts a wall-clock time in `timeZone` to a UTC instant (ms). */
export function wallTimeToUtc(
  [year, month, day, hour = 0, minute = 0, second = 0]: number[],
  timeZone: string,
) {
  const guess = Date.UTC(year, month - 1, day, hour, minute, second);
  const first = guess - zoneOffset(guess, timeZone);
  return guess - zoneOffset(first, timeZone);
}

/** YYYY-MM-DD of `instant` in `timeZone`. */
export function localDate(instant: number, timeZone: string) {
  const p = zonedParts(instant, timeZone);
  return `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
}

/** UTC instant of local midnight `offsetDays` days after the local day containing `instant`. */
export function localMidnight(instant: number, timeZone: string, offsetDays = 0) {
  const p = zonedParts(instant, timeZone);
  const shifted = new Date(Date.UTC(p.year, p.month - 1, p.day + offsetDays));
  return wallTimeToUtc(
    [shifted.getUTCFullYear(), shifted.getUTCMonth() + 1, shifted.getUTCDate()],
    timeZone,
  );
}
