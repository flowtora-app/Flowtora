import {
  deleteMasterProductAttribute,
  upsertMasterProductAttribute,
} from "@/app/actions/platform-catalog";
import type { CatalogDetail } from "@/server/platform/catalog";
import type { MasterAttributeType } from "@prisma/client";

const TYPES: { value: MasterAttributeType; label: string }[] = [
  { value: "NUMBER",       label: "Number" },
  { value: "SELECT",       label: "Select" },
  { value: "MULTI_SELECT", label: "Multi-select" },
  { value: "COLOR",        label: "Color (Pantone)" },
  { value: "BOOLEAN",      label: "Yes / no" },
  { value: "DATE",         label: "Date" },
  { value: "FILE_UPLOAD",  label: "File upload" },
  { value: "TEXT",         label: "Text" },
];

export function AttributesTab({
  detail, canManage,
}: {
  detail: CatalogDetail;
  canManage: boolean;
}) {
  return (
    <div className="space-y-5">
      {detail.attributes.length === 0 ? (
        <div className="rounded-lg border p-8 text-center text-[13px]"
             style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)", color: "var(--text-muted)" }}>
          No attributes defined yet. Use the form below to add the first one.
        </div>
      ) : (
        <ul className="space-y-2">
          {detail.attributes.map((a) => (
            <li key={a.id}
                className="grid grid-cols-1 gap-2 rounded-md border px-4 py-3 md:grid-cols-[1fr_auto]"
                style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)" }}>
              <div className="min-w-0">
                <div className="flex flex-wrap items-baseline gap-2">
                  <span className="text-[13px] font-semibold" style={{ color: "var(--text-default)" }}>
                    {a.label}
                  </span>
                  <span className="font-mono text-[11px]" style={{ color: "var(--text-muted)" }}>
                    {a.key}
                  </span>
                  <span className="rounded-full px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
                        style={{ background: "var(--surface-2)", color: "var(--text-default)" }}>
                    {a.type}
                  </span>
                  {a.required && (
                    <span className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: "var(--rose-700)" }}>
                      required
                    </span>
                  )}
                  {!a.customerVisible && (
                    <span className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>
                      internal
                    </span>
                  )}
                </div>
                {a.helpText && (
                  <p className="mt-1 text-[11px]" style={{ color: "var(--text-muted)" }}>
                    {a.helpText}
                  </p>
                )}
                {Boolean(a.options || a.validation || a.defaultValue) && (
                  <pre className="mt-2 max-h-24 overflow-auto rounded-md p-2 text-[10px] whitespace-pre-wrap break-words"
                       style={{ background: "var(--surface-2)", color: "var(--text-muted)" }}>
                    {JSON.stringify({
                      options: a.options ?? undefined,
                      validation: a.validation ?? undefined,
                      defaultValue: a.defaultValue ?? undefined,
                    }, null, 2)}
                  </pre>
                )}
              </div>
              {canManage && (
                <form action={deleteMasterProductAttribute.bind(null, a.id)}>
                  <button type="submit"
                          className="ts-focus rounded-md border px-2.5 py-1.5 text-[11px] font-medium"
                          style={{ borderColor: "var(--border-subtle)", color: "var(--danger-fg)", background: "var(--surface-1)" }}>
                    Remove
                  </button>
                </form>
              )}
            </li>
          ))}
        </ul>
      )}

      {canManage && <NewAttributeForm productId={detail.id} nextSortOrder={detail.attributes.length} />}

      <div className="rounded-md border px-3 py-2 text-[11px]"
           style={{ borderColor: "var(--amber-200)", background: "var(--amber-50)", color: "var(--amber-700)" }}>
        <strong>Conditional visibility runtime is deferred.</strong> The schema captures the
        rule (paste JSON like <span className="font-mono">{`{ "showIf": { "key": "sides", "value": 2 } }`}</span>)
        but the catalog rendering engine that hides/shows fields based on those rules ships with
        the customer-facing builder.
      </div>
    </div>
  );
}

