// Shared bits for the Equipment Templates pages.

import * as React from "react";
import type {
  MasterEquipmentCategory,
  MasterEquipmentStatus,
  MasterMaintenanceFrequency,
} from "@prisma/client";

export const CATEGORY_LABEL: Record<MasterEquipmentCategory, string> = {
  PRINTER: "Printer",
  CUTTER: "Cutter",
  PRESS: "Press",
  EMBROIDERY: "Embroidery",
  CNC: "CNC",
  LASER: "Laser",
  HEAT_PRESS: "Heat press",
  LAMINATION: "Lamination",
  WORKSTATION: "Workstation",
  FINISHING: "Finishing",
};

export const FREQUENCY_LABEL: Record<MasterMaintenanceFrequency, string> = {
  DAILY: "Daily",
  WEEKLY: "Weekly",
  MONTHLY: "Monthly",
  QUARTERLY: "Quarterly",
  ANNUALLY: "Annually",
  HOURS_OF_USE: "Per hours of use",
  CYCLES: "Per cycles",
};

export const fmtMoneyDecimal = (cents: number) => cents === 0
  ? "$0.00"
  : `$${(cents / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export function Kpi({
  label, value, sub, tone,
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: "default" | "good" | "warning" | "danger";
}) {
  const palette =
    tone === "good"    ? { borderColor: "var(--emerald-200)" } :
    tone === "warning" ? { borderColor: "var(--amber-200)" } :
    tone === "danger"  ? { borderColor: "var(--rose-200)" } :
                          undefined;
  return (
    <div className="rounded-lg border px-4 py-3"
         style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)", ...(palette ?? {}) }}>
      <div className="text-[11px] font-medium uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>
        {label}
      </div>
      <div className="mt-1 text-[22px] font-semibold leading-none tabular-nums"
           style={{ color: "var(--text-default)" }}>
        {value}
      </div>
      {sub && <div className="mt-1 text-[11px]" style={{ color: "var(--text-muted)" }}>{sub}</div>}
    </div>
  );
}

export function StatusPill({ status }: { status: MasterEquipmentStatus }) {
  const palette =
    status === "ACTIVE"
      ? { bg: "var(--success-surface)", fg: "var(--success-fg)" }
      : { bg: "var(--surface-2)", fg: "var(--text-faint)" };
  return (
    <span className="inline-flex items-center rounded-full px-1.5 text-[10px] font-semibold uppercase tracking-wide"
          style={{ background: palette.bg, color: palette.fg }}>
      {status}
    </span>
  );
}

export function DeferredNote({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-md border px-3 py-2 text-[11px]"
         style={{ borderColor: "var(--amber-200)", background: "var(--amber-50)", color: "var(--amber-700)" }}>
      {children}
    </div>
  );
}
