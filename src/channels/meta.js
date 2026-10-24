// Real two-way WhatsApp through Meta's WhatsApp Cloud API.
// Incoming: Meta POSTs to /webhooks/meta (signed with your app secret).
// Outgoing: Graph API /{phone-number-id}/messages. Free-form text is allowed
// within 24 hours of the user's last message, which covers forward -> reply.
import crypto from "node:crypto";
import express from "express";
import { config, metaConfigured } from "../config.js";
import { handleIncoming, langOf } from "../bot.js";
import { registerChannel, send } from "../outbox.js";
import * as store from "../store.js";
import { t } from "../i18n.js";

const MAX_TEXT = 4000; // WhatsApp allows 4096 characters per text message
const MAX_MEDIA_BYTES = 15 * 1024 * 1024;
// A 👍 reaction to a reminder means the same as replying 👍.
const DONE_REACTIONS = new Set(["👍", "✅", "☑️", "✔️", "👌"]);

const graph = (path) => `https://graph.facebook.com/${config.meta.graphVersion}/${path}`;
const auth = () => ({ Authorization: `Bearer ${config.meta.accessToken}` });
const userIdFor = (waId) => `meta:+${waId.replace(/\D/g, "")}`;

class MetaError extends Error {
  constructor(status, error = {}) {
    super(`Meta API error ${status}${error.code ? ` (${error.code})` : ""}: ${error.message ?? "request failed"}`);
    this.status = status;
    this.code = error.code;
  }
}

async function graphRequest(url, init = {}) {
  const res = await fetch(url, { ...init, headers: { ...auth(), ...init.headers }, signal: AbortSignal.timeout(20_000) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new MetaError(res.status, data.error);
  return data;
}

/** Meta signs each webhook POST: X-Hub-Signature-256 = sha256=HMAC(app secret, raw body). */
function hasValidSignature(req) {
  const header = req.get("X-Hub-Signature-256") ?? "";
  if (!header.startsWith("sha256=")) return false;
  const expected = crypto.createHmac("sha256", config.meta.appSecret).update(req.body).digest("hex");
  const a = Buffer.from(header.slice(7));
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// Media IDs from webhooks -> a short-lived URL -> the file (both need the access token).
async function downloadMedia({ id, mime_type: mimeType }) {
  const info = await graphRequest(graph(id));
  const res = await fetch(info.url, { headers: auth(), signal: AbortSignal.timeout(30_000) });
  if (!res.ok) throw new Error(`Media download failed: HTTP ${res.status}`);
  const bytes = Buffer.from(await res.arrayBuffer());
  if (bytes.length > MAX_MEDIA_BYTES) throw new Error("Media file too large");
  return { contentType: (info.mime_type ?? mimeType ?? "application/octet-stream").split(";")[0].trim(), data: bytes.toString("base64") };
}

function splitMessage(text) {
  if (text.length <= MAX_TEXT) return [text];
  const chunks = [];
  let current = "";
  for (const para of text.split("\n\n")) {
    if (current && current.length + para.length + 2 > MAX_TEXT) {
      chunks.push(current);
      current = "";
    }
    current = current ? `${current}\n\n${para}` : para.slice(0, MAX_TEXT);
  }
  if (current) chunks.push(current);
  return chunks;
}

async function sendMeta(userId, text) {
  if (!metaConfigured) {
    console.warn(`[meta] Not configured; would have sent to ${userId}:\n${text}`);
    return;
  }
  const to = userId.replace(/\D/g, "");
  for (const body of splitMessage(text)) {
    try {
      await graphRequest(graph(`${config.meta.phoneNumberId}/messages`), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messaging_product: "whatsapp", recipient_type: "individual", to, type: "text", text: { preview_url: false, body } }),
      });
    } catch (err) {
      if (err.code === 131047) throw new Error("More than 24 hours since this person's last message, so WhatsApp only allows an approved template. They need to message the bot again.");
      if (err.code === 131030) throw new Error("This number isn't on the test number's allowed list. Add it under WhatsApp > API Setup in the Meta app.");
      if (err.status === 401) throw new Error("Meta rejected META_ACCESS_TOKEN (expired or wrong). Generate a new one and restart.");
      throw err;
    }
  }
}

