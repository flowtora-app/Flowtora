// Shared bits for the Material Library tabs.

import * as React from "react";
import type {
  MasterMaterialCategory,
  MasterMaterialFinish,
  MasterMaterialStatus,
  MasterMaterialUsage,
} from "@prisma/client";

export const CATEGORY_LABEL: Record<MasterMaterialCategory, string> = {
  VINYL: "Vinyl",
  SUBSTRATES: "Substrates",
  INKS: "Inks",
  THREADS: "Threads",
  BLANKS: "Blanks",
  HARDWARE: "Hardware",
  TOOLS: "Tools",
  FINISHING: "Finishing",
  ADHESIVES: "Adhesives",
};

export const FINISH_LABEL: Record<MasterMaterialFinish, string> = {
  MATTE: "Matte",
  GLOSS: "Gloss",
  SATIN: "Satin",
  TEXTURED: "Textured",
  REFLECTIVE: "Reflective",
  FROSTED: "Frosted",
  CLEAR: "Clear",
};

export const USAGE_LABEL: Record<MasterMaterialUsage, string> = {
  INDOOR: "Indoor",
  OUTDOOR: "Outdoor",
  BOTH: "Indoor / Outdoor",
};

export const fmtMoneyDecimal = (cents: number) => cents === 0
  ? "$0.00"
  : `$${(cents / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export const fmtMoneyDecimal4 = (cents: number) => cents === 0
  ? "$0.00"
  : `$${(cents / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 })}`;

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

export function StatusPill({ status }: { status: MasterMaterialStatus }) {
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
