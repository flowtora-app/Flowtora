"use server";

// Page 33 §SLA settings — server actions for the per-priority+plan SLA matrix.

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import {
  logPlatformAudit,
  requirePlatformPermission,
} from "@/lib/platform";

const ROUTE = "/platform/operations/tickets/sla";
const PERM = "support.macro_manage" as const;

const upsertSchema = z.object({
  priority: z.enum(["LOW", "NORMAL", "HIGH", "URGENT"]),
  plan: z.enum(["STARTER", "GROWTH", "PRO", "ENTERPRISE"]),
  firstResponseTargetHrs: z.coerce.number().int().min(1).max(720),
  resolutionTargetHrs: z.coerce.number().int().min(1).max(2_000),
  businessHoursOnly: z.union([z.literal("on"), z.literal("")]).optional(),
  holidayCalendar: z.string().max(60).optional().or(z.literal("")),
  warningHrsBefore: z.coerce.number().int().min(0).max(168).default(2),
  escalateAtWarning: z.string().optional().or(z.literal("")),
  escalateAtBreach: z.string().optional().or(z.literal("")),
});

function splitIds(input: string | undefined | null): string[] {
  if (!input) return [];
  return input.split(/[,\n]/).map((s) => s.trim()).filter(Boolean);
}

export async function upsertSlaTarget(formData: FormData) {
  const ctx = await requirePlatformPermission(PERM);
  const parsed = upsertSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    const msg = parsed.error.issues[0]?.message ?? "Invalid SLA input";
    redirect(`${ROUTE}?error=${encodeURIComponent(msg)}`);
  }
  const d = parsed.data;
  await db.supportSlaTarget.upsert({
    where: { priority_plan: { priority: d.priority, plan: d.plan } },
    create: {
      priority: d.priority,
      plan: d.plan,
      firstResponseTargetHrs: d.firstResponseTargetHrs,
      resolutionTargetHrs: d.resolutionTargetHrs,
      businessHoursOnly: d.businessHoursOnly === "on",
      holidayCalendar: d.holidayCalendar || null,
      warningHrsBefore: d.warningHrsBefore,
      escalateAtWarning: splitIds(d.escalateAtWarning),
      escalateAtBreach: splitIds(d.escalateAtBreach),
      updatedBy: ctx.userId,
    },
    update: {
      firstResponseTargetHrs: d.firstResponseTargetHrs,
      resolutionTargetHrs: d.resolutionTargetHrs,
      businessHoursOnly: d.businessHoursOnly === "on",
      holidayCalendar: d.holidayCalendar || null,
      warningHrsBefore: d.warningHrsBefore,
      escalateAtWarning: splitIds(d.escalateAtWarning),
      escalateAtBreach: splitIds(d.escalateAtBreach),
      updatedBy: ctx.userId,
    },
  });
  await logPlatformAudit({
    userId: ctx.userId,
    action: "platform.sla.target_upserted",
    entityType: "SupportSlaTarget",
    entityId: `${d.priority}_${d.plan}`,
    metadata: {
      actor: ctx.email,
      firstResponseHrs: d.firstResponseTargetHrs,
      resolutionHrs: d.resolutionTargetHrs,
    },
  });
  revalidatePath(ROUTE);
  redirect(`${ROUTE}?ok=saved`);
}

const deleteSchema = z.object({
  priority: z.enum(["LOW", "NORMAL", "HIGH", "URGENT"]),
  plan: z.enum(["STARTER", "GROWTH", "PRO", "ENTERPRISE"]),
});

export async function deleteSlaTarget(formData: FormData) {
  const ctx = await requirePlatformPermission(PERM);
  const parsed = deleteSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    redirect(`${ROUTE}?error=${encodeURIComponent("Invalid request")}`);
  }
  const d = parsed.data;
  await db.supportSlaTarget.deleteMany({
    where: { priority: d.priority, plan: d.plan },
  });
  await logPlatformAudit({
    userId: ctx.userId,
    action: "platform.sla.target_deleted",
    entityType: "SupportSlaTarget",
    entityId: `${d.priority}_${d.plan}`,
    metadata: { actor: ctx.email },
  });
  revalidatePath(ROUTE);
  redirect(`${ROUTE}?ok=deleted`);
}
