"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Avatar, Badge, Button, StatusPill, useToast,
} from "@/components/ui";
import { flagEmoji } from "@/lib/country-codes";
import type { TenantListRow } from "@/server/platform/tenants-list";
import { TenantQuickView } from "./TenantQuickView";
import { TenantRowMenu } from "./TenantRowMenu";

// TenantsTable — Page 4 §Table.
//
// Owns: row selection state, sort header click, quick-view panel,
// per-row 3-dot menu, density + column toggles. Delegates KPI strip,
// header actions, and bulk-action toolbar to the parent server page.

export type Density = "comfortable" | "compact";

export interface TenantsTableProps {
  rows: TenantListRow[];
  total: number;
  filteredTotal: number;
  /** Current page (1-indexed). */
  page: number;
  pageSize: number;
  sortKey: string;
  sortDir: "asc" | "desc";
  /** Querystring (without leading ?) of the current filter set. Used
   *  by the bulk-action server actions and the export buttons so
   *  selecting "Apply to all matching" can resubmit the same filter. */
  filterQs: string;
  /** Visible columns by id. The "fixed" columns (select, name,
   *  status) always render. */
  visibleColumns: Record<string, boolean>;
  density: Density;
  /** Whether the current user can run mutating bulk actions. */
  canBulkWrite: boolean;
  canImpersonate: boolean;
  canPlanChange: boolean;
  canHardDelete: boolean;
  canSuspend: boolean;
  canTag: boolean;
  canCoupon: boolean;
}

const STATUS_TO_PILL: Record<string, "active" | "trialing" | "past_due" | "suspended" | "cancelled" | "draft"> = {
  ACTIVE: "active", TRIAL: "trialing", PAST_DUE: "past_due",
  SUSPENDED: "suspended", CANCELED: "cancelled", ARCHIVED: "draft",
};

const PLAN_COLOR: Record<string, "neutral" | "brand" | "success" | "info" | "accent"> = {
  ENTERPRISE: "accent", PRO: "brand", GROWTH: "success", STARTER: "neutral",
};

const SORTABLE: Record<string, true> = {
  name: true, slug: true, plan: true, status: true,
  mrr: true, users: true, jobs: true, health: true,
  created: true, activity: true, owner: true,
};

