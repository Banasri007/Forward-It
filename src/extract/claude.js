// Reads a forwarded message (text, photo or PDF) with Claude and returns the
// tasks in it as structured JSON.
import Anthropic from "@anthropic-ai/sdk";
import { config } from "../config.js";
import { SYSTEM_PROMPT, buildPrompt, parseResult, resultSchema } from "./prompt.js";

const IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/gif", "image/webp"]);

const RESULT_SCHEMA = resultSchema((schema) => ({ anyOf: [schema, { type: "null" }] }));

let client = null;

export function canRead(contentType) {
  return contentType === "application/pdf" || IMAGE_TYPES.has(contentType);
}

export async function extractWithClaude({ text, media = [], now, preferredLang }) {
  client ??= new Anthropic({ timeout: 60_000, maxRetries: 2 });
  const readable = media.filter((m) => canRead(m.contentType));
  const content = readable.map((m) =>
    m.contentType === "application/pdf"
      ? { type: "document", source: { type: "base64", media_type: "application/pdf", data: m.data } }
      : { type: "image", source: { type: "base64", media_type: m.contentType, data: m.data } },
  );
  content.push({ type: "text", text: buildPrompt({ text, now, preferredLang, mediaCount: readable.length }) });

  const response = await client.beta.messages.create({
    model: config.ai.claudeModel,
    max_tokens: 16000,
    // If the model declines, the API retries on Anthropic's recommended fallback model.
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    // Extraction is a quick job; low effort keeps WhatsApp replies fast.
    output_config: { effort: "low", format: { type: "json_schema", schema: RESULT_SCHEMA } },
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content }],
  });

  if (response.stop_reason === "refusal") {
    throw new Error(`Claude declined the message (${response.stop_details?.category ?? "no category"})`);
  }
  if (response.stop_reason === "max_tokens") throw new Error("Claude's answer was cut off");

  const block = response.content.find((b) => b.type === "text");
  if (!block) throw new Error("Claude returned no text");
  return { ...parseResult(JSON.parse(block.text)), readCount: readable.length };
}
