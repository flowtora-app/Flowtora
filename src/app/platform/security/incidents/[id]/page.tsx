// Page 54 — Incident detail.
//
// Tabs: Timeline · Affected · Comms · Mitigation · Postmortem · Action items · Metrics · Audit log

import * as React from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requirePlatformStaff } from "@/lib/platform";
import {
  loadIncidentDetail,
  TIMELINE_KIND_LABEL,
  COMM_CHANNEL_LABEL,
  formatDuration,
  relativeFromNow,
  shortDateTime,
} from "@/server/platform/incidents";
import {
  setIncidentStatus,
  assignIncidentRoles,
  addTimelineEvent,
  addAffectedService,
  addAffectedTenant,
  saveComm,
  publishComm,
  addMitigation,
  savePostmortem,
  saveActionItem,
  setActionItemStatus,
} from "@/app/actions/platform-incidents";
import {
  SeverityPill, StatusPill, NotificationPill, CommStatusPill,
  ActionItemPill, ComponentStatusPill, ChannelChip, TimelineKindIcon,
  DetectedByChip, FormError, FormOk,
} from "../_shared";
import type {
  IncidentTimelineKind, IncidentCommChannel,
  StatusPageComponentStatus, ActionItemStatus, IncidentStatus,
} from "@prisma/client";

export const dynamic = "force-dynamic";

type SP = Record<string, string | string[] | undefined>;
const asString = (v: string | string[] | undefined): string | undefined =>
  typeof v === "string" && v.length > 0 ? v : undefined;

const TABS = ["timeline", "affected", "comms", "mitigation", "postmortem", "action_items", "metrics", "audit"] as const;
type Tab = typeof TABS[number];
const TAB_LABEL: Record<Tab, string> = {
  timeline:     "Timeline",
  affected:     "Affected",
  comms:        "Comms",
  mitigation:   "Mitigation",
  postmortem:   "Postmortem",
  action_items: "Action items",
  metrics:      "Metrics",
  audit:        "Audit log",
};

const STATUSES: IncidentStatus[] = ["INVESTIGATING", "IDENTIFIED", "MONITORING", "RESOLVED"];
const TIMELINE_KINDS: IncidentTimelineKind[] = [
  "STATUS_CHANGE", "COMMS_SENT", "MITIGATION", "ROLE_ASSIGNED",
  "NOTE", "DEPLOY", "FLAG_TOGGLE", "PAGE_FIRED", "ALERT", "HANDOFF", "RESOLUTION",
];
const COMM_CHANNELS: IncidentCommChannel[] = ["STATUS_PAGE", "EMAIL", "TWITTER_X", "IN_APP", "SLACK"];
const COMPONENT_STATUSES: StatusPageComponentStatus[] = ["OPERATIONAL", "DEGRADED", "PARTIAL_OUTAGE", "MAJOR_OUTAGE", "MAINTENANCE"];
const ACTION_STATUSES: ActionItemStatus[] = ["TODO", "IN_PROGRESS", "DONE", "BLOCKED", "CANCELLED"];

const POSTMORTEM_TEMPLATE = `## What happened
A short, factual summary.

## Impact
- **Customers affected:** …
- **Services affected:** …
- **Duration:** …

## Root cause
What caused this. Use blameless language — focus on systems and process, not individuals.

## 5 Whys
1. Why? …
2. Why? …
3. Why? …
4. Why? …
5. Why? …

## Action items
List the concrete follow-ups (also tracked in the Action items tab).

## Lessons learned
What we learned about our system or processes.

## Customer-facing summary
A short, plain-English summary suitable for the public status page or email update.
`;

