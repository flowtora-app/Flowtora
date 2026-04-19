import Link from "next/link";
import { db } from "@/lib/db";
import { requirePlatformStaff } from "@/lib/platform";
import { Card } from "@/components/Card";
import type { MarketingLeadKind, MarketingLeadStatus, Prisma } from "@prisma/client";

// Phase 19 — platform marketing lead inbox.
//
// Every contact-form / book-demo / newsletter submission lands in
// MarketingLead. This page is the sales queue: filter by kind + status,
// see who's assigned, click through to triage.

const STATUS_OPTIONS  = ["ALL", "NEW", "CONTACTED", "QUALIFIED", "CONVERTED", "DISQUALIFIED", "SPAM"] as const;
const KIND_OPTIONS    = ["ALL", "INQUIRY", "DEMO", "NEWSLETTER", "TRIAL_ABANDON"] as const;
type StatusFilter = (typeof STATUS_OPTIONS)[number];
type KindFilter   = (typeof KIND_OPTIONS)[number];

const STATUS_COLORS: Record<string, string> = {
  NEW:           "#8bb9ff",
  CONTACTED:     "#ffc98b",
  QUALIFIED:     "#7dd688",
  CONVERTED:     "#8b5cf6",
  DISQUALIFIED:  "var(--muted)",
  SPAM:          "#ff8b8b",
};

