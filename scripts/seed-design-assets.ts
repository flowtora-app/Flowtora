// Page 30 — seed sample Design Assets — one per kind. Idempotent.

import { db } from "@/lib/db";
import type { Prisma } from "@prisma/client";

async function pickAdminId(): Promise<string> {
  const admin = await db.user.findFirst({
    where: { platformRole: { in: ["SUPER_ADMIN", "ADMIN", "SITE_MANAGER", "BILLING_MANAGER"] } },
    orderBy: { createdAt: "asc" },
    select: { id: true, email: true },
  });
  if (!admin) throw new Error("No platform admin user found");
  console.log(`  using admin: ${admin.email}`);
  return admin.id;
}

async function seed(adminId: string) {
  const existing = await db.designAsset.count();
  if (existing > 0) {
    console.log(`  Already have ${existing} assets — skipping.`);
    return;
  }
  const seeds = [
    {
      slug: "inter-variable",
      name: "Inter (variable)",
      kind: "FONT" as const,
      description: "Open-source variable font designed for screens. 18 weights, OpenType features.",
      format: "OTF",
      sizeBytes: 320_000,
      fileUrl: "https://rsms.me/inter/inter.zip",
      thumbnailUrl: "https://images.unsplash.com/photo-1519331379826-f10be5486c6f?w=480&h=360&fit=crop",
      license: "CC0" as const,
      licenseAttribution: "Inter by Rasmus Andersson — SIL Open Font License",
      licenseUrl: "https://github.com/rsms/inter/blob/master/LICENSE.txt",
      metadata: { glyphs: 2300, weights: 9, axes: ["wght", "slnt"] } as Prisma.InputJsonValue,
      tags: ["sans-serif", "variable", "screen", "popular"],
    },
    {
      slug: "feather-icons-pack",
      name: "Feather Icons (full pack)",
      kind: "ICON" as const,
      description: "Simply beautiful open-source icons. 287 SVGs, 24×24 stroke style.",
      format: "SVG",
      sizeBytes: 84_000,
      fileUrl: "https://github.com/feathericons/feather/archive/refs/heads/main.zip",
      thumbnailUrl: "https://images.unsplash.com/photo-1635373670332-43ea883bb081?w=480&h=360&fit=crop",
      license: "CC_BY" as const,
      licenseAttribution: "Feather Icons — MIT License",
      licenseUrl: "https://github.com/feathericons/feather/blob/main/LICENSE",
      metadata: { count: 287, viewBox: "24x24" } as Prisma.InputJsonValue,
      tags: ["icon-set", "stroke", "minimal"],
    },
    {
      slug: "tshirt-front-mockup-v1",
      name: "T-shirt Front Mockup",
      kind: "MOCKUP" as const,
      description: "PSD mockup for apparel previews — placeable artwork layer at 14×16in.",
      format: "PSD",
      sizeBytes: 18_500_000,
      fileUrl: "https://example.com/mockups/tshirt-front.psd",
      thumbnailUrl: "https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?w=480&h=360&fit=crop",
      license: "COMMERCIAL" as const,
      licenseAttribution: "Licensed via Mockup Marketplace — single-shop license",
      metadata: { dimensions: "3000×2000", artworkArea: "14x16in" } as Prisma.InputJsonValue,
      allowedPlanSlugs: ["professional", "enterprise"],
      tags: ["apparel", "mockup", "tshirt"],
    },
    {
      slug: "ocean-breeze-palette",
      name: "Ocean Breeze",
      kind: "PALETTE" as const,
      description: "Cool blues + accent corals. Works for coastal / hospitality brands.",
      paletteColors: ["#1B4965", "#62B6CB", "#BEE9E8", "#CAE9FF", "#FF6B6B"],
      license: "CC0" as const,
      tags: ["coastal", "cool", "popular"],
    },
    {
      slug: "geo-tile-pattern",
      name: "Geometric Tile Pattern",
      kind: "PATTERN" as const,
      description: "Seamless geometric tile — 800×800 SVG, scales to any size.",
      format: "SVG",
      sizeBytes: 12_000,
      fileUrl: "https://example.com/patterns/geo-tile.svg",
      thumbnailUrl: "https://images.unsplash.com/photo-1523475472560-d2df97ec485c?w=480&h=360&fit=crop",
      license: "CC_BY_SA" as const,
      licenseAttribution: "Adapted from Hero Patterns — CC-BY-SA 4.0",
      licenseUrl: "https://heropatterns.com",
      tags: ["seamless", "geometric", "background"],
    },
    {
      slug: "stock-coffee-shop-photo",
      name: "Coffee Shop Storefront",
      kind: "PHOTO" as const,
      description: "High-resolution storefront photo — useful for hospitality + retail mockups.",
      format: "JPG",
      sizeBytes: 4_200_000,
      thumbnailUrl: "https://images.unsplash.com/photo-1559925393-8be0ec4767c8?w=480&h=360&fit=crop",
      fileUrl: "https://images.unsplash.com/photo-1559925393-8be0ec4767c8",
      license: "COMMERCIAL" as const,
      licenseAttribution: "Photo by demo · Unsplash License (commercial use OK)",
      licenseUrl: "https://unsplash.com/license",
      metadata: { width: 4000, height: 2667 } as Prisma.InputJsonValue,
      tags: ["lifestyle", "retail", "popular"],
    },
    {
      slug: "tri-fold-brochure-template",
      name: "Tri-Fold Brochure Template",
      kind: "TEMPLATE" as const,
      description: "Editable Adobe Illustrator template — print-ready, US Letter folded.",
      format: "AI",
      sizeBytes: 6_800_000,
      fileUrl: "https://example.com/templates/tri-fold.ai",
      thumbnailUrl: "https://images.unsplash.com/photo-1572502736569-90c64a4b1d65?w=480&h=360&fit=crop",
      license: "PROPRIETARY" as const,
      licenseAttribution: "Created in-house for Flowtora tenants — single-shop use only.",
      metadata: { dimensions: "11x8.5", bleed: "0.125in" } as Prisma.InputJsonValue,
      allowedPlanSlugs: ["enterprise"],
      tags: ["brochure", "print", "template"],
    },
  ];

  for (const a of seeds) {
    await db.designAsset.create({
      data: {
        slug: a.slug,
        name: a.name,
        description: "description" in a ? a.description ?? null : null,
        kind: a.kind,
        fileUrl: "fileUrl" in a ? a.fileUrl ?? null : null,
        thumbnailUrl: "thumbnailUrl" in a ? a.thumbnailUrl ?? null : null,
        format: "format" in a ? a.format ?? null : null,
        sizeBytes: "sizeBytes" in a ? a.sizeBytes ?? null : null,
        metadata: "metadata" in a ? (a.metadata ?? undefined) : undefined,
        paletteColors: "paletteColors" in a ? a.paletteColors ?? [] : [],
        license: a.license,
        licenseAttribution: "licenseAttribution" in a ? a.licenseAttribution ?? null : null,
        licenseUrl: "licenseUrl" in a ? a.licenseUrl ?? null : null,
        allowedPlanSlugs: "allowedPlanSlugs" in a ? a.allowedPlanSlugs ?? [] : [],
        tags: a.tags ?? [],
        status: "ACTIVE",
        createdById: adminId,
      },
    });
    console.log(`  ✓ ${a.slug} (${a.kind})`);
  }
}

async function summary() {
  const count = await db.designAsset.count();
  console.log(`\n── Summary ──\n  design assets: ${count}`);
}

async function main() {
  const adminId = await pickAdminId();
  await seed(adminId);
  await summary();
  await db.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
