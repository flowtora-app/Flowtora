import Link from "next/link";
import { db } from "@/lib/db";
import { requirePlatformStaff } from "@/lib/platform";
import {
  permissionCatalog,
  type PlatformPermission,
} from "@/lib/rbac";
import {
  createCustomRole,
  updateCustomRole,
  archiveCustomRole,
} from "@/app/actions/platform-custom-roles";
import { Icon } from "@/components/shell/icons";
import type { CustomPlatformRoleStatus } from "@prisma/client";

// /platform/staff/roles — admin-defined custom platform roles.
//
// Layout:
//   1. Header with link back to /platform/staff
//   2. KPI strip — Active / Drafts / Archived / Members assigned
//   3. Mint card with name + slug + status + permission grid
//   4. Existing roles list — each row expands to an edit form
//
// Permission grid is grouped by domain (tenant.*, billing.*, etc.) so
// 50+ checkboxes stay scannable. We render the same grid structure
// for both create + edit to keep the cognitive load constant.

export const dynamic = "force-dynamic";

type SP = { ok?: string; error?: string; id?: string };

const MESSAGES: Record<string, string> = {
  created:           "Custom role minted. Promote it to ACTIVE before attaching it to staff.",
  updated:           "Role updated. Members will reauth on the next request and pick up the new permissions.",
  archived:          "Role archived. Members were detached and fall back to their baseline role.",
  already_archived:  "Already archived.",
};

export default async function CustomRolesPage({
  searchParams,
}: {
  searchParams: Promise<SP>;
}) {
  const ctx = await requirePlatformStaff();
  const sp = await searchParams;
  const canWrite = ctx.can("staff.assign_role");

  const [roles, kpiActive, kpiDraft, kpiArchived, kpiMembers] = await Promise.all([
    db.customPlatformRole.findMany({
      orderBy: [{ status: "asc" }, { name: "asc" }],
      include: {
        _count: { select: { members: true } },
        createdBy: { select: { email: true, name: true } },
      },
    }),
    db.customPlatformRole.count({ where: { status: "ACTIVE" } }),
    db.customPlatformRole.count({ where: { status: "DRAFT" } }),
    db.customPlatformRole.count({ where: { status: "ARCHIVED" } }),
    db.user.count({ where: { customPlatformRoleId: { not: null } } }),
  ]);

  const catalog = permissionCatalog();

  return (
    <div className="space-y-6">
      <Header />
      {sp.ok    ? <Toast tone="ok"    msg={MESSAGES[sp.ok] ?? "Done"} /> : null}
      {sp.error ? <Toast tone="error" msg={sp.error} /> : null}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Kpi label="Active"    value={String(kpiActive)} />
        <Kpi label="Drafts"    value={String(kpiDraft)} />
        <Kpi label="Archived"  value={String(kpiArchived)} />
        <Kpi label="Assigned"  value={String(kpiMembers)} hint="Staff currently on a custom role" />
      </div>

      <MintForm catalog={catalog} disabled={!canWrite} />

      <RolesList roles={roles} catalog={catalog} canWrite={canWrite} highlightId={sp.id ?? null} />
    </div>
  );
}

/* ────────────────────────────────────────────────────────────── */

function Header() {
  return (
    <div className="flex items-end justify-between gap-4">
      <div>
        <Link href="/platform/staff" className="text-[12px] underline" style={{ color: "var(--text-muted)" }}>
          ← Staff
        </Link>
        <div className="mt-1 flex items-center gap-2 text-[12px] font-medium uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>
          <Icon.Shield size={14} />
          <span>Phase 1 follow-up · Custom roles</span>
        </div>
        <h1 className="mt-1 text-[26px] font-semibold leading-tight" style={{ color: "var(--text-default)" }}>
          Custom platform roles
        </h1>
        <p className="mt-1 text-[13px]" style={{ color: "var(--text-muted)" }}>
          Bundle permissions for the rare cases the 12 baseline roles dont fit.
          Custom roles override the baseline when attached to a staff user.
        </p>
      </div>
      <Link
        href="/platform/audit?action=platform.custom_role_"
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

function Kpi({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-lg border px-4 py-3" style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)" }}>
      <div className="text-[11px] font-medium uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>{label}</div>
      <div className="mt-1 text-[22px] font-semibold leading-none" style={{ color: "var(--text-default)" }}>{value}</div>
      {hint && <div className="mt-1 text-[10px]" style={{ color: "var(--text-muted)" }}>{hint}</div>}
    </div>
  );
}

