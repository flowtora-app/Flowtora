import type { PlatformRole, TenantRole } from "@prisma/client";

// Permission keys are flat strings — easy to check, easy to extend.
// Convention: `<domain>:<action>` (e.g. "customers:create").
export type Permission =
  // Tenant settings & staff
  | "tenant:manage"
  | "tenant:billing"
  | "staff:manage"
  | "staff:view"
  // CRM
  | "customers:view"
  | "customers:create"
  | "customers:edit"
  | "customers:delete"
  // Catalog
  | "products:view"
  | "products:manage"
  // Quotes / orders / invoices
  | "quotes:view"
  | "quotes:manage"
  | "quotes:approve_exceptions" // override discount / large-job approval gates
  | "orders:view"
  | "orders:manage"
  | "invoices:view"
  | "invoices:manage"
  | "payments:record"
  // Phase 14 — financial operations. Splitting by action gives owners a
  // lever to let bookkeepers do everyday AR work while reserving write-
  // offs and large refunds for managers.
  | "refunds:issue"
  | "credits:issue"
  | "writeoffs:record"
  | "expenses:view"
  | "expenses:manage"
  | "vendors:view"
  | "vendors:manage"
  // Production / install
  | "production:view"
  | "production:manage"
  | "installs:view"
  | "installs:manage"
  // Files / proofs
  | "proofs:view"
  | "proofs:manage"
  | "files:upload"
  // Reporting
  | "reports:view"
  | "reports:financial"
  // Phase 13 — shop-configured templates (checklists, etc.)
  | "templates:manage"
  // Phase 15 — multi-location / branch management.
  | "locations:view"         // can see the location picker + per-branch filters
  | "locations:manage"       // can CRUD locations + assign staff to them
  | "locations:cross_view";  // can view data across all locations (regional mgr)

const ALL: Permission[] = [
  "tenant:manage", "tenant:billing", "staff:manage", "staff:view",
  "customers:view", "customers:create", "customers:edit", "customers:delete",
  "products:view", "products:manage",
  "quotes:view", "quotes:manage", "quotes:approve_exceptions",
  "orders:view", "orders:manage",
  "invoices:view", "invoices:manage", "payments:record",
  "refunds:issue", "credits:issue", "writeoffs:record",
  "expenses:view", "expenses:manage", "vendors:view", "vendors:manage",
  "production:view", "production:manage",
  "installs:view", "installs:manage",
  "proofs:view", "proofs:manage", "files:upload",
  "reports:view", "reports:financial",
  "templates:manage",
  "locations:view", "locations:manage", "locations:cross_view",
];

export const TENANT_ROLE_PERMISSIONS: Record<TenantRole, Permission[]> = {
  OWNER: ALL,
  ADMIN: ALL.filter((p) => p !== "tenant:billing"),
  SALES_REP: [
    "customers:view", "customers:create", "customers:edit",
    "products:view",
    "quotes:view", "quotes:manage",
    "orders:view",
    "invoices:view",
    "proofs:view",
    "files:upload",
    "reports:view",
    "locations:view",
  ],
  CSR: [
    "customers:view", "customers:create", "customers:edit",
    "products:view",
    "quotes:view",
    "orders:view", "orders:manage",
    "proofs:view",
    "files:upload",
    "locations:view",
  ],
  DESIGNER: [
    "customers:view",
    "orders:view",
    "proofs:view", "proofs:manage",
    "files:upload",
    "locations:view",
  ],
  PRODUCTION_MANAGER: [
    "customers:view",
    "orders:view", "orders:manage",
    "production:view", "production:manage",
    "proofs:view",
    "files:upload",
    "reports:view",
    // Production managers log job-linked expenses (materials, subcontractors)
    // and need to read vendor records for context.
    "expenses:view", "expenses:manage", "vendors:view",
    // Production managers typically oversee multiple branches' workload,
    // so they get cross-location visibility by default.
    "locations:view", "locations:cross_view",
  ],
  INSTALLER: [
    "customers:view",
    "orders:view",
    "installs:view", "installs:manage",
    "files:upload",
    "locations:view",
  ],
  ACCOUNTING: [
    "customers:view",
    "invoices:view", "invoices:manage", "payments:record",
    // Accounting handles day-to-day financial ops end to end.
    "refunds:issue", "credits:issue", "writeoffs:record",
    "expenses:view", "expenses:manage",
    "vendors:view", "vendors:manage",
    "reports:view", "reports:financial",
    // Bookkeepers roll up revenue across all branches.
    "locations:view", "locations:cross_view",
  ],
  EMPLOYEE: [
    "customers:view",
    "orders:view",
    "files:upload",
    "locations:view",
  ],
  // Reserved enum value — never actually assigned to a Membership row.
  // Customer portal access is token-based via `PortalToken`, not role-based.
  // The empty array is intentional: even if a row ever did carry this role,
  // it would grant no staff permissions. Scheduled for removal in a future
  // phase (see docs/transformation-plan.md §Phase 1 risks/follow-ups).
  CUSTOMER_PORTAL: [],
};

