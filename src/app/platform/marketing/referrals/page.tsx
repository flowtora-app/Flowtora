// Page 41 — Tenant-to-tenant Referral Program.
//
// Single-route surface with three tabs (Settings · Top referrers ·
// Fraud review queue). The KPI strip + funnel are always visible
// across the top so admins see the program's health at a glance,
// then the active tab fills the body.

import Link from "next/link";
import { requirePlatformStaff } from "@/lib/platform";
import {
  loadReferralSettings,
  loadReferralKpis,
  loadTopReferrers,
  loadReferralFunnel,
  loadFraudQueue,
  loadReferralTrend,
  summarizeReferrerReward,
  summarizeRefereeReward,
  fraudFlagLabel,
  rewardKindLabel,
  type ReferralSettingsView,
  type FraudQueueRow,
  type TopReferrerRow,
  type ReferralFunnelView,
  type ReferralKpis,
  type ReferralTrendPoint,
} from "@/server/platform/referrals";
import {
  saveReferralSettings,
  generateReferralCodes,
  approveFraudFlag,
  denyFraudFlag,
} from "@/app/actions/platform-referrals";
import type { ReferralRewardKind } from "@prisma/client";

export const dynamic = "force-dynamic";

type SP = Record<string, string | string[] | undefined>;
const asString = (v: string | string[] | undefined): string | undefined =>
  typeof v === "string" && v.length > 0 ? v : undefined;

const TABS = ["settings", "top", "fraud"] as const;
type Tab = (typeof TABS)[number];

export default async function ReferralProgramPage({
  searchParams,
}: {
  searchParams: Promise<SP>;
}) {
  const ctx = await requirePlatformStaff();
  const sp = await searchParams;
  const canWrite = ctx.can("referrals.manage");

  const tabRaw = asString(sp.tab) as Tab | undefined;
  const tab: Tab = tabRaw && (TABS as readonly string[]).includes(tabRaw) ? tabRaw : "settings";
  const ok = asString(sp.ok);
  const error = asString(sp.error);

  const [settings, kpis, top, funnel, fraud, trend] = await Promise.all([
    loadReferralSettings(),
    loadReferralKpis(30),
    loadTopReferrers(25),
    loadReferralFunnel(30),
    loadFraudQueue(),
    loadReferralTrend(30),
  ]);

  return (
    <div className="space-y-5">
      <Header settings={settings} />

      {ok && <FormOk msg={ok} />}
      {error && <FormError msg={error} />}

      <KpiStrip kpis={kpis} />

      <FunnelCard funnel={funnel} />

      <TrendCard trend={trend} />

      <TabsBar active={tab} pendingFraud={fraud.pending.length} />

      {tab === "settings" && (
        <SettingsTab settings={settings} canWrite={canWrite} />
      )}
      {tab === "top" && (
        <TopReferrersTab top={top} canWrite={canWrite} />
      )}
      {tab === "fraud" && (
        <FraudReviewTab fraud={fraud} canWrite={canWrite} />
      )}
    </div>
  );
}

/* ── Header ─────────────────────────────────────────────── */

function Header({ settings }: { settings: ReferralSettingsView }) {
  return (
    <div>
      <div className="text-[11px] font-medium" style={{ color: "var(--text-muted)" }}>
        Marketing
      </div>
      <h1 className="mt-1 text-[22px] font-semibold leading-tight" style={{ color: "var(--text-default)" }}>
        Referral program
      </h1>
      <p className="mt-1 max-w-3xl text-[12px]" style={{ color: "var(--text-muted)" }}>
        Tenant-to-tenant referrals. Existing customers share a code; signups
        attributed to the code earn the referrer a reward and the referee a
        discount once they cross the minimum-spend threshold.
      </p>
      <div className="mt-2 flex items-center gap-2">
        <span
          className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium"
          style={{
            background: settings.active ? "var(--success-surface)" : "var(--surface-2)",
            color: settings.active ? "var(--success-fg)" : "var(--text-muted)",
          }}
        >
          <span
            className="h-1.5 w-1.5 rounded-full"
            style={{ background: settings.active ? "var(--success-fg)" : "var(--text-faint)" }}
          />
          {settings.active ? "Program active" : "Program disabled"}
        </span>
        <span className="text-[11px]" style={{ color: "var(--text-muted)" }}>
          Referrer earns <strong style={{ color: "var(--text-default)" }}>{summarizeReferrerReward(settings)}</strong>
          {" · "}referee gets <strong style={{ color: "var(--text-default)" }}>{summarizeRefereeReward(settings)}</strong>
        </span>
      </div>
    </div>
  );
}

