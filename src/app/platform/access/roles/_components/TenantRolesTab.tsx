import { Card, CardBody, CardHeader } from "@/components/ui";
import type { TenantRoleTemplate } from "@/server/platform/roles-page";

// TenantRolesTab — workspace-side default roles. We don't currently
// store a per-tenant override for these defaults; the catalog here
// is the code-level template every fresh workspace ships with. The
// honest deferral note explains the limitation.

export function TenantRolesTab({
  templates,
}: {
  templates: TenantRoleTemplate[];
}) {
  return (
    <div className="space-y-3">
      <Card padding="sm" style={{ borderColor: "var(--amber-200)", background: "var(--amber-50)" }}>
        <p className="text-[12px]" style={{ color: "var(--amber-700)" }}>
          <strong>Read-only catalog.</strong> Tenant-side roles ship with these defaults. Per-workspace overrides
          are configurable inside each tenant&apos;s Settings → Team page; this tab surfaces the platform-wide template
          that fresh workspaces inherit.
        </p>
      </Card>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        {templates.map((t) => (
          <Card key={t.role}>
            <CardHeader title={t.label} description={t.description} />
            <CardBody>
              <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide" style={{ color: "var(--text-faint)" }}>
                Default permissions
              </div>
              <div className="flex flex-wrap gap-1">
                {t.perms.map((p) => (
                  <span key={p} className="inline-flex items-center rounded-full px-1.5 text-[10px] font-mono"
                        style={{ background: "var(--surface-2)", color: "var(--text-muted)" }}>
                    {p}
                  </span>
                ))}
              </div>
            </CardBody>
          </Card>
        ))}
      </div>
    </div>
  );
}
