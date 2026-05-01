"use client";

import * as React from "react";
import { Card } from "@/components/ui";
import {
  STAGES,
  type PipelineRow,
  type StageDef,
} from "@/server/platform/onboarding-pipeline";
import { StageDrawer } from "./StageDrawer";

// FunnelTab — vertical stepped funnel chart (each stage = one bar).
// Click any bar to open the StageDrawer with the tenants currently
// at that stage. Width is proportional to the stage 1 (top) count
// so drop-off is visually obvious.

export function FunnelTab({
  totals,
  rows,
  canEdit,
  canImpersonate,
}: {
  totals: { stage: StageDef; count: number; dropOffPct: number | null }[];
  rows: PipelineRow[];
  canEdit: boolean;
  canImpersonate: boolean;
}) {
  const [drawerStage, setDrawerStage] = React.useState<StageDef | null>(null);
  const max = Math.max(1, totals[0]?.count ?? 1);

  const drawerRows = React.useMemo(
    () => drawerStage ? rows.filter((r) => r.stage.id === drawerStage.id) : [],
    [rows, drawerStage],
  );

  return (
    <Card padding="md">
      <div className="mb-2 flex items-center justify-between">
        <div className="text-[12px] font-semibold uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>
          Funnel breakdown
        </div>
        <div className="text-[11px]" style={{ color: "var(--text-faint)" }}>
          Click a stage to see tenants
        </div>
      </div>

      <ul className="flex flex-col gap-1">
        {totals.map((row, i) => {
          const widthPct = max === 0 ? 0 : Math.max(4, (row.count / max) * 100);
          const dropOff = row.dropOffPct;
          return (
            <li key={row.stage.id} className="flex flex-col">
              <button
                type="button"
                onClick={() => setDrawerStage(row.stage)}
                className="ts-focus group block w-full rounded-md px-2 py-1.5 text-left transition-colors hover:bg-[var(--surface-2)]"
                aria-label={`View tenants at stage ${row.stage.label}`}
              >
                <div className="flex items-center gap-2">
                  <span className="w-7 shrink-0 text-center text-[11px] tabular-nums" style={{ color: "var(--text-faint)" }}>
                    {row.stage.order}.
                  </span>
                  <span className="w-6 shrink-0 text-[16px]">{row.stage.icon}</span>
                  <span className="w-44 shrink-0 truncate text-[12px] font-medium" style={{ color: "var(--text-default)" }}>
                    {row.stage.label}
                  </span>
                  <div className="relative flex-1 overflow-hidden rounded-md" style={{ background: "var(--surface-2)", height: 22 }}>
                    <div
                      className="h-full transition-all group-hover:opacity-80"
                      style={{
                        width: `${widthPct}%`,
                        background: stageColor(i, totals.length),
                        minWidth: row.count > 0 ? 4 : 0,
                      }}
                    />
                    <span className="absolute inset-0 flex items-center px-2 text-[11px] font-semibold tabular-nums" style={{ color: "var(--text-default)" }}>
                      {row.count.toLocaleString()}
                    </span>
                  </div>
                  <span className="w-16 shrink-0 text-right text-[11px] tabular-nums" style={{ color: "var(--text-muted)" }}>
                    {dropOff == null ? "" : dropOff > 0 ? `−${dropOff}%` : "0%"}
                  </span>
                </div>
              </button>
              {dropOff != null && dropOff >= 30 && (
                <div className="ml-9 mt-0.5 text-[10px]" style={{ color: "var(--rose-700)" }}>
                  ↳ Big drop from {STAGES[i - 1]?.label} → {row.stage.label}
                </div>
              )}
            </li>
          );
        })}
      </ul>

      <p className="mt-3 text-[11px]" style={{ color: "var(--text-faint)" }}>
        Counts are cumulative — every tenant past a later stage has cleared the earlier ones.
        Drop-off shows how many fell out between consecutive stages.
      </p>

      {drawerStage && (
        <StageDrawer
          open
          onClose={() => setDrawerStage(null)}
          stageLabel={drawerStage.label}
          stageDescription={drawerStage.description}
          rows={drawerRows}
          canEdit={canEdit}
          canImpersonate={canImpersonate}
        />
      )}
    </Card>
  );
}

function stageColor(i: number, total: number): string {
  // Subtle gradient from brand to amber: deeper at the top of the
  // funnel (where the most tenants live) and warmer at the activated
  // end. Stays inside the design tokens so dark mode flips correctly.
  const t = total <= 1 ? 0 : i / (total - 1);
  if (t < 0.5) return "var(--brand-500)";
  if (t < 0.8) return "var(--brand-600)";
  return "var(--emerald-600)";
}
