import Link from "next/link";
import { db } from "@/lib/db";
import { requirePlatformStaff } from "@/lib/platform";
import type { Prisma } from "@prisma/client";

// /platform/audit — audit-log viewer (transformation rewrite).
//
// Layout:
//   1. Header
//   2. KPI band — Total · Today · 7d · Platform-only · Tenant-only
//   3. Filter form (search + tenant/user/action/scope/date range)
//   4. Scope quick-filter chips (URL-driven)
//   5. Polished event table with severity dots, action prefix colour,
//      tenant + actor lookups, pagination
//
// All append-only — read-only viewer. Filters are GET params so an
// admin can share a deep link to a specific slice ("every suspension
// in the last 30d").

const PAGE_SIZE = 100;
const DAY_MS = 86_400_000;

const SCOPE_KEYS = ["all", "platform", "tenant"] as const;
type ScopeKey = (typeof SCOPE_KEYS)[number];

export default async function PlatformAuditPage({
  searchParams,
}: {
  searchParams: Promise<{
    tenantId?: string;
    userId?: string;
    action?: string;
    scope?: string;
    since?: string;
    until?: string;
    page?: string;
  }>;
}) {
  await requirePlatformStaff();
  const sp = await searchParams;

  const scope: ScopeKey = (SCOPE_KEYS as readonly string[]).includes(sp.scope ?? "")
    ? (sp.scope as ScopeKey)
    : "all";

  // ── Build the where clause from the URL ─────────────────────
  const where: Prisma.AuditLogWhereInput = {};
  if (sp.tenantId) where.tenantId = sp.tenantId;
  if (sp.userId)   where.userId   = sp.userId;

  if (sp.action) {
    where.action = { startsWith: sp.action };
  }
  if (scope === "platform") {
    where.action = { startsWith: "platform." };
  } else if (scope === "tenant") {
    where.NOT = { action: { startsWith: "platform." } };
  }

  const createdAt: Prisma.DateTimeFilter = {};
  if (sp.since) {
    const d = new Date(sp.since);
    if (!Number.isNaN(d.getTime())) createdAt.gte = d;
  }
  if (sp.until) {
    const d = new Date(sp.until);
    if (!Number.isNaN(d.getTime())) createdAt.lt = d;
  }
  if (createdAt.gte || createdAt.lt) where.createdAt = createdAt;

  const page = Math.max(1, Number(sp.page) || 1);
  const skip = (page - 1) * PAGE_SIZE;

  // ── Time windows for KPIs ───────────────────────────────────
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const last7d = new Date(now.getTime() - 7 * DAY_MS);

  // ── Parallel data fetch ─────────────────────────────────────
  const [rows, total, totalAll, totalToday, total7d, totalPlatform, totalTenant] = await Promise.all([
    db.auditLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip,
      take: PAGE_SIZE,
    }),
    db.auditLog.count({ where }),
    db.auditLog.count(),
    db.auditLog.count({ where: { createdAt: { gte: startOfToday } } }),
    db.auditLog.count({ where: { createdAt: { gte: last7d } } }),
    db.auditLog.count({ where: { action: { startsWith: "platform." } } }),
    db.auditLog.count({ where: { NOT: { action: { startsWith: "platform." } } } }),
  ]);

  // ── Decorate ───────────────────────────────────────────────
  const tenantIds = Array.from(new Set(rows.map((r) => r.tenantId).filter((x): x is string => Boolean(x))));
  const userIds   = Array.from(new Set(rows.map((r) => r.userId).filter((x): x is string => Boolean(x))));
  const [tenants, users] = await Promise.all([
    tenantIds.length
      ? db.tenant.findMany({ where: { id: { in: tenantIds } }, select: { id: true, name: true, slug: true } })
      : Promise.resolve([] as { id: string; name: string; slug: string }[]),
    userIds.length
      ? db.user.findMany({ where: { id: { in: userIds } }, select: { id: true, email: true, name: true, platformRole: true } })
      : Promise.resolve([] as { id: string; email: string; name: string | null; platformRole: string | null }[]),
  ]);
  const tenantById = new Map(tenants.map((t) => [t.id, t]));
  const userById   = new Map(users.map((u) => [u.id, u]));

  const hasNext = skip + rows.length < total;
  const hasPrev = page > 1;

  // Build a same-search querystring with one param overridden.
  const buildHref = (overrides: Record<string, string | number | undefined>): string => {
    const u = new URLSearchParams();
    for (const [k, v] of Object.entries(sp)) {
      if (v === undefined || v === "" || v === null) continue;
      u.set(k, String(v));
    }
    for (const [k, v] of Object.entries(overrides)) {
      if (v === undefined || v === "" || v === null) u.delete(k);
      else u.set(k, String(v));
    }
    const qs = u.toString();
    return qs ? `/platform/audit?${qs}` : "/platform/audit";
  };

  return (
    <div className="space-y-6">
      {/* ── Header ─────────────────────────────────────── */}
      <div>
        <h1 className="text-2xl font-semibold tracking-tight" style={{ color: "var(--text-default)" }}>
          Audit log
        </h1>
        <p className="mt-1 text-sm" style={{ color: "var(--text-muted)" }}>
          Append-only event stream across every tenant + every platform action.
          Filters are URL-driven so views are link-shareable.
        </p>
      </div>

      {/* ── KPI band ───────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-5">
        <Stat label="Total events"   value={totalAll.toLocaleString()}      hint="All-time" />
        <Stat label="Today"          value={totalToday.toLocaleString()}    hint="Since midnight UTC" tone="accent" />
        <Stat label="Last 7 days"    value={total7d.toLocaleString()}       hint="Rolling window" />
        <Stat label="Platform staff" value={totalPlatform.toLocaleString()} hint="platform.* actions" tone="warning" />
        <Stat label="Tenant scope"   value={totalTenant.toLocaleString()}   hint="Everything else" />
      </div>

      {/* ── Filter form ────────────────────────────────── */}
      <Section title="Filters" description={`${total.toLocaleString()} ${total === 1 ? "event" : "events"} match the current filter`}>
        <form className="grid grid-cols-1 gap-3 md:grid-cols-3 lg:grid-cols-6" method="get">
          <FilterField label="Tenant ID"     name="tenantId" defaultValue={sp.tenantId ?? ""} placeholder="cuid"             mono />
          <FilterField label="User ID"       name="userId"   defaultValue={sp.userId   ?? ""} placeholder="cuid"             mono />
          <FilterField label="Action prefix" name="action"   defaultValue={sp.action   ?? ""} placeholder="team. or platform." mono />
          <FilterSelect
            label="Scope"
            name="scope"
            defaultValue={scope}
            options={[
              { value: "all",      label: "All" },
              { value: "platform", label: "Platform staff only" },
              { value: "tenant",   label: "Tenant only" },
            ]}
          />
          <FilterField label="Since (UTC)" name="since" type="date" defaultValue={sp.since ?? ""} />
          <FilterField label="Until (UTC)" name="until" type="date" defaultValue={sp.until ?? ""} />

          <div className="col-span-full flex flex-wrap items-center gap-2">
            <button
              type="submit"
              className="ts-focus rounded-md px-4 py-2 text-sm font-medium"
              style={{ background: "var(--accent-primary)", color: "var(--accent-fg)" }}
            >
              Apply
            </button>
            {(sp.tenantId || sp.userId || sp.action || sp.scope || sp.since || sp.until) && (
              <Link
                href="/platform/audit"
                className="rounded-md px-3 py-2 text-xs"
                style={{ color: "var(--text-muted)", border: "1px solid var(--border-default)" }}
              >
                Clear all
              </Link>
            )}
          </div>
        </form>
      </Section>

      {/* ── Scope chips ────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs" style={{ color: "var(--text-muted)" }}>Quick scope:</span>
        <ScopeChip label="All"               active={scope === "all"}      href={buildHref({ scope: undefined, page: undefined })} count={totalAll} />
        <ScopeChip label="Platform staff"    active={scope === "platform"} href={buildHref({ scope: "platform", page: undefined })} count={totalPlatform} tone="warning" />
        <ScopeChip label="Tenant"            active={scope === "tenant"}   href={buildHref({ scope: "tenant",   page: undefined })} count={totalTenant} />
      </div>

      {/* ── Events table ───────────────────────────────── */}
      <div
        className="overflow-hidden rounded-xl"
        style={{
          background: "var(--surface-1)",
          border: "1px solid var(--border-subtle)",
          boxShadow: "var(--shadow-sm)",
        }}
      >
        {rows.length === 0 ? (
          <div className="px-6 py-12 text-center text-sm" style={{ color: "var(--text-muted)" }}>
            <div className="mb-1 text-2xl" aria-hidden>📜</div>
            <div className="font-medium" style={{ color: "var(--text-default)" }}>
              No events match the current filters.
            </div>
            <Link href="/platform/audit" className="mt-2 inline-block text-xs underline">
              Clear filters
            </Link>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead style={{ color: "var(--text-muted)", background: "var(--surface-2)" }}>
                <tr className="text-left">
                  <Th>When (UTC)</Th>
                  <Th>Action</Th>
                  <Th>Tenant</Th>
                  <Th>Actor</Th>
                  <Th>Entity</Th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, idx) => {
                  const tenant = r.tenantId ? tenantById.get(r.tenantId) : null;
                  const user = r.userId ? userById.get(r.userId) : null;
                  const isPlatform = r.action.startsWith("platform.");
                  const sev = severity(r.action);
                  return (
                    <tr key={r.id} style={{ borderTop: idx === 0 ? "none" : "1px solid var(--border-subtle)" }}>
                      <Td className="font-mono text-xs whitespace-nowrap" style={{ color: "var(--text-muted)" }}>
                        {r.createdAt.toISOString().replace("T", " ").slice(0, 19)}
                      </Td>
                      <Td>
                        <div className="flex items-center gap-2">
                          <span
                            aria-hidden
                            className="inline-block h-1.5 w-1.5 shrink-0 rounded-full"
                            style={{ background: SEV_COLOR[sev] }}
                          />
                          <span
                            className="font-mono text-xs"
                            style={{ color: isPlatform ? "var(--accent-primary)" : "var(--text-default)" }}
                          >
                            {r.action}
                          </span>
                          {isPlatform && (
                            <span
                              className="rounded-full px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
                              style={{ background: "var(--accent-surface)", color: "var(--accent-primary)" }}
                            >
                              platform
                            </span>
                          )}
                        </div>
                      </Td>
                      <Td>
                        {tenant ? (
                          <Link
                            href={`/platform/tenants/${tenant.id}`}
                            className="text-xs underline"
                            style={{ color: "var(--text-default)" }}
                          >
                            {tenant.name}
                          </Link>
                        ) : (
                          <span className="text-xs" style={{ color: "var(--text-faint)" }}>— platform —</span>
                        )}
                      </Td>
                      <Td>
                        {user ? (
                          <div className="text-xs">
                            <span style={{ color: "var(--text-default)" }}>{user.name ?? user.email}</span>
                            {user.platformRole && (
                              <span className="ml-1.5 rounded-full px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide"
                                style={{ background: "var(--accent-surface)", color: "var(--accent-primary)" }}
                              >
                                {user.platformRole.toLowerCase().replace("_", " ")}
                              </span>
                            )}
                          </div>
                        ) : (
                          <span className="text-xs" style={{ color: "var(--text-faint)" }}>system</span>
                        )}
                      </Td>
                      <Td className="font-mono text-xs" style={{ color: "var(--text-muted)" }}>
                        {r.entityType ?? <span style={{ color: "var(--text-faint)" }}>—</span>}
                        {r.entityId ? <span style={{ color: "var(--text-faint)" }}> · {r.entityId.slice(0, 8)}</span> : null}
                      </Td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        <div
          className="flex items-center justify-between px-5 py-3 text-xs"
          style={{ borderTop: "1px solid var(--border-subtle)", color: "var(--text-muted)" }}
        >
          <span>
            Page <b style={{ color: "var(--text-default)" }}>{page}</b> · showing{" "}
            {rows.length === 0 ? 0 : skip + 1}–{skip + rows.length} of {total.toLocaleString()}
          </span>
          <div className="flex items-center gap-1">
            <PageLink href={hasPrev ? buildHref({ page: page - 1 }) : null}>‹ Previous</PageLink>
            <PageLink href={hasNext ? buildHref({ page: page + 1 }) : null}>Next ›</PageLink>
          </div>
        </div>
      </div>

      <p className="text-xs" style={{ color: "var(--text-faint)" }}>
        Audit log is append-only — events can never be edited or deleted from this UI. Drop into{" "}
        <Link href="/platform/health" className="underline">/platform/health</Link>{" "}
        for a unified live feed of recent audit + security + email events.
      </p>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────── */

// Severity is a heuristic — we don't store it on AuditLog, but most
// actions can be classified by their name alone. Lets the table show
// a colored dot per row so an eye can scan for risk quickly.
function severity(action: string): "info" | "warning" | "danger" {
  if (/(deleted|suspended|archive|drop|destroy)/i.test(action)) return "danger";
  if (/(impersonat|status|password|2fa|feature_flag|email|role)/i.test(action)) return "warning";
  return "info";
}

const SEV_COLOR: Record<"info" | "warning" | "danger", string> = {
  info:    "var(--accent-primary)",
  warning: "var(--warning-fg)",
  danger:  "var(--danger-fg)",
};

function Stat({
  label,
  value,
  hint,
  tone = "default",
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "default" | "accent" | "warning";
}) {
  const palette =
    tone === "accent"  ? { bg: "var(--accent-surface)",  border: "var(--accent-primary)", label: "var(--accent-primary)" } :
    tone === "warning" ? { bg: "var(--warning-surface)", border: "var(--warning-fg)",     label: "var(--warning-fg)"     } :
                          { bg: "var(--surface-1)",       border: "var(--border-subtle)",  label: "var(--text-muted)"     };
  return (
    <div
      className="rounded-xl p-4"
      style={{ background: palette.bg, border: `1px solid ${palette.border}`, boxShadow: "var(--shadow-sm)" }}
    >
      <div className="text-xs font-medium uppercase tracking-wide" style={{ color: palette.label }}>
        {label}
      </div>
      <div className="mt-2 text-2xl font-semibold tabular-nums tracking-tight" style={{ color: "var(--text-default)" }}>
        {value}
      </div>
      {hint && <div className="mt-1 text-xs" style={{ color: "var(--text-muted)" }}>{hint}</div>}
    </div>
  );
}

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section
      className="overflow-hidden rounded-xl"
      style={{
        background: "var(--surface-1)",
        border: "1px solid var(--border-subtle)",
        boxShadow: "var(--shadow-sm)",
      }}
    >
      <header
        className="flex items-baseline justify-between gap-3 px-5 py-3"
        style={{ borderBottom: "1px solid var(--border-subtle)" }}
      >
        <h2 className="text-sm font-semibold" style={{ color: "var(--text-default)" }}>
          {title}
        </h2>
        {description && (
          <span className="text-xs" style={{ color: "var(--text-muted)" }}>{description}</span>
        )}
      </header>
      <div className="p-5">{children}</div>
    </section>
  );
}

function FilterField({
  label,
  name,
  defaultValue,
  placeholder,
  type = "text",
  mono,
}: {
  label: string;
  name: string;
  defaultValue?: string;
  placeholder?: string;
  type?: string;
  mono?: boolean;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs font-medium" style={{ color: "var(--text-muted)" }}>{label}</span>
      <input
        type={type}
        name={name}
        defaultValue={defaultValue}
        placeholder={placeholder}
        className={`ts-focus rounded-md px-3 py-2 text-sm outline-none ${mono ? "font-mono text-xs" : ""}`}
        style={{
          background: "var(--surface-1)",
          border: "1px solid var(--border-default)",
          color: "var(--text-default)",
        }}
      />
    </label>
  );
}

function FilterSelect({
  label,
  name,
  defaultValue,
  options,
}: {
  label: string;
  name: string;
  defaultValue: string;
  options: { value: string; label: string }[];
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs font-medium" style={{ color: "var(--text-muted)" }}>{label}</span>
      <select
        name={name}
        defaultValue={defaultValue}
        className="ts-focus rounded-md px-3 py-2 text-sm outline-none"
        style={{
          background: "var(--surface-1)",
          border: "1px solid var(--border-default)",
          color: "var(--text-default)",
        }}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function ScopeChip({
  label,
  count,
  active,
  href,
  tone = "default",
}: {
  label: string;
  count: number;
  active: boolean;
  href: string;
  tone?: "default" | "warning";
}) {
  const idleFg = tone === "warning" ? "var(--warning-fg)" : "var(--text-default)";
  return (
    <Link
      href={href}
      className="ts-focus inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition-colors"
      style={{
        background: active ? "var(--accent-primary)" : "var(--surface-1)",
        color:      active ? "var(--accent-fg)"      : idleFg,
        border: `1px solid ${active ? "var(--accent-primary)" : "var(--border-default)"}`,
      }}
    >
      {label}
      <span
        className="rounded-full px-1.5 py-0.5 text-[10px] tabular-nums"
        style={{
          background: active ? "rgba(0,0,0,0.18)" : "var(--surface-2)",
          color:      active ? "var(--accent-fg)" : "var(--text-muted)",
        }}
      >
        {count.toLocaleString()}
      </span>
    </Link>
  );
}

function PageLink({ href, children }: { href: string | null; children: React.ReactNode }) {
  if (!href) {
    return (
      <span
        className="rounded-md px-3 py-1.5"
        style={{
          color: "var(--text-faint)",
          border: "1px solid var(--border-subtle)",
          opacity: 0.5,
        }}
      >
        {children}
      </span>
    );
  }
  return (
    <Link
      href={href}
      className="ts-focus rounded-md px-3 py-1.5 transition-colors"
      style={{ color: "var(--text-default)", border: "1px solid var(--border-default)" }}
    >
      {children}
    </Link>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th className="px-5 py-2.5 text-[10px] font-semibold uppercase tracking-wide">
      {children}
    </th>
  );
}

function Td({
  children,
  className,
  style,
}: {
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <td className={`px-5 py-3 align-top ${className ?? ""}`} style={style}>
      {children}
    </td>
  );
}
