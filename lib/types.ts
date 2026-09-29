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
  school: string | null;
  schoolLocation: string | null;
  grade: string | null;
  /** Classes this person created. Empty until the connection is accepted. */
  theirCourses: string[];
  status: "incoming" | "outgoing" | "accepted";
  /** This person's own classes. Empty until the connection is accepted. */
  sharedClasses: SharedClass[];
  /** Class keys both people are sharing. Empty until the connection is accepted. */
  myClasses: string[];
  /** Same shared keys, once the connection is accepted. */
  theirClasses: string[];
};

export type Schoolmate = {
  profileId: string;
  name: string;
  username: string;
  school: string | null;
  schoolLocation: string | null;
  grade: string | null;
  classes: string[];
};

export type FeedSummary = {
  status: "pending" | "ok" | "error";
  lastSyncedAt: string | null;
  lastError: string | null;
};

export type PlannerBucket = "overdue" | "today" | "tomorrow" | "week";
