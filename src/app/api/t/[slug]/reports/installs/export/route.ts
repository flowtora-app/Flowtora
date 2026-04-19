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
    tenantId:       ctx.tenant.id,
    scheduledStart: { gte: range.from, lte: range.to },
  } as Prisma.InstallEventWhereInput, branch.effectiveScope);

  const events = await db.installEvent.findMany({
    where,
    select: {
      title:          true,
      kind:           true,
      status:         true,
      scheduledStart: true,
      scheduledEnd:   true,
      arrivedAt:      true,
      completedAt:    true,
      canceledAt:     true,
      cancelReason:   true,
      installerId:    true,
      addressLine1:   true,
      city:           true,
      region:         true,
      postalCode:     true,
      customer: { select: { name: true } },
      order:    { select: { number: true } },
    },
    orderBy: { scheduledStart: "desc" },
  });

  const memberMap = await memberLookup(ctx.tenant.id);

  const rows = events.map((e) => {
    const cityLine = [e.city, e.region, e.postalCode].filter(Boolean).join(", ");
    const address  = [e.addressLine1, cityLine].filter(Boolean).join(" · ");
    const installer = e.installerId
      ? (memberMap.get(e.installerId)?.name ?? memberMap.get(e.installerId)?.email ?? e.installerId)
      : "";
    return {
      "Order #":        e.order.number,
      "Customer":       e.customer.name,
      "Title":          e.title ?? "",
      "Kind":           e.kind,
      "Status":         e.status,
      "Scheduled":      e.scheduledStart,
      "Scheduled end":  e.scheduledEnd,
      "Arrived":        e.arrivedAt   ?? "",
      "Completed":      e.completedAt ?? "",
      "Canceled":       e.canceledAt  ?? "",
      "Cancel reason":  e.cancelReason ?? "",
      "Installer":      installer,
      "Address":        address,
    };
  });

  const csv = rowsToCsv(
    ["Order #", "Customer", "Title", "Kind", "Status", "Scheduled", "Scheduled end", "Arrived", "Completed", "Canceled", "Cancel reason", "Installer", "Address"],
    rows,
  );
  return csvResponse(`installs-${range.label.replace(/\s/g, "-")}.csv`, csv);
}
