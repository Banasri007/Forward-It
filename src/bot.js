// The conversation logic, independent of the channel (WhatsApp or simulator).
import { randomUUID } from "node:crypto";
import * as store from "./store.js";
import { config } from "./config.js";
import { send } from "./outbox.js";
import { extract } from "./extract/index.js";
import { detectLanguage, parseDateReply } from "./extract/fallback.js";
import { parseCommand } from "./commands.js";
import { dueMoment, formatDue, formatWhen, fromIso, nowLocal, planReminder } from "./dates.js";
import { t } from "./i18n.js";

export const KIND_ICON = { payment: "💰", event: "📌", deadline: "⏳", bring_item: "🎒", todo: "📝" };

export const langOf = (user) => user.lang ?? user.detectedLang ?? "en";

const normalizeTitle = (s) => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();

/* ---------- Family ---------- */

/** The name family members see: the user's chosen name, or a masked number. */
export function displayName(user, lang = "en") {
  if (user.name) return user.name;
  const digits = user.id.replace(/\D/g, "");
  if (digits.length < 4) return t(lang, "someone");
  const countryCode = digits.length > 10 ? `+${digits.slice(0, -10)} ` : "";
  return `${countryCode}•••${digits.slice(-4)}`;
}

const otherMembers = (user) => store.householdMembers(user.id).filter((member) => member.id !== user.id);

// Messages to other family members go out after the sender's own replies.
const pendingNotices = new Set();
function notify(userId, text) {
  const delivery = new Promise((resolve) => setImmediate(resolve))
    .then(() => send(userId, text))
    .catch((err) => console.error(`[bot] Couldn't notify ${userId}: ${err.message}`))
    .finally(() => pendingNotices.delete(delivery));
  pendingNotices.add(delivery);
}

/** Wait until family notifications have gone out (tests and the demo use this). */
export async function settleNotices() {
  while (pendingNotices.size) await Promise.all([...pendingNotices]);
}

// "share 98765 43210" from +91... means +91 98765 43210.
function partnerIdFrom(user, number) {
  const [channel, own = ""] = user.id.split(":");
  const digits = number.replace(/\D/g, "");
  const ownDigits = own.replace(/\D/g, "");
  const countryCode = ownDigits.length > 10 ? ownDigits.slice(0, -10) : "91";
  return `${channel}:+${number.trim().startsWith("+") || digits.length > 10 ? digits : `${countryCode}${digits}`}`;
}

/** Put partnerId on user's family list. Returns the reply for the user who shared. */
export function shareWith(user, partnerId) {
  const lang = langOf(user);
  if (partnerId === user.id) return t(lang, "shareSelf");
  const partner = store.getUser(partnerId);
  store.joinHousehold(partner.id, user.id);
  notify(partner.id, t(langOf(partner), "shareInvite", { name: displayName(user, langOf(partner)) }));
  const reply = t(lang, "shareAdded", { name: displayName(partner, lang) });
  return user.id.startsWith("whatsapp:") ? `${reply}\n${t(lang, "shareSandboxNote")}` : reply;
}

/** Mark a task done and tell the rest of the family who did it. */
export function completeTask(user, task, now = nowLocal()) {
  task.status = "done";
  task.doneAt = now.toISO();
  task.doneBy = user.id;
  for (const member of store.householdMembers(user.id)) {
    if (member.lastRef === task.n) member.lastRef = null;
  }
  store.save();
  for (const member of otherMembers(user)) {
    const memberLang = langOf(member);
    notify(member.id, t(memberLang, "doneByOther", { name: displayName(user, memberLang), title: task.title }));
  }
}

/* ---------- Incoming messages ---------- */

/**
 * Handle one incoming message and return the replies to send, in order.
 * media: [{ contentType, data }] with data as base64 (images, PDFs, voice notes).
 */
