import { Card, CardHeader } from "@/components/Card";
import { Button, Field, SelectField, TextArea } from "@/components/Field";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { formatDateTime } from "@/lib/format";
import {
  addAdhocInstallChecklistItem,
  addAdhocOrderChecklistItem,
  applyTemplateToInstall,
  applyTemplateToOrder,
  deleteChecklistItem,
  toggleChecklistItem,
} from "@/app/actions/checklists";

type ChecklistItem = {
  id: string;
  title: string;
  description: string | null;
  completedAt: Date | null;
  completedBy: string | null;
};

type Template = { id: string; name: string; active: boolean };

type Scope =
  | { kind: "order"; orderId: string }
  | { kind: "install"; installId: string };

export function ChecklistCard({
  slug,
  scope,
  items,
  templates,
  memberMap,
  canManage,
  title = scope.kind === "order" ? "Production checklist" : "Install checklist",
}: {
  slug: string;
  scope: Scope;
  items: ChecklistItem[];
  templates: Template[];
  memberMap: Map<string, { name: string }>;
  canManage: boolean;
  title?: string;
}) {
  const completed = items.filter((i) => i.completedAt != null).length;
  const activeTemplates = templates.filter((t) => t.active);

  const applyAction =
    scope.kind === "order"
      ? applyTemplateToOrder.bind(null, slug, scope.orderId)
      : applyTemplateToInstall.bind(null, slug, scope.installId);

  const addAdhocAction =
    scope.kind === "order"
      ? addAdhocOrderChecklistItem.bind(null, slug, scope.orderId)
      : addAdhocInstallChecklistItem.bind(null, slug, scope.installId);

  return (
    <Card>
      <CardHeader
        title={title}
        description={
          items.length === 0
            ? "No checklist yet."
            : `${completed} of ${items.length} complete`
        }
      />

      <ul>
        {items.map((it) => {
          const toggle = toggleChecklistItem.bind(null, slug, it.id);
          const remove = deleteChecklistItem.bind(null, slug, it.id);
          const completer = it.completedBy ? memberMap.get(it.completedBy)?.name : null;
          return (
            <li
              key={it.id}
              className="flex items-start gap-3 px-5 py-3"
              style={{ borderTop: "1px solid var(--border)" }}
            >
              {canManage ? (
                <form action={toggle} className="mt-0.5">
                  <SubmitButton aria-label="toggle complete" pendingLabel={
                    <span
                      style={{
                        display: "inline-block",
                        width: 16,
                        height: 16,
                        borderRadius: 4,
                        border: "1px solid var(--border)",
                        background: "var(--surface-3)",
                      }}
                    />
                  }>
                    <span
                      style={{
                        display: "inline-block",
                        width: 16,
                        height: 16,
                        borderRadius: 4,
                        border: "1px solid var(--border)",
                        background: it.completedAt ? "var(--accent)" : "transparent",
                      }}
                    />
                  </SubmitButton>
                </form>
              ) : (
                <span
                  className="mt-0.5"
                  style={{
                    display: "inline-block",
                    width: 16,
                    height: 16,
                    borderRadius: 4,
                    border: "1px solid var(--border)",
                    background: it.completedAt ? "var(--accent)" : "transparent",
                  }}
                />
              )}
              <div className="flex-1">
                <div className={`text-sm ${it.completedAt ? "line-through opacity-70" : "font-medium"}`}>
                  {it.title}
                </div>
                {it.description && (
                  <div className="mt-0.5 whitespace-pre-wrap text-xs" style={{ color: "var(--muted)" }}>
                    {it.description}
                  </div>
                )}
                {it.completedAt && (
                  <div className="mt-0.5 text-xs" style={{ color: "var(--muted)" }}>
                    Completed {formatDateTime(it.completedAt)}
                    {completer && <> by {completer}</>}
                  </div>
                )}
              </div>
              {canManage && (
                <form action={remove}>
                  <SubmitButton className="text-xs underline" style={{ color: "#ff6b6b" }} pendingLabel={<span className="text-xs">Removing…</span>}>
                    Remove
                  </SubmitButton>
                </form>
              )}
            </li>
          );
        })}
      </ul>

      {canManage && (
        <div className="px-5 py-4 space-y-4" style={{ borderTop: "1px solid var(--border)" }}>
          {activeTemplates.length > 0 && (
            <form action={applyAction} className="flex items-end gap-3">
              <div className="flex-1">
                <SelectField
                  label="Apply template"
                  name="templateId"
                  defaultValue=""
                  options={[
                    { value: "", label: "— pick a template —" },
                    ...activeTemplates.map((t) => ({ value: t.id, label: t.name })),
                  ]}
                />
              </div>
              <Button type="submit" variant="secondary">Apply</Button>
            </form>
          )}
          <form action={addAdhocAction} className="space-y-3">
            <div className="text-xs font-medium" style={{ color: "var(--muted)" }}>
              Or add a one-off item
            </div>
            <Field label="Title" name="title" placeholder="e.g. Call customer to confirm install window" required />
            <TextArea label="Description (optional)" name="description" rows={2} />
            <div>
              <Button type="submit" variant="secondary">Add item</Button>
            </div>
          </form>
        </div>
      )}
    </Card>
  );
}
