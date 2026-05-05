// Page 39 — Email click-tracking redirect.
//
// GET /api/email/click/[token]?to=<encoded_url>&block=<n>
// Stamps clickedAt on the matching recipient, records a
// EmailCampaignClickEvent for the heatmap, and redirects.

import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function safeUrl(raw: string | null): string | null {
  if (!raw) return null;
  try {
    const u = new URL(raw);
    if (u.protocol !== "http:" && u.protocol !== "https:" && u.protocol !== "mailto:") return null;
    return u.toString();
  } catch {
    if (raw.startsWith("/")) return raw;
    return null;
  }
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  const url = new URL(req.url);
  const target = safeUrl(url.searchParams.get("to"));
  const blockIdx = parseInt(url.searchParams.get("block") ?? "", 10);

  const recipient = await db.emailCampaignRecipient.findUnique({
    where: { trackingToken: token },
    select: { id: true, campaignId: true, openedAt: true, clickedAt: true, deliveredAt: true, variantId: true },
  });
  if (recipient && target) {
    const now = new Date();
    await db.emailCampaignRecipient.update({
      where: { id: recipient.id },
      data: {
        clickedAt: now,
        openedAt: recipient.openedAt ?? now,
        deliveredAt: recipient.deliveredAt ?? now,
        status: "CLICKED",
      },
    });
    await db.emailCampaignClickEvent.create({
      data: {
        campaignId: recipient.campaignId,
        recipientId: recipient.id,
        href: target,
        blockIndex: Number.isFinite(blockIdx) ? blockIdx : null,
        clickedAt: now,
        userAgent: req.headers.get("user-agent") ?? undefined,
        ipAddress: req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? undefined,
      },
    });
    if (recipient.variantId) {
      await db.emailCampaignSubjectVariant.update({
        where: { id: recipient.variantId },
        data: { clickedCount: { increment: 1 } },
      }).catch(() => { /* noop */ });
    }
  }

  if (target) return NextResponse.redirect(target, 302);
  return new NextResponse("Missing target", { status: 400 });
}
