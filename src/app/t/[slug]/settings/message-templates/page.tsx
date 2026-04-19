import Link from "next/link";
import { requirePermission } from "@/lib/tenant";
import { db } from "@/lib/db";
import { Card, CardHeader } from "@/components/Card";
import { Button, Field, SelectField, TextArea } from "@/components/Field";
import {
  MESSAGE_TEMPLATE_KINDS,
  messageTemplateKindLabel,
  TEMPLATE_VARIABLES,
} from "@/lib/message-templates";
import { createMessageTemplate } from "@/app/actions/message-templates";
import { getGroupContext } from "@/lib/franchise";

export default async function MessageTemplatesPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { slug } = await params;
  const sp = await searchParams;
  const ctx = await requirePermission(slug, "templates:manage");

  // Phase 15 Slice D — merge in shared message templates from the parent group root.
  const group = await getGroupContext(ctx.tenant.id);

  const [own, inherited] = await Promise.all([
    db.messageTemplate.findMany({
      where: { tenantId: ctx.tenant.id },
      orderBy: [{ kind: "asc" }, { name: "asc" }],
    }),
    group.parentTenantId
      ? db.messageTemplate.findMany({
          where: { tenantId: group.parentTenantId, shared: true, active: true },
          orderBy: [{ kind: "asc" }, { name: "asc" }],
        })
      : Promise.resolve([] as Awaited<ReturnType<typeof db.messageTemplate.findMany>>),
  ]);

  type Row = (typeof own)[number] & { inherited: boolean };
  const templates: Row[] = [
    ...own.map((t) => ({ ...t, inherited: false })),
    ...inherited.map((t) => ({ ...t, inherited: true })),
  ];

  const create = createMessageTemplate.bind(null, slug);

  // Group by kind so the list reads like a menu of what goes where.
  const byKind = new Map<string, typeof templates>();
  for (const t of templates) {
    const list = byKind.get(t.kind) ?? [];
    list.push(t);
    byKind.set(t.kind, list);
  }

  return (
    <div className="space-y-6">
      {sp.error && (
        <div
          className="rounded-md px-4 py-2 text-sm"
          style={{ background: "var(--danger-surface)", color: "var(--danger-fg)", border: "1px solid var(--danger-fg)" }}
        >
          {sp.error}
        </div>
      )}

      <Card>
        <CardHeader
          title="Message templates"
          description="Canned customer emails — quote follow-ups, production updates, install reminders. Use {{placeholders}} to drop in customer / job details at send-time."
        />
        <div className="space-y-4 px-5 py-4">
          {templates.length === 0 && (
            <p className="text-sm" style={{ color: "var(--text-muted)" }}>
              No templates yet. Add one below.
            </p>
          )}
          {MESSAGE_TEMPLATE_KINDS.map(({ value, label }) => {
            const list = byKind.get(value) ?? [];
            if (list.length === 0) return null;
            return (
              <div key={value}>
                <div className="mb-2 text-xs font-semibold uppercase" style={{ color: "var(--text-muted)" }}>
                  {label}
                </div>
                <ul className="space-y-2">
                  {list.map((t) => (
                    <li key={t.id} className="flex items-center justify-between gap-3">
                      <div>
                        {t.inherited ? (
                          <span className="text-sm font-medium">{t.name}</span>
                        ) : (
                          <Link
                            href={`/t/${slug}/settings/message-templates/${t.id}`}
                            className="text-sm font-medium underline"
                          >
                            {t.name}
                          </Link>
                        )}
                        <div className="text-xs" style={{ color: "var(--text-muted)" }}>
                          {t.subject}
                          {t.inherited && group.parentName && (
                            <> · <span style={{ color: "var(--accent-primary)" }}>Shared from {group.parentName}</span></>
                          )}
                        </div>
                      </div>
                      {t.inherited ? (
                        <span
                          className="rounded-full px-2 py-0.5 text-xs"
                          style={{ background: "var(--surface-1)", border: "1px solid var(--border-subtle)", color: "var(--text-muted)" }}
                        >
                          Inherited
                        </span>
                      ) : !t.active && (
                        <span
                          className="rounded-full px-2 py-0.5 text-xs"
                          style={{ background: "var(--surface-2)", color: "var(--text-muted)", border: "1px solid var(--border-subtle)" }}
                        >
                          Inactive
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
      </Card>

      <Card>
        <CardHeader title="Create a template" />
        <form action={create} className="space-y-3 px-5 py-4">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Name" name="name" placeholder="e.g. Proof approved — kicking off production" required />
            <SelectField
              label="Kind"
              name="kind"
              defaultValue="CUSTOMER_UPDATE"
              options={MESSAGE_TEMPLATE_KINDS.map((k) => ({ value: k.value, label: k.label }))}
            />
          </div>
          <Field
            label="Description (internal)"
            name="description"
            placeholder="When should I use this template?"
          />
          <Field label="Subject" name="subject" placeholder="Update on your {{quote.number}} — {{tenant.name}}" required />
          <TextArea
            label="Body"
            name="body"
            rows={8}
            placeholder="Hi {{customer.name}},&#10;&#10;..."
            required
          />
          <Button type="submit">Create template</Button>
        </form>
      </Card>

      <Card>
        <CardHeader
          title="Available placeholders"
          description="Paste any of these into the subject or body. Unknown placeholders stay visible so you can spot typos before sending."
        />
        <ul className="grid grid-cols-1 gap-2 px-5 py-4 text-sm sm:grid-cols-2">
          {TEMPLATE_VARIABLES.map((v) => (
            <li key={v.path} className="flex items-baseline gap-2">
              <code className="rounded px-1.5 py-0.5 text-xs" style={{ background: "var(--surface-2)", border: "1px solid var(--border-subtle)", color: "var(--text-default)" }}>
                {`{{${v.path}}}`}
              </code>
              <span className="text-xs" style={{ color: "var(--text-muted)" }}>{v.description}</span>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
