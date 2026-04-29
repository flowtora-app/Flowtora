import Link from "next/link";
import { db } from "@/lib/db";
import { requirePlatformStaff } from "@/lib/platform";
import {
  PLATFORM_ROLE_PERMISSIONS,
  platformRoleLabel,
  rankPlatformRole,
  type PlatformPermission,
} from "@/lib/rbac";
import {
  assignPlatformRole,
  removePlatformStaff,
  inviteStaff,
  grantPlatformElevation,
  revokePlatformElevation,
} from "@/app/actions/platform";
import { assignCustomPlatformRole } from "@/app/actions/platform-custom-roles";
import { Icon } from "@/components/shell/icons";
import type { PlatformRole } from "@prisma/client";

// /platform/staff — platform staff & RBAC console (Phase 1).
//
// Shows everyone with a non-null `platformRole`, surfaces their last
// login + active sessions + active elevations, and lets users with
// `staff.assign_role` / `staff.invite` / `staff.elevate` change those
// values inline. Read-only viewers (Analyst, Read-only Viewer, Support
// Agent) can still see this page but every form button is disabled.
//
// Layout:
//   1. KPI band — Total staff · Active elevations · Pending elevations
//      · By-role counts (top 4)
//   2. Invite card (admin-gated)
//   3. Active elevations strip
//   4. Staff table with inline role-change + elevation grant
//
// Why one big page, not tabs: there are <30 staff, the data fits.
// Splitting the surface into "Members / Elevations / Audit" tabs
// would be premature.

export const dynamic = "force-dynamic";

type SP = { ok?: string; error?: string };

const ALL_ROLES: PlatformRole[] = [
  "SUPER_ADMIN", "ADMIN", "SITE_MANAGER", "MANAGER",
  "BILLING_MANAGER", "SUPPORT_LEAD", "DEVELOPER",
  "MARKETING_MANAGER", "CONTENT_MANAGER", "SUPPORT_AGENT",
  "ANALYST", "READ_ONLY_VIEWER",
];

