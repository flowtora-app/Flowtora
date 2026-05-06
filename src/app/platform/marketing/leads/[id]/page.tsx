// Page 44 — Lead detail (/[id])
//
// Profile, activity timeline, notes ledger, tasks, email thread,
// score breakdown, MQL/SQL routing rules history, and inline actions
// (Convert to tenant trial, Send email, Add to sequence, Disqualify).

import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePlatformStaff } from "@/lib/platform";
import { db } from "@/lib/db";
import {
  loadLeadDetail,
  sourceLabel,
  activityLabel,
  activityIcon,
  type LeadDetailView,
} from "@/server/platform/leads-inbox";
import {
  updateLeadProfile,
  changeLeadStatus,
  assignLead,
  convertLeadToTrial,
  addLeadNote,
  sendLeadEmail,
  createLeadTask,
  completeLeadTask,
  deleteLeadTask,
  recomputeLeadScore,
} from "@/app/actions/platform-leads-inbox";
import { Kpi, StatusPill, ScoreBadge, FormError, FormOk, relativeFromNow, Field } from "../_shared";

export const dynamic = "force-dynamic";

const STATUSES = ["NEW", "CONTACTED", "QUALIFIED", "CONVERTED", "DISQUALIFIED", "SPAM"] as const;

type SP = Record<string, string | string[] | undefined>;
const asString = (v: string | string[] | undefined): string | undefined =>
  typeof v === "string" && v.length > 0 ? v : undefined;

export default async function LeadDetailPage({
  params, searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<SP>;
}) {
  const ctx = await requirePlatformStaff();
  const { id } = await params;
  const sp = await searchParams;
  const ok = asString(sp.ok);
  const error = asString(sp.error);
  const canWrite = ctx.can("leads.manage");

  const [detail, owners, tenants] = await Promise.all([
    loadLeadDetail(id),
    db.user.findMany({
      where: { platformRole: { not: null } },
      select: { id: true, name: true, email: true },
      orderBy: [{ name: "asc" }],
      take: 50,
    }),
    db.tenant.findMany({
      where: { status: { in: ["TRIAL", "ACTIVE"] } },
      select: { id: true, name: true, slug: true, status: true },
      orderBy: { createdAt: "desc" },
      take: 50,
    }),
  ]);
  if (!detail) notFound();
  const lead = detail.lead;

  return (
    <div className="space-y-5">
      <Breadcrumbs name={lead.name ?? lead.email} />

      {ok && <FormOk msg={ok} />}
      {error && <FormError msg={error} />}

      <Header lead={lead} />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
        <Kpi label="Score" value={String(lead.score)} sub="0–100"
             tone={lead.score >= 70 ? "good" : lead.score >= 40 ? "default" : lead.score >= 20 ? "warning" : "danger"} />
        <Kpi label="Status" value={lead.status.toLowerCase()} />
        <Kpi label="Owner" value={lead.ownerName ?? lead.ownerEmail ?? "—"} />
        <Kpi label="MQL" value={lead.mqlAt ? relativeFromNow(lead.mqlAt) : "—"} />
        <Kpi label="SQL" value={lead.sqlAt ? relativeFromNow(lead.sqlAt) : "—"} />
        <Kpi label="First touch"
             value={lead.firstContactedAt ? relativeFromNow(lead.firstContactedAt) : "—"} />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <ActivityTimeline activities={detail.activities} />
          <EmailThread leadId={lead.id} email={lead.email} emails={detail.emails} canWrite={canWrite} />
          <NotesCard lead={lead} canWrite={canWrite} />
          <TasksCard
            leadId={lead.id}
            tasks={detail.tasks}
            owners={owners.map((o) => ({ id: o.id, name: o.name, email: o.email }))}
            canWrite={canWrite}
          />
          <RoutingHistoryCard rows={detail.routing} />
        </div>

        <div className="space-y-4">
          <ProfileCard lead={lead} canWrite={canWrite} />
          <ActionsCard lead={lead} owners={owners} tenants={tenants} canWrite={canWrite} />
          <ScoreBreakdownCard
            leadId={lead.id}
            score={lead.score}
            factors={lead.scoreFactors}
            canWrite={canWrite}
          />
          <AttributionCard lead={lead} />
        </div>
      </div>
    </div>
  );
}

