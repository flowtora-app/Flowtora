// Page 56 — System Status (top-level).
//
// Hero status pill + uptime · service grid · dependency graph · status-page editor.

import * as React from "react";
import Link from "next/link";
import { requirePlatformStaff } from "@/lib/platform";
import {
  loadSystemStatusPage,
  STATUS_TONE,
  KIND_LABEL,
  relativeFromNow,
  shortDateTime,
  type ServiceCard,
  type DependencyGraph,
} from "@/server/platform/system-status";
import {
  saveService,
  setServiceStatus,
  saveDependency,
  deleteDependency,
} from "@/app/actions/platform-system-status";
import {
  StatusPill, StatusDot, KindChip, Spark, FormError, FormOk,
} from "./_shared";
import type {
  SystemServiceStatus, SystemServiceKind,
} from "@prisma/client";

export const dynamic = "force-dynamic";

type SP = Record<string, string | string[] | undefined>;
const asString = (v: string | string[] | undefined): string | undefined =>
  typeof v === "string" && v.length > 0 ? v : undefined;

const TABS = ["grid", "graph", "settings"] as const;
type Tab = typeof TABS[number];
const TAB_LABEL: Record<Tab, string> = {
  grid:     "Service grid",
  graph:    "Dependency graph",
  settings: "Catalog settings",
};

const KINDS: SystemServiceKind[] = [
  "API", "WEB_APP", "AUTH", "DB_PRIMARY", "DB_REPLICA", "REDIS",
  "QUEUE_WORKER", "OBJECT_STORAGE", "SEARCH", "EMAIL", "WEBHOOKS",
  "CDN", "WEBSOCKET", "AI", "CRON", "OTHER",
];
const STATUSES: SystemServiceStatus[] = ["OPERATIONAL", "DEGRADED", "PARTIAL_OUTAGE", "MAJOR_OUTAGE", "MAINTENANCE"];

