// Tiny JSON-file database. Plenty for a prototype: one file, written
// atomically, everything else in memory.
//
// Tasks belong to a household, so family members share one numbered list.
// Everyone starts in a household of their own; SHARE merges two households.
import fs from "node:fs";
import path from "node:path";
import { config } from "./config.js";

const inMemory = config.dataFile === ":memory:";
const SIM_LOG_LIMIT = 300;
const TWILIO_SEEN_LIMIT = 1000;

// twilioSeen: SIDs of WhatsApp messages already handled, so none is answered twice.
const emptyDb = () => ({ users: {}, households: {}, tasks: [], nextTaskId: 1, simLog: {}, twilioSeen: [] });
const emptyStats = () => ({ forwards: 0, noise: 0, reminders: 0, voiceNotes: 0 });

let db = load();
let saveTimer = null;

function load() {
  if (inMemory) return emptyDb();
  try {
    return migrate({ ...emptyDb(), ...JSON.parse(fs.readFileSync(config.dataFile, "utf8")) });
  } catch (err) {
    if (err.code !== "ENOENT") console.warn(`[store] Could not read ${config.dataFile}: ${err.message}`);
    return emptyDb();
  }
}

// Data files from before households existed kept a task list per user.
function migrate(data) {
  for (const user of Object.values(data.users)) {
    if (!user.householdId) {
      user.householdId = `h:${user.id}`;
      data.households[user.householdId] ??= { id: user.householdId, seq: user.seq ?? 0 };
    }
    user.name ??= null;
    user.stats = { ...emptyStats(), ...user.stats };
  }
  for (const task of data.tasks) {
    task.createdBy ??= task.userId;
    task.householdId ??= data.users[task.userId]?.householdId ?? `h:${task.userId}`;
  }
  return data;
}

export function flush() {
  clearTimeout(saveTimer);
  saveTimer = null;
  if (inMemory) return;
  fs.mkdirSync(path.dirname(config.dataFile), { recursive: true });
  const json = JSON.stringify(db, null, 2);
  const tmp = `${config.dataFile}.tmp`;
  try {
    fs.writeFileSync(tmp, json);
    fs.renameSync(tmp, config.dataFile);
  } catch {
    // Windows can refuse the rename if another program has the file open.
    fs.writeFileSync(config.dataFile, json);
  }
}

export function save() {
  if (!saveTimer) saveTimer = setTimeout(flush, 100);
}

function newHousehold(id) {
  return (db.households[id] ??= { id, seq: 0, createdAt: new Date().toISOString() });
}

export function getUser(id) {
  let user = db.users[id];
  if (!user) {
    user = db.users[id] = {
      id,
      name: null, // shown to family members; falls back to a masked number
      householdId: newHousehold(`h:${id}`).id,
      createdAt: new Date().toISOString(),
      lang: null, // chosen language; null = follow the user's messages
      detectedLang: null,
      lastBatchId: null, // tasks created by the last message (for UNDO)
      lastRef: null, // task number that DONE/LATER without a number refers to
      pending: null, // { n } while we wait for the user to give a date
      lastDigest: null,
      stats: emptyStats(),
    };
    save();
  }
  return user;
}

export function isNewUser(id) {
  return !db.users[id];
}

export function allUsers() {
  return Object.values(db.users);
}

export function bumpStat(userId, key, by = 1) {
  const user = getUser(userId);
  user.stats[key] = (user.stats[key] ?? 0) + by;
  save();
}

/* ---------- Households ---------- */

export function householdMembers(userId) {
  return membersOf(getUser(userId).householdId);
}

export function membersOf(householdId) {
  return allUsers().filter((u) => u.householdId === householdId);
}

/** Merge userId's household into otherUserId's. Tasks are renumbered into the shared list. */
export function joinHousehold(userId, otherUserId) {
  const from = getUser(userId).householdId;
  const to = getUser(otherUserId).householdId;
  if (from === to) return false;
  const home = newHousehold(to);
  for (const user of allUsers()) {
    if (user.householdId !== from) continue;
    user.householdId = to;
    Object.assign(user, { lastRef: null, lastBatchId: null, pending: null }); // old numbers no longer apply
  }
  for (const task of db.tasks) {
    if (task.householdId !== from) continue;
    task.householdId = to;
    task.n = ++home.seq;
  }
  delete db.households[from];
  save();
  return true;
}

/** Leave a shared list. Existing tasks stay with the family; new ones are yours alone. */
export function leaveHousehold(userId) {
  if (householdMembers(userId).length < 2) return false;
  const user = getUser(userId);
  user.householdId = newHousehold(`h:${userId}:${Date.now()}`).id;
  Object.assign(user, { lastRef: null, lastBatchId: null, pending: null });
  save();
  return true;
}

/** Remove a user, everyone in their household, and all of its tasks (demo reset). */
export function resetHousehold(userId) {
  delete db.simLog[userId];
  const user = db.users[userId];
  if (!user) return save();
  const { householdId } = user;
  db.tasks = db.tasks.filter((t) => t.householdId !== householdId);
  for (const member of allUsers().filter((u) => u.householdId === householdId)) {
    delete db.users[member.id];
    delete db.simLog[member.id];
  }
  delete db.households[householdId];
  save();
}

/* ---------- Tasks ---------- */

export function addTask(userId, fields) {
  const { householdId } = getUser(userId);
  const home = newHousehold(householdId);
  home.seq += 1;
  const task = {
    id: db.nextTaskId++,
    householdId,
    createdBy: userId,
    userId,
    n: home.seq,
    status: "active",
    createdAt: new Date().toISOString(),
    remindedAt: null,
    doneAt: null,
    doneBy: null,
    ...fields,
  };
  db.tasks.push(task);
  save();
  return task;
}

/** The household's active tasks, or active + done with includeClosed. */
export function tasksFor(userId, { includeClosed = false } = {}) {
  const { householdId } = getUser(userId);
  return db.tasks.filter(
    (t) => t.householdId === householdId && (includeClosed ? t.status !== "deleted" : t.status === "active"),
  );
}

export function findTask(userId, n) {
  const { householdId } = getUser(userId);
  return db.tasks.find((t) => t.householdId === householdId && t.n === n && t.status !== "deleted");
}

export function allActiveTasks() {
  return db.tasks.filter((t) => t.status === "active");
}

/* ---------- Channel bookkeeping ---------- */

export function seenTwilioMessage(sid) {
  return db.twilioSeen.includes(sid);
}

export function markTwilioMessage(sid) {
  db.twilioSeen.push(sid);
  if (db.twilioSeen.length > TWILIO_SEEN_LIMIT) db.twilioSeen.splice(0, db.twilioSeen.length - TWILIO_SEEN_LIMIT);
  save();
}

export function appendSimLog(userId, entry) {
  const log = (db.simLog[userId] ??= []);
  log.push(entry);
  if (log.length > SIM_LOG_LIMIT) log.splice(0, log.length - SIM_LOG_LIMIT);
  save();
}

export function simLog(userId) {
  return db.simLog[userId] ?? [];
}