function Breadcrumbs({ name }: { name: string }) {
  return (
    <nav className="text-[11px]" aria-label="Breadcrumbs">
      <Link href="/platform/marketing/leads"
            className="ts-focus underline" style={{ color: "var(--text-muted)" }}>
        Lead inbox
      </Link>
      <span className="mx-1.5" style={{ color: "var(--text-faint)" }}>/</span>
      <span style={{ color: "var(--text-default)" }}>{name}</span>
    </nav>
  );
}

function Header({ lead }: { lead: LeadDetailView["lead"] }) {
  return (
    <header className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <div className="flex items-center gap-2">
          <h1 className="text-[22px] font-semibold leading-tight" style={{ color: "var(--text-default)" }}>
            {lead.name ?? lead.email}
          </h1>
          <StatusPill status={lead.status} />
          <ScoreBadge score={lead.score} />
        </div>
        <p className="mt-1 text-[12px]" style={{ color: "var(--text-muted)" }}>
          {lead.email}
          {lead.phone ? ` · ${lead.phone}` : ""}
          {lead.company ? ` · ${lead.company}` : ""}
          {lead.role ? ` · ${lead.role}` : ""}
        </p>
        <p className="mt-1 text-[11px]" style={{ color: "var(--text-muted)" }}>
          {sourceLabel(lead.source)}
          {lead.sourcePath ? ` from ${lead.sourcePath}` : ""}
          {" · "}created {relativeFromNow(lead.createdAt)}
        </p>
        {lead.convertedTenantSlug && (
          <p className="mt-1 text-[11px]" style={{ color: "var(--success-fg)" }}>
            ✓ Converted to tenant{" "}
            <Link href={`/platform/tenants/${lead.convertedTenantSlug}`}
                  className="ts-focus underline font-semibold">
              {lead.convertedTenantName}
            </Link>
            {" "}{relativeFromNow(lead.convertedAt)}
          </p>
        )}
      </div>
    </header>
  );
}

/* ── Profile card ───────────────────────────────────── */

function ProfileCard({ lead, canWrite }: { lead: LeadDetailView["lead"]; canWrite: boolean }) {
  return (
    <form action={updateLeadProfile}
          className="rounded-lg border p-3 space-y-2"
          style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)" }}>
      <h2 className="text-[12px] font-semibold" style={{ color: "var(--text-default)" }}>Profile</h2>
      <fieldset disabled={!canWrite} className="contents">
        <input type="hidden" name="id" value={lead.id} />
        <Field label="Name">
          <input type="text" name="name" defaultValue={lead.name ?? ""} maxLength={200}
                 className="ts-focus w-full rounded-md border px-2 py-1 text-[12px]"
                 style={{ borderColor: "var(--border-default)", background: "var(--surface-1)" }} />
        </Field>
        <Field label="Company">
          <input type="text" name="company" defaultValue={lead.company ?? ""} maxLength={200}
                 className="ts-focus w-full rounded-md border px-2 py-1 text-[12px]"
                 style={{ borderColor: "var(--border-default)", background: "var(--surface-1)" }} />
        </Field>
        <Field label="Role">
          <input type="text" name="role" defaultValue={lead.role ?? ""} maxLength={100}
                 className="ts-focus w-full rounded-md border px-2 py-1 text-[12px]"
                 style={{ borderColor: "var(--border-default)", background: "var(--surface-1)" }} />
        </Field>
        <Field label="Phone">
          <input type="tel" name="phone" defaultValue={lead.phone ?? ""} maxLength={40}
                 className="ts-focus w-full rounded-md border px-2 py-1 text-[12px]"
                 style={{ borderColor: "var(--border-default)", background: "var(--surface-1)" }} />
        </Field>
        <Field label="Region">
          <input type="text" name="region" defaultValue={lead.region ?? ""} maxLength={100}
                 className="ts-focus w-full rounded-md border px-2 py-1 text-[12px]"
                 style={{ borderColor: "var(--border-default)", background: "var(--surface-1)" }} />
        </Field>
        <Field label="Industry">
          <input type="text" name="industry" defaultValue={lead.industry ?? ""} maxLength={100}
                 className="ts-focus w-full rounded-md border px-2 py-1 text-[12px]"
                 style={{ borderColor: "var(--border-default)", background: "var(--surface-1)" }} />
        </Field>
        <Field label="Tags (comma-separated)">
          <input type="text" name="tagsRaw" defaultValue={lead.tags.join(", ")} maxLength={500}
                 className="ts-focus w-full rounded-md border px-2 py-1 text-[12px]"
                 style={{ borderColor: "var(--border-default)", background: "var(--surface-1)" }} />
        </Field>
        <Field label="Notes (sales ledger)">
          <textarea name="notes" defaultValue={lead.notes ?? ""} rows={4} maxLength={5000}
                    className="ts-focus w-full rounded-md border px-2 py-1 text-[11px] font-mono"
                    style={{ borderColor: "var(--border-default)", background: "var(--surface-1)" }} />
        </Field>
        <div className="flex justify-end">
          <button type="submit"
                  className="ts-focus rounded-md px-3 py-1.5 text-[12px] font-medium"
                  style={{ background: "var(--accent-primary)", color: "white" }}>
            Save profile
          </button>
        </div>
      </fieldset>
    </form>
  );
}

