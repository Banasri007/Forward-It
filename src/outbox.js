// Routes outgoing messages to the right channel by user id prefix:
// "whatsapp:+91..." -> Twilio, "sim:..." -> the local simulator.
const channels = new Map();

export function registerChannel(prefix, sendFn) {
  channels.set(prefix, sendFn);
}

export async function send(userId, text) {
  for (const [prefix, sendFn] of channels) {
    if (userId.startsWith(prefix)) return sendFn(userId, text);
  }
  console.warn(`[outbox] No channel for ${userId}; message dropped.`);
}
