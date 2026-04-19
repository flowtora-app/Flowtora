import * as React from "react";
import { DashboardStat } from "@/components/dashboard/DashboardStat";
import { SectionHeading } from "@/components/dashboard/SectionHeading";
import type { InstallerData } from "@/lib/dashboard-data";

// Phase 6 — Installer persona (INSTALLER).
//
// An installer's phone-in-the-truck dashboard: "what am I doing today,
// what's on the schedule this week, and who still needs to confirm?"
// Everything is scoped to `installerId = me` so a multi-crew shop
// doesn't overwhelm each installer with the whole team's schedule.

export function InstallerView({ slug, data }: { slug: string; data: InstallerData }) {
  return (
    <>
      <SectionHeading title="Your schedule" />
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <DashboardStat
          label="Installs today"
          value={String(data.myInstallsToday)}
          tone={data.myInstallsToday > 0 ? "accent" : "default"}
          href={`/t/${slug}/installs?scope=mine&when=today`}
        />
        <DashboardStat
          label="This week"
          value={String(data.myInstallsThisWeek)}
          href={`/t/${slug}/installs?scope=mine&when=week`}
        />
        <DashboardStat
          label="Next 14 days"
          value={String(data.myUpcomingInstalls)}
          href={`/t/${slug}/installs?scope=mine`}
        />
        <DashboardStat
          label="Awaiting confirm"
          value={String(data.myUnconfirmedInstalls)}
          tone={data.myUnconfirmedInstalls > 0 ? "warning" : "default"}
          hint="Customer hasn't confirmed"
          href={`/t/${slug}/installs?scope=mine&status=SCHEDULED`}
        />
      </div>

      <SectionHeading title="Your plate" />
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <DashboardStat
          label="My open tasks"
          value={String(data.myOpenTasks)}
          tone={data.myOpenTasks > 5 ? "warning" : "default"}
          href={`/t/${slug}/tasks?owner=me`}
        />
      </div>
    </>
  );
}
