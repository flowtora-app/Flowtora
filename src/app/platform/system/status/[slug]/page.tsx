// Page 56 — Service detail.

import * as React from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePlatformStaff } from "@/lib/platform";
import {
  loadServiceDetail,
  STATUS_TONE,
  KIND_LABEL,
  relativeFromNow,
  shortDateTime,
} from "@/server/platform/system-status";
import {
  ackAlert, resolveAlert, recordDeploy,
} from "@/app/actions/platform-system-status";
import {
  StatusPill, KindChip, AlertSeverityPill, AlertStatusPill, DeployStatusPill,
  FormError, FormOk,
} from "../_shared";
import type { ServiceDeployStatus } from "@prisma/client";

export const dynamic = "force-dynamic";

type SP = Record<string, string | string[] | undefined>;
const asString = (v: string | string[] | undefined): string | undefined =>
  typeof v === "string" && v.length > 0 ? v : undefined;
const asNum = (v: string | string[] | undefined, fallback: number) => {
  const s = asString(v);
  if (!s) return fallback;
  const n = parseInt(s, 10);
  return Number.isFinite(n) ? n : fallback;
};

const RANGES = [
  { key: "1h",  ms: 3_600_000,           label: "1h" },
  { key: "6h",  ms: 6 * 3_600_000,       label: "6h" },
  { key: "24h", ms: 24 * 3_600_000,      label: "24h" },
  { key: "7d",  ms: 7 * 86_400_000,      label: "7d" },
  { key: "30d", ms: 30 * 86_400_000,     label: "30d" },
];

const DEPLOY_STATUSES: ServiceDeployStatus[] = ["IN_PROGRESS", "SUCCEEDED", "FAILED", "ROLLED_BACK"];

