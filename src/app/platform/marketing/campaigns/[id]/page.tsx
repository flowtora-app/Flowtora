// Page 39 — Campaign editor wizard + per-campaign performance.

import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePlatformStaff } from "@/lib/platform";
import {
  loadCampaignDetail,
  loadAudiences,
  loadEmailTemplates,
  loadRecipients,
  runPreflight,
  type SegmentFilter,
} from "@/server/platform/email-campaigns";
import {
  saveCampaign,
  transitionCampaign,
  upsertSubjectVariant,
  deleteSubjectVariant,
  enqueueAndSend,
  estimateAudienceFromFilter,
  setRecipientEvent,
} from "@/app/actions/platform-email-campaigns";
import type {
  EmailCampaignType,
  EmailCampaignStatus,
  EmailRecipientStatus,
} from "@prisma/client";
import {
  CAMPAIGN_TYPE_LABEL,
  FormError,
  FormOk,
  Kpi,
  RecipientPill,
  StatusPill,
  relativeFromNow,
} from "../_components/shared";
import { TabsBar } from "../_components/TabsBar";
import {
  WizardSteps,
  isWizardStep,
  type WizardStep,
} from "../_components/WizardSteps";

export const dynamic = "force-dynamic";

const TYPES: EmailCampaignType[] = ["ONE_OFF", "RECURRING"];
const STRATEGIES: ("IMMEDIATE" | "SCHEDULED" | "OPTIMIZED")[] = ["IMMEDIATE", "SCHEDULED", "OPTIMIZED"];

const dtLocal = (d: Date | null) => d ? d.toISOString().slice(0, 16) : "";

export default async function CampaignDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ step?: string; ok?: string; error?: string; recipientStatus?: string; recipientPage?: string; q?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const ctx = await requirePlatformStaff();
  const canWrite = ctx.can("announcement.write");

  const step: WizardStep = isWizardStep(sp.step) ? sp.step : "setup";

  const [campaign, audiences, templates] = await Promise.all([
    loadCampaignDetail(id),
    loadAudiences(),
    loadEmailTemplates(),
  ]);
  if (!campaign) notFound();

  const hasSent = campaign.recipientCount > 0;
  const hrefFor = (s: WizardStep) =>
    `/platform/marketing/campaigns/${campaign.id}${s === "setup" ? "" : `?step=${s}`}`;

  const recipientStatus = sp.recipientStatus && (
    ["QUEUED", "SENT", "DELIVERED", "OPENED", "CLICKED", "BOUNCED", "UNSUBSCRIBED", "COMPLAINED", "FAILED"] as string[]
  ).includes(sp.recipientStatus) ? (sp.recipientStatus as EmailRecipientStatus) : undefined;

  const recipientPage = Math.max(1, parseInt(sp.recipientPage ?? "1", 10) || 1);
  const recipientList = step === "performance" && hasSent
    ? await loadRecipients({
        campaignId: campaign.id,
        status: recipientStatus,
        q: sp.q,
        page: recipientPage,
        pageSize: 50,
      })
    : null;

  return (
    <div className="space-y-5">
      {/* Breadcrumb */}
      <div className="text-[11px]" style={{ color: "var(--text-muted)" }}>
        <Link href="/platform/marketing/campaigns" className="underline" style={{ color: "var(--text-muted)" }}>
          Campaigns
        </Link>
        <span className="mx-1.5">/</span>
        <span style={{ color: "var(--text-default)" }}>{campaign.name}</span>
      </div>

      <FormOk msg={sp.ok} />
      <FormError msg={sp.error} />

      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-1.5">
            <StatusPill status={campaign.status} />
            <span className="rounded-full px-1.5 py-0.5 text-[10px] font-medium"
                  style={{ background: "var(--surface-2)", color: "var(--text-muted)" }}>
              {CAMPAIGN_TYPE_LABEL[campaign.type]}
            </span>
            <span className="rounded-full px-1.5 py-0.5 text-[10px] font-medium"
                  style={{ background: "var(--surface-2)", color: "var(--text-muted)" }}>
              {campaign.language}
            </span>
            {campaign.variantCount > 0 && (
              <span className="rounded-full px-1.5 py-0.5 text-[10px] font-medium"
                    style={{ background: "var(--accent-surface)", color: "var(--accent-primary)" }}>
                A/B · {campaign.variantCount}
              </span>
            )}
          </div>
          <h1 className="mt-1.5 text-[22px] font-semibold leading-tight" style={{ color: "var(--text-default)" }}>
            {campaign.name}
          </h1>
          <p className="mt-1 text-[11px]" style={{ color: "var(--text-muted)" }}>
            Updated {relativeFromNow(campaign.updatedAt)}
            {campaign.completedSendingAt && ` · sent ${relativeFromNow(campaign.completedSendingAt)}`}
            {campaign.scheduledAt && !campaign.completedSendingAt && ` · scheduled ${relativeFromNow(campaign.scheduledAt)}`}
            {campaign.audienceSize > 0 && ` · audience ${campaign.audienceSize.toLocaleString()}`}
          </p>
        </div>
        {canWrite && campaign.status === "PAUSED" && (
          <TransitionForm id={campaign.id} to="SCHEDULED" label="Resume" />
        )}
        {canWrite && campaign.status === "SENDING" && (
          <TransitionForm id={campaign.id} to="PAUSED" label="Pause" />
        )}
      </div>

      <TabsBar active="campaigns" />

      <WizardSteps active={step} hrefFor={hrefFor} includePerformance={hasSent} />

      <div className="rounded-lg border p-4"
           style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)" }}>
        {step === "setup"     && <SetupStep    campaign={campaign} canWrite={canWrite} />}
        {step === "audience"  && <AudienceStep campaign={campaign} audiences={audiences} canWrite={canWrite} />}
        {step === "content"   && <ContentStep  campaign={campaign} templates={templates} canWrite={canWrite} />}
        {step === "schedule"  && <ScheduleStep campaign={campaign} canWrite={canWrite} />}
        {step === "tracking"  && <TrackingStep campaign={campaign} canWrite={canWrite} />}
        {step === "review"    && <ReviewStep   campaign={campaign} canWrite={canWrite} />}
        {step === "performance" && recipientList && (
          <PerformanceStep
            campaign={campaign}
            recipientList={recipientList}
            recipientStatus={recipientStatus}
            recipientPage={recipientPage}
            search={sp.q}
            canWrite={canWrite}
          />
        )}
      </div>
    </div>
  );
}

