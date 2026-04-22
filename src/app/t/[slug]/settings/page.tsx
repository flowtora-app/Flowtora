import Link from "next/link";
import { requireTenant } from "@/lib/tenant";
import { db } from "@/lib/db";
import { isEntitled } from "@/lib/entitlements";
import { hasPermission, type Permission } from "@/lib/rbac";
import { formatDateTime } from "@/lib/format";

// Settings hub.
//
// The sidebar gets you to a section; this page gets you to the RIGHT
// section. It's the "where do I find X?" entry point — a grouped grid
// of cards with short descriptions. Mirrors the five-group IA used by
// the sidebar (Me / Business / Money / Workspace / Account) and applies
// the same role + plan filter, so a CSR doesn't see a card promising
// them Subscription access they'll be denied from.
//
// Also surfaces the most recent settings-related audit event so admins
// can glance at "who touched settings last?"

type HubCard = {
  slug: string;
  label: string;
  description: string;
  perm?: Permission;
  gate?: "franchiseGroup";
  ownerOnly?: boolean;
  adminOrOwner?: boolean;
};

type Group = { label: string; cards: HubCard[] };

const GROUPS: Group[] = [
  {
    label: "Me",
    cards: [
      { slug: "me",            label: "Profile",       description: "Your display name and avatar — how teammates see you." },
      { slug: "security",      label: "Security",      description: "Password, two-factor, sessions, and recent login activity." },
      { slug: "notifications", label: "Notifications", description: "Your personal in-app and email alert preferences." },
    ],
  },
  {
    label: "Business",
    cards: [
      { slug: "profile",    label: "Business profile", description: "Shop name, logo, contact info, brand color, and customer-facing sender.", perm: "tenant:manage" },
      { slug: "documents",  label: "Documents",        description: "Footers and payment instructions rendered on quotes, invoices, and emails.", perm: "tenant:manage" },
      { slug: "numbering",  label: "Numbering",        description: "Prefixes and counters for quotes, orders, and invoices.", perm: "tenant:manage" },
      { slug: "workflow",   label: "Workflow",         description: "Approval thresholds, proof gates, and rush pricing.", perm: "tenant:manage" },
      { slug: "automation", label: "Automation",       description: "Default sales rep, production manager, and auto-applied checklists.", perm: "tenant:manage" },
      { slug: "production", label: "Production",       description: "Departments, workstations, and production stages.", perm: "production:manage" },
    ],
  },
  {
    label: "Money",
    cards: [
      { slug: "financial",  label: "Tax & terms",  description: "Default tax rate, deposits, and payment terms.", perm: "tenant:manage" },
      { slug: "billing",    label: "Subscription", description: "Flowtora plan, invoices, and payment method.",   perm: "tenant:billing" },
    ],
  },
  {
    label: "Workspace",
    cards: [
      { slug: "team",                    label: "Team & roles",    description: "Invite members, set roles, and manage access.", perm: "staff:manage" },
      { slug: "notifications-defaults",  label: "Invite defaults", description: "House default alerts new members inherit on invite-accept.", perm: "staff:manage" },
      { slug: "locations",               label: "Locations",       description: "Branches your team operates out of.", perm: "locations:manage" },
      { slug: "templates",               label: "Checklists",      description: "Reusable checklist templates for orders and installs.", perm: "templates:manage" },
      { slug: "message-templates",       label: "Canned messages", description: "Reusable customer messages for common situations.", perm: "templates:manage" },
      { slug: "franchise",               label: "Group sharing",   description: "Franchise / multi-tenant shared templates.", perm: "tenant:manage", gate: "franchiseGroup" },
    ],
  },
  {
    label: "Platform",
    cards: [
      { slug: "integrations", label: "Integrations", description: "Connected services and their health — Stripe, email, and more.", perm: "tenant:manage" },
      { slug: "audit-log",    label: "Audit log",    description: "Workspace-wide activity feed. Who did what, when.", adminOrOwner: true },
    ],
  },
  {
    label: "Account",
    cards: [
      { slug: "sample-data", label: "Demo data",   description: "Load or clear the onboarding demo data set.",       perm: "tenant:manage" },
      { slug: "danger",      label: "Danger zone", description: "Export data, archive, or delete this workspace.",    ownerOnly: true },
    ],
  },
];

export default async function SettingsIndex({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const ctx = await requireTenant(slug);

  const resolved: Group[] = await Promise.all(
    GROUPS.map(async (g) => {
      const cards = await Promise.all(
        g.cards.map(async (c) => {
          if (c.ownerOnly && ctx.role !== "OWNER") return null;
          if (c.adminOrOwner && ctx.role !== "OWNER" && ctx.role !== "ADMIN") return null;
          if (c.perm && !hasPermission(ctx.role, c.perm)) return null;
          if (c.gate) {
            const allowed = await isEntitled(ctx.tenant.id, ctx.tenant.plan, c.gate);
            if (!allowed) return null;
          }
          return c;
        }),
      );
      return { label: g.label, cards: cards.filter((x): x is HubCard => x !== null) };
    }),
  ).then((gs) => gs.filter((g) => g.cards.length > 0));

  // Show the most recent settings-related audit event so admins can
  // glance at "who touched settings last?" The audit action family is
  // `settings.*` across every save action in this file.
  const lastAudit = await db.auditLog.findFirst({
    where: { tenantId: ctx.tenant.id, action: { startsWith: "settings." } },
    orderBy: { createdAt: "desc" },
    select: { action: true, createdAt: true, userId: true },
  });
  const lastAuditUser = lastAudit?.userId
    ? await db.user.findUnique({
        where: { id: lastAudit.userId },
        select: { name: true, email: true },
      })
    : null;

  return (
    <div className="space-y-8">
      {lastAudit && (
        <div
          className="rounded-md px-4 py-3 text-xs"
          style={{
            background: "var(--surface-1)",
            border: "1px solid var(--border-subtle)",
            color: "var(--text-muted)",
          }}
        >
          Last settings change:{" "}
          <span style={{ color: "var(--text-default)" }}>
            {lastAudit.action.replace(/^settings\./, "").replace(/_/g, " ")}
          </span>
          {" by "}
          <span style={{ color: "var(--text-default)" }}>
            {lastAuditUser?.name ?? lastAuditUser?.email ?? "unknown"}
          </span>
          {" on "}
          {formatDateTime(lastAudit.createdAt)}
        </div>
      )}

      {resolved.map((g) => (
        <section key={g.label}>
          <h2
            className="mb-3 text-sm font-semibold uppercase tracking-wide"
            style={{ color: "var(--text-faint)" }}
          >
            {g.label}
          </h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {g.cards.map((c) => (
              <Link
                key={c.slug}
                href={`/t/${slug}/settings/${c.slug}`}
                className="block rounded-lg px-4 py-3 transition-colors hover:border-[var(--accent)]"
                style={{
                  background: "var(--surface-1)",
                  border: "1px solid var(--border-subtle)",
                }}
              >
                <div className="text-sm font-medium" style={{ color: "var(--text-default)" }}>
                  {c.label}
                </div>
                <div className="mt-1 text-xs" style={{ color: "var(--text-muted)" }}>
                  {c.description}
                </div>
              </Link>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
