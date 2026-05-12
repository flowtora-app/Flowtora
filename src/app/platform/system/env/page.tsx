// Page 63 — Environment Variables.
//
// Read-mostly catalog of platform env vars with secret redaction.
// Tabs: Variables · Diff (Prod vs Staging) · Activity · Settings.

import * as React from "react";
import { requirePlatformStaff } from "@/lib/platform";
import {
  loadEnvVarsPage, loadEnvVarDetail, buildDiff,
  ENV_VAR_TYPE_LABEL, ENV_VAR_TYPE_TONE,
  ENV_VAR_SOURCE_LABEL,
  ENV_VAR_SYNC_TONE,
  ENV_LABEL, ENV_TONE,
  ENV_VAR_CHANGE_LABEL, ENV_VAR_CHANGE_TONE,
  relativeFromNow, shortDate, rotationCountdownDays, mask,
  type EnvKey,
} from "@/server/platform/env-vars";
import {
  saveEnvVar, deleteEnvVar, revealEnvVar, rotateEnvVar,
  triggerSync, saveEnvVarSettings,
} from "@/app/actions/platform-env-vars";
import type {
  EnvVarType, EnvVarSource, EnvVarSyncStatus, EnvVarChangeKind,
} from "@prisma/client";

export const dynamic = "force-dynamic";

type SP = Record<string, string | string[] | undefined>;
const asString = (v: string | string[] | undefined): string | undefined =>
  typeof v === "string" && v.length > 0 ? v : undefined;

const TABS = ["vars", "diff", "activity", "settings"] as const;
type Tab = typeof TABS[number];
const TAB_LABEL: Record<Tab, string> = {
  vars: "Variables",
  diff: "Diff",
  activity: "Activity",
  settings: "Settings",
};

const TYPES: EnvVarType[] = ["SECRET", "CONFIG"];
const SOURCES: EnvVarSource[] = ["VAULT", "DOPPLER", "AWS_SECRETS_MANAGER", "GCP_SECRET_MANAGER", "AZURE_KEY_VAULT", "ENV_FILE", "KUBERNETES", "VERCEL", "OTHER"];
const SYNC_STATUSES: EnvVarSyncStatus[] = ["SYNCED", "OUT_OF_SYNC", "PENDING", "FAILED", "NOT_SET"];
const ENV_KEYS = ["PRODUCTION", "STAGING", "SANDBOX", "PREVIEW"] as const;
type EnvName = typeof ENV_KEYS[number];

