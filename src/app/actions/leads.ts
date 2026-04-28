"use server";

// Phase 19 — platform-side MarketingLead management.
//
// The marketing site writes into MarketingLead via forms in src/app/actions/marketing.ts.
// This file is the platform staff's side: triage the inbox, change status,
// assign, attach a converted tenant, and leave notes. Every write goes
// through requirePlatformStaff + logPlatformAudit.

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { requirePlatformStaff, logPlatformAudit } from "@/lib/platform";

const LEAD_STATUSES = ["NEW", "CONTACTED", "QUALIFIED", "CONVERTED", "DISQUALIFIED", "SPAM"] as const;

const updateSchema = z.object({
  status:             z.enum(LEAD_STATUSES),
  assignedToUserId:   z.string().optional().transform((v) => (v === "" ? null : v ?? null)),
  convertedTenantId:  z.string().optional().transform((v) => (v === "" ? null : v ?? null)),
  disqualifiedReason: z.string().max(500).optional().transform((v) => (v === "" ? null : v ?? null)),
  notes:              z.string().max(5000).optional().transform((v) => (v === "" ? null : v ?? null)),
});

/**
 * Update a lead's triage state. Stamps firstContactedAt on the first
 * transition out of NEW, and convertedAt when status flips to CONVERTED.
 */
export async function updateMarketingLead(leadId: string, formData: FormData) {
  const ctx = await requirePlatformStaff();
  const parsed = updateSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    redirect(`/platform/leads/${leadId}?error=${encodeURIComponent("Invalid input")}`);
  }

  const lead = await db.marketingLead.findUnique({ where: { id: leadId } });
  if (!lead) {
    redirect(`/platform/leads?error=${encodeURIComponent("Lead not found")}`);
  }

  // If the staffer picked a convertedTenantId, validate it exists to avoid
  // dangling references — the field is a plain string, not a FK.
  if (parsed.data.convertedTenantId) {
    const tenant = await db.tenant.findUnique({
      where:  { id: parsed.data.convertedTenantId },
      select: { id: true },
    });
    if (!tenant) {
      redirect(`/platform/leads/${leadId}?error=${encodeURIComponent("Tenant id not found")}`);
    }
  }

  const now = new Date();
  const becomingContacted = lead.status === "NEW" && parsed.data.status !== "NEW";
  const becomingConverted = lead.status !== "CONVERTED" && parsed.data.status === "CONVERTED";

  await db.marketingLead.update({
    where: { id: leadId },
    data: {
      status:             parsed.data.status,
      assignedToUserId:   parsed.data.assignedToUserId,
      convertedTenantId:  parsed.data.convertedTenantId,
      disqualifiedReason: parsed.data.disqualifiedReason,
      notes:              parsed.data.notes,
      lastContactedAt:    now,
      ...(becomingContacted && !lead.firstContactedAt ? { firstContactedAt: now } : {}),
      ...(becomingConverted && !lead.convertedAt       ? { convertedAt: now }     : {}),
    },
  });

  await logPlatformAudit({
    userId:     ctx.userId,
    tenantId:   parsed.data.convertedTenantId ?? lead.convertedTenantId ?? null,
    action:     "platform.lead_updated",
    entityType: "MarketingLead",
    entityId:   leadId,
    metadata: {
      actor: ctx.email,
      from:  lead.status,
      to:    parsed.data.status,
      assignedTo: parsed.data.assignedToUserId,
    },
  });

  revalidatePath("/platform/leads");
  revalidatePath(`/platform/leads/${leadId}`);
  redirect(`/platform/leads/${leadId}?ok=1`);
}

// Inline quick-actions used by the leads inbox row menu and side panel.
// These bypass the full updateMarketingLead form so a sales person can
// claim a row or flip its status with one click — without leaving the
// inbox.

export async function assignLeadToMe(leadId: string) {
  const ctx = await requirePlatformStaff();
  const lead = await db.marketingLead.findUnique({
    where:  { id: leadId },
    select: { id: true, assignedToUserId: true, status: true },
  });
  if (!lead) return;
  if (lead.assignedToUserId === ctx.userId) return;

  await db.marketingLead.update({
    where: { id: leadId },
    data:  { assignedToUserId: ctx.userId },
  });
  await logPlatformAudit({
    userId:     ctx.userId,
    tenantId:   null,
    action:     "platform.lead_assigned",
    entityType: "MarketingLead",
    entityId:   leadId,
    metadata:   { actor: ctx.email, from: lead.assignedToUserId, to: ctx.userId },
  });

  revalidatePath("/platform/leads");
  revalidatePath(`/platform/leads/${leadId}`);
}

export async function changeLeadStatus(leadId: string, formData: FormData) {
  const ctx = await requirePlatformStaff();
  const next = String(formData.get("status") ?? "");
  const parsed = z.enum(LEAD_STATUSES).safeParse(next);
  if (!parsed.success) return;

  const lead = await db.marketingLead.findUnique({
    where:  { id: leadId },
    select: { id: true, status: true, firstContactedAt: true, convertedAt: true },
  });
  if (!lead) return;
  if (lead.status === parsed.data) return;

  const now = new Date();
  const becomingContacted = lead.status === "NEW" && parsed.data !== "NEW";
  const becomingConverted = lead.status !== "CONVERTED" && parsed.data === "CONVERTED";

  await db.marketingLead.update({
    where: { id: leadId },
    data: {
      status:          parsed.data,
      lastContactedAt: now,
      ...(becomingContacted && !lead.firstContactedAt ? { firstContactedAt: now } : {}),
      ...(becomingConverted && !lead.convertedAt       ? { convertedAt: now }     : {}),
    },
  });
  await logPlatformAudit({
    userId:     ctx.userId,
    tenantId:   null,
    action:     "platform.lead_status_changed",
    entityType: "MarketingLead",
    entityId:   leadId,
    metadata:   { actor: ctx.email, from: lead.status, to: parsed.data },
  });

  revalidatePath("/platform/leads");
  revalidatePath(`/platform/leads/${leadId}`);
}
