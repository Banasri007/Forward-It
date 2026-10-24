// Groq integration tests against a fake fetch: no network, no real key.
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { DateTime } from "luxon";

process.env.GROQ_API_KEY = "gsk_test_key";
process.env.DATA_FILE = ":memory:";
delete process.env.AI_PROVIDER;
delete process.env.FORWARDIT_AI;

const calls = [];
let replies = [];
globalThis.fetch = async (url, init) => {
  const form = init.body instanceof FormData ? init.body : null;
  calls.push({ url, headers: init.headers, form, body: form ? null : JSON.parse(init.body) });
  const { status = 200, body, headers = {} } = replies.shift();
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...headers } });
};

const { config } = await import("../src/config.js");
const { extractWithGroq, GroqError } = await import("../src/extract/groq.js");
const { extract } = await import("../src/extract/index.js");

const now = DateTime.fromISO("2026-10-24T15:00", { zone: "Asia/Kolkata" });
const completion = (content, finish_reason = "stop") => ({ body: { choices: [{ message: { content }, finish_reason }] } });
const feeTask = {
  title: "Pay Term-2 school fee ₹2,400",
  details: null,
  due_date: "2026-10-30",
  due_time: null,
  remind_at: null,
  amount: "₹2,400",
  kind: "payment",
  date_confidence: "explicit",
  source_quote: "fee of ₹2,400 must be paid by 30 October",
};

beforeEach(() => {
  calls.length = 0;
  replies = [];
});

test("a Groq key in the environment selects Groq", () => {
  assert.equal(config.ai.provider, "groq");
});

test("text goes to the text model with a strict JSON schema", async () => {
  replies.push(completion(JSON.stringify({ language: "en", tasks: [feeTask], no_task_reason: null })));
  const result = await extractWithGroq({ text: "Fee of ₹2,400 must be paid by 30 October", now });

  const [call] = calls;
  assert.equal(call.url, "https://api.groq.com/openai/v1/chat/completions");
  assert.equal(call.headers.Authorization, "Bearer gsk_test_key");
  assert.equal(call.body.model, "openai/gpt-oss-120b");
  assert.equal(call.body.response_format.type, "json_schema");
  assert.equal(call.body.response_format.json_schema.strict, true);
  assert.equal(call.body.reasoning_effort, "low");
  assert.match(call.body.messages[1].content, /Saturday, 24 October 2026/);

  assert.deepEqual(result.tasks.map((t) => [t.title, t.dueDate, t.amount, t.kind]), [
    ["Pay Term-2 school fee ₹2,400", "2026-10-30", "₹2,400", "payment"],
  ]);
  assert.equal(result.readCount, 0);
});

test("photos go to the vision model as data URLs", async () => {
  replies.push(completion(JSON.stringify({ language: "en", tasks: [feeTask], no_task_reason: null })));
  const result = await extractWithGroq({ text: "", media: [{ contentType: "image/jpeg", data: "AAAA" }], now });

  const [call] = calls;
  assert.equal(call.body.model, "qwen/qwen3.8-27b");
  assert.equal(call.body.reasoning_format, "hidden");
  const image = call.body.messages[1].content.find((part) => part.type === "image_url");
  assert.equal(image.image_url.url, "data:image/jpeg;base64,AAAA");
  assert.equal(result.readCount, 1);
});

test("if strict mode is rejected, it retries once in JSON mode", async () => {
  replies.push({ status: 400, body: { error: { message: "response_format not supported", type: "invalid_request_error" } } });
  replies.push(completion(`<think>hmm</think>\n\`\`\`json\n${JSON.stringify({ language: "hinglish", tasks: [], no_task_reason: "a greeting" })}\n\`\`\``));
  const result = await extractWithGroq({ text: "good morning", now });

  assert.equal(calls.length, 2);
  assert.equal(calls[1].body.response_format.type, "json_object");
  assert.match(calls[1].body.messages[0].content, /JSON schema/);
  assert.equal(result.language, "hinglish");
  assert.equal(result.noTaskReason, "a greeting");
});

test("a bad key is an error, not a retry", async () => {
  replies.push({ status: 401, body: { error: { message: "Invalid API Key", type: "invalid_request_error" } } });
  await assert.rejects(extractWithGroq({ text: "pay fee", now }), GroqError);
  assert.equal(calls.length, 1);
});

test("a rate limit waits as asked and retries once", async () => {
  replies.push({ status: 429, headers: { "retry-after": "0" }, body: { error: { message: "Rate limit reached. Please try again in 0s." } } });
  replies.push(completion(JSON.stringify({ language: "en", tasks: [feeTask], no_task_reason: null })));
  const result = await extractWithGroq({ text: "pay fee", now });
  assert.equal(calls.length, 2);
  assert.equal(result.tasks.length, 1);
});

test("a long rate limit isn't waited out", async () => {
  replies.push({ status: 429, body: { error: { message: "Rate limit reached. Please try again in 45s." } } });
  await assert.rejects(extractWithGroq({ text: "pay fee", now }), /429/);
  assert.equal(calls.length, 1);
});

