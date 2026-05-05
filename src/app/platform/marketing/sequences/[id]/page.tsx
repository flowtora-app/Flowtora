// Page 40 — Sequence editor: visual flow + per-step performance + recent enrollments.

import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePlatformStaff } from "@/lib/platform";
import { db } from "@/lib/db";
import {
  loadSequenceDetail,
  loadStepPerformance,
  loadRecentEnrollments,
  loadSequenceTrend,
} from "@/server/platform/sequences";
import {
  saveSequence,
  transitionSequence,
  addSequenceStep,
  enrollTenant,
  advanceEnrollment,
  exitEnrollment,
} from "@/app/actions/platform-sequences";
import type {
  SequenceTriggerType,
  SequenceStepKind,
  SequenceEnrollmentStatus,
} from "@prisma/client";
import {
  EnrollmentPill,
  FormError,
  FormOk,
  Kpi,
  STATUS_LABEL,
  StatusPill,
  relativeFromNow,
  triggerSummary,
} from "../_components/shared";
import { STEP_LABEL, TRIGGER_LABEL } from "@/lib/sequence-steps";
import { StepCard } from "../_components/StepCard";

export const dynamic = "force-dynamic";

const TRIGGERS: SequenceTriggerType[] = [
  "SIGNUP", "PLAN_STARTED", "PLAN_CHANGED", "FAILED_PAYMENT",
  "TRIAL_ENDING", "DAYS_INACTIVE", "FEATURE_FIRST_USE",
  "CUSTOM_EVENT", "TAG_ADDED", "WEBHOOK",
];
const ALL_STEP_KINDS: SequenceStepKind[] = [
  "SEND_EMAIL", "SEND_SMS", "SEND_IN_APP", "NOTIFY_CSM",
  "ADD_TAG", "REMOVE_TAG", "MOVE_TO_PLAN", "APPLY_COUPON",
  "WEBHOOK_OUT", "BRANCH", "WAIT", "SPLIT",
];
const ENROLLMENT_STATUSES: SequenceEnrollmentStatus[] = ["ACTIVE", "COMPLETED", "EXITED"];

