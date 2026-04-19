import * as React from "react";
import { DashboardStat } from "@/components/dashboard/DashboardStat";
import { SectionHeading } from "@/components/dashboard/SectionHeading";
import type { EmployeeData } from "@/lib/dashboard-data";

// Phase 6 — Employee / fallback persona (EMPLOYEE, CUSTOMER_PORTAL).
//
// The lowest-privilege dashboard. Just "what's on your plate". No
// pipeline dollars, no company-wide KPIs — just assigned tasks and
// open orders for context.

export function EmployeeView({
  slug,
  data,
}: {
  slug: string;
  data: EmployeeData;
}) {
  return (
    <>
      <SectionHeading title="Assigned to you" />
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
        <DashboardStat
          label="My open tasks"
          value={String(data.myOpenTasks)}
          tone={data.myOpenTasks > 5 ? "warning" : "default"}
          href={`/t/${slug}/tasks?owner=me`}
        />
        <DashboardStat
          label="Completed this week"
          value={String(data.myCompletedThisWeek)}
          tone={data.myCompletedThisWeek > 0 ? "success" : "default"}
        />
        <DashboardStat
          label="Active orders"
          value={String(data.activeOrders)}
          href={`/t/${slug}/orders`}
        />
      </div>
    </>
  );
}
