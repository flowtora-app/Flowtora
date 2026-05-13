"use server";

// Page 69 — Webhooks Catalog: fire a test event to a chosen endpoint.
//
// Uses the same WebhookDelivery pipeline as live dispatches; admins can
// pick any active endpoint subscribed to the event (or any active
// endpoint and force-send anyway). Test deliveries are tagged in the
// payload so receivers can route them away from production handlers.

import crypto from "node:crypto";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import {
  logPlatformAudit,
  requirePlatformPermission,
} from "@/lib/platform";

const ROUTE = "/platform/settings/webhooks";
const PERM = "webhooks.manage" as const;

const testSchema = z.object({
  eventName: z.string().min(1),
  endpointId: z.string().min(1),
  overridePayload: z.string().optional(),
});

export async function sendTestEvent(formData: FormData) {
  const ctx = await requirePlatformPermission(PERM);
  const parsed = testSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    const msg = encodeURIComponent(parsed.error.issues[0]?.message ?? "Invalid");
    redirect(`${ROUTE}?error=${msg}`);
  }
  const d = parsed.data;
  const evt = await db.webhookEvent.findUnique({ where: { name: d.eventName } });
  if (!evt) {
    redirect(`${ROUTE}?error=${encodeURIComponent("Event not found")}`);
  }
  const endpoint = await db.webhookEndpoint.findUnique({ where: { id: d.endpointId } });
  if (!endpoint) {
    redirect(`${ROUTE}/${encodeURIComponent(d.eventName)}?error=${encodeURIComponent("Endpoint not found")}`);
  }
  // Use the event's sample payload by default; admin can override.
  let payload: unknown = evt!.samplePayload;
  if (d.overridePayload && d.overridePayload.trim().length > 0) {
    try { payload = JSON.parse(d.overridePayload); }
    catch {
      redirect(`${ROUTE}/${encodeURIComponent(d.eventName)}?error=${encodeURIComponent("Override payload is not valid JSON")}`);
    }
  }
  // Wrap in the standard envelope.
  const envelope = {
    id: crypto.randomBytes(12).toString("hex"),
    type: evt!.name,
    test: true,
    created: new Date().toISOString(),
    data: payload,
  };
  // We don't actually fire HTTP from a server action — we record a
  // delivery row with status QUEUED so the existing webhook dispatcher
  // picks it up on its next cycle. This keeps signature generation +
  // retry policy in one place.
  await db.webhookDelivery.create({
    data: {
      endpointId: endpoint!.id,
      eventName:  evt!.name,
      tenantId:   null,
      status:     "PENDING",
      attempts:   0,
      payload:    envelope as never,
      requestHeaders: {} as never,
    },
  });
  await logPlatformAudit({
    userId: ctx.userId,
    action: "platform.webhooks.test_event_sent",
    entityType: "WebhookEvent",
    entityId: evt!.id,
    metadata: { actor: ctx.email, event: d.eventName, endpoint: endpoint!.url },
  });
  revalidatePath(ROUTE);
  redirect(`${ROUTE}/${encodeURIComponent(d.eventName)}?ok=test-queued`);
}