export default async function SequenceDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ ok?: string; error?: string; step?: string; enrollmentStatus?: string; enrollmentPage?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const ctx = await requirePlatformStaff();
  const canWrite = ctx.can("announcement.write");

  const stepFilter = sp.step ?? "flow";

  const [seq, perf, trend, tenants] = await Promise.all([
    loadSequenceDetail(id),
    loadStepPerformance(id),
    loadSequenceTrend(id, 30),
    db.tenant.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" }, take: 200 }),
  ]);
  if (!seq) notFound();

  const enrollmentStatus = sp.enrollmentStatus && (ENROLLMENT_STATUSES as string[]).includes(sp.enrollmentStatus)
    ? (sp.enrollmentStatus as SequenceEnrollmentStatus) : undefined;
  const enrollmentPage = Math.max(1, parseInt(sp.enrollmentPage ?? "1", 10) || 1);
  const enrollments = stepFilter === "enrollments"
    ? await loadRecentEnrollments({ sequenceId: id, status: enrollmentStatus, page: enrollmentPage, pageSize: 25 })
    : null;

  const totalEnrollmentPages = enrollments ? Math.max(1, Math.ceil(enrollments.total / 25)) : 1;
  const maxBar = Math.max(1, ...trend.daily.map((d) => d.enrolled));

  return (
    <div className="space-y-5">
      <div className="text-[11px]" style={{ color: "var(--text-muted)" }}>
        <Link href="/platform/marketing/sequences" className="underline" style={{ color: "var(--text-muted)" }}>
          Sequences
        </Link>
        <span className="mx-1.5">/</span>
        <span style={{ color: "var(--text-default)" }}>{seq.name}</span>
      </div>

      <FormOk msg={sp.ok} />
      <FormError msg={sp.error} />

      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-1.5">
            <StatusPill status={seq.status} />
            <span className="rounded-full px-1.5 py-0.5 text-[10px] font-medium"
                  style={{ background: "var(--surface-2)", color: "var(--text-muted)" }}>
              {triggerSummary(seq.triggerType, seq.triggerConfig)}
            </span>
            {seq.conversionGoal && (
              <span className="rounded-full px-1.5 py-0.5 text-[10px] font-medium"
                    style={{ background: "var(--accent-surface)", color: "var(--accent-primary)" }}>
                Goal: {seq.conversionGoal}
              </span>
            )}
          </div>
          <h1 className="mt-1.5 text-[22px] font-semibold leading-tight" style={{ color: "var(--text-default)" }}>
            {seq.name}
          </h1>
          {seq.description && (
            <p className="mt-1 text-[12px]" style={{ color: "var(--text-muted)" }}>
              {seq.description}
            </p>
          )}
          <p className="mt-1 text-[11px]" style={{ color: "var(--text-muted)" }}>
            {seq.stepCount} step{seq.stepCount === 1 ? "" : "s"} · updated {relativeFromNow(seq.updatedAt)}
            {seq.publishedAt && ` · activated ${relativeFromNow(seq.publishedAt)}`}
          </p>
        </div>
        {canWrite && (
          <div className="flex flex-wrap items-center gap-2">
            {seq.status === "DRAFT" && <TransitionForm id={seq.id} to="ACTIVE" label="Activate" />}
            {seq.status === "ACTIVE" && <TransitionForm id={seq.id} to="PAUSED" label="Pause" />}
            {seq.status === "PAUSED" && <TransitionForm id={seq.id} to="ACTIVE" label="Resume" />}
            {seq.status !== "ARCHIVED" && <TransitionForm id={seq.id} to="ARCHIVED" label="Archive" />}
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
        <Kpi label="Active enrollees" value={seq.activeEnrolled.toLocaleString()} />
        <Kpi label="Total enrolled"   value={seq.totalEnrolled.toLocaleString()} />
        <Kpi label="Converted"        value={seq.totalConverted.toLocaleString()} tone={seq.totalConverted > 0 ? "good" : "default"} />
        <Kpi label="Conv rate"
             value={seq.conversionRate == null ? "—" : `${(seq.conversionRate * 100).toFixed(1)}%`}
             tone={seq.conversionRate == null ? "default" : seq.conversionRate >= 0.20 ? "good" : seq.conversionRate >= 0.10 ? "warning" : "default"} />
        <Kpi label="Steps"     value={seq.stepCount.toLocaleString()} />
        <Kpi label="Branches"  value={seq.flatSteps.filter((s) => s.kind === "BRANCH" || s.kind === "SPLIT").length.toLocaleString()} />
      </div>

      {/* Tab strip */}
      <div className="flex gap-1 overflow-x-auto rounded-lg border p-1"
           style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)" }}>
        <TabLink href={`/platform/marketing/sequences/${seq.id}`} label="Flow" active={stepFilter === "flow"} />
        <TabLink href={`?step=settings`} label="Trigger + goal" active={stepFilter === "settings"} />
        <TabLink href={`?step=enrollments`} label="Enrollments" active={stepFilter === "enrollments"} />
        <TabLink href={`?step=trend`} label="Trend" active={stepFilter === "trend"} />
      </div>

      {stepFilter === "flow" && (
        <div className="rounded-lg border p-4"
             style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)" }}>
          {/* Trigger node */}
          <div className="mb-3 flex items-center gap-2 rounded-md border p-2"
               style={{ background: "var(--accent-surface)", borderColor: "var(--accent-primary)" }}>
            <span aria-hidden style={{ color: "var(--accent-primary)" }}>●</span>
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: "var(--accent-primary)" }}>
                Trigger
              </div>
              <div className="text-[12px] font-semibold" style={{ color: "var(--text-default)" }}>
                {TRIGGER_LABEL[seq.triggerType]} · {triggerSummary(seq.triggerType, seq.triggerConfig)}
              </div>
            </div>
          </div>

          {seq.rootSteps.length === 0 ? (
            <div className="rounded-md border border-dashed p-6 text-center text-[12px]"
                 style={{ borderColor: "var(--border-default)", color: "var(--text-muted)" }}>
              No steps yet. Add the first step below.
              {canWrite && (
                <form action={addSequenceStep} className="mt-3 inline-flex items-center gap-2">
                  <input type="hidden" name="sequenceId" value={seq.id} />
                  <select name="kind" defaultValue="SEND_EMAIL"
                          className="ts-focus rounded-md px-2 py-1 text-[12px] outline-none"
                          style={inputStyle()}>
                    {ALL_STEP_KINDS.map((k) => <option key={k} value={k}>{STEP_LABEL[k]}</option>)}
                  </select>
                  <button type="submit"
                          className="ts-focus rounded-md px-3 py-1.5 text-[12px] font-semibold"
                          style={{ background: "var(--accent-primary)", color: "var(--accent-fg)" }}>
                    + Add first step
                  </button>
                </form>
              )}
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {seq.rootSteps.map((s) => (
                <StepCard key={s.id} step={s} sequenceId={seq.id} canWrite={canWrite}
                          events={perf.get(s.id)} depth={0} />
              ))}
              {canWrite && (
                <details className="rounded-md border border-dashed px-3 py-1.5 text-[11px]"
                         style={{ borderColor: "var(--border-default)", color: "var(--text-muted)" }}>
                  <summary className="cursor-pointer">+ Append top-level step</summary>
                  <form action={addSequenceStep} className="mt-2 flex flex-wrap items-center gap-2">
                    <input type="hidden" name="sequenceId" value={seq.id} />
                    <select name="kind" defaultValue="SEND_EMAIL"
                            className="ts-focus rounded-md px-2 py-1 text-[11px] outline-none"
                            style={inputStyle()}>
                      {ALL_STEP_KINDS.map((k) => <option key={k} value={k}>{STEP_LABEL[k]}</option>)}
                    </select>
                    <button type="submit"
                            className="ts-focus rounded-md px-2 py-1 text-[11px] font-semibold"
                            style={{ background: "var(--accent-primary)", color: "var(--accent-fg)" }}>
                      Add
                    </button>
                  </form>
                </details>
              )}
            </div>
          )}
        </div>
      )}

      {stepFilter === "settings" && (
        <form action={saveSequence}
              className="flex flex-col gap-3 rounded-lg border p-4"
              style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)" }}>
          <input type="hidden" name="id" value={seq.id} />
          <Field label="Name">
            <input name="name" required maxLength={200} defaultValue={seq.name} disabled={!canWrite}
                   className="ts-focus w-full rounded-md px-3 py-2 text-[14px] font-semibold outline-none"
                   style={inputStyle()} />
          </Field>
          <Field label="Description">
            <input name="description" maxLength={400} defaultValue={seq.description ?? ""} disabled={!canWrite}
                   className="ts-focus w-full rounded-md px-3 py-2 text-[12px] outline-none"
                   style={inputStyle()} />
          </Field>
          <div className="grid gap-3 md:grid-cols-2">
            <Field label="Trigger type">
              <Select name="triggerType" defaultValue={seq.triggerType} disabled={!canWrite}>
                {TRIGGERS.map((t) => <option key={t} value={t}>{TRIGGER_LABEL[t]}</option>)}
              </Select>
            </Field>
            <Field label="Conversion goal" help="e.g. tag:converted, plan:GROWTH, event:subscription_paid">
              <input name="conversionGoal" maxLength={200} defaultValue={seq.conversionGoal ?? ""}
                     disabled={!canWrite}
                     className="ts-focus w-full rounded-md px-3 py-2 text-[12px] outline-none"
                     style={inputStyle()} />
            </Field>
          </div>
          <Field label="Trigger config (JSON)" help="e.g. { 'daysBefore': 7 } / { 'days': 30 } / { 'featureKey': 'production_board' }">
            <textarea name="triggerConfigJson" rows={5}
                      defaultValue={JSON.stringify(seq.triggerConfig, null, 2)}
                      disabled={!canWrite}
                      className="ts-focus w-full rounded-md px-3 py-2 font-mono text-[11px] outline-none"
                      style={{ ...inputStyle(), lineHeight: 1.5 }} />
          </Field>
          <label className="flex items-center gap-2 text-[12px]" style={{ color: "var(--text-default)" }}>
            <input type="checkbox" name="exitOnGoal" defaultChecked={seq.exitOnGoal} disabled={!canWrite}
                   className="ts-focus h-3.5 w-3.5" />
            Auto-exit enrollee on goal hit
          </label>
          {canWrite && (
            <div className="flex items-center justify-end">
              <button type="submit"
                      className="ts-focus rounded-md px-4 py-2 text-[12px] font-semibold"
                      style={{ background: "var(--accent-primary)", color: "var(--accent-fg)" }}>
                Save settings
              </button>
            </div>
          )}
        </form>
      )}

      {stepFilter === "enrollments" && enrollments && (
        <div className="flex flex-col gap-3">
          {canWrite && (
            <form action={enrollTenant}
                  className="flex flex-wrap items-end gap-2 rounded-md border p-3"
                  style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)" }}>
              <input type="hidden" name="sequenceId" value={seq.id} />
              <Field label="Manually enroll tenant">
                <select name="tenantId" required defaultValue=""
                        className="ts-focus rounded-md px-2 py-1.5 text-[12px] outline-none"
                        style={inputStyle()}>
                  <option value="" disabled>— Pick a tenant —</option>
                  {tenants.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
              </Field>
              <button type="submit"
                      className="ts-focus rounded-md px-3 py-1.5 text-[12px] font-semibold"
                      style={{ background: "var(--accent-primary)", color: "var(--accent-fg)" }}>
                Enroll
              </button>
            </form>
          )}

          <form method="get" className="flex flex-wrap items-end gap-2">
            <input type="hidden" name="step" value="enrollments" />
            <Field label="Status">
              <Select name="enrollmentStatus" defaultValue={enrollmentStatus ?? ""}>
                <option value="">All</option>
                {ENROLLMENT_STATUSES.map((s) => <option key={s} value={s}>{s.toLowerCase()}</option>)}
              </Select>
            </Field>
            <button type="submit"
                    className="ts-focus rounded-md px-2 py-1.5 text-[11px] font-medium"
                    style={{ background: "var(--accent-primary)", color: "var(--accent-fg)" }}>
              Apply
            </button>
          </form>

          {enrollments.rows.length === 0 ? (
            <div className="rounded-lg border p-6 text-center text-[12px]"
                 style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)", color: "var(--text-muted)" }}>
              No enrollments in this view yet.
            </div>
          ) : (
            <ul className="overflow-hidden rounded-lg"
                style={{ background: "var(--surface-1)", border: "1px solid var(--border-subtle)" }}>
              {enrollments.rows.map((e, idx) => (
                <li key={e.id}
                    className="grid grid-cols-1 gap-2 px-3 py-2.5 md:grid-cols-[minmax(0,1fr)_120px_180px_140px_auto]"
                    style={{ borderTop: idx === 0 ? "none" : "1px solid var(--border-subtle)" }}>
                  <div className="min-w-0">
                    <div className="text-[12px] font-semibold" style={{ color: "var(--text-default)" }}>
                      {e.tenantName ?? <span style={{ color: "var(--text-faint)" }}>(no tenant)</span>}
                    </div>
                    <div className="text-[10px]" style={{ color: "var(--text-faint)" }}>
                      {e.id.slice(0, 8)} · enrolled {relativeFromNow(e.enrolledAt)}
                    </div>
                  </div>
                  <div><EnrollmentPill status={e.status} /></div>
                  <div className="text-[12px]" style={{ color: "var(--text-muted)" }}>
                    {e.currentStepTitle ?? (e.exitReason ?? "—")}
                  </div>
                  <div className="text-[11px]" style={{ color: "var(--text-muted)" }}>
                    {e.eventCount} event{e.eventCount === 1 ? "" : "s"}
                    {e.completedAt && <> · completed {relativeFromNow(e.completedAt)}</>}
                    {e.exitedAt && <> · exited {relativeFromNow(e.exitedAt)}</>}
                  </div>
                  {canWrite && e.status === "ACTIVE" && (
                    <details>
                      <summary className="cursor-pointer text-[10px]" style={{ color: "var(--text-muted)" }}>actions</summary>
                      <div className="mt-1 flex flex-col gap-1">
                        <form action={advanceEnrollment}>
                          <input type="hidden" name="sequenceId" value={seq.id} />
                          <input type="hidden" name="enrollmentId" value={e.id} />
                          <input name="branchKey" placeholder="branch key (if BRANCH/SPLIT)" maxLength={40}
                                 className="ts-focus rounded-sm px-1.5 py-0.5 text-[10px] outline-none"
                                 style={inputStyle()} />
                          <button type="submit"
                                  className="ts-focus rounded-sm px-1.5 py-0.5 text-[10px] font-semibold"
                                  style={{ background: "var(--accent-primary)", color: "var(--accent-fg)" }}>
                            ↦ Advance
                          </button>
                        </form>
                        <form action={exitEnrollment}>
                          <input type="hidden" name="sequenceId" value={seq.id} />
                          <input type="hidden" name="enrollmentId" value={e.id} />
                          <input name="reason" placeholder="reason" maxLength={200}
                                 className="ts-focus rounded-sm px-1.5 py-0.5 text-[10px] outline-none"
                                 style={inputStyle()} />
                          <button type="submit"
                                  className="ts-focus rounded-sm px-1.5 py-0.5 text-[10px]"
                                  style={{ background: "var(--surface-1)", color: "var(--danger-fg)", border: "1px solid var(--rose-200, var(--border-default))" }}>
                            Exit
                          </button>
                        </form>
                      </div>
                    </details>
                  )}
                </li>
              ))}
            </ul>
          )}

          {totalEnrollmentPages > 1 && (
            <div className="flex items-center justify-between text-[11px]" style={{ color: "var(--text-muted)" }}>
              <span>Page {enrollmentPage} of {totalEnrollmentPages}</span>
              <div className="flex items-center gap-1">
                <PageLink href={enrollmentPage > 1 ? `?step=enrollments&enrollmentStatus=${enrollmentStatus ?? ""}&enrollmentPage=${enrollmentPage - 1}` : null}>‹ Prev</PageLink>
                <PageLink href={enrollmentPage < totalEnrollmentPages ? `?step=enrollments&enrollmentStatus=${enrollmentStatus ?? ""}&enrollmentPage=${enrollmentPage + 1}` : null}>Next ›</PageLink>
              </div>
            </div>
          )}
        </div>
      )}

      {stepFilter === "trend" && (
        <div className="rounded-lg border p-3"
             style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)" }}>
          <h2 className="mb-2 text-[12px] font-semibold" style={{ color: "var(--text-default)" }}>
            Daily enrolled (blue) · converted (green) · exited (red) — 30 days
          </h2>
          <div className="flex h-32 items-end gap-[2px]">
            {trend.daily.map((d) => (
              <div key={d.date} className="flex flex-1 flex-col-reverse"
                   title={`${d.date}: ${d.enrolled} enrolled · ${d.converted} converted · ${d.exited} exited`}>
                <div className="rounded-t-sm" style={{ background: "var(--accent-primary)", height: `${(d.enrolled / maxBar) * 100}%` }} />
                <div style={{ background: "var(--success-fg)", height: `${(d.converted / maxBar) * 100}%` }} />
                <div style={{ background: "var(--danger-fg)", height: `${(d.exited / maxBar) * 100}%` }} />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function TabLink({ href, label, active }: { href: string; label: string; active: boolean }) {
  return (
    <Link href={href}
          className="ts-focus rounded-md px-3 py-1.5 text-[12px] font-medium whitespace-nowrap"
          style={{
            background: active ? "var(--surface-2)" : "transparent",
            color: active ? "var(--text-default)" : "var(--text-muted)",
          }}>
      {label}
    </Link>
  );
}

function TransitionForm({ id, to, label }: { id: string; to: "DRAFT" | "ACTIVE" | "PAUSED" | "ARCHIVED"; label: string }) {
  void STATUS_LABEL;
  return (
    <form action={transitionSequence}>
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="to" value={to} />
      <button type="submit"
              className="ts-focus rounded-md px-3 py-1.5 text-[11px] font-semibold"
              style={{
                background: to === "ACTIVE" ? "var(--accent-primary)" : "var(--surface-1)",
                color: to === "ACTIVE" ? "var(--accent-fg)" : (to === "ARCHIVED" ? "var(--danger-fg)" : "var(--text-default)"),
                border: to === "ACTIVE" ? undefined : "1px solid var(--border-default)",
              }}>
        {label}
      </button>
    </form>
  );
}

function Field({
  label, help, children,
}: {
  label: string;
  help?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[10px] font-medium uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>
        {label}
      </span>
      {children}
      {help && <span className="text-[10px]" style={{ color: "var(--text-faint)" }}>{help}</span>}
    </label>
  );
}

function Select({
  name, defaultValue, disabled, children,
}: {
  name: string;
  defaultValue: string;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <select name={name} defaultValue={defaultValue} disabled={disabled}
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
