"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/tenant";
import { requirePortalToken } from "@/lib/portal";
import { notify } from "@/lib/notifications";
import { sendCustomerEmail } from "@/lib/customer-emails";
import { logAudit } from "@/lib/audit";

const bodySchema = z.object({
  body:    z.string().min(1).max(4000),
  subject: z.string().max(300).optional().or(z.literal("")),
  relatedEntityType: z.string().max(50).optional().or(z.literal("")),
  relatedEntityId:   z.string().optional().or(z.literal("")),
});

const empty = (s: string | undefined) => (s && s.length > 0 ? s : null);

// ── Customer sends a message from the portal ──────────────────────────────

export async function sendPortalMessage(
  token: string,
  formData: FormData,
) {
  const ctx = await requirePortalToken(token);
  const parsed = bodySchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    redirect(`/portal/${token}/messages?error=${encodeURIComponent("Message is required.")}`);
  }
  const d = parsed.data;

  const message = await db.portalMessage.create({
    data: {
      tenantId:          ctx.tenant.id,
      customerId:        ctx.customer.id,
      direction:         "INBOUND",
      subject:           empty(d.subject),
      body:              d.body,
      relatedEntityType: empty(d.relatedEntityType),
      relatedEntityId:   empty(d.relatedEntityId),
    },
  });

  // Notify all tenant admins / owners that there's an inbound message.
  const adminMembers = await db.membership.findMany({
    where: {
      tenantId: ctx.tenant.id,
      status:   "ACTIVE",
      role:     { in: ["OWNER", "ADMIN", "SALES_REP", "CSR"] },
    },
    select: { userId: true },
  });

  await Promise.all(
    adminMembers.map((m) =>
      notify({
        tenantId:   ctx.tenant.id,
        userId:     m.userId,
        type:       "portal.message_received",
        title:      `Message from ${ctx.customer.name}`,
        body:       d.body.slice(0, 120),
        entityType: "PortalMessage",
        entityId:   message.id,
        link:       `/t/${ctx.tenant.slug}/customers/${ctx.customer.id}?tab=messages`,
      }),
    ),
  );

  revalidatePath(`/portal/${token}/messages`);
  redirect(`/portal/${token}/messages?ok=1`);
}

// ── Staff replies from the customer detail page ───────────────────────────

const replySchema = z.object({
  body:       z.string().min(1).max(4000),
  subject:    z.string().max(300).optional().or(z.literal("")),
  toAddress:  z.string().email(),
  relatedEntityType: z.string().max(50).optional().or(z.literal("")),
  relatedEntityId:   z.string().optional().or(z.literal("")),
  customerId: z.string().min(1),
});

export async function replyToPortalMessage(slug: string, formData: FormData) {
  const ctx = await requirePermission(slug, "customers:edit");
  const parsed = replySchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    redirect(`/t/${slug}?error=${encodeURIComponent("Invalid reply input.")}`);
  }
  const d = parsed.data;

  const customer = await db.customer.findFirst({
    where: { id: d.customerId, tenantId: ctx.tenant.id },
    select: { id: true, name: true, email: true },
  });
  if (!customer) redirect(`/t/${slug}?error=${encodeURIComponent("Customer not found.")}`);

  const message = await db.portalMessage.create({
    data: {
      tenantId:          ctx.tenant.id,
      customerId:        customer.id,
      direction:         "OUTBOUND",
      subject:           empty(d.subject),
      body:              d.body,
      senderUserId:      ctx.userId,
      relatedEntityType: empty(d.relatedEntityType),
      relatedEntityId:   empty(d.relatedEntityId),
      readAt:            new Date(), // outbound is pre-read
    },
  });

  // Send the reply as a real email via sendCustomerEmail so the
  // EmailEvent timeline also captures it.
  await sendCustomerEmail({
    tenantId:          ctx.tenant.id,
    customerId:        customer.id,
    senderUserId:      ctx.userId,
    kind:              "UPDATE_MESSAGE",
    to:                d.toAddress,
    relatedEntityType: empty(d.relatedEntityType) ?? undefined,
    relatedEntityId:   empty(d.relatedEntityId) ?? undefined,
    rendered: {
      subject: d.subject || `Message from ${ctx.tenant.name}`,
      html:    replyToHtml(d.subject || `Message from ${ctx.tenant.name}`, d.body, ctx.tenant.name),
      text:    d.body,
    },
  });

  await logAudit({
    tenantId:   ctx.tenant.id,
    userId:     ctx.userId,
    action:     "portal_message.replied",
    entityType: "PortalMessage",
    entityId:   message.id,
    metadata:   { customerId: customer.id, toAddress: d.toAddress },
  });

  revalidatePath(`/t/${slug}/customers/${customer.id}`);
  redirect(`/t/${slug}/customers/${customer.id}?tab=messages&ok=1`);
}

// ── Staff marks inbound messages as read ─────────────────────────────────

export async function markPortalMessagesRead(slug: string, customerId: string) {
  const ctx = await requirePermission(slug, "customers:view");
  await db.portalMessage.updateMany({
    where: {
      tenantId:   ctx.tenant.id,
      customerId,
      direction:  "INBOUND",
      readAt:     null,
    },
    data: { readAt: new Date() },
  });
  revalidatePath(`/t/${slug}/customers/${customerId}`);
  revalidatePath(`/t/${slug}/inbox`);
}

// Bulk "mark every unread inbound as read" — backs the centralized inbox
// Mark-all-read button. Same permission gate as per-customer because the
// data scope is identical.
export async function markAllPortalMessagesRead(slug: string) {
  const ctx = await requirePermission(slug, "customers:view");
  await db.portalMessage.updateMany({
    where: {
      tenantId:   ctx.tenant.id,
      direction:  "INBOUND",
      readAt:     null,
      archivedAt: null,
    },
    data: { readAt: new Date() },
  });
  revalidatePath(`/t/${slug}/inbox`);
}

// Archive every message (both directions) in a customer's portal
// conversation. The next tick the Messages inbox will no longer list
// this customer under "Unread" / "All" — only under "Archived".
export async function archiveConversation(slug: string, customerId: string) {
  const ctx = await requirePermission(slug, "customers:edit");
  await db.portalMessage.updateMany({
    where: {
      tenantId:   ctx.tenant.id,
      customerId,
      archivedAt: null,
    },
    data: { archivedAt: new Date() },
  });
  revalidatePath(`/t/${slug}/inbox`);
  revalidatePath(`/t/${slug}/customers/${customerId}`);
}

export async function unarchiveConversation(slug: string, customerId: string) {
  const ctx = await requirePermission(slug, "customers:edit");
  await db.portalMessage.updateMany({
    where: {
      tenantId:   ctx.tenant.id,
      customerId,
      archivedAt: { not: null },
    },
    data: { archivedAt: null },
  });
  revalidatePath(`/t/${slug}/inbox`);
  revalidatePath(`/t/${slug}/customers/${customerId}`);
}

// ── Internal HTML builder ─────────────────────────────────────────────────

function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!,
  );
}

function replyToHtml(subject: string, body: string, shopName: string): string {
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
