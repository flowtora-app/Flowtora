// Page 56 — System Status shared bits.

import * as React from "react";
import {
  STATUS_TONE, ALERT_SEVERITY_TONE, ALERT_STATUS_TONE,
  DEPLOY_STATUS_TONE, KIND_LABEL,
} from "@/server/platform/system-status";
import type {
  SystemServiceStatus, SystemServiceKind,
  ServiceAlertSeverity, ServiceAlertStatus, ServiceDeployStatus,
} from "@prisma/client";

export function StatusPill({ status }: { status: SystemServiceStatus }) {
  const t = STATUS_TONE[status];
  return (
    <span className="inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
          style={{ background: t.bg, color: t.fg }}>
      {t.label}
    </span>
  );
}

export function StatusDot({ status }: { status: SystemServiceStatus }) {
  const color =
    status === "OPERATIONAL"    ? "var(--emerald-500)" :
    status === "MAINTENANCE"    ? "var(--sky-500)" :
    status === "DEGRADED"       ? "var(--amber-500)" :
    status === "PARTIAL_OUTAGE" ? "var(--amber-500)" :
                                  "var(--rose-500)";
  return <span className="inline-block h-2 w-2 rounded-full align-middle" style={{ background: color }} />;
}

export function KindChip({ kind }: { kind: SystemServiceKind }) {
  return (
    <span className="inline-flex items-center rounded-md px-1.5 py-0.5 text-[10px] font-medium"
          style={{ background: "var(--surface-2)", color: "var(--text-default)" }}>
      {KIND_LABEL[kind]}
    </span>
  );
}

export function AlertSeverityPill({ severity }: { severity: ServiceAlertSeverity }) {
  const t = ALERT_SEVERITY_TONE[severity];
  return (
    <span className="inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
          style={{ background: t.bg, color: t.fg }}>
      {t.label}
    </span>
  );
}

export function AlertStatusPill({ status }: { status: ServiceAlertStatus }) {
  const t = ALERT_STATUS_TONE[status];
  return (
    <span className="inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
          style={{ background: t.bg, color: t.fg }}>
      {t.label}
    </span>
  );
}

export function DeployStatusPill({ status }: { status: ServiceDeployStatus }) {
  const t = DEPLOY_STATUS_TONE[status];
  return (
    <span className="inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
          style={{ background: t.bg, color: t.fg }}>
      {t.label}
    </span>
  );
}

export function Spark({ values, color }: { values: number[]; color: string }) {
  if (values.length === 0) return <div className="h-6 w-full rounded-sm" style={{ background: "var(--surface-2)" }} />;
  const max = Math.max(...values);
  return (
    <div className="flex h-6 w-full items-end gap-[2px]">
      {values.map((v, i) => (
        <div key={i} className="flex-1 rounded-sm"
             style={{ height: `${Math.max(2, (v / Math.max(1, max)) * 100)}%`, background: color, opacity: 0.85 }} />
      ))}
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
