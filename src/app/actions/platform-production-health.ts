"use server";

// Page 32 — Production Health server actions.

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { logPlatformAudit, requirePlatformPermission } from "@/lib/platform";

const ROUTE = "/platform/operations/production";

const configSchema = z.object({
  publishOnTimeDeliveryRate: z.union([z.literal("on"), z.literal("")]).optional(),
  publishAvgCycleDays:       z.union([z.literal("on"), z.literal("")]).optional(),
  publishAvgOrderValue:      z.union([z.literal("on"), z.literal("")]).optional(),
  publishEstGrossMarginPct:  z.union([z.literal("on"), z.literal("")]).optional(),
  publishLateRate:           z.union([z.literal("on"), z.literal("")]).optional(),
  publishEquipmentUptime:    z.union([z.literal("on"), z.literal("")]).optional(),
  publishWasteRate:          z.union([z.literal("on"), z.literal("")]).optional(),
  publishReworkRate:         z.union([z.literal("on"), z.literal("")]).optional(),
  minSampleSize: z.coerce.number().int().min(1).max(1000).default(10),
});

export async function saveBenchmarkConfig(formData: FormData) {
  const ctx = await requirePlatformPermission("plans.manage");
  const parsed = configSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    const msg = parsed.error.issues[0]?.message ?? "Invalid input";
    redirect(`${ROUTE}?error=${encodeURIComponent(msg)}`);
  }
  const flags = {
    publishOnTimeDeliveryRate: parsed.data.publishOnTimeDeliveryRate === "on",
    publishAvgCycleDays:       parsed.data.publishAvgCycleDays === "on",
    publishAvgOrderValue:      parsed.data.publishAvgOrderValue === "on",
    publishEstGrossMarginPct:  parsed.data.publishEstGrossMarginPct === "on",
    publishLateRate:           parsed.data.publishLateRate === "on",
    publishEquipmentUptime:    parsed.data.publishEquipmentUptime === "on",
    publishWasteRate:          parsed.data.publishWasteRate === "on",
    publishReworkRate:         parsed.data.publishReworkRate === "on",
  };
  await db.productionBenchmarkConfig.upsert({
    where: { id: "default" },
    create: {
      id: "default",
      ...flags,
      minSampleSize: parsed.data.minSampleSize,
      updatedBy: ctx.userId,
    },
    update: {
      ...flags,
      minSampleSize: parsed.data.minSampleSize,
      updatedBy: ctx.userId,
    },
  });
  await logPlatformAudit({
    userId: ctx.userId,
    action: "platform.benchmark_config_updated",
    entityType: "ProductionBenchmarkConfig",
    entityId: "default",
    metadata: {
      actor: ctx.email,
      published: flags,
      minSampleSize: parsed.data.minSampleSize,
    },
  });
  revalidatePath(ROUTE);
  redirect(`${ROUTE}?ok=saved`);
}
