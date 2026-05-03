"use server";

// Page 28 — Pricing Formulas Library server actions.

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { logPlatformAudit, requirePlatformPermission } from "@/lib/platform";

const ROUTE = "/platform/catalog/pricing";

const SLUG_RX = /^[a-z0-9]+(?:[-_][a-z0-9]+)*$/;

const CATEGORIES = [
  "SQ_FT", "PER_PIECE", "TIERED_QTY", "SETUP_RUN",
  "INSTALL_HOURLY", "BUNDLE", "CUSTOM",
] as const;

/* ── Formula upsert ─────────────────────────────────────── */

const formulaSchema = z.object({
  id: z.string().optional(),
  slug: z.string().trim().toLowerCase().regex(SLUG_RX, "Slug: lowercase letters/digits/hyphens/underscores").max(80),
  name: z.string().trim().min(2).max(120),
  description: z.string().trim().max(2000).optional().or(z.literal("")),
  category: z.enum(CATEGORIES),
  expression: z.string().trim().min(1).max(20_000),
  summary: z.string().trim().max(1000).optional().or(z.literal("")),
  /** Variables / constants / tier table arrive as JSON strings from the editor. */
  variablesJson: z.string().optional().or(z.literal("")),
  constantsJson: z.string().optional().or(z.literal("")),
  tierTableJson: z.string().optional().or(z.literal("")),
  status: z.enum(["DRAFT", "PUBLISHED", "ARCHIVED"]).default("DRAFT"),
  internalNotes: z.string().trim().max(2000).optional().or(z.literal("")),
  tags: z.string().optional(),
});

function csvList(s: string | undefined): string[] {
  if (!s) return [];
  return s.split(",").map((x) => x.trim()).filter(Boolean);
}

function parseJsonOrThrow(raw: string | undefined, name: string, fallback: unknown): unknown {
  if (!raw || raw.trim() === "") return fallback;
  try {
    return JSON.parse(raw) as unknown;
  } catch (err) {
    throw new Error(`Invalid JSON for ${name}: ${err instanceof Error ? err.message : "parse error"}`);
  }
}

export async function upsertPricingFormula(formData: FormData) {
  const ctx = await requirePlatformPermission("plans.manage");
  const parsed = formulaSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    const msg = parsed.error.issues[0]?.message ?? "Invalid input";
    redirect(`${ROUTE}?error=${encodeURIComponent(msg)}`);
  }
  if (!parsed.data.id) {
    const clash = await db.pricingFormula.findUnique({
      where: { slug: parsed.data.slug }, select: { id: true },
    });
    if (clash) {
      redirect(`${ROUTE}?error=${encodeURIComponent(`Slug "${parsed.data.slug}" already exists`)}`);
    }
  }

  let variables: unknown;
  let constants: unknown;
  let tierTable: unknown;
  try {
    variables = parseJsonOrThrow(parsed.data.variablesJson, "variables", []);
    constants = parseJsonOrThrow(parsed.data.constantsJson, "constants", []);
    tierTable = parseJsonOrThrow(parsed.data.tierTableJson, "tier table", null);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Invalid JSON";
    const idPath = parsed.data.id ? `${ROUTE}/${parsed.data.id}` : ROUTE;
    redirect(`${idPath}?error=${encodeURIComponent(msg)}`);
  }
  if (!Array.isArray(variables)) {
    const idPath = parsed.data.id ? `${ROUTE}/${parsed.data.id}` : ROUTE;
    redirect(`${idPath}?error=${encodeURIComponent("Variables must be a JSON array")}`);
  }
  if (!Array.isArray(constants)) {
    const idPath = parsed.data.id ? `${ROUTE}/${parsed.data.id}` : ROUTE;
    redirect(`${idPath}?error=${encodeURIComponent("Constants must be a JSON array")}`);
  }
  if (tierTable != null && !Array.isArray(tierTable)) {
    const idPath = parsed.data.id ? `${ROUTE}/${parsed.data.id}` : ROUTE;
    redirect(`${idPath}?error=${encodeURIComponent("Tier table must be a JSON array or null")}`);
  }

  const data = {
    slug: parsed.data.slug,
    name: parsed.data.name,
    description: parsed.data.description?.trim() || null,
    category: parsed.data.category,
    expression: parsed.data.expression,
    summary: parsed.data.summary?.trim() || null,
    variables: variables as Prisma.InputJsonValue,
    constants: constants as Prisma.InputJsonValue,
    tierTable: (tierTable ?? Prisma.JsonNull) as Prisma.InputJsonValue | typeof Prisma.JsonNull,
    status: parsed.data.status,
    internalNotes: parsed.data.internalNotes?.trim() || null,
    tags: csvList(parsed.data.tags).map((t) => t.toLowerCase()),
  };

  if (parsed.data.id) {
    const wasPublished = (await db.pricingFormula.findUnique({
      where: { id: parsed.data.id }, select: { publishedAt: true },
    }))?.publishedAt ?? null;
    await db.pricingFormula.update({
      where: { id: parsed.data.id },
      data: {
        ...data,
        publishedAt: parsed.data.status === "PUBLISHED" ? (wasPublished ?? new Date()) : null,
      },
    });
    await logPlatformAudit({
      userId: ctx.userId,
      action: "platform.pricing_formula_updated",
      entityType: "PricingFormula",
      entityId: parsed.data.id,
      metadata: { actor: ctx.email, slug: parsed.data.slug, status: parsed.data.status },
    });
    revalidatePath(ROUTE);
    redirect(`${ROUTE}/${parsed.data.id}?ok=saved`);
  } else {
    const created = await db.pricingFormula.create({
      data: {
        ...data,
        publishedAt: parsed.data.status === "PUBLISHED" ? new Date() : null,
        createdById: ctx.userId,
      },
      select: { id: true },
    });
    await logPlatformAudit({
      userId: ctx.userId,
      action: "platform.pricing_formula_created",
      entityType: "PricingFormula",
      entityId: created.id,
      metadata: { actor: ctx.email, slug: parsed.data.slug },
    });
    revalidatePath(ROUTE);
    redirect(`${ROUTE}/${created.id}?ok=created`);
  }
}