export default async function EnvVarsPage({
  searchParams,
}: { searchParams: Promise<SP> }) {
  const ctx = await requirePlatformStaff();
  if (!ctx.can("env.read")) {
    return (
      <main className="mx-auto max-w-2xl py-12 text-center">
        <h1 className="text-xl font-semibold">Access denied</h1>
        <p className="text-sm" style={{ color: "var(--text-muted)" }}>
          You don&apos;t have permission to view Environment Variables.
        </p>
      </main>
    );
  }
  const canReveal = ctx.can("env.reveal");
  const canManage = ctx.can("env.manage");
  const sp = await searchParams;
  const ok = asString(sp.ok);
  const error = asString(sp.error);
  const tabRaw = asString(sp.tab) as Tab | undefined;
  const tab: Tab = tabRaw && (TABS as readonly string[]).includes(tabRaw) ? tabRaw : "vars";
  const selectedId = asString(sp.id);
  const search = asString(sp.search) ?? "";
  const serviceFilter = asString(sp.service);
  const typeFilter = asString(sp.type) as EnvVarType | undefined;
  const syncFilter = asString(sp.sync) as EnvVarSyncStatus | undefined;
  const sourceFilter = asString(sp.source) as EnvVarSource | undefined;
  const revealEnvHint = asString(sp.reveal) as EnvName | undefined;

  const leftKeyRaw = asString(sp.left) ?? "PRODUCTION";
  const rightKeyRaw = asString(sp.right) ?? "STAGING";
  const leftKey: EnvName = (ENV_KEYS as readonly string[]).includes(leftKeyRaw) ? leftKeyRaw as EnvName : "PRODUCTION";
  const rightKey: EnvName = (ENV_KEYS as readonly string[]).includes(rightKeyRaw) ? rightKeyRaw as EnvName : "STAGING";

  const data = await loadEnvVarsPage();
  const { kpis, vars, settings } = data;

  const filteredVars = vars.filter((v) => {
    if (serviceFilter && v.service !== serviceFilter) return false;
    if (typeFilter && v.type !== typeFilter) return false;
    if (sourceFilter && v.source !== sourceFilter) return false;
    if (syncFilter) {
      const all = [v.prodSyncStatus, v.stagingSyncStatus, v.sandboxSyncStatus, v.previewSyncStatus];
      if (!all.includes(syncFilter)) return false;
    }
    if (search) {
      const hay = `${v.key} ${v.service} ${v.description ?? ""} ${v.tags.join(" ")}`.toLowerCase();
      if (!hay.includes(search.toLowerCase())) return false;
    }
    return true;
  });

  const services = Array.from(new Set(vars.map((v) => v.service))).sort();
  const selectedVar = selectedId ? await loadEnvVarDetail(selectedId) : null;
  const recentChanges = tab === "activity" ? await fetchRecentChanges() : [];

  // Diff
  const autoRedact = settings?.autoRedactDiff ?? true;
  const showRedact = autoRedact || !canReveal;
  const envToKey = (e: EnvName): EnvKey =>
    e === "PRODUCTION" ? "prod"
    : e === "STAGING"   ? "staging"
    : e === "SANDBOX"   ? "sandbox"
    : "preview";
  const diffRows = tab === "diff"
    ? buildDiff(filteredVars, envToKey(leftKey), envToKey(rightKey), showRedact)
    : [];

  return (
    <main className="mx-auto w-full max-w-[1620px] px-6 py-6">
      <header className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[22px] font-semibold" style={{ color: "var(--text-default)" }}>Environment variables</h1>
          <p className="text-[12px]" style={{ color: "var(--text-muted)" }}>
            Read-only catalog of platform config across environments — secret values stay redacted until you re-auth.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <FormOk msg={ok} />
          <FormError msg={error} />
        </div>
      </header>

      {/* KPI strip */}
      <section className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Kpi label="Total variables" value={String(kpis.totalVars)} sub={`${kpis.secrets} secrets · ${kpis.configs} config`} />
        <Kpi label="Out of sync" value={String(kpis.outOfSync)}
             sub={kpis.outOfSync > 0 ? "needs reconciliation" : "all envs aligned"}
             tone={kpis.outOfSync > 0 ? "warning" : "good"} />
        <Kpi label="Rotation overdue" value={String(kpis.overdueRotation)}
             sub={kpis.overdueRotation > 0 ? "past policy" : "on schedule"}
             tone={kpis.overdueRotation > 0 ? "warning" : "good"} />
        <Kpi label="Reveals (24h)" value={String(kpis.recentReveals24h)}
             sub={`${kpis.services} services · ${kpis.sources} sources`} />
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

      {tab === "vars" && (
        <VarsTab
          vars={filteredVars}
          allVars={vars}
          services={services}
          search={search}
          serviceFilter={serviceFilter}
          typeFilter={typeFilter}
          sourceFilter={sourceFilter}
          syncFilter={syncFilter}
          canReveal={canReveal}
          canManage={canManage}
          selectedVar={selectedVar}
          revealEnvHint={revealEnvHint}
        />
      )}
      {tab === "diff" && (
        <DiffTab
          rows={diffRows}
          leftKey={leftKey}
          rightKey={rightKey}
          redact={showRedact}
        />
      )}
      {tab === "activity" && (
        <ActivityTab rows={recentChanges} />
      )}
      {tab === "settings" && (
        <SettingsTab settings={settings} canManage={canManage} />
      )}
    </main>
  );
}

/* ── Vars tab — split list + detail ─────────────────────── */

