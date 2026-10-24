// The website's live demo: WhatsApp-style phones that talk to the real bot,
// without any accounts. Replies are pushed to the browser with Server-Sent Events.
import express from "express";
import { DateTime } from "luxon";
import QRCode from "qrcode";
import { aiDescription, config, whatsappMode } from "../config.js";
import { completeTask, displayName, handleIncoming, langOf, settleNotices, shareWith } from "../bot.js";
import { registerChannel, send } from "../outbox.js";
import * as store from "../store.js";
import { digestText, pendingReminders, sendReminder } from "../scheduler.js";
import { insightsFor } from "../insights.js";
import { toIcs } from "../calendar.js";
import { fromIso, nowLocal } from "../dates.js";
import { t } from "../i18n.js";

const listeners = new Map(); // userId -> Set of SSE responses

function broadcast(userId, event) {
  for (const res of listeners.get(userId) ?? []) res.write(`data: ${JSON.stringify(event)}\n\n`);
}

// Tell every phone in the family that the shared list changed.
function broadcastTasks(userId) {
  for (const member of store.householdMembers(userId)) broadcast(member.id, { type: "tasks" });
  broadcast(userId, { type: "tasks" });
}

function log(userId, entry) {
  const full = { at: new Date().toISOString(), ...entry };
  store.appendSimLog(userId, full);
  broadcast(userId, { type: "message", message: full });
}

registerChannel("sim:", async (userId, text) => {
  log(userId, { from: "bot", text });
  broadcastTasks(userId);
});

const simId = (raw) => `sim:${String(raw || "demo").replace(/[^\w-]/g, "").slice(0, 32) || "demo"}`;
const simUser = (req) => simId(req.query.user || req.body?.user);

function parseDataUrl(dataUrl) {
  // e.g. data:audio/webm;codecs=opus;base64,....
  const match = /^data:([^;,]+)(?:;[^;,]*)*;base64,(.+)$/.exec(dataUrl ?? "");
  return match ? { contentType: match[1], data: match[2] } : null;
}

function waLink() {
  const number = config.twilio.from.replace(/\D/g, "");
  const code = config.twilio.sandboxCode;
  return `https://wa.me/${number}${code ? `?text=${encodeURIComponent(code)}` : ""}`;
}

function taskView(task, viewerId) {
  const creator = store.getUser(task.createdBy);
  return {
    ...task,
    createdByName: displayName(creator),
    doneByName: task.doneBy ? displayName(store.getUser(task.doneBy)) : null,
    mine: task.createdBy === viewerId,
  };
}

