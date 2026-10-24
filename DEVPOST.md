# Devpost submission: Forward-It

Copy each part into Devpost. Anything in [square brackets] is for you to fill in or delete.

---

## About the project (paste into "About the project")

## Inspiration

In India, WhatsApp is where real life gets organised: school circulars, society notices, electricity bills and appointment SMSes all arrive there, buried between dozens of good-morning forwards. The people juggling all of it, often working parents, are exactly the people productivity apps leave behind. They won't install another app, type their tasks into it, or build a new habit around it.

[Optional: one or two sentences about a real person who inspired this, shared with their permission.]

TaskForge's theme, *work should fit people, not force people to fit the tool*, pointed to a simple idea: don't ask people to move their lives into a to-do app. Meet them where their work already is, and make the only action one they already know: **forward**.

## What it does

Forward-It is a WhatsApp assistant. You forward it anything (a school circular, a bill SMS, a photo of a printed notice, a PDF or a voice note) and it:

- **finds every task inside:** what to pay, bring, submit, wear or attend, with dates, times and amounts, and it quotes the words each task came from so you can trust it;
- **ignores the noise:** good-morning forwards don't become tasks, and forwarding the same notice twice doesn't duplicate it;
- **reminds you at a useful time:** usually 8 PM the evening before, while there's still time to act, plus a short summary every morning;
- **speaks your language:** English, हिंदी and Hinglish, including phrases like *kal*, *parso* and *Friday tak*;
- **shares with family:** one forward reaches both parents, reminders go to everyone, and when one person replies 👍 the other is told. No more "did you pay the fee?" calls.

The website includes a live two-phone demo running the real bot, a family dashboard (Tasks, a 7-day timeline, and Impact numbers counted live), calendar export, and a guided demo that plays the whole story with captions.

## How we built it

- **Bot core (Node.js + Express):** one conversation engine shared by WhatsApp and the web demo. It handles commands (`LIST`, `DONE`, `LATER`, `UNDO`, `SHARE`, `FAMILY`), family "households" that merge two lists into one numbered list, and a scheduler for reminders and morning summaries.
- **AI (Groq):** `openai/gpt-oss-120b` reads text and PDFs, `qwen/qwen3.8-27b` reads photos of notices, and Whisper (`whisper-large-v3-turbo`) transcribes voice notes. Every answer is forced into a strict JSON schema and validated again in code.
- **A deterministic safety net:** language models are good at reading messy messages but unreliable at calendar arithmetic. The prompt includes the next 14 days, and code double-checks weekday names ("Friday tak" must land on a Friday) and day-of-month dates ("by the 15th" on the 24th means next month).
- **Offline fallback:** a rule-based parser (chrono-node plus our own Hindi/Hinglish date words) keeps the bot answering without an AI key or when the AI is down. PDFs are turned into text locally with unpdf.
- **Reminder timing:** 8 PM the evening before if that's still ahead; otherwise 2 hours before (tasks with a time) or 7:30 AM that morning; otherwise within the hour.
- **Measuring the difference:** the Impact view counts what actually happened, for example

$$\text{on-time rate} = \frac{\text{tasks finished before their deadline}}{\text{tasks finished}}$$

- **WhatsApp:** Meta's WhatsApp Cloud API for real two-way messaging (signed webhooks, media download, 👍 reactions as "done"), plus a Twilio channel with a polling mode that works without a public URL.
- **Website:** plain HTML, CSS and JavaScript modules with light and dark themes, live chat over Server-Sent Events, `.ics` calendar export and a private demo per visitor, deployable to Render with one `render.yaml`.
- **Testing:** 59 automated tests, including fake Groq and Twilio servers.
- **AI assistance:** the code was written with help from Claude Code (Anthropic); this is also disclosed in the repository.

## Challenges we ran into

- **Indian dates and Hinglish:** day-first dates (27-10-2026), "by the 15th", *kal* (which can mean tomorrow or yesterday), *shaam 5 baje*.
- **Models and calendars:** the model sometimes placed "Friday" on a Thursday or chose a date that had already passed. A calendar in the prompt plus checks in code fixed both.
- **Free-tier limits:** Groq's rate limits and an occasionally over-capacity vision model. The bot waits and retries once, then tells the user honestly instead of guessing.
- **WhatsApp access:** Twilio's trial WhatsApp number turned out to send only Twilio's own template messages, so the bot could read messages but not reply. We added Meta's WhatsApp Cloud API as a second channel, which allows real replies within WhatsApp's 24-hour customer-service window, and kept one bot core behind both.
- **Sharing without confusion:** merging two people's lists into one numbered list, and making a plain "DONE" mean the right task for whoever replies.

## Accomplishments that we're proud of

- One action, forward, is the whole interface: no app, no sign-up, no typing.
- It reads text, photos, PDFs and voice notes, in three languages.
- Family sharing turns a forwarded notice into a shared task with a clean handoff.
- It's honest by design: every task shows its source quote, worked-out dates are marked, and it never invents tasks.
- A guided demo anyone can watch on the website, with 59 tests behind it.

## What we learned

