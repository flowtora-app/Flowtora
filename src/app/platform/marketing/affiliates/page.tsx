// Page 42 — Affiliate Program (top-level).
//
// Tabs: Affiliates · Applications · Commissions · Creative Library · Settings

import Link from "next/link";
import { requirePlatformStaff } from "@/lib/platform";
import {
  loadAffiliateKpis,
  loadAffiliateList,
  loadAffiliateApplications,
  loadAffiliateTiers,
  loadAffiliateCommissions,
  loadAffiliateCreatives,
  loadAffiliateProgramSettings,
  summarizeTierCommission,
  creativeKindLabel,
  type AffiliateListRow,
  type AffiliateApplicationRow,
  type AffiliateTierRow,
  type AffiliateCommissionRow,
  type AffiliateCreativeRow,
  type AffiliateProgramSettingsView,
  type AffiliateKpis,
} from "@/server/platform/affiliates";
import {
  saveAffiliateSettings,
  approveAffiliateApplication,
  rejectAffiliateApplication,
  saveAffiliateTier,
  deleteAffiliateTier,
  saveAffiliateCreative,
  deleteAffiliateCreative,
} from "@/app/actions/platform-affiliates";
import type { AffiliateStatus, AffiliateCreativeKind } from "@prisma/client";
import {
  Kpi, StatusPill, AppStatusPill, FormError, FormOk, dollars, CREATIVE_KIND_ICON,
} from "./_shared";

export const dynamic = "force-dynamic";

type SP = Record<string, string | string[] | undefined>;
const asString = (v: string | string[] | undefined): string | undefined =>
  typeof v === "string" && v.length > 0 ? v : undefined;

const TABS = ["affiliates", "applications", "commissions", "creative", "settings"] as const;
type Tab = typeof TABS[number];

const STATUS_OPTIONS: AffiliateStatus[] = ["ACTIVE", "PAUSED", "ARCHIVED"];

export default async function AffiliateProgramPage({
  searchParams,
}: { searchParams: Promise<SP> }) {
  const ctx = await requirePlatformStaff();
  const sp = await searchParams;
  const canWrite = ctx.can("affiliates.manage");

  const tabRaw = asString(sp.tab) as Tab | undefined;
  const tab: Tab = tabRaw && (TABS as readonly string[]).includes(tabRaw) ? tabRaw : "affiliates";
  const ok = asString(sp.ok);
  const error = asString(sp.error);

  const q = asString(sp.q);
  const statusRaw = asString(sp.status);
  const status = statusRaw && (STATUS_OPTIONS as string[]).includes(statusRaw) ? (statusRaw as AffiliateStatus) : undefined;

  const [kpis, settings, list, apps, tiers, commissions, creatives] = await Promise.all([
    loadAffiliateKpis(30),
    loadAffiliateProgramSettings(),
    loadAffiliateList({ q, status, pageSize: 100 }),
    loadAffiliateApplications(),
    loadAffiliateTiers(),
    loadAffiliateCommissions({ pageSize: 100 }),
    loadAffiliateCreatives(),
  ]);

  return (
    <div className="space-y-5">
      <Header settings={settings} />

      {ok && <FormOk msg={ok} />}
      {error && <FormError msg={error} />}

      <KpiStrip kpis={kpis} />

      <TabsBar
        active={tab}
        pendingApps={apps.pending.length}
        affiliates={list.total}
      />

      {tab === "affiliates" && (
        <AffiliatesTab list={list.rows} q={q} status={status} />
      )}
      {tab === "applications" && (
        <ApplicationsTab apps={apps} tiers={tiers} canWrite={canWrite} />
      )}
      {tab === "commissions" && (
        <CommissionsTab commissions={commissions} />
      )}
      {tab === "creative" && (
        <CreativeTab creatives={creatives} canWrite={canWrite} />
      )}
      {tab === "settings" && (
        <SettingsTab settings={settings} tiers={tiers} canWrite={canWrite} />
      )}
    </div>
  );
}

/* ── Header ─────────────────────────────────────────────── */

function Header({ settings }: { settings: AffiliateProgramSettingsView }) {
  return (
    <div>
      <div className="text-[11px] font-medium" style={{ color: "var(--text-muted)" }}>Marketing</div>
      <h1 className="mt-1 text-[22px] font-semibold leading-tight" style={{ color: "var(--text-default)" }}>
        Affiliate program
      </h1>
      <p className="mt-1 max-w-3xl text-[12px]" style={{ color: "var(--text-muted)" }}>
        External partners promote Flowtora and earn commission on the tenants they refer. Manage applications,
        commission tiers, creative assets, and program settings.
      </p>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <span
          className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium"
          style={{
            background: settings.active ? "var(--success-surface)" : "var(--surface-2)",
            color:      settings.active ? "var(--success-fg)" : "var(--text-muted)",
          }}>
          <span className="h-1.5 w-1.5 rounded-full"
                style={{ background: settings.active ? "var(--success-fg)" : "var(--text-faint)" }} />
          {settings.active ? "Program active" : "Program disabled"}
        </span>
        <span className="text-[11px]" style={{ color: "var(--text-muted)" }}>
          {settings.acceptingApplications ? "Accepting applications · " : "Applications closed · "}
          {settings.applicationMode === "AUTO_APPROVE" ? "auto-approve" : "manual review"} ·
          {" "}{settings.cookieDays}-day cookie ·
          {" "}min payout {dollars(settings.minPayoutCents)}
        </span>
      </div>
    </div>
  );
}

