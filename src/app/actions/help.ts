"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { auth } from "@/auth";
import { requireTenant } from "@/lib/tenant";
import { db } from "@/lib/db";

// Tenant-side help-center actions (T-105).
//
// These are best-effort instrumentation + a feedback form. None of
// them should block the reader's UI, so the helpers swallow internal
// errors. The platform-side analytics page reads KbArticleView,
// KbSearchQuery, and KbArticleFeedback to surface engagement.

/** Insert one KbArticleView row and bump the denormalized counter.
 *  Called from the article detail page when it loads. Never throws. */
export async function logArticleView(
  slug: string,
  articleId: string,
  source: "category" | "search" | "in-product" | "direct" | "popular",
): Promise<void> {
  try {
    await requireTenant(slug);
    const session = await auth();
    await db.$transaction([
      db.kbArticleView.create({
        data: {
          articleId,
          userId: session?.user?.id ?? null,
          source,
        },
      }),
      db.kbArticle.update({
        where: { id: articleId },
        data:  { viewCount: { increment: 1 } },
      }),
    ]);
  } catch (e) {
    // Article view logging is fire-and-forget. Don't break the reader
    // for an instrumentation hiccup.
    console.error("[help:logArticleView] failed:", e);
  }
}

// ── "Was this helpful?" form ─────────────────────────────────────────

const feedbackSchema = z.object({
  articleId: z.string().min(1),
  helpful:   z.enum(["yes", "no"]),
  comment:   z.string().max(1000).optional().nullable(),
  // Where to redirect back to after submission — typically the
  // article URL with `?fb=ok` so we can show a "thanks" toast.
  returnTo:  z.string().min(1).max(500),
});

export async function submitArticleFeedback(slug: string, formData: FormData) {
  await requireTenant(slug);

  const rawReturnTo = String(formData.get("returnTo") || `/t/${slug}/help`);
  const parsed = feedbackSchema.safeParse({
    articleId: formData.get("articleId"),
    helpful:   formData.get("helpful"),
    comment:   formData.get("comment") || null,
    returnTo:  rawReturnTo,
  });
  if (!parsed.success) {
    // No good way to surface validation errors from the inline form —
    // bounce back with a generic error flag.
    redirect(`${rawReturnTo}?fb=err`);
  }

  const helpful = parsed.data.helpful === "yes";
  const session = await auth();

  try {
    await db.$transaction([
      db.kbArticleFeedback.create({
        data: {
          articleId: parsed.data.articleId,
          helpful,
          comment:   parsed.data.comment,
          userId:    session?.user?.id ?? null,
        },
      }),
      db.kbArticle.update({
        where: { id: parsed.data.articleId },
        data: helpful
          ? { helpfulUp:   { increment: 1 } }
          : { helpfulDown: { increment: 1 } },
      }),
    ]);
  } catch (e) {
    console.error("[help:submitArticleFeedback] failed:", e);
    redirect(`${parsed.data.returnTo}?fb=err`);
  }

  revalidatePath(parsed.data.returnTo);
  redirect(`${parsed.data.returnTo}?fb=ok`);
}

// ── Search query logging ─────────────────────────────────────────────
//
// Drives the platform-side "Top searches" / "Zero-result rate" charts.
// Fire-and-forget; we don't await this in render paths.

export async function logSearchQuery(
  slug: string,
  query: string,
  resultsCount: number,
  clickedArticleId?: string | null,
): Promise<void> {
  try {
    await requireTenant(slug);
    await db.kbSearchQuery.create({
      data: {
        query,
        resultsCount,
        clickedArticleId: clickedArticleId ?? null,
      },
    });
  } catch (e) {
    console.error("[help:logSearchQuery] failed:", e);
  }
}
