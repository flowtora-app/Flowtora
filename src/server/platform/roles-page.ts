// Roles & Permissions data layer — Page 10 of the admin spec.
//
// The page surfaces three distinct role universes:
//   1. Built-in PlatformRole (enum, code-defined permissions in
//      PLATFORM_ROLE_PERMISSIONS).
//   2. Custom platform roles (CustomPlatformRole table — DRAFT /
//      ACTIVE / ARCHIVED).
//   3. Tenant default roles (TenantRole enum) — what tenants get out
//      of the box. Today these don't have a stored permission map;
//      they map to a code-only template surfaced honestly here.
//
// Plus a flat permission catalogue with descriptions and a "which
// roles include it" cross-reference.

import { db } from "@/lib/db";
import {
  PLATFORM_ROLE_PERMISSIONS,
  permissionCatalog,
  platformRoleLabel,
  type PlatformPermission,
} from "@/lib/rbac";
import type {
  CustomPlatformRoleStatus,
  PlatformRole,
  TenantRole,
} from "@prisma/client";

/* ────────────────────────────────────────────────────────── */
/* Permission descriptions                                    */
/* ────────────────────────────────────────────────────────── */

// Spec §Permission Catalog — every key gets a short blurb so the
// catalogue tab is searchable. Kept here (not in rbac.ts) because
// rbac is shared with auth-critical paths and shouldn't carry
// presentation strings.
export const PERMISSION_DESCRIPTIONS: Record<PlatformPermission, string> = {
  // Tenants
  "tenant.read":           "View tenant records and dashboards.",
  "tenant.suspend":        "Suspend or unsuspend a tenant.",
  "tenant.archive":        "Archive (soft-delete) a tenant.",
  "tenant.delete":         "Hard-delete a tenant — root only.",
  "tenant.impersonate":    "Sign in as a tenant member for support.",
  "tenant.tag":            "Add or remove admin-only tags + flags.",
  "tenant.transfer":       "Change ownership or merge tenants.",
  // Billing
  "billing.read":          "Read invoices, refunds, and subscription state.",
  "billing.invoice":       "Create or edit manual invoices.",
  "billing.refund":        "Issue refunds or credit memos.",
  "billing.plan_change":   "Change a tenant's plan or comp it.",
  "billing.coupon":        "Mint or revoke coupons / promo codes.",
  // Staff & RBAC
  "staff.read":            "View the platform staff roster.",
  "staff.assign_role":     "Change a staff user's platform role.",
  "staff.elevate":         "Grant temporary role elevation.",
  "staff.revoke_elevation":"Revoke an active role elevation.",
  "staff.invite":          "Invite a new platform staff member.",
  // Users
  "users.read":            "View end-user directory and profiles.",
  "users.ban":             "Ban an end user, IP, or domain.",
  "users.merge":           "Merge two end-user accounts.",
  // Support
  "support.read":          "Read support tickets and messages.",
  "support.respond":       "Reply on tickets / tenant messages.",
  "support.macro_manage":  "Edit canned replies / macros.",
  "support.feedback_triage": "Triage product feedback submissions.",
  // Reliability
  "health.read":           "Read system-health dashboards.",
  "audit.read":            "Read the platform audit log.",
  "compliance.read":       "Read compliance reports.",
  "compliance.manage":     "Run compliance exports and sign attestations.",
  "feature_flag.read":     "Read feature-flag catalog.",
  "feature_flag.write":    "Edit feature flags.",
  // Operations
  "announcement.read":     "Read public + internal announcements.",
  "announcement.write":    "Author and publish announcements.",
  "readiness.manage":      "Edit launch-readiness checks.",
  "leads.read":            "Read marketing leads.",
  "leads.manage":          "Edit and qualify marketing leads.",
  "plans.manage":          "Edit pricing plans + add-ons.",
  "features.manage":       "Edit feature catalog metadata.",
  "referrals.read":        "View tenant-to-tenant referral program metrics.",
  "referrals.manage":      "Edit referral reward structure and review fraud flags.",
  "affiliates.read":       "View affiliate roster, applications, commissions, and creatives.",
  "affiliates.manage":     "Approve/reject applications, edit tiers, and manage the creative library.",
  "seo.read":              "View keyword rankings, backlinks, broken links, content gaps, and page-speed metrics.",
  "seo.manage":            "Edit SEO settings (robots.txt, sitemap, meta defaults), resolve broken links, and triage content gaps.",
  "integrations.read":     "View the integration catalog, adoption metrics, health, and version history.",
  "integrations.manage":   "Edit catalog entries, manage versions, deprecate integrations, and force-disconnect tenants.",
  "webhooks.read":         "View API keys, webhook endpoints, event catalog, and delivery logs.",
  "webhooks.manage":       "Create/rotate/revoke API keys, configure webhook endpoints, replay deliveries, and edit webhook settings.",
  // Analytics
  "analytics.read":        "Read analytics dashboards.",
  "analytics.export":      "Export analytics datasets.",
  "revenue.read":          "Read revenue / NRR reports.",
  "usage.read":            "Read product-usage telemetry.",
  // Reports
  "reports.read":          "View report library + run prebuilt reports.",
  "reports.create":        "Fork prebuilt reports into custom Reports.",
  "reports.edit":          "Edit custom Report metadata + sharing.",
  "reports.delete":        "Delete a custom Report.",
  "reports.schedule":      "Create / pause / delete report schedules.",
  "reports.export":        "Export reports as CSV / JSON / PDF.",
  // System
  "system.read_settings":  "Read platform settings.",
  "system.write_settings": "Edit platform settings.",
  "system.maintenance_mode": "Toggle global maintenance mode.",
  "system.feature_freeze": "Toggle global feature-freeze.",
  // Notifications
  "notifications.read":    "Read transactional templates.",
  "notifications.manage":  "Edit transactional templates.",
};

