// sendNotification() — the public entrypoint for emitting a
// transactional notification.
//
// What it does, in order:
//   1. Look up the kind in the code registry. Unknown kind → throw in
//      dev, log + no-op in production (so an unshipped caller can't
//      take down a deploy).
//   2. Load the DB row for (kind, channel, locale). Missing row →
//      fall back to `registration.defaultContent[channel]`.
//   3. Check the enabled toggle. Disabled + non-critical → no-op.
//      Disabled + critical → send anyway and audit-log the override.
//   4. Merge global tokens (product_name, support_email, current_year)
//      into caller-supplied tokens.
//   5. Validate required tokens. Missing required → fall back to
//      defaults + audit-log the miss. The caller's email still goes
//      out because auth/security are load-bearing.
//   6. Render through renderTemplate(), which applies the branded
//      layout.
//   7. Call sendEmail() and return the result.
//
// The dispatcher never throws on provider errors — it returns a
// `DispatchResult` with `sent: false` and a reason, same as sendEmail
// already wraps. Exceptions are reserved for programmer errors
// (unknown kind, malformed schema).

import { db } from "@/lib/db";
import { sendEmail } from "@/lib/email";
import { logAudit } from "@/lib/audit";
import { getRegistration, GLOBAL_TOKENS } from "./registry";
import { loadBrand } from "./brand";
import { renderTemplate } from "./render";
import {
  MissingRequiredTokenError,
  validateRequiredTokens,
} from "./tokens";
import type { DispatchResult, TemplateContent, TokenValues } from "./types";

export interface SendNotificationOptions {
  kind: string;
  to: string;
  tokens: TokenValues;
  // Optional scope metadata for audit + delivery logging.
  tenantId?: string;
  userId?: string;
  // Override the default EMAIL channel. Reserved for M5+ — we only
  // render email content today.
  channel?: "EMAIL";
  locale?: string;
}

export async function sendNotification(
  opts: SendNotificationOptions,
): Promise<DispatchResult> {
  const { kind, to, tokens, tenantId, userId } = opts;
  const channel = opts.channel ?? "EMAIL";
  const locale = opts.locale ?? "en";

  const reg = getRegistration(kind);
  if (!reg) {
    // Programmer error — a caller referenced a kind that doesn't
    // exist in registry.ts. Throw in dev; in prod we still throw
    // because the call site is almost certainly a typo that tests
    // didn't catch. There's no safe fallback for "unknown kind".
    throw new Error(`Unknown notification kind: ${kind}`);
  }

  // Load DB row if present. Any DB failure falls through to the
  // compile-time default — an outage in notification_templates
  // must not take down auth/billing emails.
  let dbRow: Awaited<ReturnType<typeof db.notificationTemplate.findUnique>> | null = null;
  try {
    dbRow = await db.notificationTemplate.findUnique({
      where: { kind_channel_locale: { kind, channel, locale } },
    });
  } catch (err) {
    console.error("[notifications] failed to load template", kind, err);
  }

  // Resolve content: published DB row wins, else default.
  const defaultContent = reg.defaultContent[channel];
  if (!defaultContent) {
    // Channel registered but no default provided — only happens if a
    // future IN_APP / SMS kind lists a channel and the code-side
    // default hasn't been written yet. Fail loudly so we catch it in
    // review, not in prod.
    throw new Error(
      `No default content for ${kind} on channel ${channel}. Add one in defaults.ts.`,
    );
  }

  let content: TemplateContent;
  let usingDefault = true;
  if (dbRow && dbRow.status === "PUBLISHED") {
    content = {
      subject: dbRow.subject,
      preheader: dbRow.preheader,
      headline: dbRow.headline,
      subheading: dbRow.subheading,
      body: dbRow.body,
      ctaLabel: dbRow.ctaLabel,
      ctaUrlToken: dbRow.ctaUrlToken,
      footerNote: dbRow.footerNote,
    };
    usingDefault = false;
  } else {
    content = defaultContent;
  }

  // Enabled-toggle enforcement. Critical kinds ignore the toggle
  // (they must always send) but we audit the override so an ops
  // review can catch an admin trying to silence something they
  // shouldn't.
  if (dbRow && dbRow.enabled === false) {
    if (!reg.isCritical) {
      await safeAudit({
        tenantId,
        userId,
        action: "notification.skipped_disabled",
        entityType: "NotificationTemplate",
        entityId: dbRow.id,
        metadata: { kind, channel, locale, reason: "disabled" },
      });
      return { sent: false, reason: "disabled" };
    }
    // Critical: still sends; log the override for visibility.
    await safeAudit({
      tenantId,
      userId,
      action: "notification.critical_override",
      entityType: "NotificationTemplate",
      entityId: dbRow.id,
      metadata: { kind, channel, locale },
    });
  }

  // Merge global tokens. Callers can override by passing their own
  // values for the same key, but there's rarely a reason to.
  const brand = await loadBrand();
  const merged: TokenValues = {
    product_name: brand.productName,
    support_email: brand.supportEmail ?? "",
    current_year: new Date().getFullYear(),
    ...tokens,
  };

  // Validate required tokens. If the caller forgot a required one we
  // fall back to the compile-time default (which may be subtly more
  // forgiving — e.g. a default without a {{user_name}} interpolation)
  // and audit-log the miss. This is preferable to hard-failing the
  // caller's user flow (signup, password reset) on a template-side
  // data gap.
  try {
    validateRequiredTokens(reg.tokens, merged);
  } catch (err) {
    if (err instanceof MissingRequiredTokenError) {
      await safeAudit({
        tenantId,
        userId,
        action: "notification.missing_token",
        entityType: "NotificationTemplate",
        entityId: dbRow?.id,
        metadata: { kind, channel, locale, missing: err.token, fellBackToDefault: !usingDefault },
      });
      if (!usingDefault) {
        // DB row missing a token — fall back to the default which we
        // know is authored to be token-complete.
        content = defaultContent;
      } else {
        // Default itself is missing a token — caller bug. Render with
        // empty string (same as resolveTokens does for missing keys).
      }
    } else {
      throw err;
    }
  }

  const rendered = renderTemplate({ content, tokens: merged, brand });

  const fromName = brand.fromName ?? undefined;
  const replyTo = brand.replyTo ?? brand.supportEmail ?? undefined;

  let providerId: string | null = null;
  try {
    providerId = await sendEmail({
      to,
      subject: rendered.subject,
      html: rendered.html,
      text: rendered.text,
      fromName,
      replyTo,
    });
  } catch (err) {
    await safeAudit({
      tenantId,
      userId,
      action: "notification.provider_error",
      entityType: "NotificationTemplate",
      entityId: dbRow?.id,
      metadata: {
        kind,
        channel,
        locale,
        error: err instanceof Error ? err.message : String(err),
      },
    });
    return { sent: false, reason: "provider_error", subject: rendered.subject };
  }

  // Successful send — no audit row on success by default to keep the
  // audit log scannable. A future M3 will wire up a NotificationEvent
  // table per-send for delivery analytics.

  return {
    sent: true,
    providerMessageId: providerId,
    subject: rendered.subject,
  };
}

// logAudit swallows its own errors but we wrap anyway so a broken
// audit model can't take down a notification.
async function safeAudit(args: Parameters<typeof logAudit>[0]): Promise<void> {
  try {
    await logAudit(args);
  } catch {
    /* swallow */
  }
}
