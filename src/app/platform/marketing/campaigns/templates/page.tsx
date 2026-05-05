// Page 39 §Templates — manage EmailTemplate rows.

import { requirePlatformStaff } from "@/lib/platform";
import {
  loadEmailTemplates,
} from "@/server/platform/email-campaigns";
import {
  upsertEmailTemplate,
  deleteEmailTemplate,
} from "@/app/actions/platform-email-campaigns";
import { TabsBar } from "../_components/TabsBar";
import { FormError, FormOk, relativeFromNow } from "../_components/shared";

export const dynamic = "force-dynamic";

export default async function TemplatesPage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; error?: string; edit?: string }>;
}) {
  const ctx = await requirePlatformStaff();
  const sp = await searchParams;
  const canWrite = ctx.can("announcement.write");

  const templates = await loadEmailTemplates();
  const editing = sp.edit && sp.edit !== "__new__"
    ? templates.find((t) => t.id === sp.edit)
    : null;
  const isCreating = sp.edit === "__new__";

  return (
    <div className="space-y-5">
      <h1 className="text-[22px] font-semibold leading-tight" style={{ color: "var(--text-default)" }}>
        Email campaigns
      </h1>
      <TabsBar active="templates" />

      <FormOk msg={sp.ok} />
      <FormError msg={sp.error} />

      {canWrite && !isCreating && !editing && (
        <a href="?edit=__new__"
           className="ts-focus inline-block rounded-md px-3 py-1.5 text-[12px] font-semibold"
           style={{ background: "var(--accent-primary)", color: "var(--accent-fg)" }}>
          + New template
        </a>
      )}

      {(isCreating || editing) && canWrite && (
        <form action={upsertEmailTemplate}
              className="flex flex-col gap-2 rounded-lg border p-4"
              style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)" }}>
          {editing && <input type="hidden" name="id" value={editing.id} />}
          <Field label="Name">
            <input name="name" required maxLength={120}
                   defaultValue={editing?.name ?? ""}
                   className="ts-focus w-full rounded-md px-2 py-1.5 text-[12px] outline-none"
                   style={inputStyle()} />
          </Field>
          <div className="grid gap-2 md:grid-cols-2">
            <Field label="Category">
              <input name="category" maxLength={40}
                     defaultValue={editing?.category ?? ""}
                     placeholder="Onboarding / Promo / Lifecycle"
                     className="ts-focus rounded-md px-2 py-1.5 text-[12px] outline-none"
                     style={inputStyle()} />
            </Field>
            <Field label="Description">
              <input name="description" maxLength={400}
                     defaultValue={editing?.description ?? ""}
                     className="ts-focus rounded-md px-2 py-1.5 text-[12px] outline-none"
                     style={inputStyle()} />
            </Field>
          </div>
          <Field label="Body (Markdown)">
            <textarea name="bodyMarkdown" rows={12}
                      defaultValue={editing?.bodyMarkdown ?? "## {{firstName}},\n\nReplace this with your template body.\n\n[Open Flowtora](https://flowtora.com)"}
                      className="ts-focus w-full rounded-md px-3 py-2 font-mono text-[11px] outline-none"
                      style={{ ...inputStyle(), lineHeight: 1.5 }} />
          </Field>
          <Field label="Thumbnail URL">
            <input name="thumbnailUrl" maxLength={500}
                   defaultValue={editing?.thumbnailUrl ?? ""}
                   className="ts-focus w-full rounded-md px-2 py-1.5 text-[12px] outline-none"
                   style={inputStyle()} />
          </Field>
          <div className="flex items-center justify-end gap-2">
            <a href="?" className="text-[11px] underline" style={{ color: "var(--text-muted)" }}>cancel</a>
            <button type="submit"
                    className="ts-focus rounded-md px-3 py-1.5 text-[12px] font-semibold"
                    style={{ background: "var(--accent-primary)", color: "var(--accent-fg)" }}>
              {editing ? "Save changes" : "Create template"}
            </button>
          </div>
        </form>
      )}

      {templates.length === 0 ? (
        <div className="rounded-lg border p-10 text-center text-[12px]"
             style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)", color: "var(--text-muted)" }}>
          No email templates yet.
        </div>
      ) : (
        <ul className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          {templates.map((t) => (
            <li key={t.id}
                className="overflow-hidden rounded-lg border"
                style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)" }}>
              {t.thumbnailUrl ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img src={t.thumbnailUrl} alt={t.name} className="h-32 w-full object-cover"
                     style={{ background: "var(--surface-2)" }} />
              ) : (
                <div className="flex h-32 items-center justify-center text-[28px]"
                     style={{ background: "var(--surface-2)", color: "var(--text-faint)" }}>
                  ✉
                </div>
              )}
              <div className="p-3">
                <div className="flex items-baseline justify-between gap-2">
                  <h3 className="text-[13px] font-semibold" style={{ color: "var(--text-default)" }}>
                    {t.name}
                  </h3>
                  {t.category && (
                    <span className="rounded-full px-1.5 py-0.5 text-[10px] font-medium"
                          style={{ background: "var(--surface-2)", color: "var(--text-muted)" }}>
                      {t.category}
                    </span>
                  )}
                </div>
                {t.description && (
                  <p className="mt-1 text-[11px]" style={{ color: "var(--text-muted)" }}>{t.description}</p>
                )}
                <p className="mt-1 text-[10px]" style={{ color: "var(--text-faint)" }}>
                  Updated {relativeFromNow(t.updatedAt)}
                </p>
                {canWrite && (
                  <div className="mt-2 flex items-center gap-2">
                    <a href={`?edit=${t.id}`}
                       className="ts-focus text-[11px] underline" style={{ color: "var(--accent-primary)" }}>
                      Edit
                    </a>
                    <form action={deleteEmailTemplate}>
                      <input type="hidden" name="id" value={t.id} />
                      <button type="submit"
                              className="text-[11px] underline" style={{ color: "var(--danger-fg)" }}>
                        Delete
                      </button>
                    </form>
                  </div>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[10px] font-medium uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>
        {label}
      </span>
      {children}
    </label>
  );
}

function inputStyle(): React.CSSProperties {
  return {
    background: "var(--surface-1)",
    border: "1px solid var(--border-default)",
    color: "var(--text-default)",
  };
}