export default async function SystemStatusPage({
  searchParams,
}: { searchParams: Promise<SP> }) {
  const ctx = await requirePlatformStaff();
  if (!ctx.can("system.status.read")) {
    return (
      <main className="mx-auto max-w-2xl py-12 text-center">
        <h1 className="text-xl font-semibold">Access denied</h1>
        <p className="text-sm" style={{ color: "var(--text-muted)" }}>
          You don&apos;t have permission to view System Status.
        </p>
      </main>
    );
  }
  const canManage = ctx.can("system.status.manage");
  const sp = await searchParams;
  const ok = asString(sp.ok);
  const error = asString(sp.error);
  const tabRaw = asString(sp.tab) as Tab | undefined;
  const tab: Tab = tabRaw && (TABS as readonly string[]).includes(tabRaw) ? tabRaw : "grid";

  const data = await loadSystemStatusPage();
  const { hero, grid, graph } = data;

  return (
    <main className="mx-auto w-full max-w-[1480px] px-6 py-6">
      <header className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[22px] font-semibold" style={{ color: "var(--text-default)" }}>System Status</h1>
          <p className="text-[12px]" style={{ color: "var(--text-muted)" }}>
            Real-time platform health · service grid · dependency graph · charts.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <FormOk msg={ok} />
          <FormError msg={error} />
        </div>
      </header>

      {/* Hero */}
      <section className="mb-5 grid grid-cols-1 gap-4 lg:grid-cols-12">
        <div className="rounded-xl border p-5 lg:col-span-5"
             style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)" }}>
          <div className="text-[11px] font-medium uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>
            Overall platform status
          </div>
          <div className="mt-2 flex items-center gap-3">
            <StatusDot status={hero.rolledUpStatus} />
            <span className="text-[26px] font-semibold" style={{ color: "var(--text-default)" }}>
              {STATUS_TONE[hero.rolledUpStatus].label}
            </span>
          </div>
          <p className="mt-1 text-[12px]" style={{ color: "var(--text-muted)" }}>
            {hero.totalServices} services tracked · {hero.firingAlerts} alerts firing ({hero.pageAlerts} pages).
          </p>
          <div className="mt-4 grid grid-cols-2 gap-3">
            <div>
              <div className="text-[11px] uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>Uptime 30d</div>
              <div className="text-[20px] font-semibold tabular-nums" style={{ color: "var(--text-default)" }}>
                {hero.uptime30dPct.toFixed(2)}%
              </div>
            </div>
            <div>
              <div className="text-[11px] uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>Uptime 90d</div>
              <div className="text-[20px] font-semibold tabular-nums" style={{ color: "var(--text-default)" }}>
                {hero.uptime90dPct.toFixed(2)}%
              </div>
            </div>
          </div>
        </div>
        <div className="rounded-xl border p-5 lg:col-span-7"
             style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)" }}>
          <div className="text-[11px] font-medium uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>
            Services by status
          </div>
          <ul className="mt-3 grid grid-cols-2 gap-2">
            {hero.servicesByStatus.map((row) => (
              <li key={row.status} className="flex items-center justify-between rounded-md border px-2 py-1.5"
                  style={{ background: "var(--surface-2)", borderColor: "var(--border-subtle)" }}>
                <div className="flex items-center gap-2">
                  <StatusDot status={row.status} />
                  <span className="text-[12px]" style={{ color: "var(--text-default)" }}>{STATUS_TONE[row.status].label}</span>
                </div>
                <span className="text-[12px] tabular-nums font-semibold" style={{ color: "var(--text-default)" }}>{row.count}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* Tabs */}
      <nav className="mb-5 flex flex-wrap gap-1 border-b" style={{ borderColor: "var(--border-subtle)" }}>
        {TABS.map((t) => (
          <a key={t} href={`?tab=${t}`}
             className="-mb-px rounded-t-md px-3 py-2 text-[12px] font-medium transition"
             style={{
               borderBottom: tab === t ? "2px solid var(--accent-default)" : "2px solid transparent",
               color: tab === t ? "var(--text-default)" : "var(--text-muted)",
             }}>
            {TAB_LABEL[t]}
          </a>
        ))}
      </nav>

      {tab === "grid"     && <ServiceGridTab grid={grid} />}
      {tab === "graph"    && <GraphTab graph={graph} />}
      {tab === "settings" && <SettingsTab grid={grid} graph={graph} canManage={canManage} />}
    </main>
  );
}

/* ── Service grid ──────────────────────────────────────── */

