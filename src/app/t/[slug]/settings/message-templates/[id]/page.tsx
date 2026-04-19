import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePermission } from "@/lib/tenant";
import { db } from "@/lib/db";
import { Card, CardHeader } from "@/components/Card";
import { Button, Checkbox, Field, SelectField, TextArea } from "@/components/Field";
import {
  MESSAGE_TEMPLATE_KINDS,
  extractPlaceholders,
  TEMPLATE_VARIABLES,
} from "@/lib/message-templates";
import {
  updateMessageTemplate,
  deleteMessageTemplate,
} from "@/app/actions/message-templates";

export default async function MessageTemplateDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string; id: string }>;
  searchParams: Promise<{ error?: string; ok?: string }>;
}) {
  const { slug, id } = await params;
  const sp = await searchParams;
  const ctx = await requirePermission(slug, "templates:manage");

  const template = await db.messageTemplate.findFirst({
    where: { id, tenantId: ctx.tenant.id },
  });
  if (!template) notFound();

  const update = updateMessageTemplate.bind(null, slug, template.id);
  const remove = deleteMessageTemplate.bind(null, slug, template.id);

  // Surface any placeholders used in the template so the author can
  // sanity-check them against the known variable set.
  const used = extractPlaceholders(`${template.subject}\n${template.body}`);
  const known = new Set(TEMPLATE_VARIABLES.map((v) => v.path));
  const unknownUsed = used.filter((u) => !known.has(u));

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <div className="text-xs" style={{ color: "var(--text-muted)" }}>
            <Link href={`/t/${slug}/settings/message-templates`} className="underline">
              Messages
            </Link>{" "}
            / {template.name}
          </div>
          <h2 className="mt-1 text-xl font-semibold">{template.name}</h2>
        </div>
        <form action={remove}>
          <Button type="submit" variant="danger">Delete</Button>
        </form>
      </div>

      {sp.error && (
        <div
          className="rounded-md px-4 py-2 text-sm"
          style={{ background: "var(--danger-surface)", color: "var(--danger-fg)", border: "1px solid var(--danger-fg)" }}
        >
          {sp.error}
        </div>
      )}

      {unknownUsed.length > 0 && (
        <div
          className="rounded-md px-4 py-2 text-sm"
          style={{ background: "var(--warning-surface, #3a2a15)", color: "var(--warning-fg, #ffc98b)", border: "1px solid var(--warning-fg, #5b4b20)" }}
        >
          Unknown placeholders will render literally at send time:{" "}
          {unknownUsed.map((u) => `{{${u}}}`).join(", ")}
        </div>
      )}

      <Card>
        <CardHeader title="Edit template" />
        <form action={update} className="space-y-3 px-5 py-4">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Name" name="name" defaultValue={template.name} required />
            <SelectField
              label="Kind"
              name="kind"
              defaultValue={template.kind}
              options={MESSAGE_TEMPLATE_KINDS.map((k) => ({ value: k.value, label: k.label }))}
            />
          </div>
          <Field
            label="Description (internal)"
            name="description"
            defaultValue={template.description ?? ""}
          />
          <Field label="Subject" name="subject" defaultValue={template.subject} required />
          <TextArea
            label="Body"
            name="body"
            rows={12}
            defaultValue={template.body}
            required
          />
          <Checkbox label="Active — available for sending" name="active" defaultChecked={template.active} />
          {ctx.tenant.isGroupRoot && (
            <div className="rounded-md px-3 py-2" style={{ border: "1px solid var(--border-subtle)" }}>
              <Checkbox
                name="shared"
                label="Share with group (child tenants can pick this template when sending)"
                defaultChecked={template.shared}
              />
              <p className="mt-1 text-xs" style={{ color: "var(--text-muted)" }}>
                Children see shared templates with a &ldquo;[Shared]&rdquo; prefix in the picker.
                Subject/body are read at send time, so edits propagate immediately.
              </p>
            </div>
          )}
          <div className="flex items-center gap-2">
            <Button type="submit">Save</Button>
            <Link
              href={`/t/${slug}/settings/message-templates`}
              className="text-xs underline"
              style={{ color: "var(--text-muted)" }}
            >
              Cancel
            </Link>
          </div>
        </form>
      </Card>
    </div>
  );
}
