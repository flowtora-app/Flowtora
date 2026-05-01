// Platform-admin invitations data layer — Page 12 of the admin spec.

import { db } from "@/lib/db";
import { Prisma } from "@prisma/client";
import type {
  PlatformInviteStatus,
  PlatformRole,
} from "@prisma/client";

const DAY = 86_400_000;

/* ────────────────────────────────────────────────────────── */
/* Filters + list                                             */
/* ────────────────────────────────────────────────────────── */

export interface InvitesFilters {
  status?: PlatformInviteStatus;
  role?: PlatformRole;
  /** Search by invitee email substring. */
  q?: string;
  since?: Date;
  until?: Date;
}

export interface InviteRow {
  id: string;
  email: string;
  platformRole: PlatformRole;
  customRoleName: string | null;
  customRoleKey: string | null;
  teamNames: string[];
  invitedByName: string | null;
  invitedByEmail: string;
  createdAt: Date;
  expiresAt: Date;
  status: PlatformInviteStatus;
  openedAt: Date | null;
  acceptedAt: Date | null;
  revokedAt: Date | null;
  resendCount: number;
  lastResentAt: Date | null;
  mfaRequired: boolean;
  token: string;
}

export async function loadInvitesList(filters: InvitesFilters): Promise<InviteRow[]> {
  const where: Prisma.PlatformInviteWhereInput = {};
  if (filters.status) where.status = filters.status;
  if (filters.role)   where.platformRole = filters.role;
  if (filters.q)      where.email = { contains: filters.q.trim(), mode: "insensitive" };
  if (filters.since || filters.until) {
    const createdAt: Prisma.DateTimeFilter = {};
    if (filters.since) createdAt.gte = filters.since;
    if (filters.until) createdAt.lte = filters.until;
    where.createdAt = createdAt;
  }
  const rows = await db.platformInvite.findMany({
    where,
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
    take: 500,
    include: {
      customRole: { select: { id: true, name: true, key: true } },
      invitedBy:  { select: { name: true, email: true } },
    },
  });

  // Resolve team names in bulk.
  const teamIds = Array.from(new Set(rows.flatMap((r) => r.teamIds)));
  const teams = teamIds.length === 0 ? [] : await db.platformTeam.findMany({
    where: { id: { in: teamIds } },
    select: { id: true, name: true },
  });
  const teamMap = new Map(teams.map((t) => [t.id, t.name]));

  return rows.map((r) => ({
    id: r.id, email: r.email,
    platformRole: r.platformRole,
    customRoleName: r.customRole?.name ?? null,
    customRoleKey: r.customRole?.key ?? null,
    teamNames: r.teamIds.map((id) => teamMap.get(id) ?? id),
    invitedByName: r.invitedBy.name,
    invitedByEmail: r.invitedBy.email,
    createdAt: r.createdAt, expiresAt: r.expiresAt,
    status: r.status,
    openedAt: r.openedAt, acceptedAt: r.acceptedAt, revokedAt: r.revokedAt,
    resendCount: r.resendCount, lastResentAt: r.lastResentAt,
    mfaRequired: r.mfaRequired,
    token: r.token,
  }));
}

/* ────────────────────────────────────────────────────────── */
/* KPIs                                                        */
/* ────────────────────────────────────────────────────────── */

export interface InvitesKpi {
  pending: number;
  acceptedLast30d: number;
  expired: number;
  revoked: number;
}

export async function loadInvitesKpi(): Promise<InvitesKpi> {
  const since30 = new Date(Date.now() - 30 * DAY);
  const [pending, acceptedLast30d, expired, revoked] = await Promise.all([
    db.platformInvite.count({ where: { status: { in: ["SENT", "OPENED"] } } }),
    db.platformInvite.count({ where: { status: "ACCEPTED", acceptedAt: { gte: since30 } } }),
    db.platformInvite.count({ where: { status: "EXPIRED" } }),
    db.platformInvite.count({ where: { status: "REVOKED" } }),
  ]);
  return { pending, acceptedLast30d, expired, revoked };
}

/* ────────────────────────────────────────────────────────── */
/* Single-invite landing (public accept page reads this)      */
/* ────────────────────────────────────────────────────────── */

export interface InviteLanding {
  id: string;
  email: string;
  platformRole: PlatformRole;
  customRoleName: string | null;
  teamNames: string[];
  customMessage: string | null;
  mfaRequired: boolean;
  expiresAt: Date;
  status: PlatformInviteStatus;
  invitedByName: string | null;
  invitedByEmail: string;
}

export async function loadInviteLanding(token: string): Promise<InviteLanding | null> {
  const r = await db.platformInvite.findUnique({
    where: { token },
    include: {
      customRole: { select: { name: true } },
      invitedBy:  { select: { name: true, email: true } },
    },
  });
  if (!r) return null;
  const teams = r.teamIds.length === 0 ? [] : await db.platformTeam.findMany({
    where: { id: { in: r.teamIds } },
    select: { name: true },
  });
  return {
    id: r.id, email: r.email,
    platformRole: r.platformRole,
    customRoleName: r.customRole?.name ?? null,
    teamNames: teams.map((t) => t.name),
    customMessage: r.customMessage,
    mfaRequired: r.mfaRequired,
    expiresAt: r.expiresAt,
    status: r.status,
    invitedByName: r.invitedBy.name,
    invitedByEmail: r.invitedBy.email,
  };
}
