/**
 * Suggestion ranking only. Nothing in here attaches or merges a course.
 * A row is the same course only when school, name, teacher, and period all match
 * after trimming and lowercasing — that check lives with the database write.
 * "AP Chem" and "AP Chemistry" stay different rows until a student clicks one.
 */

export type SchoolCourseHit = {
  id: string;
  name: string;
  teacher: string;
  period: string | null;
};

const NAME_GENERIC = new Set([
  "ap",
  "ib",
  "a",
  "an",
  "the",
  "class",
  "course",
  "honors",
  "honor",
  "adv",
  "advanced",
  "pre",
  "intro",
  "introduction",
]);

const TEACHER_GENERIC = new Set([
  "dr",
  "mr",
  "mrs",
  "ms",
  "miss",
  "prof",
  "professor",
  "teacher",
  "coach",
]);

function tokens(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((token) => token.length >= 2);
}

function specificTokens(value: string, generic: Set<string>) {
  return tokens(value).filter((token) => !generic.has(token));
}

function tokenMatch(a: string, b: string) {
  if (a === b) return 1;
  const short = a.length <= b.length ? a : b;
  const long = a.length <= b.length ? b : a;
  if (!long.startsWith(short)) return 0;
  if (short.length >= 4) return 0.9;
  if (short.length >= 3) return 0.72;
  return 0;
}

function coverage(queryTokens: string[], candidateTokens: string[]) {
  if (!queryTokens.length || !candidateTokens.length) return 0;
  const total = queryTokens.reduce((sum, token) => {
    let best = 0;
    for (const candidate of candidateTokens) best = Math.max(best, tokenMatch(token, candidate));
    return sum + best;
  }, 0);
  return total / queryTokens.length;
}

export function formatSchoolCourse(course: Pick<SchoolCourseHit, "name" | "teacher" | "period">) {
  const parts = [course.name.trim()];
  if (course.teacher.trim()) parts.push(course.teacher.trim());
  const period = course.period?.trim();
  if (period) parts.push(/^period\b/i.test(period) ? period : `Period ${period}`);
  return parts.join(" · ");
}

/** Ranked suggestions. The caller must wait for an explicit click before linking anything. */
export function rankSchoolCourses(
  query: { name: string; teacher?: string },
  courses: SchoolCourseHit[],
): SchoolCourseHit[] {
  const nameQuery = specificTokens(query.name, NAME_GENERIC);
  if (!nameQuery.length) return [];
  const teacherQuery = specificTokens(query.teacher ?? "", TEACHER_GENERIC);
  const scored = courses.flatMap((course) => {
    const nameScore = coverage(nameQuery, tokens(course.name));
    if (nameScore < 0.5) return [];
    const teacherScore = teacherQuery.length ? coverage(teacherQuery, tokens(course.teacher)) : 0;
    let score = nameScore * 0.75 + teacherScore * 0.25;
    const candidateTeacher = specificTokens(course.teacher, TEACHER_GENERIC);
    if (teacherQuery.length && candidateTeacher.length && teacherScore < 0.34) score -= 0.12;
    if (score < 0.45) return [];
    return [{ course, score }];
  });
  scored.sort(
    (a, b) => b.score - a.score || a.course.name.localeCompare(b.course.name) || a.course.teacher.localeCompare(b.course.teacher),
  );
  return scored.slice(0, 6).map((item) => item.course);
}
