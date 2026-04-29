import Link from "next/link";
import { db } from "@/lib/db";
import { requirePlatformStaff } from "@/lib/platform";
import { Icon } from "@/components/shell/icons";
import {
  formatMoney,
  SUPPORTED_CURRENCIES,
} from "@/lib/billing-currency";
import {
  createCoupon,
  archiveCoupon,
  reactivateCoupon,
  applyCouponToTenant,
  detachCouponFromTenant,
} from "@/app/actions/platform-billing";
import type { Coupon, CouponStatus } from "@prisma/client";

// /platform/billing/coupons — mint, list, archive, apply.
//
// Layout:
//   1. KPI band — Active · Drafts · Archived · Expiring 30d · Total redemptions
//   2. Mint form (admin only)
//   3. Coupons table (filter by status)
//   4. Tenants currently sitting on a coupon — quick detach
//
// We deliberately render "expired" coupons as ACTIVE-but-flagged
// rather than auto-changing the status server-side. That way a
// rolled-back validUntil restores the coupon without a separate
// "unarchive" step.

export const dynamic = "force-dynamic";

const STATUS_FILTERS = ["ALL", "ACTIVE", "DRAFT", "EXPIRED", "ARCHIVED"] as const;
type StatusFilter = (typeof STATUS_FILTERS)[number];

type SP = {
  ok?: string;
  error?: string;
  status?: string;
  q?: string;
};

const MESSAGES: Record<string, string> = {
  created:        "Coupon minted.",
  archived:       "Archived. Tenants on it have been detached.",
  reactivated:    "Coupon reactivated.",
  already_archived: "Already archived.",
  applied:        "Applied to tenant.",
  detached:       "Detached.",
  no_active_coupon: "Tenant didn't have an active coupon.",
};

export default async function CouponsPage({
  searchParams,
}: {
  searchParams: Promise<SP>;
}) {
  const ctx = await requirePlatformStaff();
  const sp = await searchParams;
  const canWrite = ctx.can("billing.coupon");

  const statusFilter: StatusFilter = (STATUS_FILTERS as readonly string[]).includes((sp.status ?? "ALL").toUpperCase())
    ? ((sp.status ?? "ALL").toUpperCase() as StatusFilter)
    : "ALL";
  const q = (sp.q ?? "").trim();

  const coupons = await db.coupon.findMany({
    where: {
      ...(statusFilter === "ALL" ? {} : { status: statusFilter as CouponStatus }),
      ...(q ? { OR: [
        { code: { contains: q, mode: "insensitive" } },
        { description: { contains: q, mode: "insensitive" } },
      ] } : {}),
    },
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
    take: 200,
    include: {
      _count: { select: { redemptions: true, activeForTenants: true } },
      createdBy: { select: { email: true, name: true } },
    },
  });

  const [activeCount, draftCount, archivedCount, expiringCount, redemptionTotal, applied] = await Promise.all([
    db.coupon.count({ where: { status: "ACTIVE" } }),
    db.coupon.count({ where: { status: "DRAFT" } }),
    db.coupon.count({ where: { status: "ARCHIVED" } }),
    db.coupon.count({
      where: {
        status: "ACTIVE",
        validUntil: { not: null, lt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) },
      },
    }),
    db.couponRedemption.count(),
    db.tenant.findMany({
      where: { activeCouponId: { not: null } },
      select: {
        id: true, name: true, slug: true, currency: true,
        activeCoupon: { select: { code: true, discountType: true, amount: true, currency: true } },
      },
      take: 50,
    }),
  ]);

  const tenantsForApply = await db.tenant.findMany({
    where: { status: { not: "ARCHIVED" } },
    select: { id: true, name: true, slug: true },
    orderBy: { name: "asc" },
    take: 500,
  });

  return (
    <div className="space-y-6">
      <Header />
      {sp.ok    ? <Toast tone="ok"    msg={MESSAGES[sp.ok] ?? "Done"} /> : null}
      {sp.error ? <Toast tone="error" msg={sp.error} /> : null}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <Kpi label="Active"            value={String(activeCount)} />
        <Kpi label="Drafts"            value={String(draftCount)} />
        <Kpi label="Archived"          value={String(archivedCount)} />
        <Kpi label="Expiring 30d"      value={String(expiringCount)} tone={expiringCount > 0 ? "warn" : "default"} />
        <Kpi label="Total redemptions" value={String(redemptionTotal)} />
      </div>

      <MintForm disabled={!canWrite} />

      <CouponsTable
        coupons={coupons}
        statusFilter={statusFilter}
        q={q}
        canWrite={canWrite}
        tenantsForApply={tenantsForApply}
      />

      {applied.length > 0 && (
        <AppliedTenants
          rows={applied}
          canWrite={canWrite}
        />
      )}
    </div>
  );
}

