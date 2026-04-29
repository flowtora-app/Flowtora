import Link from "next/link";
import { db } from "@/lib/db";
import { requirePlatformStaff } from "@/lib/platform";
import { Icon } from "@/components/shell/icons";
import {
  startDunning,
  advanceDunning,
  pauseDunning,
  resumeDunning,
  resolveDunning,
} from "@/app/actions/platform-billing";
import type { DunningStage } from "@prisma/client";

// /platform/billing/dunning — past-due tenants & manual stage advance.
//
// Layout:
//   1. KPI band — In-funnel · Paused · Suspended · Avg days in funnel
//   2. Pipeline view — one column per stage, tenants slot into stages
//   3. Eligible tenants — PAST_DUE tenants not yet in dunning, one-click start

export const dynamic = "force-dynamic";

const STAGES_INORDER: DunningStage[] = [
  "PAYMENT_FAILED", "REMINDER_1", "REMINDER_2", "FINAL_NOTICE", "SUSPEND", "RESOLVED",
];

const STAGE_LABEL: Record<DunningStage, string> = {
  NONE:           "Healthy",
  PAYMENT_FAILED: "Payment failed",
  REMINDER_1:     "Reminder 1",
  REMINDER_2:     "Reminder 2",
  FINAL_NOTICE:   "Final notice",
  SUSPEND:        "Suspended",
  RESOLVED:       "Resolved",
};

const STAGE_DESCRIPTION: Record<DunningStage, string> = {
  NONE:           "No outstanding payment issue.",
  PAYMENT_FAILED: "Charge failed — entered the funnel. +24h until next stage.",
  REMINDER_1:     "+48h until next stage.",
  REMINDER_2:     "+96h until next stage.",
  FINAL_NOTICE:   "+168h until auto-suspend.",
  SUSPEND:        "Account suspended automatically. Resolve to lift.",
  RESOLVED:       "Payment came through. Auto-clears next cycle.",
};

type SP = { ok?: string; error?: string };

const MESSAGES: Record<string, string> = {
  started:           "Dunning started. Tenant entered the funnel at PAYMENT_FAILED.",
  advanced:          "Stage advanced.",
  paused:            "Dunning paused — no further automated stages until resumed.",
  resumed:           "Dunning resumed.",
  resolved:          "Dunning resolved. Suspension lifted if applicable.",
  already_active:    "Already in the funnel.",
  already_paused:    "Already paused.",
  not_paused:        "Wasn't paused.",
  already_resolved:  "Already resolved.",
};

export default async function DunningPage({
  searchParams,
}: {
  searchParams: Promise<SP>;
}) {
  const ctx = await requirePlatformStaff();
  const sp = await searchParams;
  const canWrite = ctx.can("billing.plan_change");

  const [allActive, eligible, suspendedCount] = await Promise.all([
    db.tenant.findMany({
      where: { dunningStage: { not: "NONE" } },
      orderBy: [{ dunningStage: "asc" }, { dunningStartedAt: "asc" }],
      select: {
        id: true, name: true, slug: true, plan: true, status: true,
        currency: true, dunningStage: true, dunningStartedAt: true,
        dunningPausedAt: true, dunningLastEventAt: true,
      },
    }),
    // Eligible to enter the funnel: PAST_DUE and not already in dunning.
    db.tenant.findMany({
      where: {
        status: "PAST_DUE",
        dunningStage: { in: ["NONE", "RESOLVED"] },
      },
      orderBy: { updatedAt: "desc" },
      select: { id: true, name: true, slug: true, plan: true, status: true, currency: true, updatedAt: true },
      take: 50,
    }),
    db.tenant.count({ where: { dunningStage: "SUSPEND" } }),
  ]);

  const inFunnel = allActive.filter((t) => t.dunningStage !== "RESOLVED" && !t.dunningPausedAt).length;
  const pausedCount = allActive.filter((t) => t.dunningPausedAt).length;
  const days = allActive
    .filter((t) => t.dunningStartedAt)
    .map((t) => Math.floor((Date.now() - t.dunningStartedAt!.getTime()) / (24 * 60 * 60 * 1000)));
  const avgDays = days.length === 0 ? 0 : Math.round(days.reduce((a, b) => a + b, 0) / days.length);

  // Group by stage for the pipeline view
  const byStage = new Map<DunningStage, typeof allActive>();
  for (const t of allActive) {
    const arr = byStage.get(t.dunningStage) ?? [];
    arr.push(t);
    byStage.set(t.dunningStage, arr);
  }

  return (
    <div className="space-y-6">
      <Header />
      {sp.ok    ? <Toast tone="ok"    msg={MESSAGES[sp.ok] ?? "Done"} /> : null}
      {sp.error ? <Toast tone="error" msg={sp.error} /> : null}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Kpi label="In funnel"   value={String(inFunnel)} />
        <Kpi label="Paused"      value={String(pausedCount)} tone={pausedCount > 0 ? "warn" : "default"} />
        <Kpi label="Suspended"   value={String(suspendedCount)} tone={suspendedCount > 0 ? "danger" : "default"} />
        <Kpi label="Avg days in funnel" value={`${avgDays}d`} />
      </div>

      {/* Eligible tenants — quick "start dunning" */}
      {eligible.length > 0 && (
        <EligibleTenants rows={eligible} canWrite={canWrite} />
      )}

      {/* Pipeline view */}
      <Pipeline byStage={byStage} canWrite={canWrite} />
    </div>
  );
}

