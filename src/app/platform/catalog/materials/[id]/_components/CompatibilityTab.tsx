import { upsertMasterMaterial } from "@/app/actions/platform-materials";
import type { MaterialDetail } from "@/server/platform/materials";
import { CarryOverInputs, Field, Section } from "./fieldHelpers";
import { DeferredNote } from "../../_components/shared";

const CONTROLLED = [
  "equipmentCompatibility", "compatibleProductSlugs", "datasheetUrl",
];

export function CompatibilityTab({
  detail, canManage,
}: {
  detail: MaterialDetail;
  canManage: boolean;
}) {
  return (
    <div className="space-y-5">
      <form action={upsertMasterMaterial} className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <input type="hidden" name="id" value={detail.id} />

        <Section title="Equipment compatibility"
                 description="Equipment keys that can run this material. Used by the production planner.">
          <Field label="Equipment keys (comma-separated)" name="equipmentCompatibility"
                 defaultValue={detail.equipmentCompatibility.join(", ")}
                 maxLength={500} disabled={!canManage}
                 hint='e.g. "wide_format_printer, vinyl_cutter, laminator"' wide />
        </Section>

        <Section title="Compatible products"
                 description="Master-product slugs that commonly use this material. Reporting only — actual BOM is on the product.">
          <Field label="Product slugs (comma-separated)" name="compatibleProductSlugs"
                 defaultValue={detail.compatibleProductSlugs.join(", ")}
                 maxLength={500} disabled={!canManage}
                 hint='e.g. "vinyl-banner-13oz, window-decal-printed"' wide />
        </Section>

        <Section title="Datasheet">
          <Field label="Datasheet PDF URL" name="datasheetUrl"
                 defaultValue={detail.datasheetUrl ?? ""}
                 maxLength={500} disabled={!canManage}
                 hint="Manufacturer-supplied spec PDF — public-readable URL." wide />
        </Section>

        <CarryOverInputs detail={detail} except={CONTROLLED} />

        {canManage && (
          <div className="md:col-span-2 flex items-end justify-end">
            <button type="submit"
                    className="ts-focus rounded-md px-4 py-2 text-[13px] font-medium"
                    style={{ background: "var(--accent-primary)", color: "var(--accent-on-primary)" }}>
              Save compatibility
            </button>
          </div>
        )}
      </form>

      {detail.datasheetUrl && (
        <section className="rounded-lg border" style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)" }}>
          <div className="border-b px-4 py-3" style={{ borderColor: "var(--border-subtle)" }}>
            <h2 className="text-[14px] font-semibold" style={{ color: "var(--text-default)" }}>
              Datasheet preview
            </h2>
          </div>
          <div className="p-4 text-[12px]" style={{ color: "var(--text-muted)" }}>
            <a href={detail.datasheetUrl} target="_blank" rel="noopener"
               className="hover:underline" style={{ color: "var(--accent-primary)" }}>
              {detail.datasheetUrl} ↗
            </a>
          </div>
        </section>
      )}

      <DeferredNote>
        <strong>Compatibility-aware production routing is deferred.</strong> Today these fields
        are reporting metadata. When the Equipment Templates page (Page 27) lands, equipment
        keys here drive the routing engine that picks the right printer / cutter for a job.
        Tenant adoption tracking requires the tenant-side material catalog UI.
      </DeferredNote>
    </div>
  );
}