/* ── Actions card ───────────────────────────────────── */

function ActionsCard({
  lead, owners, tenants, canWrite,
}: {
  lead: LeadDetailView["lead"];
  owners: Array<{ id: string; name: string | null; email: string }>;
  tenants: Array<{ id: string; name: string; slug: string; status: string }>;
  canWrite: boolean;
}) {
  return (
    <div className="rounded-lg border p-3 space-y-3"
         style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)" }}>
      <h2 className="text-[12px] font-semibold" style={{ color: "var(--text-default)" }}>Actions</h2>

      <form action={changeLeadStatus} className="space-y-1">
        <input type="hidden" name="id" value={lead.id} />
        <span className="text-[11px] font-medium" style={{ color: "var(--text-muted)" }}>Status</span>
        <div className="flex gap-1">
          <select name="status" defaultValue={lead.status}
                  className="ts-focus flex-1 rounded-md border px-2 py-1 text-[12px]"
                  style={{ borderColor: "var(--border-default)", background: "var(--surface-1)" }}>
            {STATUSES.map((s) => <option key={s} value={s}>{s.toLowerCase()}</option>)}
          </select>
          <button type="submit" disabled={!canWrite}
                  className="ts-focus rounded-md px-2.5 py-1 text-[11px] font-medium"
                  style={{ background: "var(--accent-primary)", color: "white" }}>
            Update
          </button>
        </div>
        <input type="text" name="disqualifiedReason" placeholder="Disqualify reason (optional)" maxLength={500}
               className="ts-focus w-full rounded-md border px-2 py-1 text-[11px]"
               style={{ borderColor: "var(--border-default)", background: "var(--surface-1)" }} />
      </form>

      <form action={assignLead} className="space-y-1">
        <input type="hidden" name="id" value={lead.id} />
        <span className="text-[11px] font-medium" style={{ color: "var(--text-muted)" }}>Owner</span>
        <div className="flex gap-1">
          <select name="ownerId" defaultValue={lead.ownerId ?? ""}
                  className="ts-focus flex-1 rounded-md border px-2 py-1 text-[12px]"
                  style={{ borderColor: "var(--border-default)", background: "var(--surface-1)" }}>
            <option value="">Unassigned</option>
            {owners.map((o) => (
              <option key={o.id} value={o.id}>{o.name ?? o.email}</option>
            ))}
          </select>
          <button type="submit" disabled={!canWrite}
                  className="ts-focus rounded-md px-2.5 py-1 text-[11px] font-medium"
                  style={{ background: "var(--surface-2)", color: "var(--text-default)", border: "1px solid var(--border-default)" }}>
            Assign
          </button>
        </div>
      </form>

      {lead.convertedTenantId == null && (
        <form action={convertLeadToTrial} className="space-y-1">
          <input type="hidden" name="id" value={lead.id} />
          <span className="text-[11px] font-medium" style={{ color: "var(--text-muted)" }}>
            Convert to tenant trial
          </span>
          <div className="flex gap-1">
            <select name="tenantId"
                    className="ts-focus flex-1 rounded-md border px-2 py-1 text-[12px]"
                    style={{ borderColor: "var(--border-default)", background: "var(--surface-1)" }}>
              <option value="">— choose tenant —</option>
              {tenants.map((t) => (
                <option key={t.id} value={t.id}>{t.name} ({t.status.toLowerCase()})</option>
              ))}
            </select>
            <button type="submit" disabled={!canWrite}
                    className="ts-focus rounded-md px-2.5 py-1 text-[11px] font-medium"
                    style={{ background: "var(--success-fg)", color: "white" }}>
              Convert
            </button>
          </div>
          <p className="text-[10px]" style={{ color: "var(--text-muted)" }}>
            Links this lead to an existing tenant for attribution. Real "create new tenant"
            flow lives on the tenant onboarding screen.
          </p>
        </form>
      )}
    </div>
  );
}

