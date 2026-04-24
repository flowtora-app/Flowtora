import Link from "next/link";
import { requireTenant } from "@/lib/tenant";
import { db } from "@/lib/db";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card } from "@/components/Card";
import { EmptyState } from "@/components/ui/EmptyState";

// Phase 3 — full-page search results.
//
// The command palette is intentionally narrow (5/kind). When a query
// returns more than that — which happens fast on shops with thousands
// of records — the "See all X matches…" row in the palette drops the
// user here, to a page that:
//
//   • Shows 25/kind with deterministic ordering.
//   • Lets the user filter by entity kind via ?kind=.
//   • Keeps the form so the URL is shareable and bookmarkable.
//
// We re-implement the query server-side rather than calling the JSON
// route so we get proper RSC streaming and direct DB access without
// an extra hop. The palette route stays the client-side entry point.
//
// ⚠️  Tenant-status gate matches /api/search: TRIAL / ACTIVE / PAST_DUE
// allowed. Everything else gets redirected by requireTenant anyway.

const KIND_LABELS: Record<string, string> = {
  customer: "Customers",
  quote:    "Quotes",
  order:    "Orders",
  invoice:  "Invoices",
  task:     "Tasks",
  product:  "Products",
  location: "Locations",
};

const PER_KIND_LIMIT = 25;

type Row = { id: string; label: string; sub?: string; href: string };

