// Honest numbers for the "Impact" view: what Forward-It actually did for a family.
import { DateTime } from "luxon";
import * as store from "./store.js";
import { displayName } from "./bot.js";
import { dueMoment, nowLocal } from "./dates.js";

export function insightsFor(userId, now = nowLocal()) {
  const members = store.householdMembers(userId);
  const tasks = store.tasksFor(userId, { includeClosed: true });
  const stats = { forwards: 0, noise: 0, reminders: 0, voiceNotes: 0 };
  for (const member of members) {
    for (const key of Object.keys(stats)) stats[key] += member.stats?.[key] ?? 0;
  }

  const done = tasks.filter((t) => t.status === "done");
  const doneOnTime = done.filter((t) => !t.dueDate || DateTime.fromISO(t.doneAt) <= dueMoment(t));
  const active = tasks.filter((t) => t.status === "active");
  const missed = active.filter((t) => t.dueDate && !t.past && dueMoment(t) < now);
  const weekEnd = now.plus({ days: 7 }).endOf("day");
  const dueThisWeek = active.filter((t) => t.dueDate && dueMoment(t) >= now && dueMoment(t) <= weekEnd);
  const count = (key) => tasks.reduce((acc, t) => ({ ...acc, [t[key]]: (acc[t[key]] ?? 0) + 1 }), {});

  return {
    ...stats,
    captured: tasks.length,
    done: done.length,
    doneOnTime: doneOnTime.length,
    active: active.length,
    missed: missed.length,
    dueThisWeek: dueThisWeek.length,
    byKind: count("kind"),
    bySource: count("source"),
    members: members.map((m) => ({ id: m.id, name: displayName(m) })),
  };
}
