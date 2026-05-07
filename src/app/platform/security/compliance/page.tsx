// Page 51 — Compliance.
//
// Nine tabs: Frameworks, Controls, Evidence, Policies,
// Sub-Processors, DPAs, Risk Register, Vendor Reviews, Reports.

import * as React from "react";
import { db } from "@/lib/db";
import { requirePlatformStaff } from "@/lib/platform";
import {
  loadCompliancePage,
  buildRiskHeatmap,
  FRAMEWORK_LABELS,
  CONTROL_DOMAIN_LABEL,
  LIKELIHOOD_LABEL,
  IMPACT_LABEL,
  CERT_LABELS,
  REPORT_KIND_LABEL,
  relativeFromNow,
  type FrameworkCard,
  type ControlRow,
  type EvidenceRow,
  type PolicyRow,
  type SubProcessorRow,
  type TenantDpaRow,
  type RiskRow,
  type VendorReviewRow,
  type ReportRow,
} from "@/server/platform/compliance";
import {
  saveFramework,
  saveControl,
  setControlStatus,
  uploadEvidence,
  savePolicy,
  acknowledgePolicy,
  saveSubProcessor,
  deleteSubProcessor,
  saveTenantDpa,
  saveRisk,
  saveVendorReview,
  generateReport,
  deleteEvidence,
} from "@/app/actions/platform-compliance";
import {
  Kpi, FrameworkPill, ControlStatusPill, PolicyStatusPill, RiskTierPill,
  DpaPill, RiskStatusPill, VendorStatusPill, ReportStatusPill,
  CertChip, FrameworkChip, DomainChip, PercentBar, FormError, FormOk,
  shortDate,
} from "./_shared";

export const dynamic = "force-dynamic";

type SP = Record<string, string | string[] | undefined>;
const asString = (v: string | string[] | undefined): string | undefined =>
  typeof v === "string" && v.length > 0 ? v : undefined;

const TABS = [
  "frameworks", "controls", "evidence", "policies",
  "sub-processors", "dpas", "risks", "vendors", "reports",
] as const;
type Tab = typeof TABS[number];

const TAB_LABELS: Record<Tab, string> = {
  frameworks:       "Frameworks",
  controls:         "Controls",
  evidence:         "Evidence",
  policies:         "Policies",
  "sub-processors": "Sub-Processors",
  dpas:             "DPAs",
  risks:            "Risk Register",
  vendors:          "Vendor Reviews",
  reports:          "Reports",
};

export default async function CompliancePage({
  searchParams,
}: { searchParams: Promise<SP> }) {
  const ctx = await requirePlatformStaff();
  if (!ctx.can("compliance.read")) {
    return (
      <main className="mx-auto max-w-2xl py-12 text-center">
        <h1 className="text-xl font-semibold">Access denied</h1>
        <p className="text-sm" style={{ color: "var(--text-muted)" }}>
          You don&apos;t have permission to view Compliance.
        </p>
      </main>
    );
  }
  const canManage = ctx.can("compliance.manage");
  const canPolicyWrite = ctx.can("compliance.policy.write");
  const canEvidence = ctx.can("compliance.evidence.upload");
  const canVendor = ctx.can("compliance.vendor.review");
  const canReport = ctx.can("compliance.report.generate");

  const sp = await searchParams;
  const ok = asString(sp.ok);
  const error = asString(sp.error);
  const tabRaw = asString(sp.tab) as Tab | undefined;
  const tab: Tab = tabRaw && (TABS as readonly string[]).includes(tabRaw) ? tabRaw : "frameworks";

  // Load tenants for DPA dropdown lazily.
  const data = await loadCompliancePage();
  const tenants = await db.tenant.findMany({
    select: { id: true, name: true, slug: true },
    orderBy: { name: "asc" },
  });
  const {
    kpis, frameworks, controls, evidence, policies,
    subProcessors, dpas, risks, vendors, reports,
  } = data;

  return (
    <main className="mx-auto w-full max-w-[1480px] px-6 py-6">
      <header className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[22px] font-semibold" style={{ color: "var(--text-default)" }}>Compliance</h1>
          <p className="text-[12px]" style={{ color: "var(--text-muted)" }}>
            Frameworks, controls, evidence, policies, sub-processors, DPAs, risk register, vendor reviews, audit reports.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <FormOk msg={ok} />
          <FormError msg={error} />
        </div>
      </header>

      {/* KPI strip */}
      <section className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-6">
        <Kpi
          label="Frameworks"
          value={`${kpis.frameworksCertified}/${kpis.frameworksTracked}`}
          sub="Certified / tracked"
          tone={kpis.frameworksCertified > 0 ? "good" : "warning"}
        />
        <Kpi
          label="Controls passing"
          value={`${kpis.controlsPassing}/${kpis.controlsTotal}`}
          sub={kpis.controlsFailing > 0 ? `${kpis.controlsFailing} failing` : "0 failing"}
          tone={kpis.controlsFailing > 0 ? "danger" : kpis.controlsPendingEvidence > 0 ? "warning" : "good"}
        />
        <Kpi
          label="Pending evidence"
          value={String(kpis.controlsPendingEvidence)}
          sub="Open evidence requests"
          tone={kpis.controlsPendingEvidence > 0 ? "warning" : "good"}
        />
        <Kpi
          label="Approved policies"
          value={String(kpis.policiesApproved)}
          sub={kpis.policiesNeedReview > 0 ? `${kpis.policiesNeedReview} need review` : "All current"}
          tone={kpis.policiesNeedReview > 0 ? "warning" : "good"}
        />
        <Kpi
          label="Open risks"
          value={String(kpis.openRisks)}
          sub={kpis.highResidualRisks > 0 ? `${kpis.highResidualRisks} high-residual` : "Residual contained"}
          tone={kpis.highResidualRisks > 0 ? "danger" : "good"}
        />
        <Kpi
          label="Tenant DPAs"
          value={`${kpis.signedDpas} signed`}
          sub={kpis.pendingDpas > 0 ? `${kpis.pendingDpas} pending` : "All current"}
          tone={kpis.pendingDpas > 5 ? "warning" : "good"}
        />
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
            {TAB_LABELS[t]}
          </a>
        ))}
      </nav>

      {tab === "frameworks" && (
        <FrameworksTab frameworks={frameworks} canManage={canManage} />
      )}
      {tab === "controls" && (
        <ControlsTab controls={controls} frameworks={frameworks} canManage={canManage} />
      )}
      {tab === "evidence" && (
        <EvidenceTab evidence={evidence} controls={controls} canEvidence={canEvidence} />
      )}
      {tab === "policies" && (
        <PoliciesTab policies={policies} canPolicyWrite={canPolicyWrite} staffCount={data.staffCount} userEmail={ctx.email} />
      )}
      {tab === "sub-processors" && (
        <SubProcessorsTab rows={subProcessors} canManage={canManage} />
      )}
      {tab === "dpas" && (
        <TenantDpasTab rows={dpas} tenants={tenants} canManage={canManage} />
      )}
      {tab === "risks" && (
        <RisksTab rows={risks} canManage={canManage} />
      )}
      {tab === "vendors" && (
        <VendorsTab rows={vendors} canVendor={canVendor} />
      )}
      {tab === "reports" && (
        <ReportsTab rows={reports} frameworks={frameworks} canReport={canReport} />
      )}
    </main>
  );
}

