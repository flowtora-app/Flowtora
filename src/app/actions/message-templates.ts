"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { MessageTemplateKind } from "@prisma/client";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/tenant";
import { logAudit } from "@/lib/audit";
import { sendCustomerEmail } from "@/lib/customer-emails";
import { renderTemplate, type TemplateBag } from "@/lib/message-templates";
import { formatMoney, formatDate, formatDateTime } from "@/lib/format";
import { getGroupContext } from "@/lib/franchise";

const optionalString = z.string().max(400).optional().or(z.literal(""));
const longText = z.string().max(8000);
const empty = (s: string | undefined) => (s && s.length > 0 ? s : null);

const KINDS = ["CUSTOMER_UPDATE", "QUOTE_UPDATE", "ORDER_UPDATE", "INSTALL_UPDATE"] as const;

// ────────────────────────────────────────────────────────────
// Template CRUD — gated by templates:manage so it sits alongside
// checklist templates as a "settings-level resource".
// ────────────────────────────────────────────────────────────

const createSchema = z.object({
  name:        z.string().min(1).max(120),
  description: optionalString,
  kind:        z.enum(KINDS),
  subject:     z.string().min(1).max(300),
  body:        longText,
});

export async function createMessageTemplate(slug: string, formData: FormData) {
  const ctx = await requirePermission(slug, "templates:manage");
  const parsed = createSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    redirect(`/t/${slug}/settings/message-templates?error=${encodeURIComponent("Invalid template input.")}`);
  }
  const d = parsed.data;

  // The schema has a per-tenant unique constraint on name — catch the
  // collision up-front for a nicer error.
  const existing = await db.messageTemplate.findFirst({
    where: { tenantId: ctx.tenant.id, name: d.name },
    select: { id: true },
  });
  if (existing) {
    redirect(`/t/${slug}/settings/message-templates?error=${encodeURIComponent("A template with that name already exists.")}`);
  }

  const template = await db.messageTemplate.create({
    data: {
      tenantId:    ctx.tenant.id,
      name:        d.name,
      description: empty(d.description),
      kind:        d.kind,
      subject:     d.subject,
      body:        d.body,
      createdBy:   ctx.userId,
      updatedBy:   ctx.userId,
    },
  });
  await logAudit({
    tenantId:   ctx.tenant.id,
    userId:     ctx.userId,
    action:     "message_template.created",
    entityType: "MessageTemplate",
    entityId:   template.id,
    metadata:   { name: template.name, kind: template.kind },
  });
  revalidatePath(`/t/${slug}/settings/message-templates`);
  redirect(`/t/${slug}/settings/message-templates/${template.id}`);
}

const updateSchema = z.object({
  name:        z.string().min(1).max(120),
  description: optionalString,
  kind:        z.enum(KINDS),
  subject:     z.string().min(1).max(300),
  body:        longText,
  active:      z.preprocess((v) => v === "on" || v === "true", z.boolean()).optional(),
});