export default async function IncidentDetail({
  params, searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<SP>;
}) {
  const ctx = await requirePlatformStaff();
  if (!ctx.can("incidents.read")) {
    return (
      <main className="mx-auto max-w-2xl py-12 text-center">
        <h1 className="text-xl font-semibold">Access denied</h1>
      </main>
    );
  }
  const canManage = ctx.can("incidents.manage");
  const canPm     = ctx.can("incidents.postmortem.write");
  const canSp     = ctx.can("incidents.statuspage.write");

  const { id } = await params;
  const sp = await searchParams;
  const ok = asString(sp.ok);
  const error = asString(sp.error);
  const tabRaw = asString(sp.tab) as Tab | undefined;
  const tab: Tab = tabRaw && (TABS as readonly string[]).includes(tabRaw) ? tabRaw : "timeline";

  const r = await loadIncidentDetail(id);
  if (!r) notFound();

  const [staff, tenants] = await Promise.all([
    db.user.findMany({
      where: { platformRole: { not: null } },
      select: { id: true, email: true, name: true },
      orderBy: { email: "asc" },
      take: 50,
    }),
    db.tenant.findMany({ select: { id: true, name: true, slug: true }, orderBy: { name: "asc" } }),
  ]);

  return (
    <main className="mx-auto w-full max-w-[1480px] px-6 py-6">
      <header className="mb-5">
        <div className="flex items-center gap-2">
          <Link href="/platform/security/incidents"
                className="text-[12px] underline" style={{ color: "var(--text-muted)" }}>
            ← Incidents
          </Link>
        </div>
        <div className="mt-1 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="flex items-center gap-2 text-[22px] font-semibold" style={{ color: "var(--text-default)" }}>
              <span className="tabular-nums">{r.externalId}</span>
              <SeverityPill severity={r.severity} />
              <StatusPill status={r.status} />
            </h1>
            <h2 className="mt-1 text-[16px]" style={{ color: "var(--text-default)" }}>{r.title}</h2>
            <p className="mt-1 text-[12px]" style={{ color: "var(--text-muted)" }}>
              Started {shortDateTime(r.startedAt)}
              {r.detectedAt && <> · detected {relativeFromNow(r.detectedAt)}</>}
              {r.identifiedAt && <> · identified {relativeFromNow(r.identifiedAt)}</>}
              {r.resolvedAt && <> · resolved {relativeFromNow(r.resolvedAt)}</>}
              · duration {formatDuration(r.durationMin)}
              · <DetectedByChip d={r.detectedBy} />
            </p>
          </div>
          <div className="flex flex-col items-end gap-1">
            <FormOk msg={ok} />
            <FormError msg={error} />
          </div>
        </div>
      </header>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        {/* Right rail */}
        <aside className="space-y-3 lg:order-2 lg:col-span-3">
          <section className="rounded-xl border p-4"
                   style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)" }}>
            <h3 className="text-[13px] font-semibold" style={{ color: "var(--text-default)" }}>Roles</h3>
            <dl className="mt-2 space-y-1.5 text-[12px]">
              <Row label="Commander" value={r.commander?.email ?? r.commander?.name ?? "—"} />
              <Row label="Scribe"    value={r.scribe?.email ?? r.scribe?.name ?? "—"} />
              <Row label="Comms"     value={r.commsLead?.email ?? r.commsLead?.name ?? "—"} />
            </dl>
            {canManage && (
              <form action={assignIncidentRoles} className="mt-3 space-y-1.5">
                <input type="hidden" name="id" value={r.id} />
                <Select name="commanderId" label="Commander" defaultValue={r.commanderId ?? ""}
                        options={[{ value: "", label: "—" }, ...staff.map((s) => ({ value: s.id, label: s.email ?? s.id }))]} />
                <Select name="scribeId" label="Scribe" defaultValue={r.scribeId ?? ""}
                        options={[{ value: "", label: "—" }, ...staff.map((s) => ({ value: s.id, label: s.email ?? s.id }))]} />
                <Select name="commsLeadId" label="Comms lead" defaultValue={r.commsLeadId ?? ""}
                        options={[{ value: "", label: "—" }, ...staff.map((s) => ({ value: s.id, label: s.email ?? s.id }))]} />
                <div className="flex justify-end">
                  <button type="submit" className="text-[11px] font-medium underline" style={{ color: "var(--accent-default)" }}>
                    Assign
                  </button>
                </div>
              </form>
            )}
          </section>

          {canManage && (
            <section className="rounded-xl border p-4"
                     style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)" }}>
              <h3 className="text-[13px] font-semibold" style={{ color: "var(--text-default)" }}>Quick actions</h3>
              <div className="mt-2 space-y-2">
                <form action={setIncidentStatus} className="flex items-end gap-2">
                  <input type="hidden" name="id" value={r.id} />
                  <div className="flex-1">
                    <label className="block">
                      <span className="mb-0.5 block text-[11px] font-medium" style={{ color: "var(--text-muted)" }}>Set status</span>
                      <select name="status" defaultValue={r.status}
                              className="w-full rounded-md border px-2 py-1 text-[12px]"
                              style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)", color: "var(--text-default)" }}>
                        {STATUSES.map((s) => <option key={s} value={s}>{s.toLowerCase()}</option>)}
                      </select>
                    </label>
                  </div>
                  <button type="submit" className="rounded-md border px-2 py-1 text-[11px] font-medium"
                          style={{ background: "var(--surface-2)", borderColor: "var(--border-subtle)", color: "var(--text-default)" }}>
                    Apply
                  </button>
                </form>
                {r.status !== "RESOLVED" && (
                  <form action={setIncidentStatus}>
                    <input type="hidden" name="id" value={r.id} />
                    <input type="hidden" name="status" value="RESOLVED" />
                    <button type="submit" className="inline-flex h-7 w-full items-center justify-center rounded-md px-2 text-[11px] font-medium"
                            style={{ background: "var(--emerald-600, var(--emerald-500))", color: "white" }}>
                      Mark resolved
                    </button>
                  </form>
                )}
              </div>
              {r.runbook && (
                <div className="mt-3 rounded-md border px-2 py-1.5"
                     style={{ background: "var(--surface-2)", borderColor: "var(--border-subtle)" }}>
                  <div className="text-[11px]" style={{ color: "var(--text-muted)" }}>Linked runbook</div>
                  <div className="text-[12px] font-semibold" style={{ color: "var(--text-default)" }}>{r.runbook.title}</div>
                  <code className="text-[11px] tabular-nums" style={{ color: "var(--text-muted)" }}>{r.runbook.slug}</code>
                </div>
              )}
            </section>
          )}

          <section className="rounded-xl border p-4"
                   style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)" }}>
            <h3 className="text-[13px] font-semibold" style={{ color: "var(--text-default)" }}>Postmortem</h3>
            <dl className="mt-2 space-y-1 text-[11px]">
              <Row label="Required" value={r.postmortemRequired ? "Yes" : "No"} />
              <Row label="Due"      value={r.postmortemDueAt ? shortDateTime(r.postmortemDueAt) : "—"} />
              <Row label="Published" value={r.postmortemPublishedAt ? shortDateTime(r.postmortemPublishedAt) : "—"} />
            </dl>
            {r.postmortemUrl && (
              <a href={r.postmortemUrl} target="_blank" rel="noopener noreferrer"
                 className="mt-2 inline-block text-[11px] underline" style={{ color: "var(--accent-default)" }}>
                View published PDF
              </a>
            )}
          </section>

          {r.summary && (
            <section className="rounded-xl border p-4"
                     style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)" }}>
              <h3 className="text-[13px] font-semibold" style={{ color: "var(--text-default)" }}>Summary</h3>
              <p className="mt-1 whitespace-pre-wrap text-[12px]" style={{ color: "var(--text-default)" }}>{r.summary}</p>
            </section>
          )}
        </aside>

        {/* Main column */}
        <section className="lg:order-1 lg:col-span-9">
          <nav className="mb-4 flex flex-wrap gap-1 border-b" style={{ borderColor: "var(--border-subtle)" }}>
            {TABS.map((t) => (
              <a key={t} href={`?tab=${t}`}
                 className="-mb-px rounded-t-md px-3 py-2 text-[12px] font-medium transition"
                 style={{
                   borderBottom: tab === t ? "2px solid var(--accent-default)" : "2px solid transparent",
                   color: tab === t ? "var(--text-default)" : "var(--text-muted)",
                 }}>
                {TAB_LABEL[t]}
              </a>
            ))}
          </nav>

          {tab === "timeline" && (
            <TimelineTab id={r.id} timeline={r.timeline} canManage={canManage} />
          )}
          {tab === "affected" && (
            <AffectedTab id={r.id} services={r.affectedSvc} tenants={r.affectedTen}
                         tenantOptions={tenants} canManage={canManage} />
          )}
          {tab === "comms" && (
            <CommsTab id={r.id} comms={r.comms} canSp={canSp} />
          )}
          {tab === "mitigation" && (
            <MitigationTab id={r.id} mitigations={r.mitigations} canManage={canManage} />
          )}
          {tab === "postmortem" && (
            <PostmortemTab id={r.id} body={r.postmortemBody} customerSummary={r.customerSummary}
                           publishedAt={r.postmortemPublishedAt} canPm={canPm} />
          )}
          {tab === "action_items" && (
            <ActionItemsTab id={r.id} items={r.actionItems} canPm={canPm} />
          )}
          {tab === "metrics" && (
            <MetricsTab incident={r} />
          )}
          {tab === "audit" && (
            <AuditTab timeline={r.timeline} />
          )}
        </section>
      </div>
    </main>
  );
}