function NewAttributeForm({
  productId, nextSortOrder,
}: {
  productId: string; nextSortOrder: number;
}) {
  return (
    <details className="rounded-lg border"
             style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)" }}>
      <summary className="cursor-pointer border-b px-4 py-3 text-[13px] font-medium"
               style={{ borderColor: "var(--border-subtle)", color: "var(--text-default)" }}>
        + Add attribute
      </summary>
      <form action={upsertMasterProductAttribute} className="grid grid-cols-1 gap-3 p-4 md:grid-cols-3">
        <input type="hidden" name="productId" value={productId} />
        <Field label="Key *" name="key" maxLength={60} placeholder="width" />
        <Field label="Label *" name="label" maxLength={120} placeholder="Width" />
        <label className="block">
          <span className="block text-[11px] font-medium uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>
            Type *
          </span>
          <select name="type" required defaultValue="NUMBER"
                  className="ts-focus mt-1 w-full rounded-md border px-3 py-2 text-[13px]"
                  style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)", color: "var(--text-default)" }}>
            {TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
        </label>
        <Field label="Sort order" name="sortOrder" type="number" defaultValue={String(nextSortOrder)} />
        <label className="flex items-center gap-2 text-[12px]" style={{ color: "var(--text-default)" }}>
          <input type="checkbox" name="required" />
          <span>Required</span>
        </label>
        <label className="flex items-center gap-2 text-[12px]" style={{ color: "var(--text-default)" }}>
          <input type="checkbox" name="customerVisible" defaultChecked />
          <span>Customer visible</span>
        </label>
        <Field label="Help text" name="helpText" maxLength={500} wide />
        <TextArea label="Validation JSON (optional)" name="validationJson" rows={2}
                  hint='e.g. { "min": 1, "max": 1000, "step": 0.5, "unit": "in" }' />
        <TextArea label="Options JSON (SELECT / MULTI_SELECT)" name="optionsJson" rows={2}
                  hint='e.g. [ { "value": "13oz_vinyl", "label": "13oz vinyl" }, ... ]' />
        <TextArea label="Default value JSON (optional)" name="defaultValueJson" rows={2}
                  hint='e.g. 24 / "13oz_vinyl" / true' />
        <div className="md:col-span-3 flex items-end justify-end">
          <button type="submit"
                  className="ts-focus rounded-md px-4 py-2 text-[13px] font-medium"
                  style={{ background: "var(--accent-primary)", color: "var(--accent-on-primary)" }}>
            Save attribute
          </button>
        </div>
      </form>
    </details>
  );
}

function Field({
  label, name, type = "text", defaultValue, maxLength, placeholder, wide,
}: {
  label: string; name: string; type?: string; defaultValue?: string;
  maxLength?: number; placeholder?: string; wide?: boolean;
}) {
  return (
    <label className={"block " + (wide ? "md:col-span-3" : "")}>
      <span className="block text-[11px] font-medium uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>
        {label}
      </span>
      <input type={type} name={name} defaultValue={defaultValue}
             maxLength={maxLength} placeholder={placeholder}
             className="ts-focus mt-1 w-full rounded-md border px-3 py-2 text-[13px]"
             style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)", color: "var(--text-default)" }} />
    </label>
  );
}

function TextArea({
  label, name, rows = 2, hint,
}: {
  label: string; name: string; rows?: number; hint?: string;
}) {
  return (
    <label className="block md:col-span-3">
      <span className="block text-[11px] font-medium uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>
        {label}
      </span>
      <textarea name={name} rows={rows}
                className="ts-focus mt-1 w-full rounded-md border px-3 py-2 font-mono text-[12px]"
                style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)", color: "var(--text-default)" }} />
      {hint && <span className="mt-1 block text-[11px]" style={{ color: "var(--text-muted)" }}>{hint}</span>}
    </label>
  );
}
