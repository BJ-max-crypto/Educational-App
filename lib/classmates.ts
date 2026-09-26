const RESERVED = new Set(["admin", "pane", "support", "help", "username"]);

/** Course names match across accounts only when they are the same text. */
export function courseKey(name: string) {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

export function classmatesInCourse<T extends { courseNames: string[] }>(
  people: T[],
  course: { name: string; isUnsorted?: boolean },
) {
  if (course.isUnsorted) return [];
  const key = courseKey(course.name);
  if (!key || key === "unsorted") return [];
  return people.filter((person) => person.courseNames.some((name) => courseKey(name) === key));
}

export function sharedCourseNames(
  mine: { name: string; isUnsorted?: boolean }[],
  theirs: string[],
) {
  const keys = new Set(theirs.map(courseKey));
  return mine
    .filter((course) => !course.isUnsorted && keys.has(courseKey(course.name)))
    .map((course) => course.name);
}

export function validateUsername(value: string): { value: string } | { error: string } {
  const username = value.trim().toLowerCase().replace(/^@/, "");
  if (!/^[a-z0-9_]{3,20}$/.test(username)) {
    return { error: "Use 3–20 letters, numbers, or underscores." };
  }
  if (RESERVED.has(username)) return { error: "Pick a different username." };
  return { value: username };
}