/* ── Timeline tab ──────────────────────────────────────── */

function TimelineTab({
  id, timeline, canManage,
}: {
  id: string;
  timeline: { id: string; kind: IncidentTimelineKind; body: string; actor: string | null; actorEmail: string | null; source: string | null; occurredAt: Date }[];
  canManage: boolean;
}) {
  return (
    <section className="rounded-xl border"
             style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)" }}>
      <header className="border-b px-4 py-3" style={{ borderColor: "var(--border-subtle)" }}>
        <h3 className="text-[13px] font-semibold" style={{ color: "var(--text-default)" }}>Timeline</h3>
        <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>{timeline.length} events</p>
      </header>
      <ul className="space-y-1 p-4">
        {timeline.length === 0 ? (
          <li className="text-[12px]" style={{ color: "var(--text-muted)" }}>No events yet.</li>
        ) : (
          timeline.map((ev) => (
            <li key={ev.id} className="grid grid-cols-[80px_24px_1fr] gap-2 rounded-md px-2 py-1.5"
                style={{ background: "var(--surface-2)" }}>
              <span className="text-[11px] tabular-nums" style={{ color: "var(--text-muted)" }}>
                {shortDateTime(ev.occurredAt).slice(11)}
              </span>
              <span className="flex items-start"><TimelineKindIcon kind={ev.kind} /></span>
              <div>
                <div className="text-[12px]" style={{ color: "var(--text-default)" }}>
                  <strong>{TIMELINE_KIND_LABEL[ev.kind]}.</strong> {ev.body}
                </div>
                <div className="text-[11px]" style={{ color: "var(--text-muted)" }}>
                  {ev.actorEmail ?? ev.actor ?? "system"}
                  {ev.source && <> · {ev.source}</>}
                </div>
              </div>
            </li>
          ))
        )}
      </ul>
      {canManage && (
        <div className="border-t px-4 py-3" style={{ borderColor: "var(--border-subtle)" }}>
          <details>
            <summary className="cursor-pointer text-[12px] font-semibold" style={{ color: "var(--text-default)" }}>
              + Add timeline entry
            </summary>
            <form action={addTimelineEvent} className="mt-3 grid grid-cols-2 gap-2">
              <input type="hidden" name="id" value={id} />
              <Select name="kind" label="Kind"
                      options={TIMELINE_KINDS.map((k) => ({ value: k, label: TIMELINE_KIND_LABEL[k] }))} />
              <Input name="source" label="Source (optional)" defaultValue="Manual" />
              <label className="col-span-2 block">
                <span className="mb-0.5 block text-[11px] font-medium" style={{ color: "var(--text-muted)" }}>Body</span>
                <textarea name="body" rows={2} className="w-full rounded-md border px-2 py-1.5 text-[12px]"
                          style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)", color: "var(--text-default)" }} />
              </label>
              <div className="col-span-2 flex justify-end">
                <button type="submit" className="inline-flex h-7 items-center rounded-md px-3 text-[11px] font-medium"
                        style={{ background: "var(--accent-default)", color: "var(--accent-fg)" }}>
                  Add entry
                </button>
              </div>
            </form>
          </details>
        </div>
      )}
    </section>
  );
}