function TransitionForm({ id, to, label }: { id: string; to: EmailCampaignStatus; label: string }) {
  return (
    <form action={transitionCampaign}>
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="to" value={to} />
      <button type="submit"
              className="ts-focus rounded-md px-3 py-1.5 text-[12px] font-semibold"
              style={{ background: "var(--accent-primary)", color: "var(--accent-fg)" }}>
        {label}
      </button>
    </form>
  );
}

/* ── Setup step ───────────────────────────────────────── */

function SetupStep({
  campaign, canWrite,
}: {
  campaign: NonNullable<Awaited<ReturnType<typeof loadCampaignDetail>>>;
  canWrite: boolean;
}) {
  return (
    <SaveForm campaign={campaign} canWrite={canWrite}>
      <div className="grid gap-3 md:grid-cols-2">
        <Field label="Campaign name">
          <input name="name" required maxLength={200} defaultValue={campaign.name} disabled={!canWrite}
                 className="ts-focus w-full rounded-md px-3 py-2 text-[14px] font-semibold outline-none"
                 style={inputStyle()} />
        </Field>
        <Field label="Type">
          <Select name="type" defaultValue={campaign.type} disabled={!canWrite}>
            {TYPES.map((t) => <option key={t} value={t}>{CAMPAIGN_TYPE_LABEL[t]}</option>)}
          </Select>
        </Field>
        <Field label="Language">
          <input name="language" defaultValue={campaign.language} maxLength={8} disabled={!canWrite}
                 className="ts-focus w-[100px] rounded-md px-2 py-1.5 text-[12px] outline-none"
                 style={inputStyle()} />
        </Field>
      </div>
      <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>
        Recurring campaigns ship every interval matching the RRULE on the Send time step until the
        recurrence end date.
      </p>
    </SaveForm>
  );
}

/* ── Audience step ────────────────────────────────────── */