export function TenantsTable({
  rows,
  total,
  filteredTotal,
  page,
  pageSize,
  sortKey,
  sortDir,
  filterQs,
  visibleColumns,
  density,
  canBulkWrite,
  canImpersonate,
  canPlanChange,
  canHardDelete,
  canSuspend,
  canTag,
  canCoupon,
}: TenantsTableProps) {
  const router = useRouter();
  const toast = useToast();
  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  const [quickView, setQuickView] = React.useState<TenantListRow | null>(null);

  // Reset selection on page / filter / row change.
  const filterKey = filterQs + ":" + page + ":" + sortKey + sortDir;
  React.useEffect(() => { setSelected(new Set()); }, [filterKey]);

  const allChecked = rows.length > 0 && rows.every((r) => selected.has(r.id));
  const someChecked = rows.some((r) => selected.has(r.id)) && !allChecked;
  const toggleRow = (id: string, on: boolean) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (on) next.add(id); else next.delete(id);
      return next;
    });
  };
  const toggleAll = (on: boolean) => {
    if (on) setSelected(new Set(rows.map((r) => r.id)));
    else setSelected(new Set());
  };

  const rowH = density === "comfortable" ? 56 : 40;

  const columns = React.useMemo(() => buildColumns(visibleColumns), [visibleColumns]);

  const headerLink = (col: string, label: React.ReactNode) => {
    if (!SORTABLE[col]) return <span className="font-semibold">{label}</span>;
    const active = sortKey === col;
    const nextDir = active && sortDir === "asc" ? "desc" : "asc";
    const u = new URLSearchParams(filterQs);
    u.set("sort", col);
    u.set("dir", nextDir);
    return (
      <Link href={`/platform/tenants?${u.toString()}`} className="ts-focus inline-flex items-center gap-1 font-semibold hover:underline">
        {label}
        {active && <span aria-hidden>{sortDir === "asc" ? "↑" : "↓"}</span>}
      </Link>
    );
  };

  const buildPageHref = (p: number) => {
    const u = new URLSearchParams(filterQs);
    u.set("page", String(p));
    return `/platform/tenants?${u.toString()}`;
  };

  const totalPages = Math.max(1, Math.ceil(filteredTotal / pageSize));

  return (
    <div className="space-y-3">
      {selected.size > 0 && (
        <BulkBar
          selectedIds={Array.from(selected)}
          onClear={() => setSelected(new Set())}
          canBulkWrite={canBulkWrite}
          canPlanChange={canPlanChange}
          canHardDelete={canHardDelete}
          canSuspend={canSuspend}
          canTag={canTag}
          canCoupon={canCoupon}
        />
      )}

      <div className="overflow-hidden rounded-lg border" style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)" }}>
        <div className="overflow-x-auto">
          <table className="w-full text-[13px]" style={{ borderCollapse: "separate", borderSpacing: 0 }}>
            <thead>
              <tr style={{ background: "var(--surface-2)" }}>
                <th style={{ height: 40, padding: "0 8px", borderBottom: "1px solid var(--border-subtle)", width: 36 }}>
                  <input
                    type="checkbox"
                    aria-label="Select all on this page"
                    checked={allChecked}
                    ref={(el) => { if (el) el.indeterminate = someChecked; }}
                    onChange={(e) => toggleAll(e.currentTarget.checked)}
                  />
                </th>
                {columns.map((c) => (
                  <th
                    key={c.id}
                    style={{
                      height: 40,
                      padding: "0 12px",
                      borderBottom: "1px solid var(--border-subtle)",
                      textAlign: c.align ?? "left",
                      whiteSpace: "nowrap",
                      fontSize: 11,
                      fontWeight: 600,
                      letterSpacing: 0.04,
                      textTransform: "uppercase",
                      color: "var(--text-muted)",
                      width: c.width,
                    }}
                  >
                    {headerLink(c.id, c.label)}
                  </th>
                ))}
                <th style={{ width: 60, borderBottom: "1px solid var(--border-subtle)" }} />
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={columns.length + 2} style={{ padding: 32, textAlign: "center", color: "var(--text-muted)" }}>
                    No tenants match these filters.
                  </td>
                </tr>
              ) : rows.map((r) => {
                const isSelected = selected.has(r.id);
                return (
                  <tr
                    key={r.id}
                    onMouseEnter={() => setQuickViewHover(r.id)}
                    onMouseLeave={() => setQuickViewHover(null)}
                    style={{
                      background: isSelected ? "var(--brand-50)" : undefined,
                      borderLeft: isSelected ? "3px solid var(--brand-600)" : "3px solid transparent",
                    }}
                  >
                    <td style={{ height: rowH, padding: "0 8px", borderBottom: "1px solid var(--border-subtle)" }}>
                      <input
                        type="checkbox"
                        aria-label={`Select ${r.name}`}
                        checked={isSelected}
                        onChange={(e) => toggleRow(r.id, e.currentTarget.checked)}
                        onClick={(e) => e.stopPropagation()}
                      />
                    </td>
                    {columns.map((c) => (
                      <td
                        key={c.id}
                        style={{
                          height: rowH,
                          padding: "0 12px",
                          borderBottom: "1px solid var(--border-subtle)",
                          textAlign: c.align ?? "left",
                          whiteSpace: c.id === "name" || c.id === "ownerEmail" ? "normal" : "nowrap",
                          color: "var(--text-default)",
                          fontVariantNumeric: c.kind === "number" || c.kind === "money" ? "tabular-nums" : undefined,
                          fontFamily: c.kind === "number" || c.kind === "money" ? "ui-monospace, Menlo, monospace" : undefined,
                          fontSize: c.kind === "number" || c.kind === "money" ? 12 : undefined,
                        }}
                      >
                        {c.render(r, { onQuickView: () => setQuickView(r) })}
                      </td>
                    ))}
                    <td style={{ height: rowH, padding: "0 8px", borderBottom: "1px solid var(--border-subtle)", textAlign: "right" }}>
                      <TenantRowMenu
                        tenantId={r.id}
                        tenantName={r.name}
                        slug={r.slug}
                        stripeCustomerId={r.stripeCustomerId}
                        ownerEmail={r.ownerEmail}
                        canImpersonate={canImpersonate}
                        canPlanChange={canPlanChange}
                        canSuspend={canSuspend}
                        canTag={canTag}
                        canCoupon={canCoupon}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Pagination footer */}
        <div className="flex items-center justify-between gap-3 border-t px-4 py-3"
             style={{ borderColor: "var(--border-subtle)" }}>
          <div className="text-[11px]" style={{ color: "var(--text-muted)" }}>
            Showing {rows.length === 0 ? 0 : (page - 1) * pageSize + 1}–{(page - 1) * pageSize + rows.length} of {filteredTotal.toLocaleString()}
            {filteredTotal !== total ? ` (filtered from ${total.toLocaleString()})` : ""}
          </div>
          <div className="flex items-center gap-1">
            <Link href={page > 1 ? buildPageHref(page - 1) : "#"} aria-disabled={page <= 1}
              className="ts-focus inline-flex h-7 items-center rounded-md border px-2 text-[12px]"
              style={{
                background: "var(--surface-1)",
                borderColor: "var(--border-default)",
                color: page <= 1 ? "var(--text-faint)" : "var(--text-default)",
                pointerEvents: page <= 1 ? "none" : undefined,
              }}>← Prev</Link>
            <span className="px-2 text-[12px]" style={{ color: "var(--text-muted)" }}>
              Page {page} / {totalPages}
            </span>
            <Link href={page < totalPages ? buildPageHref(page + 1) : "#"} aria-disabled={page >= totalPages}
              className="ts-focus inline-flex h-7 items-center rounded-md border px-2 text-[12px]"
              style={{
                background: "var(--surface-1)",
                borderColor: "var(--border-default)",
                color: page >= totalPages ? "var(--text-faint)" : "var(--text-default)",
                pointerEvents: page >= totalPages ? "none" : undefined,
              }}>Next →</Link>
          </div>
        </div>
      </div>

      {quickView && (
        <TenantQuickView
          tenant={quickView}
          onClose={() => setQuickView(null)}
        />
      )}
    </div>
  );
  void toast; void router; void quickViewHover;
}

