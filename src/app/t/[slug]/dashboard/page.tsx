import Link from "next/link";
import { db } from "@/lib/db";
import { auth } from "@/auth";
import { requireTenant } from "@/lib/tenant";
import { listActiveLocations } from "@/lib/locations";
import { loadActivationReport } from "@/lib/activation";
import { loadAttention, totalAttentionCount } from "@/lib/attention";
import { loadRecentActivity } from "@/lib/activity";
import {
  dashboardPersona,
  PERSONA_LABEL,
  PERSONA_SUBTITLE,
  type DashboardPersona,
} from "@/lib/dashboard-persona";
import { PERSONA_CONFIG } from "@/lib/dashboard-config";
import {
  loadExecutiveData,
  loadSalesData,
  loadCsrData,
  loadDesignerData,
  loadProductionData,
  loadInstallerData,
  loadFinanceData,
  loadEmployeeData,
  type LoaderCtx,
} from "@/lib/dashboard-data";
import { loadHeroMetrics } from "@/lib/dashboard-hero";
import { ActivationWidget } from "@/components/dashboard/ActivationWidget";
import { AttentionPanel } from "@/components/dashboard/AttentionPanel";
import { ActivityFeed } from "@/components/dashboard/ActivityFeed";
import { QuickActions } from "@/components/dashboard/QuickActions";
import { EmptyStateCard } from "@/components/dashboard/EmptyStateCard";
import { BenchmarkBadge } from "@/components/dashboard/BenchmarkBadge";
import { loadTenantBenchmarks } from "@/server/tenant/benchmarks";
import { DashboardShell } from "@/components/dashboard/DashboardShell";
import { HeroBand } from "@/components/dashboard/HeroBand";
import { ExecutiveView } from "@/components/dashboard/views/ExecutiveView";
import { SalesView } from "@/components/dashboard/views/SalesView";
import { CsrView } from "@/components/dashboard/views/CsrView";
import { DesignerView } from "@/components/dashboard/views/DesignerView";
import { ProductionView } from "@/components/dashboard/views/ProductionView";
import { InstallerView } from "@/components/dashboard/views/InstallerView";
import { FinanceView } from "@/components/dashboard/views/FinanceView";
import { EmployeeView } from "@/components/dashboard/views/EmployeeView";

// Phase 2 (transformation) — story-first dashboard.
//
// We use a persona-constant `DashboardShell` that renders every role's
// dashboard in the same top-to-bottom order:
//
//   greeting → activation → hero band → attention → persona view
//   → activity feed → trial banner
//
// The hero band is the cross-persona executive summary (Revenue L30,
// Pipeline, Open A/R, Next-7d cash). It's loaded shop-wide by
// `loadHeroMetrics` and shown to every role that has financial
// visibility. Front-line roles (installer, employee) skip the hero band
// — they shouldn't see shop-wide cash figures they don't need.
//
// Persona-keyed concerns still live in three places:
//   src/lib/dashboard-persona.ts  — role → persona mapping + labels
//   src/lib/dashboard-config.ts   — attention kinds, quick actions,
//                                   empty-state copy per persona
//   src/lib/dashboard-data.ts     — one loader per persona
//   src/components/dashboard/views/ — one KPI-grid component per persona
//
// See docs/transformation-plan.md §Phase 2 for the rationale (Stripe-
// class summary + one frame for all personas, only widget content
// swaps).

/**
 * Personas that should see the $-denominated hero band.
 *
 * Executives, sales, CSR, designer, production, and finance personas
 * all benefit from shop-wide revenue / A/R / cash context when they
 * plan their day. Installers and front-line employees are scoped to
 * their own assigned work and don't need collections data — hiding the
 * band for them avoids leaking financial detail onto a shared screen.
 */
function personaSeesHero(persona: DashboardPersona): boolean {
  return persona !== "installer" && persona !== "employee";
}

