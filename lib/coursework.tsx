"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useSyncExternalStore,
} from "react";
import { dueThisWeek, isOverdue, isSubmitted, plannerBucket } from "@/lib/dates";
import { buildAssignments, courseById, courses } from "@/lib/mock-data";
import type { Assignment, AssignmentStatus, Course, PlannerBucket } from "@/lib/types";

const STORAGE_KEY = "pane-assignment-status";
const STATUS_EVENT = "pane-status";
const EMPTY_OVERRIDES: Record<string, AssignmentStatus> = {};

let overridesCache: Record<string, AssignmentStatus> = EMPTY_OVERRIDES;
let overridesRaw = "";
let nowStamp = "";

function subscribeOverrides(onStoreChange: () => void) {
  window.addEventListener(STATUS_EVENT, onStoreChange);
  window.addEventListener("storage", onStoreChange);
  return () => {
    window.removeEventListener(STATUS_EVENT, onStoreChange);
    window.removeEventListener("storage", onStoreChange);
  };
}

function getOverridesSnapshot() {
  const raw = window.localStorage.getItem(STORAGE_KEY) ?? "";
  if (raw === overridesRaw) return overridesCache;
  overridesRaw = raw;
  if (!raw) {
    overridesCache = EMPTY_OVERRIDES;
    return overridesCache;
  }
  try {
    overridesCache = JSON.parse(raw) as Record<string, AssignmentStatus>;
  } catch {
    overridesCache = EMPTY_OVERRIDES;
  }
  return overridesCache;
}

function getServerOverrides() {
  return EMPTY_OVERRIDES;
}

function writeOverrides(next: Record<string, AssignmentStatus>) {
  const raw = JSON.stringify(next);
  window.localStorage.setItem(STORAGE_KEY, raw);
  overridesRaw = raw;
  overridesCache = next;
  window.dispatchEvent(new Event(STATUS_EVENT));
}

function subscribeNow() {
  return () => {};
}

function getNowSnapshot() {
  if (!nowStamp) nowStamp = new Date().toISOString();
  return nowStamp;
}

function getServerNow() {
  return "";
}

type ShellUser = {
  name: string;
  initial: string;
  email: string;
  school: string | null;
  grade: string | null;
};

type CourseworkValue = {
  ready: boolean;
  now: Date | null;
  user: ShellUser;
  courses: Course[];
  assignments: Assignment[];
  courseById: Map<string, Course>;
  toggleDone: (id: string) => void;
  openAssignments: (courseId: string) => Assignment[];
  completedAssignments: (courseId: string) => Assignment[];
  nextUp: (courseId: string) => Assignment | null;
  overdueCount: (courseId?: string) => number;
  upcomingCount: (courseId?: string) => number;
  dueThisWeekCount: () => number;
  plannerGroups: () => Record<PlannerBucket, Assignment[]>;
};

const CourseworkContext = createContext<CourseworkValue | null>(null);

function sortByDue(items: Assignment[]) {
  return [...items].sort(
    (a, b) => new Date(a.dueAt).getTime() - new Date(b.dueAt).getTime(),
  );
}

export function CourseworkProvider({
  user,
  children,
}: {
  user: ShellUser;
  children: React.ReactNode;
}) {
  const nowIso = useSyncExternalStore(subscribeNow, getNowSnapshot, getServerNow);
  const overrides = useSyncExternalStore(
    subscribeOverrides,
    getOverridesSnapshot,
    getServerOverrides,
  );
  const now = useMemo(() => (nowIso ? new Date(nowIso) : null), [nowIso]);

  const assignments = useMemo(() => {
    if (!now) return [];
    return buildAssignments(now).map((assignment) => {
      const status = overrides[assignment.id];
      if (!status) return assignment;
      return { ...assignment, status, statusSource: "manual" as const };
    });
  }, [now, overrides]);

  const toggleDone = useCallback(
    (id: string) => {
      const base = buildAssignments(now ?? new Date()).find((item) => item.id === id);
      const existing = overrides[id] ?? base?.status ?? "not_started";
      const next: AssignmentStatus = existing === "submitted" ? "not_started" : "submitted";
      writeOverrides({ ...overrides, [id]: next });
    },
    [now, overrides],
  );

  const value = useMemo<CourseworkValue>(() => {
    const clock = now ?? new Date();
    return {
      ready: now !== null,
      now,
      user,
      courses,
      assignments,
      courseById,
      toggleDone,
      openAssignments(courseId) {
        return sortByDue(
          assignments.filter(
            (item) => item.courseId === courseId && !isSubmitted(item),
          ),
        ).sort((a, b) => Number(isOverdue(b, clock)) - Number(isOverdue(a, clock)));
      },
      completedAssignments(courseId) {
        return assignments.filter(
          (item) => item.courseId === courseId && isSubmitted(item),
        );
      },
      nextUp(courseId) {
        const open = sortByDue(
          assignments.filter((item) => item.courseId === courseId && !isSubmitted(item)),
        );
        return open[0] ?? null;
      },
      overdueCount(courseId) {
        return assignments.filter(
          (item) =>
            (courseId === undefined || item.courseId === courseId) && isOverdue(item, clock),
        ).length;
      },
      upcomingCount(courseId) {
        return assignments.filter(
          (item) =>
            (courseId === undefined || item.courseId === courseId) && !isSubmitted(item),
        ).length;
      },
      dueThisWeekCount() {
        return assignments.filter((item) => dueThisWeek(item, clock)).length;
      },
      plannerGroups() {
        const groups: Record<PlannerBucket, Assignment[]> = {
          overdue: [],
          today: [],
          tomorrow: [],
          week: [],
        };
        for (const item of assignments) {
          const bucket = plannerBucket(item, clock);
          if (bucket) groups[bucket].push(item);
        }
        for (const bucket of Object.keys(groups) as PlannerBucket[]) {
          groups[bucket] = sortByDue(groups[bucket]);
        }
        return groups;
      },
    };
  }, [assignments, now, toggleDone, user]);

  return <CourseworkContext.Provider value={value}>{children}</CourseworkContext.Provider>;
}

export function useCoursework() {
  const value = useContext(CourseworkContext);
  if (!value) throw new Error("useCoursework must be used inside CourseworkProvider");
  return value;
}
