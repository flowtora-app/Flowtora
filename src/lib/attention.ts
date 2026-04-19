// Phase 13 — "Needs attention" engine.
//
// A single library that computes, for a tenant (and optionally a single user),
// the set of items that deserve a nudge right now: overdue quotes, stale
// proofs, overdue invoices, orders past their due date, unconfirmed installs
// inside the 48h window, and overdue tasks. The same engine powers:
//
//   1. The in-app /t/[slug]/attention page (filtered to the viewer)
//   2. The /api/cron/reminders endpoint (scans every tenant + fans out
//      notifications to the responsible staff)
//
// Keeping both consumers on the same primitives means the list a sales rep
// sees in-app is the same list they get pinged about — no drift between the
// dashboard and the reminder email/notification.

import { db } from "@/lib/db";
import { applyBranchScope, applyBranchScopeOn } from "@/lib/locations";
import type { Prisma } from "@prisma/client";

// ────────────────────────────────────────────────────────────
// Tunable windows
// ────────────────────────────────────────────────────────────
//
// These are the defaults. Per-tenant overrides could live on Tenant later
// (Phase 13 roadmap calls them "configurable reminders") — for now keep them
// in one place so the UI copy can reference the same numbers.

export const ATTENTION_WINDOWS = {
  // Quote sent N days ago with no view → stale follow-up candidate.
  quoteStaleDays: 5,
  // Quote expires within this many days → surface it so reps re-engage.
  quoteExpiringDays: 3,
  // Proof sent N days ago with no customer response → follow up.
  proofStaleDays: 3,
  // Invoice DRAFT but never sent after N days of being issued → nag.
  invoiceUnsentDays: 2,
  // Install within this many hours + still SCHEDULED (not CONFIRMED) → confirm.
  installConfirmHours: 48,
};

// ────────────────────────────────────────────────────────────
// Types returned to the UI / cron
// ────────────────────────────────────────────────────────────
//
// We pull enough shape for the UI to render a row and a link, plus the
// "owner" userId so the cron knows who to notify. Keep `href` relative so it
// can be concatenated to /t/<slug>.

export type AttentionOwner = { userId: string | null; label: string | null };

export type AttentionItem = {
  // Stable id to dedup notifications — we use `${kind}:${entityId}`.
  key: string;
  kind: AttentionKind;
  title: string;
  detail: string;
  href: string;        // relative to tenant slug, e.g. "quotes/abc"
  entityType: string;  // "Quote" | "Proof" | ... for Notification.entityType
  entityId: string;
  ownerUserId: string | null; // who to notify / whose "my stuff" this is
};

export type AttentionKind =
  | "quote.overdue"
  | "quote.expiring"
  | "quote.stale"
  | "proof.stale"
  | "invoice.overdue"
  | "invoice.unsent"
  | "order.overdue"
  | "install.unconfirmed"
  | "task.overdue";

// Grouped payload. Order matters — higher-urgency groups come first so the
// page shows the scariest stuff at top without the UI needing its own sort.
export type AttentionGroups = {
  quotesOverdue:       AttentionItem[];
  quotesExpiring:      AttentionItem[];
  quotesStale:         AttentionItem[];
  proofsStale:         AttentionItem[];
  invoicesOverdue:     AttentionItem[];
  invoicesUnsent:      AttentionItem[];
  ordersOverdue:       AttentionItem[];
  installsUnconfirmed: AttentionItem[];
  tasksOverdue:        AttentionItem[];
};

export function totalAttentionCount(g: AttentionGroups): number {
  return (
    g.quotesOverdue.length +
    g.quotesExpiring.length +
    g.quotesStale.length +
    g.proofsStale.length +
    g.invoicesOverdue.length +
    g.invoicesUnsent.length +
    g.ordersOverdue.length +
    g.installsUnconfirmed.length +
    g.tasksOverdue.length
  );
}