export async function updateMessageTemplate(slug: string, templateId: string, formData: FormData) {
  const ctx = await requirePermission(slug, "templates:manage");
  const existing = await db.messageTemplate.findFirst({
    where: { id: templateId, tenantId: ctx.tenant.id },
    select: { id: true, name: true },
  });
  if (!existing) redirect(`/t/${slug}/settings/message-templates`);

  const parsed = updateSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    redirect(`/t/${slug}/settings/message-templates/${templateId}?error=${encodeURIComponent("Invalid input.")}`);
  }
  const d = parsed.data;

  // Check name collision against *other* templates.
  if (d.name !== existing.name) {
    const clash = await db.messageTemplate.findFirst({
      where: { tenantId: ctx.tenant.id, name: d.name, NOT: { id: templateId } },
      select: { id: true },
    });
    if (clash) {
      redirect(`/t/${slug}/settings/message-templates/${templateId}?error=${encodeURIComponent("A template with that name already exists.")}`);
    }
  }

  // Phase 15 Slice D — only group roots can flip `shared`. If the tenant
  // isn't a root we omit the field entirely (rather than zeroing it) so
  // a tenant that lost root status doesn't silently break inheritance
  // for any rows it had previously shared.
  const sharedField = ctx.tenant.isGroupRoot
    ? { shared: formData.get("shared") === "on" || formData.get("shared") === "true" }
    : {};

  await db.messageTemplate.update({
    where: { id: templateId },
    data: {
      name:        d.name,
      description: empty(d.description),
      kind:        d.kind,
      subject:     d.subject,
      body:        d.body,
      active:      d.active ?? true,
      updatedBy:   ctx.userId,
      ...sharedField,
    },
  });

  await logAudit({
    tenantId:   ctx.tenant.id,
    userId:     ctx.userId,
    action:     "message_template.updated",
    entityType: "MessageTemplate",
    entityId:   templateId,
    metadata:   { name: d.name, kind: d.kind, active: d.active ?? true },
  });

  revalidatePath(`/t/${slug}/settings/message-templates`);
  revalidatePath(`/t/${slug}/settings/message-templates/${templateId}`);
}

export async function deleteMessageTemplate(slug: string, templateId: string) {
  const ctx = await requirePermission(slug, "templates:manage");
  const existing = await db.messageTemplate.findFirst({
    where: { id: templateId, tenantId: ctx.tenant.id },
    select: { id: true, name: true },
  });
  if (!existing) return;

  await db.messageTemplate.delete({ where: { id: templateId } });
  await logAudit({
    tenantId:   ctx.tenant.id,
    userId:     ctx.userId,
    action:     "message_template.deleted",
    entityType: "MessageTemplate",
    entityId:   templateId,
    metadata:   { name: existing.name },
  });
  revalidatePath(`/t/${slug}/settings/message-templates`);
  redirect(`/t/${slug}/settings/message-templates`);
}

// ────────────────────────────────────────────────────────────
// Send update — pick a template + entity (customer / quote / order /
// install), substitute variables, log the send as an EmailEvent of kind
// UPDATE_MESSAGE. No real SMTP yet; that lands in Phase 16.
// ────────────────────────────────────────────────────────────

const sendSchema = z.object({
  templateId: z.string().min(1),
  customerId: z.string().min(1), // every send is ultimately customer-scoped
  quoteId:    z.string().optional().or(z.literal("")),
  orderId:    z.string().optional().or(z.literal("")),
  installEventId: z.string().optional().or(z.literal("")),
  // The user can override the canned subject/body at send-time.
  subject:    z.string().min(1).max(300),
  body:       longText,
  toAddress:  z.string().email(),
  returnTo:   optionalString, // where to redirect back to after send
});

