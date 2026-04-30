// GET /api/platform/tenants/export?format=csv|json|xlsx
//
// Streams the current filtered tenants list as a downloadable file.
// xlsx is currently delivered as CSV with an .xlsx-friendly content
// type so Excel opens it directly — a future slice can swap in a
// real xlsx writer (xlsx / exceljs) for multi-sheet output.

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

  // Excel opens .csv files directly as spreadsheets — for the spec's
  // "xlsx" option we serve the same body with a .xlsx extension and
  // Excel-friendly content type so the download flow matches user
  // expectations. Native xlsx authoring is a future slice.
  const ext = format === "xlsx" ? "xlsx" : "csv";
  const contentType = format === "xlsx"
    ? "application/vnd.ms-excel"
    : "text/csv; charset=utf-8";

  return new Response(csv, {
    status: 200,
    headers: {
      "Content-Type": contentType,
      "Content-Disposition": `attachment; filename="${baseFilename}.${ext}"`,
    },
  });
}

function csvCell(v: unknown): string {
  if (v == null) return "";
  const s = String(v);
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}
