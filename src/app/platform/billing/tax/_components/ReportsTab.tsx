import Link from "next/link";
import type {
  ReverseChargeRow,
  RefundsAdjustmentsRow,
  TaxByJurisdictionRow,
  TaxByMonthRow,
  TaxExemptSalesRow,
  TaxReportPeriod,
} from "@/server/platform/tax-reports";

// Page 21 — Tax Reports tab.

const fmt = (cents: number) => cents === 0
  ? "—"
  : `$${(cents / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function dateToInput(d: Date | null): string {
  if (!d) return "";
  return d.toISOString().slice(0, 10);
}

export function ReportsTab({
  period, byJurisdiction, byMonth, exemptSales, reverseCharge, refundsAdj,
}: {
  period: TaxReportPeriod;
  byJurisdiction: TaxByJurisdictionRow[];
  byMonth: TaxByMonthRow[];
  exemptSales: TaxExemptSalesRow[];
  reverseCharge: ReverseChargeRow[];
  refundsAdj: RefundsAdjustmentsRow[];
}) {
  const totalCollected = byJurisdiction.reduce((acc, r) => acc + r.taxCollected, 0);
  const totalSales = byJurisdiction.reduce((acc, r) => acc + r.taxableSales, 0);

  return (
    <div className="space-y-6">
      <PeriodForm period={period} />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Kpi label="Tax collected" value={fmt(totalCollected)} />
        <Kpi label="Taxable sales" value={fmt(totalSales)} />
        <Kpi label="Jurisdictions" value={String(byJurisdiction.length)} />
        <Kpi label="Reverse-charge tenants" value={String(reverseCharge.length)} />
      </div>

      <Section title="Tax collected by jurisdiction"
               exportHref={`/api/platform/billing/tax/export?report=jurisdiction${qs(period)}`}>
        <BasicTable
          headers={["Jurisdiction", "Invoices", "Taxable sales", "Tax collected"]}
          rows={byJurisdiction.map((r) => [
            r.jurisdiction,
            r.invoices.toLocaleString(),
            fmt(r.taxableSales),
            fmt(r.taxCollected),
          ])}
          rightAlign={[1, 2, 3]}
          emptyMsg="No taxable invoices in this period."
        />
      </Section>

      <Section title="Tax collected by month (last 12)"
               exportHref="/api/platform/billing/tax/export?report=month">
        <BasicTable
          headers={["Month", "Invoices", "Taxable sales", "Tax collected"]}
          rows={byMonth.map((r) => [
            r.month,
            r.invoices.toLocaleString(),
            fmt(r.taxableSales),
            fmt(r.taxCollected),
          ])}
          rightAlign={[1, 2, 3]}
          emptyMsg="No taxable invoices in the last 12 months."
        />
      </Section>

      <Section title="Tax-exempt sales"
               exportHref={`/api/platform/billing/tax/export?report=exempt${qs(period)}`}>
        <BasicTable
          headers={["Tenant", "Type", "Invoices", "Taxable sales", "Tax waived"]}
          rows={exemptSales.map((r) => [
            r.tenantName,
            r.exemptionType,
            r.invoices.toLocaleString(),
            fmt(r.taxableSales),
            fmt(r.taxWaived),
          ])}
          rightAlign={[2, 3, 4]}
          emptyMsg="No verified-exempt tenants have invoices in this period."
        />
      </Section>

      <Section title="Reverse-charge sales (EU B2B)"
               exportHref={`/api/platform/billing/tax/export?report=reverse${qs(period)}`}>
        <BasicTable
          headers={["Tenant", "Jurisdictions", "Invoices", "Net sales"]}
          rows={reverseCharge.map((r) => [
            r.tenantName,
            r.jurisdictions.length === 0 ? "All" : r.jurisdictions.join(", "),
            r.invoices.toLocaleString(),
            fmt(r.netSales),
          ])}
          rightAlign={[2, 3]}
          emptyMsg="No reverse-charge tenants with invoices in this period."
        />
      </Section>

      <Section title="Refunds & adjustments"
               exportHref={`/api/platform/billing/tax/export?report=refunds${qs(period)}`}>
        <BasicTable
          headers={["Jurisdiction", "Refunds", "Refunded tax", "Voided", "Uncollectible"]}
          rows={refundsAdj.map((r) => [
            r.jurisdiction,
            r.refunds.toLocaleString(),
            fmt(r.refundedTax),
            r.voided.toLocaleString(),
            r.uncollectible.toLocaleString(),
          ])}
          rightAlign={[1, 2, 3, 4]}
          emptyMsg="No refunds, voids, or uncollectibles in this period."
        />
      </Section>

      <div className="rounded-md border px-3 py-2 text-[11px]"
           style={{ borderColor: "var(--amber-200)", background: "var(--amber-50)", color: "var(--amber-700)" }}>
        <strong>Accountant-ready PDF packets are deferred.</strong> CSV exports are wired and pull
        the same numbers shown above, scoped to the active period filter. The signed-PDF packet
        spec wants firm-letterhead branding + auditor signatures — both ship with the
        compliance-attestation flow on the Compliance page.
      </div>
    </div>
  );
}

function qs(period: TaxReportPeriod): string {
  const u = new URLSearchParams();
  if (period.since) u.set("since", dateToInput(period.since));
  if (period.until) u.set("until", dateToInput(period.until));
  const s = u.toString();
  return s ? `&${s}` : "";
}

function PeriodForm({ period }: { period: TaxReportPeriod }) {
  return (
    <form className="flex flex-wrap items-end gap-3 rounded-lg border p-3"
          style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)" }}>
      <input type="hidden" name="tab" value="reports" />
      <label className="block">
        <span className="block text-[11px] font-medium uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>
          Since
        </span>
        <input type="date" name="since" defaultValue={dateToInput(period.since)}
               className="ts-focus mt-1 rounded-md border px-3 py-2 text-[13px]"
               style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)", color: "var(--text-default)" }} />
      </label>
      <label className="block">
        <span className="block text-[11px] font-medium uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>
          Until
        </span>
        <input type="date" name="until" defaultValue={dateToInput(period.until)}
               className="ts-focus mt-1 rounded-md border px-3 py-2 text-[13px]"
               style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)", color: "var(--text-default)" }} />
      </label>
      <button type="submit"
              className="ts-focus rounded-md border px-3 py-2 text-[13px] font-medium"
              style={{ borderColor: "var(--border-subtle)", color: "var(--text-default)", background: "var(--surface-1)" }}>
        Apply
      </button>
      <Link href="/platform/billing/tax?tab=reports"
            className="ts-focus rounded-md px-3 py-2 text-[12px]"
            style={{ color: "var(--text-muted)" }}>
        Clear
      </Link>
    </form>
  );
}

function Section({
  title, exportHref, children,
}: {
  title: string; exportHref: string; children: React.ReactNode;
}) {
  return (
    <section className="rounded-lg border" style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)" }}>
      <div className="flex items-center justify-between border-b px-4 py-3" style={{ borderColor: "var(--border-subtle)" }}>
        <h2 className="text-[14px] font-semibold" style={{ color: "var(--text-default)" }}>{title}</h2>
        <Link href={exportHref}
              className="ts-focus rounded-md border px-2.5 py-1 text-[11px] font-medium"
              style={{ borderColor: "var(--border-subtle)", color: "var(--text-default)", background: "var(--surface-1)" }}>
          Export CSV
        </Link>
      </div>
      <div>{children}</div>
    </section>
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

function BasicTable({
  headers, rows, emptyMsg, rightAlign = [],
}: {
  headers: string[];
  rows: (string | number)[][];
  emptyMsg: string;
  rightAlign?: number[];
}) {
  if (rows.length === 0) {
    return (
      <div className="px-4 py-6 text-center text-[13px]" style={{ color: "var(--text-muted)" }}>
        {emptyMsg}
      </div>
    );
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-[13px]">
        <thead style={{ color: "var(--text-muted)", background: "var(--surface-2)" }}>
          <tr className="text-left">
            {headers.map((h, i) => (
              <th key={i} className={"px-4 py-2 font-medium " + (rightAlign.includes(i) ? "text-right" : "")}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, ri) => (
            <tr key={ri} style={{ borderTop: "1px solid var(--border-subtle)" }}>
              {r.map((c, ci) => (
                <td key={ci} className={"px-4 py-2 " + (rightAlign.includes(ci) ? "text-right tabular-nums" : "")}
                    style={{ color: ci === 0 ? "var(--text-default)" : "var(--text-muted)" }}>
                  {c}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
