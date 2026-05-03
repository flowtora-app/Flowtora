import { upsertMasterMaterial } from "@/app/actions/platform-materials";
import type { MaterialDetail } from "@/server/platform/materials";
import { CATEGORY_LABEL, FINISH_LABEL, USAGE_LABEL } from "../../_components/shared";
import type { MasterMaterialCategory, MasterMaterialFinish, MasterMaterialUsage } from "@prisma/client";
import { CarryOverInputs, Field, Section, Select, TextArea } from "./fieldHelpers";

const CATEGORIES = Object.keys(CATEGORY_LABEL) as MasterMaterialCategory[];
const FINISHES = Object.keys(FINISH_LABEL) as MasterMaterialFinish[];
const USAGES = Object.keys(USAGE_LABEL) as MasterMaterialUsage[];

const CONTROLLED = [
  "slug", "name", "sku", "category", "subcategory",
  "widthIn", "rollLengthFt", "thicknessMil", "gsm",
  "colorHex", "pantoneCode", "finish", "usage",
  "durabilityYears", "fireRating", "recyclable", "opacityPct", "adhesiveType",
  "imageUrl", "internalNotes", "tags", "status",
];

export function SpecsTab({
  detail, canManage,
}: {
  detail: MaterialDetail;
  canManage: boolean;
}) {
  return (
    <form action={upsertMasterMaterial} className="grid grid-cols-1 gap-4 md:grid-cols-2">
      <input type="hidden" name="id" value={detail.id} />

      <Section title="Identity">
        <Field label="Slug *" name="slug" defaultValue={detail.slug} maxLength={80} disabled={!canManage}
               hint="Lowercase letters, digits, hyphens or underscores." />
        <Field label="Name *" name="name" defaultValue={detail.name} maxLength={120} disabled={!canManage} />
        <Field label="SKU" name="sku" defaultValue={detail.sku ?? ""} maxLength={60} disabled={!canManage} />
        <Select label="Category *" name="category" defaultValue={detail.category} disabled={!canManage}
                options={CATEGORIES.map((c) => ({ value: c, label: CATEGORY_LABEL[c] }))} />
        <Field label="Subcategory" name="subcategory" defaultValue={detail.subcategory ?? ""}
               maxLength={60} disabled={!canManage}
               hint="Cast / Calendared / Reflective / Coroplast / Aluminum / Eco-solvent / etc." />
        <Select label="Status" name="status" defaultValue={detail.status} disabled={!canManage}
                options={[
                  { value: "ACTIVE", label: "Active" },
                  { value: "DISCONTINUED", label: "Discontinued" },
                ]} />
      </Section>

      <Section title="Dimensions">
        <Field label="Width (in)" name="widthIn" type="number" step={0.01}
               defaultValue={detail.widthIn != null ? String(detail.widthIn) : ""}
               disabled={!canManage} />
        <Field label="Roll length (ft)" name="rollLengthFt" type="number" step={0.01}
               defaultValue={detail.rollLengthFt != null ? String(detail.rollLengthFt) : ""}
               disabled={!canManage} />
        <Field label="Thickness (mil)" name="thicknessMil" type="number" step={0.001}
               defaultValue={detail.thicknessMil != null ? String(detail.thicknessMil) : ""}
               disabled={!canManage} />
        <Field label="GSM (g/m²)" name="gsm" type="number"
               defaultValue={detail.gsm != null ? String(detail.gsm) : ""}
               disabled={!canManage} />
      </Section>

      <Section title="Color & finish">
        <Field label="Color hex" name="colorHex" defaultValue={detail.colorHex ?? ""}
               maxLength={20} disabled={!canManage}
               hint="e.g. #FFFFFF — null when multi-color or N/A." />
        <Field label="Pantone code" name="pantoneCode" defaultValue={detail.pantoneCode ?? ""}
               maxLength={20} disabled={!canManage}
               placeholder="e.g. 186 C" />
        <Select label="Finish" name="finish" defaultValue={detail.finish ?? ""} disabled={!canManage}
                options={[
                  { value: "", label: "—" },
                  ...FINISHES.map((f) => ({ value: f, label: FINISH_LABEL[f] })),
                ]} />
        <Select label="Usage" name="usage" defaultValue={detail.usage} disabled={!canManage}
                options={USAGES.map((u) => ({ value: u, label: USAGE_LABEL[u] }))} />
      </Section>

      <Section title="Durability & compliance">
        <Field label="Durability (years)" name="durabilityYears" type="number"
               defaultValue={detail.durabilityYears != null ? String(detail.durabilityYears) : ""}
               disabled={!canManage} hint="Outdoor lifetime — typically 1, 3, 5, 7+." />
        <Field label="Fire rating" name="fireRating" defaultValue={detail.fireRating ?? ""}
               maxLength={60} disabled={!canManage}
               placeholder='e.g. "NFPA 701", "Class A"' />
        <label className="flex items-center gap-2 text-[12px]" style={{ color: "var(--text-default)" }}>
          <input type="checkbox" name="recyclable" defaultChecked={detail.recyclable} disabled={!canManage} />
          <span>Recyclable</span>
        </label>
        <Field label="Opacity (%)" name="opacityPct" type="number"
               defaultValue={detail.opacityPct != null ? String(detail.opacityPct) : ""}
               disabled={!canManage} hint="0 = clear, 100 = fully opaque." />
        <Field label="Adhesive type" name="adhesiveType" defaultValue={detail.adhesiveType ?? ""}
               maxLength={60} disabled={!canManage}
               placeholder='e.g. "permanent", "removable", "low-tack"' />
      </Section>

      <Section title="Internal">
        <Field label="Image URL" name="imageUrl" defaultValue={detail.imageUrl ?? ""}
               maxLength={500} disabled={!canManage} />
        <Field label="Tags (comma-separated)" name="tags" defaultValue={detail.tags.join(", ")}
               maxLength={500} disabled={!canManage} />
        <TextArea label="Internal notes" name="internalNotes"
                  defaultValue={detail.internalNotes ?? ""} rows={3} maxLength={2000} disabled={!canManage}
                  hint="Never customer-facing. Visible to platform staff + tenant admins." />
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
