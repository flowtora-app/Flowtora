"use server";

// Platform Sessions & Devices server actions — Page 13.
//
// All gated on users.ban (Admin tier) — same lever Page 9 uses for
// signing users out. Block-IP mints PlatformIpBlock rows; the auth
// middleware refuses sign-ins from blocked CIDRs.

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { logPlatformAudit, requirePlatformStaff } from "@/lib/platform";

/* ── Sign out a single session ─────────────────────────── */

const sessionIdSchema = z.object({ sessionId: z.string().min(1) });

export async function endPlatformSession(formData: FormData) {
  const ctx = await requirePlatformStaff();
  if (!ctx.can("users.ban")) {
    return { ok: false, error: "Your role can't end sessions" } as const;
  }
  const parsed = sessionIdSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { ok: false, error: "Invalid input" } as const;

  const session = await db.session.findUnique({
    where: { id: parsed.data.sessionId },
    select: { id: true, userId: true },
  });
  if (!session) return { ok: false, error: "Session not found" } as const;
  await db.session.delete({ where: { id: session.id } });
  await logPlatformAudit({
    userId: ctx.userId,
    action: "platform.session_ended",
    entityType: "Session",
    entityId: session.id,
    metadata: { actor: ctx.email, target: session.userId },
  });
  revalidatePath("/platform/access/sessions");
  return { ok: true } as const;
}

/* ── Sign out all sessions for an admin ────────────────── */

const adminIdSchema = z.object({ adminId: z.string().min(1) });

export async function endAllAdminSessions(formData: FormData) {
  const ctx = await requirePlatformStaff();
  if (!ctx.can("users.ban")) {
    return { ok: false, error: "Your role can't end sessions" } as const;
  }
  const parsed = adminIdSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { ok: false, error: "Invalid input" } as const;

  // Bump sessionVersion to invalidate JWT-strategy tokens too.
  await db.user.update({
    where: { id: parsed.data.adminId },
    data: { sessionVersion: { increment: 1 } },
  });
  const removed = await db.session.deleteMany({ where: { userId: parsed.data.adminId } });
  await logPlatformAudit({
    userId: ctx.userId,
    action: "platform.admin_signed_out_all",
    entityType: "User",
    entityId: parsed.data.adminId,
    metadata: { actor: ctx.email, target: parsed.data.adminId, sessionsRemoved: removed.count },
  });
  revalidatePath("/platform/access/sessions");
  return { ok: true, count: removed.count } as const;
}

/* ── Force MFA re-prompt on a session ──────────────────── */

export async function forceMfaPrompt(formData: FormData) {
  const ctx = await requirePlatformStaff();
  if (!ctx.can("users.ban")) {
    return { ok: false, error: "Your role can't force MFA" } as const;
  }
  const parsed = sessionIdSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { ok: false, error: "Invalid input" } as const;

  const session = await db.session.findUnique({
    where: { id: parsed.data.sessionId },
    select: { id: true, userId: true },
  });
  if (!session) return { ok: false, error: "Session not found" } as const;
  await db.session.update({
    where: { id: session.id },
    data: { forceMfaPromptAt: new Date() },
  });
  await logPlatformAudit({
    userId: ctx.userId,
    action: "platform.session_force_mfa",
    entityType: "Session",
    entityId: session.id,
    metadata: { actor: ctx.email, target: session.userId },
  });
  revalidatePath("/platform/access/sessions");
  return { ok: true } as const;
}

/* ── Bulk variants ──────────────────────────────────────── */

const bulkSchema = z.object({
  sessionIds: z.string().min(1), // CSV
});

export async function bulkEndSessions(formData: FormData) {
  const ctx = await requirePlatformStaff();
  if (!ctx.can("users.ban")) {
    return { ok: false, error: "Your role can't end sessions" } as const;
  }
  const parsed = bulkSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { ok: false, error: "Invalid input" } as const;
  const ids = parsed.data.sessionIds.split(",").map((s) => s.trim()).filter(Boolean);
  if (ids.length === 0) return { ok: false, error: "No sessions selected" } as const;

  const removed = await db.session.deleteMany({ where: { id: { in: ids } } });
  await logPlatformAudit({
    userId: ctx.userId,
    action: "platform.sessions_bulk_ended",
    entityType: "Session",
    metadata: { actor: ctx.email, count: removed.count },
  });
  revalidatePath("/platform/access/sessions");
  return { ok: true, count: removed.count } as const;
}

