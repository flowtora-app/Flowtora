// Page 48 — Marketplace app detail (/[slug]).
//
// 11 tabs: Submission · Permissions Requested · Listing · Versions ·
//          Adoption · Reviews · Revenue Share · Compliance ·
//          Risk Score · Audit Log · Danger Zone.

import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requirePlatformStaff } from "@/lib/platform";
import {
  loadAppDetail,
  loadCategories,
  STAGE_LABELS,
  TIER_LABELS,
  TIER_DEVELOPER_PCT,
  PRICING_LABELS,
  type AppDetailView,
  type CategoryRow,
} from "@/server/platform/marketplace";
import {
  saveAppListing,
  transitionSubmission,
  addAppPermission,
  removeAppPermission,
  createAppVersion,
  setCurrentVersion,
  hideReview,
  publishReview,
  replyToReview,
  banReviewer,
  setAppRevenueTier,
  suspendApp,
  unsuspendApp,
  forceUninstallAll,
} from "@/app/actions/platform-marketplace";
import type {
  MarketplaceRiskLevel,
  MarketplacePricingModel,
  MarketplaceRevenueShareTier,
  MarketplaceSubmissionStage,
} from "@prisma/client";
import {
  StatusPill, RiskPill, ReviewStatusPill, StagePill, Stars,
  FormError, FormOk, Field, relativeFromNow, dollars, pricingLabel, tierLabel, Logo,
} from "../_shared";

export const dynamic = "force-dynamic";

const TABS = [
  "submission", "permissions", "listing", "versions", "adoption",
  "reviews", "revenue", "compliance", "risk", "audit", "danger",
] as const;
type Tab = typeof TABS[number];

type SP = Record<string, string | string[] | undefined>;
const asString = (v: string | string[] | undefined): string | undefined =>
  typeof v === "string" && v.length > 0 ? v : undefined;

const STAGES: MarketplaceSubmissionStage[] = [
  "SUBMITTED", "AUTOMATED_CHECKS", "SECURITY_REVIEW", "LISTING_REVIEW", "APPROVED", "REJECTED",
];
const RISK: MarketplaceRiskLevel[] = ["LOW", "MEDIUM", "HIGH", "CRITICAL"];
const PRICING: MarketplacePricingModel[] = ["FREE", "ONE_TIME", "SUBSCRIPTION", "USAGE"];
const TIERS: MarketplaceRevenueShareTier[] = ["STANDARD", "PREFERRED", "PARTNER"];

export default async function AppDetailPage({
  params, searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<SP>;
}) {
  const ctx = await requirePlatformStaff();
  const { slug } = await params;
  const sp = await searchParams;
  const ok = asString(sp.ok);
  const error = asString(sp.error);
  const canWrite = ctx.can("marketplace.manage");
  const tabRaw = asString(sp.tab) as Tab | undefined;
  const tab: Tab = tabRaw && (TABS as readonly string[]).includes(tabRaw) ? tabRaw : "submission";

  const [detail, categories] = await Promise.all([
    loadAppDetail(slug),
    loadCategories(),
  ]);
  if (!detail) notFound();
  const a = detail.app;

  return (
    <div className="space-y-5">
      <Breadcrumbs name={a.name} />
      {ok && <FormOk msg={ok} />}
      {error && <FormError msg={error} />}

      <Header detail={detail} />

      <KpiBar detail={detail} />

      <TabsBar active={tab} pendingReviews={detail.reviews.filter((r) => r.status === "FLAGGED").length} />

      {tab === "submission" && (
        <SubmissionTab detail={detail} canWrite={canWrite} />
      )}
      {tab === "permissions" && (
        <PermissionsTab detail={detail} canWrite={canWrite} />
      )}
      {tab === "listing" && (
        <ListingTab detail={detail} categories={categories} canWrite={canWrite} />
      )}
      {tab === "versions" && (
        <VersionsTab detail={detail} canWrite={canWrite} />
      )}
      {tab === "adoption" && (
        <AdoptionTab detail={detail} />
      )}
      {tab === "reviews" && (
        <ReviewsAppTab detail={detail} canWrite={canWrite} />
      )}
      {tab === "revenue" && (
        <RevenueAppTab detail={detail} canWrite={canWrite} />
      )}
      {tab === "compliance" && (
        <ComplianceTab detail={detail} />
      )}
      {tab === "risk" && (
        <RiskTab detail={detail} />
      )}
      {tab === "audit" && (
        <AuditTab detail={detail} />
      )}
      {tab === "danger" && (
        <DangerZone detail={detail} canWrite={canWrite} />
      )}
    </div>
  );
}

function Breadcrumbs({ name }: { name: string }) {
  return (
    <nav className="text-[11px]" aria-label="Breadcrumbs">
      <Link href="/platform/integrations" className="ts-focus underline" style={{ color: "var(--text-muted)" }}>
        Integrations Catalog
      </Link>
      <span className="mx-1.5" style={{ color: "var(--text-faint)" }}>/</span>
      <Link href="/platform/integrations/marketplace" className="ts-focus underline" style={{ color: "var(--text-muted)" }}>
        Marketplace
      </Link>
      <span className="mx-1.5" style={{ color: "var(--text-faint)" }}>/</span>
      <span style={{ color: "var(--text-default)" }}>{name}</span>
    </nav>
  );
}

function Header({ detail }: { detail: AppDetailView }) {
  const a = detail.app;
  return (
    <header className="flex flex-wrap items-start gap-3">
      <Logo url={a.iconUrl} name={a.name} size={56} />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-[22px] font-semibold leading-tight" style={{ color: "var(--text-default)" }}>
            {a.name}
          </h1>
          <StatusPill status={a.status} />
          <RiskPill level={a.riskLevel} />
          {a.featured && (
            <span className="rounded-full px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
                  style={{ background: "var(--accent-surface)", color: "var(--accent-primary)" }}>
              featured
            </span>
          )}
        </div>
        <p className="mt-1 max-w-3xl text-[12px]" style={{ color: "var(--text-muted)" }}>
          {a.tagline}
        </p>
        <p className="mt-1 text-[11px]" style={{ color: "var(--text-muted)" }}>
          {a.developerName} · {a.developerEmail} · slug <code>{a.slug}</code>
          {a.currentVersion ? ` · v${a.currentVersion}` : ""}
        </p>
        {a.suspendedAt && (
          <p className="mt-1 rounded-md border-l-2 px-2 py-1 text-[11px]"
             style={{ borderColor: "var(--rose-200)", background: "var(--rose-50, var(--surface-2))", color: "var(--danger-fg)" }}>
            ⚠ Suspended {relativeFromNow(a.suspendedAt)}{a.suspendedReason ? ` — ${a.suspendedReason}` : ""}
          </p>
        )}
      </div>
    </header>
  );
}