/* ── Frameworks ────────────────────────────────────────── */

function FrameworksTab({
  frameworks, canManage,
}: { frameworks: FrameworkCard[]; canManage: boolean }) {
  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
      {frameworks.length === 0 && (
        <div className="col-span-full rounded-md border border-dashed p-8 text-center text-[12px]"
             style={{ borderColor: "var(--border-subtle)", color: "var(--text-muted)" }}>
          No frameworks tracked yet — add SOC 2 / ISO 27001 / GDPR via the form below.
        </div>
      )}
      {frameworks.map((f) => (
        <section key={f.id} className="rounded-xl border p-4"
                 style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)" }}>
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-[13px] font-semibold" style={{ color: "var(--text-default)" }}>{f.name}</div>
              {f.auditor && (
                <div className="text-[11px]" style={{ color: "var(--text-muted)" }}>Auditor: {f.auditor}</div>
              )}
            </div>
            <FrameworkPill status={f.status} />
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2 text-[11px]">
            <div>
              <div style={{ color: "var(--text-muted)" }}>Last audit</div>
              <div style={{ color: "var(--text-default)" }}>{shortDate(f.lastAuditAt)}</div>
            </div>
            <div>
              <div style={{ color: "var(--text-muted)" }}>Next audit</div>
              <div style={{ color: "var(--text-default)" }}>{shortDate(f.nextAuditAt)}</div>
            </div>
            <div className="col-span-2">
              <div className="flex items-baseline justify-between text-[11px]">
                <span style={{ color: "var(--text-muted)" }}>{f.passingCount}/{f.totalControls} controls passing</span>
                <span className="tabular-nums" style={{ color: "var(--text-default)" }}>{f.passingPct}%</span>
              </div>
              <PercentBar pct={f.passingPct} />
            </div>
          </div>
          {f.notes && (
            <div className="mt-2 text-[11px]" style={{ color: "var(--text-muted)" }}>{f.notes}</div>
          )}
        </section>
      ))}
      {canManage && (
        <section className="rounded-xl border border-dashed p-4"
                 style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)" }}>
          <h3 className="text-[13px] font-semibold" style={{ color: "var(--text-default)" }}>Add / update framework</h3>
          <form action={saveFramework} className="mt-3 grid grid-cols-2 gap-2">
            <Select name="key" label="Framework"
                    options={Object.entries(FRAMEWORK_LABELS).map(([k, v]) => ({ value: k, label: v }))} />
            <Input name="name" label="Display name" defaultValue="" />
            <Select name="status" label="Status"
                    options={[
                      { value: "PLANNED",      label: "Planned" },
                      { value: "IN_SCOPE",     label: "In scope" },
                      { value: "AUDIT_READY",  label: "Audit-ready" },
                      { value: "CERTIFIED",    label: "Certified" },
                      { value: "NOT_IN_SCOPE", label: "Not in scope" },
                    ]} />
            <Input name="auditor" label="Auditor" defaultValue="" optional />
            <Input name="lastAuditAt" label="Last audit (YYYY-MM-DD)" type="date" defaultValue="" optional />
            <Input name="nextAuditAt" label="Next audit (YYYY-MM-DD)" type="date" defaultValue="" optional />
            <label className="col-span-2">
              <span className="mb-0.5 block text-[11px] font-medium" style={{ color: "var(--text-muted)" }}>Notes</span>
              <textarea name="notes" rows={2} className="w-full rounded-md border px-2 py-1.5 text-[12px]"
                        style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)", color: "var(--text-default)" }} />
            </label>
            <div className="col-span-2 mt-1 flex justify-end">
              <button type="submit" className="inline-flex h-8 items-center rounded-md px-3 text-[12px] font-medium"
                      style={{ background: "var(--accent-default)", color: "var(--accent-fg)" }}>
                Save framework
              </button>
            </div>
          </form>
        </section>
      )}
    </div>
  );
}

/* ── Controls ──────────────────────────────────────────── */