function VarsTab({
  vars, allVars, services, search, serviceFilter, typeFilter, sourceFilter, syncFilter,
  canReveal, canManage, selectedVar, revealEnvHint,
}: {
  vars: Awaited<ReturnType<typeof loadEnvVarsPage>>["vars"];
  allVars: Awaited<ReturnType<typeof loadEnvVarsPage>>["vars"];
  services: string[];
  search: string;
  serviceFilter?: string;
  typeFilter?: EnvVarType;
  sourceFilter?: EnvVarSource;
  syncFilter?: EnvVarSyncStatus;
  canReveal: boolean;
  canManage: boolean;
  selectedVar: Awaited<ReturnType<typeof loadEnvVarDetail>>;
  revealEnvHint?: EnvName;
}) {
  return (
    <section className="grid grid-cols-1 gap-4 xl:grid-cols-[420px_1fr]">
      <aside className="rounded-xl border" style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)" }}>
        <form className="border-b p-3" style={{ borderColor: "var(--border-subtle)" }}>
          <input type="hidden" name="tab" value="vars" />
          <input
            name="search" placeholder="Search key, service, tag…"
            defaultValue={search}
            className="mb-2 w-full rounded-md border px-2 py-1.5 text-[12px]"
            style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)", color: "var(--text-default)" }}
          />
          <div className="mb-2 grid grid-cols-2 gap-2">
            <select name="service" defaultValue={serviceFilter ?? ""}
                    className="rounded-md border px-2 py-1 text-[11px]"
                    style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)", color: "var(--text-default)" }}>
              <option value="">All services</option>
              {services.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
            <select name="type" defaultValue={typeFilter ?? ""}
                    className="rounded-md border px-2 py-1 text-[11px]"
                    style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)", color: "var(--text-default)" }}>
              <option value="">All types</option>
              {TYPES.map((t) => <option key={t} value={t}>{ENV_VAR_TYPE_LABEL[t]}</option>)}
            </select>
          </div>
          <div className="mb-2 grid grid-cols-2 gap-2">
            <select name="source" defaultValue={sourceFilter ?? ""}
                    className="rounded-md border px-2 py-1 text-[11px]"
                    style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)", color: "var(--text-default)" }}>
              <option value="">All sources</option>
              {SOURCES.map((s) => <option key={s} value={s}>{ENV_VAR_SOURCE_LABEL[s]}</option>)}
            </select>
            <select name="sync" defaultValue={syncFilter ?? ""}
                    className="rounded-md border px-2 py-1 text-[11px]"
                    style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)", color: "var(--text-default)" }}>
              <option value="">All sync states</option>
              {SYNC_STATUSES.map((s) => <option key={s} value={s}>{ENV_VAR_SYNC_TONE[s].label}</option>)}
            </select>
          </div>
          <div className="flex justify-end">
            <button type="submit"
                    className="rounded-md px-2 py-1 text-[11px] font-medium"
                    style={{ background: "var(--accent-default)", color: "var(--accent-fg)" }}>
              Apply
            </button>
          </div>
        </form>
        <ul className="max-h-[680px] overflow-y-auto">
          {vars.length === 0 ? (
            <li className="p-5 text-center text-[12px]" style={{ color: "var(--text-muted)" }}>
              No variables match the current filters.
            </li>
          ) : vars.map((v) => {
            const active = selectedVar && selectedVar.id === v.id;
            const setEnvs: EnvName[] = [];
            if (v.prodValue != null)    setEnvs.push("PRODUCTION");
            if (v.stagingValue != null) setEnvs.push("STAGING");
            if (v.sandboxValue != null) setEnvs.push("SANDBOX");
            if (v.previewValue != null) setEnvs.push("PREVIEW");
            return (
              <li key={v.id}>
                <a href={`?tab=vars&id=${encodeURIComponent(v.id)}`}
                   className="block border-b px-3 py-2 transition hover:bg-[var(--surface-2)]"
                   style={{
                     borderColor: "var(--border-subtle)",
                     background: active ? "var(--accent-surface)" : "transparent",
                   }}>
                  <div className="flex items-center justify-between gap-2">
                    <code className="text-[12px] font-semibold tabular-nums" style={{ color: "var(--text-default)" }}>{v.key}</code>
                    <Pill tone={ENV_VAR_TYPE_TONE[v.type]} label={ENV_VAR_TYPE_LABEL[v.type]} />
                  </div>
                  <div className="mt-0.5 flex items-center gap-2 text-[11px]" style={{ color: "var(--text-muted)" }}>
                    <span style={{ color: "var(--text-default)" }}>{v.service}</span>
                    <span>·</span>
                    <span>{ENV_VAR_SOURCE_LABEL[v.source]}</span>
                  </div>
                  <div className="mt-1.5 flex flex-wrap items-center gap-1">
                    {setEnvs.map((e) => (
                      <Pill key={e} tone={ENV_TONE[e]} label={ENV_LABEL[e]} />
                    ))}
                    {setEnvs.length === 0 && <span className="text-[10px]" style={{ color: "var(--text-muted)" }}>no env set</span>}
                  </div>
                  <div className="mt-1 flex items-center gap-2 text-[10px]" style={{ color: "var(--text-muted)" }}>
                    <span>{v.ownerEmail ?? "no owner"}</span>
                    <span>·</span>
                    <span>{relativeFromNow(v.updatedAt)}</span>
                    {v._count.codeRefs > 0 && (<><span>·</span><span>{v._count.codeRefs} refs</span></>)}
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
                + Register variable
              </summary>
              <EnvVarSaveForm canManage={canManage} services={services} />
            </details>
          </div>
        )}
      </aside>

      <div>
        {selectedVar
          ? <EnvVarDetailPanel envVar={selectedVar} canReveal={canReveal} canManage={canManage} services={services} revealEnvHint={revealEnvHint} />
          : <EmptyDetail count={vars.length} />}
      </div>
    </section>
  );
}

