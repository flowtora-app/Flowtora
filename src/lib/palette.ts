import { db } from "@/lib/db";

// Phase 3 — server-side palette helpers.
//
// Thin read layer for the ⌘K palette's "Pinned" section. The actions
// live in src/app/actions/palette.ts. Kept separate so server
// components can import this without the "use server" sidecar.

export type PalettePinRecord = {
  id: string;
  entityKind: string;
  entityId: string;
  label: string;
  sub: string | null;
  href: string;
};

/**
 * Load up to `limit` pins for (userId, tenantId), newest first. Called
 * from the tenant layout and passed through into the palette.
 */
export async function loadPalettePins(
  userId: string,
  tenantId: string,
  limit = 10,
): Promise<PalettePinRecord[]> {
  const rows = await db.palettePin.findMany({
    where: { userId, tenantId },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }],
    take: limit,
    select: {
      id: true,
      entityKind: true,
      entityId: true,
      label: true,
      sub: true,
      href: true,
    },
  });
  return rows;
}

/**
 * Quick existence check for a specific record — used by detail-page
 * "Pin" buttons to decide which icon to render without over-fetching.
 */
export async function isPinned(
  userId: string,
  tenantId: string,
  entityKind: string,
  entityId: string,
): Promise<boolean> {
  const row = await db.palettePin.findUnique({
    where: {
      userId_tenantId_entityKind_entityId: {
        userId,
        tenantId,
        entityKind,
        entityId,
      },
    },
    select: { id: true },
  });
  return !!row;
}