function KpiBar({ detail }: { detail: AppDetailView }) {
  const a = detail.app;
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
      <Kpi label="Installs · active" value={detail.installationTotal.toLocaleString()}
           sub={`${a.installCount} all-time`} />
      <Kpi label="Rating" value={a.ratingAverage == null ? "—" : a.ratingAverage.toFixed(2)}
           sub={a.ratingCount > 0 ? `${a.ratingCount} reviews` : "no reviews yet"} />
      <Kpi label="MRR contribution" value={dollars(a.mrrContributionCents)} />
      <Kpi label="Risk score" value={String(a.riskScore)}
           tone={a.riskLevel === "CRITICAL" ? "danger" : a.riskLevel === "HIGH" ? "warning" : "default"} />
      <Kpi label="Pricing" value={pricingLabel(a.pricingModel)} />
      <Kpi label="Tier" value={tierLabel(a.revenueShareTier)} />
    </div>
  );
}

function Kpi({
  label, value, sub, tone,
}: { label: string; value: string; sub?: string; tone?: "default" | "good" | "warning" | "danger" }) {
  const palette =
    tone === "good"    ? { borderColor: "var(--emerald-200)" } :
    tone === "warning" ? { borderColor: "var(--amber-200)" } :
    tone === "danger"  ? { borderColor: "var(--rose-200)" } :
                          undefined;
  return (
    <div className="rounded-lg border px-4 py-3"
         style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)", ...(palette ?? {}) }}>
      <div className="text-[11px] font-medium uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>{label}</div>
      <div className="mt-1 text-[18px] font-semibold leading-none tabular-nums"
           style={{ color: "var(--text-default)" }}>{value}</div>
      {sub && <div className="mt-1 text-[11px]" style={{ color: "var(--text-muted)" }}>{sub}</div>}
    </div>
  );
}

