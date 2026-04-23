// sendNotification() — the public entrypoint for emitting a
// transactional notification.
//
// What it does, in order:
//   1. Look up the kind in the code registry. Unknown kind → throw.
//   2. Resolve the target channel list (caller override OR the kind's
//      registration default). M5 made this multi-channel, so a single
//      call can fan out EMAIL + IN_APP in one shot.
//   3. For each channel:
//      a. Load the DB row for (kind, channel, locale). Missing row →
//         fall back to the code-side default for that channel, which
//         may itself fall back to the EMAIL default (IN_APP inherits
//         wording unless the admin authors something channel-specific).
//      b. Check the enabled toggle. Disabled + non-critical → no-op.
//         Disabled + critical → deliver anyway and audit-log it.
//      c. Validate required tokens. Missing → fall back to defaults
//         and audit-log the miss.
//      d. Render + deliver. EMAIL → sendEmail(). IN_APP →
//         db.notification.create(). Provider errors never throw.
//   4. Return a DispatchResult summarizing EMAIL delivery — that's
//      the historically-important one; IN_APP success is best-effort
//      and audit-logged on failure.
//
// Exceptions are reserved for programmer errors (unknown kind,
// malformed schema, calling IN_APP without tenantId/userId).

import { db } from "@/lib/db";
import { sendEmail } from "@/lib/email";
import { logAudit } from "@/lib/audit";
import { getRegistration } from "./registry";
import { loadBrand } from "./brand";
import { renderTemplate, renderInAppTemplate } from "./render";
import {
  MissingRequiredTokenError,
  validateRequiredTokens,
} from "./tokens";
import type {
  DispatchResult,
  NotificationChannel,
  TemplateContent,
  TokenValues,
} from "./types";

export interface SendNotificationOptions {
  kind: string;
  tokens: TokenValues;
  // Scope metadata. tenantId + userId become REQUIRED when channels
  // include "IN_APP" (those are the row's primary keys). EMAIL-only
  // calls can omit them; the dispatcher audit-logs the miss rather
  // than blocking delivery.
  tenantId?: string;
  userId?: string;
  // EMAIL delivery target. Required when "EMAIL" is in the resolved
  // channel list. Kept loose-typed at the API boundary so callers
  // don't have to pre-check user.email — the dispatcher no-ops on
  // missing addresses and audit-logs the skip.
  to?: string;
  // Channel override. Omitted → defaults to ["EMAIL"] for backward
  // compatibility with v1 callers. Pass a subset of the kind's
  // registered channels to pick a delivery path.
  channels?: NotificationChannel[];
  // IN_APP metadata. `link` is what the bell row links to; if omitted,
  // the resolved ctaUrlToken is used. `inAppType` overrides the `type`
  // column on the Notification row — used by the bell UI for
  // icon/color lookup via NOTIFICATION_META. Defaults to the kind
  // name (unknown kinds fall through to a gray icon + the kind string
  // as label, which is an acceptable degraded state).
  link?: string;
  inAppType?: string;
  // IN_APP dedup anchors. Stored on the Notification row so the
  // inbox can link back to the entity.
  entityType?: string;
  entityId?: string;
  locale?: string;
}

