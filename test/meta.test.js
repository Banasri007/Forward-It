// Meta WhatsApp Cloud API channel against a fake Graph API: no network, no real account.
import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import express from "express";

process.env.DATA_FILE = ":memory:";
process.env.FORWARDIT_AI = "off";
process.env.META_ACCESS_TOKEN = "meta-test-token";
process.env.META_PHONE_NUMBER_ID = "111222333";
process.env.META_APP_SECRET = "meta-app-secret";
process.env.META_VERIFY_TOKEN = "my-verify-phrase";
process.env.TWILIO_ACCOUNT_SID = "";
process.env.TWILIO_AUTH_TOKEN = "";

const GRAPH = "https://graph.facebook.com/v23.0";
const realFetch = globalThis.fetch;
const sent = []; // text messages the bot sent
const graphCalls = [];

globalThis.fetch = async (input, init = {}) => {
  const url = String(input);
  if (!url.startsWith("https://graph.facebook.com") && !url.startsWith("https://lookaside.fbsbx.com")) return realFetch(input, init);
  graphCalls.push({ url, method: init.method ?? "GET", auth: init.headers?.Authorization });
  const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
  if (url === `${GRAPH}/111222333/messages`) {
    const body = JSON.parse(init.body);
    if (body.status === "read") return json({ success: true });
    sent.push(body);
    return json({ messages: [{ id: `wamid.out${sent.length}` }] });
  }
  if (url === `${GRAPH}/MEDIA1`) return json({ url: "https://lookaside.fbsbx.com/whatsapp_business/attachments/?mid=MEDIA1", mime_type: "image/jpeg", id: "MEDIA1" });
  if (url.startsWith("https://lookaside.fbsbx.com/")) return new Response(Buffer.from("fake-jpeg"), { status: 200, headers: { "Content-Type": "image/jpeg" } });
  return json({ error: { message: "unexpected", code: 100 } }, 400);
};

const { handleMetaWebhook, metaRouter } = await import("../src/channels/meta.js");
const store = await import("../src/store.js");
const { config, metaConfigured } = await import("../src/config.js");

let server;
let base;
before(async () => {
  const app = express();
  app.use("/webhooks/meta", metaRouter());
  await new Promise((resolve) => (server = app.listen(0, resolve)));
  base = `http://127.0.0.1:${server.address().port}/webhooks/meta`;
});
after(() => server.close());
beforeEach(() => {
  sent.length = 0;
  graphCalls.length = 0;
});

const FROM = "919000000099";
let seq = 0;
function notification(message, { name = "Priya" } = {}) {
  return {
    object: "whatsapp_business_account",
    entry: [
      {
        id: "WABA_ID",
        changes: [
          {
            field: "messages",
            value: {
              messaging_product: "whatsapp",
              metadata: { display_phone_number: "15551234567", phone_number_id: "111222333" },
              contacts: [{ profile: { name }, wa_id: FROM }],
              messages: [{ from: FROM, id: message.id ?? `wamid.in${++seq}`, timestamp: "1761400000", ...message }],
            },
          },
        ],
      },
    ],
  };
}
const sign = (raw) => `sha256=${crypto.createHmac("sha256", "meta-app-secret").update(raw).digest("hex")}`;
const texts = () => sent.map((m) => m.text.body);

test("Meta settings turn the channel on", () => {
  assert.equal(metaConfigured, true);
  assert.equal(config.meta.graphVersion, "v23.0");
});

test("webhook verification echoes the challenge only for the right verify token", async () => {
  const ok = await realFetch(`${base}?hub.mode=subscribe&hub.verify_token=my-verify-phrase&hub.challenge=12345`);
  assert.equal(ok.status, 200);
  assert.equal(await ok.text(), "12345");
  const bad = await realFetch(`${base}?hub.mode=subscribe&hub.verify_token=wrong&hub.challenge=12345`);
  assert.equal(bad.status, 403);
});

test("unsigned or wrongly signed notifications are rejected", async () => {
  const raw = JSON.stringify(notification({ type: "text", text: { body: "hi" } }));
  const unsigned = await realFetch(base, { method: "POST", headers: { "Content-Type": "application/json" }, body: raw });
  assert.equal(unsigned.status, 403);
  const forged = await realFetch(base, { method: "POST", headers: { "Content-Type": "application/json", "X-Hub-Signature-256": "sha256=00" }, body: raw });
  assert.equal(forged.status, 403);
  assert.equal(sent.length, 0);
});

test("a signed text message gets real replies through the Graph API", async () => {
  const raw = JSON.stringify(notification({ type: "text", text: { body: "Term-2 fee of ₹2,400 must be paid by 30 October." } }));
  const res = await realFetch(base, { method: "POST", headers: { "Content-Type": "application/json", "X-Hub-Signature-256": sign(raw) }, body: raw });
  assert.equal(res.status, 200);
  for (let i = 0; i < 50 && sent.length < 2; i++) await new Promise((r) => setTimeout(r, 20)); // replies go out after the 200

  assert.equal(sent.length, 2);
  assert.ok(sent.every((m) => m.messaging_product === "whatsapp" && m.to === FROM && m.type === "text"));
  assert.match(texts()[0], /Forward-It/); // welcome
  assert.match(texts()[1], /Term-2 fee of ₹2,400/);
  assert.ok(graphCalls.every((c) => c.auth === "Bearer meta-test-token"));
  assert.ok(graphCalls.some((c) => c.method === "POST" && c.url.endsWith("/messages")), "marked as read");
  assert.equal(store.getUser(`meta:+${FROM}`).name, "Priya"); // WhatsApp profile name, for family messages
});

test("a message Meta delivers twice is answered once", async () => {
  const payload = notification({ id: "wamid.dup", type: "text", text: { body: "list" } });
  await handleMetaWebhook(payload);
  await handleMetaWebhook(payload);
  assert.equal(sent.length, 1);
  assert.match(texts()[0], /Your list/);
});

test("photos are fetched by media ID with the access token", async () => {
  await handleMetaWebhook(notification({ type: "image", image: { id: "MEDIA1", mime_type: "image/jpeg", caption: "" } }));
  assert.deepEqual(
    graphCalls.filter((c) => c.method === "GET").map((c) => c.url),
    [`${GRAPH}/MEDIA1`, "https://lookaside.fbsbx.com/whatsapp_business/attachments/?mid=MEDIA1"],
  );
  assert.match(texts().at(-1), /paste the text/); // AI is off in this test
});

test("a 👍 reaction to a reminder ticks the task off", async () => {
  const userId = `meta:+${FROM}`;
  const [task] = store.tasksFor(userId);
  store.getUser(userId).lastRef = task.n; // as if a reminder for it was just sent
  await handleMetaWebhook(notification({ type: "reaction", reaction: { message_id: "wamid.out1", emoji: "👍" } }));
  assert.match(texts().at(-1), /Done: Term-2 fee/);
  assert.equal(task.status, "done");
});

test("stickers and other types get a friendly explanation", async () => {
  await handleMetaWebhook(notification({ type: "sticker", sticker: { id: "S1", mime_type: "image/webp" } }));
  assert.match(texts().at(-1), /text, photos, PDFs and voice notes/);
});

test("notifications for a different phone number are ignored", async () => {
  const other = notification({ type: "text", text: { body: "hi" } });
  other.entry[0].changes[0].value.metadata.phone_number_id = "999";
  await handleMetaWebhook(other);
  assert.equal(sent.length, 0);
});