export default async function ServiceDetailPage({
  params, searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<SP>;
}) {
  const ctx = await requirePlatformStaff();
  if (!ctx.can("system.status.read")) {
    return (
      <main className="mx-auto max-w-2xl py-12 text-center">
        <h1 className="text-xl font-semibold">Access denied</h1>
      </main>
    );
  }
  const canManage = ctx.can("system.status.manage");
  const { slug } = await params;
  const sp = await searchParams;
  const ok = asString(sp.ok);
  const error = asString(sp.error);
  const rangeKey = asString(sp.range) ?? "24h";
  const range = RANGES.find((r) => r.key === rangeKey) ?? RANGES[2]!;

  const r = await loadServiceDetail(slug, range.ms);
  if (!r) notFound();

  // Compute simple chart series.
  const samples = r.metrics;
  const maxRps   = Math.max(1, ...samples.map((s) => s.rps));
  const maxErr   = Math.max(1, ...samples.map((s) => s.errorPct));
  const maxLat   = Math.max(1, ...samples.map((s) => s.p99Ms));
  const maxSat   = 100;

  return (
    <main className="mx-auto w-full max-w-[1480px] px-6 py-6">
      <header className="mb-5">
        <div className="flex items-center gap-2">
          <Link href="/platform/system/status" className="text-[12px] underline" style={{ color: "var(--text-muted)" }}>
            ← System Status
          </Link>
        </div>
        <div className="mt-1 flex flex-wrap items-end justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-[22px] font-semibold" style={{ color: "var(--text-default)" }}>{r.name}</h1>
              <StatusPill status={r.status} />
              <KindChip kind={r.kind} />
            </div>
            {r.description && (
              <p className="mt-1 text-[12px]" style={{ color: "var(--text-muted)" }}>{r.description}</p>
            )}
            <p className="text-[11px] tabular-nums" style={{ color: "var(--text-muted)" }}>
              slug: <code>{r.slug}</code>{r.region && <> · region: {r.region}</>} ·{" "}
              uptime 30d {r.uptime30dPct.toFixed(2)}% · 90d {r.uptime90dPct.toFixed(2)}%
              {r.runbookSlug && <> · runbook: <code>{r.runbookSlug}</code></>}
            </p>
          </div>
          <div className="flex flex-col items-end gap-1">
            <FormOk msg={ok} />
            <FormError msg={error} />
          </div>
        </div>
      </header>

      {/* Range tabs */}
      <nav className="mb-3 inline-flex rounded-md border" style={{ borderColor: "var(--border-subtle)", background: "var(--surface-1)" }}>
        {RANGES.map((rg) => (
          <a key={rg.key} href={`?range=${rg.key}`}
             className="px-3 py-1.5 text-[12px] font-medium"
             style={{
               background: rg.key === range.key ? "var(--surface-2)" : "transparent",
               color: rg.key === range.key ? "var(--text-default)" : "var(--text-muted)",
             }}>
            {rg.label}
          </a>
        ))}
      </nav>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        {/* Charts column */}
        <section className="space-y-4 lg:col-span-8">
          <Chart title="Request rate" subtitle={`peak ${maxRps.toLocaleString()} rps`}
                 values={samples.map((s) => s.rps / maxRps)} color="var(--sky-500)"
                 deploys={r.deploys.filter((d) => d.showOnChart).map((d) => ({
                   id: d.id, label: d.ref, t: d.deployedAt,
                 }))}
                 range={range.ms} />
          <Chart title="Error rate" subtitle={`peak ${maxErr.toFixed(2)}%`}
                 values={samples.map((s) => s.errorPct / maxErr)} color="var(--rose-500)"
                 deploys={r.deploys.filter((d) => d.showOnChart).map((d) => ({
                   id: d.id, label: d.ref, t: d.deployedAt,
                 }))}
                 range={range.ms} />
          <Chart title="Latency p50 / p95 / p99" subtitle={`p99 peak ${maxLat}ms`}
                 multi={[
                   { values: samples.map((s) => s.p50Ms / maxLat), color: "var(--emerald-500)", label: "p50" },
                   { values: samples.map((s) => s.p95Ms / maxLat), color: "var(--sky-500)",     label: "p95" },
                   { values: samples.map((s) => s.p99Ms / maxLat), color: "var(--rose-500)",    label: "p99" },
                 ]} range={range.ms} />
          <Chart title="Saturation (CPU / Memory)" subtitle="0-100%"
                 multi={[
                   { values: samples.map((s) => s.cpuPct / maxSat), color: "var(--amber-500)",  label: "CPU" },
                   { values: samples.map((s) => s.memPct / maxSat), color: "var(--violet-500)", label: "Memory" },
                 ]} range={range.ms} />
        </section>

        {/* Right rail */}
        <aside className="space-y-4 lg:col-span-4">
          {/* Active alerts */}
          <section className="rounded-xl border"
                   style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)" }}>
            <header className="border-b px-4 py-3" style={{ borderColor: "var(--border-subtle)" }}>
              <h3 className="text-[13px] font-semibold" style={{ color: "var(--text-default)" }}>Alerts</h3>
              <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>{r.alerts.length} entries.</p>
            </header>
            <ul className="space-y-2 p-4">
              {r.alerts.length === 0 ? (
                <li className="text-[12px]" style={{ color: "var(--text-muted)" }}>No alerts in the window.</li>
              ) : (
                r.alerts.map((a) => (
                  <li key={a.id} className="rounded-md border px-2 py-1.5"
                      style={{ background: "var(--surface-2)", borderColor: "var(--border-subtle)" }}>
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5">
                        <AlertSeverityPill severity={a.severity} />
                        <AlertStatusPill   status={a.status} />
                        <span className="text-[10px] tabular-nums" style={{ color: "var(--text-muted)" }}>×{a.fireCount}</span>
                      </div>
                      <span className="text-[10px] tabular-nums" style={{ color: "var(--text-muted)" }}>{relativeFromNow(a.firedAt)}</span>
                    </div>
                    <div className="mt-1 text-[12px] font-medium" style={{ color: "var(--text-default)" }}>{a.title}</div>
                    {a.description && <div className="text-[11px]" style={{ color: "var(--text-muted)" }}>{a.description}</div>}
                    {a.source && <div className="text-[10px]" style={{ color: "var(--text-muted)" }}>{a.source}</div>}
                    {canManage && (a.status === "FIRING" || a.status === "ACKNOWLEDGED") && (
                      <div className="mt-1 flex gap-2">
                        {a.status === "FIRING" && (
                          <form action={ackAlert} className="inline-flex">
                            <input type="hidden" name="id" value={a.id} />
                            <button type="submit" className="text-[11px] font-medium underline" style={{ color: "var(--accent-default)" }}>
                              Acknowledge
                            </button>
                          </form>
                        )}
                        <form action={resolveAlert} className="inline-flex">
                          <input type="hidden" name="id" value={a.id} />
                          <button type="submit" className="text-[11px] font-medium underline" style={{ color: "var(--text-muted)" }}>
                            Resolve
                          </button>
                        </form>
                      </div>
                    )}
                  </li>
                ))
              )}
            </ul>
          </section>

          {/* Recent deploys */}
          <section className="rounded-xl border"
                   style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)" }}>
            <header className="border-b px-4 py-3" style={{ borderColor: "var(--border-subtle)" }}>
              <h3 className="text-[13px] font-semibold" style={{ color: "var(--text-default)" }}>Recent deploys</h3>
              <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>{r.deploys.length} in window.</p>
            </header>
            <ul className="space-y-1 p-4">
              {r.deploys.length === 0 ? (
                <li className="text-[12px]" style={{ color: "var(--text-muted)" }}>No deploys in this window.</li>
              ) : (
                r.deploys.map((d) => (
                  <li key={d.id} className="rounded-md border px-2 py-1.5"
                      style={{ background: "var(--surface-2)", borderColor: "var(--border-subtle)" }}>
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[12px] font-medium" style={{ color: "var(--text-default)" }}>{d.title ?? d.ref}</span>
                      <DeployStatusPill status={d.status} />
                    </div>
                    <div className="text-[11px] tabular-nums" style={{ color: "var(--text-muted)" }}>
                      <code>{d.ref}</code>
                      {d.source && <> · {d.source}</>} · {relativeFromNow(d.deployedAt)}
                    </div>
                  </li>
                ))
              )}
            </ul>
            {canManage && (
              <div className="border-t px-4 py-3" style={{ borderColor: "var(--border-subtle)" }}>
                <details>
                  <summary className="cursor-pointer text-[12px] font-semibold" style={{ color: "var(--text-default)" }}>
                    + Log deploy
                  </summary>
                  <form action={recordDeploy} className="mt-2 grid grid-cols-2 gap-2">
                    <input type="hidden" name="serviceId" value={r.id} />
                    <Input name="ref" label="Ref (v1.42, SHA)" defaultValue="" required />
                    <Input name="title" label="Title" defaultValue="" />
                    <Input name="source" label="Source" defaultValue="Vercel" />
                    <Select name="status" label="Status"
                            options={DEPLOY_STATUSES.map((s) => ({ value: s, label: s.toLowerCase().replace(/_/g, " ") }))} />
                    <label className="col-span-2 inline-flex items-center gap-2 text-[12px]" style={{ color: "var(--text-default)" }}>
                      <input type="checkbox" name="showOnChart" defaultChecked /> Show on chart
                    </label>
                    <div className="col-span-2 flex justify-end">
                      <button type="submit" className="inline-flex h-7 items-center rounded-md px-2 text-[11px] font-medium"
                              style={{ background: "var(--accent-default)", color: "var(--accent-fg)" }}>
                        Save deploy
                      </button>
                    </div>
                  </form>
                </details>
              </div>
            )}
          </section>

          {/* Dependencies */}
          <section className="rounded-xl border"
                   style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)" }}>
            <header className="border-b px-4 py-3" style={{ borderColor: "var(--border-subtle)" }}>
              <h3 className="text-[13px] font-semibold" style={{ color: "var(--text-default)" }}>Dependencies</h3>
            </header>
            <div className="p-4 text-[12px]">
              <div className="font-medium" style={{ color: "var(--text-muted)" }}>This service depends on</div>
              <ul className="mt-1 space-y-1">
                {r.dependsOn.length === 0
                  ? <li style={{ color: "var(--text-muted)" }}>None.</li>
                  : r.dependsOn.map((d) => (
                    <li key={d.id}>
                      <Link href={`/platform/system/status/${d.slug}`} className="underline" style={{ color: "var(--accent-default)" }}>
                        {d.name}
                      </Link>
                      <span className="ml-2 text-[10px]" style={{ color: "var(--text-muted)" }}>
                        {d.kind ?? "calls"}{d.critical ? " · critical" : ""}
                      </span>
                    </li>
                  ))}
              </ul>
              <div className="mt-3 font-medium" style={{ color: "var(--text-muted)" }}>Depended on by</div>
              <ul className="mt-1 space-y-1">
                {r.dependedOnBy.length === 0
                  ? <li style={{ color: "var(--text-muted)" }}>None.</li>
                  : r.dependedOnBy.map((d) => (
                    <li key={d.id}>
                      <Link href={`/platform/system/status/${d.slug}`} className="underline" style={{ color: "var(--accent-default)" }}>
                        {d.name}
                      </Link>
                      <span className="ml-2 text-[10px]" style={{ color: "var(--text-muted)" }}>
                        {d.kind ?? "calls"}{d.critical ? " · critical" : ""}
                      </span>
                    </li>
                  ))}
              </ul>
            </div>
          </section>
        </aside>
      </div>
    </main>
  );
}

