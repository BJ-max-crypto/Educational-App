import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { classmatesInCourse, sharedCourseNames, validateUsername } from "./classmates.ts";

describe("validateUsername", () => {
  it("keeps a plain username and strips an @", () => {
    assert.deepEqual(validateUsername("  @Maya_1 "), { value: "maya_1" });
  });

  it("rejects spaces, short names, and reserved words", () => {
    assert.equal("error" in validateUsername("ab"), true);
    assert.equal("error" in validateUsername("maya chen"), true);
    assert.equal("error" in validateUsername("admin"), true);
  });
});

describe("classmatesInCourse", () => {
  const people = [
    { name: "Maya", courseNames: ["Biology", "Algebra"] },
    { name: "Jordan", courseNames: ["Chemistry"] },
    { name: "Sam", courseNames: ["Unsorted"] },
  ];

  it("matches the same class name, ignoring case and extra spaces", () => {
    const found = classmatesInCourse(people, { name: "  biology " });
    assert.deepEqual(
      found.map((person) => person.name),
      ["Maya"],
    );
  });

  it("hides everyone on the Unsorted bucket", () => {
    assert.deepEqual(classmatesInCourse(people, { name: "Unsorted", isUnsorted: true }), []);
  });
});

describe("sharedCourseNames", () => {
  it("returns only the classes both people tagged", () => {
    const mine = [
      { name: "Biology", isUnsorted: false },
      { name: "Art", isUnsorted: false },
      { name: "Unsorted", isUnsorted: true },
    ];
    assert.deepEqual(sharedCourseNames(mine, ["biology", "History"]), ["Biology"]);
  });
});
