import Link from "next/link";
import { db } from "@/lib/db";
import { requirePlatformStaff } from "@/lib/platform";
import { Icon } from "@/components/shell/icons";
import {
  formatMoney,
  SUPPORTED_CURRENCIES,
} from "@/lib/billing-currency";
import {
  createPlatformInvoice,
  sendPlatformInvoice,
  markPlatformInvoicePaid,
  voidPlatformInvoice,
} from "@/app/actions/platform-billing";
import type { PlatformInvoiceStatus } from "@prisma/client";

// /platform/billing/invoices — admin-issued (manual) invoices.
//
// Layout:
//   1. KPI band — Drafts · Sent · Paid · Overdue · Total billed (USD)
//   2. Compose form (admin only)
//   3. Invoices table (filter by status)
//
// We keep compose inline-on-page (no nested route) because the form is
// only ~10 fields and a page-flip would feel heavy for what's usually
// "send John a $X invoice for the migration help we did last week."

export const dynamic = "force-dynamic";

const STATUS_FILTERS = ["ALL", "DRAFT", "SENT", "PAID", "VOIDED", "REFUNDED"] as const;
type StatusFilter = (typeof STATUS_FILTERS)[number];

type SP = {
  ok?: string;
  error?: string;
  status?: string;
  q?: string;
};

const MESSAGES: Record<string, string> = {
  created: "Invoice drafted. Review the line items, then click Send.",
  sent: "Invoice sent. Coupon redemption (if any) was recorded.",
  paid: "Invoice marked paid.",
  voided: "Invoice voided.",
  already_void: "Invoice was already voided.",
};

export default async function InvoicesPage({
  searchParams,
}: {
  searchParams: Promise<SP>;
}) {
  const ctx = await requirePlatformStaff();
  const sp = await searchParams;
  const canWrite  = ctx.can("billing.invoice");
  const canRefund = ctx.can("billing.refund");

  const statusFilter: StatusFilter = (STATUS_FILTERS as readonly string[]).includes((sp.status ?? "ALL").toUpperCase())
    ? ((sp.status ?? "ALL").toUpperCase() as StatusFilter)
    : "ALL";
  const q = (sp.q ?? "").trim();

  const [invoices, kpi, tenantsForCompose] = await Promise.all([
    db.platformBillingInvoice.findMany({
      where: {
        ...(statusFilter === "ALL" ? {} : { status: statusFilter as PlatformInvoiceStatus }),
        ...(q ? {
          OR: [
            { number: { contains: q, mode: "insensitive" } },
            { tenant: { name: { contains: q, mode: "insensitive" } } },
          ],
        } : {}),
      },
      include: {
        tenant: { select: { id: true, name: true, slug: true } },
        items: { select: { id: true, description: true, quantity: true, unitAmount: true, lineTotal: true } },
        createdBy: { select: { email: true } },
      },
      orderBy: [{ status: "asc" }, { createdAt: "desc" }],
      take: 200,
    }),
    Promise.all([
      db.platformBillingInvoice.count({ where: { status: "DRAFT" } }),
      db.platformBillingInvoice.count({ where: { status: "SENT" } }),
      db.platformBillingInvoice.count({ where: { status: "PAID" } }),
      db.platformBillingInvoice.count({
        where: { status: "SENT", dueAt: { lt: new Date() } },
      }),
      db.platformBillingInvoice.aggregate({
        where: { status: { in: ["SENT", "PAID"] } },
        _sum: { total: true },
      }),
    ]),
    db.tenant.findMany({
      where: { status: { not: "ARCHIVED" } },
      select: { id: true, name: true, currency: true },
      orderBy: { name: "asc" },
      take: 500,
    }),
  ]);

  const [drafts, sent, paid, overdue, totalAgg] = kpi;
  const totalBilled = totalAgg._sum.total ?? 0;

  return (
    <div className="space-y-6">
      <Header />
      {sp.ok    ? <Toast tone="ok"    msg={MESSAGES[sp.ok] ?? "Done"} /> : null}
      {sp.error ? <Toast tone="error" msg={sp.error} /> : null}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <Kpi label="Drafts"  value={String(drafts)} />
        <Kpi label="Sent"    value={String(sent)} />
        <Kpi label="Paid"    value={String(paid)} />
        <Kpi label="Overdue" value={String(overdue)} tone={overdue > 0 ? "danger" : "default"} />
        <Kpi label="Billed (issued)" value={`$${(totalBilled / 100).toLocaleString("en-US", { maximumFractionDigits: 0 })}`} hint="Sum of total on SENT+PAID. Mixed-currency: assumes invoice currency is USD." />
      </div>

      <ComposeForm tenants={tenantsForCompose} disabled={!canWrite} />

      <InvoicesTable
        invoices={invoices}
        statusFilter={statusFilter}
        q={q}
        canWrite={canWrite}
        canRefund={canRefund}
      />
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
          Manual invoices
        </h1>
        <p className="mt-1 text-[13px]" style={{ color: "var(--text-muted)" }}>
          One-off invoices for custom enterprise terms, setup fees, or anything
          outside the recurring Stripe subscription cycle. Stripe sync is a
          follow-up — invoices live locally for now.
        </p>
      </div>
      <Link
        href="/platform/audit?action=platform.invoice_"
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
  hint,
  tone = "default",
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "default" | "warn" | "danger";
}) {
  const color = tone === "danger" ? "var(--danger-fg)"
    : tone === "warn" ? "var(--warning-fg)"
    : "var(--text-default)";
  return (
    <div
      className="rounded-lg border px-4 py-3"
      style={{ background: "var(--surface-1)", borderColor: tone === "danger" ? "var(--danger-fg)" : tone === "warn" ? "var(--warning-fg)" : "var(--border-subtle)" }}
    >
      <div className="text-[11px] font-medium uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>
        {label}
      </div>
      <div className="mt-1 text-[22px] font-semibold leading-none" style={{ color }}>{value}</div>
      {hint && (
        <div className="mt-1 text-[10px]" style={{ color: "var(--text-muted)" }}>{hint}</div>
      )}
    </div>
  );
}

