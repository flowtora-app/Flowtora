// Phase 6 — dashboard activity feed.
//
// Renders a human-readable "recent activity" list off the AuditLog.
// We persist auditable actions from every server action (see
// src/lib/audit.ts); this library turns those raw `action` strings into
// sentences the dashboard can display without a per-persona switch in
// the UI.
//
// The feed is intentionally curated — we skip platform.* events
// (tenant-admin-only noise), support.* (lives on its own page), and
// settings.* (not interesting as "activity"). What remains is the
// narrative a shop owner wants on the dashboard: quotes sent, orders
// moving, invoices paid, team changes.
//
// If an action is logged that we don't have a specific label for, we
// render a humanized fallback ("Quote status changed") so new actions
// don't vanish from the feed — they just look generic until someone
// adds a label here.

import { db } from "@/lib/db";

export type ActivityItem = {
  id: string;
  occurredAt: Date;
  actorUserId: string | null;
  actorName: string | null;
  verb: string;          // "sent a quote", "marked invoice paid"
  entityType: string | null;
  entityId: string | null;
  /** Link target relative to /t/<slug> if we can resolve one, else null. */
  href: string | null;
  /** Tone for the bullet dot; maps to the family of event. */
  tone: "neutral" | "success" | "warning" | "danger";
};

// Families of actions we surface. Anything not in this allow-list is
// dropped from the feed to keep it readable.
const ALLOWED_PREFIXES = [
  "customer.",
  "quote.",
  "order.",
  "invoice.",
  "payment.",
  "proof.",
  "install.",
  "task.",
  "team.",
  "checklist.",
  "onboarding.",
] as const;

// Per-action verb + tone. Anything not listed gets a humanized default.
const ACTION_MAP: Record<string, { verb: string; tone: ActivityItem["tone"] }> = {
  // Customers
  "customer.created":         { verb: "added a customer",              tone: "success" },
  "customer.updated":         { verb: "updated a customer",            tone: "neutral" },
  "customer.deleted":         { verb: "deleted a customer",            tone: "warning" },
  "customer.stage_changed":   { verb: "moved a customer's stage",      tone: "neutral" },

  // Quotes
  "quote.created":            { verb: "created a quote",               tone: "success" },
  "quote.sent":               { verb: "sent a quote",                  tone: "success" },
  "quote.viewed":             { verb: "saw a quote get opened",        tone: "success" },
  "quote.accepted":           { verb: "closed a quote (accepted)",     tone: "success" },
  "quote.declined":           { verb: "logged a declined quote",       tone: "warning" },
  "quote.duplicated":         { verb: "duplicated a quote",            tone: "neutral" },
  "quote.status_changed":     { verb: "changed a quote's status",      tone: "neutral" },
  "quote.deleted":            { verb: "deleted a quote",               tone: "warning" },

  // Orders
  "order.created_from_quote": { verb: "created an order from a quote", tone: "success" },
  "order.status_changed":     { verb: "moved an order",                tone: "neutral" },
  "order.deleted":            { verb: "deleted an order",              tone: "warning" },

  // Invoices
  "invoice.created":          { verb: "created an invoice",            tone: "neutral" },
  "invoice.sent":             { verb: "sent an invoice",               tone: "neutral" },
  "invoice.status_changed":   { verb: "changed an invoice's status",   tone: "neutral" },
  "invoice.deleted":          { verb: "deleted an invoice",            tone: "warning" },

  // Payments
  "payment.recorded":         { verb: "recorded a payment",            tone: "success" },
  "payment.voided":           { verb: "voided a payment",              tone: "warning" },

  // Proofs
  "proof.created":            { verb: "created a proof",               tone: "neutral" },
  "proof.sent":               { verb: "sent a proof for review",       tone: "neutral" },
  "proof.approved":           { verb: "got a proof approved",          tone: "success" },
  "proof.revision_requested": { verb: "received a proof revision",     tone: "warning" },

  // Installs
  "install.scheduled":        { verb: "scheduled an install",          tone: "neutral" },
  "install.confirmed":        { verb: "confirmed an install",          tone: "success" },
  "install.completed":        { verb: "completed an install",          tone: "success" },
  "install.canceled":         { verb: "canceled an install",           tone: "warning" },

  // Tasks
  "task.created":             { verb: "created a task",                tone: "neutral" },
  "task.completed":           { verb: "completed a task",              tone: "success" },

  // Team
  "team.invited":             { verb: "invited a teammate",            tone: "success" },
  "team.invite_accepted":     { verb: "joined the workspace",          tone: "success" },
  "team.invite_revoked":      { verb: "revoked an invite",             tone: "warning" },
  "team.role_changed":        { verb: "changed a teammate's role",     tone: "neutral" },
  "team.removed":             { verb: "removed a teammate",            tone: "warning" },
  "team.suspended":           { verb: "suspended a teammate",          tone: "warning" },

  // Onboarding
  "onboarding.business":      { verb: "completed onboarding basics",   tone: "success" },
  "onboarding.completed":     { verb: "finished onboarding",           tone: "success" },

  // Checklists
  "checklist.applied":        { verb: "applied a checklist",           tone: "neutral" },
};

