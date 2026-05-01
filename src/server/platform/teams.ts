// Platform Teams data layer — Page 11 of the admin spec.
//
// Five tabs: Members, Permissions, On-call, Activity, Settings. Most
// data is small enough to load eagerly per-request; the on-call
// calendar pulls a 4-week window by default and lets the client page
// forward.

import { db } from "@/lib/db";
import type {
  OnCallLevel,
  PlatformTeamMemberRole,
} from "@prisma/client";

const DAY = 86_400_000;

/* ────────────────────────────────────────────────────────── */
/* List + KPIs                                                */
/* ────────────────────────────────────────────────────────── */

export interface TeamRow {
  id: string;
  name: string;
  key: string;
  description: string | null;
  color: string | null;
  memberCount: number;
  inheritedRoleKeys: string[];
  hasOnCall: boolean;
  /** Currently-on-call user — null if no shift covers `now`. */
  currentOnCall: { userId: string; name: string | null; email: string } | null;
  createdAt: Date;
  archivedAt: Date | null;
}

export async function loadTeamsList(): Promise<TeamRow[]> {
  const now = new Date();
  const rows = await db.platformTeam.findMany({
    where: { archivedAt: null },
    orderBy: { name: "asc" },
    include: {
      _count: { select: { members: true, shifts: true } },
      shifts: {
        where: { startsAt: { lte: now }, endsAt: { gte: now }, level: "PRIMARY" },
        orderBy: { startsAt: "desc" },
        take: 1,
        select: {
          userId: true,
          user: { select: { id: true, name: true, email: true } },
        },
      },
    },
  });
  return rows.map((r) => ({
    id: r.id, name: r.name, key: r.key, description: r.description, color: r.color,
    memberCount: r._count.members,
    inheritedRoleKeys: r.inheritedRoleKeys,
    hasOnCall: r._count.shifts > 0,
    currentOnCall: r.shifts[0]
      ? { userId: r.shifts[0].userId, name: r.shifts[0].user.name, email: r.shifts[0].user.email }
      : null,
    createdAt: r.createdAt,
    archivedAt: r.archivedAt,
  }));
}

export interface TeamsKpi {
  total: number;
  withOnCall: number;
  totalMembers: number;
  shiftsNext7d: number;
}

export async function loadTeamsKpi(): Promise<TeamsKpi> {
  const since = new Date();
  const until = new Date(since.getTime() + 7 * DAY);
  const [total, totalMembers, shiftsNext7d, oncallTeams] = await Promise.all([
    db.platformTeam.count({ where: { archivedAt: null } }),
    db.platformTeamMember.count(),
    db.onCallShift.count({ where: { startsAt: { lte: until }, endsAt: { gte: since } } }),
    db.platformTeam.count({
      where: { archivedAt: null, shifts: { some: {} } },
    }),
  ]);
  return { total, withOnCall: oncallTeams, totalMembers, shiftsNext7d };
}

/* ────────────────────────────────────────────────────────── */
/* Detail loaders (per tab)                                    */
/* ────────────────────────────────────────────────────────── */

export interface TeamDetail {
  id: string;
  name: string;
  key: string;
  description: string | null;
  color: string | null;
  slackChannel: string | null;
  emailDistro: string | null;
  notifySlack: boolean;
  notifyPagerDuty: boolean;
  notifySms: boolean;
  inheritedRoleKeys: string[];
  createdAt: Date;
  updatedAt: Date;
  archivedAt: Date | null;
}

export async function loadTeamDetail(id: string): Promise<TeamDetail | null> {
  const r = await db.platformTeam.findUnique({ where: { id } });
  if (!r) return null;
  return {
    id: r.id, name: r.name, key: r.key, description: r.description,
    color: r.color, slackChannel: r.slackChannel, emailDistro: r.emailDistro,
    notifySlack: r.notifySlack, notifyPagerDuty: r.notifyPagerDuty, notifySms: r.notifySms,
    inheritedRoleKeys: r.inheritedRoleKeys,
    createdAt: r.createdAt, updatedAt: r.updatedAt, archivedAt: r.archivedAt,
  };
}

