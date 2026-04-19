import Link from "next/link";
import { requirePermission } from "@/lib/tenant";
import { db } from "@/lib/db";
import { Button } from "@/components/Field";
import { Card } from "@/components/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { formatDate } from "@/lib/format";

// Phase 9 Slice D — Templates list. Templates are snapshot starting points
// for recurring jobs: pick a template on the "new quote" screen and the
// sections + line items drop in, fully decoupled from the source so future
// template edits don't mutate past quotes.

export default async function QuoteTemplatesPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ q?: string }>;
}) {
  const { slug } = await params;
  const sp = await searchParams;
  const ctx = await requirePermission(slug, "quotes:view");
  const canManage = ctx.can("quotes:manage");

  const templates = await db.quoteTemplate.findMany({
    where: {
      tenantId: ctx.tenant.id,
      ...(sp.q
        ? {
            OR: [
              { name:        { contains: sp.q, mode: "insensitive" } },
              { description: { contains: sp.q, mode: "insensitive" } },
            ],
          }
        : {}),
    },
    orderBy: [{ active: "desc" }, { updatedAt: "desc" }],
    include: {
      _count: { select: { items: true, sections: true } },
    },
  });

  const isFirstRun = templates.length === 0 && !sp.q;

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Quote templates</h1>
          <p className="mt-1 text-sm" style={{ color: "var(--muted)" }}>
            {templates.length} {templates.length === 1 ? "template" : "templates"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link href={`/t/${slug}/quotes`} className="text-sm underline" style={{ color: "var(--muted)" }}>
            ← Quotes
          </Link>
          {canManage && (
            <Link href={`/t/${slug}/quotes/templates/new`}>
              <Button type="button">New template</Button>
            </Link>
          )}
        </div>
      </div>

      <form className="mt-6 flex gap-2 text-sm" method="get">
        <input
          name="q"
          defaultValue={sp.q ?? ""}
          placeholder="Search template name or description…"
          className="flex-1 rounded-md px-3 py-2 outline-none"
          style={{ background: "var(--panel)", border: "1px solid var(--border)", color: "var(--text)" }}
        />
        <Button type="submit" variant="secondary">Filter</Button>
      </form>

      {isFirstRun ? (
        <Card className="mt-4">
          <EmptyState
            icon={<span aria-hidden>📋</span>}
            title="No quote templates yet"
            description={
              <>
                Templates turn repeat jobs into a one-click starting point.
                Build a template for every recurring scenario — a typical
                vehicle wrap, a standard monument sign, a storefront refresh
                — and your reps quote faster with fewer slip-ups. Save any
                existing quote as a template from its detail page.
              </>
            }
            action={
              canManage && (
                <Link
                  href={`/t/${slug}/quotes/templates/new`}
                  className="inline-flex items-center rounded-md px-3 py-1.5 text-sm font-semibold transition-colors hover:brightness-110"
                  style={{
                    background: "var(--accent-primary)",
                    color: "var(--accent-fg)",
                  }}
                >
                  Create your first template
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
                <th className="px-4 py-3 font-normal">Sections</th>
                <th className="px-4 py-3 font-normal">Lines</th>
                <th className="px-4 py-3 font-normal">Status</th>
                <th className="px-4 py-3 font-normal">Updated</th>
              </tr>
            </thead>
            <tbody>
              {templates.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center" style={{ color: "var(--muted)" }}>
                    No templates match that search.{" "}
                    <Link href={`/t/${slug}/quotes/templates`} className="underline">
                      Clear filters
                    </Link>
                  </td>
                </tr>
              )}
              {templates.map((tpl) => (
                <tr key={tpl.id} style={{ borderTop: "1px solid var(--border)" }}>
                  <td className="px-4 py-3">
                    <Link
                      href={`/t/${slug}/quotes/templates/${tpl.id}`}
                      className="font-medium underline"
                    >
                      {tpl.name}
                    </Link>
                    {tpl.description && (
                      <div className="mt-0.5 text-xs" style={{ color: "var(--muted)" }}>
                        {tpl.description}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3" style={{ color: "var(--muted)" }}>
                    {tpl._count.sections}
                  </td>
                  <td className="px-4 py-3" style={{ color: "var(--muted)" }}>
                    {tpl._count.items}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className="rounded-full px-2 py-0.5 text-xs"
                      style={{
                        background: tpl.active ? "#10b981" : "#6b7280",
                        color: "white",
                      }}
                    >
                      {tpl.active ? "Active" : "Archived"}
                    </span>
                  </td>
                  <td className="px-4 py-3" style={{ color: "var(--muted)" }}>
                    {formatDate(tpl.updatedAt)}
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
