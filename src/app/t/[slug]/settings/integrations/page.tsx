import Link from "next/link";
import { requirePermission } from "@/lib/tenant";
import { db } from "@/lib/db";
import { Card, CardHeader } from "@/components/Card";
import { formatDateTime } from "@/lib/format";

// Integrations overview — read-only health dashboard.
//
// Scope: show what's connected, where it's at, and how to act. No
// connect/disconnect flows ship from here today — billing/subscription
// has its own page, email sender lives on the Business profile, and
// future connectors (QuickBooks, Zapier, Google Calendar, Slack) get
// placeholder cards so the grid visibly scales.
//
// The motivating ask: "my Stripe webhook is silent and I have no way
// to see that from inside the app." Now there's a "last Stripe webhook
// received at…" row with a warning chip when it's been > 24h since the
// last one on an active subscription.

export const dynamic = "force-dynamic";

const WEBHOOK_STALE_MS = 24 * 60 * 60 * 1000; // 24h

export default async function IntegrationsPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const ctx = await requirePermission(slug, "tenant:manage");
  const { tenant } = ctx;

  // Stripe health: latest webhook event we've processed for this tenant.
  // Audit log entries for Stripe are written as `stripe.*` by the
  // webhook route. Absence of entries = webhook never fired.
  const lastStripeEvent = await db.auditLog.findFirst({
    where: { tenantId: tenant.id, action: { startsWith: "stripe." } },
    orderBy: { createdAt: "desc" },
    select: { action: true, createdAt: true, metadata: true },
  });

  const stripeConnected = !!tenant.stripeCustomerId;
  const subscriptionLive = !!tenant.stripeSubscriptionId;
  const webhookAgeMs = lastStripeEvent
    ? Date.now() - lastStripeEvent.createdAt.getTime()
    : null;
  const webhookStale =
    subscriptionLive &&
    (lastStripeEvent === null || (webhookAgeMs !== null && webhookAgeMs > WEBHOOK_STALE_MS));

  // Email sender: we only know for sure that it's "configured" when
  // the tenant has set a from-name or reply-to. The envelope sender
  // itself is always Flowtora's verified Resend domain.
  const emailConfigured = !!tenant.emailFromName || !!tenant.emailReplyTo;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader
          title="Integrations"
          description="What's connected, and whether it's healthy."
        />
        <div className="grid gap-px" style={{ background: "var(--border-subtle)" }}>
          {/* Stripe */}
          <ConnectorRow
            title="Stripe"
            description="Subscription billing + future customer payments."
            status={
              !stripeConnected
                ? { tone: "neutral", label: "Not connected" }
                : !subscriptionLive
                ? { tone: "warning", label: "Customer only (no active subscription)" }
                : webhookStale
                ? { tone: "danger", label: "Webhook stale" }
                : { tone: "ok", label: "Connected" }
            }
            rows={[
              { label: "Customer ID",     value: tenant.stripeCustomerId ?? "—" },
              { label: "Subscription ID", value: tenant.stripeSubscriptionId ?? "—" },
              {
                label: "Last webhook",
                value: lastStripeEvent
                  ? `${lastStripeEvent.action.replace(/^stripe\./, "")} · ${formatDateTime(lastStripeEvent.createdAt)}`
                  : "never",
                hint: webhookStale
                  ? "No Stripe webhooks received recently. Check your Stripe dashboard webhook endpoint + STRIPE_WEBHOOK_SECRET."
                  : undefined,
              },
            ]}
            actions={[
              { href: `/t/${slug}/settings/billing`, label: "Manage subscription" },
            ]}
          />

          {/* Email */}
          <ConnectorRow
            title="Email (Resend)"
            description="Customer-facing emails use the shop's display name + reply-to on Flowtora's verified domain."
            status={
              emailConfigured
                ? { tone: "ok", label: "Configured" }
                : { tone: "warning", label: "Using default sender" }
            }
            rows={[
              { label: "Display name", value: tenant.emailFromName ?? "— (uses shop name)" },
              { label: "Reply-to",     value: tenant.emailReplyTo ?? "— (customers can't reply)" },
              { label: "Envelope",     value: "noreply@flowtora.app (verified)" },
            ]}
            actions={[
              { href: `/t/${slug}/settings/profile`, label: "Edit in profile" },
            ]}
          />

          {/* Placeholders — these surface the roadmap without building
              the connector. Marked "coming soon" so the grid is visibly
              extendable instead of feeling dead. */}
          <ConnectorRow
            title="QuickBooks / Xero"
            description="Sync customers, invoices, and payments to your accounting software."
            status={{ tone: "neutral", label: "Coming soon" }}
            rows={[]}
          />
          <ConnectorRow
            title="Zapier"
            description="Fire actions in other apps when things happen in Flowtora."
            status={{ tone: "neutral", label: "Coming soon" }}
            rows={[]}
          />
          <ConnectorRow
            title="Slack"
            description="Get production + invoice alerts in a Slack channel."
            status={{ tone: "neutral", label: "Coming soon" }}
            rows={[]}
          />
        </div>
      </Card>
    </div>
  );
}

type StatusTone = "ok" | "warning" | "danger" | "neutral";

function ConnectorRow({
  title,
  description,
  status,
  rows,
  actions,
}: {
  title: string;
  description: string;
  status: { tone: StatusTone; label: string };
  rows: { label: string; value: string; hint?: string }[];
  actions?: { href: string; label: string }[];
}) {
  const statusStyle = (() => {
    switch (status.tone) {
      case "ok":
        return { background: "var(--success-surface)", color: "var(--success-fg)", border: "1px solid var(--success-fg)" };
      case "warning":
        return { background: "var(--warning-surface)", color: "var(--warning-fg)", border: "1px solid var(--warning-fg)" };
      case "danger":
        return { background: "var(--danger-surface)", color: "var(--danger-fg)", border: "1px solid var(--danger-fg)" };
      default:
        return { background: "var(--surface-1)", color: "var(--text-muted)", border: "1px solid var(--border-subtle)" };
    }
  })();

  return (
    <div className="px-5 py-4" style={{ background: "var(--panel)" }}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold" style={{ color: "var(--text-default)" }}>
              {title}
            </h3>
            <span
              className="rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider"
              style={statusStyle}
            >
              {status.label}
            </span>
          </div>
          <p className="mt-0.5 text-xs" style={{ color: "var(--text-muted)" }}>
            {description}
          </p>
        </div>
        {actions && actions.length > 0 && (
          <div className="flex gap-2">
            {actions.map((a) => (
              <Link
                key={a.href}
                href={a.href}
                className="rounded-md px-3 py-1 text-xs font-medium"
                style={{
                  background: "var(--surface-1)",
                  border: "1px solid var(--border-subtle)",
                  color: "var(--text-default)",
                }}
              >
                {a.label}
              </Link>
            ))}
          </div>
        )}
      </div>
      {rows.length > 0 && (
        <dl className="mt-3 grid gap-1.5 text-xs sm:grid-cols-[140px_minmax(0,1fr)]">
          {rows.map((r) => (
            <div key={r.label} className="contents">
              <dt style={{ color: "var(--text-faint)" }}>{r.label}</dt>
              <dd className="min-w-0 break-all font-mono" style={{ color: "var(--text-default)" }}>
                {r.value}
                {r.hint && (
                  <span className="mt-1 block font-sans text-[11px]" style={{ color: "var(--warning-fg)" }}>
                    {r.hint}
                  </span>
                )}
              </dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  );
}
