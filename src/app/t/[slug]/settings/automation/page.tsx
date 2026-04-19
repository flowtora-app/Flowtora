import { requirePermission } from "@/lib/tenant";
import { db } from "@/lib/db";
import { saveAutomation } from "@/app/actions/settings";
import { Button, SelectField } from "@/components/Field";
import { Card, CardHeader } from "@/components/Card";

// Phase 22 Slice C + D — automation defaults settings page.
//
// Two blocks: auto-assignment (sales rep + production manager) and
// default checklist templates (one for orders, one for installs). Both
// lists are scoped to this tenant — stale picks fall through to null on
// save, so the form is self-healing if a member is deactivated.

export default async function AutomationSettings({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams?: Promise<{ saved?: string; error?: string }>;
}) {
  const { slug } = await params;
  const sp = (await searchParams) ?? {};
  const { tenant } = await requirePermission(slug, "tenant:manage");

  const [members, orderTemplates, installTemplates] = await Promise.all([
    db.membership.findMany({
      where:  { tenantId: tenant.id, status: "ACTIVE" },
      select: { userId: true, user: { select: { name: true, email: true } } },
    }),
    db.checklistTemplate.findMany({
      where:  { tenantId: tenant.id, kind: "ORDER", active: true },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    db.checklistTemplate.findMany({
      where:  { tenantId: tenant.id, kind: "INSTALL", active: true },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
  ]);

  const memberOptions = [
    { value: "", label: "— None (use creator) —" },
    ...members
      .map((m) => ({
        value: m.userId,
        label: m.user?.name || m.user?.email || m.userId,
      }))
      .sort((a, b) => a.label.localeCompare(b.label)),
  ];

  const orderTplOptions = [
    { value: "", label: "— None —" },
    ...orderTemplates.map((t) => ({ value: t.id, label: t.name })),
  ];
  const installTplOptions = [
    { value: "", label: "— None —" },
    ...installTemplates.map((t) => ({ value: t.id, label: t.name })),
  ];

  const action = saveAutomation.bind(null, slug);

  return (
    <div className="space-y-6">
      {sp.saved && (
        <div
          className="rounded-md px-4 py-3 text-xs"
          style={{
            background: "var(--surface-1)",
            border: "1px solid var(--border-subtle)",
            color: "var(--text-muted)",
          }}
        >
          Automation defaults saved.
        </div>
      )}
      {sp.error && (
        <div
          className="rounded-md px-4 py-3 text-xs"
          style={{
            background: "var(--surface-1)",
            border: "1px solid var(--border-subtle)",
            color: "var(--danger)",
          }}
        >
          Could not save: {sp.error}
        </div>
      )}

      <Card>
        <CardHeader
          title="Automation defaults"
          description="House-wide fallbacks applied when a new record is created without an explicit value. Staff can still override on the individual quote or order."
        />
        <form action={action} className="space-y-6 px-5 py-5">
          <div>
            <h3 className="text-sm font-medium">Auto-assignment</h3>
            <p className="mt-1 text-xs" style={{ color: "var(--text-muted)" }}>
              Pre-fill who a new quote or order belongs to. Falls back to the creator if no default is set.
            </p>
            <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <SelectField
                label="Default sales rep on new quotes"
                name="defaultSalesRepId"
                defaultValue={tenant.defaultSalesRepId ?? ""}
                options={memberOptions}
              />
              <SelectField
                label="Default production manager on new orders"
                name="defaultProductionManagerId"
                defaultValue={tenant.defaultProductionManagerId ?? ""}
                options={memberOptions}
              />
            </div>
          </div>

          <div>
            <h3 className="text-sm font-medium">Default checklists</h3>
            <p className="mt-1 text-xs" style={{ color: "var(--text-muted)" }}>
              Auto-apply a template the moment an order or install is created. Manage templates in{" "}
              <a href={`/t/${slug}/settings/templates`} className="underline" style={{ color: "var(--text-default)" }}>
                Checklists
              </a>.
            </p>
            <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <SelectField
                label="Default order checklist"
                name="defaultOrderChecklistTemplateId"
                defaultValue={tenant.defaultOrderChecklistTemplateId ?? ""}
                options={orderTplOptions}
              />
              <SelectField
                label="Default install checklist"
                name="defaultInstallChecklistTemplateId"
                defaultValue={tenant.defaultInstallChecklistTemplateId ?? ""}
                options={installTplOptions}
              />
            </div>
          </div>

          <div className="flex justify-end">
            <Button type="submit">Save</Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