/* ────────────────────────────────────────────────────────────── */

function MintForm({
  catalog,
  disabled,
}: {
  catalog: { domain: string; perms: PlatformPermission[] }[];
  disabled: boolean;
}) {
  return (
    <section className="rounded-lg border" style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)" }}>
      <div className="border-b px-4 py-3" style={{ borderColor: "var(--border-subtle)" }}>
        <h2 className="text-[14px] font-semibold" style={{ color: "var(--text-default)" }}>
          Mint custom role
        </h2>
        <p className="text-[12px]" style={{ color: "var(--text-muted)" }}>
          New roles default to <strong>DRAFT</strong> so you can review the
          permission grid before users pick it up. Promote to ACTIVE on
          the row when ready.
        </p>
      </div>
      <form action={createCustomRole} className="space-y-4 p-4">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <Field label="Name" required>
            <input
              type="text" name="name" required disabled={disabled}
              maxLength={60} placeholder="Tier 2 Support"
              className="ts-focus w-full rounded-md border px-3 py-2 text-[13px]"
              style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)", color: "var(--text-default)" }}
            />
          </Field>
          <Field label="Slug" required hint="lowercase, used in audit metadata">
            <input
              type="text" name="key" required disabled={disabled}
              pattern="[a-z0-9][a-z0-9_\-]{2,40}"
              placeholder="tier_2_support"
              className="ts-focus w-full rounded-md border px-3 py-2 text-[13px] font-mono"
              style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)", color: "var(--text-default)" }}
            />
          </Field>
          <Field label="Status" required>
            <select
              name="status" required defaultValue="DRAFT" disabled={disabled}
              className="ts-focus w-full rounded-md border px-3 py-2 text-[13px]"
              style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)", color: "var(--text-default)" }}
            >
              <option value="DRAFT">DRAFT (no enforcement)</option>
              <option value="ACTIVE">ACTIVE (enforced on assignment)</option>
            </select>
          </Field>
        </div>
        <Field label="Description" hint="What is this role for? Internal note.">
          <input
            type="text" name="description" disabled={disabled}
            maxLength={500} placeholder="Front-line support plus billing read access"
            className="ts-focus w-full rounded-md border px-3 py-2 text-[13px]"
            style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)", color: "var(--text-default)" }}
          />
        </Field>

        <PermissionGrid catalog={catalog} selected={[]} disabled={disabled} />

        <div className="flex justify-end">
          <button
            type="submit" disabled={disabled}
            className="ts-focus rounded-md px-4 py-2 text-[13px] font-medium disabled:cursor-not-allowed disabled:opacity-50"
            style={{ background: "var(--accent-primary)", color: "var(--accent-on-primary)" }}
          >
            Mint role
          </button>
        </div>
      </form>
    </section>
  );
}

/* ────────────────────────────────────────────────────────────── */

type RoleRow = {
  id: string;
  name: string;
  key: string;
  description: string | null;
  permissions: string[];
  status: CustomPlatformRoleStatus;
  createdAt: Date;
  updatedAt: Date;
  _count: { members: number };
  createdBy: { email: string; name: string | null };
};

function RolesList({
  roles,
  catalog,
  canWrite,
  highlightId,
}: {
  roles: RoleRow[];
  catalog: { domain: string; perms: PlatformPermission[] }[];
  canWrite: boolean;
  highlightId: string | null;
}) {
  return (
    <section className="rounded-lg border" style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)" }}>
      <div className="border-b px-4 py-3" style={{ borderColor: "var(--border-subtle)" }}>
        <h2 className="text-[14px] font-semibold" style={{ color: "var(--text-default)" }}>
          Roles ({roles.length})
        </h2>
      </div>
      {roles.length === 0 ? (
        <div className="px-4 py-8 text-center text-[13px]" style={{ color: "var(--text-muted)" }}>
          No custom roles yet. Mint your first one above.
        </div>
      ) : (
        <div className="divide-y" style={{ borderColor: "var(--border-subtle)" }}>
          {roles.map((r) => (
            <RoleItem key={r.id} role={r} catalog={catalog} canWrite={canWrite} expanded={r.id === highlightId} />
          ))}
        </div>
      )}
    </section>
  );
}