/* ────────────────────────────────────────────────────────────── */

function Header() {
  return (
    <div className="flex items-end justify-between gap-4">
      <div>
        <Link href="/platform/billing" className="text-[12px] underline" style={{ color: "var(--text-muted)" }}>
          ← Billing
        </Link>
        <h1 className="mt-1 text-[26px] font-semibold leading-tight" style={{ color: "var(--text-default)" }}>
          Coupons
        </h1>
        <p className="mt-1 text-[13px]" style={{ color: "var(--text-muted)" }}>
          Mint promo codes. Apply them to a tenant for the next manual invoice
          to land at a discount.
        </p>
      </div>
      <Link
        href="/platform/audit?action=platform.coupon_"
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

function Kpi({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: string;
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
      <div
        className="mt-1 text-[22px] font-semibold leading-none"
        style={{ color: tone === "warn" ? "var(--warning-fg)" : "var(--text-default)" }}
      >
        {value}
      </div>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────── */

function MintForm({ disabled }: { disabled: boolean }) {
  return (
    <section className="rounded-lg border" style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)" }}>
      <div className="border-b px-4 py-3" style={{ borderColor: "var(--border-subtle)" }}>
        <h2 className="text-[14px] font-semibold" style={{ color: "var(--text-default)" }}>
          Mint coupon
        </h2>
        <p className="text-[12px]" style={{ color: "var(--text-muted)" }}>
          PERCENT applies to whatever currency the tenant is invoiced in.
          FIXED locks to one currency.
        </p>
      </div>
      <form action={createCoupon} className="grid grid-cols-2 gap-3 p-4 md:grid-cols-4">
        <Field label="Code" required>
          <input
            type="text" name="code" required disabled={disabled}
            placeholder="LAUNCH2026"
            pattern="[A-Za-z0-9_\-]{3,32}"
            className="ts-focus w-full rounded-md border px-3 py-2 text-[13px]"
            style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)", color: "var(--text-default)" }}
          />
        </Field>
        <Field label="Type" required>
          <select
            name="discountType" required disabled={disabled}
            className="ts-focus w-full rounded-md border px-3 py-2 text-[13px]"
            style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)", color: "var(--text-default)" }}
          >
            <option value="PERCENT">% off</option>
            <option value="FIXED">Fixed amount off</option>
          </select>
        </Field>
        <Field label="Amount" hint="Percent (1-100) or minor units (cents)" required>
          <input
            type="number" name="amount" required min={1} disabled={disabled}
            placeholder="20"
            className="ts-focus w-full rounded-md border px-3 py-2 text-[13px]"
            style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)", color: "var(--text-default)" }}
          />
        </Field>
        <Field label="Currency" hint="Required for FIXED">
          <select
            name="currency" disabled={disabled}
            className="ts-focus w-full rounded-md border px-3 py-2 text-[13px]"
            style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)", color: "var(--text-default)" }}
          >
            <option value="">— (any)</option>
            {SUPPORTED_CURRENCIES.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </Field>
        <Field label="Description (internal)">
          <input
            type="text" name="description" disabled={disabled}
            placeholder="Q2 launch promo, NSP outreach"
            className="ts-focus w-full rounded-md border px-3 py-2 text-[13px]"
            style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)", color: "var(--text-default)" }}
          />
        </Field>
        <Field label="Applies to plans" hint="Comma-separated slugs; blank = any">
          <input
            type="text" name="appliesToPlans" disabled={disabled}
            placeholder="growth,pro"
            className="ts-focus w-full rounded-md border px-3 py-2 text-[13px]"
            style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)", color: "var(--text-default)" }}
          />
        </Field>
        <Field label="Max redemptions" hint="Blank = unlimited">
          <input
            type="number" name="maxRedemptions" min={1} disabled={disabled}
            placeholder="100"
            className="ts-focus w-full rounded-md border px-3 py-2 text-[13px]"
            style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)", color: "var(--text-default)" }}
          />
        </Field>
        <Field label="Valid until" hint="Blank = no expiry">
          <input
            type="date" name="validUntil" disabled={disabled}
            className="ts-focus w-full rounded-md border px-3 py-2 text-[13px]"
            style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)", color: "var(--text-default)" }}
          />
        </Field>
        <div className="md:col-span-4 flex items-end justify-between gap-3">
          <div className="text-[11px]" style={{ color: "var(--text-muted)" }}>
            New coupons default to <strong>ACTIVE</strong> and start working immediately.
          </div>
          <button
            type="submit" disabled={disabled}
            className="ts-focus rounded-md px-4 py-2 text-[13px] font-medium disabled:cursor-not-allowed disabled:opacity-50"
            style={{ background: "var(--accent-primary)", color: "var(--accent-on-primary)" }}
          >
            Mint coupon
          </button>
        </div>
      </form>
    </section>
  );
}

