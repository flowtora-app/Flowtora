// GET /api/platform/tenants/recent?since=<iso>
//
// Lightweight poll endpoint for the tenants-list "X new tenants" live
// pill. Returns just the count + a short preview of names since the
// caller's last-seen timestamp.

import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requirePlatformStaff } from "@/lib/platform";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  await requirePlatformStaff();
  const url = new URL(req.url);
  const since = url.searchParams.get("since");
  if (!since) return NextResponse.json({ count: 0, names: [] });
  const d = new Date(since);
  if (Number.isNaN(d.getTime())) return NextResponse.json({ count: 0, names: [] });

  const rows = await db.tenant.findMany({
    where: { createdAt: { gt: d } },
    orderBy: { createdAt: "desc" },
    take: 10,
    select: { id: true, name: true, createdAt: true },
  });
  const count = await db.tenant.count({ where: { createdAt: { gt: d } } });
  return NextResponse.json({
    count,
    names: rows.map((r) => r.name),
    newestCreatedAt: rows[0]?.createdAt.toISOString() ?? null,
  });
}
