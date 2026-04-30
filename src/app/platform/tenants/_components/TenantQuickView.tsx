"use client";

import * as React from "react";
import Link from "next/link";
import { Avatar, Badge, Button, Drawer, StatusPill } from "@/components/ui";
import { flagEmoji } from "@/lib/country-codes";
import type { TenantListRow } from "@/server/platform/tenants-list";

// TenantQuickView — Page 4 §Quick view slide-over.
//
// Right-side drawer with: header (logo + name + status + slug + open
// detail link) + key metrics (MRR / users / jobs / health) + recent
// activity (last 5 audit events) + owner contact + quick actions
// (Impersonate / Email / Note).

const STATUS_TO_PILL: Record<string, "active" | "trialing" | "past_due" | "suspended" | "cancelled" | "draft"> = {
  ACTIVE: "active", TRIAL: "trialing", PAST_DUE: "past_due",
  SUSPENDED: "suspended", CANCELED: "cancelled", ARCHIVED: "draft",
};

interface ActivityItem {
  id: string;
  action: string;
  createdAt: string;
}

export function TenantQuickView({
  tenant,
  onClose,
}: {
  tenant: TenantListRow;
  onClose: () => void;
}) {
  const [recent, setRecent] = React.useState<ActivityItem[] | null>(null);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void (async () => {
      try {
        const res = await fetch(`/api/platform/activity?tenantIds=${encodeURIComponent(tenant.id)}&take=5`, { cache: "no-store" });
        if (!res.ok) throw new Error("activity fetch failed");
        const data = (await res.json()) as { rows: { id: string; action: string; createdAtIso: string }[] };
        if (cancelled) return;
        setRecent(data.rows.map((r) => ({ id: r.id, action: r.action, createdAt: r.createdAtIso })));
      } catch {
        if (!cancelled) setRecent([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [tenant.id]);

  return (
    <Drawer
      open
      onOpenChange={(o) => { if (!o) onClose(); }}
      side="right"
      size="md"
      title={
        <div className="flex items-center gap-2">
          <Avatar size="md" src={tenant.logoUrl ?? undefined} name={tenant.name} />
          <div className="min-w-0">
            <div className="truncate text-[16px] font-semibold">{tenant.name}</div>
            <div className="flex items-center gap-1.5 text-[11px]">
              <span className="font-mono" style={{ color: "var(--text-faint)" }}>{tenant.slug}</span>
              <StatusPill status={STATUS_TO_PILL[tenant.status] ?? "draft"} size="sm" />
            </div>
          </div>
        </div>
      }
      description={`${tenant.planName} · ${tenant.mrr === 0 ? "no MRR" : `$${tenant.mrr.toLocaleString()}/mo`}`}
      footer={
        <Link href={`/platform/tenants/${tenant.id}`}>
          <Button size="sm">Open detail →</Button>
        </Link>
      }
    >
      <div className="flex flex-col gap-5">
        {/* Key metrics */}
        <Section title="Key metrics">
          <div className="grid grid-cols-2 gap-2">
            <Stat label="MRR"    value={tenant.mrr === 0 ? "—" : `$${tenant.mrr.toLocaleString()}`} />
            <Stat label="Users"  value={tenant.users.toLocaleString()} />
            <Stat label="Jobs (mo)" value={tenant.jobsThisMonth.toLocaleString()} />
            <Stat label="Health" value={`${tenant.healthScore}`} />
          </div>
        </Section>

        {/* Recent activity */}
        <Section title="Recent activity">
          {loading ? (
            <div className="text-[12px]" style={{ color: "var(--text-muted)" }}>Loading…</div>
          ) : recent && recent.length === 0 ? (
            <div className="text-[12px]" style={{ color: "var(--text-faint)" }}>No recent events.</div>
          ) : (
            <ul className="flex flex-col gap-2">
              {recent?.map((it) => (
                <li key={it.id} className="flex items-baseline justify-between gap-2 text-[12px]">
                  <span className="font-mono" style={{ color: "var(--text-default)" }}>{it.action}</span>
                  <span style={{ color: "var(--text-faint)" }}>{relativeTime(new Date(it.createdAt))}</span>
                </li>
              ))}
            </ul>
          )}
        </Section>

        {/* Owner contact */}
        <Section title="Owner contact">
          {tenant.ownerEmail ? (
            <a href={`mailto:${tenant.ownerEmail}`} className="text-[13px] hover:underline" style={{ color: "var(--accent-primary)" }}>
              {tenant.ownerEmail}
            </a>
          ) : (
            <span className="text-[12px]" style={{ color: "var(--text-faint)" }}>No OWNER membership on file.</span>
          )}
        </Section>

        {/* Account meta */}
        <Section title="Account">
          <Row label="Plan"    value={<Badge size="xs" color="brand">{tenant.planName}</Badge>} />
          <Row label="Country" value={tenant.countryIso2 ? `${flagEmoji(tenant.countryIso2)} ${tenant.countryName}` : "—"} />
          <Row label="Account manager" value={tenant.accountManager?.name ?? tenant.accountManager?.email ?? "Unassigned"} />
          {tenant.adminTags.length > 0 && (
            <Row label="Tags" value={
              <div className="flex flex-wrap gap-1">
                {tenant.adminTags.map((t) => (
                  <span key={t} className="inline-flex items-center rounded-full px-1.5 text-[10px]"
                        style={{ background: "var(--surface-2)", color: "var(--text-muted)" }}>{t}</span>
                ))}
              </div>
            } />
          )}
          {tenant.customDomain && <Row label="Custom domain" value={<span className="font-mono">{tenant.customDomain}</span>} />}
          {tenant.ssoEnabled && <Row label="SSO" value={tenant.ssoProvider ?? "Enabled"} />}
          {tenant.mfaEnforced && <Row label="MFA" value="Enforced" />}
          {tenant.stripeCustomerId && (
            <Row label="Stripe" value={
              <a href={`https://dashboard.stripe.com/customers/${tenant.stripeCustomerId}`} target="_blank" rel="noopener noreferrer"
                 className="font-mono text-[11px] hover:underline" style={{ color: "var(--accent-primary)" }}>
                {tenant.stripeCustomerId}
              </a>
            } />
          )}
        </Section>

        {/* Quick actions */}
        <Section title="Quick actions">
          <div className="flex flex-wrap gap-2">
            <Link href={`/platform/tenants/${tenant.id}?action=impersonate`}>
              <Button size="sm" variant="secondary">Impersonate</Button>
            </Link>
            {tenant.ownerEmail && (
              <a href={`mailto:${tenant.ownerEmail}`}>
                <Button size="sm" variant="secondary">Email owner</Button>
              </a>
            )}
            <Link href={`/platform/tenants/${tenant.id}#notes`}>
              <Button size="sm" variant="ghost">Add note</Button>
            </Link>
          </div>
        </Section>
      </div>
    </Drawer>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide" style={{ color: "var(--text-faint)" }}>
        {title}
      </div>
      <div>{children}</div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border p-2" style={{ borderColor: "var(--border-subtle)", background: "var(--surface-1)" }}>
      <div className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: "var(--text-faint)" }}>{label}</div>
      <div className="mt-0.5 text-[15px] font-semibold tabular-nums" style={{ color: "var(--text-default)" }}>{value}</div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1 text-[12px]">
      <span style={{ color: "var(--text-muted)" }}>{label}</span>
      <span style={{ color: "var(--text-default)" }}>{value}</span>
    </div>
  );
}

function relativeTime(d: Date): string {
  const ms = Date.now() - d.getTime();
  const min = 60_000, hour = 60 * min, day = 24 * hour;
  if (ms < min) return "just now";
  if (ms < hour) return `${Math.floor(ms / min)}m`;
  if (ms < day)  return `${Math.floor(ms / hour)}h`;
  return `${Math.floor(ms / day)}d`;
}
