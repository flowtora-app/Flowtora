import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePermission } from "@/lib/tenant";
import { db } from "@/lib/db";
import {
  adjustMaterialStock,
  archiveMaterial,
  unarchiveMaterial,
} from "@/app/actions/materials";
import { formatDate } from "@/lib/format";

// Material detail page (T-11).
//
// Surfaces:
//   - Stock level (with status pill computed from currentStock vs
//     reorderAt) and a quick adjust form for receive / use / count.
//   - Supplier + unit cost.
//   - Recent purchase-order line history (last 10 receivers).
//   - Edit and archive actions.

export const dynamic = "force-dynamic";

type StockTone = "OK" | "REORDER" | "LOW";

const TONE_META: Record<
  StockTone,
  { label: string; color: string; copy: string }
> = {
  OK:      { label: "In stock",     color: "#10b981", copy: "Plenty on hand." },
  REORDER: { label: "Reorder soon", color: "#f59e0b", copy: "Below the reorder threshold — schedule a PO." },
  LOW:     { label: "Low",          color: "#ef4444", copy: "Critically low. Order before you're caught short." },
};

function stockTone(current: number, reorderAt: number): StockTone {
  if (current <= reorderAt * 0.5) return "LOW";
  if (current <= reorderAt)       return "REORDER";
  return "OK";
}

