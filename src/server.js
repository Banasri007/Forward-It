import express from "express";
import { aiDescription, config, whatsappMode } from "./config.js";
import { flush } from "./store.js";
import { startScheduler } from "./scheduler.js";
import { simulatorRouter } from "./channels/simulator.js";
import { twilioRouter } from "./channels/twilio.js";
import { startPolling } from "./channels/twilio-poll.js";

const app = express();
app.set("trust proxy", true); // behind cloudflared/ngrok, so Twilio signatures use https

app.get("/health", (req, res) => res.json({ ok: true }));
app.use("/webhooks/twilio", twilioRouter());
app.use("/api/sim", express.json({ limit: "15mb" }), simulatorRouter());
app.use(express.static(config.publicDir));

const WHATSAPP_STATUS = {
  off: "not configured (simulator only)",
  poll: `on - checking Twilio for new messages every ${config.twilio.pollSeconds}s (no public URL needed)`,
  webhook: config.twilio.publicUrl
    ? `on - Twilio webhook at ${config.twilio.publicUrl}/webhooks/twilio`
    : "webhook mode, but PUBLIC_URL isn't set, so Twilio can't reach this server",
};

app.listen(config.port, () => {
  console.log(`\n  Forward-It is running`);
  console.log(`  Simulator:  http://localhost:${config.port}`);
  console.log(`  AI:         ${aiDescription() ?? "off - offline parser (set GROQ_API_KEY in .env to read photos)"}`);
  console.log(`  WhatsApp:   ${WHATSAPP_STATUS[whatsappMode]}`);
  console.log(`  Time zone:  ${config.timezone}\n`);
});

startScheduler();
if (whatsappMode === "poll") startPolling();

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    flush();
    process.exit(0);
  });
}
