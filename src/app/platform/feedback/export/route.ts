import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requirePlatformStaff, logPlatformAudit } from "@/lib/platform";
import type { FeedbackKind, Prisma } from "@prisma/client";

// Phase 19 — CSV export for the platform feedback aggregator. Mirrors the
// filter shape of /platform/feedback so a staffer can tune the view and
// download exactly what they see. Gated to platform staff only; the
// request is logged through logPlatformAudit so downloads leave a trail.

const KIND_OPTIONS   = ["ALL", "IDEA", "BUG", "PRAISE", "OTHER"] as const;
const RATING_OPTIONS = ["ALL", "5", "4", "3", "2", "1"] as const;

export async function GET(req: Request) {
  const ctx = await requirePlatformStaff();
  const url = new URL(req.url);

  const q = (url.searchParams.get("q") ?? "").trim();
  const kindRaw   = (url.searchParams.get("kind")   ?? "ALL").toUpperCase();
  const ratingRaw = (url.searchParams.get("rating") ?? "ALL").toUpperCase();
  const kind   = (KIND_OPTIONS   as readonly string[]).includes(kindRaw)   ? kindRaw   : "ALL";
  const rating = (RATING_OPTIONS as readonly string[]).includes(ratingRaw) ? ratingRaw : "ALL";
  const tenantId = (url.searchParams.get("tenantId") ?? "").trim() || null;
  const days = Math.max(0, Math.min(365, Number(url.searchParams.get("days") ?? "") || 0));

  const where: Prisma.FeedbackWhereInput = {};
  if (kind !== "ALL")   where.kind = kind as FeedbackKind;
  if (rating !== "ALL") where.rating = Number(rating);
  if (tenantId)         where.tenantId = tenantId;
  if (days > 0) {
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    where.createdAt = { gte: since };
  }
  if (q) {
    where.OR = [
      { summary: { contains: q, mode: "insensitive" } },
      { body:    { contains: q, mode: "insensitive" } },
    ];
  }

  const items = await db.feedback.findMany({
    where,
    orderBy: [{ createdAt: "desc" }],
    take: 5000,
  });

  const tenantIds = Array.from(new Set(items.map((f) => f.tenantId)));
  const userIds   = Array.from(new Set(items.map((f) => f.userId)));
  const [tenants, users] = await Promise.all([
    tenantIds.length
      ? db.tenant.findMany({
          where:  { id: { in: tenantIds } },
          select: { id: true, name: true, slug: true },
        })
      : Promise.resolve([] as { id: string; name: string; slug: string }[]),
    userIds.length
      ? db.user.findMany({
          where:  { id: { in: userIds } },
          select: { id: true, email: true, name: true },
        })
      : Promise.resolve([] as { id: string; email: string; name: string | null }[]),
  ]);
  const tenantById = new Map(tenants.map((t) => [t.id, t]));
  const userById   = new Map(users.map((u) => [u.id, u]));

  const header = [
    "createdAt", "kind", "rating", "summary", "body", "context",
    "tenantId", "tenantSlug", "tenantName", "userId", "userEmail", "userName",
  ];
  const rows = items.map((f) => {
    const t = tenantById.get(f.tenantId);
    const u = userById.get(f.userId);
    return [
      f.createdAt.toISOString(),
      f.kind,
      f.rating ?? "",
      f.summary,
      f.body ?? "",
      f.context ?? "",
      f.tenantId,
      t?.slug ?? "",
      t?.name ?? "",
      f.userId,
      u?.email ?? "",
      u?.name ?? "",
    ];
  });

  const csv = [header, ...rows].map((row) => row.map(csvCell).join(",")).join("\r\n");

  await logPlatformAudit({
    userId:     ctx.userId,
    tenantId:   tenantId ?? undefined,
    action:     "platform.feedback_exported",
    entityType: "Feedback",
    metadata: {
      actor: ctx.email,
      rowCount: items.length,
      filters: { q, kind, rating, tenantId, days },
    },
  });

  const filename = `feedback-${new Date().toISOString().slice(0, 10)}.csv`;
  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type":        "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control":       "no-store",
    },
  });
}

function csvCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  const s = String(value);
  // Always quote — simpler to reason about than "only when needed", and
  // Excel/Sheets handle it correctly either way.
  return `"${s.replace(/"/g, '""')}"`;
}
