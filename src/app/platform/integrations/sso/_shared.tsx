// Page 49 — shared bits for the SSO admin.

import * as React from "react";
import {
  STATUS_TONE, SCIM_STATUS_TONE, PROVIDER_LABELS, PROVIDER_ICONS,
  OPERATION_LABELS,
} from "@/server/platform/sso";
import type {
  SsoConfigStatus, ScimLogStatus, SsoProviderKey, ScimOperation,
} from "@prisma/client";

export function Kpi({
  label, value, sub, tone,
}: { label: string; value: string; sub?: string; tone?: "default" | "good" | "warning" | "danger" }) {
  const palette =
    tone === "good"    ? { borderColor: "var(--emerald-200)" } :
    tone === "warning" ? { borderColor: "var(--amber-200)" } :
    tone === "danger"  ? { borderColor: "var(--rose-200)" } :
                          undefined;
  return (
    <div className="rounded-lg border px-4 py-3"
         style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)", ...(palette ?? {}) }}>
      <div className="text-[11px] font-medium uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>{label}</div>
      <div className="mt-1 text-[20px] font-semibold leading-none tabular-nums"
           style={{ color: "var(--text-default)" }}>{value}</div>
      {sub && <div className="mt-1 text-[11px]" style={{ color: "var(--text-muted)" }}>{sub}</div>}
    </div>
  );
}

export function StatusPill({ status }: { status: SsoConfigStatus }) {
  const tone = STATUS_TONE[status];
  return (
    <span className="inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
          style={{ background: tone.bg, color: tone.fg }}>
      {status.toLowerCase()}
    </span>
  );
}

export function ScimStatusPill({ status }: { status: ScimLogStatus }) {
  const tone = SCIM_STATUS_TONE[status];
  return (
    <span className="inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
          style={{ background: tone.bg, color: tone.fg }}>
      {status.toLowerCase().replace(/_/g, " ")}
    </span>
  );
}

export function ProviderBadge({ providerKey }: { providerKey: SsoProviderKey }) {
  return (
    <span className="inline-flex items-center gap-1 text-[11px]" style={{ color: "var(--text-default)" }}>
      <span>{PROVIDER_ICONS[providerKey]}</span>
      <span>{PROVIDER_LABELS[providerKey]}</span>
    </span>
  );
}

export function OperationLabel({ operation }: { operation: ScimOperation }) {
  return (
    <span className="text-[11px]" style={{ color: "var(--text-default)" }}>
      {OPERATION_LABELS[operation]}
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

export function Field({ label, children, full }: { label: string; children: React.ReactNode; full?: boolean }) {
  return (
    <label className={`block ${full ? "md:col-span-2" : ""}`}>
      <span className="mb-0.5 block text-[11px] font-medium" style={{ color: "var(--text-muted)" }}>{label}</span>
      {children}
    </label>
  );
}

export function relativeFromNow(d: Date | null | undefined): string {
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
