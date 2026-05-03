import {
  deleteMaterialSwatch,
  upsertMaterialSwatch,
} from "@/app/actions/platform-materials";
import type { MaterialDetail } from "@/server/platform/materials";

export function SwatchesTab({
  detail, canManage,
}: {
  detail: MaterialDetail;
  canManage: boolean;
}) {
  return (
    <div className="space-y-5">
      {detail.swatches.length === 0 ? (
        <div className="rounded-lg border p-8 text-center text-[13px]"
             style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)", color: "var(--text-muted)" }}>
          No color swatches yet. Use this for color-bearing materials (vinyl, ink, thread) where
          each color is its own purchasable variant.
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {detail.swatches.map((s) => (
            <div key={s.id}
                 className="overflow-hidden rounded-lg border"
                 style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)" }}>
              <div className="aspect-square"
                   style={{ background: s.imageUrl
                     ? `url(${s.imageUrl}) center/cover`
                     : (s.hex ?? "var(--surface-2)") }}>
                {!s.imageUrl && !s.hex && (
                  <div className="flex h-full items-center justify-center text-[10px]"
                       style={{ color: "var(--text-faint)" }}>
                    No swatch
                  </div>
                )}
              </div>
              <div className="p-3">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-[12px] font-semibold" style={{ color: "var(--text-default)" }}>
                    {s.colorName}
                  </span>
                  {!s.active && (
                    <span className="rounded-full px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide"
                          style={{ background: "var(--surface-2)", color: "var(--text-faint)" }}>
                      Off
                    </span>
                  )}
                </div>
                <div className="font-mono text-[10px]" style={{ color: "var(--text-muted)" }}>
                  {s.colorKey}
                </div>
                <div className="mt-1 flex flex-wrap gap-2 text-[10px]" style={{ color: "var(--text-muted)" }}>
                  {s.hex && <span className="font-mono">{s.hex}</span>}
                  {s.pantoneCode && <span>· {s.pantoneCode}</span>}
                  {s.skuSuffix && <span className="font-mono">· {s.skuSuffix}</span>}
                </div>
                {canManage && (
                  <form action={deleteMaterialSwatch.bind(null, s.id)} className="mt-2">
                    <button type="submit"
                            className="ts-focus w-full rounded-md border px-2 py-1 text-[10px] font-medium"
                            style={{ borderColor: "var(--border-subtle)", color: "var(--danger-fg)", background: "var(--surface-1)" }}>
                      Remove
                    </button>
                  </form>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {canManage && (
        <details className="rounded-lg border"
                 style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)" }}>
          <summary className="cursor-pointer border-b px-4 py-3 text-[13px] font-medium"
                   style={{ borderColor: "var(--border-subtle)", color: "var(--text-default)" }}>
            + Add swatch
          </summary>
          <form action={upsertMaterialSwatch} className="grid grid-cols-1 gap-3 p-4 md:grid-cols-3">
            <input type="hidden" name="materialId" value={detail.id} />
            <Field label="Color name *" name="colorName" maxLength={120}
                   placeholder="e.g. Cardinal Red" />
            <Field label="Color key *" name="colorKey" maxLength={60}
                   placeholder="cardinal_red"
                   hint="Lowercase letters, digits, underscores." />
            <Field label="Hex" name="hex" maxLength={20} placeholder="#C8102E" />
            <Field label="Pantone code" name="pantoneCode" maxLength={20} placeholder="186 C" />
            <Field label="SKU suffix" name="skuSuffix" maxLength={40}
                   placeholder='e.g. "-RED" / "-186"' />
            <Field label="Image URL" name="imageUrl" maxLength={500} />
            <Field label="Sort order" name="sortOrder" type="number" defaultValue={String(detail.swatches.length)} />
            <label className="flex items-center gap-2 text-[12px]" style={{ color: "var(--text-default)" }}>
              <input type="checkbox" name="active" defaultChecked />
              <span>Active</span>
            </label>
            <Field label="Notes" name="notes" maxLength={500} wide />
            <div className="md:col-span-3 flex items-end justify-end">
              <button type="submit"
                      className="ts-focus rounded-md px-4 py-2 text-[13px] font-medium"
                      style={{ background: "var(--accent-primary)", color: "var(--accent-on-primary)" }}>
                Save swatch
              </button>
            </div>
          </form>
        </details>
      )}

      <div className="rounded-md border px-3 py-2 text-[11px]"
           style={{ borderColor: "var(--amber-200)", background: "var(--amber-50)", color: "var(--amber-700)" }}>
        <strong>Pantone library lookup is deferred.</strong> Today the Pantone code is a free-form
        text field. When the Pantone library JSON ships, the field auto-completes against it.
      </div>
    </div>
  );
}

function Field({
  label, name, type = "text", placeholder, maxLength, defaultValue, hint, wide,
}: {
  label: string; name: string; type?: string;
  placeholder?: string; maxLength?: number; defaultValue?: string;
  hint?: string; wide?: boolean;
}) {
  return (
    <label className={"block " + (wide ? "md:col-span-3" : "")}>
      <span className="block text-[11px] font-medium uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>
        {label}
      </span>
      <input type={type} name={name} placeholder={placeholder}
             maxLength={maxLength} defaultValue={defaultValue}
             className="ts-focus mt-1 w-full rounded-md border px-3 py-2 text-[13px]"
             style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)", color: "var(--text-default)" }} />
      {hint && <span className="mt-1 block text-[11px]" style={{ color: "var(--text-muted)" }}>{hint}</span>}
    </label>
  );
}