function ControlsTab({
  controls, frameworks, canManage,
}: { controls: ControlRow[]; frameworks: FrameworkCard[]; canManage: boolean }) {
  return (
    <section className="rounded-xl border"
             style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)" }}>
      <header className="border-b px-4 py-3" style={{ borderColor: "var(--border-subtle)" }}>
        <h3 className="text-[13px] font-semibold" style={{ color: "var(--text-default)" }}>Controls</h3>
        <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>
          {controls.length} controls across {frameworks.length} frameworks. Click status pill to update.
        </p>
      </header>
      <div className="overflow-x-auto p-4">
        {controls.length === 0 ? (
          <Empty>No controls yet.</Empty>
        ) : (
          <table className="w-full">
            <thead>
              <tr style={{ color: "var(--text-muted)" }}>
                <Th>ID</Th><Th>Title</Th><Th>Domain</Th><Th>Frameworks</Th><Th>Status</Th>
                <Th>Owner</Th><Th>Last tested</Th><Th>Evidence</Th>
                {canManage && <Th right>Actions</Th>}
              </tr>
            </thead>
            <tbody>
              {controls.map((c) => (
                <tr key={c.id} className="border-t" style={{ borderColor: "var(--border-subtle)" }}>
                  <Td><code className="text-[11px] tabular-nums" style={{ color: "var(--text-default)" }}>{c.externalId}</code></Td>
                  <Td>
                    <div className="text-[12px] font-medium" style={{ color: "var(--text-default)" }}>{c.title}</div>
                    {c.autoCheckEnabled && (
                      <div className="text-[11px]" style={{ color: "var(--text-muted)" }}>
                        Auto-check: {c.autoCheckResult ?? "pending"}
                      </div>
                    )}
                  </Td>
                  <Td><DomainChip d={c.domain} /></Td>
                  <Td>
                    <div className="flex flex-wrap gap-1">
                      <FrameworkChip k={c.primaryFrameworkKey} />
                      {c.mappedFrameworks.filter((k) => k !== c.primaryFrameworkKey).map((k) => (
                        <FrameworkChip key={k} k={k} />
                      ))}
                    </div>
                  </Td>
                  <Td><ControlStatusPill status={c.status} /></Td>
                  <Td><span className="text-[11px]" style={{ color: "var(--text-default)" }}>{c.ownerEmail ?? "—"}</span></Td>
                  <Td><span className="text-[11px] tabular-nums" style={{ color: "var(--text-muted)" }}>
                    {c.lastTestedAt ? relativeFromNow(c.lastTestedAt) : "never"}
                  </span></Td>
                  <Td><span className="text-[12px] tabular-nums" style={{ color: "var(--text-default)" }}>{c.evidenceCount}</span></Td>
                  {canManage && (
                    <Td right>
                      <form action={setControlStatus} className="inline-flex items-center gap-1">
                        <input type="hidden" name="id" value={c.id} />
                        <select name="status" defaultValue={c.status}
                                className="rounded-md border px-1.5 py-0.5 text-[11px]"
                                style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)", color: "var(--text-default)" }}>
                          <option value="PASSING">Passing</option>
                          <option value="FAILING">Failing</option>
                          <option value="IN_REVIEW">In review</option>
                          <option value="PENDING_EVIDENCE">Pending</option>
                          <option value="NOT_APPLICABLE">N/A</option>
                        </select>
                        <button type="submit" className="text-[11px] font-medium underline" style={{ color: "var(--accent-default)" }}>
                          Set
                        </button>
                      </form>
                    </Td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      {canManage && (
        <div className="border-t px-4 py-3" style={{ borderColor: "var(--border-subtle)" }}>
          <details>
            <summary className="cursor-pointer text-[12px] font-semibold" style={{ color: "var(--text-default)" }}>
              + Add control
            </summary>
            <form action={saveControl} className="mt-3 grid grid-cols-2 gap-2">
              <Input name="externalId" label="Control ID (e.g. AC-01, CC6.1)" defaultValue="" />
              <Input name="title" label="Title" defaultValue="" />
              <Select name="domain" label="Domain"
                      options={Object.entries(CONTROL_DOMAIN_LABEL).map(([k, v]) => ({ value: k, label: v }))} />
              <Select name="status" label="Status"
                      options={[
                        { value: "PENDING_EVIDENCE", label: "Pending evidence" },
                        { value: "IN_REVIEW",        label: "In review" },
                        { value: "PASSING",          label: "Passing" },
                        { value: "FAILING",          label: "Failing" },
                        { value: "NOT_APPLICABLE",   label: "N/A" },
                      ]} />
              <Select name="primaryFrameworkId" label="Primary framework"
                      options={frameworks.map((f) => ({ value: f.id, label: f.name }))} />
              <Input name="ownerEmail" label="Owner email" type="email" defaultValue="" optional />
              <Input name="testFrequency" label="Test frequency (e.g. quarterly)" defaultValue="quarterly" optional />
              <label className="col-span-2 inline-flex items-center gap-2 text-[12px]"
                     style={{ color: "var(--text-default)" }}>
                <input type="checkbox" name="autoCheckEnabled" /> Automated check enabled
              </label>
              <label className="col-span-2 block">
                <span className="mb-0.5 block text-[11px] font-medium" style={{ color: "var(--text-muted)" }}>Description</span>
                <textarea name="description" rows={2} className="w-full rounded-md border px-2 py-1.5 text-[12px]"
                          style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)", color: "var(--text-default)" }} />
              </label>
              <label className="col-span-2 block">
                <span className="mb-0.5 block text-[11px] font-medium" style={{ color: "var(--text-muted)" }}>Test procedure</span>
                <textarea name="testProcedure" rows={3} className="w-full rounded-md border px-2 py-1.5 text-[12px]"
                          style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)", color: "var(--text-default)" }} />
              </label>
              <div className="col-span-2 flex justify-end">
                <button type="submit" className="inline-flex h-8 items-center rounded-md px-3 text-[12px] font-medium"
                        style={{ background: "var(--accent-default)", color: "var(--accent-fg)" }}>
                  Save control
                </button>
              </div>
            </form>
          </details>
        </div>
      )}
    </section>
  );
}

/* ── Evidence ──────────────────────────────────────────── */

function EvidenceTab({
  evidence, controls, canEvidence,
}: { evidence: EvidenceRow[]; controls: ControlRow[]; canEvidence: boolean }) {
  return (
    <section className="rounded-xl border"
             style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)" }}>
      <header className="border-b px-4 py-3" style={{ borderColor: "var(--border-subtle)" }}>
        <h3 className="text-[13px] font-semibold" style={{ color: "var(--text-default)" }}>Evidence library</h3>
        <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>
          {evidence.length} entries · auto + manual collection
        </p>
      </header>
      <div className="overflow-x-auto p-4">
        {evidence.length === 0 ? (
          <Empty>No evidence collected yet.</Empty>
        ) : (
          <table className="w-full">
            <thead>
              <tr style={{ color: "var(--text-muted)" }}>
                <Th>Title</Th><Th>Control</Th><Th>Kind</Th><Th>Source</Th>
                <Th>Collected</Th><Th>Size</Th>
                {canEvidence && <Th right>Action</Th>}
              </tr>
            </thead>
            <tbody>
              {evidence.map((e) => (
                <tr key={e.id} className="border-t" style={{ borderColor: "var(--border-subtle)" }}>
                  <Td>
                    <div className="text-[12px] font-medium" style={{ color: "var(--text-default)" }}>
                      {e.fileUrl ? (
                        <a href={e.fileUrl} target="_blank" rel="noopener noreferrer"
                           className="underline" style={{ color: "var(--accent-default)" }}>
                          {e.title}
                        </a>
                      ) : e.title}
                    </div>
                    {e.description && (
                      <div className="text-[11px]" style={{ color: "var(--text-muted)" }}>{e.description}</div>
                    )}
                  </Td>
                  <Td>
                    <div className="text-[11px] tabular-nums" style={{ color: "var(--text-default)" }}>{e.controlExternalId}</div>
                    <div className="text-[11px]" style={{ color: "var(--text-muted)" }}>{e.controlTitle}</div>
                  </Td>
                  <Td>
                    <span className="inline-flex items-center rounded-md px-1.5 py-0.5 text-[10px] font-medium"
                          style={{ background: "var(--surface-2)", color: "var(--text-default)" }}>
                      {e.kind.toLowerCase()}
                    </span>
                  </Td>
                  <Td>
                    <span className="text-[11px]"
                          style={{
                            color: e.source === "AUTO" ? "var(--emerald-700)" : "var(--text-muted)",
                          }}>
                      {e.source === "AUTO" ? "Auto" : "Manual"}
                      {e.collector && <> · {e.collector}</>}
                    </span>
                  </Td>
                  <Td><span className="text-[11px] tabular-nums" style={{ color: "var(--text-muted)" }}>
                    {relativeFromNow(e.collectedAt)}
                  </span></Td>
                  <Td>
                    <span className="text-[11px] tabular-nums" style={{ color: "var(--text-muted)" }}>
                      {e.fileBytes != null ? `${(e.fileBytes / 1024).toFixed(1)} KB` : "—"}
                    </span>
                  </Td>
                  {canEvidence && (
                    <Td right>
                      <form action={deleteEvidence}>
                        <input type="hidden" name="id" value={e.id} />
                        <button type="submit" className="text-[11px] font-medium underline"
                                style={{ color: "var(--text-muted)" }}>
                          Delete
                        </button>
                      </form>
                    </Td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      {canEvidence && controls.length > 0 && (
        <div className="border-t px-4 py-3" style={{ borderColor: "var(--border-subtle)" }}>
          <details>
            <summary className="cursor-pointer text-[12px] font-semibold" style={{ color: "var(--text-default)" }}>
              + Upload evidence
            </summary>
            <form action={uploadEvidence} className="mt-3 grid grid-cols-2 gap-2">
              <Select name="controlId" label="Control"
                      options={controls.map((c) => ({ value: c.id, label: `${c.externalId} · ${c.title}` }))} />
              <Input name="title" label="Title" defaultValue="" />
              <Select name="kind" label="Kind"
                      options={["SCREENSHOT", "EXPORT", "LOG", "ATTESTATION", "CONFIG", "REPORT", "OTHER"].map((k) => ({ value: k, label: k.toLowerCase() }))} />
              <Select name="source" label="Source"
                      options={[
                        { value: "MANUAL", label: "Manual upload" },
                        { value: "AUTO",   label: "Auto-collected" },
                      ]} />
              <Input name="collector" label="Collector (e.g. AWS CloudTrail, Okta)" defaultValue="" optional />
              <Input name="fileUrl" label="File URL (optional)" type="url" defaultValue="" optional />
              <label className="col-span-2 block">
                <span className="mb-0.5 block text-[11px] font-medium" style={{ color: "var(--text-muted)" }}>Description</span>
                <textarea name="description" rows={2} className="w-full rounded-md border px-2 py-1.5 text-[12px]"
                          style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)", color: "var(--text-default)" }} />
              </label>
              <div className="col-span-2 flex justify-end">
                <button type="submit" className="inline-flex h-8 items-center rounded-md px-3 text-[12px] font-medium"
                        style={{ background: "var(--accent-default)", color: "var(--accent-fg)" }}>
                  Upload
                </button>
              </div>
            </form>
          </details>
        </div>
      )}
    </section>
  );
}

/* ── Policies ──────────────────────────────────────────── */

function PoliciesTab({
  policies, canPolicyWrite, staffCount, userEmail,
}: {
  policies: { rows: PolicyRow[] };
  canPolicyWrite: boolean;
  staffCount: number;
  userEmail: string;
}) {
  return (
    <div className="grid grid-cols-1 gap-3">
      {policies.rows.map((p) => {
        const ackPct = staffCount === 0 ? 0 : Math.round((p.ackCount / staffCount) * 100);
        return (
          <section key={p.id} className="rounded-xl border p-4"
                   style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)" }}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="flex-1 min-w-[220px]">
                <div className="flex items-center gap-2">
                  <h4 className="text-[13px] font-semibold" style={{ color: "var(--text-default)" }}>{p.title}</h4>
                  <PolicyStatusPill status={p.status} />
                  <span className="text-[11px] tabular-nums" style={{ color: "var(--text-muted)" }}>v{p.version}</span>
                </div>
                {p.description && (
                  <p className="mt-1 text-[12px]" style={{ color: "var(--text-muted)" }}>{p.description}</p>
                )}
                <div className="mt-2 grid grid-cols-2 gap-2 text-[11px]">
                  <div>
                    <span style={{ color: "var(--text-muted)" }}>Owner: </span>
                    <span style={{ color: "var(--text-default)" }}>{p.ownerEmail ?? "—"}</span>
                  </div>
                  <div>
                    <span style={{ color: "var(--text-muted)" }}>Distribution: </span>
                    <span style={{ color: "var(--text-default)" }}>{p.distribution ?? "—"}</span>
                  </div>
                  <div>
                    <span style={{ color: "var(--text-muted)" }}>Last reviewed: </span>
                    <span style={{ color: "var(--text-default)" }}>{shortDate(p.lastReviewedAt)}</span>
                  </div>
                  <div>
                    <span style={{ color: "var(--text-muted)" }}>Next review: </span>
                    <span style={{ color: "var(--text-default)" }}>{shortDate(p.nextReviewAt)}</span>
                  </div>
                </div>
              </div>
              <div className="w-[200px] flex-none">
                <div className="flex items-baseline justify-between text-[11px]">
                  <span style={{ color: "var(--text-muted)" }}>Acknowledged</span>
                  <span className="tabular-nums" style={{ color: "var(--text-default)" }}>
                    {p.ackCount}/{staffCount} · {ackPct}%
                  </span>
                </div>
                <PercentBar pct={ackPct} />
                <form action={acknowledgePolicy} className="mt-2 flex justify-end">
                  <input type="hidden" name="policyId" value={p.id} />
                  <input type="hidden" name="policyVersion" value={p.version} />
                  <button type="submit"
                          className="text-[11px] font-medium underline"
                          style={{ color: "var(--accent-default)" }}>
                    Acknowledge as {userEmail.split("@")[0]}
                  </button>
                </form>
              </div>
            </div>
          </section>
        );
      })}
      {canPolicyWrite && (
        <section className="rounded-xl border border-dashed p-4"
                 style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)" }}>
          <h3 className="text-[13px] font-semibold" style={{ color: "var(--text-default)" }}>+ Save policy</h3>
          <form action={savePolicy} className="mt-3 grid grid-cols-2 gap-2">
            <Input name="slug" label="Slug" defaultValue="" />
            <Input name="version" label="Version" defaultValue="1.0" />
            <Input name="title" label="Title" defaultValue="" />
            <Select name="status" label="Status"
                    options={[
                      { value: "DRAFT",     label: "Draft" },
                      { value: "IN_REVIEW", label: "In review" },
                      { value: "APPROVED",  label: "Approved" },
                      { value: "RETIRED",   label: "Retired" },
                    ]} />
            <Input name="ownerEmail" label="Owner email" type="email" defaultValue="" optional />
            <Input name="distribution" label="Distribution" defaultValue="All staff" optional />
            <Input name="nextReviewAt" label="Next review (YYYY-MM-DD)" type="date" defaultValue="" optional />
            <label className="col-span-2 block">
              <span className="mb-0.5 block text-[11px] font-medium" style={{ color: "var(--text-muted)" }}>Description</span>
              <textarea name="description" rows={2} className="w-full rounded-md border px-2 py-1.5 text-[12px]"
                        style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)", color: "var(--text-default)" }} />
            </label>
            <label className="col-span-2 block">
              <span className="mb-0.5 block text-[11px] font-medium" style={{ color: "var(--text-muted)" }}>Body (Markdown)</span>
              <textarea name="body" rows={8} className="w-full rounded-md border px-2 py-1.5 text-[12px] font-mono"
                        style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)", color: "var(--text-default)" }} />
            </label>
            <div className="col-span-2 flex justify-end">
              <button type="submit" className="inline-flex h-8 items-center rounded-md px-3 text-[12px] font-medium"
                      style={{ background: "var(--accent-default)", color: "var(--accent-fg)" }}>
                Save policy
              </button>
            </div>
          </form>
        </section>
      )}
    </div>
  );
}

/* ── Sub-Processors ────────────────────────────────────── */

function SubProcessorsTab({
  rows, canManage,
}: { rows: SubProcessorRow[]; canManage: boolean }) {
  return (
    <section className="rounded-xl border"
             style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)" }}>
      <header className="border-b px-4 py-3" style={{ borderColor: "var(--border-subtle)" }}>
        <h3 className="text-[13px] font-semibold" style={{ color: "var(--text-default)" }}>Sub-processors</h3>
        <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>
          Public sub-processor list · {rows.filter((r) => r.publiclyListed).length} listed publicly
        </p>
      </header>
      <div className="overflow-x-auto p-4">
        {rows.length === 0 ? <Empty>No sub-processors yet.</Empty> : (
          <table className="w-full">
            <thead>
              <tr style={{ color: "var(--text-muted)" }}>
                <Th>Name</Th><Th>Purpose</Th><Th>Region</Th><Th>Risk</Th><Th>Certifications</Th><Th>DPA</Th><Th>Last reviewed</Th>
                {canManage && <Th right>Action</Th>}
              </tr>
            </thead>
            <tbody>
              {rows.map((s) => (
                <tr key={s.id} className="border-t" style={{ borderColor: "var(--border-subtle)" }}>
                  <Td>
                    <div className="text-[12px] font-medium" style={{ color: "var(--text-default)" }}>
                      {s.websiteUrl ? (
                        <a href={s.websiteUrl} target="_blank" rel="noopener noreferrer"
                           className="underline" style={{ color: "var(--accent-default)" }}>{s.name}</a>
                      ) : s.name}
                    </div>
                    {!s.publiclyListed && (
                      <div className="text-[10px]" style={{ color: "var(--text-muted)" }}>Internal only</div>
                    )}
                  </Td>
                  <Td><span className="text-[11px]" style={{ color: "var(--text-default)" }}>{s.purpose}</span></Td>
                  <Td><span className="text-[11px]" style={{ color: "var(--text-muted)" }}>{s.dataLocation}</span></Td>
                  <Td><RiskTierPill tier={s.riskTier} /></Td>
                  <Td>
                    <div className="flex flex-wrap gap-1">
                      {s.certifications.length === 0
                        ? <span className="text-[11px]" style={{ color: "var(--text-muted)" }}>—</span>
                        : s.certifications.map((c) => <CertChip key={c} cert={c} />)}
                    </div>
                  </Td>
                  <Td>
                    {s.dpaOnFile ? (
                      <span className="inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-semibold"
                            style={{ background: "var(--emerald-100)", color: "var(--emerald-700)" }}>On file</span>
                    ) : (
                      <span className="inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-semibold"
                            style={{ background: "var(--rose-100)", color: "var(--rose-700)" }}>Missing</span>
                    )}
                  </Td>
                  <Td><span className="text-[11px] tabular-nums" style={{ color: "var(--text-muted)" }}>
                    {s.lastReviewedAt ? relativeFromNow(s.lastReviewedAt) : "never"}
                  </span></Td>
                  {canManage && (
                    <Td right>
                      <form action={deleteSubProcessor}>
                        <input type="hidden" name="id" value={s.id} />
                        <button type="submit" className="text-[11px] font-medium underline"
                                style={{ color: "var(--text-muted)" }}>
                          Remove
                        </button>
                      </form>
                    </Td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      {canManage && (
        <div className="border-t px-4 py-3" style={{ borderColor: "var(--border-subtle)" }}>
          <details>
            <summary className="cursor-pointer text-[12px] font-semibold" style={{ color: "var(--text-default)" }}>
              + Add sub-processor
            </summary>
            <form action={saveSubProcessor} className="mt-3 grid grid-cols-2 gap-2">
              <Input name="name" label="Name" defaultValue="" />
              <Input name="purpose" label="Purpose" defaultValue="" />
              <Input name="dataLocation" label="Data location" defaultValue="us-east-1" />
              <Select name="riskTier" label="Risk tier"
                      options={[
                        { value: "LOW",      label: "Low" },
                        { value: "MEDIUM",   label: "Medium" },
                        { value: "HIGH",     label: "High" },
                        { value: "CRITICAL", label: "Critical" },
                      ]} />
              <Input name="websiteUrl" label="Website URL" type="url" defaultValue="" optional />
              <Input name="privacyUrl" label="Privacy URL" type="url" defaultValue="" optional />
              <Input name="dpaUrl" label="DPA URL" type="url" defaultValue="" optional />
              <Input name="certifications" label="Certifications (comma-separated)" defaultValue="SOC2_TYPE_II" optional />
              <label className="inline-flex items-center gap-2 text-[12px]" style={{ color: "var(--text-default)" }}>
                <input type="checkbox" name="dpaOnFile" /> DPA on file
              </label>
              <label className="inline-flex items-center gap-2 text-[12px]" style={{ color: "var(--text-default)" }}>
                <input type="checkbox" name="publiclyListed" defaultChecked /> Show on public /sub-processors
              </label>
              <label className="col-span-2 block">
                <span className="mb-0.5 block text-[11px] font-medium" style={{ color: "var(--text-muted)" }}>Notes</span>
                <textarea name="notes" rows={2} className="w-full rounded-md border px-2 py-1.5 text-[12px]"
                          style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)", color: "var(--text-default)" }} />
              </label>
              <div className="col-span-2 flex justify-end">
                <button type="submit" className="inline-flex h-8 items-center rounded-md px-3 text-[12px] font-medium"
                        style={{ background: "var(--accent-default)", color: "var(--accent-fg)" }}>
                  Save sub-processor
                </button>
              </div>
            </form>
          </details>
        </div>
      )}
    </section>
  );
}

/* ── Tenant DPAs ───────────────────────────────────────── */

function TenantDpasTab({
  rows, tenants, canManage,
}: {
  rows: TenantDpaRow[];
  tenants: { id: string; name: string; slug: string }[];
  canManage: boolean;
}) {
  return (
    <section className="rounded-xl border"
             style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)" }}>
      <header className="border-b px-4 py-3" style={{ borderColor: "var(--border-subtle)" }}>
        <h3 className="text-[13px] font-semibold" style={{ color: "var(--text-default)" }}>Tenant DPAs</h3>
        <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>
          {rows.length} DPAs tracked
        </p>
      </header>
      <div className="overflow-x-auto p-4">
        {rows.length === 0 ? <Empty>No DPAs requested yet.</Empty> : (
          <table className="w-full">
            <thead>
              <tr style={{ color: "var(--text-muted)" }}>
                <Th>Tenant</Th><Th>Status</Th><Th>Template</Th><Th>Signer</Th><Th>Signed</Th><Th>Counter-signed</Th><Th>Expires</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((d) => (
                <tr key={d.id} className="border-t" style={{ borderColor: "var(--border-subtle)" }}>
                  <Td>
                    <div className="text-[12px] font-medium" style={{ color: "var(--text-default)" }}>{d.tenantName}</div>
                    <div className="text-[11px]" style={{ color: "var(--text-muted)" }}>{d.tenantSlug}</div>
                  </Td>
                  <Td><DpaPill status={d.status} /></Td>
                  <Td><span className="text-[11px] tabular-nums" style={{ color: "var(--text-default)" }}>{d.templateVersion ?? "—"}</span></Td>
                  <Td>
                    <div className="text-[11px]" style={{ color: "var(--text-default)" }}>{d.tenantSignerName ?? "—"}</div>
                    <div className="text-[11px]" style={{ color: "var(--text-muted)" }}>{d.tenantSignerEmail ?? ""}</div>
                  </Td>
                  <Td><span className="text-[11px] tabular-nums" style={{ color: "var(--text-muted)" }}>{shortDate(d.signedAt)}</span></Td>
                  <Td><span className="text-[11px] tabular-nums" style={{ color: "var(--text-muted)" }}>{shortDate(d.countersignedAt)}</span></Td>
                  <Td><span className="text-[11px] tabular-nums" style={{ color: "var(--text-muted)" }}>{shortDate(d.expiresAt)}</span></Td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      {canManage && (
        <div className="border-t px-4 py-3" style={{ borderColor: "var(--border-subtle)" }}>
          <details>
            <summary className="cursor-pointer text-[12px] font-semibold" style={{ color: "var(--text-default)" }}>
              + Save / update tenant DPA
            </summary>
            <form action={saveTenantDpa} className="mt-3 grid grid-cols-2 gap-2">
              <Select name="tenantId" label="Tenant"
                      options={tenants.map((t) => ({ value: t.id, label: `${t.name} (${t.slug})` }))} />
              <Select name="status" label="Status"
                      options={[
                        { value: "NOT_REQUESTED",            label: "Not requested" },
                        { value: "REQUESTED",                label: "Requested" },
                        { value: "PENDING_TENANT_SIGNATURE", label: "Pending tenant signature" },
                        { value: "PENDING_COUNTERSIGNATURE", label: "Pending counter-signature" },
                        { value: "SIGNED",                   label: "Signed" },
                        { value: "EXPIRED",                  label: "Expired" },
                      ]} />
              <Input name="templateVersion" label="Template version" defaultValue="2026-Q1" optional />
              <Input name="pdfUrl" label="Executed PDF URL" type="url" defaultValue="" optional />
              <Input name="tenantSignerName" label="Tenant signer name" defaultValue="" optional />
              <Input name="tenantSignerEmail" label="Tenant signer email" type="email" defaultValue="" optional />
              <Input name="tenantSignerTitle" label="Tenant signer title" defaultValue="" optional />
              <label className="col-span-2 block">
                <span className="mb-0.5 block text-[11px] font-medium" style={{ color: "var(--text-muted)" }}>Notes</span>
                <textarea name="notes" rows={2} className="w-full rounded-md border px-2 py-1.5 text-[12px]"
                          style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)", color: "var(--text-default)" }} />
              </label>
              <div className="col-span-2 flex justify-end">
                <button type="submit" className="inline-flex h-8 items-center rounded-md px-3 text-[12px] font-medium"
                        style={{ background: "var(--accent-default)", color: "var(--accent-fg)" }}>
                  Save DPA
                </button>
              </div>
            </form>
          </details>
        </div>
      )}
    </section>
  );
}

/* ── Risk Register ─────────────────────────────────────── */

function RisksTab({
  rows, canManage,
}: { rows: RiskRow[]; canManage: boolean }) {
  const heatmap = buildRiskHeatmap(rows);
  return (
    <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
      {/* Heatmap */}
      <section className="rounded-xl border p-4 lg:col-span-1"
               style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)" }}>
        <h3 className="text-[13px] font-semibold" style={{ color: "var(--text-default)" }}>Risk heatmap</h3>
        <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>
          5×5 matrix · likelihood × impact = inherent score
        </p>
        <div className="mt-3 grid grid-cols-[auto_repeat(5,1fr)] gap-1">
          <div />
          {Object.values(IMPACT_LABEL).map((i) => (
            <div key={i.label} className="text-center text-[10px] font-medium" style={{ color: "var(--text-muted)" }}>{i.label}</div>
          ))}
          {[5, 4, 3, 2, 1].map((rowRank) => {
            const ll = Object.entries(LIKELIHOOD_LABEL).find(([, v]) => v.rank === rowRank)?.[1].label ?? "";
            return (
              <React.Fragment key={rowRank}>
                <div className="text-right text-[10px] font-medium" style={{ color: "var(--text-muted)" }}>{ll}</div>
                {[1, 2, 3, 4, 5].map((colRank) => {
                  const li = rowRank - 1;
                  const ii = colRank - 1;
                  const count = heatmap[li]?.[ii] ?? 0;
                  const score = rowRank * colRank;
                  const tone =
                    score >= 16 ? "var(--rose-200)" :
                    score >= 9  ? "var(--amber-200)" :
                    score >= 5  ? "var(--sky-200)" :
                                  "var(--emerald-200)";
                  return (
                    <div key={colRank} className="flex h-9 items-center justify-center rounded-md text-[12px] font-semibold"
                         style={{ background: tone, color: "var(--text-default)" }}>
                      {count > 0 ? count : ""}
                    </div>
                  );
                })}
              </React.Fragment>
            );
          })}
        </div>
      </section>

      {/* Table */}
      <section className="rounded-xl border lg:col-span-2"
               style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)" }}>
        <header className="border-b px-4 py-3" style={{ borderColor: "var(--border-subtle)" }}>
          <h3 className="text-[13px] font-semibold" style={{ color: "var(--text-default)" }}>Risk register</h3>
          <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>
            {rows.length} risks · sorted by status, then score
          </p>
        </header>
        <div className="overflow-x-auto p-4">
          {rows.length === 0 ? <Empty>No risks yet.</Empty> : (
            <table className="w-full">
              <thead>
                <tr style={{ color: "var(--text-muted)" }}>
                  <Th>ID</Th><Th>Title</Th><Th>Owner</Th><Th>Score</Th><Th>Residual</Th><Th>Status</Th><Th>Next review</Th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-t" style={{ borderColor: "var(--border-subtle)" }}>
                    <Td><code className="text-[11px] tabular-nums" style={{ color: "var(--text-default)" }}>{r.externalId}</code></Td>
                    <Td>
                      <div className="text-[12px] font-medium" style={{ color: "var(--text-default)" }}>{r.title}</div>
                      {r.controlExternalId && (
                        <div className="text-[11px]" style={{ color: "var(--text-muted)" }}>
                          Control: <code>{r.controlExternalId}</code>
                        </div>
                      )}
                    </Td>
                    <Td><span className="text-[11px]" style={{ color: "var(--text-muted)" }}>{r.ownerEmail ?? "—"}</span></Td>
                    <Td><RiskScoreBadge score={r.score} /></Td>
                    <Td><RiskScoreBadge score={r.residualScore} /></Td>
                    <Td><RiskStatusPill status={r.status} /></Td>
                    <Td><span className="text-[11px] tabular-nums" style={{ color: "var(--text-muted)" }}>
                      {shortDate(r.nextReviewAt)}
                    </span></Td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        {canManage && (
          <div className="border-t px-4 py-3" style={{ borderColor: "var(--border-subtle)" }}>
            <details>
              <summary className="cursor-pointer text-[12px] font-semibold" style={{ color: "var(--text-default)" }}>
                + Save / update risk
              </summary>
              <form action={saveRisk} className="mt-3 grid grid-cols-2 gap-2">
                <Input name="externalId" label="Risk ID (e.g. RISK-014)" defaultValue="" />
                <Input name="title" label="Title" defaultValue="" />
                <Input name="ownerEmail" label="Owner email" type="email" defaultValue="" optional />
                <Input name="controlExternalId" label="Linked control ID" defaultValue="" optional />
                <Select name="likelihood" label="Likelihood"
                        options={Object.entries(LIKELIHOOD_LABEL).map(([k, v]) => ({ value: k, label: v.label }))} />
                <Select name="impact" label="Impact"
                        options={Object.entries(IMPACT_LABEL).map(([k, v]) => ({ value: k, label: v.label }))} />
                <Select name="residualLikelihood" label="Residual likelihood"
                        options={Object.entries(LIKELIHOOD_LABEL).map(([k, v]) => ({ value: k, label: v.label }))} />
                <Select name="residualImpact" label="Residual impact"
                        options={Object.entries(IMPACT_LABEL).map(([k, v]) => ({ value: k, label: v.label }))} />
                <Select name="status" label="Status"
                        options={[
                          { value: "IDENTIFIED",  label: "Identified" },
                          { value: "PLANNED",     label: "Planned" },
                          { value: "IN_PROGRESS", label: "In progress" },
                          { value: "MITIGATED",   label: "Mitigated" },
                          { value: "ACCEPTED",    label: "Accepted" },
                        ]} />
                <Input name="nextReviewAt" label="Next review (YYYY-MM-DD)" type="date" defaultValue="" optional />
                <label className="col-span-2 block">
                  <span className="mb-0.5 block text-[11px] font-medium" style={{ color: "var(--text-muted)" }}>Description</span>
                  <textarea name="description" rows={2} className="w-full rounded-md border px-2 py-1.5 text-[12px]"
                            style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)", color: "var(--text-default)" }} />
                </label>
                <label className="col-span-2 block">
                  <span className="mb-0.5 block text-[11px] font-medium" style={{ color: "var(--text-muted)" }}>Mitigation</span>
                  <textarea name="mitigation" rows={2} className="w-full rounded-md border px-2 py-1.5 text-[12px]"
                            style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)", color: "var(--text-default)" }} />
                </label>
                <div className="col-span-2 flex justify-end">
                  <button type="submit" className="inline-flex h-8 items-center rounded-md px-3 text-[12px] font-medium"
                          style={{ background: "var(--accent-default)", color: "var(--accent-fg)" }}>
                    Save risk
                  </button>
                </div>
              </form>
            </details>
          </div>
        )}
      </section>
    </div>
  );
}

function RiskScoreBadge({ score }: { score: number }) {
  const tone =
    score >= 16 ? "var(--rose-100)" :
    score >= 9  ? "var(--amber-100)" :
    score >= 5  ? "var(--sky-100)" :
                  "var(--emerald-100)";
  const fg =
    score >= 16 ? "var(--rose-700)" :
    score >= 9  ? "var(--amber-700)" :
    score >= 5  ? "var(--sky-700)" :
                  "var(--emerald-700)";
  return (
    <span className="inline-flex h-6 min-w-[28px] items-center justify-center rounded-md px-1.5 text-[11px] font-semibold tabular-nums"
          style={{ background: tone, color: fg }}>
      {score}
    </span>
  );
}

/* ── Vendor Reviews ────────────────────────────────────── */

function VendorsTab({
  rows, canVendor,
}: { rows: VendorReviewRow[]; canVendor: boolean }) {
  return (
    <section className="rounded-xl border"
             style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)" }}>
      <header className="border-b px-4 py-3" style={{ borderColor: "var(--border-subtle)" }}>
        <h3 className="text-[13px] font-semibold" style={{ color: "var(--text-default)" }}>Vendor reviews</h3>
        <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>
          {rows.length} vendors · CAIQ-Lite scored 0-100
        </p>
      </header>
      <div className="overflow-x-auto p-4">
        {rows.length === 0 ? <Empty>No vendor reviews yet.</Empty> : (
          <table className="w-full">
            <thead>
              <tr style={{ color: "var(--text-muted)" }}>
                <Th>Vendor</Th><Th>Owner</Th><Th>Status</Th><Th>Region</Th><Th>Data</Th>
                <Th>Certifications</Th><Th>CAIQ</Th><Th>Next review</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((v) => (
                <tr key={v.id} className="border-t" style={{ borderColor: "var(--border-subtle)" }}>
                  <Td>
                    <div className="text-[12px] font-medium" style={{ color: "var(--text-default)" }}>
                      {v.vendorUrl ? (
                        <a href={v.vendorUrl} target="_blank" rel="noopener noreferrer"
                           className="underline" style={{ color: "var(--accent-default)" }}>{v.vendorName}</a>
                      ) : v.vendorName}
                    </div>
                  </Td>
                  <Td><span className="text-[11px]" style={{ color: "var(--text-muted)" }}>{v.ownerEmail ?? "—"}</span></Td>
                  <Td><VendorStatusPill status={v.status} /></Td>
                  <Td><span className="text-[11px]" style={{ color: "var(--text-muted)" }}>{v.region ?? "—"}</span></Td>
                  <Td>
                    <div className="flex flex-wrap gap-1">
                      {v.dataCategories.length === 0
                        ? <span className="text-[11px]" style={{ color: "var(--text-muted)" }}>—</span>
                        : v.dataCategories.map((c) => (
                          <span key={c} className="inline-flex items-center rounded-md px-1.5 py-0.5 text-[10px] font-medium"
                                style={{ background: "var(--surface-2)", color: "var(--text-default)" }}>
                            {c}
                          </span>
                        ))}
                    </div>
                  </Td>
                  <Td>
                    <div className="flex flex-wrap gap-1">
                      {v.certifications.length === 0
                        ? <span className="text-[11px]" style={{ color: "var(--text-muted)" }}>—</span>
                        : v.certifications.map((c) => <CertChip key={c} cert={c} />)}
                    </div>
                  </Td>
                  <Td>
                    {v.questionnaireScore != null ? (
                      <span className="text-[12px] tabular-nums font-semibold"
                            style={{ color: v.questionnaireScore >= 80 ? "var(--emerald-700)" : v.questionnaireScore >= 60 ? "var(--amber-700)" : "var(--rose-700)" }}>
                        {v.questionnaireScore}
                      </span>
                    ) : <span className="text-[11px]" style={{ color: "var(--text-muted)" }}>—</span>}
                  </Td>
                  <Td><span className="text-[11px] tabular-nums" style={{ color: "var(--text-muted)" }}>{shortDate(v.nextReviewAt)}</span></Td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      {canVendor && (
        <div className="border-t px-4 py-3" style={{ borderColor: "var(--border-subtle)" }}>
          <details>
            <summary className="cursor-pointer text-[12px] font-semibold" style={{ color: "var(--text-default)" }}>
              + New vendor review
            </summary>
            <form action={saveVendorReview} className="mt-3 grid grid-cols-2 gap-2">
              <Input name="vendorName" label="Vendor name" defaultValue="" />
              <Input name="vendorUrl" label="Vendor URL" type="url" defaultValue="" optional />
              <Input name="ownerEmail" label="Owner email" type="email" defaultValue="" optional />
              <Select name="status" label="Status"
                      options={[
                        { value: "PENDING_QUESTIONNAIRE",  label: "Pending CAIQ" },
                        { value: "IN_REVIEW",              label: "In review" },
                        { value: "APPROVED",               label: "Approved" },
                        { value: "CONDITIONALLY_APPROVED", label: "Conditional" },
                        { value: "REJECTED",               label: "Rejected" },
                        { value: "ARCHIVED",               label: "Archived" },
                      ]} />
              <Input name="region" label="Region" defaultValue="us-east-1" optional />
              <Input name="dataCategories" label="Data categories (comma-separated, e.g. PII, financial)" defaultValue="" optional />
              <Input name="certifications" label="Certifications (comma-separated, e.g. SOC2_TYPE_II,ISO_27001)" defaultValue="" optional />
              <Input name="questionnaireScore" label="CAIQ score 0-100" type="number" defaultValue="" optional />
              <Input name="soc2Url" label="SOC 2 report URL" type="url" defaultValue="" optional />
              <Input name="contractUrl" label="Contract URL" type="url" defaultValue="" optional />
              <Input name="nextReviewAt" label="Next review (YYYY-MM-DD)" type="date" defaultValue="" optional />
              <label className="col-span-2 block">
                <span className="mb-0.5 block text-[11px] font-medium" style={{ color: "var(--text-muted)" }}>CAIQ body</span>
                <textarea name="questionnaireBody" rows={5} className="w-full rounded-md border px-2 py-1.5 text-[12px] font-mono"
                          style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)", color: "var(--text-default)" }} />
              </label>
              <label className="col-span-2 block">
                <span className="mb-0.5 block text-[11px] font-medium" style={{ color: "var(--text-muted)" }}>Reject reason (if rejecting)</span>
                <textarea name="rejectedReason" rows={2} className="w-full rounded-md border px-2 py-1.5 text-[12px]"
                          style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)", color: "var(--text-default)" }} />
              </label>
              <div className="col-span-2 flex justify-end">
                <button type="submit" className="inline-flex h-8 items-center rounded-md px-3 text-[12px] font-medium"
                        style={{ background: "var(--accent-default)", color: "var(--accent-fg)" }}>
                  Save review
                </button>
              </div>
            </form>
          </details>
        </div>
      )}
    </section>
  );
}

/* ── Reports ───────────────────────────────────────────── */

function ReportsTab({
  rows, frameworks, canReport,
}: {
  rows: ReportRow[];
  frameworks: FrameworkCard[];
  canReport: boolean;
}) {
  return (
    <section className="rounded-xl border"
             style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)" }}>
      <header className="border-b px-4 py-3" style={{ borderColor: "var(--border-subtle)" }}>
        <h3 className="text-[13px] font-semibold" style={{ color: "var(--text-default)" }}>Audit packages</h3>
        <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>
          Auto-generated PDF + ZIP bundles for auditors
        </p>
      </header>
      <div className="overflow-x-auto p-4">
        {rows.length === 0 ? <Empty>No reports yet.</Empty> : (
          <table className="w-full">
            <thead>
              <tr style={{ color: "var(--text-muted)" }}>
                <Th>Title</Th><Th>Kind</Th><Th>Period</Th><Th>Status</Th><Th>Size</Th><Th>Generated</Th><Th right>Download</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-t" style={{ borderColor: "var(--border-subtle)" }}>
                  <Td>
                    <div className="text-[12px] font-medium" style={{ color: "var(--text-default)" }}>{r.title}</div>
                  </Td>
                  <Td><span className="text-[11px]" style={{ color: "var(--text-muted)" }}>{REPORT_KIND_LABEL[r.kind]}</span></Td>
                  <Td><span className="text-[11px] tabular-nums" style={{ color: "var(--text-default)" }}>
                    {r.periodStart && r.periodEnd ? `${shortDate(r.periodStart)} → ${shortDate(r.periodEnd)}` : "—"}
                  </span></Td>
                  <Td><ReportStatusPill status={r.status} /></Td>
                  <Td><span className="text-[11px] tabular-nums" style={{ color: "var(--text-muted)" }}>
                    {r.bytes ? `${(r.bytes / 1024 / 1024).toFixed(1)} MB` : "—"}
                  </span></Td>
                  <Td><span className="text-[11px] tabular-nums" style={{ color: "var(--text-muted)" }}>{relativeFromNow(r.createdAt)}</span></Td>
                  <Td right>
                    <div className="flex justify-end gap-2">
                      {r.pdfUrl && (
                        <a href={r.pdfUrl} target="_blank" rel="noopener noreferrer"
                           className="text-[11px] font-medium underline" style={{ color: "var(--accent-default)" }}>PDF</a>
                      )}
                      {r.zipUrl && (
                        <a href={r.zipUrl} target="_blank" rel="noopener noreferrer"
                           className="text-[11px] font-medium underline" style={{ color: "var(--accent-default)" }}>ZIP</a>
                      )}
                    </div>
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      {canReport && (
        <div className="border-t px-4 py-3" style={{ borderColor: "var(--border-subtle)" }}>
          <details>
            <summary className="cursor-pointer text-[12px] font-semibold" style={{ color: "var(--text-default)" }}>
              + Generate audit package
            </summary>
            <form action={generateReport} className="mt-3 grid grid-cols-2 gap-2">
              <Select name="kind" label="Kind"
                      options={Object.entries(REPORT_KIND_LABEL).map(([k, v]) => ({ value: k, label: v }))} />
              <Input name="title" label="Title" defaultValue="" />
              <Select name="frameworkId" label="Framework (optional)"
                      options={[{ value: "", label: "—" }, ...frameworks.map((f) => ({ value: f.id, label: f.name }))]} />
              <div />
              <Input name="periodStart" label="Period start" type="date" defaultValue="" optional />
              <Input name="periodEnd"   label="Period end"   type="date" defaultValue="" optional />
              <label className="col-span-2 block">
                <span className="mb-0.5 block text-[11px] font-medium" style={{ color: "var(--text-muted)" }}>Notes</span>
                <textarea name="notes" rows={2} className="w-full rounded-md border px-2 py-1.5 text-[12px]"
                          style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)", color: "var(--text-default)" }} />
              </label>
              <div className="col-span-2 flex justify-end">
                <button type="submit" className="inline-flex h-8 items-center rounded-md px-3 text-[12px] font-medium"
                        style={{ background: "var(--accent-default)", color: "var(--accent-fg)" }}>
                  Generate
                </button>
              </div>
            </form>
          </details>
        </div>
      )}
    </section>
  );
}

/* ── Tiny shared helpers ──────────────────────────────── */

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-md border border-dashed px-4 py-6 text-center text-[12px]"
         style={{ borderColor: "var(--border-subtle)", color: "var(--text-muted)" }}>
      {children}
    </div>
  );
}

function Th({ children, right }: { children: React.ReactNode; right?: boolean }) {
  return (
    <th className={`pb-2 text-${right ? "right" : "left"} text-[11px] font-medium uppercase tracking-wide`}>{children}</th>
  );
}
function Td({ children, right }: { children: React.ReactNode; right?: boolean }) {
  return (
    <td className={`py-2 pr-3 align-top ${right ? "text-right" : ""}`}>{children}</td>
  );
}

function Input({
  name, label, type, defaultValue, optional,
}: { name: string; label: string; type?: string; defaultValue: string; optional?: boolean }) {
  return (
    <label className="block">
      <span className="mb-0.5 block text-[11px] font-medium" style={{ color: "var(--text-muted)" }}>
        {label}{!optional && <span style={{ color: "var(--rose-500)" }}> *</span>}
      </span>
      <input
        type={type ?? "text"}
        name={name}
        defaultValue={defaultValue}
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
