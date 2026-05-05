// Page 39 — Email Campaigns list (Campaigns tab).

import Link from "next/link";
import { requirePlatformStaff } from "@/lib/platform";
import {
  loadCampaignKpis,
  loadCampaignList,
  loadEmailTemplates,
} from "@/server/platform/email-campaigns";
import { createCampaign } from "@/app/actions/platform-email-campaigns";
import type { EmailCampaignStatus, EmailCampaignType } from "@prisma/client";
import {
  CAMPAIGN_TYPE_LABEL,
  CAMPAIGN_STATUS_LABEL,
  FormError,
  FormOk,
  Kpi,
  StatusPill,
  relativeFromNow,
} from "./_components/shared";
import { TabsBar } from "./_components/TabsBar";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 25;
const STATUSES: EmailCampaignStatus[] = ["DRAFT", "SCHEDULED", "SENDING", "SENT", "PAUSED", "ARCHIVED"];
const TYPES: EmailCampaignType[] = ["ONE_OFF", "RECURRING"];

type SP = Record<string, string | string[] | undefined>;
const asString = (v: string | string[] | undefined): string | undefined =>
  typeof v === "string" && v.length > 0 ? v : undefined;

export default async function CampaignsListPage({
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
  const q = asString(sp.q);
  const statusRaw = asString(sp.status);
  const typeRaw = asString(sp.type);
  const status = statusRaw && (STATUSES as string[]).includes(statusRaw) ? (statusRaw as EmailCampaignStatus) : undefined;
  const type   = typeRaw   && (TYPES as string[]).includes(typeRaw)     ? (typeRaw   as EmailCampaignType) : undefined;

  const [kpis, list, templates] = await Promise.all([
    loadCampaignKpis(),
    loadCampaignList({ filters: { q, status, type }, page, pageSize: PAGE_SIZE }),
    loadEmailTemplates(),
  ]);

  const totalPages = Math.max(1, Math.ceil(list.filteredTotal / PAGE_SIZE));

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-[11px] font-medium" style={{ color: "var(--text-muted)" }}>
            Marketing
          </div>
          <h1 className="mt-1 text-[22px] font-semibold leading-tight" style={{ color: "var(--text-default)" }}>
            Email campaigns
          </h1>
          <p className="mt-1 text-[12px]" style={{ color: "var(--text-muted)" }}>
            One-off and recurring email campaigns to tenants and leads, with segment builder, A/B
            subject testing, full preflight checks, and per-recipient drill-down.
          </p>
        </div>
      </div>

      <TabsBar active="campaigns" />

      <FormOk msg={ok} />
      <FormError msg={error} />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-7">
        <Kpi label="Drafts"     value={kpis.drafts.toLocaleString()} />
        <Kpi label="Scheduled"  value={kpis.scheduled.toLocaleString()} tone={kpis.scheduled > 0 ? "warning" : "default"} />
        <Kpi label="Sending"    value={kpis.sending.toLocaleString()} tone={kpis.sending > 0 ? "warning" : "default"} />
        <Kpi label="Sent · 30d" value={kpis.delivered30d.toLocaleString()} sub={`${kpis.opens30d.toLocaleString()} opens · ${kpis.clicks30d.toLocaleString()} clicks`} />
        <Kpi label="Open rate · 30d"
             value={kpis.openRate30d == null ? "—" : `${(kpis.openRate30d * 100).toFixed(1)}%`}
             tone={kpis.openRate30d == null ? "default" : kpis.openRate30d >= 0.30 ? "good" : kpis.openRate30d >= 0.15 ? "warning" : "danger"} />
        <Kpi label="CTR · 30d"
             value={kpis.ctr30d == null ? "—" : `${(kpis.ctr30d * 100).toFixed(1)}%`}
             tone={kpis.ctr30d == null ? "default" : kpis.ctr30d >= 0.05 ? "good" : "default"} />
        <Kpi label="Unsubs · 30d"
             value={kpis.unsubscribes30d.toLocaleString()}
             tone={kpis.unsubscribes30d > 50 ? "danger" : "default"} />
      </div>

      {/* Filter row */}
      <form
        method="get"
        className="flex flex-wrap items-end gap-2 rounded-lg border p-3"
        style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)" }}
      >
        <Field label="Search">
          <input name="q" defaultValue={q ?? ""} placeholder="Name, from email…"
                 className="ts-focus w-[260px] rounded-md px-2 py-1.5 text-[12px] outline-none"
                 style={inputStyle()} />
        </Field>
        <Field label="Status">
          <Select name="status" defaultValue={status ?? ""}>
            <option value="">Any</option>
            {STATUSES.map((s) => <option key={s} value={s}>{CAMPAIGN_STATUS_LABEL[s]}</option>)}
          </Select>
        </Field>
        <Field label="Type">
          <Select name="type" defaultValue={type ?? ""}>
            <option value="">Any</option>
            {TYPES.map((t) => <option key={t} value={t}>{CAMPAIGN_TYPE_LABEL[t]}</option>)}
          </Select>
        </Field>
        <button type="submit"
                className="ts-focus rounded-md px-3 py-1.5 text-[12px] font-medium"
                style={{ background: "var(--accent-primary)", color: "var(--accent-fg)" }}>
          Apply
        </button>
        {(q || status || type) && (
          <a href="/platform/marketing/campaigns" className="self-center text-[11px] underline"
             style={{ color: "var(--text-muted)" }}>
            Clear
          </a>
        )}
      </form>

      {canWrite && (
        <form action={createCampaign}
              className="flex flex-wrap items-end gap-2 rounded-lg border p-3"
              style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)" }}>
          <Field label="New campaign — name">
            <input name="name" required maxLength={200}
                   placeholder="e.g. Q3 onboarding nudge"
                   className="ts-focus w-[280px] rounded-md px-2 py-1.5 text-[12px] outline-none"
                   style={inputStyle()} />
          </Field>
          <Field label="Type">
            <Select name="type" defaultValue="ONE_OFF">
              {TYPES.map((t) => <option key={t} value={t}>{CAMPAIGN_TYPE_LABEL[t]}</option>)}
            </Select>
          </Field>
          <Field label="Language">
            <input name="language" defaultValue="en" maxLength={8}
                   className="ts-focus w-[80px] rounded-md px-2 py-1.5 text-[12px] outline-none"
                   style={inputStyle()} />
          </Field>
          <Field label="From template (optional)">
            <Select name="templateId" defaultValue="">
              <option value="">— Default starter —</option>
              {templates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </Select>
          </Field>
          <button type="submit"
                  className="ts-focus rounded-md px-3 py-1.5 text-[12px] font-medium"
                  style={{ background: "var(--accent-primary)", color: "var(--accent-fg)" }}>
            + Create
          </button>
        </form>
      )}

      {list.rows.length === 0 ? (
        <div className="rounded-lg border p-10 text-center text-[12px]"
             style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)", color: "var(--text-muted)" }}>
          <div className="mb-1 text-2xl" aria-hidden>✉</div>
          <div className="font-medium" style={{ color: "var(--text-default)" }}>
            No campaigns match.
          </div>
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg"
             style={{ background: "var(--surface-1)", border: "1px solid var(--border-subtle)" }}>
          <div className="hidden grid-cols-[minmax(0,1fr)_120px_90px_90px_70px_70px_70px_90px_120px] gap-3 border-b px-3 py-2 text-[10px] font-semibold uppercase tracking-wide md:grid"
               style={{ borderColor: "var(--border-subtle)", background: "var(--surface-2)", color: "var(--text-muted)" }}>
            <div>Name</div>
            <div>Status</div>
            <div className="text-right">Audience</div>
            <div className="text-right">Sent</div>
            <div className="text-right">Open</div>
            <div className="text-right">CTR</div>
            <div className="text-right">Unsub</div>
            <div className="text-right">Bounce</div>
            <div className="text-right">Sent at</div>
          </div>
          <ul>
            {list.rows.map((r, idx) => (
              <li key={r.id}
                  style={{ borderTop: idx === 0 ? "none" : "1px solid var(--border-subtle)" }}>
                <Link href={`/platform/marketing/campaigns/${r.id}`}
                      className="grid items-start gap-3 px-3 py-3 md:grid-cols-[minmax(0,1fr)_120px_90px_90px_70px_70px_70px_90px_120px]"
                      style={{ color: "var(--text-default)" }}>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="rounded-full px-1.5 py-0.5 text-[10px] font-medium"
                            style={{ background: "var(--surface-2)", color: "var(--text-muted)" }}>
                        {CAMPAIGN_TYPE_LABEL[r.type]}
                      </span>
                      <span className="rounded-full px-1.5 py-0.5 text-[10px] font-medium"
                            style={{ background: "var(--surface-2)", color: "var(--text-muted)" }}>
                        {r.language}
                      </span>
                      {r.variantCount > 0 && (
                        <span className="rounded-full px-1.5 py-0.5 text-[10px] font-medium"
                              style={{ background: "var(--accent-surface)", color: "var(--accent-primary)" }}>
                          A/B · {r.variantCount}
                        </span>
                      )}
                    </div>
                    <div className="mt-0.5 truncate text-[13px] font-semibold">{r.name}</div>
                    {r.fromEmail && (
                      <div className="mt-0.5 truncate text-[11px]" style={{ color: "var(--text-muted)" }}>
                        From: {r.fromEmail}
                      </div>
                    )}
                  </div>
                  <div><StatusPill status={r.status} /></div>
                  <div className="text-right text-[12px] tabular-nums" style={{ color: "var(--text-default)" }}>
                    {r.audienceSize.toLocaleString()}
                  </div>
                  <div className="text-right text-[12px] tabular-nums" style={{ color: "var(--text-default)" }}>
                    {r.sentCount.toLocaleString()}
                  </div>
                  <div className="text-right text-[12px] tabular-nums"
                       style={{ color: r.openRate == null ? "var(--text-faint)" : r.openRate >= 0.3 ? "var(--success-fg)" : "var(--text-default)" }}>
                    {r.openRate == null ? "—" : `${(r.openRate * 100).toFixed(0)}%`}
                  </div>
                  <div className="text-right text-[12px] tabular-nums"
                       style={{ color: r.ctr == null ? "var(--text-faint)" : r.ctr >= 0.05 ? "var(--success-fg)" : "var(--text-default)" }}>
                    {r.ctr == null ? "—" : `${(r.ctr * 100).toFixed(1)}%`}
                  </div>
                  <div className="text-right text-[12px] tabular-nums"
                       style={{ color: r.unsubscribeRate == null ? "var(--text-faint)" : r.unsubscribeRate > 0.01 ? "var(--warning-fg)" : "var(--text-default)" }}>
                    {r.unsubscribeRate == null ? "—" : `${(r.unsubscribeRate * 100).toFixed(2)}%`}
                  </div>
                  <div className="text-right text-[12px] tabular-nums"
                       style={{ color: r.bounceRate == null ? "var(--text-faint)" : r.bounceRate > 0.05 ? "var(--danger-fg)" : "var(--text-default)" }}>
                    {r.bounceRate == null ? "—" : `${(r.bounceRate * 100).toFixed(2)}%`}
                  </div>
                  <div className="text-right text-[11px]" style={{ color: "var(--text-muted)" }}>
                    {relativeFromNow(r.completedSendingAt ?? r.startedSendingAt ?? r.scheduledAt)}
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
            {list.filteredTotal.toLocaleString()} campaign{list.filteredTotal === 1 ? "" : "s"}
          </span>
          <div className="flex items-center gap-1">
            <PageLink href={page > 1 ? `?page=${page - 1}` : null}>‹ Prev</PageLink>
            <PageLink href={page < totalPages ? `?page=${page + 1}` : null}>Next ›</PageLink>
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
    return <span className="rounded-md px-2 py-1"
                 style={{ color: "var(--text-faint)", border: "1px solid var(--border-subtle)", opacity: 0.5 }}>
      {children}
    </span>;
  }
  return <Link href={href} className="ts-focus rounded-md px-2 py-1"
               style={{ color: "var(--text-default)", border: "1px solid var(--border-default)" }}>
    {children}
  </Link>;
}

function inputStyle(): React.CSSProperties {
  return {
    background: "var(--surface-1)",
    border: "1px solid var(--border-default)",
    color: "var(--text-default)",
  };
}
