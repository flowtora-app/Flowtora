// Page 62 — Feature Flags (platform catalog).
//
// Two-column layout:
//   Left:  filterable list of flags
//   Right: detail panel for the selected flag (or "Pick a flag" empty state)
// Plus tabs at top for cross-cutting views: Flags · Segments · Activity · Settings.
//
// Note: /platform/feature-flags is the legacy entitlement-override page
// (per-tenant on/off). THIS is the platform-wide flag catalog with
// rollouts, variants, segments, and audit history.

import * as React from "react";
import { requirePlatformStaff } from "@/lib/platform";
import {
  loadFlagsPage, loadFlagDetail,
  FLAG_TYPE_LABEL, FLAG_TYPE_TONE,
  FLAG_ENV_LABEL, FLAG_ENV_TONE,
  FLAG_CHANGE_LABEL, FLAG_CHANGE_TONE,
  effectiveRollout, relativeFromNow,
} from "@/server/platform/feature-flags";
import {
  saveFlag, archiveFlag, unarchiveFlag,
  saveRollout, setKillSwitch,
  saveVariant, deleteVariant,
  saveRule, deleteRule,
  saveSegment, deleteSegment,
  saveScheduleStep, deleteScheduleStep,
  addDependency, deleteDependency,
  saveFlagSettings,
} from "@/app/actions/platform-feature-flags";
import type {
  PlatformFlagType,
  PlatformFlagEnv,
  PlatformFlagChangeKind,
} from "@prisma/client";

export const dynamic = "force-dynamic";

type SP = Record<string, string | string[] | undefined>;
const asString = (v: string | string[] | undefined): string | undefined =>
  typeof v === "string" && v.length > 0 ? v : undefined;

const TABS = ["flags", "segments", "activity", "settings"] as const;
type Tab = typeof TABS[number];
const TAB_LABEL: Record<Tab, string> = {
  flags: "Flags",
  segments: "Segments",
  activity: "Activity",
  settings: "Settings",
};

const TYPES: PlatformFlagType[] = ["BOOLEAN", "MULTIVARIATE", "STRING", "NUMBER", "JSON_VALUE"];
const ENVS: PlatformFlagEnv[] = ["PRODUCTION", "STAGING", "SANDBOX", "PREVIEW"];

export default async function FeatureFlagsPage({
  searchParams,
}: { searchParams: Promise<SP> }) {
  const ctx = await requirePlatformStaff();
  if (!ctx.can("feature_flag.read")) {
    return (
      <main className="mx-auto max-w-2xl py-12 text-center">
        <h1 className="text-xl font-semibold">Access denied</h1>
        <p className="text-sm" style={{ color: "var(--text-muted)" }}>
          You don&apos;t have permission to view Feature Flags.
        </p>
      </main>
    );
  }
  const canManage = ctx.can("feature_flag.write");
  const sp = await searchParams;
  const ok = asString(sp.ok);
  const error = asString(sp.error);
  const tabRaw = asString(sp.tab) as Tab | undefined;
  const tab: Tab = tabRaw && (TABS as readonly string[]).includes(tabRaw) ? tabRaw : "flags";
  const selectedKey = asString(sp.key);
  const search = asString(sp.search) ?? "";
  const typeFilter = asString(sp.type) as PlatformFlagType | undefined;
  const ownerFilter = asString(sp.owner);
  const envFilter = (asString(sp.env) as PlatformFlagEnv | undefined) ?? "PRODUCTION";
  const showArchived = asString(sp.archived) === "1";

  const data = await loadFlagsPage();
  const { kpis, flags, segments, settings, evals } = data;

  // Filter flags
  const filteredFlags = flags.filter((f) => {
    if (!showArchived && f.archived) return false;
    if (showArchived && !f.archived) return false;
    if (typeFilter && f.type !== typeFilter) return false;
    if (ownerFilter && f.ownerEmail !== ownerFilter) return false;
    if (search) {
      const hay = `${f.key} ${f.name} ${f.description ?? ""} ${f.tags.join(" ")}`.toLowerCase();
      if (!hay.includes(search.toLowerCase())) return false;
    }
    return true;
  });

  // Owners list (for filter)
  const owners = Array.from(new Set(flags.map((f) => f.ownerEmail).filter((e): e is string => !!e))).sort();

  // Selected flag detail
  const selectedFlag = selectedKey ? await loadFlagDetail(selectedKey) : null;

  // Activity (across all flags) — pulled from change rows.
  const recentChanges = tab === "activity"
    ? await fetchRecentChanges()
    : [];

  return (
    <main className="mx-auto w-full max-w-[1620px] px-6 py-6">
      <header className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[22px] font-semibold" style={{ color: "var(--text-default)" }}>Feature flags</h1>
          <p className="text-[12px]" style={{ color: "var(--text-muted)" }}>
            Centralized rollout control — flags · variants · segments · schedules · kill switches.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <FormOk msg={ok} />
          <FormError msg={error} />
        </div>
      </header>

      {/* KPI strip */}
      <section className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Kpi label="Total flags" value={String(kpis.totalFlags)} sub={`${kpis.archived} archived`} />
        <Kpi label="Live in prod" value={String(kpis.liveInProd)} sub={`${kpis.partialInProd} partial`} tone="good" />
        <Kpi label="Kill-switched" value={String(kpis.killSwitched)} sub={kpis.killSwitched > 0 ? "production OFF" : "—"} tone={kpis.killSwitched > 0 ? "danger" : "default"} />
        <Kpi label="Evaluations (24h)" value={kpis.evaluations24h.toLocaleString()} sub={`${kpis.scheduledChanges} scheduled · ${kpis.segments} segments`} />
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

      {tab === "flags" && (
        <FlagsTab
          flags={filteredFlags}
          allFlags={flags}
          owners={owners}
          search={search}
          typeFilter={typeFilter}
          ownerFilter={ownerFilter}
          envFilter={envFilter}
          showArchived={showArchived}
          canManage={canManage}
          selectedFlag={selectedFlag}
          segments={segments}
        />
      )}
      {tab === "segments" && (
        <SegmentsTab rows={segments} canManage={canManage} />
      )}
      {tab === "activity" && (
        <ActivityTab rows={recentChanges} evals={evals} />
      )}
      {tab === "settings" && (
        <SettingsTab settings={settings} canManage={canManage} />
      )}
    </main>
  );
}

/* ── Flags tab — split list + detail ───────────────────── */