- Designing for people who won't change their habits means removing steps, not adding features.
- Language models read messy, multilingual messages remarkably well, but the best results came from pairing them with small deterministic checks.
- Trust matters more than cleverness: showing the original words next to each task makes AI output believable.
- Platform rules (WhatsApp templates, 24-hour windows, trial limits) shape a product as much as the code does.

## What's next for Forward-It

- Move from Meta's test number to a registered WhatsApp business number, so anyone can use it, not just numbers on the test list.
- Approved WhatsApp templates, so reminders can arrive any time, not only within 24 hours of the last message.
- Recurring tasks ("every month on the 5th") and assigning a task to one family member.
- A weekly "how did we do" summary on WhatsApp, built from the Impact numbers.
- Testing with real families and measuring missed deadlines before and after.

---

## Built with (paste as tags, max 25)

javascript, node.js, express.js, html5, css3, groq, gpt-oss, qwen, whisper, llm, whatsapp, whatsapp-cloud-api, meta, twilio, webhooks, server-sent-events, chrono-node, luxon, unpdf, qrcode, json-schema, icalendar, render, github, claude-code

---

## Demo video: recording plan

**Length:** about 2:30. Record the screen first, then add your voice afterwards in Clipchamp (built into Windows 11). That's easier than talking live, and you can cut the pauses while the AI replies.

### Before you record

1. Restart the server: `Ctrl+C`, then `npm start`.
2. Wait 1-2 minutes after any earlier testing, so Groq's per-minute limit has reset.
3. Open Chrome in a **new Incognito window** (`Ctrl+Shift+N`) at `http://localhost:3000`, or your Render URL. Incognito gives a clean, empty demo.
4. Maximise the window, set zoom to 90% (`Ctrl` + `-`), and use **light mode** (toggle top right); it reads better on video.
5. Turn on Do Not Disturb so no notifications pop up.
6. Do one practice run of **Play guided demo**, then open a fresh Incognito window for the real take.
7. Record with the Snipping Tool's screen recording (`Win+Shift+R`), Xbox Game Bar (`Win+Alt+R`) or OBS Studio, at 1080p.

### Scene by scene (show / say)

**Scene 1 · 0:00-0:20 · The problem**
- Show: the hero section. Optionally first, a WhatsApp group screenshot with a buried notice (only one you have permission to share, with names blurred).
- Say: "This is Priya. She's in nine school and society WhatsApp groups. Fee deadlines, PTMs, things her son has to bring tomorrow: they all arrive here, buried under good-morning forwards. To-do apps don't help her, because she'd have to install one, type everything in, and remember to check it."

**Scene 2 · 0:20-0:35 · The idea**
- Show: slowly scroll the hero, then "How it works".
- Say: "Forward-It works the other way round. Priya doesn't change anything. She just forwards the message, the same thing she already does all day, and Forward-It turns it into reminders that arrive at the right time."

**Scene 3 · 0:35-2:00 · The guided demo**
Click **Play guided demo** and let it run. Speak one short line per caption:
1. *Meet Priya*: "Here are two real demo phones, Priya and her husband Rahul, running the actual bot."
2. *One forward*: "She forwards the school circular."
3. *Three tasks*: "In two seconds it finds three tasks with dates, the ₹2,400 amount, and a quote from the original, so she can trust it. Reminders are set for the evening before."
4. *Noise is ignored*: "A good-morning forward isn't a task, so it's ignored."
5. *Hinglish*: "It understands Hinglish, and replies in Hinglish."
6. *Photo*: "Even a photo of a printed notice works."
7. *Voice note*: "Or she can just say it, which helps grandparents and busy hands."
8. *Share with family*: "Now Priya shares her list with Rahul."
9. *The evening before*: "We skip ahead in time: the reminder reaches both phones."
10. *Handoff*: "Rahul replies with a thumbs up. It's ticked off, and Priya is told instantly. No more 'did you pay it?'"
11. *Morning summary*: "Every morning, just what's due today."
12. *Impact*: "And the difference, counted live: tasks captured, nothing missed, noise ignored."

In Clipchamp, trim the waits while "Forward-It is replying…" shows.

**Scene 4 · 2:00-2:15 · A closer look**
- Show: the Tasks tab (hover a task to show Done / Calendar / Delete), the This week tab, and the calendar button.
- Say: "Everything lives on one shared list, a seven-day view, and any task can go straight into Google or Apple Calendar."

**Scene 5 · 2:15-2:30 · How it's built, honestly**
- Show: the "Try on WhatsApp" dialog, then the Features section.
- Say: "It's built with Node.js, Groq's AI for text, photos and voice, and Meta's WhatsApp Cloud API, with checks in code because AI isn't great at calendar maths. Honest limitations: on a test number it only replies to approved numbers, and WhatsApp allows free replies within 24 hours of your last message. This was built with help from Claude Code."
- If Meta is set up: add a 10-15 second phone recording here: forward the circular on real WhatsApp and show the reply arriving.

**Scene 6 · 2:30-2:40 · Close**
- Show: scroll to the closing banner.
- Say: "Work should fit people, not the other way round. Forward it. Forget it."
- [If you tested with a real person: add their before/after and a short quote here, with their permission.]

Upload to YouTube (Unlisted is fine) and paste the link into Devpost.