function EmptyDetail({ count }: { count: number }) {
  return (
    <section className="rounded-xl border p-8 text-center"
             style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)" }}>
      <h3 className="text-[14px] font-semibold" style={{ color: "var(--text-default)" }}>Pick a variable</h3>
      <p className="text-[12px]" style={{ color: "var(--text-muted)" }}>
        {count === 0
          ? "No variables match the current filters."
          : "Select a variable from the left to view its environments, history, code references, and rotation status."}
      </p>
    </section>
  );
}

/* ── Detail panel ─────────────────────────────────────── */

function EnvVarDetailPanel({
  envVar, canReveal, canManage, services, revealEnvHint,
}: {
  envVar: NonNullable<Awaited<ReturnType<typeof loadEnvVarDetail>>>;
  canReveal: boolean;
  canManage: boolean;
  services: string[];
  revealEnvHint?: EnvName;
}) {
  const isSecret = envVar.type === "SECRET";
  const countdown = rotationCountdownDays(envVar.lastRotatedAt, envVar.rotationPolicyDays);
  const rotationOverdue = countdown != null && countdown < 0;
  return (
    <article className="rounded-xl border" style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)" }}>
      {/* Header */}
      <header className="flex flex-wrap items-start gap-3 border-b px-5 py-4" style={{ borderColor: "var(--border-subtle)" }}>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <code className="text-[14px] font-semibold tabular-nums" style={{ color: "var(--text-default)" }}>{envVar.key}</code>
            <Pill tone={ENV_VAR_TYPE_TONE[envVar.type]} label={ENV_VAR_TYPE_LABEL[envVar.type]} />
            {rotationOverdue && (
              <Pill tone={{ bg: "var(--rose-100)", fg: "var(--rose-700)" }} label="Rotation overdue" />
            )}
          </div>
          <div className="mt-0.5 text-[13px]" style={{ color: "var(--text-default)" }}>
            Service: <strong>{envVar.service}</strong>
            <span style={{ color: "var(--text-muted)" }}> · {ENV_VAR_SOURCE_LABEL[envVar.source]}</span>
          </div>
          {envVar.description && (
            <p className="mt-1 text-[12px]" style={{ color: "var(--text-muted)" }}>{envVar.description}</p>
          )}
          <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[11px]" style={{ color: "var(--text-muted)" }}>
            <span>Owner: <strong style={{ color: "var(--text-default)" }}>{envVar.ownerEmail ?? "—"}</strong></span>
            <span>·</span><span>Updated {relativeFromNow(envVar.updatedAt)}</span>
            {envVar.lastRotatedAt && (
              <>
                <span>·</span>
                <span>Rotated {relativeFromNow(envVar.lastRotatedAt)}</span>
              </>
            )}
            {envVar.rotationPolicyDays && (
              <>
                <span>·</span>
                <span style={{ color: rotationOverdue ? "var(--rose-700)" : "var(--text-muted)" }}>
                  Policy: {envVar.rotationPolicyDays}d
                  {countdown != null && (rotationOverdue
                    ? ` · ${Math.abs(countdown)}d overdue`
                    : countdown <= 14 ? ` · ${countdown}d remaining` : "")}
                </span>
              </>
            )}
            {envVar.tags.length > 0 && (
              <>
                <span>·</span>
                {envVar.tags.map((t) => (
                  <span key={t} className="inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px]"
                        style={{ background: "var(--surface-2)" }}>{t}</span>
                ))}
              </>
            )}
          </div>
        </div>
        {canManage && (
          <div className="flex items-center gap-2">
            <form action={rotateEnvVar}>
              <input type="hidden" name="id" value={envVar.id} />
              <button type="submit"
                      className="rounded-md border px-2 py-1 text-[11px] font-medium"
                      style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)", color: "var(--text-default)" }}>
                Mark rotated
              </button>
            </form>
          </div>
        )}
      </header>

      {/* Per-env value cards */}
      <section className="grid grid-cols-1 gap-3 border-b p-5 md:grid-cols-2 xl:grid-cols-4" style={{ borderColor: "var(--border-subtle)" }}>
        {ENV_KEYS.map((e) => {
          const value = e === "PRODUCTION" ? envVar.prodValue
                      : e === "STAGING"    ? envVar.stagingValue
                      : e === "SANDBOX"    ? envVar.sandboxValue
                      : envVar.previewValue;
          const sync = e === "PRODUCTION" ? envVar.prodSyncStatus
                     : e === "STAGING"    ? envVar.stagingSyncStatus
                     : e === "SANDBOX"    ? envVar.sandboxSyncStatus
                     : envVar.previewSyncStatus;
          const isSet = value != null;
          const revealed = revealEnvHint === e && canReveal && isSet;
          const display = !isSet ? "—" : (isSecret && !revealed) ? mask(value) : value;
          return (
            <div key={e} className="rounded-lg border p-3"
                 style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)" }}>
              <div className="mb-1 flex items-center justify-between">
                <Pill tone={ENV_TONE[e]} label={ENV_LABEL[e]} />
                <Pill tone={{ bg: ENV_VAR_SYNC_TONE[sync].bg, fg: ENV_VAR_SYNC_TONE[sync].fg }}
                      label={ENV_VAR_SYNC_TONE[sync].label} />
              </div>
              <code className="block max-h-20 overflow-y-auto break-all rounded-md px-2 py-1 text-[11px] tabular-nums"
                    style={{ background: "var(--surface-2)", color: isSet ? "var(--text-default)" : "var(--text-muted)" }}>
                {display}
              </code>
              <div className="mt-2 flex items-center gap-1">
                {isSecret && isSet && canReveal && !revealed && (
                  <details className="flex-1">
                    <summary className="cursor-pointer text-[11px] font-medium underline" style={{ color: "var(--text-muted)" }}>
                      Reveal
                    </summary>
                    <form action={revealEnvVar} className="mt-2 space-y-1">
                      <input type="hidden" name="id" value={envVar.id} />
                      <input type="hidden" name="env" value={e} />
                      <input name="reason" placeholder="Why are you revealing this?" required minLength={8}
                             className="w-full rounded-md border px-2 py-1 text-[11px]"
                             style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)", color: "var(--text-default)" }} />
                      <button type="submit"
                              className="w-full rounded-md px-2 py-1 text-[11px] font-medium"
                              style={{ background: "var(--amber-500)", color: "white" }}>
                        Confirm reveal
                      </button>
                    </form>
                  </details>
                )}
                {canManage && (
                  <form action={triggerSync}>
                    <input type="hidden" name="id" value={envVar.id} />
                    <input type="hidden" name="env" value={e} />
                    <button type="submit"
                            className="ml-auto rounded-md px-2 py-1 text-[11px] font-medium"
                            style={{ background: "var(--surface-2)", color: "var(--text-default)" }}>
                      Sync
                    </button>
                  </form>
                )}
              </div>
            </div>
          );
        })}
      </section>

      {/* Code refs */}
      <section className="border-b p-5" style={{ borderColor: "var(--border-subtle)" }}>
        <h3 className="mb-2 text-[13px] font-semibold" style={{ color: "var(--text-default)" }}>
          Code references <span className="text-[11px] font-normal" style={{ color: "var(--text-muted)" }}>({envVar.codeRefs.length})</span>
        </h3>
        {envVar.codeRefs.length === 0
          ? <Empty>No code references found.</Empty>
          : (
            <ul className="max-h-60 space-y-1 overflow-y-auto">
              {envVar.codeRefs.map((r) => (
                <li key={r.id} className="flex flex-wrap items-center gap-2 text-[11px]" style={{ color: "var(--text-muted)" }}>
                  <code className="tabular-nums" style={{ color: "var(--text-default)" }}>{r.filePath}:{r.lineNumber}</code>
                  <span>· {r.branchName}@{r.commitSha.slice(0, 7)}</span>
                  <span>· {relativeFromNow(r.lastSeenAt)}</span>
                </li>
              ))}
            </ul>
          )}
      </section>

      {/* History */}
      <section className="border-b p-5" style={{ borderColor: "var(--border-subtle)" }}>
        <h3 className="mb-2 text-[13px] font-semibold" style={{ color: "var(--text-default)" }}>Change history</h3>
        <p className="mb-2 text-[10px]" style={{ color: "var(--text-muted)" }}>
          History is masked — only metadata (who, when, why, source) is shown.
        </p>
        {envVar.changes.length === 0
          ? <Empty>No history yet.</Empty>
          : (
            <ol className="max-h-72 space-y-1.5 overflow-y-auto">
              {envVar.changes.map((c) => (
                <li key={c.id} className="flex flex-wrap items-center gap-2 text-[11px]">
                  <Pill tone={ENV_VAR_CHANGE_TONE[c.kind]} label={ENV_VAR_CHANGE_LABEL[c.kind]} />
                  {c.env && (ENV_KEYS as readonly string[]).includes(c.env) && (
                    <Pill tone={ENV_TONE[c.env as EnvName]} label={c.env} />
                  )}
                  {c.reason && <span style={{ color: "var(--text-default)" }}>{c.reason}</span>}
                  <span style={{ color: "var(--text-muted)" }}>· {c.actorEmail}</span>
                  <span style={{ color: "var(--text-muted)" }}>· {relativeFromNow(c.createdAt)}</span>
                </li>
              ))}
            </ol>
          )}
      </section>

      {/* Edit form */}
      {canManage && (
        <section className="border-t p-5" style={{ borderColor: "var(--border-subtle)" }}>
          <details>
            <summary className="cursor-pointer text-[12px] font-semibold" style={{ color: "var(--text-default)" }}>
              Edit metadata
            </summary>
            <EnvVarSaveForm canManage={canManage} services={services} envVar={envVar} />
          </details>
          <details className="mt-3">
            <summary className="cursor-pointer text-[12px] font-semibold" style={{ color: "var(--rose-700)" }}>
              Delete
            </summary>
            <p className="mt-2 text-[11px]" style={{ color: "var(--text-muted)" }}>
              Type <code className="rounded px-1 py-0.5" style={{ background: "var(--surface-2)" }}>{envVar.key}</code> to confirm.
            </p>
            <form action={deleteEnvVar} className="mt-2 flex items-center gap-2">
              <input type="hidden" name="id" value={envVar.id} />
              <input type="hidden" name="expected" value={envVar.key} />
              <input name="confirm" required placeholder={envVar.key}
                     className="rounded-md border px-2 py-1 text-[11px] tabular-nums"
                     style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)", color: "var(--text-default)" }} />
              <button type="submit"
                      className="rounded-md px-3 py-1.5 text-[11px] font-semibold"
                      style={{ background: "var(--rose-600)", color: "white" }}>
                Delete
              </button>
            </form>
          </details>
        </section>
      )}
    </article>
  );
}

