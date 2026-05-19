import Link from "next/link";
import { requirePermission } from "@/lib/tenant";
import { db } from "@/lib/db";

// Materials / Inventory (T-11).
//
// Material library: vinyl, substrate, ink, thread, blanks, finished
// goods. Tracks current stock vs reorder point + max, supplier,
// per-unit cost, and usage trend.
//
// Schema doesn't exist yet - this is a premium scaffold with
// representative example rows.

export const dynamic = "force-dynamic";

type StockTone = "OK" | "REORDER" | "LOW";

type ExampleMaterial = {
  id: string;
  name: string;
  category: string;
  sku: string;
  unit: string;
  current: number;
  reorderAt: number;
  max: number;
  unitCost: number;
  supplier: string;
};

const EXAMPLES: ExampleMaterial[] = [
  { id: "m-1", name: "3M IJ180Cv3 (white)",     category: "Vinyl",     sku: "3M-IJ180-W", unit: "yd",   current: 78,  reorderAt: 40,  max: 150, unitCost: 12.4,  supplier: "GrimcoFL" },
  { id: "m-2", name: "Avery MPI 1105 (black)",  category: "Vinyl",     sku: "AV-MPI-K",   unit: "yd",   current: 32,  reorderAt: 40,  max: 120, unitCost: 11.8,  supplier: "GrimcoFL" },
  { id: "m-3", name: "Coroplast 4mm",           category: "Substrate", sku: "CORO-4MM",   unit: "sheet",current: 124, reorderAt: 50,  max: 200, unitCost: 6.25,  supplier: "Piedmont Plastics" },
  { id: "m-4", name: "Aluminum Composite 3mm",  category: "Substrate", sku: "ACM-3MM",    unit: "sheet",current: 18,  reorderAt: 25,  max: 80,  unitCost: 38.0,  supplier: "Piedmont Plastics" },
  { id: "m-5", name: "Roland CMYK ink set",     category: "Ink",       sku: "RL-INK-CMYK",unit: "bottle",current: 8,  reorderAt: 10,  max: 24,  unitCost: 168.0, supplier: "Roland DGA" },
  { id: "m-6", name: "Madeira PolyNeon thread", category: "Thread",    sku: "MD-PNN",     unit: "spool",current: 56,  reorderAt: 30,  max: 100, unitCost: 4.85,  supplier: "Madeira USA" },
  { id: "m-7", name: "Gildan G500 blank tee",   category: "Blanks",    sku: "GLD-G500",   unit: "ea",   current: 210, reorderAt: 100, max: 500, unitCost: 3.10,  supplier: "S&S Activewear" },
  { id: "m-8", name: "Yard sign H-stakes 10in", category: "Hardware",  sku: "HSTK-10",    unit: "ea",   current: 64,  reorderAt: 80,  max: 250, unitCost: 0.42,  supplier: "VictoryStore" },
];

function tone(item: ExampleMaterial): StockTone {
  if (item.current <= item.reorderAt * 0.5) return "LOW";
  if (item.current <= item.reorderAt) return "REORDER";
  return "OK";
}

const TONE_META: Record<StockTone, { label: string; color: string }> = {
  OK:      { label: "In stock",     color: "#10b981" },
  REORDER: { label: "Reorder soon", color: "#f59e0b" },
  LOW:     { label: "Low",          color: "#ef4444" },
};

