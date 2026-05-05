// Page 38 — Landing page tracking endpoint.
//
// POST /api/lp/track
// Body: { pageId, variantId, sessionId, source, device, utm, scrollDepth, timeOnPage, converted }
//
// Upserts a LandingPageVisit row keyed on (pageId, sessionId) so a
// session that scrolls + clicks doesn't blow up cardinality. Counters
// on the variant are bumped atomically when converted.

import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import type { LandingPageDevice } from "@prisma/client";

export const runtime = "nodejs";

const VALID_DEVICES = ["DESKTOP", "TABLET", "MOBILE"] as const;

interface TrackPayload {
  pageId?: unknown;
  variantId?: unknown;
  sessionId?: unknown;
  source?: unknown;
  device?: unknown;
  utm?: unknown;
  scrollDepth?: unknown;
  timeOnPage?: unknown;
  converted?: unknown;
  country?: unknown;
}

export async function POST(req: Request) {
  let body: TrackPayload;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }
  const pageId = typeof body.pageId === "string" ? body.pageId : null;
  const sessionId = typeof body.sessionId === "string" ? body.sessionId : null;
  if (!pageId || !sessionId) {
    return NextResponse.json({ ok: false, error: "pageId + sessionId required" }, { status: 400 });
  }
  const variantId = typeof body.variantId === "string" ? body.variantId : null;
  const source = typeof body.source === "string" ? body.source.slice(0, 200) : null;
  const utmRaw = (body.utm && typeof body.utm === "object") ? body.utm as Record<string, unknown> : {};
  const utmSource   = typeof utmRaw.source   === "string" ? utmRaw.source.slice(0, 80)   : null;
  const utmMedium   = typeof utmRaw.medium   === "string" ? utmRaw.medium.slice(0, 80)   : null;
  const utmCampaign = typeof utmRaw.campaign === "string" ? utmRaw.campaign.slice(0, 80) : null;

  const device: LandingPageDevice = typeof body.device === "string" && (VALID_DEVICES as readonly string[]).includes(body.device)
    ? (body.device as LandingPageDevice)
    : "DESKTOP";
  const scrollDepth = Math.max(0, Math.min(100, Number(body.scrollDepth) || 0));
  const timeOnPage = Number.isFinite(Number(body.timeOnPage)) ? Math.max(0, Math.round(Number(body.timeOnPage))) : null;
  const converted = body.converted === true;
  const bounced = !converted && timeOnPage != null && timeOnPage < 5 && scrollDepth < 25;
  const country = typeof body.country === "string" ? body.country.slice(0, 4) : null;

  // Upsert by (pageId, sessionId): drives a single row per session that
  // ratchets up scroll/time/converted as more beacons arrive.
  const existing = await db.landingPageVisit.findFirst({
    where: { pageId, sessionId },
    select: { id: true, scrollDepth: true, timeOnPage: true, converted: true, variantId: true },
  });
  if (existing) {
    const newScroll = Math.max(existing.scrollDepth, scrollDepth);
    const newTime = Math.max(existing.timeOnPage ?? 0, timeOnPage ?? 0);
    const becameConverted = !existing.converted && converted;
    await db.landingPageVisit.update({
      where: { id: existing.id },
      data: {
        scrollDepth: newScroll,
        timeOnPage: newTime,
        converted: existing.converted || converted,
        bounced: bounced && !existing.converted,
        ...(existing.variantId == null && variantId ? { variantId } : {}),
      },
    });
    if (becameConverted && (existing.variantId ?? variantId)) {
      await db.landingPageVariant.update({
        where: { id: (existing.variantId ?? variantId) as string },
        data: { conversionCount: { increment: 1 } },
      }).catch(() => { /* variant may have been deleted */ });
    }
  } else {
    await db.landingPageVisit.create({
      data: {
        pageId,
        variantId,
        sessionId,
        source,
        utmSource, utmMedium, utmCampaign,
        device,
        scrollDepth,
        timeOnPage,
        converted,
        bounced,
        country,
      },
    });
    if (variantId) {
      await db.landingPageVariant.update({
        where: { id: variantId },
        data: { visitCount: { increment: 1 }, ...(converted ? { conversionCount: { increment: 1 } } : {}) },
      }).catch(() => { /* variant may have been deleted */ });
    }
  }

  return NextResponse.json({ ok: true });
}