function FlagsTab({
  flags, allFlags, owners, search, typeFilter, ownerFilter, envFilter, showArchived,
  canManage, selectedFlag, segments,
}: {
  flags: Awaited<ReturnType<typeof loadFlagsPage>>["flags"];
  allFlags: Awaited<ReturnType<typeof loadFlagsPage>>["flags"];
  owners: string[];
  search: string;
  typeFilter?: PlatformFlagType;
  ownerFilter?: string;
  envFilter: PlatformFlagEnv;
  showArchived: boolean;
  canManage: boolean;
  selectedFlag: Awaited<ReturnType<typeof loadFlagDetail>>;
  segments: Awaited<ReturnType<typeof loadFlagsPage>>["segments"];
}) {
  return (
    <section className="grid grid-cols-1 gap-4 xl:grid-cols-[400px_1fr]">
      {/* Left — flags list */}
      <aside className="rounded-xl border" style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)" }}>
        {/* Filters */}
        <form className="border-b p-3" style={{ borderColor: "var(--border-subtle)" }}>
          <input type="hidden" name="tab" value="flags" />
          <input
            name="search" placeholder="Search key, name, tag…"
            defaultValue={search}
            className="mb-2 w-full rounded-md border px-2 py-1.5 text-[12px]"
            style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)", color: "var(--text-default)" }}
          />
          <div className="mb-2 grid grid-cols-2 gap-2">
            <select name="type" defaultValue={typeFilter ?? ""}
                    className="rounded-md border px-2 py-1 text-[11px]"
                    style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)", color: "var(--text-default)" }}>
              <option value="">All types</option>
              {TYPES.map((t) => <option key={t} value={t}>{FLAG_TYPE_LABEL[t]}</option>)}
            </select>
            <select name="owner" defaultValue={ownerFilter ?? ""}
                    className="rounded-md border px-2 py-1 text-[11px]"
                    style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)", color: "var(--text-default)" }}>
              <option value="">All owners</option>
              {owners.map((o) => <option key={o} value={o}>{o}</option>)}
            </select>
          </div>
          <div className="flex items-center gap-2 text-[11px]">
            <select name="env" defaultValue={envFilter}
                    className="rounded-md border px-2 py-1 text-[11px]"
                    style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)", color: "var(--text-default)" }}>
              {ENVS.map((e) => <option key={e} value={e}>{FLAG_ENV_LABEL[e]}</option>)}
            </select>
            <label className="inline-flex items-center gap-1" style={{ color: "var(--text-muted)" }}>
              <input type="checkbox" name="archived" value="1" defaultChecked={showArchived} />
              Archived
            </label>
            <button type="submit"
                    className="ml-auto rounded-md px-2 py-1 text-[11px] font-medium"
                    style={{ background: "var(--accent-default)", color: "var(--accent-fg)" }}>
              Apply
            </button>
          </div>
        </form>
        {/* List */}
        <ul className="max-h-[680px] overflow-y-auto">
          {flags.length === 0 ? (
            <li className="p-5 text-center text-[12px]" style={{ color: "var(--text-muted)" }}>
              No flags match the current filters.
            </li>
          ) : flags.map((f) => {
            const active = selectedFlag && selectedFlag.id === f.id;
            const eff = effectiveRollout(
              f.prodEnabled, f.stagingEnabled, f.sandboxEnabled,
              f.prodRolloutPct, f.stagingRolloutPct, f.sandboxRolloutPct,
              f.killSwitchActive,
              envFilter,
            );
            return (
              <li key={f.id}>
                <a href={`?tab=flags&key=${encodeURIComponent(f.key)}&env=${envFilter}`}
                   className="block border-b px-3 py-2 transition hover:bg-[var(--surface-2)]"
                   style={{
                     borderColor: "var(--border-subtle)",
                     background: active ? "var(--accent-surface)" : "transparent",
                   }}>
                  <div className="flex items-center justify-between gap-2">
                    <code className="text-[12px] font-semibold tabular-nums" style={{ color: "var(--text-default)" }}>{f.key}</code>
                    <Pill tone={FLAG_TYPE_TONE[f.type]} label={FLAG_TYPE_LABEL[f.type]} />
                  </div>
                  <div className="text-[11px]" style={{ color: "var(--text-muted)" }}>{f.name}</div>
                  <div className="mt-1.5 flex items-center gap-2">
                    <div className="h-1.5 flex-1 overflow-hidden rounded-full" style={{ background: "var(--surface-2)" }}>
                      <div className="h-full rounded-full"
                           style={{
                             width: `${eff.pct}%`,
                             background: f.killSwitchActive ? "var(--rose-500)"
                                       : !eff.active ? "var(--surface-2)"
                                       : eff.pct >= 100 ? "var(--emerald-500)"
                                       : eff.pct > 0 ? "var(--amber-500)" : "var(--surface-2)",
                           }} />
                    </div>
                    <span className="text-[10px] tabular-nums" style={{ color: "var(--text-muted)" }}>
                      {f.killSwitchActive ? "KILL" : eff.active ? `${eff.pct}%` : "OFF"}
                    </span>
                  </div>
                  <div className="mt-1 flex items-center gap-2 text-[10px]" style={{ color: "var(--text-muted)" }}>
                    <span>{f.ownerEmail ?? "no owner"}</span>
                    <span>·</span>
                    <span>{relativeFromNow(f.updatedAt)}</span>
                    {f._count.rules > 0 && (<><span>·</span><span>{f._count.rules} rules</span></>)}
                  </div>
                </a>
              </li>
            );
          })}
        </ul>
        {canManage && (
          <div className="border-t p-3" style={{ borderColor: "var(--border-subtle)" }}>
            <details>
              <summary className="cursor-pointer text-[12px] font-semibold" style={{ color: "var(--text-default)" }}>
                + Create flag
              </summary>
              <FlagSaveForm canManage={canManage} />
            </details>
          </div>
        )}
      </aside>

      {/* Right — detail panel */}
      <div>
        {selectedFlag
          ? <FlagDetailPanel flag={selectedFlag} envFilter={envFilter} canManage={canManage} allFlags={allFlags} segments={segments} />
          : <EmptyDetail count={flags.length} />}
      </div>
    </section>
  );
}

function EmptyDetail({ count }: { count: number }) {
  return (
    <section className="rounded-xl border p-8 text-center"
             style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)" }}>
      <h3 className="text-[14px] font-semibold" style={{ color: "var(--text-default)" }}>Pick a flag</h3>
      <p className="text-[12px]" style={{ color: "var(--text-muted)" }}>
        {count === 0
          ? "No flags match the current filters."
          : "Select a flag from the left to inspect its targeting rules, variants, history, and code references."}
      </p>
    </section>
  );
}

/* ── Flag detail panel ─────────────────────────────────── */

