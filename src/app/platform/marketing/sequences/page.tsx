// Page 40 — Sequences list view.

import Link from "next/link";
import { requirePlatformStaff } from "@/lib/platform";
import {
  loadSequenceKpis,
  loadSequenceList,
  loadSequenceTemplates,
} from "@/server/platform/sequences";
import { createSequence } from "@/app/actions/platform-sequences";
import type { SequenceStatus, SequenceTriggerType } from "@prisma/client";
import {
  FormError,
  FormOk,
  Kpi,
  STATUS_LABEL,
  StatusPill,
  relativeFromNow,
  triggerSummary,
} from "./_components/shared";
import { TRIGGER_LABEL } from "@/lib/sequence-steps";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 25;

const TRIGGERS: SequenceTriggerType[] = [
  "SIGNUP", "PLAN_STARTED", "PLAN_CHANGED", "FAILED_PAYMENT",
  "TRIAL_ENDING", "DAYS_INACTIVE", "FEATURE_FIRST_USE",
  "CUSTOM_EVENT", "TAG_ADDED", "WEBHOOK",
];
const STATUSES: SequenceStatus[] = ["DRAFT", "ACTIVE", "PAUSED", "ARCHIVED"];

type SP = Record<string, string | string[] | undefined>;
const asString = (v: string | string[] | undefined): string | undefined =>
  typeof v === "string" && v.length > 0 ? v : undefined;

