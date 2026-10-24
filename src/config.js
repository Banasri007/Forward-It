import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

try {
  process.loadEnvFile(path.join(root, ".env"));
} catch {
  // No .env file: run with defaults (simulator + offline parser).
}

const env = process.env;

// Values in .env that still start with "paste-" are placeholders, not real settings.
const setting = (value) => {
  const trimmed = (value ?? "").trim();
  return /^paste-/i.test(trimmed) ? "" : trimmed;
};

const groqKey = setting(env.GROQ_API_KEY);
const anthropicKey = setting(env.ANTHROPIC_API_KEY);
if (env.ANTHROPIC_API_KEY !== undefined && !anthropicKey) delete env.ANTHROPIC_API_KEY; // keep placeholders away from the SDK

function pickProvider() {
  const choice = setting(env.AI_PROVIDER).toLowerCase();
  if (env.FORWARDIT_AI === "off" || choice === "off") return null;
  if (choice === "groq" || choice === "claude") return choice;
  if (groqKey) return "groq";
  if (anthropicKey || env.ANTHROPIC_AUTH_TOKEN || env.ANTHROPIC_PROFILE) return "claude";
  return null;
}

const provider = pickProvider();

export const config = {
  root,
  port: Number(setting(env.PORT) || 3000),
  timezone: setting(env.TIMEZONE) || "Asia/Kolkata",
  // ":memory:" keeps everything in RAM (used by the tests).
  dataFile: env.DATA_FILE || path.join(root, "data", "db.json"),
  publicDir: path.join(root, "public"),

  ai: {
    provider, // "groq" | "claude" | null (offline parser only)
    enabled: Boolean(provider),
    voice: Boolean(provider && groqKey), // voice notes are transcribed by Groq's Whisper
    groqKey,
    groqModel: setting(env.GROQ_MODEL) || "openai/gpt-oss-120b",
    groqVisionModel: setting(env.GROQ_VISION_MODEL) || "qwen/qwen3.8-27b",
    groqSttModel: setting(env.GROQ_STT_MODEL) || "whisper-large-v3-turbo",
    claudeModel: setting(env.ANTHROPIC_MODEL) || "claude-opus-5-5",
  },

  twilio: {
    accountSid: setting(env.TWILIO_ACCOUNT_SID),
    authToken: setting(env.TWILIO_AUTH_TOKEN),
    from: setting(env.TWILIO_WHATSAPP_FROM) || "whatsapp:+14155238886",
    publicUrl: setting(env.PUBLIC_URL).replace(/\/+$/, ""),
    pollSeconds: Math.max(1, Number(setting(env.TWILIO_POLL_SECONDS)) || 3),
    // e.g. "join happy-tiger", shown on the website so visitors can try the bot.
    sandboxCode: setting(env.TWILIO_SANDBOX_CODE).replace(/^(?!join\s)(?=\S)/i, "join "),
  },

  // This server's public address, for showing webhook URLs (Render sets RENDER_EXTERNAL_URL itself).
  publicBaseUrl: (setting(env.PUBLIC_URL) || setting(env.RENDER_EXTERNAL_URL)).replace(/\/+$/, ""),

  // Meta's WhatsApp Cloud API: real two-way WhatsApp (needs a public HTTPS URL for its webhook).
  meta: {
    accessToken: setting(env.META_ACCESS_TOKEN),
    phoneNumberId: setting(env.META_PHONE_NUMBER_ID),
    appSecret: setting(env.META_APP_SECRET),
    verifyToken: setting(env.META_VERIFY_TOKEN),
    displayNumber: setting(env.META_DISPLAY_NUMBER), // e.g. +1 555 123 4567, shown on the website
    graphVersion: setting(env.META_GRAPH_VERSION) || "v23.0",
  },

  // When reminders and the morning summary go out (local time).
  eveningReminder: { hour: 20, minute: 0 },
  morningDigest: { hour: 7, minute: 30, until: 11 },
};

export const twilioConfigured = Boolean(config.twilio.accountSid && config.twilio.authToken);
export const metaConfigured = Boolean(config.meta.accessToken && config.meta.phoneNumberId);

/**
 * How WhatsApp messages reach us: "poll" (ask Twilio every few seconds; no
 * public URL needed) or "webhook" (Twilio calls PUBLIC_URL). Defaults to
 * webhook only when a PUBLIC_URL is set.
 */
function pickWhatsAppMode() {
  const choice = setting(env.WHATSAPP_MODE).toLowerCase();
  // "off": keep this copy away from WhatsApp, e.g. on your laptop while the deployed copy answers.
  if (choice === "poll" || choice === "webhook" || choice === "off") return choice;
  return config.twilio.publicUrl ? "webhook" : "poll";
}
export const whatsappMode = twilioConfigured ? pickWhatsAppMode() : "off";

/** "Groq (openai/gpt-oss-120b, photos: qwen/qwen3.8-27b)" for logs and the UI. */
export function aiDescription() {
  if (config.ai.provider === "groq") return `Groq (${config.ai.groqModel}, photos: ${config.ai.groqVisionModel})`;
  if (config.ai.provider === "claude") return `Claude (${config.ai.claudeModel})`;
  return null;
}