function ServiceGridTab({ grid }: { grid: ServiceCard[] }) {
  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
      {grid.length === 0 ? (
        <div className="col-span-full rounded-md border border-dashed p-8 text-center text-[12px]"
             style={{ borderColor: "var(--border-subtle)", color: "var(--text-muted)" }}>
          No services in the catalog yet — add some via the Catalog settings tab.
        </div>
      ) : (
        grid.map((s) => {
          const palette =
            s.status === "MAJOR_OUTAGE"   ? { borderColor: "var(--rose-200)" } :
            s.status === "PARTIAL_OUTAGE" ? { borderColor: "var(--amber-200)" } :
            s.status === "DEGRADED"       ? { borderColor: "var(--amber-200)" } :
            s.status === "MAINTENANCE"    ? { borderColor: "var(--sky-200)" } :
                                            undefined;
          return (
            <Link
              key={s.id}
              href={`/platform/system/status/${s.slug}`}
              className="rounded-xl border p-4 transition hover:shadow-sm"
              style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)", ...(palette ?? {}) }}>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="text-[13px] font-semibold truncate" style={{ color: "var(--text-default)" }}>{s.name}</h3>
                    <KindChip kind={s.kind} />
                  </div>
                  {s.description && (
                    <p className="mt-0.5 line-clamp-1 text-[11px]" style={{ color: "var(--text-muted)" }}>{s.description}</p>
                  )}
                  {s.region && (
                    <p className="text-[11px] tabular-nums" style={{ color: "var(--text-muted)" }}>{s.region}</p>
                  )}
                </div>
                <StatusPill status={s.status} />
              </div>
              <div className="mt-3 grid grid-cols-3 gap-2 text-[11px]">
                <Stat label="RPS" value={s.latestRps != null ? s.latestRps.toLocaleString() : "—"} />
                <Stat label="Err" value={s.latestErrorPct != null ? `${s.latestErrorPct.toFixed(2)}%` : "—"}
                      tone={s.latestErrorPct != null && s.latestErrorPct > 1 ? "danger" : undefined} />
                <Stat label="p95" value={s.latestP95Ms != null ? `${s.latestP95Ms}ms` : "—"} />
              </div>
              <div className="mt-2">
                <div className="flex items-baseline justify-between text-[11px]">
                  <span style={{ color: "var(--text-muted)" }}>p95 last 12h</span>
                  <span className="tabular-nums" style={{ color: "var(--text-default)" }}>
                    {s.uptime30dPct.toFixed(2)}% / 30d
                  </span>
                </div>
                <Spark values={s.sparkP95} color={s.status === "OPERATIONAL" ? "var(--emerald-500)" : "var(--amber-500)"} />
              </div>
              <div className="mt-2 flex items-center justify-between">
                <span className="text-[11px]" style={{ color: "var(--text-muted)" }}>
                  CPU {s.latestCpuPct != null ? `${s.latestCpuPct.toFixed(0)}%` : "—"} · Mem {s.latestMemPct != null ? `${s.latestMemPct.toFixed(0)}%` : "—"}
                </span>
                {s.alerts > 0 && (
                  <span className="inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-semibold"
                        style={{ background: "var(--rose-100)", color: "var(--rose-700)" }}>
                    {s.alerts} alert{s.alerts === 1 ? "" : "s"}
                  </span>
                )}
              </div>
            </Link>
          );
        })
      )}
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: "danger" }) {
  const color = tone === "danger" ? "var(--rose-700)" : "var(--text-default)";
  return (
    <div className="rounded-md border px-2 py-1"
         style={{ background: "var(--surface-2)", borderColor: "var(--border-subtle)" }}>
      <div className="text-[10px] uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>{label}</div>
      <div className="text-[13px] font-semibold tabular-nums" style={{ color }}>{value}</div>
    </div>
  );
}

/* ── Dependency graph ──────────────────────────────────── */