/* ── Status transitions ──────────────────────────────────── */

export async function publishPricingFormula(formulaId: string) {
  const ctx = await requirePlatformPermission("plans.manage");
  const f = await db.pricingFormula.findUnique({
    where: { id: formulaId },
    include: { versions: { orderBy: { version: "desc" }, take: 1, select: { version: true } } },
  });
  if (!f) redirect(`${ROUTE}?error=${encodeURIComponent("Formula not found")}`);
  const nextVersion = (f.versions[0]?.version ?? 0) + 1;
  await db.$transaction([
    db.pricingFormula.update({
      where: { id: formulaId },
      data: { status: "PUBLISHED", publishedAt: new Date() },
    }),
    db.pricingFormulaVersion.create({
      data: {
        formulaId,
        version: nextVersion,
        publishedByUserId: ctx.userId,
        note: `Published v${nextVersion}`,
        snapshot: {
          slug: f.slug, name: f.name, category: f.category,
          expression: f.expression,
          variables: f.variables as Prisma.InputJsonValue,
          constants: f.constants as Prisma.InputJsonValue,
          tierTable: (f.tierTable ?? null) as Prisma.InputJsonValue | null,
          summary: f.summary,
        },
      },
    }),
  ]);
  await logPlatformAudit({
    userId: ctx.userId,
    action: "platform.pricing_formula_published",
    entityType: "PricingFormula",
    entityId: formulaId,
    metadata: { actor: ctx.email, slug: f.slug, version: nextVersion },
  });
  revalidatePath(ROUTE);
  redirect(`${ROUTE}/${formulaId}?ok=published`);
}

export async function archivePricingFormula(formulaId: string) {
  const ctx = await requirePlatformPermission("plans.manage");
  const f = await db.pricingFormula.findUnique({
    where: { id: formulaId }, select: { id: true, slug: true },
  });
  if (!f) redirect(`${ROUTE}?error=${encodeURIComponent("Formula not found")}`);
  await db.pricingFormula.update({
    where: { id: formulaId }, data: { status: "ARCHIVED" },
  });
  await logPlatformAudit({
    userId: ctx.userId,
    action: "platform.pricing_formula_archived",
    entityType: "PricingFormula",
    entityId: formulaId,
    metadata: { actor: ctx.email, slug: f.slug },
    severity: "WARNING",
  });
  revalidatePath(ROUTE);
  redirect(`${ROUTE}/${formulaId}?ok=archived`);
}

export async function duplicatePricingFormula(formulaId: string) {
  const ctx = await requirePlatformPermission("plans.manage");
  const src = await db.pricingFormula.findUnique({ where: { id: formulaId } });
  if (!src) redirect(`${ROUTE}?error=${encodeURIComponent("Formula not found")}`);

  let slug = `${src.slug}-copy`;
  for (let i = 1; i <= 50; i++) {
    const trial = i === 1 ? slug : `${slug}-${i}`;
    const taken = await db.pricingFormula.findUnique({ where: { slug: trial }, select: { id: true } });
    if (!taken) { slug = trial; break; }
  }
  const dup = await db.pricingFormula.create({
    data: {
      slug,
      name: `${src.name} (copy)`,
      description: src.description,
      category: src.category,
      expression: src.expression,
      summary: src.summary,
      variables: src.variables as Prisma.InputJsonValue,
      constants: src.constants as Prisma.InputJsonValue,
      tierTable: (src.tierTable ?? Prisma.JsonNull) as Prisma.InputJsonValue | typeof Prisma.JsonNull,
      status: "DRAFT",
      internalNotes: src.internalNotes,
      tags: src.tags,
      createdById: ctx.userId,
    },
    select: { id: true },
  });
  await logPlatformAudit({
    userId: ctx.userId,
    action: "platform.pricing_formula_duplicated",
    entityType: "PricingFormula",
    entityId: dup.id,
    metadata: { actor: ctx.email, sourceId: formulaId, slug },
  });
  revalidatePath(ROUTE);
  redirect(`${ROUTE}/${dup.id}?ok=duplicated`);
}