export interface TeamMemberRow {
  id: string;
  userId: string;
  role: PlatformTeamMemberRole;
  joinedAt: Date;
  user: { id: string; name: string | null; email: string; image: string | null };
}

export async function loadTeamMembers(teamId: string): Promise<TeamMemberRow[]> {
  const rows = await db.platformTeamMember.findMany({
    where: { teamId },
    orderBy: [{ role: "asc" }, { joinedAt: "asc" }],
    include: {
      user: { select: { id: true, name: true, email: true, image: true } },
    },
  });
  return rows.map((r) => ({
    id: r.id, userId: r.userId, role: r.role, joinedAt: r.joinedAt,
    user: r.user,
  }));
}

export interface OnCallShiftRow {
  id: string;
  level: OnCallLevel;
  userId: string;
  user: { id: string; name: string | null; email: string };
  startsAt: Date;
  endsAt: Date;
  isOverride: boolean;
  notes: string | null;
}

export async function loadTeamShifts(
  teamId: string,
  windowStart: Date,
  windowEnd: Date,
): Promise<OnCallShiftRow[]> {
  const rows = await db.onCallShift.findMany({
    where: {
      teamId,
      // Any shift that overlaps the window.
      startsAt: { lte: windowEnd },
      endsAt: { gte: windowStart },
    },
    orderBy: { startsAt: "asc" },
    include: { user: { select: { id: true, name: true, email: true } } },
  });
  return rows.map((r) => ({
    id: r.id, level: r.level, userId: r.userId, user: r.user,
    startsAt: r.startsAt, endsAt: r.endsAt,
    isOverride: r.isOverride, notes: r.notes,
  }));
}

export interface TeamActivityRow {
  id: string;
  action: string;
  entityType: string | null;
  entityId: string | null;
  tenantId: string | null;
  tenantName: string | null;
  userId: string | null;
  userEmail: string | null;
  createdAt: Date;
}

/** Activity scoped to the team's member set — we don't tag audit
 *  rows with teamId today, so this is "any action authored by a
 *  member of this team". Honest approximation. */
export async function loadTeamActivity(teamId: string, take = 100): Promise<TeamActivityRow[]> {
  const members = await db.platformTeamMember.findMany({
    where: { teamId },
    select: { userId: true },
  });
  if (members.length === 0) return [];
  const rows = await db.auditLog.findMany({
    where: { userId: { in: members.map((m) => m.userId) } },
    orderBy: { createdAt: "desc" },
    take,
    select: {
      id: true, action: true, entityType: true, entityId: true,
      userId: true, tenantId: true, createdAt: true,
      tenant: { select: { name: true } },
    },
  });
  // Resolve user emails in bulk.
  const userIds = Array.from(new Set(rows.map((r) => r.userId).filter((x): x is string => !!x)));
  const users = userIds.length === 0 ? [] : await db.user.findMany({
    where: { id: { in: userIds } },
    select: { id: true, email: true },
  });
  const map = new Map(users.map((u) => [u.id, u.email]));
  return rows.map((r) => ({
    id: r.id, action: r.action, entityType: r.entityType, entityId: r.entityId,
    tenantId: r.tenantId, tenantName: r.tenant?.name ?? null,
    userId: r.userId, userEmail: r.userId ? map.get(r.userId) ?? null : null,
    createdAt: r.createdAt,
  }));
}

export interface CurrentOnCall {
  level: OnCallLevel;
  userId: string;
  name: string | null;
  email: string;
  endsAt: Date;
}

export async function loadCurrentOnCall(teamId: string): Promise<CurrentOnCall[]> {
  const now = new Date();
  const rows = await db.onCallShift.findMany({
    where: { teamId, startsAt: { lte: now }, endsAt: { gte: now } },
    orderBy: { level: "asc" },
    include: { user: { select: { id: true, name: true, email: true } } },
  });
  return rows.map((r) => ({
    level: r.level,
    userId: r.userId,
    name: r.user.name,
    email: r.user.email,
    endsAt: r.endsAt,
  }));
}