/* ── Chart helper ──────────────────────────────────────── */

function Chart({
  title, subtitle, values, color, multi, deploys, range,
}: {
  title: string;
  subtitle: string;
  values?: number[]; // 0..1 normalized
  color?: string;
  multi?: { values: number[]; color: string; label: string }[];
  deploys?: { id: string; label: string; t: Date }[];
  range: number;
}) {
  return (
    <section className="rounded-xl border p-4"
             style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)" }}>
      <div className="flex items-center justify-between">
        <h3 className="text-[13px] font-semibold" style={{ color: "var(--text-default)" }}>{title}</h3>
        <span className="text-[11px]" style={{ color: "var(--text-muted)" }}>{subtitle}</span>
      </div>
      {multi && (
        <div className="mt-1 flex gap-3 text-[10px]" style={{ color: "var(--text-muted)" }}>
          {multi.map((m) => (
            <span key={m.label} className="inline-flex items-center gap-1">
              <span className="inline-block h-2 w-2 rounded-sm" style={{ background: m.color }} /> {m.label}
            </span>
          ))}
        </div>
      )}
      <div className="relative mt-3 h-28 w-full overflow-hidden rounded-sm" style={{ background: "var(--surface-2)" }}>
        {values && color && (
          <SparkLine values={values} color={color} />
        )}
        {multi && multi.map((m, i) => (
          <SparkLine key={i} values={m.values} color={m.color} />
        ))}
        {/* Deploy markers */}
        {deploys && deploys.map((d) => {
          const ageMs = Date.now() - d.t.getTime();
          const pct = 100 - Math.max(0, Math.min(100, (ageMs / range) * 100));
          return (
            <div key={d.id} title={d.label}
                 className="absolute top-0 bottom-0 w-px"
                 style={{ left: `${pct}%`, background: "var(--violet-500)", opacity: 0.6 }} />
          );
        })}
      </div>
    </section>
  );
}

