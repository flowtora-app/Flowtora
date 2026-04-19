import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/tenant";
import { db } from "@/lib/db";
import { resolveRange, resolveBranch } from "@/lib/reports";
import { applyBranchScope } from "@/lib/locations";
import { memberLookup } from "@/lib/members";
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
    updatedAt: { gte: range.from, lte: range.to },
  } as Prisma.CustomerWhereInput, branch.effectiveScope);

  const customers = await db.customer.findMany({
    where,
    select: {
      name:             true,
      kind:             true,
      stage:            true,
      estimatedValue:   true,
      closeProbability: true,
      source:           true,
      lostReason:       true,
      ownerId:          true,
      email:            true,
      phone:            true,
      createdAt:        true,
      updatedAt:        true,
    },
    orderBy: { updatedAt: "desc" },
  });

  const memberMap = await memberLookup(ctx.tenant.id);

  const rows = customers.map((c) => {
    const owner = c.ownerId
      ? (memberMap.get(c.ownerId)?.name ?? memberMap.get(c.ownerId)?.email ?? c.ownerId)
      : "";
    return {
      "Customer":       c.name,
      "Kind":           c.kind,
      "Stage":          c.stage,
      "Est. value":     c.estimatedValue != null ? Number(c.estimatedValue).toFixed(2) : "",
      "Close %":        c.closeProbability ?? "",
      "Source":         c.source ?? "",
      "Lost reason":    c.lostReason ?? "",
      "Owner":          owner,
      "Email":          c.email ?? "",
      "Phone":          c.phone ?? "",
      "Created":        c.createdAt,
      "Last activity":  c.updatedAt,
    };
  });

  const csv = rowsToCsv(
    ["Customer", "Kind", "Stage", "Est. value", "Close %", "Source", "Lost reason", "Owner", "Email", "Phone", "Created", "Last activity"],
    rows,
  );
  return csvResponse(`pipeline-${range.label.replace(/\s/g, "-")}.csv`, csv);
}
