"use server";

// Page 29 — Industry Templates server actions.

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { logPlatformAudit, requirePlatformPermission } from "@/lib/platform";

const ROUTE = "/platform/catalog/templates";

const SLUG_RX = /^[a-z0-9]+(?:[-_][a-z0-9]+)*$/;

const KINDS = [
  "STOREFRONT", "QUOTE_PDF", "WORK_ORDER",
  "INVOICE", "PROOF_EMAIL", "CUSTOMER_EMAIL",
] as const;

const STATUSES = ["DRAFT", "PUBLISHED", "ARCHIVED"] as const;

function csvList(s: string | undefined): string[] {
  if (!s) return [];
  return s.split(",").map((x) => x.trim()).filter(Boolean);
}

const templateSchema = z.object({
  id: z.string().optional(),
  slug: z.string().trim().toLowerCase().regex(SLUG_RX, "Slug: lowercase letters/digits/hyphens/underscores").max(80),
  name: z.string().trim().min(2).max(120),
  description: z.string().trim().max(2000).optional().or(z.literal("")),
  kind: z.enum(KINDS),
  subject: z.string().trim().max(200).optional().or(z.literal("")),
  bodyHtml: z.string().min(1).max(200_000),
  bodyText: z.string().max(50_000).optional().or(z.literal("")),
  thumbnailUrl: z.string().trim().max(500).optional().or(z.literal("")),
  locale: z.string().trim().toLowerCase().max(10).default("en"),
  status: z.enum(STATUSES).default("DRAFT"),
  internalNotes: z.string().trim().max(2000).optional().or(z.literal("")),
  tags: z.string().optional(),
  variables: z.string().optional(), // comma-separated reference list
});

export async function upsertIndustryTemplate(formData: FormData) {
  const ctx = await requirePlatformPermission("plans.manage");
  const parsed = templateSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    const msg = parsed.error.issues[0]?.message ?? "Invalid input";
    redirect(`${ROUTE}?error=${encodeURIComponent(msg)}`);
  }
  if (!parsed.data.id) {
    const clash = await db.industryTemplate.findUnique({
      where: { slug: parsed.data.slug }, select: { id: true },
    });
    if (clash) {
      redirect(`${ROUTE}?error=${encodeURIComponent(`Slug "${parsed.data.slug}" already exists`)}`);
    }
  }

  const data = {
    slug: parsed.data.slug,
    name: parsed.data.name,
    description: parsed.data.description?.trim() || null,
    kind: parsed.data.kind,
    subject: parsed.data.subject?.trim() || null,
    bodyHtml: parsed.data.bodyHtml,
    bodyText: parsed.data.bodyText?.trim() || null,
    thumbnailUrl: parsed.data.thumbnailUrl?.trim() || null,
    locale: parsed.data.locale,
    status: parsed.data.status,
    internalNotes: parsed.data.internalNotes?.trim() || null,
    tags: csvList(parsed.data.tags).map((t) => t.toLowerCase()),
    variables: csvList(parsed.data.variables),
  };

  if (parsed.data.id) {
    const wasPublished = (await db.industryTemplate.findUnique({
      where: { id: parsed.data.id }, select: { publishedAt: true },
    }))?.publishedAt ?? null;
    await db.industryTemplate.update({
      where: { id: parsed.data.id },
      data: {
        ...data,
        publishedAt: parsed.data.status === "PUBLISHED" ? (wasPublished ?? new Date()) : null,
      },
    });
    await logPlatformAudit({
      userId: ctx.userId,
      action: "platform.industry_template_updated",
      entityType: "IndustryTemplate",
      entityId: parsed.data.id,
      metadata: { actor: ctx.email, slug: parsed.data.slug, kind: parsed.data.kind, status: parsed.data.status },
    });
    revalidatePath(ROUTE);
    redirect(`${ROUTE}/${parsed.data.id}?ok=saved`);
  } else {
    const created = await db.industryTemplate.create({
      data: {
        ...data,
        publishedAt: parsed.data.status === "PUBLISHED" ? new Date() : null,
        createdById: ctx.userId,
      },
      select: { id: true },
    });
    await logPlatformAudit({
      userId: ctx.userId,
      action: "platform.industry_template_created",
      entityType: "IndustryTemplate",
      entityId: created.id,
      metadata: { actor: ctx.email, slug: parsed.data.slug, kind: parsed.data.kind },
    });
    revalidatePath(ROUTE);
    redirect(`${ROUTE}/${created.id}?ok=created`);
  }
}