function FlagDetailPanel({
  flag, envFilter, canManage, allFlags, segments,
}: {
  flag: NonNullable<Awaited<ReturnType<typeof loadFlagDetail>>>;
  envFilter: PlatformFlagEnv;
  canManage: boolean;
  allFlags: Awaited<ReturnType<typeof loadFlagsPage>>["flags"];
  segments: Awaited<ReturnType<typeof loadFlagsPage>>["segments"];
}) {
  const env = envFilter;
  const flagEvalSeries = flag.evaluationStats.filter((e) => e.env === env);
  const totalEvals = flagEvalSeries.reduce((s, e) => s + e.evaluations, 0);

  return (
    <article className="rounded-xl border" style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)" }}>
      {/* Header */}
      <header className="flex flex-wrap items-start gap-3 border-b px-5 py-4" style={{ borderColor: "var(--border-subtle)" }}>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <code className="text-[14px] font-semibold tabular-nums" style={{ color: "var(--text-default)" }}>{flag.key}</code>
            <Pill tone={FLAG_TYPE_TONE[flag.type]} label={FLAG_TYPE_LABEL[flag.type]} />
            {flag.killSwitchActive && (
              <Pill tone={{ bg: "var(--rose-100)", fg: "var(--rose-700)" }} label="Kill-switched" />
            )}
            {flag.archived && (
              <Pill tone={{ bg: "var(--surface-2)", fg: "var(--text-muted)" }} label="Archived" />
            )}
          </div>
          <h2 className="mt-0.5 text-[18px] font-semibold" style={{ color: "var(--text-default)" }}>{flag.name}</h2>
          {flag.description && (
            <p className="mt-1 text-[12px]" style={{ color: "var(--text-muted)" }}>{flag.description}</p>
          )}
          <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[11px]" style={{ color: "var(--text-muted)" }}>
            <span>Owner: <strong style={{ color: "var(--text-default)" }}>{flag.ownerEmail ?? "—"}</strong></span>
            <span>·</span><span>Updated {relativeFromNow(flag.updatedAt)}</span>
            <span>·</span><span>{flag.codeRefs.length} code refs</span>
            {flag.tags.length > 0 && (
              <>
                <span>·</span>
                {flag.tags.map((t) => (
                  <span key={t} className="inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px]"
                        style={{ background: "var(--surface-2)" }}>{t}</span>
                ))}
              </>
            )}
          </div>
        </div>
        {canManage && (
          <div className="flex items-center gap-2">
            {flag.archived ? (
              <form action={unarchiveFlag}>
                <input type="hidden" name="id" value={flag.id} />
                <button type="submit"
                        className="rounded-md border px-2 py-1 text-[11px] font-medium"
                        style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)", color: "var(--text-default)" }}>
                  Restore
                </button>
              </form>
            ) : (
              <form action={archiveFlag}>
                <input type="hidden" name="id" value={flag.id} />
                <button type="submit"
                        className="rounded-md border px-2 py-1 text-[11px] font-medium"
                        style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)", color: "var(--text-muted)" }}>
                  Archive
                </button>
              </form>
            )}
          </div>
        )}
      </header>

      {/* Env rollout cards */}
      <section className="grid grid-cols-1 gap-3 border-b p-5 md:grid-cols-3" style={{ borderColor: "var(--border-subtle)" }}>
        {(["PRODUCTION", "STAGING", "SANDBOX"] as PlatformFlagEnv[]).map((e) => {
          const eff = effectiveRollout(
            flag.prodEnabled, flag.stagingEnabled, flag.sandboxEnabled,
            flag.prodRolloutPct, flag.stagingRolloutPct, flag.sandboxRolloutPct,
            flag.killSwitchActive, e,
          );
          const pct = e === "PRODUCTION" ? flag.prodRolloutPct
                    : e === "STAGING"    ? flag.stagingRolloutPct
                    : flag.sandboxRolloutPct;
          const enabled = e === "PRODUCTION" ? flag.prodEnabled
                        : e === "STAGING"    ? flag.stagingEnabled
                        : flag.sandboxEnabled;
          return (
            <div key={e} className="rounded-lg border p-3"
                 style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)" }}>
              <div className="mb-1 flex items-center justify-between">
                <Pill tone={FLAG_ENV_TONE[e]} label={FLAG_ENV_LABEL[e]} />
                <span className="text-[11px] tabular-nums" style={{ color: eff.active ? "var(--emerald-700)" : "var(--text-muted)" }}>
                  {flag.killSwitchActive && e === "PRODUCTION" ? "KILL" : eff.active ? `${eff.pct}%` : "OFF"}
                </span>
              </div>
              <div className="mb-2 h-2 overflow-hidden rounded-full" style={{ background: "var(--surface-2)" }}>
                <div className="h-full rounded-full"
                     style={{
                       width: `${eff.pct}%`,
                       background: flag.killSwitchActive && e === "PRODUCTION" ? "var(--rose-500)"
                                 : !eff.active ? "var(--surface-2)"
                                 : eff.pct >= 100 ? "var(--emerald-500)"
                                 : "var(--amber-500)",
                     }} />
              </div>
              {canManage && (
                <form action={saveRollout} className="flex items-center gap-1">
                  <input type="hidden" name="flagId" value={flag.id} />
                  <input type="hidden" name="env" value={e} />
                  <label className="inline-flex items-center gap-1 text-[11px]" style={{ color: "var(--text-muted)" }}>
                    <input type="checkbox" name="enabled" defaultChecked={enabled} />
                    on
                  </label>
                  <input name="rolloutPct" type="number" min={0} max={100} defaultValue={pct}
                         className="w-16 rounded-md border px-1.5 py-1 text-[11px] tabular-nums"
                         style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)", color: "var(--text-default)" }} />
                  <button type="submit"
                          className="ml-auto rounded-md px-2 py-1 text-[11px] font-medium"
                          style={{ background: "var(--accent-default)", color: "var(--accent-fg)" }}>
                    Save
                  </button>
                </form>
              )}
            </div>
          );
        })}
      </section>

      {/* Kill switch */}
      {canManage && (
        <section className="flex flex-wrap items-center justify-between gap-3 border-b px-5 py-3"
                 style={{ borderColor: "var(--border-subtle)", background: flag.killSwitchActive ? "var(--rose-50)" : "transparent" }}>
          <div>
            <h3 className="text-[12px] font-semibold" style={{ color: flag.killSwitchActive ? "var(--rose-700)" : "var(--text-default)" }}>
              {flag.killSwitchActive ? "Kill switch is ENGAGED — production OFF" : "Kill switch"}
            </h3>
            <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>
              Type <code className="rounded px-1 py-0.5" style={{ background: "var(--surface-2)" }}>KILL-{flag.key}</code> to confirm.
            </p>
          </div>
          <form action={setKillSwitch} className="flex items-center gap-2">
            <input type="hidden" name="flagId" value={flag.id} />
            <input type="hidden" name="key" value={flag.key} />
            <input type="hidden" name="enable" value={flag.killSwitchActive ? "off" : "on"} />
            <input name="confirm" placeholder={`KILL-${flag.key}`}
                   className="w-44 rounded-md border px-2 py-1 text-[11px] tabular-nums"
                   style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)", color: "var(--text-default)" }} />
            <button type="submit"
                    className="rounded-md px-3 py-1.5 text-[11px] font-semibold"
                    style={{
                      background: flag.killSwitchActive ? "var(--accent-default)" : "var(--rose-600)",
                      color: flag.killSwitchActive ? "var(--accent-fg)" : "white",
                    }}>
              {flag.killSwitchActive ? "Restore" : "Engage kill switch"}
            </button>
          </form>
        </section>
      )}

      {/* Targeting rules */}
      <section className="border-b p-5" style={{ borderColor: "var(--border-subtle)" }}>
        <h3 className="mb-2 text-[13px] font-semibold" style={{ color: "var(--text-default)" }}>
          Targeting rules — {FLAG_ENV_LABEL[env]}
        </h3>
        {flag.rules.filter((r) => r.env === env).length === 0 ? (
          <Empty>No rules for {FLAG_ENV_LABEL[env]} — falls back to default value <code>{flag.defaultValue}</code>.</Empty>
        ) : (
          <ol className="space-y-2">
            {flag.rules.filter((r) => r.env === env).sort((a, b) => a.order - b.order).map((r) => {
              let conditions: Array<{ attr: string; op: string; value: unknown }> = [];
              const v = r.conditionsJson;
              if (Array.isArray(v)) conditions = v as typeof conditions;
              return (
                <li key={r.id} className="rounded-lg border p-3"
                    style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)" }}>
                  <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="rounded-md px-1.5 py-0.5 text-[10px] font-semibold tabular-nums"
                            style={{ background: "var(--surface-2)" }}>#{r.order + 1}</span>
                      <span className="text-[12px] font-medium" style={{ color: "var(--text-default)" }}>
                        {r.description || "Rule"}
                      </span>
                      {!r.active && <Pill tone={{ bg: "var(--surface-2)", fg: "var(--text-muted)" }} label="Inactive" />}
                    </div>
                    {canManage && (
                      <form action={deleteRule}>
                        <input type="hidden" name="id" value={r.id} />
                        <input type="hidden" name="flagKey" value={flag.key} />
                        <button type="submit" className="text-[11px] underline" style={{ color: "var(--text-muted)" }}>Remove</button>
                      </form>
                    )}
                  </div>
                  <div className="text-[11px]" style={{ color: "var(--text-muted)" }}>
                    IF&nbsp;
                    {conditions.length === 0 ? <em>always</em> : conditions.map((c, i) => (
                      <span key={i}>
                        {i > 0 ? " AND " : ""}
                        <code className="rounded px-1 py-0.5" style={{ background: "var(--surface-2)", color: "var(--text-default)" }}>
                          {c.attr} {c.op} {JSON.stringify(c.value)}
                        </code>
                      </span>
                    ))}
                    {" "}THEN value = <strong style={{ color: "var(--text-default)" }}>{r.returnValue}</strong>
                  </div>
                </li>
              );
            })}
          </ol>
        )}
        {canManage && (
          <details className="mt-3">
            <summary className="cursor-pointer text-[12px] font-semibold" style={{ color: "var(--text-default)" }}>
              + Add rule
            </summary>
            <form action={saveRule} className="mt-2 grid grid-cols-2 gap-2 md:grid-cols-4">
              <input type="hidden" name="flagId" value={flag.id} />
              <input type="hidden" name="env" value={env} />
              <Input name="order" type="number" label="Order" defaultValue={String(flag.rules.filter(r => r.env === env).length)} />
              <Input name="returnValue" label="Return value" defaultValue={flag.type === "BOOLEAN" ? "true" : ""} />
              <Input name="description" label="Description" defaultValue="" />
              <label className="inline-flex items-center gap-2 text-[12px]" style={{ color: "var(--text-default)" }}>
                <input type="checkbox" name="active" defaultChecked /> Active
              </label>
              <label className="md:col-span-4 block">
                <span className="mb-0.5 block text-[11px] font-medium" style={{ color: "var(--text-muted)" }}>
                  Conditions JSON (array of {`{ attr, op, value }`})
                </span>
                <textarea name="conditionsJson" rows={3}
                          defaultValue='[{"attr": "plan", "op": "EQUALS", "value": "PRO"}]'
                          className="w-full rounded-md border px-2 py-1.5 text-[12px] font-mono"
                          style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)", color: "var(--text-default)" }} />
              </label>
              <div className="md:col-span-4 flex justify-end">
                <button type="submit" className="inline-flex h-8 items-center rounded-md px-3 text-[12px] font-medium"
                        style={{ background: "var(--accent-default)", color: "var(--accent-fg)" }}>
                  Save rule
                </button>
              </div>
            </form>
          </details>
        )}
      </section>

      {/* Variants (only for non-boolean) */}
      {flag.type !== "BOOLEAN" && (
        <section className="border-b p-5" style={{ borderColor: "var(--border-subtle)" }}>
          <h3 className="mb-2 text-[13px] font-semibold" style={{ color: "var(--text-default)" }}>Variants</h3>
          {flag.variants.length === 0
            ? <Empty>No variants defined yet.</Empty>
            : (
              <ul className="space-y-2">
                {flag.variants.map((v) => (
                  <li key={v.id} className="flex flex-wrap items-center gap-3 rounded-lg border p-3"
                      style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)" }}>
                    <code className="text-[12px] font-semibold" style={{ color: "var(--text-default)" }}>{v.key}</code>
                    <span className="text-[11px]" style={{ color: "var(--text-muted)" }}>= <code>{v.value}</code></span>
                    <div className="h-1.5 w-24 overflow-hidden rounded-full" style={{ background: "var(--surface-2)" }}>
                      <div className="h-full rounded-full"
                           style={{ width: `${v.weightPct}%`, background: "var(--emerald-500)" }} />
                    </div>
                    <span className="text-[11px] tabular-nums" style={{ color: "var(--text-default)" }}>{v.weightPct}%</span>
                    {v.description && <span className="text-[11px]" style={{ color: "var(--text-muted)" }}>· {v.description}</span>}
                    {canManage && (
                      <form action={deleteVariant} className="ml-auto">
                        <input type="hidden" name="id" value={v.id} />
                        <input type="hidden" name="flagKey" value={flag.key} />
                        <button type="submit" className="text-[11px] underline" style={{ color: "var(--text-muted)" }}>Delete</button>
                      </form>
                    )}
                  </li>
                ))}
              </ul>
            )}
          {canManage && (
            <details className="mt-3">
              <summary className="cursor-pointer text-[12px] font-semibold" style={{ color: "var(--text-default)" }}>
                + Add variant
              </summary>
              <form action={saveVariant} className="mt-2 grid grid-cols-2 gap-2 md:grid-cols-4">
                <input type="hidden" name="flagId" value={flag.id} />
                <Input name="key" label="Variant key" defaultValue="" />
                <Input name="value" label="Value" defaultValue="" />
                <Input name="weightPct" type="number" label="Weight %" defaultValue="50" />
                <Input name="description" label="Description" defaultValue="" />
                <div className="md:col-span-4 flex justify-end">
                  <button type="submit" className="inline-flex h-8 items-center rounded-md px-3 text-[12px] font-medium"
                          style={{ background: "var(--accent-default)", color: "var(--accent-fg)" }}>
                    Save variant
                  </button>
                </div>
              </form>
            </details>
          )}
        </section>
      )}

      {/* Schedule */}
      <section className="border-b p-5" style={{ borderColor: "var(--border-subtle)" }}>
        <h3 className="mb-2 text-[13px] font-semibold" style={{ color: "var(--text-default)" }}>Scheduled rollout</h3>
        {flag.scheduleSteps.length === 0
          ? <Empty>No scheduled steps.</Empty>
          : (
            <ol className="space-y-1.5">
              {flag.scheduleSteps.map((s) => (
                <li key={s.id} className="flex flex-wrap items-center gap-2 rounded-lg border p-2"
                    style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)" }}>
                  <Pill tone={FLAG_ENV_TONE[s.env]} label={FLAG_ENV_LABEL[s.env]} />
                  <span className="text-[12px] tabular-nums" style={{ color: "var(--text-default)" }}>→ {s.rolloutPct}%</span>
                  <span className="text-[11px]" style={{ color: "var(--text-muted)" }}>
                    {s.appliedAt ? `applied ${relativeFromNow(s.appliedAt)}` : `scheduled ${relativeFromNow(s.scheduledAt)}`}
                  </span>
                  {s.notes && <span className="text-[11px]" style={{ color: "var(--text-muted)" }}>· {s.notes}</span>}
                  {canManage && (
                    <form action={deleteScheduleStep} className="ml-auto">
                      <input type="hidden" name="id" value={s.id} />
                      <input type="hidden" name="flagKey" value={flag.key} />
                      <button type="submit" className="text-[11px] underline" style={{ color: "var(--text-muted)" }}>Remove</button>
                    </form>
                  )}
                </li>
              ))}
            </ol>
          )}
        {canManage && (
          <details className="mt-3">
            <summary className="cursor-pointer text-[12px] font-semibold" style={{ color: "var(--text-default)" }}>
              + Schedule step
            </summary>
            <form action={saveScheduleStep} className="mt-2 grid grid-cols-2 gap-2 md:grid-cols-4">
              <input type="hidden" name="flagId" value={flag.id} />
              <Select name="env" label="Environment" options={ENVS.map((e) => ({ value: e, label: FLAG_ENV_LABEL[e] }))} />
              <Input name="rolloutPct" type="number" label="Rollout %" defaultValue="50" />
              <Input name="scheduledAt" type="datetime-local" label="Apply at" defaultValue="" />
              <Input name="notes" label="Notes" defaultValue="" />
              <div className="md:col-span-4 flex justify-end">
                <button type="submit" className="inline-flex h-8 items-center rounded-md px-3 text-[12px] font-medium"
                        style={{ background: "var(--accent-default)", color: "var(--accent-fg)" }}>
                  Schedule step
                </button>
              </div>
            </form>
          </details>
        )}
      </section>

      {/* Dependencies */}
      <section className="border-b p-5" style={{ borderColor: "var(--border-subtle)" }}>
        <h3 className="mb-2 text-[13px] font-semibold" style={{ color: "var(--text-default)" }}>Dependencies</h3>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <div>
            <h4 className="mb-1 text-[11px] font-semibold uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>Depends on</h4>
            {flag.dependsOn.length === 0
              ? <Empty>This flag has no upstream dependencies.</Empty>
              : (
                <ul className="space-y-1">
                  {flag.dependsOn.map((d) => (
                    <li key={d.id} className="flex items-center gap-2 text-[12px]">
                      <a href={`?tab=flags&key=${encodeURIComponent(d.dependsOn.key)}`}
                         className="font-medium underline"
                         style={{ color: "var(--text-default)" }}>{d.dependsOn.key}</a>
                      {d.reason && <span className="text-[11px]" style={{ color: "var(--text-muted)" }}>· {d.reason}</span>}
                      {canManage && (
                        <form action={deleteDependency} className="ml-auto">
                          <input type="hidden" name="id" value={d.id} />
                          <input type="hidden" name="flagKey" value={flag.key} />
                          <button type="submit" className="text-[10px] underline" style={{ color: "var(--text-muted)" }}>Remove</button>
                        </form>
                      )}
                    </li>
                  ))}
                </ul>
              )}
          </div>
          <div>
            <h4 className="mb-1 text-[11px] font-semibold uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>Required by</h4>
            {flag.dependents.length === 0
              ? <Empty>Nothing depends on this flag.</Empty>
              : (
                <ul className="space-y-1">
                  {flag.dependents.map((d) => (
                    <li key={d.id} className="text-[12px]">
                      <a href={`?tab=flags&key=${encodeURIComponent(d.flag.key)}`}
                         className="font-medium underline"
                         style={{ color: "var(--text-default)" }}>{d.flag.key}</a>
                      {d.reason && <span className="text-[11px]" style={{ color: "var(--text-muted)" }}> · {d.reason}</span>}
                    </li>
                  ))}
                </ul>
              )}
          </div>
        </div>
        {canManage && (
          <details className="mt-3">
            <summary className="cursor-pointer text-[12px] font-semibold" style={{ color: "var(--text-default)" }}>
              + Add upstream dependency
            </summary>
            <form action={addDependency} className="mt-2 grid grid-cols-2 gap-2 md:grid-cols-3">
              <input type="hidden" name="flagId" value={flag.id} />
              <Select name="dependsOnId" label="Depends on"
                      options={allFlags.filter((f) => f.id !== flag.id).map((f) => ({ value: f.id, label: f.key }))} />
              <Input name="reason" label="Reason (optional)" defaultValue="" />
              <div className="md:col-span-3 flex justify-end">
                <button type="submit" className="inline-flex h-8 items-center rounded-md px-3 text-[12px] font-medium"
                        style={{ background: "var(--accent-default)", color: "var(--accent-fg)" }}>
                  Add dependency
                </button>
              </div>
            </form>
          </details>
        )}
      </section>

      {/* Code refs */}
      <section className="border-b p-5" style={{ borderColor: "var(--border-subtle)" }}>
        <h3 className="mb-2 text-[13px] font-semibold" style={{ color: "var(--text-default)" }}>
          Code references <span className="text-[11px] font-normal" style={{ color: "var(--text-muted)" }}>({flag.codeRefs.length})</span>
        </h3>
        {flag.codeRefs.length === 0
          ? <Empty>No code references found.</Empty>
          : (
            <ul className="max-h-60 space-y-1 overflow-y-auto">
              {flag.codeRefs.map((r) => (
                <li key={r.id} className="flex flex-wrap items-center gap-2 text-[11px]" style={{ color: "var(--text-muted)" }}>
                  <code className="tabular-nums" style={{ color: "var(--text-default)" }}>{r.filePath}:{r.lineNumber}</code>
                  <span>· {r.branchName}@{r.commitSha.slice(0, 7)}</span>
                  <span>· {relativeFromNow(r.lastSeenAt)}</span>
                </li>
              ))}
            </ul>
          )}
      </section>

      {/* Metrics — SVG line chart of evaluations */}
      <section className="border-b p-5" style={{ borderColor: "var(--border-subtle)" }}>
        <h3 className="mb-2 text-[13px] font-semibold" style={{ color: "var(--text-default)" }}>
          Evaluations — last 30 days · {FLAG_ENV_LABEL[env]}
        </h3>
        {flagEvalSeries.length === 0
          ? <Empty>No evaluation data yet.</Empty>
          : (
            <div>
              <EvalSparkline series={flagEvalSeries.map((e) => ({ day: e.day.toISOString().slice(0, 10), evaluations: e.evaluations }))} />
              <div className="mt-2 text-[11px]" style={{ color: "var(--text-muted)" }}>
                Total: <strong className="tabular-nums" style={{ color: "var(--text-default)" }}>{totalEvals.toLocaleString()}</strong>
              </div>
            </div>
          )}
      </section>

      {/* Change history */}
      <section className="p-5">
        <h3 className="mb-2 text-[13px] font-semibold" style={{ color: "var(--text-default)" }}>Change history</h3>
        {flag.changeHistory.length === 0
          ? <Empty>No history yet.</Empty>
          : (
            <ol className="max-h-72 space-y-1.5 overflow-y-auto">
              {flag.changeHistory.map((c) => (
                <li key={c.id} className="flex flex-wrap items-center gap-2 text-[11px]">
                  <Pill tone={FLAG_CHANGE_TONE[c.kind]} label={FLAG_CHANGE_LABEL[c.kind]} />
                  {c.env && <Pill tone={FLAG_ENV_TONE[c.env]} label={FLAG_ENV_LABEL[c.env]} />}
                  <span style={{ color: "var(--text-default)" }}>{c.summary}</span>
                  <span style={{ color: "var(--text-muted)" }}>· {c.actorEmail} · {relativeFromNow(c.createdAt)}</span>
                </li>
              ))}
            </ol>
          )}
      </section>

      {/* Edit flag form */}
      {canManage && (
        <section className="border-t p-5" style={{ borderColor: "var(--border-subtle)" }}>
          <details>
            <summary className="cursor-pointer text-[12px] font-semibold" style={{ color: "var(--text-default)" }}>
              Edit flag basics
            </summary>
            <FlagSaveForm canManage={canManage} flag={flag} />
          </details>
        </section>
      )}

      {/* Hint about segments */}
      {segments.length > 0 && (
        <section className="border-t px-5 py-3 text-[11px]" style={{ borderColor: "var(--border-subtle)", color: "var(--text-muted)" }}>
          {segments.length} segment{segments.length === 1 ? "" : "s"} available for use in rule conditions —
          {" "}see the <a href="?tab=segments" className="underline">Segments tab</a>.
        </section>
      )}
    </article>
  );
}

