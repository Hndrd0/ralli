import fetch from "node-fetch";

const DISCORD_WEBHOOK_URL =
  "https://discord.com/api/webhooks/1484127066260635758/Zt8t2MHBzgfNU2HAm5kTy1fsTT0qkQCciQgC0j4DUaSqi9CqsedJolh4oB6WZe9orZoc";

export default async ({ req, res, log, error }) => {
  const rawData = process.env.APPWRITE_FUNCTION_DATA;

  let payload;
  try {
    payload = JSON.parse(rawData);
  } catch (e) {
    error("Failed to parse APPWRITE_FUNCTION_DATA: " + e.message);
    return res.json({ success: false, message: "Invalid JSON payload." }, 400);
  }

  const { name, admissionNo } = payload ?? {};

  if (!name || !admissionNo) {
    error("Missing name or admissionNo in payload.");
    return res.json({ success: false, message: "Missing name or admissionNo in payload." }, 400);
  }

  const message = `Code redeemed by: ${name}, Admission No: ${admissionNo}`;
  log(`Sending Discord message: ${message}`);

  let response;
  try {
    response = await fetch(DISCORD_WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: message }),
    });
  } catch (e) {
    error("Network error while sending Discord webhook: " + e.message);
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

  log("Discord notification sent successfully.");
  return res.json({ success: true, message: "Discord notification sent." });
};
