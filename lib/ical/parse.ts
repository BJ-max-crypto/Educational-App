import { isValidZone, wallTimeToUtc } from "@/lib/timezone";

export type IcalEvent = {
  uid: string;
  title: string;
  description: string | null;
  url: string | null;
  dueAt: string | null;
  allDay: boolean;
  courseHint: string | null;
};

type Property = { name: string; params: Record<string, string>; value: string };

/** RFC 5545 §3.1: continuation lines start with a space or tab. */
function unfold(text: string) {
  return text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").replace(/\n[ \t]/g, "").split("\n");
}

function parseLine(line: string): Property | null {
  let inQuotes = false;
  let colon = -1;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') inQuotes = !inQuotes;
    else if (ch === ":" && !inQuotes) {
      colon = i;
      break;
    }
  }
  if (colon <= 0) return null;
  const [rawName, ...rawParams] = line.slice(0, colon).split(";");
  const params: Record<string, string> = {};
  for (const param of rawParams) {
    const eq = param.indexOf("=");
    if (eq > 0) params[param.slice(0, eq).toUpperCase()] = param.slice(eq + 1).replace(/^"|"$/g, "");
  }
  return { name: rawName.toUpperCase(), params, value: line.slice(colon + 1) };
}

function unescapeText(value: string) {
  return value.replace(/\\([\\;,nN])/g, (_, ch: string) => (ch === "n" || ch === "N" ? "\n" : ch));
}

/**
 * Parses DTSTART / DUE. All-day dates are treated as due at 11:59 PM in the calendar's
 * time zone, which is how Schoology shows all-day assignments.
 */
function parseDate(prop: Property, fallbackZone: string) {
  const value = prop.value.trim();
  const dateOnly = /^(\d{4})(\d{2})(\d{2})$/.exec(value);
  if (dateOnly || prop.params.VALUE === "DATE") {
    const m = dateOnly ?? /^(\d{4})(\d{2})(\d{2})/.exec(value);
    if (!m) return null;
    const zone = isValidZone(prop.params.TZID) ? prop.params.TZID : fallbackZone;
    const fields = [Number(m[1]), Number(m[2]), Number(m[3]), 23, 59, 0];
    return { iso: new Date(wallTimeToUtc(fields, zone)).toISOString(), allDay: true };
  }
  const m = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})?(Z)?$/.exec(value);
  if (!m) return null;
  const fields = [m[1], m[2], m[3], m[4], m[5], m[6] ?? "0"].map(Number);
  if (m[7]) {
    const [year, month, day, hour, minute, second] = fields;
    return { iso: new Date(Date.UTC(year, month - 1, day, hour, minute, second)).toISOString(), allDay: false };
  }
  const zone = isValidZone(prop.params.TZID) ? prop.params.TZID : fallbackZone;
  return { iso: new Date(wallTimeToUtc(fields, zone)).toISOString(), allDay: false };
}

function firstLink(text: string | null) {
  const match = text?.match(/https?:\/\/[^\s<>"')]+/);
  return match ? match[0] : null;
}

function safeUrl(value: string | null) {
  if (!value) return null;
  try {
    const url = new URL(value.trim());
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : null;
  } catch {
    return null;
  }
}

/**
 * Schoology's personal calendar export has no course field (checked against a real feed:
 * only DTSTAMP, DTSTART, DTEND, UID, URL, SUMMARY, DESCRIPTION). Only explicit labels are
 * trusted: CATEGORIES, or a "Course:" / "Class:" / "Section:" line in the description.
 * Returns null otherwise, so the item stays in Unsorted instead of being guessed.
 */
function courseHint(props: Map<string, Property>, description: string | null) {
  const categories = props.get("CATEGORIES");
  if (categories) {
    const first = unescapeText(categories.value).split(",")[0]?.trim();
    if (first) return first;
  }
  const line = description?.match(/^\s*(?:course|class|section)\s*:\s*(.+)$/im);
  return line ? line[1].trim() : null;
}

/**
 * `fallbackZone` is used for all-day and floating times when the feed names no time zone.
 * Schoology's personal export names none, so callers pass the student's browser time zone.
 */
export function parseIcal(
  text: string,
  fallbackZone = "UTC",
): { events: IcalEvent[]; timeZone: string } {
  const lines = unfold(text);
  let timeZone = "";
  const vtimezones: string[] = [];
  for (const line of lines) {
    const prop = parseLine(line);
    if (!prop) continue;
    if (prop.name === "X-WR-TIMEZONE" && isValidZone(prop.value.trim())) timeZone = prop.value.trim();
    if (prop.name === "TZID") vtimezones.push(prop.value.trim());
    if (prop.name === "BEGIN" && prop.value === "VEVENT") break;
  }
  if (!timeZone) timeZone = vtimezones.find(isValidZone) ?? (isValidZone(fallbackZone) ? fallbackZone : "UTC");

  const events: IcalEvent[] = [];
  let current: Map<string, Property> | null = null;
  let depth = 0;
  for (const line of lines) {
    const prop = parseLine(line);
    if (!prop) continue;
    if (prop.name === "BEGIN") {
      if (prop.value.trim() === "VEVENT" && depth === 0) current = new Map();
      else if (current) depth++;
      continue;
    }
    if (prop.name === "END") {
      if (current && depth > 0) {
        depth--;
        continue;
      }
      if (current && prop.value.trim() === "VEVENT") {
        const event = toEvent(current, timeZone);
        if (event) events.push(event);
        current = null;
      }
      continue;
    }
    if (current && depth === 0 && !current.has(prop.name)) current.set(prop.name, prop);
  }

  const seen = new Set<string>();
  return {
    timeZone,
    events: events.filter((event) => (seen.has(event.uid) ? false : (seen.add(event.uid), true))),
  };
}

function toEvent(props: Map<string, Property>, timeZone: string): IcalEvent | null {
  const uid = props.get("UID")?.value.trim();
  if (!uid) return null;
  if (props.get("STATUS")?.value.trim().toUpperCase() === "CANCELLED") return null;
  const title = unescapeText(props.get("SUMMARY")?.value ?? "").trim() || "Untitled";
  const rawDescription = props.get("DESCRIPTION");
  const description = rawDescription ? unescapeText(rawDescription.value).trim() || null : null;
  const dateProp = props.get("DUE") ?? props.get("DTSTART");
  const date = dateProp ? parseDate(dateProp, timeZone) : null;
  return {
    uid: uid.slice(0, 500),
    title: title.slice(0, 500),
    description: description ? description.slice(0, 10_000) : null,
    url: safeUrl(props.get("URL")?.value ?? null) ?? safeUrl(firstLink(description)),
    dueAt: date?.iso ?? null,
    allDay: date?.allDay ?? false,
    courseHint: courseHint(props, description)?.slice(0, 120) ?? null,
  };
}
