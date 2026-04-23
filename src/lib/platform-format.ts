// Shared formatters used across the platform command-center dashboard.

export function fmtUsd(n: number): string {
  if (!Number.isFinite(n)) return "$0";
  const rounded = Math.round(n);
  return `$${rounded.toLocaleString("en-US")}`;
}

export function fmtUsdCompact(n: number): string {
  if (!Number.isFinite(n)) return "$0";
  if (Math.abs(n) >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (Math.abs(n) >= 10_000)    return `$${(n / 1_000).toFixed(1)}k`;
  return fmtUsd(n);
}

export function fmtNumber(n: number): string {
  return n.toLocaleString("en-US");
}

export function fmtPct(n: number | null | undefined): string {
  if (n == null) return "—";
  return `${n}%`;
}

export function ageLabel(d: Date, now: Date = new Date()): string {
  const mins = Math.round((now.getTime() - d.getTime()) / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.round(hrs / 24);
  return `${days}d ago`;
}