export default async function SequencesListPage({
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
  const triggerRaw = asString(sp.trigger);
  const status  = statusRaw && (STATUSES as string[]).includes(statusRaw) ? (statusRaw as SequenceStatus) : undefined;
  const trigger = triggerRaw && (TRIGGERS as string[]).includes(triggerRaw) ? (triggerRaw as SequenceTriggerType) : undefined;

  const [kpis, list, templates] = await Promise.all([
    loadSequenceKpis(),
    loadSequenceList({ filters: { q, status, triggerType: trigger }, page, pageSize: PAGE_SIZE }),
    loadSequenceTemplates(),
  ]);
  const totalPages = Math.max(1, Math.ceil(list.filteredTotal / PAGE_SIZE));

  return (
    <div className="space-y-5">
      <div>
        <div className="text-[11px] font-medium" style={{ color: "var(--text-muted)" }}>
          Marketing
        </div>
        <h1 className="mt-1 text-[22px] font-semibold leading-tight" style={{ color: "var(--text-default)" }}>
          Lifecycle / drip sequences
        </h1>
        <p className="mt-1 text-[12px]" style={{ color: "var(--text-muted)" }}>
          Behavioral email + in-app + tag-triggered sequences with branching, splits, waits, and per-step performance.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Link href="/platform/marketing/sequences/templates"
              className="ts-focus rounded-md px-3 py-1.5 text-[11px] font-medium"
              style={{ background: "var(--surface-1)", color: "var(--text-default)", border: "1px solid var(--border-default)" }}>
          🧩 Templates
        </Link>
      </div>

      <FormOk msg={ok} />
      <FormError msg={error} />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
        <Kpi label="Active sequences" value={kpis.active.toLocaleString()} tone={kpis.active > 0 ? "good" : "default"} />
        <Kpi label="Drafts"     value={kpis.drafts.toLocaleString()} />
        <Kpi label="Paused"     value={kpis.paused.toLocaleString()} tone={kpis.paused > 0 ? "warning" : "default"} />
        <Kpi label="Active enrollees" value={kpis.activeEnrolled.toLocaleString()} />
        <Kpi label="Total enrolled"   value={kpis.totalEnrolled.toLocaleString()} />
        <Kpi label="Conversion rate"
             value={kpis.conversionRate == null ? "—" : `${(kpis.conversionRate * 100).toFixed(1)}%`}
             tone={kpis.conversionRate == null ? "default" : kpis.conversionRate >= 0.20 ? "good" : kpis.conversionRate >= 0.10 ? "warning" : "default"} />
      </div>

      <form
        method="get"
        className="flex flex-wrap items-end gap-2 rounded-lg border p-3"
        style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)" }}
      >
        <Field label="Search">
          <input name="q" defaultValue={q ?? ""} placeholder="Name or description…"
                 className="ts-focus w-[260px] rounded-md px-2 py-1.5 text-[12px] outline-none"
                 style={inputStyle()} />
        </Field>
        <Field label="Status">
          <Select name="status" defaultValue={status ?? ""}>
            <option value="">Any</option>
            {STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
          </Select>
        </Field>
        <Field label="Trigger">
          <Select name="trigger" defaultValue={trigger ?? ""}>
            <option value="">Any</option>
            {TRIGGERS.map((t) => <option key={t} value={t}>{TRIGGER_LABEL[t]}</option>)}
          </Select>
        </Field>
        <button type="submit"
                className="ts-focus rounded-md px-3 py-1.5 text-[12px] font-medium"
                style={{ background: "var(--accent-primary)", color: "var(--accent-fg)" }}>
          Apply
        </button>
        {(q || status || trigger) && (
          <a href="/platform/marketing/sequences" className="self-center text-[11px] underline"
             style={{ color: "var(--text-muted)" }}>
            Clear
          </a>
        )}
      </form>

      {canWrite && (
        <form action={createSequence}
              className="flex flex-wrap items-end gap-2 rounded-lg border p-3"
              style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)" }}>
          <Field label="New sequence — name">
            <input name="name" required maxLength={200}
                   placeholder="e.g. Trial conversion"
                   className="ts-focus w-[280px] rounded-md px-2 py-1.5 text-[12px] outline-none"
                   style={inputStyle()} />
          </Field>
          <Field label="Trigger">
            <Select name="triggerType" defaultValue="SIGNUP">
              {TRIGGERS.map((t) => <option key={t} value={t}>{TRIGGER_LABEL[t]}</option>)}
            </Select>
          </Field>
          <Field label="From template (optional)">
            <Select name="templateId" defaultValue="">
              <option value="">— Empty —</option>
              {templates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </Select>
          </Field>
          <Field label="Description">
            <input name="description" maxLength={400}
                   className="ts-focus w-[260px] rounded-md px-2 py-1.5 text-[12px] outline-none"
                   style={inputStyle()} />
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
          <div className="mb-1 text-2xl" aria-hidden>🌊</div>
          <div className="font-medium" style={{ color: "var(--text-default)" }}>
            No sequences match.
          </div>
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg"
             style={{ background: "var(--surface-1)", border: "1px solid var(--border-subtle)" }}>
          <div className="hidden grid-cols-[minmax(0,1fr)_140px_180px_90px_90px_90px_120px] gap-3 border-b px-3 py-2 text-[10px] font-semibold uppercase tracking-wide md:grid"
               style={{ borderColor: "var(--border-subtle)", background: "var(--surface-2)", color: "var(--text-muted)" }}>
            <div>Name</div>
            <div>Status</div>
            <div>Trigger</div>
            <div className="text-right">Active</div>
            <div className="text-right">Enrolled</div>
            <div className="text-right">Conv %</div>
            <div className="text-right">Updated</div>
          </div>
          <ul>
            {list.rows.map((r, idx) => (
              <li key={r.id}
                  style={{ borderTop: idx === 0 ? "none" : "1px solid var(--border-subtle)" }}>
                <Link href={`/platform/marketing/sequences/${r.id}`}
                      className="grid items-start gap-3 px-3 py-3 md:grid-cols-[minmax(0,1fr)_140px_180px_90px_90px_90px_120px]"
                      style={{ color: "var(--text-default)" }}>
                  <div className="min-w-0">
                    <div className="text-[13px] font-semibold">{r.name}</div>
                    {r.description && (
                      <div className="mt-0.5 truncate text-[11px]" style={{ color: "var(--text-muted)" }}>{r.description}</div>
                    )}
                    {r.conversionGoal && (
                      <div className="mt-0.5 text-[10px]" style={{ color: "var(--text-faint)" }}>
                        Goal: <code>{r.conversionGoal}</code>
                      </div>
                    )}
                  </div>
                  <div><StatusPill status={r.status} /></div>
                  <div className="text-[12px]" style={{ color: "var(--text-muted)" }}>
                    {triggerSummary(r.triggerType, r.triggerConfig)}
                  </div>
                  <div className="text-right text-[12px] tabular-nums" style={{ color: "var(--text-default)" }}>
                    {r.activeEnrolled.toLocaleString()}
                  </div>
                  <div className="text-right text-[12px] tabular-nums" style={{ color: "var(--text-default)" }}>
                    {r.totalEnrolled.toLocaleString()}
                  </div>
                  <div className="text-right text-[12px] tabular-nums"
                       style={{ color: r.conversionRate == null ? "var(--text-faint)" : r.conversionRate >= 0.2 ? "var(--success-fg)" : "var(--text-default)" }}>
                    {r.conversionRate == null ? "—" : `${(r.conversionRate * 100).toFixed(1)}%`}
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
          <span>Page <b style={{ color: "var(--text-default)" }}>{page}</b> of {totalPages} · {list.filteredTotal.toLocaleString()}</span>
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
    <select name={name} defaultValue={defaultValue}
            className="ts-focus rounded-md px-2 py-1.5 text-[12px] outline-none"
            style={inputStyle()}>
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