/* ────────────────────────────────────────────────────────────── */

type CouponWithCounts = Coupon & {
  _count: { redemptions: number; activeForTenants: number };
  createdBy: { email: string; name: string | null };
};

function CouponsTable({
  coupons,
  statusFilter,
  q,
  canWrite,
  tenantsForApply,
}: {
  coupons: CouponWithCounts[];
  statusFilter: StatusFilter;
  q: string;
  canWrite: boolean;
  tenantsForApply: { id: string; name: string; slug: string }[];
}) {
  return (
    <section className="rounded-lg border" style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)" }}>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3" style={{ borderColor: "var(--border-subtle)" }}>
        <h2 className="text-[14px] font-semibold" style={{ color: "var(--text-default)" }}>
          Coupons ({coupons.length})
        </h2>
        <form className="flex items-center gap-2">
          <input
            type="search" name="q" defaultValue={q}
            placeholder="Search code or description"
            className="ts-focus rounded-md border px-3 py-1.5 text-[12px]"
            style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)", color: "var(--text-default)" }}
          />
          <select
            name="status" defaultValue={statusFilter}
            className="ts-focus rounded-md border px-2 py-1.5 text-[12px]"
            style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)", color: "var(--text-default)" }}
          >
            {STATUS_FILTERS.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <button type="submit" className="ts-focus rounded-md border px-3 py-1.5 text-[12px]" style={{ borderColor: "var(--border-subtle)", color: "var(--text-default)" }}>
            Filter
          </button>
        </form>
      </div>
      {coupons.length === 0 ? (
        <div className="px-4 py-8 text-center text-[13px]" style={{ color: "var(--text-muted)" }}>
          No coupons match those filters.
        </div>
      ) : (
        <div className="divide-y" style={{ borderColor: "var(--border-subtle)" }}>
          {coupons.map((c) => (
            <CouponRow key={c.id} coupon={c} canWrite={canWrite} tenants={tenantsForApply} />
          ))}
        </div>
      )}
    </section>
  );
}

