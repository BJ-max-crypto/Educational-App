import { dueDayOffset } from "@/lib/priority-tier";
import { localDate } from "@/lib/timezone";

export type NoticeKind = "overdue" | "today" | "tomorrow";

export type AssignmentNotice = {
  id: string;
  kind: NoticeKind;
  tag: string;
  title: string;
  body: string;
};

const WHEN: Record<NoticeKind, string> = {
  overdue: "Overdue",
  today: "Due today",
  tomorrow: "Due tomorrow",
};

/** At most this many assignment notifications go out in one pass. */
export const NOTICE_CAP = 5;

export function assignmentNotices(
  items: { id: string; title: string; dueAt: string; status: string; courseName: string | null }[],
  now: number,
  timeZone: string,
): AssignmentNotice[] {
  const today = localDate(now, timeZone);
  const notices: AssignmentNotice[] = [];
  const ranked = items
    .flatMap((item) => {
      if (item.status === "submitted" || item.status === "done") return [];
      const offset = dueDayOffset(item.dueAt, now, timeZone);
      const kind: NoticeKind | null = offset < 0 ? "overdue" : offset === 0 ? "today" : offset === 1 ? "tomorrow" : null;
      if (!kind) return [];
      return [{ item, kind, offset }];
    })
    .sort((a, b) => a.offset - b.offset);

  for (const { item, kind } of ranked) {
    if (notices.length >= NOTICE_CAP) break;
    const title = item.title.replace(/\s+/g, " ").trim().slice(0, 120);
    if (!title) continue;
    const course = item.courseName?.replace(/\s+/g, " ").trim();
    const when = WHEN[kind];
    notices.push({
      id: item.id,
      kind,
      tag: `pane-${item.id}-${kind}-${today}`,
      title,
      body: course && course !== "Unsorted" ? `${when} · ${course}` : when,
    });
  }
  return notices;
}
