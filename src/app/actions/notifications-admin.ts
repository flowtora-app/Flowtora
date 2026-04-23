"use server";

// Platform-side write actions for the notifications admin surface.
//
// Every mutation here is gated by `requirePlatformAdmin` (so SUPPORT_AGENT
// sees the pages but can't change anything) and audit-logged with
// `logPlatformAudit`. Reads stay on the pages themselves.
//
// Workflow model (mirrors PricingPlan's DRAFT → PUBLISHED lifecycle):
//   - A template row exists once an admin has touched it. Until then,
//     sendNotification() falls back to the compile-time default — that's
//     why an empty NotificationTemplate table is a valid production state.
//   - While status=DRAFT the dispatcher keeps using the default. Admins
//     can iterate safely without affecting live users.
//   - Publishing snapshots the current live fields into a
//     NotificationTemplateVersion and flips status to PUBLISHED. The
//     dispatcher starts serving the DB content on the very next send.
//   - "Reset to default" deletes the row; the dispatcher falls back to
//     the default again. The version history stays intact because
//     NotificationTemplateVersion cascades on delete and we accept that
//     — a reset is a clean slate, not an archive.

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { requirePlatformAdmin, logPlatformAudit } from "@/lib/platform";
import {
  getRegistration,
  invalidateBrandCache,
  listRegistrations,
  renderTemplate,
  loadBrand,
} from "@/lib/notifications";
import { validateContentTokens } from "@/lib/notifications/tokens";
import { sendEmail } from "@/lib/email";
import type { TemplateContent, TokenValues, TokenSchema } from "@/lib/notifications/types";
import type { NotificationStatus, NotificationChannel } from "@prisma/client";

// Max lengths mirror the RFC-ish limits that keep emails well-behaved in
// clients: subject + preheader stay short enough that Gmail doesn't snip
// them, body gets a generous ceiling for ops announcements.
const contentSchema = z.object({
  subject:     z.string().min(1).max(180),
  preheader:   z.string().max(200).optional().or(z.literal("")),
  headline:    z.string().min(1).max(160),
  subheading:  z.string().max(240).optional().or(z.literal("")),
  body:        z.string().min(1).max(8000),
  ctaLabel:    z.string().max(60).optional().or(z.literal("")),
  ctaUrlToken: z.string().max(200).optional().or(z.literal("")),
  footerNote:  z.string().max(2000).optional().or(z.literal("")),
  enabled:     z.union([z.literal("on"), z.literal("")]).optional(),
});

// ────────────────────────────────────────────────────────────
// Save (upsert live fields, keep status)
// ────────────────────────────────────────────────────────────