function TabsBar({ active, pendingReviews }: { active: Tab; pendingReviews: number }) {
  const labels: Record<Tab, string> = {
    submission:  "Submission",
    permissions: "Permissions",
    listing:     "Listing",
    versions:    "Versions",
    adoption:    "Adoption",
    reviews:     "Reviews",
    revenue:     "Revenue Share",
    compliance:  "Compliance",
    risk:        "Risk Score",
    audit:       "Audit Log",
    danger:      "Danger Zone",
  };
  return (
    <nav className="flex flex-wrap items-center gap-1 border-b" style={{ borderColor: "var(--border-subtle)" }}>
      {TABS.map((t) => {
        const isActive = t === active;
        return (
          <Link key={t} href={`?tab=${t}`} scroll={false}
                className="ts-focus inline-flex items-center gap-1.5 px-3 py-2 text-[12px] font-medium"
                style={{
                  color: isActive ? "var(--text-default)" : (t === "danger" ? "var(--danger-fg)" : "var(--text-muted)"),
                  borderBottom: isActive ? "2px solid var(--accent-primary)" : "2px solid transparent",
                  marginBottom: "-1px",
                }}>
            {labels[t]}
            {t === "reviews" && pendingReviews > 0 && (
              <span className="rounded-full px-1.5 py-0.5 text-[10px] font-semibold"
                    style={{ background: "var(--warning-surface)", color: "var(--warning-fg)" }}>
                {pendingReviews}
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}

/* ── Submission tab ─────────────────────────── */

function SubmissionTab({ detail, canWrite }: { detail: AppDetailView; canWrite: boolean }) {
  const a = detail.app;
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
      <div className="lg:col-span-2 space-y-4">
        <Card title="Submission timeline">
          {detail.submissions.length === 0 ? (
            <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>
              No submission history yet.
            </p>
          ) : (
            <ol className="space-y-2">
              {detail.submissions.map((s) => (
                <li key={s.id} className="rounded-md border p-3 space-y-1"
                    style={{ borderColor: "var(--border-subtle)", background: "var(--surface-2)" }}>
                  <div className="flex flex-wrap items-center gap-2">
                    <StagePill stage={s.stage} />
                    <span className="text-[11px]" style={{ color: "var(--text-muted)" }}>
                      entered {relativeFromNow(s.enteredAt)}
                      {s.exitedAt ? ` · exited ${relativeFromNow(s.exitedAt)}` : ""}
                    </span>
                    {s.assigneeName && (
                      <span className="text-[11px]" style={{ color: "var(--text-muted)" }}>
                        · {s.assigneeName}
                      </span>
                    )}
                    {s.overdue && (
                      <span className="ml-auto rounded-full px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
                            style={{ background: "var(--rose-50, var(--surface-2))", color: "var(--danger-fg)" }}>
                        overdue
                      </span>
                    )}
                    {s.slaDeadlineAt && !s.exitedAt && !s.overdue && (
                      <span className="ml-auto text-[10px]" style={{ color: "var(--text-muted)" }}>
                        SLA · due {relativeFromNow(s.slaDeadlineAt)}
                      </span>
                    )}
                  </div>
                  {s.comments && (
                    <p className="text-[11px]" style={{ color: "var(--text-default)" }}>{s.comments}</p>
                  )}
                  {s.checklist.length > 0 && (
                    <ul className="space-y-0.5">
                      {s.checklist.map((c, idx) => (
                        <li key={idx} className="text-[11px]"
                            style={{ color: c.checked ? "var(--text-default)" : "var(--text-muted)" }}>
                          {c.checked ? "✓" : "○"} {c.label}
                          {c.note && <span className="ml-2" style={{ color: "var(--text-muted)" }}>· {c.note}</span>}
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              ))}
            </ol>
          )}
        </Card>

        <Card title="manifest.json">
          <pre className="rounded-md border p-2 text-[11px] font-mono whitespace-pre-wrap overflow-x-auto"
               style={{ borderColor: "var(--border-subtle)", background: "var(--surface-2)", color: "var(--text-default)" }}>
            {JSON.stringify(a.manifestJson, null, 2)}
          </pre>
        </Card>

        <Card title="Security checklist">
          {Object.keys(a.securityChecklist).length === 0 ? (
            <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>No checklist items recorded.</p>
          ) : (
            <ul className="space-y-0.5 text-[12px]">
              {Object.entries(a.securityChecklist).map(([k, v]) => (
                <li key={k} style={{ color: v ? "var(--success-fg)" : "var(--text-muted)" }}>
                  {v ? "✓" : "○"} {k}
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <div className="space-y-4">
        <Card title="Advance pipeline">
          {canWrite ? (
            <form action={transitionSubmission} className="space-y-2">
              <input type="hidden" name="id" value={a.id} />
              <Field label="Move to stage">
                <select name="toStage" required defaultValue=""
                        className="ts-focus w-full rounded-md border px-2 py-1 text-[12px]"
                        style={{ borderColor: "var(--border-default)", background: "var(--surface-1)" }}>
                  <option value="" disabled>— Select —</option>
                  {STAGES.map((s) => <option key={s} value={s}>{STAGE_LABELS[s]}</option>)}
                </select>
              </Field>
              <Field label="Comments (optional)">
                <textarea name="comments" rows={3} maxLength={2000}
                          className="ts-focus w-full rounded-md border px-2 py-1 text-[12px]"
                          style={{ borderColor: "var(--border-default)", background: "var(--surface-1)" }} />
              </Field>
              <div className="flex justify-end">
                <button type="submit"
                        className="ts-focus rounded-md px-3 py-1.5 text-[12px] font-medium"
                        style={{ background: "var(--accent-primary)", color: "white" }}>
                  Advance
                </button>
              </div>
            </form>
          ) : (
            <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>
              Read-only access — only marketplace admins can advance the pipeline.
            </p>
          )}
        </Card>

        <Card title="Submission package">
          <dl className="text-[12px] space-y-1">
            {a.repoUrl && <Row label="Repo">{linkOrNone(a.repoUrl)}</Row>}
            {a.supportUrl && <Row label="Support">{linkOrNone(a.supportUrl)}</Row>}
            {a.privacyUrl && <Row label="Privacy">{linkOrNone(a.privacyUrl)}</Row>}
            {a.termsUrl && <Row label="Terms">{linkOrNone(a.termsUrl)}</Row>}
            {a.eulaUrl && <Row label="EULA">{linkOrNone(a.eulaUrl)}</Row>}
            <Row label="Submitted">{relativeFromNow(a.submittedAt)}</Row>
            <Row label="Approved">{relativeFromNow(a.approvedAt)}</Row>
            <Row label="Published">{relativeFromNow(a.publishedAt)}</Row>
          </dl>
        </Card>
      </div>
    </div>
  );
}

function linkOrNone(url: string | null) {
  if (!url) return <span style={{ color: "var(--text-faint)" }}>—</span>;
  return (
    <a href={url} target="_blank" rel="noopener noreferrer"
       className="ts-focus underline truncate inline-block max-w-[260px]"
       style={{ color: "var(--accent-primary)" }}>
      {url}
    </a>
  );
}

/* ── Permissions tab ──────────────────────── */

function PermissionsTab({ detail, canWrite }: { detail: AppDetailView; canWrite: boolean }) {
  return (
    <div className="space-y-3">
      {canWrite && (
        <details className="rounded-lg border p-3"
                 style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)" }}>
          <summary className="cursor-pointer text-[12px] font-semibold" style={{ color: "var(--text-default)" }}>
            + Add OAuth scope
          </summary>
          <form action={addAppPermission} className="mt-2 grid grid-cols-1 gap-2 md:grid-cols-2">
            <input type="hidden" name="appId" value={detail.app.id} />
            <Field label="Scope">
              <input type="text" name="scope" required maxLength={120}
                     placeholder="tenants:read"
                     className="ts-focus w-full rounded-md border px-2 py-1 text-[12px] font-mono"
                     style={{ borderColor: "var(--border-default)", background: "var(--surface-1)" }} />
            </Field>
            <Field label="Risk level">
              <select name="riskLevel" defaultValue="MEDIUM"
                      className="ts-focus w-full rounded-md border px-2 py-1 text-[12px]"
                      style={{ borderColor: "var(--border-default)", background: "var(--surface-1)" }}>
                {RISK.map((r) => <option key={r} value={r}>{r.toLowerCase()}</option>)}
              </select>
            </Field>
            <Field label="Justification (shown to tenants on install)" full>
              <textarea name="justification" required rows={2} maxLength={500}
                        className="ts-focus w-full rounded-md border px-2 py-1 text-[12px]"
                        style={{ borderColor: "var(--border-default)", background: "var(--surface-1)" }} />
            </Field>
            <div className="md:col-span-2 flex justify-end">
              <button type="submit"
                      className="ts-focus rounded-md px-3 py-1.5 text-[12px] font-medium"
                      style={{ background: "var(--accent-primary)", color: "white" }}>
                Add scope
              </button>
            </div>
          </form>
        </details>
      )}

      <Card title={`Required scopes · ${detail.permissions.length}`}>
        {detail.permissions.length === 0 ? (
          <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>
            No scopes declared yet — add the first one above.
          </p>
        ) : (
          <table className="w-full text-[12px]">
            <thead>
              <tr style={{ color: "var(--text-muted)" }}>
                <th className="px-2 py-1.5 text-left text-[10px] font-semibold uppercase tracking-wide">Scope</th>
                <th className="px-2 py-1.5 text-left text-[10px] font-semibold uppercase tracking-wide">Risk</th>
                <th className="px-2 py-1.5 text-left text-[10px] font-semibold uppercase tracking-wide">Justification</th>
                {canWrite && <th className="px-2 py-1.5 text-right text-[10px] font-semibold uppercase tracking-wide">Actions</th>}
              </tr>
            </thead>
            <tbody>
              {detail.permissions.map((p) => (
                <tr key={p.id} className="border-t" style={{ borderColor: "var(--border-subtle)" }}>
                  <td className="px-2 py-1.5 font-mono" style={{ color: "var(--text-default)" }}>{p.scope}</td>
                  <td className="px-2 py-1.5"><RiskPill level={p.riskLevel} /></td>
                  <td className="px-2 py-1.5" style={{ color: "var(--text-default)" }}>{p.justification}</td>
                  {canWrite && (
                    <td className="px-2 py-1.5">
                      <form action={removeAppPermission} className="flex justify-end">
                        <input type="hidden" name="id" value={p.id} />
                        <input type="hidden" name="appId" value={detail.app.id} />
                        <button type="submit"
                                className="ts-focus rounded-md px-2 py-1 text-[10px] font-medium"
                                style={{ background: "var(--rose-50, var(--surface-2))", color: "var(--danger-fg)", border: "1px solid var(--rose-200)" }}>
                          Remove
                        </button>
                      </form>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}

/* ── Listing tab ───────────────────────────── */

function ListingTab({
  detail, categories, canWrite,
}: { detail: AppDetailView; categories: CategoryRow[]; canWrite: boolean }) {
  const a = detail.app;
  return (
    <form action={saveAppListing}
          className="rounded-lg border p-4 space-y-3"
          style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)" }}>
      <fieldset disabled={!canWrite} className="contents">
        <input type="hidden" name="id" value={a.id} />
        <h2 className="text-[12px] font-semibold" style={{ color: "var(--text-default)" }}>
          Public listing
        </h2>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <Field label="Name">
            <input type="text" name="name" required maxLength={120} defaultValue={a.name}
                   className="ts-focus w-full rounded-md border px-2 py-1 text-[12px]"
                   style={{ borderColor: "var(--border-default)", background: "var(--surface-1)" }} />
          </Field>
          <Field label="Slug">
            <input type="text" name="slug" required maxLength={120} pattern="[a-z0-9-]+" defaultValue={a.slug}
                   className="ts-focus w-full rounded-md border px-2 py-1 text-[12px] font-mono"
                   style={{ borderColor: "var(--border-default)", background: "var(--surface-1)" }} />
          </Field>
          <Field label="Tagline (1-line)" full>
            <input type="text" name="tagline" required maxLength={140} defaultValue={a.tagline}
                   className="ts-focus w-full rounded-md border px-2 py-1 text-[12px]"
                   style={{ borderColor: "var(--border-default)", background: "var(--surface-1)" }} />
          </Field>
          <Field label="Long description (MDX)" full>
            <textarea name="description" required rows={8} maxLength={50_000} defaultValue={a.description}
                      className="ts-focus w-full rounded-md border px-2 py-1 text-[12px] font-mono"
                      style={{ borderColor: "var(--border-default)", background: "var(--surface-1)" }} />
          </Field>
          <Field label="Icon URL">
            <input type="url" name="iconUrl" maxLength={500} defaultValue={a.iconUrl ?? ""}
                   className="ts-focus w-full rounded-md border px-2 py-1 text-[12px]"
                   style={{ borderColor: "var(--border-default)", background: "var(--surface-1)" }} />
          </Field>
          <Field label="Video URL">
            <input type="url" name="videoUrl" maxLength={500} defaultValue={a.videoUrl ?? ""}
                   className="ts-focus w-full rounded-md border px-2 py-1 text-[12px]"
                   style={{ borderColor: "var(--border-default)", background: "var(--surface-1)" }} />
          </Field>
          <Field label="Screenshots (one URL per line)" full>
            <textarea name="screenshotsRaw" rows={3} maxLength={5000}
                      defaultValue={a.screenshots.join("\n")}
                      className="ts-focus w-full rounded-md border px-2 py-1 text-[12px] font-mono"
                      style={{ borderColor: "var(--border-default)", background: "var(--surface-1)" }} />
          </Field>
          <Field label="Category">
            <select name="categoryId" required defaultValue={a.categoryId}
                    className="ts-focus w-full rounded-md border px-2 py-1 text-[12px]"
                    style={{ borderColor: "var(--border-default)", background: "var(--surface-1)" }}>
              {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </Field>
          <Field label="Pricing model">
            <select name="pricingModel" defaultValue={a.pricingModel}
                    className="ts-focus w-full rounded-md border px-2 py-1 text-[12px]"
                    style={{ borderColor: "var(--border-default)", background: "var(--surface-1)" }}>
              {PRICING.map((p) => <option key={p} value={p}>{PRICING_LABELS[p]}</option>)}
            </select>
          </Field>
          <Field label="Pricing details (JSON)" full>
            <textarea name="pricingDetailsRaw" rows={3} maxLength={5000}
                      defaultValue={JSON.stringify(a.pricingDetails ?? {}, null, 2)}
                      className="ts-focus w-full rounded-md border px-2 py-1 text-[11px] font-mono"
                      style={{ borderColor: "var(--border-default)", background: "var(--surface-1)" }} />
          </Field>
          <Field label="Developer name">
            <input type="text" name="developerName" required maxLength={120} defaultValue={a.developerName}
                   className="ts-focus w-full rounded-md border px-2 py-1 text-[12px]"
                   style={{ borderColor: "var(--border-default)", background: "var(--surface-1)" }} />
          </Field>
          <Field label="Developer email">
            <input type="email" name="developerEmail" required maxLength={200} defaultValue={a.developerEmail}
                   className="ts-focus w-full rounded-md border px-2 py-1 text-[12px]"
                   style={{ borderColor: "var(--border-default)", background: "var(--surface-1)" }} />
          </Field>
          <Field label="Repo URL">
            <input type="url" name="repoUrl" maxLength={500} defaultValue={a.repoUrl ?? ""}
                   className="ts-focus w-full rounded-md border px-2 py-1 text-[12px]"
                   style={{ borderColor: "var(--border-default)", background: "var(--surface-1)" }} />
          </Field>
          <Field label="Support URL">
            <input type="url" name="supportUrl" maxLength={500} defaultValue={a.supportUrl ?? ""}
                   className="ts-focus w-full rounded-md border px-2 py-1 text-[12px]"
                   style={{ borderColor: "var(--border-default)", background: "var(--surface-1)" }} />
          </Field>
          <Field label="Privacy URL">
            <input type="url" name="privacyUrl" maxLength={500} defaultValue={a.privacyUrl ?? ""}
                   className="ts-focus w-full rounded-md border px-2 py-1 text-[12px]"
                   style={{ borderColor: "var(--border-default)", background: "var(--surface-1)" }} />
          </Field>
          <Field label="Terms URL">
            <input type="url" name="termsUrl" maxLength={500} defaultValue={a.termsUrl ?? ""}
                   className="ts-focus w-full rounded-md border px-2 py-1 text-[12px]"
                   style={{ borderColor: "var(--border-default)", background: "var(--surface-1)" }} />
          </Field>
          <Field label="EULA URL">
            <input type="url" name="eulaUrl" maxLength={500} defaultValue={a.eulaUrl ?? ""}
                   className="ts-focus w-full rounded-md border px-2 py-1 text-[12px]"
                   style={{ borderColor: "var(--border-default)", background: "var(--surface-1)" }} />
          </Field>
          <label className="md:col-span-2 inline-flex items-center gap-2 text-[12px]"
                 style={{ color: "var(--text-default)" }}>
            <input type="checkbox" name="featured" defaultChecked={a.featured} className="ts-focus h-4 w-4" />
            Featured (shown on the Discover row)
          </label>
        </div>
        <div className="flex justify-end">
          <button type="submit"
                  className="ts-focus rounded-md px-3 py-1.5 text-[12px] font-medium"
                  style={{ background: "var(--accent-primary)", color: "white" }}>
            Save listing
          </button>
        </div>
      </fieldset>
    </form>
  );
}

/* ── Versions tab ─────────────────────────── */

function VersionsTab({ detail, canWrite }: { detail: AppDetailView; canWrite: boolean }) {
  return (
    <div className="space-y-3">
      {canWrite && (
        <details className="rounded-lg border p-3"
                 style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)" }}>
          <summary className="cursor-pointer text-[12px] font-semibold" style={{ color: "var(--text-default)" }}>
            + Cut new version
          </summary>
          <form action={createAppVersion} className="mt-2 grid grid-cols-1 gap-2 md:grid-cols-2">
            <input type="hidden" name="appId" value={detail.app.id} />
            <Field label="Version (semver)">
              <input type="text" name="version" required maxLength={50}
                     placeholder="1.4.2"
                     className="ts-focus w-full rounded-md border px-2 py-1 text-[12px] font-mono"
                     style={{ borderColor: "var(--border-default)", background: "var(--surface-1)" }} />
            </Field>
            <label className="inline-flex items-center gap-2 text-[12px]" style={{ color: "var(--text-default)" }}>
              <input type="checkbox" name="isCurrent" className="ts-focus h-4 w-4" />
              Set as current
            </label>
            <Field label="Changelog (markdown)" full>
              <textarea name="changelog" rows={4} maxLength={5000}
                        className="ts-focus w-full rounded-md border px-2 py-1 text-[12px] font-mono"
                        style={{ borderColor: "var(--border-default)", background: "var(--surface-1)" }} />
            </Field>
            <div className="md:col-span-2 flex justify-end">
              <button type="submit"
                      className="ts-focus rounded-md px-3 py-1.5 text-[12px] font-medium"
                      style={{ background: "var(--accent-primary)", color: "white" }}>
                Create version
              </button>
            </div>
          </form>
        </details>
      )}

      <Card title={`Version history · ${detail.versions.length}`}>
        {detail.versions.length === 0 ? (
          <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>No versions yet.</p>
        ) : (
          <table className="w-full text-[12px]">
            <thead>
              <tr style={{ color: "var(--text-muted)" }}>
                <th className="px-2 py-1.5 text-left text-[10px] font-semibold uppercase tracking-wide">Version</th>
                <th className="px-2 py-1.5 text-left text-[10px] font-semibold uppercase tracking-wide">Released</th>
                <th className="px-2 py-1.5 text-left text-[10px] font-semibold uppercase tracking-wide">Changelog</th>
                <th className="px-2 py-1.5 text-right text-[10px] font-semibold uppercase tracking-wide">Installs</th>
                <th className="px-2 py-1.5 text-left text-[10px] font-semibold uppercase tracking-wide">State</th>
                {canWrite && <th className="px-2 py-1.5 text-right text-[10px] font-semibold uppercase tracking-wide">Actions</th>}
              </tr>
            </thead>
            <tbody>
              {detail.versions.map((v) => (
                <tr key={v.id} className="border-t" style={{ borderColor: "var(--border-subtle)" }}>
                  <td className="px-2 py-1.5 font-mono font-semibold" style={{ color: "var(--text-default)" }}>{v.version}</td>
                  <td className="px-2 py-1.5" style={{ color: "var(--text-muted)" }}>{relativeFromNow(v.releasedAt)}</td>
                  <td className="px-2 py-1.5 text-[11px]" style={{ color: "var(--text-default)" }}>
                    {v.changelog ? (v.changelog.length > 80 ? v.changelog.slice(0, 80) + "…" : v.changelog) : "—"}
                  </td>
                  <td className="px-2 py-1.5 text-right tabular-nums" style={{ color: "var(--text-muted)" }}>
                    {v.installCount}
                  </td>
                  <td className="px-2 py-1.5">
                    {v.isCurrent && (
                      <span className="rounded-full px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide"
                            style={{ background: "var(--success-surface)", color: "var(--success-fg)" }}>
                        current
                      </span>
                    )}
                  </td>
                  {canWrite && (
                    <td className="px-2 py-1.5">
                      <div className="flex justify-end">
                        {!v.isCurrent && (
                          <form action={setCurrentVersion}>
                            <input type="hidden" name="versionId" value={v.id} />
                            <input type="hidden" name="appId" value={detail.app.id} />
                            <button type="submit"
                                    className="ts-focus rounded-md px-2 py-1 text-[10px] font-medium"
                                    style={{ background: "var(--surface-2)", color: "var(--text-default)", border: "1px solid var(--border-default)" }}>
                              Set current
                            </button>
                          </form>
                        )}
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}

/* ── Adoption tab ─────────────────────────── */

function AdoptionTab({ detail }: { detail: AppDetailView }) {
  const max = Math.max(1, ...detail.installTrend.map((d) => d.installs + d.uninstalls));
  return (
    <div className="space-y-4">
      <Card title={`Installs / uninstalls · last 30 days`}>
        <div className="flex h-32 items-end gap-[2px]">
          {detail.installTrend.map((d) => (
            <div key={d.date} className="flex flex-1 flex-col-reverse"
                 title={`${d.date}: +${d.installs} / -${d.uninstalls}`}>
              <div className="rounded-t-sm"
                   style={{ background: "var(--success-fg)", height: `${(d.installs / max) * 100}%` }} />
              <div style={{ background: "var(--danger-fg)", height: `${(d.uninstalls / max) * 100}%` }} />
            </div>
          ))}
        </div>
        <div className="mt-2 flex items-center gap-3 text-[10px]" style={{ color: "var(--text-muted)" }}>
          <span><span style={{ background: "var(--success-fg)", display: "inline-block", width: 10, height: 10 }} /> Install</span>
          <span><span style={{ background: "var(--danger-fg)", display: "inline-block", width: 10, height: 10 }} /> Uninstall</span>
        </div>
      </Card>

      <Card title={`Top tenants · ${detail.installations.length}`}>
        {detail.installations.length === 0 ? (
          <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>No installs yet.</p>
        ) : (
          <table className="w-full text-[12px]">
            <thead>
              <tr style={{ color: "var(--text-muted)" }}>
                <th className="px-2 py-1.5 text-left text-[10px] font-semibold uppercase tracking-wide">Tenant</th>
                <th className="px-2 py-1.5 text-left text-[10px] font-semibold uppercase tracking-wide">Version</th>
                <th className="px-2 py-1.5 text-left text-[10px] font-semibold uppercase tracking-wide">Installed</th>
                <th className="px-2 py-1.5 text-left text-[10px] font-semibold uppercase tracking-wide">Last used</th>
                <th className="px-2 py-1.5 text-left text-[10px] font-semibold uppercase tracking-wide">Status</th>
              </tr>
            </thead>
            <tbody>
              {detail.installations.map((i) => (
                <tr key={i.id} className="border-t" style={{ borderColor: "var(--border-subtle)" }}>
                  <td className="px-2 py-1.5">
                    {i.tenantSlug ? (
                      <Link href={`/platform/tenants/${i.tenantSlug}`}
                            className="ts-focus underline" style={{ color: "var(--text-default)" }}>
                        {i.tenantName ?? i.tenantId}
                      </Link>
                    ) : (
                      <span style={{ color: "var(--text-default)" }}>{i.tenantName ?? i.tenantId}</span>
                    )}
                  </td>
                  <td className="px-2 py-1.5 font-mono text-[11px]" style={{ color: "var(--text-muted)" }}>
                    {i.versionInstalled}
                  </td>
                  <td className="px-2 py-1.5" style={{ color: "var(--text-muted)" }}>{relativeFromNow(i.installedAt)}</td>
                  <td className="px-2 py-1.5" style={{ color: "var(--text-muted)" }}>{relativeFromNow(i.lastUsedAt)}</td>
                  <td className="px-2 py-1.5">
                    {i.uninstalledAt ? (
                      <span className="text-[10px]" style={{ color: "var(--text-muted)" }}>
                        uninstalled {relativeFromNow(i.uninstalledAt)}
                      </span>
                    ) : (
                      <span className="rounded-full px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
                            style={{ background: "var(--success-surface)", color: "var(--success-fg)" }}>
                        active
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}

/* ── Reviews tab ──────────────────────────── */

function ReviewsAppTab({ detail, canWrite }: { detail: AppDetailView; canWrite: boolean }) {
  return (
    <div className="space-y-3">
      <Card title={`Reviews · ${detail.reviews.length}`}>
        {detail.reviews.length === 0 ? (
          <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>No reviews yet.</p>
        ) : (
          <ul className="space-y-2">
            {detail.reviews.map((r) => (
              <li key={r.id} className="rounded-md border p-3 space-y-1"
                  style={{ borderColor: "var(--border-subtle)", background: "var(--surface-2)" }}>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[12px] font-semibold" style={{ color: "var(--text-default)" }}>
                    {r.authorName}
                  </span>
                  <Stars rating={r.rating} />
                  <ReviewStatusPill status={r.status} />
                  <span className="ml-auto text-[10px]" style={{ color: "var(--text-muted)" }}>
                    {relativeFromNow(r.createdAt)}
                  </span>
                </div>
                {r.title && <div className="text-[12px] font-semibold" style={{ color: "var(--text-default)" }}>{r.title}</div>}
                <p className="text-[12px]" style={{ color: "var(--text-default)" }}>{r.body}</p>
                {r.flaggedReason && (
                  <p className="rounded-md border-l-2 px-2 py-1 text-[11px]"
                     style={{ borderColor: "var(--rose-200)", background: "var(--rose-50, var(--surface-2))", color: "var(--danger-fg)" }}>
                    ⚠ {r.flaggedReason}
                  </p>
                )}
                {r.reply && (
                  <div className="rounded-md border-l-2 px-2 py-1 text-[11px]"
                       style={{ borderColor: "var(--accent-primary)", background: "var(--accent-surface)", color: "var(--text-default)" }}>
                    Developer reply: {r.reply}
                  </div>
                )}
                {canWrite && (
                  <details>
                    <summary className="cursor-pointer text-[10px]" style={{ color: "var(--accent-primary)" }}>
                      Reply / Moderate
                    </summary>
                    <div className="mt-1 space-y-1">
                      <form action={replyToReview} className="flex items-center gap-1">
                        <input type="hidden" name="id" value={r.id} />
                        <input type="hidden" name="appSlug" value={detail.app.slug} />
                        <input type="text" name="reply" maxLength={2000}
                               defaultValue={r.reply ?? ""}
                               placeholder="Reply on behalf of the developer…"
                               className="ts-focus min-w-[180px] flex-1 rounded-md border px-2 py-1 text-[11px]"
                               style={{ borderColor: "var(--border-default)", background: "var(--surface-1)" }} />
                        <button type="submit"
                                className="ts-focus rounded-md px-2 py-1 text-[10px] font-medium"
                                style={{ background: "var(--accent-primary)", color: "white" }}>
                          Save reply
                        </button>
                      </form>
                      <div className="flex gap-1">
                        {r.status === "PUBLISHED" ? (
                          <form action={hideReview}>
                            <input type="hidden" name="id" value={r.id} />
                            <input type="hidden" name="appSlug" value={detail.app.slug} />
                            <input type="hidden" name="reason" value="Hidden by admin" />
                            <button type="submit"
                                    className="ts-focus rounded-md px-2 py-1 text-[10px] font-medium"
                                    style={{ background: "var(--warning-surface)", color: "var(--warning-fg)", border: "1px solid var(--amber-200)" }}>
                              Hide
                            </button>
                          </form>
                        ) : (
                          <form action={publishReview}>
                            <input type="hidden" name="id" value={r.id} />
                            <input type="hidden" name="appSlug" value={detail.app.slug} />
                            <button type="submit"
                                    className="ts-focus rounded-md px-2 py-1 text-[10px] font-medium"
                                    style={{ background: "var(--success-surface)", color: "var(--success-fg)", border: "1px solid var(--emerald-200)" }}>
                              Publish
                            </button>
                          </form>
                        )}
                        <form action={banReviewer}>
                          <input type="hidden" name="id" value={r.id} />
                          <input type="hidden" name="appSlug" value={detail.app.slug} />
                          <button type="submit"
                                  className="ts-focus rounded-md px-2 py-1 text-[10px] font-medium"
                                  style={{ background: "var(--rose-50, var(--surface-2))", color: "var(--danger-fg)", border: "1px solid var(--rose-200)" }}>
                            Ban reviewer
                          </button>
                        </form>
                      </div>
                    </div>
                  </details>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

/* ── Revenue tab ──────────────────────────── */

function RevenueAppTab({ detail, canWrite }: { detail: AppDetailView; canWrite: boolean }) {
  const a = detail.app;
  const currentPct = TIER_DEVELOPER_PCT[a.revenueShareTier];
  return (
    <div className="space-y-3">
      <Card title="Revenue share">
        <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>
          Developer keeps {currentPct}% of gross revenue. Flowtora keeps {100 - currentPct}%.
        </p>
        {canWrite && (
          <form action={setAppRevenueTier} className="mt-2 flex items-center gap-1">
            <input type="hidden" name="appId" value={a.id} />
            <select name="tier" defaultValue={a.revenueShareTier}
                    className="ts-focus rounded-md border px-2 py-1 text-[12px]"
                    style={{ borderColor: "var(--border-default)", background: "var(--surface-1)" }}>
              {TIERS.map((t) => <option key={t} value={t}>{TIER_LABELS[t]}</option>)}
            </select>
            <button type="submit"
                    className="ts-focus rounded-md px-3 py-1 text-[11px] font-medium"
                    style={{ background: "var(--accent-primary)", color: "white" }}>
              Update tier
            </button>
          </form>
        )}
        <dl className="mt-2 text-[12px] space-y-1">
          <Row label="Payout method">{a.payoutMethod ?? "Not set"}</Row>
          <Row label="Tax / 1099 status">{a.taxStatus ?? "Not on file"}</Row>
        </dl>
      </Card>

      <Card title={`Statements · ${detail.payouts.length}`}>
        {detail.payouts.length === 0 ? (
          <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>No statements yet.</p>
        ) : (
          <table className="w-full text-[12px]">
            <thead>
              <tr style={{ color: "var(--text-muted)" }}>
                <th className="px-2 py-1.5 text-left text-[10px] font-semibold uppercase tracking-wide">Period</th>
                <th className="px-2 py-1.5 text-right text-[10px] font-semibold uppercase tracking-wide">Installs</th>
                <th className="px-2 py-1.5 text-right text-[10px] font-semibold uppercase tracking-wide">Gross</th>
                <th className="px-2 py-1.5 text-right text-[10px] font-semibold uppercase tracking-wide">Platform</th>
                <th className="px-2 py-1.5 text-right text-[10px] font-semibold uppercase tracking-wide">Developer</th>
                <th className="px-2 py-1.5 text-left text-[10px] font-semibold uppercase tracking-wide">Status</th>
              </tr>
            </thead>
            <tbody>
              {detail.payouts.map((p) => (
                <tr key={p.id} className="border-t" style={{ borderColor: "var(--border-subtle)" }}>
                  <td className="px-2 py-1.5 font-mono" style={{ color: "var(--text-default)" }}>{p.period}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums" style={{ color: "var(--text-default)" }}>{p.installs}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums" style={{ color: "var(--text-default)" }}>{dollars(p.grossCents)}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums" style={{ color: "var(--accent-primary)" }}>{dollars(p.flowtoraCutCents)}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums" style={{ color: "var(--success-fg)" }}>{dollars(p.developerCutCents)}</td>
                  <td className="px-2 py-1.5">
                    {p.paid ? (
                      <span className="text-[10px] uppercase font-semibold" style={{ color: "var(--success-fg)" }}>
                        ✓ paid {relativeFromNow(p.paidAt)}
                      </span>
                    ) : (
                      <span className="text-[10px] uppercase font-semibold" style={{ color: "var(--warning-fg)" }}>
                        pending
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}

/* ── Compliance tab ───────────────────────── */

function ComplianceTab({ detail }: { detail: AppDetailView }) {
  const a = detail.app;
  return (
    <div className="space-y-3">
      <Card title="SOC 2 attestation">
        {a.soc2AttestationUrl ? (
          <a href={a.soc2AttestationUrl} target="_blank" rel="noopener noreferrer"
             className="ts-focus underline" style={{ color: "var(--accent-primary)" }}>
            {a.soc2AttestationUrl}
          </a>
        ) : (
          <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>
            No SOC 2 attestation on file. Tenants on Enterprise plans may require this.
          </p>
        )}
      </Card>

      <Card title="Sub-processors">
        {a.subProcessors ? (
          <pre className="whitespace-pre-wrap text-[12px]" style={{ color: "var(--text-default)" }}>
            {a.subProcessors}
          </pre>
        ) : (
          <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>No sub-processor declaration.</p>
        )}
      </Card>

      <Card title="Data residency">
        <p className="text-[12px]" style={{ color: "var(--text-default)" }}>
          {a.dataResidency ?? <span style={{ color: "var(--text-muted)" }}>Not declared.</span>}
        </p>
      </Card>
    </div>
  );
}

/* ── Risk tab ─────────────────────────────── */

function RiskTab({ detail }: { detail: AppDetailView }) {
  const a = detail.app;
  return (
    <div className="space-y-3">
      <Card title="Risk score">
        <div className="flex items-center gap-3">
          <div className="text-[36px] font-semibold tabular-nums" style={{ color: "var(--text-default)" }}>
            {a.riskScore}
          </div>
          <RiskPill level={a.riskLevel} />
        </div>
        <p className="mt-1 text-[11px]" style={{ color: "var(--text-muted)" }}>
          Auto-calculated from declared scopes, code-scan results, and complaint volume.
          Any scope at HIGH or CRITICAL risk pushes the app to at least HIGH.
        </p>
      </Card>

      <Card title="Risk factors">
        {a.riskReasons.length === 0 ? (
          <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>
            No risk factors flagged.
          </p>
        ) : (
          <ul className="space-y-1">
            {a.riskReasons.map((r, i) => (
              <li key={i} className="text-[12px] flex items-start gap-2"
                  style={{ color: "var(--text-default)" }}>
                <span style={{ color: "var(--warning-fg)" }}>⚠</span>
                <span>{r}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card title="Permission risk breakdown">
        {detail.permissions.length === 0 ? (
          <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>No scopes declared.</p>
        ) : (
          <ul className="space-y-1">
            {detail.permissions.map((p) => (
              <li key={p.id} className="flex items-center justify-between text-[12px]">
                <code style={{ color: "var(--text-default)" }}>{p.scope}</code>
                <RiskPill level={p.riskLevel} />
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

/* ── Audit tab ──────────────────────────── */

function AuditTab({ detail }: { detail: AppDetailView }) {
  return (
    <Card title={`Audit log · ${detail.auditLog.length}`}>
      {detail.auditLog.length === 0 ? (
        <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>No audit entries yet.</p>
      ) : (
        <ol className="space-y-1.5">
          {detail.auditLog.map((a) => (
            <li key={a.id} className="text-[11px]">
              <div className="flex items-center justify-between">
                <span className="font-mono" style={{ color: "var(--text-default)" }}>{a.action}</span>
                <span style={{ color: "var(--text-muted)" }}>{relativeFromNow(a.occurredAt)}</span>
              </div>
              {a.detail && <div style={{ color: "var(--text-muted)" }}>{a.detail}</div>}
              {a.authorName && <div style={{ color: "var(--text-muted)" }}>by {a.authorName}</div>}
            </li>
          ))}
        </ol>
      )}
    </Card>
  );
}

/* ── Danger zone ─────────────────────────── */

function DangerZone({ detail, canWrite }: { detail: AppDetailView; canWrite: boolean }) {
  if (!canWrite) {
    return (
      <Card title="Danger zone">
        <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>
          Read-only access — only marketplace admins can run destructive actions.
        </p>
      </Card>
    );
  }
  const a = detail.app;
  return (
    <div className="space-y-3">
      {a.status !== "SUSPENDED" ? (
        <Card title="Suspend app">
          <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>
            Suspends the listing. Existing installs continue working but no new installs are allowed.
          </p>
          <form action={suspendApp} className="mt-2 flex flex-wrap items-end gap-2">
            <input type="hidden" name="id" value={a.id} />
            <Field label="Reason">
              <input type="text" name="reason" required maxLength={500}
                     placeholder="Failing scope justification audit"
                     className="ts-focus min-w-[260px] rounded-md border px-2 py-1 text-[12px]"
                     style={{ borderColor: "var(--border-default)", background: "var(--surface-1)" }} />
            </Field>
            <button type="submit"
                    className="ts-focus rounded-md px-3 py-1.5 text-[12px] font-medium"
                    style={{ background: "var(--warning-fg)", color: "white" }}>
              Suspend
            </button>
          </form>
        </Card>
      ) : (
        <Card title="Reinstate app">
          <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>
            Currently suspended{a.suspendedReason ? ` — ${a.suspendedReason}` : ""}.
          </p>
          <form action={unsuspendApp} className="mt-2">
            <input type="hidden" name="id" value={a.id} />
            <button type="submit"
                    className="ts-focus rounded-md px-3 py-1.5 text-[12px] font-medium"
                    style={{ background: "var(--success-fg)", color: "white" }}>
              Reinstate
            </button>
          </form>
        </Card>
      )}

      <Card title="Force-uninstall from all tenants">
        <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>
          Removes the app from every tenant's workspace immediately. Type the app slug
          (<code>{a.slug}</code>) to confirm.
        </p>
        <form action={forceUninstallAll} className="mt-2 flex flex-wrap items-end gap-2">
          <input type="hidden" name="id" value={a.id} />
          <Field label="Type slug to confirm">
            <input type="text" name="confirm" required maxLength={120}
                   className="ts-focus rounded-md border px-2 py-1 text-[12px] font-mono"
                   style={{ borderColor: "var(--rose-200)", background: "var(--surface-1)" }} />
          </Field>
          <button type="submit"
                  className="ts-focus rounded-md px-3 py-1.5 text-[12px] font-medium"
                  style={{ background: "var(--danger-fg)", color: "white" }}>
            Force uninstall ({detail.installationTotal})
          </button>
        </form>
      </Card>
    </div>
  );
}

/* ── Layout primitives ─────────────────── */

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border p-3 space-y-2"
             style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)" }}>
      <h2 className="text-[12px] font-semibold" style={{ color: "var(--text-default)" }}>{title}</h2>
      {children}
    </section>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2 text-[11px]">
      <dt style={{ color: "var(--text-muted)" }}>{label}</dt>
      <dd className="text-right" style={{ color: "var(--text-default)" }}>{children}</dd>
    </div>
  );
}
