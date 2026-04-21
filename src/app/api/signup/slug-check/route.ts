import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { slugify, isReservedSlug } from "@/lib/slug";

// Public (unauth'd) endpoint that powers the live "shop URL
// available?" indicator on the signup form. The server action at
// POST time runs the same three checks, so this is pure UX —
// letting users pick a valid slug before they submit instead of
// bouncing off a redirect with an error banner.
//
// Returns:
//   { ok: true }
//   { ok: false, reason: "too_short" | "reserved" | "taken" }
//
// We always slugify() the input first so the browser normalization
// matches server normalization exactly — "Acme Sign!" and
// "acme-sign" both resolve to the same check. The endpoint is
// whitelisted in middleware via the `/api/signup` prefix.

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const raw = req.nextUrl.searchParams.get("slug") ?? "";
  const slug = slugify(raw);

  if (slug.length < 2 || slug.length > 40) {
    return NextResponse.json({ ok: false, reason: "too_short" });
  }
  if (isReservedSlug(slug)) {
    return NextResponse.json({ ok: false, reason: "reserved" });
  }

  const existing = await db.tenant.findUnique({
    where: { slug },
    select: { id: true },
  });
  if (existing) {
    return NextResponse.json({ ok: false, reason: "taken" });
  }

  return NextResponse.json({ ok: true });
}