let quickViewHover: string | null = null;
function setQuickViewHover(id: string | null) { quickViewHover = id; }

/* ── Column model ─────────────────────────────────────────── */

interface Column {
  id: string;
  label: string;
  align?: "left" | "right" | "center";
  kind?: "number" | "money" | "date" | "text";
  width?: number;
  render: (r: TenantListRow, helpers: { onQuickView: () => void }) => React.ReactNode;
}

function buildColumns(visible: Record<string, boolean>): Column[] {
  const cols: Column[] = [
    {
      id: "name", label: "Tenant", width: 280,
      render: (r, h) => (
        <div className="flex items-center gap-2">
          <Avatar size="sm" src={r.logoUrl ?? undefined} name={r.name} />
          <div className="min-w-0">
            <Link href={`/platform/tenants/${r.id}`} className="block truncate font-medium hover:underline" style={{ color: "var(--text-default)" }}>
              {r.name}
            </Link>
            <div className="flex items-center gap-1.5">
              <span className="truncate font-mono text-[10px]" style={{ color: "var(--text-faint)" }}>{r.slug}</span>
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); h.onQuickView(); }}
                className="ts-focus inline-flex h-4 w-4 items-center justify-center rounded text-[10px] hover:bg-[var(--surface-2)]"
                title="Quick view"
                aria-label={`Quick view ${r.name}`}
                style={{ color: "var(--text-faint)" }}
              >👁</button>
            </div>
          </div>
        </div>
      ),
    },
    {
      id: "plan", label: "Plan", width: 110,
      render: (r) => <Badge size="xs" color={PLAN_COLOR[r.plan] ?? "neutral"}>{r.planName}</Badge>,
    },
    {
      id: "status", label: "Status", width: 130,
      render: (r) => <StatusPill status={STATUS_TO_PILL[r.status] ?? "draft"} size="sm" />,
    },
    {
      id: "mrr", label: "MRR", align: "right", kind: "money", width: 90,
      render: (r) => r.mrr === 0 ? <span style={{ color: "var(--text-faint)" }}>—</span> : `$${r.mrr.toLocaleString()}`,
    },
    {
      id: "users", label: "Users", align: "right", kind: "number", width: 70,
      render: (r) => r.users.toLocaleString(),
    },
    {
      id: "jobs", label: "Jobs (mo)", align: "right", kind: "number", width: 90,
      render: (r) => r.jobsThisMonth.toLocaleString(),
    },
    {
      id: "health", label: "Health", width: 90,
      render: (r) => <HealthBadge score={r.healthScore} />,
    },
    {
      id: "created", label: "Created", kind: "date", width: 110,
      render: (r) => r.createdAt.toLocaleDateString(),
    },
    {
      id: "activity", label: "Last activity", width: 130,
      render: (r) => r.lastActivityAt
        ? <span title={r.lastActivityAt.toLocaleString()}>{relativeTime(r.lastActivityAt)}</span>
        : <span style={{ color: "var(--text-faint)" }}>—</span>,
    },
    {
      id: "owner", label: "Owner email", width: 200,
      render: (r) => r.ownerEmail
        ? <a href={`mailto:${r.ownerEmail}`} className="truncate hover:underline" style={{ color: "var(--text-default)" }}>{r.ownerEmail}</a>
        : <span style={{ color: "var(--text-faint)" }}>—</span>,
    },
    {
      id: "country", label: "Country", width: 120,
      render: (r) => r.countryIso2
        ? <span><span aria-hidden>{flagEmoji(r.countryIso2)}</span> {r.countryIso2}</span>
        : <span style={{ color: "var(--text-faint)" }}>—</span>,
    },
    {
      id: "tags", label: "Tags", width: 200,
      render: (r) => r.adminTags.length === 0
        ? <span style={{ color: "var(--text-faint)" }}>—</span>
        : (
          <div className="flex flex-wrap gap-1">
            {r.adminTags.slice(0, 3).map((t) => (
              <span key={t} className="inline-flex items-center rounded-full px-1.5 text-[10px]"
                    style={{ background: "var(--surface-2)", color: "var(--text-muted)" }}>{t}</span>
            ))}
            {r.adminTags.length > 3 && (
              <span className="text-[10px]" style={{ color: "var(--text-faint)" }}>+{r.adminTags.length - 3}</span>
            )}
          </div>
        ),
    },
    {
      id: "csm", label: "Account manager", width: 180,
      render: (r) => r.accountManager
        ? (
          <div className="flex items-center gap-1.5">
            <Avatar size="xs" name={r.accountManager.name ?? r.accountManager.email} />
            <span className="truncate text-[12px]">{r.accountManager.name ?? r.accountManager.email}</span>
          </div>
        )
        : <span style={{ color: "var(--text-faint)" }}>Unassigned</span>,
    },
    // Optional columns toggle in.
    {
      id: "trialEnds", label: "Trial ends", width: 110,
      render: (r) => r.trialEndsAt ? r.trialEndsAt.toLocaleDateString() : <span style={{ color: "var(--text-faint)" }}>—</span>,
    },
    {
      id: "domain", label: "Custom domain", width: 200,
      render: (r) => r.customDomain ?? <span style={{ color: "var(--text-faint)" }}>—</span>,
    },
    {
      id: "sso", label: "SSO", width: 100,
      render: (r) => r.ssoEnabled
        ? <Badge size="xs" color="success">{r.ssoProvider ?? "On"}</Badge>
        : <span style={{ color: "var(--text-faint)" }}>—</span>,
    },
    {
      id: "mfa", label: "MFA", width: 70, align: "center",
      render: (r) => r.mfaEnforced
        ? <Badge size="xs" color="info">Enforced</Badge>
        : <span style={{ color: "var(--text-faint)" }}>—</span>,
    },
    {
      id: "storage", label: "Storage", align: "right", kind: "number", width: 100,
      render: (r) => humanSize(r.storageBytes),
    },
    {
      id: "industry", label: "Industry", width: 160,
      render: (r) => r.industry ? r.industry.replace(/_/g, " ").toLowerCase() : <span style={{ color: "var(--text-faint)" }}>—</span>,
    },
    {
      id: "source", label: "Source", width: 100,
      render: (r) => <span style={{ color: "var(--text-muted)" }}>{r.signupSource.toLowerCase()}</span>,
    },
  ];

  // Filter to visible.
  return cols.filter((c) => visible[c.id] !== false);
  function _ssoProviderRef() { return null; }
  void _ssoProviderRef;
}

