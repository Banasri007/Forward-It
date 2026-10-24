// The instructions and output shape shared by every AI provider.

export const KINDS = ["payment", "event", "deadline", "bring_item", "todo"];
const LANGUAGES = ["en", "hi", "hinglish"];

/**
 * JSON schema for the extraction result. `nullable` wraps a schema so it also
 * accepts null; providers spell that differently.
 */
export function resultSchema(nullable) {
  return {
    type: "object",
    additionalProperties: false,
    required: ["language", "tasks", "no_task_reason"],
    properties: {
      language: { type: "string", enum: LANGUAGES },
      no_task_reason: nullable({ type: "string" }),
      tasks: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["title", "details", "due_date", "due_time", "remind_at", "amount", "kind", "date_confidence", "source_quote"],
          properties: {
            title: { type: "string" },
            details: nullable({ type: "string" }),
            due_date: nullable({ type: "string" }),
            due_time: nullable({ type: "string" }),
            remind_at: nullable({ type: "string" }),
            amount: nullable({ type: "string" }),
            kind: { type: "string", enum: KINDS },
            date_confidence: { type: "string", enum: ["explicit", "inferred", "none"] },
            source_quote: { type: "string" },
          },
        },
      },
    },
  };
}

export const SYSTEM_PROMPT = `You are Forward-It, a WhatsApp assistant that turns forwarded messages into reminders.

Your users are busy people, often parents in India who are in many school, society and office WhatsApp groups. They forward you school circulars, fee notices, bills, appointment SMSes, group-chat messages, screenshots, photos of printed notices, and PDFs. Your job is to pull out what the user (or their child or family) needs to DO, PAY, BRING, SUBMIT, WEAR or ATTEND, and when.

What counts as a task:
- Something with a clear action for the reader. A circular often holds 2-4 separate tasks; return each one.
- Skip greetings, good-morning forwards, jokes, news, ads, general information with no action, and things that are already finished.
- Don't split one action into tiny steps, and never invent tasks, dates or amounts that aren't in the message.

For each task:
- title: short and concrete, at most about 8 words. Include the amount if there is one. Write it in the reply language you are given, in that language's natural word order: English titles start with the verb ("Pay Term-2 school fee ₹2,400", "Attend parent-teacher meeting"); Hindi and Hinglish titles end with it ("White chart paper aur glue stick lana", "Project file jama karna").
- details: one short line with the specifics the person will need at the time (what to bring, where, roll number, reference number), or null.
- due_date: YYYY-MM-DD. Resolve relative dates ("tomorrow", "kal", "next Monday", "by the 15th") against the current date you are given. If only a day of the month is given ("by the 15th"), use the next time that day comes: if it has already passed this month, it is next month. In Hindi/Hinglish, "kal" about something still to be done means tomorrow; "parso" means the day after tomorrow. null if there is no date.
- due_time: "HH:MM" in 24-hour time if a specific time is given, else null. For a time range, use the start.
- When something must be done before an event ("store water the night before the tank cleaning", "submit the form a day before the trip"), the due date and time are when that action must be done, not the event itself.
- remind_at: only if the user explicitly asks to be reminded at a certain time ("remind me at 6pm"), as "YYYY-MM-DDTHH:MM"; otherwise null.
- amount: like "₹2,400", or null.
- kind: payment, event (something to attend), deadline (something to submit or finish), bring_item (something to bring, carry or wear), or todo.
- date_confidence: "explicit" if a calendar date is written, "inferred" if you worked it out from a relative word or weekday, "none" if due_date is null.
- source_quote: the exact few words (at most 12) from the message this task comes from, so the user can trust it.

language: the language the user's own words are in: "en" (English), "hi" (Hindi in Devanagari) or "hinglish" (Hindi in Latin letters). A forwarded English circular with no other text is "en".
no_task_reason: when tasks is empty, a few words on what the message is (e.g. "a good-morning forward"); otherwise null.`;

const LANG_NAMES = { en: "English", hi: "Hindi (Devanagari)", hinglish: "Hinglish (Hindi in Latin letters)" };

export function buildPrompt({ text, now, preferredLang, mediaCount }) {
  // Models are unreliable at weekday arithmetic, so spell out the next two weeks.
  const calendar = Array.from({ length: 14 }, (_, i) => now.plus({ days: i + 1 }).toFormat("ccc d LLL (yyyy-MM-dd)"));
  const lines = [
    `Current date and time for the user: ${now.toFormat("cccc, d LLLL yyyy, h:mm a")} (${now.zoneName}).`,
    `The next 14 days: ${calendar.join(", ")}.`,
    `Reply language for titles and details: ${preferredLang ? LANG_NAMES[preferredLang] : "the language of the user's own words (English if it's only a forwarded notice)"}.`,
  ];
  if (mediaCount) lines.push(`The user forwarded ${mediaCount === 1 ? "the attached image or document" : `the ${mediaCount} attached images or documents`}.`);
  lines.push(text?.trim() ? `Message text:\n<message>\n${text.trim()}\n</message>` : "There is no message text, only the attachment.");
  return lines.join("\n");
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]?\d|2[0-3]):[0-5]\d$/;

// "2,400", "Rs. 2,400" and "INR 2400" all become "₹2,400"-style amounts.
function normalizeAmount(amount) {
  const value = amount?.trim();
  if (!value) return null;
  const bare = value.replace(/^(?:rs\.?|inr|₹)\s*/i, "");
  return /^[\d,]+(?:\.\d{1,2})?$/.test(bare) ? `₹${bare.replace(/\.00$/, "")}` : value;
}

function cleanTask(task) {
  const title = String(task?.title ?? "").trim();
  if (!title) return null;
  const dueDate = DATE_RE.test(task.due_date ?? "") ? task.due_date : null;
  const dueTime = dueDate && TIME_RE.test(task.due_time ?? "") ? task.due_time.padStart(5, "0") : null;
  return {
    title,
    details: task.details?.trim() || null,
    dueDate,
    dueTime,
    remindAt: /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(task.remind_at ?? "") ? task.remind_at : null,
    amount: normalizeAmount(task.amount),
    kind: KINDS.includes(task.kind) ? task.kind : "todo",
    dateConfidence: dueDate ? task.date_confidence ?? "inferred" : "none",
    sourceQuote: task.source_quote?.trim() || null,
  };
}

/** Validate and normalize the model's JSON (never trust it blindly). */
export function parseResult(raw) {
  return {
    language: LANGUAGES.includes(raw?.language) ? raw.language : "en",
    tasks: (Array.isArray(raw?.tasks) ? raw.tasks : []).map(cleanTask).filter(Boolean),
    noTaskReason: raw?.no_task_reason ?? null,
  };
}