export default async function PlatformStaffPage({
  searchParams,
}: {
  searchParams: Promise<SP>;
}) {
  const ctx = await requirePlatformStaff();
  const sp = await searchParams;

  const canAssign  = ctx.can("staff.assign_role");
  const canInvite  = ctx.can("staff.invite");
  const canElevate = ctx.can("staff.elevate");
  const canRevoke  = ctx.can("staff.revoke_elevation");

  // ── Pull staff + active elevations ─────────────────────────────────
  const [staff, activeElevations, sessionCounts, recentEvents, activeCustomRoles] = await Promise.all([
    db.user.findMany({
      where: { platformRole: { not: null } },
      select: {
        id: true,
        email: true,
        name: true,
        platformRole: true,
        customPlatformRoleId: true,
        customPlatformRole: { select: { id: true, name: true, key: true, status: true } },
        lastLoginAt: true,
        twoFactorEnabled: true,
        createdAt: true,
      },
      orderBy: [{ lastLoginAt: "desc" }, { email: "asc" }],
      take: 200,
    }),
    db.platformRoleElevation.findMany({
      where: { revokedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { expiresAt: "asc" },
      include: {
        user:      { select: { id: true, email: true, name: true } },
        grantedBy: { select: { email: true, name: true } },
      },
    }),
    db.session.groupBy({
      by: ["userId"],
      where: { expires: { gt: new Date() } },
      _count: { _all: true },
    }),
    db.platformRoleElevation.findMany({
      where: {
        OR: [
          { revokedAt: { not: null } },
          { expiresAt: { lt: new Date() } },
        ],
      },
      orderBy: { createdAt: "desc" },
      take: 8,
      include: {
        user:      { select: { email: true } },
        grantedBy: { select: { email: true } },
      },
    }),
    db.customPlatformRole.findMany({
      where: { status: "ACTIVE" },
      orderBy: { name: "asc" },
      select: { id: true, name: true, key: true },
    }),
  ]);

  const sessionByUser = new Map<string, number>();
  for (const s of sessionCounts) sessionByUser.set(s.userId, s._count._all);

  const elevationByUser = new Map<string, typeof activeElevations[number][]>();
  for (const e of activeElevations) {
    const arr = elevationByUser.get(e.userId) ?? [];
    arr.push(e);
    elevationByUser.set(e.userId, arr);
  }

  const byRole = new Map<PlatformRole, number>();
  for (const u of staff) {
    if (u.platformRole) byRole.set(u.platformRole, (byRole.get(u.platformRole) ?? 0) + 1);
  }
  const topRoles = [...byRole.entries()].sort(([, a], [, b]) => b - a).slice(0, 4);

  const totalStaff = staff.length;
  const totalActiveElevations = activeElevations.length;
  const expiringSoon = activeElevations.filter(
    (e) => e.expiresAt.getTime() - Date.now() < 24 * 60 * 60 * 1000,
  ).length;

  return (
    <div className="space-y-6">
      <Header />
      {sp.ok    ? <Toast tone="ok"    msg={MESSAGES[sp.ok] ?? "Done"} /> : null}
      {sp.error ? <Toast tone="error" msg={sp.error} /> : null}

      <KpiBand
        total={totalStaff}
        active={totalActiveElevations}
        expiring={expiringSoon}
        topRoles={topRoles}
      />

      {/* Active elevations strip */}
      {activeElevations.length > 0 && (
        <ActiveElevations
          rows={activeElevations}
          canRevoke={canRevoke}
        />
      )}

      {/* Invite */}
      <InviteCard disabled={!canInvite} />

      {/* Main staff list */}
      <StaffList
        staff={staff}
        sessionByUser={sessionByUser}
        elevationByUser={elevationByUser}
        canAssign={canAssign}
        canElevate={canElevate}
        currentUserId={ctx.userId}
        currentUserBaseRole={ctx.baseRole}
        activeCustomRoles={activeCustomRoles}
      />

      {/* Recent elevation history */}
      {recentEvents.length > 0 && <RecentElevationHistory rows={recentEvents} />}

      {/* Role permission reference */}
      <RolePermissionReference />
    </div>
  );
}

const MESSAGES: Record<string, string> = {
  role_assigned:      "Role updated. Their next request reauths against the new role.",
  role_unchanged:     "User already had that role. No change.",
  staff_removed:      "Removed staff role. Active elevations were also revoked.",
  invited:            "Invite recorded. They'll set a password via the reset flow.",
  already_has_role:   "User already had that role.",
  elevation_granted:  "Elevation granted. Session bumped — takes effect on next request.",
  elevation_revoked:  "Elevation revoked.",
  already_revoked:    "Elevation was already revoked.",
  custom_role_assigned: "Custom role attached. Session bumped — takes effect on next request.",
  custom_role_detached: "Custom role detached. User falls back to baseline.",
  custom_role_unchanged: "User already had that custom role.",
};

/* ────────────────────────────────────────────────────────────── */

function Header() {
  return (
    <div className="flex items-end justify-between gap-4">
      <div>
        <div className="flex items-center gap-2 text-[12px] font-medium uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>
          <Icon.Shield size={14} />
          <span>Phase 1 · Auth &amp; RBAC</span>
        </div>
        <h1 className="mt-1 text-[26px] font-semibold leading-tight" style={{ color: "var(--text-default)" }}>
          Platform staff
        </h1>
        <p className="mt-1 text-[13px]" style={{ color: "var(--text-muted)" }}>
          Manage who has access to /platform, change durable roles, and grant
          time-bounded elevations for incident response or vacation cover.
        </p>
      </div>
      <Link
        href="/platform/audit?action=platform.staff_"
        className="ts-focus inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-[12px] font-medium"
        style={{
          borderColor: "var(--border-subtle)",
          color: "var(--text-default)",
          background: "var(--surface-1)",
        }}
      >
        <Icon.FileText size={14} />
        View audit trail
      </Link>
    </div>
  );
}

function Toast({ tone, msg }: { tone: "ok" | "error"; msg: string }) {
  const palette =
    tone === "ok"
      ? { bg: "var(--accent-surface)",  fg: "var(--accent-primary)", icon: "✓" }
      : { bg: "var(--danger-surface)",  fg: "var(--danger-fg)",      icon: "!" };
  return (
    <div
      className="flex items-center gap-2 rounded-md border px-3 py-2 text-[13px]"
      style={{
        background: palette.bg,
        color: palette.fg,
        borderColor: palette.fg,
      }}
    >
      <span aria-hidden className="font-bold">{palette.icon}</span>
      <span>{msg}</span>
    </div>
  );
}

function KpiBand({
  total,
  active,
  expiring,
  topRoles,
}: {
  total: number;
  active: number;
  expiring: number;
  topRoles: [PlatformRole, number][];
}) {
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-6">
      <Kpi label="Total staff" value={String(total)} hint="Users with a platform role" />
      <Kpi
        label="Active elevations"
        value={String(active)}
        hint={active === 0 ? "No one is elevated" : "Currently above their baseline role"}
        tone={active > 0 ? "warn" : "default"}
      />
      <Kpi
        label="Expiring < 24h"
        value={String(expiring)}
        hint={expiring === 0 ? "Nothing imminent" : "Will auto-expire soon"}
        tone={expiring > 0 ? "warn" : "default"}
      />
      {topRoles.map(([role, count]) => (
        <Kpi
          key={role}
          label={platformRoleLabel(role)}
          value={String(count)}
          hint="Members on this role"
        />
      ))}
    </div>
  );
}