/* ── Affected tab ──────────────────────────────────────── */

function AffectedTab({
  id, services, tenants, tenantOptions, canManage,
}: {
  id: string;
  services: { id: string; serviceName: string; componentStatus: StatusPageComponentStatus; region: string | null }[];
  tenants:  { id: string; tenantName: string; tenantId: string | null; tenant: { name: string; slug: string } | null; notificationStatus: import("@prisma/client").AffectedNotificationStatus; notifiedAt: Date | null; notes: string | null }[];
  tenantOptions: { id: string; name: string; slug: string }[];
  canManage: boolean;
}) {
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <section className="rounded-xl border"
               style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)" }}>
        <header className="border-b px-4 py-3" style={{ borderColor: "var(--border-subtle)" }}>
          <h3 className="text-[13px] font-semibold" style={{ color: "var(--text-default)" }}>Services affected</h3>
          <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>{services.length} components</p>
        </header>
        <ul className="space-y-1 p-4">
          {services.length === 0 ? <li className="text-[12px]" style={{ color: "var(--text-muted)" }}>None.</li> : (
            services.map((s) => (
              <li key={s.id} className="flex items-center justify-between rounded-md border px-2 py-1.5"
                  style={{ background: "var(--surface-2)", borderColor: "var(--border-subtle)" }}>
                <div>
                  <div className="text-[12px] font-medium" style={{ color: "var(--text-default)" }}>{s.serviceName}</div>
                  <div className="text-[11px]" style={{ color: "var(--text-muted)" }}>{s.region ?? "—"}</div>
                </div>
                <ComponentStatusPill status={s.componentStatus} />
              </li>
            ))
          )}
        </ul>
        {canManage && (
          <div className="border-t px-4 py-3" style={{ borderColor: "var(--border-subtle)" }}>
            <form action={addAffectedService} className="grid grid-cols-2 gap-2">
              <input type="hidden" name="id" value={id} />
              <Input name="serviceName" label="Service name" defaultValue="" required />
              <Select name="status" label="Status"
                      options={COMPONENT_STATUSES.map((s) => ({ value: s, label: s.toLowerCase().replace(/_/g, " ") }))} />
              <Input name="region" label="Region" defaultValue="" />
              <div className="flex justify-end">
                <button type="submit" className="inline-flex h-7 items-center rounded-md px-2 text-[11px] font-medium"
                        style={{ background: "var(--accent-default)", color: "var(--accent-fg)" }}>
                  Add service
                </button>
              </div>
            </form>
          </div>
        )}
      </section>

      <section className="rounded-xl border"
               style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)" }}>
        <header className="border-b px-4 py-3" style={{ borderColor: "var(--border-subtle)" }}>
          <h3 className="text-[13px] font-semibold" style={{ color: "var(--text-default)" }}>Tenants affected</h3>
          <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>{tenants.length} tenants</p>
        </header>
        <ul className="space-y-1 p-4">
          {tenants.length === 0 ? <li className="text-[12px]" style={{ color: "var(--text-muted)" }}>None.</li> : (
            tenants.map((t) => (
              <li key={t.id} className="flex items-center justify-between rounded-md border px-2 py-1.5"
                  style={{ background: "var(--surface-2)", borderColor: "var(--border-subtle)" }}>
                <div>
                  <div className="text-[12px] font-medium" style={{ color: "var(--text-default)" }}>
                    {t.tenant?.name ?? t.tenantName}
                  </div>
                  <div className="text-[11px]" style={{ color: "var(--text-muted)" }}>
                    {t.tenant?.slug ?? "—"}{t.notifiedAt && <> · notified {relativeFromNow(t.notifiedAt)}</>}
                  </div>
                </div>
                <NotificationPill status={t.notificationStatus} />
              </li>
            ))
          )}
        </ul>
        {canManage && (
          <div className="border-t px-4 py-3" style={{ borderColor: "var(--border-subtle)" }}>
            <form action={addAffectedTenant} className="grid grid-cols-2 gap-2">
              <input type="hidden" name="id" value={id} />
              <Select name="tenantId" label="Tenant"
                      options={tenantOptions.map((t) => ({ value: t.id, label: t.name }))} />
              <Input name="notes" label="Notes" defaultValue="" />
              <div className="col-span-2 flex justify-end">
                <button type="submit" className="inline-flex h-7 items-center rounded-md px-2 text-[11px] font-medium"
                        style={{ background: "var(--accent-default)", color: "var(--accent-fg)" }}>
                  Mark affected
                </button>
              </div>
            </form>
          </div>
        )}
      </section>
    </div>
  );
}

