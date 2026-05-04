"use server";

// Page 33 §Macros editor — server actions for SupportCannedReply.

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import {
  logPlatformAudit,
  requirePlatformPermission,
} from "@/lib/platform";

const ROUTE = "/platform/operations/tickets/macros";
const PERM = "support.macro_manage" as const;

const upsertSchema = z.object({
  id: z.string().optional().or(z.literal("")),
  title: z.string().min(1, "Title required").max(120),
  body: z.string().min(1, "Body required").max(10_000),
  category: z.enum(["", "BILLING", "BUG", "FEATURE_REQUEST", "QUESTION", "OTHER"]).default(""),
});

export async function upsertMacro(formData: FormData) {
  const ctx = await requirePlatformPermission(PERM);
  const parsed = upsertSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    redirect(`${ROUTE}?error=${encodeURIComponent(parsed.error.issues[0]?.message ?? "Invalid input")}`);
  }
  const d = parsed.data;
  const category = d.category === "" ? null : d.category;
  if (d.id) {
    await db.supportCannedReply.update({
      where: { id: d.id },
      data: { title: d.title, body: d.body, category },
    });
    await logPlatformAudit({
      userId: ctx.userId,
      action: "platform.macro.updated",
      entityType: "SupportCannedReply",
      entityId: d.id,
      metadata: { actor: ctx.email, title: d.title },
    });
  } else {
    const created = await db.supportCannedReply.create({
      data: { title: d.title, body: d.body, category, createdBy: ctx.userId },
      select: { id: true },
    });
    await logPlatformAudit({
      userId: ctx.userId,
      action: "platform.macro.created",
      entityType: "SupportCannedReply",
      entityId: created.id,
      metadata: { actor: ctx.email, title: d.title },
    });
  }
  revalidatePath(ROUTE);
  redirect(`${ROUTE}?ok=saved`);
}

const archiveSchema = z.object({ id: z.string().min(1) });

export async function archiveMacro(formData: FormData) {
  const ctx = await requirePlatformPermission(PERM);
  const parsed = archiveSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) redirect(`${ROUTE}?error=${encodeURIComponent("Invalid request")}`);
  await db.supportCannedReply.update({
    where: { id: parsed.data.id },
    data: { archivedAt: new Date() },
  });
  await logPlatformAudit({
    userId: ctx.userId,
    action: "platform.macro.archived",
    entityType: "SupportCannedReply",
    entityId: parsed.data.id,
    metadata: { actor: ctx.email },
  });
  revalidatePath(ROUTE);
  redirect(`${ROUTE}?ok=archived`);
}

export async function unarchiveMacro(formData: FormData) {
  const ctx = await requirePlatformPermission(PERM);
  const parsed = archiveSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) redirect(`${ROUTE}?error=${encodeURIComponent("Invalid request")}`);
  await db.supportCannedReply.update({
    where: { id: parsed.data.id },
    data: { archivedAt: null },
  });
  await logPlatformAudit({
    userId: ctx.userId,
    action: "platform.macro.unarchived",
    entityType: "SupportCannedReply",
    entityId: parsed.data.id,
    metadata: { actor: ctx.email },
  });
  revalidatePath(ROUTE);
  redirect(`${ROUTE}?ok=restored`);
}
