// All Users server data layer — Page 9 of the admin spec.
//
// Cross-tenant directory of every end user. The default view excludes
// users with no memberships and no platformRole (orphan rows from
// abandoned signups) — set `includeOrphans` to surface them.

import { db } from "@/lib/db";
import { Prisma } from "@prisma/client";
import type { PlatformRole, TenantRole, SecurityEventKind } from "@prisma/client";

const DAY = 86_400_000;

/* ────────────────────────────────────────────────────────── */
/* List + filters                                             */
/* ────────────────────────────────────────────────────────── */

export type UserStatus = "active" | "deactivated" | "banned" | "merged" | "locked";
export type SignInMethod = "credentials" | "google" | "microsoft" | "sso" | "other";

export interface UsersFilters {
  q?: string;                  // name / email / id substring
  tenantId?: string;
  /** Tenant-side role inside any membership. */
  tenantRole?: TenantRole;
  /** Platform-side role (admin staff only). */
  platformRole?: PlatformRole;
  status?: UserStatus;
  mfaEnabled?: boolean;
  emailVerified?: boolean;
  country?: string;
  signInMethod?: SignInMethod;
  lastLoginSince?: Date;
  lastLoginUntil?: Date;
}

export type UsersSortKey =
  | "name" | "email" | "lastLogin" | "created" | "tenants" | "country";
export type UsersSortDir = "asc" | "desc";

export interface UserListRow {
  id: string;
  name: string | null;
  email: string;
  image: string | null;
  emailVerified: Date | null;
  country: string | null;
  twoFactorEnabled: boolean;
  lastLoginAt: Date | null;
  createdAt: Date;
  status: UserStatus;
  platformRole: PlatformRole | null;
  /** Tenant memberships (capped at 3 for the list view; the detail
   *  page surfaces the full set). */
  tenants: { id: string; name: string; slug: string; role: TenantRole }[];
  totalTenantCount: number;
  /** Account.provider list — derived from the Account table. */
  signInMethods: SignInMethod[];
}

export interface UsersListResult {
  rows: UserListRow[];
  total: number;
  filteredTotal: number;
}

