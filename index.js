import fetch from "node-fetch";

export default async ({ req, res, log, error }) => {
  const webhookUrl = process.env.DISCORD_WEBHOOK_URL;

  if (!webhookUrl) {
    error("DISCORD_WEBHOOK_URL environment variable is not set.");
    return res.json({ success: false, message: "Webhook URL not configured." }, 500);
  }

  let payload;
  try {
    payload = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
  } catch (e) {
    error("Failed to parse request body: " + e.message);
    return res.json({ success: false, message: "Invalid JSON payload." }, 400);
  }

  const { name, admissionNo } = payload ?? {};

  if (!name || !admissionNo) {
    return res.json({ success: false, message: "Missing name or admissionNo in payload." }, 400);
  }

  const escapeMarkdown = (str) => String(str).replace(/([*_~`|\\>])/g, "\\$1");
  const message = `Code redeemed by: ${escapeMarkdown(name)} (${escapeMarkdown(admissionNo)})`;

  log(`Sending Discord message: ${message}`);

  let response;
  try {
    response = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: message }),
    });
  } catch (e) {
    error(`Network error while sending Discord webhook: ${e.message}`);
    return res.json({ success: false, message: "Network error sending Discord message." }, 502);
  }

  if (!response.ok) {
    const text = await response.text();
    if (response.status === 429) {
      error(`Discord webhook rate limited: ${text}`);
      return res.json({ success: false, message: "Discord rate limit reached. Try again later." }, 429);
    }
    error(`Discord webhook request failed (${response.status}): ${text}`);
    return res.json({ success: false, message: "Failed to send Discord message." }, 502);
  }

  return res.json({ success: true, message: "Discord notification sent." });
};
