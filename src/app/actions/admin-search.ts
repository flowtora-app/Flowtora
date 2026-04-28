"use server";

import { db } from "@/lib/db";
import { requirePlatformStaff } from "@/lib/platform";

// Typed, grouped, race-condition-friendly admin search.
//
// The page fires this on every keystroke (debounced client-side); the
// action authenticates, runs five parallel queries, and returns one
// shaped object the UI can render directly. Each row carries an
// `href` so the client doesn't reconstruct routes.

const LIMIT_PER_KIND = 8;

export type EntityKind =
  | "tenant"
  | "user"
  | "customer"
  | "ticket"
  | "lead";

export interface AdminSearchRow {
  id: string;
  kind: EntityKind;
  href: string;
  /** Main label rendered in bold. */
  primary: string;
  /** Secondary detail line shown muted under the title. */
  secondary?: string;
  /** Optional badges rendered to the right of the title (status, plan, etc.). */
  badges?: { label: string; tone?: "neutral" | "accent" | "success" | "warning" | "danger" }[];
}

export interface AdminSearchResults {
  query: string;
  totalHits: number;
  durationMs: number;
  groups: {
    tenants:   AdminSearchRow[];
    users:     AdminSearchRow[];
    customers: AdminSearchRow[];
    tickets:   AdminSearchRow[];
    leads:     AdminSearchRow[];
  };
  counts: {
    tenants:   number;
    users:     number;
    customers: number;
    tickets:   number;
    leads:     number;
  };
}

export async function searchAdmin(query: string): Promise<AdminSearchResults> {
  await requirePlatformStaff();

  const q = query.trim();
  const started = Date.now();

  if (q.length < 2) {
    return {
      query: q,
      totalHits: 0,
      durationMs: 0,
      groups: { tenants: [], users: [], customers: [], tickets: [], leads: [] },
      counts: { tenants: 0, users: 0, customers: 0, tickets: 0, leads: 0 },
    };
  }

  const ilike = (field: string) => ({ [field]: { contains: q, mode: "insensitive" as const } });

  const [tenants, users, customers, tickets, leads] = await Promise.all([
    db.tenant.findMany({
      where: {
        OR: [
          ilike("name"),
          ilike("slug"),
          ilike("stripeCustomerId"),
        ],
      },
      select: { id: true, name: true, slug: true, plan: true, status: true },
      orderBy: { updatedAt: "desc" },
      take: LIMIT_PER_KIND,
    }),
    db.user.findMany({
      where: { OR: [ilike("name"), ilike("email")] },
      select: { id: true, name: true, email: true, platformRole: true },
      orderBy: { createdAt: "desc" },
      take: LIMIT_PER_KIND,
    }),
    db.customer.findMany({
      where: {
        OR: [
          ilike("name"),
          ilike("email"),
          ilike("phone"),
        ],
      },
      select: {
        id: true, name: true, email: true,
        tenant: { select: { id: true, name: true, slug: true } },
      },
      orderBy: { createdAt: "desc" },
      take: LIMIT_PER_KIND,
    }),
    db.supportTicket.findMany({
      where: {
        OR: [
          ilike("subject"),
          { id: { equals: q } },
        ],
      },
      select: {
        id: true, subject: true, priority: true, status: true,
        tenant: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: "desc" },
      take: LIMIT_PER_KIND,
    }),
    db.marketingLead.findMany({
      where: {
        OR: [
          ilike("name"),
          ilike("email"),
          ilike("company"),
        ],
      },
      select: { id: true, name: true, email: true, company: true, kind: true, status: true },
      orderBy: { createdAt: "desc" },
      take: LIMIT_PER_KIND,
    }),
  ]);

  const tenantRows: AdminSearchRow[] = tenants.map((t) => ({
    id: t.id,
    kind: "tenant",
    href: `/platform/tenants/${t.id}`,
    primary: t.name,
    secondary: t.slug,
    badges: [
      { label: t.plan, tone: "neutral" },
      { label: t.status, tone: tenantStatusTone(t.status) },
    ],
  }));

  const userRows: AdminSearchRow[] = users.map((u) => ({
    id: u.id,
    kind: "user",
    href: `/platform/search?q=${encodeURIComponent(u.email)}`,
    primary: u.name ?? u.email,
    secondary: u.name ? u.email : undefined,
    badges: u.platformRole
      ? [{ label: u.platformRole.replace(/_/g, " ").toLowerCase(), tone: "accent" }]
      : [],
  }));

  const customerRows: AdminSearchRow[] = customers.map((c) => ({
    id: c.id,
    kind: "customer",
    href: `/platform/tenants/${c.tenant.id}`,
    primary: c.name,
    secondary: [c.email, `@ ${c.tenant.name}`].filter(Boolean).join(" · "),
  }));

  const ticketRows: AdminSearchRow[] = tickets.map((t) => ({
    id: t.id,
    kind: "ticket",
    href: `/platform/support/${t.id}`,
    primary: t.subject,
    secondary: t.tenant.name,
    badges: [
      { label: t.priority, tone: ticketPriorityTone(t.priority) },
      { label: t.status,   tone: ticketStatusTone(t.status) },
    ],
  }));

  const leadRows: AdminSearchRow[] = leads.map((l) => ({
    id: l.id,
    kind: "lead",
    href: `/platform/leads/${l.id}`,
    primary: l.name ?? l.email ?? "(unnamed lead)",
    secondary: [l.company, l.email].filter(Boolean).join(" · ") || undefined,
    badges: [
      { label: l.kind, tone: "neutral" },
      { label: l.status, tone: "accent" },
    ],
  }));

  const counts = {
    tenants:   tenantRows.length,
    users:     userRows.length,
    customers: customerRows.length,
    tickets:   ticketRows.length,
    leads:     leadRows.length,
  };

  return {
    query: q,
    totalHits:
      counts.tenants +
      counts.users +
      counts.customers +
      counts.tickets +
      counts.leads,
    durationMs: Date.now() - started,
    groups: {
      tenants:   tenantRows,
      users:     userRows,
      customers: customerRows,
      tickets:   ticketRows,
      leads:     leadRows,
    },
    counts,
  };
}

// Per-entity badge tone helpers — kept next to the action so the
// mapping changes once when statuses evolve.
type Tone = "neutral" | "accent" | "success" | "warning" | "danger";

function tenantStatusTone(s: string): Tone {
  return s === "ACTIVE"    ? "success" :
         s === "TRIAL"     ? "accent"  :
         s === "PAST_DUE"  ? "warning" :
         s === "SUSPENDED" ? "danger"  :
         s === "CANCELED"  ? "danger"  :
         "neutral";
}

function ticketPriorityTone(p: string): Tone {
  return p === "URGENT" ? "danger" :
         p === "HIGH"   ? "warning" :
         p === "LOW"    ? "neutral" :
         "neutral";
}

function ticketStatusTone(s: string): Tone {
  return s === "OPEN"    ? "warning" :
         s === "PENDING" ? "warning" :
         s === "SOLVED"  ? "success" :
         s === "CLOSED"  ? "neutral" :
         "neutral";
}