/* ── KPI strip ──────────────────────────────────────────── */

function KpiStrip({ kpis }: { kpis: AffiliateKpis }) {
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
      <Kpi label="Affiliates · active"
           value={kpis.activeAffiliates.toLocaleString()}
           sub={`${kpis.totalAffiliates.toLocaleString()} total`} />
      <Kpi label="Applications"
           value={kpis.pendingApplications.toLocaleString()}
           sub="Pending review"
           tone={kpis.pendingApplications > 0 ? "warning" : "default"} />
      <Kpi label="Clicks · period"
           value={kpis.clicksThisPeriod.toLocaleString()}
           sub={`Last ${kpis.periodDays}d`} />
      <Kpi label="Conversions"
           value={kpis.conversionsThisPeriod.toLocaleString()}
           sub={kpis.conversionRate == null ? "" : `${(kpis.conversionRate * 100).toFixed(1)}% conv rate`}
           tone={kpis.conversionRate == null ? "default" :
                 kpis.conversionRate >= 0.05 ? "good" :
                 kpis.conversionRate >= 0.02 ? "warning" : "danger"} />
      <Kpi label="Earned · period"
           value={dollars(kpis.earnedThisPeriodCents)}
           sub="Commissions accrued" />
      <Kpi label="Pending payouts"
           value={dollars(kpis.pendingPayoutCents)}
           sub="Owed to affiliates"
           tone={kpis.pendingPayoutCents > 50_000 ? "warning" : "default"} />
    </div>
  );
}

/* ── Tabs bar ───────────────────────────────────────────── */

