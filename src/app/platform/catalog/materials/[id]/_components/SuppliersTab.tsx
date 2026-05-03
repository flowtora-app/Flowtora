import {
  deleteMaterialSupplier,
  upsertMaterialSupplier,
} from "@/app/actions/platform-materials";
import type { MaterialDetail } from "@/server/platform/materials";
import { fmtMoneyDecimal4 } from "../../_components/shared";

const STALE_DAYS = 90;

export function SuppliersTab({
  detail, canManage,
}: {
  detail: MaterialDetail;
  canManage: boolean;
}) {
  return (
    <div className="space-y-5">
      {detail.suppliers.length === 0 ? (
        <div className="rounded-lg border p-8 text-center text-[13px]"
             style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)", color: "var(--text-muted)" }}>
          No suppliers yet. Add one below — at least one primary supplier should be on file before
          tenants adopt this material.
        </div>
      ) : (
        <section className="rounded-lg border" style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)" }}>
          <div className="border-b px-4 py-3" style={{ borderColor: "var(--border-subtle)" }}>
            <h2 className="text-[14px] font-semibold" style={{ color: "var(--text-default)" }}>
              Suppliers ({detail.suppliers.length})
            </h2>
            <p className="text-[12px]" style={{ color: "var(--text-muted)" }}>
              Multiple suppliers per material. Primary is what tenants source from by default;
              backups handle stockouts.
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead style={{ color: "var(--text-muted)", background: "var(--surface-2)" }}>
                <tr className="text-left">
                  <th className="px-4 py-2 font-medium">Supplier</th>
                  <th className="px-4 py-2 font-medium">SKU</th>
                  <th className="px-4 py-2 text-right font-medium">Cost</th>
                  <th className="px-4 py-2 text-right font-medium">Lead</th>
                  <th className="px-4 py-2 text-right font-medium">MOQ</th>
                  <th className="px-4 py-2 font-medium">Last priced</th>
                  <th className="px-4 py-2 font-medium">Portal</th>
                  <th className="px-4 py-2 font-medium">Primary</th>
                  {canManage && <th className="px-4 py-2 font-medium" />}
                </tr>
              </thead>
              <tbody>
                {detail.suppliers.map((s) => {
                  const stale = !s.lastPriceUpdate ||
                    s.lastPriceUpdate.getTime() < Date.now() - STALE_DAYS * 86_400_000;
                  return (
                    <tr key={s.id} style={{ borderTop: "1px solid var(--border-subtle)" }}>
                      <td className="px-4 py-2">
                        <div className="font-medium" style={{ color: "var(--text-default)" }}>
                          {s.supplierName}
                        </div>
                        {s.notes && (
                          <div className="text-[11px]" style={{ color: "var(--text-muted)" }}>
                            {s.notes}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-2 font-mono text-[11px]" style={{ color: "var(--text-muted)" }}>
                        {s.supplierSku ?? "—"}
                      </td>
                      <td className="px-4 py-2 text-right tabular-nums" style={{ color: "var(--text-default)" }}>
                        {fmtMoneyDecimal4(s.costAtSupplier)}
                      </td>
                      <td className="px-4 py-2 text-right tabular-nums" style={{ color: "var(--text-muted)" }}>
                        {s.leadTimeDays != null ? `${s.leadTimeDays}d` : "—"}
                      </td>
                      <td className="px-4 py-2 text-right tabular-nums" style={{ color: "var(--text-muted)" }}>
                        {s.moq != null ? s.moq.toLocaleString() : "—"}
                      </td>
                      <td className="px-4 py-2 text-[12px]"
                          style={{ color: stale ? "var(--amber-700)" : "var(--text-muted)" }}>
                        {s.lastPriceUpdate ? s.lastPriceUpdate.toLocaleDateString() : "—"}
                        {stale && (
                          <span className="ml-1 text-[9px] uppercase" style={{ color: "var(--amber-700)" }}>
                            stale
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-2 text-[12px]">
                        {s.portalUrl ? (
                          <a href={s.portalUrl} target="_blank" rel="noopener"
                             className="hover:underline" style={{ color: "var(--accent-primary)" }}>
                            Open ↗
                          </a>
                        ) : (
                          <span style={{ color: "var(--text-faint)" }}>—</span>
                        )}
                      </td>
                      <td className="px-4 py-2 text-[12px]"
                          style={{ color: s.isPrimary ? "var(--success-fg)" : "var(--text-muted)" }}>
                        {s.isPrimary ? "★ primary" : "—"}
                      </td>
                      {canManage && (
                        <td className="px-4 py-2 text-right">
                          <form action={deleteMaterialSupplier.bind(null, s.id)}>
                            <button type="submit"
                                    className="ts-focus rounded-md border px-2 py-1 text-[11px] font-medium"
                                    style={{ borderColor: "var(--border-subtle)", color: "var(--danger-fg)", background: "var(--surface-1)" }}>
                              Remove
                            </button>
                          </form>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {canManage && <NewSupplierForm materialId={detail.id} />}
    </div>
  );
}

function NewSupplierForm({ materialId }: { materialId: string }) {
  return (
    <details className="rounded-lg border"
             style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)" }}>
      <summary className="cursor-pointer border-b px-4 py-3 text-[13px] font-medium"
               style={{ borderColor: "var(--border-subtle)", color: "var(--text-default)" }}>
        + Add supplier
      </summary>
      <form action={upsertMaterialSupplier} className="grid grid-cols-1 gap-3 p-4 md:grid-cols-3">
        <input type="hidden" name="materialId" value={materialId} />
        <Field label="Supplier name *" name="supplierName" maxLength={120}
               placeholder="e.g. Avery Dennison" />
        <Field label="Supplier SKU" name="supplierSku" maxLength={80}
               placeholder='e.g. "MPI 1005 EZ RS"' />
        <Field label="Cost at supplier (cents) *" name="costAtSupplier" type="number"
               defaultValue="0" />
        <Field label="Lead time (days)" name="leadTimeDays" type="number" />
        <Field label="MOQ" name="moq" type="number" step={0.01} />
        <Field label="Portal URL" name="portalUrl" maxLength={500}
               placeholder="https://supplier.example.com" />
        <label className="flex items-center gap-2 text-[12px]" style={{ color: "var(--text-default)" }}>
          <input type="checkbox" name="isPrimary" />
          <span>Mark as primary</span>
        </label>
        <Field label="Notes" name="notes" maxLength={500} wide />
        <div className="md:col-span-3 flex items-end justify-end">
          <button type="submit"
                  className="ts-focus rounded-md px-4 py-2 text-[13px] font-medium"
                  style={{ background: "var(--accent-primary)", color: "var(--accent-on-primary)" }}>
            Save supplier
          </button>
        </div>
      </form>
    </details>
  );
}

function Field({
  label, name, type = "text", placeholder, maxLength, defaultValue, step, wide,
}: {
  label: string; name: string; type?: string;
  placeholder?: string; maxLength?: number; defaultValue?: string;
  step?: number; wide?: boolean;
}) {
  return (
    <label className={"block " + (wide ? "md:col-span-3" : "")}>
      <span className="block text-[11px] font-medium uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>
        {label}
      </span>
      <input type={type} name={name} placeholder={placeholder}
             maxLength={maxLength} defaultValue={defaultValue} step={step}
             className="ts-focus mt-1 w-full rounded-md border px-3 py-2 text-[13px]"
             style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)", color: "var(--text-default)" }} />
    </label>
  );
}