function Kpi({
  label,
  value,
  hint,
  tone = "default",
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "default" | "warn";
}) {
  return (
    <div
      className="rounded-lg border px-4 py-3"
      style={{
        background: "var(--surface-1)",
        borderColor: tone === "warn" ? "var(--warning-fg)" : "var(--border-subtle)",
      }}
    >
      <div className="text-[11px] font-medium uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>
        {label}
      </div>
      <div className="mt-1 text-[22px] font-semibold leading-none" style={{ color: tone === "warn" ? "var(--warning-fg)" : "var(--text-default)" }}>
        {value}
      </div>
      {hint && (
        <div className="mt-1 text-[11px]" style={{ color: "var(--text-muted)" }}>{hint}</div>
      )}
    </div>
  );
}

/* ────────────────────────────────────────────────────────────── */

type ElevationRow = {
  id: string;
  elevatedTo: PlatformRole;
  originalRole: PlatformRole;
  reason: string;
  expiresAt: Date;
  createdAt: Date;
  user: { id: string; email: string; name: string | null };
  grantedBy: { email: string; name: string | null };
};

function ActiveElevations({
  rows,
  canRevoke,
}: {
  rows: ElevationRow[];
  canRevoke: boolean;
}) {
  return (
    <section className="rounded-lg border" style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)" }}>
      <div className="flex items-center justify-between border-b px-4 py-3" style={{ borderColor: "var(--border-subtle)" }}>
        <div>
          <h2 className="text-[14px] font-semibold" style={{ color: "var(--text-default)" }}>
            Active elevations
          </h2>
          <p className="text-[12px]" style={{ color: "var(--text-muted)" }}>
            Temporary role bumps in effect right now. Auto-expire at the listed time.
          </p>
        </div>
      </div>
      <div className="divide-y" style={{ borderColor: "var(--border-subtle)" }}>
        {rows.map((r) => {
          const remaining = r.expiresAt.getTime() - Date.now();
          const hours = Math.max(0, Math.floor(remaining / (60 * 60 * 1000)));
          const mins = Math.max(0, Math.floor((remaining % (60 * 60 * 1000)) / 60_000));
          return (
            <div key={r.id} className="flex flex-wrap items-start gap-3 px-4 py-3 text-[13px]">
              <div className="min-w-0 flex-1">
                <div className="font-medium" style={{ color: "var(--text-default)" }}>
                  {r.user.name || r.user.email}
                  <span className="ml-2 text-[12px]" style={{ color: "var(--text-muted)" }}>{r.user.email}</span>
                </div>
                <div className="mt-1 text-[12px]" style={{ color: "var(--text-muted)" }}>
                  <RoleChip role={r.originalRole} muted />
                  <span className="mx-1">→</span>
                  <RoleChip role={r.elevatedTo} />
                  <span className="ml-2">·</span>
                  <span className="ml-2">expires in {hours}h {mins}m</span>
                </div>
                {r.reason && (
                  <div className="mt-1 italic text-[12px]" style={{ color: "var(--text-muted)" }}>
                    “{r.reason}”
                  </div>
                )}
                <div className="mt-1 text-[11px]" style={{ color: "var(--text-muted)" }}>
                  Granted by {r.grantedBy.name || r.grantedBy.email}
                </div>
              </div>
              {canRevoke && (
                <form action={revokePlatformElevation.bind(null, r.id)}>
                  <button
                    type="submit"
                    className="ts-focus rounded-md border px-3 py-1.5 text-[12px] font-medium"
                    style={{
                      borderColor: "var(--danger-fg)",
                      color: "var(--danger-fg)",
                      background: "var(--surface-1)",
                    }}
                  >
                    Revoke now
                  </button>
                </form>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}

/* ────────────────────────────────────────────────────────────── */

function InviteCard({ disabled }: { disabled: boolean }) {
  return (
    <section className="rounded-lg border" style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)" }}>
      <div className="border-b px-4 py-3" style={{ borderColor: "var(--border-subtle)" }}>
        <h2 className="text-[14px] font-semibold" style={{ color: "var(--text-default)" }}>
          Invite staff
        </h2>
        <p className="text-[12px]" style={{ color: "var(--text-muted)" }}>
          Adds the user with no password. They'll set one via the password
          reset flow before signing in. If the email already exists, this
          updates their role instead.
        </p>
      </div>
      <form action={inviteStaff} className="grid grid-cols-1 gap-3 p-4 md:grid-cols-[1.4fr_1fr_1fr_auto]">
        <Field label="Work email" required>
          <input
            type="email"
            name="email"
            required
            disabled={disabled}
            placeholder="alex@flowtora.com"
            className="ts-focus w-full rounded-md border px-3 py-2 text-[13px]"
            style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)", color: "var(--text-default)" }}
          />
        </Field>
        <Field label="Display name (optional)">
          <input
            type="text"
            name="name"
            disabled={disabled}
            placeholder="Alex Chen"
            className="ts-focus w-full rounded-md border px-3 py-2 text-[13px]"
            style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)", color: "var(--text-default)" }}
          />
        </Field>
        <Field label="Role" required>
          <RoleSelect name="role" disabled={disabled} defaultValue="SUPPORT_AGENT" />
        </Field>
        <div className="flex items-end">
          <button
            type="submit"
            disabled={disabled}
            className="ts-focus h-[38px] rounded-md px-4 text-[13px] font-medium disabled:cursor-not-allowed disabled:opacity-50"
            style={{ background: "var(--accent-primary)", color: "var(--accent-on-primary)" }}
          >
            Invite
          </button>
        </div>
      </form>
    </section>
  );
}

/* ────────────────────────────────────────────────────────────── */

type StaffRow = {
  id: string;
  email: string;
  name: string | null;
  platformRole: PlatformRole | null;
  customPlatformRoleId: string | null;
  customPlatformRole: { id: string; name: string; key: string; status: string } | null;
  lastLoginAt: Date | null;
  twoFactorEnabled: boolean;
  createdAt: Date;
};

type ActiveCustomRole = { id: string; name: string; key: string };

function StaffList({
  staff,
  sessionByUser,
  elevationByUser,
  canAssign,
  canElevate,
  currentUserId,
  currentUserBaseRole,
  activeCustomRoles,
}: {
  staff: StaffRow[];
  sessionByUser: Map<string, number>;
  elevationByUser: Map<string, ElevationRow[]>;
  canAssign: boolean;
  canElevate: boolean;
  currentUserId: string;
  currentUserBaseRole: PlatformRole;
  activeCustomRoles: ActiveCustomRole[];
}) {
  return (
    <section className="rounded-lg border" style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)" }}>
      <div className="flex items-center justify-between border-b px-4 py-3" style={{ borderColor: "var(--border-subtle)" }}>
        <div>
          <h2 className="text-[14px] font-semibold" style={{ color: "var(--text-default)" }}>
            Staff ({staff.length})
          </h2>
          <p className="text-[12px]" style={{ color: "var(--text-muted)" }}>
            Sorted by last login. Role changes bump the user's session — they'll
            reauth on their next request.
          </p>
        </div>
        <Link
          href="/platform/staff/roles"
          className="ts-focus inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-[12px] font-medium"
          style={{ borderColor: "var(--border-subtle)", color: "var(--text-default)", background: "var(--surface-1)" }}
        >
          Custom roles ({activeCustomRoles.length}) →
        </Link>
      </div>
      <div>
        {staff.map((u) => (
          <StaffRowItem
            key={u.id}
            row={u}
            sessions={sessionByUser.get(u.id) ?? 0}
            elevations={elevationByUser.get(u.id) ?? []}
            canAssign={canAssign}
            canElevate={canElevate}
            isSelf={u.id === currentUserId}
            currentUserBaseRole={currentUserBaseRole}
            activeCustomRoles={activeCustomRoles}
          />
        ))}
      </div>
    </section>
  );
}

function StaffRowItem({
  row,
  sessions,
  elevations,
  canAssign,
  canElevate,
  isSelf,
  currentUserBaseRole,
  activeCustomRoles,
}: {
  row: StaffRow;
  sessions: number;
  elevations: ElevationRow[];
  canAssign: boolean;
  canElevate: boolean;
  isSelf: boolean;
  currentUserBaseRole: PlatformRole;
  activeCustomRoles: ActiveCustomRole[];
}) {
  if (!row.platformRole) return null;

  const lastLogin = row.lastLoginAt
    ? formatRelative(row.lastLoginAt)
    : "Never";

  const display = row.name?.trim() || row.email;
  const initials = deriveInitials(display);

  // Only SUPER_ADMIN can elevate to SUPER_ADMIN. Non-admin elevators
  // see the role disabled in the dropdown.
  const elevatorIsSuper = currentUserBaseRole === "SUPER_ADMIN";

  return (
    <div className="grid grid-cols-1 gap-3 border-t px-4 py-4 md:grid-cols-[2fr_1fr_1fr_auto]" style={{ borderColor: "var(--border-subtle)" }}>
      {/* Identity */}
      <div className="flex items-start gap-3 min-w-0">
        <span
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[12px] font-semibold"
          style={{
            background: "var(--accent-surface)",
            color: "var(--accent-primary)",
            border: "1px solid var(--border-subtle)",
          }}
        >
          {initials}
        </span>
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="truncate text-[13px] font-semibold" style={{ color: "var(--text-default)" }}>
              {display}
            </span>
            {isSelf && (
              <span className="shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide" style={{ background: "var(--surface-2)", color: "var(--text-muted)", border: "1px solid var(--border-subtle)" }}>
                You
              </span>
            )}
          </div>
          <div className="truncate text-[12px]" style={{ color: "var(--text-muted)" }}>
            {row.email}
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px]">
            <RoleChip role={row.platformRole} />
            {row.customPlatformRole && (
              <span
                className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 font-medium"
                style={{
                  background: "var(--accent-surface)",
                  color: "var(--accent-primary)",
                  border: "1px solid var(--accent-primary)",
                }}
                title={`Custom role overrides baseline permissions (key: ${row.customPlatformRole.key})`}
              >
                ★ {row.customPlatformRole.name}
              </span>
            )}
            {elevations.map((e) => (
              <span
                key={e.id}
                className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 font-medium"
                style={{
                  background: "var(--warning-surface)",
                  color: "var(--warning-fg)",
                  border: "1px solid var(--warning-fg)",
                }}
                title={`Elevated to ${platformRoleLabel(e.elevatedTo)} until ${e.expiresAt.toLocaleString()} — ${e.reason}`}
              >
                ↑ {platformRoleLabel(e.elevatedTo)}
              </span>
            ))}
            {row.twoFactorEnabled ? (
              <span className="inline-flex items-center gap-1 rounded px-1.5 py-0.5" style={{ background: "var(--surface-2)", color: "var(--text-muted)" }}>
                <Icon.Shield size={10} /> 2FA
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 rounded px-1.5 py-0.5" style={{ background: "var(--danger-surface)", color: "var(--danger-fg)" }} title="No 2FA — risk">
                ! No 2FA
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Activity */}
      <div className="text-[12px]" style={{ color: "var(--text-muted)" }}>
        <div>
          <span style={{ color: "var(--text-default)" }}>Last login</span> · {lastLogin}
        </div>
        <div>
          <span style={{ color: "var(--text-default)" }}>Sessions</span> · {sessions}
        </div>
        <div>
          <span style={{ color: "var(--text-default)" }}>Joined</span> · {row.createdAt.toLocaleDateString()}
        </div>
      </div>

      {/* Role assignment */}
      <div className="space-y-2">
        {canAssign ? (
          <>
            <form action={assignPlatformRole.bind(null, row.id)} className="flex items-center gap-2">
              <RoleSelect name="role" defaultValue={row.platformRole} />
              <button
                type="submit"
                className="ts-focus rounded-md border px-2.5 py-1.5 text-[12px] font-medium"
                style={{
                  borderColor: "var(--border-subtle)",
                  color: "var(--text-default)",
                  background: "var(--surface-1)",
                }}
              >
                Save
              </button>
            </form>
            {/* Custom role attachment — shows whichever ACTIVE roles
                exist; the empty option detaches. Only renders the
                form when there is at least one active custom role
                (otherwise we'd be showing an empty dropdown). */}
            {activeCustomRoles.length > 0 && (
              <form action={assignCustomPlatformRole.bind(null, row.id)} className="flex items-center gap-2">
                <select
                  name="customRoleId"
                  defaultValue={row.customPlatformRoleId ?? ""}
                  className="ts-focus rounded-md border px-2 py-1.5 text-[12px]"
                  style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)", color: "var(--text-default)" }}
                >
                  <option value="">— No custom role —</option>
                  {activeCustomRoles.map((r) => (
                    <option key={r.id} value={r.id}>★ {r.name}</option>
                  ))}
                </select>
                <button
                  type="submit"
                  className="ts-focus rounded-md border px-2.5 py-1.5 text-[12px] font-medium"
                  style={{
                    borderColor: "var(--border-subtle)",
                    color: "var(--text-default)",
                    background: "var(--surface-1)",
                  }}
                >
                  Save
                </button>
              </form>
            )}
          </>
        ) : (
          <div className="text-[12px]" style={{ color: "var(--text-muted)" }}>
            Read-only
          </div>
        )}
      </div>

      {/* Elevation + remove actions */}
      <div className="flex items-end justify-end gap-2">
        {canElevate && !isSelf && (
          <ElevateInline
            userId={row.id}
            baseRole={row.platformRole}
            elevatorIsSuper={elevatorIsSuper}
          />
        )}
        {canAssign && !isSelf && (
          <RemoveInline userId={row.id} email={row.email} />
        )}
      </div>
    </div>
  );
}

function ElevateInline({
  userId,
  baseRole,
  elevatorIsSuper,
}: {
  userId: string;
  baseRole: PlatformRole;
  elevatorIsSuper: boolean;
}) {
  // Only roles strictly more powerful than the baseline are valid
  // elevation targets. We compute that here so the dropdown doesn't
  // include nonsense options.
  const baseRank = rankPlatformRole(baseRole);
  const candidates = ALL_ROLES.filter((r) => rankPlatformRole(r) < baseRank);
  if (candidates.length === 0) return null;

  return (
    <details className="group">
      <summary
        className="ts-focus cursor-pointer list-none rounded-md border px-2.5 py-1.5 text-[12px] font-medium"
        style={{
          borderColor: "var(--accent-primary)",
          color: "var(--accent-primary)",
          background: "var(--surface-1)",
        }}
      >
        Elevate ↑
      </summary>
      <form
        action={grantPlatformElevation.bind(null, userId)}
        className="absolute z-10 mt-2 w-[320px] rounded-lg border p-3 shadow-lg"
        style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)" }}
      >
        <div className="space-y-2 text-[12px]">
          <Field label="Elevate to">
            <select
              name="elevatedTo"
              required
              className="ts-focus w-full rounded-md border px-2 py-1.5"
              style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)", color: "var(--text-default)" }}
            >
              {candidates.map((r) => {
                const reservedSuper = r === "SUPER_ADMIN" && !elevatorIsSuper;
                return (
                  <option key={r} value={r} disabled={reservedSuper}>
                    {platformRoleLabel(r)}{reservedSuper ? " (reserved)" : ""}
                  </option>
                );
              })}
            </select>
          </Field>
          <Field label="Duration (hours)">
            <input
              type="number"
              name="hours"
              defaultValue={4}
              min={1}
              max={720}
              required
              className="ts-focus w-full rounded-md border px-2 py-1.5"
              style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)", color: "var(--text-default)" }}
            />
          </Field>
          <Field label="Reason">
            <textarea
              name="reason"
              required
              rows={2}
              minLength={8}
              maxLength={500}
              placeholder="Incident #1234 / vacation cover for Sam / etc."
              className="ts-focus w-full resize-none rounded-md border px-2 py-1.5"
              style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)", color: "var(--text-default)" }}
            />
          </Field>
          <button
            type="submit"
            className="ts-focus w-full rounded-md px-3 py-1.5 text-[12px] font-medium"
            style={{ background: "var(--accent-primary)", color: "var(--accent-on-primary)" }}
          >
            Grant elevation
          </button>
        </div>
      </form>
    </details>
  );
}

