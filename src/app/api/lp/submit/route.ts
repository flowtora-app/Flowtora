// Page 38 — Landing page form submission endpoint.
//
// POST /api/lp/submit
// Body: form-encoded or JSON with `pageId` (or `path`) + arbitrary fields.

import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export const runtime = "nodejs";

function asMap(value: FormData | Record<string, unknown>): Record<string, string> {
  const out: Record<string, string> = {};
  if (value instanceof FormData) {
    value.forEach((v, k) => { if (typeof v === "string") out[k] = v; });
  } else {
    for (const [k, v] of Object.entries(value)) {
      if (typeof v === "string") out[k] = v;
    }
  }
  return out;
}

export async function POST(req: Request) {
  const ct = (req.headers.get("content-type") ?? "").toLowerCase();
  let payload: Record<string, string> = {};
  if (ct.includes("application/json")) {
    try { payload = asMap(await req.json()); } catch { /* noop */ }
  } else {
    try { payload = asMap(await req.formData()); } catch { /* noop */ }
  }

  const path = payload.path || (payload.pageId ? null : null);
  let pageId: string | null = payload.pageId ?? null;
  if (!pageId && path) {
    const row = await db.landingPage.findUnique({
      where: { path: path.startsWith("/") ? path : "/" + path },
      select: { id: true },
    });
    pageId = row?.id ?? null;
  }
  if (!pageId) {
    return NextResponse.json({ ok: false, error: "pageId or path required" }, { status: 400 });
  }

  const utm = {
    source: payload.utm_source ?? null,
    medium: payload.utm_medium ?? null,
    campaign: payload.utm_campaign ?? null,
  };

  // Strip control fields from payload before persisting.
  const formPayload: Record<string, string> = { ...payload };
  delete formPayload.pageId;
  delete formPayload.path;
  delete formPayload.utm_source;
  delete formPayload.utm_medium;
  delete formPayload.utm_campaign;

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
  const ua = req.headers.get("user-agent") ?? null;
  const referer = req.headers.get("referer") ?? null;

  await db.landingPageFormSubmission.create({
    data: {
      pageId,
      payload: formPayload as never,
      email: typeof formPayload.email === "string" ? formPayload.email : null,
      source: referer,
      utm: utm as never,
      ipAddress: ip,
      userAgent: ua,
      status: "new",
    },
  });

  // Honor return_to redirect if provided.
  if (typeof payload.return_to === "string" && payload.return_to.startsWith("/")) {
    return NextResponse.redirect(new URL(payload.return_to, req.url), 303);
  }
  return NextResponse.json({ ok: true });
}