export default async function DashboardPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ branch?: string }>;
}) {
  const { slug } = await params;
  const sp = await searchParams;
  const ctx = await requireTenant(slug);
  const { tenant, role, userId, branchScope } = ctx;

  const persona = dashboardPersona(role);
  const config = PERSONA_CONFIG[persona];

  // Pull the user's first name for a warmer greeting. Cheap and safe —
  // we fall back to their email handle when the name field is empty.
  const sessionPeek = await auth();
  const userRow = await db.user.findUnique({
    where: { id: userId },
    select: { name: true, email: true },
  });
  const rawName = userRow?.name?.trim() || sessionPeek?.user?.name?.trim() || "";
  const firstName = deriveFirstName(rawName, userRow?.email ?? sessionPeek?.user?.email ?? "");

  const branches = await listActiveLocations(tenant.id);
  const branchChoices =
    branchScope === null ? branches : branches.filter((b) => branchScope.includes(b.id));
  const branchFilter =
    sp.branch && branchChoices.some((b) => b.id === sp.branch) ? sp.branch : null;

  const loaderCtx: LoaderCtx = {
    tenantId: tenant.id,
    userId,
    branchScope,
    branchFilter,
  };

  // Attention feed is filtered to the caller for owner-y personas that
  // already see the whole shop in other widgets; persona views get only
  // "my stuff" so reps don't drown in team noise.
  const attentionFilter: { userId?: string; branchScope?: string[] | null } =
    persona === "executive" || persona === "production" || persona === "finance"
      ? { branchScope }
      : { userId, branchScope };

  // Fan-out: hero (shop-wide financial summary, only for personas that
  // see it), per-persona data, attention feed, recent activity.
  const showHero = personaSeesHero(persona);
  const [heroMetrics, personaData, attention, activity, benchmarks] = await Promise.all([
    showHero ? loadHeroMetrics(loaderCtx) : Promise.resolve(null),
    loadPersonaData(persona, loaderCtx),
    loadAttention(tenant.id, attentionFilter),
    loadRecentActivity(tenant.id, { limit: 8 }),
    // Industry benchmarks — only relevant for personas that own the
    // shop-wide P&L view; sales/csr/installer dashboards don't show it.
    (persona === "executive" || persona === "production" || persona === "finance")
      ? loadTenantBenchmarks(tenant.id)
      : Promise.resolve({ rows: [], anyPublished: false }),
  ]);

  // Activation widget — still Owner/Admin-only. Hidden once the shop
  // hits "established" (score >= 85) so it doesn't clutter a mature
  // workspace.
  const canSeeActivation = role === "OWNER" || role === "ADMIN";
  const activation = canSeeActivation ? await loadActivationReport(tenant, role) : null;
  const showActivation = activation && activation.tier !== "established";

  const trialDaysLeft = tenant.trialEndsAt
    ? Math.max(0, Math.ceil((tenant.trialEndsAt.getTime() - Date.now()) / 86_400_000))
    : null;

  // "First-run" signal: no activity, no attention items. Swap the KPI
  // grid for a teaching empty state; keep the shell frame so the page
  // never feels broken.
  const isFirstRun = activity.length === 0 && totalAttentionCount(attention) === 0;
  const attentionTitle =
    persona === "executive" || persona === "production" || persona === "finance"
      ? "Needs attention"
      : "Needs your attention";

  return (
    <DashboardShell
      greeting={
        <DashboardHeader
          tenantName={tenant.name}
          firstName={firstName}
          persona={persona}
          role={role}
          branches={branchChoices}
          branchFilter={branchFilter}
          branchScoped={!branchFilter && branchScope !== null && branchScope.length > 0}
        />
      }
      activation={
        showActivation && activation ? (
          <ActivationWidget slug={slug} report={activation} />
        ) : undefined
      }
      hero={
        showHero && heroMetrics ? (
          <HeroBand slug={slug} currency={tenant.currency} metrics={heroMetrics} />
        ) : undefined
      }
      attention={
        // Promoted above the fold — story-first. We cap per-kind at 3 in
        // the hero slot to stay compact; the "View all →" link on the
        // panel routes to the full inbox-attention view.
        <AttentionPanel
          slug={slug}
          groups={attention}
          kinds={config.attentionKinds}
          perKindLimit={3}
          title={attentionTitle}
        />
      }
      activity={!isFirstRun ? <ActivityFeed slug={slug} items={activity} /> : undefined}
      footer={
        tenant.status === "TRIAL" && trialDaysLeft !== null ? (
          <TrialBanner daysLeft={trialDaysLeft} slug={slug} />
        ) : undefined
      }
    >
      <QuickActions actions={config.quickActions(slug)} />

      {isFirstRun ? (
        <EmptyStateCard
          icon={config.emptyState.icon}
          title={config.emptyState.title}
          body={config.emptyState.body}
          primary={{
            label: config.emptyState.primary.label,
            href: config.emptyState.primary.href(slug),
          }}
          secondary={
            config.emptyState.secondary
              ? {
                  label: config.emptyState.secondary.label,
                  href: config.emptyState.secondary.href(slug),
                }
              : undefined
          }
        />
      ) : (
        <>
          <PersonaView
            persona={persona}
            slug={slug}
            currency={tenant.currency}
            data={personaData}
          />
          {benchmarks.rows.length > 0 && <BenchmarkBadge rows={benchmarks.rows} />}
        </>
      )}
    </DashboardShell>
  );
}