function RemoveInline({ userId, email }: { userId: string; email: string }) {
  return (
    <details className="group">
      <summary
        className="ts-focus cursor-pointer list-none rounded-md border px-2.5 py-1.5 text-[12px] font-medium"
        style={{
          borderColor: "var(--border-subtle)",
          color: "var(--danger-fg)",
          background: "var(--surface-1)",
        }}
      >
        Remove
      </summary>
      <form
        action={removePlatformStaff.bind(null, userId)}
        className="absolute z-10 mt-2 w-[260px] rounded-lg border p-3 shadow-lg"
        style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)" }}
      >
        <div className="space-y-2 text-[12px]">
          <p style={{ color: "var(--text-default)" }}>
            Strip platform access from <strong>{email}</strong>? Active
            elevations will also be revoked.
          </p>
          <Field label="Type 'remove' to confirm">
            <input
              type="text"
              name="confirm"
              required
              autoComplete="off"
              className="ts-focus w-full rounded-md border px-2 py-1.5"
              style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)", color: "var(--text-default)" }}
            />
          </Field>
          <button
            type="submit"
            className="ts-focus w-full rounded-md px-3 py-1.5 text-[12px] font-medium"
            style={{ background: "var(--danger-fg)", color: "var(--surface-1)" }}
          >
            Remove staff role
          </button>
        </div>
      </form>
    </details>
  );
}

