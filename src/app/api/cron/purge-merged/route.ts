import { NextResponse } from "next/server";
import { db } from "@/lib/db";

// Phase 4 follow-up — hard-delete merged users after a 90-day grace.
//
// Why a grace window: a merge is reversible in spirit but not always in
// fact (memberships moved, sessions revoked). 90 days is long enough
// that compliance-driven undo requests get caught; short enough that
// dead rows don't pile up indefinitely.
//
// What survives: AuditLog, comments, portal messages, and other rows
// whose author was the source user — those keep the original userId
// for forensic value. The schema's onDelete relations decide what
// cascades; this route relies on those defaults rather than a hand-
// rolled cascade list (which would drift).
//
// Runs daily (vercel.json). Auth same as /api/cron/dunning.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const GRACE_DAYS = 90;

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
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const cutoff = new Date(Date.now() - GRACE_DAYS * 24 * 60 * 60 * 1000);

  // Pull candidates first so we can audit before deletion.
  const candidates = await db.user.findMany({
    where: {
      mergedIntoId: { not: null },
      mergedAt: { lt: cutoff },
    },
    select: { id: true, email: true, mergedIntoId: true, mergedAt: true },
    take: 200,  // cap per run; if there's a backlog the next day will pick up the rest
  });

  const purged: { userId: string; email: string }[] = [];
  for (const u of candidates) {
    // Audit BEFORE delete — the AuditLog row itself uses tenantId=null
    // and userId=null (system action). The merged user's id is captured
    // in metadata for forensic searches.
    await db.auditLog.create({
      data: {
        tenantId: null,
        userId: null,
        action: "platform.merged_user_purged",
        entityType: "User",
        entityId: u.id,
        metadata: {
          purgedEmail: u.email,
          mergedIntoId: u.mergedIntoId,
          mergedAt: u.mergedAt?.toISOString(),
          source: "cron",
          graceDays: GRACE_DAYS,
        },
      },
    });

    try {
      // Cascade is governed by the schema's onDelete relations (see
      // User → memberships, sessions, accounts, etc.). If a relation
      // is `Restrict`, the delete will throw and we move on; the row
      // sticks around for next run after the operator clears whatever
      // is blocking it.
      await db.user.delete({ where: { id: u.id } });
      purged.push({ userId: u.id, email: u.email });
    } catch (err) {
      await db.auditLog.create({
        data: {
          tenantId: null,
          userId: null,
          action: "platform.merged_user_purge_failed",
          entityType: "User",
          entityId: u.id,
          metadata: {
            error: (err as Error).message ?? String(err),
            source: "cron",
          },
        },
      });
    }
  }

  return NextResponse.json({
    ok: true,
    examined: candidates.length,
    purged: purged.length,
    cutoff: cutoff.toISOString(),
  });
}

export async function POST(req: Request) {
  return GET(req);
}