export async function sendMessageTemplate(slug: string, formData: FormData) {
  // Sending an email reaches out to the customer, so gate on customers:edit.
  // (Anyone who can touch the customer's records can message them.)
  const ctx = await requirePermission(slug, "customers:edit");
  const parsed = sendSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    redirect(`/t/${slug}?error=${encodeURIComponent("Invalid send input.")}`);
  }
  const d = parsed.data;

  // Validate every id against the tenant up-front — anything else would
  // leak cross-tenant info through the mail log.
  const [template, customer] = await Promise.all([
    db.messageTemplate.findFirst({
      where: { id: d.templateId, tenantId: ctx.tenant.id, active: true },
      select: { id: true, kind: true, name: true },
    }),
    db.customer.findFirst({
      where: { id: d.customerId, tenantId: ctx.tenant.id },
      select: { id: true, name: true, email: true },
    }),
  ]);
  if (!template) redirect(`/t/${slug}?error=${encodeURIComponent("Template not found.")}`);
  if (!customer) redirect(`/t/${slug}?error=${encodeURIComponent("Customer not found.")}`);

  const quoteId   = empty(d.quoteId);
  const orderId   = empty(d.orderId);
  const installId = empty(d.installEventId);

  // Prefer the explicit relatedEntity (quote > order > install) for the
  // EmailEvent row so the timeline can deep-link back.
  let relatedEntityType: string | null = null;
  let relatedEntityId:   string | null = null;
  if (quoteId)   { relatedEntityType = "Quote";        relatedEntityId = quoteId; }
  else if (orderId)   { relatedEntityType = "Order";        relatedEntityId = orderId; }
  else if (installId) { relatedEntityType = "InstallEvent"; relatedEntityId = installId; }

  // Best-effort: verify that the referenced entity actually belongs to this
  // tenant AND this customer. If the join doesn't hold, we drop the id from
  // the log rather than sending a lie.
  if (quoteId) {
    const q = await db.quote.findFirst({
      where: { id: quoteId, tenantId: ctx.tenant.id, customerId: customer.id },
      select: { id: true },
    });
    if (!q) { relatedEntityType = null; relatedEntityId = null; }
  } else if (orderId) {
    const o = await db.order.findFirst({
      where: { id: orderId, tenantId: ctx.tenant.id, customerId: customer.id },
      select: { id: true },
    });
    if (!o) { relatedEntityType = null; relatedEntityId = null; }
  } else if (installId) {
    const i = await db.installEvent.findFirst({
      where: { id: installId, tenantId: ctx.tenant.id, order: { customerId: customer.id } },
      select: { id: true },
    });
    if (!i) { relatedEntityType = null; relatedEntityId = null; }
  }

  await sendCustomerEmail({
    tenantId:          ctx.tenant.id,
    customerId:        customer.id,
    senderUserId:      ctx.userId,
    kind:              "UPDATE_MESSAGE",
    to:                d.toAddress,
    relatedEntityType: relatedEntityType ?? undefined,
    relatedEntityId:   relatedEntityId ?? undefined,
    rendered: {
      subject: d.subject,
      html: bodyToHtml(d.subject, d.body, ctx.tenant.name),
      text: d.body,
    },
  });

  await logAudit({
    tenantId:   ctx.tenant.id,
    userId:     ctx.userId,
    action:     "message_template.sent",
    entityType: "MessageTemplate",
    entityId:   template.id,
    metadata:   {
      customerId: customer.id,
      toAddress:  d.toAddress,
      relatedEntityType, relatedEntityId,
    },
  });

  const fallback = `/t/${slug}/customers/${customer.id}`;
  const target = empty(d.returnTo) ?? fallback;
  revalidatePath(target);
  redirect(`${target}?ok=${encodeURIComponent("Message recorded.")}`);
}

// ────────────────────────────────────────────────────────────
// Server-side helper: look up the active templates for a given kind,
// plus build a variables bag for a specific context (for the "Send update"
// widget on a customer / quote / order page).
// ────────────────────────────────────────────────────────────

