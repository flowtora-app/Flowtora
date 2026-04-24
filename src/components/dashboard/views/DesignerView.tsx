import * as React from "react";
import { DashboardStat } from "@/components/dashboard/DashboardStat";
import { SectionHeading } from "@/components/dashboard/SectionHeading";
import type { DesignerData } from "@/lib/dashboard-data";

// Phase 6 — Designer persona (DESIGNER).
//
// A designer lives on the proof queue. Their dashboard surfaces the
// pipeline of proofs at each status — what I'm building (DRAFT), what
// I'm waiting on (SENT + no reply), and what I need to revise
// (CHANGES_REQUESTED). Plus a "team proofs waiting" tile for
// visibility into the bench.
//
// "Mine" is attributed via `createdBy` — the proof model has no
// separate designer assignment today, so the creator is a good proxy.

export function DesignerView({ slug, data }: { slug: string; data: DesignerData }) {
  return (
    <>
      <SectionHeading title="Your proof queue" />
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <DashboardStat
          label="Drafts on your desk"
          value={String(data.myProofsDraft)}
          tone="accent"
          hint="Not yet sent to customer"
          href={`/t/${slug}/proofs?owner=me&status=DRAFT`}
        />
        <DashboardStat
          label="Awaiting customer"
          value={String(data.myProofsAwaiting)}
          hint="Sent, no response"
          href={`/t/${slug}/proofs?owner=me&status=SENT`}
        />
        <DashboardStat
          label="Revisions to turn"
          value={String(data.myProofsRevisions)}
          tone={data.myProofsRevisions > 0 ? "warning" : "default"}
          hint="Customer asked for changes"
          href={`/t/${slug}/proofs?owner=me&status=CHANGES_REQUESTED`}
        />
        <DashboardStat
          label="Approved last 7 days"
          value={String(data.approvedLast7)}
          tone={data.approvedLast7 > 0 ? "success" : "default"}
          href={`/t/${slug}/proofs?owner=me&status=APPROVED`}
        />
      </div>

      <SectionHeading title="Team context" />
      <div className="grid grid-cols-2 gap-4">
        <DashboardStat
          label="Team proofs with customer"
          value={String(data.teamProofsAwaiting)}
          hint="Across every designer"
          href={`/t/${slug}/proofs?status=SENT`}
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
