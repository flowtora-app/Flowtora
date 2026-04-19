import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/tenant";
import { db } from "@/lib/db";
import { resolveRange, resolveBranch } from "@/lib/reports";
import { applyBranchScope } from "@/lib/locations";
import { rowsToCsv, csvResponse } from "@/lib/csv";
import type { Prisma } from "@prisma/client";

export const runtime = "nodejs";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const ctx = await requirePermission(slug, "reports:view").catch(() => null);
  if (!ctx) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const url  = new URL(req.url);
  const sp   = Object.fromEntries(url.searchParams.entries());
  const range  = resolveRange(sp);
  const branch = await resolveBranch(ctx.tenant.id, ctx.branchScope, sp.branch);

  const where = applyBranchScope({
    tenantId:  ctx.tenant.id,
    createdAt: { gte: range.from, lte: range.to },
    status:    { not: "CANCELED" as const },
  } as Prisma.OrderWhereInput, branch.effectiveScope);

  const orders = await db.order.findMany({
    where,
    select: {
      number: true, status: true, total: true, dueDate: true,
      createdAt: true, completedAt: true,
      productionManagerId: true,
      customer: { select: { name: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  // Resolve production-manager names in one round-trip — scalar userId, no relation.
  const pmIds = Array.from(new Set(orders.map((o) => o.productionManagerId).filter((x): x is string => !!x)));
  const pms = pmIds.length > 0
    ? await db.user.findMany({
        where:  { id: { in: pmIds } },
        select: { id: true, name: true, email: true },
      })
    : [];
  const pmById = new Map(pms.map((u) => [u.id, u] as const));

  const now = new Date();
  const rows = orders.map((o) => {
    const cycleDays = o.completedAt
      ? Math.round((o.completedAt.getTime() - o.createdAt.getTime()) / 86_400_000)
      : null;
    const overdue = o.dueDate && !o.completedAt && o.dueDate < now;
    const pm = o.productionManagerId ? pmById.get(o.productionManagerId) : null;
    return {
      "Order #":      o.number,
      "Customer":     o.customer.name,
      "Status":       o.status,
      "Total":        Number(o.total).toFixed(2),
      "Created":      o.createdAt,
      "Due date":     o.dueDate ?? "",
      "Completed":    o.completedAt ?? "",
      "Cycle days":   cycleDays ?? "",
      "Overdue":      overdue ? "Yes" : "No",
      "Production manager": pm?.name ?? pm?.email ?? "",
    };
  });

  const csv = rowsToCsv(
    ["Order #", "Customer", "Status", "Total", "Created", "Due date", "Completed", "Cycle days", "Overdue", "Production manager"],
    rows,
  );
  return csvResponse(`production-${range.label.replace(/\s/g, "-")}.csv`, csv);
}
