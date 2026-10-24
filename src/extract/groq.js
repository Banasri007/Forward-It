// Reads a forwarded message with Groq (OpenAI-compatible API).
// Text goes to GROQ_MODEL; photos go to GROQ_VISION_MODEL, which must accept images;
// voice notes are transcribed with GROQ_STT_MODEL (Whisper).
// Groq can't read PDF files, so extract/index.js turns PDFs into text first.
import { config } from "../config.js";
import { SYSTEM_PROMPT, buildPrompt, parseResult, resultSchema } from "./prompt.js";

const API_BASE = "https://api.groq.com/openai/v1";
const IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/gif", "image/webp"]);
const MAX_IMAGES = 3; // Groq's per-request limit for vision models
const MAX_RATE_LIMIT_WAIT_MS = 12_000;

const RESULT_SCHEMA = resultSchema((schema) => ({ ...schema, type: [schema.type, "null"] }));

export class GroqError extends Error {
  constructor(status, message) {
    super(`Groq API error ${status}: ${message}`);
    this.status = status;
  }
}

export function canRead(contentType) {
  return IMAGE_TYPES.has(contentType);
}

// How long Groq asks us to wait after a 429, from the retry-after header or the message.
function retryDelayMs(res, message) {
  const header = res.headers.get("retry-after");
  if (header !== null && Number.isFinite(Number(header)) && Number(header) >= 0) return Number(header) * 1000;
  const match = /try again in ([\d.]+)s/i.exec(message ?? "");
  return match ? Number(match[1]) * 1000 : null;
}

/** POST to a Groq endpoint and return the JSON reply, with one retry for rate limits and outages. */
async function groqPost(path, { body, headers = {} }, { retry = true } = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${config.ai.groqKey}`, ...headers },
    body,
    signal: AbortSignal.timeout(30_000),
  });
  const data = await res.json().catch(() => ({}));
  if (retry && (res.status === 429 || res.status >= 500)) {
    // Free-tier rate limits reset within seconds, and "over capacity" errors are
    // usually brief: one short wait beats a worse answer.
    const wait = res.status === 429 ? retryDelayMs(res, data.error?.message) : (retryDelayMs(res, "") ?? 1500);
    if (wait !== null && wait <= MAX_RATE_LIMIT_WAIT_MS) {
      console.warn(`[groq] HTTP ${res.status}; retrying in ${(wait / 1000).toFixed(1)}s`);
      await new Promise((resolve) => setTimeout(resolve, wait + 250));
      return groqPost(path, { body, headers }, { retry: false });
    }
  }
  if (!res.ok) throw new GroqError(res.status, data.error?.message ?? res.statusText);
  return data;
}

const callGroq = (body) => groqPost("/chat/completions", { body: JSON.stringify(body), headers: { "Content-Type": "application/json" } });

const AUDIO_EXTENSIONS = { "audio/ogg": "ogg", "audio/webm": "webm", "audio/wav": "wav", "audio/x-wav": "wav", "audio/mpeg": "mp3", "audio/mp4": "m4a", "audio/aac": "m4a", "audio/flac": "flac" };

/** Turn a voice note into text with Whisper. Returns "" when nothing was said. */
export async function transcribeWithGroq({ contentType, data }) {
  const type = contentType.split(";")[0].trim();
  const form = new FormData();
  form.append("file", new Blob([Buffer.from(data, "base64")], { type }), `voice-note.${AUDIO_EXTENSIONS[type] ?? "ogg"}`);
  form.append("model", config.ai.groqSttModel);
  form.append("response_format", "json");
  form.append("prompt", "A voice note about a task, bill, school notice or appointment, in English, Hindi or Hinglish.");
  const result = await groqPost("/audio/transcriptions", { body: form });
  return String(result.text ?? "").trim();
}

// Keep replies fast: little or no visible reasoning. Qwen needs a JSON-safe reasoning format.
function reasoningParams(model, { strict }) {
  if (model.startsWith("openai/gpt-oss")) return strict ? { reasoning_effort: "low", include_reasoning: false } : {};
  if (model.startsWith("qwen/")) return strict ? { reasoning_effort: "none", reasoning_format: "hidden" } : { reasoning_format: "hidden" };
  return {};
}

function parseContent(content) {
  // Some models wrap JSON in <think> blocks or code fences; take the outermost object.
  const cleaned = String(content ?? "").replace(/<think>[\s\S]*?<\/think>/g, "");
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start === -1 || end <= start) throw new Error("Groq returned no JSON");
  return JSON.parse(cleaned.slice(start, end + 1));
}

export async function extractWithGroq({ text, media = [], now, preferredLang }) {
  const images = media.filter((m) => canRead(m.contentType)).slice(0, MAX_IMAGES);
  const model = images.length ? config.ai.groqVisionModel : config.ai.groqModel;
  const prompt = buildPrompt({ text, now, preferredLang, mediaCount: images.length });
  const userContent = images.length
    ? [
        { type: "text", text: prompt },
        ...images.map((m) => ({ type: "image_url", image_url: { url: `data:${m.contentType};base64,${m.data}` } })),
      ]
    : prompt;

  const request = (system, extra) => ({
    model,
    messages: [
      { role: "system", content: system },
      { role: "user", content: userContent },
    ],
    ...extra,
  });

  let data;
  try {
    data = await callGroq(
      request(SYSTEM_PROMPT, {
        response_format: { type: "json_schema", json_schema: { name: "forward_it_tasks", strict: true, schema: RESULT_SCHEMA } },
        ...reasoningParams(model, { strict: true }),
      }),
    );
  } catch (err) {
    if (!(err instanceof GroqError) || ![400, 422].includes(err.status)) throw err;
    // Some models or parameter combinations don't support strict schemas; retry with plain JSON mode.
    console.warn(`[groq] ${err.message} - retrying in JSON mode`);
    const system = `${SYSTEM_PROMPT}\n\nReply with only a JSON object that matches this JSON schema:\n${JSON.stringify(RESULT_SCHEMA)}`;
    data = await callGroq(request(system, { response_format: { type: "json_object" }, ...reasoningParams(model, { strict: false }) }));
  }

  const choice = data.choices?.[0];
  if (choice?.finish_reason === "length") throw new Error("Groq's answer was cut off");
  return { ...parseResult(parseContent(choice?.message?.content)), readCount: images.length };
}