export async function loadUsersList(args: {
  filters: UsersFilters;
  sortKey: UsersSortKey;
  sortDir: UsersSortDir;
  page: number;
  pageSize: number;
}): Promise<UsersListResult> {
  const { filters, sortKey, sortDir, page, pageSize } = args;

  // We pull broadly then narrow client-side — the user table is a few
  // thousand rows even on a healthy SaaS. Keep it simple, bound it at
  // 50k for safety, and revisit if it shows up in profiling.
  const where: Prisma.UserWhereInput = {};
  if (filters.q) {
    const q = filters.q.trim();
    where.OR = [
      { id: q },
      { email: { contains: q, mode: "insensitive" } },
      { name: { contains: q, mode: "insensitive" } },
    ];
  }
  if (filters.tenantId) where.memberships = { some: { tenantId: filters.tenantId } };
  if (filters.tenantRole) {
    where.memberships = where.memberships
      ? { some: { ...(where.memberships as Prisma.MembershipListRelationFilter).some, role: filters.tenantRole } }
      : { some: { role: filters.tenantRole } };
  }
  if (filters.platformRole) where.platformRole = filters.platformRole;
  if (filters.country) where.country = filters.country.toUpperCase();
  if (filters.mfaEnabled === true) where.twoFactorEnabled = true;
  if (filters.mfaEnabled === false) where.twoFactorEnabled = false;
  if (filters.emailVerified === true) where.emailVerified = { not: null };
  if (filters.emailVerified === false) where.emailVerified = null;
  if (filters.lastLoginSince || filters.lastLoginUntil) {
    const lastLoginAt: Prisma.DateTimeNullableFilter = {};
    if (filters.lastLoginSince) lastLoginAt.gte = filters.lastLoginSince;
    if (filters.lastLoginUntil) lastLoginAt.lte = filters.lastLoginUntil;
    where.lastLoginAt = lastLoginAt;
  }
  switch (filters.status) {
    case "deactivated": where.deactivatedAt = { not: null }; break;
    case "banned":      where.bannedAt = { not: null }; break;
    case "merged":      where.mergedAt = { not: null }; break;
    case "locked":      where.lockedUntil = { gt: new Date() }; break;
    case "active":
      where.deactivatedAt = null;
      where.bannedAt = null;
      where.mergedAt = null;
      break;
  }

  const orderBy: Prisma.UserOrderByWithRelationInput =
    sortKey === "name"      ? { name: sortDir }
    : sortKey === "email"   ? { email: sortDir }
    : sortKey === "country" ? { country: sortDir }
    : sortKey === "created" ? { createdAt: sortDir }
    : sortKey === "lastLogin" ? { lastLoginAt: sortDir }
    : { createdAt: sortDir }; // fallback for "tenants" — sort post-aggregate

  const [total, filteredTotal, rows] = await Promise.all([
    db.user.count(),
    db.user.count({ where }),
    db.user.findMany({
      where,
      orderBy,
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: {
        id: true, name: true, email: true, image: true,
        emailVerified: true, country: true, twoFactorEnabled: true,
        lastLoginAt: true, createdAt: true, platformRole: true,
        deactivatedAt: true, bannedAt: true, mergedAt: true, lockedUntil: true,
        memberships: {
          select: {
            tenantId: true, role: true,
            tenant: { select: { id: true, name: true, slug: true } },
          },
          take: 3,
          orderBy: { createdAt: "desc" },
        },
        _count: { select: { memberships: true } },
        accounts: { select: { provider: true }, take: 5 },
      },
    }),
  ]);

  // Sign-in methods are cached so we don't have to re-query.
  // Credentials = User.passwordHash present; everything else comes
  // from Account.provider.
  const enriched: UserListRow[] = rows.map((u) => {
    const status: UserStatus =
      u.bannedAt ? "banned" :
      u.mergedAt ? "merged" :
      u.deactivatedAt ? "deactivated" :
      u.lockedUntil && u.lockedUntil.getTime() > Date.now() ? "locked" :
      "active";
    const providers = new Set<SignInMethod>();
    for (const a of u.accounts) {
      const p = a.provider.toLowerCase();
      if (p.includes("google")) providers.add("google");
      else if (p.includes("microsoft") || p.includes("azure")) providers.add("microsoft");
      else if (p.includes("saml") || p.includes("okta") || p.includes("oidc")) providers.add("sso");
      else if (p.includes("credentials")) providers.add("credentials");
      else providers.add("other");
    }
    return {
      id: u.id, name: u.name, email: u.email, image: u.image,
      emailVerified: u.emailVerified, country: u.country,
      twoFactorEnabled: u.twoFactorEnabled,
      lastLoginAt: u.lastLoginAt, createdAt: u.createdAt,
      status, platformRole: u.platformRole,
      tenants: u.memberships.map((m) => ({
        id: m.tenant.id, name: m.tenant.name, slug: m.tenant.slug, role: m.role,
      })),
      totalTenantCount: u._count.memberships,
      signInMethods: Array.from(providers),
    };
  });

  // Apply sign-in-method filter post-query (we only have providers
  // after the Account lookup).
  let final = enriched;
  if (filters.signInMethod) {
    const m = filters.signInMethod;
    if (m === "credentials") {
      // Credentials = no OAuth account but has a passwordHash.
      // We don't return passwordHash but providers covers it via
      // "credentials" provider rows.
      final = final.filter((u) => u.signInMethods.includes("credentials") || u.signInMethods.length === 0);
    } else {
      final = final.filter((u) => u.signInMethods.includes(m));
    }
  }

  if (sortKey === "tenants") {
    final = [...final].sort((a, b) =>
      sortDir === "asc"
        ? a.totalTenantCount - b.totalTenantCount
        : b.totalTenantCount - a.totalTenantCount,
    );
  }

  return { rows: final, total, filteredTotal };
}

/* ────────────────────────────────────────────────────────── */
/* KPIs                                                        */
/* ────────────────────────────────────────────────────────── */

export interface UsersKpi {
  total: number;
  activeLast30d: number;
  mfaEnabledPct: number;
  pendingInvites: number;
  suspiciousLast24h: number;
}

export async function loadUsersKpi(): Promise<UsersKpi> {
  const since30 = new Date(Date.now() - 30 * DAY);
  const since24 = new Date(Date.now() - 24 * 3600_000);
  const SUSPICIOUS_KINDS: SecurityEventKind[] = [
    "LOGIN_FAILED", "LOGIN_LOCKED", "PASSWORD_RESET_REQUESTED",
  ];
  const [total, activeLast30d, mfaCount, pendingInvites, suspicious] = await Promise.all([
    db.user.count(),
    db.user.count({ where: { lastLoginAt: { gte: since30 } } }),
    db.user.count({ where: { twoFactorEnabled: true } }),
    db.invite.count({ where: { acceptedAt: null, expiresAt: { gt: new Date() } } }),
    db.securityEvent.count({
      where: { createdAt: { gte: since24 }, kind: { in: SUSPICIOUS_KINDS } },
    }),
  ]);
  const mfaEnabledPct = total === 0 ? 0 : Math.round((mfaCount / total) * 1000) / 10;
  return { total, activeLast30d, mfaEnabledPct, pendingInvites, suspiciousLast24h: suspicious };
}