/* ── Block / unblock IP ─────────────────────────────────── */

const blockSchema = z.object({
  cidr: z.string().min(3).max(50),
  reason: z.string().max(500).optional(),
  expiresAt: z.string().optional(),
});

const CIDR_RX = /^(?:\d{1,3}\.){3}\d{1,3}(?:\/\d{1,2})?$|^[0-9a-fA-F:]+(?:\/\d{1,3})?$/;

export async function blockIp(formData: FormData) {
  const ctx = await requirePlatformStaff();
  if (!ctx.can("users.ban")) {
    return { ok: false, error: "Your role can't block IPs" } as const;
  }
  const parsed = blockSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" } as const;
  }
  if (!CIDR_RX.test(parsed.data.cidr.trim())) {
    return { ok: false, error: "Invalid IP / CIDR" } as const;
  }
  let expiresAt: Date | null = null;
  if (parsed.data.expiresAt) {
    const d = new Date(parsed.data.expiresAt);
    if (!Number.isNaN(d.getTime())) expiresAt = d;
  }
  // Idempotent — if it exists, refresh reason + expiry.
  const cidr = parsed.data.cidr.trim();
  const existing = await db.platformIpBlock.findUnique({
    where: { cidr },
    select: { id: true },
  });
  let id: string;
  if (existing) {
    await db.platformIpBlock.update({
      where: { id: existing.id },
      data: {
        reason: parsed.data.reason?.trim() || null,
        expiresAt,
      },
    });
    id = existing.id;
  } else {
    const created = await db.platformIpBlock.create({
      data: {
        cidr,
        reason: parsed.data.reason?.trim() || null,
        expiresAt,
        createdBy: ctx.userId,
      },
    });
    id = created.id;
  }
  await logPlatformAudit({
    userId: ctx.userId,
    action: "platform.ip_blocked",
    entityType: "PlatformIpBlock",
    entityId: id,
    metadata: { actor: ctx.email, cidr },
  });
  revalidatePath("/platform/access/sessions");
  return { ok: true } as const;
}

const unblockSchema = z.object({ cidr: z.string().min(1) });

export async function unblockIp(formData: FormData) {
  const ctx = await requirePlatformStaff();
  if (!ctx.can("users.ban")) {
    return { ok: false, error: "Your role can't unblock IPs" } as const;
  }
  const parsed = unblockSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { ok: false, error: "Invalid input" } as const;
  await db.platformIpBlock.deleteMany({ where: { cidr: parsed.data.cidr } });
  await logPlatformAudit({
    userId: ctx.userId,
    action: "platform.ip_unblocked",
    entityType: "PlatformIpBlock",
    metadata: { actor: ctx.email, cidr: parsed.data.cidr },
  });
  revalidatePath("/platform/access/sessions");
  return { ok: true } as const;
}

const bulkBlockSchema = z.object({
  cidrs: z.string().min(1),
  reason: z.string().max(500).optional(),
});

export async function bulkBlockIps(formData: FormData) {
  const ctx = await requirePlatformStaff();
  if (!ctx.can("users.ban")) {
    return { ok: false, error: "Your role can't block IPs" } as const;
  }
  const parsed = bulkBlockSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { ok: false, error: "Invalid input" } as const;
  const list = Array.from(new Set(
    parsed.data.cidrs.split(/[\s,;]+/).map((s) => s.trim()).filter(Boolean),
  ));
  let blocked = 0;
  for (const cidr of list) {
    if (!CIDR_RX.test(cidr)) continue;
    try {
      await db.platformIpBlock.upsert({
        where: { cidr },
        create: {
          cidr,
          reason: parsed.data.reason?.trim() || null,
          createdBy: ctx.userId,
        },
        update: {
          reason: parsed.data.reason?.trim() || null,
        },
      });
      blocked += 1;
    } catch (err) {
      void err;
    }
  }
  await logPlatformAudit({
    userId: ctx.userId,
    action: "platform.ips_bulk_blocked",
    entityType: "PlatformIpBlock",
    metadata: { actor: ctx.email, count: blocked, total: list.length },
  });
  revalidatePath("/platform/access/sessions");
  return { ok: true, count: blocked } as const;
}
