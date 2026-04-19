// Resend webhook handler — receives email delivery events (sent, delivered,
// opened, clicked, bounced, complained) and updates the EmailEvent timeline
// rows so staff can see delivery status in the customer communication history.
//
// Setup:
//   1. Go to Resend dashboard → Webhooks → Add endpoint
//   2. URL: https://yourdomain.com/api/webhooks/resend
//   3. Select events: email.sent, email.delivered, email.opened,
//      email.clicked, email.bounced, email.complained
//   4. Copy the signing secret → RESEND_WEBHOOK_SECRET in .env

import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { createHmac, timingSafeEqual } from "crypto";

export const runtime = "nodejs";

// Resend signs with svix-style headers.
function verifySignature(
  rawBody: string,
  headers: Headers,
  secret: string,
): boolean {
  const svixId        = headers.get("svix-id") ?? "";
  const svixTimestamp = headers.get("svix-timestamp") ?? "";
  const svixSignature = headers.get("svix-signature") ?? "";

  if (!svixId || !svixTimestamp || !svixSignature) return false;

  // Reject timestamps more than 5 minutes old.
  const ts = parseInt(svixTimestamp, 10);
  if (Math.abs(Date.now() / 1000 - ts) > 300) return false;

  const toSign = `${svixId}.${svixTimestamp}.${rawBody}`;
  const key = secret.startsWith("whsec_")
    ? Buffer.from(secret.slice(6), "base64")
    : Buffer.from(secret);
  const expected = createHmac("sha256", key).update(toSign).digest("base64");

  // svix-signature may contain multiple sigs: "v1,<base64> v1,<base64>"
  const sigs = svixSignature.split(" ").map((s) => s.replace(/^v\d+,/, ""));
  return sigs.some((sig) => {
    try {
      return timingSafeEqual(Buffer.from(sig, "base64"), Buffer.from(expected, "base64"));
    } catch {
      return false;
    }
  });
}

type ResendEvent = {
  type: string;
  data: {
    email_id:   string;  // Resend's message ID (maps to EmailEvent.providerId)
    to?:        string[];
    created_at: string;
    tags?:      Record<string, string>;
  };
};

export async function POST(req: Request) {
  const webhookSecret = process.env.RESEND_WEBHOOK_SECRET;
  if (!webhookSecret) {
    return NextResponse.json({ error: "Webhook not configured" }, { status: 503 });
  }

  const rawBody = await req.text();
  if (!verifySignature(rawBody, req.headers, webhookSecret)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  let event: ResendEvent;
  try {
    event = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { type, data } = event;
  const emailId   = data.email_id;
  const eventTime = new Date(data.created_at);

  if (!emailId) {
    return NextResponse.json({ ok: true, skipped: "no email_id" });
  }

  // Find the EmailEvent row by provider message ID.
  const row = await db.emailEvent.findFirst({
    where: { providerId: emailId },
    select: { id: true },
  });

  if (!row) {
    // May arrive before we've written the row (race) or be from a test send —
    // return 200 so Resend doesn't retry.
    return NextResponse.json({ ok: true, skipped: "event not found" });
  }

  // Map Resend event types to our EmailEvent fields.
  const patch: Record<string, Date | string | null> = {};

  switch (type) {
    case "email.opened":
      patch.openedAt = eventTime;
      break;
    case "email.clicked":
      patch.clickedAt = eventTime;
      break;
    case "email.bounced":
    case "email.complained":
      patch.failedAt   = eventTime;
      patch.failReason = type === "email.bounced" ? "bounced" : "complained";
      break;
    // email.sent / email.delivered — already recorded at send time; ignore.
    default:
      return NextResponse.json({ ok: true, skipped: type });
  }

  await db.emailEvent.update({
    where: { id: row.id },
    data:  patch,
  });

  return NextResponse.json({ ok: true });
}
