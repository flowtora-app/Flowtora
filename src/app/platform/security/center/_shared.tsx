// Page 50 — Security Center shared bits.

import * as React from "react";
import {
  SEVERITY_TONE, FINDING_STATUS_TONE, ENCRYPTION_STATE_TONE, FINDING_SOURCE_LABEL,
} from "@/server/platform/security-center";
import type {
  SecurityFindingSeverity, SecurityFindingStatus, EncryptionState,
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

export function SeverityPill({ severity }: { severity: SecurityFindingSeverity }) {
  const tone = SEVERITY_TONE[severity];
  return (
    <span className="inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
          style={{ background: tone.bg, color: tone.fg }}>
      {tone.label}
    </span>
  );
}

export function StatusPill({ status }: { status: SecurityFindingStatus }) {
  const tone = FINDING_STATUS_TONE[status];
  return (
    <span className="inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
          style={{ background: tone.bg, color: tone.fg }}>
      {status.toLowerCase().replace(/_/g, " ")}
    </span>
  );
}

export function EncryptionPill({ state }: { state: EncryptionState }) {
  const tone = ENCRYPTION_STATE_TONE[state];
  return (
    <span className="inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
          style={{ background: tone.bg, color: tone.fg }}>
      {tone.label}
    </span>
  );
}

export function SourceBadge({ source }: { source: keyof typeof FINDING_SOURCE_LABEL }) {
  return (
    <span className="inline-flex items-center rounded-md px-1.5 py-0.5 text-[10px] font-medium"
          style={{ background: "var(--surface-2)", color: "var(--text-muted)" }}>
      {FINDING_SOURCE_LABEL[source]}
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

export function WidgetCard({
  title, subtitle, children, action, tone,
}: {
  title: string; subtitle?: string; children: React.ReactNode;
  action?: React.ReactNode;
  tone?: "default" | "good" | "warning" | "danger";
}) {
  const palette =
    tone === "good"    ? { borderColor: "var(--emerald-200)" } :
    tone === "warning" ? { borderColor: "var(--amber-200)" } :
    tone === "danger"  ? { borderColor: "var(--rose-200)" } :
                          undefined;
  return (
    <section className="rounded-xl border"
             style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)", ...(palette ?? {}) }}>
      <header className="flex items-start justify-between gap-3 border-b px-4 py-3"
              style={{ borderColor: "var(--border-subtle)" }}>
        <div>
          <h3 className="text-[13px] font-semibold" style={{ color: "var(--text-default)" }}>{title}</h3>
          {subtitle && <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>{subtitle}</p>}
        </div>
        {action}
      </header>
      <div className="p-4">{children}</div>
    </section>
  );
}

export function PercentBar({
  pct, tone,
}: { pct: number; tone?: "good" | "warning" | "danger" | "default" }) {
  const color =
    tone === "danger"  ? "var(--rose-500)" :
    tone === "warning" ? "var(--amber-500)" :
    tone === "good"    ? "var(--emerald-500)" :
    pct >= 90 ? "var(--emerald-500)" :
    pct >= 70 ? "var(--amber-500)" :
                "var(--rose-500)";
  return (
    <div className="h-2 w-full overflow-hidden rounded-full" style={{ background: "var(--surface-2)" }}>
      <div className="h-full rounded-full" style={{ width: `${Math.max(0, Math.min(100, pct))}%`, background: color }} />
    </div>
  );
}

/** Hero gauge — 0-100 score with grade. Pure SVG, no chart lib. */
export function ScoreGauge({ score, grade }: { score: number; grade: string }) {
  const radius = 70;
  const stroke = 12;
  const center = 90;
  const circumference = Math.PI * radius;          // half-circle
  const clampScore = Math.max(0, Math.min(100, score));
  const offset = circumference - (clampScore / 100) * circumference;

  const ringColor =
    score >= 90 ? "var(--emerald-500)" :
    score >= 80 ? "var(--sky-500)" :
    score >= 70 ? "var(--amber-500)" :
                  "var(--rose-500)";

  return (
    <div className="flex items-center gap-5">
      <svg width={180} height={110} viewBox="0 0 180 110" aria-hidden="true">
        <path
          d={`M ${center - radius} ${center}
              A ${radius} ${radius} 0 0 1 ${center + radius} ${center}`}
          fill="none"
          stroke="var(--surface-2)"
          strokeWidth={stroke}
          strokeLinecap="round"
        />
        <path
          d={`M ${center - radius} ${center}
              A ${radius} ${radius} 0 0 1 ${center + radius} ${center}`}
          fill="none"
          stroke={ringColor}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
        />
        <text x={center} y={center - 8} textAnchor="middle"
              style={{ font: "700 30px var(--font-sans, system-ui)", fill: "var(--text-default)" }}>
          {Math.round(score)}
        </text>
        <text x={center} y={center + 12} textAnchor="middle"
              style={{ font: "600 11px var(--font-sans, system-ui)", fill: "var(--text-muted)", letterSpacing: 0.6 }}>
          OF 100
        </text>
      </svg>
      <div>
        <div className="text-[44px] leading-none font-semibold tabular-nums" style={{ color: "var(--text-default)" }}>
          {grade}
        </div>
        <div className="text-[11px] uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>
          Posture grade
        </div>
      </div>
    </div>
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
