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
      <div style={{ fontSize: 12, marginBottom: 16 }}>
        <Link
          href={`/t/${slug}/quotes`}
          className="ts-focus inline-flex items-center gap-1 transition-colors hover:text-[var(--text-default)]"
          style={{ color: "var(--text-muted)" }}
        >
          ← Quotes
        </Link>
      </div>
      <div
        className="relative overflow-hidden rounded-2xl"
        style={{
          padding: "18px 22px",
          background:
            "radial-gradient(880px circle at -10% -50%, var(--accent-surface), transparent 55%), " +
            "linear-gradient(180deg, color-mix(in oklab, var(--surface-1) 92%, white 8%) 0%, var(--surface-1) 100%)",
          border: "1px solid var(--border-subtle)",
          boxShadow:
            "inset 0 1px 0 0 color-mix(in oklab, white 4%, transparent), " +
            "0 1px 2px 0 rgba(0,0,0,0.18)",
        }}
      >
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2.5">
              <h1
                className="font-semibold"
                style={{
                  color: "var(--text-default)",
                  fontSize: 24,
                  letterSpacing: "-0.02em",
                  lineHeight: 1.15,
                }}
              >
                Quote templates
              </h1>
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  fontSize: 11,
                  fontWeight: 700,
                  letterSpacing: "0.04em",
                  color: "var(--accent-primary)",
                  background: "var(--accent-surface)",
                  border:
                    "1px solid color-mix(in oklab, var(--accent-primary) 22%, transparent)",
                  padding: "3px 8px",
                  borderRadius: 999,
                  fontFeatureSettings: "'tnum' 1",
                  lineHeight: 1,
                }}
              >
                {templates.length}
              </span>
            </div>
            <p
              className="mt-1.5"
              style={{
                color: "var(--text-muted)",
                fontSize: 12.5,
                lineHeight: 1.45,
              }}
            >
              Pre-built quote scaffolds — drop the right one onto a new deal in seconds.
            </p>
          </div>
          {canManage && (
            <Link
              href={`/t/${slug}/quotes/templates/new`}
              className="ts-focus inline-flex items-center gap-1.5 rounded-lg font-semibold transition-transform"
              style={{
                height: 32,
                padding: "0 14px",
                background:
                  "linear-gradient(180deg, color-mix(in oklab, var(--accent-primary) 96%, white 4%) 0%, var(--accent-primary) 100%)",
                color: "var(--accent-fg)",
                border:
                  "1px solid color-mix(in oklab, var(--accent-primary) 80%, black 20%)",
                boxShadow:
                  "0 1px 0 0 rgba(255,255,255,0.15) inset, " +
                  "0 1px 2px 0 rgba(0,0,0,0.35)",
                fontSize: 12.5,
                letterSpacing: "-0.005em",
              }}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M12 5v14M5 12h14" />
              </svg>
              New template
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
