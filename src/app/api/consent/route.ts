// Consent audit endpoint — every cookie-banner decision the visitor
// makes is POSTed here so a permanent record exists in Postgres for
// proof-of-consent under GDPR.
//
// Posted from CookieConsentProvider via lib/cookie-consent.ts after
// localStorage is updated. Beacon-style — receive, write, return 204.
//
// We hash the IP with the same daily-rotating salt as PageView so
// auditors can prove "this consent came from a real browser" without
// the company persisting raw IPs. Safe to drop the IP field entirely
// if your jurisdiction prefers stricter minimization.

import { NextResponse } from "next/server";
import { z } from "zod";
import crypto from "node:crypto";
import { auth } from "@/auth";
import { db } from "@/lib/db";

// Mirror of StoredConsent — kept loose so future fields don't fail
// validation; we only care about the audit-relevant pieces here.
const consentSchema = z.object({
  version: z.string().min(1).max(16),
  decision: z.enum(["accepted-all", "rejected-all", "custom", "withdrawn"]),
  categories: z.object({
    necessary: z.literal(true),
    analytics: z.boolean(),
    marketing: z.boolean(),
    preferences: z.boolean(),
  }),
  at: z.number().int(),
  anonymousId: z.string().min(8).max(64),
});

// Same daily-salt scheme as PageView so the hashes can never be
// correlated across more than a 24h window without our help.
function dailySalt(): string {
  const day = new Date().toISOString().slice(0, 10);
  const seed = process.env.AUTH_SECRET ?? "fallback-flowtora-consent-salt";
  return crypto.createHash("sha256").update(`${seed}:${day}`).digest("hex");
}

function hashIp(ip: string | null): string | null {
  if (!ip) return null;
  return crypto.createHash("sha256").update(`${dailySalt()}:${ip}`).digest("hex");
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return new NextResponse(null, { status: 400 });
  }

  const parsed = consentSchema.safeParse(body);
  if (!parsed.success) {
    return new NextResponse(null, { status: 400 });
  }
  const c = parsed.data;

  // Best-effort user-id capture — null for unauthenticated visitors,
  // populated when the visitor was signed in at the moment of consent.
  let userId: string | null = null;
  try {
    const session = await auth();
    userId = session?.user?.id ?? null;
  } catch {
    // auth() failures shouldn't block audit logging; we'd rather
    // record an anonymous decision than nothing at all.
  }

  const headers = request.headers;
  const xff = headers.get("x-forwarded-for");
  const ip = xff ? xff.split(",")[0]!.trim() : null;
  const userAgent = (headers.get("user-agent") ?? "").slice(0, 200) || null;

  try {
    await db.consentLog.create({
      data: {
        anonymousId: c.anonymousId,
        userId,
        version: c.version,
        decision: c.decision,
        categories: c.categories,
        ipHash: hashIp(ip),
        userAgent,
      },
    });
  } catch (err) {
    // Never let an audit-write failure poison the visitor's UX — we
    // log + return 204 so the client moves on. The localStorage
    // mirror still records their choice client-side.
    console.error("[/api/consent] insert failed:", err);
  }

  return new NextResponse(null, {
    status: 204,
    headers: { "Cache-Control": "no-store" },
  });
}
