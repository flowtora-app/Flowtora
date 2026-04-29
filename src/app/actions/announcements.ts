"use server";

import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { requirePlatformStaff, logPlatformAudit } from "@/lib/platform";
import { sendEmail, brandedEmailLayout, brandedTextLayout } from "@/lib/email";
import { renderMarkdownLite } from "@/lib/notifications/markdown";
import { loadBrand } from "@/lib/notifications/brand";
import type {
  AnnouncementType,
  AnnouncementPriority,
  AnnouncementAudience,
  Prisma,
} from "@prisma/client";

// Server actions for /platform/announcements.
//
// Mutations require platformAdmin (canWrite) — support agents can read
// the page but can't ship copy. Read helpers are exported separately
// (`activeAnnouncementsForTenant`) so the tenant-side banner can call
// them from a server component.

const TYPES = ["RELEASE", "NEW_FEATURE", "MAINTENANCE", "INCIDENT", "PRICING", "GENERAL"] as const;
const PRIORITIES = ["INFO", "IMPORTANT", "CRITICAL"] as const;
const AUDIENCES = ["ALL", "PLAN", "COHORT", "TENANT"] as const;

// ────────────────────────────────────────────────────────────────
// CREATE — admin clicks "+ New" on the list page. Drops a DRAFT row
// and redirects to its edit page so all detail editing happens there.
// ────────────────────────────────────────────────────────────────
export async function createAnnouncement() {
  const ctx = await requirePlatformStaff();
  if (!ctx.canWrite) {
    redirect(`/platform/announcements?error=${encodeURIComponent("Requires admin role")}`);
  }
  const created = await db.platformAnnouncement.create({
    data: {
      title: "Untitled announcement",
      body: "",
      type: "GENERAL",
      priority: "INFO",
      status: "DRAFT",
      audience: "ALL",
      authorId: ctx.userId,
    },
    select: { id: true },
  });
  await logPlatformAudit({
    userId:     ctx.userId,
    tenantId:   null,
    action:     "platform.announcement_created",
    entityType: "PlatformAnnouncement",
    entityId:   created.id,
    metadata:   { actor: ctx.email },
  });
  redirect(`/platform/announcements/${created.id}?ok=created`);
}

// ────────────────────────────────────────────────────────────────
// UPDATE — saves all the editable fields from the edit page form.
// Doesn't change status; status transitions go through their own
// dedicated actions below so we can log them as discrete events.
// ────────────────────────────────────────────────────────────────
const updateSchema = z.object({
  title:    z.string().min(1).max(200),
  body:     z.string().max(8000).optional().or(z.literal("")),
  type:     z.enum(TYPES),
  priority: z.enum(PRIORITIES),
  audience: z.enum(AUDIENCES),
  // Comma- or newline-separated values; server splits + trims.
  audiencePlans:     z.string().optional().or(z.literal("")),
  audienceCohorts:   z.string().optional().or(z.literal("")),
  audienceTenantIds: z.string().optional().or(z.literal("")),
  // Datetimes come from <input type="datetime-local"> — local format,
  // we coerce via new Date(). Empty string clears.
  publishAt: z.string().optional().or(z.literal("")),
  expireAt:  z.string().optional().or(z.literal("")),
  tags:      z.string().optional().or(z.literal("")),
});

export async function updateAnnouncement(id: string, formData: FormData) {
  const ctx = await requirePlatformStaff();
  if (!ctx.canWrite) {
    redirect(`/platform/announcements/${id}?error=${encodeURIComponent("Requires admin role")}`);
  }
  const parsed = updateSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    redirect(`/platform/announcements/${id}?error=${encodeURIComponent(parsed.error.issues[0]?.message ?? "Invalid input")}`);
  }
  const d = parsed.data;

  await db.platformAnnouncement.update({
    where: { id },
    data: {
      title:    d.title,
      body:     d.body ?? "",
      type:     d.type as AnnouncementType,
      priority: d.priority as AnnouncementPriority,
      audience: d.audience as AnnouncementAudience,
      audiencePlans:     splitList(d.audiencePlans).map((s) => s.toUpperCase()),
      audienceCohorts:   splitList(d.audienceCohorts).map((s) => s.toUpperCase()),
      audienceTenantIds: splitList(d.audienceTenantIds),
      publishAt: d.publishAt ? new Date(d.publishAt) : null,
      expireAt:  d.expireAt  ? new Date(d.expireAt)  : null,
      tags:      splitList(d.tags),
    },
  });

  revalidatePath("/platform/announcements");
  revalidatePath(`/platform/announcements/${id}`);
  redirect(`/platform/announcements/${id}?ok=saved`);
}