function CouponRow({
  coupon,
  canWrite,
  tenants,
}: {
  coupon: CouponWithCounts;
  canWrite: boolean;
  tenants: { id: string; name: string; slug: string }[];
}) {
  const expired = coupon.validUntil ? coupon.validUntil < new Date() : false;
  const capped = coupon.maxRedemptions != null && coupon.redeemedCount >= coupon.maxRedemptions;

  return (
    <div className="grid grid-cols-1 gap-3 px-4 py-4 md:grid-cols-[1.5fr_1fr_1fr_auto]">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <code
            className="rounded px-1.5 py-0.5 text-[12px] font-semibold"
            style={{ background: "var(--surface-2)", color: "var(--text-default)", border: "1px solid var(--border-subtle)" }}
          >
            {coupon.code}
          </code>
          <StatusChip status={coupon.status} expired={expired} />
        </div>
        {coupon.description && (
          <div className="mt-1 truncate text-[12px]" style={{ color: "var(--text-muted)" }}>
            {coupon.description}
          </div>
        )}
        <div className="mt-1 text-[11px]" style={{ color: "var(--text-muted)" }}>
          By {coupon.createdBy.name || coupon.createdBy.email} · {coupon.createdAt.toLocaleDateString()}
        </div>
      </div>

      <div className="text-[12px]" style={{ color: "var(--text-default)" }}>
        <div>
          <strong>
            {coupon.discountType === "PERCENT"
              ? `${coupon.amount}% off`
              : formatMoney(coupon.amount, coupon.currency ?? "USD") + " off"}
          </strong>
        </div>
        <div className="text-[11px]" style={{ color: "var(--text-muted)" }}>
          {coupon.appliesToPlans.length === 0 ? "Any plan" : "Plans: " + coupon.appliesToPlans.join(", ")}
        </div>
        {coupon.validUntil && (
          <div className="text-[11px]" style={{ color: expired ? "var(--danger-fg)" : "var(--text-muted)" }}>
            {expired ? "Expired" : "Until"} {coupon.validUntil.toLocaleDateString()}
          </div>
        )}
      </div>

      <div className="text-[12px]" style={{ color: "var(--text-muted)" }}>
        <div><span style={{ color: "var(--text-default)" }}>Redemptions</span> · {coupon.redeemedCount}{coupon.maxRedemptions ? ` / ${coupon.maxRedemptions}` : ""}</div>
        <div><span style={{ color: "var(--text-default)" }}>On tenants</span> · {coupon._count.activeForTenants}</div>
        {capped && (
          <div className="text-[11px]" style={{ color: "var(--danger-fg)" }}>Cap reached</div>
        )}
      </div>

      <div className="flex flex-wrap items-end gap-2">
        {canWrite && coupon.status === "ACTIVE" && !expired && !capped && (
          <details className="group">
            <summary
              className="ts-focus cursor-pointer list-none rounded-md border px-2.5 py-1.5 text-[12px] font-medium"
              style={{ borderColor: "var(--accent-primary)", color: "var(--accent-primary)", background: "var(--surface-1)" }}
            >
              Apply ↪
            </summary>
            <form
              action={applyCouponToTenant.bind(null, coupon.id)}
              className="absolute z-10 mt-2 w-[300px] rounded-lg border p-3 shadow-lg"
              style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)" }}
            >
              <Field label="Tenant" required>
                <select
                  name="tenantId" required
                  className="ts-focus w-full rounded-md border px-2 py-1.5 text-[13px]"
                  style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)", color: "var(--text-default)" }}
                >
                  {tenants.map((t) => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
                </select>
              </Field>
              <button type="submit" className="ts-focus mt-2 w-full rounded-md px-3 py-1.5 text-[12px] font-medium" style={{ background: "var(--accent-primary)", color: "var(--accent-on-primary)" }}>
                Apply
              </button>
            </form>
          </details>
        )}
        {canWrite && coupon.status === "ARCHIVED" && (
          <form action={reactivateCoupon.bind(null, coupon.id)}>
            <button
              type="submit"
              className="ts-focus rounded-md border px-2.5 py-1.5 text-[12px] font-medium"
              style={{ borderColor: "var(--border-subtle)", color: "var(--text-default)", background: "var(--surface-1)" }}
            >
              Reactivate
            </button>
          </form>
        )}
        {canWrite && coupon.status !== "ARCHIVED" && (
          <form action={archiveCoupon.bind(null, coupon.id)}>
            <button
              type="submit"
              className="ts-focus rounded-md border px-2.5 py-1.5 text-[12px] font-medium"
              style={{ borderColor: "var(--border-subtle)", color: "var(--danger-fg)", background: "var(--surface-1)" }}
            >
              Archive
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

function StatusChip({ status, expired }: { status: CouponStatus; expired: boolean }) {
  const palette =
    expired                  ? { bg: "var(--danger-surface)", fg: "var(--danger-fg)",      label: "EXPIRED" } :
    status === "ACTIVE"      ? { bg: "var(--accent-surface)", fg: "var(--accent-primary)", label: "ACTIVE" } :
    status === "DRAFT"       ? { bg: "var(--surface-2)",      fg: "var(--text-muted)",     label: "DRAFT" } :
    status === "ARCHIVED"    ? { bg: "var(--surface-2)",      fg: "var(--text-muted)",     label: "ARCHIVED" } :
                               { bg: "var(--warning-surface)",fg: "var(--warning-fg)",     label: status };
  return (
    <span
      className="rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
      style={{ background: palette.bg, color: palette.fg, border: `1px solid ${palette.fg}` }}
    >
      {palette.label}
    </span>
  );
}

/* ────────────────────────────────────────────────────────────── */

function AppliedTenants({
  rows,
  canWrite,
}: {
  rows: {
    id: string;
    name: string;
    slug: string;
    currency: string;
    activeCoupon: { code: string; discountType: "PERCENT" | "FIXED"; amount: number; currency: string | null } | null;
  }[];
  canWrite: boolean;
}) {
  return (
    <section className="rounded-lg border" style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)" }}>
      <div className="border-b px-4 py-3" style={{ borderColor: "var(--border-subtle)" }}>
        <h2 className="text-[14px] font-semibold" style={{ color: "var(--text-default)" }}>
          Tenants currently sitting on a coupon ({rows.length})
        </h2>
        <p className="text-[12px]" style={{ color: "var(--text-muted)" }}>
          The discount applies on the next manual invoice we issue them.
        </p>
      </div>
      <ul className="divide-y" style={{ borderColor: "var(--border-subtle)" }}>
        {rows.map((r) => {
          if (!r.activeCoupon) return null;
          const discountStr = r.activeCoupon.discountType === "PERCENT"
            ? `${r.activeCoupon.amount}% off`
            : `${formatMoney(r.activeCoupon.amount, r.activeCoupon.currency ?? r.currency)} off`;
          return (
            <li key={r.id} className="flex flex-wrap items-center gap-3 px-4 py-3 text-[13px]">
              <Link
                href={`/platform/tenants/${r.id}`}
                className="ts-focus min-w-0 flex-1 truncate font-medium hover:underline"
                style={{ color: "var(--text-default)" }}
              >
                {r.name}
              </Link>
              <code className="rounded px-1.5 py-0.5 text-[11px]" style={{ background: "var(--surface-2)", color: "var(--text-default)", border: "1px solid var(--border-subtle)" }}>
                {r.activeCoupon.code}
              </code>
              <span className="text-[12px]" style={{ color: "var(--text-muted)" }}>
                {discountStr}
              </span>
              {canWrite && (
                <form action={detachCouponFromTenant.bind(null, r.id)}>
                  <button
                    type="submit"
                    className="ts-focus rounded-md border px-2.5 py-1 text-[11px] font-medium"
                    style={{ borderColor: "var(--border-subtle)", color: "var(--text-muted)", background: "var(--surface-1)" }}
                  >
                    Detach
                  </button>
                </form>
              )}
            </li>
          );
        })}
      </ul>
    </section>
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
