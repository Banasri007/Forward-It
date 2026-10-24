// Polling mode against a fake Twilio API: no network, no real account.
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";

const SID = `AC${"1".repeat(32)}`;
process.env.TWILIO_ACCOUNT_SID = SID;
process.env.TWILIO_AUTH_TOKEN = "2".repeat(32);
process.env.TWILIO_WHATSAPP_FROM = "whatsapp:+14155238886";
process.env.PUBLIC_URL = "";
process.env.WHATSAPP_MODE = "";
process.env.DATA_FILE = ":memory:";
process.env.FORWARDIT_AI = "off";

const ME = "whatsapp:+919876543210";
const sent = [];
const requests = [];
let inbox = []; // Twilio message resources, newest first (as Twilio lists them)
let mediaLists = {};
let listStatus = 200;

const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

globalThis.fetch = async (input, init = {}) => {
  const url = String(input);
  requests.push({ url, method: init.method ?? "GET", auth: init.headers?.Authorization });
  if (init.method === "POST" && url.endsWith(`/Accounts/${SID}/Messages.json`)) {
    const params = new URLSearchParams(init.body);
    sent.push({ to: params.get("To"), from: params.get("From"), body: params.get("Body") });
    return json({ sid: "SMoutgoing" }, 201);
  }
  if (url.includes(`/Accounts/${SID}/Messages.json?`)) {
    return listStatus === 200 ? json({ messages: inbox }) : json({ message: "Authenticate", status: listStatus }, listStatus);
  }
  const mediaList = url.match(/Messages\/(MM\w+)\/Media\.json$/);
  if (mediaList) return json({ media_list: mediaLists[mediaList[1]] ?? [] });
  if (/\/Media\/ME\w+$/.test(url)) return new Response(Buffer.from("fake-jpeg"), { status: 200, headers: { "Content-Type": "image/jpeg" } });
  throw new Error(`Unexpected request: ${url}`);
};

const { config, whatsappMode } = await import("../src/config.js");
const { pollOnce } = await import("../src/channels/twilio-poll.js");
const { handleWhatsAppMessage } = await import("../src/channels/twilio.js");

const startedAt = Date.now();
const message = (sid, body, { secondsAgo = 5, direction = "inbound", numMedia = 0 } = {}) => ({
  sid,
  body,
  from: direction === "inbound" ? ME : "whatsapp:+14155238886",
  to: direction === "inbound" ? "whatsapp:+14155238886" : ME,
  direction,
  num_media: String(numMedia),
  date_created: new Date(Date.now() - secondsAgo * 1000).toUTCString(),
  subresource_uris: { media: `/2010-04-01/Accounts/${SID}/Messages/${sid}/Media.json` },
});

beforeEach(() => {
  sent.length = 0;
  requests.length = 0;
  inbox = [];
  mediaLists = {};
  listStatus = 200;
});

test("with Twilio keys and no public URL, WhatsApp uses polling", () => {
  assert.equal(whatsappMode, "poll");
  assert.equal(config.twilio.pollSeconds, 3);
});

test("new messages are answered once; old history, our own replies and sandbox joins are skipped", async () => {
  inbox = [
    message("MMnew", "Term-2 fee of ₹2,400 must be paid by 30 October.", { secondsAgo: 2 }),
    message("SMreply", "✅ Got it!", { secondsAgo: 3, direction: "outbound-api" }),
    message("MMjoin", "join happy-tiger", { secondsAgo: 10 }),
    message("MMold", "Pay the rent by Friday", { secondsAgo: 3600 }),
  ];
  assert.equal(await pollOnce(startedAt), 2); // the fee message and the (silently skipped) join

  assert.deepEqual(sent.map((m) => m.to), [ME, ME]);
  assert.ok(sent.every((m) => m.from === "whatsapp:+14155238886"));
  assert.match(sent[0].body, /Forward-It/); // welcome for a first-time user
  assert.match(sent[1].body, /Term-2 fee of ₹2,400/);
  assert.ok(!sent.some((m) => /rent/i.test(m.body)), "an hour-old message isn't replayed");

  sent.length = 0;
  assert.equal(await pollOnce(startedAt), 0);
  assert.equal(sent.length, 0, "nothing is answered twice");
});

test("messages are answered in the order they were sent", async () => {
  inbox = [message("MMsecond", "list", { secondsAgo: 1 }), message("MMfirst", "Electricity bill due on 27-10-2026, pay it", { secondsAgo: 4 })];
  await pollOnce(startedAt);
  assert.match(sent[0].body, /Got it/);
  assert.match(sent[1].body, /Your list/);
});

test("photos are downloaded from Twilio with the account's credentials", async () => {
  inbox = [message("MMphoto", "", { numMedia: 1 })];
  mediaLists.MMphoto = [{ uri: `/2010-04-01/Accounts/${SID}/Messages/MMphoto/Media/ME123.json`, content_type: "image/jpeg" }];
  await pollOnce(startedAt);

  const download = requests.find((r) => r.url.endsWith("/Media/ME123"));
  assert.equal(download.url, `https://api.twilio.com/2010-04-01/Accounts/${SID}/Messages/MMphoto/Media/ME123`);
  assert.match(download.auth, /^Basic /);
  assert.match(sent.at(-1).body, /paste the text/); // AI is off in this test, so it asks for text
});

test("a message seen by both the webhook and polling is answered once", async () => {
  await handleWhatsAppMessage({ sid: "MMboth", from: ME, body: "list" });
  inbox = [message("MMboth", "list")];
  await pollOnce(startedAt);
  assert.equal(sent.length, 1);
});

test("wrong Twilio keys are reported as an auth error", async () => {
  listStatus = 401;
  await assert.rejects(pollOnce(startedAt), (err) => err.status === 401);
  assert.equal(sent.length, 0);
});