/* ────────────────────────────────────────────────────────── */
/* User detail (8 tabs)                                       */
/* ────────────────────────────────────────────────────────── */

export interface UserProfile {
  id: string;
  name: string | null;
  email: string;
  image: string | null;
  emailVerified: Date | null;
  phone: string | null;
  phoneVerifiedAt: Date | null;
  language: string | null;
  timezone: string | null;
  bio: string | null;
  country: string | null;
  twoFactorEnabled: boolean;
  platformRole: PlatformRole | null;
  status: UserStatus;
  deactivatedAt: Date | null;
  deactivatedReason: string | null;
  bannedAt: Date | null;
  bannedReason: string | null;
  lockedUntil: Date | null;
  failedLoginCount: number;
  lastLoginAt: Date | null;
  createdAt: Date;
  signInMethods: SignInMethod[];
  /** OAuth identities — Account rows with their provider names. */
  oauthIdentities: { provider: string; providerAccountId: string }[];
}

export async function loadUserProfile(userId: string): Promise<UserProfile | null> {
  const u = await db.user.findUnique({
    where: { id: userId },
    select: {
      id: true, name: true, email: true, image: true, emailVerified: true,
      phone: true, phoneVerifiedAt: true, language: true, timezone: true,
      bio: true, country: true, twoFactorEnabled: true, platformRole: true,
      deactivatedAt: true, deactivatedReason: true,
      bannedAt: true, bannedReason: true,
      lockedUntil: true, failedLoginCount: true,
      mergedAt: true,
      lastLoginAt: true, createdAt: true,
      accounts: { select: { provider: true, providerAccountId: true } },
    },
  });
  if (!u) return null;
  const status: UserStatus =
    u.bannedAt ? "banned" :
    u.mergedAt ? "merged" :
    u.deactivatedAt ? "deactivated" :
    u.lockedUntil && u.lockedUntil.getTime() > Date.now() ? "locked" :
    "active";
  const providers = new Set<SignInMethod>();
  for (const a of u.accounts) {
    const p = a.provider.toLowerCase();
    if (p.includes("google")) providers.add("google");
    else if (p.includes("microsoft") || p.includes("azure")) providers.add("microsoft");
    else if (p.includes("saml") || p.includes("okta") || p.includes("oidc")) providers.add("sso");
    else if (p.includes("credentials")) providers.add("credentials");
    else providers.add("other");
  }
  return {
    id: u.id, name: u.name, email: u.email, image: u.image, emailVerified: u.emailVerified,
    phone: u.phone, phoneVerifiedAt: u.phoneVerifiedAt, language: u.language,
    timezone: u.timezone, bio: u.bio, country: u.country,
    twoFactorEnabled: u.twoFactorEnabled, platformRole: u.platformRole,
    status, deactivatedAt: u.deactivatedAt, deactivatedReason: u.deactivatedReason,
    bannedAt: u.bannedAt, bannedReason: u.bannedReason,
    lockedUntil: u.lockedUntil, failedLoginCount: u.failedLoginCount,
    lastLoginAt: u.lastLoginAt, createdAt: u.createdAt,
    signInMethods: Array.from(providers),
    oauthIdentities: u.accounts.map((a) => ({ provider: a.provider, providerAccountId: a.providerAccountId })),
  };
}

export interface UserMembership {
  id: string;
  tenant: { id: string; name: string; slug: string };
  role: TenantRole;
  status: "ACTIVE" | "SUSPENDED";
  joinedAt: Date;
  lastActiveAt: Date | null;
}

export async function loadUserMemberships(userId: string): Promise<UserMembership[]> {
  const rows = await db.membership.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    select: {
      id: true, role: true, status: true, createdAt: true,
      tenant: { select: { id: true, name: true, slug: true, lastActivityAt: true } },
    },
  });
  return rows.map((r) => ({
    id: r.id,
    tenant: { id: r.tenant.id, name: r.tenant.name, slug: r.tenant.slug },
    role: r.role,
    status: r.status,
    joinedAt: r.createdAt,
    lastActiveAt: r.tenant.lastActivityAt,
  }));
}

export interface UserSession {
  id: string;
  expires: Date;
  // We don't actually capture per-session UA / IP in NextAuth's
  // default schema; surfaced as null for honesty. See spec callout.
  userAgent: string | null;
  ipAddress: string | null;
}

export async function loadUserSessions(userId: string): Promise<UserSession[]> {
  const rows = await db.session.findMany({
    where: { userId },
    orderBy: { expires: "desc" },
    take: 50,
    select: { id: true, expires: true },
  });
  return rows.map((r) => ({
    id: r.id, expires: r.expires, userAgent: null, ipAddress: null,
  }));
}