/* ── Segments tab ─────────────────────────────────────── */

function SegmentsTab({
  rows, canManage,
}: {
  rows: Awaited<ReturnType<typeof loadFlagsPage>>["segments"];
  canManage: boolean;
}) {
  return (
    <section className="rounded-xl border" style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)" }}>
      <header className="border-b px-4 py-3" style={{ borderColor: "var(--border-subtle)" }}>
        <h3 className="text-[13px] font-semibold" style={{ color: "var(--text-default)" }}>Segments</h3>
        <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>
          {rows.length} named tenant/user groups · reference these from rule conditions via <code>segment IN [&quot;key&quot;]</code>.
        </p>
      </header>
      <div className="overflow-x-auto p-4">
        {rows.length === 0 ? <Empty>No segments yet.</Empty> : (
          <table className="w-full">
            <thead>
              <tr style={{ color: "var(--text-muted)" }}>
                <Th>Key</Th><Th>Name</Th><Th>Tenant IDs</Th><Th>User emails</Th><Th>Updated</Th>
                {canManage && <Th right>Delete</Th>}
              </tr>
            </thead>
            <tbody>
              {rows.map((s) => (
                <tr key={s.id} className="border-t" style={{ borderColor: "var(--border-subtle)" }}>
                  <Td><code className="text-[12px] tabular-nums" style={{ color: "var(--text-default)" }}>{s.key}</code></Td>
                  <Td>
                    <div className="text-[12px] font-medium" style={{ color: "var(--text-default)" }}>{s.name}</div>
                    {s.description && <div className="text-[11px]" style={{ color: "var(--text-muted)" }}>{s.description}</div>}
                  </Td>
                  <Td><Num n={s.tenantIds.length} /></Td>
                  <Td><Num n={s.userEmails.length} /></Td>
                  <Td><span className="text-[11px] tabular-nums" style={{ color: "var(--text-muted)" }}>{relativeFromNow(s.updatedAt)}</span></Td>
                  {canManage && (
                    <Td right>
                      <form action={deleteSegment}>
                        <input type="hidden" name="id" value={s.id} />
                        <button type="submit" className="text-[11px] font-medium underline" style={{ color: "var(--text-muted)" }}>Delete</button>
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
              + Save segment
            </summary>
            <form action={saveSegment} className="mt-3 grid grid-cols-2 gap-2 md:grid-cols-3">
              <Input name="key" label="Segment key" defaultValue="" />
              <Input name="name" label="Display name" defaultValue="" />
              <Input name="description" label="Description" defaultValue="" />
              <label className="md:col-span-3 block">
                <span className="mb-0.5 block text-[11px] font-medium" style={{ color: "var(--text-muted)" }}>
                  Tenant IDs (comma or newline-separated)
                </span>
                <textarea name="tenantIds" rows={2}
                          className="w-full rounded-md border px-2 py-1.5 text-[12px] font-mono"
                          style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)", color: "var(--text-default)" }} />
              </label>
              <label className="md:col-span-3 block">
                <span className="mb-0.5 block text-[11px] font-medium" style={{ color: "var(--text-muted)" }}>
                  User emails (comma or newline-separated)
                </span>
                <textarea name="userEmails" rows={2}
                          className="w-full rounded-md border px-2 py-1.5 text-[12px] font-mono"
                          style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)", color: "var(--text-default)" }} />
              </label>
              <div className="md:col-span-3 flex justify-end">
                <button type="submit" className="inline-flex h-8 items-center rounded-md px-3 text-[12px] font-medium"
                        style={{ background: "var(--accent-default)", color: "var(--accent-fg)" }}>
                  Save segment
                </button>
              </div>
            </form>
          </details>
        </div>
      )}
    </section>
  );
}

/* ── Activity tab ──────────────────────────────────────── */

function ActivityTab({
  rows, evals,
}: {
  rows: Array<{
    id: string; kind: PlatformFlagChangeKind; summary: string;
    actorEmail: string; env: PlatformFlagEnv | null;
    createdAt: Date; flagKey: string; flagName: string;
  }>;
  evals: Awaited<ReturnType<typeof loadFlagsPage>>["evals"];
}) {
  return (
    <section className="grid grid-cols-1 gap-4 xl:grid-cols-[1fr_360px]">
      <div className="rounded-xl border" style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)" }}>
        <header className="border-b px-4 py-3" style={{ borderColor: "var(--border-subtle)" }}>
          <h3 className="text-[13px] font-semibold" style={{ color: "var(--text-default)" }}>Recent activity</h3>
          <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>{rows.length} recent change events across all flags.</p>
        </header>
        <div className="overflow-x-auto p-4">
          {rows.length === 0 ? <Empty>No activity yet.</Empty> : (
            <ol className="space-y-2">
              {rows.map((r) => (
                <li key={r.id} className="flex flex-wrap items-center gap-2 text-[11px]"
                    style={{ color: "var(--text-default)" }}>
                  <Pill tone={FLAG_CHANGE_TONE[r.kind]} label={FLAG_CHANGE_LABEL[r.kind]} />
                  {r.env && <Pill tone={FLAG_ENV_TONE[r.env]} label={FLAG_ENV_LABEL[r.env]} />}
                  <a href={`?tab=flags&key=${encodeURIComponent(r.flagKey)}`} className="font-semibold underline">{r.flagKey}</a>
                  <span style={{ color: "var(--text-muted)" }}>· {r.summary}</span>
                  <span className="ml-auto text-[10px]" style={{ color: "var(--text-muted)" }}>{r.actorEmail} · {relativeFromNow(r.createdAt)}</span>
                </li>
              ))}
            </ol>
          )}
        </div>
      </div>
      <div className="rounded-xl border" style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)" }}>
        <header className="border-b px-4 py-3" style={{ borderColor: "var(--border-subtle)" }}>
          <h3 className="text-[13px] font-semibold" style={{ color: "var(--text-default)" }}>Top flags by evaluations (30d)</h3>
        </header>
        <ul className="space-y-1 p-3 text-[11px]">
          {evals.topFlags.length === 0
            ? <li style={{ color: "var(--text-muted)" }}>No evaluations recorded.</li>
            : evals.topFlags.map((f) => (
              <li key={f.key} className="flex items-center justify-between gap-2">
                <a href={`?tab=flags&key=${encodeURIComponent(f.key)}`} className="truncate underline">{f.key}</a>
                <span className="tabular-nums" style={{ color: "var(--text-muted)" }}>{f.evaluations.toLocaleString()}</span>
              </li>
            ))}
        </ul>
      </div>
    </section>
  );
}

