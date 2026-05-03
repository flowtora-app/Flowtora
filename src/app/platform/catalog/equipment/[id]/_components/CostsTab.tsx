import { upsertMasterEquipment } from "@/app/actions/platform-equipment";
import type { EquipmentDetail } from "@/server/platform/equipment";
import { fmtMoneyDecimal } from "../../_components/shared";
import { CarryOverInputs, Field, Section } from "./fieldHelpers";

const CONTROLLED = [
  "purchaseCostMinor", "depreciationYears", "hourlyOperatingCostMinor",
];

export function CostsTab({
  detail, canManage,
}: {
  detail: EquipmentDetail;
  canManage: boolean;
}) {
  // Simple monthly depreciation = purchaseCost / (years × 12).
  const monthlyDepMinor = detail.purchaseCostMinor === 0 || detail.depreciationYears === 0
    ? 0
    : Math.round(detail.purchaseCostMinor / (detail.depreciationYears * 12));

  return (
    <form action={upsertMasterEquipment} className="grid grid-cols-1 gap-4 md:grid-cols-2">
      <input type="hidden" name="id" value={detail.id} />

      <Section title="Purchase + depreciation">
        <Field label="Purchase cost (cents)" name="purchaseCostMinor" type="number"
               defaultValue={String(detail.purchaseCostMinor)} disabled={!canManage}
               hint={`Stored in minor units. Currently ${fmtMoneyDecimal(detail.purchaseCostMinor)}.`} />
        <Field label="Depreciation life (years)" name="depreciationYears" type="number"
               defaultValue={String(detail.depreciationYears)} disabled={!canManage}
               hint={`Straight-line — implied monthly: ${fmtMoneyDecimal(monthlyDepMinor)}.`} />
      </Section>

      <Section title="Operating cost"
               description="Per-hour total of energy + supplies + labor when this equipment is running.">
        <Field label="Hourly operating cost (cents)" name="hourlyOperatingCostMinor" type="number"
               defaultValue={String(detail.hourlyOperatingCostMinor)} disabled={!canManage}
               hint={`Currently ${fmtMoneyDecimal(detail.hourlyOperatingCostMinor)} per hour.`} />
      </Section>

      <CarryOverInputs detail={detail} except={CONTROLLED} />

      {canManage && (
        <div className="md:col-span-2 flex items-end justify-end">
          <button type="submit"
                  className="ts-focus rounded-md px-4 py-2 text-[13px] font-medium"
                  style={{ background: "var(--accent-primary)", color: "var(--accent-on-primary)" }}>
            Save costs
          </button>
        </div>
      )}
    </form>
  );
}
