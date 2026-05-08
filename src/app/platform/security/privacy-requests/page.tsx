// Page 52 — Data Privacy Requests (list).
//
// Tabs: Inbox · In Progress · Awaiting Verification · Completed · Rejected · All
// Filters: Type / Jurisdiction / Source / Tenant / Status / Verification / SLA bucket / Assignee
// Plus an intake form to record a new request.

import * as React from "react";
import Link from "next/link";
import { requirePlatformStaff } from "@/lib/platform";
import {
  loadPrivacyPage,
  TYPE_LABEL,
  JURISDICTION_LABEL,
  SOURCE_LABEL,
  STATUS_TONE,
  relativeFromNow,
  type ListTab,
  type ListFilters,
} from "@/server/platform/privacy-requests";
import {
  intakeRequest,
} from "@/app/actions/platform-privacy";
import {
  Kpi, StatusPill, VerificationPill, TypeChip, JurisdictionChip, SourceChip,
  SlaCell, FormError, FormOk,
} from "./_shared";
import type {
  PrivacyRequestType, PrivacyJurisdiction, PrivacyRequestSource,
  PrivacyRequestStatus, PrivacyVerificationStatus,
} from "@prisma/client";

export const dynamic = "force-dynamic";

type SP = Record<string, string | string[] | undefined>;
const asString = (v: string | string[] | undefined): string | undefined =>
  typeof v === "string" && v.length > 0 ? v : undefined;

const TABS: ListTab[] = ["inbox", "awaiting_verification", "in_progress", "completed", "rejected", "all"];
const TAB_LABEL: Record<ListTab, string> = {
  inbox:                  "Inbox",
  awaiting_verification:  "Awaiting verification",
  in_progress:            "In progress",
  completed:              "Completed",
  rejected:               "Rejected",
  all:                    "All",
};

const TYPES: PrivacyRequestType[] = [
  "ACCESS_EXPORT", "DELETION", "RECTIFICATION", "RESTRICTION",
  "OBJECTION", "PORTABILITY", "OPT_OUT_OF_SALE",
];
const JURISDICTIONS: PrivacyJurisdiction[] = ["GDPR", "UK_GDPR", "CCPA", "CPRA", "LGPD", "PIPEDA", "OTHER"];
const SOURCES: PrivacyRequestSource[] = ["TENANT_PORTAL", "EMAIL", "WEB_FORM", "PHONE", "API"];
const STATUSES: PrivacyRequestStatus[] = [
  "RECEIVED", "AWAITING_VERIFICATION", "VERIFIED", "IN_PROGRESS",
  "AWAITING_LEGAL_HOLD_REVIEW", "AWAITING_SUBJECT_INFO",
  "COMPLETED", "REJECTED", "WITHDRAWN",
];
const VERIFICATION_OPTS: PrivacyVerificationStatus[] = ["PENDING", "VERIFIED", "FAILED", "WAIVED"];

