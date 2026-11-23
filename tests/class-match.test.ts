import assert from "node:assert/strict";
import test from "node:test";
import {
  academicYearLabel,
  canReuseClass,
  CLASS_CODE,
  classInviteCode,
  invitationExpiry,
  invitationState,
  parseAcademicYear,
  type ClassIdentity,
} from "../lib/class-match.ts";
import { rankSchoolCourses } from "../lib/school-course-match.ts";

const biology: ClassIdentity = {
  school: "Christian Brothers Academy",
  name: "AP Biology",
  teacher: "Mr. Smith",
  period: "2",
  academicYear: "2026-2027",
};

test("the school year rolls over in July", () => {
  assert.equal(academicYearLabel(new Date("2026-11-22T18:00:00Z")), "2026-2027");
  assert.equal(academicYearLabel(new Date("2026-06-15T18:00:00Z")), "2025-2026");
  assert.equal(parseAcademicYear("2026–2027"), "2026-2027");
  assert.equal(parseAcademicYear("2026-2028"), null);
});

test("the same class is reused and a different teacher, period, year, or school is not", () => {
  assert.equal(canReuseClass(biology, { ...biology, teacher: "mr smith" }), true);
  assert.equal(canReuseClass(biology, { ...biology, period: "Period 2" }), true);
  assert.equal(canReuseClass(biology, { ...biology, academicYear: "2026–2027" }), true);
  assert.equal(canReuseClass({ ...biology, academicYear: null }, biology), true);
  assert.equal(canReuseClass(biology, { ...biology, teacher: "Ms. Smith" }), false);
  assert.equal(canReuseClass(biology, { ...biology, period: "3" }), false);
  assert.equal(canReuseClass(biology, { ...biology, academicYear: "2025-2026" }), false);
  assert.equal(canReuseClass(biology, { ...biology, school: "Another School" }), false);
  assert.equal(canReuseClass(biology, { ...biology, name: "AP Biology Honors" }), false);
});

test("a similar name can be suggested without being treated as the same class", () => {
  const honors = {
    id: "honors",
    name: "AP Biology Honors",
    teacher: "Mr. Smith",
    period: "2",
    academicYear: "2026-2027",
    school: "Christian Brothers Academy",
  };
  const suggestions = rankSchoolCourses({ name: "AP Biology", teacher: "Smith" }, [honors]);
  assert.equal(suggestions.length, 1);
  assert.equal(
    canReuseClass(biology, {
      school: honors.school,
      name: honors.name,
      teacher: honors.teacher,
      period: honors.period,
      academicYear: honors.academicYear,
    }),
    false,
  );
});

test("revoked and expired invitations cannot be used", () => {
  const now = new Date("2026-11-22T18:00:00Z");
  assert.equal(invitationState(null, now), "missing");
  assert.equal(invitationState({ revokedAt: null, expiresAt: "2027-06-30T23:59:59Z" }, now), "open");
  assert.equal(invitationState({ revokedAt: "2026-11-01T00:00:00Z", expiresAt: null }, now), "revoked");
  assert.equal(invitationState({ revokedAt: null, expiresAt: "2026-11-22T18:00:00Z" }, now), "expired");
  assert.equal(invitationExpiry("2026-2027", now), "2027-06-30T23:59:59.000Z");
});

test("invitation codes match the public code shape", () => {
  const code = classInviteCode();
  assert.equal(CLASS_CODE.test(code), true);
  assert.equal(code.length, 8);
});