/* ── Settings tab ──────────────────────────────────────── */

function SettingsTab({
  settings, canManage,
}: {
  settings: Awaited<ReturnType<typeof loadFlagsPage>>["settings"];
  canManage: boolean;
}) {
  const s = settings ?? {
    defaultEnv: "PRODUCTION" as PlatformFlagEnv,
    propagationTargetSec: 5,
    approvalRequiredForKill: true,
    autoArchiveStaleDays: 0,
    notes: null,
  };
  return (
    <section className="rounded-xl border" style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)" }}>
      <header className="border-b px-4 py-3" style={{ borderColor: "var(--border-subtle)" }}>
        <h3 className="text-[13px] font-semibold" style={{ color: "var(--text-default)" }}>Program settings</h3>
        <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>Defaults applied across all flags.</p>
      </header>
      <form action={saveFlagSettings} className="grid grid-cols-2 gap-3 p-4 md:grid-cols-3">
        <Select name="defaultEnv" label="Default environment" defaultValue={s.defaultEnv}
                options={ENVS.map((e) => ({ value: e, label: FLAG_ENV_LABEL[e] }))} />
        <Input name="propagationTargetSec" type="number" label="Propagation target (sec)" defaultValue={String(s.propagationTargetSec)} />
        <Input name="autoArchiveStaleDays" type="number" label="Auto-archive after N days idle (0 = off)" defaultValue={String(s.autoArchiveStaleDays)} />
        <label className="inline-flex items-center gap-2 text-[12px]" style={{ color: "var(--text-default)" }}>
          <input type="checkbox" name="approvalRequiredForKill" defaultChecked={s.approvalRequiredForKill} /> Require approval for kill switch
        </label>
        <label className="md:col-span-3 block">
          <span className="mb-0.5 block text-[11px] font-medium" style={{ color: "var(--text-muted)" }}>Notes</span>
          <textarea name="notes" rows={3} defaultValue={s.notes ?? ""}
                    className="w-full rounded-md border px-2 py-1.5 text-[12px]"
                    style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)", color: "var(--text-default)" }} />
        </label>
        {canManage && (
          <div className="md:col-span-3 flex justify-end">
            <button type="submit"
                    className="inline-flex h-8 items-center rounded-md px-3 text-[12px] font-medium"
                    style={{ background: "var(--accent-default)", color: "var(--accent-fg)" }}>
              Save settings
            </button>
          </div>
        )}
      </form>
    </section>
  );
}