// ────────────────────────────────────────────────────────────────
// PUBLISH — flip to PUBLISHED + stamp publishedAt. Does NOT clear
// publishAt (we want the schedule history). Tenant-side banner uses
// publishedAt for sort, so publishing "now" sets that to the current
// timestamp regardless of what publishAt said.
// ────────────────────────────────────────────────────────────────
export async function publishAnnouncement(id: string) {
  const ctx = await requirePlatformStaff();
  if (!ctx.canWrite) {
    redirect(`/platform/announcements/${id}?error=${encodeURIComponent("Requires admin role")}`);
  }
  const row = await db.platformAnnouncement.findUnique({
    where: { id },
    select: { id: true, status: true, title: true },
  });
  if (!row) {
    redirect(`/platform/announcements?error=${encodeURIComponent("Not found")}`);
  }
  if (!row.title.trim()) {
    redirect(`/platform/announcements/${id}?error=${encodeURIComponent("Add a title before publishing.")}`);
  }
  await db.platformAnnouncement.update({
    where: { id },
    data: {
      status: "PUBLISHED",
      publishedAt: new Date(),
    },
  });
  await logPlatformAudit({
    userId:     ctx.userId,
    tenantId:   null,
    action:     "platform.announcement_published",
    entityType: "PlatformAnnouncement",
    entityId:   id,
    metadata:   { actor: ctx.email, from: row.status },
  });
  revalidatePath("/platform/announcements");
  revalidatePath(`/platform/announcements/${id}`);
  redirect(`/platform/announcements/${id}?ok=published`);
}

// SCHEDULE — like publish but uses the publishAt the form already saved.
// If publishAt is missing or in the past, falls through to publish-now.
export async function scheduleAnnouncement(id: string) {
  const ctx = await requirePlatformStaff();
  if (!ctx.canWrite) {
    redirect(`/platform/announcements/${id}?error=${encodeURIComponent("Requires admin role")}`);
  }
  const row = await db.platformAnnouncement.findUnique({
    where: { id },
    select: { id: true, status: true, publishAt: true, title: true },
  });
  if (!row) {
    redirect(`/platform/announcements?error=${encodeURIComponent("Not found")}`);
  }
  if (!row.title.trim()) {
    redirect(`/platform/announcements/${id}?error=${encodeURIComponent("Add a title before scheduling.")}`);
  }
  if (!row.publishAt) {
    redirect(`/platform/announcements/${id}?error=${encodeURIComponent("Set a publish-at time before scheduling.")}`);
  }
  if (row.publishAt.getTime() <= Date.now()) {
    // Past publishAt → just publish now.
    return publishAnnouncement(id);
  }
  await db.platformAnnouncement.update({
    where: { id },
    data:  { status: "SCHEDULED" },
  });
  await logPlatformAudit({
    userId:     ctx.userId,
    tenantId:   null,
    action:     "platform.announcement_scheduled",
    entityType: "PlatformAnnouncement",
    entityId:   id,
    metadata:   { actor: ctx.email, publishAt: row.publishAt.toISOString() },
  });
  revalidatePath("/platform/announcements");
  revalidatePath(`/platform/announcements/${id}`);
  redirect(`/platform/announcements/${id}?ok=scheduled`);
}

// UNPUBLISH — flip a PUBLISHED or SCHEDULED row back to DRAFT. Doesn't
// touch publishedAt so we can show "was live until" history later.
export async function unpublishAnnouncement(id: string) {
  const ctx = await requirePlatformStaff();
  if (!ctx.canWrite) {
    redirect(`/platform/announcements/${id}?error=${encodeURIComponent("Requires admin role")}`);
  }
  await db.platformAnnouncement.update({
    where: { id },
    data:  { status: "DRAFT" },
  });
  revalidatePath("/platform/announcements");
  revalidatePath(`/platform/announcements/${id}`);
  redirect(`/platform/announcements/${id}?ok=unpublished`);
}

// ARCHIVE — final state. The list page hides ARCHIVED rows by default.
export async function archiveAnnouncement(id: string) {
  const ctx = await requirePlatformStaff();
  if (!ctx.canWrite) {
    redirect(`/platform/announcements/${id}?error=${encodeURIComponent("Requires admin role")}`);
  }
  await db.platformAnnouncement.update({
    where: { id },
    data:  { status: "ARCHIVED" },
  });
  revalidatePath("/platform/announcements");
  revalidatePath(`/platform/announcements/${id}`);
  redirect(`/platform/announcements?ok=archived`);
}

