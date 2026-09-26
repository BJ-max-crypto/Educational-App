"use client";

import { useRouter } from "next/navigation";
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  useTransition,
} from "react";
import {
  createCourse as createCourseAction,
  setAssignmentCourses,
  setAssignmentStatus,
  suggestForCourse,
  syncNow,
} from "@/app/(app)/actions";
import { dueThisWeek, initials, isOverdue, isSubmitted, plannerBucket } from "@/lib/dates";
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

export type TagSuggestions = {
  courseId: string;
  items: { id: string; title: string; reasons: string[] }[];
  loading: boolean;
  error: string | null;
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
  /** Real courses, without the Unsorted bucket. */
  taggableCourses: Course[];
  unsortedCourseId: string | null;
  unsortedAssignments: Assignment[];
  assignCourse: (assignmentIds: string[], courseId: string | null) => Promise<boolean>;
  createCourse: (name: string) => Promise<{ id: string } | { error: string }>;
  /** Unsorted items that look like the same class as a course's tagged items. */
  tagSuggestions: TagSuggestions | null;
  findSimilar: (courseId: string) => Promise<void>;
  acceptSuggestions: (ids: string[]) => Promise<boolean>;
  dismissSuggestions: () => void;
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
  courses: storedCourses,
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
  const [courseMoves, setCourseMoves] = useState<Record<string, string>>({});
  const [newCourses, setNewCourses] = useState<Course[]>([]);

  const courses = useMemo(() => {
    const known = new Set(storedCourses.map((course) => course.id));
    return [...storedCourses, ...newCourses.filter((course) => !known.has(course.id))];
  }, [storedCourses, newCourses]);
  const unsortedCourseId = courses.find((course) => course.isUnsorted)?.id ?? null;

  const assignments = useMemo(
    () =>
      stored.map((assignment) => {
        const status = overrides[assignment.id];
        const moved = courseMoves[assignment.id];
        let next = assignment;
        if (status && status !== assignment.status) {
          next = { ...next, status, statusSource: "manual" as const };
        }
        if (moved && moved !== assignment.courseId) next = { ...next, courseId: moved };
        return next;
      }),
    [stored, overrides, courseMoves],
  );

  const [tagSuggestions, setTagSuggestions] = useState<TagSuggestions | null>(null);
  const dismissed = useRef(new Set<string>());
  const suggestRequest = useRef(0);

  const findSimilar = useCallback(
    async (courseId: string, { quiet = false }: { quiet?: boolean } = {}) => {
      const request = ++suggestRequest.current;
      if (!quiet) setTagSuggestions({ courseId, items: [], loading: true, error: null });
      const result = await suggestForCourse(courseId).catch(() => ({
        ok: false as const,
        error: "Couldn't look for similar items.",
      }));
      if (request !== suggestRequest.current) return;
      if (!result.ok) {
        setTagSuggestions(quiet ? null : { courseId, items: [], loading: false, error: result.error });
        return;
      }
      // Automatic suggestions skip items the student already turned down; "Find similar" doesn't.
      const items = quiet
        ? result.suggestions.filter((item) => !dismissed.current.has(`${courseId}:${item.id}`))
        : result.suggestions;
      setTagSuggestions(
        items.length || !quiet ? { courseId, items, loading: false, error: null } : null,
      );
    },
    [],
  );

  const dismissSuggestions = useCallback(
    (ids?: string[]) => {
      suggestRequest.current++;
      const current = tagSuggestions;
      setTagSuggestions(null);
      if (!current) return;
      const skip = ids ?? current.items.map((item) => item.id);
      for (const id of skip) dismissed.current.add(`${current.courseId}:${id}`);
    },
    [tagSuggestions],
  );

  const assignCourse = useCallback(
    async (assignmentIds: string[], courseId: string | null) => {
      const target = courseId ?? unsortedCourseId;
      const previous = courseMoves;
      setSaveError(null);
      if (target) {
        setCourseMoves((all) => {
          const copy = { ...all };
          for (const id of assignmentIds) copy[id] = target;
          return copy;
        });
      }
      const result = await setAssignmentCourses(assignmentIds, courseId).catch(() => ({
        ok: false as const,
        error: "Couldn't save that tag. Try again.",
      }));
      if (!result.ok) {
        setSaveError(result.error);
        setCourseMoves(previous);
        return false;
      }
      router.refresh();
      if (courseId) void findSimilar(courseId, { quiet: true });
      return true;
    },
    [courseMoves, findSimilar, router, unsortedCourseId],
  );

  const acceptSuggestions = useCallback(
    async (ids: string[]) => {
      const current = tagSuggestions;
      if (!current || !ids.length) return false;
      const chosen = new Set(ids);
      dismissSuggestions(current.items.filter((item) => !chosen.has(item.id)).map((item) => item.id));
      return assignCourse(ids, current.courseId);
    },
    [assignCourse, dismissSuggestions, tagSuggestions],
  );

  const createCourse = useCallback(async (name: string) => {
    const result = await createCourseAction(name).catch(() => ({
      ok: false as const,
      error: "Couldn't create that course. Try again.",
    }));
    if (!result.ok) return { error: result.error };
    const { course } = result;
    setNewCourses((all) => [
      ...all,
      { id: course.id, name: course.name, color: course.color, teacher: "", initials: initials(course.name) },
    ]);
    return { id: course.id };
  }, []);

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
      taggableCourses: courses.filter((course) => !course.isUnsorted),
      unsortedCourseId,
      unsortedAssignments: sortByDue(
        assignments.filter((item) => item.courseId === unsortedCourseId),
      ),
      assignCourse,
      createCourse,
      tagSuggestions: tagSuggestions && {
        ...tagSuggestions,
        items: tagSuggestions.items.filter(
          (item) => courseMoves[item.id] !== tagSuggestions.courseId,
        ),
      },
      findSimilar: (courseId) => findSimilar(courseId),
      acceptSuggestions,
      dismissSuggestions: () => dismissSuggestions(),
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
  }, [
    acceptSuggestions,
    courseMoves,
    dismissSuggestions,
    findSimilar,
    tagSuggestions,
    assignCourse,
    assignments,
    courseById,
    courses,
    createCourse,
    feed,
    now,
    saveError,
    sync,
    syncError,
    syncing,
    toggleDone,
    unsortedCourseId,
    user,
  ]);

  return <CourseworkContext.Provider value={value}>{children}</CourseworkContext.Provider>;
}

export function useCoursework() {
  const value = useContext(CourseworkContext);
  if (!value) throw new Error("useCoursework must be used inside CourseworkProvider");
  return value;
}
