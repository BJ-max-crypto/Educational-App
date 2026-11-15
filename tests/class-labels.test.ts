import assert from "node:assert/strict";
import test from "node:test";
import { readClassLabels } from "../lib/class-labels.ts";

const assignments = new Set(["a1", "a2", "a3"]);
const courses = new Set(["bio", "hist"]);

test("class labels keep only known assignments and classes", () => {
  const labels = readClassLabels(
    {
      labels: [
        { id: "a1", courseId: "bio", reason: "Same lab series" },
        { id: "missing", courseId: "bio", reason: "nope" },
        { id: "a2", courseId: "invented", reason: "nope" },
        { id: "a1", courseId: "hist", reason: "duplicate" },
        { id: "a2", courseId: "hist", reason: "  Chapter\nnotes  " },
        { id: "a3", courseId: "bio", reason: "" },
        "skip",
      ],
    },
    assignments,
    courses,
  );
  assert.deepEqual(labels, [
    { id: "a1", courseId: "bio", reason: "Same lab series" },
    { id: "a2", courseId: "hist", reason: "Chapter notes" },
    { id: "a3", courseId: "bio", reason: "Looks like this class." },
  ]);
});

test("class labels ignore a response that is not a list", () => {
  assert.deepEqual(readClassLabels({ labels: "all of them" }, assignments, courses), []);
  assert.deepEqual(readClassLabels(null, assignments, courses), []);
});