export default async function MaterialsPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const ctx = await requirePermission(slug, "customers:view");

  // Pull live materials. Falls back to scaffold examples when empty.
  const liveRows = await db.material.findMany({
    where: { tenantId: ctx.tenant.id, archivedAt: null },
    orderBy: [{ category: "asc" }, { name: "asc" }],
    include: { supplierVendor: { select: { name: true } } },
    take: 300,
  });

  const usingPreview = liveRows.length === 0;

  const items: ExampleMaterial[] = usingPreview
    ? EXAMPLES
    : liveRows.map((m) => ({
        id:        m.id,
        name:      m.name,
        category:  m.category ?? "Uncategorized",
        sku:       m.sku ?? "—",
        unit:      m.unit,
        current:   Number(m.currentStock),
        reorderAt: Number(m.reorderAt),
        max:       Math.max(Number(m.maxStock), Number(m.currentStock), 1),
        unitCost:  Number(m.unitCost),
        supplier:  m.supplierVendor?.name ?? "—",
      }));

  const categories = Array.from(new Set(items.map((m) => m.category))).sort();
  const counts: Record<StockTone, number> = { OK: 0, REORDER: 0, LOW: 0 };
  for (const m of items) counts[tone(m)]++;

  return (
    <div className="space-y-5">
      {/* Header. */}
      <div
        className="relative overflow-hidden rounded-2xl"
        style={{
          padding: "18px 22px",
          background:
            "radial-gradient(880px circle at -10% -50%, var(--accent-surface), transparent 55%), " +
            "linear-gradient(180deg, color-mix(in oklab, var(--surface-1) 92%, white 8%) 0%, var(--surface-1) 100%)",
          border: "1px solid var(--border-subtle)",
          boxShadow:
            "inset 0 1px 0 0 color-mix(in oklab, white 4%, transparent), " +
            "0 1px 2px 0 rgba(0,0,0,0.18)",
        }}
      >
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2.5 flex-wrap">
              <h1
                className="font-semibold"
                style={{
                  color: "var(--text-default)",
                  fontSize: 24,
                  letterSpacing: "-0.02em",
                  lineHeight: 1.15,
                }}
              >
                Materials
              </h1>
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  fontSize: 11,
                  fontWeight: 700,
                  letterSpacing: "0.04em",
                  color: "var(--accent-primary)",
                  background: "var(--accent-surface)",
                  border:
                    "1px solid color-mix(in oklab, var(--accent-primary) 22%, transparent)",
                  padding: "3px 8px",
                  borderRadius: 999,
                  fontFeatureSettings: "'tnum' 1",
                  lineHeight: 1,
                }}
              >
                {items.length}
              </span>
              {counts.LOW + counts.REORDER > 0 && (
                <span
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 5,
                    fontSize: 11,
                    fontWeight: 700,
                    letterSpacing: "0.04em",
                    color: "var(--amber-500)",
                    background:
                      "color-mix(in oklab, var(--amber-500) 14%, transparent)",
                    border:
                      "1px solid color-mix(in oklab, var(--amber-500) 30%, transparent)",
                    padding: "3px 8px",
                    borderRadius: 999,
                    lineHeight: 1,
                  }}
                >
                  <span
                    aria-hidden
                    style={{
                      width: 5,
                      height: 5,
                      borderRadius: 999,
                      background: "var(--amber-500)",
                      boxShadow:
                        "0 0 0 2px color-mix(in oklab, var(--amber-500) 25%, transparent)",
                    }}
                  />
                  {counts.LOW + counts.REORDER} need attention
                </span>
              )}
              {usingPreview && (
                <span
                  style={{
                    fontSize: 10.5,
                    fontWeight: 700,
                    letterSpacing: "0.06em",
                    textTransform: "uppercase",
                    color: "var(--amber-500)",
                    background:
                      "color-mix(in oklab, var(--amber-500) 14%, transparent)",
                    border:
                      "1px solid color-mix(in oklab, var(--amber-500) 30%, transparent)",
                    padding: "3px 8px",
                    borderRadius: 999,
                    lineHeight: 1,
                  }}
                >
                  Preview
                </span>
              )}
            </div>
            <p
              className="mt-1.5"
              style={{
                color: "var(--text-muted)",
                fontSize: 12.5,
                lineHeight: 1.45,
              }}
            >
              Vinyl, substrate, ink, thread, blanks. Track on-hand vs reorder point — never run out mid-job.
            </p>
          </div>
          <Link
            href={`/t/${slug}/materials/new`}
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
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M12 5v14M5 12h14" />
            </svg>
            Add material
          </Link>
        </div>
      </div>

      {/* Category chips. */}
      <div className="flex flex-wrap gap-1.5">
        <CategoryChip label="All" active count={items.length} />
        {categories.map((c) => (
          <CategoryChip
            key={c}
            label={c}
            count={items.filter((m) => m.category === c).length}
          />
        ))}
      </div>

      {/* Materials table. */}
      <div
        className="overflow-hidden rounded-xl"
        style={{
          background:
            "linear-gradient(180deg, color-mix(in oklab, var(--surface-1) 92%, white 8%) 0%, var(--surface-1) 100%)",
          border: "1px solid var(--border-subtle)",
          boxShadow:
            "inset 0 1px 0 0 color-mix(in oklab, white 4%, transparent), " +
            "0 1px 2px 0 rgba(0,0,0,0.18)",
        }}
      >
        <table className="w-full text-sm">
          <thead>
            <tr
              style={{
                color: "var(--text-faint)",
                background:
                  "linear-gradient(180deg, color-mix(in oklab, var(--surface-1) 60%, transparent) 0%, transparent 100%)",
                borderBottom: "1px solid var(--border-subtle)",
              }}
            >
              <th className="px-4 py-3 text-left" style={hStyle}>Material</th>
              <th className="px-4 py-3 text-left" style={hStyle}>Stock</th>
              <th className="px-4 py-3 text-left" style={hStyle}>Status</th>
              <th className="px-4 py-3 text-right" style={hStyle}>Unit cost</th>
              <th className="px-4 py-3 text-left" style={hStyle}>Supplier</th>
            </tr>
          </thead>
          <tbody>
            {items.map((m) => {
              const t = tone(m);
              const meta = TONE_META[t];
              const pct = Math.min(100, Math.round((m.current / m.max) * 100));
              const detailHref = usingPreview ? null : `/t/${slug}/materials/${m.id}`;
              return (
                <tr
                  key={m.id}
                  style={{
                    borderTop: "1px solid var(--border-subtle)",
                    cursor: detailHref ? "pointer" : undefined,
                  }}
                  className={detailHref ? "hover:bg-[color-mix(in_oklab,var(--surface-2)_40%,transparent)]" : ""}
                >
                  <td className="px-4 py-3">
                    {detailHref ? (
                      <Link
                        href={detailHref}
                        className="ts-focus block underline-offset-2 hover:underline"
                        style={{
                          color: "var(--text-default)",
                          fontSize: 13,
                          fontWeight: 600,
                          letterSpacing: "-0.005em",
                          textDecoration: "none",
                        }}
                      >
                        {m.name}
                      </Link>
                    ) : (
                      <div
                        style={{
                          color: "var(--text-default)",
                          fontSize: 13,
                          fontWeight: 600,
                          letterSpacing: "-0.005em",
                        }}
                      >
                        {m.name}
                      </div>
                    )}
                    <div
                      className="mt-0.5"
                      style={{
                        color: "var(--text-muted)",
                        fontSize: 11,
                      }}
                    >
                      <span
                        style={{
                          fontFamily: "var(--font-mono, ui-monospace, monospace)",
                        }}
                      >
                        {m.sku}
                      </span>
                      <span style={{ color: "var(--text-faint)" }}> · </span>
                      {m.category}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div
                        style={{
                          flex: 1,
                          maxWidth: 140,
                          height: 6,
                          borderRadius: 999,
                          background:
                            "color-mix(in oklab, var(--surface-2) 70%, transparent)",
                          border: "1px solid var(--border-subtle)",
                          overflow: "hidden",
                          position: "relative",
                        }}
                      >
                        <div
                          style={{
                            position: "absolute",
                            inset: 0,
                            width: `${pct}%`,
                            background: `linear-gradient(90deg, ${meta.color}, color-mix(in oklab, ${meta.color} 70%, white 30%))`,
                            borderRadius: 999,
                          }}
                        />
                      </div>
                      <span
                        style={{
                          color: "var(--text-default)",
                          fontSize: 12.5,
                          fontWeight: 600,
                          fontFeatureSettings: "'tnum' 1",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {m.current}
                        <span style={{ color: "var(--text-faint)", fontWeight: 400 }}>
                          {" "}/ {m.max}
                        </span>{" "}
                        <span style={{ color: "var(--text-muted)", fontSize: 11 }}>{m.unit}</span>
                      </span>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 5,
                        fontSize: 10,
                        fontWeight: 700,
                        letterSpacing: "0.06em",
                        textTransform: "uppercase",
                        color: meta.color,
                        background: `color-mix(in oklab, ${meta.color} 14%, transparent)`,
                        border: `1px solid color-mix(in oklab, ${meta.color} 30%, transparent)`,
                        padding: "2px 7px",
                        borderRadius: 999,
                        lineHeight: 1,
                      }}
                    >
                      <span
                        aria-hidden
                        style={{
                          width: 4,
                          height: 4,
                          borderRadius: 999,
                          background: meta.color,
                          boxShadow: `0 0 0 1.5px color-mix(in oklab, ${meta.color} 25%, transparent)`,
                        }}
                      />
                      {meta.label}
                    </span>
                  </td>
                  <td
                    className="px-4 py-3 text-right"
                    style={{
                      color: "var(--text-default)",
                      fontSize: 12.5,
                      fontWeight: 500,
                      fontFeatureSettings: "'tnum' 1",
                    }}
                  >
                    ${m.unitCost.toFixed(2)}
                  </td>
                  <td
                    className="px-4 py-3"
                    style={{
                      color: "var(--text-muted)",
                      fontSize: 12.5,
                    }}
                  >
                    {m.supplier}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {usingPreview && (
        <ComingSoonBanner copy="Your shop hasn&rsquo;t added any materials yet. Rows above demonstrate the surface for vinyl, substrate, ink, thread, blanks, and hardware. Click Add material to start your inventory." />
      )}
    </div>
  );
}

const hStyle = {
  fontSize: 10.5,
  fontWeight: 700,
  letterSpacing: "0.08em",
  textTransform: "uppercase" as const,
};

function CategoryChip({
  label,
  count,
  active,
}: {
  label: string;
  count: number;
  active?: boolean;
}) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        height: 28,
        padding: "0 12px",
        borderRadius: 999,
        fontSize: 11.5,
        fontWeight: active ? 700 : 500,
        letterSpacing: "-0.005em",
        color: active ? "var(--accent-primary)" : "var(--text-muted)",
        background: active
          ? "var(--accent-surface)"
          : "color-mix(in oklab, var(--surface-2) 60%, transparent)",
        border: active
          ? "1px solid color-mix(in oklab, var(--accent-primary) 28%, transparent)"
          : "1px solid var(--border-subtle)",
      }}
    >
      {label}
      <span
        style={{
          color: active ? "var(--accent-primary)" : "var(--text-faint)",
          fontSize: 10,
          fontWeight: 700,
          fontFeatureSettings: "'tnum' 1",
        }}
      >
        {count}
      </span>
    </span>
  );
}

function ComingSoonBanner({ copy }: { copy: string }) {
  return (
    <div
      className="rounded-xl px-4 py-3"
      style={{
        background:
          "radial-gradient(540px circle at 0% 0%, var(--accent-surface), transparent 55%), " +
          "color-mix(in oklab, var(--surface-1) 80%, transparent)",
        border:
          "1px solid color-mix(in oklab, var(--accent-primary) 28%, transparent)",
        fontSize: 12.5,
        lineHeight: 1.45,
        color: "var(--text-muted)",
      }}
    >
      <div className="flex items-start gap-2.5">
        <span
          aria-hidden
          style={{
            flexShrink: 0,
            width: 18,
            height: 18,
            borderRadius: 5,
            background: "var(--accent-surface)",
            color: "var(--accent-primary)",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            fontWeight: 700,
            fontSize: 11,
            border:
              "1px solid color-mix(in oklab, var(--accent-primary) 30%, transparent)",
            marginTop: 1,
          }}
        >
          i
        </span>
        <div>
          <span style={{ color: "var(--text-default)", fontWeight: 600 }}>
            Preview data shown.
          </span>{" "}
          {copy}
        </div>
      </div>
    </div>
  );
}
