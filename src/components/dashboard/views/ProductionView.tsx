import * as React from "react";
import { DashboardStat } from "@/components/dashboard/DashboardStat";
import { SectionHeading } from "@/components/dashboard/SectionHeading";
import type { ProductionData } from "@/lib/dashboard-data";

// Phase 6 — Production Manager persona (PRODUCTION_MANAGER).
//
// The shop-floor dashboard. KPIs:
//   Row 1 — in production, active orders, overdue orders, proofs waiting
//   Row 2 — installs this week, installs awaiting confirm, my tasks
//
// Overdue orders as their own tile because a production manager's #1
// job is not letting the due date slip without someone nudging the
// customer / scheduling an install.

export function ProductionView({ slug, data }: { slug: string; data: ProductionData }) {
  return (
    <>
      <SectionHeading title="On the floor" />
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <DashboardStat
          label="In production"
          value={String(data.wipOrders)}
          tone="accent"
          href={`/t/${slug}/orders?status=IN_PRODUCTION`}
        />
        <DashboardStat
          label="Active orders"
          value={String(data.activeOrders)}
          href={`/t/${slug}/orders`}
        />
        <DashboardStat
          label="Past due"
          value={String(data.overdueOrders)}
          tone={data.overdueOrders > 0 ? "danger" : "default"}
          hint="Due date has passed"
          href={`/t/${slug}/orders?scope=overdue`}
        />
        <DashboardStat
          label="Proofs awaiting customer"
          value={String(data.proofsAwaitingResponse)}
          tone={data.proofsAwaitingResponse > 0 ? "warning" : "default"}
          href={`/t/${slug}/proofs?status=SENT`}
        />
      </div>

      <SectionHeading title="Installs" />
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
        <DashboardStat
          label="Installs this week"
          value={String(data.installsThisWeek)}
          href={`/t/${slug}/installs`}
        />
        <DashboardStat
          label="Awaiting confirm"
          value={String(data.unconfirmedInstalls)}
          tone={data.unconfirmedInstalls > 0 ? "warning" : "default"}
          hint="Scheduled, customer not confirmed"
          href={`/t/${slug}/installs?status=SCHEDULED`}
        />
        <DashboardStat
          label="My open tasks"
          value={String(data.myOpenTasks)}
          tone={data.myOpenTasks > 5 ? "warning" : "default"}
          href={`/t/${slug}/inbox?chip=tasks`}
        />
      </div>
    </>
  );
}