export async function handleIncoming({ userId, text = "", media = [], now = nowLocal() }) {
  const isNew = store.isNewUser(userId);
  const user = store.getUser(userId);
  text = text.trim();
  if (!user.detectedLang && text) user.detectedLang = detectLanguage(text);

  const command = media.length ? null : parseCommand(text);
  if (isNew && command?.name === "lang") user.lang = command.lang;
  if (isNew && (command?.name === "help" || command?.name === "lang" || (!text && !media.length))) {
    return [t(langOf(user), "welcome")];
  }

  const replies = isNew ? [t(langOf(user), "welcome")] : [];

  if (command) return [...replies, ...runCommand(user, command, now)];

  // "Friday" / "kal 6 baje" / "skip" in answer to "When is X due?"
  if (user.pending && !media.length && text.length <= 40) {
    const answer = parseDateReply(text, now);
    if (answer) return [...replies, answerPendingDate(user, answer, now)];
  }
  user.pending = null;

  store.bumpStat(user.id, "forwards");
  const result = await extract({ text, media, now, preferredLang: user.lang });
  if (result.needsAi) return [...replies, t(langOf(user), config.ai.enabled ? "error" : "mediaNeedsAi")];
  if (result.voiceNeedsAi) return [...replies, t(langOf(user), "voiceUnsupported")];
  if (result.scannedPdf) return [...replies, t(langOf(user), "pdfNoText")];
  if (result.aiFailed) return [...replies, t(langOf(user), "aiBusy")];

  // A forwarded English circular shouldn't switch a Hindi/Hinglish user back to English.
  if (result.language && (result.language !== "en" || !user.detectedLang)) user.detectedLang = result.language;
  const lang = langOf(user);
  if (result.transcripts?.length) {
    store.bumpStat(user.id, "voiceNotes", result.transcripts.length);
    replies.push(t(lang, "heard", { text: result.transcripts.join(" ") }));
  }
  if (!result.tasks.length) {
    store.bumpStat(user.id, "noise");
    return [...replies, t(lang, "nothingFound", { reason: result.noTaskReason })];
  }

  const batchId = randomUUID();
  const kinds = media.map((m) => m.contentType);
  const source = kinds.includes("application/pdf")
    ? "pdf"
    : kinds.some((k) => k.startsWith("image/"))
      ? "photo"
      : kinds.some((k) => k.startsWith("audio/"))
        ? "voice"
        : "text";
  const saved = [];
  const duplicates = [];
  for (const draft of result.tasks) {
    if (isDuplicate(user.id, draft)) {
      duplicates.push(draft.title);
      continue;
    }
    const plan = planReminder(draft, now);
    saved.push(
      store.addTask(user.id, {
        title: draft.title,
        details: draft.details,
        dueDate: draft.dueDate,
        dueTime: draft.dueTime,
        amount: draft.amount,
        kind: draft.kind,
        dateConfidence: draft.dateConfidence,
        sourceQuote: draft.sourceQuote,
        remindAt: plan.at?.toISO() ?? null,
        past: plan.past,
        batchId,
        source,
        engine: result.engine,
      }),
    );
  }

  if (saved.length) {
    user.lastBatchId = batchId;
    user.lastRef = saved.length === 1 ? saved[0].n : null;
    for (const member of otherMembers(user)) {
      const memberLang = langOf(member);
      const items = saved.map((task) => listLine(task, memberLang, now)).join("\n");
      notify(member.id, t(memberLang, "addedByOther", { name: displayName(user, memberLang), items }));
    }
  }
  const undated = saved.find((task) => !task.dueDate);
  user.pending = undated ? { n: undated.n } : null;
  store.save();

  if (saved.length) replies.push(savedSummary(saved, lang, now));
  if (duplicates.length) replies.push(t(lang, "duplicate", { titles: duplicates.join(", ") }));
  if (result.unread > 0) replies.push(t(lang, "photoSkipped"));
  if (undated) replies.push(t(lang, "askDate", { title: undated.title }));
  return replies;
}

function isDuplicate(userId, draft) {
  const title = normalizeTitle(draft.title);
  return store.tasksFor(userId).some((task) => task.dueDate === draft.dueDate && normalizeTitle(task.title) === title);
}

function answerPendingDate(user, answer, now) {
  const lang = langOf(user);
  const task = store.findTask(user.id, user.pending.n);
  user.pending = null;
  store.save();
  if (!task || answer.skip) return t(lang, "skipped");

  task.dueDate = answer.dueDate;
  task.dueTime = answer.dueTime;
  task.dateConfidence = "explicit";
  const plan = planReminder({ dueDate: task.dueDate, dueTime: task.dueTime }, now);
  task.remindAt = plan.at?.toISO() ?? null;
  task.remindedAt = null;
  task.past = plan.past;
  store.save();
  return plan.at ? t(lang, "dateSet", { when: formatWhen(plan.at, lang, now) }) : t(lang, "dateSetPast");
}

export function taskBlock(task, lang, now) {
  const lines = [`${KIND_ICON[task.kind] ?? "📝"} *#${task.n} ${task.title}*`];
  if (task.details) lines.push(`_${task.details}_`);
  const due = formatDue(task, lang, now);
  lines.push(due ? `📅 ${due}` : t(lang, "noDate"));
  if (task.past) lines.push(t(lang, "pastDate"));
  else if (task.remindAt) lines.push(t(lang, "reminderLine", { when: formatWhen(fromIso(task.remindAt), lang, now) }));
  return lines.join("\n");
}