// ────────────────────────────────────────────────────────────
// Persona dispatch.
// ────────────────────────────────────────────────────────────

type PersonaData =
  | { persona: "executive";  data: Awaited<ReturnType<typeof loadExecutiveData>> }
  | { persona: "sales";      data: Awaited<ReturnType<typeof loadSalesData>> }
  | { persona: "csr";        data: Awaited<ReturnType<typeof loadCsrData>> }
  | { persona: "designer";   data: Awaited<ReturnType<typeof loadDesignerData>> }
  | { persona: "production"; data: Awaited<ReturnType<typeof loadProductionData>> }
  | { persona: "installer";  data: Awaited<ReturnType<typeof loadInstallerData>> }
  | { persona: "finance";    data: Awaited<ReturnType<typeof loadFinanceData>> }
  | { persona: "employee";   data: Awaited<ReturnType<typeof loadEmployeeData>> };

async function loadPersonaData(persona: DashboardPersona, ctx: LoaderCtx): Promise<PersonaData> {
  switch (persona) {
    case "executive":  return { persona, data: await loadExecutiveData(ctx) };
    case "sales":      return { persona, data: await loadSalesData(ctx) };
    case "csr":        return { persona, data: await loadCsrData(ctx) };
    case "designer":   return { persona, data: await loadDesignerData(ctx) };
    case "production": return { persona, data: await loadProductionData(ctx) };
    case "installer":  return { persona, data: await loadInstallerData(ctx) };
    case "finance":    return { persona, data: await loadFinanceData(ctx) };
    case "employee":   return { persona, data: await loadEmployeeData(ctx) };
  }
}

function PersonaView({
  persona,
  slug,
  currency,
  data,
}: {
  persona: DashboardPersona;
  slug: string;
  currency: string;
  data: PersonaData;
}) {
  // We dispatch on `data.persona` (not the outer `persona`) so TS narrows
  // the payload shape for us at each branch.
  switch (data.persona) {
    case "executive":  return <ExecutiveView  slug={slug} currency={currency} data={data.data} />;
    case "sales":      return <SalesView      slug={slug} currency={currency} data={data.data} />;
    case "csr":        return <CsrView        slug={slug} data={data.data} />;
    case "designer":   return <DesignerView   slug={slug} data={data.data} />;
    case "production": return <ProductionView slug={slug} data={data.data} />;
    case "installer":  return <InstallerView  slug={slug} data={data.data} />;
    case "finance":    return <FinanceView    slug={slug} currency={currency} data={data.data} />;
    case "employee":   return <EmployeeView   slug={slug} data={data.data} />;
  }
}

// ────────────────────────────────────────────────────────────
// Header.
// ────────────────────────────────────────────────────────────

