// Page 38 — Landing Pages list.

import Link from "next/link";
import { requirePlatformStaff } from "@/lib/platform";
import {
  loadLandingPageKpis,
  loadLandingPageList,
  loadTemplates,
  type LandingPageFilters,
} from "@/server/platform/landing-pages";
import { createLandingPage } from "@/app/actions/platform-landing-pages";
import type { LandingPageStatus } from "@prisma/client";
import {
  FormError,
  FormOk,
  Kpi,
  STATUS_LABEL,
  StatusPill,
  relativeFromNow,
} from "./_components/shared";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 25;
const STATUSES: LandingPageStatus[] = ["DRAFT", "SCHEDULED", "LIVE", "ARCHIVED"];

type SP = Record<string, string | string[] | undefined>;
const asString = (v: string | string[] | undefined): string | undefined =>
  typeof v === "string" && v.length > 0 ? v : undefined;

export default async function LandingPagesListPage({
  searchParams,
}: {
  searchParams: Promise<SP>;
}) {
  const ctx = await requirePlatformStaff();
  const sp = await searchParams;
  const canWrite = ctx.can("announcement.write");

  const page = Math.max(1, parseInt(asString(sp.page) ?? "1", 10) || 1);
  const ok = asString(sp.ok);
  const error = asString(sp.error);

  const filters: LandingPageFilters = {};
  const q = asString(sp.q); if (q) filters.q = q;
  const status = asString(sp.status);
  if (status && (STATUSES as string[]).includes(status)) filters.status = status as LandingPageStatus;

  const [kpis, list, templates] = await Promise.all([
    loadLandingPageKpis(),
    loadLandingPageList({ filters, page, pageSize: PAGE_SIZE }),
    loadTemplates(),
  ]);
  const totalPages = Math.max(1, Math.ceil(list.filteredTotal / PAGE_SIZE));

  const buildHref = (overrides: Record<string, string | undefined>): string => {
    const u = new URLSearchParams();
    if (q) u.set("q", q);
    if (status) u.set("status", status);
    if (page > 1) u.set("page", String(page));
    for (const [k, v] of Object.entries(overrides)) {
      if (v === undefined || v === "") u.delete(k);
      else u.set(k, v);
    }
    const qs = u.toString();
    return qs ? `/platform/marketing/landing-pages?${qs}` : "/platform/marketing/landing-pages";
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-[11px] font-medium" style={{ color: "var(--text-muted)" }}>
            Marketing
          </div>
          <h1
            className="mt-1 text-[22px] font-semibold leading-tight"
            style={{ color: "var(--text-default)" }}
          >
            Landing pages
          </h1>
          <p className="mt-1 text-[12px]" style={{ color: "var(--text-muted)" }}>
            Block-based CMS for marketing pages with A/B testing, custom domains, and form capture.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link href="/platform/marketing/landing-pages/templates"
                className="ts-focus rounded-md px-3 py-1.5 text-[11px] font-medium"
                style={{ background: "var(--surface-1)", color: "var(--text-default)", border: "1px solid var(--border-default)" }}>
            Templates
          </Link>
          <Link href="/platform/marketing/landing-pages/domains"
                className="ts-focus rounded-md px-3 py-1.5 text-[11px] font-medium"
                style={{ background: "var(--surface-1)", color: "var(--text-default)", border: "1px solid var(--border-default)" }}>
            Domains
          </Link>
          <Link href="/platform/marketing/landing-pages/submissions"
                className="ts-focus rounded-md px-3 py-1.5 text-[11px] font-medium"
                style={{ background: "var(--surface-1)", color: "var(--text-default)", border: "1px solid var(--border-default)" }}>
            Form submissions
          </Link>
        </div>
      </div>

      <FormOk msg={ok} />
      <FormError msg={error} />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-7">
        <Kpi label="Total" value={kpis.total.toLocaleString()} />
        <Kpi label="Live" value={kpis.live.toLocaleString()} tone={kpis.live > 0 ? "good" : "default"} />
        <Kpi label="Scheduled" value={kpis.scheduled.toLocaleString()} tone={kpis.scheduled > 0 ? "warning" : "default"} />
        <Kpi label="Drafts" value={kpis.draft.toLocaleString()} />
        <Kpi label="Sessions · 30d" value={kpis.sessions30d.toLocaleString()} />
        <Kpi label="Submissions · 30d" value={kpis.submissions30d.toLocaleString()} />
        <Kpi
          label="Conv rate · 30d"
          value={kpis.conversionRatePct == null ? "—" : `${kpis.conversionRatePct.toFixed(2)}%`}
          tone={kpis.conversionRatePct == null ? "default" : kpis.conversionRatePct >= 3 ? "good" : kpis.conversionRatePct >= 1 ? "warning" : "danger"}
        />
      </div>

      {/* Filter row */}
      <form
        method="get"
        className="flex flex-wrap items-end gap-2 rounded-lg border p-3"
        style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)" }}
      >
        <Field label="Search">
          <input
            name="q"
            defaultValue={q ?? ""}
            placeholder="Title, path, description…"
            className="ts-focus w-[260px] rounded-md px-2 py-1.5 text-[12px] outline-none"
            style={inputStyle()}
          />
        </Field>
        <Field label="Status">
          <Select name="status" defaultValue={status ?? ""}>
            <option value="">Any</option>
            {STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
          </Select>
        </Field>
        <button
          type="submit"
          className="ts-focus rounded-md px-3 py-1.5 text-[12px] font-medium"
          style={{ background: "var(--accent-primary)", color: "var(--accent-fg)" }}
        >
          Apply
        </button>
        {(q || status) && (
          <a
            href="/platform/marketing/landing-pages"
            className="self-center text-[11px] underline"
            style={{ color: "var(--text-muted)" }}
          >
            Clear
          </a>
        )}
      </form>

      {/* + New page */}
      {canWrite && (
        <form
          action={createLandingPage}
          className="flex flex-wrap items-end gap-2 rounded-lg border p-3"
          style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)" }}
        >
          <Field label="New page — path">
            <input
              name="path"
              required
              placeholder="/pricing  or  /features/automation"
              className="ts-focus w-[260px] rounded-md px-2 py-1.5 text-[12px] font-mono outline-none"
              style={inputStyle()}
            />
          </Field>
          <Field label="Title">
            <input
              name="title"
              required
              placeholder="e.g. Flowtora — Pricing"
              className="ts-focus w-[260px] rounded-md px-2 py-1.5 text-[12px] outline-none"
              style={inputStyle()}
            />
          </Field>
          <Field label="From template (optional)">
            <Select name="templateId" defaultValue="">
              <option value="">— Default starter —</option>
              {templates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </Select>
          </Field>
          <button
            type="submit"
            className="ts-focus rounded-md px-3 py-1.5 text-[12px] font-medium"
            style={{ background: "var(--accent-primary)", color: "var(--accent-fg)" }}
          >
            + Create
          </button>
        </form>
      )}

      {/* List */}
      {list.rows.length === 0 ? (
        <div
          className="rounded-lg border p-10 text-center text-[12px]"
          style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)", color: "var(--text-muted)" }}
        >
          <div className="mb-1 text-2xl" aria-hidden>🪧</div>
          <div className="font-medium" style={{ color: "var(--text-default)" }}>
            No landing pages match.
          </div>
        </div>
      ) : (
        <div
          className="overflow-hidden rounded-lg"
          style={{ background: "var(--surface-1)", border: "1px solid var(--border-subtle)" }}
        >
          <div
            className="hidden grid-cols-[140px_minmax(0,1fr)_120px_140px_90px_90px_90px_120px] gap-3 border-b px-3 py-2 text-[10px] font-semibold uppercase tracking-wide md:grid"
            style={{
              borderColor: "var(--border-subtle)",
              background: "var(--surface-2)",
              color: "var(--text-muted)",
            }}
          >
            <div>Path</div>
            <div>Title</div>
            <div>Status</div>
            <div>Author</div>
            <div className="text-right">Sessions 30d</div>
            <div className="text-right">Conv</div>
            <div className="text-right">Conv %</div>
            <div className="text-right">Updated</div>
          </div>
          <ul>
            {list.rows.map((r, idx) => (
              <li
                key={r.id}
                style={{ borderTop: idx === 0 ? "none" : "1px solid var(--border-subtle)" }}
              >
                <Link
                  href={`/platform/marketing/landing-pages/${r.id}`}
                  className="grid items-start gap-3 px-3 py-3 md:grid-cols-[140px_minmax(0,1fr)_120px_140px_90px_90px_90px_120px]"
                  style={{ color: "var(--text-default)" }}
                >
                  <div className="truncate text-[12px] font-mono" style={{ color: "var(--text-muted)" }}>
                    {r.path}
                  </div>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-1.5">
                      {r.customDomainHostname && (
                        <span
                          className="rounded-full px-1.5 py-0.5 text-[10px] font-medium"
                          style={{ background: "var(--surface-2)", color: "var(--text-muted)" }}
                          title="Custom domain"
                        >
                          🔗 {r.customDomainHostname}
                        </span>
                      )}
                      {r.variantCount > 0 && (
                        <span
                          className="rounded-full px-1.5 py-0.5 text-[10px] font-medium"
                          style={{ background: "var(--accent-surface)", color: "var(--accent-primary)" }}
                          title="A/B test active"
                        >
                          A/B · {r.variantCount}
                        </span>
                      )}
                    </div>
                    <div className="mt-0.5 truncate text-[13px] font-semibold">{r.title}</div>
                    {r.description && (
                      <div className="mt-0.5 truncate text-[11px]" style={{ color: "var(--text-muted)" }}>
                        {r.description}
                      </div>
                    )}
                  </div>
                  <div><StatusPill status={r.status} /></div>
                  <div className="truncate text-[12px]" style={{ color: "var(--text-muted)" }}>
                    {r.authorName ?? <span style={{ color: "var(--text-faint)" }}>—</span>}
                  </div>
                  <div className="text-right text-[12px] tabular-nums" style={{ color: "var(--text-default)" }}>
                    {r.sessions30d.toLocaleString()}
                  </div>
                  <div className="text-right text-[12px] tabular-nums" style={{ color: "var(--text-default)" }}>
                    {r.conversions30d.toLocaleString()}
                  </div>
                  <div
                    className="text-right text-[12px] tabular-nums"
                    style={{
                      color: r.conversionRatePct == null ? "var(--text-faint)"
                          : r.conversionRatePct >= 3 ? "var(--success-fg)"
                          : r.conversionRatePct >= 1 ? "var(--warning-fg)"
                          : "var(--text-default)",
                    }}
                  >
                    {r.conversionRatePct == null ? "—" : `${r.conversionRatePct.toFixed(2)}%`}
                  </div>
                  <div className="text-right text-[11px]" style={{ color: "var(--text-muted)" }}>
                    {relativeFromNow(r.updatedAt)}
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-between text-[11px]" style={{ color: "var(--text-muted)" }}>
          <span>
            Page <b style={{ color: "var(--text-default)" }}>{page}</b> of {totalPages} ·{" "}
            {list.filteredTotal.toLocaleString()} page{list.filteredTotal === 1 ? "" : "s"}
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

function Select({ name, defaultValue, children }: { name: string; defaultValue: string; children: React.ReactNode }) {
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
        style={{ color: "var(--text-faint)", border: "1px solid var(--border-subtle)", opacity: 0.5 }}
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
