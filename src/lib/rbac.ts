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
  CUSTOMER_PORTAL: [], // checked separately — portal users get a different access path
};

export function hasPermission(role: TenantRole, perm: Permission): boolean {
  return TENANT_ROLE_PERMISSIONS[role]?.includes(perm) ?? false;
}

export function isPlatformStaff(role: PlatformRole | null | undefined): boolean {
  return role === "SUPER_ADMIN" || role === "SITE_MANAGER" || role === "SUPPORT_AGENT";
}

export function canImpersonate(role: PlatformRole | null | undefined): boolean {
  return role === "SUPER_ADMIN" || role === "SITE_MANAGER";
}
