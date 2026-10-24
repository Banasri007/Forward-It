// Real WhatsApp through Twilio (the free Sandbox works).
// Incoming messages arrive one of two ways:
//   - polling (default, see twilio-poll.js): we ask Twilio for new messages every
//     few seconds, so no public URL or tunnel is needed;
//   - webhook: Twilio POSTs each message to /webhooks/twilio (needs PUBLIC_URL).
// Outgoing: Twilio's Messages REST API.
import crypto from "node:crypto";
import express from "express";
import { config, twilioConfigured } from "../config.js";
import { handleIncoming, langOf } from "../bot.js";
import { registerChannel, send } from "../outbox.js";
import * as store from "../store.js";
import { t } from "../i18n.js";

const API_BASE = "https://api.twilio.com";
const MAX_BODY = 1500; // WhatsApp via Twilio allows 1600 characters per message
const MAX_MEDIA_BYTES = 10 * 1024 * 1024;

// Sandbox housekeeping ("join word-word", "stop") that Twilio answers itself.
const SANDBOX_COMMAND = /^(join\s+[\w-]+|stop)$/i;

const basicAuth = () =>
  `Basic ${Buffer.from(`${config.twilio.accountSid}:${config.twilio.authToken}`).toString("base64")}`;

/** Authenticated request to Twilio's REST API. Accepts a full URL or an API path. */
export function twilioFetch(pathOrUrl, init = {}) {
  const url = pathOrUrl.startsWith("https://") ? pathOrUrl : `${API_BASE}${pathOrUrl}`;
  return fetch(url, {
    ...init,
    headers: { Authorization: basicAuth(), ...init.headers },
    signal: AbortSignal.timeout(20_000),
  });
}

/** Twilio signs each webhook: HMAC-SHA1 of the URL plus the sorted POST params. */
function hasValidSignature(req) {
  const signature = req.get("X-Twilio-Signature");
  if (!signature) return false;
  const url = config.twilio.publicUrl
    ? `${config.twilio.publicUrl}${req.originalUrl}`
    : `${req.protocol}://${req.get("host")}${req.originalUrl}`;
  const payload = Object.keys(req.body)
    .sort()
    .reduce((acc, key) => acc + key + req.body[key], url);
  const expected = crypto.createHmac("sha1", config.twilio.authToken).update(payload).digest("base64");
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

async function downloadMedia(url, contentType) {
  const res = await twilioFetch(url);
  if (!res.ok) throw new Error(`Media download failed: HTTP ${res.status}`);
  const bytes = Buffer.from(await res.arrayBuffer());
  if (bytes.length > MAX_MEDIA_BYTES) throw new Error("Media file too large");
  return { contentType: contentType.split(";")[0].trim(), data: bytes.toString("base64") };
}

function splitMessage(text) {
  if (text.length <= MAX_BODY) return [text];
  const chunks = [];
  let current = "";
  for (const para of text.split("\n\n")) {
    if (current && current.length + para.length + 2 > MAX_BODY) {
      chunks.push(current);
      current = "";
    }
    current = current ? `${current}\n\n${para}` : para.slice(0, MAX_BODY);
  }
  if (current) chunks.push(current);
  return chunks;
}

async function sendWhatsApp(to, text) {
  if (!twilioConfigured) {
    console.warn(`[twilio] Not configured; would have sent to ${to}:\n${text}`);
    return;
  }
  for (const body of splitMessage(text)) {
    const res = await twilioFetch(`/2010-04-01/Accounts/${config.twilio.accountSid}/Messages.json`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ From: config.twilio.from, To: to, Body: body }),
    });
    if (!res.ok) {
      const detail = await res.text();
      throw new Error(`Twilio send failed (HTTP ${res.status}): ${detail.slice(0, 300)}`);
    }
  }
}

registerChannel("whatsapp:", sendWhatsApp);

/**
 * Handle one incoming WhatsApp message, however it arrived. Each Twilio
 * message SID is handled once, even if both polling and the webhook see it.
 * media: [{ url, contentType }] pointing at Twilio's media files.
 */
export async function handleWhatsAppMessage({ sid, from, body = "", media = [] }) {
  if (sid) {
    if (store.seenTwilioMessage(sid)) return;
    store.markTwilioMessage(sid);
  }
  if (!media.length && SANDBOX_COMMAND.test(body.trim())) return;

  try {
    const files = [];
    for (const { url, contentType } of media) {
      if (contentType.startsWith("audio/")) files.push({ contentType, data: "" });
      else files.push(await downloadMedia(url, contentType));
    }
    const replies = await handleIncoming({ userId: from, text: body, media: files });
    for (const reply of replies) await send(from, reply);
  } catch (err) {
    console.error(`[twilio] Failed to handle message from ${from}:`, err);
    await send(from, t(langOf(store.getUser(from)), "error")).catch(() => {});
  }
}

export function twilioRouter() {
  const router = express.Router();
  router.post("/", express.urlencoded({ extended: false }), (req, res) => {
    if (!twilioConfigured) return res.status(503).send("Twilio is not configured on this server.");
    if (!hasValidSignature(req)) return res.status(403).send("Invalid Twilio signature.");
    // Answer Twilio right away (it gives up after 15s); replies go out via the REST API.
    res.type("text/xml").send("<Response></Response>");
    const media = Array.from({ length: Number(req.body.NumMedia || 0) }, (_, i) => ({
      url: req.body[`MediaUrl${i}`],
      contentType: req.body[`MediaContentType${i}`] || "",
    }));
    handleWhatsAppMessage({ sid: req.body.MessageSid, from: req.body.From, body: req.body.Body || "", media });
  });
  return router;
}