export function hasPermission(role: TenantRole, perm: Permission): boolean {
  return TENANT_ROLE_PERMISSIONS[role]?.includes(perm) ?? false;
}

// ─────────────────────────────────────────────────────────────────────
// Platform-side RBAC (Phase 1)
//
// Tenant-side permissions above govern what a Membership can do inside
// a single tenant. The platform side governs what a Flowtora staff
// member can do across the SaaS itself — managing tenants, billing,
// support, infrastructure. Same flat-string convention so the call
// sites stay grep-friendly.
// ─────────────────────────────────────────────────────────────────────

export type PlatformPermission =
  // Tenant management
  | "tenant.read"
  | "tenant.suspend"          // suspend / unsuspend a tenant
  | "tenant.archive"          // archive (soft-delete with reason code)
  | "tenant.delete"           // hard delete — gated to root only
  | "tenant.impersonate"      // sign in as a tenant member
  | "tenant.tag"              // add/remove admin tags
  | "tenant.transfer"         // change ownership / merge

  // Billing
  | "billing.read"
  | "billing.invoice"         // create manual invoices, edit drafts
  | "billing.refund"          // issue refunds / credits
  | "billing.plan_change"     // change a tenant's plan, comp it
  | "billing.coupon"          // mint coupons / promo codes

  // Staff & RBAC (this surface)
  | "staff.read"
  | "staff.assign_role"       // change a staff user's platformRole
  | "staff.elevate"           // grant temporary role elevation
  | "staff.revoke_elevation"  // revoke an active elevation
  | "staff.invite"            // invite a new platform staff member

  // Platform users (cross-tenant — Phase 4 surface)
  | "users.read"
  | "users.ban"               // ban an end-user / IP / domain
  | "users.merge"             // cross-tenant account merge

  // Support
  | "support.read"
  | "support.respond"         // reply on tickets / tenant messages
  | "support.macro_manage"    // edit canned replies / KB
  | "support.feedback_triage"

  // Reliability
  | "health.read"
  | "audit.read"
  | "compliance.read"
  | "compliance.manage"       // run exports, sign attestations
  | "feature_flag.read"
  | "feature_flag.write"

  // Operations
  | "announcement.read"
  | "announcement.write"
  | "readiness.manage"
  | "leads.read"
  | "leads.manage"
  | "plans.manage"
  | "features.manage"

  // Analytics / BI
  | "analytics.read"
  | "analytics.export"
  | "revenue.read"
  | "usage.read"

  // System / DevOps
  | "system.read_settings"
  | "system.write_settings"
  | "system.maintenance_mode"
  | "system.feature_freeze"
  | "notifications.read"
  | "notifications.manage";   // edit transactional templates

const PLATFORM_ALL: PlatformPermission[] = [
  "tenant.read", "tenant.suspend", "tenant.archive", "tenant.delete",
  "tenant.impersonate", "tenant.tag", "tenant.transfer",
  "billing.read", "billing.invoice", "billing.refund", "billing.plan_change", "billing.coupon",
  "staff.read", "staff.assign_role", "staff.elevate", "staff.revoke_elevation", "staff.invite",
  "users.read", "users.ban", "users.merge",
  "support.read", "support.respond", "support.macro_manage", "support.feedback_triage",
  "health.read", "audit.read", "compliance.read", "compliance.manage",
  "feature_flag.read", "feature_flag.write",
  "announcement.read", "announcement.write", "readiness.manage",
  "leads.read", "leads.manage", "plans.manage", "features.manage",
  "analytics.read", "analytics.export", "revenue.read", "usage.read",
  "system.read_settings", "system.write_settings",
  "system.maintenance_mode", "system.feature_freeze",
  "notifications.read", "notifications.manage",
];