/* ────────────────────────────────────────────────────────────── */

function ComposeForm({
  tenants,
  disabled,
}: {
  tenants: { id: string; name: string; currency: string }[];
  disabled: boolean;
}) {
  return (
    <section className="rounded-lg border" style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)" }}>
      <div className="border-b px-4 py-3" style={{ borderColor: "var(--border-subtle)" }}>
        <h2 className="text-[14px] font-semibold" style={{ color: "var(--text-default)" }}>
          New invoice
        </h2>
        <p className="text-[12px]" style={{ color: "var(--text-muted)" }}>
          Amounts are in <strong>minor units</strong> — cents for USD/EUR/GBP,
          yen for JPY. So $25.00 = 2500.
        </p>
      </div>
      <form action={createPlatformInvoice} className="space-y-4 p-4">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <Field label="Tenant" required>
            <select
              name="tenantId" required disabled={disabled}
              className="ts-focus w-full rounded-md border px-3 py-2 text-[13px]"
              style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)", color: "var(--text-default)" }}
            >
              {tenants.map((t) => (
                <option key={t.id} value={t.id}>{t.name} ({t.currency})</option>
              ))}
            </select>
          </Field>
          <Field label="Currency" required>
            <select
              name="currency" required disabled={disabled} defaultValue="USD"
              className="ts-focus w-full rounded-md border px-3 py-2 text-[13px]"
              style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)", color: "var(--text-default)" }}
            >
              {SUPPORTED_CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </Field>
          <Field label="Due" hint="Optional">
            <input
              type="date" name="dueAt" disabled={disabled}
              className="ts-focus w-full rounded-md border px-3 py-2 text-[13px]"
              style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)", color: "var(--text-default)" }}
            />
          </Field>
        </div>

        {/* Line items — three rows by default; admin can leave any blank. */}
        <div>
          <div className="text-[11px] font-medium uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>
            Line items
          </div>
          <div className="mt-2 space-y-2">
            {[0, 1, 2].map((i) => (
              <div key={i} className="grid grid-cols-12 gap-2">
                <input
                  name="itemDescription" placeholder="Description"
                  disabled={disabled}
                  className="ts-focus col-span-7 rounded-md border px-3 py-2 text-[13px]"
                  style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)", color: "var(--text-default)" }}
                />
                <input
                  name="itemQuantity" type="number" min={1} defaultValue={1}
                  disabled={disabled}
                  className="ts-focus col-span-2 rounded-md border px-3 py-2 text-[13px]"
                  style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)", color: "var(--text-default)" }}
                />
                <input
                  name="itemUnit" type="number" min={0} placeholder="Unit (cents)"
                  disabled={disabled}
                  className="ts-focus col-span-3 rounded-md border px-3 py-2 text-[13px]"
                  style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)", color: "var(--text-default)" }}
                />
              </div>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <Field label="Coupon code" hint="Optional — applies to subtotal">
            <input
              type="text" name="couponCode" disabled={disabled}
              placeholder="LAUNCH2026"
              className="ts-focus w-full rounded-md border px-3 py-2 text-[13px]"
              style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)", color: "var(--text-default)" }}
            />
          </Field>
          <Field label="Terms / due note" hint="Plain text, shown on the invoice">
            <input
              type="text" name="termsText" disabled={disabled}
              placeholder="Net 30 — wire instructions in PDF"
              className="ts-focus w-full rounded-md border px-3 py-2 text-[13px]"
              style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)", color: "var(--text-default)" }}
            />
          </Field>
          <Field label="Internal notes" hint="Never shown to tenant">
            <input
              type="text" name="notes" disabled={disabled}
              placeholder="Onboarding extras for ACME"
              className="ts-focus w-full rounded-md border px-3 py-2 text-[13px]"
              style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)", color: "var(--text-default)" }}
            />
          </Field>
        </div>

        <div className="flex items-center justify-end gap-3">
          <span className="text-[11px]" style={{ color: "var(--text-muted)" }}>
            Drafts can be reviewed before sending.
          </span>
          <button
            type="submit" disabled={disabled}
            className="ts-focus rounded-md px-4 py-2 text-[13px] font-medium disabled:cursor-not-allowed disabled:opacity-50"
            style={{ background: "var(--accent-primary)", color: "var(--accent-on-primary)" }}
          >
            Create draft
          </button>
        </div>
      </form>
    </section>
  );
}

