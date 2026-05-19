import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePermission } from "@/lib/tenant";
import { db } from "@/lib/db";
import { updateMaterial } from "@/app/actions/materials";
import { Card } from "@/components/Card";

// Material edit page (T-11).
//
// Mirrors /new but pre-fills with the existing record. Note that
// currentStock is intentionally not editable here — receive / use /
// count adjustments go through the dedicated stock-adjust form on the
// detail page so the motivation for the change is captured.

export const dynamic = "force-dynamic";

const UNITS = ["yd", "ft", "sheet", "ea", "bottle", "spool", "roll", "gal", "lb"];

const inputStyle = {
  width: "100%",
  height: 40,
  padding: "0 12px",
  borderRadius: 8,
  background: "var(--surface-1)",
  border: "1px solid var(--border-subtle)",
  color: "var(--text-default)",
  fontSize: 13,
  outline: "none",
  letterSpacing: "-0.005em",
} as const;

const labelStyle = {
  display: "block" as const,
  marginBottom: 6,
  color: "var(--text-default)",
  fontSize: 12.5,
  fontWeight: 600 as const,
  letterSpacing: "-0.005em",
};

export default async function EditMaterialPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string; id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { slug, id } = await params;
  const sp = await searchParams;
  const ctx = await requirePermission(slug, "customers:view");

  const [material, vendors] = await Promise.all([
    db.material.findFirst({ where: { id, tenantId: ctx.tenant.id } }),
    db.vendor.findMany({
      where: { tenantId: ctx.tenant.id, active: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
  ]);

  if (!material) notFound();

  const action = updateMaterial.bind(null, slug, material.id);

  // Ensure the material's existing unit appears even if it's not in the
  // standard UNITS list (e.g. legacy data with "case").
  const unitOptions = UNITS.includes(material.unit)
    ? UNITS
    : [material.unit, ...UNITS];

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <div style={{ fontSize: 12 }}>
        <Link
          href={`/t/${slug}/materials/${material.id}`}
          className="ts-focus inline-flex items-center gap-1 transition-colors hover:text-[var(--text-default)]"
          style={{ color: "var(--text-muted)" }}
        >
          ← {material.name}
        </Link>
      </div>

      <header
        className="relative overflow-hidden rounded-2xl"
        style={{
          padding: "18px 22px",
          background:
            "radial-gradient(720px circle at -8% -40%, var(--accent-surface), transparent 55%), " +
            "linear-gradient(180deg, color-mix(in oklab, var(--surface-1) 92%, white 8%) 0%, var(--surface-1) 100%)",
          border: "1px solid var(--border-subtle)",
          boxShadow:
            "inset 0 1px 0 0 color-mix(in oklab, white 4%, transparent), " +
            "0 1px 2px 0 rgba(0,0,0,0.18)",
        }}
      >
        <div className="flex items-start gap-3.5">
          <span
            aria-hidden
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              width: 40,
              height: 40,
              borderRadius: 10,
              background:
                "linear-gradient(135deg, var(--accent-surface-strong), var(--accent-surface))",
              color: "var(--accent-primary)",
              border:
                "1px solid color-mix(in oklab, var(--accent-primary) 30%, transparent)",
              flexShrink: 0,
              boxShadow:
                "inset 0 1px 0 0 color-mix(in oklab, white 6%, transparent)",
            }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M12 20h9M16.5 3.5a2.121 2.121 0 1 1 3 3L7 19l-4 1 1-4Z" />
            </svg>
          </span>
          <div className="min-w-0 flex-1">
            <h1
              className="font-semibold"
              style={{
                color: "var(--text-default)",
                fontSize: 22,
                letterSpacing: "-0.018em",
                lineHeight: 1.2,
              }}
            >
              Edit material
            </h1>
            <p
              className="mt-1.5"
              style={{
                color: "var(--text-muted)",
                fontSize: 12.5,
                lineHeight: 1.45,
              }}
            >
              Update the catalog details and reorder thresholds. To change the on-hand quantity, use the stock-adjust form on the detail page.
            </p>
          </div>
        </div>
      </header>

      {sp.error && (
        <div
          className="rounded-lg px-3.5 py-2.5"
          style={{
            background: "color-mix(in oklab, var(--rose-500) 14%, transparent)",
            color: "var(--danger-fg, var(--rose-500))",
            border:
              "1px solid color-mix(in oklab, var(--rose-500) 30%, transparent)",
            fontSize: 12.5,
            fontWeight: 500,
          }}
        >
          {decodeURIComponent(sp.error)}
        </div>
      )}

      <Card>
        <form action={action} className="space-y-4 px-5 py-5">
          <label>
            <span style={labelStyle}>Name</span>
            <input
              type="text"
              name="name"
              required
              defaultValue={material.name}
              style={inputStyle}
            />
          </label>
          <div className="grid gap-4 sm:grid-cols-2">
            <label>
              <span style={labelStyle}>Category</span>
              <input
                type="text"
                name="category"
                defaultValue={material.category ?? ""}
                style={inputStyle}
              />
            </label>
            <label>
              <span style={labelStyle}>SKU</span>
              <input
                type="text"
                name="sku"
                defaultValue={material.sku ?? ""}
                style={inputStyle}
              />
            </label>
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <label>
              <span style={labelStyle}>Unit</span>
              <select name="unit" defaultValue={material.unit} style={inputStyle}>
                {unitOptions.map((u) => (
                  <option key={u} value={u}>{u}</option>
                ))}
              </select>
            </label>
            <label>
              <span style={labelStyle}>Reorder at</span>
              <input
                type="number"
                name="reorderAt"
                step="0.01"
                min="0"
                defaultValue={Number(material.reorderAt)}
                style={inputStyle}
              />
            </label>
            <label>
              <span style={labelStyle}>Max stock</span>
              <input
                type="number"
                name="maxStock"
                step="0.01"
                min="0"
                defaultValue={Number(material.maxStock)}
                style={inputStyle}
              />
            </label>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <label>
              <span style={labelStyle}>Unit cost</span>
              <input
                type="number"
                name="unitCost"
                step="0.01"
                min="0"
                defaultValue={Number(material.unitCost)}
                style={inputStyle}
              />
            </label>
            <label>
              <span style={labelStyle}>Supplier</span>
              <select
                name="supplierVendorId"
                defaultValue={material.supplierVendorId ?? ""}
                style={inputStyle}
              >
                <option value="">— No supplier set —</option>
                {vendors.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div
            className="rounded-lg px-3.5 py-2.5"
            style={{
              background:
                "color-mix(in oklab, var(--surface-2) 50%, transparent)",
              border: "1px solid var(--border-subtle)",
              color: "var(--text-muted)",
              fontSize: 11.5,
              lineHeight: 1.5,
            }}
          >
            <strong style={{ color: "var(--text-default)" }}>Heads up:</strong>{" "}
            On-hand stock isn&apos;t editable from this form — go back to the
            material&apos;s detail page and use the <em>Receive / Use / Count
            adjustment</em> control so the reason for the change is captured.
          </div>

          <div
            className="flex items-center justify-end gap-2 pt-4"
            style={{ borderTop: "1px solid var(--border-subtle)" }}
          >
            <Link
              href={`/t/${slug}/materials/${material.id}`}
              className="ts-focus inline-flex items-center rounded-lg transition-colors hover:bg-[var(--surface-3)]"
              style={{
                height: 32,
                padding: "0 12px",
                color: "var(--text-muted)",
                fontSize: 12.5,
                fontWeight: 500,
              }}
            >
              Cancel
            </Link>
            <button
              type="submit"
              className="ts-focus inline-flex items-center gap-1.5 rounded-lg font-semibold transition-transform"
              style={{
                height: 32,
                padding: "0 14px",
                background:
                  "linear-gradient(180deg, color-mix(in oklab, var(--accent-primary) 96%, white 4%) 0%, var(--accent-primary) 100%)",
                color: "var(--accent-fg)",
                border:
                  "1px solid color-mix(in oklab, var(--accent-primary) 80%, black 20%)",
                boxShadow:
                  "0 1px 0 0 rgba(255,255,255,0.15) inset, " +
                  "0 1px 2px 0 rgba(0,0,0,0.35)",
                fontSize: 12.5,
                letterSpacing: "-0.005em",
              }}
            >
              Save changes
            </button>
          </div>
        </form>
      </Card>
    </div>
  );
}
