"use server";

// Payment server actions — Page 17.
//
// Permissions:
//   • Retry / bulk retry / send portal link: billing.invoice.
//
// Honest deferral: we don't actually re-charge through Stripe today.
// The retry actions stamp a new attempt row with status "pending"
// and rely on the future webhook handler to flip it to succeeded /
// failed. Until the integration ships, retries don't move money.

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { sendEmail } from "@/lib/email";
import { logPlatformAudit, requirePlatformStaff } from "@/lib/platform";
import { appOrigin } from "@/lib/share";

/* ── Retry payment ──────────────────────────────────────── */

const retrySchema = z.object({
  paymentId: z.string().min(1),
});

export async function retryInvoicePayment(formData: FormData) {
  const ctx = await requirePlatformStaff();
  if (!ctx.can("billing.invoice")) {
    return { ok: false, error: "Your role can't retry payments" } as const;
  }
  const parsed = retrySchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { ok: false, error: "Invalid input" } as const;

  const orig = await db.platformInvoicePayment.findUnique({
    where: { id: parsed.data.paymentId },
    select: {
      id: true, invoiceId: true, gateway: true, method: true,
      amount: true, status: true,
      invoice: { select: { tenantId: true } },
    },
  });
  if (!orig) return { ok: false, error: "Payment not found" } as const;
  if (orig.status !== "failed") {
    return { ok: false, error: "Only failed payments can be retried" } as const;
  }

  // Mint a fresh attempt row tagged pending. Real Stripe call goes
  // here once the integration is wired.
  const retry = await db.platformInvoicePayment.create({
    data: {
      invoiceId: orig.invoiceId,
      gateway: orig.gateway,
      method: orig.method,
      amount: orig.amount,
      status: "pending",
    },
  });
  await logPlatformAudit({
    userId: ctx.userId,
    tenantId: orig.invoice.tenantId,
    action: "platform.payment_retried",
    entityType: "PlatformInvoicePayment",
    entityId: retry.id,
    metadata: { actor: ctx.email, originalPaymentId: orig.id },
    severity: "WARNING",
  });
  revalidatePath("/platform/billing/payments");
  return { ok: true, id: retry.id } as const;
}

/* ── Bulk retry ─────────────────────────────────────────── */

const bulkRetrySchema = z.object({
  paymentIds: z.string().min(1), // CSV
});

export async function bulkRetryPayments(formData: FormData) {
  const ctx = await requirePlatformStaff();
  if (!ctx.can("billing.invoice")) {
    return { ok: false, error: "Your role can't retry payments" } as const;
  }
  const parsed = bulkRetrySchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { ok: false, error: "Invalid input" } as const;
  const ids = parsed.data.paymentIds.split(",").map((s) => s.trim()).filter(Boolean);
  if (ids.length === 0) return { ok: false, error: "No payments selected" } as const;

  const failedRows = await db.platformInvoicePayment.findMany({
    where: { id: { in: ids }, status: "failed" },
    select: {
      id: true, invoiceId: true, gateway: true, method: true, amount: true,
    },
  });

  if (failedRows.length === 0) {
    return { ok: false, error: "Selected payments aren't in a retry-able state" } as const;
  }

  await db.platformInvoicePayment.createMany({
    data: failedRows.map((r) => ({
      invoiceId: r.invoiceId,
      gateway: r.gateway,
      method: r.method,
      amount: r.amount,
      status: "pending",
    })),
  });
  await logPlatformAudit({
    userId: ctx.userId,
    action: "platform.payments_bulk_retried",
    entityType: "PlatformInvoicePayment",
    metadata: { actor: ctx.email, count: failedRows.length, requested: ids.length },
    severity: "WARNING",
  });
  revalidatePath("/platform/billing/payments");
  return { ok: true, count: failedRows.length } as const;
}

/* ── Send "Update payment method" email ─────────────────── */

const portalEmailSchema = z.object({
  paymentId: z.string().min(1),
});

export async function sendUpdatePaymentMethodEmail(formData: FormData) {
  const ctx = await requirePlatformStaff();
  if (!ctx.can("billing.invoice")) {
    return { ok: false, error: "Your role can't send portal links" } as const;
  }
  const parsed = portalEmailSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { ok: false, error: "Invalid input" } as const;

  const p = await db.platformInvoicePayment.findUnique({
    where: { id: parsed.data.paymentId },
    select: {
      invoice: {
        select: {
          tenantId: true,
          tenant: {
            select: {
              name: true, slug: true,
              memberships: {
                where: { role: "OWNER" },
                select: { user: { select: { email: true } } },
                take: 1,
              },
            },
          },
        },
      },
    },
  });
  if (!p) return { ok: false, error: "Payment not found" } as const;
  const ownerEmail = p.invoice.tenant.memberships[0]?.user?.email;
  if (!ownerEmail) return { ok: false, error: "No OWNER email on file" } as const;

  // We don't mint a Stripe portal session today — link to the
  // workspace settings billing tab instead.
  const url = `${appOrigin()}/t/${p.invoice.tenant.slug}/settings/billing`;
  await sendEmail({
    to: ownerEmail,
    subject: `Update your payment method · ${p.invoice.tenant.name}`,
    text: [
      "Hey,",
      "",
      "We tried to charge your payment method and it didn't go through. To keep your Flowtora workspace active, please update it here:",
      "",
      url,
      "",
      "If you've already fixed this on the gateway side, you can ignore this email — the next billing cycle will pick up the new method automatically.",
      "",
      "— The Flowtora team",
    ].join("\n"),
    html: `<p>We tried to charge your payment method and it didn't go through. To keep your Flowtora workspace active, please update it here:</p>
<p><a href="${url}">${url}</a></p>
<p>If you've already fixed this on the gateway side, you can ignore this email — the next billing cycle will pick up the new method automatically.</p>`,
  });
  await logPlatformAudit({
    userId: ctx.userId,
    tenantId: p.invoice.tenantId,
    action: "platform.payment_portal_link_sent",
    entityType: "PlatformInvoicePayment",
    entityId: parsed.data.paymentId,
    metadata: { actor: ctx.email, recipient: ownerEmail },
  });
  return { ok: true } as const;
}
