// First-party page-view beacon for the marketing site.
//
// Visitors who clicked "Accept" on the cookie banner POST a small
// JSON payload here on every page view (and on path changes inside
// the SPA shell). The endpoint is intentionally tiny — read the
// request, hash the IP with a daily salt, write a row, return 204.
//
// Geo is sourced from Vercel's `x-vercel-ip-*` request headers (free,
// pre-resolved at the edge). On non-Vercel deploys these are absent
// and the row simply lacks geo — the rest still works.

import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { z } from "zod";
import crypto from "node:crypto";

// Tight zod schema — anything beyond this is rejected to keep the
// public endpoint from being abused as a free general-purpose log.
const beaconSchema = z.object({
  path:       z.string().min(1).max(2048),
  referrer:   z.string().max(2048).optional().or(z.literal("")),
  sessionId:  z.string().min(8).max(64),
});

// Daily-rotating salt for IP hashing. Same salt within a day → same
// hash for the same IP (lets us de-dup reloads without storing PII).
// Day rolls → new salt → fresh hashes, no cross-day correlation.
function dailySalt(): string {
  const day = new Date().toISOString().slice(0, 10); // "YYYY-MM-DD"
  const seed = process.env.AUTH_SECRET ?? "fallback-flowtora-analytics-salt";
  return crypto.createHash("sha256").update(`${seed}:${day}`).digest("hex");
}

function hashIp(ip: string | null): string | null {
  if (!ip) return null;
  return crypto.createHash("sha256").update(`${dailySalt()}:${ip}`).digest("hex");
}

function originOnly(referrer: string | undefined): string | null {
  if (!referrer) return null;
  try {
    const u = new URL(referrer);
    return u.host || null;
  } catch {
    return null;
  }
}

// Strip query strings + trailing slashes to keep paths grouped.
function normalizePath(raw: string): string {
  const stripped = raw.split("?")[0]!.split("#")[0]!;
  if (stripped === "/") return "/";
  return stripped.replace(/\/+$/, "");
}

function parseFloatOrNull(s: string | null): number | null {
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return new NextResponse(null, { status: 400 });
  }

  const parsed = beaconSchema.safeParse(body);
  if (!parsed.success) {
    return new NextResponse(null, { status: 400 });
  }
  const d = parsed.data;

  // Vercel geo headers — present in production on Vercel, absent
  // elsewhere. All fields nullable so unknown geo writes a clean row.
  const headers = request.headers;
  const country = headers.get("x-vercel-ip-country");
  // Vercel URL-encodes city + region (e.g. "San%20Francisco").
  const cityRaw = headers.get("x-vercel-ip-city");
  const regionRaw = headers.get("x-vercel-ip-country-region");
  const city = cityRaw ? decodeURIComponent(cityRaw) : null;
  const region = regionRaw ? decodeURIComponent(regionRaw) : null;
  const latitude = parseFloatOrNull(headers.get("x-vercel-ip-latitude"));
  const longitude = parseFloatOrNull(headers.get("x-vercel-ip-longitude"));

  // IP — Vercel exposes the real client IP via x-forwarded-for. Take
  // the first hop, ignore proxies.
  const xff = headers.get("x-forwarded-for");
  const ip = xff ? xff.split(",")[0]!.trim() : null;

  const userAgent = (headers.get("user-agent") ?? "").slice(0, 200) || null;

  try {
    await db.pageView.create({
      data: {
        path: normalizePath(d.path),
        referrerHost: originOnly(d.referrer || undefined),
        country,
        region,
        city,
        latitude,
        longitude,
        userAgent,
        sessionId: d.sessionId,
        ipHash: hashIp(ip),
      },
    });
  } catch (err) {
    // Never let an analytics failure poison the visitor's experience.
    console.error("[/api/track] insert failed:", err);
  }

  // 204 — beacon-style: client doesn't need the body, only that we
  // received it. Cache-Control: no-store so the browser doesn't hold
  // the response and skip subsequent beacons.
  return new NextResponse(null, {
    status: 204,
    headers: { "Cache-Control": "no-store" },
  });
}
