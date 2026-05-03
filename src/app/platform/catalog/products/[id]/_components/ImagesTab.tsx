import {
  deleteMasterProductImage,
  upsertMasterProductImage,
} from "@/app/actions/platform-catalog";
import type { CatalogDetail } from "@/server/platform/catalog";
import type { MasterImageKind } from "@prisma/client";

const KIND_LABEL: Record<MasterImageKind, string> = {
  HERO:      "Hero",
  GALLERY:   "Gallery",
  MOCKUP:    "Mockup",
  LIFESTYLE: "Lifestyle",
  HOVER:     "Hover",
};

export function ImagesTab({
  detail, canManage,
}: {
  detail: CatalogDetail;
  canManage: boolean;
}) {
  return (
    <div className="space-y-5">
      {detail.images.length === 0 ? (
        <div className="rounded-lg border p-8 text-center text-[13px]"
             style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)", color: "var(--text-muted)" }}>
          No images yet. Add one below — point to any S3 / cloud-storage URL.
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4">
          {detail.images.map((img) => (
            <div key={img.id}
                 className="overflow-hidden rounded-lg border"
                 style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)" }}>
              <div className="aspect-square overflow-hidden"
                   style={{ background: "var(--surface-2)" }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={img.url} alt={img.altText ?? ""}
                     className="h-full w-full object-cover" />
              </div>
              <div className="p-2">
                <div className="flex items-center justify-between">
                  <span className="rounded-full px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
                        style={{ background: "var(--surface-2)", color: "var(--text-default)" }}>
                    {KIND_LABEL[img.kind]}
                  </span>
                  <span className="text-[10px]" style={{ color: "var(--text-muted)" }}>
                    sort {img.sortOrder}
                  </span>
                </div>
                {img.altText && (
                  <p className="mt-1 truncate text-[11px]" style={{ color: "var(--text-muted)" }}
                     title={img.altText}>
                    {img.altText}
                  </p>
                )}
                {canManage && (
                  <form action={deleteMasterProductImage.bind(null, img.id)} className="mt-2">
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
            + Add image
          </summary>
          <form action={upsertMasterProductImage} className="grid grid-cols-1 gap-3 p-4 md:grid-cols-3">
            <input type="hidden" name="productId" value={detail.id} />
            <Field label="URL *" name="url" maxLength={500} placeholder="https://…" wide />
            <Field label="Alt text" name="altText" maxLength={200} />
            <label className="block">
              <span className="block text-[11px] font-medium uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>
                Kind *
              </span>
              <select name="kind" required defaultValue="GALLERY"
                      className="ts-focus mt-1 w-full rounded-md border px-3 py-2 text-[13px]"
                      style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)", color: "var(--text-default)" }}>
                {Object.entries(KIND_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </label>
            <Field label="Sort order" name="sortOrder" type="number"
                   defaultValue={String(detail.images.length)} />
            <div className="md:col-span-3 flex items-end justify-end">
              <button type="submit"
                      className="ts-focus rounded-md px-4 py-2 text-[13px] font-medium"
                      style={{ background: "var(--accent-primary)", color: "var(--accent-on-primary)" }}>
                Save image
              </button>
            </div>
          </form>
        </details>
      )}

      <div className="rounded-md border px-3 py-2 text-[11px]"
           style={{ borderColor: "var(--amber-200)", background: "var(--amber-50)", color: "var(--amber-700)" }}>
        <strong>Direct upload to storage is deferred.</strong> Today the image URL field accepts
        any HTTPS URL — when the storage SDK is wired, an upload widget replaces this row and
        signs the upload through the existing <span className="font-mono">lib/storage</span>{" "}
        path. Mockup placeholder editor (drag a rectangle onto the artwork area) waits on the
        same surface.
      </div>
    </div>
  );
}

function Field({
  label, name, type = "text", placeholder, maxLength, defaultValue, wide,
}: {
  label: string; name: string; type?: string;
  placeholder?: string; maxLength?: number; defaultValue?: string; wide?: boolean;
}) {
  return (
    <label className={"block " + (wide ? "md:col-span-3" : "")}>
      <span className="block text-[11px] font-medium uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>
        {label}
      </span>
      <input type={type} name={name} placeholder={placeholder} maxLength={maxLength} defaultValue={defaultValue}
             className="ts-focus mt-1 w-full rounded-md border px-3 py-2 text-[13px]"
             style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)", color: "var(--text-default)" }} />
    </label>
  );
}
