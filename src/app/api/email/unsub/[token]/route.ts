// Page 39 — One-click unsubscribe.
//
// GET /api/email/unsub/[token]
// Stamps the recipient as UNSUBSCRIBED and writes a global
// EmailUnsubscribe row so all future campaigns skip the address.

import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  const r = await db.emailCampaignRecipient.findUnique({
    where: { trackingToken: token },
    select: { id: true, email: true, campaignId: true },
  });
  if (!r) {
    return new NextResponse(notFoundHtml(), { status: 404, headers: { "Content-Type": "text/html" } });
  }
  const now = new Date();
  await db.emailCampaignRecipient.update({
    where: { id: r.id },
    data: { status: "UNSUBSCRIBED", unsubscribedAt: now },
  });
  await db.emailUnsubscribe.upsert({
    where: { email: r.email },
    create: { email: r.email, reason: `Campaign ${r.campaignId.slice(0, 8)}` },
    update: {},
  });
  return new NextResponse(confirmHtml(r.email), {
    status: 200,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}

function confirmHtml(email: string): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Unsubscribed</title>
<style>
body{font-family:ui-sans-serif,system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;background:#f8fafc;color:#0f172a;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;padding:24px;}
main{max-width:480px;background:#fff;border:1px solid #e2e8f0;border-radius:12px;padding:32px;text-align:center;}
h1{margin:0 0 12px;font-size:22px;}
p{color:#475569;font-size:14px;line-height:1.5;}
a{color:#2563eb;}
</style></head>
<body><main>
<h1>You're unsubscribed</h1>
<p><b>${email}</b> has been removed from all Flowtora marketing emails.</p>
<p style="color:#94a3b8;">Mistake? <a href="mailto:support@flowtora.com">Email support</a> and we'll fix it.</p>
</main></body></html>`;
}

function notFoundHtml(): string {
  return `<!doctype html><html><head><title>Not found</title></head><body style="font-family:sans-serif;padding:24px;">Token not recognized.</body></html>`;
}
