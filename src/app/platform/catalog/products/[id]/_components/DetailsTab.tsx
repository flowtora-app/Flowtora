import { upsertMasterProduct } from "@/app/actions/platform-catalog";
import type { CatalogDetail } from "@/server/platform/catalog";
import type { MasterProductCategory } from "@prisma/client";
import { CATEGORY_LABEL } from "../../_components/shared";

const CATEGORIES = Object.keys(CATEGORY_LABEL) as MasterProductCategory[];

export function DetailsTab({
  detail, canManage,
}: {
  detail: CatalogDetail;
  canManage: boolean;
}) {
  return (
    <form action={upsertMasterProduct} className="grid grid-cols-1 gap-4 md:grid-cols-2">
      <input type="hidden" name="id" value={detail.id} />

      <Section title="Identity">
        <Field label="Slug *" name="slug" defaultValue={detail.slug} maxLength={80} disabled={!canManage}
               hint="Lowercase letters, digits, hyphens." />
        <Field label="Name *" name="name" defaultValue={detail.name} maxLength={120} disabled={!canManage} />
        <Field label="SKU" name="sku" defaultValue={detail.sku ?? ""} maxLength={60} disabled={!canManage} />
        <Select label="Category *" name="category" defaultValue={detail.category} disabled={!canManage}
                options={CATEGORIES.map((c) => ({ value: c, label: CATEGORY_LABEL[c] }))} />
        <Field label="Industry vertical" name="industryVertical" defaultValue={detail.industryVertical ?? ""}
               maxLength={80} disabled={!canManage}
               hint="Sign shop / Print shop / Apparel / etc." />
        <Field label="Tags (comma-separated)" name="tags" defaultValue={detail.tags.join(", ")}
               maxLength={500} disabled={!canManage} />
        <Select label="Status *" name="status" defaultValue={detail.status} disabled={!canManage}
                options={[
                  { value: "DRAFT", label: "Draft" },
                  { value: "PUBLISHED", label: "Published" },
                  { value: "ARCHIVED", label: "Archived" },
                ]} />
      </Section>

      <Section title="Customer-facing copy">
        <TextArea label="Short description" name="shortDescription"
                  defaultValue={detail.shortDescription ?? ""} rows={2} maxLength={280} disabled={!canManage}
                  hint="One-liner for cards." />
        <TextArea label="Description (full)" name="description"
                  defaultValue={detail.description ?? ""} rows={6} maxLength={5000} disabled={!canManage}
                  hint="Markdown supported when rendered on tenant catalogs." />
      </Section>

      <Section title="Internal note">
        <TextArea label="Internal notes" name="internalNotes"
                  defaultValue={detail.internalNotes ?? ""} rows={3} maxLength={1000} disabled={!canManage}
                  hint="Never shown to customers — visible to platform staff + tenant admins." />
      </Section>

      <Section title="SEO">
        <Field label="Meta title" name="seoTitle" defaultValue={detail.seoTitle ?? ""}
               maxLength={120} disabled={!canManage} />
        <TextArea label="Meta description" name="seoDescription"
                  defaultValue={detail.seoDescription ?? ""} rows={2} maxLength={280} disabled={!canManage} />
        <Field label="OG image URL" name="ogImageUrl" defaultValue={detail.ogImageUrl ?? ""}
               maxLength={500} disabled={!canManage} />
      </Section>

      {/* Shipping back as hidden so the action carries them over (preserves
          values that other tabs control). */}
      <input type="hidden" name="priceFrom" value={(detail.priceFromMinor / 100).toString()} />
      <input type="hidden" name="pricingFormulaSlug" value={detail.pricingFormulaSlug ?? ""} />
      <input type="hidden" name="pricingExpression" value={detail.pricingExpression ?? ""} />
      <input type="hidden" name="leadTimeDays" value={String(detail.leadTimeDays)} />
      <input type="hidden" name="rushLeadTimeDays" value={detail.rushLeadTimeDays != null ? String(detail.rushLeadTimeDays) : ""} />
      <input type="hidden" name="wasteFactorPct" value={String(detail.wasteFactorPct)} />
      <input type="hidden" name="requiredEquipment" value={detail.requiredEquipment.join(", ")} />
      <input type="hidden" name="capacityUnit" value={detail.capacityUnit ?? ""} />
      <input type="hidden" name="capacityValue" value={detail.capacityValue != null ? String(detail.capacityValue) : ""} />
      <input type="hidden" name="certifications" value={detail.certifications.join(", ")} />
      <input type="hidden" name="complianceNotes" value={detail.complianceNotes ?? ""} />
      <input type="hidden" name="primaryImageUrl" value={detail.primaryImageUrl ?? ""} />

      {canManage && (
        <div className="md:col-span-2 flex items-end justify-end">
          <button type="submit"
                  className="ts-focus rounded-md px-4 py-2 text-[13px] font-medium"
                  style={{ background: "var(--accent-primary)", color: "var(--accent-on-primary)" }}>
            Save details
          </button>
        </div>
      )}
    </form>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border md:col-span-2"
             style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)" }}>
      <div className="border-b px-4 py-3" style={{ borderColor: "var(--border-subtle)" }}>
        <h2 className="text-[14px] font-semibold" style={{ color: "var(--text-default)" }}>{title}</h2>
      </div>
      <div className="grid grid-cols-1 gap-3 p-4 md:grid-cols-2">{children}</div>
    </section>
  );
}

function Field({
  label, name, type = "text", defaultValue, maxLength, disabled, hint,
}: {
  label: string; name: string; type?: string; defaultValue?: string;
  maxLength?: number; disabled?: boolean; hint?: string;
}) {
  return (
    <label className="block">
      <span className="block text-[11px] font-medium uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>
        {label}
      </span>
      <input type={type} name={name} defaultValue={defaultValue}
             maxLength={maxLength} disabled={disabled}
             className="ts-focus mt-1 w-full rounded-md border px-3 py-2 text-[13px]"
             style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)", color: "var(--text-default)" }} />
      {hint && <span className="mt-1 block text-[11px]" style={{ color: "var(--text-muted)" }}>{hint}</span>}
    </label>
  );
}

function TextArea({
  label, name, defaultValue, rows = 3, maxLength, disabled, hint,
}: {
  label: string; name: string; defaultValue?: string; rows?: number;
  maxLength?: number; disabled?: boolean; hint?: string;
}) {
  return (
    <label className="block md:col-span-2">
      <span className="block text-[11px] font-medium uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>
        {label}
      </span>
      <textarea name={name} defaultValue={defaultValue} rows={rows} maxLength={maxLength} disabled={disabled}
                className="ts-focus mt-1 w-full rounded-md border px-3 py-2 text-[13px]"
                style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)", color: "var(--text-default)" }} />
      {hint && <span className="mt-1 block text-[11px]" style={{ color: "var(--text-muted)" }}>{hint}</span>}
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