/* ── KPI strip ──────────────────────────────────────────── */

function KpiStrip({ kpis }: { kpis: ReferralKpis }) {
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
      <Kpi
        label="Active referrers"
        value={kpis.activeReferrers.toLocaleString()}
        sub={`Last ${kpis.periodDays}d`}
      />
      <Kpi
        label="Referrals · period"
        value={kpis.referralsThisPeriod.toLocaleString()}
        sub="Funnel rows created"
      />
      <Kpi
        label="Conversions"
        value={kpis.conversionsThisPeriod.toLocaleString()}
        sub="Reached PAID"
        tone={kpis.conversionsThisPeriod > 0 ? "good" : "default"}
      />
      <Kpi
        label="Conv rate"
        value={kpis.conversionRate == null ? "—" : `${(kpis.conversionRate * 100).toFixed(1)}%`}
        tone={
          kpis.conversionRate == null ? "default" :
          kpis.conversionRate >= 0.25 ? "good" :
          kpis.conversionRate >= 0.10 ? "warning" : "danger"
        }
      />
      <Kpi
        label="$ rewards paid"
        value={`$${(kpis.rewardsPaidCents / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
        sub="Released in period"
      />
      <Kpi
        label="Avg LTV / referee"
        value={kpis.avgLtvCentsPerReferee == null ? "—" : `$${(kpis.avgLtvCentsPerReferee / 100).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`}
        sub="Across PAID referees"
      />
    </div>
  );
}

/* ── Funnel ─────────────────────────────────────────────── */

function FunnelCard({ funnel }: { funnel: ReferralFunnelView }) {
  const stages: Array<{ label: string; value: number; tone: string }> = [
    { label: "Clicked link", value: funnel.clicked, tone: "var(--accent-primary)" },
    { label: "Signed up",    value: funnel.signedUp, tone: "var(--accent-primary)" },
    { label: "Trialed",      value: funnel.trialed, tone: "var(--accent-primary)" },
    { label: "Paid",         value: funnel.paid, tone: "var(--success-fg)" },
    { label: "Rewarded",     value: funnel.rewarded, tone: "var(--success-fg)" },
  ];
  const max = Math.max(1, ...stages.map((s) => s.value));
  const drops: Array<{ label: string; pct: number | null }> = [
    { label: "Click → Signup",  pct: funnel.dropClickToSignup },
    { label: "Signup → Trial",  pct: funnel.dropSignupToTrial },
    { label: "Trial → Paid",    pct: funnel.dropTrialToPaid },
    { label: "Paid → Rewarded", pct: funnel.dropPaidToReward },
  ];

  return (
    <div className="rounded-lg border p-3"
         style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)" }}>
      <div className="flex items-center justify-between">
        <h2 className="text-[12px] font-semibold" style={{ color: "var(--text-default)" }}>
          Referral funnel · last 30 days
        </h2>
        <div className="flex items-center gap-3 text-[11px]" style={{ color: "var(--text-muted)" }}>
          <span>Expired: <strong style={{ color: "var(--text-default)" }}>{funnel.expired}</strong></span>
          <span>Fraud queue: <strong style={{ color: funnel.fraud > 0 ? "var(--warning-fg)" : "var(--text-default)" }}>{funnel.fraud}</strong></span>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-5 items-end gap-1">
        {stages.map((s) => {
          const height = `${Math.max(6, (s.value / max) * 100)}%`;
          return (
            <div key={s.label} className="flex flex-col items-center">
              <div className="relative flex h-32 w-full items-end justify-center">
                <div
                  className="w-full rounded-t-sm"
                  style={{ background: s.tone, height }}
                  title={`${s.label}: ${s.value}`}
                />
              </div>
              <div className="mt-1 text-[11px] font-semibold tabular-nums" style={{ color: "var(--text-default)" }}>
                {s.value.toLocaleString()}
              </div>
              <div className="text-[10px]" style={{ color: "var(--text-muted)" }}>{s.label}</div>
            </div>
          );
        })}
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2 md:grid-cols-4">
        {drops.map((d) => (
          <div
            key={d.label}
            className="rounded-md border px-2 py-1.5 text-[11px]"
            style={{ borderColor: "var(--border-subtle)", background: "var(--surface-2)" }}
          >
            <div style={{ color: "var(--text-muted)" }}>{d.label}</div>
            <div className="mt-0.5 font-semibold tabular-nums" style={{
              color: d.pct == null ? "var(--text-faint)" :
                     d.pct >= 0.7 ? "var(--danger-fg)" :
                     d.pct >= 0.4 ? "var(--warning-fg)" : "var(--text-default)",
            }}>
              {d.pct == null ? "—" : `${(d.pct * 100).toFixed(0)}% drop`}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── Trend chart ─────────────────────────────────────────── */

function TrendCard({ trend }: { trend: ReferralTrendPoint[] }) {
  const max = Math.max(1, ...trend.flatMap((t) => [t.signups, t.conversions, t.fraudFlags]));
  return (
    <div className="rounded-lg border p-3"
         style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)" }}>
      <h2 className="mb-2 text-[12px] font-semibold" style={{ color: "var(--text-default)" }}>
        Daily signups (blue) · conversions (green) · fraud flags (amber) — last 30 days
      </h2>
      <div className="flex h-24 items-end gap-[2px]">
        {trend.map((d) => (
          <div
            key={d.date}
            className="flex flex-1 flex-col-reverse"
            title={`${d.date} · ${d.signups} signups · ${d.conversions} conversions · ${d.fraudFlags} flags`}
          >
            <div className="rounded-t-sm" style={{ background: "var(--accent-primary)", height: `${(d.signups / max) * 100}%` }} />
            <div style={{ background: "var(--success-fg)", height: `${(d.conversions / max) * 100}%` }} />
            <div style={{ background: "var(--warning-fg)", height: `${(d.fraudFlags / max) * 100}%` }} />
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── Tabs bar ───────────────────────────────────────────── */

function TabsBar({ active, pendingFraud }: { active: Tab; pendingFraud: number }) {
  const items: Array<{ key: Tab; label: string; badge?: string }> = [
    { key: "settings", label: "Settings" },
    { key: "top",      label: "Top referrers" },
    { key: "fraud",    label: "Fraud review queue", badge: pendingFraud > 0 ? String(pendingFraud) : undefined },
  ];
  return (
    <nav className="flex items-center gap-1 border-b" style={{ borderColor: "var(--border-subtle)" }} aria-label="Sections">
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
            }}
          >
            {i.label}
            {i.badge && (
              <span
                className="rounded-full px-1.5 py-0.5 text-[10px] font-semibold"
                style={{
                  background: "var(--warning-surface)",
                  color: "var(--warning-fg)",
                }}
              >
                {i.badge}
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}

/* ── Settings tab ───────────────────────────────────────── */

function SettingsTab({ settings, canWrite }: { settings: ReferralSettingsView; canWrite: boolean }) {
  return (
    <form
      action={saveReferralSettings}
      className="rounded-lg border p-4"
      style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)" }}
    >
      <fieldset disabled={!canWrite} className="space-y-4">
        <div className="flex items-center gap-2">
          <input
            type="checkbox"
            id="active"
            name="active"
            defaultChecked={settings.active}
            className="ts-focus h-4 w-4"
          />
          <label htmlFor="active" className="text-[12px] font-semibold" style={{ color: "var(--text-default)" }}>
            Program is active — referral CTAs visible to tenants
          </label>
        </div>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {/* Referrer reward */}
          <div className="rounded-md border p-3"
               style={{ borderColor: "var(--border-subtle)", background: "var(--surface-2)" }}>
            <h3 className="text-[12px] font-semibold" style={{ color: "var(--text-default)" }}>
              Referrer reward
            </h3>
            <p className="mb-2 text-[11px]" style={{ color: "var(--text-muted)" }}>
              What the existing customer earns on each conversion.
            </p>
            <div className="space-y-2">
              <Field label="Reward type">
                <select
                  name="referrerRewardKind"
                  defaultValue={settings.referrerRewardKind}
                  className="ts-focus w-full rounded-md border px-2 py-1 text-[12px]"
                  style={{ borderColor: "var(--border-default)", background: "var(--surface-1)" }}
                >
                  <option value="CREDIT">{rewardKindLabel("CREDIT")}</option>
                  <option value="FREE_MONTHS">{rewardKindLabel("FREE_MONTHS")}</option>
                  <option value="CASH">{rewardKindLabel("CASH")}</option>
                </select>
              </Field>
              <Field label="Account credit (cents)">
                <input
                  type="number"
                  name="referrerRewardCreditCents"
                  defaultValue={settings.referrerRewardCreditCents}
                  min={0}
                  step={100}
                  className="ts-focus w-full rounded-md border px-2 py-1 text-[12px] tabular-nums"
                  style={{ borderColor: "var(--border-default)", background: "var(--surface-1)" }}
                />
              </Field>
              <Field label="Free months">
                <input
                  type="number"
                  name="referrerRewardFreeMonths"
                  defaultValue={settings.referrerRewardFreeMonths}
                  min={0}
                  max={24}
                  className="ts-focus w-full rounded-md border px-2 py-1 text-[12px] tabular-nums"
                  style={{ borderColor: "var(--border-default)", background: "var(--surface-1)" }}
                />
              </Field>
              <Field label="Cash payout (cents)">
                <input
                  type="number"
                  name="referrerRewardCashCents"
                  defaultValue={settings.referrerRewardCashCents}
                  min={0}
                  step={100}
                  className="ts-focus w-full rounded-md border px-2 py-1 text-[12px] tabular-nums"
                  style={{ borderColor: "var(--border-default)", background: "var(--surface-1)" }}
                />
              </Field>
            </div>
          </div>

          {/* Referee reward */}
          <div className="rounded-md border p-3"
               style={{ borderColor: "var(--border-subtle)", background: "var(--surface-2)" }}>
            <h3 className="text-[12px] font-semibold" style={{ color: "var(--text-default)" }}>
              Referee reward
            </h3>
            <p className="mb-2 text-[11px]" style={{ color: "var(--text-muted)" }}>
              What the new customer gets at signup as a thank-you.
            </p>
            <div className="space-y-2">
              <Field label="Discount %">
                <input
                  type="number"
                  name="refereeDiscountPct"
                  defaultValue={settings.refereeDiscountPct}
                  min={0}
                  max={100}
                  className="ts-focus w-full rounded-md border px-2 py-1 text-[12px] tabular-nums"
                  style={{ borderColor: "var(--border-default)", background: "var(--surface-1)" }}
                />
              </Field>
              <Field label="Months the discount applies">
                <input
                  type="number"
                  name="refereeDiscountMonths"
                  defaultValue={settings.refereeDiscountMonths}
                  min={0}
                  max={24}
                  className="ts-focus w-full rounded-md border px-2 py-1 text-[12px] tabular-nums"
                  style={{ borderColor: "var(--border-default)", background: "var(--surface-1)" }}
                />
              </Field>
            </div>

            <h3 className="mt-4 text-[12px] font-semibold" style={{ color: "var(--text-default)" }}>
              Release conditions
            </h3>
            <p className="mb-2 text-[11px]" style={{ color: "var(--text-muted)" }}>
              Guard rails before a referrer's reward releases.
            </p>
            <div className="space-y-2">
              <Field label="Minimum referee spend (cents)">
                <input
                  type="number"
                  name="minimumSpendCents"
                  defaultValue={settings.minimumSpendCents}
                  min={0}
                  step={100}
                  className="ts-focus w-full rounded-md border px-2 py-1 text-[12px] tabular-nums"
                  style={{ borderColor: "var(--border-default)", background: "var(--surface-1)" }}
                />
              </Field>
              <Field label="Attribution window (days)">
                <input
                  type="number"
                  name="attributionWindowDays"
                  defaultValue={settings.attributionWindowDays}
                  min={1}
                  max={365}
                  className="ts-focus w-full rounded-md border px-2 py-1 text-[12px] tabular-nums"
                  style={{ borderColor: "var(--border-default)", background: "var(--surface-1)" }}
                />
              </Field>
              <Field label="Signup → paid window (days)">
                <input
                  type="number"
                  name="signupToPaidWindowDays"
                  defaultValue={settings.signupToPaidWindowDays}
                  min={1}
                  max={365}
                  className="ts-focus w-full rounded-md border px-2 py-1 text-[12px] tabular-nums"
                  style={{ borderColor: "var(--border-default)", background: "var(--surface-1)" }}
                />
              </Field>
              <Field label="Reward hold (days, clawback buffer)">
                <input
                  type="number"
                  name="rewardHoldDays"
                  defaultValue={settings.rewardHoldDays}
                  min={0}
                  max={120}
                  className="ts-focus w-full rounded-md border px-2 py-1 text-[12px] tabular-nums"
                  style={{ borderColor: "var(--border-default)", background: "var(--surface-1)" }}
                />
              </Field>
            </div>
          </div>
        </div>

        <PreviewBlock settings={settings} />

        <div className="flex items-center justify-between">
          <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>
            Last edited {settings.updatedAt.toLocaleString()}
          </p>
          <button
            type="submit"
            className="ts-focus rounded-md px-3 py-1.5 text-[12px] font-medium"
            style={{ background: "var(--accent-primary)", color: "white" }}
          >
            Save settings
          </button>
        </div>
        {!canWrite && (
          <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>
            You have read-only access — only Marketing managers and admins can edit these settings.
          </p>
        )}
      </fieldset>
    </form>
  );
}

function PreviewBlock({ settings }: { settings: ReferralSettingsView }) {
  return (
    <div className="rounded-md border-l-2 px-3 py-2 text-[11px]"
         style={{ borderColor: "var(--accent-primary)", background: "var(--surface-2)", color: "var(--text-default)" }}>
      <strong>Preview · </strong>
      Refer a friend · they get <strong>{summarizeRefereeReward(settings)}</strong> ·
      you earn <strong>{summarizeReferrerReward(settings)}</strong> when they spend
      <strong> ${(settings.minimumSpendCents / 100).toFixed(2)}</strong>
      {settings.rewardHoldDays > 0 ? ` and stay for ${settings.rewardHoldDays} days.` : "."}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-0.5 block text-[11px] font-medium" style={{ color: "var(--text-muted)" }}>
        {label}
      </span>
      {children}
    </label>
  );
}

/* ── Top referrers tab ──────────────────────────────────── */

function TopReferrersTab({ top, canWrite }: { top: TopReferrerRow[]; canWrite: boolean }) {
  return (
    <div className="rounded-lg border p-3"
         style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)" }}>
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-[12px] font-semibold" style={{ color: "var(--text-default)" }}>
          Top referrers · all-time
        </h2>
        {canWrite && (
          <form action={generateReferralCodes}>
            <button
              type="submit"
              className="ts-focus rounded-md px-2.5 py-1 text-[11px] font-medium"
              style={{ background: "var(--surface-2)", color: "var(--text-default)", border: "1px solid var(--border-default)" }}
              title="Mint referral codes for any active tenant that doesn't have one yet."
            >
              Mint missing codes
            </button>
          </form>
        )}
      </div>
      {top.length === 0 ? (
        <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>
          No referrers yet — once tenants share their code and someone signs up, the leaderboard fills in.
        </p>
      ) : (
        <table className="w-full text-[12px]">
          <thead>
            <tr style={{ color: "var(--text-muted)" }}>
              <th className="px-2 py-1.5 text-left text-[10px] font-semibold uppercase tracking-wide">#</th>
              <th className="px-2 py-1.5 text-left text-[10px] font-semibold uppercase tracking-wide">Tenant</th>
              <th className="px-2 py-1.5 text-left text-[10px] font-semibold uppercase tracking-wide">Code</th>
              <th className="px-2 py-1.5 text-right text-[10px] font-semibold uppercase tracking-wide">Clicks</th>
              <th className="px-2 py-1.5 text-right text-[10px] font-semibold uppercase tracking-wide">Signups</th>
              <th className="px-2 py-1.5 text-right text-[10px] font-semibold uppercase tracking-wide">Conv</th>
              <th className="px-2 py-1.5 text-right text-[10px] font-semibold uppercase tracking-wide">Conv rate</th>
              <th className="px-2 py-1.5 text-right text-[10px] font-semibold uppercase tracking-wide">Earned</th>
            </tr>
          </thead>
          <tbody>
            {top.map((r, idx) => (
              <tr
                key={r.tenantId}
                className="border-t"
                style={{ borderColor: "var(--border-subtle)" }}
              >
                <td className="px-2 py-1.5 tabular-nums" style={{ color: idx < 3 ? "var(--accent-primary)" : "var(--text-muted)" }}>
                  {r.rank}
                </td>
                <td className="px-2 py-1.5">
                  <Link
                    href={`/platform/tenants/${r.tenantSlug}`}
                    className="ts-focus underline"
                    style={{ color: "var(--text-default)" }}
                  >
                    {r.tenantName}
                  </Link>
                </td>
                <td className="px-2 py-1.5">
                  <code
                    className="rounded px-1.5 py-0.5 text-[11px]"
                    style={{ background: "var(--surface-2)", color: "var(--text-default)" }}
                  >
                    {r.code}
                  </code>
                </td>
                <td className="px-2 py-1.5 text-right tabular-nums" style={{ color: "var(--text-muted)" }}>{r.clicks.toLocaleString()}</td>
                <td className="px-2 py-1.5 text-right tabular-nums" style={{ color: "var(--text-default)" }}>{r.referrals.toLocaleString()}</td>
                <td className="px-2 py-1.5 text-right tabular-nums" style={{ color: "var(--text-default)" }}>{r.conversions.toLocaleString()}</td>
                <td className="px-2 py-1.5 text-right tabular-nums" style={{
                  color: r.conversionRate == null ? "var(--text-faint)" :
                         r.conversionRate >= 0.5 ? "var(--success-fg)" :
                         r.conversionRate >= 0.2 ? "var(--text-default)" : "var(--text-muted)",
                }}>
                  {r.conversionRate == null ? "—" : `${(r.conversionRate * 100).toFixed(0)}%`}
                </td>
                <td className="px-2 py-1.5 text-right font-semibold tabular-nums" style={{ color: "var(--success-fg)" }}>
                  ${(r.earnedCents / 100).toFixed(2)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

/* ── Fraud review tab ───────────────────────────────────── */

function FraudReviewTab({
  fraud, canWrite,
}: { fraud: { pending: FraudQueueRow[]; history: FraudQueueRow[] }; canWrite: boolean }) {
  return (
    <div className="space-y-4">
      <FraudList
        title={`Pending review · ${fraud.pending.length}`}
        rows={fraud.pending}
        canWrite={canWrite}
        showActions={true}
        emptyText="No fraud flags currently pending review. Detection runs automatically on every signup."
      />
      <FraudList
        title={`History · ${fraud.history.length}`}
        rows={fraud.history}
        canWrite={false}
        showActions={false}
        emptyText="Resolved flags will appear here for audit trail."
        muted
      />
    </div>
  );
}

function FraudList({
  title, rows, canWrite, showActions, emptyText, muted,
}: {
  title: string;
  rows: FraudQueueRow[];
  canWrite: boolean;
  showActions: boolean;
  emptyText: string;
  muted?: boolean;
}) {
  return (
    <div className="rounded-lg border p-3"
         style={{ background: muted ? "var(--surface-2)" : "var(--surface-1)", borderColor: "var(--border-subtle)" }}>
      <h2 className="mb-2 text-[12px] font-semibold" style={{ color: "var(--text-default)" }}>
        {title}
      </h2>
      {rows.length === 0 ? (
        <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>{emptyText}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {rows.map((r) => (
            <FraudRow key={r.id} row={r} canWrite={canWrite} showActions={showActions} />
          ))}
        </ul>
      )}
    </div>
  );
}

function FraudRow({ row, canWrite, showActions }: { row: FraudQueueRow; canWrite: boolean; showActions: boolean }) {
  return (
    <li
      className="rounded-md border p-3"
      style={{ borderColor: "var(--border-subtle)", background: "var(--surface-1)" }}
    >
      <div className="flex flex-wrap items-center gap-2">
        <span
          className="inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
          style={{ background: "var(--warning-surface)", color: "var(--warning-fg)" }}
        >
          {fraudFlagLabel(row.flag)}
        </span>
        <span className="text-[11px]" style={{ color: "var(--text-muted)" }}>
          flagged {row.flaggedAt.toLocaleString()}
        </span>
        {row.resolution !== "PENDING" && (
          <span
            className="inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
            style={{
              background: row.resolution === "APPROVED" ? "var(--success-surface)" : "var(--surface-2)",
              color:      row.resolution === "APPROVED" ? "var(--success-fg)" : "var(--text-muted)",
            }}
          >
            {row.resolution.toLowerCase()}
          </span>
        )}
      </div>

      <div className="mt-2 grid grid-cols-1 gap-2 text-[12px] md:grid-cols-2">
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>Referrer</div>
          <div style={{ color: "var(--text-default)" }}>{row.referrerName}</div>
        </div>
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>Referee</div>
          <div style={{ color: "var(--text-default)" }}>
            {row.refereeName ?? row.refereeEmail ?? "—"}
            {row.rewardAmountCents > 0 && (
              <span className="ml-2 text-[11px]" style={{ color: "var(--success-fg)" }}>
                ${(row.rewardAmountCents / 100).toFixed(2)} pending
              </span>
            )}
          </div>
        </div>
        {(row.ipHash || row.fingerprintHash) && (
          <div className="md:col-span-2 grid grid-cols-2 gap-2">
            {row.ipHash && (
              <div>
                <div className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>IP hash</div>
                <code className="text-[11px]" style={{ color: "var(--text-muted)" }}>{row.ipHash.slice(0, 16)}…</code>
              </div>
            )}
            {row.fingerprintHash && (
              <div>
                <div className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>Fingerprint</div>
                <code className="text-[11px]" style={{ color: "var(--text-muted)" }}>{row.fingerprintHash.slice(0, 16)}…</code>
              </div>
            )}
          </div>
        )}
        {row.flagReason && (
          <div className="md:col-span-2">
            <div className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>Reason</div>
            <div className="text-[11px]" style={{ color: "var(--text-default)" }}>{row.flagReason}</div>
          </div>
        )}
        {row.reviewerNote && (
          <div className="md:col-span-2">
            <div className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>Reviewer note</div>
            <div className="text-[11px]" style={{ color: "var(--text-default)" }}>{row.reviewerNote}</div>
          </div>
        )}
      </div>

      {showActions && canWrite && (
        <div className="mt-3 flex flex-wrap gap-2">
          <form action={approveFraudFlag} className="flex flex-1 items-center gap-2">
            <input type="hidden" name="id" value={row.id} />
            <input
              type="text"
              name="note"
              placeholder="Reviewer note (optional)"
              maxLength={500}
              className="ts-focus min-w-[200px] flex-1 rounded-md border px-2 py-1 text-[11px]"
              style={{ borderColor: "var(--border-default)", background: "var(--surface-1)" }}
            />
            <button
              type="submit"
              className="ts-focus rounded-md px-2.5 py-1 text-[11px] font-medium"
              style={{ background: "var(--success-fg)", color: "white" }}
              title="Clear the flag — releases the reward if PAID was reached."
            >
              Approve
            </button>
            <button
              type="submit"
              formAction={denyFraudFlag}
              className="ts-focus rounded-md px-2.5 py-1 text-[11px] font-medium"
              style={{ background: "var(--danger-fg)", color: "white" }}
              title="Deny the reward and keep the row marked FRAUD."
            >
              Deny
            </button>
          </form>
        </div>
      )}
    </li>
  );
}

/* ── Tiny re-implementations (no shared file just for one page) ── */

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
      <div className="text-[11px] font-medium uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>
        {label}
      </div>
      <div className="mt-1 text-[20px] font-semibold leading-none tabular-nums"
           style={{ color: "var(--text-default)" }}>
        {value}
      </div>
      {sub && <div className="mt-1 text-[11px]" style={{ color: "var(--text-muted)" }}>{sub}</div>}
    </div>
  );
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

// Type-only re-export to silence unused import warnings if ever surfaces.
export type ReferralRewardKindLiteral = ReferralRewardKind;
