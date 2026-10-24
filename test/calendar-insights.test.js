import { test } from "node:test";
import assert from "node:assert/strict";
import { DateTime } from "luxon";

process.env.DATA_FILE = ":memory:";
process.env.FORWARDIT_AI = "off";

const { toIcs } = await import("../src/calendar.js");
const store = await import("../src/store.js");
const { insightsFor } = await import("../src/insights.js");

const zone = "Asia/Kolkata";
const now = DateTime.fromISO("2026-10-24T15:00", { zone });
const base = { householdId: "h:sim:demo", status: "active", remindedAt: null, details: null, amount: null, sourceQuote: null };

test("calendar export: all-day and timed events, reminders as alarms", () => {
  const ics = toIcs(
    [
      { ...base, n: 1, title: "Pay fee, term 2; ₹2,400", dueDate: "2026-10-30", dueTime: null, remindAt: "2026-10-29T20:00:00.000+05:30", amount: "₹2,400" },
      { ...base, n: 2, title: "Attend parent-teacher meeting", dueDate: "2026-10-31", dueTime: "10:00", remindAt: null },
      { ...base, n: 3, title: "No date", dueDate: null, dueTime: null, remindAt: null },
      { ...base, n: 4, title: "Already done", dueDate: "2026-10-30", dueTime: null, remindAt: null, status: "done" },
    ],
    { now },
  );
  assert.ok(ics.startsWith("BEGIN:VCALENDAR\r\n") && ics.endsWith("END:VCALENDAR\r\n"));
  assert.equal(ics.match(/BEGIN:VEVENT/g).length, 2); // undated and finished tasks are left out
  assert.match(ics, /DTSTART;VALUE=DATE:20261030\r\nDTEND;VALUE=DATE:20261031/);
  assert.match(ics, /SUMMARY:Pay fee\\, term 2\\; ₹2\\,400/);
  assert.match(ics, /TRIGGER;VALUE=DATE-TIME:20261029T143000Z/); // 8 PM IST
  assert.match(ics, /DTSTART:20261031T043000Z\r\nDTEND:20261031T053000Z/); // 10 AM IST, one hour
  assert.ok(ics.split("\r\n").every((line) => Buffer.byteLength(line) <= 75), "long lines are folded");
});

test("impact numbers come from what actually happened", () => {
  const user = "sim:impact";
  store.getUser(user);
  const add = (fields) => store.addTask(user, { kind: "payment", source: "text", dueTime: null, ...fields });
  const onTime = add({ title: "Paid on time", dueDate: "2026-10-30" });
  Object.assign(onTime, { status: "done", doneAt: "2026-10-28T10:00:00.000+05:30" });
  const late = add({ title: "Paid late", dueDate: "2026-10-20" });
  Object.assign(late, { status: "done", doneAt: "2026-10-22T10:00:00.000+05:30" });
  add({ title: "Missed", dueDate: "2026-10-23", kind: "event" });
  add({ title: "This week", dueDate: "2026-10-27", source: "photo" });
  store.bumpStat(user, "forwards", 5);
  store.bumpStat(user, "noise", 1);

  const result = insightsFor(user, now);
  assert.deepEqual(
    [result.captured, result.done, result.doneOnTime, result.missed, result.active, result.dueThisWeek, result.forwards, result.noise],
    [4, 2, 1, 1, 2, 1, 5, 1],
  );
  assert.deepEqual(result.byKind, { payment: 3, event: 1 });
  assert.deepEqual(result.bySource, { text: 3, photo: 1 });
});
