// Sessions & Devices data layer — Page 13.
//
// Visibility into platform-admin sessions. NextAuth's default schema
// stores Session rows for the database strategy; JWT-strategy paths
// bypass this table, so the page surfaces only what we have +
// honestly notes the shortfall.

import { db } from "@/lib/db";
import { Prisma } from "@prisma/client";

const DAY = 86_400_000;

/* ────────────────────────────────────────────────────────── */
/* Filters + list                                             */
/* ────────────────────────────────────────────────────────── */

export interface SessionsFilters {
  adminId?: string;
  deviceType?: string;
  browser?: string;
  os?: string;
  ip?: string;
  country?: string;
  /** Last-active since cutoff. */
  lastActiveSince?: Date;
  /** Last-active until cutoff. */
  lastActiveUntil?: Date;
  mfa?: "any" | "totp" | "webauthn" | "sms" | "none";
}

export interface SessionRow {
  id: string;
  expires: Date;
  startedAt: Date;
  lastActiveAt: Date | null;
  ipAddress: string | null;
  country: string | null;
  city: string | null;
  deviceType: string | null;
  browserName: string | null;
  browserVersion: string | null;
  osName: string | null;
  osVersion: string | null;
  userAgent: string | null;
  mfaMethod: string | null;
  forceMfaPromptAt: Date | null;
  isBlockedIp: boolean;
  admin: { id: string; name: string | null; email: string; image: string | null };
}

export async function loadSessionsList(filters: SessionsFilters): Promise<SessionRow[]> {
  const now = new Date();
  const where: Prisma.SessionWhereInput = { expires: { gt: now } };
  if (filters.adminId) where.userId = filters.adminId;
  if (filters.deviceType) where.deviceType = filters.deviceType;
  if (filters.browser) where.browserName = filters.browser;
  if (filters.os) where.osName = filters.os;
  if (filters.ip) where.ipAddress = filters.ip;
  if (filters.country) where.country = filters.country.toUpperCase();
  if (filters.lastActiveSince || filters.lastActiveUntil) {
    const lastActiveAt: Prisma.DateTimeNullableFilter = {};
    if (filters.lastActiveSince) lastActiveAt.gte = filters.lastActiveSince;
    if (filters.lastActiveUntil) lastActiveAt.lte = filters.lastActiveUntil;
    where.lastActiveAt = lastActiveAt;
  }
  if (filters.mfa && filters.mfa !== "any") {
    if (filters.mfa === "none") where.mfaMethod = null;
    else where.mfaMethod = filters.mfa;
  }

  // Filter to platform staff only (sessions belonging to users with
  // a non-null platformRole). End-user sessions live in the same
  // table but the admin surface only cares about staff.
  where.user = { OR: [
    { platformRole: { not: null } },
    { customPlatformRoleId: { not: null } },
  ] };

  const rows = await db.session.findMany({
    where,
    orderBy: [{ lastActiveAt: "desc" }, { startedAt: "desc" }],
    take: 500,
    include: {
      user: { select: { id: true, name: true, email: true, image: true } },
    },
  });

  // Cross-check IPs against the platform blocklist.
  const ips = Array.from(new Set(rows.map((r) => r.ipAddress).filter((x): x is string => !!x)));
  const blocked = ips.length === 0 ? [] : await db.platformIpBlock.findMany({
    where: { cidr: { in: ips } },
    select: { cidr: true },
  });
  const blockedSet = new Set(blocked.map((b) => b.cidr));

  return rows.map((r) => ({
    id: r.id, expires: r.expires,
    startedAt: r.startedAt, lastActiveAt: r.lastActiveAt,
    ipAddress: r.ipAddress, country: r.country, city: r.city,
    deviceType: r.deviceType,
    browserName: r.browserName, browserVersion: r.browserVersion,
    osName: r.osName, osVersion: r.osVersion,
    userAgent: r.userAgent,
    mfaMethod: r.mfaMethod, forceMfaPromptAt: r.forceMfaPromptAt,
    isBlockedIp: r.ipAddress ? blockedSet.has(r.ipAddress) : false,
    admin: r.user,
  }));
}

/* ────────────────────────────────────────────────────────── */
/* KPIs                                                        */
/* ────────────────────────────────────────────────────────── */

