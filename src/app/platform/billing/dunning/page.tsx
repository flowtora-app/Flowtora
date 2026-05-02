// Page 23 — Dunning & Failed Payments.
//
// Four tabs at /platform/billing/dunning: Queue, Sequences, Performance,
// Settings. URL-driven via ?tab=. The legacy tenant-level dunning
// surface (start/advance/pause/resolve via Tenant.dunningStage) is
// preserved as a "Tenant suspension" panel inside Settings since it
// answers a different question (account-level state) than the
// failed-payment queue.

import Link from "next/link";
import { db } from "@/lib/db";
import { requirePlatformStaff } from "@/lib/platform";
import {
  Breadcrumb,
  Card,
  PageHeader,
} from "@/components/ui";
import {
  loadDunningKpis,
  loadDunningPerformance,
  loadDunningQueue,
  loadDunningSequences,
} from "@/server/platform/dunning";
import { QueueTab } from "./_components/QueueTab";
import { SequencesTab } from "./_components/SequencesTab";
import { PerformanceTab } from "./_components/PerformanceTab";
import { SettingsTab } from "./_components/SettingsTab";
import { Kpi, fmtMoney } from "./_components/shared";

export const dynamic = "force-dynamic";

type SP = Record<string, string | string[] | undefined>;
type TabKey = "queue" | "sequences" | "performance" | "settings";
const TAB_KEYS: TabKey[] = ["queue", "sequences", "performance", "settings"];

const OK_LABELS: Record<string, string> = {
  saved: "Saved.",
  deleted: "Deleted.",
  retried: "Retry queued.",
  skipped: "Skipped to next stage.",
  paused: "Paused.",
  resumed: "Resumed.",
  surrendered: "Surrendered. Invoice marked uncollectible.",
  email_sent: "Custom email sent.",
  stage_saved: "Stage saved.",
  stage_deleted: "Stage deleted.",
};

export default async function DunningPage({
  searchParams,
}: {
  searchParams: Promise<SP>;
}) {
  const ctx = await requirePlatformStaff();
  const sp = await searchParams;
  const canManage = ctx.can("billing.invoice");

  const tabRaw = typeof sp.tab === "string" ? sp.tab : "queue";
  const tab: TabKey = (TAB_KEYS as readonly string[]).includes(tabRaw) ? (tabRaw as TabKey) : "queue";
  const okMsg = typeof sp.ok === "string" ? OK_LABELS[sp.ok] ?? "Done." : null;
  const errMsg = typeof sp.error === "string" ? decodeURIComponent(sp.error) : null;

  // KPI band always rendered (across all tabs).
  const kpis = await loadDunningKpis(30);

  return (
    <div className="min-w-0 space-y-5">
      <div>
        <Breadcrumb items={[
          { label: "Platform", href: "/platform" },
          { label: "Billing", href: "/platform/billing" },
          { label: "Dunning & Failed Payments" },
        ]} />
        <div className="mt-3">
          <PageHeader
            title="Dunning & Failed Payments"
            description="Recover failed charges via configurable sequences. Real numbers from PlatformInvoicePayment; Stripe SDK round-trip is honestly deferred."
          />
        </div>
      </div>

      {okMsg && (
        <div className="rounded-md border px-3 py-2 text-[12px]"
             style={{ background: "var(--success-surface)", color: "var(--success-fg)", borderColor: "var(--success-fg)" }}>
          {okMsg}
        </div>
      )}
      {errMsg && (
        <div className="rounded-md border px-3 py-2 text-[12px]"
             style={{ background: "var(--danger-surface)", color: "var(--danger-fg)", borderColor: "var(--danger-fg)" }}>
          {errMsg}
        </div>
      )}

      {/* KPI strip — spec-prescribed metrics */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <Kpi label="Failed · 30d"
             value={String(kpis.failedThisPeriod)}
             tone={kpis.failedThisPeriod > 0 ? "warning" : "default"} />
        <Kpi label="Recovered $"
             value={fmtMoney(kpis.recoveredAmount)}
             tone={kpis.recoveredAmount > 0 ? "good" : "default"} />
        <Kpi label="Recovery rate"
             value={kpis.recoveryRatePct == null ? "—" : `${kpis.recoveryRatePct}%`}
             tone={kpis.recoveryRatePct != null && kpis.recoveryRatePct >= 50 ? "good" : "default"} />
        <Kpi label="Avg days to recover"
             value={kpis.avgDaysToRecover == null ? "—" : `${kpis.avgDaysToRecover}d`} />
        <Kpi label="Active sequences" value={String(kpis.activeSequences)} />
      </div>

      <TabBar active={tab} />

      {tab === "queue"       && (await renderQueue(sp, canManage))}
      {tab === "sequences"   && (await renderSequences(canManage))}
      {tab === "performance" && (await renderPerformance())}
      {tab === "settings"    && (await renderSettings(canManage))}
    </div>
  );
}

function TabBar({ active }: { active: TabKey }) {
  const items: { key: TabKey; label: string }[] = [
    { key: "queue",       label: "Dunning Queue" },
    { key: "sequences",   label: "Sequences" },
    { key: "performance", label: "Performance" },
    { key: "settings",    label: "Settings" },
  ];
  return (
    <div className="flex flex-wrap items-center gap-0 border-b" style={{ borderColor: "var(--border-subtle)" }}>
      {items.map((it) => {
        const isActive = it.key === active;
        return (
          <Link
            key={it.key}
            href={it.key === "queue" ? "/platform/billing/dunning" : `/platform/billing/dunning?tab=${it.key}`}
            className="ts-focus relative px-4 py-2 text-[13px] font-medium"
            style={{
              color: isActive ? "var(--text-default)" : "var(--text-muted)",
              borderBottom: isActive ? "2px solid var(--accent-primary)" : "2px solid transparent",
              marginBottom: "-1px",
            }}
          >
            {it.label}
          </Link>
        );
      })}
    </div>
  );
}

async function renderQueue(sp: SP, canManage: boolean) {
  const statusRaw = typeof sp.status === "string" ? sp.status : "";
  const status = (["IN_PROGRESS", "PAUSED", "RECOVERED", "SURRENDERED"] as const).includes(statusRaw as never)
    ? (statusRaw as "IN_PROGRESS" | "PAUSED" | "RECOVERED" | "SURRENDERED")
    : undefined;
  const rows = await loadDunningQueue({ status });
  return <QueueTab rows={rows} statusFilter={status} canManage={canManage} />;
}

async function renderSequences(canManage: boolean) {
  const sequences = await loadDunningSequences();
  return <SequencesTab sequences={sequences} canManage={canManage} />;
}

async function renderPerformance() {
  const perf = await loadDunningPerformance(90);
  return <PerformanceTab funnel={perf.funnel} byFailureReason={perf.byFailureReason} />;
}

async function renderSettings(canManage: boolean) {
  const [config, sequences] = await Promise.all([
    db.dunningConfig.findUnique({ where: { id: "default" } }),
    db.dunningSequence.findMany({
      where: { active: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true, planSlug: true },
    }),
  ]);
  return <SettingsTab config={config} sequences={sequences} canManage={canManage} />;
}

// Card import preserved for future use.
void Card;
