import { atTime } from "@/lib/dates";
import type { Assignment, Course, Member } from "@/lib/types";

/**
 * Accent for AP Calculus BC is the Figma value (#4f7cff).
 * The other five accents could not be read before the Figma MCP rate limit.
 * They are distinct stand-ins so each course dot and icon stays identifiable.
 */
export const courses: Course[] = [
  {
    id: "calculus",
    name: "AP Calculus BC",
    teacher: "Mr. Rivera",
    period: "Period 3",
    color: "#4f7cff",
    initials: "Ca",
  },
  {
    id: "english",
    name: "English Literature",
    teacher: "Ms. Okafor",
    color: "#c43b6e",
    initials: "En",
  },
  {
    id: "chemistry",
    name: "AP Chemistry",
    teacher: "Dr. Lin",
    color: "#1b7f60",
    initials: "Ch",
  },
  {
    id: "history",
    name: "US History",
    teacher: "Mr. Brooks",
    color: "#c4552b",
    initials: "Hi",
  },
  {
    id: "spanish",
    name: "Spanish III",
    teacher: "Sra. Delgado",
    color: "#9a5b0a",
    initials: "Es",
  },
  {
    id: "cs",
    name: "Computer Science",
    teacher: "Ms. Patel",
    color: "#5b45d6",
    initials: "CS",
  },
];

export function buildAssignments(now: Date): Assignment[] {
  return [
    {
      id: "ps-73",
      courseId: "calculus",
      title: "Problem Set 7.3",
      dueAt: atTime(now, -1, 23, 59).toISOString(),
      status: "not_started",
      statusSource: "inferred",
    },
    {
      id: "series-quiz",
      courseId: "calculus",
      title: "Quiz: Series Convergence",
      dueAt: atTime(now, 1, 8, 30).toISOString(),
      status: "not_started",
      statusSource: "inferred",
    },
    {
      id: "ps-74",
      courseId: "calculus",
      title: "Problem Set 7.4",
      dueAt: atTime(now, 4, 23, 59).toISOString(),
      status: "in_progress",
      statusSource: "manual",
    },
    {
      id: "unit-7",
      courseId: "calculus",
      title: "Unit 7 Test",
      dueAt: atTime(now, 8, 8, 30).toISOString(),
      status: "not_started",
      statusSource: "inferred",
    },
    {
      id: "ps-72",
      courseId: "calculus",
      title: "Problem Set 7.2",
      dueAt: atTime(now, -5, 23, 59).toISOString(),
      status: "submitted",
      statusSource: "manual",
    },
    {
      id: "gatsby",
      courseId: "english",
      title: "Gatsby Ch. 5 Annotations",
      dueAt: atTime(now, 1, 23, 59).toISOString(),
      status: "not_started",
      statusSource: "inferred",
    },
    {
      id: "titration",
      courseId: "chemistry",
      title: "Lab Report: Titration",
      dueAt: atTime(now, -2, 23, 59).toISOString(),
      status: "not_started",
      statusSource: "inferred",
    },
    {
      id: "dbq",
      courseId: "history",
      title: "DBQ Essay Outline",
      dueAt: atTime(now, 3, 23, 59).toISOString(),
      status: "not_started",
      statusSource: "inferred",
    },
    {
      id: "oral",
      courseId: "spanish",
      title: "Spanish Oral Practice",
      dueAt: atTime(now, 0, 15, 0).toISOString(),
      status: "not_started",
      statusSource: "inferred",
    },
    {
      id: "vocab",
      courseId: "spanish",
      title: "Vocab Quiz: Preterite",
      dueAt: atTime(now, 6, 8, 0).toISOString(),
      status: "not_started",
      statusSource: "inferred",
    },
    {
      id: "text-adventure",
      courseId: "cs",
      title: "Project: Text Adventure",
      dueAt: atTime(now, 9, 23, 59).toISOString(),
      status: "not_started",
      statusSource: "inferred",
    },
  ];
}

/** Placeholder classmates from the course portal frame. Same roster on every course. */
export const members: Member[] = [
  { id: "maya", name: "Maya Chen", initials: "MC", grade: "Grade 11", color: "#4f7cff" },
  { id: "jordan", name: "Jordan Lee", initials: "JL", grade: "Grade 11", color: "#c43b6e" },
  { id: "priya", name: "Priya Nair", initials: "PN", grade: "Grade 11", color: "#1b7f60" },
  { id: "sam", name: "Sam Ortiz", initials: "SO", grade: "Grade 11", color: "#c4552b" },
  { id: "ethan", name: "Ethan Park", initials: "EP", grade: "Grade 11", color: "#5b45d6" },
  { id: "lena", name: "Lena Ruiz", initials: "LR", grade: "Grade 11", color: "#9a5b0a" },
  { id: "noah", name: "Noah Kim", initials: "NK", grade: "Grade 11", color: "#2f6f9f" },
  { id: "zoe", name: "Zoe Adams", initials: "ZA", grade: "Grade 11", color: "#7a4ea3" },
];

export const courseById = new Map(courses.map((course) => [course.id, course]));
