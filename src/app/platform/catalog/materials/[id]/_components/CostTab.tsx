import { upsertMasterMaterial } from "@/app/actions/platform-materials";
import type { MaterialDetail } from "@/server/platform/materials";
import { fmtMoneyDecimal4 } from "../../_components/shared";
import { CarryOverInputs, Field, Section } from "./fieldHelpers";

const CONTROLLED = [
  "defaultCost", "defaultUnit", "defaultMarkupPct", "wasteFactorPct", "minOrderQty",
];

export function CostTab({
  detail, canManage,
}: {
  detail: MaterialDetail;
  canManage: boolean;
}) {
  return (
    <form action={upsertMasterMaterial} className="grid grid-cols-1 gap-4 md:grid-cols-2">
      <input type="hidden" name="id" value={detail.id} />

      <Section title="Default cost"
               description="Recommended baseline. Tenants can override per-material when they adopt.">
        <Field label="Default cost (cents)" name="defaultCost" type="number" required
               defaultValue={String(detail.defaultCost)} disabled={!canManage}
               hint={`Stored in minor units. Currently ${fmtMoneyDecimal4(detail.defaultCost)} per ${detail.defaultUnit}.`} />
        <Field label="Default unit" name="defaultUnit" required
               defaultValue={detail.defaultUnit} maxLength={20} disabled={!canManage}
               hint="sq_ft / sq_m / yard / lb / each / linear_ft" />
      </Section>

      <Section title="Markup & waste">
        <Field label="Default markup (%)" name="defaultMarkupPct" type="number" step={0.01}
               defaultValue={String(detail.defaultMarkupPct)} disabled={!canManage}
               hint="Tenants apply this on top of cost when pricing." />
        <Field label="Waste factor (%)" name="wasteFactorPct" type="number" step={0.01}
               defaultValue={String(detail.wasteFactorPct)} disabled={!canManage}
               hint="Production waste — added on top of consumption math." />
      </Section>

      <Section title="Ordering">
        <Field label="Minimum order qty" name="minOrderQty" type="number" step={0.01}
               defaultValue={detail.minOrderQty != null ? String(detail.minOrderQty) : ""}
               disabled={!canManage}
               hint={`Per ${detail.defaultUnit}. Blank = no minimum.`} />
      </Section>

      <CarryOverInputs detail={detail} except={CONTROLLED} />

      {canManage && (
        <div className="md:col-span-2 flex items-end justify-end">
          <button type="submit"
                  className="ts-focus rounded-md px-4 py-2 text-[13px] font-medium"
                  style={{ background: "var(--accent-primary)", color: "var(--accent-on-primary)" }}>
            Save cost &amp; pricing
          </button>
        </div>
      )}
    </form>
  );
}
