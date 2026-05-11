// Page 58 — Email Deliverability.
//
// KPI strip + 8 tabs:
// Overview · Volume · Bounces · Complaints · Suppression · Domain Auth · Templates · Providers · Settings.

import * as React from "react";
import { requirePlatformStaff } from "@/lib/platform";
import {
  loadEmailPage,
  BOUNCE_TYPE_LABEL, BOUNCE_TYPE_TONE, BOUNCE_STATUS_TONE,
  SUPPRESSION_SOURCE_LABEL,
  AUTH_STATUS_TONE,
  PROVIDER_ROLE_TONE, PROVIDER_HEALTH_TONE,
  relativeFromNow, shortDate, pct,
  type BounceFilters, type SuppressionFilters,
} from "@/server/platform/email-deliverability";
import {
  addSuppression, removeSuppression,
  setBounceStatus,
  reverifyDomain, saveDomain,
  saveProvider, setProviderPrimary,
  toggleTemplateSuspend,
  saveEmailSettings,
} from "@/app/actions/platform-email";
import type {
  EmailBounceType, EmailBounceStatus, EmailSuppressionSource,
  DomainAuthStatus, EmailProviderRole, EmailProviderHealth,
} from "@prisma/client";

export const dynamic = "force-dynamic";

type SP = Record<string, string | string[] | undefined>;
const asString = (v: string | string[] | undefined): string | undefined =>
  typeof v === "string" && v.length > 0 ? v : undefined;

const TABS = ["overview", "volume", "bounces", "complaints", "suppression", "auth", "templates", "providers", "settings"] as const;
type Tab = typeof TABS[number];
const TAB_LABEL: Record<Tab, string> = {
  overview:    "Overview",
  volume:      "Volume",
  bounces:     "Bounces",
  complaints:  "Complaints",
  suppression: "Suppression",
  auth:        "Domain auth",
  templates:   "Templates",
  providers:   "Providers",
  settings:    "Settings",
};

const BOUNCE_TYPES: EmailBounceType[] = ["HARD", "SOFT", "BLOCK", "CONTENT", "UNKNOWN"];
const BOUNCE_STATUSES: EmailBounceStatus[] = ["OPEN", "SUPPRESSED", "INVESTIGATING", "RESOLVED"];
const SUPPRESSION_SOURCES: EmailSuppressionSource[] = ["BOUNCE", "COMPLAINT", "MANUAL", "CSV_IMPORT", "GDPR_REQUEST"];
const AUTH_STATUSES: DomainAuthStatus[] = ["PASS", "WARN", "FAIL", "UNCONFIGURED"];
const PROVIDER_ROLES: EmailProviderRole[] = ["PRIMARY", "BACKUP", "BULK", "TRANSACTIONAL", "DISABLED"];
const PROVIDER_HEALTH: EmailProviderHealth[] = ["HEALTHY", "DEGRADED", "WARNING", "OFFLINE"];

export default async function EmailDeliverabilityPage({
  searchParams,
}: { searchParams: Promise<SP> }) {
  const ctx = await requirePlatformStaff();
  if (!ctx.can("email.deliverability.read")) {
    return (
      <main className="mx-auto max-w-2xl py-12 text-center">
        <h1 className="text-xl font-semibold">Access denied</h1>
        <p className="text-sm" style={{ color: "var(--text-muted)" }}>
          You don&apos;t have permission to view email deliverability.
        </p>
      </main>
    );
  }
  const canManage = ctx.can("email.deliverability.manage");
  const sp = await searchParams;
  const ok = asString(sp.ok);
  const error = asString(sp.error);
  const tabRaw = asString(sp.tab) as Tab | undefined;
  const tab: Tab = tabRaw && (TABS as readonly string[]).includes(tabRaw) ? tabRaw : "overview";

  const bounceFilters: BounceFilters = {
    q:        asString(sp.q),
    type:     (asString(sp.type)     as EmailBounceType   | "ALL" | undefined) ?? "ALL",
    provider: asString(sp.provider),
    status:   (asString(sp.status)   as EmailBounceStatus | "ALL" | undefined) ?? "ALL",
  };
  const suppressionFilters: SuppressionFilters = {
    q:      asString(sp.sq),
    source: (asString(sp.source) as EmailSuppressionSource | "ALL" | undefined) ?? "ALL",
  };

  const data = await loadEmailPage(bounceFilters, suppressionFilters);
  const { kpis, volume, bounces, complaints, suppressions, domains, templates, providers, settings } = data;

  return (
    <main className="mx-auto w-full max-w-[1480px] px-6 py-6">
      <header className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[22px] font-semibold" style={{ color: "var(--text-default)" }}>Email deliverability</h1>
          <p className="text-[12px]" style={{ color: "var(--text-muted)" }}>
            Volume · bounces · complaints · suppression · domain auth (SPF/DKIM/DMARC/BIMI) · providers · settings.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <FormOk msg={ok} />
          <FormError msg={error} />
        </div>
      </header>

      {/* KPI strip */}
      <section className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Kpi label="Sent (24h)" value={kpis.sent24h.toLocaleString()}
             sub={`${kpis.delivered24h.toLocaleString()} delivered · ${kpis.opens24h.toLocaleString()} opens`} />
        <Kpi label="Bounce rate" value={`${kpis.bouncePct.toFixed(2)}%`}
             sub={`Target <${kpis.bounceTargetPct.toFixed(1)}% · ${kpis.bounces24h.toLocaleString()} bounces`}
             tone={kpis.bouncePct > kpis.bounceTargetPct * 1.5 ? "danger" : kpis.bouncePct > kpis.bounceTargetPct ? "warning" : "good"} />
        <Kpi label="Complaint rate" value={`${kpis.complaintPct.toFixed(3)}%`}
             sub={`Target <${kpis.complaintTargetPct.toFixed(2)}% · ${kpis.complaints24h.toLocaleString()} complaints`}
             tone={kpis.complaintPct > kpis.complaintTargetPct * 1.5 ? "danger" : kpis.complaintPct > kpis.complaintTargetPct ? "warning" : "good"} />
        <Kpi label="Domain reputation" value={kpis.domainGrade}
             sub={`${kpis.passDomains}/${kpis.domains} domains fully authed · ${kpis.suppressionCount.toLocaleString()} on suppression`}
             tone={kpis.domainGrade === "A+" || kpis.domainGrade === "A" ? "good" : kpis.domainGrade === "F" ? "danger" : "warning"} />
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

      {tab === "overview"    && <OverviewTab volume={volume} bounces={bounces.slice(0, 6)} providers={providers} />}
      {tab === "volume"      && <VolumeTab volume={volume} templates={templates} />}
      {tab === "bounces"     && <BouncesTab rows={bounces} providers={providers} filters={bounceFilters} canManage={canManage} />}
      {tab === "complaints"  && <ComplaintsTab rows={complaints} />}
      {tab === "suppression" && <SuppressionTab rows={suppressions} filters={suppressionFilters} canManage={canManage} />}
      {tab === "auth"        && <DomainAuthTab rows={domains} canManage={canManage} />}
      {tab === "templates"   && <TemplatesTab rows={templates} canManage={canManage} />}
      {tab === "providers"   && <ProvidersTab rows={providers} canManage={canManage} />}
      {tab === "settings"    && <SettingsTab settings={settings} canManage={canManage} />}
    </main>
  );
}

