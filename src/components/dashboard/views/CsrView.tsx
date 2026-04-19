import * as React from "react";
import { DashboardStat } from "@/components/dashboard/DashboardStat";
import { SectionHeading } from "@/components/dashboard/SectionHeading";
import type { CsrData } from "@/lib/dashboard-data";

// Phase 6 — Customer Service Rep persona (CSR).
//
// A CSR sits at the customer interface all day. Their dashboard
// surfaces who they need to call, text, or chase — not pipeline
// dollars. KPIs:
//   Row 1 — proofs awaiting customer response, installs to confirm,
//           customer-linked open tasks, my personal tasks
//   Row 2 — last-7-day throughput so they see the pulse of activity

export function CsrView({ slug, data }: { slug: string; data: CsrData }) {
  return (
    <>
      <SectionHeading title="Customers waiting on us" />
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <DashboardStat
          label="Proofs awaiting response"
          value={String(data.proofsAwaitingResponse)}
          tone={data.proofsAwaitingResponse > 0 ? "warning" : "default"}
          hint="Sent to customer, no reply yet"
          href={`/t/${slug}/proofs?status=SENT`}
        />
        <DashboardStat
          label="Installs to confirm"
          value={String(data.installsToConfirm)}
          tone={data.installsToConfirm > 0 ? "warning" : "default"}
          hint="This week, customer hasn't confirmed"
          href={`/t/${slug}/installs?status=SCHEDULED`}
        />
        <DashboardStat
          label="Open customer tasks"
          value={String(data.openCustomerTasks)}
          href={`/t/${slug}/tasks?scope=customer`}
        />
        <DashboardStat
          label="My open tasks"
          value={String(data.myOpenTasks)}
          tone={data.myOpenTasks > 5 ? "warning" : "default"}
          href={`/t/${slug}/tasks?owner=me`}
        />
      </div>

      <SectionHeading title="This week" />
      <div className="grid grid-cols-2 gap-4">
        <DashboardStat
          label="New leads last 7 days"
          value={String(data.newLeadsLast7)}
          tone={data.newLeadsLast7 > 0 ? "success" : "default"}
          href={`/t/${slug}/customers?stage=NEW_LEAD`}
        />
        <DashboardStat
          label="Quotes sent last 7 days"
          value={String(data.quotesSentLast7)}
          href={`/t/${slug}/quotes?status=SENT`}
        />
      </div>
    </>
  );
}
