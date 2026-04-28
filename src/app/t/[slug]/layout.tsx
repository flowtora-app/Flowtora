import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { requireTenant } from "@/lib/tenant";
import { unreadCount } from "@/lib/notifications";
import { loadAttention, totalAttentionCount } from "@/lib/attention";
import { getActiveImpersonation } from "@/lib/impersonation";
import { stopImpersonation } from "@/app/actions/platform";
import { AppShell } from "@/components/shell/AppShell";
import type { SidebarSection } from "@/components/shell/Sidebar";
import type { QuickAction, PalettePin } from "@/components/shell/CommandPalette";
import { TenantBanners } from "@/components/TenantBanners";
import { tenantBanners } from "@/lib/tenant-banners";
import { UnverifiedEmailBanner } from "@/components/UnverifiedEmailBanner";
import { loadPalettePins } from "@/lib/palette";
import { loadActivationReport, shouldShowActivationBanner } from "@/lib/activation";
import { FinishSetupBanner } from "@/components/FinishSetupBanner";
import { MemberWelcomeCard } from "@/components/onboarding/MemberWelcomeCard";
import { FloatingHelpButton } from "@/components/support/FloatingHelpButton";
import { PlatformAnnouncementBanner } from "@/components/PlatformAnnouncementBanner";
import { activeAnnouncementsForTenant } from "@/app/actions/announcements";

// Phase 18 Slice B — tenant layout.
//
// Responsibilities split:
//   • This server component: auth, tenant resolution, data fetching
//     (badges, memberships, unread, impersonation state), onboarding
//     gate, and computing the sidebar structure.
//   • <AppShell/> (client): layout glue + interactive popovers +
//     command palette.
//
// The sidebar groups 13 nav items into three sections so the visual
// density eases up as the account grows. Badge counts stay as props —
// the Sidebar stays dumb about how "attention" is computed.

// Force this layout to re-run on every request. Two reasons:
//   1. The onboarding gate below redirects when tenant.onboardingCompletedAt
//      is null. Without force-dynamic, the App Router can serve a cached
//      segment on client-side navigation (e.g. switching tenants) and
//      skip the redirect — the user lands on the dashboard for an
//      un-onboarded tenant until they hard-reload.
//   2. The badge counts (attention, unread) are user-specific and
//      tenant-specific; caching them across requests would surface
//      another tenant's numbers in the worst case.
export const dynamic = "force-dynamic";

