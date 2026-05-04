// Page 35 — Announcements & Changelog command center.
//
// Tab-driven list (All · Drafts · Scheduled · Live · Archived ·
// Changelog · Templates) with KPI strip and filter row. New
// drafts are spun up via createOpsAnnouncement which redirects
// to the editor at [id]/page.tsx.

import Link from "next/link";
import { requirePlatformStaff } from "@/lib/platform";
import {
  loadAnnouncementKpis,
  loadAnnouncementList,
  loadAnnouncementFilterOptions,
  loadTabCounts,
  TAB_KEYS,
  type AnnouncementListFilters,
  type AnnouncementTab,
} from "@/server/platform/announcements";
import {
  createOpsAnnouncement,
} from "@/app/actions/platform-announcements";
import type {
  AnnouncementType,
  AnnouncementAudience,
  AnnouncementChannel,
} from "@prisma/client";
import {
  AUDIENCE_LABEL,
  CHANNEL_LABEL,
  DeferredNote,
  FormError,
  FormOk,
  Kpi,
  TYPE_LABEL,
} from "./_components/shared";
import { TabsBar } from "./_components/TabsBar";
import { AnnouncementList } from "./_components/AnnouncementList";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 25;

const TYPES: AnnouncementType[] = ["RELEASE", "NEW_FEATURE", "MAINTENANCE", "INCIDENT", "PRICING", "GENERAL"];
const AUDIENCES: AnnouncementAudience[] = ["ALL", "PLAN", "COHORT", "TENANT"];
const CHANNELS: AnnouncementChannel[] = ["BANNER", "MODAL", "INBOX", "EMAIL", "CHANGELOG", "PUSH"];

type SP = Record<string, string | string[] | undefined>;

function asString(v: string | string[] | undefined): string | undefined {
  return typeof v === "string" && v.length > 0 ? v : undefined;
}

function parseTab(v: string | undefined): AnnouncementTab {
  return (TAB_KEYS as readonly string[]).includes(v ?? "") ? (v as AnnouncementTab) : "all";
}

