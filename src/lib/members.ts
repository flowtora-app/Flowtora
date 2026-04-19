import { db } from "@/lib/db";

export async function listActiveMembers(tenantId: string) {
  const memberships = await db.membership.findMany({
    where: { tenantId, status: "ACTIVE" },
    include: { user: true },
    orderBy: { user: { name: "asc" } },
  });
  return memberships.map((m) => ({
    userId: m.userId,
    name: m.user.name ?? m.user.email,
    email: m.user.email,
  }));
}

export async function memberLookup(tenantId: string) {
  const members = await listActiveMembers(tenantId);
  return new Map(members.map((m) => [m.userId, m] as const));
}
