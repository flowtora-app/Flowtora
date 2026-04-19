import * as React from "react";
import { DashboardStat } from "@/components/dashboard/DashboardStat";
import { SectionHeading } from "@/components/dashboard/SectionHeading";
import { formatMoney } from "@/lib/format";
import type { ExecutiveData } from "@/lib/dashboard-data";

// Phase 6 — Executive persona (OWNER, ADMIN).
//
// The "whole shop in one screen" view. Three rows:
//   1. Revenue & pipeline  — what's closing and what's paid
//   2. Production & installs — the operational funnel
//   3. Receivables         — cash health
//
// Every tile is a link so the owner can drill in without losing their
// place. Owner/admin get no branch filter in the persona — the page-
// level header renders that separately.

export function ExecutiveView({
  slug,
  currency,
  data,
}: {
  slug: string;
  currency: string;
  data: ExecutiveData;
}) {
  return (
    <>
      <SectionHeading title="Revenue & pipeline" />
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <DashboardStat
          label="Pipeline value"
          value={formatMoney(data.pipelineValue, currency)}
          hint={`${data.activeLeads} active opportunities`}
          tone="accent"
          href={`/t/${slug}/customers?stage=QUALIFIED`}
        />
        <DashboardStat
          label="Won last 30 days"
          value={String(data.wonLast30)}
          hint={`${data.wonCount} total customers won`}
          tone="success"
          href={`/t/${slug}/customers?stage=WON`}
        />
        <DashboardStat
          label="Paid last 30 days"
          value={formatMoney(data.paidLast30, currency)}
          tone="success"
          href={`/t/${slug}/invoices?scope=paid`}
        />
        <DashboardStat
          label="Outstanding A/R"
          value={formatMoney(data.outstanding, currency)}
          hint={data.overdueInvoices > 0 ? `${data.overdueInvoices} overdue` : undefined}
          tone={data.overdueInvoices > 0 ? "warning" : "default"}
          href={`/t/${slug}/invoices?scope=open`}
        />
      </div>

      <SectionHeading title="Production & installs" />
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <DashboardStat
          label="In production"
          value={String(data.wipOrders)}
          href={`/t/${slug}/orders?status=IN_PRODUCTION`}
        />
        <DashboardStat
          label="Active orders"
          value={String(data.activeOrders)}
          hint={`${formatMoney(data.backlog, currency)} backlog`}
          href={`/t/${slug}/orders`}
        />
        <DashboardStat
          label="Installs this week"
          value={String(data.installsThisWeek)}
          href={`/t/${slug}/installs`}
        />
        <DashboardStat
          label="Open invoices"
          value={String(data.openInvoices)}
          href={`/t/${slug}/invoices?scope=open`}
        />
      </div>
    </>
  );
}