/* ────────────────────────────────────────────────────────────── */

function Header() {
  return (
    <div className="flex items-end justify-between gap-4">
      <div>
        <Link href="/platform/billing" className="text-[12px] underline" style={{ color: "var(--text-muted)" }}>
          ← Billing
        </Link>
        <h1 className="mt-1 text-[26px] font-semibold leading-tight" style={{ color: "var(--text-default)" }}>
          Dunning
        </h1>
        <p className="mt-1 text-[13px]" style={{ color: "var(--text-muted)" }}>
          Recover-payment funnel. Hourly cron auto-advances stages on a
          24h / 48h / 96h / 168h SLA — operator overrides
          (Advance / Pause / Resume / Resolve) land here. Hitting
          <strong> SUSPEND</strong> auto-suspends the tenant; resolving
          lifts the suspension. Email fan-out per stage is a follow-up —
          today every transition writes to the audit log.
        </p>
      </div>
      <Link
        href="/platform/audit?action=platform.dunning_"
        className="ts-focus inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-[12px] font-medium"
        style={{ borderColor: "var(--border-subtle)", color: "var(--text-default)", background: "var(--surface-1)" }}
      >
        <Icon.FileText size={14} /> Audit log
      </Link>
    </div>
  );
}

function Toast({ tone, msg }: { tone: "ok" | "error"; msg: string }) {
  const palette = tone === "ok"
    ? { bg: "var(--accent-surface)", fg: "var(--accent-primary)", icon: "✓" }
    : { bg: "var(--danger-surface)", fg: "var(--danger-fg)",      icon: "!" };
  return (
    <div className="flex items-center gap-2 rounded-md border px-3 py-2 text-[13px]" style={{ background: palette.bg, color: palette.fg, borderColor: palette.fg }}>
      <span aria-hidden className="font-bold">{palette.icon}</span>
      <span>{msg}</span>
    </div>
  );
}

