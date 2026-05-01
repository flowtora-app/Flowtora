// Audit webhook delivery cron — runs every 5 minutes.
//
// For each ACTIVE subscription, finds audit rows newer than the
// subscription's `lastDeliveredAt` (or last 5 minutes for fresh
// subscriptions) that match the action filter + minSeverity, then
// POSTs each one to the destination URL with an HMAC signature.
//
// Caps per-run at 200 rows per subscription so a misconfigured
// destination can't tie the cron up indefinitely.

import { NextResponse } from "next/server";
import { createHmac } from "node:crypto";
import { db } from "@/lib/db";
import { Prisma } from "@prisma/client";
import type { AuditSeverity } from "@prisma/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SEVERITY_RANK: Record<AuditSeverity, number> = {
  INFO: 0, WARNING: 1, CRITICAL: 2,
};

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
  const subs = await db.auditWebhookSubscription.findMany({
    where: { active: true },
  });
  let totalDelivered = 0;
  let totalFailed = 0;
  const summary: { id: string; name: string; delivered: number; failed: number }[] = [];

  for (const sub of subs) {
    const since = sub.lastDeliveredAt ?? new Date(Date.now() - 5 * 60_000);
    const where: Prisma.AuditLogWhereInput = {
      createdAt: { gt: since },
    };
    // Severity filter.
    const minRank = SEVERITY_RANK[sub.minSeverity];
    if (minRank > 0) {
      where.severity = minRank === 1 ? { in: ["WARNING", "CRITICAL"] } : "CRITICAL";
    }
    // Action filter (CSV or "*").
    if (sub.actionFilter && sub.actionFilter !== "*") {
      const list = sub.actionFilter.split(",").map((s) => s.trim()).filter(Boolean);
      if (list.length > 0) where.action = { in: list };
    }
    const rows = await db.auditLog.findMany({
      where,
      orderBy: { createdAt: "asc" },
      take: 200,
      select: {
        id: true, action: true, severity: true, success: true,
        source: true, userId: true, tenantId: true,
        entityType: true, entityId: true, ipAddress: true,
        metadata: true, createdAt: true, hash: true, prevHash: true,
      },
    });

    let delivered = 0;
    let failed = 0;
    let lastDeliveredAt: Date | null = null;
    let lastFailureReason: string | null = null;

    for (const r of rows) {
      const payload = {
        id: r.id, createdAt: r.createdAt.toISOString(),
        action: r.action, severity: r.severity, success: r.success,
        source: r.source,
        actorId: r.userId, tenantId: r.tenantId,
        entityType: r.entityType, entityId: r.entityId,
        ipAddress: r.ipAddress, metadata: r.metadata ?? null,
        hash: r.hash, prevHash: r.prevHash,
      };
      const body = JSON.stringify(payload);
      const signature = createHmac("sha256", sub.secret).update(body).digest("hex");
      let status: number | null = null;
      let responseText = "";
      let succeeded = false;
      let failureReason: string | null = null;
      try {
        const res = await fetch(sub.url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Flowtora-Signature": `sha256=${signature}`,
            "X-Flowtora-Event-Id": r.id,
          },
          body,
          signal: AbortSignal.timeout(8_000),
        });
        status = res.status;
        responseText = (await res.text()).slice(0, 512);
        succeeded = res.ok;
        if (!succeeded) failureReason = `HTTP ${res.status}`;
      } catch (err) {
        failureReason = err instanceof Error ? err.message : "Unknown error";
      }

      await db.auditWebhookDelivery.create({
        data: {
          subscriptionId: sub.id,
          auditId: r.id,
          responseStatus: status,
          responseBody: responseText || null,
          succeeded,
          attempt: 1,
        },
      });
      if (succeeded) {
        delivered += 1;
        lastDeliveredAt = r.createdAt;
      } else {
        failed += 1;
        lastFailureReason = failureReason;
      }
    }

    if (delivered > 0 || failed > 0) {
      await db.auditWebhookSubscription.update({
        where: { id: sub.id },
        data: {
          totalDelivered: { increment: delivered },
          totalFailed: { increment: failed },
          ...(lastDeliveredAt ? { lastDeliveredAt } : {}),
          ...(failed > 0 ? { lastFailureAt: new Date(), lastFailureReason } : {}),
        },
      });
    }
    totalDelivered += delivered;
    totalFailed += failed;
    summary.push({ id: sub.id, name: sub.name, delivered, failed });
  }

  return { ok: true, totalDelivered, totalFailed, subscriptions: summary };
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