function savedSummary(saved, lang, now) {
  return [
    t(lang, "savedHeader", { n: saved.length }),
    ...saved.map((task) => taskBlock(task, lang, now)),
    t(lang, "savedFooter"),
  ].join("\n\n");
}

/** The task that "DONE" / "LATER" without a number refers to. */
function resolveTask(user, n) {
  if (n) return store.findTask(user.id, n);
  if (user.lastRef) return store.findTask(user.id, user.lastRef);
  const active = store.tasksFor(user.id);
  return active.length === 1 ? active[0] : null;
}

function runCommand(user, command, now) {
  const lang = langOf(user);
  switch (command.name) {
    case "help":
      return [t(lang, "welcome")];

    case "lang":
      user.lang = command.lang;
      store.save();
      return [t(user.lang, "langSet")];

    case "list":
      return [listText(user, now)];

    case "done": {
      const task = resolveTask(user, command.n);
      if (!task) return [command.n ? t(lang, "notFound", { n: command.n }) : t(lang, "whichOne")];
      if (task.status === "done") return [t(lang, "alreadyDone", { title: task.title })];
      completeTask(user, task, now);
      return [t(lang, "done", { title: task.title })];
    }

    case "later": {
      const task = resolveTask(user, command.n);
      if (!task || task.status !== "active") return [command.n ? t(lang, "notFound", { n: command.n }) : t(lang, "whichOne")];
      const at = now.plus({ hours: 1 });
      task.remindAt = at.toISO();
      task.remindedAt = null;
      store.save();
      return [t(lang, "snoozed", { when: formatWhen(at, lang, now) })];
    }

    case "undo": {
      const batch = store.tasksFor(user.id).filter((task) => task.batchId && task.batchId === user.lastBatchId);
      if (!batch.length) return [t(lang, "nothingToUndo")];
      for (const task of batch) task.status = "deleted";
      user.lastBatchId = null;
      user.lastRef = null;
      user.pending = null;
      store.save();
      return [t(lang, "undone", { n: batch.length })];
    }

    case "delete": {
      const task = store.findTask(user.id, command.n);
      if (!task) return [t(lang, "notFound", { n: command.n })];
      task.status = "deleted";
      store.save();
      return [t(lang, "deleted", { title: task.title })];
    }

    case "share":
      return [shareWith(user, partnerIdFrom(user, command.value))];

    case "family": {
      const members = store.householdMembers(user.id);
      if (members.length < 2) return [t(lang, "familyAlone")];
      return [t(lang, "familyList", { names: members.map((m) => displayName(m, lang)).join(", ") })];
    }

    case "leave":
      return [store.leaveHousehold(user.id) ? t(lang, "left") : t(lang, "notInFamily")];

    case "name":
      user.name = command.value;
      store.save();
      return [t(lang, "nameSet", { name: user.name })];

    default:
      return [];
  }
}

const byDue = (a, b) => `${a.dueDate ?? "9"}${a.dueTime ?? ""}`.localeCompare(`${b.dueDate ?? "9"}${b.dueTime ?? ""}`) || a.n - b.n;

function listLine(task, lang, now) {
  const due = formatDue(task, lang, now);
  return `${KIND_ICON[task.kind] ?? "📝"} #${task.n} ${task.title}${due ? ` · ${due}` : ""}`;
}

export function listText(user, now = nowLocal()) {
  const lang = langOf(user);
  const tasks = store.tasksFor(user.id).sort(byDue);
  if (!tasks.length) return t(lang, "listEmpty");
  const shared = store.householdMembers(user.id).length > 1;

  const today = now.toISODate();
  const sections = { sectionOverdue: [], sectionToday: [], sectionUpcoming: [], sectionNoDate: [] };
  for (const task of tasks) {
    if (!task.dueDate) sections.sectionNoDate.push(task);
    else if (dueMoment(task) < now) sections.sectionOverdue.push(task);
    else if (task.dueDate === today) sections.sectionToday.push(task);
    else sections.sectionUpcoming.push(task);
  }

  // On a shared list, say who added tasks that came from someone else.
  const line = (task) =>
    listLine(task, lang, now) + (shared && task.createdBy !== user.id ? ` · _${displayName(store.getUser(task.createdBy), lang)}_` : "");
  const parts = [t(lang, "listHeader")];
  for (const [key, list] of Object.entries(sections)) {
    if (list.length) parts.push([t(lang, key), ...list.map(line)].join("\n"));
  }
  parts.push(t(lang, "listFooter", { n: Object.values(sections).flat()[0].n }));
  return parts.join("\n\n");
}