function GraphTab({ graph }: { graph: DependencyGraph }) {
  if (graph.nodes.length === 0) {
    return (
      <div className="rounded-md border border-dashed p-8 text-center text-[12px]"
           style={{ borderColor: "var(--border-subtle)", color: "var(--text-muted)" }}>
        No services in the catalog — add services first.
      </div>
    );
  }
  // Simple, deterministic SVG layout: tile services into a grid based on kind groups.
  const groupOrder: { keys: SystemServiceKind[]; label: string }[] = [
    { keys: ["WEB_APP", "API", "WEBSOCKET"],                   label: "Edge" },
    { keys: ["AUTH", "AI", "WEBHOOKS"],                        label: "Service" },
    { keys: ["DB_PRIMARY", "DB_REPLICA", "REDIS", "SEARCH"],   label: "Data" },
    { keys: ["OBJECT_STORAGE", "EMAIL", "CDN", "QUEUE_WORKER", "CRON", "OTHER"], label: "Infra" },
  ];
  const positions = new Map<string, { x: number; y: number; group: number }>();
  groupOrder.forEach((g, gIdx) => {
    const matches = graph.nodes.filter((n) => g.keys.includes(n.kind));
    matches.forEach((n, i) => {
      const x = 60 + i * 180;
      const y = 50 + gIdx * 110;
      positions.set(n.slug, { x, y, group: gIdx });
    });
  });
  // Backfill any unmatched nodes.
  graph.nodes.forEach((n, i) => {
    if (!positions.has(n.slug)) {
      positions.set(n.slug, { x: 60 + (i % 6) * 180, y: 50 + Math.floor(i / 6) * 110 + 480, group: 99 });
    }
  });
  const width  = Math.max(1100, ...Array.from(positions.values()).map((p) => p.x + 160));
  const height = Math.max(520, ...Array.from(positions.values()).map((p) => p.y + 80));
  return (
    <section className="rounded-xl border"
             style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)" }}>
      <header className="border-b px-4 py-3" style={{ borderColor: "var(--border-subtle)" }}>
        <h3 className="text-[13px] font-semibold" style={{ color: "var(--text-default)" }}>Dependency graph</h3>
        <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>
          {graph.nodes.length} services · {graph.edges.length} edges · solid = critical, dashed = soft.
        </p>
      </header>
      <div className="overflow-auto p-4">
        <svg width={width} height={height} role="img" aria-label="Service dependency graph">
          {/* Edges */}
          {graph.edges.map((e, i) => {
            const fp = positions.get(e.from);
            const tp = positions.get(e.to);
            if (!fp || !tp) return null;
            const stroke = e.critical ? "var(--rose-500)" : "var(--text-muted)";
            const dash = e.critical ? "" : "4 4";
            return (
              <g key={i}>
                <line x1={fp.x + 70} y1={fp.y + 30} x2={tp.x + 70} y2={tp.y + 30}
                      stroke={stroke} strokeWidth={1.5} strokeDasharray={dash} opacity={0.7} />
              </g>
            );
          })}
          {/* Nodes */}
          {graph.nodes.map((n) => {
            const p = positions.get(n.slug);
            if (!p) return null;
            const fill =
              n.status === "OPERATIONAL"    ? "var(--emerald-100)" :
              n.status === "DEGRADED"       ? "var(--amber-100)" :
              n.status === "PARTIAL_OUTAGE" ? "var(--amber-100)" :
              n.status === "MAINTENANCE"    ? "var(--sky-100)" :
                                              "var(--rose-100)";
            const stroke =
              n.status === "OPERATIONAL"    ? "var(--emerald-300)" :
              n.status === "DEGRADED"       ? "var(--amber-300)" :
              n.status === "PARTIAL_OUTAGE" ? "var(--amber-300)" :
              n.status === "MAINTENANCE"    ? "var(--sky-300)" :
                                              "var(--rose-300)";
            return (
              <g key={n.id}>
                <a href={`/platform/system/status/${n.slug}`}>
                  <rect x={p.x} y={p.y} width={140} height={56} rx={8}
                        fill={fill} stroke={stroke} strokeWidth={1.5} />
                  <text x={p.x + 8} y={p.y + 22}
                        style={{ font: "600 12px var(--font-sans, system-ui)", fill: "var(--text-default)" }}>
                    {n.name}
                  </text>
                  <text x={p.x + 8} y={p.y + 40}
                        style={{ font: "400 10px var(--font-sans, system-ui)", fill: "var(--text-muted)" }}>
                    {KIND_LABEL[n.kind]}
                  </text>
                  <text x={p.x + 132} y={p.y + 22} textAnchor="end"
                        style={{ font: "700 10px var(--font-sans, system-ui)", fill: stroke }}>
                    {STATUS_TONE[n.status].label.split(" ")[0]}
                  </text>
                </a>
              </g>
            );
          })}
        </svg>
      </div>
    </section>
  );
}

/* ── Settings tab ──────────────────────────────────────── */

