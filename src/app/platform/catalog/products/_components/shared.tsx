// Shared bits for the catalog tabs.

import * as React from "react";
import type { MasterProductCategory, MasterProductStatus } from "@prisma/client";

export const fmtMoney = (cents: number) => cents === 0
  ? "$0"
  : `$${(cents / 100).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;

export const fmtMoneyDecimal = (cents: number) => cents === 0
  ? "$0.00"
  : `$${(cents / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export const CATEGORY_LABEL: Record<MasterProductCategory, string> = {
  BANNERS: "Banners",
  YARD_SIGNS: "Yard signs",
  VEHICLE_WRAPS: "Vehicle wraps",
  WINDOW_GRAPHICS: "Window graphics",
  WALL_DECALS: "Wall decals",
  TRADE_SHOW_DISPLAYS: "Trade show displays",
  A_FRAMES: "A-frames",
  CHANNEL_LETTERS: "Channel letters",
  ADA_SIGNS: "ADA signs",
  APPAREL_SCREEN_PRINT: "Apparel — screen print",
  APPAREL_DTG: "Apparel — DTG",
  APPAREL_DTF: "Apparel — DTF",
  APPAREL_EMBROIDERY: "Apparel — embroidery",
  CAPS: "Caps",
  HOODIES: "Hoodies",
  BUSINESS_CARDS: "Business cards",
  BROCHURES: "Brochures",
  POSTERS: "Posters",
  STICKERS: "Stickers",
  LABELS: "Labels",
  MAGNETS: "Magnets",
  PROMO_PRODUCTS: "Promo products",
  TRADE_PRINT: "Trade print",
  WIDE_FORMAT: "Wide format",
  ARCHITECTURAL: "Architectural",
  WAYFINDING: "Wayfinding",
  CUSTOM: "Custom",
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

export function StatusPill({ status }: { status: MasterProductStatus }) {
  const palette =
    status === "PUBLISHED" ? { bg: "var(--success-surface)", fg: "var(--success-fg)" } :
    status === "DRAFT"     ? { bg: "var(--surface-2)",       fg: "var(--text-muted)" } :
                              { bg: "var(--surface-2)",       fg: "var(--text-faint)" };
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
