// Audit-log retention sweep — daily.
//
// Walks every action key with a custom override and deletes audit
// rows older than its days, then deletes any remaining rows older
// than the default. Skipped entirely when legalHold is set.

import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { loadRetentionPolicy } from "@/server/platform/audit-log";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DAY = 86_400_000;

function isAuthorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const auth = req.headers.get("authorization");
  if (auth === `Bearer ${secret}`) return true;
  const url = new URL(req.url);
  if (url.searchParams.get("key") === secret) return true;
  return false;
}

async function run() {
  const policy = await loadRetentionPolicy();
  if (policy.legalHold) {
    return { ok: true, paused: true };
  }
  const now = Date.now();
  let totalDeleted = 0;
  const perActionDeleted: Record<string, number> = {};

  // Per-action overrides first.
  for (const [action, days] of Object.entries(policy.overrides)) {
    if (typeof days !== "number" || days <= 0) continue;
    const cutoff = new Date(now - days * DAY);
    const res = await db.auditLog.deleteMany({
      where: { action, createdAt: { lt: cutoff } },
    });
    if (res.count > 0) {
      totalDeleted += res.count;
      perActionDeleted[action] = res.count;
    }
  }

  // Default sweep — anything not covered by an override above and
  // older than defaultDays. We use NOT-IN here to skip override
  // actions (they were handled with their own cutoff).
  const defaultCutoff = new Date(now - policy.defaultDays * DAY);
  const overrideKeys = Object.keys(policy.overrides);
  const where = overrideKeys.length === 0
    ? { createdAt: { lt: defaultCutoff } }
    : { createdAt: { lt: defaultCutoff }, action: { notIn: overrideKeys } };
  const defaultRes = await db.auditLog.deleteMany({ where });
  totalDeleted += defaultRes.count;

  return {
    ok: true, paused: false,
    defaultDays: policy.defaultDays,
    totalDeleted, defaultDeleted: defaultRes.count, perActionDeleted,
  };
}

export async function GET(req: Request) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const summary = await run();
    return NextResponse.json(summary);
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