/* ────────────────────────────────────────────────────────── */
/* Permission domains + actions (for the matrix UI)           */
/* ────────────────────────────────────────────────────────── */

export type PermissionAction =
  | "read" | "create" | "update" | "delete" | "manage"
  | "export" | "impersonate" | "approve";

/** Best-effort classification of a permission key into a (domain,
 *  action) pair so the role-detail matrix has a 2-D grid. Falls
 *  back to "manage" for anything that doesn't fit one of the verbs. */
export function classifyPermission(perm: PlatformPermission): { domain: string; action: PermissionAction } {
  const dot = perm.indexOf(".");
  const domain = dot >= 0 ? perm.slice(0, dot) : "other";
  const verb = dot >= 0 ? perm.slice(dot + 1) : perm;

  if (verb === "read")        return { domain, action: "read" };
  if (verb === "write")       return { domain, action: "update" };
  if (verb === "create")      return { domain, action: "create" };
  if (verb === "delete")      return { domain, action: "delete" };
  if (verb === "edit")        return { domain, action: "update" };
  if (verb === "schedule")    return { domain, action: "create" };
  if (verb === "export")      return { domain, action: "export" };
  if (verb === "impersonate") return { domain, action: "impersonate" };
  if (verb === "approve")     return { domain, action: "approve" };
  if (verb === "merge")       return { domain, action: "manage" };
  if (verb === "ban")         return { domain, action: "manage" };
  if (verb === "manage")      return { domain, action: "manage" };
  if (verb === "transfer")    return { domain, action: "manage" };
  if (verb === "suspend")     return { domain, action: "update" };
  if (verb === "archive")     return { domain, action: "delete" };
  if (verb === "tag")         return { domain, action: "update" };
  if (verb === "invoice")     return { domain, action: "create" };
  if (verb === "refund")      return { domain, action: "manage" };
  if (verb === "plan_change") return { domain, action: "manage" };
  if (verb === "coupon")      return { domain, action: "manage" };
  if (verb === "assign_role") return { domain, action: "manage" };
  if (verb === "elevate")     return { domain, action: "manage" };
  if (verb === "revoke_elevation") return { domain, action: "manage" };
  if (verb === "invite")      return { domain, action: "create" };
  if (verb === "macro_manage") return { domain, action: "manage" };
  if (verb === "feedback_triage") return { domain, action: "manage" };
  if (verb === "respond")     return { domain, action: "update" };
  if (verb === "read_settings") return { domain: "settings", action: "read" };
  if (verb === "write_settings") return { domain: "settings", action: "update" };
  if (verb === "maintenance_mode") return { domain: "system", action: "manage" };
  if (verb === "feature_freeze") return { domain: "system", action: "manage" };
  return { domain, action: "manage" };
}

export const PERMISSION_ACTIONS: PermissionAction[] = [
  "read", "create", "update", "delete", "manage", "export", "impersonate", "approve",
];

/** Ordered list of domains for the matrix rows. */
export function domainsForPermissions(perms: PlatformPermission[]): string[] {
  const set = new Set<string>();
  for (const p of perms) set.add(classifyPermission(p).domain);
  return Array.from(set).sort();
}

/* ────────────────────────────────────────────────────────── */
/* Tenant-role default catalog (code-only)                    */
/* ────────────────────────────────────────────────────────── */

export interface TenantRoleTemplate {
  role: TenantRole;
  label: string;
  description: string;
  /** Free-form perm strings — these are TENANT-side perm keys, not
   *  PlatformPermission values. We don't enforce a strict union
   *  because tenant-side RBAC is the workspace's responsibility, but
   *  this list shows what a fresh workspace ships with. */
  perms: string[];
}