export default async function MaterialDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string; id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { slug, id } = await params;
  const sp = await searchParams;
  const ctx = await requirePermission(slug, "customers:view");

  const material = await db.material.findFirst({
    where: { id, tenantId: ctx.tenant.id },
    include: {
      supplierVendor: { select: { id: true, name: true } },
      purchaseOrderLines: {
        orderBy: { createdAt: "desc" },
        take: 10,
        include: {
          purchaseOrder: {
            select: { id: true, number: true, status: true, issuedAt: true },
          },
        },
      },
    },
  });
  if (!material) notFound();

  const current   = Number(material.currentStock);
  const reorderAt = Number(material.reorderAt);
  const maxStock  = Math.max(Number(material.maxStock), current, 1);
  const unitCost  = Number(material.unitCost);
  const tone      = stockTone(current, reorderAt);
  const meta      = TONE_META[tone];
  const stockPct  = Math.min(100, Math.round((current / maxStock) * 100));
  const archived  = !!material.archivedAt;

  const adjustAction    = adjustMaterialStock.bind(null, slug, material.id);
  const archiveAction   = archiveMaterial.bind(null, slug, material.id);
  const unarchiveAction = unarchiveMaterial.bind(null, slug, material.id);

  return (
    <div className="space-y-5">
      <div style={{ fontSize: 12 }}>
        <Link
          href={`/t/${slug}/materials`}
          className="ts-focus inline-flex items-center gap-1 transition-colors hover:text-[var(--text-default)]"
          style={{ color: "var(--text-muted)" }}
        >
          ← Materials
        </Link>
      </div>

      {/* Header. */}
      <header
        className="relative overflow-hidden rounded-2xl"
        style={{
          padding: "20px 24px",
          background:
            `radial-gradient(720px circle at -8% -40%, color-mix(in oklab, ${meta.color} 14%, transparent), transparent 55%), ` +
            "linear-gradient(180deg, color-mix(in oklab, var(--surface-1) 92%, white 8%) 0%, var(--surface-1) 100%)",
          border: "1px solid var(--border-subtle)",
          boxShadow:
            "inset 0 1px 0 0 color-mix(in oklab, white 4%, transparent), " +
            "0 1px 2px 0 rgba(0,0,0,0.18)",
        }}
      >
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex min-w-0 flex-1 items-start gap-3.5">
            <span
              aria-hidden
              style={{
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                width: 48,
                height: 48,
                borderRadius: 12,
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
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M3 7l9-4 9 4-9 4-9-4z" />
                <path d="M3 7v10l9 4 9-4V7" />
              </svg>
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2.5">
                <h1
                  className="font-semibold"
                  style={{
                    color: "var(--text-default)",
                    fontSize: 24,
                    letterSpacing: "-0.02em",
                    lineHeight: 1.15,
                  }}
                >
                  {material.name}
                </h1>
                <span
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 5,
                    fontSize: 10.5,
                    fontWeight: 700,
                    letterSpacing: "0.06em",
                    textTransform: "uppercase",
                    color: meta.color,
                    background: `color-mix(in oklab, ${meta.color} 16%, transparent)`,
                    border: `1px solid color-mix(in oklab, ${meta.color} 30%, transparent)`,
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
                      background: meta.color,
                      boxShadow: `0 0 0 2px color-mix(in oklab, ${meta.color} 25%, transparent)`,
                    }}
                  />
                  {meta.label}
                </span>
                {archived && (
                  <span
                    style={{
                      fontSize: 10.5,
                      fontWeight: 700,
                      letterSpacing: "0.06em",
                      textTransform: "uppercase",
                      color: "var(--text-muted)",
                      background: "color-mix(in oklab, var(--surface-2) 80%, transparent)",
                      border: "1px solid var(--border-subtle)",
                      padding: "3px 8px",
                      borderRadius: 999,
                      lineHeight: 1,
                    }}
                  >
                    Archived
                  </span>
                )}
              </div>
              <p
                className="mt-1.5"
                style={{
                  color: "var(--text-muted)",
                  fontSize: 13,
                  lineHeight: 1.45,
                }}
              >
                {material.category || "Uncategorized"}
                {material.sku && (
                  <>
                    {" · "}
                    <span
                      style={{
                        fontFamily: "var(--font-mono, ui-monospace, monospace)",
                        color: "var(--text-faint)",
                      }}
                    >
                      {material.sku}
                    </span>
                  </>
                )}
              </p>
              <p
                className="mt-1"
                style={{
                  color: "var(--text-faint)",
                  fontSize: 12,
                  lineHeight: 1.4,
                }}
              >
                {meta.copy}
              </p>
            </div>
          </div>
          <div className="flex flex-shrink-0 items-center gap-2">
            {!archived && (
              <Link
                href={`/t/${slug}/materials/${material.id}/edit`}
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
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path d="M12 20h9M16.5 3.5a2.121 2.121 0 1 1 3 3L7 19l-4 1 1-4Z" />
                </svg>
                Edit
              </Link>
            )}
            {archived ? (
              <form action={unarchiveAction}>
                <button
                  type="submit"
                  className="ts-focus inline-flex items-center gap-1.5 rounded-lg transition-colors hover:bg-[var(--surface-3)]"
                  style={{
                    height: 32,
                    padding: "0 12px",
                    color: "var(--text-default)",
                    background: "color-mix(in oklab, var(--surface-2) 70%, transparent)",
                    border: "1px solid var(--border-subtle)",
                    fontSize: 12.5,
                    fontWeight: 500,
                  }}
                >
                  Restore
                </button>
              </form>
            ) : (
              <form action={archiveAction}>
                <button
                  type="submit"
                  className="ts-focus inline-flex items-center gap-1.5 rounded-lg transition-colors hover:bg-[var(--surface-3)]"
                  style={{
                    height: 32,
                    padding: "0 12px",
                    color: "var(--text-muted)",
                    background: "color-mix(in oklab, var(--surface-2) 50%, transparent)",
                    border: "1px solid var(--border-subtle)",
                    fontSize: 12.5,
                    fontWeight: 500,
                  }}
                >
                  Archive
                </button>
              </form>
            )}
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

      <div className="grid gap-4 lg:grid-cols-3">
        {/* Left rail. */}
        <div className="space-y-4 lg:col-span-2">
          {/* Stock card with bar + adjust form. */}
          <section
            className="relative overflow-hidden rounded-xl"
            style={{
              padding: "20px 22px",
              background:
                "linear-gradient(180deg, color-mix(in oklab, var(--surface-1) 92%, white 8%) 0%, var(--surface-1) 100%)",
              border: "1px solid var(--border-subtle)",
              boxShadow:
                "inset 0 1px 0 0 color-mix(in oklab, white 4%, transparent), " +
                "0 1px 2px 0 rgba(0,0,0,0.18)",
            }}
          >
            <header className="mb-3 flex items-center justify-between">
              <h2
                style={{
                  color: "var(--text-default)",
                  fontSize: 13.5,
                  fontWeight: 600,
                  letterSpacing: "-0.005em",
                }}
              >
                Stock level
              </h2>
              <span
                style={{
                  color: "var(--text-default)",
                  fontSize: 22,
                  fontWeight: 600,
                  letterSpacing: "-0.018em",
                  fontFeatureSettings: "'tnum' 1",
                  lineHeight: 1,
                }}
              >
                {current.toLocaleString()}
                <span
                  style={{
                    color: "var(--text-faint)",
                    fontWeight: 400,
                    fontSize: 14,
                  }}
                >
                  {" "}/ {maxStock.toLocaleString()}
                </span>{" "}
                <span style={{ color: "var(--text-muted)", fontSize: 12 }}>
                  {material.unit}
                </span>
              </span>
            </header>
            <div
              style={{
                position: "relative",
                height: 8,
                borderRadius: 999,
                background: "color-mix(in oklab, var(--surface-2) 70%, transparent)",
                border: "1px solid var(--border-subtle)",
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  position: "absolute",
                  inset: 0,
                  width: `${stockPct}%`,
                  background: `linear-gradient(90deg, ${meta.color}, color-mix(in oklab, ${meta.color} 70%, white 30%))`,
                  borderRadius: 999,
                }}
              />
              {/* Reorder threshold marker. */}
              {maxStock > 0 && reorderAt > 0 && (
                <div
                  aria-hidden
                  title={`Reorder at ${reorderAt}`}
                  style={{
                    position: "absolute",
                    top: -2,
                    bottom: -2,
                    left: `${Math.min(100, (reorderAt / maxStock) * 100)}%`,
                    width: 2,
                    background: "color-mix(in oklab, var(--text-default) 60%, transparent)",
                    borderRadius: 999,
                  }}
                />
              )}
            </div>
            <div
              className="mt-2 flex justify-between"
              style={{
                color: "var(--text-faint)",
                fontSize: 11,
                fontFeatureSettings: "'tnum' 1",
              }}
            >
              <span>0</span>
              <span>Reorder at {reorderAt.toLocaleString()}</span>
              <span>Max {maxStock.toLocaleString()}</span>
            </div>

            {/* Adjust form. */}
            {!archived && (
              <form
                action={adjustAction}
                className="mt-5 grid items-end gap-3 sm:grid-cols-[1fr_1fr_auto]"
                style={{
                  paddingTop: 16,
                  borderTop: "1px solid var(--border-subtle)",
                }}
              >
                <label>
                  <span
                    style={{
                      display: "block",
                      marginBottom: 6,
                      color: "var(--text-default)",
                      fontSize: 12,
                      fontWeight: 600,
                    }}
                  >
                    Reason
                  </span>
                  <select
                    name="reason"
                    defaultValue="RECEIVE"
                    style={{
                      width: "100%",
                      height: 36,
                      padding: "0 10px",
                      borderRadius: 8,
                      background: "var(--surface-1)",
                      border: "1px solid var(--border-subtle)",
                      color: "var(--text-default)",
                      fontSize: 12.5,
                    }}
                  >
                    <option value="RECEIVE">Receive (add stock)</option>
                    <option value="USE">Use (consume stock)</option>
                    <option value="COUNT">Count adjustment (signed)</option>
                  </select>
                </label>
                <label>
                  <span
                    style={{
                      display: "block",
                      marginBottom: 6,
                      color: "var(--text-default)",
                      fontSize: 12,
                      fontWeight: 600,
                    }}
                  >
                    Quantity
                  </span>
                  <input
                    type="number"
                    name="delta"
                    step="0.01"
                    required
                    placeholder="e.g. 50"
                    style={{
                      width: "100%",
                      height: 36,
                      padding: "0 10px",
                      borderRadius: 8,
                      background: "var(--surface-1)",
                      border: "1px solid var(--border-subtle)",
                      color: "var(--text-default)",
                      fontSize: 12.5,
                      fontFeatureSettings: "'tnum' 1",
                    }}
                  />
                </label>
                <button
                  type="submit"
                  className="ts-focus inline-flex h-9 items-center justify-center gap-1.5 rounded-lg font-semibold"
                  style={{
                    padding: "0 16px",
                    background:
                      "linear-gradient(180deg, color-mix(in oklab, var(--accent-primary) 96%, white 4%) 0%, var(--accent-primary) 100%)",
                    color: "var(--accent-fg)",
                    border:
                      "1px solid color-mix(in oklab, var(--accent-primary) 80%, black 20%)",
                    boxShadow:
                      "0 1px 0 0 rgba(255,255,255,0.15) inset, " +
                      "0 1px 2px 0 rgba(0,0,0,0.35)",
                    fontSize: 12.5,
                  }}
                >
                  Apply
                </button>
              </form>
            )}
          </section>

          {/* Recent PO history. */}
          <SectionCard
            title="Recent purchase orders"
            tag={material.purchaseOrderLines.length > 0 ? `${material.purchaseOrderLines.length}` : null}
          >
            {material.purchaseOrderLines.length === 0 ? (
              <p style={{ color: "var(--text-muted)", fontSize: 13, lineHeight: 1.5 }}>
                No purchase orders have included this material yet. When you
                receive a PO line tied to this SKU, it&apos;ll appear here.
              </p>
            ) : (
              <ul className="space-y-2">
                {material.purchaseOrderLines.map((line) => {
                  const po          = line.purchaseOrder;
                  const qty         = Number(line.quantity);
                  const received    = Number(line.receivedQty);
                  const lineTotal   = Number(line.total);
                  const fullyRcvd   = received >= qty;
                  return (
                    <li
                      key={line.id}
                      className="flex items-center justify-between gap-3 rounded-lg px-3 py-2"
                      style={{
                        background: "color-mix(in oklab, var(--surface-2) 40%, transparent)",
                        border: "1px solid var(--border-subtle)",
                      }}
                    >
                      <div className="min-w-0">
                        <Link
                          href={`/t/${slug}/supplier-orders/${po.id}`}
                          className="ts-focus underline-offset-2 hover:underline"
                          style={{
                            color: "var(--accent-primary)",
                            fontSize: 12.5,
                            fontWeight: 600,
                          }}
                        >
                          {po.number}
                        </Link>
                        <div
                          className="mt-0.5"
                          style={{ color: "var(--text-faint)", fontSize: 11 }}
                        >
                          {po.issuedAt ? formatDate(po.issuedAt) : "Draft"} ·{" "}
                          {qty} {material.unit} ordered · {received} received
                        </div>
                      </div>
                      <div
                        style={{
                          color: "var(--text-default)",
                          fontSize: 12.5,
                          fontWeight: 600,
                          fontFeatureSettings: "'tnum' 1",
                          whiteSpace: "nowrap",
                        }}
                      >
                        ${lineTotal.toFixed(2)}
                        <span
                          className="ml-2"
                          style={{
                            display: "inline-block",
                            verticalAlign: "middle",
                            width: 6,
                            height: 6,
                            borderRadius: 999,
                            background: fullyRcvd ? "#10b981" : "#f59e0b",
                            boxShadow: `0 0 0 1.5px color-mix(in oklab, ${
                              fullyRcvd ? "#10b981" : "#f59e0b"
                            } 25%, transparent)`,
                          }}
                          title={fullyRcvd ? "Fully received" : "Partial / pending"}
                        />
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </SectionCard>
        </div>

        {/* Right rail. */}
        <div className="space-y-4">
          <SectionCard title="Supplier">
            {material.supplierVendor ? (
              <>
                <Link
                  href={`/t/${slug}/vendors/${material.supplierVendor.id}`}
                  className="ts-focus underline-offset-2 hover:underline"
                  style={{
                    color: "var(--accent-primary)",
                    fontSize: 13.5,
                    fontWeight: 600,
                  }}
                >
                  {material.supplierVendor.name}
                </Link>
                <p
                  className="mt-1"
                  style={{ color: "var(--text-faint)", fontSize: 11.5 }}
                >
                  Primary supplier for this material.
                </p>
              </>
            ) : (
              <p style={{ color: "var(--text-muted)", fontSize: 13 }}>
                No supplier set. Open <strong>Edit</strong> to choose one.
              </p>
            )}
          </SectionCard>

          <SectionCard title="Pricing">
            <Field label="Unit cost">
              <span
                style={{
                  color: "var(--text-default)",
                  fontSize: 16,
                  fontWeight: 600,
                  fontFeatureSettings: "'tnum' 1",
                  letterSpacing: "-0.012em",
                }}
              >
                ${unitCost.toFixed(2)}
                <span
                  style={{
                    color: "var(--text-muted)",
                    fontSize: 12,
                    fontWeight: 400,
                  }}
                >
                  {" "}/ {material.unit}
                </span>
              </span>
            </Field>
            <Field label="Last PO total">
              <span
                style={{
                  color: "var(--text-default)",
                  fontSize: 13,
                  fontFeatureSettings: "'tnum' 1",
                }}
              >
                {material.purchaseOrderLines[0]
                  ? `$${Number(material.purchaseOrderLines[0].total).toFixed(2)}`
                  : "—"}
              </span>
            </Field>
          </SectionCard>

          <SectionCard title="Record">
            <Field label="Added">
              <span style={{ color: "var(--text-default)", fontSize: 13 }}>
                {formatDate(material.createdAt)}
              </span>
            </Field>
            <Field label="Updated">
              <span style={{ color: "var(--text-default)", fontSize: 13 }}>
                {formatDate(material.updatedAt)}
              </span>
            </Field>
            {material.archivedAt && (
              <Field label="Archived">
                <span style={{ color: "var(--text-default)", fontSize: 13 }}>
                  {formatDate(material.archivedAt)}
                </span>
              </Field>
            )}
          </SectionCard>
        </div>
      </div>
    </div>
  );
}

function SectionCard({
  title,
  tag,
  children,
}: {
  title: string;
  tag?: string | null;
  children: React.ReactNode;
}) {
  return (
    <section
      className="relative overflow-hidden rounded-xl"
      style={{
        padding: "18px 20px",
        background:
          "linear-gradient(180deg, color-mix(in oklab, var(--surface-1) 92%, white 8%) 0%, var(--surface-1) 100%)",
        border: "1px solid var(--border-subtle)",
        boxShadow:
          "inset 0 1px 0 0 color-mix(in oklab, white 4%, transparent), " +
          "0 1px 2px 0 rgba(0,0,0,0.18)",
      }}
    >
      <header className="mb-3 flex items-center justify-between">
        <h2
          style={{
            color: "var(--text-default)",
            fontSize: 13.5,
            fontWeight: 600,
            letterSpacing: "-0.005em",
          }}
        >
          {title}
        </h2>
        {tag && (
          <span
            style={{
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: "0.04em",
              color: "var(--accent-primary)",
              background: "var(--accent-surface)",
              border:
                "1px solid color-mix(in oklab, var(--accent-primary) 22%, transparent)",
              padding: "2px 7px",
              borderRadius: 999,
              fontFeatureSettings: "'tnum' 1",
              lineHeight: 1,
            }}
          >
            {tag}
          </span>
        )}
      </header>
      <div className="space-y-3">{children}</div>
    </section>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div
        style={{
          color: "var(--text-faint)",
          fontSize: 10.5,
          fontWeight: 700,
          letterSpacing: "0.08em",
          textTransform: "uppercase",
          marginBottom: 4,
        }}
      >
        {label}
      </div>
      <div>{children}</div>
    </div>
  );
}
