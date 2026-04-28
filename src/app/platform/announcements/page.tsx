import Link from "next/link";
import { db } from "@/lib/db";
import { requirePlatformStaff } from "@/lib/platform";
import type { AnnouncementType, AnnouncementPriority, AnnouncementStatus, Prisma } from "@prisma/client";
import { createAnnouncement, liveStatus, type LiveStatus } from "@/app/actions/announcements";
import { AnnouncementsKPIBand, type AnnouncementsKpi } from "@/components/platform/AnnouncementsKPIBand";

// /platform/announcements — communications feed.
//
// List of every announcement (draft / scheduled / live / expired /
// archived) with KPI band, type + status filters, and a "+ New" button
// that drops a draft and routes to the edit page.

export const dynamic = "force-dynamic";

const TYPE_FILTERS = ["ALL", "RELEASE", "NEW_FEATURE", "MAINTENANCE", "INCIDENT", "PRICING", "GENERAL"] as const;
const STATUS_FILTERS = ["ALL", "DRAFT", "SCHEDULED", "PUBLISHED", "ARCHIVED"] as const;

const TYPE_TONE: Record<AnnouncementType, { bg: string; fg: string; icon: string; label: string }> = {
  RELEASE:     { bg: "var(--accent-surface)",  fg: "var(--accent-primary)", icon: "🚀", label: "Release" },
  NEW_FEATURE: { bg: "var(--accent-surface)",  fg: "var(--accent-primary)", icon: "✨", label: "Feature" },
  MAINTENANCE: { bg: "var(--warning-surface)", fg: "var(--warning-fg)",     icon: "🔧", label: "Maintenance" },
  INCIDENT:    { bg: "var(--danger-surface)",  fg: "var(--danger-fg)",      icon: "⚠",  label: "Incident" },
  PRICING:     { bg: "var(--warning-surface)", fg: "var(--warning-fg)",     icon: "💲", label: "Pricing" },
  GENERAL:     { bg: "var(--surface-2)",       fg: "var(--text-muted)",     icon: "📢", label: "General" },
};

const PRIORITY_TONE: Record<AnnouncementPriority, { bg: string; fg: string; label: string }> = {
  INFO:      { bg: "var(--surface-2)",       fg: "var(--text-muted)", label: "Info" },
  IMPORTANT: { bg: "var(--accent-surface)",  fg: "var(--accent-primary)", label: "Important" },
  CRITICAL:  { bg: "var(--danger-surface)",  fg: "var(--danger-fg)",  label: "Critical" },
};

const LIVE_TONE: Record<LiveStatus, { bg: string; fg: string; dot: boolean; label: string }> = {
  draft:     { bg: "var(--surface-2)",       fg: "var(--text-muted)",     dot: false, label: "Draft" },
  scheduled: { bg: "var(--accent-surface)",  fg: "var(--accent-primary)", dot: true,  label: "Scheduled" },
  live:      { bg: "var(--success-surface)", fg: "var(--success-fg)",     dot: true,  label: "Live" },
  expired:   { bg: "var(--surface-2)",       fg: "var(--text-faint)",     dot: false, label: "Expired" },
  archived:  { bg: "var(--surface-2)",       fg: "var(--text-faint)",     dot: false, label: "Archived" },
};

