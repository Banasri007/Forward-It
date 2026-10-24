import { test, before } from "node:test";
import assert from "node:assert/strict";
import { DateTime } from "luxon";

// Keep the tests offline and away from the real data file.
process.env.DATA_FILE = ":memory:";
process.env.FORWARDIT_AI = "off";

let handleIncoming;
let store;
let tick;
const sent = [];

before(async () => {
  ({ handleIncoming } = await import("../src/bot.js"));
  store = await import("../src/store.js");
  ({ tick } = await import("../src/scheduler.js"));
  const { registerChannel } = await import("../src/outbox.js");
  registerChannel("test:", async (userId, text) => sent.push({ userId, text }));
});

const now = DateTime.fromISO("2026-10-24T15:00", { zone: "Asia/Kolkata" });
const say = (userId, text, at = now) => handleIncoming({ userId, text, now: at });

test("first message gets a welcome, then the saved tasks", async () => {
  const replies = await say("test:a", "Term-2 fee of ₹2,400 must be paid by 30 October.");
  assert.equal(replies.length, 2);
  assert.match(replies[0], /Forward-It/);
  assert.match(replies[1], /#1 Term-2 fee of ₹2,400/);
  assert.match(replies[1], /Reminder: Thu, 29 Oct, 8:00 PM/);
});

test("duplicates aren't saved twice", async () => {
  const replies = await say("test:a", "Term-2 fee of ₹2,400 must be paid by 30 October.");
  assert.match(replies[0], /Already on your list/);
  assert.equal(store.tasksFor("test:a").length, 1);
});

test("a task without a date asks when, and the answer sets the reminder", async () => {
  const [, ask] = await say("test:a", "renew bike insurance");
  assert.match(ask, /When is \*Renew bike insurance\* due/);
  const [answer] = await say("test:a", "Friday");
  assert.match(answer, /Reminder: Thu, 29 Oct, 8:00 PM/);
  assert.equal(store.findTask("test:a", 2).dueDate, "2026-10-30");
});

test("reminders fire on time, and a plain DONE ticks off the reminded task", async () => {
  await tick(DateTime.fromISO("2026-10-29T20:00:30", { zone: "Asia/Kolkata" }));
  const reminders = sent.filter((m) => m.userId === "test:a");
  assert.equal(reminders.length, 2);
  assert.match(reminders[0].text, /Reminder:\* #1 Term-2 fee/);
  assert.match(reminders[0].text, /📅 tomorrow/);

  const [reply] = await say("test:a", "done 1");
  assert.match(reply, /Done: Term-2 fee/);
  const [again] = await say("test:a", "👍");
  assert.match(again, /Done: Renew bike insurance/);
  assert.equal(store.tasksFor("test:a").length, 0);
});

test("LIST groups tasks, UNDO removes the last message's tasks", async () => {
  await say("test:b", "hi");
  await say("test:b", "Sabhi parents dhyan de: kal white chart paper lana hai. Aur Friday tak project file jama karni hai");
  const [list] = await say("test:b", "list");
  assert.match(list, /Aapki list/); // replies follow the user's Hinglish
  assert.match(list, /#1 .*chart paper/);
  const [undo] = await say("test:b", "undo");
  assert.match(undo, /2 item hata diye/);
  assert.equal(store.tasksFor("test:b").length, 0);
});

test("language can be switched", async () => {
  const [welcome] = await say("test:c", "HINDI");
  assert.match(welcome, /नमस्ते/);
  const [reply] = await say("test:c", "english");
  assert.match(reply, /reply in English/);
});

test("voice notes without an AI key get a helpful answer", async () => {
  const replies = await handleIncoming({ userId: "test:e", text: "", media: [{ contentType: "audio/ogg", data: "AAAA" }], now });
  assert.match(replies.at(-1), /voice notes/);
});

test("photos without an AI key get a helpful answer", async () => {
  const replies = await handleIncoming({ userId: "test:d", text: "", media: [{ contentType: "image/jpeg", data: "AAAA" }], now });
  assert.match(replies.at(-1), /paste the text/);
});