/* ── Helpers ───────────────────────────────────────────── */

function HealthBadge({ score }: { score: number }) {
  const color = score >= 80 ? "var(--emerald-700)" : score >= 50 ? "var(--amber-700)" : "var(--rose-700)";
  const bg    = score >= 80 ? "var(--emerald-50)"  : score >= 50 ? "var(--amber-50)"  : "var(--rose-50)";
  return (
    <span
      className="inline-flex h-6 w-10 items-center justify-center rounded-full text-[11px] font-semibold tabular-nums"
      style={{ background: bg, color }}
    >
      {score}
    </span>
  );
}

function relativeTime(d: Date): string {
  const ms = Date.now() - d.getTime();
  const min = 60_000, hour = 60 * min, day = 24 * hour;
  if (ms < min) return "just now";
  if (ms < hour) return `${Math.floor(ms / min)}m`;
  if (ms < day)  return `${Math.floor(ms / hour)}h`;
  if (ms < 30 * day) return `${Math.floor(ms / day)}d`;
  return d.toLocaleDateString();
}

function humanSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
}

/* ── Bulk action toolbar ──────────────────────────────────── */

function BulkBar({
  selectedIds,
  onClear,
  canBulkWrite,
  canPlanChange,
  canHardDelete,
  canSuspend,
  canTag,
  canCoupon,
}: {
  selectedIds: string[];
  onClear: () => void;
  canBulkWrite: boolean;
  canPlanChange: boolean;
  canHardDelete: boolean;
  canSuspend: boolean;
  canTag: boolean;
  canCoupon: boolean;
}) {
  const [openModal, setOpenModal] = React.useState<null | "tag-add" | "tag-remove" | "suspend" | "reactivate" | "plan" | "coupon" | "csm" | "email" | "delete">(null);

  return (
    <>
      <div
        className="flex flex-wrap items-center gap-2 rounded-lg border px-3 py-2 text-[12px]"
        style={{ background: "var(--brand-50)", borderColor: "var(--brand-200)" }}
      >
        <strong style={{ color: "var(--brand-800)" }}>{selectedIds.length} selected</strong>
        <div className="mx-1 h-4 w-px" style={{ background: "var(--brand-200)" }} />
        {canTag && (
          <>
            <Button size="xs" variant="ghost" onClick={() => setOpenModal("tag-add")}>Add tag</Button>
            <Button size="xs" variant="ghost" onClick={() => setOpenModal("tag-remove")}>Remove tag</Button>
          </>
        )}
        {canSuspend && (
          <>
            <Button size="xs" variant="ghost" onClick={() => setOpenModal("suspend")}>Suspend</Button>
            <Button size="xs" variant="ghost" onClick={() => setOpenModal("reactivate")}>Reactivate</Button>
          </>
        )}
        {canPlanChange && (
          <Button size="xs" variant="ghost" onClick={() => setOpenModal("plan")}>Move plan</Button>
        )}
        {canCoupon && (
          <Button size="xs" variant="ghost" onClick={() => setOpenModal("coupon")}>Apply coupon</Button>
        )}
        {canBulkWrite && (
          <Button size="xs" variant="ghost" onClick={() => setOpenModal("csm")}>Assign CSM</Button>
        )}
        <Button size="xs" variant="ghost" onClick={() => setOpenModal("email")}>Email selected</Button>
        {canHardDelete && (
          <Button size="xs" variant="ghost" onClick={() => setOpenModal("delete")}>
            <span style={{ color: "var(--rose-700)" }}>Delete…</span>
          </Button>
        )}
        <div className="ml-auto">
          <Button size="xs" variant="ghost" onClick={onClear}>Clear selection</Button>
        </div>
      </div>

      {openModal && (
        <BulkModal
          kind={openModal}
          ids={selectedIds}
          onClose={() => setOpenModal(null)}
        />
      )}
    </>
  );
}

import { BulkModal } from "./BulkModal";
