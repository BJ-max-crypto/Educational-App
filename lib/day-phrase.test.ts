import assert from "node:assert/strict";
import test from "node:test";
import {
  datedDay,
  dayPhrase,
  dueDetailPhrase,
  inCurrentWeek,
  plannerWhenPhrase,
  spokenDay,
  weekKey,
} from "./day-phrase.ts";

/** Saturday, Sep 26, 2026. That week is Mon Sep 21 – Sun Sep 27. */
const saturday = { year: 2026, month: 9, day: 26 };

test("this Monday is the Monday of the current week, not a later one", () => {
  const thisMonday = { year: 2026, month: 9, day: 21 };
  const nextMonday = { year: 2026, month: 9, day: 28 };
  assert.equal(weekKey(thisMonday), weekKey(saturday));
  assert.notEqual(weekKey(nextMonday), weekKey(saturday));
  assert.equal(inCurrentWeek(thisMonday, saturday), true);
  assert.equal(dayPhrase(thisMonday, saturday), "this Monday");
  assert.equal(dayPhrase(nextMonday, saturday), "Monday, Sep 28");
  assert.equal(spokenDay(nextMonday, saturday), "Monday, Sep 28");
});

test("a date months away is the weekday and the date", () => {
  const march = { year: 2027, month: 3, day: 1 };
  assert.equal(datedDay(march), "Monday, Mar 1");
  assert.equal(dayPhrase(march, saturday), "Monday, Mar 1");
  assert.equal(dueDetailPhrase(march, saturday, "11:59 PM"), "Due Monday, Mar 1 · 11:59 PM");
  assert.equal(plannerWhenPhrase(march, saturday, "11:59 PM"), "Monday, Mar 1");
  assert.doesNotMatch(dueDetailPhrase(march, saturday, "11:59 PM"), /next/i);
});

test("other days in this week say this weekday; today and tomorrow stay specific", () => {
  const monday = { year: 2026, month: 9, day: 21 };
  const thursday = { year: 2026, month: 9, day: 24 };
  const sunday = { year: 2026, month: 9, day: 27 };
  assert.equal(dueDetailPhrase(thursday, monday, "4:00 PM"), "Due this Thursday · 4:00 PM");
  assert.equal(plannerWhenPhrase(thursday, monday, "4:00 PM"), "this Thursday");
  assert.equal(dueDetailPhrase(sunday, saturday, "9:00 AM"), "Due tomorrow · 9:00 AM");
  assert.equal(plannerWhenPhrase(sunday, saturday, "9:00 AM"), "Tomorrow");
  assert.equal(dueDetailPhrase(saturday, saturday, "3:00 PM"), "Due today · 3:00 PM");
  assert.equal(plannerWhenPhrase(saturday, saturday, "3:00 PM"), "3:00 PM");
});

test("overdue work in this week says this weekday; older overdue shows the date", () => {
  const friday = { year: 2026, month: 9, day: 25 };
  const thisMonday = { year: 2026, month: 9, day: 21 };
  const oldMonday = { year: 2026, month: 3, day: 2 };
  assert.equal(dueDetailPhrase(friday, saturday, "8:00 AM"), "Overdue · Yesterday");
  assert.equal(plannerWhenPhrase(friday, saturday, "8:00 AM"), "Yesterday");
  assert.equal(dueDetailPhrase(thisMonday, saturday, "11:59 PM"), "Overdue · this Monday · 11:59 PM");
  assert.equal(plannerWhenPhrase(thisMonday, saturday, "11:59 PM"), "this Monday");
  assert.equal(datedDay(oldMonday), "Monday, Mar 2");
  assert.equal(dueDetailPhrase(oldMonday, saturday, "3:00 PM"), "Overdue · Monday, Mar 2 · 3:00 PM");
  assert.doesNotMatch(dueDetailPhrase(oldMonday, saturday, "3:00 PM"), /days ago|next/i);
});