/* ── Comms tab ─────────────────────────────────────────── */

function CommsTab({
  id, comms, canSp,
}: {
  id: string;
  comms: { id: string; channel: IncidentCommChannel; status: import("@prisma/client").IncidentCommStatus; subject: string | null; body: string; audienceSize: number | null; authorName: string | null; publishedAt: Date | null; createdAt: Date }[];
  canSp: boolean;
}) {
  return (
    <section className="rounded-xl border"
             style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)" }}>
      <header className="border-b px-4 py-3" style={{ borderColor: "var(--border-subtle)" }}>
        <h3 className="text-[13px] font-semibold" style={{ color: "var(--text-default)" }}>Comms</h3>
        <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>
          {comms.length} drafts + published updates · status page, email, X/Twitter, in-app, Slack.
        </p>
      </header>
      <div className="space-y-3 p-4">
        {comms.length === 0 ? (
          <p className="text-[12px]" style={{ color: "var(--text-muted)" }}>No updates drafted yet.</p>
        ) : (
          comms.map((c) => (
            <div key={c.id} className="rounded-md border px-3 py-2"
                 style={{ background: "var(--surface-2)", borderColor: "var(--border-subtle)" }}>
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <ChannelChip ch={c.channel} />
                  <CommStatusPill status={c.status} />
                  {c.audienceSize != null && (
                    <span className="text-[10px] tabular-nums" style={{ color: "var(--text-muted)" }}>
                      {c.audienceSize.toLocaleString()} recipients
                    </span>
                  )}
                </div>
                <div className="text-[10px] tabular-nums" style={{ color: "var(--text-muted)" }}>
                  {c.authorName ?? "—"} · {relativeFromNow(c.publishedAt ?? c.createdAt)}
                </div>
              </div>
              {c.subject && <div className="mt-1 text-[12px] font-semibold" style={{ color: "var(--text-default)" }}>{c.subject}</div>}
              <div className="mt-1 whitespace-pre-wrap text-[12px]" style={{ color: "var(--text-default)" }}>{c.body}</div>
              {c.status === "DRAFT" && canSp && (
                <form action={publishComm} className="mt-2 flex justify-end">
                  <input type="hidden" name="id" value={c.id} />
                  <button type="submit" className="text-[11px] font-medium underline" style={{ color: "var(--accent-default)" }}>
                    Publish
                  </button>
                </form>
              )}
            </div>
          ))
        )}
      </div>
      {canSp && (
        <div className="border-t px-4 py-3" style={{ borderColor: "var(--border-subtle)" }}>
          <details>
            <summary className="cursor-pointer text-[12px] font-semibold" style={{ color: "var(--text-default)" }}>
              + Draft / publish update
            </summary>
            <form action={saveComm} className="mt-3 grid grid-cols-2 gap-2">
              <input type="hidden" name="id" value={id} />
              <Select name="channel" label="Channel"
                      options={COMM_CHANNELS.map((c) => ({ value: c, label: COMM_CHANNEL_LABEL[c] }))} />
              <Input name="subject" label="Subject" defaultValue="" />
              <label className="col-span-2 block">
                <span className="mb-0.5 block text-[11px] font-medium" style={{ color: "var(--text-muted)" }}>Body</span>
                <textarea name="body" rows={4} className="w-full rounded-md border px-2 py-1.5 text-[12px]"
                          style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)", color: "var(--text-default)" }} />
              </label>
              <label className="col-span-2 inline-flex items-center gap-2 text-[12px]" style={{ color: "var(--text-default)" }}>
                <input type="checkbox" name="publish" /> Publish immediately
              </label>
              <div className="col-span-2 flex justify-end">
                <button type="submit" className="inline-flex h-7 items-center rounded-md px-3 text-[11px] font-medium"
                        style={{ background: "var(--accent-default)", color: "var(--accent-fg)" }}>
                  Save
                </button>
              </div>
            </form>
          </details>
        </div>
      )}
    </section>
  );
}

/* ── Mitigation tab ────────────────────────────────────── */

