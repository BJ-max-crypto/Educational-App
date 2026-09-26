export type AssignmentStatus = "not_started" | "in_progress" | "submitted";

export type StatusSource = "manual" | "inferred";

export type Course = {
  id: string;
  name: string;
  teacher: string;
  /** Display-only. Not a database column. */
  period?: string;
  color: string;
  initials: string;
  isUnsorted?: boolean;
};

export type Assignment = {
  id: string;
  courseId: string;
  title: string;
  dueAt: string;
  status: AssignmentStatus;
  statusSource: StatusSource;
  url?: string;
};

/** Someone you're connected with. Shown on a course only when you share that class name. */
export type Classmate = {
  profileId: string;
  name: string;
  username: string;
  grade: string | null;
  school: string | null;
  avatarUrl: string | null;
  initials: string;
  color: string;
  courseNames: string[];
};

export type FeedSummary = {
  status: "pending" | "ok" | "error";
  lastSyncedAt: string | null;
  lastError: string | null;
};

export type PlannerBucket = "overdue" | "today" | "tomorrow" | "week";
