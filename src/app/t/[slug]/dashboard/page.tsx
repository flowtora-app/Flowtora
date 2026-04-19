import Link from "next/link";
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
import { ActivationWidget } from "@/components/dashboard/ActivationWidget";
import { AttentionPanel } from "@/components/dashboard/AttentionPanel";
import { ActivityFeed } from "@/components/dashboard/ActivityFeed";
import { QuickActions } from "@/components/dashboard/QuickActions";
import { EmptyStateCard } from "@/components/dashboard/EmptyStateCard";
import { ExecutiveView } from "@/components/dashboard/views/ExecutiveView";
import { SalesView } from "@/components/dashboard/views/SalesView";
import { CsrView } from "@/components/dashboard/views/CsrView";
import { DesignerView } from "@/components/dashboard/views/DesignerView";
import { ProductionView } from "@/components/dashboard/views/ProductionView";
import { InstallerView } from "@/components/dashboard/views/InstallerView";
import { FinanceView } from "@/components/dashboard/views/FinanceView";
import { EmployeeView } from "@/components/dashboard/views/EmployeeView";

// Phase 6 — persona-driven dashboard.
//
// Eight personas, each mapped from a TenantRole by `dashboardPersona()`.
// Per-persona concerns live in three files:
//
//   src/lib/dashboard-persona.ts   — role → persona mapping + labels
//   src/lib/dashboard-config.ts    — attention kinds + quick actions +
//                                     empty-state copy per persona
//   src/lib/dashboard-data.ts      — one loader per persona (Promise.all)
//   src/components/dashboard/views/— one KPI-grid component per persona
//
// This page orchestrates: pick the persona, run the loader, fan out the
// shared queries (attention + activity), and render. The page itself
// stays small — every persona adds a line to the switch below, not a
// cascade of inline JSX.

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

  // Branch-scope plumbing (unchanged from Phase 15).
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

  // Fan-out: per-persona data, attention feed filtered to the caller
  // (except executive, which gets the whole-shop feed), recent activity.
  const attentionFilter: { userId?: string; branchScope?: string[] | null } =
    persona === "executive" || persona === "production" || persona === "finance"
      ? { branchScope }
      : { userId, branchScope };

  const [personaData, attention, activity] = await Promise.all([
    loadPersonaData(persona, loaderCtx),
    loadAttention(tenant.id, attentionFilter),
    loadRecentActivity(tenant.id, { limit: 8 }),
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

  // "First-run" signal: the member has zero activity and zero attention.
  // Swap the KPI grid for a teaching empty state when that's true. We
  // still render the header, quick actions, and trial banner around it
  // so the shell feels consistent — just no numeric wall of zeros.
  const isFirstRun = activity.length === 0 && totalAttentionCount(attention) === 0;

  return (
    <div className="space-y-8">
      <DashboardHeader
        tenantName={tenant.name}
        persona={persona}
        role={role}
        branches={branchChoices}
        branchFilter={branchFilter}
        branchScoped={!branchFilter && branchScope !== null && branchScope.length > 0}
      />

      {showActivation && activation && (
        <ActivationWidget slug={slug} report={activation} />
      )}

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
        <PersonaView
          persona={persona}
          slug={slug}
          currency={tenant.currency}
          data={personaData}
        />
      )}

      {!isFirstRun && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <AttentionPanel
            slug={slug}
            groups={attention}
            kinds={config.attentionKinds}
            title={
              persona === "executive" || persona === "production" || persona === "finance"
                ? "Needs attention"
                : "Needs your attention"
            }
          />
          <ActivityFeed slug={slug} items={activity} />
        </div>
      )}

      {tenant.status === "TRIAL" && trialDaysLeft !== null && (
        <TrialBanner daysLeft={trialDaysLeft} slug={slug} />
      )}
    </div>
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
  persona,
  role,
  branches,
  branchFilter,
  branchScoped,
}: {
  tenantName: string;
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

  return (
    <header className="flex flex-wrap items-start justify-between gap-4">
      <div>
        <div
          className="text-xs font-semibold uppercase tracking-wider"
          style={{ color: "var(--accent-primary)" }}
        >
          {PERSONA_LABEL[persona]}
        </div>
        <h1
          className="mt-1 text-2xl font-semibold tracking-tight"
          style={{ color: "var(--text-default)" }}
        >
          {tenantName}
        </h1>
        <p className="mt-1 text-sm" style={{ color: "var(--text-muted)" }}>
          {PERSONA_SUBTITLE[persona]}{" "}
          <span style={{ color: "var(--text-faint)" }}>
            · signed in as {roleLabel}
            {scopeLabel ? ` · ${scopeLabel}` : ""}
          </span>
        </p>
      </div>

      {branches.length > 1 && (
        <form className="flex items-center gap-2 text-sm" method="get">
          <select
            name="branch"
            defaultValue={branchFilter ?? ""}
            className="ts-focus rounded-md px-3 py-1.5 text-sm outline-none"
            style={{
              background: "var(--surface-1)",
              border: "1px solid var(--border-default)",
              color: "var(--text-default)",
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
            className="ts-focus rounded-md px-3 py-1.5 text-sm font-medium"
            style={{
              background: "var(--accent-primary)",
              color: "var(--accent-fg)",
            }}
          >
            Filter
          </button>
        </form>
      )}
    </header>
  );
}

// ────────────────────────────────────────────────────────────
// Trial banner (unchanged from Phase 18 Slice D).
// ────────────────────────────────────────────────────────────

function TrialBanner({ daysLeft, slug }: { daysLeft: number; slug: string }) {
  const tight = daysLeft <= 3;
  return (
    <div
      className="flex flex-wrap items-center justify-between gap-3 rounded-lg px-4 py-3 text-sm"
      style={{
        background: tight ? "var(--danger-surface)" : "var(--accent-surface)",
        border: `1px solid ${tight ? "var(--danger-fg)" : "var(--accent-surface-strong)"}`,
        color: "var(--text-default)",
      }}
    >
      <span>
        You&apos;re on a free trial.{" "}
        <strong style={{ color: tight ? "var(--danger-fg)" : "var(--accent-primary)" }}>
          {daysLeft} {daysLeft === 1 ? "day" : "days"} remaining
        </strong>
        .
      </span>
      <Link
        href={`/t/${slug}/settings/billing`}
        className="inline-flex h-8 items-center rounded-md px-3 text-xs font-medium"
        style={{ background: "var(--accent-primary)", color: "var(--accent-fg)" }}
      >
        Upgrade now →
      </Link>
    </div>
  );
}