function MitigationTab({
  id, mitigations, canManage,
}: {
  id: string;
  mitigations: { id: string; title: string; description: string | null; kind: string | null; reference: string | null; effective: boolean; appliedAt: Date }[];
  canManage: boolean;
}) {
  return (
    <section className="rounded-xl border"
             style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)" }}>
      <header className="border-b px-4 py-3" style={{ borderColor: "var(--border-subtle)" }}>
        <h3 className="text-[13px] font-semibold" style={{ color: "var(--text-default)" }}>Mitigation actions</h3>
        <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>{mitigations.length} actions</p>
      </header>
      <ul className="space-y-2 p-4">
        {mitigations.length === 0 ? (
          <li className="text-[12px]" style={{ color: "var(--text-muted)" }}>No mitigation actions logged yet.</li>
        ) : (
          mitigations.map((m) => (
            <li key={m.id} className="rounded-md border px-3 py-2"
                style={{ background: "var(--surface-2)", borderColor: "var(--border-subtle)" }}>
              <div className="flex items-center justify-between gap-2">
                <span className="text-[12px] font-semibold" style={{ color: "var(--text-default)" }}>{m.title}</span>
                <span className="text-[10px] tabular-nums" style={{ color: "var(--text-muted)" }}>
                  {relativeFromNow(m.appliedAt)}
                  {m.kind && ` · ${m.kind}`}
                  {!m.effective && " · ineffective"}
                </span>
              </div>
              {m.description && (
                <div className="mt-1 text-[12px]" style={{ color: "var(--text-default)" }}>{m.description}</div>
              )}
              {m.reference && (
                <div className="mt-1 text-[11px]" style={{ color: "var(--text-muted)" }}>Ref: <code>{m.reference}</code></div>
              )}
            </li>
          ))
        )}
      </ul>
      {canManage && (
        <div className="border-t px-4 py-3" style={{ borderColor: "var(--border-subtle)" }}>
          <details>
            <summary className="cursor-pointer text-[12px] font-semibold" style={{ color: "var(--text-default)" }}>
              + Log mitigation action
            </summary>
            <form action={addMitigation} className="mt-3 grid grid-cols-2 gap-2">
              <input type="hidden" name="id" value={id} />
              <Input name="title" label="Title" defaultValue="" required />
              <Input name="kind" label="Kind (deploy, flag, restart, scale, rollback)" defaultValue="deploy" />
              <Input name="reference" label="Reference (deploy SHA, flag key)" defaultValue="" />
              <label className="inline-flex items-center gap-2 text-[12px]" style={{ color: "var(--text-default)" }}>
                <input type="checkbox" name="effective" defaultChecked /> Effective
              </label>
              <label className="col-span-2 block">
                <span className="mb-0.5 block text-[11px] font-medium" style={{ color: "var(--text-muted)" }}>Description</span>
                <textarea name="description" rows={2} className="w-full rounded-md border px-2 py-1.5 text-[12px]"
                          style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)", color: "var(--text-default)" }} />
              </label>
              <div className="col-span-2 flex justify-end">
                <button type="submit" className="inline-flex h-7 items-center rounded-md px-3 text-[11px] font-medium"
                        style={{ background: "var(--accent-default)", color: "var(--accent-fg)" }}>
                  Log mitigation
                </button>
              </div>
            </form>
          </details>
        </div>
      )}
    </section>
  );
}

/* ── Postmortem tab ────────────────────────────────────── */

function PostmortemTab({
  id, body, customerSummary, publishedAt, canPm,
}: {
  id: string;
  body: string | null;
  customerSummary: string | null;
  publishedAt: Date | null;
  canPm: boolean;
}) {
  return (
    <section className="rounded-xl border p-4"
             style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)" }}>
      <div className="flex items-center justify-between gap-2">
        <div>
          <h3 className="text-[13px] font-semibold" style={{ color: "var(--text-default)" }}>Postmortem</h3>
          <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>
            Blameless tone enforced by template guardrails. Customer-facing summary publishes to the status page.
          </p>
        </div>
        {publishedAt && (
          <span className="inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-semibold"
                style={{ background: "var(--emerald-100)", color: "var(--emerald-700)" }}>
            Published {relativeFromNow(publishedAt)}
          </span>
        )}
      </div>
      {!canPm && body && (
        <div className="mt-3 rounded-md border p-3 text-[12px] whitespace-pre-wrap"
             style={{ background: "var(--surface-2)", borderColor: "var(--border-subtle)", color: "var(--text-default)" }}>
          {body}
        </div>
      )}
      {canPm && (
        <form action={savePostmortem} className="mt-3 space-y-3">
          <input type="hidden" name="id" value={id} />
          <label className="block">
            <span className="mb-0.5 block text-[11px] font-medium" style={{ color: "var(--text-muted)" }}>Postmortem body (Markdown)</span>
            <textarea name="body" rows={20} defaultValue={body ?? POSTMORTEM_TEMPLATE}
                      className="w-full rounded-md border px-2 py-1.5 text-[12px] font-mono"
                      style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)", color: "var(--text-default)" }} />
          </label>
          <label className="block">
            <span className="mb-0.5 block text-[11px] font-medium" style={{ color: "var(--text-muted)" }}>Customer-facing summary</span>
            <textarea name="customerSummary" rows={4} defaultValue={customerSummary ?? ""}
                      className="w-full rounded-md border px-2 py-1.5 text-[12px]"
                      style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)", color: "var(--text-default)" }} />
          </label>
          <label className="inline-flex items-center gap-2 text-[12px]" style={{ color: "var(--text-default)" }}>
            <input type="checkbox" name="publish" defaultChecked={!!publishedAt} /> Publish (generates PDF link)
          </label>
          <div className="flex justify-end">
            <button type="submit" className="inline-flex h-8 items-center rounded-md px-3 text-[12px] font-medium"
                    style={{ background: "var(--accent-default)", color: "var(--accent-fg)" }}>
              Save postmortem
            </button>
          </div>
        </form>
      )}
    </section>
  );
}