export async function sendNotification(
  opts: SendNotificationOptions,
): Promise<DispatchResult> {
  const { kind, tokens, tenantId, userId, to } = opts;
  const locale = opts.locale ?? "en";
  const reg = getRegistration(kind);
  if (!reg) {
    // Programmer error — a caller referenced a kind that doesn't
    // exist in registry.ts. No safe fallback for "unknown kind".
    throw new Error(`Unknown notification kind: ${kind}`);
  }

  // Resolve channels. Default to EMAIL to preserve v1 behaviour for
  // every call site that hasn't opted into multi-channel.
  const channels: NotificationChannel[] = opts.channels ?? ["EMAIL"];

  // Merge global tokens once — they're channel-agnostic.
  const brand = await loadBrand();
  const mergedTokens: TokenValues = {
    product_name: brand.productName,
    support_email: brand.supportEmail ?? "",
    current_year: new Date().getFullYear(),
    ...tokens,
  };

  // Dispatch EMAIL first, IN_APP second. Email dispatch owns the
  // returned DispatchResult (the historically-important path); IN_APP
  // failures audit-log and don't surface. If email isn't in the
  // channel list we still return a meaningful result so callers who
  // only fire IN_APP aren't misled.
  let emailResult: DispatchResult = { sent: false, reason: "no_channel_content" };

  for (const channel of channels) {
    if (channel === "EMAIL") {
      emailResult = await dispatchEmail({
        kind,
        to,
        reg,
        tokens: mergedTokens,
        tenantId,
        userId,
        locale,
        brand,
      });
    } else if (channel === "IN_APP") {
      // Best-effort. Never blocks the EMAIL path.
      await dispatchInApp({
        kind,
        reg,
        tokens: mergedTokens,
        tenantId,
        userId,
        locale,
        inAppType: opts.inAppType,
        link: opts.link,
        entityType: opts.entityType,
        entityId: opts.entityId,
      });
    }
    // SMS + PUSH reserved for future milestones.
  }

  return emailResult;
}

// ── EMAIL path (extracted from the v1 single-channel dispatcher) ──

interface DispatchEmailArgs {
  kind: string;
  to: string | undefined;
  reg: ReturnType<typeof getRegistration>;
  tokens: TokenValues;
  tenantId: string | undefined;
  userId: string | undefined;
  locale: string;
  brand: Awaited<ReturnType<typeof loadBrand>>;
}

async function dispatchEmail(args: DispatchEmailArgs): Promise<DispatchResult> {
  const { kind, to, reg, tokens, tenantId, userId, locale, brand } = args;
  if (!reg) throw new Error(`Unknown notification kind: ${kind}`);

  if (!to) {
    // Quiet no-op — a common case is "user has no email on file". We
    // audit-log it so ops can find silently-skipped notifications
    // without scraping logs.
    await safeAudit({
      tenantId,
      userId,
      action: "notification.skipped_no_address",
      entityType: "NotificationTemplate",
      metadata: { kind, channel: "EMAIL", locale },
    });
    return { sent: false, reason: "no_channel_content" };
  }

  // Load DB row if present. DB failure → compile-time default.
  let dbRow: Awaited<ReturnType<typeof db.notificationTemplate.findUnique>> | null = null;
  try {
    dbRow = await db.notificationTemplate.findUnique({
      where: { kind_channel_locale: { kind, channel: "EMAIL", locale } },
    });
  } catch (err) {
    console.error("[notifications] failed to load template", kind, err);
  }

  const defaultContent = reg.defaultContent.EMAIL;
  if (!defaultContent) {
    throw new Error(
      `No default EMAIL content for ${kind}. Add one in defaults.ts.`,
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

  // Enabled-toggle enforcement — critical kinds override with audit.
  if (dbRow && dbRow.enabled === false) {
    if (!reg.isCritical) {
      await safeAudit({
        tenantId,
        userId,
        action: "notification.skipped_disabled",
        entityType: "NotificationTemplate",
        entityId: dbRow.id,
        metadata: { kind, channel: "EMAIL", locale, reason: "disabled" },
      });
      return { sent: false, reason: "disabled" };
    }
    await safeAudit({
      tenantId,
      userId,
      action: "notification.critical_override",
      entityType: "NotificationTemplate",
      entityId: dbRow.id,
      metadata: { kind, channel: "EMAIL", locale },
    });
  }

  // Validate required tokens — fall back to default on miss.
  try {
    validateRequiredTokens(reg.tokens, tokens);
  } catch (err) {
    if (err instanceof MissingRequiredTokenError) {
      await safeAudit({
        tenantId,
        userId,
        action: "notification.missing_token",
        entityType: "NotificationTemplate",
        entityId: dbRow?.id,
        metadata: {
          kind, channel: "EMAIL", locale,
          missing: err.token,
          fellBackToDefault: !usingDefault,
        },
      });
      if (!usingDefault) content = defaultContent;
    } else {
      throw err;
    }
  }

  const rendered = renderTemplate({ content, tokens, brand });
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
        kind, channel: "EMAIL", locale,
        error: err instanceof Error ? err.message : String(err),
      },
    });
    return { sent: false, reason: "provider_error", subject: rendered.subject };
  }

  return {
    sent: true,
    providerMessageId: providerId,
    subject: rendered.subject,
  };
}

