# Devpost draft: Forward-It

Fill in every `[ ]` with what actually happened. Judges reward real users and real numbers, and the rules ask you to only share examples you have permission to share.

## Inspiration

[Your real story. For example: who in your family or circle misses deadlines buried in WhatsApp groups? What did they miss? Ask their permission before naming them or showing their messages.]

Most productivity tools ask people to move their lives into a new app. The people we care about won't. WhatsApp is where their school notices, bills and appointments already arrive, so that's where the tool should live.

## What it does

Forward any message, photo of a notice, PDF or voice note to Forward-It on WhatsApp. It finds each task (what to do, pay, bring, submit or attend, and by when), saves it, and sends a WhatsApp reminder at the right time, usually the evening before, so there's still time to act. Reply 👍 when done. Every morning you get "Today: N things". It speaks English, Hindi and Hinglish, and ignores good-morning forwards.

**Family sharing** solves the handoff: `SHARE +91…` puts a partner on the same list. Forwards and reminders reach both phones, and when one person finishes a task the other is told, so nobody has to ask "did you pay it?".

The **website** is a product page with a live demo: two phones (Priya and Rahul) running the real bot, a family dashboard (Tasks, a 7-day timeline, and Impact numbers counted live), calendar export, and a **guided demo** that plays the whole story with captions.

## The user and the barrier

- **User:** [name or description, e.g. "my aunt, a nurse who works night shifts and is in 9 school/society WhatsApp groups"]
- **Barrier:** important tasks are buried in chat noise, and to-do apps need typing, setup and a habit she doesn't have.
- **The change:** one action she already knows (forward), zero new apps.

## What changed (measure this!)

| | Before | With Forward-It |
|---|---|---|
| Deadlines/tasks missed in [period] | [ ] | [ ] |
| Time spent re-reading group chats per day | [ ] | [ ] |
| What she said | | "[quote]" |

## How we built it

- Node.js + Express server connected to WhatsApp through the Twilio Sandbox. It checks Twilio for new messages every few seconds, so it runs on any network with no public URL or tunnel (a webhook mode is there for production). A WhatsApp-style web simulator is included for demos.
- Groq reads messages and returns tasks as strict, schema-checked JSON (title, date, time, amount, kind, source quote): `openai/gpt-oss-120b` for text, `qwen/qwen3.8-27b` for photos of notices. PDFs are converted to text locally first.
- An offline rule-based parser (chrono-node + our own Hindi/Hinglish date words) keeps the bot working with no AI key or if the AI call fails.
- Voice notes are transcribed with Groq's Whisper (`whisper-large-v3-turbo`), then read like text.
- Reminder rules: evening before → 2 hours before → next morning → soon, depending on how close the task is.
- A scheduler sends reminders to every family member and a morning summary. Replies in three languages.
- Tasks belong to a "household", so sharing merges two lists into one numbered list.
- The website is plain HTML, CSS and JavaScript modules (no framework), with light and dark themes, an `.ics` calendar export, and a guided demo that drives the same endpoints a visitor's clicks would.

## Challenges

- Indian date formats (day-first, "15/11"), and Hinglish words like *kal* (tomorrow *or* yesterday) and *Friday tak* ("by Friday").
- Choosing a reminder time that is actually useful, not just "at the deadline".
- Keeping trust: every task shows the quote it came from, and dates that were worked out are marked.

## What we learned

[Your own words: what surprised you when you watched a real person use it?]

## Limitations

- WhatsApp's 24-hour messaging window: reminders sent more than 24 hours after the user's last message need an approved template in production.
- On the Twilio sandbox, each family member must join the sandbox once before they can receive messages.
- AI can misread dates; the source quote helps the user check, and weekday maths is double-checked in code.
- Prototype storage (JSON file), single time zone.

## What's next

- Approved WhatsApp templates so reminders work any time.
- Recurring tasks ("every month on the 5th").
- Assigning a task to one family member ("Rahul, you take this one").
- A weekly "how did we do" summary on WhatsApp, using the Impact numbers.

## Built with

Node.js · Express · Groq API (gpt-oss-120b, Qwen 3.8 27B, Whisper) · Twilio WhatsApp · chrono-node · Luxon · unpdf · node-qrcode

## AI assistance and pre-existing work

The code was written with help from Claude Code (Anthropic). At runtime, Forward-It uses the Groq API to read messages and transcribe voice notes. Open-source libraries: Express, chrono-node, Luxon, unpdf, node-qrcode, Anthropic SDK (optional Claude support). Sample messages, people (Priya and Rahul), the PDF and the notice photo are made up; the sample voice note uses Windows' built-in text-to-speech.

## Demo video plan (about 2 minutes)

The easiest way: screen-record the website's **Play guided demo** (about 90 seconds), then add your user's real story at the start and their numbers at the end.

1. **0:00-0:15** The pain: a real (permitted) WhatsApp group screenshot with a buried fee notice.
2. **0:15-1:45** Press **Play guided demo** and let it run: forward → three tasks → noise ignored → Hinglish → photo → voice note → family sharing → reminder on both phones → 👍 handoff → morning summary → Impact.
3. **1:45-2:00** Your user's before/after numbers and quote. Close: "Forward it. Forget it."
4. Optional: a 10-second clip of the same thing on a real phone through WhatsApp.
