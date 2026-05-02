"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  Button,
  Card,
  Dialog,
  DialogBody,
  DialogFooter,
  DialogHeader,
  EmptyState,
  Input,
  Textarea,
  useToast,
} from "@/components/ui";
import {
  deleteEvidenceTemplate,
  saveEvidenceTemplate,
} from "@/app/actions/platform-refunds";
import type { EvidenceTemplate } from "@/server/platform/refunds-disputes";

export function TemplatesTab({
  templates, canManage,
}: {
  templates: EvidenceTemplate[];
  canManage: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const [editing, setEditing] = React.useState<EvidenceTemplate | null>(null);
  const [creating, setCreating] = React.useState(false);
  const [busyId, setBusyId] = React.useState<string | null>(null);

  const onDelete = async (id: string) => {
    if (!window.confirm("Delete this template? This can't be undone.")) return;
    setBusyId(id);
    try {
      const fd = new FormData();
      fd.set("id", id);
      const res = await deleteEvidenceTemplate(fd);
      if (res.ok) { toast.success("Template deleted"); router.refresh(); }
      else toast.error(res.error ?? "Couldn't delete");
    } finally { setBusyId(null); }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4">
        <p className="text-[12px] max-w-2xl" style={{ color: "var(--text-muted)" }}>
          Reusable evidence drafts for chargeback responses. Body supports{" "}
          <span className="font-mono">{"{tenant}"}</span>,{" "}
          <span className="font-mono">{"{amount}"}</span>, and{" "}
          <span className="font-mono">{"{date}"}</span> placeholders, which the dispute submission form
          interpolates against the live record.
        </p>
        {canManage && (
          <Button size="sm" onClick={() => setCreating(true)}>+ New template</Button>
        )}
      </div>

      {templates.length === 0 ? (
        <Card padding="lg">
          <EmptyState
            title="No evidence templates yet"
            description="Build reusable drafts so dispute responses go out fast. Common starters: ‘Subscription mistake — refunded’, ‘Service rendered — proof of usage’, ‘Customer dispute resolved offline’."
            action={canManage ? <Button size="sm" onClick={() => setCreating(true)}>+ New template</Button> : undefined}
          />
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          {templates.map((t) => (
            <Card key={t.id} padding="md">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="text-[13px] font-semibold truncate" style={{ color: "var(--text-default)" }}>
                    {t.name}
                  </h3>
                  {t.description && (
                    <p className="mt-0.5 text-[11px]" style={{ color: "var(--text-muted)" }}>
                      {t.description}
                    </p>
                  )}
                </div>
                {canManage && (
                  <div className="flex items-center gap-1">
                    <Button size="sm" variant="ghost" onClick={() => setEditing(t)}>Edit</Button>
                    <Button size="sm" variant="ghost" disabled={busyId === t.id}
                            onClick={() => onDelete(t.id)}>
                      Delete
                    </Button>
                  </div>
                )}
              </div>
              <pre className="mt-2 max-h-40 overflow-auto rounded-md p-2 text-[11px] whitespace-pre-wrap break-words"
                   style={{ background: "var(--surface-2)", color: "var(--text-default)" }}>
                {t.body}
              </pre>
              <p className="mt-2 text-[10px]" style={{ color: "var(--text-faint)" }}>
                Updated {t.updatedAt.toLocaleDateString()} by {t.createdByName ?? "—"}
              </p>
            </Card>
          ))}
        </div>
      )}

      {(creating || editing) && (
        <TemplateEditorDialog
          open
          template={editing}
          onClose={() => { setCreating(false); setEditing(null); }}
        />
      )}
    </div>
  );
}

function TemplateEditorDialog({
  open, template, onClose,
}: {
  open: boolean;
  template: EvidenceTemplate | null;
  onClose: () => void;
}) {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = React.useState(false);
  const [name, setName] = React.useState(template?.name ?? "");
  const [description, setDescription] = React.useState(template?.description ?? "");
  const [body, setBody] = React.useState(template?.body ?? "");

  const onSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setBusy(true);
    try {
      const fd = new FormData();
      if (template) fd.set("id", template.id);
      fd.set("name", name);
      if (description) fd.set("description", description);
      fd.set("body", body);
      const res = await saveEvidenceTemplate(fd);
      if (res.ok) {
        toast.success(template ? "Template saved" : "Template created");
        onClose();
        router.refresh();
      } else toast.error(res.error ?? "Couldn't save");
    } finally { setBusy(false); }
  };

  return (
    <Dialog open={open} onClose={onClose} size="lg">
      <DialogHeader
        title={template ? "Edit evidence template" : "New evidence template"}
        description="Body supports {tenant}, {amount}, {date} placeholders."
        onClose={onClose}
      />
      <DialogBody>
        <form id="evidenceTemplateForm" onSubmit={onSubmit} className="flex flex-col gap-4">
          <Input label="Name" required value={name}
                 onChange={(e) => setName(e.target.value)}
                 hint="Internal — shown when picking a template." />
          <Input label="Description" value={description}
                 onChange={(e) => setDescription(e.target.value)}
                 hint="Optional one-liner explaining when to use this." />
          <Textarea label="Body" required rows={12}
                    value={body}
                    onChange={(e) => setBody(e.target.value)}
                    placeholder={`Hi,\n\nThis charge to {tenant} of {amount} on {date} reflects services rendered. Supporting evidence:\n\n• Subscription was active and used\n• Customer was notified at billing\n• Refund was offered and declined\n\nWe respectfully request the dispute be found in our favour.`} />
        </form>
      </DialogBody>
      <DialogFooter>
        <Button size="sm" variant="ghost" type="button" onClick={onClose}>Cancel</Button>
        <Button size="sm" type="submit" form="evidenceTemplateForm" disabled={busy}>
          {template ? "Save" : "Create"}
        </Button>
      </DialogFooter>
    </Dialog>
  );
}
