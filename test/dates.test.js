import { test } from "node:test";
import assert from "node:assert/strict";
import { DateTime } from "luxon";
import { planReminder } from "../src/dates.js";

const zone = "Asia/Kolkata";
const at = (iso) => DateTime.fromISO(iso, { zone });
const plan = (task, now) => planReminder(task, at(now)).at?.toFormat("yyyy-MM-dd HH:mm") ?? null;

test("reminds the evening before a dated task", () => {
  assert.equal(plan({ dueDate: "2026-10-30" }, "2026-10-24T15:00"), "2026-10-29 20:00");
});

test("reminds the evening before an event with a time", () => {
  assert.equal(plan({ dueDate: "2026-10-31", dueTime: "10:00" }, "2026-10-24T15:00"), "2026-10-30 20:00");
});

test("due tomorrow, asked at 3 PM: reminds tonight at 8 PM", () => {
  assert.equal(plan({ dueDate: "2026-10-25" }, "2026-10-24T15:00"), "2026-10-24 20:00");
});

test("due tomorrow morning, asked late at night: reminds 2 hours before", () => {
  assert.equal(plan({ dueDate: "2026-10-25", dueTime: "10:00" }, "2026-10-24T22:00"), "2026-10-25 08:00");
});

test("due tomorrow with no time, asked late at night: reminds in the morning", () => {
  assert.equal(plan({ dueDate: "2026-10-25" }, "2026-10-24T22:30"), "2026-10-25 07:30");
});

test("due today with no time: reminds in an hour", () => {
  assert.equal(plan({ dueDate: "2026-10-24" }, "2026-10-24T15:00"), "2026-10-24 16:00");
});

test("due in 20 minutes: reminds in a minute", () => {
  assert.equal(plan({ dueDate: "2026-10-24", dueTime: "15:20" }, "2026-10-24T15:00"), "2026-10-24 15:01");
});

test("an explicit 'remind me at' wins", () => {
  assert.equal(plan({ dueDate: "2026-10-30", remindAt: "2026-10-28T18:00" }, "2026-10-24T15:00"), "2026-10-28 18:00");
});

test("past dates get no reminder and are flagged", () => {
  const result = planReminder({ dueDate: "2026-10-20" }, at("2026-10-24T15:00"));
  assert.equal(result.at, null);
  assert.equal(result.past, true);
});

test("no date, no reminder", () => {
  assert.deepEqual(planReminder({ dueDate: null }, at("2026-10-24T15:00")), { at: null, past: false });
});
