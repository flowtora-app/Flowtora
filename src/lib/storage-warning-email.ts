// Storage-quota warning email — fired when a tenant crosses 85% of
// their plan's storage cap, so they hear about it before they hit
// the wall. Hysteresis on a 75% reset point stops a tenant who's
// hovering around the line from getting hammered with notifications
// every time a file is added or deleted.
//
// Trigger: each successful upload calls maybeSendStorageWarning() in
// fire-and-forget mode (the upload itself doesn't block on email
// success). The check is cheap — we already have the post-upload
// usage in hand and only do the DB write/email send when the state
// transition actually happens.

import type { Plan } from "@prisma/client";
import { db } from "@/lib/db";
import { sendEmail, brandedEmailLayout, brandedTextLayout, type BrandedContentSection } from "@/lib/email";
import { loadBrand } from "@/lib/notifications/brand";
import { getStorageUsage, GB_IN_BYTES, formatBytes } from "@/lib/storage-quota";
import { logAudit } from "@/lib/audit";

const WARN_THRESHOLD = 0.85;
const RESET_THRESHOLD = 0.75;

/**
 * Reconcile the storage-warning flag for a tenant. Looks up the
 * current usage via getStorageUsage() (one aggregate query), then
 * sends the warning email when we've JUST crossed the 85% line, and
 * clears the flag when we drop below 75%. No-op for unlimited tiers.
 *
 * Designed to be called fire-and-forget after each upload — it does
 * its own DB lookups and never throws into the caller path.
 */
export async function maybeSendStorageWarning(args: {
  tenantId: string;
  plan: Plan;
}): Promise<void> {
  let usage: Awaited<ReturnType<typeof getStorageUsage>>;
  try {
    usage = await getStorageUsage(args.tenantId, args.plan);
  } catch {
    return; // never block uploads on a warning-email path
  }
  if (!Number.isFinite(usage.quotaBytes) || usage.quotaBytes <= 0) return;

  const pct = usage.percentUsed;

  // Read the tenant's current warning state + the recipients we'd
  // email if we decide to fire. One round trip.
  const tenant = await db.tenant.findUnique({
    where: { id: args.tenantId },
    select: {
      id: true,
      name: true,
      slug: true,
      storageWarningEmailSentAt: true,
    },
  });
  if (!tenant) return;

  // Reset path: we already warned once, but they've cleaned up below
  // the reset point. Clear the flag so the NEXT crossing will warn.
  if (tenant.storageWarningEmailSentAt && pct < RESET_THRESHOLD) {
    await db.tenant.update({
      where: { id: tenant.id },
      data: { storageWarningEmailSentAt: null },
    });
    return;
  }

  // Warn path: we're past the threshold and haven't told them yet.
  if (pct >= WARN_THRESHOLD && !tenant.storageWarningEmailSentAt) {
    await sendStorageWarning({
      tenantId: tenant.id,
      tenantName: tenant.name,
      tenantSlug: tenant.slug,
      usedBytes: usage.usedBytes,
      quotaBytes: usage.quotaBytes,
    });
    await db.tenant.update({
      where: { id: tenant.id },
      data: { storageWarningEmailSentAt: new Date() },
    });
  }
}

async function sendStorageWarning(args: {
  tenantId: string;
  tenantName: string;
  tenantSlug: string;
  usedBytes: number;
  quotaBytes: number;
}): Promise<void> {
  // Recipients: every Owner or Admin on the tenant who has an email.
  const recipients = await db.membership.findMany({
    where: {
      tenantId: args.tenantId,
      status: "ACTIVE",
      role: { in: ["OWNER", "ADMIN"] },
    },
    select: { user: { select: { email: true, name: true } } },
  });
  const toAddresses = recipients
    .map((m) => m.user.email)
    .filter((e): e is string => !!e);
  if (toAddresses.length === 0) return;

  const brand = await loadBrand();
  const pct = Math.round((args.usedBytes / args.quotaBytes) * 100);
  const used = formatBytes(args.usedBytes);
  const quota = formatBytes(args.quotaBytes);
  const remainingGB = Math.max(
    0,
    (args.quotaBytes - args.usedBytes) / GB_IN_BYTES,
  );
  const remaining = remainingGB < 1
    ? `${(remainingGB * 1024).toFixed(0)} MB`
    : `${remainingGB.toFixed(1)} GB`;
  const upgradeUrl = `${process.env.APP_URL ?? "https://flowtora.com"}/t/${args.tenantSlug}/settings/billing`;

  const subject = `${args.tenantName}: file storage is ${pct}% full`;

  const sections: BrandedContentSection[] = [
    {
      kind: "text",
      html: `<p>Heads up — your Flowtora workspace is approaching its storage limit.</p>`,
    },
    {
      kind: "text",
      html: `
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:8px 0">
          <tr>
            <td style="padding:14px 16px;border-radius:10px;background:#f5f7fb;border:1px solid #e5e7eb">
              <div style="font-size:14px;color:#111827"><strong>${used}</strong> of ${quota} used</div>
              <div style="font-size:12px;color:#6b7280;margin-top:2px">${remaining} remaining · ${pct}% full</div>
            </td>
          </tr>
        </table>
      `,
    },
    {
      kind: "text",
      html: `<p>Once you hit 100%, new uploads (proofs, receipts, install photos, customer files) will be blocked until you free up space or upgrade your plan.</p>`,
    },
    {
      kind: "button",
      label: "Manage storage",
      href: upgradeUrl,
    },
    {
      kind: "text",
      html: `<p style="color:#6b7280;font-size:13px">You can free up space by deleting old files in each section, or upgrade for more storage. We'll only send this once per quota crossing — you won't see another reminder unless you fall back below 75% and climb again.</p>`,
    },
  ];

  const html = brandedEmailLayout({
    previewText: `Your file storage is ${pct}% full.`,
    heading: `Storage at ${pct}%`,
    subheading: args.tenantName,
    sections,
    brand,
  });
  const text = brandedTextLayout({
    heading: `Storage at ${pct}%`,
    body:
      `${args.tenantName}'s Flowtora workspace is ${pct}% full ` +
      `(${used} of ${quota} used; ${remaining} remaining). ` +
      `Once you hit 100%, new uploads will be blocked until you free ` +
      `up space or upgrade your plan.`,
    ctaLabel: "Manage storage",
    ctaUrl: upgradeUrl,
    brand,
  });

  // sendEmail takes a single string recipient; loop so each recipient
  // sees their own copy in their inbox (and so a delivery failure to
  // one address doesn't drop the whole notification).
  try {
    for (const to of toAddresses) {
      await sendEmail({
        to,
        subject,
        html,
        text,
        fromName: brand.fromName ?? brand.productName,
        replyTo: brand.replyTo ?? undefined,
      });
    }
    await logAudit({
      tenantId: args.tenantId,
      userId: null,
      action: "storage.warning_sent",
      metadata: {
        usedBytes: args.usedBytes,
        quotaBytes: args.quotaBytes,
        recipients: toAddresses.length,
      },
    });
  } catch (err) {
    // Never block the upload pipeline on email send failure.
    console.error("[maybeSendStorageWarning] send failed:", err);
  }
}