function AudienceStep({
  campaign, audiences, canWrite,
}: {
  campaign: NonNullable<Awaited<ReturnType<typeof loadCampaignDetail>>>;
  audiences: { id: string; name: string; filter: unknown; estimatedSize: number }[];
  canWrite: boolean;
}) {
  return (
    <div className="flex flex-col gap-3">
      <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>
        Edit the segment JSON below. Re-estimate to refresh the recipient count.
      </p>
      {canWrite && (
        <form action={estimateAudienceFromFilter} className="grid gap-2">
          <input type="hidden" name="id" value={campaign.id} />
          <Field label="Segment JSON">
            <textarea name="audienceJson" rows={12}
                      defaultValue={JSON.stringify(campaign.audienceFilter, null, 2)}
                      className="ts-focus w-full rounded-md px-3 py-2 font-mono text-[11px] outline-none"
                      style={{ ...inputStyle(), lineHeight: 1.5 }} />
          </Field>
          <div className="flex items-center justify-between">
            <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>
              Last estimate: <b className="tabular-nums" style={{ color: "var(--text-default)" }}>{campaign.audienceSize.toLocaleString()}</b> recipients
            </p>
            <button type="submit"
                    className="ts-focus rounded-md px-3 py-1.5 text-[12px] font-semibold"
                    style={{ background: "var(--accent-primary)", color: "var(--accent-fg)" }}>
              Re-estimate
            </button>
          </div>
        </form>
      )}

      {audiences.length > 0 && (
        <div className="rounded-md border p-3"
             style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)" }}>
          <h3 className="mb-1 text-[11px] font-semibold uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>
            Or copy a saved audience
          </h3>
          <ul className="grid gap-2 md:grid-cols-2 lg:grid-cols-3">
            {audiences.map((a) => (
              <li key={a.id}
                  className="rounded-md border p-2"
                  style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)" }}>
                <div className="text-[12px] font-semibold" style={{ color: "var(--text-default)" }}>{a.name}</div>
                <div className="text-[10px]" style={{ color: "var(--text-muted)" }}>
                  {a.estimatedSize.toLocaleString()} estimated
                </div>
                <details className="mt-1">
                  <summary className="cursor-pointer text-[10px]" style={{ color: "var(--text-muted)" }}>JSON</summary>
                  <pre className="mt-1 max-h-32 overflow-auto rounded-sm font-mono text-[10px]"
                       style={{ background: "var(--surface-2)", color: "var(--text-muted)" }}>{JSON.stringify(a.filter, null, 2)}</pre>
                </details>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

/* ── Content step ─────────────────────────────────────── */

function ContentStep({
  campaign, templates, canWrite,
}: {
  campaign: NonNullable<Awaited<ReturnType<typeof loadCampaignDetail>>>;
  templates: { id: string; name: string }[];
  canWrite: boolean;
}) {
  void templates;
  return (
    <div className="flex flex-col gap-4">
      <SaveForm campaign={campaign} canWrite={canWrite}>
        <div className="grid gap-3 md:grid-cols-3">
          <Field label="From name">
            <input name="fromName" maxLength={120} defaultValue={campaign.fromName ?? ""} disabled={!canWrite}
                   className="ts-focus rounded-md px-2 py-1.5 text-[12px] outline-none"
                   style={inputStyle()} />
          </Field>
          <Field label="From email">
            <input name="fromEmail" maxLength={200} defaultValue={campaign.fromEmail ?? ""} disabled={!canWrite}
                   placeholder="hello@flowtora.com"
                   className="ts-focus rounded-md px-2 py-1.5 text-[12px] outline-none"
                   style={inputStyle()} />
          </Field>
          <Field label="Reply-to">
            <input name="replyToEmail" maxLength={200} defaultValue={campaign.replyToEmail ?? ""} disabled={!canWrite}
                   placeholder="support@flowtora.com"
                   className="ts-focus rounded-md px-2 py-1.5 text-[12px] outline-none"
                   style={inputStyle()} />
          </Field>
        </div>
        <Field label="Preview text" help="Shown after the subject in inbox previews. Aim for 50-90 chars.">
          <input name="previewText" maxLength={200} defaultValue={campaign.previewText ?? ""} disabled={!canWrite}
                 className="ts-focus w-full rounded-md px-3 py-2 text-[12px] outline-none"
                 style={inputStyle()} />
        </Field>
        <Field label="Body (Markdown)" help="Personalize with {{firstName}}, {{tenantName}}, {{plan}}.">
          <textarea name="bodyMarkdown" rows={20} defaultValue={campaign.bodyMarkdown} disabled={!canWrite}
                    className="ts-focus w-full rounded-md px-3 py-2 font-mono text-[12px] outline-none"
                    style={{ ...inputStyle(), lineHeight: 1.5 }} />
        </Field>
      </SaveForm>

      {/* Email preview */}
      <div className="rounded-md border p-3"
           style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)" }}>
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>
            Inbox + body preview
          </h3>
        </div>
        <iframe srcDoc={campaign.bodyHtml}
                title="Email preview"
                style={{ width: "100%", height: 480, border: "1px solid var(--border-subtle)", borderRadius: 8, background: "#fff" }}
                sandbox="allow-same-origin" />
      </div>

      {/* A/B subject variants */}
      <div className="rounded-md border p-3"
           style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)" }}>
        <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>
          A/B subject variants ({campaign.variants.length}/3)
        </h3>
        <ul className="grid gap-2 md:grid-cols-2 lg:grid-cols-3">
          {campaign.variants.map((v) => (
            <li key={v.id}
                className="rounded-md border p-2"
                style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)" }}>
              <form action={upsertSubjectVariant} className="flex flex-col gap-1.5">
                <input type="hidden" name="variantId" value={v.id} />
                <input type="hidden" name="campaignId" value={campaign.id} />
                <Field label={`Label · sent ${v.sentCount} · opened ${v.openedCount} · clicked ${v.clickedCount}`}>
                  <input name="label" required maxLength={40} defaultValue={v.label} disabled={!canWrite}
                         className="ts-focus rounded-md px-2 py-1 text-[12px] outline-none"
                         style={inputStyle()} />
                </Field>
                <Field label="Subject">
                  <input name="subject" required maxLength={200} defaultValue={v.subject} disabled={!canWrite}
                         className="ts-focus rounded-md px-2 py-1 text-[12px] outline-none"
                         style={inputStyle()} />
                </Field>
                <Field label="Preview">
                  <input name="previewText" maxLength={200} defaultValue={v.previewText ?? ""} disabled={!canWrite}
                         className="ts-focus rounded-md px-2 py-1 text-[12px] outline-none"
                         style={inputStyle()} />
                </Field>
                <Field label="Weight %">
                  <input type="number" name="weightPct" min={0} max={100} defaultValue={v.weightPct}
                         disabled={!canWrite}
                         className="ts-focus w-24 rounded-md px-2 py-1 text-[12px] tabular-nums outline-none"
                         style={inputStyle()} />
                </Field>
                <div className="flex items-center justify-between gap-2">
                  {canWrite && (
                    <button type="submit"
                            className="ts-focus rounded-md px-2 py-1 text-[10px] font-semibold"
                            style={{ background: "var(--accent-primary)", color: "var(--accent-fg)" }}>
                      Save
                    </button>
                  )}
                </div>
              </form>
              {canWrite && (
                <form action={deleteSubjectVariant} className="mt-1">
                  <input type="hidden" name="variantId" value={v.id} />
                  <input type="hidden" name="campaignId" value={campaign.id} />
                  <button type="submit"
                          className="text-[10px] underline" style={{ color: "var(--danger-fg)" }}>
                    Delete variant
                  </button>
                </form>
              )}
            </li>
          ))}
          {canWrite && campaign.variants.length < 3 && (
            <li>
              <form action={upsertSubjectVariant}
                    className="flex flex-col gap-1.5 rounded-md border border-dashed p-2"
                    style={{ borderColor: "var(--border-default)", background: "var(--surface-1)" }}>
                <input type="hidden" name="campaignId" value={campaign.id} />
                <Field label="Label">
                  <input name="label" required maxLength={40}
                         placeholder={["A", "B", "C"][campaign.variants.length] ?? "A"}
                         className="ts-focus rounded-md px-2 py-1 text-[12px] outline-none"
                         style={inputStyle()} />
                </Field>
                <Field label="Subject">
                  <input name="subject" required maxLength={200}
                         placeholder="e.g. Quick check-in from Flowtora"
                         className="ts-focus rounded-md px-2 py-1 text-[12px] outline-none"
                         style={inputStyle()} />
                </Field>
                <Field label="Preview">
                  <input name="previewText" maxLength={200}
                         className="ts-focus rounded-md px-2 py-1 text-[12px] outline-none"
                         style={inputStyle()} />
                </Field>
                <Field label="Weight %">
                  <input type="number" name="weightPct" min={0} max={100} defaultValue={50}
                         className="ts-focus w-24 rounded-md px-2 py-1 text-[12px] tabular-nums outline-none"
                         style={inputStyle()} />
                </Field>
                <button type="submit"
                        className="ts-focus rounded-md px-2 py-1 text-[10px] font-semibold"
                        style={{ background: "var(--accent-primary)", color: "var(--accent-fg)" }}>
                  + Add variant
                </button>
              </form>
            </li>
          )}
        </ul>
      </div>
    </div>
  );
}

/* ── Schedule step ────────────────────────────────────── */

function ScheduleStep({
  campaign, canWrite,
}: {
  campaign: NonNullable<Awaited<ReturnType<typeof loadCampaignDetail>>>;
  canWrite: boolean;
}) {
  return (
    <SaveForm campaign={campaign} canWrite={canWrite}>
      <div className="grid gap-3 md:grid-cols-2">
        <Field label="Send strategy">
          <Select name="sendStrategy" defaultValue={campaign.sendStrategy} disabled={!canWrite}>
            {STRATEGIES.map((s) => (
              <option key={s} value={s}>
                {s === "IMMEDIATE" ? "Send immediately"
                  : s === "SCHEDULED" ? "Schedule for date/time"
                  : "Send-time optimization"}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Scheduled at" help="Used when strategy = SCHEDULED.">
          <input type="datetime-local" name="scheduledAt"
                 defaultValue={dtLocal(campaign.scheduledAt)} disabled={!canWrite}
                 className="ts-focus rounded-md px-2 py-1.5 text-[12px] outline-none"
                 style={inputStyle()} />
        </Field>
      </div>
      {campaign.type === "RECURRING" && (
        <Field label="RRULE" help="Standard iCal/RFC-5545 RRULE — e.g. FREQ=WEEKLY;BYDAY=TU.">
          <input name="recurrenceRule" maxLength={200}
                 defaultValue={campaign.recurrenceRule ?? ""} disabled={!canWrite}
                 className="ts-focus w-full rounded-md px-3 py-2 font-mono text-[11px] outline-none"
                 style={inputStyle()} />
        </Field>
      )}
      <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>
        Send-time optimization computes a per-recipient slot using their last-login window. If a
        recipient has no signal we fall back to the campaign-wide scheduledAt.
      </p>
    </SaveForm>
  );
}

/* ── Tracking step ────────────────────────────────────── */

function TrackingStep({
  campaign, canWrite,
}: {
  campaign: NonNullable<Awaited<ReturnType<typeof loadCampaignDetail>>>;
  canWrite: boolean;
}) {
  return (
    <SaveForm campaign={campaign} canWrite={canWrite}>
      <div className="grid gap-3 md:grid-cols-3">
        <Field label="UTM source">
          <input name="utmSource" maxLength={80} defaultValue={campaign.utmSource ?? ""} disabled={!canWrite}
                 placeholder="campaign"
                 className="ts-focus rounded-md px-2 py-1.5 text-[12px] outline-none" style={inputStyle()} />
        </Field>
        <Field label="UTM medium">
          <input name="utmMedium" maxLength={80} defaultValue={campaign.utmMedium ?? ""} disabled={!canWrite}
                 placeholder="email"
                 className="ts-focus rounded-md px-2 py-1.5 text-[12px] outline-none" style={inputStyle()} />
        </Field>
        <Field label="UTM campaign">
          <input name="utmCampaign" maxLength={120} defaultValue={campaign.utmCampaign ?? ""} disabled={!canWrite}
                 placeholder={campaign.name.toLowerCase().replace(/\s+/g, "-")}
                 className="ts-focus rounded-md px-2 py-1.5 text-[12px] outline-none" style={inputStyle()} />
        </Field>
      </div>
      <Field label="Conversion goal" help={"E.g. 'signup', 'url:/pricing', 'tag:converted'."}>
        <input name="conversionGoal" maxLength={200}
               defaultValue={campaign.conversionGoal ?? ""} disabled={!canWrite}
               className="ts-focus w-full rounded-md px-3 py-2 text-[12px] outline-none" style={inputStyle()} />
      </Field>
    </SaveForm>
  );
}

/* ── Review step ──────────────────────────────────────── */

function ReviewStep({
  campaign, canWrite,
}: {
  campaign: NonNullable<Awaited<ReturnType<typeof loadCampaignDetail>>>;
  canWrite: boolean;
}) {
  const subject = campaign.variants[0]?.subject ?? campaign.name;
  const preflight = runPreflight({
    fromName: campaign.fromName,
    fromEmail: campaign.fromEmail,
    replyToEmail: campaign.replyToEmail,
    subject,
    bodyHtml: campaign.bodyHtml,
    bodyText: campaign.bodyText,
    previewText: campaign.previewText,
  });

  const tone =
    preflight.score >= 90 ? { fg: "var(--success-fg)", bg: "var(--success-surface)" } :
    preflight.score >= 70 ? { fg: "var(--accent-primary)", bg: "var(--accent-surface)" } :
    preflight.score >= 50 ? { fg: "var(--warning-fg)", bg: "var(--warning-surface)" } :
                             { fg: "var(--danger-fg)", bg: "var(--rose-50, var(--surface-2))" };
  const blocking = preflight.checks.some((c) => c.status === "fail");

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
      <div className="rounded-md border p-3"
           style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)" }}>
        <h3 className="mb-2 text-[12px] font-semibold" style={{ color: "var(--text-default)" }}>
          Mobile + dark-mode preview
        </h3>
        <div className="flex flex-wrap gap-3">
          <div style={{ width: 360 }}>
            <div className="text-[10px] uppercase tracking-wider mb-1" style={{ color: "var(--text-muted)" }}>Light · mobile</div>
            <iframe srcDoc={campaign.bodyHtml}
                    title="Light mobile preview"
                    style={{ width: 360, height: 520, border: "1px solid var(--border-subtle)", borderRadius: 12, background: "#fff" }}
                    sandbox="allow-same-origin" />
          </div>
          <div style={{ width: 360 }}>
            <div className="text-[10px] uppercase tracking-wider mb-1" style={{ color: "var(--text-muted)" }}>Dark · mobile</div>
            <iframe srcDoc={`<style>:root{color-scheme:dark}body{background:#0b0f1a !important;color:#e2e8f0 !important;}*{color:inherit !important;}.lp-body, table, td, p, h1, h2, h3{color:#e2e8f0 !important;background:#0b0f1a !important;}</style>${campaign.bodyHtml}`}
                    title="Dark mobile preview"
                    style={{ width: 360, height: 520, border: "1px solid var(--border-subtle)", borderRadius: 12, background: "#0b0f1a" }}
                    sandbox="allow-same-origin" />
          </div>
        </div>
      </div>

      <aside className="flex flex-col gap-3">
        <div className="rounded-md border p-3"
             style={{ background: "var(--surface-1)", borderColor: tone.fg }}>
          <h3 className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>
            Preflight score
          </h3>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="text-[28px] font-semibold tabular-nums" style={{ color: tone.fg }}>
              {preflight.score}
            </span>
            <span className="text-[11px] uppercase tracking-wide" style={{ color: tone.fg }}>
              {preflight.score >= 90 ? "Excellent" :
               preflight.score >= 70 ? "Good" :
               preflight.score >= 50 ? "Needs work" : "Hold off"}
            </span>
          </div>
          <ul className="mt-2 flex flex-col gap-1 text-[11px]">
            {preflight.checks.map((c) => (
              <li key={c.id} className="flex items-baseline gap-2">
                <span aria-hidden style={{
                  color: c.status === "pass" ? "var(--success-fg)" : c.status === "warn" ? "var(--warning-fg)" : "var(--danger-fg)",
                }}>
                  {c.status === "pass" ? "✓" : c.status === "warn" ? "•" : "✗"}
                </span>
                <span style={{ color: "var(--text-default)" }}>{c.label}</span>
                {c.detail && <span style={{ color: "var(--text-muted)" }}>· {c.detail}</span>}
              </li>
            ))}
          </ul>
        </div>

        <div className="rounded-md border p-3 text-[11px]"
             style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)", color: "var(--text-muted)" }}>
          <div><b style={{ color: "var(--text-default)" }}>Audience size:</b> {campaign.audienceSize.toLocaleString()}</div>
          <div><b style={{ color: "var(--text-default)" }}>From:</b> {campaign.fromName ?? ""} {campaign.fromEmail ?? ""}</div>
          <div><b style={{ color: "var(--text-default)" }}>Subject (default):</b> {subject}</div>
          <div><b style={{ color: "var(--text-default)" }}>Strategy:</b> {campaign.sendStrategy}</div>
          {campaign.scheduledAt && (
            <div><b style={{ color: "var(--text-default)" }}>Scheduled:</b> {campaign.scheduledAt.toISOString()}</div>
          )}
        </div>

        {canWrite && (
          <form action={enqueueAndSend}>
            <input type="hidden" name="id" value={campaign.id} />
            <button type="submit" disabled={blocking || campaign.audienceSize === 0}
                    className="ts-focus w-full rounded-md px-4 py-3 text-[13px] font-semibold"
                    style={{
                      background: blocking || campaign.audienceSize === 0 ? "var(--surface-2)" : "var(--accent-primary)",
                      color: blocking || campaign.audienceSize === 0 ? "var(--text-faint)" : "var(--accent-fg)",
                      cursor: blocking || campaign.audienceSize === 0 ? "not-allowed" : "pointer",
                    }}>
              {blocking ? "Fix failing checks before sending"
                : campaign.audienceSize === 0 ? "Re-estimate audience first"
                : `Send to ${campaign.audienceSize.toLocaleString()} recipients`}
            </button>
          </form>
        )}

        <p className="text-[10px]" style={{ color: "var(--text-faint)" }}>
          Click "Send" to enqueue + dispatch the campaign. Open + click events stream in via the
          tracking pixel and link redirect.
        </p>
      </aside>
    </div>
  );
}

/* ── Performance step ─────────────────────────────────── */

const RECIPIENT_STATUSES: EmailRecipientStatus[] = [
  "QUEUED", "SENT", "DELIVERED", "OPENED", "CLICKED", "BOUNCED", "UNSUBSCRIBED", "COMPLAINED", "FAILED",
];

function PerformanceStep({
  campaign, recipientList, recipientStatus, recipientPage, search, canWrite,
}: {
  campaign: NonNullable<Awaited<ReturnType<typeof loadCampaignDetail>>>;
  recipientList: Awaited<ReturnType<typeof loadRecipients>>;
  recipientStatus: EmailRecipientStatus | undefined;
  recipientPage: number;
  search: string | undefined;
  canWrite: boolean;
}) {
  const totalPages = Math.max(1, Math.ceil(recipientList.total / 50));
  const maxFunnel = Math.max(1, ...campaign.funnel.map((f) => f.count));
  const maxClickCount = Math.max(1, ...campaign.topClicks.map((c) => c.count));
  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
        <Kpi label="Sent"        value={campaign.sentCount.toLocaleString()} />
        <Kpi label="Delivered"   value={campaign.deliveredCount.toLocaleString()} />
        <Kpi label="Opened"      value={campaign.openedCount.toLocaleString()}    sub={campaign.openRate == null ? "—" : `${(campaign.openRate * 100).toFixed(1)}% rate`} tone={campaign.openRate != null && campaign.openRate >= 0.3 ? "good" : "default"} />
        <Kpi label="Clicked"     value={campaign.clickedCount.toLocaleString()}   sub={campaign.ctr == null ? "—" : `${(campaign.ctr * 100).toFixed(2)}% CTR`} tone={campaign.ctr != null && campaign.ctr >= 0.05 ? "good" : "default"} />
        <Kpi label="Unsubs"      value={campaign.unsubscribedCount.toLocaleString()} sub={campaign.unsubscribeRate == null ? "—" : `${(campaign.unsubscribeRate * 100).toFixed(2)}% rate`} tone={campaign.unsubscribeRate != null && campaign.unsubscribeRate > 0.01 ? "warning" : "default"} />
        <Kpi label="Bounced"     value={campaign.bouncedCount.toLocaleString()}   sub={campaign.bounceRate == null ? "—" : `${(campaign.bounceRate * 100).toFixed(2)}% rate`} tone={campaign.bounceRate != null && campaign.bounceRate > 0.05 ? "danger" : "default"} />
      </div>

      <div className="rounded-md border p-3"
           style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)" }}>
        <h3 className="mb-2 text-[12px] font-semibold" style={{ color: "var(--text-default)" }}>
          Delivery funnel
        </h3>
        <ul className="flex flex-col gap-1.5">
          {campaign.funnel.map((f) => (
            <li key={f.label} className="grid grid-cols-[160px_minmax(0,1fr)_70px] items-center gap-2 text-[11px]">
              <span style={{ color: "var(--text-default)" }}>{f.label}</span>
              <div className="h-2 overflow-hidden rounded-full" style={{ background: "var(--surface-2)" }}>
                <div style={{ width: `${(f.count / maxFunnel) * 100}%`, background: "var(--accent-primary)", height: "100%" }} />
              </div>
              <span className="tabular-nums text-right" style={{ color: "var(--text-default)" }}>
                {f.count.toLocaleString()}
              </span>
            </li>
          ))}
        </ul>
      </div>

      <div className="rounded-md border p-3"
           style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)" }}>
        <h3 className="mb-2 text-[12px] font-semibold" style={{ color: "var(--text-default)" }}>
          Click heatmap — top URLs
        </h3>
        {campaign.topClicks.length === 0 ? (
          <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>No clicks recorded yet.</p>
        ) : (
          <ul className="flex flex-col gap-1">
            {campaign.topClicks.map((c) => (
              <li key={c.href} className="grid grid-cols-[minmax(0,1fr)_120px_50px] items-center gap-2 text-[11px]">
                <span className="truncate font-mono" style={{ color: "var(--text-default)" }}>{c.href}</span>
                <div className="h-2 overflow-hidden rounded-full" style={{ background: "var(--surface-2)" }}>
                  <div style={{ width: `${(c.count / maxClickCount) * 100}%`, background: "var(--warning-fg)", height: "100%" }} />
                </div>
                <span className="text-right tabular-nums" style={{ color: "var(--text-default)" }}>{c.count}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Per-recipient drill-down */}
      <div className="rounded-md border p-3"
           style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)" }}>
        <h3 className="mb-2 text-[12px] font-semibold" style={{ color: "var(--text-default)" }}>
          Recipients ({recipientList.total.toLocaleString()})
        </h3>
        <form method="get" className="mb-3 flex flex-wrap items-end gap-2">
          <input type="hidden" name="step" value="performance" />
          <Field label="Search">
            <input name="q" defaultValue={search ?? ""} placeholder="email…"
                   className="ts-focus w-[260px] rounded-md px-2 py-1.5 text-[12px] outline-none"
                   style={inputStyle()} />
          </Field>
          <Field label="Status">
            <Select name="recipientStatus" defaultValue={recipientStatus ?? ""}>
              <option value="">All</option>
              {RECIPIENT_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
            </Select>
          </Field>
          <button type="submit"
                  className="ts-focus rounded-md px-3 py-1.5 text-[12px] font-medium"
                  style={{ background: "var(--accent-primary)", color: "var(--accent-fg)" }}>
            Apply
          </button>
        </form>
        <div className="overflow-hidden rounded-md border" style={{ borderColor: "var(--border-subtle)" }}>
          <ul>
            {recipientList.rows.map((r, idx) => (
              <li key={r.id}
                  className="grid grid-cols-[minmax(0,1fr)_120px_120px_140px_auto] items-center gap-2 px-3 py-2 text-[11px]"
                  style={{ borderTop: idx === 0 ? "none" : "1px solid var(--border-subtle)" }}>
                <span className="truncate" style={{ color: "var(--text-default)" }}>
                  {r.email}
                  {r.tenantName && <span className="ml-1" style={{ color: "var(--text-muted)" }}>· {r.tenantName}</span>}
                  {r.failureReason && (
                    <span className="ml-1 rounded-sm px-1 py-0.5" style={{ background: "var(--rose-50, var(--surface-2))", color: "var(--danger-fg)" }}>
                      {r.failureReason}
                    </span>
                  )}
                </span>
                <RecipientPill status={r.status} />
                <span style={{ color: "var(--text-muted)" }}>
                  {r.variantLabel ? `Var ${r.variantLabel}` : "—"}
                </span>
                <span className="tabular-nums" style={{ color: "var(--text-muted)" }}>
                  {r.clickedAt ? `clicked ${relativeFromNow(r.clickedAt)}`
                    : r.openedAt ? `opened ${relativeFromNow(r.openedAt)}`
                    : r.deliveredAt ? `delivered ${relativeFromNow(r.deliveredAt)}`
                    : r.sentAt ? `sent ${relativeFromNow(r.sentAt)}`
                    : "queued"}
                </span>
                {canWrite && (
                  <details>
                    <summary className="cursor-pointer text-[10px]" style={{ color: "var(--text-muted)" }}>set</summary>
                    <div className="mt-1 flex flex-wrap gap-1">
                      {(["DELIVERED", "OPENED", "CLICKED", "BOUNCED", "UNSUBSCRIBED", "COMPLAINED", "FAILED"] as const).map((evt) => (
                        <form key={evt} action={setRecipientEvent}>
                          <input type="hidden" name="recipientId" value={r.id} />
                          <input type="hidden" name="event" value={evt} />
                          <button type="submit"
                                  className="rounded-sm px-1.5 py-0.5 text-[10px]"
                                  style={{ background: "var(--surface-1)", color: "var(--text-default)", border: "1px solid var(--border-default)" }}>
                            → {evt[0]}{evt.slice(1).toLowerCase()}
                          </button>
                        </form>
                      ))}
                    </div>
                  </details>
                )}
              </li>
            ))}
          </ul>
        </div>
        {totalPages > 1 && (
          <div className="mt-2 flex items-center justify-between text-[11px]" style={{ color: "var(--text-muted)" }}>
            <span>
              Page {recipientPage} of {totalPages}
            </span>
            <div className="flex items-center gap-1">
              <PageLink href={recipientPage > 1 ? `?step=performance&recipientStatus=${recipientStatus ?? ""}&q=${encodeURIComponent(search ?? "")}&recipientPage=${recipientPage - 1}` : null}>‹ Prev</PageLink>
              <PageLink href={recipientPage < totalPages ? `?step=performance&recipientStatus=${recipientStatus ?? ""}&q=${encodeURIComponent(search ?? "")}&recipientPage=${recipientPage + 1}` : null}>Next ›</PageLink>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ── Save form wrapper ─────────────────────────────────── */

function SaveForm({
  campaign, canWrite, children,
}: {
  campaign: NonNullable<Awaited<ReturnType<typeof loadCampaignDetail>>>;
  canWrite: boolean;
  children: React.ReactNode;
}) {
  return (
    <form action={saveCampaign} className="flex flex-col gap-4">
      <input type="hidden" name="id" value={campaign.id} />

      {/* Persist non-current-step fields. */}
      {/* setup */}
      <input type="hidden" name="name"     value={campaign.name} />
      <input type="hidden" name="type"     value={campaign.type} />
      <input type="hidden" name="language" value={campaign.language} />
      {/* audience — segmented elsewhere */}
      <input type="hidden" name="audienceJson" value={JSON.stringify(campaign.audienceFilter)} />
      {/* content */}
      <input type="hidden" name="fromName"     value={campaign.fromName ?? ""} />
      <input type="hidden" name="fromEmail"    value={campaign.fromEmail ?? ""} />
      <input type="hidden" name="replyToEmail" value={campaign.replyToEmail ?? ""} />
      <input type="hidden" name="previewText"  value={campaign.previewText ?? ""} />
      <input type="hidden" name="bodyMarkdown" value={campaign.bodyMarkdown} />
      {/* schedule */}
      <input type="hidden" name="sendStrategy"   value={campaign.sendStrategy} />
      <input type="hidden" name="scheduledAt"    value={dtLocal(campaign.scheduledAt)} />
      <input type="hidden" name="recurrenceRule" value={campaign.recurrenceRule ?? ""} />
      {/* tracking */}
      <input type="hidden" name="utmSource"      value={campaign.utmSource ?? ""} />
      <input type="hidden" name="utmMedium"      value={campaign.utmMedium ?? ""} />
      <input type="hidden" name="utmCampaign"    value={campaign.utmCampaign ?? ""} />
      <input type="hidden" name="conversionGoal" value={campaign.conversionGoal ?? ""} />

      {children}

      {canWrite && (
        <div className="flex items-center justify-end">
          <button type="submit"
                  className="ts-focus rounded-md px-4 py-2 text-[12px] font-semibold"
                  style={{ background: "var(--accent-primary)", color: "var(--accent-fg)" }}>
            Save
          </button>
        </div>
      )}
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
      {help && <span className="text-[11px]" style={{ color: "var(--text-faint)" }}>{help}</span>}
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