function DashboardHeader({
  tenantName,
  firstName,
  persona,
  role,
  branches,
  branchFilter,
  branchScoped,
}: {
  tenantName: string;
  firstName: string;
  persona: DashboardPersona;
  role: string;
  branches: { id: string; name: string }[];
  branchFilter: string | null;
  branchScoped: boolean;
}) {
  const roleLabel = role.replace(/_/g, " ").toLowerCase();
  const scopeLabel = branchFilter
    ? `viewing ${branches.find((b) => b.id === branchFilter)?.name ?? "branch"}`
    : branchScoped
      ? "scoped to your branches"
      : null;
  const today = formatLongDate(new Date());

  return (
    <header
      className="relative overflow-hidden rounded-2xl"
      style={{
        padding: "22px 24px",
        background:
          "radial-gradient(880px circle at -10% -40%, var(--accent-surface), transparent 55%), " +
          "linear-gradient(180deg, color-mix(in oklab, var(--surface-1) 92%, white 8%) 0%, var(--surface-1) 100%)",
        border: "1px solid var(--border-subtle)",
        boxShadow:
          "inset 0 1px 0 0 color-mix(in oklab, white 4%, transparent), " +
          "0 1px 2px 0 rgba(0,0,0,0.18)",
      }}
    >
      <div className="flex flex-wrap items-start justify-between gap-5">
        <div className="min-w-0 flex-1">
          {/* Persona overline + workspace name chip on one line. */}
          <div className="flex flex-wrap items-center gap-2">
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                color: "var(--accent-primary)",
                background: "var(--accent-surface)",
                border:
                  "1px solid color-mix(in oklab, var(--accent-primary) 22%, transparent)",
                fontSize: 10,
                fontWeight: 700,
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                padding: "3px 8px",
                borderRadius: 999,
                lineHeight: 1,
              }}
            >
              <span
                aria-hidden
                style={{
                  width: 5,
                  height: 5,
                  borderRadius: 999,
                  background: "var(--accent-primary)",
                  boxShadow:
                    "0 0 0 2px color-mix(in oklab, var(--accent-primary) 22%, transparent)",
                }}
              />
              {PERSONA_LABEL[persona]}
            </span>
            <span
              style={{
                color: "var(--text-faint)",
                fontSize: 12,
                lineHeight: 1,
              }}
            >
              {tenantName}
            </span>
          </div>

          {/* Greeting — large, tracking-tight, signature line of the page. */}
          <h1
            className="mt-3 font-semibold"
            style={{
              color: "var(--text-default)",
              fontSize: 30,
              letterSpacing: "-0.022em",
              lineHeight: 1.15,
            }}
          >
            Welcome{firstName ? `, ${firstName}` : ""}.
          </h1>

          <p
            className="mt-1.5"
            style={{
              color: "var(--text-muted)",
              fontSize: 13.5,
              lineHeight: 1.45,
            }}
          >
            <span style={{ color: "var(--text-default)", fontWeight: 500 }}>
              {today}
            </span>
            <span style={{ color: "var(--text-faint)" }}> · </span>
            <span>{PERSONA_SUBTITLE[persona]}</span>
            <span style={{ color: "var(--text-faint)" }}>
              {" · "}
              {roleLabel}
              {scopeLabel ? ` · ${scopeLabel}` : ""}
            </span>
          </p>
        </div>

        {branches.length > 1 && (
          <form className="flex items-center gap-2" method="get">
            <span
              style={{
                fontSize: 11,
                fontWeight: 600,
                color: "var(--text-muted)",
                textTransform: "uppercase",
                letterSpacing: "0.06em",
              }}
            >
              Branch
            </span>
            <select
              name="branch"
              defaultValue={branchFilter ?? ""}
              className="ts-focus rounded-lg outline-none"
              style={{
                background: "var(--surface-2)",
                border: "1px solid var(--border-subtle)",
                color: "var(--text-default)",
                fontSize: 12.5,
                fontWeight: 500,
                padding: "6px 10px",
                height: 32,
              }}
            >
              <option value="">All branches</option>
              {branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
            <button
              type="submit"
              className="ts-focus inline-flex h-8 items-center rounded-lg font-semibold transition-transform"
              style={{
                background:
                  "linear-gradient(180deg, color-mix(in oklab, var(--accent-primary) 96%, white 4%) 0%, var(--accent-primary) 100%)",
                color: "var(--accent-fg)",
                border:
                  "1px solid color-mix(in oklab, var(--accent-primary) 80%, black 20%)",
                boxShadow:
                  "0 1px 0 0 rgba(255,255,255,0.15) inset, " +
                  "0 1px 2px 0 rgba(0,0,0,0.35)",
                padding: "0 12px",
                fontSize: 12.5,
                letterSpacing: "-0.005em",
              }}
            >
              Filter
            </button>
          </form>
        )}
      </div>
    </header>
  );
}

/** First name from a "Sarah Johnson" style display name. Falls back to
 *  the email handle's capitalized form when the name field is empty. */