// Canonical "everyone with any platform role can read these" baseline.
// Keeps the per-role lists below short — most staff need to *see* the
// product even if they can't change much.
const PLATFORM_BASELINE_READ: PlatformPermission[] = [
  "tenant.read", "billing.read", "staff.read", "users.read",
  "support.read", "health.read", "audit.read", "compliance.read",
  "feature_flag.read", "announcement.read", "leads.read",
  "analytics.read", "revenue.read", "usage.read",
  "system.read_settings", "notifications.read",
];

function dedup(perms: PlatformPermission[]): PlatformPermission[] {
  return Array.from(new Set(perms));
}

export const PLATFORM_ROLE_PERMISSIONS: Record<PlatformRole, PlatformPermission[]> = {
  // ── Legacy roles (preserved for backward compat) ───────────────────
  SUPER_ADMIN: PLATFORM_ALL,
  SITE_MANAGER: dedup([
    ...PLATFORM_BASELINE_READ,
    "tenant.suspend", "tenant.archive", "tenant.impersonate", "tenant.tag", "tenant.transfer",
    "billing.invoice", "billing.refund", "billing.plan_change", "billing.coupon",
    "staff.assign_role", "staff.elevate", "staff.revoke_elevation", "staff.invite",
    "users.ban",
    "support.respond", "support.macro_manage", "support.feedback_triage",
    "compliance.manage", "feature_flag.write",
    "announcement.write", "readiness.manage",
    "leads.manage", "plans.manage", "features.manage",
    "analytics.export",
    "system.write_settings", "system.maintenance_mode", "system.feature_freeze",
    "notifications.manage",
  ]),
  SUPPORT_AGENT: dedup([
    "tenant.read", "billing.read", "users.read",
    "support.read", "support.respond",
    "audit.read", "compliance.read", "announcement.read",
    "leads.read", "notifications.read",
  ]),

  // ── Phase 1 additions ──────────────────────────────────────────────
  // Full operational access; cannot delete tenants or flip global
  // maintenance mode (those stay SUPER_ADMIN-only).
  ADMIN: dedup([
    ...PLATFORM_ALL.filter((p) =>
      p !== "tenant.delete" && p !== "system.maintenance_mode" && p !== "system.feature_freeze",
    ),
  ]),
  // Day-to-day operational lead. No write access to billing or staff
  // rosters — those go through Admin / Billing Manager.
  MANAGER: dedup([
    ...PLATFORM_BASELINE_READ,
    "tenant.suspend", "tenant.archive", "tenant.impersonate", "tenant.tag",
    "support.respond", "support.macro_manage", "support.feedback_triage",
    "announcement.write", "readiness.manage",
    "leads.manage",
    "analytics.export",
    "notifications.manage",
  ]),
  // Owns the support queue; can manage macros & triage feedback but
  // can't change plans or staff.
  SUPPORT_LEAD: dedup([
    "tenant.read", "billing.read", "users.read",
    "support.read", "support.respond", "support.macro_manage", "support.feedback_triage",
    "audit.read", "announcement.read", "announcement.write",
    "notifications.read",
  ]),
  // Billing team. Can issue refunds, mint coupons, change plans —
  // everything money. No tenant suspension, no staff edits.
  BILLING_MANAGER: dedup([
    "tenant.read", "users.read",
    "billing.read", "billing.invoice", "billing.refund",
    "billing.plan_change", "billing.coupon",
    "audit.read", "compliance.read",
    "revenue.read", "usage.read", "analytics.read", "analytics.export",
    "plans.manage",
    "notifications.read",
  ]),
  // Engineering — owns flags, can read every system surface, can
  // modify settings (but not put the whole platform into maintenance).
  DEVELOPER: dedup([
    ...PLATFORM_BASELINE_READ,
    "feature_flag.write",
    "system.write_settings",
    "tenant.impersonate",   // for repro
  ]),
  // Marketing — leads, announcements, public plan/feature copy.
  MARKETING_MANAGER: dedup([
    "tenant.read", "users.read",
    "leads.read", "leads.manage",
    "announcement.read", "announcement.write",
    "features.manage", "plans.manage",
    "analytics.read", "analytics.export",
    "notifications.read", "notifications.manage",
  ]),
  // Internal CMS — announcements + transactional templates, nothing else.
  CONTENT_MANAGER: dedup([
    "tenant.read",
    "announcement.read", "announcement.write",
    "features.manage",
    "notifications.read", "notifications.manage",
  ]),
  // BI / data team — read everything that produces a number, run
  // exports. No write access anywhere.
  ANALYST: dedup([
    "tenant.read", "billing.read", "users.read",
    "audit.read", "compliance.read", "feature_flag.read",
    "analytics.read", "analytics.export",
    "revenue.read", "usage.read",
    "leads.read",
  ]),
  // Exec / auditor — read-only across the platform.
  READ_ONLY_VIEWER: PLATFORM_BASELINE_READ,
};

