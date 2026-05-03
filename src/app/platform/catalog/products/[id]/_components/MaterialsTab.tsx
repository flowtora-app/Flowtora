import {
  deleteMasterProductMaterial,
  upsertMasterProductMaterial,
} from "@/app/actions/platform-catalog";
import type { CatalogDetail } from "@/server/platform/catalog";
import { fmtMoneyDecimal } from "../../_components/shared";

export function MaterialsTab({
  detail, canManage,
}: {
  detail: CatalogDetail;
  canManage: boolean;
}) {
  return (
    <div className="space-y-5">
      {detail.materials.length === 0 ? (
        <div className="rounded-lg border p-8 text-center text-[13px]"
             style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)", color: "var(--text-muted)" }}>
          No bill-of-materials defaults yet. Add the first material below.
        </div>
      ) : (
        <section className="rounded-lg border" style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)" }}>
          <div className="border-b px-4 py-3" style={{ borderColor: "var(--border-subtle)" }}>
            <h2 className="text-[14px] font-semibold" style={{ color: "var(--text-default)" }}>
              Bill of materials ({detail.materials.length})
            </h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead style={{ color: "var(--text-muted)", background: "var(--surface-2)" }}>
                <tr className="text-left">
                  <th className="px-4 py-2 font-medium">Material</th>
                  <th className="px-4 py-2 font-medium">Default consumption</th>
                  <th className="px-4 py-2 text-right font-medium">Cost / unit</th>
                  <th className="px-4 py-2 font-medium">Unit</th>
                  <th className="px-4 py-2 font-medium">Preferred supplier</th>
                  {canManage && <th className="px-4 py-2 font-medium" />}
                </tr>
              </thead>
              <tbody>
                {detail.materials.map((m) => (
                  <tr key={m.id} style={{ borderTop: "1px solid var(--border-subtle)" }}>
                    <td className="px-4 py-2">
                      <span className="font-medium" style={{ color: "var(--text-default)" }}>{m.label}</span>
                      <div className="font-mono text-[11px]" style={{ color: "var(--text-muted)" }}>{m.materialKey}</div>
                    </td>
                    <td className="px-4 py-2 font-mono text-[12px]" style={{ color: "var(--text-default)" }}>
                      {m.defaultConsumption ?? <span style={{ color: "var(--text-faint)" }}>—</span>}
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums" style={{ color: "var(--text-default)" }}>
                      {fmtMoneyDecimal(m.costPerUnit)}
                    </td>
                    <td className="px-4 py-2 text-[12px]" style={{ color: "var(--text-muted)" }}>
                      {m.unit ?? "—"}
                    </td>
                    <td className="px-4 py-2 text-[12px]" style={{ color: "var(--text-muted)" }}>
                      {m.preferredSupplier ?? "—"}
                    </td>
                    {canManage && (
                      <td className="px-4 py-2 text-right">
                        <form action={deleteMasterProductMaterial.bind(null, m.id)}>
                          <button type="submit"
                                  className="ts-focus rounded-md border px-2 py-1 text-[11px] font-medium"
                                  style={{ borderColor: "var(--border-subtle)", color: "var(--danger-fg)", background: "var(--surface-1)" }}>
                            Remove
                          </button>
                        </form>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {canManage && <NewMaterialForm productId={detail.id} />}
    </div>
  );
}

function NewMaterialForm({ productId }: { productId: string }) {
  return (
    <details className="rounded-lg border"
             style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)" }}>
      <summary className="cursor-pointer border-b px-4 py-3 text-[13px] font-medium"
               style={{ borderColor: "var(--border-subtle)", color: "var(--text-default)" }}>
        + Add material
      </summary>
      <form action={upsertMasterProductMaterial} className="grid grid-cols-1 gap-3 p-4 md:grid-cols-3">
        <input type="hidden" name="productId" value={productId} />
        <Field label="Material key *" name="materialKey" maxLength={60} placeholder="vinyl_13oz" />
        <Field label="Label *" name="label" maxLength={120} placeholder="13oz vinyl" />
        <Field label="Default consumption" name="defaultConsumption" maxLength={200}
               placeholder="1.05 * area" />
        <Field label="Cost per unit (cents) *" name="costPerUnit" type="number" placeholder="450" />
        <Field label="Unit" name="unit" maxLength={40} placeholder="sq_ft" />
        <Field label="Preferred supplier" name="preferredSupplier" maxLength={120}
               placeholder="Roland / Mutoh / Avery" />
        <Field label="Notes" name="notes" maxLength={500} wide />
        <div className="md:col-span-3 flex items-end justify-end">
          <button type="submit"
                  className="ts-focus rounded-md px-4 py-2 text-[13px] font-medium"
                  style={{ background: "var(--accent-primary)", color: "var(--accent-on-primary)" }}>
            Save material
          </button>
        </div>
      </form>
    </details>
  );
}

function Field({
  label, name, type = "text", placeholder, maxLength, wide,
}: {
  label: string; name: string; type?: string;
  placeholder?: string; maxLength?: number; wide?: boolean;
}) {
  return (
    <label className={"block " + (wide ? "md:col-span-3" : "")}>
      <span className="block text-[11px] font-medium uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>
        {label}
      </span>
      <input type={type} name={name} placeholder={placeholder} maxLength={maxLength}
             className="ts-focus mt-1 w-full rounded-md border px-3 py-2 text-[13px]"
             style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)", color: "var(--text-default)" }} />
    </label>
  );
}
