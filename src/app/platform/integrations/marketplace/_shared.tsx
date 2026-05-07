// Page 48 — shared bits for the Marketplace admin.

import * as React from "react";
import {
  STATUS_TONE, RISK_TONE, REVIEW_STATUS_TONE, STAGE_LABELS,
  PRICING_LABELS, TIER_LABELS,
} from "@/server/platform/marketplace";
import type {
  MarketplaceAppStatus, MarketplaceRiskLevel, MarketplaceReviewStatus,
  MarketplaceSubmissionStage, MarketplacePricingModel, MarketplaceRevenueShareTier,
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

export function StatusPill({ status }: { status: MarketplaceAppStatus }) {
  const tone = STATUS_TONE[status];
  return (
    <span className="inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
          style={{ background: tone.bg, color: tone.fg }}>
      {status.toLowerCase().replace(/_/g, " ")}
    </span>
  );
}

export function RiskPill({ level }: { level: MarketplaceRiskLevel }) {
  const tone = RISK_TONE[level];
  return (
    <span className="inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
          style={{ background: tone.bg, color: tone.fg }}>
      {level.toLowerCase()}
    </span>
  );
}

export function ReviewStatusPill({ status }: { status: MarketplaceReviewStatus }) {
  const tone = REVIEW_STATUS_TONE[status];
  return (
    <span className="inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
          style={{ background: tone.bg, color: tone.fg }}>
      {status.toLowerCase()}
    </span>
  );
}

export function StagePill({ stage }: { stage: MarketplaceSubmissionStage }) {
  const tone = stage === "APPROVED" ? { bg: "var(--success-surface)", fg: "var(--success-fg)" } :
               stage === "REJECTED" ? { bg: "var(--rose-50, var(--surface-2))", fg: "var(--danger-fg)" } :
               stage === "SECURITY_REVIEW" ? { bg: "var(--accent-surface)", fg: "var(--accent-primary)" } :
               { bg: "var(--surface-2)", fg: "var(--text-default)" };
  return (
    <span className="inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
          style={{ background: tone.bg, color: tone.fg }}>
      {STAGE_LABELS[stage]}
    </span>
  );
}

export function Stars({ rating, count }: { rating: number | null; count?: number }) {
  if (rating == null) return <span style={{ color: "var(--text-faint)" }}>—</span>;
  const filled = Math.round(rating);
  return (
    <span className="inline-flex items-center gap-0.5">
      <span style={{ color: "var(--warning-fg)" }}>{"★".repeat(filled)}</span>
      <span style={{ color: "var(--text-faint)" }}>{"★".repeat(Math.max(0, 5 - filled))}</span>
      <span className="ml-1 text-[10px] tabular-nums" style={{ color: "var(--text-muted)" }}>
        {rating.toFixed(1)}{count != null ? ` · ${count}` : ""}
      </span>
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

export function dollars(cents: number): string {
  return `$${(cents / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function pricingLabel(p: MarketplacePricingModel): string {
  return PRICING_LABELS[p];
}

export function tierLabel(t: MarketplaceRevenueShareTier): string {
  return TIER_LABELS[t];
}

export function Logo({ url, name, size = 40 }: { url: string | null; name: string; size?: number }) {
  if (url) {
    // eslint-disable-next-line @next/next/no-img-element
    return (
      <img src={url} alt={`${name} logo`}
           style={{
             width: size, height: size, borderRadius: 8, objectFit: "contain",
             background: "var(--surface-2)", border: "1px solid var(--border-subtle)",
           }} />
    );
  }
  const initial = name.charAt(0).toUpperCase();
  return (
    <div className="flex shrink-0 items-center justify-center rounded-lg font-semibold"
         style={{
           width: size, height: size,
           background: "linear-gradient(135deg, var(--accent-surface), var(--surface-2))",
           color: "var(--accent-primary)",
           fontSize: size * 0.4,
           border: "1px solid var(--border-subtle)",
         }}>
      {initial}
    </div>
  );
}
