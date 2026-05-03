import { upsertPricingFormula } from "@/app/actions/platform-pricing-formulas";
import type { PricingFormulaDetail } from "@/server/platform/pricing-formulas";
import { CATEGORY_LABEL, DeferredNote } from "../../_components/shared";
import type { PricingFormulaCategory } from "@prisma/client";

const CATEGORIES = Object.keys(CATEGORY_LABEL) as PricingFormulaCategory[];

const HELP_TEXT = `Available helpers in scope:
• Math, min, max, round, ceil, floor, abs, pow, sqrt
• area(width_in, height_in) → square feet
• perimeter(width_in, height_in) → linear feet
• volume(w, h, d) → cubic feet
• tier(qty) → unit price from tier table
• lookup(qty) → full tier row { qty, unitPrice }
• ifElse(cond, a, b) — alternative to ternary

All declared variables + constants are available by their key.
Return a single number. Negative results are rejected.`;

export function DefinitionTab({
  detail, canManage,
}: {
  detail: PricingFormulaDetail;
  canManage: boolean;
}) {
  return (
    <form action={upsertPricingFormula} className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <input type="hidden" name="id" value={detail.id} />

      <Section title="Identity" className="lg:col-span-2">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <Field label="Slug *" name="slug" defaultValue={detail.slug} maxLength={80} disabled={!canManage}
                 hint="Lowercase letters, digits, hyphens or underscores." />
          <Field label="Name *" name="name" defaultValue={detail.name} maxLength={120} disabled={!canManage} />
          <Select label="Category *" name="category" defaultValue={detail.category} disabled={!canManage}
                  options={CATEGORIES.map((c) => ({ value: c, label: CATEGORY_LABEL[c] }))} />
          <Select label="Status" name="status" defaultValue={detail.status} disabled={!canManage}
                  options={[
                    { value: "DRAFT", label: "Draft" },
                    { value: "PUBLISHED", label: "Published" },
                    { value: "ARCHIVED", label: "Archived" },
                  ]} />
          <Field label="Tags (comma-separated)" name="tags" defaultValue={detail.tags.join(", ")}
                 maxLength={500} disabled={!canManage} wide />
          <TextArea label="Description" name="description"
                    defaultValue={detail.description ?? ""} rows={2} maxLength={2000} disabled={!canManage} />
          <TextArea label="Summary (human-readable)" name="summary"
                    defaultValue={detail.summary ?? ""} rows={2} maxLength={1000} disabled={!canManage}
                    hint='e.g. "Cost × area × waste + finishing + setup × (1 + markup)"' />
        </div>
      </Section>

      <Section title="Variables (declared inputs)">
        <TextArea
          label="Variables JSON"
          name="variablesJson"
          defaultValue={JSON.stringify(detail.variables, null, 2)}
          rows={12}
          disabled={!canManage}
          mono
          hint='Array of { key, type, label, default?, min?, max?, step?, options?, required? }'
        />
      </Section>

      <Section title="Constants (shop defaults)">
        <TextArea
          label="Constants JSON"
          name="constantsJson"
          defaultValue={JSON.stringify(detail.constants, null, 2)}
          rows={12}
          disabled={!canManage}
          mono
          hint='Array of { key, value (number), label?, description? }'
        />
      </Section>

      <Section title="Tier table (for TIERED_QTY formulas)" className="lg:col-span-2">
        <TextArea
          label="Tier table JSON"
          name="tierTableJson"
          defaultValue={detail.tierTable ? JSON.stringify(detail.tierTable, null, 2) : ""}
          rows={6}
          disabled={!canManage}
          mono
          hint='Array of { qty (number), unitPrice (number) }, sorted ascending. Leave blank to disable.'
        />
      </Section>

      <Section title="Expression" className="lg:col-span-2">
        <TextArea
          label="Expression *"
          name="expression"
          defaultValue={detail.expression}
          rows={10}
          disabled={!canManage}
          mono
          hint={HELP_TEXT}
        />
      </Section>

      <Section title="Internal" className="lg:col-span-2">
        <TextArea label="Internal notes" name="internalNotes"
                  defaultValue={detail.internalNotes ?? ""} rows={3} maxLength={2000} disabled={!canManage}
                  hint="Never customer-facing — visible to platform staff + tenant admins." />
      </Section>

      {canManage && (
        <div className="lg:col-span-2 flex items-end justify-end">
          <button type="submit"
                  className="ts-focus rounded-md px-4 py-2 text-[13px] font-medium"
                  style={{ background: "var(--accent-primary)", color: "var(--accent-on-primary)" }}>
            Save definition
          </button>
        </div>
      )}

      <DeferredNote>
        <strong>Monaco IDE editor is deferred.</strong> Today the expression + JSON fields are
        plain textareas. The Monaco-powered editor with autocomplete + syntax highlighting +
        inline error markers ships with the next catalog pass. The evaluator already validates
        + rejects unsafe tokens (eval, Function, fetch, process, etc.) before running anything.
      </DeferredNote>
    </form>
  );
}

function Section({
  title, children, className,
}: {
  title: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={"rounded-lg border " + (className ?? "")}
             style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)" }}>
      <div className="border-b px-4 py-3" style={{ borderColor: "var(--border-subtle)" }}>
        <h2 className="text-[14px] font-semibold" style={{ color: "var(--text-default)" }}>{title}</h2>
      </div>
      <div className="p-4">{children}</div>
    </section>
  );
}

function Field({
  label, name, defaultValue, maxLength, disabled, hint, wide,
}: {
  label: string; name: string; defaultValue?: string;
  maxLength?: number; disabled?: boolean; hint?: string; wide?: boolean;
}) {
  return (
    <label className={"block " + (wide ? "md:col-span-2" : "")}>
      <span className="block text-[11px] font-medium uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>
        {label}
      </span>
      <input type="text" name={name} defaultValue={defaultValue}
             maxLength={maxLength} disabled={disabled}
             className="ts-focus mt-1 w-full rounded-md border px-3 py-2 text-[13px]"
             style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)", color: "var(--text-default)" }} />
      {hint && <span className="mt-1 block text-[11px]" style={{ color: "var(--text-muted)" }}>{hint}</span>}
    </label>
  );
}

function TextArea({
  label, name, defaultValue, rows = 3, maxLength, disabled, hint, mono,
}: {
  label: string; name: string; defaultValue?: string; rows?: number;
  maxLength?: number; disabled?: boolean; hint?: string; mono?: boolean;
}) {
  return (
    <label className="block">
      <span className="block text-[11px] font-medium uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>
        {label}
      </span>
      <textarea name={name} defaultValue={defaultValue} rows={rows} maxLength={maxLength} disabled={disabled}
                className={"ts-focus mt-1 w-full rounded-md border px-3 py-2 " + (mono ? "font-mono text-[12px]" : "text-[13px]")}
                style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)", color: "var(--text-default)" }} />
      {hint && (
        <pre className="mt-1 whitespace-pre-wrap text-[10px]" style={{ color: "var(--text-muted)" }}>
          {hint}
        </pre>
      )}
    </label>
  );
}

function Select({
  label, name, defaultValue, disabled, options,
}: {
  label: string; name: string; defaultValue?: string; disabled?: boolean;
  options: { value: string; label: string }[];
}) {
  return (
    <label className="block">
      <span className="block text-[11px] font-medium uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>
        {label}
      </span>
      <select name={name} defaultValue={defaultValue} disabled={disabled}
              className="ts-focus mt-1 w-full rounded-md border px-3 py-2 text-[13px]"
              style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)", color: "var(--text-default)" }}>
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </label>
  );
}