function hrefFor(entityType: string | null, entityId: string | null): string | null {
  if (!entityType || !entityId) return null;
  switch (entityType) {
    case "Customer":     return `customers/${entityId}`;
    case "Quote":        return `quotes/${entityId}`;
    case "Order":        return `orders/${entityId}`;
    case "Invoice":      return `invoices/${entityId}`;
    case "Proof":        return `proofs/${entityId}`; // fallback; many proofs nest under orders
    case "InstallEvent": return `installs/${entityId}`;
    case "Task":         return `tasks`;
    default:             return null;
  }
}

function humanize(action: string): string {
  // "invoice.status_changed" → "Invoice status changed"
  const [entity, ...rest] = action.split(".");
  const tail = rest.join(" ").replace(/_/g, " ");
  return `${entity[0].toUpperCase()}${entity.slice(1)} ${tail}`.trim();
}

export async function loadRecentActivity(
  tenantId: string,
  opts: { userId?: string | null; limit?: number } = {},
): Promise<ActivityItem[]> {
  const limit = opts.limit ?? 8;

  // AuditLog has no `user` relation (userId is a bare string — users can
  // live in a different auth provider long-term). Pull raw rows, then
  // fan out one lookup to resolve actor names in a single extra query.
  // Pull 3x the requested limit to account for filtered-out actions
  // (platform.*, settings.*, etc.) without a second round-trip.
  const raw = await db.auditLog.findMany({
    where: {
      tenantId,
      ...(opts.userId ? { userId: opts.userId } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: limit * 3,
  });

  const filtered = raw.filter((r) =>
    ALLOWED_PREFIXES.some((p) => r.action.startsWith(p)),
  );
  const sliced = filtered.slice(0, limit);

  const userIds = Array.from(
    new Set(sliced.map((r) => r.userId).filter((id): id is string => !!id)),
  );
  const users = userIds.length
    ? await db.user.findMany({
        where: { id: { in: userIds } },
        select: { id: true, name: true, email: true },
      })
    : [];
  const userMap = new Map(users.map((u) => [u.id, u]));

  return sliced.map((row) => {
    const entry = ACTION_MAP[row.action];
    const user = row.userId ? userMap.get(row.userId) : null;
    return {
      id: row.id,
      occurredAt: row.createdAt,
      actorUserId: row.userId,
      actorName: user?.name ?? user?.email ?? null,
      verb: entry?.verb ?? humanize(row.action),
      entityType: row.entityType ?? null,
      entityId: row.entityId ?? null,
      href: hrefFor(row.entityType ?? null, row.entityId ?? null),
      tone: entry?.tone ?? "neutral",
    };
  });
}
