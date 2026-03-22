import { Client, Databases, Query } from "node-appwrite";
import fetch from "node-fetch";

export default async ({ req, res, log, error }) => {
  log("Raw request body: " + JSON.stringify(req.body));

  let body = {};
  if (!req.body || (typeof req.body === "string" && !req.body.trim())) {
    res.setHeader("Content-Type", "application/json");
    return res.send(JSON.stringify({ success: false, message: "Missing request body." }));
  }
  try {
    body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
  } catch (e) {
    error("Failed to parse request body: " + e.message);
    res.setHeader("Content-Type", "application/json");
    return res.send(JSON.stringify({ success: false, message: "Invalid request body." }));
  }

  const { code } = body ?? {};
  if (!code) {
    res.setHeader("Content-Type", "application/json");
    return res.send(JSON.stringify({ success: false, message: "Missing code in request." }));
  }

  const client = new Client()
    .setEndpoint(process.env.APPWRITE_ENDPOINT)
    .setProject(process.env.APPWRITE_PROJECT_ID)
    .setKey(process.env.APPWRITE_API_KEY);

  const databases = new Databases(client);
  const databaseId = process.env.APPWRITE_DATABASE_ID;
  const collectionId = process.env.APPWRITE_COLLECTION_ID;

  let result;
  try {
    result = await databases.listDocuments(databaseId, collectionId, [
      Query.equal("code", code),
    ]);
  } catch (e) {
    error("Database query error: " + e.message);
    res.setHeader("Content-Type", "application/json");
    return res.send(JSON.stringify({ success: false, message: "Failed to query the database." }));
  }

  if (!result.documents || result.documents.length === 0) {
    res.setHeader("Content-Type", "application/json");
    return res.send(JSON.stringify({ success: false, message: "Invalid code." }));
  }

  const doc = result.documents[0];
  const now = new Date();

  if (new Date(doc.expiresAt) < now) {
    res.setHeader("Content-Type", "application/json");
    return res.send(JSON.stringify({ success: false, message: "Code expired." }));
  }
  if (doc.used) {
    res.setHeader("Content-Type", "application/json");
    return res.send(JSON.stringify({ success: false, message: "Code already used." }));
  }

  try {
    await databases.updateDocument(databaseId, collectionId, doc.$id, { used: true });
  } catch (e) {
    error("Database update error: " + e.message);
    res.setHeader("Content-Type", "application/json");
    return res.send(JSON.stringify({ success: false, message: "Failed to mark code as used." }));
  }

  // Discord webhook
  try {
    const safeName = String(doc.name).replace(/@/g, "(@)");
    const safeAdmissionNo = String(doc.admissionNo).replace(/@/g, "(@)");
    await fetch(process.env.DISCORD_WEBHOOK, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: `Code redeemed by: ${safeName}, Admission No: ${safeAdmissionNo}` }),
    });
  } catch (e) {
    error("Discord webhook error: " + e.message);
  }

  res.setHeader("Content-Type", "application/json");
  return res.send(JSON.stringify({ success: true, message: "Code redeemed successfully." }));
};
