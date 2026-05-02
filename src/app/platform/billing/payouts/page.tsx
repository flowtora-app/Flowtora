// Page 24 — Payouts.
//
// Four tabs: Schedule, Statements, Methods, History. Real numbers come
// from PartnerPayoutMethod / PartnerPayout / PartnerCommissionLine
// joined to the existing Affiliate graph.

import Link from "next/link";
import { db } from "@/lib/db";
import { requirePlatformStaff } from "@/lib/platform";
import {
  Breadcrumb,
  Card,
  PageHeader,
} from "@/components/ui";
import {
  loadPartnerStatements,
  loadPayoutHistory,
  loadPayoutMethods,
  loadPayoutSchedule,
} from "@/server/platform/payouts";
import { ScheduleTab } from "./_components/ScheduleTab";
import { StatementsTab } from "./_components/StatementsTab";
import { MethodsTab } from "./_components/MethodsTab";
import { HistoryTab } from "./_components/HistoryTab";
import type { PartnerPayoutStatus } from "@prisma/client";

export const dynamic = "force-dynamic";

type SP = Record<string, string | string[] | undefined>;
type TabKey = "schedule" | "statements" | "methods" | "history";
const TAB_KEYS: TabKey[] = ["schedule", "statements", "methods", "history"];

const OK_LABELS: Record<string, string> = {
  saved: "Saved.",
  deleted: "Deleted.",
  triggered: "Payout queued.",
  updated: "Payout updated.",
  line_added: "Commission line added.",
};

export default async function PayoutsPage({
  searchParams,
}: {
  searchParams: Promise<SP>;
}) {
  const ctx = await requirePlatformStaff();
  const sp = await searchParams;
  const canManage = ctx.can("revenue.read");

  const tabRaw = typeof sp.tab === "string" ? sp.tab : "schedule";
  const tab: TabKey = (TAB_KEYS as readonly string[]).includes(tabRaw) ? (tabRaw as TabKey) : "schedule";
  const okMsg = typeof sp.ok === "string" ? OK_LABELS[sp.ok] ?? "Done." : null;
  const errMsg = typeof sp.error === "string" ? decodeURIComponent(sp.error) : null;

  return (
    <div className="min-w-0 space-y-5">
      <div>
        <Breadcrumb items={[
          { label: "Platform", href: "/platform" },
          { label: "Billing", href: "/platform/billing" },
          { label: "Payouts" },
        ]} />
        <div className="mt-3">
          <PageHeader
            title="Payouts"
            description="Pay partners + affiliates. Schedule, statements, methods, history. Honest deferral: payment-rail SDKs (Stripe Connect / PayPal / Wise) aren't wired — saving a payout marks PENDING and you flip the status manually as the rail confirms."
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

      <TabBar active={tab} />

      {tab === "schedule"   && (await renderSchedule(canManage))}
      {tab === "statements" && (await renderStatements(canManage))}
      {tab === "methods"    && (await renderMethods(canManage))}
      {tab === "history"    && (await renderHistory(sp, canManage))}
    </div>
  );
}

function TabBar({ active }: { active: TabKey }) {
  const items: { key: TabKey; label: string }[] = [
    { key: "schedule",   label: "Schedule" },
    { key: "statements", label: "Statements" },
    { key: "methods",    label: "Methods" },
    { key: "history",    label: "History" },
  ];
  return (
    <div className="flex flex-wrap items-center gap-0 border-b" style={{ borderColor: "var(--border-subtle)" }}>
      {items.map((it) => {
        const isActive = it.key === active;
        return (
          <Link
            key={it.key}
            href={it.key === "schedule" ? "/platform/billing/payouts" : `/platform/billing/payouts?tab=${it.key}`}
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

async function renderSchedule(canManage: boolean) {
  const data = await loadPayoutSchedule();
  return <ScheduleTab data={data} canManage={canManage} />;
}

async function renderStatements(canManage: boolean) {
  const statements = await loadPartnerStatements();
  return <StatementsTab statements={statements} canManage={canManage} />;
}

async function renderMethods(canManage: boolean) {
  const [methods, affiliates] = await Promise.all([
    loadPayoutMethods(),
    db.affiliate.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true, code: true },
    }),
  ]);
  return <MethodsTab methods={methods} affiliates={affiliates} canManage={canManage} />;
}

async function renderHistory(sp: SP, canManage: boolean) {
  const statusRaw = typeof sp.status === "string" ? sp.status : "";
  const status = (["PENDING", "IN_TRANSIT", "PAID", "FAILED", "CANCELED"] as const).includes(statusRaw as never)
    ? (statusRaw as PartnerPayoutStatus)
    : undefined;
  const rows = await loadPayoutHistory({ status });
  return <HistoryTab rows={rows} statusFilter={status} canManage={canManage} />;
}

void Card;
