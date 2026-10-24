// The guided demo: plays the whole story on the real bot, with captions.
// Every step uses the same endpoints a visitor's clicks would.
import { icon } from "./icons.js";
import { sleep, state, toast } from "./util.js";

class Aborted extends Error {}

export class Story {
  constructor(ctx) {
    this.ctx = ctx;
    this.el = document.getElementById("story");
    this.title = this.el.querySelector(".story-title");
    this.text = this.el.querySelector(".story-text");
    this.count = this.el.querySelector(".story-count");
    this.status = this.el.querySelector(".story-status");
    this.bar = this.el.querySelector(".story-progress span");
    this.controls = this.el.querySelector(".story-controls");
    this.controls.addEventListener("click", (e) => {
      const action = e.target.closest("[data-story]")?.dataset.story;
      if (action === "pause") this.togglePause();
      if (action === "skip") this.skipRequested = true;
      if (action === "exit") this.stop();
      if (action === "close") this.onFinal?.();
      if (action === "whatsapp") {
        this.onFinal?.();
        this.ctx.openWhatsApp();
      }
    });
  }

  steps() {
    const { priya, rahul, board, sendSample, linkFamily, nextReminder, morning } = this.ctx;
    const ai = Boolean(state.status?.ai);
    const voice = Boolean(state.status?.voice);
    return [
      {
        title: "Meet Priya.",
        text: "She's in nine school and society WhatsApp groups. The fee deadline is somewhere between forty good-morning forwards.",
        focus: ["priya"],
        run: () => this.wait(4500),
      },
      {
        title: "One forward.",
        text: "She forwards the school circular to Forward-It, exactly the way she'd forward it to anyone.",
        focus: ["priya"],
        run: async () => {
          await this.act(sendSample(priya, "circular"));
          await this.wait(2200);
        },
      },
      {
        title: "Three tasks. Zero typing.",
        text: "Every date, time and amount is pulled out, with a quote from the original so she can trust it, and a reminder set for the evening before.",
        focus: ["panel"],
        run: async () => {
          board.show("tasks");
          await this.wait(5500);
        },
      },
      {
        title: "Noise is ignored.",
        text: "A good-morning forward doesn't become a task.",
        focus: ["priya"],
        run: async () => {
          await this.act(sendSample(priya, "noise"));
          await this.wait(2200);
        },
      },
      {
        title: "It speaks Hinglish.",
        text: "A Hinglish message from the class group is understood, and answered in Hinglish.",
        focus: ["priya"],
        run: async () => {
          await this.act(sendSample(priya, "hinglish"));
          await this.wait(2600);
        },
      },
      ai && {
        title: "Even a photo of a notice.",
        text: "The printed circular on the fridge? A photo is enough. Every line, every date.",
        focus: ["priya"],
        run: async () => {
          await this.act(sendSample(priya, "photo"));
          await this.wait(2800);
        },
      },
      voice && {
        title: "Or just say it.",
        text: "Voice notes work too, for grandparents, or when your hands are full.",
        focus: ["priya"],
        run: async () => {
          await this.act(sendSample(priya, "voice"));
          await this.wait(2800);
        },
      },
      {
        title: "Share with family.",
        text: "Priya adds Rahul to her list. From now on every task, and every reminder, reaches both of them.",
        focus: ["rahul"],
        run: async () => {
          await this.act(linkFamily());
          await this.wait(3800);
        },
      },
      {
        title: "The evening before…",
        text: "Let's jump ahead to the first reminder. It arrives on both phones, while there's still time to act.",
        focus: ["priya", "rahul"],
        run: async () => {
          await this.act(nextReminder());
          await this.wait(4200);
        },
      },
      {
        title: "Handoff, solved.",
        text: "Rahul replies 👍. It's ticked off, and Priya is told straight away. No “did you do it?” calls.",
        focus: ["rahul", "priya"],
        run: async () => {
          await this.act(rahul.send({ text: "👍" }));
          await this.wait(3800);
        },
      },
      {
        title: "Every morning, just today.",
        text: "A calm summary of what's due today, and nothing else.",
        focus: ["priya"],
        run: async () => {
          await this.act(morning());
          await this.wait(4200);
        },
      },
      {
        title: "The difference, measured.",
        text: "Tasks captured, nothing missed, noise ignored, all counted live from what just happened.",
        focus: ["panel"],
        run: async () => {
          board.show("impact");
          await this.wait(6500);
        },
      },
      {
        title: "Your turn.",
        text: "Forward your own message, attach a photo, record a voice note, or try it on real WhatsApp.",
        focus: [],
        final: true,
      },
    ].filter(Boolean);
  }

