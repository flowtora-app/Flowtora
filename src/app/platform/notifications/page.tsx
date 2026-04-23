import Link from "next/link";
import { db } from "@/lib/db";
import { requirePlatformStaff } from "@/lib/platform";
import { Card, CardHeader } from "@/components/Card";
import { listRegistrations } from "@/lib/notifications";
import type { NotificationCategory, NotificationRegistration } from "@/lib/notifications";

// /platform/notifications — catalog of every transactional kind.
//
// One row per registered kind (from src/lib/notifications/registry.ts).
// The DB is joined in so admins see at a glance whether each row is
// still on the built-in default, has a DRAFT saved, or is PUBLISHED.
// Sorted by (category, sortOrder) to match the admin-facing grouping —
// auth > team > billing > support > activity.

export const dynamic = "force-dynamic";

type SP = { ok?: string; error?: string };

const CATEGORY_LABEL: Record<NotificationCategory, string> = {
  auth:     "Auth & security",
  team:     "Team",
  billing:  "Billing",
  support:  "Support",
  activity: "Activity",
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
  await requirePlatformStaff();
  const sp = await searchParams;

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

  const totalPublished = rows.filter((r) => r.status === "PUBLISHED").length;
  const totalDisabled  = rows.filter((r) => r.enabled === false && !r.isCritical).length;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Notifications</h1>
          <p className="mt-1 text-sm" style={{ color: "var(--text-muted)" }}>
            Transactional email copy and branding, managed from here. Every kind falls back to a built-in
            default — unpublished rows never affect live users.
          </p>
        </div>
        <Link
          href="/platform/notifications/brand"
          className="rounded-md px-3 py-2 text-xs font-medium"
          style={{
            background: "var(--surface-2)",
            color: "var(--text-default)",
            border: "1px solid var(--border-subtle)",
          }}
        >
          Brand settings →
        </Link>
      </div>

      {sp.ok && <Banner tone="ok">{sp.ok}</Banner>}
      {sp.error && <Banner tone="error">{sp.error}</Banner>}

      <div className="grid gap-3 md:grid-cols-3">
        <StatCard label="Registered kinds" value={String(registrations.length)} />
        <StatCard label="Published overrides" value={String(totalPublished)} />
        <StatCard label="Disabled (non-critical)" value={String(totalDisabled)} />
      </div>

      {CATEGORY_ORDER.map((cat) => {
        const list = grouped.get(cat) ?? [];
        if (list.length === 0) return null;
        return (
          <Card key={cat}>
            <CardHeader title={CATEGORY_LABEL[cat]} />
            <div>
              {list.map((reg) => {
                const row = byKind.get(reg.kind);
                return <RegistrationRow key={reg.kind} reg={reg} row={row ?? null} />;
              })}
            </div>
          </Card>
        );
      })}
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────── */

function RegistrationRow({
  reg,
  row,
}: {
  reg: NotificationRegistration;
  row: {
    status: "DRAFT" | "PUBLISHED" | "DISABLED";
    enabled: boolean;
    publishedAt: Date | null;
    updatedAt: Date;
    isCritical: boolean;
  } | null;
}) {
  const href = `/platform/notifications/${encodeURIComponent(reg.kind)}`;
  const status = row?.status ?? "DEFAULT";
  const enabled = row?.enabled ?? true;

  return (
    <Link
      href={href}
      className="flex items-center justify-between gap-4 px-5 py-3.5 text-sm"
      style={{ borderTop: "1px solid var(--border-subtle)" }}
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate font-medium" style={{ color: "var(--text-default)" }}>
            {reg.label}
          </span>
          {reg.isCritical && <CriticalBadge />}
          {!enabled && !reg.isCritical && <DisabledBadge />}
        </div>
        <div
          className="mt-0.5 truncate text-xs"
          style={{ color: "var(--text-muted)" }}
        >
          <span className="font-mono text-[11px]">{reg.kind}</span>
          {" · "}
          {reg.description}
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-3">
        <StatusPill status={status} />
        <span className="text-xs" style={{ color: "var(--text-muted)" }}>
          {row
            ? row.status === "PUBLISHED" && row.publishedAt
              ? `v live · ${formatRel(row.publishedAt)}`
              : `edited ${formatRel(row.updatedAt)}`
            : "using default"}
        </span>
        <span className="text-xs" style={{ color: "var(--text-faint)" }}>→</span>
      </div>
    </Link>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div
      className="rounded-md px-4 py-3"
      style={{
        background: "var(--surface-1)",
        border: "1px solid var(--border-subtle)",
      }}
    >
      <div className="text-xs" style={{ color: "var(--text-muted)" }}>{label}</div>
      <div className="mt-1 text-xl font-semibold" style={{ color: "var(--text-default)" }}>
        {value}
      </div>
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  const style: React.CSSProperties =
    status === "PUBLISHED"
      ? {
          background: "var(--success-surface)",
          color: "var(--success-fg)",
          border: "1px solid var(--success-fg)",
        }
      : status === "DRAFT"
      ? {
          background: "var(--warning-surface)",
          color: "var(--warning-fg)",
          border: "1px solid var(--warning-fg)",
        }
      : {
          background: "var(--surface-2)",
          color: "var(--text-muted)",
          border: "1px solid var(--border-subtle)",
        };
  const label =
    status === "PUBLISHED" ? "published"
    : status === "DRAFT"   ? "draft"
    : status === "DISABLED"? "disabled"
    : "default";
  return (
    <span
      className="rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider"
      style={style}
    >
      {label}
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
    >
      critical
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

function Banner({ tone, children }: { tone: "ok" | "error"; children: React.ReactNode }) {
  const style: React.CSSProperties =
    tone === "ok"
      ? {
          background: "var(--success-surface)",
          color: "var(--success-fg)",
          border: "1px solid var(--success-fg)",
        }
      : {
          background: "var(--danger-surface)",
          color: "var(--danger-fg)",
          border: "1px solid var(--danger-fg)",
        };
  return (
    <div className="rounded-md px-4 py-3 text-sm" style={style}>
      {children}
    </div>
  );
}

// Tiny relative-time helper — matches the platform's overall terseness.
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
