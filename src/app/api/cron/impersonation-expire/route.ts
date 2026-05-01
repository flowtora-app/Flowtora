// Impersonation auto-expiry cron — runs every 5 minutes.
//
// Two passes over open ImpersonationSession rows:
//   1. EXPIRED — duration past ImpersonationSettings.maxDurationMin
//   2. IDLE_TIMEOUT — lastActivityAt older than idleTimeoutMin
//
// A third pass prunes audit-log rows older than recordingRetentionDays
// from ended sessions. We don't currently store recordings (only audit
// rows tagged with the session id), so retention = audit prune.

import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { loadImpersonationSettings } from "@/server/platform/impersonation";

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

async function runImpersonationExpire() {
  const settings = await loadImpersonationSettings();
  const now = new Date();

  // Pass 1 — duration cap. Anything started before (now - maxDurationMin)
  // and still open gets auto-closed as EXPIRED.
  const maxDurationCutoff = new Date(now.getTime() - settings.maxDurationMin * 60_000);
  const expired = await db.impersonationSession.updateMany({
    where: { endedAt: null, startedAt: { lt: maxDurationCutoff } },
    data: { endedAt: now, endedReason: "EXPIRED" },
  });

  // Pass 2 — idle timeout. Anything still open with lastActivityAt
  // older than (now - idleTimeoutMin) is closed as IDLE_TIMEOUT.
  // We only consider rows with lastActivityAt set so a brand-new
  // session doesn't get nuked while waiting for its first action.
  const idleCutoff = new Date(now.getTime() - settings.idleTimeoutMin * 60_000);
  const idle = await db.impersonationSession.updateMany({
    where: { endedAt: null, lastActivityAt: { lt: idleCutoff } },
    data: { endedAt: now, endedReason: "IDLE_TIMEOUT" },
  });

  // Pass 3 — retention prune. Drop audit-log rows tagged with sessions
  // that ended longer than recordingRetentionDays ago.
  const retentionCutoff = new Date(now.getTime() - settings.recordingRetentionDays * 86_400_000);
  const retentionTargets = await db.impersonationSession.findMany({
    where: { endedAt: { lt: retentionCutoff }, NOT: { endedAt: null } },
    select: { id: true },
    take: 1_000,
  });
  let pruned = 0;
  if (retentionTargets.length > 0) {
    const result = await db.auditLog.deleteMany({
      where: { impersonationSessionId: { in: retentionTargets.map((r) => r.id) } },
    });
    pruned = result.count;
  }

  return {
    expired: expired.count,
    idleTimedOut: idle.count,
    auditRowsPruned: pruned,
    sessionsTargetedForRetention: retentionTargets.length,
  };
}

export async function GET(req: Request) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const result = await runImpersonationExpire();
    return NextResponse.json({ ok: true, ...result });
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