// ── IN_APP path ───────────────────────────────────────────────────

interface DispatchInAppArgs {
  kind: string;
  reg: ReturnType<typeof getRegistration>;
  tokens: TokenValues;
  tenantId: string | undefined;
  userId: string | undefined;
  locale: string;
  inAppType: string | undefined;
  link: string | undefined;
  entityType: string | undefined;
  entityId: string | undefined;
}

async function dispatchInApp(args: DispatchInAppArgs): Promise<void> {
  const { kind, reg, tokens, tenantId, userId, locale } = args;
  if (!reg) return;

  if (!tenantId || !userId) {
    await safeAudit({
      tenantId,
      userId,
      action: "notification.skipped_no_recipient",
      entityType: "NotificationTemplate",
      metadata: {
        kind, channel: "IN_APP", locale,
        reason: "missing tenantId or userId",
      },
    });
    return;
  }

  // Resolve content. IN_APP defaults are authored per-kind when the
  // admin wants distinct wording; otherwise we fall back to the EMAIL
  // default (the headline + body map 1:1 for almost every kind, and
  // this keeps registrations terse).
  const dbRow = await safeLoadRow(kind, "IN_APP", locale);
  const defaultContent = reg.defaultContent.IN_APP ?? reg.defaultContent.EMAIL;
  if (!defaultContent) {
    await safeAudit({
      tenantId,
      userId,
      action: "notification.in_app_skipped",
      metadata: { kind, reason: "no default content registered" },
    });
    return;
  }

  let content: TemplateContent = defaultContent;
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
  }

  if (dbRow && dbRow.enabled === false) {
    if (!reg.isCritical) {
      await safeAudit({
        tenantId, userId,
        action: "notification.skipped_disabled",
        entityType: "NotificationTemplate",
        entityId: dbRow.id,
        metadata: { kind, channel: "IN_APP", locale, reason: "disabled" },
      });
      return;
    }
    await safeAudit({
      tenantId, userId,
      action: "notification.critical_override",
      entityType: "NotificationTemplate",
      entityId: dbRow.id,
      metadata: { kind, channel: "IN_APP", locale },
    });
  }

  try {
    validateRequiredTokens(reg.tokens, tokens);
  } catch (err) {
    if (err instanceof MissingRequiredTokenError) {
      await safeAudit({
        tenantId, userId,
        action: "notification.missing_token",
        entityType: "NotificationTemplate",
        entityId: dbRow?.id,
        metadata: {
          kind, channel: "IN_APP", locale,
          missing: err.token,
          fellBackToDefault: !usingDefault,
        },
      });
      if (!usingDefault) content = defaultContent;
    } else {
      throw err;
    }
  }

  const rendered = renderInAppTemplate({ content, tokens });
  try {
    await db.notification.create({
      data: {
        tenantId,
        userId,
        type: args.inAppType ?? kind,
        title: rendered.title,
        body: rendered.body,
        link: args.link ?? rendered.link ?? undefined,
        entityType: args.entityType,
        entityId: args.entityId,
      },
    });
  } catch (err) {
    await safeAudit({
      tenantId, userId,
      action: "notification.in_app_error",
      metadata: {
        kind,
        error: err instanceof Error ? err.message : String(err),
      },
    });
  }
}

async function safeLoadRow(kind: string, channel: NotificationChannel, locale: string) {
  try {
    return await db.notificationTemplate.findUnique({
      where: { kind_channel_locale: { kind, channel, locale } },
    });
  } catch (err) {
    console.error("[notifications] failed to load template", kind, channel, err);
    return null;
  }
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