export default async function PrivacyRequestsPage({
  searchParams,
}: { searchParams: Promise<SP> }) {
  const ctx = await requirePlatformStaff();
  if (!ctx.can("privacy.read")) {
    return (
      <main className="mx-auto max-w-2xl py-12 text-center">
        <h1 className="text-xl font-semibold">Access denied</h1>
        <p className="text-sm" style={{ color: "var(--text-muted)" }}>
          You don&apos;t have permission to view Data Privacy Requests.
        </p>
      </main>
    );
  }
  const canTriage = ctx.can("privacy.triage");
  const sp = await searchParams;
  const ok = asString(sp.ok);
  const error = asString(sp.error);
  const tabRaw = asString(sp.tab) as ListTab | undefined;
  const tab: ListTab = tabRaw && TABS.includes(tabRaw) ? tabRaw : "inbox";

  const filters: ListFilters = {
    q:            asString(sp.q),
    type:         (asString(sp.type)         as PrivacyRequestType | "ALL" | undefined) ?? "ALL",
    jurisdiction: (asString(sp.jurisdiction) as PrivacyJurisdiction | "ALL" | undefined) ?? "ALL",
    source:       (asString(sp.source)       as PrivacyRequestSource | "ALL" | undefined) ?? "ALL",
    tenantId:     asString(sp.tenant),
    assignedToId: asString(sp.assignee),
    status:       (asString(sp.status) as PrivacyRequestStatus | "ALL" | undefined) ?? "ALL",
    verification: (asString(sp.verification) as PrivacyVerificationStatus | "ALL" | undefined) ?? "ALL",
    slaBucket:    (asString(sp.sla) as ListFilters["slaBucket"]) ?? "ALL",
  };

  const { kpis, rows, tenants, staff } = await loadPrivacyPage(tab, filters);

  return (
    <main className="mx-auto w-full max-w-[1480px] px-6 py-6">
      <header className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[22px] font-semibold" style={{ color: "var(--text-default)" }}>Data Privacy Requests</h1>
          <p className="text-[12px]" style={{ color: "var(--text-muted)" }}>
            Process GDPR / CCPA / CPRA / LGPD subject access, deletion, rectification, restriction, objection, and portability requests.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <FormOk msg={ok} />
          <FormError msg={error} />
        </div>
      </header>

      {/* KPIs */}
      <section className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
        <Kpi label="Inbox"            value={String(kpis.inbox)}                sub="New" tone={kpis.inbox > 5 ? "warning" : "default"} />
        <Kpi label="In progress"      value={String(kpis.inProgress)}           sub="Triaged" />
        <Kpi label="Awaiting verification" value={String(kpis.awaitingVerification)} sub="Subject ID pending" tone={kpis.awaitingVerification > 0 ? "warning" : "default"} />
        <Kpi label="Completed (mo)"   value={String(kpis.completedThisMonth)}   sub="This month" tone="good" />
        <Kpi label="Overdue"          value={String(kpis.overdue)}              sub="Past SLA" tone={kpis.overdue > 0 ? "danger" : "good"} />
        <Kpi label="Avg complete (d)" value={kpis.averageMttcDays != null ? String(kpis.averageMttcDays) : "—"}
             sub="Last 30 closed" />
      </section>

      {/* Tabs */}
      <nav className="mb-5 flex flex-wrap gap-1 border-b" style={{ borderColor: "var(--border-subtle)" }}>
        {TABS.map((t) => (
          <a
            key={t}
            href={`?tab=${t}`}
            className="-mb-px rounded-t-md px-3 py-2 text-[12px] font-medium transition"
            style={{
              borderBottom: tab === t ? "2px solid var(--accent-default)" : "2px solid transparent",
              color: tab === t ? "var(--text-default)" : "var(--text-muted)",
            }}
          >
            {TAB_LABEL[t]}
          </a>
        ))}
      </nav>

      {/* Filters */}
      <form className="mb-5 grid grid-cols-2 gap-2 md:grid-cols-4 xl:grid-cols-8" method="get">
        <input type="hidden" name="tab" value={tab} />
        <Input name="q" label="Search" defaultValue={filters.q ?? ""} />
        <Select name="type" label="Type" defaultValue={filters.type as string ?? "ALL"}
                options={[{ value: "ALL", label: "All types" }, ...TYPES.map((t) => ({ value: t, label: TYPE_LABEL[t] }))]} />
        <Select name="jurisdiction" label="Jurisdiction" defaultValue={filters.jurisdiction as string ?? "ALL"}
                options={[{ value: "ALL", label: "All jurisdictions" }, ...JURISDICTIONS.map((j) => ({ value: j, label: JURISDICTION_LABEL[j] }))]} />
        <Select name="source" label="Source" defaultValue={filters.source as string ?? "ALL"}
                options={[{ value: "ALL", label: "All sources" }, ...SOURCES.map((s) => ({ value: s, label: SOURCE_LABEL[s] }))]} />
        <Select name="tenant" label="Tenant" defaultValue={filters.tenantId ?? ""}
                options={[{ value: "", label: "All tenants" }, ...tenants.map((t) => ({ value: t.id, label: t.name }))]} />
        <Select name="status" label="Status" defaultValue={filters.status as string ?? "ALL"}
                options={[{ value: "ALL", label: "All statuses" }, ...STATUSES.map((s) => ({ value: s, label: STATUS_TONE[s].label }))]} />
        <Select name="verification" label="Verification" defaultValue={filters.verification as string ?? "ALL"}
                options={[{ value: "ALL", label: "All" }, ...VERIFICATION_OPTS.map((v) => ({ value: v, label: v.toLowerCase() }))]} />
        <Select name="sla" label="SLA" defaultValue={filters.slaBucket ?? "ALL"}
                options={[
                  { value: "ALL",     label: "Any SLA" },
                  { value: "OVERDUE", label: "Overdue" },
                  { value: "DUE_24H", label: "Due in 24h" },
                  { value: "DUE_7D",  label: "Due in 7d" },
                  { value: "OK",      label: "OK (>7d)" },
                ]} />
        <div className="col-span-2 md:col-span-4 xl:col-span-8 flex justify-end gap-2">
          <a href={`?tab=${tab}`} className="inline-flex h-8 items-center rounded-md border px-3 text-[12px] font-medium"
             style={{ borderColor: "var(--border-subtle)", background: "var(--surface-1)", color: "var(--text-muted)" }}>
            Clear
          </a>
          <button type="submit" className="inline-flex h-8 items-center rounded-md px-3 text-[12px] font-medium"
                  style={{ background: "var(--accent-default)", color: "var(--accent-fg)" }}>
            Apply filters
          </button>
        </div>
      </form>

      {/* Table */}
      <section className="rounded-xl border"
               style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)" }}>
        <header className="border-b px-4 py-3" style={{ borderColor: "var(--border-subtle)" }}>
          <h3 className="text-[13px] font-semibold" style={{ color: "var(--text-default)" }}>{TAB_LABEL[tab]}</h3>
          <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>{rows.length} requests</p>
        </header>
        <div className="overflow-x-auto p-4">
          {rows.length === 0 ? (
            <div className="rounded-md border border-dashed px-4 py-8 text-center text-[12px]"
                 style={{ borderColor: "var(--border-subtle)", color: "var(--text-muted)" }}>
              No requests in this view.
            </div>
          ) : (
            <table className="w-full">
              <thead>
                <tr style={{ color: "var(--text-muted)" }}>
                  <Th>Request</Th><Th>Type</Th><Th>Subject</Th><Th>Tenant</Th>
                  <Th>Source</Th><Th>Jurisdiction</Th><Th>Status</Th><Th>Verification</Th>
                  <Th>SLA</Th><Th>Received</Th><Th>Assignee</Th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-t" style={{ borderColor: "var(--border-subtle)" }}>
                    <td className="py-2 pr-3 align-top">
                      <Link href={`/platform/security/privacy-requests/${r.id}`}
                            className="text-[12px] font-semibold underline tabular-nums"
                            style={{ color: "var(--accent-default)" }}>
                        {r.externalId}
                      </Link>
                    </td>
                    <td className="py-2 pr-3 align-top"><TypeChip type={r.type} /></td>
                    <td className="py-2 pr-3 align-top">
                      <div className="text-[12px]" style={{ color: "var(--text-default)" }}>{r.subjectName}</div>
                      <div className="text-[11px]" style={{ color: "var(--text-muted)" }}>{r.subjectEmail}</div>
                    </td>
                    <td className="py-2 pr-3 align-top">
                      <span className="text-[11px]" style={{ color: "var(--text-muted)" }}>{r.tenantName ?? "—"}</span>
                    </td>
                    <td className="py-2 pr-3 align-top"><SourceChip s={r.source} /></td>
                    <td className="py-2 pr-3 align-top"><JurisdictionChip j={r.jurisdiction} /></td>
                    <td className="py-2 pr-3 align-top"><StatusPill status={r.status} /></td>
                    <td className="py-2 pr-3 align-top"><VerificationPill status={r.verificationStatus} /></td>
                    <td className="py-2 pr-3 align-top"><SlaCell remainingHours={r.slaRemainingHours} /></td>
                    <td className="py-2 pr-3 align-top">
                      <span className="text-[11px] tabular-nums" style={{ color: "var(--text-muted)" }}>{relativeFromNow(r.receivedAt)}</span>
                    </td>
                    <td className="py-2 pr-3 align-top">
                      <span className="text-[11px]" style={{ color: "var(--text-default)" }}>{r.assignedToEmail ?? "—"}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        {canTriage && (
          <div className="border-t px-4 py-3" style={{ borderColor: "var(--border-subtle)" }}>
            <details>
              <summary className="cursor-pointer text-[12px] font-semibold" style={{ color: "var(--text-default)" }}>
                + Record new request
              </summary>
              <form action={intakeRequest} className="mt-3 grid grid-cols-2 gap-2 md:grid-cols-3">
                <Select name="type" label="Type"
                        options={TYPES.map((t) => ({ value: t, label: TYPE_LABEL[t] }))} />
                <Select name="jurisdiction" label="Jurisdiction"
                        options={JURISDICTIONS.map((j) => ({ value: j, label: JURISDICTION_LABEL[j] }))} />
                <Select name="source" label="Source"
                        options={SOURCES.map((s) => ({ value: s, label: SOURCE_LABEL[s] }))} />
                <Input name="subjectName" label="Subject name" defaultValue="" required />
                <Input name="subjectEmail" label="Subject email" type="email" defaultValue="" required />
                <Input name="subjectIdentifier" label="Other identifier" defaultValue="" />
                <Select name="tenantId" label="Tenant (optional)"
                        defaultValue=""
                        options={[{ value: "", label: "—" }, ...tenants.map((t) => ({ value: t.id, label: t.name }))]} />
                <label className="md:col-span-3 block">
                  <span className="mb-0.5 block text-[11px] font-medium" style={{ color: "var(--text-muted)" }}>Intake notes (subject's original wording)</span>
                  <textarea name="intakeNotes" rows={3} className="w-full rounded-md border px-2 py-1.5 text-[12px]"
                            style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)", color: "var(--text-default)" }} />
                </label>
                <div className="md:col-span-3 flex justify-end">
                  <button type="submit" className="inline-flex h-8 items-center rounded-md px-3 text-[12px] font-medium"
                          style={{ background: "var(--accent-default)", color: "var(--accent-fg)" }}>
                    Receive request
                  </button>
                </div>
              </form>
            </details>
          </div>
        )}
      </section>
    </main>
  );
}

/* ── Helpers ───────────────────────────────────────────── */

function Th({ children }: { children: React.ReactNode }) {
  return <th className="pb-2 text-left text-[11px] font-medium uppercase tracking-wide">{children}</th>;
}

function Input({
  name, label, type, defaultValue, required,
}: { name: string; label: string; type?: string; defaultValue: string; required?: boolean }) {
  return (
    <label className="block">
      <span className="mb-0.5 block text-[11px] font-medium" style={{ color: "var(--text-muted)" }}>
        {label}{required && <span style={{ color: "var(--rose-500)" }}> *</span>}
      </span>
      <input
        type={type ?? "text"}
        name={name}
        defaultValue={defaultValue}
        required={required}
        className="w-full rounded-md border px-2 py-1.5 text-[12px]"
        style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)", color: "var(--text-default)" }}
      />
    </label>
  );
}

function Select({
  name, label, options, defaultValue,
}: {
  name: string; label: string;
  options: { value: string; label: string }[];
  defaultValue?: string;
}) {
  return (
    <label className="block">
      <span className="mb-0.5 block text-[11px] font-medium" style={{ color: "var(--text-muted)" }}>{label}</span>
      <select
        name={name}
        defaultValue={defaultValue}
        className="w-full rounded-md border px-2 py-1.5 text-[12px]"
        style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)", color: "var(--text-default)" }}
      >
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </label>
  );
}
