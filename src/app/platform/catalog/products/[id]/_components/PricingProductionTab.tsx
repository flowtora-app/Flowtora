import { upsertMasterProduct } from "@/app/actions/platform-catalog";
import type { CatalogDetail } from "@/server/platform/catalog";
import { fmtMoneyDecimal } from "../../_components/shared";

export function PricingProductionTab({
  detail, canManage,
}: {
  detail: CatalogDetail;
  canManage: boolean;
}) {
  return (
    <form action={upsertMasterProduct} className="grid grid-cols-1 gap-4 md:grid-cols-2">
      <input type="hidden" name="id" value={detail.id} />

      <Section title="Pricing">
        <Field label="Price from (display dollars)" name="priceFrom"
               defaultValue={(detail.priceFromMinor / 100).toString()}
               type="number" step={0.01} disabled={!canManage}
               hint={`Stored in minor units (cents). Currently ${fmtMoneyDecimal(detail.priceFromMinor)}.`} />
        <Field label="Pricing formula slug" name="pricingFormulaSlug"
               defaultValue={detail.pricingFormulaSlug ?? ""} maxLength={80} disabled={!canManage}
               hint="Links to a future PricingFormula library entry." />
        <TextArea label="Pricing expression (override)" name="pricingExpression"
                  defaultValue={detail.pricingExpression ?? ""} rows={3} disabled={!canManage}
                  hint='Custom expression e.g. "(width * height / 144) * material_rate * (1 + waste/100)"' />
      </Section>

      <Section title="Lead time">
        <Field label="Base lead time (days)" name="leadTimeDays" type="number"
               defaultValue={String(detail.leadTimeDays)} disabled={!canManage} />
        <Field label="Rush lead time (days)" name="rushLeadTimeDays" type="number"
               defaultValue={detail.rushLeadTimeDays != null ? String(detail.rushLeadTimeDays) : ""}
               disabled={!canManage} hint="Blank = no rush option." />
      </Section>

      <Section title="Production">
        <Field label="Required equipment (comma-separated)" name="requiredEquipment"
               defaultValue={detail.requiredEquipment.join(", ")} maxLength={500} disabled={!canManage}
               hint='e.g. "wide_format_printer, cutter, laminator"' />
        <Field label="Capacity unit" name="capacityUnit"
               defaultValue={detail.capacityUnit ?? ""} maxLength={40} disabled={!canManage}
               hint='e.g. "sq_ft_per_hour" / "pcs_per_hour"' />
        <Field label="Capacity value" name="capacityValue" type="number" step={0.01}
               defaultValue={detail.capacityValue != null ? String(detail.capacityValue) : ""}
               disabled={!canManage} />
        <Field label="Waste factor (%)" name="wasteFactorPct" type="number" step={0.01}
               defaultValue={String(detail.wasteFactorPct)} disabled={!canManage} />
      </Section>

      {/* Carry-over hidden fields. */}
      <input type="hidden" name="slug" value={detail.slug} />
      <input type="hidden" name="name" value={detail.name} />
      <input type="hidden" name="sku" value={detail.sku ?? ""} />
      <input type="hidden" name="category" value={detail.category} />
      <input type="hidden" name="industryVertical" value={detail.industryVertical ?? ""} />
      <input type="hidden" name="description" value={detail.description ?? ""} />
      <input type="hidden" name="shortDescription" value={detail.shortDescription ?? ""} />
      <input type="hidden" name="internalNotes" value={detail.internalNotes ?? ""} />
      <input type="hidden" name="tags" value={detail.tags.join(", ")} />
      <input type="hidden" name="status" value={detail.status} />
      <input type="hidden" name="certifications" value={detail.certifications.join(", ")} />
      <input type="hidden" name="complianceNotes" value={detail.complianceNotes ?? ""} />
      <input type="hidden" name="primaryImageUrl" value={detail.primaryImageUrl ?? ""} />
      <input type="hidden" name="seoTitle" value={detail.seoTitle ?? ""} />
      <input type="hidden" name="seoDescription" value={detail.seoDescription ?? ""} />
      <input type="hidden" name="ogImageUrl" value={detail.ogImageUrl ?? ""} />

      {canManage && (
        <div className="md:col-span-2 flex items-end justify-end">
          <button type="submit"
                  className="ts-focus rounded-md px-4 py-2 text-[13px] font-medium"
                  style={{ background: "var(--accent-primary)", color: "var(--accent-on-primary)" }}>
            Save pricing &amp; production
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
  label, name, type = "text", defaultValue, maxLength, disabled, hint, step,
}: {
  label: string; name: string; type?: string; defaultValue?: string;
  maxLength?: number; disabled?: boolean; hint?: string; step?: number;
}) {
  return (
    <label className="block">
      <span className="block text-[11px] font-medium uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>
        {label}
      </span>
      <input type={type} name={name} defaultValue={defaultValue}
             maxLength={maxLength} disabled={disabled} step={step}
             className="ts-focus mt-1 w-full rounded-md border px-3 py-2 text-[13px]"
             style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)", color: "var(--text-default)" }} />
      {hint && <span className="mt-1 block text-[11px]" style={{ color: "var(--text-muted)" }}>{hint}</span>}
    </label>
  );
}

function TextArea({
  label, name, defaultValue, rows = 3, disabled, hint,
}: {
  label: string; name: string; defaultValue?: string; rows?: number;
  disabled?: boolean; hint?: string;
}) {
  return (
    <label className="block md:col-span-2">
      <span className="block text-[11px] font-medium uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>
        {label}
      </span>
      <textarea name={name} defaultValue={defaultValue} rows={rows} disabled={disabled}
                className="ts-focus mt-1 w-full rounded-md border px-3 py-2 font-mono text-[12px]"
                style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)", color: "var(--text-default)" }} />
      {hint && <span className="mt-1 block text-[11px]" style={{ color: "var(--text-muted)" }}>{hint}</span>}
    </label>
  );
}