function EnvVarSaveForm({
  canManage, services, envVar,
}: {
  canManage: boolean;
  services: string[];
  envVar?: NonNullable<Awaited<ReturnType<typeof loadEnvVarDetail>>>;
}) {
  if (!canManage) return null;
  return (
    <form action={saveEnvVar} className="mt-2 grid grid-cols-2 gap-2 md:grid-cols-3">
      <Input name="key" label="Variable key (SCREAMING_SNAKE_CASE)" defaultValue={envVar?.key ?? ""} />
      <label className="block">
        <span className="mb-0.5 block text-[11px] font-medium" style={{ color: "var(--text-muted)" }}>Service</span>
        <input name="service" defaultValue={envVar?.service ?? ""} list="env-services"
               className="w-full rounded-md border px-2 py-1.5 text-[12px]"
               style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)", color: "var(--text-default)" }} />
        <datalist id="env-services">
          {services.map((s) => <option key={s} value={s} />)}
        </datalist>
      </label>
      <Select name="type" label="Type" defaultValue={envVar?.type ?? "CONFIG"}
              options={TYPES.map((t) => ({ value: t, label: ENV_VAR_TYPE_LABEL[t] }))} />
      <Select name="source" label="Source" defaultValue={envVar?.source ?? "VAULT"}
              options={SOURCES.map((s) => ({ value: s, label: ENV_VAR_SOURCE_LABEL[s] }))} />
      <Input name="rotationPolicyDays" type="number" label="Rotation policy (days, 0 = none)" defaultValue={String(envVar?.rotationPolicyDays ?? 0)} />
      <Input name="ownerEmail" type="email" label="Owner email" defaultValue={envVar?.ownerEmail ?? ""} />
      <Input name="tags" label="Tags (comma-separated)" defaultValue={(envVar?.tags ?? []).join(", ")} />
      <label className="md:col-span-3 block">
        <span className="mb-0.5 block text-[11px] font-medium" style={{ color: "var(--text-muted)" }}>Description</span>
        <input name="description" defaultValue={envVar?.description ?? ""}
               className="w-full rounded-md border px-2 py-1.5 text-[12px]"
               style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)", color: "var(--text-default)" }} />
      </label>
      <div className="md:col-span-3 flex justify-end">
        <button type="submit"
                className="inline-flex h-8 items-center rounded-md px-3 text-[12px] font-medium"
                style={{ background: "var(--accent-default)", color: "var(--accent-fg)" }}>
          {envVar ? "Save metadata" : "Register variable"}
        </button>
      </div>
    </form>
  );
}

