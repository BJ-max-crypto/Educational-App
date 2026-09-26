import assert from "node:assert/strict";
import test from "node:test";
import { countDoneThisWeek, shareStatLine } from "./share-stats.ts";

/** Saturday, Sep 26, 2026. That week is Mon Sep 21 – Sun Sep 27. */
const saturday = new Date(2026, 8, 26, 15, 0);

test("done this week counts only submitted work due this Monday through Sunday", () => {
  const items = [
    { status: "submitted", dueAt: new Date(2026, 8, 21, 23, 0).toISOString() },
    { status: "submitted", dueAt: new Date(2026, 8, 27, 9, 0).toISOString() },
    { status: "submitted", dueAt: new Date(2026, 8, 28, 9, 0).toISOString() },
    { status: "submitted", dueAt: new Date(2026, 8, 20, 9, 0).toISOString() },
    { status: "not_started", dueAt: new Date(2026, 8, 24, 9, 0).toISOString() },
  ];
  assert.equal(countDoneThisWeek(items, saturday), 2);
});

test("the share line is only the two counts", () => {
  assert.equal(shareStatLine(0, 12), "0 overdue · 12 done this week");
});