export interface SessionsKpi {
  active: number;
  uniqueAdmins: number;
  /** Sessions whose IP is in the platform blocklist. */
  suspicious: number;
  withMfa: number;
}

export async function loadSessionsKpi(): Promise<SessionsKpi> {
  const now = new Date();
  const where: Prisma.SessionWhereInput = {
    expires: { gt: now },
    user: { OR: [
      { platformRole: { not: null } },
      { customPlatformRoleId: { not: null } },
    ] },
  };
  const [active, sessions] = await Promise.all([
    db.session.count({ where }),
    db.session.findMany({ where, select: { userId: true, ipAddress: true, mfaMethod: true } }),
  ]);
  const uniqueAdmins = new Set(sessions.map((s) => s.userId)).size;
  const ipsInUse = Array.from(new Set(sessions.map((s) => s.ipAddress).filter((x): x is string => !!x)));
  const blocked = ipsInUse.length === 0 ? [] : await db.platformIpBlock.findMany({
    where: { cidr: { in: ipsInUse } },
    select: { cidr: true },
  });
  const blockedSet = new Set(blocked.map((b) => b.cidr));
  const suspicious = sessions.filter((s) => s.ipAddress && blockedSet.has(s.ipAddress)).length;
  const withMfa = sessions.filter((s) => !!s.mfaMethod).length;
  return { active, uniqueAdmins, suspicious, withMfa };
}

/* ────────────────────────────────────────────────────────── */
/* Map widget data                                             */
/* ────────────────────────────────────────────────────────── */

export interface MapBubble {
  country: string;
  count: number;
}

export async function loadSessionsMap(): Promise<MapBubble[]> {
  const now = new Date();
  const rows = await db.session.groupBy({
    by: ["country"],
    where: {
      expires: { gt: now },
      country: { not: null },
      user: { OR: [
        { platformRole: { not: null } },
        { customPlatformRoleId: { not: null } },
      ] },
    },
    _count: { _all: true },
    orderBy: { _count: { country: "desc" } },
  });
  return rows.map((r) => ({ country: r.country!, count: r._count._all }));
}

/* ────────────────────────────────────────────────────────── */
/* IP block list                                              */
/* ────────────────────────────────────────────────────────── */

export interface IpBlockRow {
  id: string;
  cidr: string;
  reason: string | null;
  expiresAt: Date | null;
  triggeredCount: number;
  lastTriggeredAt: Date | null;
  createdAt: Date;
  createdBy: string;
}

export async function loadIpBlocks(): Promise<IpBlockRow[]> {
  return db.platformIpBlock.findMany({
    orderBy: { createdAt: "desc" },
    take: 500,
  });
}

/* ────────────────────────────────────────────────────────── */
/* Distinct option pools (for filter dropdowns)               */
/* ────────────────────────────────────────────────────────── */

export interface SessionFilterOptions {
  admins: { id: string; label: string }[];
  countries: string[];
  browsers: string[];
  oses: string[];
  deviceTypes: string[];
}

export async function loadSessionFilterOptions(): Promise<SessionFilterOptions> {
  const [admins, distincts] = await Promise.all([
    db.user.findMany({
      where: {
        OR: [{ platformRole: { not: null } }, { customPlatformRoleId: { not: null } }],
      },
      orderBy: { email: "asc" },
      select: { id: true, name: true, email: true },
      take: 200,
    }),
    db.session.findMany({
      where: {
        expires: { gt: new Date() },
        user: { OR: [
          { platformRole: { not: null } },
          { customPlatformRoleId: { not: null } },
        ] },
      },
      select: { country: true, browserName: true, osName: true, deviceType: true },
      take: 5_000,
    }),
  ]);
  const countries = Array.from(new Set(distincts.map((s) => s.country).filter((x): x is string => !!x))).sort();
  const browsers  = Array.from(new Set(distincts.map((s) => s.browserName).filter((x): x is string => !!x))).sort();
  const oses      = Array.from(new Set(distincts.map((s) => s.osName).filter((x): x is string => !!x))).sort();
  const deviceTypes = Array.from(new Set(distincts.map((s) => s.deviceType).filter((x): x is string => !!x))).sort();
  return {
    admins: admins.map((u) => ({ id: u.id, label: u.name?.trim() || u.email })),
    countries, browsers, oses, deviceTypes,
  };
}

void DAY;