/**
 * Resolve the *effective* platform role for a user, taking active
 * temporary elevations into account. Pass the durable `User.platformRole`
 * plus a list of currently-active (not revoked, not expired) elevation
 * rows. Returns the highest-privilege role.
 *
 * The "highest" comparison uses the index in `PLATFORM_ROLE_RANK` —
 * lower index = more powerful. This avoids hand-coding precedence at
 * every call site.
 */
const PLATFORM_ROLE_RANK: PlatformRole[] = [
  "SUPER_ADMIN",
  "ADMIN",
  "SITE_MANAGER",
  "MANAGER",
  "BILLING_MANAGER",
  "SUPPORT_LEAD",
  "DEVELOPER",
  "MARKETING_MANAGER",
  "CONTENT_MANAGER",
  "SUPPORT_AGENT",
  "ANALYST",
  "READ_ONLY_VIEWER",
];

export function rankPlatformRole(role: PlatformRole): number {
  const idx = PLATFORM_ROLE_RANK.indexOf(role);
  return idx === -1 ? PLATFORM_ROLE_RANK.length : idx;
}

export function effectivePlatformRole(
  baseRole: PlatformRole | null | undefined,
  activeElevations: { elevatedTo: PlatformRole }[],
): PlatformRole | null {
  if (!baseRole) return null;
  let best: PlatformRole = baseRole;
  let bestRank = rankPlatformRole(baseRole);
  for (const e of activeElevations) {
    const r = rankPlatformRole(e.elevatedTo);
    if (r < bestRank) {
      best = e.elevatedTo;
      bestRank = r;
    }
  }
  return best;
}

/**
 * Permission check. Pass either a single role or an effective-role
 * resolution result. Returns `false` for null/undefined (i.e. non-staff)
 * so callers can short-circuit cleanly.
 */
export function platformCan(
  role: PlatformRole | null | undefined,
  perm: PlatformPermission,
): boolean {
  if (!role) return false;
  return PLATFORM_ROLE_PERMISSIONS[role]?.includes(perm) ?? false;
}

export function isPlatformStaff(role: PlatformRole | null | undefined): boolean {
  if (!role) return false;
  // Anyone with a non-null platformRole is staff. The role enum itself
  // is the gate — there are no "former staff" rows that should leak
  // through (deactivated staff have their role nulled out).
  return role in PLATFORM_ROLE_PERMISSIONS;
}

/**
 * Impersonation — a load-bearing capability that we still gate on a
 * dedicated permission so the role table is the single source of
 * truth. Kept as a helper for ergonomic call sites.
 */
export function canImpersonate(role: PlatformRole | null | undefined): boolean {
  return platformCan(role, "tenant.impersonate");
}

export function platformRoleLabel(role: PlatformRole): string {
  switch (role) {
    case "SUPER_ADMIN":       return "Super admin";
    case "SITE_MANAGER":      return "Site manager";
    case "SUPPORT_AGENT":     return "Support agent";
    case "ADMIN":             return "Admin";
    case "MANAGER":           return "Manager";
    case "SUPPORT_LEAD":      return "Support lead";
    case "BILLING_MANAGER":   return "Billing manager";
    case "DEVELOPER":         return "Developer";
    case "MARKETING_MANAGER": return "Marketing manager";
    case "CONTENT_MANAGER":   return "Content manager";
    case "ANALYST":           return "Analyst";
    case "READ_ONLY_VIEWER":  return "Read-only viewer";
  }
}
