"use server";

// Page 43 — SEO & Content actions.

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import {
  logPlatformAudit,
  requirePlatformPermission,
} from "@/lib/platform";
import type { SeoIntent, SeoContentGapStatus } from "@prisma/client";

const ROUTE = "/platform/marketing/seo";
const PERM = "seo.manage" as const;

const INTENTS = ["INFORMATIONAL", "NAVIGATIONAL", "COMMERCIAL", "TRANSACTIONAL"] as const;
const GAP_STATUSES = ["OPEN", "IN_PROGRESS", "PUBLISHED", "IGNORED"] as const;

/* ── Settings ──────────────────────────────────────────── */

const settingsSchema = z.object({
  robotsTxt:              z.string().max(20_000).default(""),
  sitemapEnabled:         z.coerce.boolean().optional().default(false),
  defaultCanonicalDomain: z.string().max(200).optional().or(z.literal("")),
  metaTitleTemplate:      z.string().max(200).default("{{page}} | Flowtora"),
  metaDescription:        z.string().max(500).optional().or(z.literal("")),
  ogImageUrl:             z.string().max(500).optional().or(z.literal("")),
  hreflangsRaw:           z.string().max(5000).optional().or(z.literal("")),
});

export async function saveSeoSettings(formData: FormData) {
  const ctx = await requirePlatformPermission(PERM);
  const raw = Object.fromEntries(formData.entries());
  raw.sitemapEnabled = raw.sitemapEnabled === "on" || raw.sitemapEnabled === "true" ? "true" : "false";
  const parsed = settingsSchema.safeParse(raw);
  if (!parsed.success) {
    redirect(`${ROUTE}?tab=settings&error=${encodeURIComponent(parsed.error.issues[0]?.message ?? "Invalid")}`);
  }
  const d = parsed.data;
  // hreflangs are entered as one "lang|url" per line in a textarea.
  const hreflangs = (d.hreflangsRaw ?? "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [lang, ...rest] = line.split("|");
      return { lang: (lang ?? "").trim(), url: rest.join("|").trim() };
    })
    .filter((h) => h.lang && h.url);

  const data = {
    robotsTxt: d.robotsTxt,
    sitemapEnabled: d.sitemapEnabled,
    defaultCanonicalDomain: d.defaultCanonicalDomain || null,
    metaTitleTemplate: d.metaTitleTemplate,
    metaDescription: d.metaDescription || null,
    ogImageUrl: d.ogImageUrl || null,
    hreflangs,
    updatedById: ctx.userId,
  };
  await db.seoSettings.upsert({
    where: { id: "default" },
    create: { id: "default", ...data },
    update: data,
  });
  await logPlatformAudit({
    userId: ctx.userId,
    action: "platform.seo.settings_saved",
    entityType: "SeoSettings",
    entityId: "default",
    metadata: { actor: ctx.email, sitemapEnabled: d.sitemapEnabled, hreflangCount: hreflangs.length },
  });
  revalidatePath(ROUTE);
  redirect(`${ROUTE}?tab=settings&ok=saved`);
}

export async function regenerateSitemap() {
  const ctx = await requirePlatformPermission(PERM);
  // In production this would walk the marketing site and write
  // /public/sitemap.xml; here we stamp the timestamp + a representative
  // URL count so the UI shows a fresh "last generated" line.
  const urlCount = await deriveSitemapUrlCount();
  await db.seoSettings.upsert({
    where: { id: "default" },
    create: { id: "default", sitemapLastGeneratedAt: new Date(), sitemapUrlCount: urlCount },
    update: { sitemapLastGeneratedAt: new Date(), sitemapUrlCount: urlCount },
  });
  await logPlatformAudit({
    userId: ctx.userId,
    action: "platform.seo.sitemap_regenerated",
    entityType: "SeoSettings",
    entityId: "default",
    metadata: { actor: ctx.email, urlCount },
  });
  revalidatePath(ROUTE);
  redirect(`${ROUTE}?tab=settings&ok=sitemap-regenerated`);
}

async function deriveSitemapUrlCount(): Promise<number> {
  // Static marketing pages we ship — these are the canonical paths
  // included in the sitemap. In production we'd discover by walking
  // /src/app/(marketing); for now we hard-code the known count.
  // Plus 1 per published landing page so the count reflects reality.
  const lp = await db.landingPage.count({ where: { status: "LIVE" } }).catch(() => 0);
  // Hard-coded baseline marketing pages: home, /pricing, /features,
  // /for-sign-shops, /for-print-shops, /contact, /about, /legal/terms,
  // /legal/privacy.
  return 9 + lp;
}

/* ── Keyword tracker ──────────────────────────────────── */

