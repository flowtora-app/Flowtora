"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/tenant";

// Phase 18 Slice H — product feedback submission.
//
// Every signed-in tenant member can submit; the submission is scoped to
// the tenant so nothing leaks cross-shop. We treat the "staff:manage"
// permission as the gate for viewing the inbox (owners / managers).

const feedbackSchema = z.object({
  kind:    z.enum(["IDEA", "BUG", "PRAISE", "OTHER"]).default("IDEA"),
  rating:  z.string().optional().or(z.literal("")),
  summary: z.string().min(3, "Write at least a short headline.").max(200),
  body:    z.string().max(4000).optional().or(z.literal("")),
  context: z.string().max(500).optional().or(z.literal("")),
});

export async function submitFeedback(slug: string, formData: FormData) {
  // "customers:view" is the one permission every tenant role has — it's the
  // de-facto "any member with any access" gate until we add an explicit one.
  const ctx = await requirePermission(slug, "customers:view");
  const parsed = feedbackSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    redirect(`/t/${slug}/feedback?error=${encodeURIComponent(parsed.error.issues[0]?.message ?? "Invalid input")}`);
  }
  const d = parsed.data;
  const rating = d.rating && d.rating.length > 0 ? Math.min(5, Math.max(1, Number(d.rating))) : null;

  await db.feedback.create({
    data: {
      tenantId: ctx.tenant.id,
      userId:   ctx.userId,
      kind:     d.kind,
      rating:   Number.isFinite(rating) && rating != null ? rating : null,
      summary:  d.summary,
      body:     d.body && d.body.length > 0 ? d.body : null,
      context:  d.context && d.context.length > 0 ? d.context : null,
    },
  });

  revalidatePath(`/t/${slug}/feedback`);
  redirect(`/t/${slug}/feedback?sent=1`);
}
