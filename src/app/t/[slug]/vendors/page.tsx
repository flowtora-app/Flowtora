import Link from "next/link";
import { requirePermission } from "@/lib/tenant";
import { db } from "@/lib/db";
import { Card } from "@/components/Card";
import { Button } from "@/components/Field";
import { EmptyState } from "@/components/ui/EmptyState";
import { formatMoney } from "@/lib/format";
import type { Prisma } from "@prisma/client";

// Phase 14 — vendor directory.
//
// Bare-bones list: filter by "active" vs "archived" (active by default)
// and free-text search across name/contact/category. Each row shows a
// lifetime spend number so the owner can tell "which suppliers matter"
// at a glance. Spend is aggregated from expense.amount rather than
// stored on the vendor row — denormalizing here isn't worth the cost
// for a list that's rarely over a few dozen rows.

export default async function VendorsPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ q?: string; scope?: "active" | "archived" | "all" }>;
}) {
  const { slug } = await params;
  const sp = await searchParams;
  const ctx = await requirePermission(slug, "vendors:view");
  const canManage = ctx.can("vendors:manage");

  const scope = sp.scope ?? "active";

  const where: Prisma.VendorWhereInput = { tenantId: ctx.tenant.id };
  if (scope === "active")   where.active = true;
  if (scope === "archived") where.active = false;
  if (sp.q) {
    where.OR = [
      { name:     { contains: sp.q, mode: "insensitive" } },
      { contact:  { contains: sp.q, mode: "insensitive" } },
      { category: { contains: sp.q, mode: "insensitive" } },
    ];
  }

  const vendors = await db.vendor.findMany({
    where,
    orderBy: [{ active: "desc" }, { name: "asc" }],
    take: 300,
    include: { _count: { select: { expenses: true } } },
  });

  // Lifetime spend is one groupBy query per page load. Keyed on vendorId
  // and scoped to the tenant. Returns 0 for vendors that haven't been
  // used yet — which is why we merge into a map instead of joining.
  const spendRows = vendors.length
    ? await db.expense.groupBy({
        by: ["vendorId"],
        where: { tenantId: ctx.tenant.id, vendorId: { in: vendors.map((v) => v.id) } },
        _sum: { amount: true },
      })
    : [];
  const spendByVendor = new Map<string, number>(
    spendRows.map((r) => [r.vendorId!, Number(r._sum.amount ?? 0)]),
  );

  const hasFilters = !!(sp.q || (sp.scope && sp.scope !== "active"));
  const isFirstRun = vendors.length === 0 && !hasFilters && scope === "active";

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Vendors</h1>
          <p className="mt-1 text-sm" style={{ color: "var(--muted)" }}>
            {vendors.length} {vendors.length === 1 ? "vendor" : "vendors"}
            {scope === "archived" && " · archived only"}
          </p>
        </div>
        {canManage && (
          <Link href={`/t/${slug}/vendors/new`}>
            <Button type="button">New vendor</Button>
          </Link>
        )}
      </div>

      <nav className="mt-4 flex gap-1 text-sm">
        {([
          { k: "active",   label: "Active"   },
          { k: "archived", label: "Archived" },
          { k: "all",      label: "All"      },
        ] as const).map((t) => {
          const active = (sp.scope ?? "active") === t.k;
          return (
            <Link
              key={t.k}
              href={t.k === "active" ? `/t/${slug}/vendors` : `/t/${slug}/vendors?scope=${t.k}`}
              className="rounded-md px-3 py-1.5"
              style={{
                background: active ? "var(--panel)" : "transparent",
                border: "1px solid var(--border)",
                color: "var(--text)",
              }}
            >
              {t.label}
            </Link>
          );
        })}
      </nav>

      <form className="mt-4 flex gap-2 text-sm" method="get">
        {sp.scope && <input type="hidden" name="scope" value={sp.scope} />}
        <input
          name="q"
          defaultValue={sp.q ?? ""}
          placeholder="Search vendor, contact, category…"
          className="flex-1 rounded-md px-3 py-2 outline-none"
          style={{ background: "var(--panel)", border: "1px solid var(--border)", color: "var(--text)" }}
        />
        <Button type="submit" variant="secondary">Filter</Button>
        {hasFilters && (
          <Link
            href={`/t/${slug}/vendors`}
            className="rounded-md px-3 py-2"
            style={{ color: "var(--muted)" }}
          >
            Clear
          </Link>
        )}
      </form>

      {isFirstRun ? (
        <Card className="mt-4">
          <EmptyState
            icon={<span aria-hidden>🏷️</span>}
            title="No vendors yet"
            description={
              <>
                Vendors are the suppliers, subcontractors, and services behind
                every expense. Adding them makes it easy to group spend and see
                which partners matter most to the shop.
              </>
            }
            action={
              canManage && (
                <Link
                  href={`/t/${slug}/vendors/new`}
                  className="inline-flex items-center rounded-md px-3 py-1.5 text-sm font-semibold transition-colors hover:brightness-110"
                  style={{ background: "var(--accent)", color: "white" }}
                >
                  Add your first vendor
                </Link>
              )
            }
          />
        </Card>
      ) : (
        <Card className="mt-4 overflow-hidden">
          <table className="w-full text-sm">
            <thead style={{ color: "var(--muted)" }}>
              <tr className="text-left">
                <th className="px-4 py-3 font-normal">Name</th>
                <th className="px-4 py-3 font-normal">Category</th>
                <th className="px-4 py-3 font-normal">Contact</th>
                <th className="px-4 py-3 font-normal">Email</th>
                <th className="px-4 py-3 font-normal">Phone</th>
                <th className="px-4 py-3 font-normal text-right">Expenses</th>
                <th className="px-4 py-3 font-normal text-right">Lifetime spend</th>
              </tr>
            </thead>
            <tbody>
              {vendors.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center" style={{ color: "var(--muted)" }}>
                    No vendors match.
                  </td>
                </tr>
              )}
              {vendors.map((v) => (
                <tr key={v.id} style={{ borderTop: "1px solid var(--border)" }}>
                  <td className="px-4 py-3">
                    <Link href={`/t/${slug}/vendors/${v.id}`} className="font-medium underline">
                      {v.name}
                    </Link>
                    {!v.active && (
                      <span className="ml-2 rounded-full px-2 py-0.5 text-[10px]"
                        style={{ background: "#3f3f46", color: "white" }}>
                        archived
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3" style={{ color: "var(--muted)" }}>{v.category ?? "—"}</td>
                  <td className="px-4 py-3" style={{ color: "var(--muted)" }}>{v.contact ?? "—"}</td>
                  <td className="px-4 py-3" style={{ color: "var(--muted)" }}>{v.email ?? "—"}</td>
                  <td className="px-4 py-3" style={{ color: "var(--muted)" }}>{v.phone ?? "—"}</td>
                  <td className="px-4 py-3 text-right">{v._count.expenses}</td>
                  <td className="px-4 py-3 text-right">
                    {formatMoney(spendByVendor.get(v.id) ?? 0, ctx.tenant.currency)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}