/* ── Overview tab ──────────────────────────────────────── */

function OverviewTab({
  volume, bounces, providers,
}: {
  volume: { day: string; SENT: number; DELIVERED: number; BOUNCE: number; COMPLAINT: number }[];
  bounces: { id: string; recipient: string; type: EmailBounceType; reason: string | null; smtpCode: string | null; provider: string | null; bouncedAt: Date }[];
  providers: { id: string; name: string; key: string; role: EmailProviderRole; health: EmailProviderHealth; sent24h: number; bounceRate24h: number }[];
}) {
  const maxSent = Math.max(1, ...volume.map((v) => v.SENT));
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
      <section className="rounded-xl border p-4 lg:col-span-2"
               style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)" }}>
        <h3 className="text-[13px] font-semibold" style={{ color: "var(--text-default)" }}>Volume — last 30 days</h3>
        <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>Sent vs bounce/complaint.</p>
        <div className="mt-3 flex h-24 items-end gap-[2px]">
          {volume.map((v, i) => {
            const sentH = (v.SENT / maxSent) * 100;
            const bouncePct = v.SENT === 0 ? 0 : (v.BOUNCE / v.SENT) * 100;
            const complaintPct = v.SENT === 0 ? 0 : (v.COMPLAINT / v.SENT) * 100;
            const issueRatio = Math.min(1, (bouncePct + complaintPct) / 5);
            return (
              <div key={i} title={`${v.day}: ${v.SENT} sent · ${v.BOUNCE} bounces · ${v.COMPLAINT} complaints`}
                   className="flex flex-1 flex-col-reverse gap-[1px]"
                   style={{ height: `${sentH}%` }}>
                <div className="flex-1" style={{ background: "var(--sky-400, var(--sky-500))", opacity: 0.85 }} />
                {issueRatio > 0 && (
                  <div style={{ height: `${issueRatio * 100}%`, background: "var(--rose-500)", opacity: 0.9 }} />
                )}
              </div>
            );
          })}
        </div>
      </section>
      <section className="rounded-xl border p-4"
               style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)" }}>
        <h3 className="text-[13px] font-semibold" style={{ color: "var(--text-default)" }}>Providers</h3>
        <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>{providers.length} routes.</p>
        <ul className="mt-2 space-y-1.5">
          {providers.map((p) => (
            <li key={p.id} className="flex items-center justify-between rounded-md border px-2 py-1.5"
                style={{ background: "var(--surface-2)", borderColor: "var(--border-subtle)" }}>
              <div>
                <div className="text-[12px] font-medium" style={{ color: "var(--text-default)" }}>{p.name}</div>
                <div className="text-[11px]" style={{ color: "var(--text-muted)" }}>
                  {p.sent24h.toLocaleString()} sends/24h · {p.bounceRate24h.toFixed(2)}% bounces
                </div>
              </div>
              <div className="flex items-center gap-1">
                <Pill tone={PROVIDER_ROLE_TONE[p.role]} />
                <Pill tone={PROVIDER_HEALTH_TONE[p.health]} />
              </div>
            </li>
          ))}
        </ul>
      </section>
      <section className="rounded-xl border lg:col-span-3"
               style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)" }}>
        <header className="border-b px-4 py-3" style={{ borderColor: "var(--border-subtle)" }}>
          <h3 className="text-[13px] font-semibold" style={{ color: "var(--text-default)" }}>Recent bounces</h3>
          <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>Most recent {bounces.length}.</p>
        </header>
        <div className="overflow-x-auto p-4">
          {bounces.length === 0 ? <Empty>No recent bounces.</Empty> : (
            <table className="w-full">
              <thead>
                <tr style={{ color: "var(--text-muted)" }}>
                  <Th>Recipient</Th><Th>Type</Th><Th>Reason</Th><Th>Provider</Th><Th>Bounced</Th>
                </tr>
              </thead>
              <tbody>
                {bounces.map((b) => (
                  <tr key={b.id} className="border-t" style={{ borderColor: "var(--border-subtle)" }}>
                    <Td><code className="text-[11px] tabular-nums" style={{ color: "var(--text-default)" }}>{b.recipient}</code></Td>
                    <Td>
                      <span className="inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
                            style={{ background: BOUNCE_TYPE_TONE[b.type].bg, color: BOUNCE_TYPE_TONE[b.type].fg }}>
                        {BOUNCE_TYPE_LABEL[b.type]}
                      </span>
                    </Td>
                    <Td>
                      <div className="text-[11px]" style={{ color: "var(--text-default)" }}>{b.reason ?? "—"}</div>
                      {b.smtpCode && <div className="text-[10px] tabular-nums" style={{ color: "var(--text-muted)" }}>SMTP {b.smtpCode}</div>}
                    </Td>
                    <Td><span className="text-[11px]" style={{ color: "var(--text-muted)" }}>{b.provider ?? "—"}</span></Td>
                    <Td><span className="text-[11px] tabular-nums" style={{ color: "var(--text-muted)" }}>{relativeFromNow(b.bouncedAt)}</span></Td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>
    </div>
  );
}

/* ── Volume tab ────────────────────────────────────────── */

function VolumeTab({
  volume, templates,
}: {
  volume: { day: string; SENT: number; DELIVERED: number; OPEN: number; CLICK: number; BOUNCE: number; COMPLAINT: number; UNSUBSCRIBE: number }[];
  templates: { id: string; templateKey: string; name: string; sent24h: number; openRate: number; clickRate: number; bounceRate: number }[];
}) {
  const max = Math.max(1, ...volume.map((v) => v.SENT));
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
      <section className="rounded-xl border p-4 lg:col-span-2"
               style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)" }}>
        <h3 className="text-[13px] font-semibold" style={{ color: "var(--text-default)" }}>Per-day volume</h3>
        <div className="mt-3 flex h-32 items-end gap-[2px]">
          {volume.map((v, i) => (
            <div key={i} title={`${v.day}: sent ${v.SENT} · opens ${v.OPEN} · clicks ${v.CLICK} · bounces ${v.BOUNCE}`}
                 className="flex flex-1 flex-col-reverse gap-[1px]"
                 style={{ height: `${(v.SENT / max) * 100}%` }}>
              <div className="flex-1" style={{ background: "var(--sky-500)", opacity: 0.85 }} />
              {v.OPEN > 0 && (
                <div style={{ height: `${Math.min(60, (v.OPEN / Math.max(v.SENT, 1)) * 100)}%`, background: "var(--emerald-500)", opacity: 0.9 }} />
              )}
              {v.BOUNCE > 0 && (
                <div style={{ height: `${Math.min(20, (v.BOUNCE / Math.max(v.SENT, 1)) * 200)}%`, background: "var(--rose-500)", opacity: 0.9 }} />
              )}
            </div>
          ))}
        </div>
        <div className="mt-2 flex gap-3 text-[10px]" style={{ color: "var(--text-muted)" }}>
          <Legend swatch="var(--sky-500)" label="Sent" />
          <Legend swatch="var(--emerald-500)" label="Opens (proportion)" />
          <Legend swatch="var(--rose-500)" label="Bounces (scaled)" />
        </div>
      </section>

      <section className="rounded-xl border p-4"
               style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)" }}>
        <h3 className="text-[13px] font-semibold" style={{ color: "var(--text-default)" }}>Top templates (24h)</h3>
        <ul className="mt-2 space-y-1.5">
          {templates.slice(0, 8).map((t) => (
            <li key={t.id} className="rounded-md border px-2 py-1.5"
                style={{ background: "var(--surface-2)", borderColor: "var(--border-subtle)" }}>
              <div className="flex items-center justify-between">
                <span className="text-[12px] font-medium" style={{ color: "var(--text-default)" }}>{t.name}</span>
                <span className="text-[11px] tabular-nums" style={{ color: "var(--text-default)" }}>{t.sent24h.toLocaleString()}</span>
              </div>
              <div className="text-[11px] tabular-nums" style={{ color: "var(--text-muted)" }}>
                open {t.openRate.toFixed(1)}% · click {t.clickRate.toFixed(1)}% · bounce {t.bounceRate.toFixed(2)}%
              </div>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

function Legend({ swatch, label }: { swatch: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1">
      <span className="inline-block h-2 w-2 rounded-sm" style={{ background: swatch }} /> {label}
    </span>
  );
}

/* ── Bounces tab ───────────────────────────────────────── */

function BouncesTab({
  rows, providers, filters, canManage,
}: {
  rows: { id: string; recipient: string; type: EmailBounceType; reason: string | null; smtpCode: string | null; provider: string | null; tenantId: string | null; templateKey: string | null; sentAt: Date; bouncedAt: Date; status: EmailBounceStatus }[];
  providers: { key: string; name: string }[];
  filters: BounceFilters;
  canManage: boolean;
}) {
  return (
    <section className="rounded-xl border"
             style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)" }}>
      <header className="border-b px-4 py-3" style={{ borderColor: "var(--border-subtle)" }}>
        <h3 className="text-[13px] font-semibold" style={{ color: "var(--text-default)" }}>Bounces</h3>
        <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>{rows.length} bounces.</p>
      </header>
      <form className="grid grid-cols-2 gap-2 px-4 pt-4 md:grid-cols-5" method="get">
        <input type="hidden" name="tab" value="bounces" />
        <Input name="q" label="Search" defaultValue={filters.q ?? ""} />
        <Select name="type" label="Type" defaultValue={filters.type as string ?? "ALL"}
                options={[{ value: "ALL", label: "All types" }, ...BOUNCE_TYPES.map((t) => ({ value: t, label: BOUNCE_TYPE_LABEL[t] }))]} />
        <Select name="provider" label="Provider" defaultValue={filters.provider ?? ""}
                options={[{ value: "", label: "Any provider" }, ...providers.map((p) => ({ value: p.key, label: p.name }))]} />
        <Select name="status" label="Status" defaultValue={filters.status as string ?? "ALL"}
                options={[{ value: "ALL", label: "Any status" }, ...BOUNCE_STATUSES.map((s) => ({ value: s, label: BOUNCE_STATUS_TONE[s].label }))]} />
        <div className="md:col-span-5 flex justify-end gap-2">
          <a href="?tab=bounces" className="inline-flex h-8 items-center rounded-md border px-3 text-[12px] font-medium"
             style={{ borderColor: "var(--border-subtle)", background: "var(--surface-1)", color: "var(--text-muted)" }}>
            Clear
          </a>
          <button type="submit" className="inline-flex h-8 items-center rounded-md px-3 text-[12px] font-medium"
                  style={{ background: "var(--accent-default)", color: "var(--accent-fg)" }}>
            Apply
          </button>
        </div>
      </form>
      <div className="overflow-x-auto p-4">
        {rows.length === 0 ? <Empty>No bounces match this view.</Empty> : (
          <table className="w-full">
            <thead>
              <tr style={{ color: "var(--text-muted)" }}>
                <Th>Recipient</Th><Th>Type</Th><Th>Reason</Th><Th>SMTP</Th><Th>Provider</Th>
                <Th>Sent</Th><Th>Bounced</Th><Th>Template</Th><Th>Status</Th>
                {canManage && <Th right>Actions</Th>}
              </tr>
            </thead>
            <tbody>
              {rows.map((b) => (
                <tr key={b.id} className="border-t" style={{ borderColor: "var(--border-subtle)" }}>
                  <Td><code className="text-[11px] tabular-nums" style={{ color: "var(--text-default)" }}>{b.recipient}</code></Td>
                  <Td>
                    <span className="inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
                          style={{ background: BOUNCE_TYPE_TONE[b.type].bg, color: BOUNCE_TYPE_TONE[b.type].fg }}>
                      {BOUNCE_TYPE_LABEL[b.type]}
                    </span>
                  </Td>
                  <Td><span className="text-[11px]" style={{ color: "var(--text-default)" }}>{b.reason ?? "—"}</span></Td>
                  <Td><code className="text-[11px] tabular-nums" style={{ color: "var(--text-muted)" }}>{b.smtpCode ?? "—"}</code></Td>
                  <Td><span className="text-[11px]" style={{ color: "var(--text-muted)" }}>{b.provider ?? "—"}</span></Td>
                  <Td><span className="text-[11px] tabular-nums" style={{ color: "var(--text-muted)" }}>{relativeFromNow(b.sentAt)}</span></Td>
                  <Td><span className="text-[11px] tabular-nums" style={{ color: "var(--text-muted)" }}>{relativeFromNow(b.bouncedAt)}</span></Td>
                  <Td><span className="text-[11px] tabular-nums" style={{ color: "var(--text-muted)" }}>{b.templateKey ?? "—"}</span></Td>
                  <Td><Pill tone={BOUNCE_STATUS_TONE[b.status]} /></Td>
                  {canManage && (
                    <Td right>
                      <form action={setBounceStatus} className="inline-flex items-center gap-1">
                        <input type="hidden" name="id" value={b.id} />
                        <select name="status" defaultValue={b.status}
                                className="rounded-md border px-1.5 py-0.5 text-[11px]"
                                style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)", color: "var(--text-default)" }}>
                          {BOUNCE_STATUSES.map((s) => <option key={s} value={s}>{BOUNCE_STATUS_TONE[s].label}</option>)}
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
    </section>
  );
}

/* ── Complaints tab ────────────────────────────────────── */

function ComplaintsTab({
  rows,
}: {
  rows: { id: string; recipient: string; provider: string | null; templateKey: string | null; reason: string | null; reportedAt: Date; sentAt: Date; autoSuppressed: boolean }[];
}) {
  return (
    <section className="rounded-xl border"
             style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)" }}>
      <header className="border-b px-4 py-3" style={{ borderColor: "var(--border-subtle)" }}>
        <h3 className="text-[13px] font-semibold" style={{ color: "var(--text-default)" }}>Complaints</h3>
        <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>{rows.length} feedback-loop complaints · auto-suppress on by default.</p>
      </header>
      <div className="overflow-x-auto p-4">
        {rows.length === 0 ? <Empty>No complaints recorded.</Empty> : (
          <table className="w-full">
            <thead>
              <tr style={{ color: "var(--text-muted)" }}>
                <Th>Recipient</Th><Th>Provider</Th><Th>Template</Th><Th>Reason</Th>
                <Th>Sent</Th><Th>Reported</Th><Th>Suppressed</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((c) => (
                <tr key={c.id} className="border-t" style={{ borderColor: "var(--border-subtle)" }}>
                  <Td><code className="text-[11px] tabular-nums" style={{ color: "var(--text-default)" }}>{c.recipient}</code></Td>
                  <Td><span className="text-[11px]" style={{ color: "var(--text-muted)" }}>{c.provider ?? "—"}</span></Td>
                  <Td><span className="text-[11px] tabular-nums" style={{ color: "var(--text-muted)" }}>{c.templateKey ?? "—"}</span></Td>
                  <Td><span className="text-[11px]" style={{ color: "var(--text-default)" }}>{c.reason ?? "—"}</span></Td>
                  <Td><span className="text-[11px] tabular-nums" style={{ color: "var(--text-muted)" }}>{relativeFromNow(c.sentAt)}</span></Td>
                  <Td><span className="text-[11px] tabular-nums" style={{ color: "var(--text-muted)" }}>{relativeFromNow(c.reportedAt)}</span></Td>
                  <Td>
                    {c.autoSuppressed
                      ? <span className="inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-semibold" style={{ background: "var(--violet-100)", color: "var(--violet-700)" }}>Auto</span>
                      : <span className="text-[11px]" style={{ color: "var(--text-muted)" }}>No</span>}
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

/* ── Suppression tab ───────────────────────────────────── */

function SuppressionTab({
  rows, filters, canManage,
}: {
  rows: { id: string; email: string; source: EmailSuppressionSource; reason: string | null; expiresAt: Date | null; addedByEmail: string | null; createdAt: Date; notes: string | null }[];
  filters: SuppressionFilters;
  canManage: boolean;
}) {
  return (
    <section className="rounded-xl border"
             style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)" }}>
      <header className="border-b px-4 py-3" style={{ borderColor: "var(--border-subtle)" }}>
        <h3 className="text-[13px] font-semibold" style={{ color: "var(--text-default)" }}>Suppression list</h3>
        <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>{rows.length} addresses suppressed.</p>
      </header>
      <form className="grid grid-cols-2 gap-2 px-4 pt-4 md:grid-cols-3" method="get">
        <input type="hidden" name="tab" value="suppression" />
        <Input name="sq" label="Search" defaultValue={filters.q ?? ""} />
        <Select name="source" label="Source" defaultValue={filters.source as string ?? "ALL"}
                options={[{ value: "ALL", label: "All sources" }, ...SUPPRESSION_SOURCES.map((s) => ({ value: s, label: SUPPRESSION_SOURCE_LABEL[s] }))]} />
        <div className="flex items-end justify-end gap-2">
          <a href="?tab=suppression" className="inline-flex h-8 items-center rounded-md border px-3 text-[12px] font-medium"
             style={{ borderColor: "var(--border-subtle)", background: "var(--surface-1)", color: "var(--text-muted)" }}>
            Clear
          </a>
          <button type="submit" className="inline-flex h-8 items-center rounded-md px-3 text-[12px] font-medium"
                  style={{ background: "var(--accent-default)", color: "var(--accent-fg)" }}>
            Apply
          </button>
        </div>
      </form>
      <div className="overflow-x-auto p-4">
        {rows.length === 0 ? <Empty>No suppressions in this view.</Empty> : (
          <table className="w-full">
            <thead>
              <tr style={{ color: "var(--text-muted)" }}>
                <Th>Email</Th><Th>Source</Th><Th>Reason</Th><Th>Expires</Th>
                <Th>Added by</Th><Th>Added</Th>
                {canManage && <Th right>Action</Th>}
              </tr>
            </thead>
            <tbody>
              {rows.map((s) => (
                <tr key={s.id} className="border-t" style={{ borderColor: "var(--border-subtle)" }}>
                  <Td><code className="text-[11px] tabular-nums" style={{ color: "var(--text-default)" }}>{s.email}</code></Td>
                  <Td><span className="text-[11px]" style={{ color: "var(--text-muted)" }}>{SUPPRESSION_SOURCE_LABEL[s.source]}</span></Td>
                  <Td><span className="text-[11px]" style={{ color: "var(--text-default)" }}>{s.reason ?? "—"}</span></Td>
                  <Td><span className="text-[11px] tabular-nums" style={{ color: "var(--text-muted)" }}>{s.expiresAt ? shortDate(s.expiresAt) : "permanent"}</span></Td>
                  <Td><span className="text-[11px]" style={{ color: "var(--text-muted)" }}>{s.addedByEmail ?? "—"}</span></Td>
                  <Td><span className="text-[11px] tabular-nums" style={{ color: "var(--text-muted)" }}>{relativeFromNow(s.createdAt)}</span></Td>
                  {canManage && (
                    <Td right>
                      <form action={removeSuppression}>
                        <input type="hidden" name="id" value={s.id} />
                        <button type="submit" className="text-[11px] font-medium underline" style={{ color: "var(--text-muted)" }}>
                          Unsuppress
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
              + Add to suppression
            </summary>
            <form action={addSuppression} className="mt-3 grid grid-cols-2 gap-2 md:grid-cols-3">
              <Input name="email" label="Email" type="email" defaultValue="" required />
              <Select name="source" label="Source"
                      options={SUPPRESSION_SOURCES.map((s) => ({ value: s, label: SUPPRESSION_SOURCE_LABEL[s] }))} />
              <Input name="expiresAt" label="Expires (optional)" type="date" defaultValue="" />
              <label className="md:col-span-3 block">
                <span className="mb-0.5 block text-[11px] font-medium" style={{ color: "var(--text-muted)" }}>Reason</span>
                <input name="reason" defaultValue=""
                       className="w-full rounded-md border px-2 py-1.5 text-[12px]"
                       style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)", color: "var(--text-default)" }} />
              </label>
              <div className="md:col-span-3 flex justify-end">
                <button type="submit" className="inline-flex h-8 items-center rounded-md px-3 text-[12px] font-medium"
                        style={{ background: "var(--accent-default)", color: "var(--accent-fg)" }}>
                  Suppress
                </button>
              </div>
            </form>
          </details>
        </div>
      )}
    </section>
  );
}

/* ── Domain auth tab ───────────────────────────────────── */

function DomainAuthTab({
  rows, canManage,
}: {
  rows: { id: string; domain: string; hostname: string | null; mxRecord: string | null; spfRecord: string | null; spfStatus: DomainAuthStatus; dkimStatus: DomainAuthStatus; dmarcRecord: string | null; dmarcStatus: DomainAuthStatus; dmarcPolicy: string | null; dmarcReportingUri: string | null; bimiRecord: string | null; bimiStatus: DomainAuthStatus; bimiVmcUrl: string | null; lastVerifiedAt: Date | null; lastDmarcReportAt: Date | null; reports: { id: string; reporter: string; periodStart: Date; periodEnd: Date; totalMessages: number; passCount: number; failCount: number }[] }[];
  canManage: boolean;
}) {
  return (
    <div className="grid grid-cols-1 gap-3">
      {rows.map((d) => (
        <section key={d.id} className="rounded-xl border"
                 style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)" }}>
          <header className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-3"
                  style={{ borderColor: "var(--border-subtle)" }}>
            <div>
              <h3 className="text-[14px] font-semibold" style={{ color: "var(--text-default)" }}>{d.domain}</h3>
              <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>
                Last verified {relativeFromNow(d.lastVerifiedAt)}
                {d.lastDmarcReportAt && <> · DMARC reports {relativeFromNow(d.lastDmarcReportAt)}</>}
              </p>
            </div>
            {canManage && (
              <form action={reverifyDomain} className="inline-flex">
                <input type="hidden" name="id" value={d.id} />
                <button type="submit" className="inline-flex h-7 items-center rounded-md border px-2 text-[11px] font-medium"
                        style={{ background: "var(--surface-2)", borderColor: "var(--border-subtle)", color: "var(--text-default)" }}>
                  Re-verify
                </button>
              </form>
            )}
          </header>
          <div className="grid grid-cols-2 gap-3 p-4 md:grid-cols-4">
            <AuthCard label="SPF"    status={d.spfStatus}    detail={d.spfRecord ?? "—"} />
            <AuthCard label="DKIM"   status={d.dkimStatus}   detail={`selectors`} />
            <AuthCard label="DMARC"  status={d.dmarcStatus}  detail={d.dmarcPolicy ?? "—"} />
            <AuthCard label="BIMI"   status={d.bimiStatus}   detail={d.bimiVmcUrl ? "VMC cert" : "—"} />
          </div>
          {d.dmarcReportingUri && (
            <div className="border-t px-4 py-2 text-[11px]" style={{ borderColor: "var(--border-subtle)", color: "var(--text-muted)" }}>
              rua={d.dmarcReportingUri}
            </div>
          )}
          {d.reports.length > 0 && (
            <div className="border-t px-4 py-3" style={{ borderColor: "var(--border-subtle)" }}>
              <div className="text-[11px] font-medium" style={{ color: "var(--text-muted)" }}>Recent DMARC reports</div>
              <ul className="mt-1 space-y-1">
                {d.reports.map((r) => (
                  <li key={r.id} className="rounded-md border px-2 py-1.5 text-[11px] tabular-nums"
                      style={{ background: "var(--surface-2)", borderColor: "var(--border-subtle)" }}>
                    <span className="font-medium" style={{ color: "var(--text-default)" }}>{r.reporter}</span>
                    {" · "}{shortDate(r.periodStart)}→{shortDate(r.periodEnd)}{" · "}
                    <span style={{ color: "var(--emerald-700)" }}>{r.passCount} pass</span>{" / "}
                    <span style={{ color: "var(--rose-700)" }}>{r.failCount} fail</span>{" / "}
                    <span style={{ color: "var(--text-muted)" }}>{r.totalMessages.toLocaleString()} total</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
      ))}
      {canManage && (
        <section className="rounded-xl border border-dashed p-4"
                 style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)" }}>
          <h3 className="text-[13px] font-semibold" style={{ color: "var(--text-default)" }}>+ Save sending domain</h3>
          <form action={saveDomain} className="mt-3 grid grid-cols-2 gap-2 md:grid-cols-3">
            <Input name="domain" label="Domain" defaultValue="" required />
            <Input name="hostname" label="Hostname" defaultValue="" />
            <Input name="mxRecord" label="MX record" defaultValue="" />
            <label className="md:col-span-3 block">
              <span className="mb-0.5 block text-[11px] font-medium" style={{ color: "var(--text-muted)" }}>SPF record</span>
              <input name="spfRecord" defaultValue=""
                     className="w-full rounded-md border px-2 py-1.5 text-[12px]"
                     style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)", color: "var(--text-default)" }} />
            </label>
            <Select name="spfStatus"  label="SPF status"  options={AUTH_STATUSES.map((a) => ({ value: a, label: AUTH_STATUS_TONE[a].label }))} />
            <Select name="dkimStatus" label="DKIM status" options={AUTH_STATUSES.map((a) => ({ value: a, label: AUTH_STATUS_TONE[a].label }))} />
            <Select name="dmarcStatus" label="DMARC status" options={AUTH_STATUSES.map((a) => ({ value: a, label: AUTH_STATUS_TONE[a].label }))} />
            <label className="md:col-span-3 block">
              <span className="mb-0.5 block text-[11px] font-medium" style={{ color: "var(--text-muted)" }}>DMARC record</span>
              <input name="dmarcRecord" defaultValue=""
                     className="w-full rounded-md border px-2 py-1.5 text-[12px]"
                     style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)", color: "var(--text-default)" }} />
            </label>
            <Input name="dmarcPolicy"      label="DMARC policy"        defaultValue="quarantine" />
            <Input name="dmarcReportingUri" label="DMARC rua URI"      defaultValue="mailto:dmarc@flowtora.com" />
            <Input name="bimiVmcUrl"       label="BIMI VMC URL"        defaultValue="" />
            <Select name="bimiStatus"      label="BIMI status"         options={AUTH_STATUSES.map((a) => ({ value: a, label: AUTH_STATUS_TONE[a].label }))} />
            <label className="md:col-span-3 block">
              <span className="mb-0.5 block text-[11px] font-medium" style={{ color: "var(--text-muted)" }}>Notes</span>
              <input name="notes" defaultValue=""
                     className="w-full rounded-md border px-2 py-1.5 text-[12px]"
                     style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)", color: "var(--text-default)" }} />
            </label>
            <div className="md:col-span-3 flex justify-end">
              <button type="submit" className="inline-flex h-8 items-center rounded-md px-3 text-[12px] font-medium"
                      style={{ background: "var(--accent-default)", color: "var(--accent-fg)" }}>
                Save domain
              </button>
            </div>
          </form>
        </section>
      )}
    </div>
  );
}

function AuthCard({ label, status, detail }: { label: string; status: DomainAuthStatus; detail: string }) {
  const tone = AUTH_STATUS_TONE[status];
  return (
    <div className="rounded-md border px-3 py-2"
         style={{ background: "var(--surface-2)", borderColor: "var(--border-subtle)" }}>
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-medium uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>{label}</span>
        <span className="inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
              style={{ background: tone.bg, color: tone.fg }}>{tone.label}</span>
      </div>
      <div className="mt-1 truncate text-[11px]" style={{ color: "var(--text-default)" }}>{detail}</div>
    </div>
  );
}

/* ── Templates tab ─────────────────────────────────────── */

function TemplatesTab({
  rows, canManage,
}: {
  rows: { id: string; templateKey: string; name: string; category: string | null; sent24h: number; delivered24h: number; opens24h: number; clicks24h: number; bounces24h: number; complaints24h: number; openRate: number; clickRate: number; bounceRate: number; hasAbVariant: boolean; suspended: boolean; suspendedReason: string | null }[];
  canManage: boolean;
}) {
  return (
    <section className="rounded-xl border"
             style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)" }}>
      <header className="border-b px-4 py-3" style={{ borderColor: "var(--border-subtle)" }}>
        <h3 className="text-[13px] font-semibold" style={{ color: "var(--text-default)" }}>Templates</h3>
        <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>{rows.length} templates · 24h rollup.</p>
      </header>
      <div className="overflow-x-auto p-4">
        {rows.length === 0 ? <Empty>No templates tracked yet.</Empty> : (
          <table className="w-full">
            <thead>
              <tr style={{ color: "var(--text-muted)" }}>
                <Th>Template</Th><Th>Category</Th>
                <Th>Sent 24h</Th><Th>Delivered</Th><Th>Open %</Th><Th>Click %</Th><Th>Bounce %</Th><Th>Compl.</Th>
                <Th>A/B</Th><Th>State</Th>
                {canManage && <Th right>Action</Th>}
              </tr>
            </thead>
            <tbody>
              {rows.map((t) => (
                <tr key={t.id} className="border-t" style={{ borderColor: "var(--border-subtle)" }}>
                  <Td>
                    <div className="text-[12px] font-medium" style={{ color: "var(--text-default)" }}>{t.name}</div>
                    <code className="text-[11px] tabular-nums" style={{ color: "var(--text-muted)" }}>{t.templateKey}</code>
                    {t.suspended && t.suspendedReason && <div className="text-[11px]" style={{ color: "var(--rose-700)" }}>Suspended: {t.suspendedReason}</div>}
                  </Td>
                  <Td><span className="text-[11px]" style={{ color: "var(--text-muted)" }}>{t.category ?? "—"}</span></Td>
                  <Td><Num n={t.sent24h} /></Td>
                  <Td><Num n={t.delivered24h} /></Td>
                  <Td><span className="text-[11px] tabular-nums" style={{ color: "var(--text-default)" }}>{t.openRate.toFixed(1)}%</span></Td>
                  <Td><span className="text-[11px] tabular-nums" style={{ color: "var(--text-default)" }}>{t.clickRate.toFixed(1)}%</span></Td>
                  <Td><span className="text-[11px] tabular-nums"
                          style={{ color: t.bounceRate > 2 ? "var(--rose-700)" : t.bounceRate > 1 ? "var(--amber-700)" : "var(--text-default)" }}>
                    {t.bounceRate.toFixed(2)}%
                  </span></Td>
                  <Td><Num n={t.complaints24h} tone={t.complaints24h > 0 ? "danger" : undefined} /></Td>
                  <Td>{t.hasAbVariant
                    ? <span className="inline-flex items-center rounded-md px-1.5 py-0.5 text-[10px] font-medium" style={{ background: "var(--violet-100)", color: "var(--violet-700)" }}>A/B</span>
                    : <span className="text-[11px]" style={{ color: "var(--text-muted)" }}>—</span>}</Td>
                  <Td>
                    {t.suspended
                      ? <span className="inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-semibold" style={{ background: "var(--rose-100)", color: "var(--rose-700)" }}>Suspended</span>
                      : <span className="inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-semibold" style={{ background: "var(--emerald-100)", color: "var(--emerald-700)" }}>Active</span>}
                  </Td>
                  {canManage && (
                    <Td right>
                      <form action={toggleTemplateSuspend} className="inline-flex items-center gap-1">
                        <input type="hidden" name="id" value={t.id} />
                        <input type="hidden" name="suspend" value={t.suspended ? "0" : "1"} />
                        {!t.suspended && (
                          <input name="reason" placeholder="reason"
                                 className="w-24 rounded-md border px-1.5 py-0.5 text-[11px]"
                                 style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)", color: "var(--text-default)" }} />
                        )}
                        <button type="submit" className="text-[11px] font-medium underline" style={{ color: t.suspended ? "var(--accent-default)" : "var(--rose-700)" }}>
                          {t.suspended ? "Resume" : "Suspend"}
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
    </section>
  );
}

/* ── Providers tab ─────────────────────────────────────── */

function ProvidersTab({
  rows, canManage,
}: {
  rows: { id: string; key: string; name: string; role: EmailProviderRole; health: EmailProviderHealth; costPer1000Cents: number; autoFailover: boolean; dailyCap: number; sent24h: number; bounceRate24h: number; complaintRate24h: number; errorRate24h: number; domains: string[]; lastDeliveredAt: Date | null; notes: string | null }[];
  canManage: boolean;
}) {
  return (
    <section className="rounded-xl border"
             style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)" }}>
      <header className="border-b px-4 py-3" style={{ borderColor: "var(--border-subtle)" }}>
        <h3 className="text-[13px] font-semibold" style={{ color: "var(--text-default)" }}>Providers &amp; routing</h3>
        <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>{rows.length} providers · automatic failover honors role + health.</p>
      </header>
      <div className="overflow-x-auto p-4">
        {rows.length === 0 ? <Empty>No providers configured.</Empty> : (
          <table className="w-full">
            <thead>
              <tr style={{ color: "var(--text-muted)" }}>
                <Th>Provider</Th><Th>Role</Th><Th>Health</Th>
                <Th>Sent 24h</Th><Th>Bounce %</Th><Th>Compl. %</Th>
                <Th>Error %</Th><Th>Cost /1k</Th><Th>Daily cap</Th>
                <Th>Failover</Th><Th>Domains</Th>
                {canManage && <Th right>Action</Th>}
              </tr>
            </thead>
            <tbody>
              {rows.map((p) => (
                <tr key={p.id} className="border-t" style={{ borderColor: "var(--border-subtle)" }}>
                  <Td>
                    <div className="text-[12px] font-medium" style={{ color: "var(--text-default)" }}>{p.name}</div>
                    <code className="text-[11px] tabular-nums" style={{ color: "var(--text-muted)" }}>{p.key}</code>
                  </Td>
                  <Td><Pill tone={PROVIDER_ROLE_TONE[p.role]} /></Td>
                  <Td><Pill tone={PROVIDER_HEALTH_TONE[p.health]} /></Td>
                  <Td><Num n={p.sent24h} /></Td>
                  <Td><span className="text-[11px] tabular-nums"
                          style={{ color: p.bounceRate24h > 2 ? "var(--rose-700)" : "var(--text-default)" }}>{p.bounceRate24h.toFixed(2)}%</span></Td>
                  <Td><span className="text-[11px] tabular-nums" style={{ color: "var(--text-default)" }}>{p.complaintRate24h.toFixed(3)}%</span></Td>
                  <Td><span className="text-[11px] tabular-nums"
                          style={{ color: p.errorRate24h > 0.5 ? "var(--rose-700)" : "var(--text-default)" }}>{p.errorRate24h.toFixed(2)}%</span></Td>
                  <Td><span className="text-[11px] tabular-nums" style={{ color: "var(--text-default)" }}>${(p.costPer1000Cents / 100).toFixed(2)}</span></Td>
                  <Td><span className="text-[11px] tabular-nums" style={{ color: "var(--text-muted)" }}>{p.dailyCap === 0 ? "—" : p.dailyCap.toLocaleString()}</span></Td>
                  <Td>
                    <span className="text-[11px]" style={{ color: p.autoFailover ? "var(--emerald-700)" : "var(--text-muted)" }}>
                      {p.autoFailover ? "Auto" : "Off"}
                    </span>
                  </Td>
                  <Td><span className="text-[11px] tabular-nums" style={{ color: "var(--text-muted)" }}>{p.domains.join(", ") || "—"}</span></Td>
                  {canManage && (
                    <Td right>
                      {p.role !== "PRIMARY" && (
                        <form action={setProviderPrimary}>
                          <input type="hidden" name="id" value={p.id} />
                          <button type="submit" className="text-[11px] font-medium underline" style={{ color: "var(--accent-default)" }}>
                            Make primary
                          </button>
                        </form>
                      )}
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
              + Save provider
            </summary>
            <form action={saveProvider} className="mt-3 grid grid-cols-2 gap-2 md:grid-cols-3">
              <Input name="key" label="Key" defaultValue="" required />
              <Input name="name" label="Name" defaultValue="" required />
              <Select name="role" label="Role"
                      options={PROVIDER_ROLES.map((r) => ({ value: r, label: PROVIDER_ROLE_TONE[r].label }))} />
              <Select name="health" label="Health"
                      options={PROVIDER_HEALTH.map((h) => ({ value: h, label: PROVIDER_HEALTH_TONE[h].label }))} />
              <Input name="costPer1000Cents" label="Cost per 1000 (cents)" type="number" defaultValue="0" />
              <Input name="dailyCap" label="Daily cap (0 = unlimited)" type="number" defaultValue="0" />
              <Input name="domains" label="Domains (comma)" defaultValue="" />
              <label className="inline-flex items-center gap-2 text-[12px]" style={{ color: "var(--text-default)" }}>
                <input type="checkbox" name="autoFailover" defaultChecked /> Auto failover
              </label>
              <Input name="notes" label="Notes" defaultValue="" />
              <div className="md:col-span-3 flex justify-end">
                <button type="submit" className="inline-flex h-8 items-center rounded-md px-3 text-[12px] font-medium"
                        style={{ background: "var(--accent-default)", color: "var(--accent-fg)" }}>
                  Save provider
                </button>
              </div>
            </form>
          </details>
        </div>
      )}
    </section>
  );
}

/* ── Settings tab ──────────────────────────────────────── */

function SettingsTab({
  settings, canManage,
}: {
  settings: { bounceTargetPct: number; complaintTargetPct: number; autoSuppressOnComplaint: boolean; autoSuppressOnHardBounce: boolean; softBounceBackoffH: number; failoverOrder: string[]; notes: string | null } | null;
  canManage: boolean;
}) {
  if (!canManage) {
    return (
      <div className="rounded-md border p-6 text-center text-[12px]"
           style={{ borderColor: "var(--border-subtle)", background: "var(--surface-1)", color: "var(--text-muted)" }}>
        Read access only — settings management requires <code>email.deliverability.manage</code>.
      </div>
    );
  }
  return (
    <section className="rounded-xl border p-5"
             style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)" }}>
      <h3 className="text-[13px] font-semibold" style={{ color: "var(--text-default)" }}>Deliverability settings</h3>
      <p className="mt-0.5 text-[11px]" style={{ color: "var(--text-muted)" }}>
        Targets, auto-suppression, soft-bounce backoff, provider failover order.
      </p>
      <form action={saveEmailSettings} className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-3">
        <Input name="bounceTargetPct" label="Bounce rate target (%)" type="number" defaultValue={String(settings?.bounceTargetPct ?? 2.0)} />
        <Input name="complaintTargetPct" label="Complaint rate target (%)" type="number" defaultValue={String(settings?.complaintTargetPct ?? 0.1)} />
        <Input name="softBounceBackoffH" label="Soft-bounce backoff (h)" type="number" defaultValue={String(settings?.softBounceBackoffH ?? 72)} />
        <label className="inline-flex items-center gap-2 text-[12px]" style={{ color: "var(--text-default)" }}>
          <input type="checkbox" name="autoSuppressOnComplaint" defaultChecked={settings?.autoSuppressOnComplaint ?? true} /> Auto-suppress on complaint
        </label>
        <label className="inline-flex items-center gap-2 text-[12px]" style={{ color: "var(--text-default)" }}>
          <input type="checkbox" name="autoSuppressOnHardBounce" defaultChecked={settings?.autoSuppressOnHardBounce ?? true} /> Auto-suppress on hard bounce
        </label>
        <Input name="failoverOrder" label="Failover order (comma keys)" defaultValue={(settings?.failoverOrder ?? []).join(",")} />
        <label className="md:col-span-3 block">
          <span className="mb-0.5 block text-[11px] font-medium" style={{ color: "var(--text-muted)" }}>Notes</span>
          <textarea name="notes" rows={3} defaultValue={settings?.notes ?? ""}
                    className="w-full rounded-md border px-2 py-1.5 text-[12px]"
                    style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)", color: "var(--text-default)" }} />
        </label>
        <div className="md:col-span-3 flex justify-end">
          <button type="submit" className="inline-flex h-9 items-center rounded-md px-4 text-[13px] font-medium"
                  style={{ background: "var(--accent-default)", color: "var(--accent-fg)" }}>
            Save settings
          </button>
        </div>
      </form>
    </section>
  );
}

/* ── Tiny helpers ──────────────────────────────────────── */

function Pill({ tone }: { tone: { bg: string; fg: string; label: string } }) {
  return (
    <span className="inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
          style={{ background: tone.bg, color: tone.fg }}>
      {tone.label}
    </span>
  );
}

function Num({ n, tone }: { n: number; tone?: "danger" | "warning" }) {
  const color =
    tone === "danger"  ? "var(--rose-700)" :
    tone === "warning" ? "var(--amber-700)" :
                          "var(--text-default)";
  return <span className="text-[11px] tabular-nums" style={{ color }}>{n.toLocaleString()}</span>;
}

function Kpi({
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

function FormError({ msg }: { msg?: string }) {
  if (!msg) return null;
  return (
    <div className="rounded-md border px-3 py-2 text-[12px]"
         style={{ borderColor: "var(--rose-200)", background: "var(--rose-50, var(--surface-2))", color: "var(--danger-fg)" }}>
      {decodeURIComponent(msg)}
    </div>
  );
}
function FormOk({ msg }: { msg?: string }) {
  if (!msg) return null;
  return (
    <div className="rounded-md border px-3 py-2 text-[12px]"
         style={{ borderColor: "var(--emerald-200)", background: "var(--emerald-50, var(--surface-2))", color: "var(--success-fg)" }}>
      {decodeURIComponent(msg.replace(/-/g, " "))}
    </div>
  );
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
