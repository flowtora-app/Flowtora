import Link from "next/link";
import { db } from "@/lib/db";
import { requirePlatformStaff } from "@/lib/platform";
import { listRegistrations } from "@/lib/notifications";
import type { NotificationCategory, NotificationRegistration } from "@/lib/notifications";
import { seedAllTemplatesFromDefaults } from "@/app/actions/notifications-admin";
import { NotificationsKPIBand, type NotificationsKpi } from "@/components/platform/NotificationsKPIBand";
import { NotificationsFilterBar } from "@/components/platform/NotificationsFilterBar";

// /platform/notifications — transactional notification catalog
// (transformation rewrite).
//
// Layout:
//   1. Header with "Brand settings" + "Seed missing" quick actions
//   2. Hierarchy explainer — 3 tiles (Default → Draft → Published)
//   3. 5-tile KPI band — Registered · Published · Drafts · Disabled · Critical
//   4. Live filter bar (search + category + status + critical-only toggle)
//   5. Grouped category sections with polished per-row layout

export const dynamic = "force-dynamic";

type SP = { ok?: string; error?: string };

const CATEGORY_LABEL: Record<NotificationCategory, string> = {
  auth:     "Auth & security",
  team:     "Team",
  billing:  "Billing",
  support:  "Support",
  activity: "Activity",
};

const CATEGORY_DESCRIPTION: Record<NotificationCategory, string> = {
  auth:     "Verification, password reset, security alerts. Critical kinds can't be disabled.",
  team:     "Invitations, role changes, member events.",
  billing:  "Trial reminders, payment receipts, dunning.",
  support:  "Ticket replies, escalations, satisfaction follow-ups.",
  activity: "Digest emails, milestone callouts, in-app announcements.",
};

const CATEGORY_ORDER: NotificationCategory[] = [
  "auth",
  "team",
  "billing",
  "support",
  "activity",
];