/* ────────────────────────────────────────────────────────────── */

type InvoiceWithRelations = {
  id: string;
  tenantId: string;
  number: string;
  status: PlatformInvoiceStatus;
  currency: string;
  subtotal: number;
  discount: number;
  total: number;
  amountPaid: number;
  notes: string | null;
  termsText: string | null;
  couponId: string | null;
  issuedAt: Date | null;
  dueAt: Date | null;
  paidAt: Date | null;
  voidedAt: Date | null;
  createdAt: Date;
  tenant: { id: string; name: string; slug: string };
  items: { id: string; description: string; quantity: number; unitAmount: number; lineTotal: number }[];
  createdBy: { email: string };
};

function InvoicesTable({
  invoices,
  statusFilter,
  q,
  canWrite,
  canRefund,
}: {
  invoices: InvoiceWithRelations[];
  statusFilter: StatusFilter;
  q: string;
  canWrite: boolean;
  canRefund: boolean;
}) {
  return (
    <section className="rounded-lg border" style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)" }}>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3" style={{ borderColor: "var(--border-subtle)" }}>
        <h2 className="text-[14px] font-semibold" style={{ color: "var(--text-default)" }}>
          Invoices ({invoices.length})
        </h2>
        <form className="flex items-center gap-2">
          <input
            type="search" name="q" defaultValue={q}
            placeholder="Search number or tenant"
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
      {invoices.length === 0 ? (
        <div className="px-4 py-8 text-center text-[13px]" style={{ color: "var(--text-muted)" }}>
          No invoices match those filters.
        </div>
      ) : (
        <div className="divide-y" style={{ borderColor: "var(--border-subtle)" }}>
          {invoices.map((inv) => (
            <InvoiceRow key={inv.id} inv={inv} canWrite={canWrite} canRefund={canRefund} />
          ))}
        </div>
      )}
    </section>
  );
}