function SettingsTab({
  grid, graph, canManage,
}: {
  grid: ServiceCard[];
  graph: DependencyGraph;
  canManage: boolean;
}) {
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      {/* Services list */}
      <section className="rounded-xl border"
               style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)" }}>
        <header className="border-b px-4 py-3" style={{ borderColor: "var(--border-subtle)" }}>
          <h3 className="text-[13px] font-semibold" style={{ color: "var(--text-default)" }}>Service catalog</h3>
          <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>{grid.length} services.</p>
        </header>
        <div className="overflow-x-auto p-4">
          {grid.length === 0 ? <Empty>No services yet.</Empty> : (
            <table className="w-full">
              <thead>
                <tr style={{ color: "var(--text-muted)" }}>
                  <Th>Slug</Th><Th>Name</Th><Th>Kind</Th><Th>Region</Th><Th>Status</Th><Th>Uptime 30d</Th>
                  {canManage && <Th>Set status</Th>}
                </tr>
              </thead>
              <tbody>
                {grid.map((s) => (
                  <tr key={s.id} className="border-t" style={{ borderColor: "var(--border-subtle)" }}>
                    <Td><code className="text-[11px] tabular-nums" style={{ color: "var(--text-default)" }}>{s.slug}</code></Td>
                    <Td>
                      <div className="text-[12px] font-medium" style={{ color: "var(--text-default)" }}>{s.name}</div>
                      {s.runbookSlug && <div className="text-[10px]" style={{ color: "var(--text-muted)" }}>runbook: {s.runbookSlug}</div>}
                    </Td>
                    <Td><KindChip kind={s.kind} /></Td>
                    <Td><span className="text-[11px]" style={{ color: "var(--text-muted)" }}>{s.region ?? "—"}</span></Td>
                    <Td><StatusPill status={s.status} /></Td>
                    <Td><span className="text-[11px] tabular-nums" style={{ color: "var(--text-default)" }}>{s.uptime30dPct.toFixed(2)}%</span></Td>
                    {canManage && (
                      <Td>
                        <form action={setServiceStatus} className="inline-flex items-center gap-1">
                          <input type="hidden" name="id" value={s.id} />
                          <select name="status" defaultValue={s.status}
                                  className="rounded-md border px-1.5 py-0.5 text-[11px]"
                                  style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)", color: "var(--text-default)" }}>
                            {STATUSES.map((st) => <option key={st} value={st}>{STATUS_TONE[st].label}</option>)}
                          </select>
                          <button type="submit" className="text-[11px] font-medium underline" style={{ color: "var(--accent-default)" }}>
                            Set
                          </button>
                        </form>
                      </Td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        {canManage && (
          <div className="border-t px-4 py-3" style={{ borderColor: "var(--border-subtle)" }}>
            <details>
              <summary className="cursor-pointer text-[12px] font-semibold" style={{ color: "var(--text-default)" }}>
                + Save service
              </summary>
              <form action={saveService} className="mt-3 grid grid-cols-2 gap-2 md:grid-cols-3">
                <Input name="slug" label="Slug" defaultValue="" required />
                <Input name="name" label="Name" defaultValue="" required />
                <Select name="kind" label="Kind"
                        options={KINDS.map((k) => ({ value: k, label: KIND_LABEL[k] }))} />
                <Select name="status" label="Status"
                        options={STATUSES.map((s) => ({ value: s, label: STATUS_TONE[s].label }))} />
                <Input name="region" label="Region" defaultValue="us-east-1" />
                <Input name="displayOrder" label="Display order" type="number" defaultValue="100" />
                <Input name="runbookSlug" label="Runbook slug (optional)" defaultValue="" />
                <label className="md:col-span-3 block">
                  <span className="mb-0.5 block text-[11px] font-medium" style={{ color: "var(--text-muted)" }}>Description</span>
                  <input name="description" defaultValue=""
                         className="w-full rounded-md border px-2 py-1.5 text-[12px]"
                         style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)", color: "var(--text-default)" }} />
                </label>
                <div className="md:col-span-3 flex justify-end">
                  <button type="submit" className="inline-flex h-8 items-center rounded-md px-3 text-[12px] font-medium"
                          style={{ background: "var(--accent-default)", color: "var(--accent-fg)" }}>
                    Save service
                  </button>
                </div>
              </form>
            </details>
          </div>
        )}
      </section>

      {/* Dependencies list */}
      <section className="rounded-xl border"
               style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)" }}>
        <header className="border-b px-4 py-3" style={{ borderColor: "var(--border-subtle)" }}>
          <h3 className="text-[13px] font-semibold" style={{ color: "var(--text-default)" }}>Dependencies</h3>
          <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>{graph.edges.length} edges.</p>
        </header>
        <div className="overflow-x-auto p-4">
          {graph.edges.length === 0 ? <Empty>No dependencies recorded.</Empty> : (
            <table className="w-full">
              <thead>
                <tr style={{ color: "var(--text-muted)" }}>
                  <Th>From</Th><Th>To</Th><Th>Kind</Th><Th>Critical</Th>
                  {canManage && <Th right>Action</Th>}
                </tr>
              </thead>
              <tbody>
                {graph.edges.map((e, i) => (
                  <tr key={i} className="border-t" style={{ borderColor: "var(--border-subtle)" }}>
                    <Td><code className="text-[11px] tabular-nums" style={{ color: "var(--text-default)" }}>{e.from}</code></Td>
                    <Td><code className="text-[11px] tabular-nums" style={{ color: "var(--text-default)" }}>{e.to}</code></Td>
                    <Td><span className="text-[11px]" style={{ color: "var(--text-muted)" }}>{e.kind ?? "—"}</span></Td>
                    <Td>
                      {e.critical ? (
                        <span className="inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-semibold"
                              style={{ background: "var(--rose-100)", color: "var(--rose-700)" }}>Critical</span>
                      ) : (
                        <span className="text-[11px]" style={{ color: "var(--text-muted)" }}>—</span>
                      )}
                    </Td>
                    {canManage && (
                      <Td right>
                        <form action={deleteDependency} className="inline-flex">
                          <input type="hidden" name="fromId" value={graph.nodes.find((n) => n.slug === e.from)?.id ?? ""} />
                          <input type="hidden" name="toId"   value={graph.nodes.find((n) => n.slug === e.to)?.id ?? ""} />
                          <button type="submit" className="text-[11px] font-medium underline" style={{ color: "var(--text-muted)" }}>
                            Delete
                          </button>
                        </form>
                      </Td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        {canManage && (
          <div className="border-t px-4 py-3" style={{ borderColor: "var(--border-subtle)" }}>
            <details>
              <summary className="cursor-pointer text-[12px] font-semibold" style={{ color: "var(--text-default)" }}>
                + Save dependency
              </summary>
              <form action={saveDependency} className="mt-3 grid grid-cols-2 gap-2">
                <Select name="fromId" label="From"
                        options={graph.nodes.map((n) => ({ value: n.id, label: `${n.name} (${n.slug})` }))} />
                <Select name="toId" label="To"
                        options={graph.nodes.map((n) => ({ value: n.id, label: `${n.name} (${n.slug})` }))} />
                <Input name="kind" label="Kind (calls, reads, publishes)" defaultValue="calls" />
                <label className="inline-flex items-center gap-2 text-[12px]" style={{ color: "var(--text-default)" }}>
                  <input type="checkbox" name="critical" /> Critical (failure cascades)
                </label>
                <div className="col-span-2 flex justify-end">
                  <button type="submit" className="inline-flex h-8 items-center rounded-md px-3 text-[12px] font-medium"
                          style={{ background: "var(--accent-default)", color: "var(--accent-fg)" }}>
                    Save dependency
                  </button>
                </div>
              </form>
            </details>
          </div>
        )}
      </section>
    </div>
  );
}

/* ── Tiny helpers ──────────────────────────────────────── */

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-md border border-dashed px-4 py-6 text-center text-[12px]"
         style={{ borderColor: "var(--border-subtle)", color: "var(--text-muted)" }}>
      {children}
    </div>
  );
}
function Th({ children, right }: { children: React.ReactNode; right?: boolean }) {
  return <th className={`pb-2 text-${right ? "right" : "left"} text-[11px] font-medium uppercase tracking-wide`}>{children}</th>;
}
function Td({ children, right }: { children: React.ReactNode; right?: boolean }) {
  return <td className={`py-2 pr-3 align-top ${right ? "text-right" : ""}`}>{children}</td>;
}
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
