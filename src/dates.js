import { DateTime } from "luxon";
import { config } from "./config.js";

export const zone = config.timezone;

export const nowLocal = () => DateTime.now().setZone(zone);

export function fromIso(iso) {
  return iso ? DateTime.fromISO(iso, { zone }) : null;
}

function atTime(day, hhmm) {
  const [hour, minute] = hhmm.split(":").map(Number);
  return day.set({ hour, minute, second: 0, millisecond: 0 });
}

/** The moment a task is due: its time, or the end of its day when there is no time. */
export function dueMoment({ dueDate, dueTime }) {
  if (!dueDate) return null;
  const day = DateTime.fromISO(dueDate, { zone }).startOf("day");
  return dueTime ? atTime(day, dueTime) : day.endOf("day");
}

/**
 * Pick when to remind someone about a task.
 *
 * Default: the evening before (8 PM), so there is still time to act - buy the
 * chart paper, find the cash. Closer than that, we fall back to "2 hours
 * before", the next morning, or "soon".
 *
 * Returns { at: DateTime|null, past: boolean }.
 */
export function planReminder({ dueDate, dueTime, remindAt }, now = nowLocal()) {
  const requested = remindAt ? DateTime.fromISO(remindAt, { zone }) : null;
  if (requested?.isValid && requested > now) return { at: requested, past: false };

  const due = dueMoment({ dueDate, dueTime });
  if (!due?.isValid) return { at: null, past: false };
  if (due <= now) return { at: null, past: true };

  const day = due.startOf("day");
  const eveningBefore = day.minus({ days: 1 }).set(config.eveningReminder);
  if (eveningBefore > now.plus({ minutes: 5 })) return { at: eveningBefore, past: false };

  if (dueTime) {
    const twoHoursBefore = due.minus({ hours: 2 });
    if (twoHoursBefore > now.plus({ minutes: 5 })) return { at: twoHoursBefore, past: false };
    return { at: DateTime.max(now.plus({ minutes: 1 }), due.minus({ minutes: 30 })), past: false };
  }

  // Date only, and it's due tomorrow (the evening slot has gone): remind in the morning.
  if (day > now.startOf("day")) {
    return { at: day.set({ hour: config.morningDigest.hour, minute: config.morningDigest.minute }), past: false };
  }

  // Due later today with no time given.
  const inAnHour = now.plus({ hours: 1 });
  return { at: inAnHour.hour >= 22 ? now.plus({ minutes: 5 }) : inAnHour, past: false };
}

const DAY_WORDS = {
  en: ["today", "tomorrow", "yesterday"],
  hinglish: ["aaj", "kal", "kal (beeta)"],
  hi: ["आज", "कल", "बीता कल"],
};

function dayLabel(dt, lang, now) {
  const diff = Math.round(dt.startOf("day").diff(now.startOf("day"), "days").days);
  const words = DAY_WORDS[lang] ?? DAY_WORDS.en;
  if (diff === 0) return words[0];
  if (diff === 1) return words[1];
  if (diff === -1) return words[2];
  return dt.toFormat(dt.year === now.year ? "ccc, d LLL" : "ccc, d LLL yyyy");
}

/** "tomorrow, 8:00 PM" / "Fri, 15 Nov, 10:00 AM" */
export function formatWhen(dt, lang = "en", now = nowLocal()) {
  if (!dt) return "";
  return `${dayLabel(dt, lang, now)}, ${dt.toFormat("h:mm a")}`;
}

/** "Fri, 15 Nov" or "Sat, 16 Nov, 10:00 AM" */
export function formatDue(task, lang = "en", now = nowLocal()) {
  if (!task.dueDate) return null;
  const day = DateTime.fromISO(task.dueDate, { zone });
  const label = dayLabel(day, lang, now);
  return task.dueTime ? `${label}, ${atTime(day, task.dueTime).toFormat("h:mm a")}` : label;
}
