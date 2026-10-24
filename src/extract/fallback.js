// Offline, rule-based extractor. Used when no AI key is configured or the AI
// call fails, so the bot never goes silent. It handles typed text only (not
// photos), English and common Hindi/Hinglish date words.
import * as chrono from "chrono-node";
import { DateTime } from "luxon";
import { zone } from "../dates.js";

// Indian dates are day-first (15/11/2026), so use the British parser.
const parser = chrono.en.GB;

const DEVANAGARI_DIGITS = "०१२३४५६७८९";

// Hindi and Hinglish words -> English that chrono understands.
const REPLACEMENTS = [
  [/[०-९]/g, (d) => String(DEVANAGARI_DIGITS.indexOf(d))],
  [/(\d{1,2})\s*(?:baje|बजे)/gi, "at $1"],
  [/\b(?:parso|parson|parsoon)\b|परसों/gi, "in 2 days"],
  [/\b(?:kal|kl)\b|कल/gi, "tomorrow"],
  [/\baaj\b|आज/gi, "today"],
  [/\b(?:subah|subha)\b|सुबह/gi, "morning"],
  [/\b(?:shaam|sham)\b|शाम/gi, "evening"],
  [/\b(?:raat|rat)\b|रात/gi, "night"],
  [/\bdopahar\b|दोपहर/gi, "afternoon"],
  [/\b(?:somvar|somvaar)\b|सोमवार/gi, "monday"],
  [/\b(?:mangalvar|mangalvaar)\b|मंगलवार/gi, "tuesday"],
  [/\b(?:budhvar|budhvaar)\b|बुधवार/gi, "wednesday"],
  [/\b(?:guruvar|guruvaar|veervar)\b|गुरुवार|वीरवार/gi, "thursday"],
  [/\b(?:shukravar|shukravaar)\b|शुक्रवार/gi, "friday"],
  [/\b(?:shanivar|shanivaar)\b|शनिवार/gi, "saturday"],
  [/\b(?:ravivar|ravivaar|itvaar)\b|रविवार/gi, "sunday"],
  [/\bagle hafte\b|अगले हफ्ते/gi, "next week"],
];

export function normalizeDateWords(text) {
  return REPLACEMENTS.reduce((s, [pattern, replacement]) => s.replace(pattern, replacement), text);
}

const GREETING = /\b(good\s*(morning|night|evening)|suprabhat|shubh|happy\s+(diwali|holi|birthday|new year|sunday)|forward (this )?to \d+|blessed|have a (nice|great|blessed) day)\b/i;
const ACTION =
  /\b(pay|paid|submit|bring|carry|send|wear|attend|book|renew|buy|call|fill|complete|collect|deposit|register|apply|store|meeting|ptm|exam|test|appointment|function|rehearsal|ceremony|celebration|trip|picnic|camp|drive|vaccination|check-?up|cleaning|maintenance|due|deadline|last date|fee|bill|recharge|lana|laana|lao|bhejna|bhejo|jama|karna|karni|karo|pahenna|pehenna|le aana|lekar)\b|लाना|भेजना|जमा|करना|पहनना/i;
const AMOUNT = /(?:₹|\brs\.?|\binr)\s*([\d,]+(?:\.\d{1,2})?)/i;
const SALUTATION = /^(dear\s+\w+[,:]?|hello\s*(all|everyone)?[,!:]?|hi\s*(all|everyone)?[,!:]?|respected\s+\w+[,:]?|sabhi\s+\w+\s+(dhyan\s+de(in)?)?[:,]?|kindly note( that)?[,:]?|please note( that)?[,:]?|note[,:]|aur\s|and\s|also[,]?\s)\s*/i;
// Words like "tomorrow" are wrong by the time the reminder arrives, so they
// come out of titles once the date has been worked out.
const RELATIVE_DAY = /\s*\b(?:tomorrow|today|tonight|kal|aaj|parso|parson)\b|\s*(?:कल|आज|परसों)/gi;
// "15 min early" is a duration and "the night before" is relative to something else: neither is a date.
const NOT_A_DATE = /^(?:\d+\s*(?:min|mins|minutes?|hrs?|hours?)\b|(?:the\s+)?(?:night|morning|evening|afternoon|noon|midnight)\b)/i;
// "due by the 15th": a day of the month on its own, which chrono doesn't read.
const DAY_OF_MONTH = /\b(?:by|on|before|till|until)?\s*(?:the\s+)?([1-9]|[12]\d|3[01])(?:st|nd|rd|th)\b/i;

const KIND_RULES = [
  ["payment", /\b(pay|fee|fees|bill|recharge|dues?|deposit|rs\.?)\b|₹|बिल|फीस/i],
  ["bring_item", /\b(bring|carry|wear|lana|laana|lao|pahenna|pehenna|lekar)\b|लाना|पहनना/i],
  ["event", /\b(meeting|ptm|exam|test|appointment|function|rehearsal|ceremony|class|session|interview)\b/i],
  ["deadline", /\b(submit|last date|deadline|before|tak|jama)\b/i],
];

