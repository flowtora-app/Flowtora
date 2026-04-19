"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireTenant } from "@/lib/tenant";

// Phase 3 — palette pin actions.
//
// Lightweight pins live outside the domain (no permission gating beyond
// "you're a member of this tenant"). Any member can curate their own
// pins — pins are scoped per-user, so nobody can pollute someone else's
// palette.
//
// Philosophy: we snapshot label/sub/href into the pin row rather than
// joining back to the source record on every palette open. That keeps
// the ⌘K path zero-query for pins and means a pinned-but-renamed
// record still shows the old label until the user re-pins. Acceptable
// — pins are user affordances, not a source of truth.

const ENTITY_KINDS = [
  "customer",
  "quote",
  "order",
  "invoice",
  "task",
  "product",
  "location",
] as const;
export type PalettePinKind = (typeof ENTITY_KINDS)[number];

const pinSchema = z.object({
  entityKind: z.enum(ENTITY_KINDS),
  entityId: z.string().min(1),
  label: z.string().min(1).max(200),
  sub: z.string().max(200).optional(),
  href: z.string().min(1).max(500),
});

// Hard cap so a runaway client can't write thousands of pins per user
// per tenant. Palette UI currently renders up to 10 — we allow a little
// headroom beyond that for multi-pin workflows.
const MAX_PINS_PER_USER_TENANT = 24;

export async function togglePin(slug: string, formData: FormData) {
  const ctx = await requireTenant(slug);
  const parsed = pinSchema.safeParse({
    entityKind: formData.get("entityKind"),
    entityId: formData.get("entityId"),
    label: formData.get("label"),
    sub: formData.get("sub") || undefined,
    href: formData.get("href"),
  });
  if (!parsed.success) return;

  // Defence in depth — `href` must stay inside this tenant so a
  // maliciously-crafted form can't turn pins into an open-redirect
  // gadget.
  if (!parsed.data.href.startsWith(`/t/${slug}/`)) return;

  const existing = await db.palettePin.findUnique({
    where: {
      userId_tenantId_entityKind_entityId: {
        userId: ctx.userId,
        tenantId: ctx.tenant.id,
        entityKind: parsed.data.entityKind,
        entityId: parsed.data.entityId,
      },
    },
    select: { id: true },
  });

  if (existing) {
    await db.palettePin.delete({ where: { id: existing.id } });
  } else {
    const count = await db.palettePin.count({
      where: { userId: ctx.userId, tenantId: ctx.tenant.id },
    });
    if (count >= MAX_PINS_PER_USER_TENANT) {
      // Silently cap — the UI already shows a filled star, but if the
      // user hits a race we'd rather no-op than error out.
      return;
    }
    await db.palettePin.create({
      data: {
        userId: ctx.userId,
        tenantId: ctx.tenant.id,
        entityKind: parsed.data.entityKind,
        entityId: parsed.data.entityId,
        label: parsed.data.label,
        sub: parsed.data.sub,
        href: parsed.data.href,
      },
    });
  }

  // Revalidate the current page (so a "Pin" button on a detail page
  // re-renders in its new state) plus the shell so the palette reflects
  // the change without a hard refresh.
  revalidatePath(`/t/${slug}`, "layout");
}

// Thin unpin primitive for list views that only need "remove". Callers
// pass the snapshot of a pin so we can look it up without exposing the
// internal pin id (keeps URLs / hidden fields simpler).
export async function unpinByEntity(
  slug: string,
  entityKind: PalettePinKind,
  entityId: string,
) {
  const ctx = await requireTenant(slug);
  await db.palettePin.deleteMany({
    where: {
      userId: ctx.userId,
      tenantId: ctx.tenant.id,
      entityKind,
      entityId,
    },
  });
  revalidatePath(`/t/${slug}`, "layout");
}
