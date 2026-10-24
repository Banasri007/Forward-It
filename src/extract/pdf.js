// Pulls the text layer out of a PDF on this machine, so PDFs work with Groq
// and in offline mode. Scanned PDFs (pictures of pages) have no text layer.
import { extractText, getDocumentProxy } from "unpdf";

const MAX_CHARS = 20_000; // a circular is a page or two; don't send a whole book to the model

export async function pdfToText(base64) {
  const pdf = await getDocumentProxy(new Uint8Array(Buffer.from(base64, "base64")));
  const { text } = await extractText(pdf, { mergePages: true });
  return text.replace(/[ \t]+\n/g, "\n").trim().slice(0, MAX_CHARS);
}
