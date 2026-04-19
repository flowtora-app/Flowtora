import Link from "next/link";
import { db } from "@/lib/db";
import { requirePlatformStaff } from "@/lib/platform";
import { Card, CardHeader } from "@/components/ui";

// Phase N — unified global admin search.
//
// One box that searches across every major record platform staff might
// be hunting for: tenants, platform/tenant users, customers (scoped to
// the tenant they belong to), support tickets, marketing leads. Results
// are grouped by kind with deep-links into the relevant detail page.
//
// Kept intentionally read-only — mutations still happen from the
// dedicated surfaces. This is for *finding* things quickly.

const LIMIT_PER_KIND = 10;

type SP = Promise<{ q?: string }>;

export default async function PlatformSearchPage({
  searchParams,
}: {
  searchParams: SP;
}) {
  await requirePlatformStaff();
  const sp = await searchParams;
  const q  = (sp.q ?? "").trim();

  const hasQuery = q.length >= 2;

  const [
    tenants,
    users,
    customers,
    tickets,
    leads,
  ] = hasQuery
    ? await Promise.all([
        db.tenant.findMany({
          where: {
            OR: [
              { name: { contains: q, mode: "insensitive" } },
              { slug: { contains: q, mode: "insensitive" } },
              { stripeCustomerId: { contains: q, mode: "insensitive" } },
            ],
          },
          select: { id: true, name: true, slug: true, plan: true, status: true },
          orderBy: { updatedAt: "desc" },
          take: LIMIT_PER_KIND,
        }),
        db.user.findMany({
          where: {
            OR: [
              { name:  { contains: q, mode: "insensitive" } },
              { email: { contains: q, mode: "insensitive" } },
            ],
          },
          select: { id: true, name: true, email: true, platformRole: true },
          orderBy: { createdAt: "desc" },
          take: LIMIT_PER_KIND,
        }),
        db.customer.findMany({
          where: {
            OR: [
              { name:  { contains: q, mode: "insensitive" } },
              { email: { contains: q, mode: "insensitive" } },
              { phone: { contains: q, mode: "insensitive" } },
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
              { subject: { contains: q, mode: "insensitive" } },
              { id:      { equals:   q } },
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
              { name:    { contains: q, mode: "insensitive" } },
              { email:   { contains: q, mode: "insensitive" } },
              { company: { contains: q, mode: "insensitive" } },
            ],
          },
          select: { id: true, name: true, email: true, company: true, kind: true, status: true },
          orderBy: { createdAt: "desc" },
          take: LIMIT_PER_KIND,
        }),
      ])
    : [[], [], [], [], []] as const;

  const totalHits =
    tenants.length + users.length + customers.length + tickets.length + leads.length;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold">Global search</h1>
        <p
          className="mt-1 text-sm"
          style={{ color: "var(--text-muted)" }}
        >
          One query, every surface. Searches tenants, users, customers,
          support tickets, and marketing leads.
        </p>
      </div>

      <form method="get" className="flex items-center gap-2">
        <input
          type="search"
          name="q"
          defaultValue={q}
          autoFocus
          placeholder="Try a tenant name, an email, a ticket subject…"
          className="ts-focus flex-1 rounded-md px-3 py-2 text-sm outline-none"
          style={{
            background: "var(--surface-1)",
            border: "1px solid var(--border-default)",
            color: "var(--text-default)",
          }}
        />
        <button
          type="submit"
          className="ts-btn-primary rounded-md px-4 py-2 text-sm font-medium"
        >
          Search
        </button>
      </form>

      {!hasQuery && (
        <Card>
          <div className="px-5 py-6 text-sm" style={{ color: "var(--text-muted)" }}>
            Enter at least 2 characters to search. Tip: paste an email
            address or a tenant slug for the fastest match.
          </div>
        </Card>
      )}

      {hasQuery && totalHits === 0 && (
        <Card>
          <div className="px-5 py-6 text-sm" style={{ color: "var(--text-muted)" }}>
            No results for <strong style={{ color: "var(--text-default)" }}>{q}</strong>.
          </div>
        </Card>
      )}

      {hasQuery && (
        <div className="space-y-6">
          <ResultSection title="Tenants" count={tenants.length} limit={LIMIT_PER_KIND}>
            {tenants.map((t) => (
              <ResultRow
                key={t.id}
                href={`/platform/tenants/${t.id}`}
                primary={t.name}
                secondary={`${t.slug} · ${t.plan} · ${t.status}`}
              />
            ))}
          </ResultSection>

          <ResultSection title="Users" count={users.length} limit={LIMIT_PER_KIND}>
            {users.map((u) => (
              <ResultRow
                key={u.id}
                href={`/platform/search?q=${encodeURIComponent(u.email)}`}
                primary={u.name ?? u.email}
                secondary={
                  u.name
                    ? `${u.email}${u.platformRole ? ` · platform ${u.platformRole}` : ""}`
                    : u.platformRole
                      ? `platform ${u.platformRole}`
                      : undefined
                }
              />
            ))}
          </ResultSection>

          <ResultSection title="Customers" count={customers.length} limit={LIMIT_PER_KIND}>
            {customers.map((c) => (
              <ResultRow
                key={c.id}
                href={`/platform/tenants/${c.tenant.id}`}
                primary={c.name}
                secondary={[c.email, `@ ${c.tenant.name}`].filter(Boolean).join(" · ")}
              />
            ))}
          </ResultSection>

          <ResultSection title="Support tickets" count={tickets.length} limit={LIMIT_PER_KIND}>
            {tickets.map((t) => (
              <ResultRow
                key={t.id}
                href={`/platform/support/${t.id}`}
                primary={t.subject}
                secondary={`${t.tenant.name} · ${t.priority} · ${t.status}`}
              />
            ))}
          </ResultSection>

          <ResultSection title="Marketing leads" count={leads.length} limit={LIMIT_PER_KIND}>
            {leads.map((l) => (
              <ResultRow
                key={l.id}
                href={`/platform/leads/${l.id}`}
                primary={l.name ?? l.email ?? "(unnamed lead)"}
                secondary={[l.company, l.email, `${l.kind} · ${l.status}`].filter(Boolean).join(" · ")}
              />
            ))}
          </ResultSection>
        </div>
      )}
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────── */

function ResultSection({
  title, count, limit, children,
}: {
  title: string;
  count: number;
  limit: number;
  children: React.ReactNode;
}) {
  if (count === 0) return null;
  return (
    <Card>
      <CardHeader
        title={title}
        right={
          <span
            className="rounded-full px-2 py-0.5 text-xs"
            style={{ background: "var(--surface-2)", color: "var(--text-muted)" }}
          >
            {count === limit ? `${count}+` : count}
          </span>
        }
      />
      <ul>{children}</ul>
    </Card>
  );
}

function ResultRow({
  href, primary, secondary,
}: { href: string; primary: string; secondary?: string }) {
  return (
    <li style={{ borderTop: "1px solid var(--border-subtle)" }}>
      <Link
        href={href}
        className="flex items-center justify-between gap-4 px-5 py-3 transition-colors hover:opacity-80"
      >
        <div className="min-w-0">
          <div className="truncate text-sm font-medium">{primary}</div>
          {secondary && (
            <div
              className="truncate text-xs"
              style={{ color: "var(--text-muted)" }}
            >
              {secondary}
            </div>
          )}
        </div>
        <span style={{ color: "var(--text-faint)" }}>→</span>
      </Link>
    </li>
  );
}
