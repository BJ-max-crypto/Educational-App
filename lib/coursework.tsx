"use client";

import { useRouter } from "next/navigation";
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  useSyncExternalStore,
  useTransition,
} from "react";
import { setAssignmentStatus, syncNow } from "@/app/(app)/actions";
import { dueThisWeek, isOverdue, isSubmitted, plannerBucket } from "@/lib/dates";
import type {
  Assignment,
  AssignmentStatus,
  Course,
  FeedSummary,
  PlannerBucket,
} from "@/lib/types";

let nowStamp = "";

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

export type ShellUser = {
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
  feed: FeedSummary | null;
  syncing: boolean;
  syncError: string | null;
  saveError: string | null;
  sync: () => void;
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
  courses,
  assignments: stored,
  feed,
  children,
}: {
  user: ShellUser;
  courses: Course[];
  assignments: Assignment[];
  feed: FeedSummary | null;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const nowIso = useSyncExternalStore(subscribeNow, getNowSnapshot, getServerNow);
  const now = useMemo(() => (nowIso ? new Date(nowIso) : null), [nowIso]);
  const [overrides, setOverrides] = useState<Record<string, AssignmentStatus>>({});
  const [saveError, setSaveError] = useState<string | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [syncing, startSync] = useTransition();

  const assignments = useMemo(
    () =>
      stored.map((assignment) => {
        const status = overrides[assignment.id];
        if (!status || status === assignment.status) return assignment;
        return { ...assignment, status, statusSource: "manual" as const };
      }),
    [stored, overrides],
  );

  const courseById = useMemo(
    () => new Map(courses.map((course) => [course.id, course])),
    [courses],
  );

  const toggleDone = useCallback(
    (id: string) => {
      const current = assignments.find((item) => item.id === id);
      if (!current) return;
      const previous = overrides[id];
      const next: AssignmentStatus = current.status === "submitted" ? "not_started" : "submitted";
      setSaveError(null);
      setOverrides((all) => ({ ...all, [id]: next }));
      void setAssignmentStatus(id, next).then((result) => {
        if (result.ok) return;
        setSaveError(result.error);
        setOverrides((all) => {
          const copy = { ...all };
          if (previous) copy[id] = previous;
          else delete copy[id];
          return copy;
        });
      });
    },
    [assignments, overrides],
  );

  const sync = useCallback(() => {
    setSyncError(null);
    startSync(async () => {
      const result = await syncNow();
      if (!result.ok) setSyncError(result.error);
      router.refresh();
    });
  }, [router]);

  const value = useMemo<CourseworkValue>(() => {
    const clock = now ?? new Date();
    return {
      ready: now !== null,
      now,
      user,
      courses,
      assignments,
      courseById,
      feed,
      syncing,
      syncError,
      saveError,
      sync,
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
  }, [assignments, courseById, courses, feed, now, saveError, sync, syncError, syncing, toggleDone, user]);

  return <CourseworkContext.Provider value={value}>{children}</CourseworkContext.Provider>;
}

export function useCoursework() {
  const value = useContext(CourseworkContext);
  if (!value) throw new Error("useCoursework must be used inside CourseworkProvider");
  return value;
}
