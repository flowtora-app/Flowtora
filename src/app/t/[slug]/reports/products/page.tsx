import Link from "next/link";
import { requirePermission } from "@/lib/tenant";
import { db } from "@/lib/db";
import { Card, CardHeader } from "@/components/Card";
import { RangePicker, Stat, Bar } from "@/components/Reports";
import { resolveRange, resolveBranch, reportQueryString, chooseBucketGranularity, bucketKey, buildTrendSeries } from "@/lib/reports";
import { TrendChart, type TrendPoint } from "@/components/charts/TrendChart";
import { applyBranchScopeOn } from "@/lib/locations";
import { formatMoney } from "@/lib/format";
import type { Prisma } from "@prisma/client";

// Products & services report — Phase 17.
//
// Answers: which products/services drive the most revenue?
// Which are quoted most often? Which convert best from quote to order?
// Data source: QuoteItems (for quoting frequency) and OrderItems (for
// fulfilled revenue), both within the selected date range.

export default async function ProductsReportPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ range?: string; from?: string; to?: string; branch?: string }>;
}) {
  const { slug } = await params;
  const sp = await searchParams;
  const ctx = await requirePermission(slug, "reports:view");
  const range = resolveRange(sp);
  const branch = await resolveBranch(ctx.tenant.id, ctx.branchScope, sp.branch);
  const currency = ctx.tenant.currency;
  const qs = reportQueryString(range, branch);

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

  // Load all quote and order items in range.
  // We group by name (snapshot) rather than productId so ad-hoc items
  // and renamed-catalog items both appear meaningfully.
  const [quoteItems, orderItems] = await Promise.all([
    db.quoteItem.findMany({
      where: quoteWhere,
      select: {
        name: true, productId: true, subtotal: true,
        quote: { select: { createdAt: true } },
      },
    }),
    db.orderItem.findMany({
      where: orderWhere,
      select: {
        name: true, productId: true, subtotal: true,
        order: { select: { createdAt: true, status: true } },
      },
    }),
  ]);

  // Group quote items by name → { quoteCount, quotedValue }.
  type ProductRow = {
    name: string;
    productId: string | null;
    quoteCount:  number;
    quotedValue: number;
    orderCount:  number;
    orderedValue: number;
  };

  const byName = new Map<string, ProductRow>();

  for (const qi of quoteItems) {
    const key = qi.productId ?? qi.name;
    const cur = byName.get(key) ?? {
      name: qi.name, productId: qi.productId,
      quoteCount: 0, quotedValue: 0, orderCount: 0, orderedValue: 0,
    };
    cur.quoteCount   += 1;
    cur.quotedValue  += Number(qi.subtotal);
    byName.set(key, cur);
  }
  for (const oi of orderItems) {
    const key = oi.productId ?? oi.name;
    const cur = byName.get(key) ?? {
      name: oi.name, productId: oi.productId,
      quoteCount: 0, quotedValue: 0, orderCount: 0, orderedValue: 0,
    };
    cur.orderCount   += 1;
    cur.orderedValue += Number(oi.subtotal);
    byName.set(key, cur);
  }

  const products = Array.from(byName.values())
    .sort((a, b) => b.orderedValue - a.orderedValue);

  const topByRevenue = products.slice(0, 15);
  const topByQuotes  = [...products].sort((a, b) => b.quoteCount - a.quoteCount).slice(0, 10);

  const totalOrderedValue = products.reduce((s, p) => s + p.orderedValue, 0);
  const totalOrderCount   = products.reduce((s, p) => s + p.orderCount, 0);
  const totalQuoteCount   = products.reduce((s, p) => s + p.quoteCount, 0);

  // Revenue trend by product (top 5 by revenue over time).
  const top5 = topByRevenue.slice(0, 5);
  const top5Keys = new Set(top5.map((p) => p.productId ?? p.name));
  const granularity = chooseBucketGranularity(range.from, range.to);
  const seriesBuckets = new Map<string, Map<string, number>>();
  for (const p of top5) seriesBuckets.set(p.productId ?? p.name, new Map());
  for (const oi of orderItems) {
    const key = oi.productId ?? oi.name;
    if (!top5Keys.has(key)) continue;
    const bk = bucketKey(oi.order.createdAt, granularity);
    const m = seriesBuckets.get(key)!;
    m.set(bk, (m.get(bk) ?? 0) + Number(oi.subtotal));
  }
  const trendAllBuckets = buildTrendSeries(range.from, range.to, granularity, new Map());
  const trendData: TrendPoint[] = trendAllBuckets.map((pt) => {
    const row: TrendPoint = { label: pt.label };
    for (const p of top5) {
      const k = p.productId ?? p.name;
      row[p.name] = seriesBuckets.get(k)?.get(pt.key) ?? 0;
    }
    return row;
  });

  const COLORS = ["#3b82f6", "#10b981", "#f59e0b", "#8b5cf6", "#ef4444"];

  return (
    <div className="space-y-6">
      <div className="text-sm">
        <Link href={`/t/${slug}/reports`} className="underline" style={{ color: "var(--muted)" }}>
          ← Reports
        </Link>
      </div>

      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Products &amp; services</h1>
          <p className="mt-1 text-sm" style={{ color: "var(--muted)" }}>
            Which products drive the most revenue and quoting volume in {range.label}.
          </p>
        </div>
        <a
          href={`/api/t/${slug}/reports/products/export?${qs}`}
          className="rounded-md px-3 py-1.5 text-xs font-medium"
          style={{ border: "1px solid var(--border)", color: "var(--text)" }}
        >
          Export CSV
        </a>
      </div>

      <RangePicker range={range} basePath={`/t/${slug}/reports/products`} branch={branch} />

      {/* Headline stats */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <Stat label="Unique products" value={String(products.length)} />
        <Stat label="Total order value" value={formatMoney(totalOrderedValue, currency)} sub={`${totalOrderCount} order lines`} />
        <Stat label="Total quoted value" value={formatMoney(products.reduce((s, p) => s + p.quotedValue, 0), currency)} sub={`${totalQuoteCount} quote lines`} />
        <Stat
          label="Top product revenue"
          value={topByRevenue[0] ? formatMoney(topByRevenue[0].orderedValue, currency) : "—"}
          sub={topByRevenue[0]?.name}
        />
      </div>

      {/* Revenue trend for top 5 */}
      {top5.length > 0 && (
        <Card>
          <CardHeader
            title="Revenue trend — top 5 products"
            description={`Order value by ${granularity} for the five highest-revenue products.`}
          />
          <div className="px-5 pb-5 pt-3">
            <TrendChart
              data={trendData}
              series={top5.map((p, i) => ({
                key: p.name,
                label: p.name,
                color: COLORS[i % COLORS.length],
              }))}
              valuePrefix={currency === "USD" ? "$" : ""}
              height={220}
            />
          </div>
        </Card>
      )}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {/* Top by revenue */}
        <Card>
          <CardHeader
            title="Top products by order revenue"
            description="Fulfilled order line value in range."
          />
          {topByRevenue.length === 0 ? (
            <p className="px-5 py-4 text-sm" style={{ color: "var(--muted)" }}>
              No order items in range.
            </p>
          ) : (
            <div className="space-y-3 px-5 py-4">
              {topByRevenue.map((p) => (
                <div key={p.productId ?? p.name}>
                  <Bar
                    label={p.name}
                    value={p.orderedValue}
                    max={Math.max(1, topByRevenue[0]?.orderedValue ?? 1)}
                    meta={`${formatMoney(p.orderedValue, currency)} · ${p.orderCount} orders`}
                  />
                  {p.productId && (
                    <div className="mt-0.5 pl-0 text-[10px]" style={{ color: "var(--muted)" }}>
                      <Link href={`/t/${slug}/products/${p.productId}`} className="underline">
                        View product
                      </Link>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* Top by quote frequency */}
        <Card>
          <CardHeader
            title="Most-quoted products"
            description="How often each product appears in quotes (indicates sales intent)."
          />
          {topByQuotes.length === 0 ? (
            <p className="px-5 py-4 text-sm" style={{ color: "var(--muted)" }}>
              No quote items in range.
            </p>
          ) : (
            <div className="space-y-3 px-5 py-4">
              {topByQuotes.map((p) => (
                <Bar
                  key={p.productId ?? p.name}
                  label={p.name}
                  value={p.quoteCount}
                  max={Math.max(1, topByQuotes[0]?.quoteCount ?? 1)}
                  meta={`${p.quoteCount} quotes · ${formatMoney(p.quotedValue, currency)} value`}
                  color="#8b5cf6"
                />
              ))}
            </div>
          )}
        </Card>
      </div>

      {/* Full product table */}
      <Card>
        <CardHeader
          title="All products"
          description="Every product/service with activity in the selected range."
        />
        {products.length === 0 ? (
          <p className="px-5 py-4 text-sm" style={{ color: "var(--muted)" }}>
            No product activity in this range.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr style={{ borderBottom: "1px solid var(--border)" }}>
                  {["Product / service", "Quotes", "Quoted value", "Orders", "Order revenue", "Conversion"].map((h) => (
                    <th
                      key={h}
                      className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide"
                      style={{ color: "var(--muted)" }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y" style={{ borderColor: "var(--border)" }}>
                {products.map((p) => {
                  const convRate = p.quoteCount > 0
                    ? Math.round((p.orderCount / p.quoteCount) * 100)
                    : null;
                  return (
                    <tr key={p.productId ?? p.name} className="hover:bg-opacity-50" style={{ transition: "background 0.1s" }}>
                      <td className="px-5 py-3 font-medium">
                        {p.productId ? (
                          <Link href={`/t/${slug}/products/${p.productId}`} className="underline">
                            {p.name}
                          </Link>
                        ) : (
                          <span style={{ color: "var(--muted)" }}>{p.name} <span className="text-[10px]">(ad-hoc)</span></span>
                        )}
                      </td>
                      <td className="px-5 py-3 tabular-nums">{p.quoteCount}</td>
                      <td className="px-5 py-3 tabular-nums">{formatMoney(p.quotedValue, currency)}</td>
                      <td className="px-5 py-3 tabular-nums">{p.orderCount}</td>
                      <td className="px-5 py-3 tabular-nums font-medium">{formatMoney(p.orderedValue, currency)}</td>
                      <td className="px-5 py-3 tabular-nums">
                        {convRate === null ? "—" : (
                          <span style={{ color: convRate >= 50 ? "#10b981" : convRate >= 25 ? "#f59e0b" : "#ef4444" }}>
                            {convRate}%
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
