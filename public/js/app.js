import { icon } from "./icons.js";
import { Phone } from "./phone.js";
import { Board } from "./board.js";
import { Story } from "./story.js";
import { SAMPLES, sampleById } from "./samples.js";
import { api, prepareFile, state, timeLabel, toast, whenLabel } from "./util.js";

const $ = (sel) => document.querySelector(sel);

// Each browser gets its own demo, so visitors (and judges) never see or reset each other's chats.
function demoSession() {
  let id = null;
  try {
    id = localStorage.getItem("forward-it-session");
  } catch {
    // Private mode: a fresh demo per page load.
  }
  if (!/^[a-z0-9]{8}$/.test(id ?? "")) {
    id = Array.from(crypto.getRandomValues(new Uint8Array(8)), (b) => "abcdefghijklmnopqrstuvwxyz0123456789"[b % 36]).join("");
    try {
      localStorage.setItem("forward-it-session", id);
    } catch {
      // Not remembered; that's fine.
    }
  }
  return id;
}
const SESSION = demoSession();
const PRIYA = `demo-${SESSION}`;
const RAHUL = `demo-${SESSION}-p`;

/* ---------- Theme ---------- */

function setTheme(theme) {
  document.documentElement.dataset.theme = theme;
  $("#theme-toggle").innerHTML = icon(theme === "dark" ? "sun" : "moon", 17);
  try {
    localStorage.setItem("forward-it-theme", theme);
  } catch {
    // Private mode: the choice just isn't remembered.
  }
}
const currentTheme = () =>
  document.documentElement.dataset.theme ?? (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
$("#theme-toggle").innerHTML = icon(currentTheme() === "dark" ? "sun" : "moon", 17);
$("#theme-toggle").addEventListener("click", () => setTheme(currentTheme() === "dark" ? "light" : "dark"));

/* ---------- Status & "Try on WhatsApp" ---------- */

function renderStatus(status) {
  const ai = status.ai ? `AI · ${status.ai === "groq" ? "Groq" : "Claude"}` : "Offline parser";
  const wa = { poll: "WhatsApp · live", webhook: "WhatsApp · live", "no-url": "WhatsApp · needs URL", off: "WhatsApp · off" }[status.whatsapp];
  $("#status").innerHTML = `
    <span class="pill ${status.ai ? "on" : ""}" title="${status.aiDetail ?? "No AI key: typed text and PDFs only"}"><i></i>${ai}</span>
    <span class="pill ${["poll", "webhook"].includes(status.whatsapp) ? "on" : ""}"><i></i>${wa}</span>`;
}

function renderWhatsAppDialog(status) {
  const live = ["poll", "webhook"].includes(status.whatsapp);
  const { number, joinCode, link } = status.sandbox;
  $("#wa-body").innerHTML = live
    ? `<div class="wa-grid">
        <div class="wa-qr"><img src="/api/sim/whatsapp-qr.svg" alt="QR code that opens WhatsApp to message Forward-It" width="168" height="168" /><span>Scan with your phone camera</span></div>
        <ol class="wa-steps">
          <li><strong>Open WhatsApp</strong> by scanning the code, or message <a href="${link}" target="_blank" rel="noopener">${number}</a>.</li>
          <li><strong>Send ${joinCode ? `<code>${joinCode}</code>` : "your sandbox's join code"}</strong> to connect to the test number${joinCode ? "" : " (it's on your Twilio sandbox page)"}.</li>
          <li><strong>Forward anything:</strong> a notice, a bill, a photo, a PDF or a voice note. Replies arrive in a few seconds.</li>
        </ol>
      </div>
      <p class="wa-note">${icon("shield", 15)} This is a hackathon prototype on Twilio's WhatsApp test number. Only send things you're happy to share.</p>`
    : `<p>WhatsApp isn't connected on this server yet. Add your Twilio keys to <code>.env</code> and restart. The README walks through it in five steps.</p>
       <p class="wa-note">Meanwhile, everything in the live demo runs on the same bot.</p>`;
}

const dialog = $("#wa-dialog");
const openWhatsApp = () => dialog.showModal();
for (const button of document.querySelectorAll("[data-open-whatsapp]")) button.addEventListener("click", openWhatsApp);
dialog.addEventListener("click", (e) => {
  if (e.target === dialog || e.target.closest("[data-close]")) dialog.close();
});

/* ---------- Boot ---------- */

const status = await api("status");
state.status = status;
state.timezone = status.timezone;
renderStatus(status);
renderWhatsAppDialog(status);

const phonesMount = $("#phones");
const priya = new Phone(phonesMount, { user: PRIYA, name: "Priya", role: "Mum · in 9 WhatsApp groups" });
const rahul = new Phone(phonesMount, { user: RAHUL, name: "Rahul", role: "Dad · on Priya's family list" });
await Promise.all([priya.init(), rahul.init()]);
const board = new Board($("#panel"), { user: PRIYA });

/* ---------- Family link (Rahul's phone) ---------- */

// The server replies once both phones have their messages.
async function linkFamily() {
  await api("family/link", { method: "POST", body: { user: PRIYA, partner: RAHUL } });
  await refresh();
}

async function updateFamily() {
  const members = await api(`family?user=${PRIYA}`);
  const linked = members.some((m) => m.id === `sim:${RAHUL}`);
  rahul.setOverlay(
    linked
      ? null
      : `<div class="overlay-card">
          <span class="overlay-icon">${icon("users", 22)}</span>
          <h4>Rahul isn't on Priya's family list yet</h4>
          <p>Add him and every task and reminder reaches both phones. When one of them finishes, the other is told.</p>
          <button class="btn btn-primary btn-sm" id="link-family">${icon("userPlus", 15)}Add Rahul to the family</button>
        </div>`,
  );
  rahul.setSlot(linked ? `<button class="link-btn" id="unlink-family">Remove</button>` : "");
  $("#link-family")?.addEventListener("click", linkFamily);
  $("#unlink-family")?.addEventListener("click", async () => {
    await api("family/unlink", { method: "POST", body: { user: RAHUL } });
    await refresh();
  });
}

/* ---------- Samples & time travel ---------- */

async function sendSample(phone, id) {
  const sample = sampleById(id);
  if (!sample.file) return phone.send({ text: sample.text(), forwarded: true });
  const blob = await fetch(sample.file).then((r) => r.blob());
  const file = await prepareFile(blob, sample.file.split("/").pop());
  return phone.send({ file, forwarded: sample.id !== "voice", voiceSeconds: sample.seconds, voiceSrc: sample.id === "voice" ? sample.file : null });
}

$("#samples").innerHTML = SAMPLES.map((s) => {
  const unavailable = (s.needs === "ai" && !status.ai) || (s.needs === "voice" && !status.voice);
  return `<button class="chip-btn" data-sample="${s.id}" ${unavailable ? 'data-unavailable title="Needs an AI key on the server"' : ""}>${icon(s.icon, 15)}${s.label}</button>`;
}).join("");
$("#samples").addEventListener("click", (e) => {
  const button = e.target.closest("[data-sample]");
  if (!button) return;
  if (button.hasAttribute("data-unavailable")) toast("This sample needs an AI key on the server (GROQ_API_KEY).");
  sendSample(priya, button.dataset.sample);
  showPhone("priya");
});

async function nextReminder() {
  const result = await api("next-reminder", { method: "POST", body: { user: PRIYA } });
  if (!result.sent) toast("No reminders waiting. Forward a sample first.");
  else toast(`Jumped to ${whenLabel(result.at)}`);
  await refresh();
  return result;
}

async function morning() {
  const result = await api("morning", { method: "POST", body: { user: PRIYA } });
  toast(result.sent ? "Jumped to tomorrow, 7:30 AM" : "Nothing is due tomorrow, so there's no morning summary.");
  return result;
}

$("#btn-next").addEventListener("click", nextReminder);
$("#btn-morning").addEventListener("click", morning);

function updateNextHint(tasks) {
  const next = tasks
    .filter((t) => t.status === "active" && t.remindAt && !t.remindedAt)
    .sort((a, b) => a.remindAt.localeCompare(b.remindAt))[0];
  $("#next-hint").innerHTML = next
    ? `${icon("bell", 13)} Next: <strong>${whenLabel(next.remindAt)}</strong> · ${next.title}`
    : "Reminders you schedule will show up here.";
}

/* ---------- Reset ---------- */

const hasContent = () => document.querySelectorAll("#phones .msg").length > 0;

async function reset() {
  await api("reset", { method: "POST", body: { users: [PRIYA, RAHUL] } });
  await Promise.all([priya.init(), rahul.init()]);
  board.show("tasks");
  await refresh();
}

async function confirmReset() {
  return !hasContent() || confirm("The guided demo starts from a clean slate. Clear the current demo chats?");
}

$("#reset-demo").addEventListener("click", async () => {
  if (hasContent() && !confirm("Clear both demo chats and all their tasks?")) return;
  await reset();
});

/* ---------- Live updates ---------- */

let refreshTimer;
async function refresh() {
  const tasks = await board.refresh();
  updateNextHint(tasks);
  await updateFamily();
}
function scheduleRefresh() {
  clearTimeout(refreshTimer);
  refreshTimer = setTimeout(refresh, 150);
}
for (const phone of [priya, rahul]) phone.on((event) => ["tasks", "reset"].includes(event.type) && scheduleRefresh());
await refresh();

/* ---------- Phones on small screens: one at a time ---------- */

function showPhone(who) {
  for (const [name, phone] of [["priya", priya], ["rahul", rahul]]) phone.el.classList.toggle("is-hidden", name !== who);
  document.querySelectorAll("[data-phone]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.phone === who)));
}
document.querySelectorAll("[data-phone]").forEach((b) => b.addEventListener("click", () => showPhone(b.dataset.phone)));
showPhone("priya");

/* ---------- Clock on the phones ---------- */

function tickClock() {
  const text = timeLabel(new Date()).replace(/\s?[AP]M$/, "");
  priya.setClock(text);
  rahul.setClock(text);
}
tickClock();
setInterval(tickClock, 20_000);

/* ---------- Guided demo ---------- */

const story = new Story({
  priya,
  rahul,
  board,
  sendSample,
  linkFamily,
  nextReminder,
  morning,
  reset,
  confirmReset,
  openWhatsApp,
  focus(targets) {
    priya.focus(targets.includes("priya"));
    rahul.focus(targets.includes("rahul"));
    $("#panel").classList.toggle("spotlight", targets.includes("panel"));
    // On a phone-sized screen, show whichever phone the caption is about.
    if (targets.includes("rahul") && !targets.includes("priya")) showPhone("rahul");
    else if (targets.includes("priya")) showPhone("priya");
  },
});
for (const button of document.querySelectorAll("[data-play-demo]")) button.addEventListener("click", () => story.start());