  async start() {
    if (this.running) return;
    if (!(await this.ctx.confirmReset())) return;
    Object.assign(this, { running: true, aborted: false, paused: false, skipRequested: false });
    this.el.hidden = false;
    requestAnimationFrame(() => this.el.classList.add("show"));
    document.querySelector(".demo-grid").scrollIntoView({ behavior: "smooth", block: "start" });
    await this.ctx.reset();
    const steps = this.steps();
    try {
      for (const [i, step] of steps.entries()) {
        await this.whilePaused();
        this.render(step, i, steps.length);
        this.ctx.focus(step.focus);
        if (step.final) {
          await new Promise((resolve) => (this.onFinal = resolve));
          break;
        }
        await step.run();
      }
    } catch (err) {
      if (!(err instanceof Aborted)) {
        console.error(err);
        toast(`The guided demo stopped: ${err.message}`);
      }
    } finally {
      this.ctx.focus([]);
      this.el.classList.remove("show");
      setTimeout(() => (this.el.hidden = true), 250);
      Object.assign(this, { running: false, onFinal: null });
    }
  }

  stop() {
    this.aborted = true;
    this.onFinal?.();
  }

  togglePause() {
    this.paused = !this.paused;
    const button = this.controls.querySelector('[data-story="pause"]');
    if (button) {
      button.innerHTML = icon(this.paused ? "play" : "pause", 15);
      button.setAttribute("aria-label", this.paused ? "Resume" : "Pause");
    }
    this.status.textContent = this.paused ? "Paused" : "";
  }

  render(step, i, total) {
    this.count.textContent = `${i + 1} / ${total}`;
    this.title.textContent = step.title;
    this.text.textContent = step.text;
    this.bar.style.width = `${((i + 1) / total) * 100}%`;
    this.status.textContent = "";
    this.controls.innerHTML = step.final
      ? `<button class="btn btn-primary btn-sm" data-story="whatsapp">${icon("qr", 15)}Try on WhatsApp</button>
         <button class="btn btn-ghost btn-sm" data-story="close">Close</button>`
      : `<button class="icon-btn" data-story="pause" aria-label="Pause">${icon("pause", 15)}</button>
         <button class="icon-btn" data-story="skip" aria-label="Next step">${icon("skip", 15)}</button>
         <button class="icon-btn" data-story="exit" aria-label="Exit the guided demo">${icon("x", 15)}</button>`;
  }

  async whilePaused() {
    while (this.paused) {
      if (this.aborted) throw new Aborted();
      await sleep(120);
    }
    if (this.aborted) throw new Aborted();
  }

  /** Wait for a live action (the bot replying), showing that it's working. */
  async act(promise) {
    this.status.textContent = "Forward-It is replying…";
    await promise;
    if (this.status.textContent === "Forward-It is replying…") this.status.textContent = "";
    if (this.aborted) throw new Aborted();
  }

  /** Reading time for a caption; pausable and skippable. */
  async wait(ms) {
    let left = ms;
    while (left > 0) {
      if (this.aborted) throw new Aborted();
      if (this.skipRequested) {
        this.skipRequested = false;
        return;
      }
      await sleep(100);
      if (!this.paused) left -= 100;
    }
  }
}
