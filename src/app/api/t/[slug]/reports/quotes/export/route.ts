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
  } as Prisma.QuoteWhereInput, branch.effectiveScope);

  const quotes = await db.quote.findMany({
    where,
    select: {
      number: true, status: true, total: true,
      createdAt: true, sentAt: true, approvedAt: true, declinedAt: true, expiresAt: true,
      salesRepId: true,
      customer: { select: { name: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  // Resolve sales rep names in one round-trip — Quote.salesRepId is a
  // scalar, not a relation, so we can't join it in the main select.
  const repIds = Array.from(new Set(quotes.map((q) => q.salesRepId).filter((x): x is string => !!x)));
  const reps = repIds.length > 0
    ? await db.user.findMany({
        where:  { id: { in: repIds } },
        select: { id: true, name: true, email: true },
      })
    : [];
  const repById = new Map(reps.map((u) => [u.id, u] as const));

  const rows = quotes.map((q) => {
    const rep = q.salesRepId ? repById.get(q.salesRepId) : null;
    return {
      "Quote #":    q.number,
      "Customer":   q.customer.name,
      "Status":     q.status,
      "Total":      Number(q.total).toFixed(2),
      "Created":    q.createdAt,
      "Sent":       q.sentAt ?? "",
      "Approved":   q.approvedAt ?? "",
      "Declined":   q.declinedAt ?? "",
      "Expires":    q.expiresAt ?? "",
      "Sales rep":  rep?.name ?? rep?.email ?? "",
    };
  });

  const csv = rowsToCsv(
    ["Quote #", "Customer", "Status", "Total", "Created", "Sent", "Approved", "Declined", "Expires", "Sales rep"],
    rows,
  );
  return csvResponse(`quotes-${range.label.replace(/\s/g, "-")}.csv`, csv);
}