/* ── Reusable form components ──────────────────────────── */

function FlagSaveForm({
  canManage, flag,
}: {
  canManage: boolean;
  flag?: NonNullable<Awaited<ReturnType<typeof loadFlagDetail>>>;
}) {
  if (!canManage) return null;
  return (
    <form action={saveFlag} className="mt-2 grid grid-cols-2 gap-2 md:grid-cols-3">
      <Input name="key" label="Flag key" defaultValue={flag?.key ?? ""} />
      <Input name="name" label="Display name" defaultValue={flag?.name ?? ""} />
      <Select name="type" label="Type" defaultValue={flag?.type ?? "BOOLEAN"}
              options={TYPES.map((t) => ({ value: t, label: FLAG_TYPE_LABEL[t] }))} />
      <Input name="ownerEmail" label="Owner email" defaultValue={flag?.ownerEmail ?? ""} />
      <Input name="defaultValue" label="Default value" defaultValue={flag?.defaultValue ?? "false"} />
      <Input name="tags" label="Tags (comma-separated)" defaultValue={(flag?.tags ?? []).join(", ")} />
      <Input name="prodRolloutPct" type="number" label="Prod rollout %" defaultValue={String(flag?.prodRolloutPct ?? 0)} />
      <Input name="stagingRolloutPct" type="number" label="Staging rollout %" defaultValue={String(flag?.stagingRolloutPct ?? 100)} />
      <Input name="sandboxRolloutPct" type="number" label="Sandbox rollout %" defaultValue={String(flag?.sandboxRolloutPct ?? 100)} />
      <label className="inline-flex items-center gap-2 text-[12px]" style={{ color: "var(--text-default)" }}>
        <input type="checkbox" name="prodEnabled" defaultChecked={flag?.prodEnabled ?? false} /> Prod enabled
      </label>
      <label className="inline-flex items-center gap-2 text-[12px]" style={{ color: "var(--text-default)" }}>
        <input type="checkbox" name="stagingEnabled" defaultChecked={flag?.stagingEnabled ?? true} /> Staging enabled
      </label>
      <label className="inline-flex items-center gap-2 text-[12px]" style={{ color: "var(--text-default)" }}>
        <input type="checkbox" name="sandboxEnabled" defaultChecked={flag?.sandboxEnabled ?? true} /> Sandbox enabled
      </label>
      <label className="md:col-span-3 block">
        <span className="mb-0.5 block text-[11px] font-medium" style={{ color: "var(--text-muted)" }}>Description</span>
        <input name="description" defaultValue={flag?.description ?? ""}
               className="w-full rounded-md border px-2 py-1.5 text-[12px]"
               style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)", color: "var(--text-default)" }} />
      </label>
      <label className="md:col-span-3 block">
        <span className="mb-0.5 block text-[11px] font-medium" style={{ color: "var(--text-muted)" }}>Notes (admin-only)</span>
        <textarea name="notes" rows={2} defaultValue={flag?.notes ?? ""}
                  className="w-full rounded-md border px-2 py-1.5 text-[12px]"
                  style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)", color: "var(--text-default)" }} />
      </label>
      <div className="md:col-span-3 flex justify-end">
        <button type="submit"
                className="inline-flex h-8 items-center rounded-md px-3 text-[12px] font-medium"
                style={{ background: "var(--accent-default)", color: "var(--accent-fg)" }}>
          {flag ? "Save flag" : "Create flag"}
        </button>
      </div>
    </form>
  );
}

