// Shared bits for the Design Asset Library.

import * as React from "react";
import type {
  DesignAssetKind,
  DesignAssetLicense,
  DesignAssetStatus,
} from "@prisma/client";

export const KIND_LABEL: Record<DesignAssetKind, string> = {
  FONT: "Fonts",
  ICON: "Icons",
  MOCKUP: "Mockups",
  PALETTE: "Palettes",
  PATTERN: "Patterns",
  PHOTO: "Photos",
  TEMPLATE: "Templates",
};

export const LICENSE_LABEL: Record<DesignAssetLicense, string> = {
  CC0: "CC0 (public domain)",
  CC_BY: "CC-BY (attribution)",
  CC_BY_SA: "CC-BY-SA (share-alike)",
  COMMERCIAL: "Commercial",
  PROPRIETARY: "Proprietary",
  CUSTOM: "Custom",
};

export const STATUS_LABEL: Record<DesignAssetStatus, string> = {
  ACTIVE: "Active",
  ARCHIVED: "Archived",
};

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

export function StatusPill({ status }: { status: DesignAssetStatus }) {
  const palette =
    status === "ACTIVE"
      ? { bg: "var(--success-surface)", fg: "var(--success-fg)" }
      : { bg: "var(--surface-2)", fg: "var(--text-faint)" };
  return (
    <span className="inline-flex items-center rounded-full px-1.5 text-[10px] font-semibold uppercase tracking-wide"
          style={{ background: palette.bg, color: palette.fg }}>
      {STATUS_LABEL[status]}
    </span>
  );
}

export function LicensePill({ license }: { license: DesignAssetLicense }) {
  return (
    <span className="rounded-full px-1.5 py-0.5 text-[10px] font-medium"
          style={{ background: "var(--surface-2)", color: "var(--text-default)" }}
          title={LICENSE_LABEL[license]}>
      {license.replace("_", "-")}
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
