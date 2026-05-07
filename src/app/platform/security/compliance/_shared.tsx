// Page 51 — Compliance shared bits.

import * as React from "react";
import {
  FRAMEWORK_LABELS, FRAMEWORK_STATUS_TONE, CONTROL_STATUS_TONE,
  POLICY_STATUS_TONE, RISK_TIER_TONE, DPA_STATUS_TONE,
  RISK_STATUS_TONE, VENDOR_STATUS_TONE, REPORT_STATUS_TONE,
  CERT_LABELS, CONTROL_DOMAIN_LABEL,
} from "@/server/platform/compliance";
import type {
  ComplianceFrameworkKey,
  ComplianceFrameworkStatus,
  ComplianceControlStatus,
  ComplianceControlDomain,
  CompliancePolicyStatus,
  SubProcessorRiskTier,
  SubProcessorCertification,
  DpaStatus,
  RiskMitigationStatus,
  VendorReviewStatus,
  ComplianceReportStatus,
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

export function FrameworkPill({ status }: { status: ComplianceFrameworkStatus }) {
  const t = FRAMEWORK_STATUS_TONE[status];
  return (
    <span className="inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
          style={{ background: t.bg, color: t.fg }}>
      {t.label}
    </span>
  );
}

export function ControlStatusPill({ status }: { status: ComplianceControlStatus }) {
  const t = CONTROL_STATUS_TONE[status];
  return (
    <span className="inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
          style={{ background: t.bg, color: t.fg }}>
      {t.label}
    </span>
  );
}

export function PolicyStatusPill({ status }: { status: CompliancePolicyStatus }) {
  const t = POLICY_STATUS_TONE[status];
  return (
    <span className="inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
          style={{ background: t.bg, color: t.fg }}>
      {t.label}
    </span>
  );
}

export function RiskTierPill({ tier }: { tier: SubProcessorRiskTier }) {
  const t = RISK_TIER_TONE[tier];
  return (
    <span className="inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
          style={{ background: t.bg, color: t.fg }}>
      {tier.toLowerCase()}
    </span>
  );
}

export function DpaPill({ status }: { status: DpaStatus }) {
  const t = DPA_STATUS_TONE[status];
  return (
    <span className="inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
          style={{ background: t.bg, color: t.fg }}>
      {t.label}
    </span>
  );
}

export function RiskStatusPill({ status }: { status: RiskMitigationStatus }) {
  const t = RISK_STATUS_TONE[status];
  return (
    <span className="inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
          style={{ background: t.bg, color: t.fg }}>
      {t.label}
    </span>
  );
}

export function VendorStatusPill({ status }: { status: VendorReviewStatus }) {
  const t = VENDOR_STATUS_TONE[status];
  return (
    <span className="inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
          style={{ background: t.bg, color: t.fg }}>
      {t.label}
    </span>
  );
}

export function ReportStatusPill({ status }: { status: ComplianceReportStatus }) {
  const t = REPORT_STATUS_TONE[status];
  return (
    <span className="inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
          style={{ background: t.bg, color: t.fg }}>
      {t.label}
    </span>
  );
}

export function CertChip({ cert }: { cert: SubProcessorCertification }) {
  return (
    <span className="inline-flex items-center rounded-md px-1.5 py-0.5 text-[10px] font-medium"
          style={{ background: "var(--surface-2)", color: "var(--text-default)" }}>
      {CERT_LABELS[cert]}
    </span>
  );
}

export function FrameworkChip({ k }: { k: ComplianceFrameworkKey }) {
  return (
    <span className="inline-flex items-center rounded-md px-1.5 py-0.5 text-[10px] font-medium"
          style={{ background: "var(--surface-2)", color: "var(--text-muted)" }}>
      {FRAMEWORK_LABELS[k]}
    </span>
  );
}

export function DomainChip({ d }: { d: ComplianceControlDomain }) {
  return (
    <span className="inline-flex items-center rounded-md px-1.5 py-0.5 text-[10px] font-medium"
          style={{ background: "var(--surface-2)", color: "var(--text-default)" }}>
      {CONTROL_DOMAIN_LABEL[d]}
    </span>
  );
}

export function PercentBar({
  pct,
}: { pct: number }) {
  const color =
    pct >= 90 ? "var(--emerald-500)" :
    pct >= 70 ? "var(--amber-500)" :
                "var(--rose-500)";
  return (
    <div className="h-2 w-full overflow-hidden rounded-full" style={{ background: "var(--surface-2)" }}>
      <div className="h-full rounded-full" style={{ width: `${Math.max(0, Math.min(100, pct))}%`, background: color }} />
    </div>
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

export function shortDate(d: Date | null | undefined): string {
  if (!d) return "—";
  return d.toISOString().slice(0, 10);
}
