// GET /api/platform/users/export
//
// CSV export of the cross-tenant user directory honoring URL filters.
// Capped at 10k rows for safety.

import { logPlatformAudit, requirePlatformStaff } from "@/lib/platform";
import {
  loadUsersList,
  type UsersFilters,
  type UsersSortDir,
  type UsersSortKey,
} from "@/server/platform/users-list";
import type { PlatformRole, TenantRole } from "@prisma/client";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const HARD_CAP = 10_000;
const PAGE_SIZE = 500;

const TENANT_ROLES = new Set<TenantRole>([
  "OWNER", "ADMIN", "SALES_REP", "CSR", "DESIGNER",
  "PRODUCTION_MANAGER", "INSTALLER", "ACCOUNTING", "EMPLOYEE",
]);
const PLATFORM_ROLES = new Set<PlatformRole>([
  "SUPER_ADMIN", "SITE_MANAGER", "SUPPORT_AGENT", "ADMIN", "MANAGER",
  "SUPPORT_LEAD", "BILLING_MANAGER", "DEVELOPER", "MARKETING_MANAGER",
  "CONTENT_MANAGER", "ANALYST", "READ_ONLY_VIEWER",
]);

function parseFilters(sp: URLSearchParams): UsersFilters {
  const f: UsersFilters = {};
  const q = sp.get("q"); if (q && q.trim()) f.q = q.trim();
  const tenant = sp.get("tenant"); if (tenant) f.tenantId = tenant;
  const tRole = sp.get("tRole");
  if (tRole && TENANT_ROLES.has(tRole as TenantRole)) f.tenantRole = tRole as TenantRole;
  const pRole = sp.get("pRole");
  if (pRole && PLATFORM_ROLES.has(pRole as PlatformRole)) f.platformRole = pRole as PlatformRole;
  const status = sp.get("status");
  if (status && ["active", "deactivated", "banned", "merged", "locked"].includes(status)) {
    f.status = status as UsersFilters["status"];
  }
  if (sp.get("mfa") === "1") f.mfaEnabled = true;
  else if (sp.get("mfa") === "0") f.mfaEnabled = false;
  if (sp.get("verified") === "1") f.emailVerified = true;
  else if (sp.get("verified") === "0") f.emailVerified = false;
  const country = sp.get("country"); if (country) f.country = country.toUpperCase();
  const signin = sp.get("signin");
  if (signin && ["credentials", "google", "microsoft", "sso", "other"].includes(signin)) {
    f.signInMethod = signin as UsersFilters["signInMethod"];
  }
  const lastSince = sp.get("lastSince"); if (lastSince) {
    const d = new Date(lastSince); if (!Number.isNaN(d.getTime())) f.lastLoginSince = d;
  }
  const lastUntil = sp.get("lastUntil"); if (lastUntil) {
    const d = new Date(lastUntil); if (!Number.isNaN(d.getTime())) f.lastLoginUntil = d;
  }
  return f;
}

export async function GET(req: Request) {
  const ctx = await requirePlatformStaff();
  if (!ctx.can("users.read")) {
    return new Response(JSON.stringify({ ok: false, error: "Forbidden" }), {
      status: 403, headers: { "Content-Type": "application/json" },
    });
  }
  const url = new URL(req.url);
  const filters = parseFilters(url.searchParams);
  const sortKey = (url.searchParams.get("sort") ?? "lastLogin") as UsersSortKey;
  const sortDir = (url.searchParams.get("dir") === "asc" ? "asc" : "desc") as UsersSortDir;

  // Page through until HARD_CAP or empty.
  const collected: Awaited<ReturnType<typeof loadUsersList>>["rows"] = [];
  let page = 1;
  while (collected.length < HARD_CAP) {
    const res = await loadUsersList({ filters, sortKey, sortDir, page, pageSize: PAGE_SIZE });
    if (res.rows.length === 0) break;
    collected.push(...res.rows);
    if (res.rows.length < PAGE_SIZE) break;
    page += 1;
  }
  const rows = collected.slice(0, HARD_CAP);

  const headers = [
    "user_id", "name", "email", "email_verified",
    "country", "platform_role", "status", "mfa_enabled",
    "last_login_iso", "created_iso",
    "tenant_count", "tenant_ids", "tenant_names", "primary_role",
    "sign_in_methods",
  ];
  const lines = [headers.join(",")];
  for (const r of rows) {
    lines.push([
      r.id, csv(r.name ?? ""), csv(r.email),
      r.emailVerified ? "1" : "0",
      r.country ?? "", r.platformRole ?? "", r.status,
      r.twoFactorEnabled ? "1" : "0",
      r.lastLoginAt?.toISOString() ?? "",
      r.createdAt.toISOString(),
      r.totalTenantCount,
      csv(r.tenants.map((t) => t.id).join("|")),
      csv(r.tenants.map((t) => t.name).join("|")),
      r.tenants[0]?.role ?? "",
      csv(r.signInMethods.join("|")),
    ].join(","));
  }

  await logPlatformAudit({
    userId: ctx.userId,
    action: "platform.users_exported",
    entityType: "User",
    metadata: { actor: ctx.email, count: rows.length, filters: Object.fromEntries(url.searchParams.entries()) },
  });

  return new Response(lines.join("\n"), {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="users-${stamp()}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}

function csv(s: string): string {
  if (!s) return "";
  const needsQuotes = /[",\n\r]/.test(s);
  const escaped = s.replace(/"/g, '""');
  return needsQuotes ? `"${escaped}"` : escaped;
}

function stamp(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
