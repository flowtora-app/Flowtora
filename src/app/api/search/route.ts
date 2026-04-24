import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/lib/db";

// Phase 3 — global command-palette search (rev 2).
//
// Powers the ⌘K palette *and* the /t/{slug}/search full-results page.
//
// Scoped to the active tenant (resolved from ?slug=). Membership-checked.
// Platform staff can search any non-archived tenant.
//
// Entity kinds (each with a per-kind cap):
//   Customers, Quotes, Orders, Invoices, Tasks, Products, Locations
//
// A `take` query flips between two modes:
//   - default (palette): PER_KIND_LIMIT = 5
//   - expanded (full-page): PER_KIND_LIMIT = 25
// Plus per-kind `hasMore` flags so the palette can show a
// "See all results" link instead of silently truncating.
//
// Branch scoping is NOT applied here — the palette shows everything the
// user's tenant role allows, then the destination page re-checks
// locationId via `assertBranchAccess`. (Filtering in search too would
// mean a row visible on a list page could be invisible in the palette
// because branch scope can be computed differently in edge cases.)
//
// Phase 3 fix — we used to hard-reject anything that wasn't ACTIVE. A
// workspace in TRIAL is the *common* case on first signup and the whole
// shell still renders, so refusing to search those shops was an outright
// bug. We now accept TRIAL and PAST_DUE; SUSPENDED / CANCELED / ARCHIVED
// still 404 because those users are bounced to /account-suspended
// anyway.

type SearchGroup = {
  kind: "customer" | "quote" | "order" | "invoice" | "task" | "product" | "location";
  label: string;
  items: { id: string; label: string; sub?: string; href: string }[];
  hasMore?: boolean;
};

const MODE_LIMITS = { palette: 5, full: 25 } as const;

