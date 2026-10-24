// A phone in the live demo: a WhatsApp-style chat with the real bot.
import { icon } from "./icons.js";
import { api, escapeHtml, formatWhatsApp, prepareFile, readAsDataUrl, timeLabel, toast } from "./util.js";

const LOGO = '<svg viewBox="0 0 100 100" aria-hidden="true"><path d="M30 62c4-16 16-24 34-24V26l18 18-18 18V50c-14 0-24 4-34 12z" fill="currentColor"/></svg>';
const STATUS_ICONS = `
  <svg width="17" height="11" viewBox="0 0 17 11" aria-hidden="true"><rect x="0" y="7" width="3" height="4" rx="1" fill="currentColor"/><rect x="4.5" y="5" width="3" height="6" rx="1" fill="currentColor"/><rect x="9" y="2.5" width="3" height="8.5" rx="1" fill="currentColor"/><rect x="13.5" y="0" width="3" height="11" rx="1" fill="currentColor"/></svg>
  <svg width="15" height="11" viewBox="0 0 15 11" aria-hidden="true"><path d="M7.5 2.2c2.1 0 4 .8 5.5 2.1l1-1.1A9.6 9.6 0 0 0 7.5.7 9.6 9.6 0 0 0 1 3.2l1 1.1a8 8 0 0 1 5.5-2.1Zm0 3c1.3 0 2.5.5 3.4 1.3l1-1.1a6.6 6.6 0 0 0-8.8 0l1 1.1c.9-.8 2.1-1.3 3.4-1.3Zm0 3a2 2 0 0 0-1.3.5l1.3 1.5 1.3-1.5a2 2 0 0 0-1.3-.5Z" fill="currentColor"/></svg>
  <svg width="25" height="12" viewBox="0 0 25 12" aria-hidden="true"><rect x=".5" y=".5" width="21" height="11" rx="3.5" fill="none" stroke="currentColor" opacity=".4"/><rect x="2" y="2" width="16" height="8" rx="2" fill="currentColor"/><path d="M23 4v4c.8-.3 1.3-1.1 1.3-2S23.8 4.3 23 4Z" fill="currentColor" opacity=".5"/></svg>`;
const MAX_RECORDING_S = 60;

// A stable pseudo-random waveform for a voice bubble.
function waveform(seed, bars = 28) {
  let x = seed || 7;
  return Array.from({ length: bars }, () => {
    x = (x * 9301 + 49297) % 233280;
    return `<i style="height:${25 + (x / 233280) * 75}%"></i>`;
  }).join("");
}

export class Phone {
  constructor(mount, { user, name, role }) {
    Object.assign(this, { user, name, role });
    this.attachment = null;
    this.idleWaiters = [];
    this.recorder = null;
    this.listeners = new Set();

    this.el = document.createElement("article");
    this.el.className = "device-wrap";
    this.el.dataset.user = user;
    this.el.innerHTML = `
      <header class="device-caption">
        <span class="person-avatar" aria-hidden="true">${escapeHtml(name[0])}</span>
        <div class="person"><strong>${escapeHtml(name)}</strong><span class="person-role">${escapeHtml(role)}</span></div>
        <div class="device-slot"></div>
      </header>
      <div class="device">
        <div class="device-screen">
          <div class="statusbar"><span class="sb-time">9:41</span><span class="island" aria-hidden="true"></span><span class="sb-icons">${STATUS_ICONS}</span></div>
          <div class="chat-head">
            <span class="ch-back" aria-hidden="true">${icon("chevronLeft", 22)}</span>
            <span class="ch-avatar" aria-hidden="true">${LOGO}</span>
            <div class="ch-meta"><strong>Forward-It</strong><span class="presence">online</span></div>
            <span class="ch-more" aria-hidden="true">${icon("more", 18)}</span>
          </div>
          <div class="chat-body" role="log" aria-live="polite" aria-label="Chat with Forward-It on ${escapeHtml(name)}'s phone"></div>
          <div class="attach-bar" hidden>
            <img alt="" />
            <span class="attach-name"></span>
            <button type="button" class="attach-remove" aria-label="Remove attachment">${icon("x", 16)}</button>
          </div>
          <form class="composer">
            <label class="c-icon" title="Attach a photo, PDF or audio file">
              <input type="file" accept="image/*,application/pdf,audio/*" hidden />${icon("plus", 21)}<span class="sr-only">Attach</span>
            </label>
            <div class="c-field">
              <textarea rows="1" placeholder="Message" aria-label="Message from ${escapeHtml(name)}"></textarea>
              <div class="c-recording" hidden><span class="rec-dot"></span><span class="rec-time">0:00</span><span class="rec-hint">Recording · tap ■ to send</span></div>
            </div>
            <button type="button" class="c-action" aria-label="Record a voice note">${icon("mic", 19)}</button>
          </form>
          <div class="device-overlay" hidden></div>
        </div>
      </div>`;
    mount.appendChild(this.el);

    const $ = (sel) => this.el.querySelector(sel);
    this.body = $(".chat-body");
    this.input = $("textarea");
    this.action = $(".c-action");
    this.fileInput = $('input[type="file"]');
    this.attachBar = $(".attach-bar");
    this.overlay = $(".device-overlay");
    this.presence = $(".presence");
    this.slot = $(".device-slot");
    this.clock = $(".sb-time");
    this.device = $(".device");
    this.bind();
    this.updateAction();
  }