export default async function TenantLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const ctx = await requireTenant(slug);
  const { tenant, role, userId } = ctx;

  const path = (await headers()).get("x-pathname") ?? "";
  const inOnboarding = path.includes(`/t/${slug}/onboarding`);
  const inCheckoutDirect = path.includes(`/t/${slug}/checkout-direct`);
  const inWelcome = path.includes(`/t/${slug}/welcome`);

  // checkout-direct is a pure server-side Stripe handoff — the page
  // creates a Checkout Session and 302s to Stripe. Rendering the full
  // AppShell (sidebar/topbar/banners) + the /t/[slug]/loading skeleton
  // while we round-trip to Stripe's API causes a visible flash of the
  // app chrome before the redirect.
  //
  // /welcome is the post-payment confirmation moment — a focused, full
  // page transition into onboarding. Rendering the sidebar with links
  // to empty dashboards/attention pages (nothing's set up yet) would
  // undercut the "you're in, let's set up" framing.
  //
  // Both skip the shell entirely and own their own response. Auth is
  // still enforced: this runs AFTER requireTenant, and each page
  // asserts its own permissions before rendering.
  if (inCheckoutDirect || inWelcome) {
    return <>{children}</>;
  }

  // Onboarding gate — owners/admins must finish setup first. Others
  // see a banner explaining the workspace isn't ready yet.
  if (
    !tenant.onboardingCompletedAt &&
    !inOnboarding &&
    (role === "OWNER" || role === "ADMIN")
  ) {
    redirect(`/t/${slug}/onboarding`);
  }

  // Phase 17 Slice B — impersonation banner. Only shown when the active
  // impersonation points at *this* tenant (cross-tenant stale cookies
  // shouldn't imply an audit trail in the wrong place).
  const impersonation = await getActiveImpersonation(userId);
  const impersonatingHere = impersonation && impersonation.tenantId === tenant.id;

  const canSeeAllAttention = role === "OWNER" || role === "ADMIN" || role === "PRODUCTION_MANAGER";

  // Parallel fetch: badges, memberships (for the switcher), user record
  // (for the profile menu), sidebar-collapse pref, pinned palette items,
  // current membership row (for the welcome-seen flag), and — for owners
  // or admins who might see the activation banner — the activation
  // report.
  const session = await auth();
  const shouldLoadActivation = role === "OWNER" || role === "ADMIN";
  // Phase 22 Slice A — approval inbox badge. Only approvers see the count;
  // everyone else sees the page without a pending-count chip. Count runs
  // unconditionally but cheaply — a single indexed aggregate.
  const canApprove = ctx.can("quotes:approve_exceptions");
  const [
    unread,
    recentNotifications,
    attentionGroups,
    memberships,
    userRecord,
    jar,
    pins,
    currentMembership,
    activation,
    approvalsPending,
    portalMessagesUnread,
  ] = await Promise.all([
    unreadCount(tenant.id, userId),
    // Top 8 most-recent notifications for the header bell popover.
    // Read/unread state is styled in the row (colored dot + bg tint),
    // so users still see their latest history when there's zero unread.
    db.notification.findMany({
      where:   { tenantId: tenant.id, userId },
      orderBy: { createdAt: "desc" },
      take:    8,
      select:  { id: true, type: true, title: true, link: true, readAt: true, createdAt: true },
    }).catch(() => [] as { id: string; type: string; title: string; link: string | null; readAt: Date | null; createdAt: Date }[]),
    loadAttention(tenant.id, { userId: canSeeAllAttention ? undefined : userId }).catch(() => null),
    db.membership.findMany({
      where: { userId, status: "ACTIVE" },
      select: {
        tenant: {
          select: {
            id: true,
            name: true,
            slug: true,
            status: true,
            trialEndsAt: true,
          },
        },
      },
    }),
    db.user.findUnique({ where: { id: userId }, select: { email: true, name: true, emailVerified: true } }),
    cookies(),
    loadPalettePins(userId, tenant.id, 10),
    db.membership.findUnique({
      where: { userId_tenantId: { userId, tenantId: tenant.id } },
      select: { welcomeSeenAt: true },
    }),
    shouldLoadActivation ? loadActivationReport(tenant, role) : Promise.resolve(null),
    canApprove
      ? db.approvalRequest.count({ where: { tenantId: tenant.id, status: "PENDING" } }).catch(() => 0)
      : Promise.resolve(0),
    // Unread inbound portal messages across all customers — drives the
    // sidebar "Messages" badge. Cheap: one indexed count.
    db.portalMessage.count({
      where: {
        tenantId: tenant.id,
        direction: "INBOUND",
        readAt:    null,
        archivedAt: null,
      },
    }).catch(() => 0),
  ]);
  const attentionCount = attentionGroups ? totalAttentionCount(attentionGroups) : 0;

  // Banner visibility — owner/admin + score < 50 + 7-day snooze honored.
  // `onDashboard` flag suppresses the banner on the dashboard itself,
  // where the full ActivationWidget renders and the banner would be
  // redundant.
  const onDashboard = path === `/t/${slug}/dashboard`;
  const showActivationBanner =
    !!activation &&
    !onDashboard &&
    shouldShowActivationBanner(tenant, role, activation.score);
  const topAction = activation?.actions[0] ?? null;

  // First-run welcome card for non-admin members. Renders ONCE per
  // membership on the dashboard. Owners & admins get the full wizard
  // instead.
  const showMemberWelcome =
    role !== "OWNER" &&
    role !== "ADMIN" &&
    onDashboard &&
    currentMembership?.welcomeSeenAt == null;

  const collapsedInitial = jar.get("ts_shell_collapsed")?.value === "1";

  // Sidebar structured around the sales-to-cash lifecycle — five
  // clusters that mirror how a shop actually moves through a job:
  //   Inbox    — what needs me today
  //   Sell     — pre-commitment: lead → customer → quote
  //   Produce  — the work: order → proofs → shop floor → install
  //   Collect  — invoices & cash
  //   Manage   — catalog, costs, reporting, admin
  //
  // Rationale: Quotes sit with Customers (pre-sale funnel), Orders lead
  // Produce (pivot from sales to execution), Payments gets its own line
  // in Collect (A/R is a daily concern), Proofs is promoted out of the
  // order-detail nesting because design approval is a frequent task.
  const base = `/t/${slug}`;
  const sections: SidebarSection[] = [
    {
      // Sprint 1 (Inbox consolidation): the five legacy inbox entries
      // (attention/approvals/messages/tasks + notifications popover target)
      // are now a single "Inbox" link. Chips inside the page handle the
      // per-surface navigation. Badge sums action-items only — attention
      // + messages + approvals — matching the pre-consolidation UX where
      // tasks never surfaced a sidebar count.
      label: "Inbox",
      items: [
        { href: `${base}/dashboard`, label: "Dashboard", icon: "Dashboard" },
        {
          href:  `${base}/inbox`,
          label: "Inbox",
          icon:  "MessageSquare",
          badge: attentionCount + portalMessagesUnread + approvalsPending,
        },
      ],
    },
    {
      label: "Sell",
      items: [
        { href: `${base}/leads`,     label: "Pipeline",  icon: "Pipeline"  },
        { href: `${base}/customers`, label: "Customers", icon: "Customers" },
        { href: `${base}/quotes`,    label: "Quotes",    icon: "Quotes"    },
      ],
    },
    {
      label: "Produce",
      items: [
        { href: `${base}/orders`,     label: "Orders",     icon: "Orders"     },
        { href: `${base}/proofs`,     label: "Proofs",     icon: "Proofs"     },
        { href: `${base}/production`, label: "Production", icon: "Production" },
        { href: `${base}/installs`,   label: "Installs",   icon: "Installs"   },
      ],
    },
    {
      label: "Collect",
      items: [
        { href: `${base}/invoices`, label: "Invoices", icon: "Invoices" },
        { href: `${base}/payments`, label: "Payments", icon: "Payments" },
      ],
    },
    {
      label: "Manage",
      items: [
        { href: `${base}/products`, label: "Products", icon: "Products" },
        { href: `${base}/vendors`,  label: "Vendors",  icon: "Vendors"  },
        { href: `${base}/expenses`, label: "Expenses", icon: "Expenses" },
        { href: `${base}/reports`,  label: "Reports",  icon: "Reports"  },
        { href: `${base}/support`,  label: "Support",  icon: "Support"  },
        { href: `${base}/settings`, label: "Settings", icon: "Settings" },
      ],
    },
  ];

  // Quick actions for the ⌘K palette. Mirrors the TopBar's + Create
  // menu but richer — we can add non-create destinations too (e.g.
  // "Go to settings").
  const quickActions: QuickAction[] = [
    { id: "c-customer", label: "Create customer", sub: "New record", href: `${base}/customers/new`, icon: "Customers", keywords: ["new", "add"] },
    { id: "c-quote",    label: "Create quote",    sub: "New record", href: `${base}/quotes/new`,    icon: "Quotes",    keywords: ["new", "add", "estimate"] },
    { id: "c-order",    label: "Create order",    sub: "New record", href: `${base}/orders/new`,    icon: "Orders",    keywords: ["new", "add", "job"] },
    { id: "c-invoice",  label: "Create invoice",  sub: "New record", href: `${base}/invoices/new`,  icon: "Invoices",  keywords: ["new", "add", "bill"] },
    { id: "c-expense",  label: "Log expense",     sub: "New record", href: `${base}/expenses/new`,  icon: "Expenses",  keywords: ["new", "add", "receipt", "bill"] },
    { id: "c-vendor",   label: "Add vendor",      sub: "New record", href: `${base}/vendors/new`,   icon: "Vendors",   keywords: ["new", "add", "supplier"] },
    { id: "c-product",  label: "Create product",  sub: "New record", href: `${base}/products/new`,  icon: "Products",  keywords: ["new", "add", "catalog"] },
    { id: "g-dashboard",label: "Go to dashboard", href: `${base}/dashboard`,  icon: "Dashboard" },
    { id: "g-inbox",    label: "Go to inbox",     href: `${base}/inbox`,                     icon: "MessageSquare" },
    { id: "g-attention",label: "Go to needs attention", href: `${base}/inbox?chip=attention`, icon: "Attention" },
    { id: "g-tasks",    label: "Go to tasks",     href: `${base}/inbox?chip=tasks`,          icon: "Tasks"    },
    { id: "g-production", label: "Go to production board", href: `${base}/production`, icon: "Production" },
    { id: "g-reports",  label: "Go to reports",   href: `${base}/reports`,    icon: "Reports"  },
    { id: "g-settings", label: "Go to settings",  href: `${base}/settings`,   icon: "Settings" },
    { id: "g-support",  label: "Go to support",   href: `${base}/support`,    icon: "Support"  },
  ];

  // Only offer the tenant switcher when the user actually has >1
  // workspace. Filter out suspended/cancelled ones — they'd redirect
  // anyway. TRIAL and PAST_DUE are kept and surfaced via a status chip
  // in the switcher popover.
  const membershipSummaries = memberships
    .filter((m) => ["ACTIVE", "TRIAL", "PAST_DUE"].includes(m.tenant.status))
    .map((m) => ({
      id: m.tenant.id,
      name: m.tenant.name,
      slug: m.tenant.slug,
      active: m.tenant.id === tenant.id,
      status: m.tenant.status,
      trialEndsAt: m.tenant.trialEndsAt,
    }));

  // Snapshot of pins to hydrate the ⌘K palette. The shell is client
  // but we pre-compute on the server so the palette is usable on first
  // open without a round-trip.
  const pinSnapshots: PalettePin[] = pins.map((p) => ({
    id: p.id,
    kind: p.entityKind,
    label: p.label,
    sub: p.sub ?? undefined,
    href: p.href,
  }));

  return (
    <AppShell
      slug={slug}
      tenantName={tenant.name}
      roleLabel={role.replace(/_/g, " ")}
      planLabel={tenant.plan}
      sections={sections}
      collapsedInitial={collapsedInitial}
      user={{
        email: userRecord?.email ?? session?.user?.email ?? "",
        name: userRecord?.name ?? session?.user?.name ?? null,
      }}
      unread={unread}
      recentNotifications={recentNotifications}
      memberships={membershipSummaries}
      quickActions={quickActions}
      pins={pinSnapshots}
    >
      {impersonatingHere && (
        <div
          className="mb-6 flex items-center justify-between gap-4 rounded-md px-4 py-3 text-sm"
          style={{ background: "#3a2a15", color: "#ffc98b", border: "1px solid #5b4b20" }}
        >
          <div>
            <span className="font-medium">Platform impersonation active.</span>{" "}
            Every action you take is logged against your platform account.
            {impersonation?.reason && (
              <span className="block text-xs" style={{ color: "var(--text-muted)" }}>
                Reason: {impersonation.reason}
              </span>
            )}
          </div>
          <form action={stopImpersonation}>
            <button
              type="submit"
              className="rounded-md px-3 py-1.5 text-xs font-medium"
              style={{ background: "#5b4b20", color: "#ffc98b", border: "1px solid #7a6828" }}
            >
              Stop impersonating
            </button>
          </form>
        </div>
      )}
      {!tenant.onboardingCompletedAt && !inOnboarding && (
        <div
          className="mb-6 rounded-md px-4 py-3 text-sm"
          style={{ background: "var(--surface-1)", border: "1px solid var(--border-subtle)", color: "var(--text-muted)" }}
        >
          Workspace setup isn&apos;t finished yet. An owner or admin needs to complete onboarding.
        </div>
      )}
      {/* Phase 1 — environment ribbon + trial/billing/archive banners.
          These are derived from the tenant row, not user role, so every
          member sees the same state. */}
      <TenantBanners banners={tenantBanners(tenant)} />
      {/* Phase 4 — persistent "finish setup" nudge. Shown only on
          non-dashboard pages (the dashboard itself already has the
          ActivationWidget), when score < 50, and not snoozed within 7d. */}
      {showActivationBanner && activation && (
        <FinishSetupBanner
          slug={slug}
          score={activation.score}
          topAction={
            topAction
              ? { title: topAction.title, href: `/t/${slug}${topAction.href}` }
              : null
          }
        />
      )}
      {/* Phase 4 Slice F — non-admin member first-run welcome. */}
      {showMemberWelcome && (
        <MemberWelcomeCard
          slug={slug}
          tenantName={tenant.name}
          roleLabel={role.replace(/_/g, " ").toLowerCase()}
        />
      )}
      {/* Phase 2 — nudge any user who hasn't confirmed their email yet.
          We don't block the workspace on it (too disruptive mid-trial)
          but we keep a dismissible banner on top of every tenant page. */}
      {!userRecord?.emailVerified && userRecord?.email && (
        <UnverifiedEmailBanner email={userRecord.email} />
      )}
      <PlatformAnnouncementBanner
        announcements={
          (await activeAnnouncementsForTenant({
            id: tenant.id,
            plan: tenant.plan,
            betaCohort: tenant.betaCohort,
          })).map((a) => ({
            id: a.id,
            title: a.title,
            body: a.body,
            type: a.type,
            priority: a.priority,
            updatedAtISO: a.updatedAt.toISOString(),
          }))
        }
      />
      {children}
      <FloatingHelpButton slug={slug} />
    </AppShell>
  );
}
