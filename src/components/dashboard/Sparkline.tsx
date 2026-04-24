import * as React from "react";

// Phase 2 (transformation) — vanilla SVG sparkline.
//
// Kept intentionally dependency-free: a sparkline is a polyline over a
// normalized 0..1 y-axis. We don't need tooltips, legends, or any of the
// machinery a chart lib would bring — those belong in a full chart
// component, not a 24px tile accent.
//
// `values` is a time-ordered array; empty or length-<2 arrays render an
// empty placeholder so call-sites don't have to null-guard.

export type SparklineProps = {
  values: number[];
  /** Rendered width in px. */
  width?: number;
  /** Rendered height in px. */
  height?: number;
  /** Stroke color — defaults to --accent-primary. */
  stroke?: string;
  /** If true, fills the area under the line at 12% opacity. */
  fill?: boolean;
  /** Accessible label for screen readers. */
  ariaLabel?: string;
  className?: string;
};

export function Sparkline({
  values,
  width = 96,
  height = 28,
  stroke,
  fill = true,
  ariaLabel,
  className,
}: SparklineProps) {
  if (!values || values.length < 2) {
    // Render a flat mid-line so the tile still has visual weight when the
    // shop has no recent activity — avoids a jarring empty slot.
    return (
      <svg
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        aria-hidden="true"
        className={className}
      >
        <line
          x1={0}
          x2={width}
          y1={height / 2}
          y2={height / 2}
          stroke="var(--border-subtle)"
          strokeWidth={1}
          strokeDasharray="2 3"
        />
      </svg>
    );
  }

  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const stepX = width / (values.length - 1);
  const pad = 2; // 1px top + 1px bottom padding so the stroke isn't clipped

  const toY = (v: number) =>
    height - pad - ((v - min) / range) * (height - pad * 2);

  const points = values
    .map((v, i) => `${(i * stepX).toFixed(2)},${toY(v).toFixed(2)}`)
    .join(" ");

  const strokeColor = stroke ?? "var(--accent-primary)";

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      role={ariaLabel ? "img" : undefined}
      aria-label={ariaLabel}
      aria-hidden={ariaLabel ? undefined : "true"}
      className={className}
    >
      {fill && (
        <polygon
          points={`0,${height} ${points} ${width},${height}`}
          fill={strokeColor}
          opacity={0.12}
        />
      )}
      <polyline
        points={points}
        fill="none"
        stroke={strokeColor}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