function deriveFirstName(name: string, email: string): string {
  const trimmed = name.trim();
  if (trimmed) {
    const first = trimmed.split(/\s+/)[0]!;
    return first.length > 18 ? first.slice(0, 18) : first;
  }
  const handle = email.split("@")[0] ?? "";
  if (!handle) return "";
  // "sarah.johnson" → "Sarah"; "sj42" → "Sj42"
  const stem = handle.split(/[._-]/)[0] ?? handle;
  return stem.charAt(0).toUpperCase() + stem.slice(1);
}

/** "Wednesday, May 15" — server-rendered, server timezone. We avoid
 *  including a time-of-day so we don't lie about the user's clock. */
function formatLongDate(d: Date): string {
  try {
    return new Intl.DateTimeFormat("en-US", {
      weekday: "long",
      month: "long",
      day: "numeric",
    }).format(d);
  } catch {
    return d.toDateString();
  }
}

// ────────────────────────────────────────────────────────────
// Trial banner (unchanged from Phase 18 Slice D).
// ────────────────────────────────────────────────────────────

function TrialBanner({ daysLeft, slug }: { daysLeft: number; slug: string }) {
  const tight = daysLeft <= 3;
  const accent = tight ? "var(--danger-fg, var(--rose-500))" : "var(--accent-primary)";
  return (
    <div
      className="relative flex flex-wrap items-center justify-between gap-3 overflow-hidden rounded-xl px-4 py-3.5"
      style={{
        background: tight
          ? "radial-gradient(540px circle at 0% 0%, color-mix(in oklab, var(--rose-500) 14%, transparent), transparent 55%), color-mix(in oklab, var(--surface-1) 80%, transparent)"
          : "radial-gradient(540px circle at 0% 0%, var(--accent-surface), transparent 55%), color-mix(in oklab, var(--surface-1) 80%, transparent)",
        border: `1px solid ${tight ? "color-mix(in oklab, var(--rose-500) 35%, transparent)" : "color-mix(in oklab, var(--accent-primary) 28%, transparent)"}`,
        color: "var(--text-default)",
        boxShadow: "inset 0 1px 0 0 color-mix(in oklab, white 4%, transparent)",
      }}
    >
      {/* Left content with icon. */}
      <div className="flex min-w-0 items-center gap-3">
        <span
          aria-hidden
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            width: 32,
            height: 32,
            borderRadius: 9,
            background: tight
              ? "color-mix(in oklab, var(--rose-500) 22%, transparent)"
              : "var(--accent-surface)",
            color: accent,
            border: `1px solid color-mix(in oklab, ${accent} 30%, transparent)`,
            fontSize: 14,
            fontWeight: 700,
          }}
        >
          {tight ? "!" : "★"}
        </span>
        <div className="min-w-0">
          <div
            style={{
              fontSize: 13,
              fontWeight: 600,
              letterSpacing: "-0.005em",
              color: "var(--text-default)",
              lineHeight: 1.3,
            }}
          >
            You&apos;re on a free trial.{" "}
            <span style={{ color: accent }}>
              {daysLeft} {daysLeft === 1 ? "day" : "days"} remaining
            </span>
            .
          </div>
          <div
            style={{
              fontSize: 11.5,
              color: "var(--text-muted)",
              marginTop: 2,
              lineHeight: 1.4,
            }}
          >
            {tight
              ? "Your workspace pauses at the end of the trial. Upgrade to keep all your data."
              : "Add a payment method any time to keep your workspace running without interruption."}
          </div>
        </div>
      </div>
      <Link
        href={`/t/${slug}/settings/billing`}
        className="ts-focus inline-flex h-9 shrink-0 items-center rounded-lg font-semibold transition-transform"
        style={{
          background: tight
            ? "linear-gradient(180deg, color-mix(in oklab, var(--rose-500) 96%, white 4%) 0%, var(--rose-500) 100%)"
            : "linear-gradient(180deg, color-mix(in oklab, var(--accent-primary) 96%, white 4%) 0%, var(--accent-primary) 100%)",
          color: "var(--accent-fg)",
          border: `1px solid color-mix(in oklab, ${accent} 80%, black 20%)`,
          boxShadow:
            "0 1px 0 0 rgba(255,255,255,0.15) inset, " +
            "0 1px 2px 0 rgba(0,0,0,0.35)",
          padding: "0 14px",
          fontSize: 12.5,
          letterSpacing: "-0.005em",
        }}
      >
        Upgrade now →
      </Link>
    </div>
  );
}