/* ────────────────────────────────────────────────────────────── */

function RecentElevationHistory({
  rows,
}: {
  rows: {
    id: string;
    elevatedTo: PlatformRole;
    originalRole: PlatformRole;
    reason: string;
    createdAt: Date;
    expiresAt: Date;
    revokedAt: Date | null;
    user: { email: string };
    grantedBy: { email: string };
  }[];
}) {
  return (
    <section className="rounded-lg border" style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)" }}>
      <div className="border-b px-4 py-3" style={{ borderColor: "var(--border-subtle)" }}>
        <h2 className="text-[14px] font-semibold" style={{ color: "var(--text-default)" }}>
          Recent elevation history
        </h2>
        <p className="text-[12px]" style={{ color: "var(--text-muted)" }}>
          Last {rows.length} expired or revoked elevations. Full history in
          the audit log.
        </p>
      </div>
      <ul className="divide-y" style={{ borderColor: "var(--border-subtle)" }}>
        {rows.map((r) => (
          <li key={r.id} className="px-4 py-2 text-[12px]" style={{ color: "var(--text-muted)" }}>
            <span style={{ color: "var(--text-default)" }}>{r.user.email}</span>
            {" was elevated to "}
            <RoleChip role={r.elevatedTo} small />
            {" by "}
            {r.grantedBy.email}
            {" — "}
            {r.revokedAt
              ? <>revoked {formatRelative(r.revokedAt)}</>
              : <>expired {formatRelative(r.expiresAt)}</>}
          </li>
        ))}
      </ul>
    </section>
  );
}

