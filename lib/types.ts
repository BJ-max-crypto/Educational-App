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

export type Classmate = {
  id: string;
  name: string;
  username: string;
  initials: string;
  color: string;
  grade: string | null;
};

export type SharedClass = {
  /** Lowercased course name. The same key on both accounts means the same class. */
  key: string;
  name: string;
};

export type PersonConnection = {
  id: string;
  profileId: string;
  name: string;
  username: string;
  status: "incoming" | "outgoing" | "accepted";
  /** Classes you both currently have. */
  sharedClasses: SharedClass[];
  /** Class keys this person checked. */
  myClasses: string[];
  /** Class keys the other person checked. */
  theirClasses: string[];
};

export type FeedSummary = {
  status: "pending" | "ok" | "error";
  lastSyncedAt: string | null;
  lastError: string | null;
};

export type PlannerBucket = "overdue" | "today" | "tomorrow" | "week";
