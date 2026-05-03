import { upsertMasterEquipment } from "@/app/actions/platform-equipment";
import type { EquipmentDetail } from "@/server/platform/equipment";
import { CATEGORY_LABEL } from "../../_components/shared";
import type { MasterEquipmentCategory } from "@prisma/client";
import { CarryOverInputs, Field, Section, Select, TextArea } from "./fieldHelpers";

const CATEGORIES = Object.keys(CATEGORY_LABEL) as MasterEquipmentCategory[];

const CONTROLLED = [
  "slug", "brand", "model", "category", "displayName",
  "maxWidthIn", "maxLengthFt", "colorModes", "inkTypes", "resolution",
  "imageUrl", "manualUrl", "status", "internalNotes", "tags",
];

export function SpecsTab({
  detail, canManage,
}: {
  detail: EquipmentDetail;
  canManage: boolean;
}) {
  return (
    <form action={upsertMasterEquipment} className="grid grid-cols-1 gap-4 md:grid-cols-2">
      <input type="hidden" name="id" value={detail.id} />

      <Section title="Identity">
        <Field label="Slug *" name="slug" defaultValue={detail.slug} maxLength={80} disabled={!canManage}
               hint="Lowercase letters, digits, hyphens or underscores." />
        <Field label="Brand *" name="brand" defaultValue={detail.brand} maxLength={80} disabled={!canManage} />
        <Field label="Model *" name="model" defaultValue={detail.model} maxLength={120} disabled={!canManage} />
        <Field label="Display name" name="displayName" defaultValue={detail.displayName ?? ""}
               maxLength={160} disabled={!canManage}
               hint='Override "<brand> <model>" for the table/header.' />
        <Select label="Category *" name="category" defaultValue={detail.category} disabled={!canManage}
                options={CATEGORIES.map((c) => ({ value: c, label: CATEGORY_LABEL[c] }))} />
        <Select label="Status" name="status" defaultValue={detail.status} disabled={!canManage}
                options={[
                  { value: "ACTIVE", label: "Active" },
                  { value: "DISCONTINUED", label: "Discontinued" },
                ]} />
      </Section>

      <Section title="Capability">
        <Field label="Max width (in)" name="maxWidthIn" type="number" step={0.01}
               defaultValue={detail.maxWidthIn != null ? String(detail.maxWidthIn) : ""}
               disabled={!canManage} hint='Null = N/A (e.g. press, embroidery hoop).' />
        <Field label="Max length (ft)" name="maxLengthFt" type="number" step={0.01}
               defaultValue={detail.maxLengthFt != null ? String(detail.maxLengthFt) : ""}
               disabled={!canManage} hint="Roll-fed only." />
        <Field label="Resolution" name="resolution" defaultValue={detail.resolution ?? ""}
               maxLength={80} disabled={!canManage} placeholder='e.g. "1440 dpi"' />
        <Field label="Color modes (comma-separated)" name="colorModes"
               defaultValue={detail.colorModes.join(", ")}
               maxLength={500} disabled={!canManage}
               placeholder='e.g. "CMYK, CMYKLcLm, CMYKW"' />
        <Field label="Ink / consumable types" name="inkTypes"
               defaultValue={detail.inkTypes.join(", ")}
               maxLength={500} disabled={!canManage}
               placeholder='e.g. "eco-solvent, latex, uv"' />
      </Section>

      <Section title="Internal">
        <Field label="Image URL" name="imageUrl" defaultValue={detail.imageUrl ?? ""}
               maxLength={500} disabled={!canManage} />
        <Field label="Manual URL" name="manualUrl" defaultValue={detail.manualUrl ?? ""}
               maxLength={500} disabled={!canManage} />
        <Field label="Tags (comma-separated)" name="tags" defaultValue={detail.tags.join(", ")}
               maxLength={500} disabled={!canManage} />
        <TextArea label="Internal notes" name="internalNotes"
                  defaultValue={detail.internalNotes ?? ""} rows={3} maxLength={2000} disabled={!canManage}
                  hint="Never customer-facing." />
      </Section>

      <CarryOverInputs detail={detail} except={CONTROLLED} />

      {canManage && (
        <div className="md:col-span-2 flex items-end justify-end">
          <button type="submit"
                  className="ts-focus rounded-md px-4 py-2 text-[13px] font-medium"
                  style={{ background: "var(--accent-primary)", color: "var(--accent-on-primary)" }}>
            Save specs
          </button>
        </div>
      )}
    </form>
  );
}
