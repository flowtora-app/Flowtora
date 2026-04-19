import Link from "next/link";
import { requirePermission } from "@/lib/tenant";
import { db } from "@/lib/db";
import { Card, CardHeader } from "@/components/Card";
import { Button, Field, SelectField } from "@/components/Field";
import { createTemplate } from "@/app/actions/checklists";
import { getGroupContext } from "@/lib/franchise";

export default async function TemplatesPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { slug } = await params;
  const sp = await searchParams;
  const ctx = await requirePermission(slug, "templates:manage");

  // Phase 15 Slice D — merge in shared templates from the parent group root.
  const group = await getGroupContext(ctx.tenant.id);

  const ownPromise = db.checklistTemplate.findMany({
    where: { tenantId: ctx.tenant.id },
    orderBy: [{ kind: "asc" }, { name: "asc" }],
    include: { _count: { select: { items: true } } },
  });
  const inheritedPromise = group.parentTenantId
    ? db.checklistTemplate.findMany({
        where: { tenantId: group.parentTenantId, shared: true, active: true },
        orderBy: [{ kind: "asc" }, { name: "asc" }],
        include: { _count: { select: { items: true } } },
      })
    : (Promise.resolve([]) as typeof ownPromise);
  const [own, inherited] = await Promise.all([ownPromise, inheritedPromise]);

  type Row = (typeof own)[number] & { inherited: boolean };
  const templates: Row[] = [
    ...own.map((t) => ({ ...t, inherited: false })),
    ...inherited.map((t) => ({ ...t, inherited: true })),
  ];

  const orderTemplates = templates.filter((t) => t.kind === "ORDER");
  const installTemplates = templates.filter((t) => t.kind === "INSTALL");
  const create = createTemplate.bind(null, slug);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader
          title="Checklist templates"
          description="Reusable checklists you can apply to any order or install event. Item edits are snapshotted onto the job — later template changes don't reprice in-flight work."
        />
        <form action={create} className="grid grid-cols-4 items-end gap-3 px-5 py-4">
          <div className="col-span-2">
            <Field label="Template name" name="name" placeholder="e.g. Vehicle wrap install" required />
          </div>
          <SelectField
            label="Kind"
            name="kind"
            defaultValue="ORDER"
            options={[
              { value: "ORDER", label: "Production (Order)" },
              { value: "INSTALL", label: "Install (InstallEvent)" },
            ]}
          />
          <Button type="submit">Create</Button>
        </form>
        {sp.error && (
          <div className="px-5 pb-4 text-sm" style={{ color: "var(--danger-fg)" }}>
            {decodeURIComponent(sp.error)}
          </div>
        )}
      </Card>

      <div className="grid grid-cols-2 gap-4">
        <Card>
          <CardHeader title="Production checklists" />
          <TemplateList slug={slug} templates={orderTemplates} parentName={group.parentName} emptyLabel="No production checklists yet." />
        </Card>
        <Card>
          <CardHeader title="Install checklists" />
          <TemplateList slug={slug} templates={installTemplates} parentName={group.parentName} emptyLabel="No install checklists yet." />
        </Card>
      </div>
    </div>
  );
}

function TemplateList({
  slug,
  templates,
  parentName,
  emptyLabel,
}: {
  slug: string;
  templates: {
    id: string;
    name: string;
    active: boolean;
    inherited: boolean;
    _count: { items: number };
  }[];
  parentName: string | null;
  emptyLabel: string;
}) {
  if (templates.length === 0) {
    return (
      <p className="px-5 py-4 text-sm" style={{ color: "var(--text-muted)" }}>
        {emptyLabel}
      </p>
    );
  }
  return (
    <ul>
      {templates.map((t) => (
        <li
          key={t.id}
          className="flex items-center justify-between px-5 py-3 text-sm"
          style={{ borderTop: "1px solid var(--border-subtle)" }}
        >
          <div>
            {t.inherited ? (
              <span className="font-medium">{t.name}</span>
            ) : (
              <Link href={`/t/${slug}/settings/templates/${t.id}`} className="font-medium underline">
                {t.name}
              </Link>
            )}
            <div className="text-xs" style={{ color: "var(--text-muted)" }}>
              {t._count.items} item{t._count.items === 1 ? "" : "s"}
              {!t.active && " · inactive"}
              {t.inherited && parentName && (
                <> · <span style={{ color: "var(--accent-primary)" }}>Shared from {parentName}</span></>
              )}
            </div>
          </div>
          {t.inherited ? (
            <span className="text-xs" style={{ color: "var(--text-muted)" }}>Read-only</span>
          ) : (
            <Link href={`/t/${slug}/settings/templates/${t.id}`} className="text-xs underline" style={{ color: "var(--text-muted)" }}>
              Edit →
            </Link>
          )}
        </li>
      ))}
    </ul>
  );
}