function RoleItem({
  role,
  catalog,
  canWrite,
  expanded,
}: {
  role: RoleRow;
  catalog: { domain: string; perms: PlatformPermission[] }[];
  canWrite: boolean;
  expanded: boolean;
}) {
  const isArchived = role.status === "ARCHIVED";
  return (
    <details open={expanded} className="group">
      <summary className="ts-focus grid cursor-pointer list-none grid-cols-1 items-start gap-3 px-4 py-3 md:grid-cols-[2fr_1fr_1fr_auto]">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-[13px] font-semibold" style={{ color: "var(--text-default)" }}>{role.name}</span>
            <code
              className="rounded px-1.5 py-0.5 text-[10px]"
              style={{ background: "var(--surface-2)", color: "var(--text-muted)", border: "1px solid var(--border-subtle)" }}
            >
              {role.key}
            </code>
            <StatusChip status={role.status} />
          </div>
          {role.description && (
            <div className="mt-1 truncate text-[12px]" style={{ color: "var(--text-muted)" }}>{role.description}</div>
          )}
          <div className="mt-1 text-[11px]" style={{ color: "var(--text-muted)" }}>
            By {role.createdBy.name || role.createdBy.email} · {role.createdAt.toLocaleDateString()}
          </div>
        </div>
        <div className="text-[12px]" style={{ color: "var(--text-muted)" }}>
          <div><span style={{ color: "var(--text-default)" }}>Permissions</span> · {role.permissions.length}</div>
          <div><span style={{ color: "var(--text-default)" }}>Members</span> · {role._count.members}</div>
        </div>
        <div className="text-[11px]" style={{ color: "var(--text-muted)" }}>
          Updated {role.updatedAt.toLocaleDateString()}
        </div>
        <div className="text-[11px]" style={{ color: "var(--accent-primary)" }}>
          {isArchived ? "View only" : "Click to edit"} ↓
        </div>
      </summary>
      {!isArchived && (
        <div className="border-t px-4 py-4" style={{ borderColor: "var(--border-subtle)", background: "var(--surface-2)" }}>
          <form action={updateCustomRole.bind(null, role.id)} className="space-y-4">
            <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
              <Field label="Name" required>
                <input
                  type="text" name="name" required disabled={!canWrite}
                  defaultValue={role.name} maxLength={60}
                  className="ts-focus w-full rounded-md border px-3 py-2 text-[13px]"
                  style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)", color: "var(--text-default)" }}
                />
              </Field>
              <Field label="Slug" hint="Read-only — cannot change after mint">
                <input
                  type="text" disabled value={role.key}
                  className="ts-focus w-full rounded-md border px-3 py-2 text-[13px] font-mono"
                  style={{ background: "var(--surface-2)", borderColor: "var(--border-subtle)", color: "var(--text-muted)" }}
                />
              </Field>
              <Field label="Status" required>
                <select
                  name="status" required defaultValue={role.status} disabled={!canWrite}
                  className="ts-focus w-full rounded-md border px-3 py-2 text-[13px]"
                  style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)", color: "var(--text-default)" }}
                >
                  <option value="DRAFT">DRAFT</option>
                  <option value="ACTIVE">ACTIVE</option>
                </select>
              </Field>
            </div>
            <Field label="Description">
              <input
                type="text" name="description" disabled={!canWrite}
                defaultValue={role.description ?? ""} maxLength={500}
                className="ts-focus w-full rounded-md border px-3 py-2 text-[13px]"
                style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)", color: "var(--text-default)" }}
              />
            </Field>

            <PermissionGrid catalog={catalog} selected={role.permissions} disabled={!canWrite} />

            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="text-[11px]" style={{ color: "var(--text-muted)" }}>
                Saving bumps sessionVersion for {role._count.members}{" "}
                {role._count.members === 1 ? "member" : "members"} so the
                change applies on their next request.
              </div>
              <button
                type="submit" disabled={!canWrite}
                className="ts-focus rounded-md px-4 py-2 text-[13px] font-medium disabled:cursor-not-allowed disabled:opacity-50"
                style={{ background: "var(--accent-primary)", color: "var(--accent-on-primary)" }}
              >
                Save changes
              </button>
            </div>
          </form>

          {/* Archive — separate form so the destructive action sits in
              its own visual container. */}
          <form action={archiveCustomRole.bind(null, role.id)} className="mt-4 flex items-center justify-between rounded-md border p-3" style={{ borderColor: "var(--danger-fg)", background: "var(--surface-1)" }}>
            <div className="text-[12px]" style={{ color: "var(--danger-fg)" }}>
              Archive detaches all {role._count.members}{" "}
              {role._count.members === 1 ? "member" : "members"} so they
              fall back to the baseline role. Cannot be undone.
            </div>
            <button
              type="submit" disabled={!canWrite}
              className="ts-focus rounded-md border px-2.5 py-1.5 text-[12px] font-medium disabled:cursor-not-allowed disabled:opacity-50"
              style={{ borderColor: "var(--danger-fg)", color: "var(--danger-fg)", background: "var(--surface-1)" }}
            >
              Archive role
            </button>
          </form>
        </div>
      )}
    </details>
  );
}

