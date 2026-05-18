import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePermission } from "@/lib/tenant";
import { db } from "@/lib/db";
import { formatMoney, formatDate } from "@/lib/format";
import {
  addPurchaseOrderLine,
  removePurchaseOrderLine,
  issuePurchaseOrder,
  receivePurchaseOrderLine,
  closePurchaseOrder,
  cancelPurchaseOrder,
} from "@/app/actions/purchase-orders";
import { Card } from "@/components/Card";

// Purchase order detail (T-11a).
//
// Header with status + supplier + total, line items table with
// per-line receive buttons, and a workflow action cluster
// (Issue / Cancel / Close).

export const dynamic = "force-dynamic";

const STATUS_META = {
  DRAFT:    { label: "Draft",            color: "#6b7280" },
  ISSUED:   { label: "Issued",           color: "#3b82f6" },
  PARTIAL:  { label: "Partial received", color: "#f59e0b" },
  RECEIVED: { label: "Received",         color: "#10b981" },
  CLOSED:   { label: "Closed",           color: "#6b7280" },
  CANCELED: { label: "Canceled",         color: "#ef4444" },
} as const;

export default async function PurchaseOrderDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string; id: string }>;
  searchParams: Promise<{ ok?: string; error?: string }>;
}) {
  const { slug, id } = await params;
  const sp = await searchParams;
  const ctx = await requirePermission(slug, "customers:view");

  const po = await db.purchaseOrder.findFirst({
    where: { id, tenantId: ctx.tenant.id },
    include: {
      supplierVendor: { select: { id: true, name: true } },
      lines: {
        orderBy: { createdAt: "asc" },
        include: { material: { select: { id: true, name: true, unit: true } } },
      },
    },
  });
  if (!po) notFound();

  const materials = await db.material.findMany({
    where: { tenantId: ctx.tenant.id, archivedAt: null },
    orderBy: { name: "asc" },
    select: { id: true, name: true, unit: true, unitCost: true },
  });

  const meta = STATUS_META[po.status];
  const editable = po.status === "DRAFT";
  const receivable = po.status === "ISSUED" || po.status === "PARTIAL";

  const addLineAction = addPurchaseOrderLine.bind(null, slug, po.id);
  const issueAction   = issuePurchaseOrder.bind(null, slug, po.id);
  const closeAction   = closePurchaseOrder.bind(null, slug, po.id);
  const cancelAction  = cancelPurchaseOrder.bind(null, slug, po.id);

  const inputStyle = {
    height: 36,
    padding: "0 10px",
    borderRadius: 8,
    background: "var(--surface-1)",
    border: "1px solid var(--border-subtle)",
    color: "var(--text-default)",
    fontSize: 13,
    outline: "none",
  } as const;

  return (
    <div className="space-y-5">
      <div style={{ fontSize: 12 }}>
        <Link
          href={`/t/${slug}/supplier-orders`}
          className="ts-focus inline-flex items-center gap-1 transition-colors hover:text-[var(--text-default)]"
          style={{ color: "var(--text-muted)" }}
        >
          ← Supplier orders
        </Link>
      </div>

      {/* Flash banners. */}
      {sp.ok === "issued" && <Flash tone="success" text={`PO issued to ${po.supplierVendor.name}.`} />}
      {sp.ok === "received" && <Flash tone="success" text="Stock updated." />}
      {sp.ok === "closed" && <Flash tone="info" text="PO closed." />}
      {sp.error && <Flash tone="error" text={decodeURIComponent(sp.error)} />}

      {/* Header. */}
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
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1
                className="font-semibold"
                style={{
                  color: "var(--text-default)",
                  fontSize: 22,
                  letterSpacing: "-0.018em",
                  lineHeight: 1.2,
                  fontFamily: "var(--font-mono, ui-monospace, monospace)",
                }}
              >
                {po.number}
              </h1>
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
                  background: `color-mix(in oklab, ${meta.color} 16%, transparent)`,
                  border: `1px solid color-mix(in oklab, ${meta.color} 32%, transparent)`,
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
                  }}
                />
                {meta.label}
              </span>
            </div>
            <p
              className="mt-1.5"
              style={{
                color: "var(--text-muted)",
                fontSize: 12.5,
                lineHeight: 1.4,
              }}
            >
              Issued to{" "}
              <Link
                href={`/t/${slug}/vendors/${po.supplierVendor.id}`}
                style={{ color: "var(--text-default)", fontWeight: 500 }}
                className="hover:underline"
              >
                {po.supplierVendor.name}
              </Link>
              {po.expectedAt && (
                <>
                  <span style={{ color: "var(--text-faint)" }}> · </span>
                  Expected{" "}
                  <span style={{ color: "var(--text-default)" }}>
                    {formatDate(po.expectedAt)}
                  </span>
                </>
              )}
              {po.issuedAt && (
                <>
                  <span style={{ color: "var(--text-faint)" }}> · </span>
                  Issued {formatDate(po.issuedAt)}
                </>
              )}
              {po.receivedAt && (
                <>
                  <span style={{ color: "var(--text-faint)" }}> · </span>
                  Received {formatDate(po.receivedAt)}
                </>
              )}
            </p>
          </div>
          <div className="text-right">
            <div
              style={{
                color: "var(--text-faint)",
                fontSize: 10,
                fontWeight: 700,
                letterSpacing: "0.08em",
                textTransform: "uppercase",
              }}
            >
              Total
            </div>
            <div
              className="mt-1"
              style={{
                color: "var(--text-default)",
                fontSize: 22,
                fontWeight: 600,
                letterSpacing: "-0.018em",
                fontFeatureSettings: "'tnum' 1",
                lineHeight: 1.1,
              }}
            >
              {formatMoney(Number(po.total), ctx.tenant.currency)}
            </div>
          </div>
        </div>
      </header>

      {/* Workflow action bar. */}
      {(editable || receivable || po.status === "RECEIVED") && (
        <div className="flex flex-wrap items-center gap-2">
          {editable && (
            <form action={issueAction}>
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
                Issue to supplier
              </button>
            </form>
          )}
          {po.status === "RECEIVED" && (
            <form action={closeAction}>
              <button
                type="submit"
                className="ts-focus inline-flex items-center gap-1.5 rounded-lg font-semibold transition-colors"
                style={{
                  height: 32,
                  padding: "0 14px",
                  background: "var(--surface-2)",
                  color: "var(--text-default)",
                  border: "1px solid var(--border-subtle)",
                  fontSize: 12.5,
                  letterSpacing: "-0.005em",
                }}
              >
                Close PO
              </button>
            </form>
          )}
          {(editable || po.status === "ISSUED") && (
            <form action={cancelAction}>
              <button
                type="submit"
                className="ts-focus inline-flex items-center gap-1.5 rounded-lg font-semibold transition-colors hover:bg-[color-mix(in_oklab,var(--rose-500)_8%,transparent)]"
                style={{
                  height: 32,
                  padding: "0 14px",
                  background: "transparent",
                  color: "var(--danger-fg, var(--rose-500))",
                  border: "1px solid color-mix(in oklab, var(--rose-500) 28%, transparent)",
                  fontSize: 12.5,
                  letterSpacing: "-0.005em",
                }}
              >
                Cancel PO
              </button>
            </form>
          )}
        </div>
      )}

      {/* Line items. */}
      <Card>
        <div
          className="flex items-center justify-between px-5 py-3.5"
          style={{ borderBottom: "1px solid var(--border-subtle)" }}
        >
          <div className="flex items-center gap-1.5">
            <span
              aria-hidden
              style={{ width: 3, height: 3, borderRadius: 1, background: "var(--accent-primary)" }}
            />
            <h2
              style={{
                color: "var(--text-default)",
                fontSize: 13,
                fontWeight: 600,
                letterSpacing: "-0.005em",
              }}
            >
              Line items
            </h2>
          </div>
          <span style={{ color: "var(--text-muted)", fontSize: 11.5 }}>
            {po.lines.length} {po.lines.length === 1 ? "line" : "lines"}
          </span>
        </div>

        {po.lines.length === 0 ? (
          <div
            className="px-5 py-10 text-center"
            style={{ color: "var(--text-muted)", fontSize: 12.5 }}
          >
            <div style={{ color: "var(--text-default)", fontWeight: 600, fontSize: 14 }}>
              No line items yet
            </div>
            <p className="mt-1.5">
              Add an item below — link it to a Material to update stock when you receive it.
            </p>
          </div>
        ) : (
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
                <th className="px-5 py-2.5 text-left" style={hStyle}>Item</th>
                <th className="px-5 py-2.5 text-right" style={hStyle}>Qty</th>
                <th className="px-5 py-2.5 text-right" style={hStyle}>Unit cost</th>
                <th className="px-5 py-2.5 text-right" style={hStyle}>Total</th>
                <th className="px-5 py-2.5 text-left" style={hStyle}>Received</th>
                <th className="px-5 py-2.5 text-right" style={hStyle}>{receivable ? "Receive" : ""}</th>
              </tr>
            </thead>
            <tbody>
              {po.lines.map((l) => {
                const qty = Number(l.quantity);
                const received = Number(l.receivedQty);
                const remaining = qty - received;
                const isComplete = received >= qty - 0.001;
                const receiveAction = receivePurchaseOrderLine.bind(null, slug, po.id, l.id);
                const removeAction = removePurchaseOrderLine.bind(null, slug, po.id, l.id);
                return (
                  <tr key={l.id} style={{ borderTop: "1px solid var(--border-subtle)" }}>
                    <td className="px-5 py-3">
                      <div
                        style={{
                          color: "var(--text-default)",
                          fontSize: 13,
                          fontWeight: 600,
                        }}
                      >
                        {l.description}
                      </div>
                      {l.material && (
                        <Link
                          href={`/t/${slug}/materials`}
                          className="mt-0.5 inline-flex items-center gap-1 transition-colors hover:underline"
                          style={{
                            color: "var(--accent-primary)",
                            fontSize: 11,
                            fontWeight: 500,
                          }}
                        >
                          → linked to {l.material.name}
                        </Link>
                      )}
                    </td>
                    <td
                      className="px-5 py-3 text-right"
                      style={{
                        color: "var(--text-default)",
                        fontFeatureSettings: "'tnum' 1",
                      }}
                    >
                      {qty} {l.material?.unit ?? ""}
                    </td>
                    <td
                      className="px-5 py-3 text-right"
                      style={{
                        color: "var(--text-muted)",
                        fontFeatureSettings: "'tnum' 1",
                      }}
                    >
                      {formatMoney(Number(l.unitCost), ctx.tenant.currency)}
                    </td>
                    <td
                      className="px-5 py-3 text-right"
                      style={{
                        color: "var(--text-default)",
                        fontWeight: 600,
                        fontFeatureSettings: "'tnum' 1",
                      }}
                    >
                      {formatMoney(Number(l.total), ctx.tenant.currency)}
                    </td>
                    <td className="px-5 py-3">
                      {received > 0 ? (
                        <span
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: 5,
                            fontSize: 10.5,
                            fontWeight: 700,
                            color: isComplete ? "var(--emerald-500)" : "var(--amber-500)",
                            background: isComplete
                              ? "color-mix(in oklab, var(--emerald-500) 14%, transparent)"
                              : "color-mix(in oklab, var(--amber-500) 14%, transparent)",
                            border: isComplete
                              ? "1px solid color-mix(in oklab, var(--emerald-500) 30%, transparent)"
                              : "1px solid color-mix(in oklab, var(--amber-500) 30%, transparent)",
                            padding: "2px 7px",
                            borderRadius: 999,
                            lineHeight: 1,
                            letterSpacing: "0.04em",
                            fontFeatureSettings: "'tnum' 1",
                          }}
                        >
                          {received} / {qty}
                        </span>
                      ) : (
                        <span style={{ color: "var(--text-faint)", fontSize: 11.5 }}>—</span>
                      )}
                    </td>
                    <td className="px-5 py-3 text-right">
                      {receivable && remaining > 0.001 ? (
                        <form action={receiveAction} className="inline-flex items-center gap-1.5">
                          <input
                            name="qty"
                            type="number"
                            step="0.01"
                            min="0"
                            max={remaining}
                            defaultValue={remaining}
                            style={{ ...inputStyle, width: 80, fontSize: 12.5 }}
                          />
                          <button
                            type="submit"
                            className="ts-focus"
                            style={{
                              height: 32,
                              padding: "0 12px",
                              borderRadius: 7,
                              background: "var(--accent-surface)",
                              color: "var(--accent-primary)",
                              border:
                                "1px solid color-mix(in oklab, var(--accent-primary) 28%, transparent)",
                              fontSize: 11.5,
                              fontWeight: 600,
                              letterSpacing: "-0.005em",
                              cursor: "pointer",
                            }}
                          >
                            Receive
                          </button>
                        </form>
                      ) : editable ? (
                        <form action={removeAction}>
                          <button
                            type="submit"
                            className="ts-focus"
                            style={{
                              fontSize: 11,
                              color: "var(--text-faint)",
                              background: "transparent",
                              border: 0,
                              cursor: "pointer",
                            }}
                            aria-label="Remove line"
                          >
                            Remove
                          </button>
                        </form>
                      ) : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </Card>

      {/* Add-line form. */}
      {editable && (
        <Card>
          <div
            className="flex items-center gap-1.5 px-5 py-3.5"
            style={{ borderBottom: "1px solid var(--border-subtle)" }}
          >
            <span
              aria-hidden
              style={{ width: 3, height: 3, borderRadius: 1, background: "var(--accent-primary)" }}
            />
            <h2
              style={{
                color: "var(--text-default)",
                fontSize: 13,
                fontWeight: 600,
                letterSpacing: "-0.005em",
              }}
            >
              Add a line
            </h2>
          </div>
          <form action={addLineAction} className="px-5 py-4 space-y-3">
            <div className="grid gap-3 sm:grid-cols-[1fr_140px_140px_120px]">
              <label className="block">
                <span style={fieldLabelStyle}>Description</span>
                <input
                  type="text"
                  name="description"
                  required
                  placeholder="3M IJ180Cv3 white vinyl"
                  style={{ ...inputStyle, height: 38, width: "100%" }}
                />
              </label>
              <label className="block">
                <span style={fieldLabelStyle}>Link to material (optional)</span>
                <select name="materialId" defaultValue="" style={{ ...inputStyle, height: 38, width: "100%" }}>
                  <option value="">— None —</option>
                  {materials.map((m) => (
                    <option key={m.id} value={m.id}>{m.name} ({m.unit})</option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span style={fieldLabelStyle}>Quantity</span>
                <input
                  type="number"
                  name="quantity"
                  required
                  step="0.01"
                  min="0.01"
                  defaultValue="1"
                  style={{ ...inputStyle, height: 38, width: "100%" }}
                />
              </label>
              <label className="block">
                <span style={fieldLabelStyle}>Unit cost</span>
                <input
                  type="number"
                  name="unitCost"
                  step="0.01"
                  min="0"
                  defaultValue="0"
                  style={{ ...inputStyle, height: 38, width: "100%" }}
                />
              </label>
            </div>
            <div className="flex justify-end">
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
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path d="M12 5v14M5 12h14" />
                </svg>
                Add line
              </button>
            </div>
          </form>
        </Card>
      )}

      {po.notes && (
        <Card>
          <div
            className="flex items-center gap-1.5 px-5 py-3.5"
            style={{ borderBottom: "1px solid var(--border-subtle)" }}
          >
            <span
              aria-hidden
              style={{ width: 3, height: 3, borderRadius: 1, background: "var(--accent-primary)" }}
            />
            <h2
              style={{
                color: "var(--text-default)",
                fontSize: 13,
                fontWeight: 600,
                letterSpacing: "-0.005em",
              }}
            >
              Notes
            </h2>
          </div>
          <p
            className="px-5 py-4"
            style={{
              color: "var(--text-muted)",
              fontSize: 13,
              lineHeight: 1.55,
              whiteSpace: "pre-wrap",
            }}
          >
            {po.notes}
          </p>
        </Card>
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

const fieldLabelStyle = {
  display: "block" as const,
  marginBottom: 5,
  color: "var(--text-default)",
  fontSize: 11.5,
  fontWeight: 600 as const,
  letterSpacing: "-0.005em",
};

function Flash({ tone, text }: { tone: "success" | "info" | "error"; text: string }) {
  const colors = tone === "success"
    ? { bg: "color-mix(in oklab, var(--emerald-500) 12%, transparent)", border: "color-mix(in oklab, var(--emerald-500) 30%, transparent)", fg: "var(--emerald-500)" }
    : tone === "info"
      ? { bg: "color-mix(in oklab, var(--accent-primary) 10%, transparent)", border: "color-mix(in oklab, var(--accent-primary) 28%, transparent)", fg: "var(--accent-primary)" }
      : { bg: "color-mix(in oklab, var(--rose-500) 12%, transparent)", border: "color-mix(in oklab, var(--rose-500) 30%, transparent)", fg: "var(--danger-fg, var(--rose-500))" };
  return (
    <div
      className="rounded-lg px-4 py-2.5"
      style={{
        background: colors.bg,
        border: `1px solid ${colors.border}`,
        color: colors.fg,
        fontSize: 12.5,
        lineHeight: 1.45,
        fontWeight: 500,
      }}
    >
      {text}
    </div>
  );
}
