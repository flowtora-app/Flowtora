import * as React from "react";
import { DashboardStat } from "@/components/dashboard/DashboardStat";
import { SectionHeading } from "@/components/dashboard/SectionHeading";
import { formatMoney } from "@/lib/format";
import type { FinanceData } from "@/lib/dashboard-data";

// Phase 6 — Finance persona (ACCOUNTING).
//
// The AR dashboard. Everything is dollars. KPIs:
//   Row 1 — outstanding AR, overdue count, overdue $$, paid last 30d
//   Row 2 — draft invoices (never sent), backlog (signed orders not
//           yet invoiced), payments booked last 7d

export function FinanceView({
  slug,
  currency,
  data,
}: {
  slug: string;
  currency: string;
  data: FinanceData;
}) {
  return (
    <>
      <SectionHeading title="Receivables" />
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <DashboardStat
          label="Outstanding A/R"
          value={formatMoney(data.outstanding, currency)}
          tone={data.overdueInvoices > 0 ? "warning" : "default"}
          hint={`${data.openInvoices} open invoices`}
          href={`/t/${slug}/invoices?scope=open`}
        />
        <DashboardStat
          label="Overdue count"
          value={String(data.overdueInvoices)}
          tone={data.overdueInvoices > 0 ? "danger" : "default"}
          href={`/t/${slug}/invoices?scope=overdue`}
        />
        <DashboardStat
          label="Overdue $"
          value={formatMoney(data.overdueAmount, currency)}
          tone={data.overdueAmount > 0 ? "danger" : "default"}
          href={`/t/${slug}/invoices?scope=overdue`}
        />
        <DashboardStat
          label="Paid last 30 days"
          value={formatMoney(data.paidLast30, currency)}
          tone="success"
          href={`/t/${slug}/invoices?scope=paid`}
        />
      </div>

      <SectionHeading title="Cash pipeline" />
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
        <DashboardStat
          label="Draft invoices"
          value={String(data.draftInvoices)}
          tone={data.draftInvoices > 0 ? "warning" : "default"}
          hint="Not yet sent"
          href={`/t/${slug}/invoices?status=DRAFT`}
        />
        <DashboardStat
          label="Order backlog"
          value={formatMoney(data.backlog, currency)}
          hint="Signed, not yet invoiced"
        />
        <DashboardStat
          label="Payments last 7d"
          value={String(data.paymentsLast7)}
          tone={data.paymentsLast7 > 0 ? "success" : "default"}
          href={`/t/${slug}/invoices?scope=paid`}
        />
      </div>
    </>
  );
}
