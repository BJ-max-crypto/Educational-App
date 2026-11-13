export type ClassLabel = {
  id: string;
  courseId: string;
  reason: string;
};

const MAX_LABELS = 24;

/** Keep only labels whose assignment and class were in the lists we sent. */
export function readClassLabels(payload: unknown, assignments: ReadonlySet<string>, courses: ReadonlySet<string>) {
  if (!payload || typeof payload !== "object") return [];
  const labels = (payload as { labels?: unknown }).labels;
  if (!Array.isArray(labels)) return [];
  const seen = new Set<string>();
  const out: ClassLabel[] = [];
  for (const item of labels) {
    if (!item || typeof item !== "object") continue;
    const id = "id" in item && typeof item.id === "string" ? item.id : "";
    const courseId = "courseId" in item && typeof item.courseId === "string" ? item.courseId : "";
    if (!assignments.has(id) || !courses.has(courseId) || seen.has(id)) continue;
    seen.add(id);
    const raw = "reason" in item && typeof item.reason === "string" ? item.reason : "";
    const reason = raw.replace(/\s+/g, " ").trim().slice(0, 90) || "Looks like this class.";
    out.push({ id, courseId, reason });
    if (out.length >= MAX_LABELS) break;
  }
  return out;
}
