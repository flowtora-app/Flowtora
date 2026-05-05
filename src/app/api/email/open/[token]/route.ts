// Page 39 — Email open-tracking pixel.
//
// GET /api/email/open/[token] returns a 1×1 transparent GIF and
// stamps openedAt on the matching recipient. Idempotent — a second
// open just keeps openedAt at the earliest seen.

import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// 1×1 transparent GIF.
const PIXEL = Buffer.from(
  "R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7",
  "base64",
);

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  const recipient = await db.emailCampaignRecipient.findUnique({
    where: { trackingToken: token },
    select: { id: true, openedAt: true, status: true, variantId: true, deliveredAt: true },
  });
  if (recipient && recipient.openedAt == null) {
    const now = new Date();
    await db.emailCampaignRecipient.update({
      where: { id: recipient.id },
      data: {
        openedAt: now,
        deliveredAt: recipient.deliveredAt ?? now,
        status: recipient.status === "CLICKED" ? "CLICKED" : "OPENED",
      },
    });
    if (recipient.variantId) {
      await db.emailCampaignSubjectVariant.update({
        where: { id: recipient.variantId },
        data: { openedCount: { increment: 1 } },
      }).catch(() => { /* noop */ });
    }
  }
  return new NextResponse(PIXEL, {
    status: 200,
    headers: {
      "Content-Type": "image/gif",
      "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
    },
  });
}
