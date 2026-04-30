// ReportThumbnail — server-renderable mini SVG that signals what
// kind of viz a report uses. Cheaper than rendering a real Recharts
// instance for every card, and stable across re-renders.
//
// Pure SVG so it can ship from a server component without crossing
// the client boundary or dragging recharts into the library page
// chunk.

import * as React from "react";
import type { ReportVizKind } from "@/server/platform/reports/registry";

export function ReportThumbnail({ viz, className }: { viz: ReportVizKind; className?: string }) {
  return (
    <div
      className={className}
      style={{
        height: 64,
        background: "var(--surface-2)",
        borderRadius: 6,
        padding: 8,
        display: "flex",
        alignItems: "stretch",
        justifyContent: "stretch",
      }}
    >
      <svg viewBox="0 0 120 48" width="100%" height="100%" preserveAspectRatio="none" aria-hidden>
        {renderShape(viz)}
      </svg>
    </div>
  );
}

function renderShape(viz: ReportVizKind): React.ReactNode {
  const stroke = "var(--brand-600)";
  const fill   = "var(--brand-500)";

  switch (viz) {
    case "line":
      return (
        <polyline
          fill="none" stroke={stroke} strokeWidth={2}
          points="2,38 18,30 34,33 50,18 66,22 82,12 98,16 116,8"
        />
      );
    case "area":
      return (
        <>
          <polygon
            fill={fill} fillOpacity={0.15}
            points="2,46 2,38 18,30 34,33 50,18 66,22 82,12 98,16 116,8 116,46"
          />
          <polyline fill="none" stroke={stroke} strokeWidth={2}
            points="2,38 18,30 34,33 50,18 66,22 82,12 98,16 116,8" />
        </>
      );
    case "bar":
    case "stacked-bar":
      return (
        <>
          <rect x="6"   y="22" width="14" height="22" fill="var(--brand-300)" />
          <rect x="24"  y="14" width="14" height="30" fill="var(--brand-500)" />
          <rect x="42"  y="20" width="14" height="24" fill="var(--brand-400)" />
          <rect x="60"  y="8"  width="14" height="36" fill="var(--brand-600)" />
          <rect x="78"  y="16" width="14" height="28" fill="var(--brand-500)" />
          <rect x="96"  y="24" width="14" height="20" fill="var(--brand-300)" />
        </>
      );
    case "donut":
      return (
        <>
          <circle cx="60" cy="24" r="18" fill="none" stroke="var(--brand-300)" strokeWidth="6" />
          <circle cx="60" cy="24" r="18" fill="none" stroke="var(--brand-600)" strokeWidth="6"
            strokeDasharray="60 113" strokeDashoffset="-15" transform="rotate(-90 60 24)" />
        </>
      );
    case "waterfall":
      return (
        <>
          <rect x="6"   y="14" width="14" height="30" fill="var(--brand-500)" />
          <rect x="24"  y="10" width="14" height="14" fill="var(--emerald-500)" />
          <rect x="42"  y="6"  width="14" height="14" fill="var(--emerald-500)" />
          <rect x="60"  y="20" width="14" height="14" fill="var(--rose-500)" />
          <rect x="78"  y="26" width="14" height="14" fill="var(--rose-500)" />
          <rect x="96"  y="14" width="14" height="30" fill="var(--brand-700)" />
        </>
      );
    case "funnel":
      return (
        <>
          <rect x="2"  y="6"  width="116" height="6" fill="var(--brand-600)" rx="2" />
          <rect x="10" y="16" width="100" height="6" fill="var(--brand-500)" rx="2" />
          <rect x="22" y="26" width="76"  height="6" fill="var(--brand-400)" rx="2" />
          <rect x="38" y="36" width="44"  height="6" fill="var(--emerald-500)" rx="2" />
        </>
      );
    case "sankey":
      return (
        <>
          <rect x="4"  y="6"   width="14" height="14" fill="var(--brand-300)" rx="2" />
          <rect x="4"  y="28"  width="14" height="14" fill="var(--cyan-500)"  rx="2" />
          <path d="M 18 13 C 60 13, 60 12, 102 12" stroke="var(--brand-300)" strokeWidth="6" fill="none" opacity="0.6" />
          <path d="M 18 35 C 60 35, 60 34, 102 32" stroke="var(--cyan-500)"  strokeWidth="4" fill="none" opacity="0.6" />
          <rect x="102" y="6"  width="14" height="14" fill="var(--emerald-500)" rx="2" />
          <rect x="102" y="26" width="14" height="14" fill="var(--brand-700)"   rx="2" />
        </>
      );
    case "heatmap":
      return (
        <g>
          {Array.from({ length: 4 }).map((_, r) =>
            Array.from({ length: 6 }).map((_, c) => {
              const intensity = (r * 6 + c) / 24;
              const op = 0.15 + intensity * 0.7;
              return (
                <rect
                  key={`${r}-${c}`}
                  x={6 + c * 18}
                  y={4 + r * 10}
                  width="14"
                  height="8"
                  fill={fill}
                  fillOpacity={op}
                  rx="1.5"
                />
              );
            })
          )}
        </g>
      );
    case "kpi-grid":
      return (
        <>
          <rect x="6"  y="6"  width="50" height="16" fill="var(--brand-300)" rx="2" />
          <rect x="62" y="6"  width="50" height="16" fill="var(--brand-500)" rx="2" />
          <rect x="6"  y="28" width="50" height="16" fill="var(--cyan-500)"  rx="2" />
          <rect x="62" y="28" width="50" height="16" fill="var(--emerald-500)" rx="2" />
        </>
      );
    case "table-only":
    default:
      return (
        <>
          <line x1="2" y1="10" x2="118" y2="10" stroke="var(--border-default)" strokeWidth="1" />
          <line x1="2" y1="20" x2="118" y2="20" stroke="var(--border-subtle)"  strokeWidth="1" />
          <line x1="2" y1="30" x2="118" y2="30" stroke="var(--border-subtle)"  strokeWidth="1" />
          <line x1="2" y1="40" x2="118" y2="40" stroke="var(--border-subtle)"  strokeWidth="1" />
          <line x1="40" y1="2" x2="40" y2="46" stroke="var(--border-subtle)"  strokeWidth="1" />
          <line x1="80" y1="2" x2="80" y2="46" stroke="var(--border-subtle)"  strokeWidth="1" />
        </>
      );
  }
}