function InvoiceRow({
  inv,
  canWrite,
  canRefund,
}: {
  inv: InvoiceWithRelations;
  canWrite: boolean;
  canRefund: boolean;
}) {
  const overdue = inv.status === "SENT" && inv.dueAt && inv.dueAt < new Date();

  return (
    <div>
      <div className="grid grid-cols-1 items-center gap-3 px-4 py-3 md:grid-cols-[1fr_2fr_1.5fr_1fr_auto]">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-[13px] font-mono font-semibold" style={{ color: "var(--text-default)" }}>{inv.number}</span>
            <StatusChip status={inv.status} overdue={!!overdue} />
          </div>
          <div className="mt-0.5 text-[11px]" style={{ color: "var(--text-muted)" }}>
            {inv.createdAt.toLocaleDateString()} · by {inv.createdBy.email}
          </div>
        </div>
        <div className="min-w-0">
          <Link
            href={`/platform/tenants/${inv.tenant.id}`}
            className="ts-focus block truncate text-[13px] font-medium hover:underline"
            style={{ color: "var(--text-default)" }}
          >
            {inv.tenant.name}
          </Link>
          <div className="text-[11px]" style={{ color: "var(--text-muted)" }}>
            {inv.items.length} line{inv.items.length === 1 ? "" : "s"}
          </div>
        </div>
        <div className="text-[12px]" style={{ color: "var(--text-muted)" }}>
          {inv.dueAt && (
            <div style={{ color: overdue ? "var(--danger-fg)" : "var(--text-default)" }}>
              Due {inv.dueAt.toLocaleDateString()}
            </div>
          )}
          {inv.issuedAt && (
            <div className="text-[11px]">Issued {inv.issuedAt.toLocaleDateString()}</div>
          )}
          {inv.paidAt && (
            <div className="text-[11px]" style={{ color: "var(--accent-primary)" }}>Paid {inv.paidAt.toLocaleDateString()}</div>
          )}
        </div>
        <div className="text-[14px] font-semibold tabular-nums" style={{ color: "var(--text-default)" }}>
          {formatMoney(inv.total, inv.currency)}
          {inv.discount > 0 && (
            <div className="text-[10px] font-normal" style={{ color: "var(--text-muted)" }}>
              −{formatMoney(inv.discount, inv.currency)} discount
            </div>
          )}
        </div>
        <div className="flex items-center gap-2 justify-self-end">
          <RowActions inv={inv} canWrite={canWrite} canRefund={canRefund} />
        </div>
      </div>

      {/* Line item details (always visible — RSC-friendly, no client-side toggle) */}
      <div className="border-t px-4 py-3 text-[12px]" style={{ borderColor: "var(--border-subtle)", background: "var(--surface-2)" }}>
        <table className="w-full">
          <thead>
            <tr style={{ color: "var(--text-muted)" }}>
              <th className="py-1 text-left text-[10px] font-medium uppercase tracking-wide">Description</th>
              <th className="py-1 text-right text-[10px] font-medium uppercase tracking-wide">Qty</th>
              <th className="py-1 text-right text-[10px] font-medium uppercase tracking-wide">Unit</th>
              <th className="py-1 text-right text-[10px] font-medium uppercase tracking-wide">Line</th>
            </tr>
          </thead>
          <tbody>
            {inv.items.map((it) => (
              <tr key={it.id}>
                <td className="py-1 pr-2" style={{ color: "var(--text-default)" }}>{it.description}</td>
                <td className="py-1 text-right tabular-nums" style={{ color: "var(--text-default)" }}>{it.quantity}</td>
                <td className="py-1 text-right tabular-nums" style={{ color: "var(--text-default)" }}>{formatMoney(it.unitAmount, inv.currency)}</td>
                <td className="py-1 text-right tabular-nums" style={{ color: "var(--text-default)" }}>{formatMoney(it.lineTotal, inv.currency)}</td>
              </tr>
            ))}
            <tr style={{ color: "var(--text-muted)" }}>
              <td colSpan={3} className="py-1 text-right">Subtotal</td>
              <td className="py-1 text-right tabular-nums">{formatMoney(inv.subtotal, inv.currency)}</td>
            </tr>
            {inv.discount > 0 && (
              <tr style={{ color: "var(--text-muted)" }}>
                <td colSpan={3} className="py-1 text-right">Discount</td>
                <td className="py-1 text-right tabular-nums">−{formatMoney(inv.discount, inv.currency)}</td>
              </tr>
            )}
            <tr style={{ color: "var(--text-default)" }}>
              <td colSpan={3} className="py-1 text-right font-semibold">Total</td>
              <td className="py-1 text-right tabular-nums font-semibold">{formatMoney(inv.total, inv.currency)}</td>
            </tr>
          </tbody>
        </table>
        {inv.termsText && (
          <div className="mt-2 text-[11px] italic" style={{ color: "var(--text-muted)" }}>
            Terms: {inv.termsText}
          </div>
        )}
        {inv.notes && (
          <div className="mt-1 text-[11px]" style={{ color: "var(--text-muted)" }}>
            <strong>Internal:</strong> {inv.notes}
          </div>
        )}
      </div>
    </div>
  );
}