  async init() {
    await api("profile", { method: "POST", body: { user: this.user, name: this.name } });
    await this.loadHistory();
    this.connect();
  }

  on(handler) {
    this.listeners.add(handler);
  }

  /* ---------- Events from the server ---------- */

  connect() {
    this.events?.close();
    this.events = new EventSource(`/api/sim/events?user=${encodeURIComponent(this.user)}`);
    this.events.onmessage = (e) => {
      const event = JSON.parse(e.data);
      if (event.type === "message") this.addMessage(event.message);
      if (event.type === "typing") this.setTyping(event.on);
      if (event.type === "reset") this.loadHistory();
      for (const handler of this.listeners) handler(event);
    };
  }

  async loadHistory() {
    const history = await api(`history?user=${encodeURIComponent(this.user)}`);
    this.body.innerHTML = "";
    this.typingEl = null;
    if (!history.length) {
      this.body.innerHTML = `<div class="chat-empty"><span class="ce-icon">${LOGO}</span><p>Forward a school notice, a bill or any message with something to do.</p><p class="ce-sub">Forward-It saves the task and reminds you before it's due.</p></div>`;
    } else {
      this.body.insertAdjacentHTML("beforeend", '<div class="day-chip">Today</div>');
      history.forEach((m) => this.addMessage(m, { animate: false }));
    }
  }

  addMessage(m, { animate = true } = {}) {
    const empty = this.body.querySelector(".chat-empty");
    if (empty) {
      empty.remove();
      this.body.insertAdjacentHTML("beforeend", '<div class="day-chip">Today</div>');
    }
    const mine = m.from === "user";
    const bubble = document.createElement("div");
    bubble.className = `msg ${mine ? "out" : "in"}${animate ? " pop" : ""}`;
    let html = "";
    if (m.forwarded) html += `<span class="msg-fwd">${icon("forward", 13)}Forwarded</span>`;
    if (m.attachment?.preview) html += `<img class="msg-img" src="${m.attachment.preview}" alt="${escapeHtml(m.attachment.name || "Photo")}" />`;
    else if (m.attachment) {
      html += `<div class="msg-file"><span class="file-badge">PDF</span><span class="file-name">${escapeHtml(m.attachment.name || "document.pdf")}</span></div>`;
    }
    if (m.voice) {
      const seconds = m.voice.seconds ?? 0;
      html += `<div class="msg-voice">
        <button type="button" class="voice-play" ${m.voice.src ? `data-src="${escapeHtml(m.voice.src)}"` : "disabled"} aria-label="Play voice note">${icon("play", 14)}</button>
        <span class="voice-wave">${waveform(Math.round(new Date(m.at).getTime() / 1000) % 9973)}</span>
        <span class="voice-len">0:${String(seconds).padStart(2, "0")}</span>
      </div>`;
    }
    if (m.text) html += `<div class="msg-text">${formatWhatsApp(m.text)}</div>`;
    html += `<span class="msg-meta">${timeLabel(new Date(m.at))}${mine ? `<span class="ticks">${icon("checks", 15)}</span>` : ""}</span>`;
    bubble.innerHTML = html;
    this.body.insertBefore(bubble, this.typingEl ?? null);
    this.scroll();
  }

  setTyping(on) {
    this.presence.textContent = on ? "typing…" : "online";
    if (on && !this.typingEl) {
      this.typingEl = document.createElement("div");
      this.typingEl.className = "typing";
      this.typingEl.innerHTML = "<i></i><i></i><i></i>";
      this.body.appendChild(this.typingEl);
      this.scroll();
    } else if (!on) {
      this.typingEl?.remove();
      this.typingEl = null;
      for (const waiter of this.idleWaiters.splice(0)) waiter();
    }
  }

  scroll() {
    this.body.scrollTo({ top: this.body.scrollHeight, behavior: "smooth" });
  }

  /** Resolves when the bot has finished replying to the next message. */
  nextIdle(timeoutMs = 75_000) {
    return new Promise((resolve) => {
      this.idleWaiters.push(resolve);
      setTimeout(resolve, timeoutMs);
    });
  }

