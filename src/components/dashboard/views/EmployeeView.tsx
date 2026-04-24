import * as React from "react";
import { DashboardStat } from "@/components/dashboard/DashboardStat";
import { SectionHeading } from "@/components/dashboard/SectionHeading";
import type { EmployeeData } from "@/lib/dashboard-data";

// Phase 6 — Employee / fallback persona.
//
// Used for the EMPLOYEE role, and defensively for CUSTOMER_PORTAL —
// which is a reserved-but-unassigned enum member (see
// docs/transformation-plan.md §Phase 1). Customer portal access in
// reality flows through `PortalToken`, never through a Membership row.
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
          href={`/t/${slug}/inbox?chip=tasks`}
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
