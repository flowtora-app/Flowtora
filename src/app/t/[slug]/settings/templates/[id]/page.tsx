import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePermission } from "@/lib/tenant";
import { db } from "@/lib/db";
import { Card, CardHeader } from "@/components/Card";
import { Button, Field, Checkbox, TextArea } from "@/components/Field";
import {
  addTemplateItem,
  deleteTemplate,
  deleteTemplateItem,
  updateTemplate,
} from "@/app/actions/checklists";

export default async function TemplateDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string; id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { slug, id } = await params;
  const sp = await searchParams;
  const ctx = await requirePermission(slug, "templates:manage");

  const template = await db.checklistTemplate.findFirst({
    where: { id, tenantId: ctx.tenant.id },
    include: { items: { orderBy: { sortOrder: "asc" } } },
  });
  if (!template) notFound();

  const save = updateTemplate.bind(null, slug, template.id);
  const remove = deleteTemplate.bind(null, slug, template.id);
  const addItem = addTemplateItem.bind(null, slug);
  const kindLabel = template.kind === "ORDER" ? "Production (Order)" : "Install (InstallEvent)";

  return (
    <div className="space-y-6">
      <div className="text-sm">
        <Link href={`/t/${slug}/settings/templates`} className="underline" style={{ color: "var(--text-muted)" }}>
          ← Templates
        </Link>
      </div>

      {sp.error && (
        <div className="rounded-md px-3 py-2 text-sm" style={{ background: "var(--danger-surface)", color: "var(--danger-fg)", border: "1px solid var(--danger-fg)" }}>
          {decodeURIComponent(sp.error)}
        </div>
      )}

      <Card>
        <CardHeader
          title={template.name}
          description={`${kindLabel} · ${template.items.length} item${template.items.length === 1 ? "" : "s"}${template.active ? "" : " · inactive"}`}
          right={
            <form action={remove}>
              <Button type="submit" variant="danger">Delete template</Button>
            </form>
          }
        />
        <form action={save} className="grid grid-cols-3 items-end gap-3 px-5 py-4">
          <div className="col-span-2">
            <Field label="Name" name="name" defaultValue={template.name} required />
          </div>
          <Checkbox name="active" label="Active" defaultChecked={template.active} />
          {ctx.tenant.isGroupRoot && (
            <div className="col-span-3 rounded-md px-3 py-2" style={{ border: "1px solid var(--border-subtle)" }}>
              <Checkbox
                name="shared"
                label="Share with group (child tenants can apply this template to their jobs)"
                defaultChecked={template.shared}
              />
              <p className="mt-1 text-xs" style={{ color: "var(--text-muted)" }}>
                Children apply by reference but the items snapshot at apply-time, so editing
                later doesn&apos;t change in-flight checklists.
              </p>
            </div>
          )}
          <div className="col-span-3">
            <Button type="submit">Save</Button>
          </div>
        </form>
      </Card>

      <Card>
        <CardHeader title="Items" description="Displayed to users in the order they appear here." />
        {template.items.length === 0 ? (
          <p className="px-5 py-4 text-sm" style={{ color: "var(--text-muted)" }}>
            No items yet. Add one below.
          </p>
        ) : (
          <ul>
            {template.items.map((it) => {
              const removeItem = deleteTemplateItem.bind(null, slug, it.id);
              return (
                <li
                  key={it.id}
                  className="flex items-start justify-between gap-4 px-5 py-3 text-sm"
                  style={{ borderTop: "1px solid var(--border-subtle)" }}
                >
                  <div>
                    <div className="font-medium">{it.title}</div>
                    {it.description && (
                      <div className="mt-0.5 whitespace-pre-wrap text-xs" style={{ color: "var(--text-muted)" }}>
                        {it.description}
                      </div>
                    )}
                  </div>
                  <form action={removeItem}>
                    <button type="submit" className="text-xs underline" style={{ color: "var(--danger-fg)" }}>
                      Remove
                    </button>
                  </form>
                </li>
              );
            })}
          </ul>
        )}

        <form action={addItem} className="grid grid-cols-1 gap-3 px-5 py-4" style={{ borderTop: "1px solid var(--border-subtle)" }}>
          <input type="hidden" name="templateId" value={template.id} />
          <Field label="Item title" name="title" placeholder="e.g. Pre-install site measurement" required />
          <TextArea label="Description (optional)" name="description" rows={2} />
          <div>
            <Button type="submit" variant="secondary">Add item</Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