export default async function PlatformAnnouncementsPage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string; status?: string; q?: string; ok?: string; error?: string }>;
}) {
  await requirePlatformStaff();
  const sp = await searchParams;

  const typeRaw = (sp.type ?? "ALL").toUpperCase();
  const statusRaw = (sp.status ?? "ALL").toUpperCase();
  const type   = (TYPE_FILTERS   as readonly string[]).includes(typeRaw)   ? (typeRaw   as (typeof TYPE_FILTERS)[number])   : "ALL";
  const status = (STATUS_FILTERS as readonly string[]).includes(statusRaw) ? (statusRaw as (typeof STATUS_FILTERS)[number]) : "ALL";
  const q = (sp.q ?? "").trim();

  const where: Prisma.PlatformAnnouncementWhereInput = {};
  if (type   !== "ALL") where.type   = type   as AnnouncementType;
  if (status !== "ALL") where.status = status as AnnouncementStatus;
  if (q) {
    where.OR = [
      { title: { contains: q, mode: "insensitive" } },
      { body:  { contains: q, mode: "insensitive" } },
    ];
  }

  const [items, byStatus] = await Promise.all([
    db.platformAnnouncement.findMany({
      where,
      orderBy: [
        { status: "asc" },          // DRAFT first alphabetically? we'll just custom-sort below
        { publishedAt: "desc" },
        { createdAt: "desc" },
      ],
      take: 200,
    }),
    db.platformAnnouncement.groupBy({ by: ["status"], _count: { _all: true } }),
  ]);

  const counts = Object.fromEntries(byStatus.map((c) => [c.status, c._count._all])) as Partial<Record<AnnouncementStatus, number>>;

  const now = new Date();
  // "Live" KPI count = published + scheduled-but-publishAt-passed + not expired.
  const liveCount = items.filter((it) => liveStatus(it, now) === "live").length;
  const criticalLive = items.filter((it) => liveStatus(it, now) === "live" && it.priority === "CRITICAL").length;

  // Re-sort the visible list: live first, then scheduled, then drafts,
  // then expired, then archived. Within each bucket: most recent first.
  items.sort((a, b) => {
    const order: LiveStatus[] = ["live", "scheduled", "draft", "expired", "archived"];
    const aOrder = order.indexOf(liveStatus(a, now));
    const bOrder = order.indexOf(liveStatus(b, now));
    if (aOrder !== bOrder) return aOrder - bOrder;
    const aT = (a.publishedAt ?? a.createdAt).getTime();
    const bT = (b.publishedAt ?? b.createdAt).getTime();
    return bT - aT;
  });

  const kpis: AnnouncementsKpi[] = [
    {
      label: "Live",
      value: liveCount.toLocaleString(),
      hint: liveCount === 0 ? "Nothing currently visible to tenants" : "Currently visible to tenants",
      tone: liveCount > 0 ? "success" : "default",
    },
    {
      label: "Scheduled",
      value: (counts.SCHEDULED ?? 0).toString(),
      hint: counts.SCHEDULED ? "Will go live automatically" : "—",
      tone: (counts.SCHEDULED ?? 0) > 0 ? "accent" : "default",
    },
    {
      label: "Drafts",
      value: (counts.DRAFT ?? 0).toString(),
      hint: "Not yet published",
      tone: "default",
    },
    {
      label: "Critical now",
      value: criticalLive.toString(),
      hint: criticalLive > 0 ? "High-priority alerts visible to tenants" : "No active critical posts",
      tone: criticalLive > 0 ? "danger" : "default",
    },
  ];

  return (
    <div className="space-y-6">
      {/* ── Header ─────────────────────────────────────── */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight" style={{ color: "var(--text-default)" }}>
            Announcements
          </h1>
          <p className="mt-1 text-sm" style={{ color: "var(--text-muted)" }}>
            Platform-wide broadcasts — release notes, maintenance windows, incidents, pricing changes.
            Live posts surface inside the tenant workspace as banners.
          </p>
        </div>
        <form action={createAnnouncement}>
          <button
            type="submit"
            className="ts-focus rounded-md px-4 py-2 text-sm font-medium"
            style={{ background: "var(--accent-primary)", color: "var(--accent-fg)" }}
          >
            + New announcement
          </button>
        </form>
      </div>

      {/* ── Banners ────────────────────────────────────── */}
      {sp.ok && (
        <Banner tone="success" title="Saved" body={
          sp.ok === "deleted"     ? "Announcement deleted." :
          sp.ok === "archived"    ? "Announcement archived." :
          sp.ok === "published"   ? "Announcement is live." :
          sp.ok === "scheduled"   ? "Announcement scheduled." :
          sp.ok === "unpublished" ? "Announcement returned to draft." :
          "Saved."
        } />
      )}
      {sp.error && <Banner tone="danger" title="Action failed" body={decodeURIComponent(sp.error)} />}

      {/* ── KPI band ───────────────────────────────────── */}
      <AnnouncementsKPIBand kpis={kpis} />

      {/* ── Filters ────────────────────────────────────── */}
      <form className="flex flex-wrap items-end gap-2" method="get">
        <label className="block flex-1 min-w-[200px]">
          <span className="mb-1 block text-xs font-medium" style={{ color: "var(--text-muted)" }}>Search</span>
          <input
            name="q"
            defaultValue={q}
            placeholder="Title or body"
            className="ts-focus w-full rounded-md px-3 py-2 text-sm outline-none"
            style={{
              background: "var(--surface-1)",
              border: "1px solid var(--border-default)",
              color: "var(--text-default)",
            }}
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-medium" style={{ color: "var(--text-muted)" }}>Type</span>
          <select
            name="type"
            defaultValue={type}
            className="ts-focus rounded-md px-3 py-2 text-sm outline-none"
            style={{
              background: "var(--surface-1)",
              border: "1px solid var(--border-default)",
              color: "var(--text-default)",
            }}
          >
            {TYPE_FILTERS.map((t) => (<option key={t} value={t}>{t === "ALL" ? "All types" : TYPE_TONE[t as AnnouncementType]?.label ?? t}</option>))}
          </select>
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-medium" style={{ color: "var(--text-muted)" }}>Status</span>
          <select
            name="status"
            defaultValue={status}
            className="ts-focus rounded-md px-3 py-2 text-sm outline-none"
            style={{
              background: "var(--surface-1)",
              border: "1px solid var(--border-default)",
              color: "var(--text-default)",
            }}
          >
            {STATUS_FILTERS.map((s) => (<option key={s} value={s}>{s === "ALL" ? "All statuses" : s.toLowerCase()}</option>))}
          </select>
        </label>
        <button
          type="submit"
          className="ts-focus rounded-md px-4 py-2 text-sm font-medium"
          style={{ background: "var(--accent-primary)", color: "var(--accent-fg)" }}
        >
          Apply
        </button>
        {(q || type !== "ALL" || status !== "ALL") && (
          <Link
            href="/platform/announcements"
            className="self-center text-xs underline"
            style={{ color: "var(--text-muted)" }}
          >
            Clear all
          </Link>
        )}
      </form>

      {/* ── Feed ───────────────────────────────────────── */}
      <div
        className="overflow-hidden rounded-xl"
        style={{
          background: "var(--surface-1)",
          border: "1px solid var(--border-subtle)",
          boxShadow: "var(--shadow-sm)",
        }}
      >
        {items.length === 0 ? (
          <div className="px-6 py-12 text-center text-sm" style={{ color: "var(--text-muted)" }}>
            <div className="mb-1 text-2xl" aria-hidden>📢</div>
            <div className="font-medium" style={{ color: "var(--text-default)" }}>
              No announcements yet.
            </div>
            <div className="mt-1 text-xs" style={{ color: "var(--text-muted)" }}>
              Click "+ New announcement" to draft your first.
            </div>
          </div>
        ) : (
          <ul>
            {items.map((a, idx) => {
              const typeTone = TYPE_TONE[a.type];
              const prioTone = PRIORITY_TONE[a.priority];
              const live = liveStatus(a, now);
              const liveTone = LIVE_TONE[live];
              const audienceLabel = describeAudience(a);
              return (
                <li
                  key={a.id}
                  style={{ borderTop: idx === 0 ? "none" : "1px solid var(--border-subtle)" }}
                >
                  <Link
                    href={`/platform/announcements/${a.id}`}
                    className="flex items-start gap-4 px-5 py-4 transition-colors hover:opacity-95"
                    style={{ color: "var(--text-default)" }}
                  >
                    {/* Type icon disc */}
                    <span
                      aria-hidden
                      className="mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-base"
                      style={{ background: typeTone.bg, color: typeTone.fg }}
                      title={typeTone.label}
                    >
                      {typeTone.icon}
                    </span>

                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className="rounded-full px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
                          style={{ background: liveTone.bg, color: liveTone.fg, border: `1px solid ${liveTone.fg}` }}
                        >
                          {liveTone.dot && (
                            <span
                              className="mr-1 inline-block h-1.5 w-1.5 rounded-full align-middle"
                              style={{ background: liveTone.fg }}
                            />
                          )}
                          {liveTone.label}
                        </span>
                        <span
                          className="rounded-full px-1.5 py-0.5 text-[10px] font-medium"
                          style={{ background: typeTone.bg, color: typeTone.fg }}
                        >
                          {typeTone.label}
                        </span>
                        {a.priority !== "INFO" && (
                          <span
                            className="rounded-full px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
                            style={{ background: prioTone.bg, color: prioTone.fg }}
                          >
                            {prioTone.label}
                          </span>
                        )}
                        {a.tags.slice(0, 3).map((tag) => (
                          <span
                            key={tag}
                            className="rounded-full px-1.5 py-0.5 text-[10px]"
                            style={{ background: "var(--surface-2)", color: "var(--text-muted)" }}
                          >
                            #{tag}
                          </span>
                        ))}
                      </div>
                      <div
                        className="mt-1 truncate font-semibold"
                        style={{ color: "var(--text-default)" }}
                      >
                        {a.title || <span style={{ color: "var(--text-faint)" }}>Untitled announcement</span>}
                      </div>
                      {a.body && (
                        <div className="mt-1 line-clamp-2 text-xs" style={{ color: "var(--text-muted)" }}>
                          {a.body.slice(0, 220)}{a.body.length > 220 ? "…" : ""}
                        </div>
                      )}
                      <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px]" style={{ color: "var(--text-muted)" }}>
                        <span>👥 {audienceLabel}</span>
                        {a.publishAt && (
                          <span>· publish {a.publishAt.toISOString().slice(0, 16).replace("T", " ")} UTC</span>
                        )}
                        {a.expireAt && (
                          <span>· expires {a.expireAt.toISOString().slice(0, 16).replace("T", " ")} UTC</span>
                        )}
                      </div>
                    </div>

                    <div className="shrink-0 text-right text-xs" style={{ color: "var(--text-muted)" }}>
                      <div className="tabular-nums">
                        {(a.publishedAt ?? a.createdAt).toISOString().slice(0, 10)}
                      </div>
                      <div className="mt-0.5 text-[10px]">
                        {a.publishedAt ? "published" : "created"}
                      </div>
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────── */

function describeAudience(a: {
  audience: string;
  audiencePlans: string[];
  audienceCohorts: string[];
  audienceTenantIds: string[];
}): string {
  if (a.audience === "ALL") return "All tenants";
  if (a.audience === "PLAN") {
    if (a.audiencePlans.length === 0) return "No plans selected";
    return `Plan: ${a.audiencePlans.join(", ")}`;
  }
  if (a.audience === "COHORT") {
    if (a.audienceCohorts.length === 0) return "No cohorts selected";
    return `Cohort: ${a.audienceCohorts.join(", ")}`;
  }
  if (a.audience === "TENANT") {
    if (a.audienceTenantIds.length === 0) return "No tenants selected";
    return `${a.audienceTenantIds.length} tenant${a.audienceTenantIds.length === 1 ? "" : "s"}`;
  }
  return a.audience;
}

function Banner({
  tone,
  title,
  body,
}: {
  tone: "danger" | "success";
  title: string;
  body: string;
}) {
  const palette =
    tone === "danger"
      ? { bg: "var(--danger-surface)",  fg: "var(--danger-fg)",  border: "var(--danger-fg)"  }
      : { bg: "var(--success-surface)", fg: "var(--success-fg)", border: "var(--success-fg)" };
  return (
    <div
      className="rounded-md px-4 py-3 text-sm"
      style={{ background: palette.bg, border: `1px solid ${palette.border}`, color: palette.fg }}
    >
      <div className="font-semibold">{title}</div>
      <div className="mt-0.5 text-xs" style={{ opacity: 0.85 }}>{body}</div>
    </div>
  );
}