function SparkLine({ values, color }: { values: number[]; color: string }) {
  if (values.length === 0) return null;
  const w = 100;
  const h = 100;
  const step = w / Math.max(1, values.length - 1);
  const points = values.map((v, i) => `${(i * step).toFixed(1)},${(h - Math.max(2, v * h)).toFixed(1)}`).join(" ");
  return (
    <svg className="absolute inset-0 h-full w-full" preserveAspectRatio="none" viewBox={`0 0 ${w} ${h}`}>
      <polyline points={points} fill="none" stroke={color} strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

/* ── Tiny helpers ──────────────────────────────────────── */

function Input({
  name, label, type, defaultValue, required,
}: { name: string; label: string; type?: string; defaultValue: string; required?: boolean }) {
  return (
    <label className="block">
      <span className="mb-0.5 block text-[11px] font-medium" style={{ color: "var(--text-muted)" }}>
        {label}{required && <span style={{ color: "var(--rose-500)" }}> *</span>}
      </span>
      <input
        type={type ?? "text"}
        name={name}
        defaultValue={defaultValue}
        required={required}
        className="w-full rounded-md border px-2 py-1.5 text-[12px]"
        style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)", color: "var(--text-default)" }}
      />
    </label>
  );
}

function Select({
  name, label, options, defaultValue,
}: {
  name: string; label: string;
  options: { value: string; label: string }[];
  defaultValue?: string;
}) {
  return (
    <label className="block">
      <span className="mb-0.5 block text-[11px] font-medium" style={{ color: "var(--text-muted)" }}>{label}</span>
      <select
        name={name}
        defaultValue={defaultValue}
        className="w-full rounded-md border px-2 py-1.5 text-[12px]"
        style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)", color: "var(--text-default)" }}
      >
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </label>
  );
}