export const TENANT_ROLE_TEMPLATES: TenantRoleTemplate[] = [
  { role: "OWNER", label: "Owner",
    description: "Full control of the workspace. One per tenant; transferable.",
    perms: ["tenant.*", "billing.*", "users.*", "quotes.*", "orders.*", "invoices.*", "products.*", "customers.*", "reports.*", "settings.*"] },
  { role: "ADMIN", label: "Admin",
    description: "Operational lead — everything Owner does except billing changes.",
    perms: ["tenant.read", "users.*", "quotes.*", "orders.*", "invoices.*", "products.*", "customers.*", "reports.*", "settings.read", "settings.write"] },
  { role: "SALES_REP", label: "Sales rep",
    description: "Quote-side operator. Owns the funnel from lead → signed quote.",
    perms: ["customers.*", "quotes.*", "orders.read", "products.read", "reports.sales"] },
  { role: "CSR", label: "CSR / Customer service",
    description: "Talks to customers; can read everything quote/order side, comment on jobs.",
    perms: ["customers.*", "quotes.read", "orders.read", "invoices.read", "comments.*"] },
  { role: "DESIGNER", label: "Designer",
    description: "Creative — uploads proofs, comments on revisions.",
    perms: ["proofs.*", "files.*", "quotes.read", "orders.read", "comments.*"] },
  { role: "PRODUCTION_MANAGER", label: "Production manager",
    description: "Owns the floor schedule, materials, install routing.",
    perms: ["orders.*", "production.*", "materials.*", "installs.*", "files.read"] },
  { role: "INSTALLER", label: "Installer",
    description: "On-site crew — can update install events + photos, nothing else.",
    perms: ["installs.update", "installs.photos", "installs.signoff"] },
  { role: "ACCOUNTING", label: "Accounting",
    description: "Books-side — reads orders, edits invoices and payments.",
    perms: ["invoices.*", "payments.*", "reports.financial", "customers.read"] },
  { role: "EMPLOYEE", label: "Employee (default)",
    description: "Generic baseline assigned to fresh members until a more specific role is set.",
    perms: ["dashboard.read", "tasks.*", "quotes.read", "orders.read", "comments.*"] },
];

/* ────────────────────────────────────────────────────────── */
/* Loaders                                                    */
/* ────────────────────────────────────────────────────────── */

export interface BuiltInRoleRow {
  kind: "builtin";
  id: string;             // PlatformRole enum value
  role: PlatformRole;
  name: string;
  description: string;
  permissions: PlatformPermission[];
  assignedCount: number;
}

const BUILTIN_DESCRIPTIONS: Record<PlatformRole, string> = {
  SUPER_ADMIN:       "Root of trust — every permission, including destructive system levers.",
  SITE_MANAGER:      "Operational lead — full ops access without destructive infra actions.",
  SUPPORT_AGENT:     "Front-line support — read tenants, respond to tickets, view audit log.",
  ADMIN:             "Full ops access. Can't delete tenants or flip global maintenance.",
  MANAGER:           "Day-to-day ops — tenant and support oversight without billing or staff edits.",
  SUPPORT_LEAD:      "Owns the support queue + macros + feedback triage.",
  BILLING_MANAGER:   "Money. Refunds, plan changes, coupons. No tenant suspensions.",
  DEVELOPER:         "Engineering — flags, system settings, repro impersonation.",
  MARKETING_MANAGER: "Leads + announcements + public plan / feature copy.",
  CONTENT_MANAGER:   "Internal CMS — announcements + transactional templates.",
  ANALYST:           "Read-everything analyst — runs exports, no writes.",
  READ_ONLY_VIEWER:  "Exec / auditor — read everything, write nothing.",
};

export async function loadBuiltInRoles(): Promise<BuiltInRoleRow[]> {
  const roles = Object.keys(PLATFORM_ROLE_PERMISSIONS) as PlatformRole[];
  const counts = await db.user.groupBy({
    by: ["platformRole"],
    where: { platformRole: { in: roles } },
    _count: { _all: true },
  });
  const countMap = new Map<PlatformRole, number>();
  for (const c of counts) {
    if (c.platformRole) countMap.set(c.platformRole, c._count._all);
  }
  return roles.map((role) => ({
    kind: "builtin" as const,
    id: role,
    role,
    name: platformRoleLabel(role),
    description: BUILTIN_DESCRIPTIONS[role],
    permissions: PLATFORM_ROLE_PERMISSIONS[role],
    assignedCount: countMap.get(role) ?? 0,
  }));
}

export interface CustomRoleRow {
  kind: "custom";
  id: string;
  key: string;
  name: string;
  description: string | null;
  permissions: PlatformPermission[];
  status: CustomPlatformRoleStatus;
  assignedCount: number;
  createdAt: Date;
  updatedAt: Date;
  createdBy: { id: string; name: string | null; email: string };
}

