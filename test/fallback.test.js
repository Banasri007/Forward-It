import { test } from "node:test";
import assert from "node:assert/strict";
import { DateTime } from "luxon";
import { detectLanguage, extractFallback, parseDateReply } from "../src/extract/fallback.js";

const now = DateTime.fromISO("2026-10-24T15:00", { zone: "Asia/Kolkata" }); // a Saturday
const pick = (task) => [task.dueDate, task.dueTime, task.amount, task.kind];

test("school circular: three tasks with dates, amount and kinds", () => {
  const { tasks } = extractFallback(
    `*Sunrise Public School*\nDear Parents,\n` +
      `1. Term-2 fee of ₹2,400 must be paid by 30 October. Late fee ₹100 after that.\n` +
      `2. Parent-Teacher Meeting on Saturday 31 Oct, 10 AM to 12 PM. Please bring the student's diary.\n` +
      `3. Students must wear a white shirt tomorrow for the Annual Day rehearsal.\nRegards, Class Teacher`,
    now,
  );
  assert.deepEqual(tasks.map(pick), [
    ["2026-10-30", null, "₹2,400", "payment"],
    ["2026-10-31", "10:00", null, "event"],
    ["2026-10-25", null, null, "bring_item"],
  ]);
});

test("bill SMS with a day-first numeric date", () => {
  const { tasks } = extractFallback("Your electricity bill of Rs. 1,385.00 is due on 27-10-2026. Pay via app.", now);
  assert.deepEqual(tasks.map(pick), [["2026-10-27", null, "₹1,385", "payment"]]);
});

test("'Dr.' doesn't split a sentence, and '15 min early' isn't a task", () => {
  const { tasks } = extractFallback(
    "Your appointment with Dr. Mehta is confirmed for Tue, 28 Oct at 11:30 AM. Please arrive 15 min early.",
    now,
  );
  assert.equal(tasks.length, 1);
  assert.match(tasks[0].title, /Dr\. Mehta/);
  assert.deepEqual(pick(tasks[0]), ["2026-10-28", "11:30", null, "event"]);
});

test("Hinglish: kal = tomorrow, 'Friday tak' = by Friday", () => {
  const result = extractFallback(
    "Sabhi parents dhyan de: kal sabko ek white chart paper aur glue stick lana hai. Aur Friday tak project file jama karni hai 🙏",
    now,
  );
  assert.equal(result.language, "hinglish");
  assert.deepEqual(result.tasks.map(pick), [
    ["2026-10-25", null, null, "bring_item"],
    ["2026-10-30", null, null, "deadline"],
  ]);
  assert.equal(result.tasks[1].title, "Friday tak project file jama karni hai");
});

test("Hindi: कल शाम 5 बजे = tomorrow 5 PM", () => {
  const result = extractFallback("कल शाम 5 बजे बिजली का बिल जमा करना है", now);
  assert.equal(result.language, "hi");
  assert.deepEqual(result.tasks.map(pick), [["2026-10-25", "17:00", null, "payment"]]);
});

test("good-morning forwards are ignored", () => {
  const result = extractFallback("🌞 Good morning! Have a blessed Sunday. Forward to 10 people for good luck 🌸", now);
  assert.equal(result.tasks.length, 0);
});

test("an action with no date becomes an undated task", () => {
  const { tasks } = extractFallback("renew bike insurance", now);
  assert.deepEqual(tasks.map(pick), [[null, null, null, "todo"]]);
});

test("date replies", () => {
  assert.deepEqual(parseDateReply("Friday", now), { dueDate: "2026-10-30", dueTime: null });
  assert.deepEqual(parseDateReply("kal 6 baje shaam", now), { dueDate: "2026-10-25", dueTime: "18:00" });
  assert.deepEqual(parseDateReply("skip", now), { skip: true });
  assert.equal(parseDateReply("what?", now), null);
});

test("language detection", () => {
  assert.equal(detectLanguage("Please pay the fee"), "en");
  assert.equal(detectLanguage("kal fee jama karni hai"), "hinglish");
  assert.equal(detectLanguage("फीस जमा करनी है"), "hi");
});
