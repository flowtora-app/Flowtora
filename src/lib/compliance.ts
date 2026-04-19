// Phase 17 Slice E — data-export generator.
//
// The export is a single JSON document containing every tenant-scoped row
// we know about. It's cheap to generate for any reasonable shop (thousands
// of rows, not millions), and keeping the payload as a string in Postgres
// avoids standing up a file-storage backend for a compliance feature that
// fires a handful of times per year.
//
// What's included:
//   - the Tenant row itself (profile, settings, onboarding metadata)
//   - every row of every tenant-owned model: customers, contacts, quotes,
//     orders, invoices, payments, products, tasks, installs, etc.
//   - audit logs filtered to this tenant
// Excluded:
//   - platform-only data (ImpersonationSession, FeatureFlag rows, etc.)
//   - other tenants' data (obviously)
//   - NextAuth User rows — users live at the platform level and can belong
//     to multiple tenants; we include the membership rows but not the
//     underlying user records.

import { db } from "@/lib/db";

export async function generateTenantExport(tenantId: string): Promise<string> {
  // Run every fetch in parallel. Each is a plain findMany against a single
  // table, so there's no cascading join overhead.
  const [
    tenant,
    memberships,
    invites,
    locations,
    customers,
    contacts,
    interactions,
    tasks,
    products,
    quotes,
    orders,
    invoices,
    payments,
    files,
    proofs,
    installEvents,
    portalTokens,
    notifications,
    checklistTemplates,
    checklistItems,
    comments,
    emailEvents,
    messageTemplates,
    auditLogs,
    supportTickets,
  ] = await Promise.all([
    db.tenant.findUnique({ where: { id: tenantId } }),
    db.membership.findMany({ where: { tenantId } }),
    db.invite.findMany({ where: { tenantId } }),
    db.location.findMany({ where: { tenantId } }),
    db.customer.findMany({ where: { tenantId } }),
    db.contact.findMany({ where: { tenantId } }),
    db.interaction.findMany({ where: { tenantId } }),
    db.task.findMany({ where: { tenantId } }),
    db.product.findMany({ where: { tenantId } }),
    db.quote.findMany({ where: { tenantId } }),
    db.order.findMany({ where: { tenantId } }),
    db.invoice.findMany({ where: { tenantId } }),
    db.payment.findMany({ where: { tenantId } }),
    db.file.findMany({ where: { tenantId } }),
    db.proof.findMany({ where: { tenantId } }),
    db.installEvent.findMany({ where: { tenantId } }),
    db.portalToken.findMany({ where: { tenantId } }),
    db.notification.findMany({ where: { tenantId } }),
    db.checklistTemplate.findMany({ where: { tenantId } }),
    db.checklistItem.findMany({ where: { tenantId } }),
    db.comment.findMany({ where: { tenantId } }),
    db.emailEvent.findMany({ where: { tenantId } }),
    db.messageTemplate.findMany({ where: { tenantId } }),
    db.auditLog.findMany({ where: { tenantId }, orderBy: { createdAt: "asc" } }),
    db.supportTicket.findMany({
      where: { tenantId },
      include: { messages: { orderBy: { createdAt: "asc" } } },
    }),
  ]);

  const bundle = {
    _meta: {
      tenantId,
      generatedAt: new Date().toISOString(),
      generator: "tracksign-export-v1",
      note: "Rows included verbatim; tenant-scoped only. See docs/exports.md.",
    },
    tenant,
    memberships,
    invites,
    locations,
    customers,
    contacts,
    interactions,
    tasks,
    products,
    quotes,
    orders,
    invoices,
    payments,
    files,
    proofs,
    installEvents,
    portalTokens,
    notifications,
    checklistTemplates,
    checklistItems,
    comments,
    emailEvents,
    messageTemplates,
    auditLogs,
    supportTickets,
  };

  // stringify with 2-space indent for readability when the owner opens it
  // in a text editor. Adds ~20% to size, which is fine.
  return JSON.stringify(bundle, decimalReplacer, 2);
}

/**
 * Prisma Decimal instances serialize as { s, e, d } structures by default,
 * which is useless when an accountant opens the export. Replace them with
 * their string representation (the canonical money-safe form).
 */
function decimalReplacer(_: string, value: unknown): unknown {
  if (value && typeof value === "object" && "toFixed" in value && typeof (value as { toFixed: unknown }).toFixed === "function") {
    // Decimal from Prisma.Decimal has a .toFixed — stringify as plain decimal.
    return (value as { toString(): string }).toString();
  }
  return value;
}

/**
 * Seven days feels right for a download link — long enough for the owner
 * to save a copy, short enough that we don't carry every export forever.
 */
export const EXPORT_RETENTION_DAYS = 7;

/**
 * Cooling-off window for account deletion. Thirty days matches what most
 * SaaS tools offer and gives a shop time to reconsider or recover any
 * documents they forgot about.
 */
export const DELETION_GRACE_DAYS = 30;