export default async function OpsAnnouncementsPage({
  searchParams,
}: {
  searchParams: Promise<SP>;
}) {
  await requirePlatformStaff();
  const sp = await searchParams;

  const tab = parseTab(asString(sp.tab));
  const q = asString(sp.q);
  const typeRaw     = asString(sp.type);
  const audienceRaw = asString(sp.audience);
  const channelRaw  = asString(sp.channel);
  const page = Math.max(1, parseInt(asString(sp.page) ?? "1", 10) || 1);
  const ok    = asString(sp.ok);
  const error = asString(sp.error);

  const filters: AnnouncementListFilters = { tab };
  if (q) filters.q = q;
  if (typeRaw && (TYPES as string[]).includes(typeRaw))             filters.type     = typeRaw     as AnnouncementType;
  if (audienceRaw && (AUDIENCES as string[]).includes(audienceRaw)) filters.audience = audienceRaw as AnnouncementAudience;
  if (channelRaw && (CHANNELS as string[]).includes(channelRaw))    filters.channel  = channelRaw  as AnnouncementChannel;

  const [kpis, tabCounts, list] = await Promise.all([
    loadAnnouncementKpis(),
    loadTabCounts(),
    loadAnnouncementList({ filters, page, pageSize: PAGE_SIZE }),
  ]);
  void loadAnnouncementFilterOptions; // reserved for future plan/cohort filter chips

  const totalPages = Math.max(1, Math.ceil(list.filteredTotal / PAGE_SIZE));

  const buildHref = (overrides: Record<string, string | undefined>): string => {
    const u = new URLSearchParams();
    if (tab !== "all")  u.set("tab", tab);
    if (q)              u.set("q", q);
    if (typeRaw)        u.set("type", typeRaw);
    if (audienceRaw)    u.set("audience", audienceRaw);
    if (channelRaw)     u.set("channel", channelRaw);
    if (page > 1)       u.set("page", String(page));
    for (const [k, v] of Object.entries(overrides)) {
      if (v === undefined || v === "") u.delete(k);
      else u.set(k, v);
    }
    const qs = u.toString();
    return qs ? `/platform/operations/announcements?${qs}` : "/platform/operations/announcements";
  };

  const hrefForTab = (next: AnnouncementTab) =>
    next === "all"
      ? "/platform/operations/announcements"
      : `/platform/operations/announcements?tab=${next}`;

  const hasFiltersApplied = !!(q || typeRaw || audienceRaw || channelRaw);

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-[11px] font-medium" style={{ color: "var(--text-muted)" }}>
            Operations
          </div>
          <h1
            className="mt-1 text-[22px] font-semibold leading-tight"
            style={{ color: "var(--text-default)" }}
          >
            Announcements &amp; changelog
          </h1>
          <p className="mt-1 text-[12px]" style={{ color: "var(--text-muted)" }}>
            Compose multi-channel announcements pushed to tenants.{" "}
            <b style={{ color: "var(--text-default)" }}>{kpis.live.toLocaleString()}</b> live ·{" "}
            <b style={{ color: "var(--text-default)" }}>{kpis.scheduled.toLocaleString()}</b> scheduled ·{" "}
            <b style={{ color: "var(--text-default)" }}>{kpis.drafts.toLocaleString()}</b> in draft.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href="/platform/announcements"
            className="ts-focus rounded-md px-3 py-1.5 text-[11px] font-medium"
            style={{
              background: "var(--surface-1)",
              color: "var(--text-default)",
              border: "1px solid var(--border-default)",
            }}
            title="Legacy announcements queue"
          >
            Legacy
          </Link>
          <form action={createOpsAnnouncement}>
            <button
              type="submit"
              className="ts-focus rounded-md px-3 py-1.5 text-[12px] font-semibold"
              style={{ background: "var(--accent-primary)", color: "var(--accent-fg)" }}
            >
              + New announcement
            </button>
          </form>
        </div>
      </div>

      <FormOk msg={ok} />
      <FormError msg={error} />

      {/* KPI strip */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
        <Kpi label="Drafts"    value={kpis.drafts.toLocaleString()} />
        <Kpi label="Scheduled" value={kpis.scheduled.toLocaleString()} tone={kpis.scheduled > 0 ? "warning" : "default"} />
        <Kpi label="Live"      value={kpis.live.toLocaleString()}      tone={kpis.live > 0 ? "good" : "default"} />
        <Kpi label="Archived"  value={kpis.archived.toLocaleString()} />
        <Kpi
          label="Click rate · 30d"
          value={kpis.clickRatePct == null ? "—" : `${(kpis.clickRatePct * 100).toFixed(1)}%`}
          sub={`${kpis.clicks30d.toLocaleString()} of ${kpis.views30d.toLocaleString()}`}
          tone={
            kpis.clickRatePct == null  ? "default" :
            kpis.clickRatePct >= 0.05  ? "good"    :
            kpis.clickRatePct >= 0.02  ? "warning" :
                                         "danger"
          }
        />
        <Kpi
          label="Dismissal rate · 30d"
          value={kpis.dismissalRatePct == null ? "—" : `${(kpis.dismissalRatePct * 100).toFixed(0)}%`}
          sub={`${kpis.dismissals30d.toLocaleString()} dismissed`}
          tone={
            kpis.dismissalRatePct == null ? "default" :
            kpis.dismissalRatePct <= 0.30 ? "good"    :
            kpis.dismissalRatePct <= 0.60 ? "warning" :
                                            "danger"
          }
        />
      </div>

      <DeferredNote>
        <strong>Deferred:</strong> per-channel content variants, A/B traffic split, recurring schedules,
        push notification opt-out, RSS feed for changelog, in-app inbox conversion attribution.
        The schema captures channels + CTA + frequency cap so the tenant-side surfaces can
        light up incrementally.
      </DeferredNote>

      {/* Tabs */}
      <TabsBar active={tab} counts={tabCounts} hrefFor={hrefForTab} />

      {/* Filter row */}
      <form
        method="get"
        className="flex flex-wrap items-end gap-2 rounded-lg border p-3"
        style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)" }}
      >
        {tab !== "all" && <input type="hidden" name="tab" value={tab} />}
        <Field label="Search">
          <input
            name="q"
            defaultValue={q ?? ""}
            placeholder="Title, body, tag…"
            className="ts-focus w-[260px] rounded-md px-2 py-1.5 text-[12px] outline-none"
            style={inputStyle()}
          />
        </Field>
        <Field label="Type">
          <Select name="type" defaultValue={typeRaw ?? ""}>
            <option value="">Any</option>
            {TYPES.map((t) => <option key={t} value={t}>{TYPE_LABEL[t]}</option>)}
          </Select>
        </Field>
        <Field label="Audience">
          <Select name="audience" defaultValue={audienceRaw ?? ""}>
            <option value="">Any</option>
            {AUDIENCES.map((a) => <option key={a} value={a}>{AUDIENCE_LABEL[a]}</option>)}
          </Select>
        </Field>
        <Field label="Channel">
          <Select name="channel" defaultValue={channelRaw ?? ""}>
            <option value="">Any</option>
            {CHANNELS.map((c) => <option key={c} value={c}>{CHANNEL_LABEL[c]}</option>)}
          </Select>
        </Field>
        <button
          type="submit"
          className="ts-focus rounded-md px-3 py-1.5 text-[12px] font-medium"
          style={{ background: "var(--accent-primary)", color: "var(--accent-fg)" }}
        >
          Apply
        </button>
        {hasFiltersApplied && (
          <a
            href={tab === "all"
              ? "/platform/operations/announcements"
              : `/platform/operations/announcements?tab=${tab}`}
            className="self-center text-[11px] underline"
            style={{ color: "var(--text-muted)" }}
          >
            Clear
          </a>
        )}
      </form>

      <AnnouncementList rows={list.rows} />

      {/* Pagination */}
      {totalPages > 1 && (
        <div
          className="flex items-center justify-between text-[11px]"
          style={{ color: "var(--text-muted)" }}
        >
          <span>
            Page <b style={{ color: "var(--text-default)" }}>{page}</b> of {totalPages} ·{" "}
            {list.filteredTotal.toLocaleString()} announcement
            {list.filteredTotal === 1 ? "" : "s"}
          </span>
          <div className="flex items-center gap-1">
            <PageLink href={page > 1 ? buildHref({ page: String(page - 1) }) : null}>‹ Prev</PageLink>
            <PageLink href={page < totalPages ? buildHref({ page: String(page + 1) }) : null}>Next ›</PageLink>
          </div>
        </div>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[10px] font-medium uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>
        {label}
      </span>
      {children}
    </label>
  );
}

function Select({
  name, defaultValue, children,
}: {
  name: string;
  defaultValue: string;
  children: React.ReactNode;
}) {
  return (
    <select
      name={name}
      defaultValue={defaultValue}
      className="ts-focus rounded-md px-2 py-1.5 text-[12px] outline-none"
      style={inputStyle()}
    >
      {children}
    </select>
  );
}

function PageLink({ href, children }: { href: string | null; children: React.ReactNode }) {
  if (!href) {
    return (
      <span
        className="rounded-md px-2 py-1"
        style={{
          color: "var(--text-faint)",
          border: "1px solid var(--border-subtle)",
          opacity: 0.5,
        }}
      >
        {children}
      </span>
    );
  }
  return (
    <Link
      href={href}
      className="ts-focus rounded-md px-2 py-1"
      style={{ color: "var(--text-default)", border: "1px solid var(--border-default)" }}
    >
      {children}
    </Link>
  );
}

function inputStyle(): React.CSSProperties {
  return {
    background: "var(--surface-1)",
    border: "1px solid var(--border-default)",
    color: "var(--text-default)",
  };
}