export async function loadSendContext(
  tenantId: string,
  currency: string,
  opts: {
    customerId: string;
    quoteId?:   string;
    orderId?:   string;
    installEventId?: string;
    senderUserId?:   string;
  },
): Promise<{
  bag:       TemplateBag;
  templates: { id: string; name: string; kind: MessageTemplateKind; subject: string; body: string }[];
  customer:  { id: string; name: string; email: string | null };
}> {
  const [tenant, customer, quote, order, install, sender] = await Promise.all([
    db.tenant.findUnique({ where: { id: tenantId }, select: { name: true } }),
    db.customer.findFirst({
      where: { id: opts.customerId, tenantId },
      include: {
        contacts: { where: { isPrimary: true }, take: 1 },
      },
    }),
    opts.quoteId
      ? db.quote.findFirst({ where: { id: opts.quoteId, tenantId }, select: { number: true, total: true } })
      : Promise.resolve(null),
    opts.orderId
      ? db.order.findFirst({ where: { id: opts.orderId, tenantId }, select: { number: true, dueDate: true } })
      : Promise.resolve(null),
    opts.installEventId
      ? db.installEvent.findFirst({ where: { id: opts.installEventId, tenantId }, select: { scheduledStart: true } })
      : Promise.resolve(null),
    opts.senderUserId
      ? db.user.findUnique({ where: { id: opts.senderUserId }, select: { name: true, email: true } })
      : Promise.resolve(null),
  ]);

  const contact = customer?.contacts[0] ?? null;

  // Pick the relevant template kinds based on what context we're in. A
  // customer page shows only CUSTOMER_UPDATE; a quote page shows
  // CUSTOMER_UPDATE + QUOTE_UPDATE, and so on.
  const kinds: MessageTemplateKind[] = ["CUSTOMER_UPDATE"];
  if (opts.quoteId)        kinds.push("QUOTE_UPDATE");
  if (opts.orderId)        kinds.push("ORDER_UPDATE");
  if (opts.installEventId) kinds.push("INSTALL_UPDATE");

  // Phase 15 Slice D — also surface inherited shared templates from the
  // parent group root so franchisees can send the canonical brand copy
  // without having to clone it locally first.
  const groupCtx = await getGroupContext(tenantId);
  const [own, inherited] = await Promise.all([
    db.messageTemplate.findMany({
      where: { tenantId, active: true, kind: { in: kinds } },
      orderBy: [{ kind: "asc" }, { name: "asc" }],
      select: { id: true, name: true, kind: true, subject: true, body: true },
    }),
    groupCtx.parentTenantId
      ? db.messageTemplate.findMany({
          where: { tenantId: groupCtx.parentTenantId, shared: true, active: true, kind: { in: kinds } },
          orderBy: [{ kind: "asc" }, { name: "asc" }],
          select: { id: true, name: true, kind: true, subject: true, body: true },
        })
      : Promise.resolve([] as { id: string; name: string; kind: MessageTemplateKind; subject: string; body: string }[]),
  ]);
  // Mark inherited rows in the dropdown label so the sender knows the source
  // (and that they can't edit it). We cannot append the parent's name as a
  // separate field because the existing template type is { name, ... }; the
  // bracketed prefix is the cheapest non-breaking visual cue.
  const templates = [
    ...own,
    ...inherited.map((t) => ({ ...t, name: `[Shared] ${t.name}` })),
  ];

  const bag: TemplateBag = {
    tenant:   tenant   ? { name: tenant.name } : undefined,
    customer: customer ? { name: customer.name, email: customer.email } : undefined,
    contact:  contact  ? { firstName: contact.firstName, lastName: contact.lastName } : undefined,
    quote:    quote    ? { number: quote.number, total: formatMoney(quote.total.toString(), currency) } : undefined,
    order:    order    ? { number: order.number, dueDate: order.dueDate ? formatDate(order.dueDate) : null } : undefined,
    install:  install  ? { scheduledAt: install.scheduledStart ? formatDateTime(install.scheduledStart) : null } : undefined,
    user:     sender   ? { name: sender.name ?? sender.email } : undefined,
  };

  return {
    bag,
    templates,
    customer: customer
      ? { id: customer.id, name: customer.name, email: customer.email }
      : { id: opts.customerId, name: "", email: null },
  };
}

// ────────────────────────────────────────────────────────────
// Internal helpers
// ────────────────────────────────────────────────────────────

function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!,
  );
}

function bodyToHtml(subject: string, body: string, shopName: string): string {
  const paragraphs = body
    .split(/\n{2,}/)
    .map((p) => `<p>${esc(p.replace(/\n/g, "<br />"))}</p>`)
    .join("\n");
  return `<!doctype html>
<html><body style="margin:0;padding:24px;background:#f7f7f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#222">
  <div style="max-width:560px;margin:0 auto;background:#fff;padding:28px 28px 24px;border-radius:12px;border:1px solid #eaeaef">
    <h1 style="margin:0 0 16px;font-size:18px">${esc(subject)}</h1>
    ${paragraphs}
    <hr style="border:none;border-top:1px solid #eee;margin:24px 0 12px"/>
    <p style="color:#888;font-size:12px;margin:0">${esc(shopName)}</p>
  </div>
</body></html>`;
}
