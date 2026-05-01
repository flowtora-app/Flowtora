"use server";

// Audit Log server actions — Page 14.
//
// Permissions:
//   • Read audit + run filters: audit.read (every staff role baseline).
//   • Verify hash chain: audit.read; the verify endpoint runs the
//     same loader so a CSM can prove integrity without elevated perms.
//   • Webhook subscribe / test / delete + retention policy edit:
//     system.write_settings (Super Admin / Engineer tier).

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { logPlatformAudit, requirePlatformStaff } from "@/lib/platform";
import type { AuditSeverity, Prisma } from "@prisma/client";

const SEVERITIES = ["INFO", "WARNING", "CRITICAL"] as const;

/* ── Webhook subscriptions ──────────────────────────────── */

const createSubSchema = z.object({
  name: z.string().min(1).max(120),
  url: z.string().url().max(500),
  actionFilter: z.string().max(500).default("*"),
  minSeverity: z.enum(SEVERITIES).default("INFO"),
});

export async function createAuditWebhook(formData: FormData) {
  const ctx = await requirePlatformStaff();
  if (!ctx.can("system.write_settings")) {
    return { ok: false, error: "Your role can't manage webhook subscriptions" } as const;
  }
  const parsed = createSubSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" } as const;
  }
  const secret = randomBytes(32).toString("base64url");
  const created = await db.auditWebhookSubscription.create({
    data: {
      name: parsed.data.name.trim(),
      url: parsed.data.url.trim(),
      actionFilter: parsed.data.actionFilter.trim() || "*",
      minSeverity: parsed.data.minSeverity,
      secret,
      createdBy: ctx.userId,
    },
  });
  await logPlatformAudit({
    userId: ctx.userId,
    action: "platform.audit_webhook_created",
    entityType: "AuditWebhookSubscription",
    entityId: created.id,
    metadata: { actor: ctx.email, name: parsed.data.name, url: parsed.data.url },
    severity: "WARNING",
  });
  revalidatePath("/platform/access/audit");
  return { ok: true as const, id: created.id, secret };
}

const subIdSchema = z.object({ subscriptionId: z.string().min(1) });

export async function deleteAuditWebhook(formData: FormData) {
  const ctx = await requirePlatformStaff();
  if (!ctx.can("system.write_settings")) {
    return { ok: false, error: "Your role can't delete webhook subscriptions" } as const;
  }
  const parsed = subIdSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { ok: false, error: "Invalid input" } as const;
  await db.auditWebhookSubscription.delete({ where: { id: parsed.data.subscriptionId } });
  await logPlatformAudit({
    userId: ctx.userId,
    action: "platform.audit_webhook_deleted",
    entityType: "AuditWebhookSubscription",
    entityId: parsed.data.subscriptionId,
    metadata: { actor: ctx.email },
    severity: "WARNING",
  });
  revalidatePath("/platform/access/audit");
  return { ok: true } as const;
}

const toggleSubSchema = z.object({
  subscriptionId: z.string().min(1),
  active: z.union([z.literal("on"), z.literal("off")]),
});

export async function setAuditWebhookActive(formData: FormData) {
  const ctx = await requirePlatformStaff();
  if (!ctx.can("system.write_settings")) {
    return { ok: false, error: "Your role can't toggle webhook subscriptions" } as const;
  }
  const parsed = toggleSubSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { ok: false, error: "Invalid input" } as const;
  await db.auditWebhookSubscription.update({
    where: { id: parsed.data.subscriptionId },
    data: { active: parsed.data.active === "on" },
  });
  await logPlatformAudit({
    userId: ctx.userId,
    action: parsed.data.active === "on"
      ? "platform.audit_webhook_resumed"
      : "platform.audit_webhook_paused",
    entityType: "AuditWebhookSubscription",
    entityId: parsed.data.subscriptionId,
    metadata: { actor: ctx.email },
  });
  revalidatePath("/platform/access/audit");
  return { ok: true } as const;
}

/** Test-send a synthetic payload to the subscription's URL. The
 *  delivery is logged as an AuditWebhookDelivery row with
 *  auditId="test" so the deliveries panel can show it. */