export async function saveTemplate(kind: string, formData: FormData) {
  const ctx = await requirePlatformAdmin();

  const reg = getRegistration(kind);
  if (!reg) {
    redirect(`/platform/notifications?error=${encodeURIComponent("Unknown notification kind.")}`);
  }

  const parsed = contentSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    redirect(
      `/platform/notifications/${encodeURIComponent(kind)}?error=${encodeURIComponent(
        parsed.error.errors[0]?.message ?? "Check required fields.",
      )}`,
    );
  }
  const d = parsed.data;

  // Reject unknown tokens before writing. The validator walks every
  // {{token}} in every field and cross-checks against the registered
  // tokenSchema. Typos here would render as literal "{{foo}}" in
  // delivered email — nobody wants that.
  const content: TemplateContent = {
    subject:     d.subject,
    preheader:   emptyToNull(d.preheader),
    headline:    d.headline,
    subheading:  emptyToNull(d.subheading),
    body:        d.body,
    ctaLabel:    emptyToNull(d.ctaLabel),
    ctaUrlToken: emptyToNull(d.ctaUrlToken),
    footerNote:  emptyToNull(d.footerNote),
  };
  try {
    validateContentTokens(content, reg.tokens);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Token validation failed";
    redirect(
      `/platform/notifications/${encodeURIComponent(kind)}?error=${encodeURIComponent(msg)}`,
    );
  }

  // Toggle is a no-op for critical kinds — the UI disables it too, but we
  // enforce here so a forged form submit can't silence an auth email.
  const enabled = reg.isCritical ? true : d.enabled === "on";

  const channel: NotificationChannel = "EMAIL";
  const locale = "en";
  const existing = await db.notificationTemplate.findUnique({
    where: { kind_channel_locale: { kind, channel, locale } },
  });

  if (!existing) {
    await db.notificationTemplate.create({
      data: {
        kind,
        channel,
        locale,
        status: "DRAFT",
        category: reg.category,
        sortOrder: reg.sortOrder,
        subject:     content.subject,
        preheader:   content.preheader,
        headline:    content.headline,
        subheading:  content.subheading,
        body:        content.body,
        ctaLabel:    content.ctaLabel,
        ctaUrlToken: content.ctaUrlToken,
        footerNote:  content.footerNote,
        enabled,
        isCritical: reg.isCritical ?? false,
        tokenSchema: reg.tokens as never,
        updatedById: ctx.userId,
      },
    });
  } else {
    await db.notificationTemplate.update({
      where: { id: existing.id },
      data: {
        subject:     content.subject,
        preheader:   content.preheader,
        headline:    content.headline,
        subheading:  content.subheading,
        body:        content.body,
        ctaLabel:    content.ctaLabel,
        ctaUrlToken: content.ctaUrlToken,
        footerNote:  content.footerNote,
        enabled,
        // Refresh token schema on every save so a registry update
        // (new token, removed one) propagates without a manual migration.
        tokenSchema: reg.tokens as never,
        updatedById: ctx.userId,
      },
    });
  }

  await logPlatformAudit({
    userId: ctx.userId,
    action: "platform.notification_template_saved",
    entityType: "NotificationTemplate",
    entityId: existing?.id,
    metadata: { kind, channel, locale, enabled, actor: ctx.email },
  });

  revalidatePath(`/platform/notifications/${kind}`);
  revalidatePath(`/platform/notifications`);
  redirect(
    `/platform/notifications/${encodeURIComponent(kind)}?ok=${encodeURIComponent("Saved.")}`,
  );
}

// ────────────────────────────────────────────────────────────
// Publish
// ────────────────────────────────────────────────────────────

