import { Client, Databases, Query } from "node-appwrite";
import fetch from "node-fetch";

export default async ({ req, res, log, error }) => {
  // Parse the incoming request body
  let body;
  try {
    body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
  } catch (e) {
    error("Failed to parse request body: " + e.message);
    return res.json({ success: false, message: "Invalid request body." }, 400);
  }

  const { code } = body ?? {};

  if (!code) {
    return res.json({ success: false, message: "Missing code in request." }, 400);
  }

  // Initialise server-side Appwrite client using environment variables
  const client = new Client()
    .setEndpoint(process.env.APPWRITE_ENDPOINT)
    .setProject(process.env.APPWRITE_PROJECT_ID)
    .setKey(process.env.APPWRITE_API_KEY);

  const databases = new Databases(client);
  const databaseId = process.env.APPWRITE_DATABASE_ID;
  const collectionId = process.env.APPWRITE_COLLECTION_ID;

  // Query the codes collection for the submitted code
  let result;
  try {
    result = await databases.listDocuments(databaseId, collectionId, [
      Query.equal("code", code),
    ]);
  } catch (e) {
    error("Database query error: " + e.message);
    return res.json({ success: false, message: "Failed to query the database." }, 500);
  }

  if (result.documents.length === 0) {
    return res.json({ success: false, message: "Invalid code. Please check and try again." }, 404);
  }

  const doc = result.documents[0];
  const now = new Date();

  if (new Date(doc.expiresAt) < now) {
    return res.json({ success: false, message: "This code has expired." }, 410);
  }

  if (doc.used) {
    return res.json({ success: false, message: "This code has already been used." }, 409);
  }

  // Mark the code as used
  try {
    await databases.updateDocument(databaseId, collectionId, doc.$id, { used: true });
  } catch (e) {
    error("Database update error: " + e.message);
    return res.json({ success: false, message: "Failed to mark code as used." }, 500);
  }

  // Send Discord webhook notification
  // Sanitize user-supplied fields to prevent Discord mention injection (@everyone / @here)
  const safeName        = String(doc.name).replace(/@/g, "(@)");
  const safeAdmissionNo = String(doc.admissionNo).replace(/@/g, "(@)");
  const webhookUrl = process.env.DISCORD_WEBHOOK_URL;
  const message = `Code redeemed by: ${safeName}, Admission No: ${safeAdmissionNo}`;
  log(`Sending Discord message: ${message}`);

  try {
    const webhookResponse = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: message }),
    });

    if (!webhookResponse.ok) {
      const text = await webhookResponse.text();
      if (webhookResponse.status === 429) {
        error(`Discord webhook rate limited: ${text}`);
      } else {
        error(`Discord webhook request failed (${webhookResponse.status}): ${text}`);
      }
      // Discord notification failure does not roll back the redemption; the code is already
      // marked as used and the operation is considered successful from the user's perspective.
    } else {
      log("Discord notification sent successfully.");
    }
  } catch (e) {
    error("Network error while sending Discord webhook: " + e.message);
    // Discord notification failure does not roll back the redemption; the code is already
    // marked as used and the operation is considered successful from the user's perspective.
  }

  return res.json({ success: true, message: "Code redeemed successfully." });
};