export function detectLanguage(text) {
  if (/[ऀ-ॿ]/.test(text)) return "hi";
  const hinglishHits = text.match(/\b(kal|aaj|hai|hain|karna|karni|karo|bhejna|bhejo|lana|laana|baje|parso|nahi|kya|aur|ke|ki|ka|mein|tak|sabhi|dhyan)\b/gi);
  return (hinglishHits?.length ?? 0) >= 2 ? "hinglish" : "en";
}

function splitSentences(text) {
  return text
    .split(/\n+|(?<=[!?])\s+|(?<!\b(?:dr|mr|mrs|ms|prof|no|rs|st|sr|jr|vs)\.)(?<=\.)\s+(?=[A-Zऀ-ॿ]|aur\b)|।/i)
    .map((s) => s.replace(/^\s*(?:[-*•▪➤]|\d{1,2}[.)])\s*/, "").trim())
    .filter((s) => s.length > 2);
}

function makeTitle(sentence) {
  let title = sentence.replace(/[*_~]/g, "").replace(SALUTATION, "").replace(/\s+/g, " ").trim();
  title = title.replace(/[\s.,;:!🙏]+$/u, "");
  if (title.length > 70) title = `${title.slice(0, 67).replace(/\s+\S*$/, "")}…`;
  return title.charAt(0).toUpperCase() + title.slice(1);
}

function kindOf(sentence) {
  return KIND_RULES.find(([, pattern]) => pattern.test(sentence))?.[0] ?? "todo";
}

function amountOf(sentence) {
  const match = sentence.match(AMOUNT);
  return match ? `₹${match[1].replace(/\.00$/, "")}` : null;
}

export function parseDate(sentence, now) {
  const normalized = normalizeDateWords(sentence);
  const ref = { instant: now.toJSDate(), timezone: now.offset };
  const result = parser.parse(normalized, ref, { forwardDate: true }).find((r) => !NOT_A_DATE.test(r.text));
  if (!result) return dayOfMonth(normalized, now);

  const start = result.start;
  let when = DateTime.fromJSDate(start.date(), { zone });
  const hasTime = start.isCertain("hour");
  // "shaam 5 baje" -> 5 PM, not 5 AM.
  if (hasTime && !start.isCertain("meridiem") && when.hour < 12 && /evening|night|afternoon/i.test(normalized)) {
    when = when.plus({ hours: 12 });
  }
  return {
    dueDate: when.toISODate(),
    dueTime: hasTime ? when.toFormat("HH:mm") : null,
    explicit: start.isCertain("day") && start.isCertain("month"),
  };
}

/** For "by the 15th": the next date with that day of the month (today counts). */
export function dayOfMonth(text, now) {
  const match = text.match(DAY_OF_MONTH);
  if (!match) return null;
  const day = Number(match[1]);
  for (const month of [now.startOf("month"), now.startOf("month").plus({ months: 1 })]) {
    const candidate = month.plus({ days: day - 1 });
    if (candidate.month === month.month && candidate >= now.startOf("day")) {
      return { dueDate: candidate.toISODate(), dueTime: null, explicit: false };
    }
  }
  return null;
}

/** Parse a short reply like "Friday", "kal 6 baje" or "skip". */
export function parseDateReply(text, now) {
  if (/^(skip|no date|none|nahi|koi date nahi|no)$/i.test(text.trim())) return { skip: true };
  const date = parseDate(text, now);
  return date ? { dueDate: date.dueDate, dueTime: date.dueTime } : null;
}

export function extractFallback(text, now) {
  const language = detectLanguage(text);
  const sentences = splitSentences(text).filter((s) => !GREETING.test(s) || ACTION.test(s));
  const tasks = [];

  for (const sentence of sentences) {
    const date = parseDate(sentence, now);
    // A date alone isn't a task ("arrive 15 min early", "Happy Sunday") unless it's a full date.
    if (!date || (!ACTION.test(sentence) && !date.explicit)) continue;
    tasks.push({
      title: makeTitle(sentence.replace(RELATIVE_DAY, "")),
      details: null,
      dueDate: date.dueDate,
      dueTime: date.dueTime,
      remindAt: null,
      amount: amountOf(sentence),
      kind: kindOf(sentence),
      dateConfidence: date.explicit ? "explicit" : "inferred",
      sourceQuote: sentence.length > 90 ? `${sentence.slice(0, 87)}…` : sentence,
    });
  }

  if (!tasks.length) {
    const actionable = sentences.find((s) => ACTION.test(s));
    if (actionable) {
      tasks.push({
        title: makeTitle(actionable),
        details: null,
        dueDate: null,
        dueTime: null,
        remindAt: null,
        amount: amountOf(actionable),
        kind: kindOf(actionable),
        dateConfidence: "none",
        sourceQuote: actionable,
      });
    }
  }

  return {
    language,
    tasks,
    noTaskReason: tasks.length ? null : GREETING.test(text) ? "a greeting or forward" : null,
  };
}
