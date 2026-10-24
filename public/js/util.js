// Small shared helpers for the website.

export const state = { timezone: "Asia/Kolkata", status: null };

export async function api(path, { method = "GET", body } = {}) {
  const res = await fetch(`/api/sim/${path}`, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok && res.status !== 202) throw new Error(`${method} ${path} failed (${res.status})`);
  return res.headers.get("content-type")?.includes("json") ? res.json() : res.text();
}

export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export function escapeHtml(text) {
  return String(text).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}

/** WhatsApp formatting: *bold*, _italic_, ~strike~, line breaks. */
export function formatWhatsApp(text) {
  return escapeHtml(text)
    .replace(/\*([^*\n]+)\*/g, "<strong>$1</strong>")
    .replace(/(^|[\s(“"])_([^_\n]+)_(?=$|[\s).,!?:”"])/g, "$1<em>$2</em>")
    .replace(/~([^~\n]+)~/g, "<s>$1</s>")
    .replace(/\n/g, "<br>");
}

const fmt = (date, options) => date.toLocaleString("en-IN", { timeZone: state.timezone, ...options });
const dayKey = (date) => fmt(date, { year: "numeric", month: "2-digit", day: "2-digit" });

/** "today" / "tomorrow" / "Fri, 30 Oct" in the server's time zone. */
export function dayLabel(date) {
  const today = new Date();
  const tomorrow = new Date(Date.now() + 86_400_000);
  if (dayKey(date) === dayKey(today)) return "Today";
  if (dayKey(date) === dayKey(tomorrow)) return "Tomorrow";
  return fmt(date, { weekday: "short", day: "numeric", month: "short" });
}

export const timeLabel = (date) => fmt(date, { hour: "numeric", minute: "2-digit" }).replace(" am", " AM").replace(" pm", " PM");

export const whenLabel = (iso) => {
  const date = new Date(iso);
  return `${dayLabel(date)}, ${timeLabel(date)}`;
};

// Due dates are stored as local "YYYY-MM-DD" (+ "HH:MM"), so they're labelled as written.
export const todayKey = (offsetDays = 0) =>
  new Date(Date.now() + offsetDays * 86_400_000).toLocaleDateString("en-CA", { timeZone: state.timezone });

/** The server's current time as "HH:MM", comparable with task.dueTime. */
export const nowClock = () => new Date().toLocaleTimeString("en-GB", { timeZone: state.timezone, hour: "2-digit", minute: "2-digit", hour12: false });

export function dateLabel(isoDate, { relative = true } = {}) {
  if (relative && isoDate === todayKey()) return "Today";
  if (relative && isoDate === todayKey(1)) return "Tomorrow";
  return new Date(`${isoDate}T12:00:00Z`).toLocaleDateString("en-IN", { timeZone: "UTC", weekday: "short", day: "numeric", month: "short" });
}

export const clockLabel = (hhmm) => {
  const [h, m] = hhmm.split(":").map(Number);
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
};

export function dueLabel(task) {
  if (!task.dueDate) return null;
  const day = dateLabel(task.dueDate);
  return task.dueTime ? `${day}, ${clockLabel(task.dueTime)}` : day;
}

let toastTimer;
export function toast(text) {
  const el = document.getElementById("toast");
  el.textContent = text;
  el.hidden = false;
  el.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    el.classList.remove("show");
    setTimeout(() => (el.hidden = true), 250);
  }, 3200);
}

export function readAsDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

// Shrink photos like WhatsApp does: faster upload, same readability.
async function shrinkImage(blob, maxSide) {
  const bitmap = await createImageBitmap(blob);
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d").drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", 0.85);
}

/** Turn a picked file into the attachment shape the server expects. */
export async function prepareFile(blob, name) {
  if (blob.type === "application/pdf") {
    if (blob.size > 10 * 1024 * 1024) throw new Error("PDF is larger than 10 MB");
    return { name, dataUrl: await readAsDataUrl(blob), preview: null };
  }
  if (blob.type.startsWith("audio/")) return { name, dataUrl: await readAsDataUrl(blob), preview: null };
  if (!blob.type.startsWith("image/")) throw new Error("Only photos, PDFs and voice notes are supported");
  return { name, dataUrl: await shrinkImage(blob, 1600), preview: await shrinkImage(blob, 480) };
}