/* ── Action items tab ──────────────────────────────────── */

function ActionItemsTab({
  id, items, canPm,
}: {
  id: string;
  items: { id: string; title: string; description: string | null; ownerEmail: string | null; ownerName: string | null; externalRef: string | null; status: ActionItemStatus; dueAt: Date | null; completedAt: Date | null }[];
  canPm: boolean;
}) {
  return (
    <section className="rounded-xl border"
             style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)" }}>
      <header className="border-b px-4 py-3" style={{ borderColor: "var(--border-subtle)" }}>
        <h3 className="text-[13px] font-semibold" style={{ color: "var(--text-default)" }}>Action items</h3>
        <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>{items.length} items · linked to Linear/Jira</p>
      </header>
      <div className="overflow-x-auto p-4">
        {items.length === 0 ? (
          <p className="text-[12px]" style={{ color: "var(--text-muted)" }}>No action items yet.</p>
        ) : (
          <table className="w-full">
            <thead>
              <tr style={{ color: "var(--text-muted)" }}>
                <Th>Title</Th><Th>Owner</Th><Th>Tracker</Th><Th>Status</Th><Th>Due</Th>
                {canPm && <Th>Action</Th>}
              </tr>
            </thead>
            <tbody>
              {items.map((it) => (
                <tr key={it.id} className="border-t" style={{ borderColor: "var(--border-subtle)" }}>
                  <Td>
                    <div className="text-[12px] font-medium" style={{ color: "var(--text-default)" }}>{it.title}</div>
                    {it.description && <div className="text-[11px]" style={{ color: "var(--text-muted)" }}>{it.description}</div>}
                  </Td>
                  <Td><span className="text-[11px]" style={{ color: "var(--text-muted)" }}>{it.ownerEmail ?? it.ownerName ?? "—"}</span></Td>
                  <Td>{it.externalRef ? <code className="text-[11px] tabular-nums" style={{ color: "var(--text-default)" }}>{it.externalRef}</code> : <span className="text-[11px]" style={{ color: "var(--text-muted)" }}>—</span>}</Td>
                  <Td><ActionItemPill status={it.status} /></Td>
                  <Td><span className="text-[11px] tabular-nums" style={{ color: it.dueAt && it.dueAt < new Date() && it.status !== "DONE" ? "var(--rose-700)" : "var(--text-muted)" }}>
                    {it.dueAt ? shortDateTime(it.dueAt).slice(0, 10) : "—"}
                  </span></Td>
                  {canPm && (
                    <Td>
                      <form action={setActionItemStatus} className="inline-flex items-center gap-1">
                        <input type="hidden" name="id" value={id} />
                        <input type="hidden" name="itemId" value={it.id} />
                        <select name="status" defaultValue={it.status}
                                className="rounded-md border px-1.5 py-0.5 text-[11px]"
                                style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)", color: "var(--text-default)" }}>
                          {ACTION_STATUSES.map((s) => <option key={s} value={s}>{s.toLowerCase()}</option>)}
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
      {canPm && (
        <div className="border-t px-4 py-3" style={{ borderColor: "var(--border-subtle)" }}>
          <details>
            <summary className="cursor-pointer text-[12px] font-semibold" style={{ color: "var(--text-default)" }}>
              + Add action item
            </summary>
            <form action={saveActionItem} className="mt-3 grid grid-cols-2 gap-2">
              <input type="hidden" name="id" value={id} />
              <Input name="title" label="Title" defaultValue="" required />
              <Input name="ownerEmail" label="Owner email" type="email" defaultValue="" />
              <Input name="externalRef" label="External tracker (LIN-1234)" defaultValue="" />
              <Select name="status" label="Status"
                      options={ACTION_STATUSES.map((s) => ({ value: s, label: s.toLowerCase().replace(/_/g, " ") }))} />
              <Input name="dueAt" label="Due date" type="date" defaultValue="" />
              <label className="col-span-2 block">
                <span className="mb-0.5 block text-[11px] font-medium" style={{ color: "var(--text-muted)" }}>Description</span>
                <textarea name="description" rows={2} className="w-full rounded-md border px-2 py-1.5 text-[12px]"
                          style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)", color: "var(--text-default)" }} />
              </label>
              <div className="col-span-2 flex justify-end">
                <button type="submit" className="inline-flex h-7 items-center rounded-md px-3 text-[11px] font-medium"
                        style={{ background: "var(--accent-default)", color: "var(--accent-fg)" }}>
                  Save action item
                </button>
              </div>
            </form>
          </details>
        </div>
      )}
    </section>
  );
}

/* ── Metrics tab ──────────────────────────────────────── */

function MetricsTab({ incident }: { incident: Awaited<ReturnType<typeof loadIncidentDetail>> }) {
  if (!incident) return null;
  // Synthesized metric series for the incident window — error rate +
  // request rate, with deploy markers from mitigation kinds.
  const start = incident.startedAt.getTime();
  const end = (incident.resolvedAt ?? new Date()).getTime();
  const buckets = 30;
  const stepMs = Math.max(60_000, (end - start) / buckets);
  const series: { t: Date; errorPct: number; rps: number }[] = [];
  for (let i = 0; i < buckets; i++) {
    const t = new Date(start + i * stepMs);
    const peak = i / buckets > 0.2 && i / buckets < 0.7;
    const errorPct = peak ? Math.round(8 + Math.random() * 12) : Math.round(Math.random() * 2);
    const rps = peak ? Math.round(180 + Math.random() * 50) : Math.round(420 + Math.random() * 60);
    series.push({ t, errorPct, rps });
  }
  const maxRps = Math.max(...series.map((s) => s.rps));
  const maxErr = Math.max(...series.map((s) => s.errorPct));
  return (
    <div className="grid grid-cols-1 gap-4">
      <section className="rounded-xl border p-4"
               style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)" }}>
        <div className="flex items-center justify-between">
          <h3 className="text-[13px] font-semibold" style={{ color: "var(--text-default)" }}>Error rate</h3>
          <span className="text-[11px]" style={{ color: "var(--text-muted)" }}>peak {maxErr}%</span>
        </div>
        <Spark heights={series.map((s) => s.errorPct / Math.max(maxErr, 1))} color="var(--rose-500)" />
      </section>
      <section className="rounded-xl border p-4"
               style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)" }}>
        <div className="flex items-center justify-between">
          <h3 className="text-[13px] font-semibold" style={{ color: "var(--text-default)" }}>Request rate (rps)</h3>
          <span className="text-[11px]" style={{ color: "var(--text-muted)" }}>peak {maxRps}</span>
        </div>
        <Spark heights={series.map((s) => s.rps / Math.max(maxRps, 1))} color="var(--sky-500)" />
      </section>
      <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>
        Synthetic series for the incident window — production wiring streams Datadog/Prometheus deltas with deploy markers.
      </p>
    </div>
  );
}

function Spark({ heights, color }: { heights: number[]; color: string }) {
  return (
    <div className="mt-2 flex h-20 items-end gap-[2px]">
      {heights.map((h, i) => (
        <div key={i} className="flex-1 rounded-sm"
             style={{ height: `${Math.max(2, h * 100)}%`, background: color, opacity: 0.85 }} />
      ))}
    </div>
  );
}

/* ── Audit tab ────────────────────────────────────────── */

function AuditTab({
  timeline,
}: {
  timeline: { id: string; kind: IncidentTimelineKind; body: string; actor: string | null; actorEmail: string | null; source: string | null; occurredAt: Date }[];
}) {
  return (
    <section className="rounded-xl border"
             style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)" }}>
      <header className="border-b px-4 py-3" style={{ borderColor: "var(--border-subtle)" }}>
        <h3 className="text-[13px] font-semibold" style={{ color: "var(--text-default)" }}>Audit log</h3>
        <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>Per-incident timeline (immutable).</p>
      </header>
      <div className="overflow-x-auto p-4">
        <table className="w-full">
          <thead>
            <tr style={{ color: "var(--text-muted)" }}>
              <Th>When</Th><Th>Kind</Th><Th>Actor</Th><Th>Source</Th><Th>Detail</Th>
            </tr>
          </thead>
          <tbody>
            {timeline.map((ev) => (
              <tr key={ev.id} className="border-t" style={{ borderColor: "var(--border-subtle)" }}>
                <Td><span className="text-[11px] tabular-nums" style={{ color: "var(--text-muted)" }}>{shortDateTime(ev.occurredAt)}</span></Td>
                <Td><code className="text-[11px]" style={{ color: "var(--text-default)" }}>{ev.kind}</code></Td>
                <Td><span className="text-[11px]" style={{ color: "var(--text-default)" }}>{ev.actorEmail ?? ev.actor ?? "—"}</span></Td>
                <Td><span className="text-[11px]" style={{ color: "var(--text-muted)" }}>{ev.source ?? "—"}</span></Td>
                <Td><span className="text-[11px]" style={{ color: "var(--text-default)" }}>{ev.body}</span></Td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

/* ── Helpers ──────────────────────────────────────────── */

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <span className="text-[11px]" style={{ color: "var(--text-muted)" }}>{label}</span>
      <span className="text-[12px] text-right" style={{ color: "var(--text-default)" }}>{value}</span>
    </div>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return <th className="pb-2 text-left text-[11px] font-medium uppercase tracking-wide">{children}</th>;
}
function Td({ children }: { children: React.ReactNode }) {
  return <td className="py-2 pr-3 align-top">{children}</td>;
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