// ────────────────────────────────────────────────────────────
// Main entry point
// ────────────────────────────────────────────────────────────
//
// If `userId` is supplied, every group is filtered to items where the
// ownerUserId matches (i.e. "my stuff"). If omitted, returns everything in
// the tenant — for admins/owners and for the cron.

export async function loadAttention(
  tenantId: string,
  opts: { userId?: string; branchScope?: string[] | null } = {},
): Promise<AttentionGroups> {
  const now = new Date();
  const plusMs = (ms: number) => new Date(now.getTime() + ms);
  const minusMs = (ms: number) => new Date(now.getTime() - ms);
  const day = 86_400_000;
  const hour = 3_600_000;
  const scope = opts.branchScope ?? null;

  const [
    quotes,
    proofs,
    invoices,
    orders,
    installs,
    tasks,
  ] = await Promise.all([
    // Quotes — any still-open quote; we bucket into overdue/expiring/stale.
    db.quote.findMany({
      where: applyBranchScope({
        tenantId,
        status: { in: ["DRAFT", "SENT", "VIEWED"] },
      } as Prisma.QuoteWhereInput, scope),
      select: {
        id: true, number: true, status: true,
        expiresAt: true, sentAt: true, viewedAt: true,
        salesRepId: true, createdBy: true,
        customer: { select: { name: true } },
      },
    }),
    // Proofs — SENT but no respondedAt older than threshold. Proofs don't carry
    // their own locationId; we scope through the parent order.
    db.proof.findMany({
      where: applyBranchScopeOn({
        tenantId,
        status: "SENT",
        sentAt: { lt: minusMs(ATTENTION_WINDOWS.proofStaleDays * day) },
        respondedAt: null,
      } as Prisma.ProofWhereInput, "order", scope),
      select: {
        id: true, version: true, sentAt: true, title: true,
        createdBy: true,
        order: {
          select: {
            id: true, number: true,
            customer: { select: { name: true } },
          },
        },
      },
    }),
    // Invoices — DRAFT for too long, or OVERDUE/past-due unpaid.
    db.invoice.findMany({
      where: applyBranchScope({
        tenantId,
        status: { in: ["DRAFT", "SENT", "PARTIAL", "OVERDUE"] },
      } as Prisma.InvoiceWhereInput, scope),
      select: {
        id: true, number: true, status: true,
        dueDate: true, issuedAt: true,
        total: true, amountPaid: true,
        createdBy: true,
        customer: { select: { name: true } },
        order:    { select: { productionManagerId: true } },
      },
    }),
    // Orders — active + past due.
    db.order.findMany({
      where: applyBranchScope({
        tenantId,
        status: { in: ["NEW", "IN_PRODUCTION", "READY", "OUT_FOR_INSTALL"] },
        dueDate: { lt: now },
      } as Prisma.OrderWhereInput, scope),
      select: {
        id: true, number: true, status: true, dueDate: true,
        productionManagerId: true, createdBy: true,
        customer: { select: { name: true } },
      },
    }),
    // Installs within confirm window, still SCHEDULED (not CONFIRMED).
    db.installEvent.findMany({
      where: applyBranchScope({
        tenantId,
        status: "SCHEDULED",
        scheduledStart: {
          gte: now,
          lt:  plusMs(ATTENTION_WINDOWS.installConfirmHours * hour),
        },
      } as Prisma.InstallEventWhereInput, scope),
      select: {
        id: true, title: true, scheduledStart: true,
        installerId: true, createdBy: true,
        order: { select: { number: true } },
        customer: { select: { name: true } },
      },
    }),
    // Tasks overdue + not completed. Tasks don't carry locationId so they're
    // not branch-scoped — they hang off whatever entity they were created on.
    db.task.findMany({
      where: {
        tenantId,
        completedAt: null,
        dueDate: { lt: now, not: null },
      },
      select: {
        id: true, title: true, dueDate: true,
        assignedTo: true, createdBy: true,
        customerId: true,
      },
    }),
  ]);

  const groups: AttentionGroups = {
    quotesOverdue:       [],
    quotesExpiring:      [],
    quotesStale:         [],
    proofsStale:         [],
    invoicesOverdue:     [],
    invoicesUnsent:      [],
    ordersOverdue:       [],
    installsUnconfirmed: [],
    tasksOverdue:        [],
  };

  // ─── Quotes ──────────────────────────────────────────────
  const staleSentCutoff = minusMs(ATTENTION_WINDOWS.quoteStaleDays * day);
  const expiringCutoff  = plusMs(ATTENTION_WINDOWS.quoteExpiringDays * day);
  for (const q of quotes) {
    const owner = q.salesRepId ?? q.createdBy ?? null;
    const base = {
      entityType: "Quote" as const,
      entityId:   q.id,
      href:       `quotes/${q.id}`,
      ownerUserId: owner,
    };
    const customerName = q.customer.name;

    if (q.expiresAt && q.expiresAt < now) {
      groups.quotesOverdue.push({
        ...base,
        key:    `quote.overdue:${q.id}`,
        kind:   "quote.overdue",
        title:  `${q.number} expired`,
        detail: `${customerName} — expired ${formatRelativePast(q.expiresAt, now)}`,
      });
      continue; // mutually exclusive with expiring/stale
    }
    if (q.expiresAt && q.expiresAt < expiringCutoff) {
      groups.quotesExpiring.push({
        ...base,
        key:    `quote.expiring:${q.id}`,
        kind:   "quote.expiring",
        title:  `${q.number} expires soon`,
        detail: `${customerName} — expires ${formatRelativeFuture(q.expiresAt, now)}`,
      });
      continue;
    }
    if (q.status === "SENT" && q.sentAt && q.sentAt < staleSentCutoff && !q.viewedAt) {
      groups.quotesStale.push({
        ...base,
        key:    `quote.stale:${q.id}`,
        kind:   "quote.stale",
        title:  `${q.number} unread`,
        detail: `${customerName} — sent ${formatRelativePast(q.sentAt, now)}, not yet viewed`,
      });
    }
  }

  // ─── Proofs ──────────────────────────────────────────────
  for (const p of proofs) {
    groups.proofsStale.push({
      entityType: "Proof",
      entityId:   p.id,
      href:       `orders/${p.order.id}/proofs/${p.id}`,
      ownerUserId: p.createdBy ?? null,
      key:   `proof.stale:${p.id}`,
      kind:  "proof.stale",
      title: `Proof v${p.version} on ${p.order.number} awaiting response`,
      detail: `${p.order.customer.name}${p.title ? ` — ${p.title}` : ""} · sent ${p.sentAt ? formatRelativePast(p.sentAt, now) : "recently"}`,
    });
  }

  // ─── Invoices ────────────────────────────────────────────
  const unsentCutoff = minusMs(ATTENTION_WINDOWS.invoiceUnsentDays * day);
  for (const inv of invoices) {
    const balance = Number(inv.total) - Number(inv.amountPaid);
    const owner = inv.createdBy ?? inv.order?.productionManagerId ?? null;
    const base = {
      entityType: "Invoice" as const,
      entityId:   inv.id,
      href:       `invoices/${inv.id}`,
      ownerUserId: owner,
    };
    if (inv.status === "DRAFT" && (inv.issuedAt ?? inv.dueDate) && (inv.issuedAt ?? new Date()) < unsentCutoff) {
      groups.invoicesUnsent.push({
        ...base,
        key:    `invoice.unsent:${inv.id}`,
        kind:   "invoice.unsent",
        title:  `${inv.number} still a draft`,
        detail: `${inv.customer.name} — draft, never sent`,
      });
      continue;
    }
    if (inv.dueDate && inv.dueDate < now && balance > 0) {
      groups.invoicesOverdue.push({
        ...base,
        key:    `invoice.overdue:${inv.id}`,
        kind:   "invoice.overdue",
        title:  `${inv.number} past due`,
        detail: `${inv.customer.name} — ${balance.toFixed(2)} outstanding, due ${formatRelativePast(inv.dueDate, now)}`,
      });
    }
  }

  // ─── Orders ──────────────────────────────────────────────
  for (const o of orders) {
    if (!o.dueDate) continue;
    groups.ordersOverdue.push({
      entityType: "Order",
      entityId:   o.id,
      href:       `orders/${o.id}`,
      ownerUserId: o.productionManagerId ?? o.createdBy ?? null,
      key:    `order.overdue:${o.id}`,
      kind:   "order.overdue",
      title:  `${o.number} past due`,
      detail: `${o.customer.name} — ${o.status.replace(/_/g, " ")}, due ${formatRelativePast(o.dueDate, now)}`,
    });
  }

  // ─── Installs ────────────────────────────────────────────
  for (const ev of installs) {
    groups.installsUnconfirmed.push({
      entityType: "InstallEvent",
      entityId:   ev.id,
      href:       `installs/${ev.id}`,
      ownerUserId: ev.installerId ?? ev.createdBy ?? null,
      key:    `install.unconfirmed:${ev.id}`,
      kind:   "install.unconfirmed",
      title:  `Install for ${ev.order.number} not confirmed`,
      detail: `${ev.customer.name} — ${formatRelativeFuture(ev.scheduledStart, now)}`,
    });
  }

  // ─── Tasks ───────────────────────────────────────────────
  for (const t of tasks) {
    if (!t.dueDate) continue;
    groups.tasksOverdue.push({
      entityType: "Task",
      entityId:   t.id,
      href:       "tasks",
      ownerUserId: t.assignedTo ?? t.createdBy ?? null,
      key:    `task.overdue:${t.id}`,
      kind:   "task.overdue",
      title:  t.title,
      detail: `Due ${formatRelativePast(t.dueDate, now)}`,
    });
  }

  if (opts.userId) {
    return filterByUser(groups, opts.userId);
  }
  return groups;
}