export async function GET(req: Request) {
  const url = new URL(req.url);
  const q = (url.searchParams.get("q") ?? "").trim();
  const slug = (url.searchParams.get("slug") ?? "").trim();
  const modeParam = url.searchParams.get("take");
  const mode: keyof typeof MODE_LIMITS = modeParam === "full" ? "full" : "palette";
  const perKind = MODE_LIMITS[mode];
  // Fetch one extra record per kind so we can set hasMore without a
  // separate count() round-trip.
  const fetchCount = perKind + 1;

  if (!slug) return NextResponse.json({ error: "missing slug" }, { status: 400 });
  if (!q) return NextResponse.json({ groups: [] });

  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const tenant = await db.tenant.findUnique({ where: { slug }, select: { id: true, status: true } });
  if (!tenant) return NextResponse.json({ error: "not found" }, { status: 404 });
  // TRIAL, ACTIVE, PAST_DUE — users can still read their workspace.
  // SUSPENDED / CANCELED / ARCHIVED — blocked.
  if (!["TRIAL", "ACTIVE", "PAST_DUE"].includes(tenant.status)) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  // Membership-gate. Platform staff can search any tenant (matches
  // requireTenant behavior) — they don't need an explicit membership.
  const [membership, isStaff] = await Promise.all([
    db.membership.findUnique({
      where: { userId_tenantId: { userId: session.user.id, tenantId: tenant.id } },
      select: { status: true },
    }),
    Promise.resolve(!!session.user.platformRole),
  ]);
  if ((!membership || membership.status !== "ACTIVE") && !isStaff) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const where = { tenantId: tenant.id } as const;
  const contains = { contains: q, mode: "insensitive" as const };

  const [customers, quotes, orders, invoices, tasks, products, locations] = await Promise.all([
    db.customer.findMany({
      where: {
        ...where,
        OR: [
          { name: contains },
          { email: contains },
          { phone: contains },
        ],
      },
      select: { id: true, name: true, email: true },
      take: fetchCount,
      orderBy: { updatedAt: "desc" },
    }),
    db.quote.findMany({
      where: {
        ...where,
        OR: [{ number: contains }],
      },
      select: {
        id: true,
        number: true,
        status: true,
        total: true,
        customer: { select: { name: true } },
      },
      take: fetchCount,
      orderBy: { updatedAt: "desc" },
    }),
    db.order.findMany({
      where: {
        ...where,
        OR: [{ number: contains }],
      },
      select: {
        id: true,
        number: true,
        status: true,
        customer: { select: { name: true } },
      },
      take: fetchCount,
      orderBy: { updatedAt: "desc" },
    }),
    db.invoice.findMany({
      where: {
        ...where,
        OR: [{ number: contains }],
      },
      select: {
        id: true,
        number: true,
        status: true,
        customer: { select: { name: true } },
      },
      take: fetchCount,
      orderBy: { updatedAt: "desc" },
    }),
    db.task.findMany({
      where: {
        ...where,
        OR: [{ title: contains }, { description: contains }],
        completedAt: null,
      },
      select: {
        id: true,
        title: true,
        dueDate: true,
        customer: { select: { name: true } },
      },
      take: fetchCount,
      orderBy: { updatedAt: "desc" },
    }),
    db.product.findMany({
      where: {
        ...where,
        OR: [{ name: contains }, { sku: contains }],
      },
      select: { id: true, name: true, sku: true },
      take: fetchCount,
      orderBy: { updatedAt: "desc" },
    }),
    // Phase 3 — locations are rare enough (usually <10) that a full match
    // is fine, but we still cap them with the shared limit to keep
    // palette rendering predictable.
    db.location.findMany({
      where: {
        ...where,
        active: true,
        OR: [{ name: contains }, { code: contains }, { city: contains }],
      },
      select: { id: true, name: true, code: true, city: true, isDefault: true },
      take: fetchCount,
      orderBy: [{ isDefault: "desc" }, { name: "asc" }],
    }),
  ]);

  const groups: SearchGroup[] = [];

  if (customers.length) {
    groups.push({
      kind: "customer",
      label: "Customers",
      hasMore: customers.length > perKind,
      items: customers.slice(0, perKind).map((c) => ({
        id: c.id,
        label: c.name,
        sub: c.email ?? undefined,
        href: `/t/${slug}/customers/${c.id}`,
      })),
    });
  }

  if (quotes.length) {
    groups.push({
      kind: "quote",
      label: "Quotes",
      hasMore: quotes.length > perKind,
      items: quotes.slice(0, perKind).map((q) => ({
        id: q.id,
        label: q.number,
        sub: `${q.customer.name} · ${q.status.toLowerCase()}`,
        href: `/t/${slug}/quotes/${q.id}`,
      })),
    });
  }

  if (orders.length) {
    groups.push({
      kind: "order",
      label: "Orders",
      hasMore: orders.length > perKind,
      items: orders.slice(0, perKind).map((o) => ({
        id: o.id,
        label: o.number,
        sub: `${o.customer.name} · ${o.status.toLowerCase()}`,
        href: `/t/${slug}/orders/${o.id}`,
      })),
    });
  }

  if (invoices.length) {
    groups.push({
      kind: "invoice",
      label: "Invoices",
      hasMore: invoices.length > perKind,
      items: invoices.slice(0, perKind).map((i) => ({
        id: i.id,
        label: i.number,
        sub: `${i.customer.name} · ${i.status.toLowerCase()}`,
        href: `/t/${slug}/invoices/${i.id}`,
      })),
    });
  }

  if (tasks.length) {
    groups.push({
      kind: "task",
      label: "Tasks",
      hasMore: tasks.length > perKind,
      items: tasks.slice(0, perKind).map((t) => ({
        id: t.id,
        label: t.title,
        sub: t.customer?.name,
        href: `/t/${slug}/inbox?chip=tasks&view=all`,
      })),
    });
  }

  if (products.length) {
    groups.push({
      kind: "product",
      label: "Products",
      hasMore: products.length > perKind,
      items: products.slice(0, perKind).map((p) => ({
        id: p.id,
        label: p.name,
        sub: p.sku ?? undefined,
        href: `/t/${slug}/products/${p.id}`,
      })),
    });
  }

  if (locations.length) {
    groups.push({
      kind: "location",
      label: "Locations",
      hasMore: locations.length > perKind,
      items: locations.slice(0, perKind).map((l) => ({
        id: l.id,
        label: l.name + (l.isDefault ? " (HQ)" : ""),
        sub: l.code ?? l.city ?? undefined,
        href: `/t/${slug}/settings/locations`,
      })),
    });
  }

  return NextResponse.json({ groups });
}
