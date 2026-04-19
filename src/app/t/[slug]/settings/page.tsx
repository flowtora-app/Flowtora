import Link from "next/link";
import { requireTenant } from "@/lib/tenant";
import { db } from "@/lib/db";
import { isEntitled } from "@/lib/entitlements";
import { formatDateTime } from "@/lib/format";

// Phase 21 Slice E — settings hub.
//
// The sidebar already lets you jump between sections, but with 18 items
// it reads like a phone book. The hub is a grid of cards grouped by
// concern with a short description on each — the "where do I find X?"
// entry point. Also shows the last audit event for settings so admins
// can see "did anyone touch this recently, and who?"

type HubCard = {
  slug: string;
  label: string;
  description: string;
  gate?: "franchiseGroup";
};

type Group = { label: string; cards: HubCard[] };

const GROUPS: Group[] = [
  {
    label: "Shop",
    cards: [
      { slug: "profile",   label: "Profile",        description: "Name, logo, contact info, brand color, and customer-facing email sender." },
      { slug: "numbering", label: "Numbering",      description: "Prefixes and counters for quotes, orders, and invoices." },
      { slug: "financial", label: "Financial",      description: "Default tax rate, deposits, and payment terms." },
      { slug: "documents", label: "Documents",      description: "Footers and payment instructions rendered on quotes, invoices, and emails." },
      { slug: "workflow",  label: "Workflow",       description: "Approval thresholds, proof gates, and rush pricing." },
      { slug: "automation", label: "Automation",    description: "Default sales rep, production manager, and auto-applied checklists." },
      { slug: "production", label: "Production",    description: "Departments, workstations, and production stages." },
    ],
  },
  {
    label: "Workspace",
    cards: [
      { slug: "locations",         label: "Locations",    description: "Branches your team operates out of." },
      { slug: "templates",         label: "Checklists",   description: "Reusable checklist templates for orders and installs." },
      { slug: "message-templates", label: "Messages",     description: "Canned customer messages for common situations." },
      { slug: "sample-data",       label: "Sample data",  description: "Load or clear the onboarding demo data set." },
    ],
  },
  {
    label: "People",
    cards: [
      { slug: "team",                    label: "Team",                  description: "Invite members, set roles, and manage access." },
      { slug: "notifications-defaults",  label: "Notification defaults", description: "House default alerts new members inherit on invite-accept." },
      { slug: "franchise",               label: "Group",                 description: "Franchise / multi-tenant shared templates.", gate: "franchiseGroup" },
    ],
  },
  {
    label: "Account",
    cards: [
      { slug: "notifications", label: "Notifications", description: "Your personal in-app and email alert preferences." },
      { slug: "security",      label: "Security",      description: "Password, sessions, and login history." },
      { slug: "billing",       label: "Billing",       description: "Plan, invoices, and payment method." },
      { slug: "danger",        label: "Danger zone",   description: "Export data, archive, or delete this workspace." },
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
          if (!c.gate) return c;
          const allowed = await isEntitled(ctx.tenant.id, ctx.tenant.plan, c.gate);
          return allowed ? c : null;
        }),
      );
      return { label: g.label, cards: cards.filter((x): x is HubCard => x !== null) };
    }),
  );

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
