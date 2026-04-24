import * as React from "react";
import { DashboardStat } from "@/components/dashboard/DashboardStat";
import { SectionHeading } from "@/components/dashboard/SectionHeading";
import { formatMoney } from "@/lib/format";
import type { SalesData } from "@/lib/dashboard-data";

// Phase 6 — Sales persona (SALES_REP).
//
// A sales rep's dashboard is "my book" first, "team" second. KPIs:
//   Row 1 — my active leads, my quotes pending, my won this month, my tasks due
//   Row 2 — team pipeline + team lead count for context

export function SalesView({
  slug,
  currency,
  data,
}: {
  slug: string;
  currency: string;
  data: SalesData;
}) {
  return (
    <>
      <SectionHeading title="Your book" />
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <DashboardStat
          label="My active leads"
          value={String(data.myActiveLeads)}
          hint={`${data.teamActiveLeads} across the team`}
          tone="accent"
          href={`/t/${slug}/customers?owner=me`}
        />
        <DashboardStat
          label="My quotes pending"
          value={String(data.myQuotesPending)}
          hint={data.myQuotesAccepted30 > 0 ? `${data.myQuotesAccepted30} accepted last 30d` : undefined}
          href={`/t/${slug}/quotes?owner=me&status=SENT`}
        />
        <DashboardStat
          label="My won last 30d"
          value={String(data.myWon30)}
          tone={data.myWon30 > 0 ? "success" : "default"}
          href={`/t/${slug}/customers?owner=me&stage=WON`}
        />
        <DashboardStat
          label="My follow-ups due"
          value={String(data.followUpsDue)}
          hint={`${data.myOpenTasks} open tasks total`}
          tone={data.followUpsDue > 5 ? "warning" : "default"}
          href={`/t/${slug}/inbox?chip=tasks`}
        />
      </div>

      <SectionHeading title="Team context" />
      <div className="grid grid-cols-2 gap-4">
        <DashboardStat
          label="Team pipeline value"
          value={formatMoney(data.teamPipelineValue, currency)}
          hint="Everyone's open opportunities"
        />
        <DashboardStat
          label="Team active leads"
          value={String(data.teamActiveLeads)}
          href={`/t/${slug}/customers?stage=QUALIFIED`}
        />
      </div>
    </>
  );
}
