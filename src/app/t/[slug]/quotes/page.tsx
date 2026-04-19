import Link from "next/link";
import { requirePermission } from "@/lib/tenant";
import { db } from "@/lib/db";
import { Button } from "@/components/Field";
import { Card } from "@/components/Card";
import { formatMoney, formatDate } from "@/lib/format";
import { QUOTE_STATUSES, statusColor, statusLabel } from "@/lib/quotes";
import { memberLookup } from "@/lib/members";
import { applyBranchScope, listActiveLocations } from "@/lib/locations";
import { EmptyState } from "@/components/ui/EmptyState";
import { QuotesTable, type QuotesTableRow } from "@/components/quotes/QuotesTable";
import { SavedViewPicker } from "@/components/ui/SavedViewPicker";
import { listSavedViews } from "@/app/actions/saved-views";
import type { Prisma } from "@prisma/client";

export default async function QuotesPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ q?: string; status?: string; branch?: string; attn?: string; superseded?: string }>;
}) {
  const { slug } = await params;
  const sp = await searchParams;
  const ctx = await requirePermission(slug, "quotes:view");
  const canManage = ctx.can("quotes:manage");

  let where: Prisma.QuoteWhereInput = { tenantId: ctx.tenant.id };
  if (sp.status) where.status = sp.status as never;
  if (sp.q) {
    where.OR = [
      { number: { contains: sp.q, mode: "insensitive" } },
      { customer: { name: { contains: sp.q, mode: "insensitive" } } },
    ];
  }
  where = applyBranchScope(where, ctx.branchScope);
  const branches = await listActiveLocations(ctx.tenant.id);
  const branchChoices =
    ctx.branchScope === null ? branches : branches.filter((b) => ctx.branchScope!.includes(b.id));
  if (sp.branch && branchChoices.some((b) => b.id === sp.branch)) {
    where.locationId = sp.branch;
  }

  // Phase 9 Slice E — hide superseded quotes by default. Staff can still
  // opt in via ?superseded=1 to see the archival history, or land there by
  // clicking a link from a revision-chain card.
  const includeSuperseded = sp.superseded === "1";
  if (!includeSuperseded) {
    where.supersededAt = null;
  }

  // Phase 9 Slice E — "Needs attention" filter. A quote needs attention when
  // it's been sitting with the customer for a while with no decision, OR when
  // its expiry window is closing.
  const ATTN_SENT_DAYS    = 7;
  const ATTN_EXPIRY_DAYS  = 3;
  const now = new Date();
  const sentStaleCutoff    = new Date(now.getTime() - ATTN_SENT_DAYS * 24 * 60 * 60 * 1000);
  const expiringSoonCutoff = new Date(now.getTime() + ATTN_EXPIRY_DAYS * 24 * 60 * 60 * 1000);
  const attnActive = sp.attn === "1";
  if (attnActive) {
    where.AND = [
      ...(Array.isArray(where.AND) ? where.AND : where.AND ? [where.AND] : []),
      {
        OR: [
          { status: "SENT",   sentAt:    { lte: sentStaleCutoff } },
          { status: "VIEWED", viewedAt:  { lte: sentStaleCutoff } },
          {
            status:    { in: ["SENT", "VIEWED"] },
            expiresAt: { lte: expiringSoonCutoff, gte: now },
          },
        ],
      },
    ];
  }

  const [quotes, members, savedViews] = await Promise.all([
    db.quote.findMany({
      where,
      orderBy: { updatedAt: "desc" },
      take: 200,
      include: { customer: { select: { id: true, name: true } } },
    }),
    memberLookup(ctx.tenant.id),
    listSavedViews(slug, "quotes"),
  ]);

  function ageFor(q: (typeof quotes)[number]): { days: number; color: string; label: string } | null {
    let anchor: Date | null = null;
    if (q.status === "DRAFT")         anchor = q.createdAt;
    else if (q.status === "SENT")     anchor = q.sentAt   ?? q.createdAt;
    else if (q.status === "VIEWED")   anchor = q.viewedAt ?? q.sentAt ?? q.createdAt;
    else return null;
    if (!anchor) return null;
    const days = Math.max(0, Math.floor((now.getTime() - anchor.getTime()) / (24 * 60 * 60 * 1000)));
    const color = days >= 7 ? "#ef4444" : days >= 3 ? "#f59e0b" : "#6b7280";
    return { days, color, label: days === 0 ? "today" : `${days}d` };
  }

  const hasFilters = !!(sp.q || sp.status || sp.branch || sp.attn || sp.superseded);
  const isFirstRun = quotes.length === 0 && !hasFilters;

  const rows: QuotesTableRow[] = quotes.map((q) => {
    const age = ageFor(q);
    const expiringSoon =
      q.expiresAt && (q.status === "SENT" || q.status === "VIEWED")
        ? q.expiresAt.getTime() <= expiringSoonCutoff.getTime() && q.expiresAt.getTime() >= now.getTime()
        : false;
    return {
      id: q.id,
      number: q.number,
      status: q.status,
      statusLabel: statusLabel(q.status),
      statusColor: statusColor(q.status),
      customerId: q.customer.id,
      customerName: q.customer.name,
      salesRepName: q.salesRepId ? members.get(q.salesRepId)?.name ?? null : null,
      ageLabel: age?.label ?? null,
      ageColor: age?.color ?? null,
      expiresLabel: q.expiresAt ? formatDate(q.expiresAt) : null,
      expiringSoon,
      superseded: !!q.supersededAt,
      total: formatMoney(q.total.toString(), ctx.tenant.currency),
      // Approved quotes are used downstream — keep delete disabled so the
      // client menu can greyed-out the option instead of silent-failing.
      canDelete: q.status !== "APPROVED",
    };
  });

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Quotes</h1>
          <p className="mt-1 text-sm" style={{ color: "var(--muted)" }}>
            {quotes.length} {quotes.length === 1 ? "quote" : "quotes"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link href={`/t/${slug}/quotes/templates`} className="text-sm underline" style={{ color: "var(--muted)" }}>
            Templates
          </Link>
          <SavedViewPicker
            slug={slug}
            entityKind="quotes"
            views={savedViews}
            canShare={ctx.role === "OWNER" || ctx.role === "ADMIN"}
          />
          {canManage && (
            <Link href={`/t/${slug}/quotes/new`}>
              <Button type="button">New quote</Button>
            </Link>
          )}
        </div>
      </div>

      <form className="mt-6 flex flex-wrap items-center gap-2 text-sm" method="get">
        <input
          name="q"
          defaultValue={sp.q ?? ""}
          placeholder="Search quote # or customer…"
          className="flex-1 min-w-[220px] rounded-md px-3 py-2 outline-none"
          style={{ background: "var(--panel)", border: "1px solid var(--border)", color: "var(--text)" }}
        />
        <select
          name="status"
          defaultValue={sp.status ?? ""}
          className="rounded-md px-3 py-2"
          style={{ background: "var(--panel)", border: "1px solid var(--border)", color: "var(--text)" }}
        >
          <option value="">All statuses</option>
          {QUOTE_STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
        </select>
        {branchChoices.length > 1 && (
          <select name="branch" defaultValue={sp.branch ?? ""} className="rounded-md px-3 py-2"
            style={{ background: "var(--panel)", border: "1px solid var(--border)", color: "var(--text)" }}>
            <option value="">All branches</option>
            {branchChoices.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        )}
        <label className="flex items-center gap-1" style={{ color: "var(--muted)" }}>
          <input type="checkbox" name="attn" value="1" defaultChecked={sp.attn === "1"} /> Needs attention
        </label>
        <label className="flex items-center gap-1" style={{ color: "var(--muted)" }}>
          <input type="checkbox" name="superseded" value="1" defaultChecked={sp.superseded === "1"} /> Include superseded
        </label>
        <Button type="submit" variant="secondary">Filter</Button>
      </form>

      {attnActive && (
        <div
          className="mt-3 rounded-md px-3 py-2 text-xs"
          style={{
            background: "var(--surface-1)",
            border: "1px solid var(--border-subtle)",
            color: "var(--text-muted)",
          }}
        >
          Showing open quotes that are either <strong>{ATTN_SENT_DAYS}+ days stale</strong> (sent
          but not decided) or <strong>expiring within {ATTN_EXPIRY_DAYS} days</strong>. Clear the
          checkbox to see every quote again.
        </div>
      )}

      {isFirstRun ? (
        <Card className="mt-4">
          <EmptyState
            icon={<span aria-hidden>📄</span>}
            title="No quotes yet"
            description={
              <>
                Quotes are where the money conversation starts. Line-item a
                job, send it for approval, and convert it to an order in one
                click when the customer says yes. Your first quote sets the
                tone — load a few line items and watch the workflow light
                up downstream.
              </>
            }
            action={
              canManage && (
                <Link
                  href={`/t/${slug}/quotes/new`}
                  className="inline-flex items-center rounded-md px-3 py-1.5 text-sm font-semibold transition-colors hover:brightness-110"
                  style={{
                    background: "var(--accent-primary)",
                    color: "var(--accent-fg)",
                  }}
                >
                  Create your first quote
                </Link>
              )
            }
            secondary={
              canManage && !ctx.tenant.sampleDataLoadedAt ? (
                <Link
                  href={`/t/${slug}/settings/sample-data`}
                  className="text-xs underline"
                  style={{ color: "var(--text-muted)" }}
                >
                  Or load a demo shop to explore
                </Link>
              ) : undefined
            }
          />
        </Card>
      ) : (
        <div className="mt-4">
          <QuotesTable
            slug={slug}
            canEdit={canManage}
            rows={rows}
            empty={
              <div
                className="px-4 py-8 text-center text-sm"
                style={{ color: "var(--text-muted)" }}
              >
                No quotes match these filters.{" "}
                <Link href={`/t/${slug}/quotes`} className="underline">
                  Clear filters
                </Link>
              </div>
            }
          />
        </div>
      )}
    </div>
  );
}