export async function publishTemplate(kind: string) {
  const ctx = await requirePlatformAdmin();

  const reg = getRegistration(kind);
  if (!reg) {
    redirect(`/platform/notifications?error=${encodeURIComponent("Unknown notification kind.")}`);
  }

  const channel: NotificationChannel = "EMAIL";
  const locale = "en";
  const row = await db.notificationTemplate.findUnique({
    where: { kind_channel_locale: { kind, channel, locale } },
  });
  if (!row) {
    redirect(
      `/platform/notifications/${encodeURIComponent(kind)}?error=${encodeURIComponent(
        "Save before publishing.",
      )}`,
    );
  }

  // Re-validate tokens on publish — someone could have saved with a
  // token mismatch while the registry shifted out from under them.
  try {
    validateContentTokens(
      {
        subject: row.subject,
        preheader: row.preheader,
        headline: row.headline,
        subheading: row.subheading,
        body: row.body,
        ctaLabel: row.ctaLabel,
        ctaUrlToken: row.ctaUrlToken,
        footerNote: row.footerNote,
      },
      reg.tokens,
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Token validation failed";
    redirect(
      `/platform/notifications/${encodeURIComponent(kind)}?error=${encodeURIComponent(msg)}`,
    );
  }

  const latestVersion = await db.notificationTemplateVersion.findFirst({
    where: { templateId: row.id },
    orderBy: { version: "desc" },
    select: { version: true },
  });
  const nextVersion = (latestVersion?.version ?? 0) + 1;

  const now = new Date();
  await db.$transaction([
    db.notificationTemplate.update({
      where: { id: row.id },
      data: {
        status: "PUBLISHED" satisfies NotificationStatus,
        publishedAt: now,
        publishedById: ctx.userId,
      },
    }),
    db.notificationTemplateVersion.create({
      data: {
        templateId: row.id,
        version: nextVersion,
        subject: row.subject,
        preheader: row.preheader,
        headline: row.headline,
        subheading: row.subheading,
        body: row.body,
        ctaLabel: row.ctaLabel,
        ctaUrlToken: row.ctaUrlToken,
        footerNote: row.footerNote,
        publishedAt: now,
        publishedById: ctx.userId,
        tokenSchema: reg.tokens as never,
      },
    }),
  ]);

  await logPlatformAudit({
    userId: ctx.userId,
    action: "platform.notification_template_published",
    entityType: "NotificationTemplate",
    entityId: row.id,
    metadata: { kind, version: nextVersion, actor: ctx.email },
  });

  revalidatePath(`/platform/notifications/${kind}`);
  revalidatePath(`/platform/notifications`);
  redirect(
    `/platform/notifications/${encodeURIComponent(kind)}?ok=${encodeURIComponent(
      `Published as v${nextVersion}.`,
    )}`,
  );
}

// ────────────────────────────────────────────────────────────
// Unpublish — roll back to code default without losing the DB row
// ────────────────────────────────────────────────────────────

export async function unpublishTemplate(kind: string) {
  const ctx = await requirePlatformAdmin();

  const channel: NotificationChannel = "EMAIL";
  const locale = "en";
  const row = await db.notificationTemplate.findUnique({
    where: { kind_channel_locale: { kind, channel, locale } },
    select: { id: true },
  });
  if (!row) {
    redirect(`/platform/notifications?error=${encodeURIComponent("Template not found.")}`);
  }

  await db.notificationTemplate.update({
    where: { id: row.id },
    data: { status: "DRAFT" satisfies NotificationStatus },
  });

  await logPlatformAudit({
    userId: ctx.userId,
    action: "platform.notification_template_unpublished",
    entityType: "NotificationTemplate",
    entityId: row.id,
    metadata: { kind, actor: ctx.email },
  });

  revalidatePath(`/platform/notifications/${kind}`);
  revalidatePath(`/platform/notifications`);
  redirect(
    `/platform/notifications/${encodeURIComponent(kind)}?ok=${encodeURIComponent(
      "Unpublished — reverting to the built-in default.",
    )}`,
  );
}

// ────────────────────────────────────────────────────────────
// Reset to default — delete the row so dispatcher falls back to defaults.
// ────────────────────────────────────────────────────────────

export async function resetTemplateToDefault(kind: string) {
  const ctx = await requirePlatformAdmin();

  const channel: NotificationChannel = "EMAIL";
  const locale = "en";
  const row = await db.notificationTemplate.findUnique({
    where: { kind_channel_locale: { kind, channel, locale } },
    select: { id: true },
  });
  if (!row) {
    // Already at default — treat as success so the button is idempotent.
    redirect(
      `/platform/notifications/${encodeURIComponent(kind)}?ok=${encodeURIComponent(
        "Already using the built-in default.",
      )}`,
    );
  }

  // Cascade-deletes NotificationTemplateVersion rows — acceptable since
  // the "reset" button is the conscious "scrap it" gesture. If we want
  // soft-archive semantics later we can flip this to `status: "DISABLED"`
  // with a hidden flag, but that'd complicate the dispatcher's
  // enabled-toggle logic for no M2 win.
  await db.notificationTemplate.delete({ where: { id: row.id } });

  await logPlatformAudit({
    userId: ctx.userId,
    action: "platform.notification_template_reset",
    entityType: "NotificationTemplate",
    entityId: row.id,
    metadata: { kind, actor: ctx.email },
  });

  revalidatePath(`/platform/notifications/${kind}`);
  revalidatePath(`/platform/notifications`);
  redirect(
    `/platform/notifications/${encodeURIComponent(kind)}?ok=${encodeURIComponent(
      "Reset to built-in default.",
    )}`,
  );
}

// ────────────────────────────────────────────────────────────
// Initialize from default — seed a DRAFT row so the editor has something
// to work with. Lets admins tweak without rewriting from scratch.
// ────────────────────────────────────────────────────────────

export async function initializeTemplateFromDefault(kind: string) {
  const ctx = await requirePlatformAdmin();

  const reg = getRegistration(kind);
  if (!reg) {
    redirect(`/platform/notifications?error=${encodeURIComponent("Unknown notification kind.")}`);
  }

  const channel: NotificationChannel = "EMAIL";
  const locale = "en";
  const existing = await db.notificationTemplate.findUnique({
    where: { kind_channel_locale: { kind, channel, locale } },
    select: { id: true },
  });
  if (existing) {
    redirect(`/platform/notifications/${encodeURIComponent(kind)}?ok=${encodeURIComponent("Already initialized.")}`);
  }

  const def = reg.defaultContent[channel];
  if (!def) {
    redirect(
      `/platform/notifications/${encodeURIComponent(kind)}?error=${encodeURIComponent(
        "No default content for this channel yet.",
      )}`,
    );
  }

  const created = await db.notificationTemplate.create({
    data: {
      kind,
      channel,
      locale,
      status: "DRAFT",
      category: reg.category,
      sortOrder: reg.sortOrder,
      subject: def.subject,
      preheader: def.preheader,
      headline: def.headline,
      subheading: def.subheading,
      body: def.body,
      ctaLabel: def.ctaLabel,
      ctaUrlToken: def.ctaUrlToken,
      footerNote: def.footerNote,
      enabled: true,
      isCritical: reg.isCritical ?? false,
      tokenSchema: reg.tokens as never,
      updatedById: ctx.userId,
    },
  });

  await logPlatformAudit({
    userId: ctx.userId,
    action: "platform.notification_template_initialized",
    entityType: "NotificationTemplate",
    entityId: created.id,
    metadata: { kind, actor: ctx.email },
  });

  revalidatePath(`/platform/notifications/${kind}`);
  revalidatePath(`/platform/notifications`);
  redirect(
    `/platform/notifications/${encodeURIComponent(kind)}?ok=${encodeURIComponent(
      "Copied built-in default into an editable draft.",
    )}`,
  );
}

// ────────────────────────────────────────────────────────────
// Seed all — one-shot initializer for a fresh production DB. Creates a
// DRAFT row from the compile-time default for every registered kind
// that doesn't already have one. Idempotent: pre-existing rows are
// left alone, not overwritten. Safe to call repeatedly after a new
// registration lands.
// ────────────────────────────────────────────────────────────

export async function seedAllTemplatesFromDefaults() {
  const ctx = await requirePlatformAdmin();

  const channel: NotificationChannel = "EMAIL";
  const locale = "en";

  const existing = await db.notificationTemplate.findMany({
    where: { channel, locale },
    select: { kind: true },
  });
  const have = new Set(existing.map((r) => r.kind));

  let created = 0;
  for (const reg of listRegistrations()) {
    if (have.has(reg.kind)) continue;
    const def = reg.defaultContent[channel];
    if (!def) continue;
    await db.notificationTemplate.create({
      data: {
        kind: reg.kind,
        channel,
        locale,
        status: "DRAFT",
        category: reg.category,
        sortOrder: reg.sortOrder,
        subject: def.subject,
        preheader: def.preheader,
        headline: def.headline,
        subheading: def.subheading,
        body: def.body,
        ctaLabel: def.ctaLabel,
        ctaUrlToken: def.ctaUrlToken,
        footerNote: def.footerNote,
        enabled: true,
        isCritical: reg.isCritical ?? false,
        tokenSchema: reg.tokens as never,
        updatedById: ctx.userId,
      },
    });
    created += 1;
  }

  await logPlatformAudit({
    userId: ctx.userId,
    action: "platform.notification_templates_seeded",
    metadata: { created, actor: ctx.email },
  });

  revalidatePath("/platform/notifications");
  redirect(
    `/platform/notifications?ok=${encodeURIComponent(
      created === 0 ? "All kinds already initialized." : `Seeded ${created} template${created === 1 ? "" : "s"} as drafts.`,
    )}`,
  );
}

// ────────────────────────────────────────────────────────────
// Test send — render the current editable content (saved or default)
// with token samples from the registry and send to an arbitrary address.
// ────────────────────────────────────────────────────────────

const testSendSchema = z.object({
  to: z.string().email(),
});

export async function testSendTemplate(kind: string, formData: FormData) {
  const ctx = await requirePlatformAdmin();

  const reg = getRegistration(kind);
  if (!reg) {
    redirect(`/platform/notifications?error=${encodeURIComponent("Unknown notification kind.")}`);
  }

  const parsed = testSendSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    redirect(
      `/platform/notifications/${encodeURIComponent(kind)}?error=${encodeURIComponent(
        "Enter a valid email address for the test send.",
      )}`,
    );
  }

  const channel: NotificationChannel = "EMAIL";
  const locale = "en";
  const row = await db.notificationTemplate.findUnique({
    where: { kind_channel_locale: { kind, channel, locale } },
  });

  // Prefer the live fields (what the admin just saved), fall back to
  // defaults. We intentionally don't require status=PUBLISHED — the
  // point of a test send is to preview edits before publishing.
  let content: TemplateContent;
  if (row) {
    content = {
      subject:     row.subject,
      preheader:   row.preheader,
      headline:    row.headline,
      subheading:  row.subheading,
      body:        row.body,
      ctaLabel:    row.ctaLabel,
      ctaUrlToken: row.ctaUrlToken,
      footerNote:  row.footerNote,
    };
  } else {
    const def = reg.defaultContent[channel];
    if (!def) {
      redirect(
        `/platform/notifications/${encodeURIComponent(kind)}?error=${encodeURIComponent(
          "No content available for this channel yet.",
        )}`,
      );
    }
    content = def;
  }

  const brand = await loadBrand();
  const tokens = buildSampleTokens(reg.tokens, brand);

  const rendered = renderTemplate({ content, tokens, brand });

  // Prefix subject so a mis-addressed test doesn't look like a real auth
  // email to the recipient. Cheap safeguard.
  const subject = `[TEST] ${rendered.subject}`;
  try {
    await sendEmail({
      to: parsed.data.to,
      subject,
      html: rendered.html,
      text: rendered.text,
      fromName: brand.fromName ?? undefined,
      replyTo: brand.replyTo ?? brand.supportEmail ?? undefined,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Send failed.";
    redirect(
      `/platform/notifications/${encodeURIComponent(kind)}?error=${encodeURIComponent(
        `Test send failed: ${msg}`,
      )}`,
    );
  }

  await logPlatformAudit({
    userId: ctx.userId,
    action: "platform.notification_template_tested",
    entityType: "NotificationTemplate",
    entityId: row?.id,
    metadata: { kind, to: parsed.data.to, actor: ctx.email },
  });

  redirect(
    `/platform/notifications/${encodeURIComponent(kind)}?ok=${encodeURIComponent(
      `Test sent to ${parsed.data.to}.`,
    )}`,
  );
}

// ────────────────────────────────────────────────────────────
// Brand — singleton upsert.
// ────────────────────────────────────────────────────────────

const brandSchema = z.object({
  productName:    z.string().min(1).max(80),
  tagline:        z.string().max(200).optional().or(z.literal("")),
  logoUrl:        z.string().max(600).optional().or(z.literal("")),
  accentColor:    z.string().regex(/^#[0-9a-fA-F]{6}$/, "Use a 6-digit hex color like #4f8cff."),
  buttonRadiusPx: z.coerce.number().int().min(0).max(24),
  supportEmail:   z.string().email().optional().or(z.literal("")),
  footerHtml:     z.string().max(4000).optional().or(z.literal("")),
  fromName:       z.string().max(80).optional().or(z.literal("")),
  replyTo:        z.string().email().optional().or(z.literal("")),
});

export async function updateBrand(formData: FormData) {
  const ctx = await requirePlatformAdmin();

  const parsed = brandSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    redirect(
      `/platform/notifications/brand?error=${encodeURIComponent(
        parsed.error.errors[0]?.message ?? "Check required fields.",
      )}`,
    );
  }
  const d = parsed.data;

  // Upsert via findFirst-then-write since `singleton = true` is a unique
  // column but we don't know the id. Race-safe enough for a settings
  // page touched by a handful of admins.
  const existing = await db.notificationBrand.findFirst({
    where: { singleton: true },
  });
  if (existing) {
    await db.notificationBrand.update({
      where: { id: existing.id },
      data: {
        productName:    d.productName,
        tagline:        emptyToNull(d.tagline) ?? "",
        logoUrl:        emptyToNull(d.logoUrl),
        accentColor:    d.accentColor,
        buttonRadiusPx: d.buttonRadiusPx,
        supportEmail:   emptyToNull(d.supportEmail),
        footerHtml:     emptyToNull(d.footerHtml),
        fromName:       emptyToNull(d.fromName),
        replyTo:        emptyToNull(d.replyTo),
        updatedById:    ctx.userId,
      },
    });
  } else {
    await db.notificationBrand.create({
      data: {
        singleton: true,
        productName:    d.productName,
        tagline:        emptyToNull(d.tagline) ?? "",
        logoUrl:        emptyToNull(d.logoUrl),
        accentColor:    d.accentColor,
        buttonRadiusPx: d.buttonRadiusPx,
        supportEmail:   emptyToNull(d.supportEmail),
        footerHtml:     emptyToNull(d.footerHtml),
        fromName:       emptyToNull(d.fromName),
        replyTo:        emptyToNull(d.replyTo),
        updatedById:    ctx.userId,
      },
    });
  }

  // The brand snapshot is cached in-process for 30 seconds — invalidate
  // so the next test send / real notification picks up the new values.
  invalidateBrandCache();

  await logPlatformAudit({
    userId: ctx.userId,
    action: "platform.notification_brand_updated",
    metadata: { actor: ctx.email },
  });

  revalidatePath("/platform/notifications/brand");
  revalidatePath("/platform/notifications");
  redirect(`/platform/notifications/brand?ok=${encodeURIComponent("Brand updated.")}`);
}

// ────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────

function emptyToNull(v: string | null | undefined): string | null {
  if (v == null) return null;
  const t = v.trim();
  return t.length === 0 ? null : t;
}

/**
 * Build a plausible token value map for preview + test sends. Uses the
 * `sample` from the registry where defined, else falls back to a
 * type-appropriate placeholder. Brand globals get merged in so renders
 * match production as closely as possible.
 */
function buildSampleTokens(
  schema: TokenSchema,
  brand: Awaited<ReturnType<typeof loadBrand>>,
): TokenValues {
  const out: TokenValues = {
    product_name: brand.productName,
    support_email: brand.supportEmail ?? "",
    current_year: new Date().getFullYear(),
  };
  for (const [key, spec] of Object.entries(schema)) {
    if (spec.sample !== undefined && spec.sample !== "") {
      out[key] = spec.sample;
      continue;
    }
    // Sensible type-based fallback so previews always render.
    if (spec.type === "url") out[key] = "https://example.com/";
    else if (spec.type === "number") out[key] = 42;
    else out[key] = `{{${key}}}`;
  }
  return out;
}
