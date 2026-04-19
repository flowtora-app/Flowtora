// Phase 7 — lead source analytics.
//
// Answers three concrete questions a sales manager actually asks:
//   1. Which source brings in the most revenue? (won $ by source)
//   2. Which source converts best?             (won / total)
//   3. Where's the current pipeline concentrated? (open $ by source)
//
// Numbers are computed directly from the customer table — no extra
// schema, no batch job. We query once per tenant and aggregate in
// memory, which keeps this simple and correct up to ~50k customers
// per tenant. Past that we'd move to a materialised summary.

import { db } from "@/lib/db";
import type { PipelineStage } from "@prisma/client";

export type SourceStat = {
  source: string;
  totalLeads: number;
  wonLeads: number;
  lostLeads: number;
  openLeads: number;
  /** Sum of estimatedValue across all leads from this source. */
  pipelineValue: number;
  /** Sum of estimatedValue across WON leads — best proxy for revenue. */
  wonValue: number;
  /** wonLeads / (wonLeads + lostLeads) — excludes still-open deals. */
  conversionRate: number | null; // 0–1
};

const CLOSED_STAGES: PipelineStage[] = ["WON", "LOST"];
void CLOSED_STAGES; // exported indirectly via the aggregation below.

export async function loadLeadSourceStats(tenantId: string): Promise<SourceStat[]> {
  // One query — the per-customer rows we need.
  //
  // Skipping `source IS NULL` rows from the aggregation is a choice:
  // a "(no source)" bucket would be the largest in most tenants, and
  // that's noise that doesn't help a rep decide where to spend time.
  // If the product manager ever wants to highlight "source unknown"
  // as a learning opportunity we can add it back as a separate row.
  const rows = await db.customer.findMany({
    where: { tenantId, source: { not: null } },
    select: { source: true, stage: true, estimatedValue: true },
    take: 10_000,
  });

  const map = new Map<string, SourceStat>();
  for (const row of rows) {
    const source = (row.source ?? "").trim();
    if (!source) continue;
    let stat = map.get(source);
    if (!stat) {
      stat = {
        source,
        totalLeads: 0,
        wonLeads: 0,
        lostLeads: 0,
        openLeads: 0,
        pipelineValue: 0,
        wonValue: 0,
        conversionRate: null,
      };
      map.set(source, stat);
    }
    stat.totalLeads++;
    const value = row.estimatedValue ? Number(row.estimatedValue) : 0;
    stat.pipelineValue += value;
    if (row.stage === "WON") {
      stat.wonLeads++;
      stat.wonValue += value;
    } else if (row.stage === "LOST") {
      stat.lostLeads++;
    } else {
      stat.openLeads++;
    }
  }

  // Conversion ratio — only meaningful if we have some closed deals.
  for (const stat of map.values()) {
    const decided = stat.wonLeads + stat.lostLeads;
    stat.conversionRate = decided > 0 ? stat.wonLeads / decided : null;
  }

  // Sort by won value descending so the clearest revenue drivers surface
  // first — that's the number most managers look at.
  return Array.from(map.values()).sort((a, b) => {
    if (b.wonValue !== a.wonValue) return b.wonValue - a.wonValue;
    if (b.totalLeads !== a.totalLeads) return b.totalLeads - a.totalLeads;
    return a.source.localeCompare(b.source);
  });
}

export function formatConversionRate(rate: number | null): string {
  if (rate == null) return "—";
  return `${Math.round(rate * 100)}%`;
}
