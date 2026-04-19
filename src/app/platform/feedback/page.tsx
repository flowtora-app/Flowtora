import Link from "next/link";
import { db } from "@/lib/db";
import { requirePlatformStaff } from "@/lib/platform";
import { Card } from "@/components/Card";
import type { FeedbackKind, Prisma } from "@prisma/client";

// Phase 19 — cross-tenant feedback aggregator.
//
// Platform staff's read view over every Feedback row. Lives next to
// Leads / Readiness in the pre-launch toolkit. No status/triage yet —
// the Feedback model doesn't carry a resolution column, so this slice
// is scoped to inventory + filters + CSV export.

const KIND_OPTIONS   = ["ALL", "IDEA", "BUG", "PRAISE", "OTHER"] as const;
const RATING_OPTIONS = ["ALL", "5", "4", "3", "2", "1"] as const;
type KindFilter   = (typeof KIND_OPTIONS)[number];
type RatingFilter = (typeof RATING_OPTIONS)[number];

const KIND_COLORS: Record<string, string> = {
  IDEA:   "#8bb9ff",
  BUG:    "#ff8b8b",
  PRAISE: "#7dd688",
  OTHER:  "var(--muted)",
};

export default async function PlatformFeedbackPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string; kind?: string; rating?: string; tenantId?: string; days?: string;
  }>;
}) {
  await requirePlatformStaff();
  const sp = await searchParams;
  const q = (sp.q ?? "").trim();
  const kindRaw   = (sp.kind   ?? "ALL").toUpperCase();
  const ratingRaw = (sp.rating ?? "ALL").toUpperCase();
  const kind: KindFilter = (KIND_OPTIONS as readonly string[]).includes(kindRaw)
    ? (kindRaw as KindFilter)
    : "ALL";
  const rating: RatingFilter = (RATING_OPTIONS as readonly string[]).includes(ratingRaw)
    ? (ratingRaw as RatingFilter)
    : "ALL";
  const tenantId = (sp.tenantId ?? "").trim() || null;
  const days = Math.max(0, Math.min(365, Number(sp.days ?? "") || 0));

  const where: Prisma.FeedbackWhereInput = {};
  if (kind !== "ALL")   where.kind = kind as FeedbackKind;
  if (rating !== "ALL") where.rating = Number(rating);
  if (tenantId)         where.tenantId = tenantId;
  if (days > 0) {
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    where.createdAt = { gte: since };
  }
  if (q) {
    where.OR = [
      { summary: { contains: q, mode: "insensitive" } },
      { body:    { contains: q, mode: "insensitive" } },
    ];
  }

  const [items, countsByKind, total] = await Promise.all([
    db.feedback.findMany({
      where,
      orderBy: [{ createdAt: "desc" }],
      take: 300,
    }),
    db.feedback.groupBy({
      by: ["kind"],
      where,
      _count: { _all: true },
    }),
    db.feedback.count({ where }),
  ]);

  // Resolve tenant + user names in bulk.
  const tenantIds = Array.from(new Set(items.map((f) => f.tenantId)));
  const userIds   = Array.from(new Set(items.map((f) => f.userId)));
  const [tenants, users] = await Promise.all([
    tenantIds.length
      ? db.tenant.findMany({
          where:  { id: { in: tenantIds } },
          select: { id: true, name: true, slug: true },
        })
      : Promise.resolve([] as { id: string; name: string; slug: string }[]),
    userIds.length
      ? db.user.findMany({
          where:  { id: { in: userIds } },
          select: { id: true, email: true, name: true },
        })
      : Promise.resolve([] as { id: string; email: string; name: string | null }[]),
  ]);
  const tenantById = new Map(tenants.map((t) => [t.id, t]));
  const userById   = new Map(users.map((u) => [u.id, u]));

  const kindCount = Object.fromEntries(countsByKind.map((c) => [c.kind, c._count._all]));
  const avgRating = (() => {
    const rated = items.filter((f) => typeof f.rating === "number");
    if (!rated.length) return null;
    return (rated.reduce((s, f) => s + (f.rating ?? 0), 0) / rated.length).toFixed(1);
  })();

  const exportQs = new URLSearchParams({
    ...(q ? { q } : {}),
    ...(kind !== "ALL" ? { kind } : {}),
    ...(rating !== "ALL" ? { rating } : {}),
    ...(tenantId ? { tenantId } : {}),
    ...(days ? { days: String(days) } : {}),
  }).toString();

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Feedback</h1>
          <p className="mt-1 text-sm" style={{ color: "var(--muted)" }}>
            <b>{total}</b> entries match ·{" "}
            {(["IDEA", "BUG", "PRAISE", "OTHER"] as const).map((k, i) => (
              <span key={k}>
                {i > 0 ? " · " : ""}
                <span style={{ color: KIND_COLORS[k] }}>{kindCount[k] ?? 0}</span> {k.toLowerCase()}
              </span>
            ))}
            {avgRating && <> · avg rating <b>{avgRating}</b>★</>}
          </p>
        </div>
        <a
          href={`/platform/feedback/export${exportQs ? `?${exportQs}` : ""}`}
          className="rounded-md px-3 py-2 text-xs"
          style={{ border: "1px solid var(--border)", color: "var(--muted)" }}
        >
          Export CSV
        </a>
      </div>

      <form className="flex flex-wrap items-end gap-2" method="get">
        <label className="block flex-1 min-w-[200px]">
          <span className="mb-1 block text-xs" style={{ color: "var(--muted)" }}>Search</span>
          <input
            name="q"
            defaultValue={q}
            placeholder="Summary or body"
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
          <span className="mb-1 block text-xs" style={{ color: "var(--muted)" }}>Rating</span>
          <select
            name="rating"
            defaultValue={rating}
            className="rounded-md px-3 py-2 text-sm outline-none"
            style={{ background: "var(--panel)", border: "1px solid var(--border)", color: "var(--text)" }}
          >
            {RATING_OPTIONS.map((r) => (<option key={r} value={r}>{r === "ALL" ? "Any" : `${r}★`}</option>))}
          </select>
        </label>
        <label className="block">
          <span className="mb-1 block text-xs" style={{ color: "var(--muted)" }}>Last N days</span>
          <input
            name="days"
            type="number"
            min={0}
            max={365}
            defaultValue={days || ""}
            placeholder="any"
            className="w-24 rounded-md px-3 py-2 text-sm outline-none"
            style={{ background: "var(--panel)", border: "1px solid var(--border)", color: "var(--text)" }}
          />
        </label>
        {tenantId && (
          <div className="flex items-end gap-2">
            <input type="hidden" name="tenantId" value={tenantId} />
            <span className="rounded-md px-2 py-1 text-xs" style={{ border: "1px solid var(--border)", color: "var(--muted)" }}>
              Tenant: {tenantById.get(tenantId)?.name ?? tenantId.slice(0, 8)}
            </span>
          </div>
        )}
        <button
          type="submit"
          className="rounded-md px-4 py-2 text-sm font-medium"
          style={{ background: "var(--accent)", color: "white" }}
        >
          Filter
        </button>
        {(q || kind !== "ALL" || rating !== "ALL" || tenantId || days) && (
          <Link href="/platform/feedback" className="text-xs underline" style={{ color: "var(--muted)" }}>
            Clear
          </Link>
        )}
      </form>

      <Card>
        {items.length === 0 ? (
          <p className="px-5 py-4 text-sm" style={{ color: "var(--muted)" }}>No feedback matches.</p>
        ) : (
          <ul>
            {items.map((f) => {
              const tenant = tenantById.get(f.tenantId);
              const user   = userById.get(f.userId);
              return (
                <li key={f.id} style={{ borderTop: "1px solid var(--border)" }}>
                  <div className="px-5 py-3 text-sm">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span
                            className="rounded-full px-2 py-0.5 text-xs"
                            style={{ color: KIND_COLORS[f.kind], border: `1px solid ${KIND_COLORS[f.kind]}` }}
                          >
                            {f.kind}
                          </span>
                          {typeof f.rating === "number" && (
                            <span className="text-xs" style={{ color: "#ffc98b" }}>
                              {"★".repeat(f.rating)}{"☆".repeat(5 - f.rating)}
                            </span>
                          )}
                          {tenant ? (
                            <Link
                              href={`/platform/tenants/${tenant.id}`}
                              className="text-xs underline"
                              style={{ color: "var(--muted)" }}
                            >
                              {tenant.name}
                            </Link>
                          ) : (
                            <span className="text-xs" style={{ color: "var(--muted)" }}>unknown tenant</span>
                          )}
                          {tenant && (
                            <Link
                              href={`/platform/feedback?tenantId=${tenant.id}`}
                              className="text-[10px] underline"
                              style={{ color: "var(--muted)" }}
                            >
                              only this tenant
                            </Link>
                          )}
                        </div>
                        <div className="mt-1 font-medium">{f.summary}</div>
                        {f.body && (
                          <div className="mt-1 whitespace-pre-wrap text-xs" style={{ color: "var(--muted)" }}>
                            {f.body.length > 400 ? `${f.body.slice(0, 400)}…` : f.body}
                          </div>
                        )}
                        <div className="mt-1 text-[10px]" style={{ color: "var(--muted)" }}>
                          {user ? (user.name ?? user.email) : "unknown user"}
                          {f.context && <> · <span style={{ fontFamily: "monospace" }}>{f.context}</span></>}
                        </div>
                      </div>
                      <div className="shrink-0 text-right text-xs" style={{ color: "var(--muted)" }}>
                        {f.createdAt.toISOString().replace("T", " ").slice(0, 16)}
                      </div>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      {items.length >= 300 && (
        <p className="text-xs" style={{ color: "var(--muted)" }}>
          Showing the most recent 300. Tighten filters or export CSV for a larger window.
        </p>
      )}
    </div>
  );
}
