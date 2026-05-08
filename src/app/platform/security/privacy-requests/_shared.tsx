// Page 52 — Privacy Requests shared bits.

import * as React from "react";
import {
  TYPE_LABEL, JURISDICTION_LABEL, SOURCE_LABEL,
  STATUS_TONE, VERIFICATION_TONE, SCOPE_STATUS_TONE,
  VERIFICATION_METHOD_LABEL, SCOPE_SYSTEM_LABEL,
} from "@/server/platform/privacy-requests";
import type {
  PrivacyRequestType,
  PrivacyJurisdiction,
  PrivacyRequestSource,
  PrivacyRequestStatus,
  PrivacyVerificationStatus,
  PrivacyScopeStatus,
  PrivacyScopeSystem,
  PrivacyVerificationMethod,
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

export function StatusPill({ status }: { status: PrivacyRequestStatus }) {
  const t = STATUS_TONE[status];
  return (
    <span className="inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
          style={{ background: t.bg, color: t.fg }}>
      {t.label}
    </span>
  );
}

export function VerificationPill({ status }: { status: PrivacyVerificationStatus }) {
  const t = VERIFICATION_TONE[status];
  return (
    <span className="inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
          style={{ background: t.bg, color: t.fg }}>
      {t.label}
    </span>
  );
}

export function ScopeStatusPill({ status }: { status: PrivacyScopeStatus }) {
  const t = SCOPE_STATUS_TONE[status];
  return (
    <span className="inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
          style={{ background: t.bg, color: t.fg }}>
      {t.label}
    </span>
  );
}

export function TypeChip({ type }: { type: PrivacyRequestType }) {
  return (
    <span className="inline-flex items-center rounded-md px-1.5 py-0.5 text-[10px] font-medium"
          style={{ background: "var(--surface-2)", color: "var(--text-default)" }}>
      {TYPE_LABEL[type]}
    </span>
  );
}

export function JurisdictionChip({ j }: { j: PrivacyJurisdiction }) {
  return (
    <span className="inline-flex items-center rounded-md px-1.5 py-0.5 text-[10px] font-medium"
          style={{ background: "var(--surface-2)", color: "var(--text-muted)" }}>
      {JURISDICTION_LABEL[j]}
    </span>
  );
}

export function SourceChip({ s }: { s: PrivacyRequestSource }) {
  return (
    <span className="inline-flex items-center rounded-md px-1.5 py-0.5 text-[10px] font-medium"
          style={{ background: "var(--surface-2)", color: "var(--text-muted)" }}>
      {SOURCE_LABEL[s]}
    </span>
  );
}

export function MethodLabel({ m }: { m: PrivacyVerificationMethod }) {
  return <span className="text-[11px]" style={{ color: "var(--text-default)" }}>{VERIFICATION_METHOD_LABEL[m]}</span>;
}

export function SystemLabel({ s }: { s: PrivacyScopeSystem }) {
  return <span className="text-[12px] font-medium" style={{ color: "var(--text-default)" }}>{SCOPE_SYSTEM_LABEL[s]}</span>;
}

export function SlaCell({ remainingHours }: { remainingHours: number }) {
  const tone =
    remainingHours < 0   ? "var(--rose-700)" :
    remainingHours < 72  ? "var(--amber-700)" :
                            "var(--emerald-700)";
  const text =
    remainingHours < 0
      ? `${Math.round(Math.abs(remainingHours / 24))}d overdue`
      : remainingHours < 24
        ? `${remainingHours}h left`
        : `${Math.round(remainingHours / 24)}d left`;
  return (
    <span className="text-[11px] font-semibold tabular-nums" style={{ color: tone }}>
      {text}
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
