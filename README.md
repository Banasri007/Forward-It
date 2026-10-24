# Forward-It

**Forward it. Forget it. We'll remind you.**

Forward-It is a WhatsApp assistant for people who live in group chats but would never install a to-do app. Forward it any message, a photo of a printed notice, a PDF or a voice note. It finds what you need to do and by when, then sends a WhatsApp reminder at the right time, in English, Hindi or Hinglish, to you and your family.

> A school circular says *"Fee ₹2,400 by the 30th, PTM Saturday 10 AM, white shirt tomorrow"*.
> Priya forwards it. Forward-It replies with three saved tasks and three reminder times.
> At 8 PM the evening before, both Priya and Rahul get a reminder. Rahul replies 👍, it's ticked off, and Priya is told.

## The problem

**User:** a working parent in many school, society and office WhatsApp groups.
**Barrier:** important tasks (fee deadlines, things to bring, meetings) get buried under dozens of messages a day. Productivity apps don't help, because she won't move her life into a new app. WhatsApp is where her work already happens.
**Change:** she does one thing she already knows how to do (forward a message) and the tool does the rest: no typing, no new app, no setup.

## What it does

- **Reads anything you forward:** plain text, screenshots, photos of printed notices, PDFs and voice notes (photos and voice need an AI key; text PDFs work even without one).
- **Shares with family:** `SHARE +91…` puts someone on your list. Forwards reach both phones, reminders go to everyone, and whoever finishes a task, the others are told. This fixes the "did you pay it?" handoff.
- **Finds every task in a message** (one circular often holds 3-4) with its date, time, amount and a quote from the source, so you can trust it.
- **Picks a sensible reminder time:** the evening before by default (so there's time to buy the chart paper), or 2 hours before, the next morning, or "soon" when the task is close.
- **Sends a morning summary:** "Today: 2 things", plus anything you missed.
- **Speaks your language:** replies in English, Hindi (Devanagari) or Hinglish, following how you write. Understands *kal*, *parso*, *Friday tak*, *5 baje*.
- **Asks when it's unsure:** if there's no date, it asks "When is this due?" and you can answer "Friday", "kal 6 baje" or "skip".
- **Ignores the noise:** good-morning forwards and greetings don't become tasks, and forwarding the same thing twice doesn't duplicate it.

### Replies it understands

| You send | It does |
|---|---|
| any message, photo, PDF or voice note | finds the tasks and schedules reminders |
| `LIST` | everything, grouped into Missed / Today / Coming up / No date |
| `DONE`, `DONE 2`, `ho gaya`, `👍` | ticks off the last reminded task (or #2) |
| `LATER`, `LATER 2` | snoozes for an hour |
| `UNDO` | removes what the last message added |
| `DELETE 2` | removes #2 |
| `HINDI` / `HINGLISH` / `ENGLISH` | switches the reply language |
| `SHARE +91XXXXXXXXXX` | adds a family member to your list (a 10-digit number uses your country code) |
| `FAMILY` | who's on your list |
| `LEAVE` | stop sharing; your new tasks are yours alone |
| `NAME Priya` | the name your family sees in notifications |
| `HELP` | shows the welcome message |

## Run it in 1 minute (no accounts needed)

You need [Node.js](https://nodejs.org) 20.12 or newer.

```bash
npm install
```

```bash
npm start
```

Open **http://localhost:3000**. The website is a product page with a live demo built in:

- **Play the guided demo** runs the whole story by itself in about 90 seconds, with captions: one forward becomes three tasks, noise is ignored, Hinglish, a photo and a voice note are understood, Rahul joins the family list, the reminder reaches both phones, Rahul's 👍 tells Priya, and the morning summary and Impact numbers appear. You can pause, skip or exit at any time. It's handy for recording your demo video.
- **Two phones (Priya and Rahul)** talk to the real bot. Type anything, attach a photo or PDF, or tap the mic to record a real voice note. On a phone-sized screen, a switcher shows one phone at a time.
- **Forward a sample** chips: school circular, photo of a notice, voice note, society notice PDF, Hinglish group chat, electricity bill, doctor's appointment, good-morning forward.
- **Skip ahead in time:** *Next reminder* jumps the clock to the next reminder; *Tomorrow, 7:30 AM* shows the next morning's summary.
- **The family dashboard** has three tabs: **Tasks** (grouped, with done / add-to-calendar / delete), **This week** (a seven-day timeline) and **Impact** (on-time rate, tasks captured, missed, noise ignored and reminders sent, all counted live). The calendar button exports everything as an `.ics` file for Google, Apple or Outlook.
- **Try on WhatsApp** opens a QR code and the steps to message the real bot.
- Light and dark mode follow your system, with a toggle in the header.

Without an AI key, Forward-It runs on its built-in offline parser (English + Hindi/Hinglish dates). It handles typed text and text PDFs, but can't read photos or voice notes.

## Turn on AI with Groq (reads photos and messy messages)

1. Create a free API key at [console.groq.com/keys](https://console.groq.com/keys). It starts with `gsk_`.
2. In `.env`, replace `paste-your-groq-api-key-here` with your key:
   ```
   GROQ_API_KEY=gsk_...
   ```
3. Restart the server. The startup log and the header chip show **AI: Groq**.

Forward-It uses two Groq models, and you can change both in `.env`:

| Setting | Default | Used for |
|---|---|---|
| `GROQ_MODEL` | `openai/gpt-oss-120b` | typed messages and PDFs |
| `GROQ_VISION_MODEL` | `qwen/qwen3.8-27b` | photos and screenshots (must be a model that accepts images) |
| `GROQ_STT_MODEL` | `whisper-large-v3-turbo` | voice notes (speech to text) |

Each request asks Groq for strict JSON that matches a schema, so every answer has the same shape, and the app validates it again before using it. If a model rejects strict mode, it retries once in plain JSON mode. If Groq is down, rate-limited or the key is wrong, the bot falls back to the offline parser instead of going silent (the server log says why).

PDFs are turned into text on your machine first (Groq can't open PDF files), so only the text is sent. A scanned PDF has no text, and the bot asks for a photo instead.

## Connect real WhatsApp (Twilio Sandbox, free)

No tunnel, public URL or webhook needed: the server checks Twilio for new messages every 3 seconds ("polling"), so it works on any network, including college or hostel Wi-Fi.

1. Create a free [Twilio](https://www.twilio.com) account. In the Console, open **Messaging → Try it out → Send a WhatsApp message**.
2. From your phone, send the shown `join <code>` message (e.g. `join twilio-trial`) to the test number on that page. Newer accounts get **+1 737 250 8034**, older ones +1 415 523 8886. Twilio replies to confirm; Forward-It ignores this message.
3. In `.env`, replace the Twilio placeholders with your **Account SID** (starts with `AC`) and **Auth Token** from the Twilio Console's Account Info box:
   ```
   TWILIO_ACCOUNT_SID=AC...
   TWILIO_AUTH_TOKEN=...
   TWILIO_WHATSAPP_FROM=whatsapp:+17372508034
   TWILIO_SANDBOX_CODE=join twilio-trial
   ```
   Use the number and join phrase from **your** Try-out page.
4. Start (or restart) the server. The log should say `WhatsApp: on - checking Twilio for new messages every 3s`.
5. Forward any message, photo, PDF or voice note to the sandbox number on WhatsApp. The reply arrives in a few seconds.
6. Optional: put your sandbox's join phrase in `TWILIO_SANDBOX_CODE` (e.g. `join happy-tiger`). The website's **Try on WhatsApp** button then shows it with a QR code, so visitors and judges can try the bot from their own phones.

**Twilio's "Standard auto-reply":** on the newer Try-out page, Twilio answers every message with *"Standard auto-reply. You can send outbound messages…"* until you set your own webhook. To silence it without a public URL: in the Twilio Console search for **TwiML Bins**, create one containing just `<Response></Response>`, then paste that bin's URL as the incoming-message webhook on the Try-out page's **Receive a message** tab. Forward-It keeps answering through polling.

After a restart, Forward-It still answers messages sent in the last 10 minutes, and never answers the same message twice.

### Optional: webhook mode (instant replies, needs a public URL)

Twilio can also push each message to the server the moment it arrives. That needs the server to be reachable from the internet:

1. Expose port 3000 with a tunnel: [`cloudflared`](https://github.com/cloudflare/cloudflared) (`cloudflared tunnel --url http://localhost:3000`, no account) or [ngrok](https://ngrok.com) (free account, fixed address).
2. Put the tunnel's `https://…` address (or your Render URL) in `PUBLIC_URL` in `.env` (no slash at the end) and restart. Setting `PUBLIC_URL` switches to webhook mode; you can also force a mode with `WHATSAPP_MODE=poll`, `WHATSAPP_MODE=webhook` or `WHATSAPP_MODE=off`.
3. In the sandbox settings, set **When a message comes in** to `https://…/webhooks/twilio` (method `POST`).

## How it works

```
Incoming:  WhatsApp ─► Twilio ◄─ twilio-poll.js (asks every 3 s)   [webhook mode: Twilio ─► /webhooks/twilio]
           Simulator ─► /api/sim/message
                 │
                 ▼
           bot.js ─► extract/   (Groq or Claude, else offline parser)
                 ├─► dates.js   (when to remind)
                 └─► store.js   (data/db.json)

Outgoing:  scheduler.js (every 15 s) ─► due reminders + morning summary ─► outbox.js ─► Twilio / simulator
```

| File | What's in it |
|---|---|
| `src/bot.js` | Conversation logic: commands, saving tasks, "when is this due?" follow-ups |
| `src/extract/index.js` | Picks the AI provider, turns PDFs into text, falls back to the offline parser |
| `src/extract/prompt.js` | The instructions and JSON schema every AI provider uses, plus output validation |
| `src/extract/groq.js` | Groq: text and vision models, strict JSON, JSON-mode retry |
| `src/extract/claude.js` | Claude (optional): reads text, photos and PDFs |
| `src/extract/pdf.js` | Reads the text layer of PDFs locally |
| `src/extract/fallback.js` | Offline parser: sentence splitting, Indian (day-first) dates, Hindi/Hinglish words |
| `src/dates.js` | Reminder timing rules and date formatting |
| `src/scheduler.js` | Sends due reminders (to the whole family) and the morning summary |
| `src/store.js` | JSON database; tasks belong to a household so family members share one list |
| `src/calendar.js` | `.ics` calendar export with alarms at reminder times |
| `src/insights.js` | The Impact numbers, counted from real activity |
| `src/i18n.js` | Every bot message in English, Hinglish and Hindi |
| `src/channels/twilio-poll.js` | Polling mode: asks Twilio for new WhatsApp messages every few seconds |
| `src/channels/twilio.js` | Handles each WhatsApp message once, sends replies, optional signature-checked webhook |
| `src/channels/simulator.js` | Local simulator API, live updates over Server-Sent Events |
| `public/index.html`, `public/styles.css` | The website: hero, how it works, live demo, features (light and dark) |
| `public/js/phone.js` | A demo phone: WhatsApp-style chat, attachments, voice recording |
| `public/js/board.js` | The family dashboard: Tasks, This week, Impact |
| `public/js/story.js` | The guided demo, step by step |
| `test/` | Tests for dates, the offline parser, PDFs, the Groq integration and WhatsApp polling (against fake Groq and Twilio servers) and full conversations |

Run the tests:

```bash
npm test
```

## Limitations (honest list)

- **WhatsApp's 24-hour rule:** WhatsApp only lets a business send free-form messages within 24 hours of the user's last message. A reminder due later than that needs a pre-approved message template, which requires a production WhatsApp Business sender. In the sandbox, reminders work while the conversation window is open. The sandbox connection also expires after a while; re-send the join code if messages stop.
- **Voice notes** are transcribed by Groq's Whisper, so they need `GROQ_API_KEY` (even if you use Claude for reading). Without it, the bot asks you to type instead.
- **The offline parser** reads typed text and text PDFs but not photos, and its titles are the original sentence, not a rewritten summary.
- **Groq's photo model (`qwen/qwen3.8-27b`) is a preview model** on Groq and may change; set `GROQ_VISION_MODEL` to another image-capable model if it's retired. It sometimes answers "over capacity": the bot retries once, then tells the user to resend in a minute. At most 3 photos per message are read.
- **Groq's free tier allows about 8,000 tokens a minute** (roughly 4 forwards a minute). When it's hit, the bot waits the few seconds Groq asks for and retries, so replies just get slower. For a fast-paced demo, pause a few seconds between forwards.
- **Relative references across sentences** ("store water the night before", where the event's day is in another sentence) are sometimes dated wrongly by the model. Each task shows the quote it came from so the user can check. Weekday names and "by the 15th" are double-checked in code.
- **Family sharing on the sandbox:** every family member has to send the sandbox join code once before WhatsApp will deliver to them. A production WhatsApp number doesn't need this.
- **Reply language follows what you send.** If you forward a Hinglish message, replies switch to Hinglish; send `ENGLISH` to switch back.
- **The guided demo uses the live AI,** so on Groq's free tier a step may pause a few seconds for the rate limit.
- **Scanned PDFs** (pictures of pages) have no text, so with Groq or offline the bot asks for a photo instead.
- **Forwarded dates are read relative to today.** If you forward a week-old message that says "tomorrow", it means tomorrow from now.
- **AI can misread a date.** Every saved task shows the quote it came from, and dates the bot worked out (not written) are marked, so you can check. Replies are never sent anywhere except back to you.
- **Single time zone** per server (`TIMEZONE`, default `Asia/Kolkata`).
- **Storage** is a JSON file, fine for a prototype, not for thousands of users.

## Privacy

- Only the extracted tasks and a short source quote are stored, in `data/db.json` on your own machine. Photos and PDFs from WhatsApp are not saved (the simulator keeps a small thumbnail for its chat history; **Reset demo** clears it).
- Message content (and photos) are sent to the AI provider (Groq, or Claude if you chose it) only when its key is configured. PDFs are converted to text on your machine first. Without a key, everything stays on your computer.
- In polling mode the server only makes outgoing requests to Twilio, so nothing on your computer is exposed to the internet. In webhook mode, it rejects requests that aren't signed by your Twilio account.

## Credits, pre-existing work and AI assistance

- Built for the TaskForge hackathon.
- Libraries: [Express](https://expressjs.com), [chrono-node](https://github.com/wanasit/chrono) (date parsing), [Luxon](https://moment.github.io/luxon/) (time zones), [unpdf](https://github.com/unjs/unpdf) (PDF text), [node-qrcode](https://github.com/soldair/node-qrcode) (QR code), (https://github.com/anthropics/anthropic-sdk-typescript). Fonts: Instrument Serif and Inter (Google Fonts).
- The sample voice note was generated with Windows' built-in text-to-speech voice.
- AI services: [Groq](https://groq.com) (`openai/gpt-oss-120b`, `qwen/qwen3.8-27b`) reads forwarded messages at runtime; Claude is an optional alternative.
- The school circular, bill, appointment, society notice PDF and notice photo in the simulator are made-up samples. They are not real institutions or people.