/* ── Diff tab ──────────────────────────────────────────── */

function DiffTab({
  rows, leftKey, rightKey, redact,
}: {
  rows: ReturnType<typeof buildDiff>;
  leftKey: EnvName;
  rightKey: EnvName;
  redact: boolean;
}) {
  const diffCount = rows.filter((r) => r.different).length;
  return (
    <section className="rounded-xl border" style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)" }}>
      <header className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3" style={{ borderColor: "var(--border-subtle)" }}>
        <div>
          <h3 className="text-[13px] font-semibold" style={{ color: "var(--text-default)" }}>
            Diff — {ENV_LABEL[leftKey]} vs {ENV_LABEL[rightKey]}
          </h3>
          <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>
            {rows.length} variables compared · <strong style={{ color: diffCount > 0 ? "var(--rose-700)" : "var(--emerald-700)" }}>{diffCount}</strong> different
            {redact && " · secrets redacted"}
          </p>
        </div>
        <form className="flex items-center gap-2">
          <input type="hidden" name="tab" value="diff" />
          <Select name="left" label="" defaultValue={leftKey}
                  options={ENV_KEYS.map((e) => ({ value: e, label: ENV_LABEL[e] }))} />
          <span className="text-[11px]" style={{ color: "var(--text-muted)" }}>vs</span>
          <Select name="right" label="" defaultValue={rightKey}
                  options={ENV_KEYS.map((e) => ({ value: e, label: ENV_LABEL[e] }))} />
          <button type="submit"
                  className="rounded-md px-2 py-1 text-[11px] font-medium"
                  style={{ background: "var(--accent-default)", color: "var(--accent-fg)" }}>
            Compare
          </button>
        </form>
      </header>
      <div className="overflow-x-auto p-3">
        {rows.length === 0 ? <Empty>No variables set in either environment.</Empty> : (
          <table className="w-full">
            <thead>
              <tr style={{ color: "var(--text-muted)" }}>
                <Th>Variable</Th>
                <Th>Service</Th>
                <Th>{ENV_LABEL[leftKey]}</Th>
                <Th>{ENV_LABEL[rightKey]}</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}
                    className="border-t"
                    style={{
                      borderColor: "var(--border-subtle)",
                      background: r.different ? "var(--rose-50)" : "transparent",
                    }}>
                  <Td>
                    <a href={`?tab=vars&id=${encodeURIComponent(r.id)}`}>
                      <code className="text-[12px] tabular-nums underline" style={{ color: "var(--text-default)" }}>{r.key}</code>
                    </a>
                    <div className="flex items-center gap-1">
                      <Pill tone={ENV_VAR_TYPE_TONE[r.type]} label={ENV_VAR_TYPE_LABEL[r.type]} />
                    </div>
                  </Td>
                  <Td><span className="text-[11px]" style={{ color: "var(--text-default)" }}>{r.service}</span></Td>
                  <Td>
                    <code className="block max-h-20 overflow-y-auto break-all rounded-md px-2 py-1 text-[11px] tabular-nums"
                          style={{ background: "var(--surface-2)", color: r.leftValue == null ? "var(--text-muted)" : "var(--text-default)" }}>
                      {r.leftValue ?? "— (not set)"}
                    </code>
                  </Td>
                  <Td>
                    <code className="block max-h-20 overflow-y-auto break-all rounded-md px-2 py-1 text-[11px] tabular-nums"
                          style={{ background: "var(--surface-2)", color: r.rightValue == null ? "var(--text-muted)" : "var(--text-default)" }}>
                      {r.rightValue ?? "— (not set)"}
                    </code>
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </section>
  );
}

