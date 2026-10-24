import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { DateTime } from "luxon";

process.env.FORWARDIT_AI = "off";
process.env.DATA_FILE = ":memory:";

const { pdfToText } = await import("../src/extract/pdf.js");
const { extract } = await import("../src/extract/index.js");

const now = DateTime.fromISO("2026-10-24T15:00", { zone: "Asia/Kolkata" }); // a Saturday
const samplePdf = fs.readFileSync(new URL("../public/samples/society-notice.pdf", import.meta.url)).toString("base64");

test("reads the text layer of a PDF", async () => {
  const text = await pdfToText(samplePdf);
  assert.match(text, /GREEN MEADOWS HOUSING SOCIETY/);
  assert.match(text, /Quarterly maintenance of Rs\. 3,500 is due by the 15th/);
});

test("a forwarded PDF becomes tasks even without an AI key", async () => {
  const result = await extract({ text: "", media: [{ contentType: "application/pdf", data: samplePdf }], now });
  assert.equal(result.engine, "offline");
  assert.equal(result.unread, 0);
  assert.deepEqual(result.tasks.map((t) => [t.dueDate, t.dueTime, t.amount, t.kind]), [
    ["2026-11-15", null, "₹3,500", "payment"],
    ["2026-10-25", "10:00", null, "todo"],
    ["2026-10-31", "18:00", null, "event"],
  ]);
});

test("a PDF with no text (a scan) is reported, not guessed", async () => {
  const notAPdf = Buffer.from("%PDF-1.4\nnot really a pdf").toString("base64");
  const result = await extract({ text: "", media: [{ contentType: "application/pdf", data: notAPdf }], now });
  assert.equal(result.scannedPdf, true);
});
