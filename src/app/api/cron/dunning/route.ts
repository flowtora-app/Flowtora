import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import type { DunningStage, Prisma } from "@prisma/client";

// Phase 3 follow-up — automated dunning advance.
//
// Runs hourly (configured in vercel.json). For each tenant in the
// dunning funnel (not paused, not RESOLVED), checks how long they've
// been at the current stage and advances them per the same SLA the
// admin UI documents:
//
//   PAYMENT_FAILED → REMINDER_1   after  1 day
//   REMINDER_1     → REMINDER_2   after  2 more days  (3d total)
//   REMINDER_2     → FINAL_NOTICE after  4 more days  (7d total)
//   FINAL_NOTICE   → SUSPEND      after  7 more days  (14d total)
//
// Hitting SUSPEND auto-suspends the tenant. We keep these as
// hours-since-last-event rather than absolute days-from-start so
// pause/resume cycles don't double-count: dunningLastEventAt is the
// reference clock.
//
// Auth pattern matches /api/cron/reminders — `Authorization: Bearer
// <CRON_SECRET>` or `?key=<CRON_SECRET>` so it works from any cron
// runner. Fails closed when CRON_SECRET is unset.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface StageRule {
  from: DunningStage;
  to: DunningStage;
  /** Minimum hours since dunningLastEventAt before advancing. */
  minHoursAtStage: number;
}

const RULES: StageRule[] = [
  { from: "PAYMENT_FAILED", to: "REMINDER_1",   minHoursAtStage: 24 },
  { from: "REMINDER_1",     to: "REMINDER_2",   minHoursAtStage: 48 },
  { from: "REMINDER_2",     to: "FINAL_NOTICE", minHoursAtStage: 96 },
  { from: "FINAL_NOTICE",   to: "SUSPEND",      minHoursAtStage: 168 },
];

const NEXT_FROM: Map<DunningStage, StageRule> = new Map(
  RULES.map((r) => [r.from, r] as const),
);

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

  const now = new Date();

  // Pull every tenant in the funnel that's not paused. We filter the
  // small set in JS because there's no way to express "advance if
  // dunningLastEventAt < now - SLA(stage)" in a single SQL where —
  // the SLA varies by stage.
  const candidates = await db.tenant.findMany({
    where: {
      dunningStage: { notIn: ["NONE", "RESOLVED", "SUSPEND"] },
      dunningPausedAt: null,
    },
    select: {
      id: true, name: true, status: true,
      dunningStage: true, dunningLastEventAt: true, dunningStartedAt: true,
    },
  });

  const advanced: Array<{
    tenantId: string;
    from: DunningStage;
    to: DunningStage;
    suspended: boolean;
  }> = [];

  for (const t of candidates) {
    const rule = NEXT_FROM.get(t.dunningStage);
    if (!rule) continue;
    const lastEvent = t.dunningLastEventAt ?? t.dunningStartedAt;
    if (!lastEvent) continue;
    const hoursSince = (now.getTime() - lastEvent.getTime()) / (60 * 60 * 1000);
    if (hoursSince < rule.minHoursAtStage) continue;

    const sideEffects: Prisma.TenantUpdateInput = {
      dunningStage: rule.to,
      dunningLastEventAt: now,
    };
    let suspended = false;
    if (rule.to === "SUSPEND" && t.status !== "SUSPENDED") {
      sideEffects.status = "SUSPENDED";
      sideEffects.suspensionReason = "Dunning final stage — payment past due (auto-cron).";
      suspended = true;
    }

    await db.tenant.update({ where: { id: t.id }, data: sideEffects });
    advanced.push({ tenantId: t.id, from: t.dunningStage, to: rule.to, suspended });

    // Audit each advance with userId=null since this is the system.
    // logPlatformAudit requires a userId, so we log it as a Tenant-
    // scoped audit row via the catch-all logAudit-like pattern: write
    // directly to AuditLog with no userId. Falls back to a synthetic
    // "system" user we don't actually need to create — auditLog allows
    // null userId at the schema level.
    await db.auditLog.create({
      data: {
        tenantId: t.id,
        userId: null,
        action: "platform.dunning_auto_advanced",
        entityType: "Tenant",
        entityId: t.id,
        metadata: {
          from: t.dunningStage,
          to: rule.to,
          suspended,
          hoursSinceLastEvent: Math.round(hoursSince),
          source: "cron",
        },
      },
    });
  }

  return NextResponse.json({
    ok: true,
    examined: candidates.length,
    advanced: advanced.length,
    transitions: advanced,
    runAt: now.toISOString(),
  });
}

// Sanity poke — admins can hit POST locally to trigger.
export async function POST(req: Request) {
  return GET(req);
}
