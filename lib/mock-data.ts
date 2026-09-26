import type { Member } from "@/lib/types";

/**
 * Placeholder classmates from the course portal frame. Same roster on every course.
 * The Schoology iCal feed has no roster, so these stay mock until a roster source exists.
 */
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
