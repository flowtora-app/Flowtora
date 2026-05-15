import Link from "next/link";
import { requirePermission } from "@/lib/tenant";
import { db } from "@/lib/db";
import { EmptyState } from "@/components/ui/EmptyState";
import { Card } from "@/components/Card";
import { formatMoney, formatDate } from "@/lib/format";
import { QUOTE_STATUSES, statusColor, statusLabel } from "@/lib/quotes";
import { memberLookup } from "@/lib/members";
import { applyBranchScope, listActiveLocations } from "@/lib/locations";
import { SavedViewPicker } from "@/components/ui/SavedViewPicker";
import { listSavedViews } from "@/app/actions/saved-views";
import { SplitShell } from "@/components/ui/SplitShell";
import { QuoteListRow, type QuoteListRowData } from "@/components/quotes/QuoteListRow";
import { QuotePanel, loadQuoteForPanel } from "@/components/quotes/QuotePanel";
import type { QuotePanelTab } from "@/components/quotes/QuotePanelTabs";
import type { Prisma } from "@prisma/client";

type View = "all" | "open" | "attention" | "won" | "lost";
const VIEWS: { value: View; label: string; hint: string }[] = [
  { value: "all",       label: "All",       hint: "Every quote in scope."                           },
  { value: "open",      label: "Open",      hint: "Draft / Sent / Viewed — still in play."          },
  { value: "attention", label: "Attention", hint: "Stale or expiring soon — needs a nudge."         },
  { value: "won",       label: "Won",       hint: "Approved quotes."                                },
  { value: "lost",      label: "Lost",      hint: "Declined or expired quotes."                     },
];

const VALID_TABS: QuotePanelTab[] = ["overview", "comments", "activity"];