  /* ---------- Sending ---------- */

  async send({ text = "", forwarded = false, file = null, voiceSeconds = null, voiceSrc = null }) {
    const idle = this.nextIdle();
    await api("message", { method: "POST", body: { user: this.user, text, forwarded, attachment: file, voiceSeconds, voiceSrc } });
    return idle;
  }

  bind() {
    this.el.querySelector(".composer").addEventListener("submit", (e) => {
      e.preventDefault();
      this.submit();
    });
    this.input.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        this.submit();
      }
    });
    this.input.addEventListener("input", () => {
      this.autoGrow();
      this.updateAction();
    });
    this.action.addEventListener("click", () => {
      if (this.recorder) this.recorder.stop();
      else if (this.input.value.trim() || this.attachment) this.submit();
      else this.startRecording();
    });
    this.fileInput.addEventListener("change", async () => {
      const file = this.fileInput.files[0];
      if (!file) return;
      try {
        this.showAttachment(await prepareFile(file, file.name));
      } catch (err) {
        toast(err.message);
        this.clearAttachment();
      }
    });
    this.el.querySelector(".attach-remove").addEventListener("click", () => this.clearAttachment());
    this.body.addEventListener("click", (e) => {
      const play = e.target.closest(".voice-play[data-src]");
      if (play) new Audio(play.dataset.src).play().catch(() => toast("Couldn't play that voice note."));
    });
  }

  async submit() {
    const text = this.input.value;
    const file = this.attachment;
    if (!text.trim() && !file) return;
    this.input.value = "";
    this.clearAttachment();
    this.autoGrow();
    this.updateAction();
    await this.send({ text, file });
  }

  autoGrow() {
    this.input.style.height = "auto";
    this.input.style.height = `${Math.min(this.input.scrollHeight, 110)}px`;
  }

  updateAction() {
    const mode = this.recorder ? "stop" : this.input.value.trim() || this.attachment ? "send" : "mic";
    this.action.dataset.mode = mode;
    this.action.innerHTML = icon(mode, mode === "send" ? 18 : 19);
    this.action.setAttribute("aria-label", { stop: "Stop and send voice note", send: "Send", mic: "Record a voice note" }[mode]);
  }

  showAttachment(file) {
    this.attachment = file;
    const img = this.attachBar.querySelector("img");
    img.src = file.preview || "";
    img.hidden = !file.preview;
    this.attachBar.querySelector(".attach-name").textContent = file.name;
    this.attachBar.hidden = false;
    this.input.placeholder = "Add a caption";
    this.updateAction();
  }

  clearAttachment() {
    this.attachment = null;
    this.attachBar.hidden = true;
    this.fileInput.value = "";
    this.input.placeholder = "Message";
    this.updateAction();
  }

  /* ---------- Voice notes (recorded in the browser, transcribed on the server) ---------- */

  async startRecording() {
    if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) return toast("Voice recording isn't supported in this browser.");
    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      return toast("Microphone access was blocked. Allow it in the browser to record a voice note.");
    }
    const chunks = [];
    const recorder = new MediaRecorder(stream);
    const started = Date.now();
    const field = this.el.querySelector(".c-field");
    const timeEl = this.el.querySelector(".rec-time");
    const tick = setInterval(() => {
      const s = Math.floor((Date.now() - started) / 1000);
      timeEl.textContent = `0:${String(s).padStart(2, "0")}`;
      if (s >= MAX_RECORDING_S) recorder.stop();
    }, 250);

    recorder.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    recorder.onstop = async () => {
      clearInterval(tick);
      stream.getTracks().forEach((track) => track.stop());
      this.recorder = null;
      field.classList.remove("is-recording");
      this.el.querySelector(".c-recording").hidden = true;
      this.updateAction();
      const seconds = Math.max(1, Math.round((Date.now() - started) / 1000));
      const blob = new Blob(chunks, { type: recorder.mimeType || "audio/webm" });
      if (blob.size < 1000) return toast("That recording was too short.");
      await this.send({ file: { name: "voice-note.webm", dataUrl: await readAsDataUrl(blob) }, voiceSeconds: seconds });
    };

    this.recorder = recorder;
    recorder.start();
    field.classList.add("is-recording");
    this.el.querySelector(".c-recording").hidden = false;
    this.updateAction();
  }

  /* ---------- Chrome around the phone ---------- */

  setClock(text) {
    this.clock.textContent = text;
  }

  setOverlay(html) {
    this.overlay.innerHTML = html ?? "";
    this.overlay.hidden = !html;
  }

  setSlot(html) {
    this.slot.innerHTML = html ?? "";
  }

  focus(on) {
    this.device.classList.toggle("spotlight", on);
  }
}