/* ────────────────────────────────────────────────────────────── */

function RolePermissionReference() {
  return (
    <section className="rounded-lg border" style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)" }}>
      <div className="border-b px-4 py-3" style={{ borderColor: "var(--border-subtle)" }}>
        <h2 className="text-[14px] font-semibold" style={{ color: "var(--text-default)" }}>
          Role reference
        </h2>
        <p className="text-[12px]" style={{ color: "var(--text-muted)" }}>
          What each role grants. Source of truth: <code>src/lib/rbac.ts</code>.
        </p>
      </div>
      <div className="grid grid-cols-1 gap-3 p-4 md:grid-cols-2 lg:grid-cols-3">
        {ALL_ROLES.map((r) => {
          const perms = PLATFORM_ROLE_PERMISSIONS[r];
          const summary = summarizePermissions(perms);
          return (
            <div
              key={r}
              className="rounded-md border p-3 text-[12px]"
              style={{ background: "var(--surface-2)", borderColor: "var(--border-subtle)" }}
            >
              <div className="flex items-center justify-between">
                <RoleChip role={r} />
                <span className="text-[11px]" style={{ color: "var(--text-muted)" }}>
                  {perms.length} perms
                </span>
              </div>
              <ul className="mt-2 space-y-0.5" style={{ color: "var(--text-default)" }}>
                {summary.map((line) => (
                  <li key={line}>· {line}</li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function summarizePermissions(perms: PlatformPermission[]): string[] {
  // Group by domain prefix for legibility.
  const byDomain = new Map<string, string[]>();
  for (const p of perms) {
    const [domain, action] = p.split(".") as [string, string];
    const arr = byDomain.get(domain) ?? [];
    arr.push(action);
    byDomain.set(domain, arr);
  }
  // Render at most 6 lines so the cards stay scannable.
  const out: string[] = [];
  for (const [domain, actions] of byDomain) {
    out.push(`${domain}: ${actions.join(", ")}`);
    if (out.length >= 6) {
      out[out.length - 1] += " …";
      break;
    }
  }
  return out;
}

/* ────────────────────────────────────────────────────────────── */

function RoleChip({
  role,
  muted = false,
  small = false,
}: {
  role: PlatformRole;
  muted?: boolean;
  small?: boolean;
}) {
  const tone = roleTone(role);
  const palette = muted
    ? { bg: "var(--surface-2)", fg: "var(--text-muted)", border: "var(--border-subtle)" }
    : tone === "root"
    ? { bg: "var(--accent-surface)", fg: "var(--accent-primary)", border: "var(--accent-primary)" }
    : tone === "high"
    ? { bg: "var(--accent-surface)", fg: "var(--accent-primary)", border: "var(--border-subtle)" }
    : tone === "mid"
    ? { bg: "var(--surface-2)",     fg: "var(--text-default)",   border: "var(--border-subtle)" }
    :   { bg: "var(--surface-2)",     fg: "var(--text-muted)",     border: "var(--border-subtle)" };
  return (
    <span
      className={`inline-flex items-center rounded font-medium ${small ? "px-1 py-0 text-[10px]" : "px-1.5 py-0.5 text-[11px]"}`}
      style={{
        background: palette.bg,
        color: palette.fg,
        border: `1px solid ${palette.border}`,
      }}
    >
      {platformRoleLabel(role)}
    </span>
  );
}

function roleTone(role: PlatformRole): "root" | "high" | "mid" | "low" {
  if (role === "SUPER_ADMIN") return "root";
  if (role === "ADMIN" || role === "SITE_MANAGER") return "high";
  if (role === "READ_ONLY_VIEWER" || role === "ANALYST" || role === "SUPPORT_AGENT") return "low";
  return "mid";
}

function RoleSelect({
  name,
  defaultValue,
  disabled,
}: {
  name: string;
  defaultValue?: PlatformRole;
  disabled?: boolean;
}) {
  return (
    <select
      name={name}
      defaultValue={defaultValue}
      disabled={disabled}
      className="ts-focus rounded-md border px-2 py-1.5 text-[13px]"
      style={{
        background: "var(--surface-1)",
        borderColor: "var(--border-subtle)",
        color: "var(--text-default)",
      }}
    >
      {ALL_ROLES.map((r) => (
        <option key={r} value={r}>
          {platformRoleLabel(r)}
        </option>
      ))}
    </select>
  );
}

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="block text-[11px] font-medium uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>
        {label}{required ? " *" : ""}
      </span>
      <span className="mt-1 block">{children}</span>
    </label>
  );
}

/* ────────────────────────────────────────────────────────────── */

function deriveInitials(source: string): string {
  const trimmed = source.trim();
  if (!trimmed) return "?";
  const stem = trimmed.includes("@") ? trimmed.split("@")[0]! : trimmed;
  const parts = stem.split(/[\s._-]+/).filter(Boolean);
  if (parts.length === 0) return stem.slice(0, 2).toUpperCase();
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return (parts[0]![0]! + parts[parts.length - 1]![0]!).toUpperCase();
}

function formatRelative(d: Date): string {
  const ms = Date.now() - d.getTime();
  const abs = Math.abs(ms);
  const future = ms < 0;
  const min = 60_000, hour = 60 * min, day = 24 * hour;
  if (abs < min)        return future ? "in a moment" : "just now";
  if (abs < hour)       return `${future ? "in " : ""}${Math.floor(abs / min)}m${future ? "" : " ago"}`;
  if (abs < day)        return `${future ? "in " : ""}${Math.floor(abs / hour)}h${future ? "" : " ago"}`;
  if (abs < 30 * day)   return `${future ? "in " : ""}${Math.floor(abs / day)}d${future ? "" : " ago"}`;
  return d.toLocaleDateString();
}
