import { upsertMasterEquipment } from "@/app/actions/platform-equipment";
import type { EquipmentDetail } from "@/server/platform/equipment";
import { CarryOverInputs, Field, Section } from "./fieldHelpers";

const CONTROLLED = [
  "ratedSpeed", "speedUnit", "warmupMinutes", "changeoverMinutes",
  "defaultUptimePct", "defaultWastePct",
];

export function ProductivityTab({
  detail, canManage,
}: {
  detail: EquipmentDetail;
  canManage: boolean;
}) {
  return (
    <form action={upsertMasterEquipment} className="grid grid-cols-1 gap-4 md:grid-cols-2">
      <input type="hidden" name="id" value={detail.id} />

      <Section title="Throughput"
               description="Used by capacity planning + production scheduling once those surfaces ship.">
        <Field label="Rated speed" name="ratedSpeed" type="number" step={0.01}
               defaultValue={detail.ratedSpeed != null ? String(detail.ratedSpeed) : ""}
               disabled={!canManage} />
        <Field label="Speed unit" name="speedUnit" defaultValue={detail.speedUnit ?? ""}
               maxLength={40} disabled={!canManage}
               hint='e.g. "sq_ft_per_hour", "prints_per_hour", "stitches_per_minute"' />
      </Section>

      <Section title="Setup overhead">
        <Field label="Warm-up (minutes)" name="warmupMinutes" type="number"
               defaultValue={String(detail.warmupMinutes)} disabled={!canManage}
               hint="Cold-start to first usable output." />
        <Field label="Changeover (minutes)" name="changeoverMinutes" type="number"
               defaultValue={String(detail.changeoverMinutes)} disabled={!canManage}
               hint="Job → job swap (media + profile + clean)." />
      </Section>

      <Section title="Defaults">
        <Field label="Default uptime (%)" name="defaultUptimePct" type="number" step={0.01}
               defaultValue={String(detail.defaultUptimePct)} disabled={!canManage}
               hint="Fraction of scheduled hours actually producing." />
        <Field label="Default waste (%)" name="defaultWastePct" type="number" step={0.01}
               defaultValue={String(detail.defaultWastePct)} disabled={!canManage}
               hint="Material waste expected during normal operation." />
      </Section>

      <CarryOverInputs detail={detail} except={CONTROLLED} />

      {canManage && (
        <div className="md:col-span-2 flex items-end justify-end">
          <button type="submit"
                  className="ts-focus rounded-md px-4 py-2 text-[13px] font-medium"
                  style={{ background: "var(--accent-primary)", color: "var(--accent-on-primary)" }}>
            Save productivity
          </button>
        </div>
      )}
    </form>
  );
}