export default async function PlatformLeadsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string; kind?: string; mine?: string }>;
}) {
  const ctx = await requirePlatformStaff();
  const sp = await searchParams;
  const q = (sp.q ?? "").trim();
  const statusRaw = (sp.status ?? "ALL").toUpperCase();
  const kindRaw   = (sp.kind   ?? "ALL").toUpperCase();
  const status: StatusFilter = (STATUS_OPTIONS as readonly string[]).includes(statusRaw)
    ? (statusRaw as StatusFilter)
    : "ALL";
  const kind: KindFilter = (KIND_OPTIONS as readonly string[]).includes(kindRaw)
    ? (kindRaw as KindFilter)
    : "ALL";
  const onlyMine = sp.mine === "1";

  const where: Prisma.MarketingLeadWhereInput = {};
  if (status !== "ALL") where.status = status as MarketingLeadStatus;
  if (kind   !== "ALL") where.kind   = kind   as MarketingLeadKind;
  if (onlyMine)         where.assignedToUserId = ctx.userId;
  if (q) {
    where.OR = [
      { email:   { contains: q, mode: "insensitive" } },
      { name:    { contains: q, mode: "insensitive" } },
      { company: { contains: q, mode: "insensitive" } },
    ];
  }

  const [leads, countsByStatus] = await Promise.all([
    db.marketingLead.findMany({
      where,
      orderBy: [{ createdAt: "desc" }],
      take: 200,
    }),
    db.marketingLead.groupBy({
      by: ["status"],
      _count: { _all: true },
    }),
  ]);

  const statusCount = Object.fromEntries(countsByStatus.map((c) => [c.status, c._count._all]));
  const newCount    = statusCount.NEW       ?? 0;
  const activeCount = (statusCount.NEW      ?? 0) + (statusCount.CONTACTED ?? 0) + (statusCount.QUALIFIED ?? 0);

  const assigneeIds = Array.from(
    new Set(leads.map((l) => l.assignedToUserId).filter((x): x is string => Boolean(x))),
  );
  const assignees = assigneeIds.length
    ? await db.user.findMany({
        where:  { id: { in: assigneeIds } },
        select: { id: true, email: true, name: true },
      })
    : [];
  const assigneeById = new Map(assignees.map((a) => [a.id, a]));

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Marketing leads</h1>
          <p className="mt-1 text-sm" style={{ color: "var(--muted)" }}>
            Every public-site submission in one inbox. <b>{newCount}</b> untouched · <b>{activeCount}</b> in active pipeline.
          </p>
        </div>
        <Link
          href={`/platform/leads?${new URLSearchParams({
            ...(q ? { q } : {}),
            status,
            kind,
            ...(onlyMine ? {} : { mine: "1" }),
          }).toString()}`}
          className="rounded-md px-3 py-2 text-xs"
          style={{ border: "1px solid var(--border)", color: onlyMine ? "var(--accent)" : "var(--muted)" }}
        >
          {onlyMine ? "Showing: mine only" : "Show only mine"}
        </Link>
      </div>

      <form className="flex flex-wrap items-end gap-2" method="get">
        <label className="block flex-1 min-w-[200px]">
          <span className="mb-1 block text-xs" style={{ color: "var(--muted)" }}>Search</span>
          <input
            name="q"
            defaultValue={q}
            placeholder="Email, name, or company"
            className="w-full rounded-md px-3 py-2 text-sm outline-none"
            style={{ background: "var(--panel)", border: "1px solid var(--border)", color: "var(--text)" }}
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs" style={{ color: "var(--muted)" }}>Kind</span>
          <select
            name="kind"
            defaultValue={kind}
            className="rounded-md px-3 py-2 text-sm outline-none"
            style={{ background: "var(--panel)", border: "1px solid var(--border)", color: "var(--text)" }}
          >
            {KIND_OPTIONS.map((k) => (<option key={k} value={k}>{k}</option>))}
          </select>
        </label>
        <label className="block">
          <span className="mb-1 block text-xs" style={{ color: "var(--muted)" }}>Status</span>
          <select
            name="status"
            defaultValue={status}
            className="rounded-md px-3 py-2 text-sm outline-none"
            style={{ background: "var(--panel)", border: "1px solid var(--border)", color: "var(--text)" }}
          >
            {STATUS_OPTIONS.map((s) => (<option key={s} value={s}>{s}</option>))}
          </select>
        </label>
        {onlyMine && <input type="hidden" name="mine" value="1" />}
        <button
          type="submit"
          className="rounded-md px-4 py-2 text-sm font-medium"
          style={{ background: "var(--accent)", color: "white" }}
        >
          Filter
        </button>
        {(q || status !== "ALL" || kind !== "ALL" || onlyMine) && (
          <Link href="/platform/leads" className="text-xs underline" style={{ color: "var(--muted)" }}>
            Clear
          </Link>
        )}
      </form>

      <Card>
        {leads.length === 0 ? (
          <p className="px-5 py-4 text-sm" style={{ color: "var(--muted)" }}>No leads match.</p>
        ) : (
          <ul>
            {leads.map((l) => {
              const assignee = l.assignedToUserId ? assigneeById.get(l.assignedToUserId) : null;
              return (
                <li key={l.id} style={{ borderTop: "1px solid var(--border)" }}>
                  <Link href={`/platform/leads/${l.id}`} className="block px-5 py-3 text-sm">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span
                            className="rounded-full px-2 py-0.5 text-xs"
                            style={{ color: STATUS_COLORS[l.status], border: `1px solid ${STATUS_COLORS[l.status]}` }}
                          >
                            {l.status}
                          </span>
                          <span className="text-xs font-medium uppercase tracking-wide" style={{ color: "var(--muted)" }}>
                            {l.kind}
                          </span>
                          {l.businessType && (
                            <span className="text-xs" style={{ color: "var(--muted)" }}>· {l.businessType}</span>
                          )}
                        </div>
                        <div className="mt-1 truncate font-medium">
                          {l.name ?? l.email}
                          {l.company && (
                            <span className="ml-2 text-xs font-normal" style={{ color: "var(--muted)" }}>
                              at {l.company}
                            </span>
                          )}
                        </div>
                        <div className="mt-0.5 truncate text-xs" style={{ color: "var(--muted)" }}>
                          {l.email}
                          {l.message && <> · {l.message.slice(0, 80)}{l.message.length > 80 ? "…" : ""}</>}
                        </div>
                      </div>
                      <div className="shrink-0 text-right text-xs" style={{ color: "var(--muted)" }}>
                        <div>{assignee ? `→ ${assignee.name ?? assignee.email}` : "unassigned"}</div>
                        <div>{relative(l.createdAt)}</div>
                      </div>
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </div>
  );
}

function relative(d: Date): string {
  const mins = Math.round((Date.now() - d.getTime()) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.round(hrs / 24);
  return `${days}d ago`;
}