/* ── Activity tab ──────────────────────────────────────── */

function ActivityTab({
  rows,
}: {
  rows: Array<{
    id: string;
    kind: EnvVarChangeKind;
    reason: string | null;
    actorEmail: string;
    env: string | null;
    createdAt: Date;
    envVarKey: string;
    envVarService: string;
  }>;
}) {
  return (
    <section className="rounded-xl border" style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)" }}>
      <header className="border-b px-4 py-3" style={{ borderColor: "var(--border-subtle)" }}>
        <h3 className="text-[13px] font-semibold" style={{ color: "var(--text-default)" }}>Recent activity</h3>
        <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>
          {rows.length} recent change events. Reveal events are intentionally surfaced for audit.
        </p>
      </header>
      <div className="overflow-x-auto p-4">
        {rows.length === 0 ? <Empty>No activity yet.</Empty> : (
          <ol className="space-y-2">
            {rows.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center gap-2 text-[11px]"
                  style={{ color: "var(--text-default)" }}>
                <Pill tone={ENV_VAR_CHANGE_TONE[r.kind]} label={ENV_VAR_CHANGE_LABEL[r.kind]} />
                {r.env && (ENV_KEYS as readonly string[]).includes(r.env) && (
                  <Pill tone={ENV_TONE[r.env as EnvName]} label={r.env} />
                )}
                <code className="font-semibold tabular-nums" style={{ color: "var(--text-default)" }}>{r.envVarKey}</code>
                <span style={{ color: "var(--text-muted)" }}>· {r.envVarService}</span>
                {r.reason && <span style={{ color: "var(--text-default)" }}>· {r.reason}</span>}
                <span className="ml-auto text-[10px]" style={{ color: "var(--text-muted)" }}>{r.actorEmail} · {relativeFromNow(r.createdAt)}</span>
              </li>
            ))}
          </ol>
        )}
      </div>
    </section>
  );
}