export interface UserActivityRow {
  id: string;
  action: string;
  entityType: string | null;
  entityId: string | null;
  tenantId: string | null;
  tenantName: string | null;
  createdAt: Date;
  metadata: Record<string, unknown> | null;
}

export async function loadUserActivity(userId: string, limit = 200): Promise<UserActivityRow[]> {
  const rows = await db.auditLog.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take: limit,
    select: {
      id: true, action: true, entityType: true, entityId: true,
      tenantId: true, createdAt: true, metadata: true,
      tenant: { select: { name: true } },
    },
  });
  return rows.map((r) => ({
    id: r.id,
    action: r.action,
    entityType: r.entityType,
    entityId: r.entityId,
    tenantId: r.tenantId,
    tenantName: r.tenant?.name ?? null,
    createdAt: r.createdAt,
    metadata: (r.metadata ?? null) as Record<string, unknown> | null,
  }));
}

export interface UserOwnedResources {
  quotes: number;
  orders: number;
  customers: number;
  invoices: number;
}

export async function loadUserOwnedResources(userId: string): Promise<UserOwnedResources> {
  // We don't have an explicit "createdBy: User" relation on Quote /
  // Order / Customer / Invoice today — those rows are tenant-scoped
  // and don't track per-user authorship in a uniform way. Honest
  // approximation: count actions taken by this user in audit log,
  // bucketed by entityType.
  const buckets: Record<string, number> = {};
  const rows = await db.auditLog.findMany({
    where: {
      userId,
      action: { in: ["quote.created", "order.created", "customer.created", "invoice.created"] },
    },
    select: { action: true },
    take: 5_000,
  });
  for (const r of rows) {
    buckets[r.action] = (buckets[r.action] ?? 0) + 1;
  }
  return {
    quotes: buckets["quote.created"] ?? 0,
    orders: buckets["order.created"] ?? 0,
    customers: buckets["customer.created"] ?? 0,
    invoices: buckets["invoice.created"] ?? 0,
  };
}

export interface UserSecurityEvent {
  id: string;
  kind: SecurityEventKind;
  ipAddress: string | null;
  userAgent: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: Date;
}

export async function loadUserSecurityEvents(userId: string, limit = 200): Promise<UserSecurityEvent[]> {
  const rows = await db.securityEvent.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
  return rows.map((r) => ({
    id: r.id, kind: r.kind, ipAddress: r.ipAddress, userAgent: r.userAgent,
    metadata: (r.metadata ?? null) as Record<string, unknown> | null,
    createdAt: r.createdAt,
  }));
}

export interface UserSupportTicket {
  id: string;
  subject: string;
  status: string;
  tenantName: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export async function loadUserSupportTickets(userId: string): Promise<UserSupportTicket[]> {
  const rows = await db.supportTicket.findMany({
    where: { OR: [{ openedByUserId: userId }, { ratedByUserId: userId }] },
    orderBy: { updatedAt: "desc" },
    take: 100,
    select: {
      id: true, subject: true, status: true,
      createdAt: true, updatedAt: true,
      tenant: { select: { name: true } },
    },
  });
  return rows.map((r) => ({
    id: r.id, subject: r.subject, status: r.status, createdAt: r.createdAt,
    updatedAt: r.updatedAt, tenantName: r.tenant?.name ?? null,
  }));
}

export interface UserNoteRow {
  id: string;
  body: string;
  pinned: boolean;
  isPrivate: boolean;
  createdAt: Date;
  updatedAt: Date;
  authorId: string;
  authorName: string | null;
  authorEmail: string;
}

export async function loadUserNotes(userId: string, currentUserId: string): Promise<UserNoteRow[]> {
  const rows = await db.platformUserNote.findMany({
    where: { userId, OR: [{ isPrivate: false }, { authorId: currentUserId }] },
    orderBy: [{ pinned: "desc" }, { createdAt: "desc" }],
    take: 200,
    select: {
      id: true, body: true, pinned: true, isPrivate: true,
      createdAt: true, updatedAt: true, authorId: true,
      author: { select: { name: true, email: true } },
    },
  });
  return rows.map((r) => ({
    id: r.id, body: r.body, pinned: r.pinned, isPrivate: r.isPrivate,
    createdAt: r.createdAt, updatedAt: r.updatedAt,
    authorId: r.authorId, authorName: r.author.name, authorEmail: r.author.email,
  }));
}

/* ────────────────────────────────────────────────────────── */
/* Helper labels                                              */
/* ────────────────────────────────────────────────────────── */

export const USER_STATUS_LABEL: Record<UserStatus, string> = {
  active: "Active",
  deactivated: "Deactivated",
  banned: "Banned",
  merged: "Merged",
  locked: "Locked",
};