export default async function QuotesPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{
    q?: string;
    status?: string;
    branch?: string;
    view?: View;
    superseded?: string;
    selected?: string;
    tab?: string;
  }>;
}) {
  const { slug } = await params;
  const sp = await searchParams;
  const ctx = await requirePermission(slug, "quotes:view");
  const canManage = ctx.can("quotes:manage");
  const canComment = ctx.can("staff:manage");

  const view: View = VIEWS.some((v) => v.value === sp.view) ? (sp.view as View) : "all";
  const tab: QuotePanelTab =
    sp.tab && VALID_TABS.includes(sp.tab as QuotePanelTab)
      ? (sp.tab as QuotePanelTab)
      : "overview";

  const ATTN_SENT_DAYS = 7;
  const ATTN_EXPIRY_DAYS = 3;
  const now = new Date();
  const sentStaleCutoff = new Date(now.getTime() - ATTN_SENT_DAYS * 86_400_000);
  const expiringSoonCutoff = new Date(now.getTime() + ATTN_EXPIRY_DAYS * 86_400_000);

  let where: Prisma.QuoteWhereInput = { tenantId: ctx.tenant.id };
  if (sp.q) {
    where.OR = [
      { number:   { contains: sp.q, mode: "insensitive" } },
      { customer: { name: { contains: sp.q, mode: "insensitive" } } },
    ];
  }
  if (sp.status) where.status = sp.status as never;
  where = applyBranchScope(where, ctx.branchScope);
  const branches = await listActiveLocations(ctx.tenant.id);
  const branchChoices =
    ctx.branchScope === null ? branches : branches.filter((b) => ctx.branchScope!.includes(b.id));
  if (sp.branch && branchChoices.some((b) => b.id === sp.branch)) {
    where.locationId = sp.branch;
  }

  const includeSuperseded = sp.superseded === "1";
  if (!includeSuperseded) {
    where.supersededAt = null;
  }

  if (view === "open") {
    where.status = { in: ["DRAFT", "SENT", "VIEWED"] };
  } else if (view === "won") {
    where.status = "APPROVED";
  } else if (view === "lost") {
    where.status = { in: ["DECLINED", "EXPIRED"] };
  } else if (view === "attention") {
    where.AND = [
      ...(Array.isArray(where.AND) ? where.AND : where.AND ? [where.AND] : []),
      {
        OR: [
          { status: "SENT",   sentAt:   { lte: sentStaleCutoff } },
          { status: "VIEWED", viewedAt: { lte: sentStaleCutoff } },
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
    const days = Math.max(0, Math.floor((now.getTime() - anchor.getTime()) / 86_400_000));
    const color = days >= 7 ? "var(--danger-fg)" : days >= 3 ? "#f59e0b" : "var(--text-muted)";
    return { days, color, label: days === 0 ? "today" : `${days}d` };
  }

  const rows: QuoteListRowData[] = quotes.map((q) => {
    const age = ageFor(q);
    const expiringSoon =
      !!q.expiresAt &&
      (q.status === "SENT" || q.status === "VIEWED") &&
      q.expiresAt.getTime() <= expiringSoonCutoff.getTime() &&
      q.expiresAt.getTime() >= now.getTime();
    return {
      id: q.id,
      number: q.number,
      customerName: q.customer.name,
      statusLabel: statusLabel(q.status),
      statusColor: statusColor(q.status),
      total: formatMoney(q.total.toString(), ctx.tenant.currency),
      ageLabel: age?.label ?? null,
      ageColor: age?.color ?? null,
      expiresLabel: q.expiresAt ? formatDate(q.expiresAt) : null,
      expiringSoon,
      superseded: !!q.supersededAt,
    };
  });

  const urlSelected = sp.selected && rows.some((r) => r.id === sp.selected) ? sp.selected : null;
  const selectedId = urlSelected ?? (rows[0]?.id ?? null);

  const panelData = selectedId
    ? await loadQuoteForPanel(ctx.tenant.id, selectedId)
    : null;
  if (panelData && panelData.quote) {
    ctx.assertBranchAccess(panelData.quote.locationId);
  }

  const baseParams = new URLSearchParams();
  if (sp.q)      baseParams.set("q",      sp.q);
  if (sp.status) baseParams.set("status", sp.status);
  if (sp.branch) baseParams.set("branch", sp.branch);
  if (sp.superseded === "1") baseParams.set("superseded", "1");
  const buildHref = (v: View) => {
    const p = new URLSearchParams(baseParams);
    if (v !== "all") p.set("view", v);
    const qs = p.toString();
    return `/t/${slug}/quotes${qs ? `?${qs}` : ""}`;
  };

  /* ---------- LEFT RAIL ---------- */
  const listNode = (
    <>
      <div
        className="flex flex-col gap-3 px-3 py-3"
        style={{
          borderBottom: "1px solid var(--border-subtle)",
          background:
            "linear-gradient(180deg, color-mix(in oklab, var(--surface-1) 60%, transparent) 0%, transparent 100%)",
        }}
      >
        <form className="flex flex-col gap-2.5" method="get">
          {view !== "all" && <input type="hidden" name="view" value={view} />}
          {sp.superseded === "1" && <input type="hidden" name="superseded" value="1" />}
          {/* Search field — premium pill input. */}
          <div
            style={{
              position: "relative",
              display: "flex",
              alignItems: "center",
              gap: 8,
              height: 34,
              padding: "0 10px",
              borderRadius: 8,
              background: "color-mix(in oklab, var(--surface-2) 75%, transparent)",
              border: "1px solid var(--border-subtle)",
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ color: "var(--text-faint)", flexShrink: 0 }}>
              <circle cx="11" cy="11" r="7" />
              <path d="m21 21-4.3-4.3" />
            </svg>
            <input
              name="q"
              defaultValue={sp.q ?? ""}
              placeholder="Search quote # or customer…"
              style={{
                flex: 1,
                minWidth: 0,
                background: "transparent",
                border: 0,
                outline: "none",
                color: "var(--text-default)",
                fontSize: 12.5,
                fontWeight: 500,
                letterSpacing: "-0.005em",
              }}
            />
            <button
              type="submit"
              style={{
                flexShrink: 0,
                fontSize: 11,
                fontWeight: 600,
                color: "var(--text-muted)",
                background: "var(--surface-1)",
                border: "1px solid var(--border-subtle)",
                padding: "3px 8px",
                borderRadius: 5,
              }}
            >
              Go
            </button>
          </div>
          {/* Filters row — refined selects. */}
          <div className="flex flex-wrap gap-2 text-xs">
            <select
              name="status"
              defaultValue={sp.status ?? ""}
              className="ts-focus rounded-md outline-none"
              style={{
                background: "var(--surface-2)",
                border: "1px solid var(--border-subtle)",
                color: "var(--text-default)",
                fontSize: 11.5,
                fontWeight: 500,
                padding: "4px 8px",
                height: 28,
              }}
            >
              <option value="">All statuses</option>
              {QUOTE_STATUSES.map((s) => (
                <option key={s.value} value={s.value}>{s.label}</option>
              ))}
            </select>
            {branchChoices.length > 1 && (
              <select
                name="branch"
                defaultValue={sp.branch ?? ""}
                className="ts-focus rounded-md outline-none"
                style={{
                  background: "var(--surface-2)",
                  border: "1px solid var(--border-subtle)",
                  color: "var(--text-default)",
                  fontSize: 11.5,
                  fontWeight: 500,
                  padding: "4px 8px",
                  height: 28,
                }}
              >
                <option value="">All branches</option>
                {branchChoices.map((b) => (
                  <option key={b.id} value={b.id}>{b.name}</option>
                ))}
              </select>
            )}
          </div>
        </form>

        {/* View chips — premium tinted pills with accent-on-active. */}
        <div className="flex flex-wrap gap-1">
          {VIEWS.map((v) => {
            const active = v.value === view;
            return (
              <Link
                key={v.value}
                href={buildHref(v.value)}
                title={v.hint}
                className="ts-focus inline-flex items-center rounded-md transition-colors"
                style={{
                  background: active
                    ? "var(--accent-surface)"
                    : "color-mix(in oklab, var(--surface-2) 60%, transparent)",
                  border: active
                    ? "1px solid color-mix(in oklab, var(--accent-primary) 28%, transparent)"
                    : "1px solid var(--border-subtle)",
                  color: active ? "var(--accent-primary)" : "var(--text-muted)",
                  fontWeight: active ? 700 : 500,
                  fontSize: 11.5,
                  letterSpacing: "-0.005em",
                  padding: "4px 10px",
                  height: 26,
                }}
              >
                {v.label}
              </Link>
            );
          })}
        </div>

        <div
          className="flex items-center justify-between"
          style={{ color: "var(--text-faint)", fontSize: 10.5 }}
        >
          <span style={{ fontWeight: 600, letterSpacing: "0.02em" }}>
            {quotes.length} {quotes.length === 1 ? "quote" : "quotes"}
            {view !== "all" && (
              <span style={{ color: "var(--text-muted)", marginLeft: 4 }}>
                in {VIEWS.find((v) => v.value === view)?.label}
              </span>
            )}
          </span>
          <span className="hidden lg:inline" style={{ letterSpacing: "0.02em" }}>
            ↑↓ navigate · / search
          </span>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {rows.length === 0 ? (
          <div
            className="m-3 rounded-lg p-5 text-center"
            style={{
              background: "color-mix(in oklab, var(--surface-2) 40%, transparent)",
              border: "1px dashed var(--border-subtle)",
              color: "var(--text-muted)",
              fontSize: 12.5,
            }}
          >
            No quotes match these filters.{" "}
            <Link
              href={`/t/${slug}/quotes`}
              className="underline"
              style={{ color: "var(--accent-primary)" }}
            >
              Clear filters
            </Link>
          </div>
        ) : (
          rows.map((row) => (
            <QuoteListRow key={row.id} row={row} selected={row.id === selectedId} />
          ))
        )}
      </div>
    </>
  );

  /* ---------- RIGHT RAIL ---------- */
  let panelNode: React.ReactNode;
  if (!panelData || !panelData.quote) {
    panelNode = (
      <div
        className="flex h-full min-h-[400px] items-center justify-center p-10"
        style={{
          background:
            "radial-gradient(720px circle at 50% -20%, var(--accent-surface), transparent 55%)",
        }}
      >
        <div className="max-w-sm text-center">
          <div
            className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl"
            style={{
              background:
                "linear-gradient(135deg, var(--accent-surface-strong), var(--accent-surface))",
              color: "var(--accent-primary)",
              border:
                "1px solid color-mix(in oklab, var(--accent-primary) 28%, transparent)",
              boxShadow:
                "inset 0 1px 0 0 color-mix(in oklab, white 6%, transparent)",
            }}
          >
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M6 4h9l5 5v11a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1z" />
              <path d="M15 4v5h5M8 13h8M8 17h5" />
            </svg>
          </div>
          <h2
            className="mt-5 font-semibold"
            style={{
              color: "var(--text-default)",
              fontSize: 18,
              letterSpacing: "-0.015em",
              lineHeight: 1.25,
            }}
          >
            Select a quote
          </h2>
          <p
            className="mt-1.5"
            style={{
              color: "var(--text-muted)",
              fontSize: 13,
              lineHeight: 1.5,
            }}
          >
            Pick a row on the left to see line items, status, comments, and activity — without leaving the page.
          </p>
          <div
            className="mt-5 inline-flex items-center gap-3 rounded-lg px-3 py-2"
            style={{
              background: "color-mix(in oklab, var(--surface-2) 50%, transparent)",
              border: "1px solid var(--border-subtle)",
              fontSize: 11,
              color: "var(--text-muted)",
            }}
          >
            <span className="inline-flex items-center gap-1">
              <kbd
                style={{
                  fontSize: 10,
                  fontWeight: 600,
                  color: "var(--text-default)",
                  background: "var(--surface-1)",
                  border: "1px solid var(--border-subtle)",
                  padding: "1px 5px",
                  borderRadius: 4,
                  fontFamily: "var(--font-mono, ui-monospace, monospace)",
                }}
              >↑</kbd>
              <kbd
                style={{
                  fontSize: 10,
                  fontWeight: 600,
                  color: "var(--text-default)",
                  background: "var(--surface-1)",
                  border: "1px solid var(--border-subtle)",
                  padding: "1px 5px",
                  borderRadius: 4,
                  fontFamily: "var(--font-mono, ui-monospace, monospace)",
                }}
              >↓</kbd>
              navigate
            </span>
            <span style={{ color: "var(--text-faint)" }}>·</span>
            <span className="inline-flex items-center gap-1">
              <kbd
                style={{
                  fontSize: 10,
                  fontWeight: 600,
                  color: "var(--text-default)",
                  background: "var(--surface-1)",
                  border: "1px solid var(--border-subtle)",
                  padding: "1px 5px",
                  borderRadius: 4,
                  fontFamily: "var(--font-mono, ui-monospace, monospace)",
                }}
              >/</kbd>
              search
            </span>
          </div>
        </div>
      </div>
    );
  } else {
    panelNode = (
      <QuotePanel
        slug={slug}
        currency={ctx.tenant.currency}
        quote={panelData.quote as never}
        activity={panelData.activity as never}
        tab={tab}
        canManage={canManage}
        canComment={canComment}
        currentUserId={ctx.userId}
        memberMap={members}
      />
    );
  }

  return (
    <div>
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
                Quotes
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
                {quotes.length}
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
              Browse on the left, work on the right — quotes open instantly without leaving the page.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href={`/t/${slug}/quotes/templates`}
              className="ts-focus inline-flex items-center gap-1.5 rounded-lg px-3 transition-colors hover:bg-[var(--surface-3)]"
              style={{
                height: 32,
                fontSize: 12.5,
                fontWeight: 500,
                color: "var(--text-muted)",
                background: "transparent",
                border: "1px solid var(--border-subtle)",
              }}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <path d="M14 2v6h6M16 13H8M16 17H8M10 9H8" />
              </svg>
              Templates
            </Link>
            <SavedViewPicker
              slug={slug}
              entityKind="quotes"
              views={savedViews}
              canShare={ctx.role === "OWNER" || ctx.role === "ADMIN"}
            />
            {canManage && (
              <Link
                href={`/t/${slug}/quotes/new`}
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
                New quote
              </Link>
            )}
          </div>
        </div>
      </div>

      <div className="mt-5">
        {quotes.length === 0 ? (
          <Card className="mt-4">
            <EmptyState
              icon={<span aria-hidden>📄</span>}
              title={view === "all" ? "No quotes yet" : "No quotes match this view"}
              description={
                view === "all"
                  ? "Quotes are where the money conversation starts. Line-item a job, send it for approval, and convert it to an order when the customer says yes."
                  : "Try switching to All, or adjust your filters."
              }
              action={
                canManage && view === "all" ? (
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
                ) : (
                  <Link
                    href={`/t/${slug}/quotes`}
                    className="text-sm underline"
                    style={{ color: "var(--text-muted)" }}
                  >
                    Clear filters
                  </Link>
                )
              }
              secondary={
                canManage && view === "all" && !ctx.tenant.sampleDataLoadedAt ? (
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
          <SplitShell
            list={listNode}
            panel={panelNode}
            entityIds={rows.map((r) => r.id)}
            selectedId={selectedId}
          />
        )}
      </div>
    </div>
  );
}