export default async function PlatformNotificationsPage({
  searchParams,
}: {
  searchParams: Promise<SP>;
}) {
  const ctx = await requirePlatformStaff();
  const sp = await searchParams;
  const canWrite = ctx.canWrite;

  const rows = await db.notificationTemplate.findMany({
    where: { channel: "EMAIL", locale: "en" },
    select: {
      id: true,
      kind: true,
      status: true,
      enabled: true,
      updatedAt: true,
      publishedAt: true,
      isCritical: true,
    },
  });
  const byKind = new Map(rows.map((r) => [r.kind, r]));

  const registrations = listRegistrations();
  const grouped = new Map<NotificationCategory, NotificationRegistration[]>();
  for (const cat of CATEGORY_ORDER) grouped.set(cat, []);
  for (const reg of registrations) {
    grouped.get(reg.category)?.push(reg);
  }
  for (const list of grouped.values()) {
    list.sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
  }

  // ── KPI metrics ────────────────────────────────────────────
  const totalKinds      = registrations.length;
  const totalPublished  = rows.filter((r) => r.status === "PUBLISHED").length;
  const totalDrafts     = rows.filter((r) => r.status === "DRAFT").length;
  const totalDisabled   = rows.filter((r) => r.enabled === false && !r.isCritical).length;
  const totalCritical   = registrations.filter((r) => r.isCritical).length;
  const missingTemplates = registrations.length - rows.length; // never seeded

  const kpis: NotificationsKpi[] = [
    {
      label: "Registered kinds",
      value: totalKinds.toString(),
      hint: missingTemplates > 0 ? `${missingTemplates} not yet seeded` : "All seeded in DB",
      tone: "default",
    },
    {
      label: "Published",
      value: totalPublished.toString(),
      hint: "Live overrides shipping to users",
      tone: totalPublished > 0 ? "success" : "default",
    },
    {
      label: "Drafts",
      value: totalDrafts.toString(),
      hint: totalDrafts === 0 ? "No work in progress" : "Saved but not live",
      tone: totalDrafts > 0 ? "warning" : "default",
    },
    {
      label: "Disabled",
      value: totalDisabled.toString(),
      hint: totalDisabled === 0 ? "All non-critical kinds active" : "Non-critical kinds turned off",
      tone: totalDisabled > 0 ? "danger" : "default",
    },
    {
      label: "Critical (locked)",
      value: totalCritical.toString(),
      hint: "Can't be disabled",
      tone: "accent",
    },
  ];

  return (
    <div className="space-y-6">
      {/* ── Header ─────────────────────────────────────── */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight" style={{ color: "var(--text-default)" }}>
            Notifications
          </h1>
          <p className="mt-1 text-sm" style={{ color: "var(--text-muted)" }}>
            Transactional emails, in-app alerts, and brand settings. Every kind falls back to a built-in
            default — drafts and unpublished rows never reach users.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {canWrite && missingTemplates > 0 && (
            <form action={seedAllTemplatesFromDefaults}>
              <button
                type="submit"
                className="ts-focus rounded-md px-3 py-2 text-xs font-medium"
                style={{
                  background: "var(--surface-1)",
                  color: "var(--text-default)",
                  border: "1px solid var(--border-default)",
                }}
                title="Create a DRAFT row for every kind not yet in the DB. Idempotent."
              >
                Seed {missingTemplates} missing
              </button>
            </form>
          )}
          <Link
            href="/platform/notifications/brand"
            className="ts-focus rounded-md px-3 py-2 text-xs font-medium"
            style={{
              background: "var(--surface-1)",
              color: "var(--text-default)",
              border: "1px solid var(--border-default)",
            }}
          >
            Brand settings →
          </Link>
        </div>
      </div>

      {/* ── Banners ────────────────────────────────────── */}
      {sp.ok && (
        <Banner tone="success" title="Saved" body={decodeURIComponent(sp.ok)} />
      )}
      {sp.error && <Banner tone="danger" title="Action failed" body={decodeURIComponent(sp.error)} />}

      {/* ── Hierarchy explainer ─────────────────────────── */}
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <HierarchyTile
          step="1"
          title="Built-in default"
          body="Compile-time copy in src/lib/notifications/defaults.ts. The fallback when no row exists or the row is DRAFT."
          tone="default"
        />
        <HierarchyTile
          step="2"
          title="Draft override"
          body="DB row with status=DRAFT. Shows in the editor + test-send, never reaches live users."
          tone="warning"
        />
        <HierarchyTile
          step="3"
          title="Published override"
          body="DB row with status=PUBLISHED. Beats the default. Unpublishing reverts to default instantly."
          tone="success"
        />
      </div>

      {/* ── KPI band ───────────────────────────────────── */}
      <NotificationsKPIBand kpis={kpis} />

      {/* ── Filter bar ─────────────────────────────────── */}
      <NotificationsFilterBar totalKinds={totalKinds} />

      {/* ── Grouped category sections ──────────────────── */}
      {CATEGORY_ORDER.map((cat) => {
        const list = grouped.get(cat) ?? [];
        if (list.length === 0) return null;
        const publishedInCat = list.filter((reg) => byKind.get(reg.kind)?.status === "PUBLISHED").length;
        return (
          <section
            key={cat}
            data-notif-group
            className="overflow-hidden rounded-xl"
            style={{
              background: "var(--surface-1)",
              border: "1px solid var(--border-subtle)",
              boxShadow: "var(--shadow-sm)",
            }}
          >
            <header
              className="flex items-baseline justify-between gap-3 px-5 py-4"
              style={{ borderBottom: "1px solid var(--border-subtle)" }}
            >
              <div>
                <h2 className="text-sm font-semibold" style={{ color: "var(--text-default)" }}>
                  {CATEGORY_LABEL[cat]}
                </h2>
                <p className="mt-0.5 text-xs" style={{ color: "var(--text-muted)" }}>
                  {CATEGORY_DESCRIPTION[cat]}
                </p>
              </div>
              <span className="text-xs" style={{ color: "var(--text-muted)" }}>
                {publishedInCat} of {list.length} published
              </span>
            </header>
            <ul>
              {list.map((reg, idx) => {
                const row = byKind.get(reg.kind);
                return (
                  <RegistrationRow
                    key={reg.kind}
                    reg={reg}
                    row={row ?? null}
                    isFirst={idx === 0}
                  />
                );
              })}
            </ul>
          </section>
        );
      })}

      {/* Empty state — toggled by the filter bar when nothing matches. */}
      <div
        data-notif-empty
        style={{ display: "none" }}
        className="rounded-xl px-5 py-8 text-center text-sm"
      >
        <div className="mb-1 text-2xl" aria-hidden>📭</div>
        <div className="font-medium" style={{ color: "var(--text-default)" }}>
          No notifications match.
        </div>
        <div className="mt-1 text-xs" style={{ color: "var(--text-muted)" }}>
          Adjust the filter or clear it.
        </div>
      </div>

      <p className="text-xs" style={{ color: "var(--text-faint)" }}>
        Critical notifications (auth, security, billing-failed) can't be disabled — they protect users from
        being locked out. Non-critical kinds can be turned off per-tenant via{" "}
        <code className="rounded px-1 py-0.5 font-mono text-[11px]" style={{ background: "var(--surface-2)", border: "1px solid var(--border-subtle)" }}>
          NotificationPreference
        </code>{" "}
        rows on the user side.
      </p>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────── */

function RegistrationRow({
  reg,
  row,
  isFirst,
}: {
  reg: NotificationRegistration;
  row: {
    status: "DRAFT" | "PUBLISHED" | "DISABLED";
    enabled: boolean;
    publishedAt: Date | null;
    updatedAt: Date;
    isCritical: boolean;
  } | null;
  isFirst: boolean;
}) {
  const href = `/platform/notifications/${encodeURIComponent(reg.kind)}`;
  const status = row?.status ?? "DEFAULT";
  const enabled = row?.enabled ?? true;
  const isDisabled = !enabled && !reg.isCritical;
  const haystack = `${reg.kind} ${reg.label} ${reg.description}`.toLowerCase();
  const dataStatus = isDisabled ? "DISABLED" : status;

  return (
    <li
      data-notif-row
      data-notif-haystack={haystack}
      data-notif-category={reg.category}
      data-notif-status={dataStatus}
      data-notif-critical={reg.isCritical ? "1" : "0"}
      style={{ borderTop: isFirst ? "none" : "1px solid var(--border-subtle)" }}
    >
      <Link
        href={href}
        className="grid grid-cols-1 gap-3 px-5 py-3.5 transition-colors hover:opacity-95 md:grid-cols-[1fr_140px_180px_60px] md:items-center"
      >
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="truncate text-sm font-medium" style={{ color: "var(--text-default)" }}>
              {reg.label}
            </span>
            {reg.isCritical && <CriticalBadge />}
            {isDisabled && <DisabledBadge />}
            {reg.channels && reg.channels.length > 1 && (
              <span
                className="rounded-full px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide"
                style={{ background: "var(--accent-surface)", color: "var(--accent-primary)" }}
                title="Sends across multiple channels (e.g. EMAIL + IN_APP)"
              >
                multi-channel
              </span>
            )}
          </div>
          <div className="mt-0.5 truncate text-xs" style={{ color: "var(--text-muted)" }}>
            <span className="font-mono text-[10px]">{reg.kind}</span>
            <span className="ml-1">· {reg.description}</span>
          </div>
        </div>

        <div>
          <StatusPill status={status} />
        </div>

        <div className="text-xs" style={{ color: "var(--text-muted)" }}>
          {row ? (
            row.status === "PUBLISHED" && row.publishedAt
              ? <>Live · {formatRel(row.publishedAt)}</>
              : <>Edited {formatRel(row.updatedAt)}</>
          ) : (
            <>Using built-in default</>
          )}
        </div>

        <div className="text-right text-xs" style={{ color: "var(--text-faint)" }}>
          Edit →
        </div>
      </Link>
    </li>
  );
}

function HierarchyTile({
  step,
  title,
  body,
  tone,
}: {
  step: string;
  title: string;
  body: string;
  tone: "default" | "warning" | "success";
}) {
  const palette =
    tone === "warning" ? { bg: "var(--warning-surface)", border: "var(--warning-fg)", fg: "var(--warning-fg)" } :
    tone === "success" ? { bg: "var(--success-surface)", border: "var(--success-fg)", fg: "var(--success-fg)" } :
                          { bg: "var(--surface-1)",       border: "var(--border-subtle)", fg: "var(--text-muted)" };
  return (
    <div
      className="flex items-start gap-3 rounded-xl p-4"
      style={{ background: palette.bg, border: `1px solid ${palette.border}`, boxShadow: "var(--shadow-sm)" }}
    >
      <span
        aria-hidden
        className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold"
        style={{ background: palette.fg, color: "var(--text-inverse)" }}
      >
        {step}
      </span>
      <div className="min-w-0">
        <div className="text-sm font-semibold" style={{ color: palette.fg }}>{title}</div>
        <div className="mt-0.5 text-xs" style={{ color: "var(--text-muted)" }}>{body}</div>
      </div>
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  const tone =
    status === "PUBLISHED" ? { bg: "var(--success-surface)", fg: "var(--success-fg)",  label: "Published" } :
    status === "DRAFT"     ? { bg: "var(--warning-surface)", fg: "var(--warning-fg)",  label: "Draft"     } :
    status === "DISABLED"  ? { bg: "var(--danger-surface)",  fg: "var(--danger-fg)",   label: "Disabled"  } :
                              { bg: "var(--surface-2)",       fg: "var(--text-muted)",  label: "Default"   };
  return (
    <span
      className="inline-block rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider"
      style={{ background: tone.bg, color: tone.fg, border: `1px solid ${tone.fg}` }}
    >
      {tone.label}
    </span>
  );
}

function CriticalBadge() {
  return (
    <span
      className="rounded-full px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wider"
      style={{
        background: "var(--accent-surface)",
        color: "var(--accent-primary)",
        border: "1px solid var(--accent-primary)",
      }}
      title="Cannot be disabled — protects users from lockout / billing failure"
    >
      🔒 critical
    </span>
  );
}

function DisabledBadge() {
  return (
    <span
      className="rounded-full px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wider"
      style={{
        background: "var(--danger-surface)",
        color: "var(--danger-fg)",
        border: "1px solid var(--danger-fg)",
      }}
    >
      off
    </span>
  );
}

function Banner({
  tone,
  title,
  body,
}: {
  tone: "danger" | "success";
  title: string;
  body: string;
}) {
  const palette =
    tone === "danger"
      ? { bg: "var(--danger-surface)",  fg: "var(--danger-fg)",  border: "var(--danger-fg)"  }
      : { bg: "var(--success-surface)", fg: "var(--success-fg)", border: "var(--success-fg)" };
  return (
    <div
      className="rounded-md px-4 py-3 text-sm"
      style={{ background: palette.bg, border: `1px solid ${palette.border}`, color: palette.fg }}
    >
      <div className="font-semibold">{title}</div>
      <div className="mt-0.5 text-xs" style={{ opacity: 0.85 }}>{body}</div>
    </div>
  );
}

function formatRel(d: Date | string): string {
  const date = typeof d === "string" ? new Date(d) : d;
  const diffMs = Date.now() - date.getTime();
  const minutes = Math.round(diffMs / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days}d ago`;
  return date.toLocaleDateString();
}
