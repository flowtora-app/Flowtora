"use server";

// Page 33 — bulk actions for the support inbox.
//
// Every action takes a comma-separated list of ticket ids in
// `ticketIds` (FormData) plus an action-specific payload, and
// applies the change in a single transaction. Audit-logged
// per ticket so the trail is grep-able.

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import {
  logPlatformAudit,
  requirePlatformPermission,
} from "@/lib/platform";

const ROUTE = "/platform/operations/tickets";
const PERM = "support.respond" as const;

function parseIds(formData: FormData): string[] {
  const raw = formData.get("ticketIds");
  if (typeof raw !== "string") return [];
  return raw.split(",").map((s) => s.trim()).filter(Boolean);
}

function backTo(formData: FormData): string {
  const ret = formData.get("returnTo");
  return typeof ret === "string" && ret.startsWith("/platform/operations/tickets")
    ? ret
    : ROUTE;
}

/* ── Bulk assign ──────────────────────────────────────── */

const assignSchema = z.object({
  assignedTo: z.string().min(1).max(60),
});

export async function bulkAssignTickets(formData: FormData) {
  const ctx = await requirePlatformPermission(PERM);
  const ids = parseIds(formData);
  if (ids.length === 0) redirect(`${backTo(formData)}&error=${encodeURIComponent("No tickets selected")}`);
  const parsed = assignSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) redirect(`${backTo(formData)}&error=${encodeURIComponent("Pick an assignee")}`);

  const target = parsed.data.assignedTo === "__unassign__" ? null : parsed.data.assignedTo;
  await db.supportTicket.updateMany({
    where: { id: { in: ids } },
    data: { assignedTo: target },
  });
  for (const id of ids) {
    await logPlatformAudit({
      userId: ctx.userId,
      action: "platform.ticket.bulk_assigned",
      entityType: "SupportTicket",
      entityId: id,
      metadata: { actor: ctx.email, assignee: target ?? "unassigned" },
    });
  }
  revalidatePath(ROUTE);
  redirect(`${backTo(formData)}&ok=${encodeURIComponent(`Assigned ${ids.length} ticket${ids.length === 1 ? "" : "s"}`)}`);
}

/* ── Bulk status change ──────────────────────────────── */

const statusSchema = z.object({
  status: z.enum(["OPEN", "IN_PROGRESS", "WAITING_CUSTOMER", "RESOLVED", "CLOSED"]),
});

export async function bulkStatusTickets(formData: FormData) {
  const ctx = await requirePlatformPermission(PERM);
  const ids = parseIds(formData);
  if (ids.length === 0) redirect(`${backTo(formData)}&error=${encodeURIComponent("No tickets selected")}`);
  const parsed = statusSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) redirect(`${backTo(formData)}&error=${encodeURIComponent("Invalid status")}`);

  const now = new Date();
  await db.supportTicket.updateMany({
    where: { id: { in: ids } },
    data: {
      status: parsed.data.status,
      resolvedAt: parsed.data.status === "RESOLVED" ? now : undefined,
      closedAt: parsed.data.status === "CLOSED" ? now : undefined,
    },
  });
  for (const id of ids) {
    await logPlatformAudit({
      userId: ctx.userId,
      action: `platform.ticket.bulk_status_${parsed.data.status.toLowerCase()}`,
      entityType: "SupportTicket",
      entityId: id,
      metadata: { actor: ctx.email },
    });
  }
  revalidatePath(ROUTE);
  redirect(`${backTo(formData)}&ok=${encodeURIComponent(`Moved ${ids.length} ticket${ids.length === 1 ? "" : "s"} → ${parsed.data.status.replace(/_/g, " ").toLowerCase()}`)}`);
}

/* ── Bulk priority ────────────────────────────────────── */

const prioritySchema = z.object({
  priority: z.enum(["LOW", "NORMAL", "HIGH", "URGENT"]),
});

export async function bulkPriorityTickets(formData: FormData) {
  const ctx = await requirePlatformPermission(PERM);
  const ids = parseIds(formData);
  if (ids.length === 0) redirect(`${backTo(formData)}&error=${encodeURIComponent("No tickets selected")}`);
  const parsed = prioritySchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) redirect(`${backTo(formData)}&error=${encodeURIComponent("Invalid priority")}`);

  await db.supportTicket.updateMany({
    where: { id: { in: ids } },
    data: { priority: parsed.data.priority },
  });
  for (const id of ids) {
    await logPlatformAudit({
      userId: ctx.userId,
      action: "platform.ticket.bulk_priority_changed",
      entityType: "SupportTicket",
      entityId: id,
      metadata: { actor: ctx.email, to: parsed.data.priority },
    });
  }
  revalidatePath(ROUTE);
  redirect(`${backTo(formData)}&ok=${encodeURIComponent(`Set priority ${parsed.data.priority} on ${ids.length} ticket${ids.length === 1 ? "" : "s"}`)}`);
}