/* ── Settings tab ──────────────────────────────────────── */

function SettingsTab({
  settings, canManage,
}: {
  settings: Awaited<ReturnType<typeof loadEnvVarsPage>>["settings"];
  canManage: boolean;
}) {
  const s = settings ?? {
    rotationReminderDays: 7,
    defaultSyncProvider: "VAULT" as EnvVarSource,
    requireReauthOnReveal: true,
    reauthValiditySec: 300,
    autoRedactDiff: true,
    notes: null,
  };
  return (
    <section className="rounded-xl border" style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)" }}>
      <header className="border-b px-4 py-3" style={{ borderColor: "var(--border-subtle)" }}>
        <h3 className="text-[13px] font-semibold" style={{ color: "var(--text-default)" }}>Program settings</h3>
        <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>Defaults for rotation reminders, secret reveal, and diff redaction.</p>
      </header>
      <form action={saveEnvVarSettings} className="grid grid-cols-2 gap-3 p-4 md:grid-cols-3">
        <Input name="rotationReminderDays" type="number" label="Rotation reminder lead (days)" defaultValue={String(s.rotationReminderDays)} />
        <Select name="defaultSyncProvider" label="Default secret store" defaultValue={s.defaultSyncProvider}
                options={SOURCES.map((src) => ({ value: src, label: ENV_VAR_SOURCE_LABEL[src] }))} />
        <Input name="reauthValiditySec" type="number" label="Re-auth validity (seconds)" defaultValue={String(s.reauthValiditySec)} />
        <label className="inline-flex items-center gap-2 text-[12px]" style={{ color: "var(--text-default)" }}>
          <input type="checkbox" name="requireReauthOnReveal" defaultChecked={s.requireReauthOnReveal} /> Require re-auth before reveal
        </label>
        <label className="inline-flex items-center gap-2 text-[12px]" style={{ color: "var(--text-default)" }}>
          <input type="checkbox" name="autoRedactDiff" defaultChecked={s.autoRedactDiff} /> Auto-redact diff
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

/* ── Async helper ──────────────────────────────────────── */

async function fetchRecentChanges() {
  const { db } = await import("@/lib/db");
  const rows = await db.envVarChange.findMany({
    orderBy: { createdAt: "desc" },
    take: 80,
    include: { envVar: { select: { key: true, service: true } } },
  });
  return rows.map((r) => ({
    id: r.id, kind: r.kind, reason: r.reason,
    actorEmail: r.actorEmail, env: r.env,
    createdAt: r.createdAt,
    envVarKey: r.envVar.key, envVarService: r.envVar.service,
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
        <span className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>{label}</span>
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
  type?: "text" | "number" | "email";
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
      {label && <span className="mb-0.5 block text-[11px] font-medium" style={{ color: "var(--text-muted)" }}>{label}</span>}
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
