// Page 45 — shared bits for the Integrations Catalog admin.

import * as React from "react";
import {
  STATUS_LABELS, STATUS_TONE, AUTH_LABELS, REGION_LABELS, CATEGORY_LABELS,
} from "@/server/platform/integrations-catalog";
import type {
  IntegrationCatalogStatus,
  IntegrationCategory,
  IntegrationAuthType,
  IntegrationRegion,
} from "@prisma/client";

export function Kpi({
  label, value, sub, tone, sparkline,
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: "default" | "good" | "warning" | "danger";
  sparkline?: number[];
}) {
  const palette =
    tone === "good"    ? { borderColor: "var(--emerald-200)" } :
    tone === "warning" ? { borderColor: "var(--amber-200)" } :
    tone === "danger"  ? { borderColor: "var(--rose-200)" } :
                          undefined;
  const max = sparkline ? Math.max(1, ...sparkline) : 1;
  return (
    <div className="rounded-lg border px-4 py-3"
         style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)", ...(palette ?? {}) }}>
      <div className="text-[11px] font-medium uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>{label}</div>
      <div className="mt-1 text-[20px] font-semibold leading-none tabular-nums"
           style={{ color: "var(--text-default)" }}>{value}</div>
      {sub && <div className="mt-1 text-[11px]" style={{ color: "var(--text-muted)" }}>{sub}</div>}
      {sparkline && sparkline.length > 0 && (
        <div className="mt-2 flex h-4 items-end gap-[2px]">
          {sparkline.map((v, i) => (
            <div key={i} className="rounded-sm flex-1"
                 style={{ background: "var(--accent-primary)", height: `${Math.max(2, (v / max) * 100)}%` }} />
          ))}
        </div>
      )}
    </div>
  );
}

export function StatusPill({ status }: { status: IntegrationCatalogStatus }) {
  const tone = STATUS_TONE[status];
  return (
    <span className="inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
          style={{ background: tone.bg, color: tone.fg }}>
      {STATUS_LABELS[status]}
    </span>
  );
}

export function CategoryBadge({ category }: { category: IntegrationCategory }) {
  return (
    <span className="rounded-md px-1.5 py-0.5 text-[10px] font-medium"
          style={{ background: "var(--surface-2)", color: "var(--text-muted)" }}>
      {CATEGORY_LABELS[category]}
    </span>
  );
}

export function AuthTypeBadge({ type }: { type: IntegrationAuthType }) {
  return (
    <span className="rounded-md px-1.5 py-0.5 text-[10px] font-medium"
          style={{ background: "var(--accent-surface)", color: "var(--accent-primary)" }}>
      {AUTH_LABELS[type]}
    </span>
  );
}

export function RegionBadge({ region }: { region: IntegrationRegion }) {
  return (
    <span className="rounded-md px-1.5 py-0.5 text-[9px] font-medium uppercase"
          style={{ background: "var(--surface-2)", color: "var(--text-muted)" }}>
      {REGION_LABELS[region]}
    </span>
  );
}

export function FormError({ msg }: { msg?: string }) {
  if (!msg) return null;
  return (
    <div className="rounded-md border px-3 py-2 text-[12px]"
         style={{ borderColor: "var(--rose-200)", background: "var(--rose-50, var(--surface-2))", color: "var(--danger-fg)" }}>
      {decodeURIComponent(msg)}
    </div>
  );
}
export function FormOk({ msg }: { msg?: string }) {
  if (!msg) return null;
  return (
    <div className="rounded-md border px-3 py-2 text-[12px]"
         style={{ borderColor: "var(--emerald-200)", background: "var(--emerald-50, var(--surface-2))", color: "var(--success-fg)" }}>
      {decodeURIComponent(msg.replace(/-/g, " "))}
    </div>
  );
}

export function relativeFromNow(d: Date | null): string {
  if (!d) return "—";
  const ms = Date.now() - d.getTime();
  const future = ms < 0;
  const abs = Math.abs(ms);
  const mins = Math.round(abs / 60_000);
  const fmt = (s: string) => future ? `in ${s}` : `${s} ago`;
  if (mins < 1)  return future ? "soon" : "just now";
  if (mins < 60) return fmt(`${mins}m`);
  const hrs = Math.round(mins / 60);
  if (hrs < 24)  return fmt(`${hrs}h`);
  const days = Math.round(hrs / 24);
  if (days < 30) return fmt(`${days}d`);
  const months = Math.round(days / 30);
  return fmt(`${months}mo`);
}

export function Logo({ url, name, size = 40 }: { url: string | null; name: string; size?: number }) {
  if (url) {
    // eslint-disable-next-line @next/next/no-img-element
    return (
      <img
        src={url}
        alt={`${name} logo`}
        style={{
          width: size, height: size, borderRadius: 8, objectFit: "contain",
          background: "var(--surface-2)", border: "1px solid var(--border-subtle)",
        }}
      />
    );
  }
  // Fallback — initial letter on gradient.
  const initial = name.charAt(0).toUpperCase();
  return (
    <div
      className="flex shrink-0 items-center justify-center rounded-lg font-semibold"
      style={{
        width: size,
        height: size,
        background: "linear-gradient(135deg, var(--accent-surface), var(--surface-2))",
        color: "var(--accent-primary)",
        fontSize: size * 0.4,
        border: "1px solid var(--border-subtle)",
      }}>
      {initial}
    </div>
  );
}