const keywordSchema = z.object({
  id:             z.string().optional().or(z.literal("")),
  keyword:        z.string().min(1).max(200),
  intent:         z.enum(INTENTS).default("INFORMATIONAL"),
  searchVolume:   z.coerce.number().int().min(0).max(10_000_000).optional(),
  difficulty:     z.coerce.number().int().min(0).max(100).optional(),
  position:       z.coerce.number().int().min(0).max(200).optional(),
  url:            z.string().max(500).optional().or(z.literal("")),
  country:        z.string().max(8).default("US"),
  tagsRaw:        z.string().max(500).optional().or(z.literal("")),
  active:         z.coerce.boolean().optional().default(true),
});

export async function saveKeyword(formData: FormData) {
  const ctx = await requirePlatformPermission(PERM);
  const raw = Object.fromEntries(formData.entries());
  raw.active = raw.active === "on" || raw.active === "true" ? "true" : "false";
  for (const k of ["searchVolume", "difficulty", "position"]) {
    if (raw[k] === "") delete raw[k];
  }
  const parsed = keywordSchema.safeParse(raw);
  if (!parsed.success) {
    redirect(`${ROUTE}?tab=keywords&error=${encodeURIComponent(parsed.error.issues[0]?.message ?? "Invalid")}`);
  }
  const d = parsed.data;
  const tags = (d.tagsRaw ?? "")
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);

  const data = {
    keyword: d.keyword,
    intent: d.intent,
    searchVolume: d.searchVolume ?? null,
    difficulty: d.difficulty ?? null,
    position: d.position ?? null,
    url: d.url || null,
    country: d.country || "US",
    tags,
    active: d.active,
  };

  if (d.id) {
    // Capture the previous position before update so the delta render is correct.
    const existing = await db.seoKeyword.findUnique({ where: { id: d.id } });
    const previousPosition = existing?.position ?? null;
    await db.seoKeyword.update({
      where: { id: d.id },
      data: { ...data, previousPosition, lastCheckedAt: new Date() },
    });
    if (data.position != null) {
      await db.seoKeywordRanking.upsert({
        where: { keywordId_date: { keywordId: d.id, date: today() } },
        create: { keywordId: d.id, date: today(), position: data.position },
        update: { position: data.position },
      });
    }
    await logPlatformAudit({
      userId: ctx.userId,
      action: "platform.seo.keyword_updated",
      entityType: "SeoKeyword",
      entityId: d.id,
      metadata: { actor: ctx.email, keyword: d.keyword, position: data.position },
    });
  } else {
    const created = await db.seoKeyword.create({
      data: { ...data, previousPosition: null, lastCheckedAt: new Date() },
    });
    if (data.position != null) {
      await db.seoKeywordRanking.create({
        data: { keywordId: created.id, date: today(), position: data.position },
      });
    }
    await logPlatformAudit({
      userId: ctx.userId,
      action: "platform.seo.keyword_created",
      entityType: "SeoKeyword",
      entityId: created.id,
      metadata: { actor: ctx.email, keyword: d.keyword },
    });
  }
  revalidatePath(ROUTE);
  redirect(`${ROUTE}?tab=keywords&ok=keyword-saved`);
}

const keywordDelete = z.object({ id: z.string().min(1) });
export async function deleteKeyword(formData: FormData) {
  const ctx = await requirePlatformPermission(PERM);
  const parsed = keywordDelete.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) redirect(`${ROUTE}?tab=keywords&error=invalid`);
  await db.seoKeyword.delete({ where: { id: parsed.data.id } });
  await logPlatformAudit({
    userId: ctx.userId,
    action: "platform.seo.keyword_deleted",
    entityType: "SeoKeyword",
    entityId: parsed.data.id,
    metadata: { actor: ctx.email },
  });
  revalidatePath(ROUTE);
  redirect(`${ROUTE}?tab=keywords&ok=keyword-deleted`);
}

/** Pretend-sync — mock the SEMrush/Ahrefs API by jittering positions
 *  on every active keyword. In production this is a webhook + cron job.  */
export async function syncKeywords() {
  const ctx = await requirePlatformPermission(PERM);
  const active = await db.seoKeyword.findMany({ where: { active: true } });
  let movedUp = 0;
  let movedDown = 0;
  for (const k of active) {
    if (k.position == null) continue;
    const drift = Math.floor(Math.random() * 5) - 2; // -2 to +2
    const next = Math.max(1, Math.min(100, k.position + drift));
    if (drift < 0) movedUp++;
    else if (drift > 0) movedDown++;
    await db.seoKeyword.update({
      where: { id: k.id },
      data: {
        previousPosition: k.position,
        position: next,
        lastCheckedAt: new Date(),
      },
    });
    await db.seoKeywordRanking.upsert({
      where: { keywordId_date: { keywordId: k.id, date: today() } },
      create: { keywordId: k.id, date: today(), position: next },
      update: { position: next },
    });
  }
  await logPlatformAudit({
    userId: ctx.userId,
    action: "platform.seo.keywords_synced",
    entityType: "SeoKeyword",
    entityId: "*",
    metadata: { actor: ctx.email, total: active.length, movedUp, movedDown },
  });
  revalidatePath(ROUTE);
  redirect(`${ROUTE}?tab=keywords&ok=synced-${active.length}-keywords`);
}

