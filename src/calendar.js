// Calendar export (.ics), so tasks can also live in Google, Apple or Outlook calendars.
import { DateTime } from "luxon";
import { fromIso, zone } from "./dates.js";

const escapeText = (s) => String(s).replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
const utc = (dt) => dt.toUTC().toFormat("yyyyMMdd'T'HHmmss'Z'");

// RFC 5545: lines over 75 bytes are folded with CRLF + space, without splitting a UTF-8 character.
function fold(line) {
  const bytes = Buffer.from(line, "utf8");
  if (bytes.length <= 75) return line;
  const parts = [];
  let start = 0;
  while (start < bytes.length) {
    let end = Math.min(start + (parts.length ? 74 : 75), bytes.length);
    while (end < bytes.length && (bytes[end] & 0xc0) === 0x80) end -= 1;
    parts.push(bytes.subarray(start, end).toString("utf8"));
    start = end;
  }
  return parts.join("\r\n ");
}

/** An .ics calendar with one event per dated task, plus an alarm at the reminder time. */
export function toIcs(tasks, { name = "Forward-It", now = DateTime.now() } = {}) {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Forward-It//Reminders//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${escapeText(name)}`,
  ];
  for (const task of tasks) {
    if (!task.dueDate || task.status !== "active") continue;
    const day = DateTime.fromISO(task.dueDate, { zone });
    lines.push("BEGIN:VEVENT", `UID:${`${task.householdId}-${task.n}`.replace(/[^\w-]/g, "")}@forward-it`, `DTSTAMP:${utc(now)}`);
    if (task.dueTime) {
      const [hour, minute] = task.dueTime.split(":").map(Number);
      const start = day.set({ hour, minute });
      lines.push(`DTSTART:${utc(start)}`, `DTEND:${utc(start.plus({ hours: 1 }))}`);
    } else {
      lines.push(`DTSTART;VALUE=DATE:${day.toFormat("yyyyMMdd")}`, `DTEND;VALUE=DATE:${day.plus({ days: 1 }).toFormat("yyyyMMdd")}`);
    }
    lines.push(`SUMMARY:${escapeText(task.title)}`);
    const description = [task.details, task.amount && `Amount: ${task.amount}`, task.sourceQuote && `From: "${task.sourceQuote}"`]
      .filter(Boolean)
      .join("\n");
    if (description) lines.push(`DESCRIPTION:${escapeText(description)}`);
    if (task.remindAt && !task.remindedAt) {
      lines.push("BEGIN:VALARM", "ACTION:DISPLAY", `DESCRIPTION:${escapeText(task.title)}`, `TRIGGER;VALUE=DATE-TIME:${utc(fromIso(task.remindAt))}`, "END:VALARM");
    }
    lines.push("END:VEVENT");
  }
  lines.push("END:VCALENDAR");
  return `${lines.map(fold).join("\r\n")}\r\n`;
}