export async function loadCustomRoles(): Promise<CustomRoleRow[]> {
  const rows = await db.customPlatformRole.findMany({
    orderBy: [{ status: "asc" }, { name: "asc" }],
    include: {
      _count: { select: { members: true } },
      createdBy: { select: { id: true, name: true, email: true } },
    },
  });
  return rows.map((r) => ({
    kind: "custom" as const,
    id: r.id,
    key: r.key,
    name: r.name,
    description: r.description,
    permissions: r.permissions as PlatformPermission[],
    status: r.status,
    assignedCount: r._count.members,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
    createdBy: { id: r.createdBy.id, name: r.createdBy.name, email: r.createdBy.email },
  }));
}

export interface RoleDetail {
  kind: "builtin" | "custom";
  id: string;
  name: string;
  description: string | null;
  permissions: PlatformPermission[];
  status: CustomPlatformRoleStatus | null;
  assignedCount: number;
  members: { id: string; name: string | null; email: string; image: string | null }[];
  createdAt: Date | null;
  updatedAt: Date | null;
}

export async function loadRoleDetail(id: string): Promise<RoleDetail | null> {
  const builtin = (Object.keys(PLATFORM_ROLE_PERMISSIONS) as PlatformRole[]).includes(id as PlatformRole);
  if (builtin) {
    const role = id as PlatformRole;
    const members = await db.user.findMany({
      where: { platformRole: role, customPlatformRoleId: null },
      orderBy: { email: "asc" },
      select: { id: true, name: true, email: true, image: true },
      take: 200,
    });
    return {
      kind: "builtin",
      id,
      name: platformRoleLabel(role),
      description: BUILTIN_DESCRIPTIONS[role],
      permissions: PLATFORM_ROLE_PERMISSIONS[role],
      status: null,
      assignedCount: members.length,
      members,
      createdAt: null,
      updatedAt: null,
    };
  }
  const row = await db.customPlatformRole.findUnique({
    where: { id },
    include: {
      members: {
        select: { id: true, name: true, email: true, image: true },
        orderBy: { email: "asc" },
        take: 200,
      },
    },
  });
  if (!row) return null;
  return {
    kind: "custom",
    id: row.id,
    name: row.name,
    description: row.description,
    permissions: row.permissions as PlatformPermission[],
    status: row.status,
    assignedCount: row.members.length,
    members: row.members,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

/* ────────────────────────────────────────────────────────── */
/* KPIs                                                        */
/* ────────────────────────────────────────────────────────── */

export interface RolesKpi {
  builtinRoles: number;
  customActive: number;
  customDraft: number;
  customArchived: number;
  staffOnCustomRole: number;
  permissionCount: number;
}

export async function loadRolesKpi(): Promise<RolesKpi> {
  const [active, draft, archived, members] = await Promise.all([
    db.customPlatformRole.count({ where: { status: "ACTIVE" } }),
    db.customPlatformRole.count({ where: { status: "DRAFT" } }),
    db.customPlatformRole.count({ where: { status: "ARCHIVED" } }),
    db.user.count({ where: { customPlatformRoleId: { not: null } } }),
  ]);
  const catalog = permissionCatalog();
  let count = 0;
  for (const g of catalog) count += g.perms.length;
  return {
    builtinRoles: Object.keys(PLATFORM_ROLE_PERMISSIONS).length,
    customActive: active,
    customDraft: draft,
    customArchived: archived,
    staffOnCustomRole: members,
    permissionCount: count,
  };
}

/* ────────────────────────────────────────────────────────── */
/* Audit history (per role)                                   */
/* ────────────────────────────────────────────────────────── */

export interface RoleAuditEntry {
  id: string;
  action: string;
  actorId: string | null;
  actorEmail: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: Date;
}

export async function loadRoleAudit(id: string): Promise<RoleAuditEntry[]> {
  const rows = await db.auditLog.findMany({
    where: { entityType: "CustomPlatformRole", entityId: id },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
  // Resolve actor email in a single query.
  const userIds = Array.from(new Set(rows.map((r) => r.userId).filter((x): x is string => !!x)));
  const users = userIds.length === 0 ? [] : await db.user.findMany({
    where: { id: { in: userIds } },
    select: { id: true, email: true },
  });
  const map = new Map(users.map((u) => [u.id, u.email]));
  return rows.map((r) => ({
    id: r.id, action: r.action,
    actorId: r.userId, actorEmail: r.userId ? map.get(r.userId) ?? null : null,
    metadata: (r.metadata ?? null) as Record<string, unknown> | null,
    createdAt: r.createdAt,
  }));
}