function Kpi({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: string;
  tone?: "default" | "warn" | "danger";
}) {
  const color =
    tone === "danger" ? "var(--danger-fg)" :
    tone === "warn"   ? "var(--warning-fg)" :
                        "var(--text-default)";
  return (
    <div
      className="rounded-lg border px-4 py-3"
      style={{
        background: "var(--surface-1)",
        borderColor:
          tone === "danger" ? "var(--danger-fg)" :
          tone === "warn"   ? "var(--warning-fg)" :
                              "var(--border-subtle)",
      }}
    >
      <div className="text-[11px] font-medium uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>
        {label}
      </div>
      <div className="mt-1 text-[22px] font-semibold leading-none" style={{ color }}>{value}</div>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────── */

function EligibleTenants({
  rows,
  canWrite,
}: {
  rows: { id: string; name: string; slug: string; plan: string; updatedAt: Date }[];
  canWrite: boolean;
}) {
  return (
    <section className="rounded-lg border" style={{ background: "var(--surface-1)", borderColor: "var(--warning-fg)" }}>
      <div className="border-b px-4 py-3" style={{ borderColor: "var(--border-subtle)" }}>
        <h2 className="text-[14px] font-semibold" style={{ color: "var(--warning-fg)" }}>
          Past-due tenants not yet in dunning ({rows.length})
        </h2>
        <p className="text-[12px]" style={{ color: "var(--text-muted)" }}>
          These tenants are PAST_DUE but haven't been routed into a dunning
          sequence. Start them to begin the recovery flow.
        </p>
      </div>
      <ul className="divide-y" style={{ borderColor: "var(--border-subtle)" }}>
        {rows.map((r) => (
          <li key={r.id} className="flex flex-wrap items-center gap-3 px-4 py-3 text-[13px]">
            <Link
              href={`/platform/tenants/${r.id}`}
              className="ts-focus min-w-0 flex-1 truncate font-medium hover:underline"
              style={{ color: "var(--text-default)" }}
            >
              {r.name}
              <span className="ml-2 text-[11px]" style={{ color: "var(--text-muted)" }}>{r.plan}</span>
            </Link>
            <span className="text-[11px]" style={{ color: "var(--text-muted)" }}>
              past due {new Date(r.updatedAt).toLocaleDateString()}
            </span>
            {canWrite && (
              <form action={startDunning.bind(null, r.id)}>
                <button
                  type="submit"
                  className="ts-focus rounded-md px-3 py-1.5 text-[12px] font-medium"
                  style={{ background: "var(--warning-fg)", color: "var(--surface-1)" }}
                >
                  Start dunning →
                </button>
              </form>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

/* ────────────────────────────────────────────────────────────── */

type DunningTenant = {
  id: string;
  name: string;
  slug: string;
  plan: string;
  status: string;
  currency: string;
  dunningStage: DunningStage;
  dunningStartedAt: Date | null;
  dunningPausedAt: Date | null;
  dunningLastEventAt: Date | null;
};

function Pipeline({
  byStage,
  canWrite,
}: {
  byStage: Map<DunningStage, DunningTenant[]>;
  canWrite: boolean;
}) {
  return (
    <section>
      <div className="flex items-center justify-between">
        <h2 className="text-[14px] font-semibold" style={{ color: "var(--text-default)" }}>
          Pipeline
        </h2>
      </div>
      <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-3 lg:grid-cols-6">
        {STAGES_INORDER.map((stage) => {
          const tenants = byStage.get(stage) ?? [];
          return (
            <div
              key={stage}
              className="rounded-lg border"
              style={{
                background: "var(--surface-1)",
                borderColor: stage === "SUSPEND"
                  ? "var(--danger-fg)"
                  : stage === "FINAL_NOTICE"
                  ? "var(--warning-fg)"
                  : "var(--border-subtle)",
              }}
            >
              <div className="border-b px-3 py-2" style={{ borderColor: "var(--border-subtle)" }}>
                <div
                  className="text-[12px] font-semibold"
                  style={{
                    color: stage === "SUSPEND"      ? "var(--danger-fg)"   :
                           stage === "FINAL_NOTICE" ? "var(--warning-fg)"  :
                                                      "var(--text-default)",
                  }}
                >
                  {STAGE_LABEL[stage]}
                </div>
                <div className="text-[10px]" style={{ color: "var(--text-muted)" }}>
                  {STAGE_DESCRIPTION[stage]}
                </div>
              </div>
              <div className="space-y-2 p-2">
                {tenants.length === 0 ? (
                  <div className="px-2 py-3 text-center text-[11px]" style={{ color: "var(--text-muted)" }}>
                    Empty
                  </div>
                ) : (
                  tenants.map((t) => (
                    <TenantCard key={t.id} t={t} canWrite={canWrite} />
                  ))
                )}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function TenantCard({ t, canWrite }: { t: DunningTenant; canWrite: boolean }) {
  const startedDays = t.dunningStartedAt
    ? Math.floor((Date.now() - t.dunningStartedAt.getTime()) / (24 * 60 * 60 * 1000))
    : null;

  return (
    <div
      className="rounded-md border p-2 text-[12px]"
      style={{
        background: "var(--surface-2)",
        borderColor: t.dunningPausedAt ? "var(--warning-fg)" : "var(--border-subtle)",
      }}
    >
      <Link
        href={`/platform/tenants/${t.id}`}
        className="ts-focus block truncate font-medium hover:underline"
        style={{ color: "var(--text-default)" }}
      >
        {t.name}
      </Link>
      <div className="mt-0.5 truncate text-[10px]" style={{ color: "var(--text-muted)" }}>
        {t.plan} · {t.currency}
      </div>
      {startedDays != null && (
        <div className="mt-0.5 text-[10px]" style={{ color: "var(--text-muted)" }}>
          {startedDays}d in funnel
        </div>
      )}
      {t.dunningPausedAt && (
        <div className="mt-1 inline-block rounded px-1.5 py-0.5 text-[10px] font-medium" style={{ background: "var(--warning-surface)", color: "var(--warning-fg)" }}>
          PAUSED
        </div>
      )}
      {canWrite && t.dunningStage !== "RESOLVED" && (
        <div className="mt-2 flex flex-wrap gap-1">
          {t.dunningStage !== "SUSPEND" && (
            <form action={advanceDunning.bind(null, t.id)}>
              <button type="submit" className="ts-focus rounded-md px-2 py-1 text-[10px] font-medium" style={{ background: "var(--warning-fg)", color: "var(--surface-1)" }}>
                Advance →
              </button>
            </form>
          )}
          {t.dunningPausedAt ? (
            <form action={resumeDunning.bind(null, t.id)}>
              <button type="submit" className="ts-focus rounded-md border px-2 py-1 text-[10px] font-medium" style={{ borderColor: "var(--border-subtle)", color: "var(--text-default)", background: "var(--surface-1)" }}>
                Resume
              </button>
            </form>
          ) : (
            <form action={pauseDunning.bind(null, t.id)}>
              <button type="submit" className="ts-focus rounded-md border px-2 py-1 text-[10px] font-medium" style={{ borderColor: "var(--border-subtle)", color: "var(--text-muted)", background: "var(--surface-1)" }}>
                Pause
              </button>
            </form>
          )}
          <form action={resolveDunning.bind(null, t.id)}>
            <button type="submit" className="ts-focus rounded-md px-2 py-1 text-[10px] font-medium" style={{ background: "var(--accent-primary)", color: "var(--accent-on-primary)" }}>
              Resolve ✓
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
