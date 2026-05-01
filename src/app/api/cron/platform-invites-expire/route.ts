// Daily sweep — flips SENT/OPENED PlatformInvite rows past their
// expiresAt over to EXPIRED so the Invitations page can filter on
// status without recomputing per-row.

import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function isAuthorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const auth = req.headers.get("authorization");
  if (auth === `Bearer ${secret}`) return true;
  const url = new URL(req.url);
  if (url.searchParams.get("key") === secret) return true;
  return false;
}

export async function GET(req: Request) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const now = new Date();
    const updated = await db.platformInvite.updateMany({
      where: {
        status: { in: ["SENT", "OPENED"] },
        expiresAt: { lt: now },
      },
      data: { status: "EXPIRED" },
    });
    return NextResponse.json({ ok: true, expired: updated.count });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: (err as Error).message },
      { status: 500 },
    );
  }
}

export async function POST(req: Request) {
  return GET(req);
}
