// Polling mode: every few seconds, ask Twilio for new incoming WhatsApp
// messages. The server only makes outgoing requests, so it works on any
// network (college Wi-Fi, hotspot) with no public URL, tunnel or webhook.
import { config } from "../config.js";
import * as store from "../store.js";
import { handleWhatsAppMessage, twilioFetch } from "./twilio.js";

// After a restart, still answer messages from the last few minutes, but don't
// replay old history.
const CATCH_UP_MS = 10 * 60_000;
const PAGE_SIZE = 20;

export class TwilioPollError extends Error {
  constructor(status, message) {
    super(`Twilio API error ${status}: ${message}`);
    this.status = status;
  }
}

async function mediaFor(message) {
  const res = await twilioFetch(message.subresource_uris.media);
  if (!res.ok) throw new TwilioPollError(res.status, "couldn't list the message's media");
  const { media_list: list = [] } = await res.json();
  // Each entry's URI ends in ".json" (its details); without it, it's the file itself.
  return list.map((m) => ({ url: m.uri.replace(/\.json$/, ""), contentType: m.content_type }));
}

/** Fetch and handle new messages once. Returns how many were handled. */
export async function pollOnce(startedAt) {
  const query = new URLSearchParams({ To: config.twilio.from, PageSize: String(PAGE_SIZE) });
  const res = await twilioFetch(`/2010-04-01/Accounts/${config.twilio.accountSid}/Messages.json?${query}`);
  if (!res.ok) {
    const detail = await res.json().catch(() => ({}));
    throw new TwilioPollError(res.status, detail.message ?? res.statusText);
  }
  const { messages = [] } = await res.json();

  // Twilio lists newest first; answer in the order people sent them.
  const fresh = messages.filter((m) => m.direction === "inbound" && !store.seenTwilioMessage(m.sid)).reverse();
  let handled = 0;
  for (const message of fresh) {
    if (Date.parse(message.date_created) < startedAt - CATCH_UP_MS) {
      store.markTwilioMessage(message.sid);
      continue;
    }
    const media = Number(message.num_media) > 0 ? await mediaFor(message) : [];
    await handleWhatsAppMessage({ sid: message.sid, from: message.from, body: message.body ?? "", media });
    handled += 1;
  }
  return handled;
}

export function startPolling() {
  const startedAt = Date.now();
  let lastError = null;
  const loop = async () => {
    try {
      await pollOnce(startedAt);
      if (lastError) console.log("[twilio] Polling is working again.");
      lastError = null;
    } catch (err) {
      if (err.status === 401 || err.status === 403) {
        console.error("[twilio] Twilio rejected TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN. WhatsApp is off until you fix .env and restart.");
        return;
      }
      // Log each new kind of failure once, not every few seconds.
      if (err.message !== lastError) console.warn(`[twilio] Couldn't check for messages (will keep trying): ${err.message}`);
      lastError = err.message;
    }
    setTimeout(loop, config.twilio.pollSeconds * 1000);
  };
  loop();
}
