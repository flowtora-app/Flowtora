import Link from "next/link";
import {
  Avatar,
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  ProgressBar,
  StatusPill,
} from "@/components/ui";
import { flagEmoji } from "@/lib/country-codes";

// Sticky right rail for the tenant detail page — shared across every
// tab. Contents per Page 4a §Right rail (sticky):
//   • At-a-glance card (plan / MRR / LTV / health / trial ends)
//   • Quick actions (impersonate / email / note / ticket / etc.)
//   • CSM card (assigned + reassign)
//   • Tags (chips)
//   • Linked records (Stripe / etc.)
//   • Recently viewed by team

const STATUS_TO_PILL: Record<string, "active" | "trialing" | "past_due" | "suspended" | "cancelled" | "draft"> = {
  ACTIVE: "active", TRIAL: "trialing", PAST_DUE: "past_due",
  SUSPENDED: "suspended", CANCELED: "cancelled", ARCHIVED: "draft",
};

export interface TenantRightRailProps {
  tenant: {
    id: string;
    name: string;
    slug: string;
    plan: string;
    planName: string;
    status: string;
    mrr: number;
    ltv: number;
    healthScore: number;
    trialEndsAt: Date | null;
    countryIso2: string | null;
    countryName: string | null;
    isVip: boolean;
    adminTags: string[];
    accountManager: { id: string; name: string | null; email: string } | null;
    stripeCustomerId: string | null;
    customDomain: string | null;
  };
  recentViewers: { userId: string; name: string | null; email: string; viewedAt: Date }[];
}

