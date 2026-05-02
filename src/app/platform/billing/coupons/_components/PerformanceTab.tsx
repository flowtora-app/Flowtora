import { formatMoney } from "@/lib/billing-currency";
import type { CouponDiscountType, CouponStatus } from "@prisma/client";

// Page 20 — Code Performance tab.
//
// Ranks every coupon by redemption count + $ discounted + unique
// tenant count. Conversion-lift requires a marketing experiment
// pipeline we don't have yet — flagged honestly inline.

export interface PerformanceRow {
  id: string;
  code: string;
  name: string | null;
  status: CouponStatus;
  discountType: CouponDiscountType;
  amount: number;
  currency: string | null;
  cap: number | null;
  validUntil: Date | null;
  createdAt: Date;
  redemptions: number;
  discountedTotal: number;
  uniqueTenants: number;
}

function discountLabel(r: PerformanceRow): string {
  if (r.discountType === "PERCENT") return `${r.amount}% off`;
  return `${formatMoney(r.amount, r.currency ?? "USD")} off`;
}

export function PerformanceTab({ rows }: { rows: PerformanceRow[] }) {
  const totalRedemptions = rows.reduce((acc, r) => acc + r.redemptions, 0);
  const totalDiscounted = rows.reduce((acc, r) => acc + r.discountedTotal, 0);
  const totalUniqueTenants = rows.reduce((acc, r) => acc + r.uniqueTenants, 0);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Kpi label="Codes ranked"      value={String(rows.length)} />
        <Kpi label="Total redemptions" value={String(totalRedemptions)} />
        <Kpi label="Total discounted"  value={totalDiscounted > 0 ? formatMoney(totalDiscounted, "USD") : "—"} />
        <Kpi label="Unique redeemers"  value={String(totalUniqueTenants)} />
      </div>

      <section className="rounded-lg border" style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)" }}>
        <div className="border-b px-4 py-3" style={{ borderColor: "var(--border-subtle)" }}>
          <h2 className="text-[14px] font-semibold" style={{ color: "var(--text-default)" }}>
            Coupons by redemptions
          </h2>
          <p className="text-[12px]" style={{ color: "var(--text-muted)" }}>
            Sorted by redemption count, then $ discounted. Lifetime totals — no period filter yet.
          </p>
        </div>

        {rows.length === 0 ? (
          <div className="px-4 py-8 text-center text-[13px]" style={{ color: "var(--text-muted)" }}>
            No coupons yet.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead style={{ color: "var(--text-muted)", background: "var(--surface-2)" }}>
                <tr className="text-left">
                  <th className="px-4 py-2 font-medium">Code</th>
                  <th className="px-4 py-2 font-medium">Name</th>
                  <th className="px-4 py-2 font-medium">Discount</th>
                  <th className="px-4 py-2 font-medium">Status</th>
                  <th className="px-4 py-2 text-right font-medium">Redemptions</th>
                  <th className="px-4 py-2 text-right font-medium">Tenants</th>
                  <th className="px-4 py-2 text-right font-medium">$ discounted</th>
                  <th className="px-4 py-2 font-medium">Window</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const capped = r.cap != null && r.redemptions >= r.cap;
                  return (
                    <tr key={r.id} style={{ borderTop: "1px solid var(--border-subtle)" }}>
                      <td className="px-4 py-2">
                        <code
                          className="rounded px-1.5 py-0.5 text-[12px] font-semibold"
                          style={{ background: "var(--surface-2)", color: "var(--text-default)", border: "1px solid var(--border-subtle)" }}
                        >
                          {r.code}
                        </code>
                      </td>
                      <td className="px-4 py-2" style={{ color: "var(--text-default)" }}>
                        {r.name ?? <span style={{ color: "var(--text-faint)" }}>—</span>}
                      </td>
                      <td className="px-4 py-2 tabular-nums" style={{ color: "var(--text-default)" }}>
                        {discountLabel(r)}
                      </td>
                      <td className="px-4 py-2">
                        <StatusChip status={r.status} />
                      </td>
                      <td className="px-4 py-2 text-right tabular-nums" style={{ color: "var(--text-default)" }}>
                        {r.redemptions}
                        {r.cap != null && (
                          <span style={{ color: capped ? "var(--rose-700)" : "var(--text-muted)" }}> / {r.cap}</span>
                        )}
                      </td>
                      <td className="px-4 py-2 text-right tabular-nums" style={{ color: "var(--text-default)" }}>
                        {r.uniqueTenants}
                      </td>
                      <td className="px-4 py-2 text-right tabular-nums" style={{ color: "var(--text-default)" }}>
                        {r.discountedTotal > 0
                          ? formatMoney(r.discountedTotal, r.currency ?? "USD")
                          : <span style={{ color: "var(--text-faint)" }}>—</span>}
                      </td>
                      <td className="px-4 py-2 text-[12px]" style={{ color: "var(--text-muted)" }}>
                        {r.createdAt.toLocaleDateString()}
                        {r.validUntil ? ` → ${r.validUntil.toLocaleDateString()}` : ""}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <div
        className="rounded-md border px-3 py-2 text-[11px]"
        style={{ borderColor: "var(--amber-200)", background: "var(--amber-50)", color: "var(--amber-700)" }}
      >
        <strong>Conversion lift</strong> isn&apos;t computed here yet — it requires a control-vs-treatment
        funnel that we don&apos;t track. The numbers above are honest lifetime aggregates from
        <span className="font-mono"> CouponRedemption</span>.
      </div>
    </div>
  );
}

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border px-4 py-3"
         style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)" }}>
      <div className="text-[11px] font-medium uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>
        {label}
      </div>
      <div className="mt-1 text-[22px] font-semibold leading-none" style={{ color: "var(--text-default)" }}>
        {value}
      </div>
    </div>
  );
}

function StatusChip({ status }: { status: CouponStatus }) {
  const palette =
    status === "ACTIVE"   ? { bg: "var(--accent-surface)",  fg: "var(--accent-primary)", label: "ACTIVE" } :
    status === "DRAFT"    ? { bg: "var(--surface-2)",       fg: "var(--text-muted)",     label: "DRAFT" } :
    status === "EXPIRED"  ? { bg: "var(--danger-surface)",  fg: "var(--danger-fg)",      label: "EXPIRED" } :
    status === "ARCHIVED" ? { bg: "var(--surface-2)",       fg: "var(--text-faint)",     label: "ARCHIVED" } :
                            { bg: "var(--warning-surface)", fg: "var(--warning-fg)",     label: status };
  return (
    <span
      className="rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
      style={{ background: palette.bg, color: palette.fg, border: `1px solid ${palette.fg}` }}
    >
      {palette.label}
    </span>
  );
}