function RowActions({
  inv,
  canWrite,
  canRefund,
}: {
  inv: InvoiceWithRelations;
  canWrite: boolean;
  canRefund: boolean;
}) {
  return (
    <>
      {canWrite && inv.status === "DRAFT" && (
        <form action={sendPlatformInvoice.bind(null, inv.id)}>
          <button
            type="submit"
            className="ts-focus rounded-md px-2.5 py-1.5 text-[11px] font-medium"
            style={{ background: "var(--accent-primary)", color: "var(--accent-on-primary)" }}
          >
            Send →
          </button>
        </form>
      )}
      {canWrite && inv.status === "SENT" && (
        <form action={markPlatformInvoicePaid.bind(null, inv.id)}>
          <button
            type="submit"
            className="ts-focus rounded-md border px-2.5 py-1.5 text-[11px] font-medium"
            style={{ borderColor: "var(--accent-primary)", color: "var(--accent-primary)", background: "var(--surface-1)" }}
          >
            Mark paid ✓
          </button>
        </form>
      )}
      {canRefund && (inv.status === "DRAFT" || inv.status === "SENT") && (
        <form action={voidPlatformInvoice.bind(null, inv.id)}>
          <button
            type="submit"
            className="ts-focus rounded-md border px-2.5 py-1.5 text-[11px] font-medium"
            style={{ borderColor: "var(--danger-fg)", color: "var(--danger-fg)", background: "var(--surface-1)" }}
          >
            Void
          </button>
        </form>
      )}
    </>
  );
}

function StatusChip({
  status,
  overdue,
}: {
  status: PlatformInvoiceStatus;
  overdue: boolean;
}) {
  const palette =
    overdue                    ? { bg: "var(--danger-surface)", fg: "var(--danger-fg)",      label: "OVERDUE" } :
    status === "DRAFT"         ? { bg: "var(--surface-2)",      fg: "var(--text-muted)",     label: "DRAFT" } :
    status === "SENT"          ? { bg: "var(--accent-surface)", fg: "var(--accent-primary)", label: "SENT" } :
    status === "PAID"          ? { bg: "var(--accent-surface)", fg: "var(--accent-primary)", label: "PAID" } :
    status === "VOIDED"        ? { bg: "var(--surface-2)",      fg: "var(--text-muted)",     label: "VOIDED" } :
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