export function TenantRightRail({ tenant, recentViewers }: TenantRightRailProps) {
  return (
    <aside className="space-y-3 lg:sticky lg:top-4 lg:self-start">
      {/* At-a-glance */}
      <Card padding="md">
        <CardHeader title="At a glance" />
        <CardBody>
          <div className="space-y-3 text-[13px]">
            <Row label="Status" value={<StatusPill status={STATUS_TO_PILL[tenant.status] ?? "draft"} size="sm" />} />
            <Row label="Plan"   value={<Badge size="xs" color="brand">{tenant.planName}</Badge>} />
            <Row label="MRR"    value={tenant.mrr === 0 ? "—" : `$${tenant.mrr.toLocaleString()}`} />
            <Row label="LTV"    value={tenant.ltv === 0 ? "—" : `$${tenant.ltv.toLocaleString()}`} />
            {tenant.trialEndsAt && (
              <Row label="Trial ends" value={tenant.trialEndsAt.toLocaleDateString()} />
            )}
            <div>
              <div className="mb-1 flex items-center justify-between text-[12px]">
                <span style={{ color: "var(--text-muted)" }}>Health</span>
                <span className="font-mono tabular-nums" style={{ color: "var(--text-default)" }}>{tenant.healthScore}</span>
              </div>
              <ProgressBar
                value={tenant.healthScore}
                tone={tenant.healthScore >= 80 ? "success" : tenant.healthScore >= 50 ? "warning" : "danger"}
                size="sm"
              />
            </div>
            {tenant.countryIso2 && (
              <Row label="Country" value={<span>{flagEmoji(tenant.countryIso2)} {tenant.countryName ?? tenant.countryIso2}</span>} />
            )}
          </div>
        </CardBody>
      </Card>

      {/* Quick actions */}
      <Card padding="md">
        <CardHeader title="Quick actions" />
        <CardBody>
          <div className="flex flex-wrap gap-2">
            <Link href={`?tab=settings#impersonate`}>
              <Button size="xs" variant="secondary">Impersonate</Button>
            </Link>
            <Link href={`?tab=communications`}>
              <Button size="xs" variant="ghost">Send email</Button>
            </Link>
            <Link href={`?tab=notes`}>
              <Button size="xs" variant="ghost">Add note</Button>
            </Link>
            <Link href={`?tab=communications#new-ticket`}>
              <Button size="xs" variant="ghost">Create ticket</Button>
            </Link>
            <Link href={`?tab=billing#credit`}>
              <Button size="xs" variant="ghost">Apply credit</Button>
            </Link>
            <Link href={`?tab=settings#vip`}>
              <Button size="xs" variant="ghost">{tenant.isVip ? "Unmark VIP" : "Mark VIP"}</Button>
            </Link>
            {tenant.stripeCustomerId && (
              <a href={`https://dashboard.stripe.com/customers/${tenant.stripeCustomerId}`} target="_blank" rel="noopener noreferrer">
                <Button size="xs" variant="ghost">Open Stripe ↗</Button>
              </a>
            )}
          </div>
        </CardBody>
      </Card>

      {/* CSM */}
      <Card padding="md">
        <CardHeader title="Account manager" />
        <CardBody>
          {tenant.accountManager ? (
            <div className="flex items-center gap-2">
              <Avatar size="sm" name={tenant.accountManager.name ?? tenant.accountManager.email} />
              <div className="min-w-0">
                <div className="truncate text-[13px] font-medium" style={{ color: "var(--text-default)" }}>
                  {tenant.accountManager.name ?? tenant.accountManager.email}
                </div>
                <div className="truncate text-[11px]" style={{ color: "var(--text-muted)" }}>{tenant.accountManager.email}</div>
              </div>
            </div>
          ) : (
            <div className="text-[12px]" style={{ color: "var(--text-muted)" }}>Unassigned</div>
          )}
          <div className="mt-2 text-[11px]" style={{ color: "var(--text-faint)" }}>
            Reassign from the Tenants list bulk-bar.
          </div>
        </CardBody>
      </Card>

      {/* Tags */}
      <Card padding="md">
        <CardHeader title="Tags" right={<Link href="?tab=settings#tags" className="text-[11px] underline" style={{ color: "var(--text-muted)" }}>Edit</Link>} />
        <CardBody>
          {tenant.adminTags.length === 0 ? (
            <div className="text-[12px]" style={{ color: "var(--text-muted)" }}>No tags yet.</div>
          ) : (
            <div className="flex flex-wrap gap-1">
              {tenant.adminTags.map((t) => (
                <span key={t} className="inline-flex items-center rounded-full px-1.5 text-[10px]"
                      style={{ background: "var(--surface-2)", color: "var(--text-muted)" }}>{t}</span>
              ))}
            </div>
          )}
        </CardBody>
      </Card>

      {/* Linked records */}
      <Card padding="md">
        <CardHeader title="Linked records" />
        <CardBody>
          <ul className="flex flex-col gap-1.5 text-[12px]">
            <li className="flex items-center justify-between gap-2">
              <span style={{ color: "var(--text-muted)" }}>Stripe customer</span>
              {tenant.stripeCustomerId ? (
                <a href={`https://dashboard.stripe.com/customers/${tenant.stripeCustomerId}`} target="_blank" rel="noopener noreferrer"
                   className="font-mono text-[10px] hover:underline"
                   style={{ color: "var(--accent-primary)" }}>
                  {tenant.stripeCustomerId.slice(0, 12)}…
                </a>
              ) : (
                <span style={{ color: "var(--text-faint)" }}>—</span>
              )}
            </li>
            <li className="flex items-center justify-between gap-2">
              <span style={{ color: "var(--text-muted)" }}>Custom domain</span>
              <span className="font-mono text-[11px]" style={{ color: tenant.customDomain ? "var(--text-default)" : "var(--text-faint)" }}>
                {tenant.customDomain ?? "—"}
              </span>
            </li>
            <li className="flex items-center justify-between gap-2">
              <span style={{ color: "var(--text-muted)" }}>HubSpot company</span>
              <span style={{ color: "var(--text-faint)" }}>—</span>
            </li>
            <li className="flex items-center justify-between gap-2">
              <span style={{ color: "var(--text-muted)" }}>Intercom user</span>
              <span style={{ color: "var(--text-faint)" }}>—</span>
            </li>
          </ul>
        </CardBody>
      </Card>

      {/* Recently viewed */}
      <Card padding="md">
        <CardHeader title="Recently viewed by team" />
        <CardBody>
          {recentViewers.length === 0 ? (
            <div className="text-[12px]" style={{ color: "var(--text-muted)" }}>No-one else has opened this page recently.</div>
          ) : (
            <ul className="flex flex-col gap-2">
              {recentViewers.map((v) => (
                <li key={v.userId} className="flex items-center gap-2 text-[12px]">
                  <Avatar size="xs" name={v.name ?? v.email} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate" style={{ color: "var(--text-default)" }}>{v.name ?? v.email}</div>
                    <div className="text-[10px]" style={{ color: "var(--text-faint)" }}>{relativeTime(v.viewedAt)}</div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>
    </aside>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-2 text-[12px]">
      <span style={{ color: "var(--text-muted)" }}>{label}</span>
      <span style={{ color: "var(--text-default)" }}>{value}</span>
    </div>
  );
}

function relativeTime(d: Date): string {
  const ms = Date.now() - d.getTime();
  const min = 60_000, hour = 60 * min, day = 24 * hour;
  if (ms < min)  return "just now";
  if (ms < hour) return `${Math.floor(ms / min)}m ago`;
  if (ms < day)  return `${Math.floor(ms / hour)}h ago`;
  return `${Math.floor(ms / day)}d ago`;
}
