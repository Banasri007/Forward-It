import express from "express";
import { aiDescription, config, metaConfigured, twilioConfigured, whatsappMode } from "./config.js";
import { flush } from "./store.js";
import { startScheduler } from "./scheduler.js";
import { simulatorRouter } from "./channels/simulator.js";
import { twilioRouter } from "./channels/twilio.js";
import { startPolling } from "./channels/twilio-poll.js";
import { metaRouter } from "./channels/meta.js";

const app = express();
app.set("trust proxy", true); // behind Render/cloudflared/ngrok, so webhook signatures use https

app.get("/health", (req, res) => res.json({ ok: true }));
app.use("/webhooks/twilio", twilioRouter());
app.use("/webhooks/meta", metaRouter());
app.use("/api/sim", express.json({ limit: "15mb" }), simulatorRouter());
app.use(express.static(config.publicDir));

const TWILIO_STATUS = {
  off: twilioConfigured ? "switched off (WHATSAPP_MODE=off)" : "not configured",
  poll: `on - checking Twilio for new messages every ${config.twilio.pollSeconds}s (no public URL needed)`,
  webhook: config.twilio.publicUrl
    ? `on - Twilio webhook at ${config.twilio.publicUrl}/webhooks/twilio`
    : "webhook mode, but PUBLIC_URL isn't set, so Twilio can't reach this server",
};
const META_STATUS = !metaConfigured
  ? "not configured"
  : `on - set Meta's callback URL to ${config.publicBaseUrl || "https://<your-public-url>"}/webhooks/meta${config.meta.appSecret ? "" : " (warning: META_APP_SECRET not set, so webhook signatures aren't checked)"}`;

app.listen(config.port, () => {
  console.log(`\n  Forward-It is running`);
  console.log(`  Website:         http://localhost:${config.port}`);
  console.log(`  AI:              ${aiDescription() ?? "off - offline parser (set GROQ_API_KEY in .env to read photos)"}`);
  console.log(`  WhatsApp (Meta): ${META_STATUS}`);
  console.log(`  WhatsApp (Twilio): ${TWILIO_STATUS[whatsappMode]}`);
  console.log(`  Time zone:       ${config.timezone}\n`);
});

startScheduler();
if (whatsappMode === "poll") startPolling();

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    flush();
    process.exit(0);
  });
}