function today(): Date {
  const d = new Date();
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

/* ── Broken link checker ──────────────────────────────── */

const resolveSchema = z.object({
  id:   z.string().min(1),
  note: z.string().max(500).optional().or(z.literal("")),
});

export async function resolveBrokenLink(formData: FormData) {
  const ctx = await requirePlatformPermission(PERM);
  const parsed = resolveSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) redirect(`${ROUTE}?tab=broken&error=invalid`);
  const { id, note } = parsed.data;
  await db.seoBrokenLink.update({
    where: { id },
    data: {
      status: "RESOLVED",
      resolvedAt: new Date(),
      resolvedById: ctx.userId,
      resolutionNote: note || null,
    },
  });
  await logPlatformAudit({
    userId: ctx.userId,
    action: "platform.seo.broken_link_resolved",
    entityType: "SeoBrokenLink",
    entityId: id,
    metadata: { actor: ctx.email },
  });
  revalidatePath(ROUTE);
  redirect(`${ROUTE}?tab=broken&ok=resolved`);
}

export async function ignoreBrokenLink(formData: FormData) {
  const ctx = await requirePlatformPermission(PERM);
  const parsed = resolveSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) redirect(`${ROUTE}?tab=broken&error=invalid`);
  const { id, note } = parsed.data;
  await db.seoBrokenLink.update({
    where: { id },
    data: {
      status: "IGNORED",
      resolvedAt: new Date(),
      resolvedById: ctx.userId,
      resolutionNote: note || null,
    },
  });
  await logPlatformAudit({
    userId: ctx.userId,
    action: "platform.seo.broken_link_ignored",
    entityType: "SeoBrokenLink",
    entityId: id,
    metadata: { actor: ctx.email },
  });
  revalidatePath(ROUTE);
  redirect(`${ROUTE}?tab=broken&ok=ignored`);
}

/** Triggered crawl — reuses last-checked timestamps, no real HTTP. */
export async function runBrokenLinkCrawl() {
  const ctx = await requirePlatformPermission(PERM);
  const open = await db.seoBrokenLink.findMany({ where: { status: "OPEN" } });
  await db.seoBrokenLink.updateMany({
    where: { status: "OPEN" },
    data: { lastCheckedAt: new Date() },
  });
  await logPlatformAudit({
    userId: ctx.userId,
    action: "platform.seo.broken_link_crawl_run",
    entityType: "SeoBrokenLink",
    entityId: "*",
    metadata: { actor: ctx.email, rechecked: open.length },
  });
  revalidatePath(ROUTE);
  redirect(`${ROUTE}?tab=broken&ok=crawl-rechecked-${open.length}-links`);
}

/* ── Content gaps ───────────────────────────────────── */

const gapStatusSchema = z.object({
  id:     z.string().min(1),
  status: z.enum(GAP_STATUSES),
  notes:  z.string().max(1000).optional().or(z.literal("")),
});

export async function updateContentGapStatus(formData: FormData) {
  const ctx = await requirePlatformPermission(PERM);
  const parsed = gapStatusSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) redirect(`${ROUTE}?tab=gaps&error=invalid`);
  const { id, status, notes } = parsed.data;
  const closing = status === "PUBLISHED" || status === "IGNORED";
  await db.seoContentGap.update({
    where: { id },
    data: {
      status: status as SeoContentGapStatus,
      notes: notes || undefined,
      closedAt: closing ? new Date() : null,
    },
  });
  await logPlatformAudit({
    userId: ctx.userId,
    action: "platform.seo.gap_status_updated",
    entityType: "SeoContentGap",
    entityId: id,
    metadata: { actor: ctx.email, status },
  });
  revalidatePath(ROUTE);
  redirect(`${ROUTE}?tab=gaps&ok=gap-${status.toLowerCase()}`);
}

const gapCreateSchema = z.object({
  keyword:          z.string().min(1).max(200),
  searchVolume:     z.coerce.number().int().min(0).max(10_000_000).optional(),
  difficulty:       z.coerce.number().int().min(0).max(100).optional(),
  intent:           z.enum(INTENTS).default("INFORMATIONAL"),
  competitorUrl:    z.string().max(500).optional().or(z.literal("")),
  competitorDomain: z.string().max(200).optional().or(z.literal("")),
  notes:            z.string().max(1000).optional().or(z.literal("")),
});