// DELETE — hard delete. Only allowed for DRAFT rows (never published).
export async function deleteAnnouncement(id: string) {
  const ctx = await requirePlatformStaff();
  if (!ctx.canWrite) {
    redirect(`/platform/announcements/${id}?error=${encodeURIComponent("Requires admin role")}`);
  }
  const row = await db.platformAnnouncement.findUnique({
    where: { id },
    select: { id: true, status: true },
  });
  if (!row) {
    redirect(`/platform/announcements?error=${encodeURIComponent("Not found")}`);
  }
  if (row.status !== "DRAFT") {
    redirect(`/platform/announcements/${id}?error=${encodeURIComponent("Only draft announcements can be deleted. Archive instead.")}`);
  }
  await db.platformAnnouncement.delete({ where: { id } });
  revalidatePath("/platform/announcements");
  redirect(`/platform/announcements?ok=deleted`);
}

// ────────────────────────────────────────────────────────────────
// READ — active announcements for a given tenant. Used by the
// tenant-side banner. Returns rows where:
//   • status is PUBLISHED, OR
//   • status is SCHEDULED and publishAt has passed
//   • AND expireAt is in the future (or null)
//   • AND audience matches the tenant
// Capped at 5; sorted by priority desc then publishedAt desc.
// ────────────────────────────────────────────────────────────────
export async function activeAnnouncementsForTenant(tenant: {
  id: string;
  plan: string;
  betaCohort: string;
}) {
  const now = new Date();
  // Audience filter: ALL always matches; PLAN/COHORT/TENANT match by
  // their respective string array. Build with OR clauses.
  const audienceClause: Prisma.PlatformAnnouncementWhereInput = {
    OR: [
      { audience: "ALL" },
      { audience: "PLAN",   audiencePlans:     { has: tenant.plan } },
      { audience: "COHORT", audienceCohorts:   { has: tenant.betaCohort } },
      { audience: "TENANT", audienceTenantIds: { has: tenant.id } },
    ],
  };
  const liveClause: Prisma.PlatformAnnouncementWhereInput = {
    OR: [
      { status: "PUBLISHED" },
      { status: "SCHEDULED", publishAt: { lte: now } },
    ],
  };
  const notExpired: Prisma.PlatformAnnouncementWhereInput = {
    OR: [{ expireAt: null }, { expireAt: { gt: now } }],
  };

  return db.platformAnnouncement.findMany({
    where: { AND: [audienceClause, liveClause, notExpired] },
    orderBy: [{ priority: "desc" }, { publishedAt: "desc" }, { createdAt: "desc" }],
    take: 5,
  });
}

// ────────────────────────────────────────────────────────────────
// VIEW TRACKING — called from the tenant-side banner. The banner mounts
// once we've SSR'd the matching announcements; on first render it pings
// recordAnnouncementView, and on dismiss it pings recordAnnouncementDismissal.
// Both are no-throw and return void so the UI never blocks on them.
// ────────────────────────────────────────────────────────────────

/**
 * Mark this announcement as seen by the calling user. Idempotent —
 * upserts on (announcementId, userId), so re-mounts don't duplicate.
 * Stores tenantId from the active session for the analytics rollup.
 */
export async function recordAnnouncementView(announcementId: string, tenantId: string) {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return;
  try {
    await db.platformAnnouncementView.upsert({
      where:  { announcementId_userId: { announcementId, userId } },
      create: { announcementId, userId, tenantId },
      // Keep the original seenAt; only refresh implicitly via a no-op
      // update so we don't bump it on every page load.
      update: {},
    });
  } catch {
    // Schema race / unique violation — silently swallow. The banner
    // doesn't surface this; analytics tolerate eventual consistency.
  }
}

/**
 * Stamp dismissedAt for the calling user. Implies "seen" too — upserts
 * the row in case the user somehow dismissed before the view ping landed.
 */
export async function recordAnnouncementDismissal(announcementId: string, tenantId: string) {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return;
  try {
    await db.platformAnnouncementView.upsert({
      where:  { announcementId_userId: { announcementId, userId } },
      create: { announcementId, userId, tenantId, dismissedAt: new Date() },
      update: { dismissedAt: new Date() },
    });
  } catch {
    // Same tolerance as recordAnnouncementView.
  }
}

// ────────────────────────────────────────────────────────────────
// EMAIL FAN-OUT — explicit admin action. Picks all matching tenants
// per the audience selector, expands each to its active members, and
// sends a branded email to every member. We stamp emailedAt and the
// recipient count for the analytics panel; re-clicks re-send (admin's
// call), so the button label flips to "Re-send" after the first send.
// ────────────────────────────────────────────────────────────────

