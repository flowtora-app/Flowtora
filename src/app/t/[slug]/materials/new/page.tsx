import Link from "next/link";
import { requirePermission } from "@/lib/tenant";
import { db } from "@/lib/db";
import { createMaterial } from "@/app/actions/materials";
import { Card } from "@/components/Card";

export default async function NewMaterialPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { slug } = await params;
  const sp = await searchParams;
  const ctx = await requirePermission(slug, "customers:view");

  const vendors = await db.vendor.findMany({
    where: { tenantId: ctx.tenant.id, active: true },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });

  const action = createMaterial.bind(null, slug);

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

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <div style={{ fontSize: 12 }}>
        <Link
          href={`/t/${slug}/materials`}
          className="ts-focus inline-flex items-center gap-1 transition-colors hover:text-[var(--text-default)]"
          style={{ color: "var(--text-muted)" }}
        >
          ← Materials
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
              <path d="M3 7l9-4 9 4-9 4-9-4z" />
              <path d="M3 7v10l9 4 9-4V7" />
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
              Add material
            </h1>
            <p
              className="mt-1.5"
              style={{
                color: "var(--text-muted)",
                fontSize: 12.5,
                lineHeight: 1.45,
              }}
            >
              Track an item in your shop&apos;s inventory — vinyl, substrate, ink, thread, blanks, hardware. Set the reorder point so we can warn you before you run out.
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
            <input type="text" name="name" required placeholder="3M IJ180Cv3 (white)" style={inputStyle} />
          </label>
          <div className="grid gap-4 sm:grid-cols-2">
            <label>
              <span style={labelStyle}>Category</span>
              <input type="text" name="category" placeholder="Vinyl" style={inputStyle} />
            </label>
            <label>
              <span style={labelStyle}>SKU</span>
              <input type="text" name="sku" placeholder="3M-IJ180-W" style={inputStyle} />
            </label>
          </div>
          <div className="grid gap-4 sm:grid-cols-4">
            <label>
              <span style={labelStyle}>Unit</span>
              <select name="unit" defaultValue="yd" style={inputStyle}>
                <option value="yd">yd</option>
                <option value="ft">ft</option>
                <option value="sheet">sheet</option>
                <option value="ea">ea</option>
                <option value="bottle">bottle</option>
                <option value="spool">spool</option>
                <option value="roll">roll</option>
                <option value="gal">gal</option>
                <option value="lb">lb</option>
              </select>
            </label>
            <label>
              <span style={labelStyle}>On hand</span>
              <input type="number" name="currentStock" step="0.01" min="0" defaultValue="0" style={inputStyle} />
            </label>
            <label>
              <span style={labelStyle}>Reorder at</span>
              <input type="number" name="reorderAt" step="0.01" min="0" defaultValue="0" style={inputStyle} />
            </label>
            <label>
              <span style={labelStyle}>Max stock</span>
              <input type="number" name="maxStock" step="0.01" min="0" defaultValue="0" style={inputStyle} />
            </label>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <label>
              <span style={labelStyle}>Unit cost</span>
              <input type="number" name="unitCost" step="0.01" min="0" defaultValue="0" placeholder="12.40" style={inputStyle} />
            </label>
            <label>
              <span style={labelStyle}>Supplier</span>
              <select name="supplierVendorId" defaultValue="" style={inputStyle}>
                <option value="">— No supplier set —</option>
                {vendors.map((v) => (
                  <option key={v.id} value={v.id}>{v.name}</option>
                ))}
              </select>
            </label>
          </div>
          <div
            className="flex items-center justify-end gap-2 pt-4"
            style={{ borderTop: "1px solid var(--border-subtle)" }}
          >
            <Link
              href={`/t/${slug}/materials`}
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
              Add material
            </button>
          </div>
        </form>
      </Card>
    </div>
  );
}
