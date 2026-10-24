// Sends reminders when they're due, and a short summary each morning.
import * as store from "./store.js";
import { config } from "./config.js";
import { send } from "./outbox.js";
import { formatDue, fromIso, nowLocal } from "./dates.js";
import { KIND_ICON, langOf } from "./bot.js";
import { t } from "./i18n.js";

const TICK_MS = 15_000;
let running = false;

export function startScheduler() {
  setInterval(() => tick().catch((err) => console.error("[scheduler]", err)), TICK_MS);
}

/** Remind everyone in the task's family. */
export async function sendReminder(task, now = nowLocal()) {
  task.remindedAt = now.toISO();
  store.bumpStat(task.createdBy, "reminders");
  const members = store.membersOf(task.householdId);
  for (const member of members) member.lastRef = task.n; // so a plain "DONE" or "👍" reply means this task
  store.save();
  for (const member of members) {
    const lang = langOf(member);
    await send(member.id, t(lang, "reminder", { title: `#${task.n} ${task.title}`, due: formatDue(task, lang, now) })).catch((err) =>
      console.error(`[scheduler] Reminder #${task.n} to ${member.id} failed:`, err.message),
    );
  }
}

/** Reminders still to send, soonest first; for one user's family if userId is given. */
export function pendingReminders(userId) {
  const householdId = userId ? store.getUser(userId).householdId : null;
  return store
    .allActiveTasks()
    .filter((task) => task.remindAt && !task.remindedAt && (!householdId || task.householdId === householdId))
    .sort((a, b) => a.remindAt.localeCompare(b.remindAt));
}

/** "Today: 2 things" plus anything missed. Null when there's nothing to say. */
export function digestText(user, now = nowLocal()) {
  const lang = langOf(user);
  const today = now.toISODate();
  const tasks = store.tasksFor(user.id);
  const dueToday = tasks.filter((task) => task.dueDate === today);
  const missed = tasks.filter((task) => task.dueDate && task.dueDate < today && !task.past);
  if (!dueToday.length && !missed.length) return null;

  const line = (task) => {
    const time = task.dueTime ? ` · ${formatDue(task, lang, now).split(", ").pop()}` : "";
    return `${KIND_ICON[task.kind] ?? "📝"} #${task.n} ${task.title}${time}`;
  };
  const parts = [t(lang, "digestHeader", { n: dueToday.length })];
  if (dueToday.length) parts.push(dueToday.map(line).join("\n"));
  if (missed.length) parts.push([t(lang, "overdueHeader"), ...missed.map(line)].join("\n"));
  parts.push(t(lang, "listFooter", { n: (dueToday[0] ?? missed[0]).n }));
  return parts.join("\n\n");
}

export async function tick(now = nowLocal()) {
  if (running) return;
  running = true;
  try {
    for (const task of pendingReminders()) {
      if (fromIso(task.remindAt) > now) break;
      await sendReminder(task, now).catch((err) => console.error(`[scheduler] Reminder #${task.n} failed:`, err.message));
    }

    const { hour, minute, until } = config.morningDigest;
    const inDigestWindow = now.hour * 60 + now.minute >= hour * 60 + minute && now.hour < until;
    if (!inDigestWindow) return;
    const today = now.toISODate();
    for (const user of store.allUsers()) {
      if (user.lastDigest === today) continue;
      user.lastDigest = today;
      store.save();
      const text = digestText(user, now);
      if (text) await send(user.id, text).catch((err) => console.error("[scheduler] Digest failed:", err.message));
    }
  } finally {
    running = false;
  }
}
