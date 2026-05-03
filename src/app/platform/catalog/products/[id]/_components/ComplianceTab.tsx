import { upsertMasterProduct } from "@/app/actions/platform-catalog";
import type { CatalogDetail } from "@/server/platform/catalog";

export function ComplianceTab({
  detail, canManage,
}: {
  detail: CatalogDetail;
  canManage: boolean;
}) {
  return (
    <form action={upsertMasterProduct} className="rounded-lg border"
          style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)" }}>
      <input type="hidden" name="id" value={detail.id} />

      <div className="border-b px-4 py-3" style={{ borderColor: "var(--border-subtle)" }}>
        <h2 className="text-[14px] font-semibold" style={{ color: "var(--text-default)" }}>
          Compliance &amp; certifications
        </h2>
        <p className="text-[12px]" style={{ color: "var(--text-muted)" }}>
          Material certifications + regulatory notes that surface on tenant catalogs and
          customer-facing product pages where applicable (e.g. CPSIA toy compliance).
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 p-4 md:grid-cols-2">
        <Field label="Certifications (comma-separated)" name="certifications"
               defaultValue={detail.certifications.join(", ")} maxLength={500} disabled={!canManage}
               hint="e.g. CPSIA, OEKO-TEX, FIRE_RATED, GREENGUARD" wide />

        <TextArea label="Compliance notes" name="complianceNotes"
                  defaultValue={detail.complianceNotes ?? ""} rows={6} maxLength={2000} disabled={!canManage}
                  hint="Long-form regulatory context — tenant catalogs surface this on product detail." />
      </div>

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
      <input type="hidden" name="priceFrom" value={(detail.priceFromMinor / 100).toString()} />
      <input type="hidden" name="pricingFormulaSlug" value={detail.pricingFormulaSlug ?? ""} />
      <input type="hidden" name="pricingExpression" value={detail.pricingExpression ?? ""} />
      <input type="hidden" name="leadTimeDays" value={String(detail.leadTimeDays)} />
      <input type="hidden" name="rushLeadTimeDays" value={detail.rushLeadTimeDays != null ? String(detail.rushLeadTimeDays) : ""} />
      <input type="hidden" name="wasteFactorPct" value={String(detail.wasteFactorPct)} />
      <input type="hidden" name="requiredEquipment" value={detail.requiredEquipment.join(", ")} />
      <input type="hidden" name="capacityUnit" value={detail.capacityUnit ?? ""} />
      <input type="hidden" name="capacityValue" value={detail.capacityValue != null ? String(detail.capacityValue) : ""} />
      <input type="hidden" name="primaryImageUrl" value={detail.primaryImageUrl ?? ""} />
      <input type="hidden" name="seoTitle" value={detail.seoTitle ?? ""} />
      <input type="hidden" name="seoDescription" value={detail.seoDescription ?? ""} />
      <input type="hidden" name="ogImageUrl" value={detail.ogImageUrl ?? ""} />

      {canManage && (
        <div className="border-t px-4 py-3 text-right"
             style={{ borderColor: "var(--border-subtle)" }}>
          <button type="submit"
                  className="ts-focus rounded-md px-4 py-2 text-[13px] font-medium"
                  style={{ background: "var(--accent-primary)", color: "var(--accent-on-primary)" }}>
            Save compliance
          </button>
        </div>
      )}
    </form>
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
