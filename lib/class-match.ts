/**
 * Identity rules for a real-world class group.
 * A group is reused only when the school, course, teacher, period, and academic
 * year match after normalization. A similar course name is a suggestion, not a merge.
 * A stored row with a blank year can adopt the year being created.
 */

export const CLASS_INVITE_COOKIE = "pane_class";

export const CLASS_CODE = /^[a-hj-km-np-z2-9]{8}$/;

const ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789";

export type ClassIdentity = {
  school: string;
  name: string;
  teacher: string;
  period: string | null;
  academicYear: string | null;
};

export type ClassMember = {
  id: string;
  name: string;
  username: string;
};

export type ClassPreview =
  | {
      ok: true;
      state: "open" | "expired" | "revoked";
      name: string;
      school: string;
      teacher: string;
      period: string | null;
      academicYear: string | null;
      memberCount: number;
      already: boolean;
      courseId: string | null;
      sameSchool: boolean;
    }
  | { ok: false; error: string };

export type ClassInvitePanel =
  | {
      ok: true;
      available: true;
      courseName: string;
      school: string;
      teacher: string;
      period: string | null;
      academicYear: string | null;
      members: ClassMember[];
      memberCount: number;
      code: string | null;
      canManage: boolean;
      state: "open" | "revoked" | "expired" | "none";
    }
  | { ok: true; available: false; notice: string }
  | { ok: false; error: string };

export function normalizeLabel(value: string | null | undefined) {
  return (value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[.’']/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizePeriod(value: string | null | undefined) {
  return normalizeLabel(value).replace(/^period\s+/, "");
}

export function normalizeYear(value: string | null | undefined) {
  return (value ?? "").trim().toLowerCase().replace(/[–—]/g, "-").replace(/\s+/g, "");
}

/** `2026-2027` when the month is July or later, otherwise the previous school year. */
export function academicYearLabel(now = new Date()) {
  const year = now.getUTCFullYear();
  const start = now.getUTCMonth() >= 6 ? year : year - 1;
  return `${start}-${start + 1}`;
}

export function academicYearChoices(now = new Date()) {
  const current = academicYearLabel(now);
  const start = Number(current.slice(0, 4));
  return [current, `${start - 1}-${start}`];
}

export function parseAcademicYear(value: string | null | undefined) {
  const match = /^(\d{4})-(\d{4})$/.exec(normalizeYear(value));
  if (!match) return null;
  const start = Number(match[1]);
  const end = Number(match[2]);
  if (end !== start + 1) return null;
  return `${start}-${end}`;
}

export function displayAcademicYear(value: string | null | undefined) {
  const parsed = parseAcademicYear(value);
  return parsed ? parsed.replace("-", "–") : "";
}

export function canReuseClass(stored: ClassIdentity, requested: ClassIdentity) {
  if (normalizeLabel(stored.school) !== normalizeLabel(requested.school)) return false;
  if (normalizeLabel(stored.name) !== normalizeLabel(requested.name)) return false;
  if (normalizeLabel(stored.teacher) !== normalizeLabel(requested.teacher)) return false;
  if (normalizePeriod(stored.period) !== normalizePeriod(requested.period)) return false;
  const storedYear = parseAcademicYear(stored.academicYear);
  const requestedYear = parseAcademicYear(requested.academicYear);
  if (!storedYear || !requestedYear) return true;
  return storedYear === requestedYear;
}

export function invitationExpiry(academicYear: string | null, now = new Date()) {
  const parsed = parseAcademicYear(academicYear);
  if (parsed) {
    const end = Number(parsed.slice(5));
    return new Date(Date.UTC(end, 5, 30, 23, 59, 59)).toISOString();
  }
  return new Date(now.getTime() + 1000 * 60 * 60 * 24 * 120).toISOString();
}

export function invitationState(
  invite: { revokedAt: string | null; expiresAt: string | null } | null,
  now = new Date(),
) {
  if (!invite) return "missing" as const;
  if (invite.revokedAt) return "revoked" as const;
  if (invite.expiresAt && Date.parse(invite.expiresAt) <= now.getTime()) return "expired" as const;
  return "open" as const;
}

export function classInviteCode() {
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  return Array.from(bytes, (byte) => ALPHABET[byte % ALPHABET.length]).join("");
}

export function periodLabel(period: string | null | undefined) {
  const text = (period ?? "").trim();
  if (!text) return "";
  return /^period\b/i.test(text) ? text : `Period ${text}`;
}