/* ── Score breakdown ─────────────────────────────────── */

function ScoreBreakdownCard({
  leadId, score, factors, canWrite,
}: {
  leadId: string;
  score: number;
  factors: Array<{ factor: string; points: number; source?: string }>;
  canWrite: boolean;
}) {
  const grouped = new Map<string, Array<{ factor: string; points: number }>>();
  for (const f of factors) {
    const key = f.source ?? "other";
    const list = grouped.get(key) ?? [];
    list.push({ factor: f.factor, points: f.points });
    grouped.set(key, list);
  }
  return (
    <div className="rounded-lg border p-3 space-y-2"
         style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)" }}>
      <div className="flex items-center justify-between">
        <h2 className="text-[12px] font-semibold" style={{ color: "var(--text-default)" }}>
          Score breakdown
        </h2>
        {canWrite && (
          <form action={recomputeLeadScore}>
            <input type="hidden" name="id" value={leadId} />
            <button type="submit"
                    className="ts-focus rounded-md px-2 py-1 text-[10px] font-medium"
                    style={{ background: "var(--surface-2)", color: "var(--text-muted)", border: "1px solid var(--border-default)" }}
                    title="Re-run the scoring engine against current data">
              Recompute
            </button>
          </form>
        )}
      </div>
      <div className="text-[20px] font-semibold tabular-nums" style={{ color: "var(--text-default)" }}>
        {score}<span className="text-[12px]" style={{ color: "var(--text-muted)" }}>/100</span>
      </div>

      {factors.length === 0 ? (
        <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>
          No score yet — click Recompute after activity is logged.
        </p>
      ) : (
        <div className="space-y-2">
          {Array.from(grouped.entries()).map(([source, items]) => {
            const total = items.reduce((s, i) => s + i.points, 0);
            return (
              <div key={source}>
                <div className="text-[10px] font-semibold uppercase tracking-wide flex items-center justify-between"
                     style={{ color: "var(--text-muted)" }}>
                  <span>{source}</span>
                  <span className="tabular-nums" style={{ color: total >= 0 ? "var(--success-fg)" : "var(--danger-fg)" }}>
                    {total >= 0 ? "+" : ""}{total}
                  </span>
                </div>
                <ul className="space-y-0.5">
                  {items.map((i, idx) => (
                    <li key={idx} className="flex items-center justify-between text-[11px]">
                      <span style={{ color: "var(--text-default)" }}>{i.factor}</span>
                      <span className="tabular-nums" style={{ color: i.points >= 0 ? "var(--success-fg)" : "var(--danger-fg)" }}>
                        {i.points >= 0 ? "+" : ""}{i.points}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ── Attribution card ────────────────────────────────── */

function AttributionCard({ lead }: { lead: LeadDetailView["lead"] }) {
  const items: Array<[string, string | null]> = [
    ["Source",     sourceLabel(lead.source)],
    ["Form path",  lead.sourcePath],
    ["Referrer",   lead.referrer],
    ["UTM source", lead.utmSource],
    ["UTM medium", lead.utmMedium],
    ["UTM campaign", lead.utmCampaign],
    ["Region",     lead.region],
    ["Industry",   lead.industry],
    ["Team size",  lead.teamSize],
    ["Timezone",   lead.timezone],
  ];
  return (
    <div className="rounded-lg border p-3 space-y-2"
         style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)" }}>
      <h2 className="text-[12px] font-semibold" style={{ color: "var(--text-default)" }}>Attribution &amp; context</h2>
      <dl className="grid grid-cols-1 gap-1 text-[11px]">
        {items.map(([k, v]) => (
          <div key={k} className="flex items-center justify-between gap-2">
            <dt style={{ color: "var(--text-muted)" }}>{k}</dt>
            <dd className="text-right" style={{ color: v ? "var(--text-default)" : "var(--text-faint)" }}>
              {v ?? "—"}
            </dd>
          </div>
        ))}
      </dl>
      {lead.message && (
        <div className="rounded-md border-l-2 px-2 py-1 text-[11px]"
             style={{ borderColor: "var(--accent-primary)", background: "var(--surface-2)", color: "var(--text-default)" }}>
          <strong>Message:</strong> {lead.message}
        </div>
      )}
    </div>
  );
}

/* ── Activity timeline ──────────────────────────────── */

function ActivityTimeline({ activities }: { activities: LeadDetailView["activities"] }) {
  return (
    <div className="rounded-lg border p-3"
         style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)" }}>
      <h2 className="mb-2 text-[12px] font-semibold" style={{ color: "var(--text-default)" }}>
        Activity timeline · {activities.length} {activities.length === 1 ? "event" : "events"}
      </h2>
      {activities.length === 0 ? (
        <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>
          No tracked activity yet — page views, form submits, opens/clicks all land here automatically.
        </p>
      ) : (
        <ol className="relative space-y-2 pl-4">
          {activities.map((a) => (
            <li key={a.id} className="relative">
              <span className="absolute -left-4 top-1 inline-flex h-3 w-3 items-center justify-center"
                    style={{ fontSize: 10 }}>
                {activityIcon(a.kind)}
              </span>
              <div className="text-[11px]" style={{ color: "var(--text-muted)" }}>
                {relativeFromNow(a.occurredAt)} · {activityLabel(a.kind)}
              </div>
              {a.detail && (
                <div className="text-[12px]" style={{ color: "var(--text-default)" }}>{a.detail}</div>
              )}
              {a.url && (
                <a href={a.url} target="_blank" rel="noopener noreferrer"
                   className="text-[11px] underline" style={{ color: "var(--accent-primary)" }}>
                  {a.url}
                </a>
              )}
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

/* ── Email thread ───────────────────────────────────── */

function EmailThread({
  leadId, email, emails, canWrite,
}: {
  leadId: string;
  email: string;
  emails: LeadDetailView["emails"];
  canWrite: boolean;
}) {
  return (
    <div className="rounded-lg border p-3 space-y-3"
         style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)" }}>
      <h2 className="text-[12px] font-semibold" style={{ color: "var(--text-default)" }}>
        Email thread · {email}
      </h2>

      {canWrite && (
        <form action={sendLeadEmail} className="space-y-2 rounded-md border p-2"
              style={{ borderColor: "var(--border-subtle)", background: "var(--surface-2)" }}>
          <input type="hidden" name="id" value={leadId} />
          <input type="text" name="subject" required maxLength={200}
                 placeholder="Subject"
                 className="ts-focus w-full rounded-md border px-2 py-1 text-[12px]"
                 style={{ borderColor: "var(--border-default)", background: "var(--surface-1)" }} />
          <textarea name="body" required rows={4} maxLength={20_000}
                    placeholder={`Write to ${email}…`}
                    className="ts-focus w-full rounded-md border px-2 py-1 text-[12px]"
                    style={{ borderColor: "var(--border-default)", background: "var(--surface-1)" }} />
          <div className="flex justify-end">
            <button type="submit"
                    className="ts-focus rounded-md px-3 py-1.5 text-[12px] font-medium"
                    style={{ background: "var(--accent-primary)", color: "white" }}>
              Send email
            </button>
          </div>
        </form>
      )}

      {emails.length === 0 ? (
        <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>No emails on file.</p>
      ) : (
        <ul className="space-y-2">
          {emails.map((m) => (
            <li key={m.id} className="rounded-md border p-2"
                style={{
                  borderColor: "var(--border-subtle)",
                  background: m.direction === "OUT" ? "var(--accent-surface)" : "var(--surface-2)",
                }}>
              <div className="flex items-center justify-between text-[10px]">
                <span className="font-semibold uppercase tracking-wide" style={{
                  color: m.direction === "OUT" ? "var(--accent-primary)" : "var(--text-muted)",
                }}>
                  {m.direction === "OUT" ? "→ Sent" : "← Received"}
                </span>
                <span style={{ color: "var(--text-muted)" }}>
                  {m.createdAt.toLocaleString()}
                </span>
              </div>
              <div className="mt-1 text-[12px] font-semibold" style={{ color: "var(--text-default)" }}>
                {m.subject}
              </div>
              <div className="text-[10px]" style={{ color: "var(--text-muted)" }}>
                from {m.fromEmail} → {m.toEmail}
                {m.authorName ? ` · by ${m.authorName}` : ""}
              </div>
              <p className="mt-1 whitespace-pre-wrap text-[11px]" style={{ color: "var(--text-default)" }}>
                {m.body}
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/* ── Notes card ─────────────────────────────────────── */

function NotesCard({ lead, canWrite }: { lead: LeadDetailView["lead"]; canWrite: boolean }) {
  return (
    <div className="rounded-lg border p-3 space-y-2"
         style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)" }}>
      <h2 className="text-[12px] font-semibold" style={{ color: "var(--text-default)" }}>
        Sales notes
      </h2>
      {canWrite && (
        <form action={addLeadNote} className="space-y-1">
          <input type="hidden" name="id" value={lead.id} />
          <textarea name="body" required rows={2} maxLength={5000}
                    placeholder="Append a note (auto-stamped with author + timestamp)…"
                    className="ts-focus w-full rounded-md border px-2 py-1 text-[11px]"
                    style={{ borderColor: "var(--border-default)", background: "var(--surface-1)" }} />
          <div className="flex justify-end">
            <button type="submit"
                    className="ts-focus rounded-md px-2.5 py-1 text-[11px] font-medium"
                    style={{ background: "var(--accent-primary)", color: "white" }}>
              Append note
            </button>
          </div>
        </form>
      )}
      {lead.notes ? (
        <pre className="rounded-md border p-2 text-[11px] whitespace-pre-wrap font-mono"
             style={{ borderColor: "var(--border-subtle)", background: "var(--surface-2)", color: "var(--text-default)" }}>
          {lead.notes}
        </pre>
      ) : (
        <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>
          No sales notes yet.
        </p>
      )}
    </div>
  );
}

/* ── Tasks card ─────────────────────────────────────── */

function TasksCard({
  leadId, tasks, owners, canWrite,
}: {
  leadId: string;
  tasks: LeadDetailView["tasks"];
  owners: Array<{ id: string; name: string | null; email: string }>;
  canWrite: boolean;
}) {
  return (
    <div className="rounded-lg border p-3 space-y-3"
         style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)" }}>
      <h2 className="text-[12px] font-semibold" style={{ color: "var(--text-default)" }}>
        Tasks · {tasks.open.length} open · {tasks.completed.length} completed
      </h2>

      {canWrite && (
        <form action={createLeadTask} className="grid grid-cols-1 gap-2 md:grid-cols-2 rounded-md border p-2"
              style={{ borderColor: "var(--border-subtle)", background: "var(--surface-2)" }}>
          <input type="hidden" name="leadId" value={leadId} />
          <Field label="Title">
            <input type="text" name="title" required maxLength={200}
                   placeholder="Follow up on demo, send pricing PDF, etc."
                   className="ts-focus w-full rounded-md border px-2 py-1 text-[12px]"
                   style={{ borderColor: "var(--border-default)", background: "var(--surface-1)" }} />
          </Field>
          <Field label="Due date">
            <input type="datetime-local" name="dueAt"
                   className="ts-focus w-full rounded-md border px-2 py-1 text-[12px]"
                   style={{ borderColor: "var(--border-default)", background: "var(--surface-1)" }} />
          </Field>
          <Field label="Owner">
            <select name="ownerId"
                    className="ts-focus w-full rounded-md border px-2 py-1 text-[12px]"
                    style={{ borderColor: "var(--border-default)", background: "var(--surface-1)" }}>
              <option value="">— same as lead owner —</option>
              {owners.map((o) => <option key={o.id} value={o.id}>{o.name ?? o.email}</option>)}
            </select>
          </Field>
          <Field label="Notes">
            <input type="text" name="notes" maxLength={2000}
                   className="ts-focus w-full rounded-md border px-2 py-1 text-[12px]"
                   style={{ borderColor: "var(--border-default)", background: "var(--surface-1)" }} />
          </Field>
          <div className="md:col-span-2 flex justify-end">
            <button type="submit"
                    className="ts-focus rounded-md px-3 py-1.5 text-[12px] font-medium"
                    style={{ background: "var(--accent-primary)", color: "white" }}>
              Add task
            </button>
          </div>
        </form>
      )}

      {tasks.open.length > 0 && (
        <ul className="space-y-1.5">
          {tasks.open.map((t) => (
            <li key={t.id} className="flex flex-wrap items-start gap-2 rounded-md border p-2 text-[12px]"
                style={{ borderColor: "var(--border-subtle)", background: "var(--surface-1)" }}>
              <div className="flex-1 min-w-0">
                <div style={{ color: "var(--text-default)" }}>{t.title}</div>
                {t.notes && <div className="text-[11px]" style={{ color: "var(--text-muted)" }}>{t.notes}</div>}
                <div className="mt-0.5 text-[10px]" style={{ color: "var(--text-muted)" }}>
                  {t.dueAt ? `Due ${t.dueAt.toLocaleString()}` : "No due date"}
                  {t.assignedToName ? ` · ${t.assignedToName}` : ""}
                </div>
              </div>
              {canWrite && (
                <div className="flex items-center gap-1">
                  <form action={completeLeadTask}>
                    <input type="hidden" name="id" value={t.id} />
                    <input type="hidden" name="leadId" value={leadId} />
                    <button type="submit"
                            className="ts-focus rounded-md px-2 py-1 text-[10px] font-medium"
                            style={{ background: "var(--success-fg)", color: "white" }}>
                      Done
                    </button>
                  </form>
                  <form action={deleteLeadTask}>
                    <input type="hidden" name="id" value={t.id} />
                    <input type="hidden" name="leadId" value={leadId} />
                    <button type="submit"
                            className="ts-focus rounded-md px-2 py-1 text-[10px] font-medium"
                            style={{ background: "var(--surface-2)", color: "var(--text-muted)", border: "1px solid var(--border-default)" }}>
                      Delete
                    </button>
                  </form>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      {tasks.completed.length > 0 && (
        <details>
          <summary className="cursor-pointer text-[11px]" style={{ color: "var(--text-muted)" }}>
            Completed ({tasks.completed.length})
          </summary>
          <ul className="mt-2 space-y-1">
            {tasks.completed.map((t) => (
              <li key={t.id} className="text-[11px]" style={{ color: "var(--text-muted)" }}>
                <span style={{ textDecoration: "line-through" }}>{t.title}</span>
                {t.completedAt && ` · completed ${relativeFromNow(t.completedAt)}`}
              </li>
            ))}
          </ul>
        </details>
      )}

      {tasks.open.length === 0 && tasks.completed.length === 0 && (
        <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>No tasks yet.</p>
      )}
    </div>
  );
}

/* ── Routing history ────────────────────────────────── */

function RoutingHistoryCard({ rows }: { rows: LeadDetailView["routing"] }) {
  return (
    <div className="rounded-lg border p-3"
         style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)" }}>
      <h2 className="mb-2 text-[12px] font-semibold" style={{ color: "var(--text-default)" }}>
        MQL/SQL routing history
      </h2>
      {rows.length === 0 ? (
        <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>
          No routing rule firings yet.
        </p>
      ) : (
        <ol className="space-y-1.5">
          {rows.map((r) => (
            <li key={r.id} className="text-[11px]">
              <div className="flex items-center justify-between">
                <span style={{ color: "var(--text-default)" }}>
                  <strong>{r.ruleName}</strong> · {r.action}
                </span>
                <span style={{ color: "var(--text-muted)" }}>{relativeFromNow(r.occurredAt)}</span>
              </div>
              {r.detail && (
                <div style={{ color: "var(--text-muted)" }}>{r.detail}</div>
              )}
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