function StatusChip({ status }: { status: CustomPlatformRoleStatus }) {
  const palette =
    status === "ACTIVE"   ? { bg: "var(--accent-surface)", fg: "var(--accent-primary)", label: "ACTIVE" } :
    status === "DRAFT"    ? { bg: "var(--warning-surface)", fg: "var(--warning-fg)",     label: "DRAFT" } :
                            { bg: "var(--surface-2)",      fg: "var(--text-muted)",     label: "ARCHIVED" };
  return (
    <span
      className="rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide"
      style={{ background: palette.bg, color: palette.fg, border: `1px solid ${palette.fg}` }}
    >
      {palette.label}
    </span>
  );
}

/* ────────────────────────────────────────────────────────────── */

function PermissionGrid({
  catalog,
  selected,
  disabled,
}: {
  catalog: { domain: string; perms: PlatformPermission[] }[];
  selected: string[];
  disabled: boolean;
}) {
  const selectedSet = new Set(selected);
  return (
    <div>
      <div className="flex items-center justify-between">
        <div className="text-[11px] font-medium uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>
          Permissions
        </div>
        <div className="text-[11px]" style={{ color: "var(--text-muted)" }}>
          {selected.length} selected · grouped by domain
        </div>
      </div>
      <div className="mt-2 grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
        {catalog.map(({ domain, perms }) => (
          <fieldset
            key={domain}
            className="rounded-md border p-3"
            style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)" }}
          >
            <legend className="px-1 text-[11px] font-semibold uppercase tracking-wide" style={{ color: "var(--text-default)" }}>
              {domain}
            </legend>
            <div className="space-y-1">
              {perms.map((p) => (
                <label key={p} className="flex items-start gap-2 text-[12px]" style={{ color: "var(--text-default)" }}>
                  <input
                    type="checkbox"
                    name="permission"
                    value={p}
                    defaultChecked={selectedSet.has(p)}
                    disabled={disabled}
                    className="mt-0.5"
                  />
                  <span className="font-mono text-[11px]">{p}</span>
                </label>
              ))}
            </div>
          </fieldset>
        ))}
      </div>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────── */

function Field({
  label,
  required,
  hint,
  children,
}: {
  label: string;
  required?: boolean;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="block text-[11px] font-medium uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>
        {label}{required ? " *" : ""}
      </span>
      {hint && <span className="block text-[10px]" style={{ color: "var(--text-muted)" }}>{hint}</span>}
      <span className="mt-1 block">{children}</span>
    </label>
  );
}
