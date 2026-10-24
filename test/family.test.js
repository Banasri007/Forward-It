// Family sharing: one forward, reminders for everyone, "done" tells the others.
import { test, before } from "node:test";
import assert from "node:assert/strict";
import { DateTime } from "luxon";

process.env.DATA_FILE = ":memory:";
process.env.FORWARDIT_AI = "off";

let bot;
let store;
let tick;
const inbox = new Map(); // userId -> messages received
const received = (userId) => inbox.get(userId) ?? [];

before(async () => {
  bot = await import("../src/bot.js");
  store = await import("../src/store.js");
  ({ tick } = await import("../src/scheduler.js"));
  const { registerChannel } = await import("../src/outbox.js");
  registerChannel("fam:", async (userId, text) => inbox.set(userId, [...received(userId), text]));
});

const zone = "Asia/Kolkata";
const now = DateTime.fromISO("2026-10-24T15:00", { zone });
const PRIYA = "fam:+919000000001";
const RAHUL = "fam:+919000000002";

async function say(userId, text, at = now) {
  const replies = await bot.handleIncoming({ userId, text, now: at });
  await bot.settleNotices();
  return replies;
}

test("SHARE puts a family member on your list, and they're told", async () => {
  await say(PRIYA, "hi");
  await say(PRIYA, "name Priya");
  await say(RAHUL, "hi");
  await say(RAHUL, "my name is Rahul");
  await say(RAHUL, "Renew bike insurance by 5 November"); // Rahul's own task, before sharing: #1 in his list

  await say(PRIYA, "Term-2 fee of ₹2,400 must be paid by 30 October.");
  const [reply] = await say(PRIYA, "share 90000 00002");
  assert.match(reply, /\*Rahul\* is now on your family list/);
  assert.match(received(RAHUL).at(-1), /\*Priya\* added you to their Forward-It family list/);

  // One shared list, numbered without clashes.
  const numbers = store.tasksFor(RAHUL).map((t) => t.n).sort();
  assert.deepEqual(numbers, [1, 2]);
  const [list] = await say(RAHUL, "list");
  assert.match(list, /Term-2 fee.*_Priya_/); // tasks from others say who added them
  assert.match(list, /Renew bike insurance/);
});

test("a new forward lands on both phones", async () => {
  inbox.set(RAHUL, []);
  await say(PRIYA, "Parent-Teacher Meeting on Saturday 31 Oct, 10 AM. Please bring the diary.");
  assert.match(received(RAHUL).at(-1), /\*Priya\* added to your family list:\n📌 #3 Parent-Teacher Meeting/);
});

test("reminders go to everyone, and whoever finishes tells the others", async () => {
  inbox.clear();
  await tick(DateTime.fromISO("2026-10-29T20:00:30", { zone })); // fee reminder: the evening before
  assert.match(received(PRIYA).find((m) => /Term-2 fee/.test(m)), /Reminder/);
  assert.match(received(RAHUL).find((m) => /Term-2 fee/.test(m)), /Reminder/);

  const fee = store.tasksFor(PRIYA).find((t) => /Term-2 fee/.test(t.title));
  const [done] = await say(RAHUL, `done ${fee.n}`);
  assert.match(done, /Done: Term-2 fee/);
  assert.match(received(PRIYA).at(-1), /✅ \*Rahul\* ticked off: Term-2 fee/);
  assert.equal(fee.doneBy, RAHUL);
});

test("FAMILY lists members; LEAVE stops sharing", async () => {
  const [family] = await say(PRIYA, "family");
  assert.match(family, /Priya, Rahul/);

  const [left] = await say(RAHUL, "leave");
  assert.match(left, /left the family list/);
  assert.equal(store.tasksFor(RAHUL).length, 0); // a fresh, separate list
  assert.ok(store.tasksFor(PRIYA).length > 0); // the family's tasks stay
  const [alone] = await say(PRIYA, "family");
  assert.match(alone, /just you/);
});

test("you can't share with yourself", async () => {
  const [reply] = await say(PRIYA, "share +919000000001");
  assert.match(reply, /your own number/);
});

test("without a name, family see a masked number", () => {
  assert.equal(bot.displayName({ id: "whatsapp:+919876543210", name: null }), "+91 •••3210");
});
