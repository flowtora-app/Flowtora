// GET /api/platform/staff-options
//
// Returns a lightweight option list of platform staff users for
// combobox / Select components — used by the bulk Assign-CSM modal
// and the Account-manager filter chip.

import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requirePlatformStaff } from "@/lib/platform";

export const dynamic = "force-dynamic";

export async function GET() {
  await requirePlatformStaff();
  const users = await db.user.findMany({
    where: { OR: [{ platformRole: { not: null } }, { customPlatformRoleId: { not: null } }] },
    orderBy: { email: "asc" },
    select: { id: true, name: true, email: true },
    take: 200,
  });
  const options = users.map((u) => ({
    id: u.id,
    label: u.name && u.name.trim() !== "" ? `${u.name} (${u.email})` : u.email,
  }));
  return NextResponse.json({ options });
}