export async function testAuditWebhook(formData: FormData) {
  const ctx = await requirePlatformStaff();
  if (!ctx.can("system.write_settings")) {
    return { ok: false, error: "Your role can't test webhooks" } as const;
  }
  const parsed = subIdSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { ok: false, error: "Invalid input" } as const;

  const sub = await db.auditWebhookSubscription.findUnique({
    where: { id: parsed.data.subscriptionId },
  });
  if (!sub) return { ok: false, error: "Subscription not found" } as const;

  const payload = {
    test: true,
    sentAt: new Date().toISOString(),
    sentBy: ctx.email,
    subscriptionId: sub.id,
    sample: {
      id: "test-event",
      action: "platform.audit_webhook_test",
      severity: "INFO",
      success: true,
    },
  };
  const body = JSON.stringify(payload);
  const { createHmac } = await import("node:crypto");
  const signature = createHmac("sha256", sub.secret).update(body).digest("hex");
  let status: number | null = null;
  let responseText = "";
  let succeeded = false;
  let failureReason: string | null = null;
  try {
    const res = await fetch(sub.url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Flowtora-Signature": `sha256=${signature}`,
        "X-Flowtora-Test": "1",
      },
      body,
      // Cap the request so a hung endpoint doesn't tie up the action.
      signal: AbortSignal.timeout(8_000),
    });
    status = res.status;
    responseText = (await res.text()).slice(0, 512);
    succeeded = res.ok;
    if (!succeeded) failureReason = `HTTP ${res.status}`;
  } catch (err) {
    failureReason = err instanceof Error ? err.message : "Unknown error";
  }

  await db.auditWebhookDelivery.create({
    data: {
      subscriptionId: sub.id,
      auditId: "test",
      responseStatus: status,
      responseBody: responseText || null,
      succeeded,
      attempt: 1,
    },
  });
  await db.auditWebhookSubscription.update({
    where: { id: sub.id },
    data: succeeded ? {
      totalDelivered: { increment: 1 },
      lastDeliveredAt: new Date(),
    } : {
      totalFailed: { increment: 1 },
      lastFailureAt: new Date(),
      lastFailureReason: failureReason,
    },
  });
  await logPlatformAudit({
    userId: ctx.userId,
    action: "platform.audit_webhook_tested",
    entityType: "AuditWebhookSubscription",
    entityId: sub.id,
    metadata: { actor: ctx.email, succeeded, status, failureReason },
  });
  revalidatePath("/platform/access/audit");
  return { ok: true, succeeded, status, failureReason } as const;
}

/* ── Retention policy ──────────────────────────────────── */

const retentionSchema = z.object({
  defaultDays: z.coerce.number().int().min(7).max(36500),
  /** JSON map of overrides. */
  overridesJson: z.string().optional(),
  legalHold: z.union([z.literal("on"), z.literal("off")]).optional(),
});

export async function updateRetentionPolicy(formData: FormData) {
  const ctx = await requirePlatformStaff();
  if (!ctx.can("system.write_settings")) {
    return { ok: false, error: "Your role can't change retention" } as const;
  }
  const parsed = retentionSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" } as const;
  }
  let overrides: Record<string, number> = {};
  if (parsed.data.overridesJson) {
    try {
      const raw = JSON.parse(parsed.data.overridesJson) as Record<string, unknown>;
      for (const [k, v] of Object.entries(raw)) {
        if (typeof v === "number" && v > 0 && v <= 36_500) overrides[k] = Math.floor(v);
      }
    } catch {
      return { ok: false, error: "Overrides must be valid JSON" } as const;
    }
  }
  await db.auditRetentionPolicy.upsert({
    where: { id: "default" },
    create: {
      id: "default",
      defaultDays: parsed.data.defaultDays,
      overrides: overrides as Prisma.InputJsonValue,
      legalHold: parsed.data.legalHold === "on",
      updatedBy: ctx.userId,
    },
    update: {
      defaultDays: parsed.data.defaultDays,
      overrides: overrides as Prisma.InputJsonValue,
      legalHold: parsed.data.legalHold === "on",
      updatedBy: ctx.userId,
    },
  });
  await logPlatformAudit({
    userId: ctx.userId,
    action: "platform.audit_retention_updated",
    entityType: "AuditRetentionPolicy",
    metadata: {
      actor: ctx.email,
      defaultDays: parsed.data.defaultDays,
      overridesCount: Object.keys(overrides).length,
      legalHold: parsed.data.legalHold === "on",
    },
    severity: "WARNING",
  });
  revalidatePath("/platform/access/audit");
  return { ok: true } as const;
}

void Object.keys; // sentinel — keep tooling honest.
type _UnusedSeverity = AuditSeverity;
void (null as unknown as _UnusedSeverity);
