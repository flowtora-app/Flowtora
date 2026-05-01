import { Card, CardBody, CardHeader } from "@/components/ui";
import type { UserOwnedResources } from "@/server/platform/users-list";

// OwnedResourcesTab — counts of resources this user authored,
// derived from audit-log "*.created" rows. The spec calls for
// drill-downs into each list; we surface honest counts today and
// flag the drill-down deferral so it's clear we're not faking
// numbers.

export function OwnedResourcesTab({ counts }: { counts: UserOwnedResources }) {
  const items: { key: keyof UserOwnedResources; label: string; description: string }[] = [
    { key: "quotes",    label: "Quotes",    description: "Draft + sent quotes the user created." },
    { key: "orders",    label: "Jobs",      description: "Work orders the user kicked off." },
    { key: "customers", label: "Customers", description: "Address-book records the user added." },
    { key: "invoices",  label: "Invoices",  description: "Tenant-side invoices the user issued." },
  ];
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {items.map((it) => (
          <Card key={it.key} padding="md">
            <div className="flex flex-col gap-1">
              <span className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>
                {it.label}
              </span>
              <span className="text-[24px] font-semibold tabular-nums" style={{ color: "var(--text-default)" }}>
                {counts[it.key].toLocaleString()}
              </span>
              <span className="text-[10px]" style={{ color: "var(--text-faint)" }}>{it.description}</span>
            </div>
          </Card>
        ))}
      </div>
      <Card padding="md">
        <p className="text-[11px]" style={{ color: "var(--text-faint)" }}>
          Counts derived from audit-log rows tagged <span className="font-mono">*.created</span>.
          Drill-down lists are deferred — when needed, click into the user&apos;s tenant and filter by author.
        </p>
      </Card>
    </div>
  );
}
