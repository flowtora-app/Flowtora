import {
  addEquipmentMaterialCompat,
  removeEquipmentMaterialCompat,
} from "@/app/actions/platform-equipment";
import type { EquipmentDetail } from "@/server/platform/equipment";

export function MaterialsTab({
  detail, allMaterials, canManage,
}: {
  detail: EquipmentDetail;
  allMaterials: { id: string; name: string; category: string; slug: string }[];
  canManage: boolean;
}) {
  // Filter the picker to materials not yet linked.
  const linkedIds = new Set(detail.materials.map((m) => m.materialId));
  const pickable = allMaterials.filter((m) => !linkedIds.has(m.id));

  return (
    <div className="space-y-5">
      <section className="rounded-lg border" style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)" }}>
        <div className="border-b px-4 py-3" style={{ borderColor: "var(--border-subtle)" }}>
          <h2 className="text-[14px] font-semibold" style={{ color: "var(--text-default)" }}>
            Compatible materials ({detail.materials.length})
          </h2>
          <p className="text-[12px]" style={{ color: "var(--text-muted)" }}>
            Materials this equipment can run. Recommended ones are surfaced first when tenants
            adopt the template.
          </p>
        </div>

        {detail.materials.length === 0 ? (
          <div className="px-4 py-8 text-center text-[13px]" style={{ color: "var(--text-muted)" }}>
            No materials linked yet. Add the first one below — at minimum, link the materials
            this equipment can physically run.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead style={{ color: "var(--text-muted)", background: "var(--surface-2)" }}>
                <tr className="text-left">
                  <th className="px-4 py-2 font-medium">Material</th>
                  <th className="px-4 py-2 font-medium">Category</th>
                  <th className="px-4 py-2 font-medium">Notes</th>
                  <th className="px-4 py-2 font-medium">Recommended</th>
                  {canManage && <th className="px-4 py-2 font-medium" />}
                </tr>
              </thead>
              <tbody>
                {detail.materials.map((m) => (
                  <tr key={m.id} style={{ borderTop: "1px solid var(--border-subtle)" }}>
                    <td className="px-4 py-2">
                      <a href={`/platform/catalog/materials/${m.materialId}`}
                         className="hover:underline" style={{ color: "var(--text-default)" }}>
                        {m.materialName}
                      </a>
                      <div className="font-mono text-[10px]" style={{ color: "var(--text-faint)" }}>
                        {m.materialSlug}
                      </div>
                    </td>
                    <td className="px-4 py-2 text-[12px]" style={{ color: "var(--text-muted)" }}>
                      {m.materialCategory}
                    </td>
                    <td className="px-4 py-2 text-[12px]" style={{ color: "var(--text-muted)" }}>
                      {m.notes ?? "—"}
                    </td>
                    <td className="px-4 py-2 text-[12px]"
                        style={{ color: m.recommended ? "var(--success-fg)" : "var(--text-muted)" }}>
                      {m.recommended ? "★ recommended" : "—"}
                    </td>
                    {canManage && (
                      <td className="px-4 py-2 text-right">
                        <form action={removeEquipmentMaterialCompat.bind(null, m.id)}>
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
        )}
      </section>

      {canManage && pickable.length > 0 && (
        <details className="rounded-lg border"
                 style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)" }}>
          <summary className="cursor-pointer border-b px-4 py-3 text-[13px] font-medium"
                   style={{ borderColor: "var(--border-subtle)", color: "var(--text-default)" }}>
            + Link a material
          </summary>
          <form action={addEquipmentMaterialCompat} className="grid grid-cols-1 gap-3 p-4 md:grid-cols-3">
            <input type="hidden" name="equipmentId" value={detail.id} />
            <label className="block md:col-span-2">
              <span className="block text-[11px] font-medium uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>
                Material *
              </span>
              <select name="materialId" required
                      className="ts-focus mt-1 w-full rounded-md border px-3 py-2 text-[13px]"
                      style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)", color: "var(--text-default)" }}>
                <option value="">— Pick material —</option>
                {pickable.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name} · {m.category}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex items-center gap-2 text-[12px]" style={{ color: "var(--text-default)" }}>
              <input type="checkbox" name="recommended" />
              <span>Recommended</span>
            </label>
            <label className="block md:col-span-3">
              <span className="block text-[11px] font-medium uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>
                Notes
              </span>
              <input type="text" name="notes" maxLength={500}
                     placeholder='e.g. "tested with all profiles", "needs custom ICC"'
                     className="ts-focus mt-1 w-full rounded-md border px-3 py-2 text-[13px]"
                     style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)", color: "var(--text-default)" }} />
            </label>
            <div className="md:col-span-3 flex items-end justify-end">
              <button type="submit"
                      className="ts-focus rounded-md px-4 py-2 text-[13px] font-medium"
                      style={{ background: "var(--accent-primary)", color: "var(--accent-on-primary)" }}>
                Add compatibility
              </button>
            </div>
          </form>
        </details>
      )}

      {canManage && pickable.length === 0 && (
        <div className="rounded-md border px-3 py-2 text-[11px]"
             style={{ borderColor: "var(--border-subtle)", background: "var(--surface-2)", color: "var(--text-muted)" }}>
          All ACTIVE materials are already linked. Add more to the Material Library to expand the picker.
        </div>
      )}
    </div>
  );
}