function TabsBar({ active, pendingApps, affiliates }: { active: Tab; pendingApps: number; affiliates: number }) {
  const items: Array<{ key: Tab; label: string; badge?: string }> = [
    { key: "affiliates",   label: "Affiliates",   badge: affiliates > 0 ? String(affiliates) : undefined },
    { key: "applications", label: "Applications", badge: pendingApps > 0 ? String(pendingApps) : undefined },
    { key: "commissions",  label: "Commissions" },
    { key: "creative",     label: "Creative library" },
    { key: "settings",     label: "Settings" },
  ];
  return (
    <nav className="flex flex-wrap items-center gap-1 border-b" style={{ borderColor: "var(--border-subtle)" }}>
      {items.map((i) => {
        const isActive = i.key === active;
        return (
          <Link
            key={i.key}
            href={`?tab=${i.key}`}
            scroll={false}
            className="ts-focus inline-flex items-center gap-1.5 px-3 py-2 text-[12px] font-medium"
            style={{
              color: isActive ? "var(--text-default)" : "var(--text-muted)",
              borderBottom: isActive ? "2px solid var(--accent-primary)" : "2px solid transparent",
              marginBottom: "-1px",
            }}>
            {i.label}
            {i.badge && (
              <span className="rounded-full px-1.5 py-0.5 text-[10px] font-semibold"
                    style={{
                      background: i.key === "applications" ? "var(--warning-surface)" : "var(--surface-2)",
                      color:      i.key === "applications" ? "var(--warning-fg)"     : "var(--text-muted)",
                    }}>
                {i.badge}
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}

/* ── Affiliates tab ─────────────────────────────────────── */

function AffiliatesTab({ list, q, status }: {
  list: AffiliateListRow[];
  q?: string;
  status?: AffiliateStatus;
}) {
  return (
    <div className="space-y-3">
      <form className="flex flex-wrap items-center gap-2" method="get">
        <input type="hidden" name="tab" value="affiliates" />
        <input
          type="text"
          name="q"
          defaultValue={q ?? ""}
          placeholder="Search by name, email, or code…"
          className="ts-focus min-w-[260px] flex-1 rounded-md border px-2.5 py-1.5 text-[12px]"
          style={{ borderColor: "var(--border-default)", background: "var(--surface-1)" }}
        />
        <select
          name="status"
          defaultValue={status ?? ""}
          className="ts-focus rounded-md border px-2 py-1.5 text-[12px]"
          style={{ borderColor: "var(--border-default)", background: "var(--surface-1)" }}>
          <option value="">All statuses</option>
          {STATUS_OPTIONS.map((s) => <option key={s} value={s}>{s.toLowerCase()}</option>)}
        </select>
        <button type="submit"
                className="ts-focus rounded-md px-3 py-1.5 text-[12px] font-medium"
                style={{ background: "var(--surface-2)", color: "var(--text-default)", border: "1px solid var(--border-default)" }}>
          Filter
        </button>
      </form>

      <div className="rounded-lg border overflow-x-auto"
           style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)" }}>
        {list.length === 0 ? (
          <p className="p-3 text-[11px]" style={{ color: "var(--text-muted)" }}>
            No affiliates match these filters.
          </p>
        ) : (
          <table className="w-full text-[12px]">
            <thead>
              <tr style={{ color: "var(--text-muted)" }}>
                <th className="px-2 py-2 text-left text-[10px] font-semibold uppercase tracking-wide">Affiliate</th>
                <th className="px-2 py-2 text-left text-[10px] font-semibold uppercase tracking-wide">Email</th>
                <th className="px-2 py-2 text-left text-[10px] font-semibold uppercase tracking-wide">Status</th>
                <th className="px-2 py-2 text-left text-[10px] font-semibold uppercase tracking-wide">Tier</th>
                <th className="px-2 py-2 text-left text-[10px] font-semibold uppercase tracking-wide">Tracking link</th>
                <th className="px-2 py-2 text-right text-[10px] font-semibold uppercase tracking-wide">Clicks</th>
                <th className="px-2 py-2 text-right text-[10px] font-semibold uppercase tracking-wide">Conv</th>
                <th className="px-2 py-2 text-right text-[10px] font-semibold uppercase tracking-wide">Conv rate</th>
                <th className="px-2 py-2 text-right text-[10px] font-semibold uppercase tracking-wide">Earned</th>
                <th className="px-2 py-2 text-right text-[10px] font-semibold uppercase tracking-wide">Pending</th>
              </tr>
            </thead>
            <tbody>
              {list.map((a) => (
                <tr key={a.id} className="border-t" style={{ borderColor: "var(--border-subtle)" }}>
                  <td className="px-2 py-1.5">
                    <Link href={`/platform/marketing/affiliates/${a.id}`}
                          className="ts-focus font-medium underline"
                          style={{ color: "var(--text-default)" }}>
                      {a.name}
                    </Link>
                    <div className="text-[10px]" style={{ color: "var(--text-muted)" }}>{a.code}</div>
                  </td>
                  <td className="px-2 py-1.5" style={{ color: "var(--text-muted)" }}>{a.email}</td>
                  <td className="px-2 py-1.5"><StatusPill status={a.status} /></td>
                  <td className="px-2 py-1.5" style={{ color: "var(--text-default)" }}>{a.tierName ?? <span style={{ color: "var(--text-faint)" }}>—</span>}</td>
                  <td className="px-2 py-1.5">
                    <code className="rounded px-1.5 py-0.5 text-[10px]"
                          style={{ background: "var(--surface-2)", color: "var(--text-muted)" }}>
                      {a.trackingLink}
                    </code>
                  </td>
                  <td className="px-2 py-1.5 text-right tabular-nums" style={{ color: "var(--text-muted)" }}>{a.clicks.toLocaleString()}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums" style={{ color: "var(--text-default)" }}>{a.conversions.toLocaleString()}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums"
                      style={{ color: a.conversionRate == null ? "var(--text-faint)" :
                                      a.conversionRate >= 0.05 ? "var(--success-fg)" : "var(--text-muted)" }}>
                    {a.conversionRate == null ? "—" : `${(a.conversionRate * 100).toFixed(1)}%`}
                  </td>
                  <td className="px-2 py-1.5 text-right font-semibold tabular-nums" style={{ color: "var(--success-fg)" }}>
                    {dollars(a.earnedCents)}
                  </td>
                  <td className="px-2 py-1.5 text-right tabular-nums"
                      style={{ color: a.pendingPayoutCents > 0 ? "var(--warning-fg)" : "var(--text-faint)" }}>
                    {a.pendingPayoutCents > 0 ? dollars(a.pendingPayoutCents) : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

/* ── Applications tab ───────────────────────────────────── */

function ApplicationsTab({
  apps, tiers, canWrite,
}: {
  apps: { pending: AffiliateApplicationRow[]; reviewed: AffiliateApplicationRow[] };
  tiers: AffiliateTierRow[];
  canWrite: boolean;
}) {
  return (
    <div className="space-y-4">
      <ApplicationList
        title={`Pending · ${apps.pending.length}`}
        rows={apps.pending}
        tiers={tiers}
        canWrite={canWrite}
        showActions
        empty="No applications waiting for review."
      />
      <ApplicationList
        title={`Reviewed · ${apps.reviewed.length}`}
        rows={apps.reviewed}
        tiers={tiers}
        canWrite={false}
        showActions={false}
        empty="Approved or rejected applications will appear here."
        muted
      />
    </div>
  );
}

function ApplicationList({
  title, rows, tiers, canWrite, showActions, empty, muted,
}: {
  title: string;
  rows: AffiliateApplicationRow[];
  tiers: AffiliateTierRow[];
  canWrite: boolean;
  showActions: boolean;
  empty: string;
  muted?: boolean;
}) {
  return (
    <div className="rounded-lg border p-3"
         style={{ background: muted ? "var(--surface-2)" : "var(--surface-1)", borderColor: "var(--border-subtle)" }}>
      <h2 className="mb-2 text-[12px] font-semibold" style={{ color: "var(--text-default)" }}>{title}</h2>
      {rows.length === 0 ? (
        <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>{empty}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {rows.map((r) => (
            <li key={r.id} className="rounded-md border p-3"
                style={{ borderColor: "var(--border-subtle)", background: "var(--surface-1)" }}>
              <div className="flex flex-wrap items-center gap-2">
                <AppStatusPill status={r.status} />
                <span className="text-[12px] font-semibold" style={{ color: "var(--text-default)" }}>{r.name}</span>
                <span className="text-[11px]" style={{ color: "var(--text-muted)" }}>{r.email}</span>
                <span className="text-[11px] ml-auto" style={{ color: "var(--text-muted)" }}>
                  {r.createdAt.toLocaleDateString()}
                </span>
              </div>
              <dl className="mt-2 grid grid-cols-1 gap-1 text-[11px] md:grid-cols-3">
                {r.websiteUrl && (
                  <div>
                    <dt className="font-semibold uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>Website</dt>
                    <dd><a href={r.websiteUrl} target="_blank" rel="noopener noreferrer"
                           className="underline" style={{ color: "var(--accent-primary)" }}>{r.websiteUrl}</a></dd>
                  </div>
                )}
                {r.promoChannels && (
                  <div>
                    <dt className="font-semibold uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>Channels</dt>
                    <dd style={{ color: "var(--text-default)" }}>{r.promoChannels}</dd>
                  </div>
                )}
                {r.estimatedAudience != null && (
                  <div>
                    <dt className="font-semibold uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>Audience</dt>
                    <dd style={{ color: "var(--text-default)" }}>{r.estimatedAudience.toLocaleString()}</dd>
                  </div>
                )}
              </dl>
              {r.why && (
                <p className="mt-2 rounded-md border-l-2 px-2 py-1 text-[11px]"
                   style={{ borderColor: "var(--accent-primary)", background: "var(--surface-2)", color: "var(--text-default)" }}>
                  {r.why}
                </p>
              )}
              {r.reviewerNote && (
                <div className="mt-2">
                  <dt className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>Reviewer note</dt>
                  <dd className="text-[11px]" style={{ color: "var(--text-default)" }}>{r.reviewerNote}</dd>
                </div>
              )}
              {showActions && canWrite && (
                <form action={approveAffiliateApplication} className="mt-3 flex flex-wrap items-center gap-2">
                  <input type="hidden" name="id" value={r.id} />
                  <select name="tierId"
                          className="ts-focus rounded-md border px-2 py-1 text-[11px]"
                          style={{ borderColor: "var(--border-default)", background: "var(--surface-1)" }}>
                    <option value="">Default tier</option>
                    {tiers.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </select>
                  <input type="text" name="note" placeholder="Reviewer note (optional)" maxLength={500}
                         className="ts-focus min-w-[160px] flex-1 rounded-md border px-2 py-1 text-[11px]"
                         style={{ borderColor: "var(--border-default)", background: "var(--surface-1)" }} />
                  <button type="submit"
                          className="ts-focus rounded-md px-2.5 py-1 text-[11px] font-medium"
                          style={{ background: "var(--success-fg)", color: "white" }}>
                    Approve
                  </button>
                  <button type="submit" formAction={rejectAffiliateApplication}
                          className="ts-focus rounded-md px-2.5 py-1 text-[11px] font-medium"
                          style={{ background: "var(--danger-fg)", color: "white" }}>
                    Reject
                  </button>
                </form>
              )}
              {r.affiliateId && (
                <Link href={`/platform/marketing/affiliates/${r.affiliateId}`}
                      className="mt-2 inline-block text-[11px] underline"
                      style={{ color: "var(--accent-primary)" }}>
                  View affiliate →
                </Link>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/* ── Commissions tab ────────────────────────────────────── */

function CommissionsTab({ commissions }: {
  commissions: { rows: AffiliateCommissionRow[]; totalEarned: number; totalPending: number };
}) {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <Kpi label="Earned · all-time" value={dollars(commissions.totalEarned)} />
        <Kpi label="Awaiting payout" value={dollars(commissions.totalPending)}
             tone={commissions.totalPending > 50_000 ? "warning" : "default"} />
      </div>

      <div className="rounded-lg border overflow-x-auto"
           style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)" }}>
        {commissions.rows.length === 0 ? (
          <p className="p-3 text-[11px]" style={{ color: "var(--text-muted)" }}>
            No commission lines yet — they materialize once attributed payments land.
          </p>
        ) : (
          <table className="w-full text-[12px]">
            <thead>
              <tr style={{ color: "var(--text-muted)" }}>
                <th className="px-2 py-2 text-left text-[10px] font-semibold uppercase tracking-wide">Earned</th>
                <th className="px-2 py-2 text-left text-[10px] font-semibold uppercase tracking-wide">Affiliate</th>
                <th className="px-2 py-2 text-left text-[10px] font-semibold uppercase tracking-wide">Description</th>
                <th className="px-2 py-2 text-left text-[10px] font-semibold uppercase tracking-wide">Period</th>
                <th className="px-2 py-2 text-left text-[10px] font-semibold uppercase tracking-wide">Kind</th>
                <th className="px-2 py-2 text-left text-[10px] font-semibold uppercase tracking-wide">Payout</th>
                <th className="px-2 py-2 text-right text-[10px] font-semibold uppercase tracking-wide">Amount</th>
              </tr>
            </thead>
            <tbody>
              {commissions.rows.map((c) => (
                <tr key={c.id} className="border-t" style={{ borderColor: "var(--border-subtle)" }}>
                  <td className="px-2 py-1.5" style={{ color: "var(--text-muted)" }}>{c.earnedAt.toLocaleDateString()}</td>
                  <td className="px-2 py-1.5">
                    <Link href={`/platform/marketing/affiliates/${c.affiliateId}`}
                          className="ts-focus underline" style={{ color: "var(--text-default)" }}>
                      {c.affiliateName}
                    </Link>
                    <div className="text-[10px]" style={{ color: "var(--text-muted)" }}>{c.affiliateCode}</div>
                  </td>
                  <td className="px-2 py-1.5" style={{ color: "var(--text-default)" }}>{c.description}</td>
                  <td className="px-2 py-1.5" style={{ color: "var(--text-muted)" }}>{c.period}</td>
                  <td className="px-2 py-1.5">
                    <span className="rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
                          style={{
                            background: c.kind === "DEDUCTION" ? "var(--rose-50, var(--surface-2))" :
                                        c.kind === "BONUS"     ? "var(--accent-surface)" : "var(--surface-2)",
                            color:      c.kind === "DEDUCTION" ? "var(--danger-fg)" :
                                        c.kind === "BONUS"     ? "var(--accent-primary)" : "var(--text-muted)",
                          }}>
                      {c.kind.toLowerCase()}
                    </span>
                  </td>
                  <td className="px-2 py-1.5" style={{ color: "var(--text-muted)" }}>
                    {c.payoutId ? (
                      <span title={`Payout #${c.payoutId.slice(0, 8)}`}>
                        {c.payoutStatus?.toLowerCase() ?? "linked"}
                      </span>
                    ) : (
                      <span style={{ color: "var(--warning-fg)" }}>pending</span>
                    )}
                  </td>
                  <td className="px-2 py-1.5 text-right font-semibold tabular-nums"
                      style={{ color: c.kind === "DEDUCTION" ? "var(--danger-fg)" : "var(--success-fg)" }}>
                    {c.kind === "DEDUCTION" ? "−" : "+"}{dollars(c.amountCents)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

/* ── Creative library tab ───────────────────────────────── */

function CreativeTab({ creatives, canWrite }: { creatives: AffiliateCreativeRow[]; canWrite: boolean }) {
  return (
    <div className="space-y-4">
      {canWrite && (
        <details className="rounded-lg border p-3"
                 style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)" }}>
          <summary className="cursor-pointer text-[12px] font-semibold" style={{ color: "var(--text-default)" }}>
            + Add creative
          </summary>
          <CreativeForm canWrite={canWrite} />
        </details>
      )}

      <div className="rounded-lg border p-3"
           style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)" }}>
        <h2 className="mb-2 text-[12px] font-semibold" style={{ color: "var(--text-default)" }}>
          Creative library · {creatives.length}
        </h2>
        {creatives.length === 0 ? (
          <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>
            No creatives yet — add banners, text links, email templates, social posts, ad copy, or video scripts.
          </p>
        ) : (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
            {creatives.map((c) => (
              <CreativeCard key={c.id} c={c} canWrite={canWrite} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function CreativeCard({ c, canWrite }: { c: AffiliateCreativeRow; canWrite: boolean }) {
  return (
    <div className="rounded-md border p-3"
         style={{ borderColor: "var(--border-subtle)", background: "var(--surface-2)" }}>
      <div className="flex items-center justify-between">
        <span className="text-[16px]" title={creativeKindLabel(c.kind)}>
          {CREATIVE_KIND_ICON[c.kind]}
        </span>
        <span className="rounded-full px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
              style={{
                background: c.active ? "var(--success-surface)" : "var(--surface-2)",
                color:      c.active ? "var(--success-fg)" : "var(--text-faint)",
                border: c.active ? "none" : "1px solid var(--border-subtle)",
              }}>
          {c.active ? "active" : "disabled"}
        </span>
      </div>
      <div className="mt-2 text-[12px] font-semibold" style={{ color: "var(--text-default)" }}>{c.name}</div>
      <div className="text-[10px] uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>
        {creativeKindLabel(c.kind)} · {c.totalClicks.toLocaleString()} clicks
      </div>
      {c.description && (
        <p className="mt-1 text-[11px]" style={{ color: "var(--text-muted)" }}>{c.description}</p>
      )}
      {c.contentUrl && (
        <p className="mt-1 truncate text-[11px]">
          <a href={c.contentUrl} target="_blank" rel="noopener noreferrer"
             className="underline" style={{ color: "var(--accent-primary)" }}>
            {c.contentUrl}
          </a>
        </p>
      )}
      {c.contentText && (
        <pre className="mt-1 max-h-32 overflow-auto rounded bg-[var(--surface-1)] p-2 text-[10px] whitespace-pre-wrap"
             style={{ color: "var(--text-default)" }}>
          {c.contentText.slice(0, 280)}{c.contentText.length > 280 ? "…" : ""}
        </pre>
      )}
      {c.width && c.height && (
        <p className="mt-1 text-[10px]" style={{ color: "var(--text-muted)" }}>
          {c.width}×{c.height}px · destination {c.destinationPath}
        </p>
      )}
      {!c.width && (
        <p className="mt-1 text-[10px]" style={{ color: "var(--text-muted)" }}>
          Destination {c.destinationPath}
        </p>
      )}

      {canWrite && (
        <details className="mt-2">
          <summary className="cursor-pointer text-[11px] font-medium" style={{ color: "var(--accent-primary)" }}>
            Edit
          </summary>
          <CreativeForm canWrite={canWrite} initial={c} />
          <form action={deleteAffiliateCreative} className="mt-2">
            <input type="hidden" name="id" value={c.id} />
            <button type="submit"
                    className="ts-focus rounded-md px-2 py-1 text-[10px] font-medium"
                    style={{ background: "var(--surface-1)", color: "var(--danger-fg)", border: "1px solid var(--rose-200)" }}>
              Delete creative
            </button>
          </form>
        </details>
      )}
    </div>
  );
}

const CREATIVE_KINDS_LIST: AffiliateCreativeKind[] = [
  "BANNER", "TEXT_LINK", "EMAIL_TEMPLATE", "SOCIAL_POST", "AD_CREATIVE", "VIDEO_SCRIPT",
];

function CreativeForm({ canWrite, initial }: { canWrite: boolean; initial?: AffiliateCreativeRow }) {
  return (
    <form action={saveAffiliateCreative} className="mt-2 grid grid-cols-1 gap-2 md:grid-cols-2">
      <fieldset disabled={!canWrite} className="contents">
        {initial && <input type="hidden" name="id" value={initial.id} />}
        <Field label="Kind">
          <select name="kind" defaultValue={initial?.kind ?? "TEXT_LINK"}
                  className="ts-focus w-full rounded-md border px-2 py-1 text-[12px]"
                  style={{ borderColor: "var(--border-default)", background: "var(--surface-1)" }}>
            {CREATIVE_KINDS_LIST.map((k) => (
              <option key={k} value={k}>{creativeKindLabel(k)}</option>
            ))}
          </select>
        </Field>
        <Field label="Name">
          <input type="text" name="name" defaultValue={initial?.name ?? ""} required maxLength={200}
                 className="ts-focus w-full rounded-md border px-2 py-1 text-[12px]"
                 style={{ borderColor: "var(--border-default)", background: "var(--surface-1)" }} />
        </Field>
        <Field label="Description (admin-only)" full>
          <input type="text" name="description" defaultValue={initial?.description ?? ""} maxLength={500}
                 className="ts-focus w-full rounded-md border px-2 py-1 text-[12px]"
                 style={{ borderColor: "var(--border-default)", background: "var(--surface-1)" }} />
        </Field>
        <Field label="Content URL (image / asset hosting)">
          <input type="url" name="contentUrl" defaultValue={initial?.contentUrl ?? ""} maxLength={1000}
                 className="ts-focus w-full rounded-md border px-2 py-1 text-[12px]"
                 style={{ borderColor: "var(--border-default)", background: "var(--surface-1)" }} />
        </Field>
        <Field label="Destination path">
          <input type="text" name="destinationPath" defaultValue={initial?.destinationPath ?? "/"} maxLength={500}
                 className="ts-focus w-full rounded-md border px-2 py-1 text-[12px]"
                 style={{ borderColor: "var(--border-default)", background: "var(--surface-1)" }} />
        </Field>
        <Field label="Body / copy / template" full>
          <textarea name="contentText" defaultValue={initial?.contentText ?? ""}
                    rows={5} maxLength={10_000}
                    className="ts-focus w-full rounded-md border px-2 py-1 text-[12px] font-mono"
                    style={{ borderColor: "var(--border-default)", background: "var(--surface-1)" }} />
        </Field>
        <Field label="Width (px, banner only)">
          <input type="number" name="width" defaultValue={initial?.width ?? ""} min={0} max={4000}
                 className="ts-focus w-full rounded-md border px-2 py-1 text-[12px]"
                 style={{ borderColor: "var(--border-default)", background: "var(--surface-1)" }} />
        </Field>
        <Field label="Height (px, banner only)">
          <input type="number" name="height" defaultValue={initial?.height ?? ""} min={0} max={4000}
                 className="ts-focus w-full rounded-md border px-2 py-1 text-[12px]"
                 style={{ borderColor: "var(--border-default)", background: "var(--surface-1)" }} />
        </Field>
        <label className="md:col-span-2 inline-flex items-center gap-2 text-[12px]"
               style={{ color: "var(--text-default)" }}>
          <input type="checkbox" name="active" defaultChecked={initial?.active ?? true} className="ts-focus h-4 w-4" />
          Active — show in the partner-facing creative library
        </label>
        <div className="md:col-span-2 flex justify-end">
          <button type="submit"
                  className="ts-focus rounded-md px-3 py-1.5 text-[12px] font-medium"
                  style={{ background: "var(--accent-primary)", color: "white" }}>
            Save creative
          </button>
        </div>
      </fieldset>
    </form>
  );
}

/* ── Settings tab ───────────────────────────────────────── */

function SettingsTab({
  settings, tiers, canWrite,
}: {
  settings: AffiliateProgramSettingsView;
  tiers: AffiliateTierRow[];
  canWrite: boolean;
}) {
  return (
    <div className="space-y-4">
      <ProgramSettingsForm settings={settings} tiers={tiers} canWrite={canWrite} />
      <TierEditor tiers={tiers} canWrite={canWrite} />
    </div>
  );
}

function ProgramSettingsForm({
  settings, tiers, canWrite,
}: { settings: AffiliateProgramSettingsView; tiers: AffiliateTierRow[]; canWrite: boolean }) {
  return (
    <form action={saveAffiliateSettings}
          className="rounded-lg border p-4 space-y-3"
          style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)" }}>
      <fieldset disabled={!canWrite} className="contents">
        <h2 className="text-[12px] font-semibold" style={{ color: "var(--text-default)" }}>
          Program settings
        </h2>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <label className="inline-flex items-center gap-2 text-[12px]" style={{ color: "var(--text-default)" }}>
            <input type="checkbox" name="active" defaultChecked={settings.active} className="ts-focus h-4 w-4" />
            Program active
          </label>
          <label className="inline-flex items-center gap-2 text-[12px]" style={{ color: "var(--text-default)" }}>
            <input type="checkbox" name="acceptingApplications" defaultChecked={settings.acceptingApplications} className="ts-focus h-4 w-4" />
            Accepting applications
          </label>
          <label className="inline-flex items-center gap-2 text-[12px]" style={{ color: "var(--text-default)" }}>
            <input type="checkbox" name="notifyOnConversion" defaultChecked={settings.notifyOnConversion} className="ts-focus h-4 w-4" />
            Notify affiliate on each conversion
          </label>

          <Field label="Application mode">
            <select name="applicationMode" defaultValue={settings.applicationMode}
                    className="ts-focus w-full rounded-md border px-2 py-1 text-[12px]"
                    style={{ borderColor: "var(--border-default)", background: "var(--surface-1)" }}>
              <option value="MANUAL_REVIEW">Manual review</option>
              <option value="AUTO_APPROVE">Auto-approve</option>
            </select>
          </Field>
          <Field label="Default tier (for new approvals)">
            <select name="defaultTierId" defaultValue={settings.defaultTierId ?? ""}
                    className="ts-focus w-full rounded-md border px-2 py-1 text-[12px]"
                    style={{ borderColor: "var(--border-default)", background: "var(--surface-1)" }}>
              <option value="">— None —</option>
              {tiers.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </Field>
          <Field label="Cookie window (days)">
            <input type="number" name="cookieDays" defaultValue={settings.cookieDays} min={1} max={365}
                   className="ts-focus w-full rounded-md border px-2 py-1 text-[12px] tabular-nums"
                   style={{ borderColor: "var(--border-default)", background: "var(--surface-1)" }} />
          </Field>
          <Field label="Min payout threshold (cents)">
            <input type="number" name="minPayoutCents" defaultValue={settings.minPayoutCents} min={0} step={100}
                   className="ts-focus w-full rounded-md border px-2 py-1 text-[12px] tabular-nums"
                   style={{ borderColor: "var(--border-default)", background: "var(--surface-1)" }} />
          </Field>
          <Field label="Tracking domain (optional)">
            <input type="text" name="trackingDomain" defaultValue={settings.trackingDomain ?? ""} maxLength={120}
                   placeholder="ref.flowtora.com"
                   className="ts-focus w-full rounded-md border px-2 py-1 text-[12px]"
                   style={{ borderColor: "var(--border-default)", background: "var(--surface-1)" }} />
          </Field>
          <Field label="Terms URL (shown on application form)">
            <input type="url" name="termsUrl" defaultValue={settings.termsUrl ?? ""} maxLength={500}
                   className="ts-focus w-full rounded-md border px-2 py-1 text-[12px]"
                   style={{ borderColor: "var(--border-default)", background: "var(--surface-1)" }} />
          </Field>
        </div>
        <div className="flex items-center justify-between pt-1">
          <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>
            Last edited {settings.updatedAt.toLocaleString()}
          </p>
          <button type="submit"
                  className="ts-focus rounded-md px-3 py-1.5 text-[12px] font-medium"
                  style={{ background: "var(--accent-primary)", color: "white" }}>
            Save settings
          </button>
        </div>
      </fieldset>
    </form>
  );
}

function TierEditor({ tiers, canWrite }: { tiers: AffiliateTierRow[]; canWrite: boolean }) {
  return (
    <div className="rounded-lg border p-3 space-y-3"
         style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)" }}>
      <div className="flex items-center justify-between">
        <h2 className="text-[12px] font-semibold" style={{ color: "var(--text-default)" }}>
          Commission tiers · {tiers.length}
        </h2>
        {canWrite && (
          <a href="#new-tier"
             className="ts-focus rounded-md px-2.5 py-1 text-[11px] font-medium"
             style={{ background: "var(--surface-2)", color: "var(--text-default)", border: "1px solid var(--border-default)" }}>
            + Add tier
          </a>
        )}
      </div>

      {tiers.length === 0 ? (
        <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>
          No tiers yet. Add at least one tier so new affiliates land on a defined commission structure.
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {tiers.map((t) => (
            <li key={t.id} className="rounded-md border p-3"
                style={{ borderColor: "var(--border-subtle)", background: "var(--surface-2)" }}>
              <details>
                <summary className="cursor-pointer">
                  <span className="text-[12px] font-semibold" style={{ color: "var(--text-default)" }}>
                    {t.name}
                  </span>
                  <span className="ml-2 text-[11px]" style={{ color: "var(--text-muted)" }}>
                    pos {t.position} · {summarizeTierCommission(t)} ·
                    {" "}{t.affiliateCount} affiliate{t.affiliateCount === 1 ? "" : "s"}
                    {t.isDefault && (
                      <span className="ml-2 rounded-full px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide"
                            style={{ background: "var(--accent-surface)", color: "var(--accent-primary)" }}>
                        default
                      </span>
                    )}
                  </span>
                </summary>
                <TierForm tier={t} canWrite={canWrite} />
                {canWrite && (
                  <form action={deleteAffiliateTier} className="mt-2">
                    <input type="hidden" name="id" value={t.id} />
                    <button type="submit"
                            className="ts-focus rounded-md px-2 py-1 text-[10px] font-medium"
                            style={{ background: "var(--surface-1)", color: "var(--danger-fg)", border: "1px solid var(--rose-200)" }}>
                      Delete tier (affiliates will be unlinked)
                    </button>
                  </form>
                )}
              </details>
            </li>
          ))}
        </ul>
      )}

      {canWrite && (
        <details id="new-tier" className="rounded-md border p-3"
                 style={{ borderColor: "var(--border-subtle)", background: "var(--surface-2)" }}>
          <summary className="cursor-pointer text-[12px] font-semibold" style={{ color: "var(--text-default)" }}>
            New tier
          </summary>
          <TierForm canWrite={canWrite} />
        </details>
      )}
    </div>
  );
}

function TierForm({ tier, canWrite }: { tier?: AffiliateTierRow; canWrite: boolean }) {
  return (
    <form action={saveAffiliateTier} className="mt-2 grid grid-cols-1 gap-2 md:grid-cols-2">
      <fieldset disabled={!canWrite} className="contents">
        {tier && <input type="hidden" name="id" value={tier.id} />}
        <Field label="Name">
          <input type="text" name="name" defaultValue={tier?.name ?? ""} required maxLength={80}
                 className="ts-focus w-full rounded-md border px-2 py-1 text-[12px]"
                 style={{ borderColor: "var(--border-default)", background: "var(--surface-1)" }} />
        </Field>
        <Field label="Position (sort order)">
          <input type="number" name="position" defaultValue={tier?.position ?? 0} min={0} max={99}
                 className="ts-focus w-full rounded-md border px-2 py-1 text-[12px] tabular-nums"
                 style={{ borderColor: "var(--border-default)", background: "var(--surface-1)" }} />
        </Field>
        <Field label="Commission kind">
          <select name="commissionKind" defaultValue={tier?.commissionKind ?? "PERCENTAGE"}
                  className="ts-focus w-full rounded-md border px-2 py-1 text-[12px]"
                  style={{ borderColor: "var(--border-default)", background: "var(--surface-1)" }}>
            <option value="PERCENTAGE">% of payment</option>
            <option value="FLAT">Flat $ per conversion</option>
          </select>
        </Field>
        <Field label="Commission % (when PERCENTAGE)">
          <input type="number" name="commissionPct" defaultValue={tier?.commissionPct ?? ""} step="0.1" min={0} max={100}
                 className="ts-focus w-full rounded-md border px-2 py-1 text-[12px] tabular-nums"
                 style={{ borderColor: "var(--border-default)", background: "var(--surface-1)" }} />
        </Field>
        <Field label="Commission flat (cents, when FLAT)">
          <input type="number" name="commissionFlatCents" defaultValue={tier?.commissionFlatCents ?? ""} min={0} step={100}
                 className="ts-focus w-full rounded-md border px-2 py-1 text-[12px] tabular-nums"
                 style={{ borderColor: "var(--border-default)", background: "var(--surface-1)" }} />
        </Field>
        <label className="inline-flex items-center gap-2 text-[12px]" style={{ color: "var(--text-default)" }}>
          <input type="checkbox" name="recurring" defaultChecked={tier?.recurring ?? true} className="ts-focus h-4 w-4" />
          Recurring on every renewal
        </label>
        <Field label="Cap recurring duration (months, blank = no cap)">
          <input type="number" name="capDurationMonths" defaultValue={tier?.capDurationMonths ?? ""} min={0} max={120}
                 className="ts-focus w-full rounded-md border px-2 py-1 text-[12px] tabular-nums"
                 style={{ borderColor: "var(--border-default)", background: "var(--surface-1)" }} />
        </Field>
        <Field label="Min conversions per quarter (qualification)">
          <input type="number" name="minConversionsPerQuarter" defaultValue={tier?.minConversionsPerQuarter ?? 0} min={0} max={10_000}
                 className="ts-focus w-full rounded-md border px-2 py-1 text-[12px] tabular-nums"
                 style={{ borderColor: "var(--border-default)", background: "var(--surface-1)" }} />
        </Field>
        <Field label="Min lifetime conversions (promote-to)">
          <input type="number" name="minLifetimeConversions" defaultValue={tier?.minLifetimeConversions ?? ""} min={0} max={100_000}
                 className="ts-focus w-full rounded-md border px-2 py-1 text-[12px] tabular-nums"
                 style={{ borderColor: "var(--border-default)", background: "var(--surface-1)" }} />
        </Field>
        <label className="inline-flex items-center gap-2 text-[12px] md:col-span-2"
               style={{ color: "var(--text-default)" }}>
          <input type="checkbox" name="isDefault" defaultChecked={tier?.isDefault ?? false} className="ts-focus h-4 w-4" />
          Default tier — new approvals land here
        </label>
        <Field label="Notes" full>
          <input type="text" name="notes" defaultValue={tier?.notes ?? ""} maxLength={500}
                 className="ts-focus w-full rounded-md border px-2 py-1 text-[12px]"
                 style={{ borderColor: "var(--border-default)", background: "var(--surface-1)" }} />
        </Field>
        <div className="md:col-span-2 flex justify-end">
          <button type="submit"
                  className="ts-focus rounded-md px-3 py-1.5 text-[12px] font-medium"
                  style={{ background: "var(--accent-primary)", color: "white" }}>
            Save tier
          </button>
        </div>
      </fieldset>
    </form>
  );
}

function Field({ label, children, full }: { label: string; children: React.ReactNode; full?: boolean }) {
  return (
    <label className={`block ${full ? "md:col-span-2" : ""}`}>
      <span className="mb-0.5 block text-[11px] font-medium" style={{ color: "var(--text-muted)" }}>{label}</span>
      {children}
    </label>
  );
}