export async function createContentGap(formData: FormData) {
  const ctx = await requirePlatformPermission(PERM);
  const raw = Object.fromEntries(formData.entries());
  for (const k of ["searchVolume", "difficulty"]) {
    if (raw[k] === "") delete raw[k];
  }
  const parsed = gapCreateSchema.safeParse(raw);
  if (!parsed.success) {
    redirect(`${ROUTE}?tab=gaps&error=${encodeURIComponent(parsed.error.issues[0]?.message ?? "Invalid")}`);
  }
  const d = parsed.data;
  const created = await db.seoContentGap.create({
    data: {
      keyword: d.keyword,
      searchVolume: d.searchVolume ?? null,
      difficulty: d.difficulty ?? null,
      intent: d.intent,
      competitorUrl: d.competitorUrl || null,
      competitorDomain: d.competitorDomain || null,
      notes: d.notes || null,
      status: "OPEN",
    },
  });
  await logPlatformAudit({
    userId: ctx.userId,
    action: "platform.seo.gap_created",
    entityType: "SeoContentGap",
    entityId: created.id,
    metadata: { actor: ctx.email, keyword: d.keyword },
  });
  revalidatePath(ROUTE);
  redirect(`${ROUTE}?tab=gaps&ok=gap-added`);
}

/* ── Page speed crawl trigger ─────────────────────────── */

/** Pretend Lighthouse run — for every URL we have prior snapshots for,
 *  insert a fresh measurement with light jitter. Production would call
 *  PageSpeed Insights API.  */
export async function runPageSpeedCrawl() {
  const ctx = await requirePlatformPermission(PERM);
  const distinct = await db.seoPageSpeedSnapshot.findMany({
    distinct: ["url", "device"],
    select: { url: true, device: true },
    take: 100,
  });
  let added = 0;
  for (const target of distinct) {
    // Find latest score so we jitter from there.
    const latest = await db.seoPageSpeedSnapshot.findFirst({
      where: { url: target.url, device: target.device },
      orderBy: { measuredAt: "desc" },
    });
    const baseScore = latest?.performanceScore ?? 75;
    const drift = Math.floor(Math.random() * 11) - 5;
    const score = Math.max(20, Math.min(100, baseScore + drift));
    await db.seoPageSpeedSnapshot.create({
      data: {
        url: target.url,
        device: target.device,
        lcp: jitter(latest?.lcp ?? 2.4, 0.4, 0.5, 5),
        inp: jitter(latest?.inp ?? 180, 30, 40, 600),
        cls: Math.max(0, +(jitter(latest?.cls ?? 0.07, 0.02, 0.0, 0.3)).toFixed(3)),
        ttfb: jitter(latest?.ttfb ?? 250, 50, 80, 800),
        performanceScore: score,
      },
    });
    added++;
  }
  await logPlatformAudit({
    userId: ctx.userId,
    action: "platform.seo.pagespeed_crawl_run",
    entityType: "SeoPageSpeedSnapshot",
    entityId: "*",
    metadata: { actor: ctx.email, urlsMeasured: added },
  });
  revalidatePath(ROUTE);
  redirect(`${ROUTE}?tab=speed&ok=measured-${added}-urls`);
}

function jitter(base: number, range: number, min: number, max: number): number {
  const next = base + (Math.random() * range * 2 - range);
  return Math.max(min, Math.min(max, +next.toFixed(3)));
}

/* ── Backlink crawl trigger ───────────────────────────── */

/** Pretend Ahrefs sync — flips a random subset to LOST and bumps
 *  lastSeenAt on the rest. Production would diff against the real API. */
export async function syncBacklinks() {
  const ctx = await requirePlatformPermission(PERM);
  const active = await db.seoBacklink.findMany({ where: { status: "ACTIVE" }, take: 500 });
  // 5% chance any given backlink goes LOST on a sync.
  let lost = 0;
  for (const b of active) {
    if (Math.random() < 0.05) {
      await db.seoBacklink.update({
        where: { id: b.id },
        data: { status: "LOST", lostAt: new Date() },
      });
      lost++;
    } else {
      await db.seoBacklink.update({
        where: { id: b.id },
        data: { lastSeenAt: new Date() },
      });
    }
  }
  await logPlatformAudit({
    userId: ctx.userId,
    action: "platform.seo.backlinks_synced",
    entityType: "SeoBacklink",
    entityId: "*",
    metadata: { actor: ctx.email, total: active.length, lost },
  });
  revalidatePath(ROUTE);
  redirect(`${ROUTE}?tab=backlinks&ok=synced-${active.length}-backlinks`);
}
