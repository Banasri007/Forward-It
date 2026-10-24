import { config } from "../config.js";
import { extractWithClaude } from "./claude.js";
import { extractWithGroq, transcribeWithGroq } from "./groq.js";
import { DateTime } from "luxon";
import { dayOfMonth, extractFallback, normalizeDateWords, parseDate } from "./fallback.js";
import { pdfToText } from "./pdf.js";

const PROVIDERS = { claude: extractWithClaude, groq: extractWithGroq };
const isPdf = (m) => m.contentType === "application/pdf";
const isAudio = (m) => m.contentType.startsWith("audio/");
const MONTH_NAME = /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\b|\d{1,2}[/.-]\d{1,2}/i;
const WEEKDAYS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];
const WEEKDAY_NAME = /\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i;

/** Deterministic fixes for the mistakes models make most often. */
function checkAiResult(result, text, now) {
  // "hi" means Devanagari; Hindi typed in Latin letters is Hinglish.
  if (result.language === "hi" && !/[ऀ-ॿ]/.test(text)) result.language = "hinglish";

  const today = now.toISODate();
  for (const task of result.tasks) {
    if (!task.dueDate || !task.sourceQuote) continue;
    const quote = normalizeDateWords(task.sourceQuote);

    // "due by the 15th" on the 24th means next month's 15th, not a date that has already passed.
    if (task.dueDate < today && !MONTH_NAME.test(quote)) {
      const next = dayOfMonth(quote, now);
      if (next) {
        task.dueDate = next.dueDate;
        task.dateConfidence = "inferred";
      }
    }

    // "Friday tak" must land on a Friday: trust the calendar over the model's arithmetic.
    const named = quote.match(WEEKDAY_NAME)?.[1].toLowerCase();
    if (named && !MONTH_NAME.test(quote) && DateTime.fromISO(task.dueDate).weekday !== WEEKDAYS.indexOf(named) + 1) {
      const parsed = parseDate(quote, now);
      if (parsed && DateTime.fromISO(parsed.dueDate).weekday === WEEKDAYS.indexOf(named) + 1) {
        task.dueDate = parsed.dueDate;
        task.dateConfidence = "inferred";
      }
    }
  }
  return result;
}

/** Voice notes -> text with Groq's Whisper (needs GROQ_API_KEY, whichever provider reads the text). */
async function transcribeAll(clips) {
  const transcripts = [];
  let failed = false;
  for (const clip of clips) {
    if (!config.ai.voice) break;
    try {
      const said = await transcribeWithGroq(clip);
      if (said) transcripts.push(said);
    } catch (err) {
      failed = true;
      console.error(`[extract] Voice note transcription failed: ${err.message}`);
    }
  }
  return { transcripts, failed };
}

/**
 * Turn one incoming message into task drafts.
 * Uses the configured AI provider and falls back to the offline parser, so the
 * bot always answers. `unread` counts attachments nothing could read;
 * `transcripts` holds what was heard in voice notes.
 * Returns { needsAi }, { voiceNeedsAi }, { scannedPdf } or { aiFailed } when
 * there is nothing readable at all.
 */
export async function extract({ text = "", media = [], now, preferredLang }) {
  const provider = config.ai.provider;

  const clips = media.filter(isAudio);
  const { transcripts, failed: voiceFailed } = await transcribeAll(clips);
  const voiceText = transcripts.map((said) => `\n\n[Voice note]\n${said}`).join("");
  const untranscribed = clips.length - transcripts.length;

  // Claude reads PDFs itself; for Groq and offline mode, use the PDF's text layer.
  let files = media.filter((m) => !isAudio(m));
  let pdfText = "";
  let scannedPdfs = 0;
  if (provider !== "claude") {
    files = files.filter((m) => !isPdf(m));
    for (const pdf of media.filter(isPdf)) {
      const extracted = await pdfToText(pdf.data).catch((err) => {
        console.warn(`[extract] Couldn't read PDF: ${err.message}`);
        return "";
      });
      if (extracted) pdfText += `\n\n[Forwarded PDF]\n${extracted}`;
      else scannedPdfs += 1;
    }
  }

  const fullText = `${text}${voiceText}${pdfText}`.trim();
  const ownWords = `${text} ${transcripts.join(" ")}`; // for language detection
  const extra = { transcripts };
  if (!fullText && !files.length) {
    if (untranscribed) return voiceFailed ? { aiFailed: true } : { voiceNeedsAi: true };
    return scannedPdfs ? { scannedPdf: true } : { needsAi: true };
  }

  let aiFailed = false;
  if (provider) {
    try {
      const result = checkAiResult(await PROVIDERS[provider]({ text: fullText, media: files, now, preferredLang }), ownWords, now);
      return { ...result, ...extra, engine: "ai", unread: files.length - result.readCount + scannedPdfs + untranscribed };
    } catch (err) {
      aiFailed = true;
      console.error(`[extract] ${provider} extraction failed, using offline parser: ${err.message}`);
    }
  }

  // A photo with no text can only be read by the AI; say so honestly if it was unavailable.
  if (!fullText) return aiFailed ? { aiFailed: true } : scannedPdfs ? { scannedPdf: true } : { needsAi: true };
  return { ...extractFallback(fullText, now), ...extra, engine: "offline", unread: files.length + scannedPdfs + untranscribed };
}