registerChannel("meta:", sendMeta);

// Blue ticks, so the sender knows the message arrived. Best effort.
function markRead(messageId) {
  graphRequest(graph(`${config.meta.phoneNumberId}/messages`), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ messaging_product: "whatsapp", status: "read", message_id: messageId }),
  }).catch(() => {});
}

/** Turn one WhatsApp message object into { text, media } for the bot, or null if it's not something we read. */
function readMessage(message) {
  switch (message.type) {
    case "text":
      return { text: message.text?.body ?? "", media: [] };
    case "image":
    case "document":
    case "audio":
      return { text: message[message.type]?.caption ?? "", media: [message[message.type]] };
    case "reaction":
      return DONE_REACTIONS.has(message.reaction?.emoji) ? { text: "👍", media: [] } : null;
    default:
      return { unsupported: true };
  }
}

async function handleMessage(message, contacts) {
  if (store.seenMessage(message.id)) return; // Meta retries deliveries; answer once
  store.markMessage(message.id);
  const userId = userIdFor(message.from);

  // Family members see the WhatsApp profile name, unless the user set one with NAME.
  const profileName = contacts?.find((c) => c.wa_id === message.from)?.profile?.name ?? null;
  const content = readMessage(message);
  if (!content) return;
  if (message.type !== "reaction") markRead(message.id);
  try {
    if (content.unsupported) {
      const isNew = store.isNewUser(userId);
      const lang = langOf(store.getUser(userId));
      if (isNew) await send(userId, t(lang, "welcome"));
      await send(userId, t(lang, "unsupportedMessage"));
      return;
    }
    const media = [];
    for (const item of content.media) media.push(await downloadMedia(item));
    const replies = await handleIncoming({ userId, text: content.text, media, profileName });
    for (const reply of replies) await send(userId, reply);
  } catch (err) {
    console.error(`[meta] Failed to handle message from ${userId}: ${err.message}`);
    await send(userId, t(langOf(store.getUser(userId)), "error")).catch(() => {});
  }
}

/** Process one webhook notification (several messages can arrive in one POST). */
export async function handleMetaWebhook(payload) {
  for (const entry of payload?.entry ?? []) {
    for (const change of entry.changes ?? []) {
      const value = change.value ?? {};
      if (change.field !== "messages" || value.metadata?.phone_number_id !== config.meta.phoneNumberId) continue;
      for (const message of value.messages ?? []) await handleMessage(message, value.contacts);
    }
  }
}

export function metaRouter() {
  const router = express.Router();

  // Meta checks the URL once when you save it: echo hub.challenge if the verify token matches.
  router.get("/", (req, res) => {
    const ok = config.meta.verifyToken && req.query["hub.mode"] === "subscribe" && req.query["hub.verify_token"] === config.meta.verifyToken;
    if (!ok) return res.status(403).send("Verification failed");
    res.type("text/plain").send(String(req.query["hub.challenge"] ?? ""));
  });

  router.post("/", express.raw({ type: "*/*", limit: "5mb" }), (req, res) => {
    if (!metaConfigured) return res.status(503).send("Meta WhatsApp is not configured on this server.");
    if (config.meta.appSecret && !hasValidSignature(req)) return res.status(403).send("Invalid signature");
    let payload;
    try {
      payload = JSON.parse(req.body.toString("utf8"));
    } catch {
      return res.status(400).send("Invalid JSON");
    }
    res.sendStatus(200); // acknowledge fast; replies go out through the Graph API
    handleMetaWebhook(payload).catch((err) => console.error("[meta]", err));
  });

  return router;
}
