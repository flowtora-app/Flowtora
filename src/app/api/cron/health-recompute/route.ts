// Daily health-score recompute cron.
//
// Calls runRecompute("scheduled") which lands one TenantHealthSnapshot
// row per non-archived tenant + a shadow row per tenant when a
// shadow model is configured. The trend chart on
// /platform/tenants/health reads from these rows, so the chart is
// only as fresh as the last cron run.
//
// Auth: same `Bearer ${CRON_SECRET}` (or `?key=`) as the other crons.

import { NextResponse } from "next/server";
import { runRecompute } from "@/app/actions/health-scoring";

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
    const count = await runRecompute("scheduled");
    return NextResponse.json({ ok: true, count });
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