export async function publishIndustryTemplate(templateId: string) {
  const ctx = await requirePlatformPermission("plans.manage");
  const t = await db.industryTemplate.findUnique({
    where: { id: templateId },
    include: { versions: { orderBy: { version: "desc" }, take: 1, select: { version: true } } },
  });
  if (!t) redirect(`${ROUTE}?error=${encodeURIComponent("Template not found")}`);
  const nextVersion = (t.versions[0]?.version ?? 0) + 1;
  await db.$transaction([
    db.industryTemplate.update({
      where: { id: templateId },
      data: { status: "PUBLISHED", publishedAt: new Date() },
    }),
    db.industryTemplateVersion.create({
      data: {
        templateId,
        version: nextVersion,
        publishedByUserId: ctx.userId,
        note: `Published v${nextVersion}`,
        snapshot: {
          slug: t.slug,
          name: t.name,
          kind: t.kind,
          subject: t.subject,
          bodyHtml: t.bodyHtml,
          bodyText: t.bodyText,
          locale: t.locale,
          variables: t.variables,
        } as Prisma.InputJsonValue,
      },
    }),
  ]);
  await logPlatformAudit({
    userId: ctx.userId,
    action: "platform.industry_template_published",
    entityType: "IndustryTemplate",
    entityId: templateId,
    metadata: { actor: ctx.email, slug: t.slug, kind: t.kind, version: nextVersion },
  });
  revalidatePath(ROUTE);
  redirect(`${ROUTE}/${templateId}?ok=published`);
}

export async function archiveIndustryTemplate(templateId: string) {
  const ctx = await requirePlatformPermission("plans.manage");
  const t = await db.industryTemplate.findUnique({
    where: { id: templateId }, select: { id: true, slug: true },
  });
  if (!t) redirect(`${ROUTE}?error=${encodeURIComponent("Template not found")}`);
  await db.industryTemplate.update({
    where: { id: templateId }, data: { status: "ARCHIVED" },
  });
  await logPlatformAudit({
    userId: ctx.userId,
    action: "platform.industry_template_archived",
    entityType: "IndustryTemplate",
    entityId: templateId,
    metadata: { actor: ctx.email, slug: t.slug },
    severity: "WARNING",
  });
  revalidatePath(ROUTE);
  redirect(`${ROUTE}/${templateId}?ok=archived`);
}

export async function duplicateIndustryTemplate(templateId: string) {
  const ctx = await requirePlatformPermission("plans.manage");
  const src = await db.industryTemplate.findUnique({ where: { id: templateId } });
  if (!src) redirect(`${ROUTE}?error=${encodeURIComponent("Template not found")}`);

  let slug = `${src.slug}-copy`;
  for (let i = 1; i <= 50; i++) {
    const trial = i === 1 ? slug : `${slug}-${i}`;
    const taken = await db.industryTemplate.findUnique({ where: { slug: trial }, select: { id: true } });
    if (!taken) { slug = trial; break; }
  }
  const dup = await db.industryTemplate.create({
    data: {
      slug,
      name: `${src.name} (copy)`,
      description: src.description,
      kind: src.kind,
      subject: src.subject,
      bodyHtml: src.bodyHtml,
      bodyText: src.bodyText,
      thumbnailUrl: src.thumbnailUrl,
      locale: src.locale,
      status: "DRAFT",
      internalNotes: src.internalNotes,
      tags: src.tags,
      variables: src.variables,
      createdById: ctx.userId,
    },
    select: { id: true },
  });
  await logPlatformAudit({
    userId: ctx.userId,
    action: "platform.industry_template_duplicated",
    entityType: "IndustryTemplate",
    entityId: dup.id,
    metadata: { actor: ctx.email, sourceId: templateId, slug },
  });
  revalidatePath(ROUTE);
  redirect(`${ROUTE}/${dup.id}?ok=duplicated`);
}
