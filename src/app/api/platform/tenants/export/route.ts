// GET /api/platform/tenants/export?format=csv|json|xlsx
//
// Streams the current filtered tenants list as a downloadable file.
// xlsx uses SheetJS to author a real multi-sheet workbook (Tenants
// + per-tenant Users sub-sheet) — opens directly in Excel / Sheets /
// Numbers without the "is this really xlsx?" warning.

import * as XLSX from "xlsx";
import { db } from "@/lib/db";
import { requirePlatformStaff, logPlatformAudit } from "@/lib/platform";
import {
  loadTenantsList,
  parseTenantsFilters,
} from "@/server/platform/tenants-list";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const HARD_CAP = 10_000;

export async function GET(req: Request) {
  const ctx = await requirePlatformStaff();
  if (!ctx.can("tenant.read")) {
    return new Response(JSON.stringify({ ok: false, error: "Forbidden" }), {
      status: 403,
      headers: { "Content-Type": "application/json" },
    });
  }
  const url = new URL(req.url);
  const sp = url.searchParams;
  const filters = parseTenantsFilters(Object.fromEntries(sp.entries()));
  const formatRaw = (sp.get("format") ?? "csv").toLowerCase();
  const format: "csv" | "json" | "xlsx" =
    formatRaw === "json" ? "json" : formatRaw === "xlsx" ? "xlsx" : "csv";

  // Pull pages until we hit HARD_CAP or run out.
  const collected: Awaited<ReturnType<typeof loadTenantsList>>["rows"] = [];
  let page = 1;
  while (collected.length < HARD_CAP) {
    const res = await loadTenantsList({
      filters,
      sortKey: "name",
      sortDir: "asc",
      page,
      pageSize: 200,
      currentUserId: ctx.userId,
    });
    if (res.rows.length === 0) break;
    collected.push(...res.rows);
    if (res.rows.length < 200) break;
    page += 1;
  }
  const rows = collected.slice(0, HARD_CAP);

  await logPlatformAudit({
    userId: ctx.userId,
    action: "platform.tenants_exported",
    entityType: "Tenant",
    metadata: { actor: ctx.email, format, count: rows.length, filters: Object.fromEntries(sp.entries()) },
  });

  const ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const baseFilename = `flowtora-tenants-${ts}`;

  if (format === "json") {
    return new Response(JSON.stringify({
      exportedAt: new Date().toISOString(),
      count: rows.length,
      rows,
    }, null, 2), {
      status: 200,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": `attachment; filename="${baseFilename}.json"`,
      },
    });
  }

  if (format === "xlsx") {
    // Build a real multi-sheet workbook: Tenants + Users + Schedule of
    // exports for traceability. Pull all members for the included
    // tenants in one query so the Users sheet is real.
    const tenantIds = rows.map((r) => r.id);
    const memberships = tenantIds.length === 0 ? [] : await db.membership.findMany({
      where: { tenantId: { in: tenantIds } },
      select: {
        role: true, status: true, createdAt: true,
        tenant: { select: { id: true, name: true, slug: true } },
        user: { select: { email: true, name: true, lastLoginAt: true } },
      },
    });

    const wb = XLSX.utils.book_new();

    const tenantsAoA = [
      [
        "id", "name", "slug", "plan", "status", "country", "industry",
        "MRR", "users", "jobs (this month)", "health",
        "created", "last activity", "trial ends",
        "owner email", "tags", "account manager", "custom domain",
        "SSO", "MFA", "source", "stripe customer", "storage bytes", "past-due $",
      ],
      ...rows.map((r) => [
        r.id, r.name, r.slug, r.planName, r.status,
        r.countryName ?? r.country ?? "",
        r.industry ?? "",
        r.mrr, r.users, r.jobsThisMonth, r.healthScore,
        r.createdAt.toISOString(),
        r.lastActivityAt?.toISOString() ?? "",
        r.trialEndsAt?.toISOString() ?? "",
        r.ownerEmail ?? "",
        r.adminTags.join(" "),
        r.accountManager?.email ?? "",
        r.customDomain ?? "",
        r.ssoEnabled ? (r.ssoProvider ?? "yes") : "no",
        r.mfaEnforced ? "enforced" : "no",
        r.signupSource,
        r.stripeCustomerId ?? "",
        r.storageBytes,
        r.pastDueDollars,
      ]),
    ];
    const wsTenants = XLSX.utils.aoa_to_sheet(tenantsAoA);
    XLSX.utils.book_append_sheet(wb, wsTenants, "Tenants");

    const usersAoA = [
      ["tenant id", "tenant name", "tenant slug", "user email", "user name", "role", "status", "joined", "last login"],
      ...memberships.map((m) => [
        m.tenant.id, m.tenant.name, m.tenant.slug,
        m.user.email, m.user.name ?? "",
        m.role, m.status,
        m.createdAt.toISOString(),
        m.user.lastLoginAt?.toISOString() ?? "",
      ]),
    ];
    const wsUsers = XLSX.utils.aoa_to_sheet(usersAoA);
    XLSX.utils.book_append_sheet(wb, wsUsers, "Users");

    const metaAoA = [
      ["Exported by", ctx.email],
      ["Exported at", new Date().toISOString()],
      ["Tenant rows", rows.length],
      ["Member rows", memberships.length],
      ["Filter querystring", url.search.replace(/^\?/, "")],
    ];
    const wsMeta = XLSX.utils.aoa_to_sheet(metaAoA);
    XLSX.utils.book_append_sheet(wb, wsMeta, "Export meta");

    const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
    return new Response(new Uint8Array(buf), {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${baseFilename}.xlsx"`,
      },
    });
  }

  const cols = [
    "id", "name", "slug", "plan", "status", "country", "industry",
    "mrr", "users", "jobsThisMonth", "healthScore",
    "createdAt", "lastActivityAt", "trialEndsAt",
    "ownerEmail", "adminTags", "accountManager", "customDomain",
    "ssoEnabled", "mfaEnforced", "signupSource", "stripeCustomerId",
    "storageBytes", "pastDueDollars",
  ];
  const csv = [
    cols.join(","),
    ...rows.map((r) => [
      csvCell(r.id),
      csvCell(r.name),
      csvCell(r.slug),
      csvCell(r.planName),
      csvCell(r.status),
      csvCell(r.countryName ?? r.country ?? ""),
      csvCell(r.industry ?? ""),
      csvCell(r.mrr),
      csvCell(r.users),
      csvCell(r.jobsThisMonth),
      csvCell(r.healthScore),
      csvCell(r.createdAt.toISOString()),
      csvCell(r.lastActivityAt?.toISOString() ?? ""),
      csvCell(r.trialEndsAt?.toISOString() ?? ""),
      csvCell(r.ownerEmail ?? ""),
      csvCell(r.adminTags.join(" ")),
      csvCell(r.accountManager?.email ?? ""),
      csvCell(r.customDomain ?? ""),
      csvCell(r.ssoEnabled ? "yes" : "no"),
      csvCell(r.mfaEnforced ? "yes" : "no"),
      csvCell(r.signupSource),
      csvCell(r.stripeCustomerId ?? ""),
      csvCell(r.storageBytes),
      csvCell(r.pastDueDollars),
    ].join(",")),
  ].join("\n");

  return new Response(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${baseFilename}.csv"`,
    },
  });
}

function csvCell(v: unknown): string {
  if (v == null) return "";
  const s = String(v);
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}