/* ── Async helper — recent changes across flags ────────── */

async function fetchRecentChanges() {
  const { db } = await import("@/lib/db");
  const rows = await db.platformFlagChange.findMany({
    orderBy: { createdAt: "desc" },
    take: 80,
    include: { flag: { select: { key: true, name: true } } },
  });
  return rows.map((r) => ({
    id: r.id, kind: r.kind, summary: r.summary,
    actorEmail: r.actorEmail, env: r.env,
    createdAt: r.createdAt,
    flagKey: r.flag.key, flagName: r.flag.name,
  }));
}

/* ── Reusable UI primitives ────────────────────────────── */

function Kpi({
  label, value, sub, tone = "default",
}: {
  label: string; value: string; sub?: string;
  tone?: "default" | "good" | "warning" | "danger";
}) {
  const palette = tone === "good"    ? { fg: "var(--emerald-700)", chip: "var(--emerald-100)" }
                : tone === "warning" ? { fg: "var(--amber-700)",   chip: "var(--amber-100)" }
                : tone === "danger"  ? { fg: "var(--rose-700)",    chip: "var(--rose-100)" }
                :                      { fg: "var(--text-default)", chip: "var(--surface-2)" };
  return (
    <div className="rounded-xl border p-3"
         style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)" }}>
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>
          {label}
        </span>
        <span className="inline-flex h-5 w-5 items-center justify-center rounded-full text-[10px]"
              style={{ background: palette.chip }} />
      </div>
      <div className="mt-1 text-[20px] font-semibold tabular-nums" style={{ color: palette.fg }}>{value}</div>
      {sub && <div className="text-[11px]" style={{ color: "var(--text-muted)" }}>{sub}</div>}
    </div>
  );
}