export function simulatorRouter() {
  const router = express.Router();

  router.get("/status", (req, res) => {
    // Webhook mode only works once Twilio can reach this server at a public URL.
    const whatsapp = whatsappMode === "webhook" && !config.twilio.publicUrl ? "no-url" : whatsappMode;
    res.json({
      ai: config.ai.provider,
      aiDetail: aiDescription(),
      voice: config.ai.voice,
      whatsapp,
      timezone: config.timezone,
      sandbox: { number: config.twilio.from.replace(/^whatsapp:/, ""), joinCode: config.twilio.sandboxCode || null, link: waLink() },
    });
  });

  router.get("/whatsapp-qr.svg", async (req, res) => {
    const svg = await QRCode.toString(waLink(), { type: "svg", margin: 1, color: { dark: "#1c1b19", light: "#ffffff" } });
    res.type("image/svg+xml").send(svg);
  });

  router.get("/events", (req, res) => {
    const userId = simUser(req);
    res.set({ "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" });
    res.flushHeaders();
    res.write(": connected\n\n");
    if (!listeners.has(userId)) listeners.set(userId, new Set());
    listeners.get(userId).add(res);
    const ping = setInterval(() => res.write(": ping\n\n"), 25_000);
    req.on("close", () => {
      clearInterval(ping);
      listeners.get(userId)?.delete(res);
    });
  });

  router.get("/history", (req, res) => {
    res.json(store.simLog(simUser(req)));
  });

  // The demo phones are named people ("Priya", "Rahul"), so family messages read naturally.
  router.post("/profile", (req, res) => {
    const user = store.getUser(simUser(req));
    const name = String(req.body?.name ?? "").trim().slice(0, 30);
    if (name) user.name = name;
    store.save();
    res.json({ id: user.id, name: displayName(user) });
  });

  router.get("/tasks", (req, res) => {
    const userId = simUser(req);
    res.json(store.tasksFor(userId, { includeClosed: true }).map((task) => taskView(task, userId)));
  });

  router.post("/tasks/:n/done", async (req, res) => {
    const user = store.getUser(simUser(req));
    const task = store.findTask(user.id, Number(req.params.n));
    if (!task || task.status !== "active") return res.status(404).json({ error: "No such active task" });
    completeTask(user, task);
    await settleNotices();
    broadcastTasks(user.id);
    res.json({ ok: true });
  });

  router.post("/tasks/:n/delete", (req, res) => {
    const userId = simUser(req);
    const task = store.findTask(userId, Number(req.params.n));
    if (!task) return res.status(404).json({ error: "No such task" });
    task.status = "deleted";
    store.save();
    broadcastTasks(userId);
    res.json({ ok: true });
  });

  router.get("/insights", (req, res) => {
    res.json(insightsFor(simUser(req)));
  });

  router.get("/calendar.ics", (req, res) => {
    const userId = simUser(req);
    const n = req.query.n ? Number(req.query.n) : null;
    const tasks = store.tasksFor(userId).filter((task) => !n || task.n === n);
    res.set("Content-Disposition", `attachment; filename="${n ? `forward-it-task-${n}` : "forward-it"}.ics"`);
    res.type("text/calendar").send(toIcs(tasks));
  });

  router.get("/family", (req, res) => {
    res.json(store.householdMembers(simUser(req)).map((m) => ({ id: m.id, name: displayName(m) })));
  });

  router.post("/family/link", async (req, res) => {
    const user = store.getUser(simUser(req));
    const partnerId = simId(req.body?.partner);
    await send(user.id, shareWith(user, partnerId));
    await settleNotices();
    broadcastTasks(user.id);
    res.json({ members: store.householdMembers(user.id).map((m) => displayName(m)) });
  });

  router.post("/family/unlink", async (req, res) => {
    const user = store.getUser(simUser(req));
    const others = store.householdMembers(user.id).filter((m) => m.id !== user.id);
    if (store.leaveHousehold(user.id)) await send(user.id, t(langOf(user), "left"));
    for (const member of others) broadcastTasks(member.id);
    broadcastTasks(user.id);
    res.json({ ok: true });
  });

  router.post("/message", async (req, res) => {
    const userId = simUser(req);
    const { text = "", forwarded = false, attachment = null, voiceSeconds = null, voiceSrc = null } = req.body ?? {};
    const media = attachment ? [parseDataUrl(attachment.dataUrl)].filter(Boolean) : [];
    if (!text.trim() && !media.length) return res.status(400).json({ error: "Empty message" });

    const isVoice = media[0]?.contentType.startsWith("audio/");
    log(userId, {
      from: "user",
      text,
      forwarded,
      // Sample voice notes can be replayed from /samples; recordings aren't stored.
      voice: isVoice ? { seconds: Number(voiceSeconds) || null, src: /^samples\/[\w.-]+$/.test(voiceSrc ?? "") ? voiceSrc : null } : null,
      attachment:
        attachment && !isVoice ? { name: attachment.name, contentType: media[0]?.contentType, preview: attachment.preview ?? null } : null,
    });
    res.status(202).json({ ok: true });

    broadcast(userId, { type: "typing", on: true });
    try {
      const replies = await handleIncoming({ userId, text, media });
      for (const reply of replies) await send(userId, reply);
      await settleNotices();
    } catch (err) {
      console.error("[simulator]", err);
      await send(userId, t(langOf(store.getUser(userId)), "error"));
    } finally {
      broadcast(userId, { type: "typing", on: false });
      broadcastTasks(userId);
    }
  });

  // Demo: jump the clock to the family's next reminder and send it now.
  router.post("/next-reminder", async (req, res) => {
    const [task] = pendingReminders(simUser(req));
    if (!task) return res.json({ sent: false });
    const at = DateTime.max(fromIso(task.remindAt), nowLocal());
    await sendReminder(task, at);
    res.json({ sent: true, at: at.toISO(), n: task.n, title: task.title });
  });

  // Demo: show tomorrow morning's summary on every family member's phone.
  router.post("/morning", async (req, res) => {
    const morning = nowLocal().plus({ days: 1 }).set({ hour: config.morningDigest.hour, minute: config.morningDigest.minute });
    let sent = false;
    for (const member of store.householdMembers(simUser(req))) {
      const text = digestText(member, morning);
      if (text) await send(member.id, text);
      sent ||= Boolean(text);
    }
    res.json({ sent, at: morning.toISO() });
  });

  router.post("/reset", (req, res) => {
    const users = Array.isArray(req.body?.users) ? req.body.users : [req.body?.user ?? req.query.user];
    for (const raw of users) store.resetHousehold(simId(raw));
    for (const raw of users) broadcast(simId(raw), { type: "reset" });
    res.json({ ok: true });
  });

  return router;
}