test("model output is validated before use", async () => {
  const sloppy = { ...feeTask, due_date: "30/10/2026", due_time: "25:99", kind: "shopping" };
  replies.push(completion(JSON.stringify({ language: "fr", tasks: [sloppy, { title: "  " }], no_task_reason: null })));
  const result = await extractWithGroq({ text: "x", now });
  assert.equal(result.language, "en");
  assert.equal(result.tasks.length, 1);
  assert.deepEqual([result.tasks[0].dueDate, result.tasks[0].dueTime, result.tasks[0].kind], [null, null, "todo"]);
});

test("common model slips are corrected", async () => {
  const passed15th = { ...feeTask, due_date: "2026-10-15", date_confidence: "explicit", source_quote: "maintenance due by the 15th" };
  const realDate = { ...feeTask, due_date: "2026-10-20", source_quote: "fee was due on 20 October" };
  const wrongWeekday = { ...feeTask, amount: "Rs. 500", due_date: "2026-10-29", source_quote: "Friday tak project file jama karni hai" };
  replies.push(completion(JSON.stringify({ language: "hi", tasks: [passed15th, realDate, wrongWeekday], no_task_reason: null })));
  const result = await extract({ text: "society maintenance 15th tak jama karna hai", now });
  assert.equal(result.language, "hinglish"); // Hindi in Latin letters
  assert.deepEqual([result.tasks[0].dueDate, result.tasks[0].dateConfidence], ["2026-11-15", "inferred"]);
  assert.equal(result.tasks[1].dueDate, "2026-10-20"); // a named month stays as written
  assert.equal(result.tasks[2].dueDate, "2026-10-30"); // Thursday 29th corrected to Friday 30th
  assert.equal(result.tasks[2].amount, "₹500");
});

test("the prompt spells out upcoming weekdays", async () => {
  replies.push(completion(JSON.stringify({ language: "en", tasks: [], no_task_reason: null })));
  await extractWithGroq({ text: "x", now });
  assert.match(calls[0].body.messages[1].content, /Fri 30 Oct \(2026-10-30\)/);
});

test("voice notes are transcribed with Whisper, then read like text", async () => {
  const said = "Remind me to pay the cable bill of 450 rupees on Monday";
  replies.push({ body: { text: ` ${said} ` } });
  replies.push(
    completion(
      JSON.stringify({
        language: "en",
        tasks: [{ ...feeTask, title: "Pay cable bill ₹450", amount: "₹450", due_date: "2026-10-26", source_quote: "pay the cable bill on Monday" }],
        no_task_reason: null,
      }),
    ),
  );
  const result = await extract({ text: "", media: [{ contentType: "audio/ogg; codecs=opus", data: "AAAA" }], now });

  assert.equal(calls[0].url, "https://api.groq.com/openai/v1/audio/transcriptions");
  assert.equal(calls[0].form.get("model"), "whisper-large-v3-turbo");
  assert.equal(calls[0].form.get("file").name, "voice-note.ogg");
  assert.match(calls[1].body.messages[1].content, /\[Voice note\]\nRemind me to pay the cable bill/);
  assert.deepEqual(result.transcripts, [said]);
  assert.equal(result.tasks[0].title, "Pay cable bill ₹450");
  assert.equal(result.unread, 0);
});

test("a voice note Whisper couldn't hear is reported as busy", async () => {
  replies.push({ status: 503, headers: { "retry-after": "0" }, body: { error: { message: "over capacity" } } });
  replies.push({ status: 503, headers: { "retry-after": "0" }, body: { error: { message: "over capacity" } } });
  const result = await extract({ text: "", media: [{ contentType: "audio/webm", data: "AAAA" }], now });
  assert.deepEqual(result, { aiFailed: true });
});

test("an over-capacity error is retried once", async () => {
  replies.push({ status: 503, headers: { "retry-after": "0" }, body: { error: { message: "over capacity" } } });
  replies.push(completion(JSON.stringify({ language: "en", tasks: [feeTask], no_task_reason: null })));
  const result = await extractWithGroq({ text: "pay fee", now });
  assert.equal(calls.length, 2);
  assert.equal(result.tasks.length, 1);
});

test("a photo the AI couldn't read is reported as 'busy', not guessed", async () => {
  replies.push({ status: 503, headers: { "retry-after": "0" }, body: { error: { message: "over capacity" } } });
  replies.push({ status: 503, headers: { "retry-after": "0" }, body: { error: { message: "over capacity" } } });
  const result = await extract({ text: "", media: [{ contentType: "image/jpeg", data: "AAAA" }], now });
  assert.deepEqual(result, { aiFailed: true });
});

test("when Groq is down, the offline parser still answers", async () => {
  replies.push({ status: 503, headers: { "retry-after": "0" }, body: { error: { message: "Service unavailable" } } });
  replies.push({ status: 503, headers: { "retry-after": "0" }, body: { error: { message: "Service unavailable" } } });
  const result = await extract({ text: "Term-2 fee of ₹2,400 must be paid by 30 October.", now });
  assert.equal(result.engine, "offline");
  assert.equal(result.tasks[0].dueDate, "2026-10-30");
});