function Pill({ tone, label }: { tone: { bg: string; fg: string }; label: string }) {
  return (
    <span className="inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-semibold"
          style={{ background: tone.bg, color: tone.fg }}>{label}</span>
  );
}

function Num({ n }: { n: number }) {
  return <span className="text-[12px] tabular-nums" style={{ color: "var(--text-default)" }}>{n.toLocaleString()}</span>;
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-dashed p-4 text-center text-[12px]"
         style={{ borderColor: "var(--border-subtle)", color: "var(--text-muted)" }}>
      {children}
    </div>
  );
}

function Th({ children, right = false }: { children: React.ReactNode; right?: boolean }) {
  return (
    <th className="px-2 py-1.5 text-[11px] font-semibold uppercase tracking-wide"
        style={{ textAlign: right ? "right" : "left", color: "var(--text-muted)" }}>
      {children}
    </th>
  );
}

function Td({ children, right = false }: { children: React.ReactNode; right?: boolean }) {
  return (
    <td className="px-2 py-1.5"
        style={{ textAlign: right ? "right" : "left", verticalAlign: "top" }}>
      {children}
    </td>
  );
}

function Input({
  name, label, defaultValue, type = "text", required,
}: {
  name: string; label: string; defaultValue?: string;
  type?: "text" | "number" | "date" | "datetime-local" | "email";
  required?: boolean;
}) {
  return (
    <label className="block">
      <span className="mb-0.5 block text-[11px] font-medium" style={{ color: "var(--text-muted)" }}>{label}</span>
      <input name={name} type={type} defaultValue={defaultValue} required={required}
             className="w-full rounded-md border px-2 py-1.5 text-[12px]"
             style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)", color: "var(--text-default)" }} />
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
      <select name={name} defaultValue={defaultValue}
              className="w-full rounded-md border px-2 py-1.5 text-[12px]"
              style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)", color: "var(--text-default)" }}>
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </label>
  );
}

function FormError({ msg }: { msg?: string }) {
  if (!msg) return null;
  return (
    <span className="inline-flex items-center rounded-md px-2 py-1 text-[11px]"
          style={{ background: "var(--rose-100)", color: "var(--rose-700)" }}>{msg}</span>
  );
}

function FormOk({ msg }: { msg?: string }) {
  if (!msg) return null;
  return (
    <span className="inline-flex items-center rounded-md px-2 py-1 text-[11px]"
          style={{ background: "var(--emerald-100)", color: "var(--emerald-700)" }}>{msg}</span>
  );
}

/* ── Sparkline (pure SVG) ─────────────────────────────── */

function EvalSparkline({ series }: { series: Array<{ day: string; evaluations: number }> }) {
  if (series.length === 0) return null;
  const W = 720, H = 60, PAD = 4;
  const max = Math.max(...series.map((s) => s.evaluations), 1);
  const step = series.length > 1 ? (W - 2 * PAD) / (series.length - 1) : 0;
  const points = series.map((s, i) => {
    const x = PAD + i * step;
    const y = H - PAD - ((s.evaluations / max) * (H - 2 * PAD));
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(" ");
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" preserveAspectRatio="none">
      <polyline points={points} fill="none" stroke="var(--accent-default)" strokeWidth={1.5} />
    </svg>
  );
}
