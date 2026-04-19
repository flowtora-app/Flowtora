import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/tenant";
import { db } from "@/lib/db";
import { resolveRange, resolveBranch } from "@/lib/reports";
import { applyBranchScopeOn } from "@/lib/locations";
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

  const url = new URL(req.url);
  const sp = Object.fromEntries(url.searchParams.entries());
  const range = resolveRange(sp);
  const branch = await resolveBranch(ctx.tenant.id, ctx.branchScope, sp.branch);

  const quoteWhere = applyBranchScopeOn(
    {
      quote: {
        tenantId:  ctx.tenant.id,
        createdAt: { gte: range.from, lte: range.to },
      },
    } as Prisma.QuoteItemWhereInput,
    "quote",
    branch.effectiveScope,
  );

  const orderWhere = applyBranchScopeOn(
    {
      order: {
        tenantId:  ctx.tenant.id,
        createdAt: { gte: range.from, lte: range.to },
        status:    { not: "CANCELED" as const },
      },
    } as Prisma.OrderItemWhereInput,
    "order",
    branch.effectiveScope,
  );

  const [quoteItems, orderItems] = await Promise.all([
    db.quoteItem.findMany({ where: quoteWhere, select: { name: true, productId: true, subtotal: true } }),
    db.orderItem.findMany({ where: orderWhere, select: { name: true, productId: true, subtotal: true } }),
  ]);

  const byName = new Map<string, { name: string; productId: string | null; quoteCount: number; quotedValue: number; orderCount: number; orderedValue: number }>();
  for (const qi of quoteItems) {
    const k = qi.productId ?? qi.name;
    const cur = byName.get(k) ?? { name: qi.name, productId: qi.productId, quoteCount: 0, quotedValue: 0, orderCount: 0, orderedValue: 0 };
    cur.quoteCount++;
    cur.quotedValue += Number(qi.subtotal);
    byName.set(k, cur);
  }
  for (const oi of orderItems) {
    const k = oi.productId ?? oi.name;
    const cur = byName.get(k) ?? { name: oi.name, productId: oi.productId, quoteCount: 0, quotedValue: 0, orderCount: 0, orderedValue: 0 };
    cur.orderCount++;
    cur.orderedValue += Number(oi.subtotal);
    byName.set(k, cur);
  }

  const rows = Array.from(byName.values())
    .sort((a, b) => b.orderedValue - a.orderedValue)
    .map((p) => ({
      "Product": p.name,
      "Type":    p.productId ? "Catalog" : "Ad-hoc",
      "Quote lines":    p.quoteCount,
      "Quoted value":   p.quotedValue.toFixed(2),
      "Order lines":    p.orderCount,
      "Order revenue":  p.orderedValue.toFixed(2),
      "Conversion %":   p.quoteCount > 0 ? Math.round((p.orderCount / p.quoteCount) * 100) : "",
    }));

  const csv = rowsToCsv(
    ["Product", "Type", "Quote lines", "Quoted value", "Order lines", "Order revenue", "Conversion %"],
    rows,
  );
  return csvResponse(`products-${range.label.replace(/\s/g, "-")}.csv`, csv);
}