export async function sendAnnouncementEmails(id: string) {
  const ctx = await requirePlatformStaff();
  if (!ctx.canWrite) {
    redirect(`/platform/announcements/${id}?error=${encodeURIComponent("Requires admin role")}`);
  }
  const a = await db.platformAnnouncement.findUnique({ where: { id } });
  if (!a) {
    redirect(`/platform/announcements?error=${encodeURIComponent("Not found")}`);
  }
  if (a.status !== "PUBLISHED" && !(a.status === "SCHEDULED" && a.publishAt && a.publishAt.getTime() <= Date.now())) {
    redirect(`/platform/announcements/${id}?error=${encodeURIComponent("Publish before sending emails.")}`);
  }

  // Resolve the matching tenants. Mirrors activeAnnouncementsForTenant
  // but on the tenant side instead of the announcement side.
  const tenantWhere: Prisma.TenantWhereInput = a.audience === "ALL"
    ? { status: { not: "ARCHIVED" } }
    : a.audience === "PLAN"
    ? { status: { not: "ARCHIVED" }, plan: { in: a.audiencePlans as Array<"STARTER" | "GROWTH" | "PRO" | "ENTERPRISE"> } }
    : a.audience === "COHORT"
    ? { status: { not: "ARCHIVED" }, betaCohort: { in: a.audienceCohorts as Array<"NONE" | "ALPHA" | "BETA" | "PILOT"> } }
    : { status: { not: "ARCHIVED" }, id: { in: a.audienceTenantIds } };

  const tenants = await db.tenant.findMany({
    where:  tenantWhere,
    select: { id: true },
  });
  if (tenants.length === 0) {
    redirect(`/platform/announcements/${id}?error=${encodeURIComponent("No tenants match the audience.")}`);
  }

  // Pull every active member of every matching tenant. We deduplicate
  // by user email at the end — same person on multiple tenants
  // shouldn't get N copies of the same announcement.
  const memberships = await db.membership.findMany({
    where: {
      tenantId: { in: tenants.map((t) => t.id) },
      status:   "ACTIVE",
    },
    select: { user: { select: { id: true, email: true, name: true } } },
  });
  const uniqRecipients = new Map<string, { id: string; email: string; name: string | null }>();
  for (const m of memberships) {
    if (m.user?.email) uniqRecipients.set(m.user.email.toLowerCase(), m.user);
  }

  const brand = await loadBrand();
  const subject = `${brand.productName}: ${a.title}`;
  const bodyHtml = renderMarkdownLite(a.body || "");

  // Send sequentially to keep load on Resend modest. For very large
  // tenant bases this should be moved to a worker job — fine for now
  // since active recipient counts are in the hundreds at most.
  let sentCount = 0;
  for (const u of uniqRecipients.values()) {
    const html = brandedEmailLayout({
      previewText: a.title,
      heading: a.title,
      subheading: a.type.replace("_", " ").toLowerCase(),
      sections: [
        ...(bodyHtml ? [{ kind: "text" as const, html: bodyHtml }] : []),
        { kind: "fallbackLink" as const, label: "Open Flowtora", href: "https://flowtora.com" },
      ],
      footerNote: "You're receiving this because you're on the Flowtora platform.",
    });
    const text = brandedTextLayout({
      heading: a.title,
      body: a.body || "",
    });
    try {
      await sendEmail({
        to: u.email,
        subject,
        html,
        text,
      });
      sentCount++;
    } catch {
      // Best-effort fan-out; one bad recipient shouldn't block the rest.
    }
  }

  await db.platformAnnouncement.update({
    where: { id },
    data: {
      emailedAt: new Date(),
      emailedRecipientCount: sentCount,
    },
  });
  await logPlatformAudit({
    userId:     ctx.userId,
    tenantId:   null,
    action:     "platform.announcement_emailed",
    entityType: "PlatformAnnouncement",
    entityId:   id,
    metadata:   { actor: ctx.email, recipients: sentCount, audience: a.audience },
  });

  revalidatePath(`/platform/announcements/${id}`);
  revalidatePath("/platform/announcements");
  redirect(`/platform/announcements/${id}?ok=emailed&count=${sentCount}`);
}

// ────────────────────────────────────────────────────────────────
// Helpers (sync helpers live in src/lib/announcement-status.ts —
// every export from this "use server" module must be async, so the
// pure liveStatus() helper had to be moved out).
// ────────────────────────────────────────────────────────────────

// Split a comma- or newline-separated input into a clean string[].
function splitList(raw: string | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(/[,\n]/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}