function filterByUser(g: AttentionGroups, userId: string): AttentionGroups {
  const keep = (items: AttentionItem[]) => items.filter((i) => i.ownerUserId === userId);
  return {
    quotesOverdue:       keep(g.quotesOverdue),
    quotesExpiring:      keep(g.quotesExpiring),
    quotesStale:         keep(g.quotesStale),
    proofsStale:         keep(g.proofsStale),
    invoicesOverdue:     keep(g.invoicesOverdue),
    invoicesUnsent:      keep(g.invoicesUnsent),
    ordersOverdue:       keep(g.ordersOverdue),
    installsUnconfirmed: keep(g.installsUnconfirmed),
    tasksOverdue:        keep(g.tasksOverdue),
  };
}

// ────────────────────────────────────────────────────────────
// Small relative-time helpers — keep formatting out of call-sites.
// Intentionally kept minimal (days + hours only) — this is a nudge UI, not
// a precision time display.
// ────────────────────────────────────────────────────────────

function formatRelativePast(d: Date, now: Date): string {
  const ms = now.getTime() - d.getTime();
  if (ms < 3_600_000)  return "under an hour ago";
  if (ms < 86_400_000) return `${Math.floor(ms / 3_600_000)}h ago`;
  const days = Math.floor(ms / 86_400_000);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}

function formatRelativeFuture(d: Date, now: Date): string {
  const ms = d.getTime() - now.getTime();
  if (ms < 0)          return "in the past";
  if (ms < 3_600_000)  return "within the hour";
  if (ms < 86_400_000) return `in ${Math.floor(ms / 3_600_000)}h`;
  const days = Math.floor(ms / 86_400_000);
  return `in ${days} day${days === 1 ? "" : "s"}`;
}