export default async function SearchPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ q?: string; kind?: string }>;
}) {
  const { slug } = await params;
  const sp = await searchParams;
  const ctx = await requireTenant(slug);

  const q = (sp.q ?? "").trim();
  const kindFilter = sp.kind && KIND_LABELS[sp.kind] ? sp.kind : null;

  // Empty query — render the input with guidance. Keeps the URL
  // shape consistent so the palette's "Open full search" link still
  // works even when the user arrives before typing.
  if (!q) {
    return (
      <div className="space-y-4">
        <PageHeader title="Search" description="Jump across customers, quotes, orders, invoices, tasks, products, and locations." />
        <SearchForm slug={slug} q="" kindFilter={null} />
        <EmptyState
          icon="🔎"
          title="Start typing to search"
          description="Results appear across every entity the tenant allows. Use ⌘K anywhere in the app for a quick version of this."
        />
      </div>
    );
  }

  const where = { tenantId: ctx.tenant.id } as const;
  const contains = { contains: q, mode: "insensitive" as const };
  const take = PER_KIND_LIMIT;

  // Only fetch kinds the filter asks for — saves 6 round-trips when the
  // user has narrowed down from the palette's "See all X matches" link.
  const want = (kind: string) => kindFilter === null || kindFilter === kind;

  const [customers, quotes, orders, invoices, tasks, products, locations] = await Promise.all([
    want("customer")
      ? db.customer.findMany({
          where: { ...where, OR: [{ name: contains }, { email: contains }, { phone: contains }] },
          select: { id: true, name: true, email: true, phone: true },
          take, orderBy: { updatedAt: "desc" },
        })
      : Promise.resolve([] as { id: string; name: string; email: string | null; phone: string | null }[]),
    want("quote")
      ? db.quote.findMany({
          where: { ...where, OR: [{ number: contains }] },
          select: { id: true, number: true, status: true, customer: { select: { name: true } } },
          take, orderBy: { updatedAt: "desc" },
        })
      : Promise.resolve([] as { id: string; number: string; status: string; customer: { name: string } }[]),
    want("order")
      ? db.order.findMany({
          where: { ...where, OR: [{ number: contains }] },
          select: { id: true, number: true, status: true, customer: { select: { name: true } } },
          take, orderBy: { updatedAt: "desc" },
        })
      : Promise.resolve([] as { id: string; number: string; status: string; customer: { name: string } }[]),
    want("invoice")
      ? db.invoice.findMany({
          where: { ...where, OR: [{ number: contains }] },
          select: { id: true, number: true, status: true, customer: { select: { name: true } } },
          take, orderBy: { updatedAt: "desc" },
        })
      : Promise.resolve([] as { id: string; number: string; status: string; customer: { name: string } }[]),
    want("task")
      ? db.task.findMany({
          where: { ...where, OR: [{ title: contains }, { description: contains }] },
          select: { id: true, title: true, completedAt: true, customer: { select: { name: true } } },
          take, orderBy: { updatedAt: "desc" },
        })
      : Promise.resolve([] as { id: string; title: string; completedAt: Date | null; customer: { name: string } | null }[]),
    want("product")
      ? db.product.findMany({
          where: { ...where, OR: [{ name: contains }, { sku: contains }] },
          select: { id: true, name: true, sku: true },
          take, orderBy: { updatedAt: "desc" },
        })
      : Promise.resolve([] as { id: string; name: string; sku: string | null }[]),
    want("location")
      ? db.location.findMany({
          where: { ...where, active: true, OR: [{ name: contains }, { code: contains }, { city: contains }] },
          select: { id: true, name: true, code: true, city: true, isDefault: true },
          take, orderBy: [{ isDefault: "desc" }, { name: "asc" }],
        })
      : Promise.resolve([] as { id: string; name: string; code: string | null; city: string | null; isDefault: boolean }[]),
  ]);

  const groups: { kind: string; label: string; rows: Row[] }[] = [];

  if (customers.length) {
    groups.push({
      kind: "customer",
      label: "Customers",
      rows: customers.map((c) => ({
        id: c.id,
        label: c.name,
        sub: c.email ?? c.phone ?? undefined,
        href: `/t/${slug}/customers/${c.id}`,
      })),
    });
  }
  if (quotes.length) {
    groups.push({
      kind: "quote",
      label: "Quotes",
      rows: quotes.map((row) => ({
        id: row.id,
        label: row.number,
        sub: `${row.customer.name} · ${row.status.toLowerCase()}`,
        href: `/t/${slug}/quotes/${row.id}`,
      })),
    });
  }
  if (orders.length) {
    groups.push({
      kind: "order",
      label: "Orders",
      rows: orders.map((row) => ({
        id: row.id,
        label: row.number,
        sub: `${row.customer.name} · ${row.status.toLowerCase()}`,
        href: `/t/${slug}/orders/${row.id}`,
      })),
    });
  }
  if (invoices.length) {
    groups.push({
      kind: "invoice",
      label: "Invoices",
      rows: invoices.map((row) => ({
        id: row.id,
        label: row.number,
        sub: `${row.customer.name} · ${row.status.toLowerCase()}`,
        href: `/t/${slug}/invoices/${row.id}`,
      })),
    });
  }
  if (tasks.length) {
    groups.push({
      kind: "task",
      label: "Tasks",
      rows: tasks.map((row) => ({
        id: row.id,
        label: row.title,
        sub:
          (row.customer?.name ? `${row.customer.name} · ` : "") +
          (row.completedAt ? "completed" : "open"),
        href: `/t/${slug}/inbox?chip=tasks&view=all`,
      })),
    });
  }
  if (products.length) {
    groups.push({
      kind: "product",
      label: "Products",
      rows: products.map((row) => ({
        id: row.id,
        label: row.name,
        sub: row.sku ?? undefined,
        href: `/t/${slug}/products/${row.id}`,
      })),
    });
  }
  if (locations.length) {
    groups.push({
      kind: "location",
      label: "Locations",
      rows: locations.map((row) => ({
        id: row.id,
        label: row.name + (row.isDefault ? " (HQ)" : ""),
        sub: row.code ?? row.city ?? undefined,
        href: `/t/${slug}/settings/locations`,
      })),
    });
  }

  const totalMatches = groups.reduce((n, g) => n + g.rows.length, 0);

  return (
    <div className="space-y-4">
      <PageHeader
        title={`Search results for "${q}"`}
        description={
          kindFilter
            ? `Filtered to ${KIND_LABELS[kindFilter].toLowerCase()}. ${totalMatches} match${totalMatches === 1 ? "" : "es"}.`
            : `${totalMatches} match${totalMatches === 1 ? "" : "es"} across all record types.`
        }
      />
      <SearchForm slug={slug} q={q} kindFilter={kindFilter} />
      <KindTabs slug={slug} q={q} kindFilter={kindFilter} />

      {groups.length === 0 ? (
        <EmptyState
          icon="🔎"
          title="No matches"
          description={`Nothing matched "${q}"${kindFilter ? ` under ${KIND_LABELS[kindFilter].toLowerCase()}` : ""}. Try a shorter term or clear the kind filter.`}
        />
      ) : (
        <div className="space-y-4">
          {groups.map((g) => (
            <Card key={g.kind}>
              <div
                className="flex items-center justify-between px-5 py-3"
                style={{ borderBottom: "1px solid var(--border-subtle)" }}
              >
                <div className="text-sm font-semibold" style={{ color: "var(--text-default)" }}>
                  {g.label}
                  <span className="ml-2 text-xs font-normal" style={{ color: "var(--text-muted)" }}>
                    {g.rows.length === PER_KIND_LIMIT ? `showing first ${PER_KIND_LIMIT}` : `${g.rows.length} match${g.rows.length === 1 ? "" : "es"}`}
                  </span>
                </div>
                {kindFilter !== g.kind && (
                  <Link
                    href={`/t/${slug}/search?q=${encodeURIComponent(q)}&kind=${g.kind}`}
                    className="text-xs underline"
                    style={{ color: "var(--text-muted)" }}
                  >
                    Only {g.label.toLowerCase()}
                  </Link>
                )}
              </div>
              <ul>
                {g.rows.map((row) => (
                  <li key={row.id} style={{ borderTop: "1px solid var(--border-subtle)" }}>
                    <Link
                      href={row.href}
                      className="flex items-center justify-between px-5 py-2.5 text-sm transition-colors hover:bg-[color:var(--surface-1)]"
                      style={{ color: "var(--text-default)" }}
                    >
                      <span className="truncate">{row.label}</span>
                      {row.sub && (
                        <span className="ml-4 truncate text-xs" style={{ color: "var(--text-muted)" }}>
                          {row.sub}
                        </span>
                      )}
                    </Link>
                  </li>
                ))}
              </ul>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────

function SearchForm({
  slug,
  q,
  kindFilter,
}: {
  slug: string;
  q: string;
  kindFilter: string | null;
}) {
  return (
    <form
      action={`/t/${slug}/search`}
      method="GET"
      className="flex items-center gap-2"
    >
      <input
        name="q"
        defaultValue={q}
        placeholder="Search customers, quotes, orders…"
        autoFocus
        className="flex-1 rounded-md px-3 py-2 text-sm outline-none"
        style={{
          background: "var(--surface-1)",
          border: "1px solid var(--border-default)",
          color: "var(--text-default)",
        }}
      />
      {kindFilter && <input type="hidden" name="kind" value={kindFilter} />}
      <button
        type="submit"
        className="rounded-md px-3 py-2 text-sm font-medium"
        style={{
          background: "var(--accent-primary)",
          color: "var(--accent-fg)",
          border: "1px solid var(--accent-primary)",
        }}
      >
        Search
      </button>
    </form>
  );
}

function KindTabs({
  slug,
  q,
  kindFilter,
}: {
  slug: string;
  q: string;
  kindFilter: string | null;
}) {
  const base = `/t/${slug}/search?q=${encodeURIComponent(q)}`;
  const tabs: { kind: string | null; label: string }[] = [
    { kind: null, label: "All" },
    ...Object.entries(KIND_LABELS).map(([kind, label]) => ({ kind, label })),
  ];
  return (
    <div className="flex flex-wrap items-center gap-1.5 text-xs">
      {tabs.map((t) => {
        const active = t.kind === kindFilter;
        const href = t.kind ? `${base}&kind=${t.kind}` : base;
        return (
          <Link
            key={t.label}
            href={href}
            className="rounded-full px-3 py-1 transition-colors"
            style={{
              background: active ? "var(--accent-surface)" : "var(--surface-1)",
              color: active ? "var(--accent-primary)" : "var(--text-muted)",
              border: `1px solid ${active ? "var(--accent-primary)" : "var(--border-subtle)"}`,
              fontWeight: active ? 600 : 500,
            }}
          >
            {t.label}
          </Link>
        );
      })}
    </div>
  );
}
