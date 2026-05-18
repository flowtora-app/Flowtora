import Link from "next/link";
import { requirePermission } from "@/lib/tenant";

// Supplier orders / Purchase orders (T-11a).
//
// PO workflow: draft -> issued -> partial -> received -> closed.
// Tracks expected delivery, line items by material, total cost, and
// receipts against the order.

export const dynamic = "force-dynamic";

type POStatus = "DRAFT" | "ISSUED" | "PARTIAL" | "RECEIVED" | "CLOSED";

const STATUS_META: Record<POStatus, { label: string; color: string }> = {
  DRAFT:    { label: "Draft",            color: "#6b7280" },
  ISSUED:   { label: "Issued",           color: "#3b82f6" },
  PARTIAL:  { label: "Partial received", color: "#f59e0b" },
  RECEIVED: { label: "Received",         color: "#10b981" },
  CLOSED:   { label: "Closed",           color: "#6b7280" },
};

type ExamplePO = {
  id: string;
  number: string;
  supplier: string;
  status: POStatus;
  itemsLabel: string;
  total: number;
  expectedAt: string;
  issuedAt: string;
};

const EXAMPLES: ExamplePO[] = [
  { id: "po-1", number: "PO-1042", supplier: "GrimcoFL",          status: "ISSUED",   itemsLabel: "3 line items",                 total: 1842.50, expectedAt: "in 4 days",  issuedAt: "2 days ago" },
  { id: "po-2", number: "PO-1041", supplier: "Piedmont Plastics", status: "PARTIAL",  itemsLabel: "2 line items · 1 received",    total: 985.00,  expectedAt: "in 1 day",   issuedAt: "5 days ago" },
  { id: "po-3", number: "PO-1040", supplier: "Roland DGA",        status: "RECEIVED", itemsLabel: "1 line item",                  total: 504.00,  expectedAt: "Delivered", issuedAt: "8 days ago" },
  { id: "po-4", number: "PO-1039", supplier: "S&S Activewear",    status: "RECEIVED", itemsLabel: "1 line item · 200 tees",       total: 620.00,  expectedAt: "Delivered", issuedAt: "11 days ago" },
  { id: "po-5", number: "PO-1038", supplier: "Madeira USA",       status: "DRAFT",    itemsLabel: "2 line items",                 total: 245.30,  expectedAt: "—",          issuedAt: "Today" },
];

export default async function SupplierOrdersPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  await requirePermission(slug, "customers:view");

  const outstandingTotal = EXAMPLES
    .filter((p) => p.status === "ISSUED" || p.status === "PARTIAL")
    .reduce((sum, p) => sum + p.total, 0);

  return (
    <div className="space-y-5">
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
                Supplier orders
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
                {EXAMPLES.length}
              </span>
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "baseline",
                  gap: 5,
                  fontSize: 11.5,
                  color: "var(--text-muted)",
                }}
              >
                <span
                  style={{
                    fontSize: 10,
                    fontWeight: 700,
                    letterSpacing: "0.06em",
                    textTransform: "uppercase",
                    color: "var(--text-faint)",
                  }}
                >
                  Outstanding
                </span>
                <span
                  style={{
                    fontWeight: 700,
                    color: "var(--text-default)",
                    fontFeatureSettings: "'tnum' 1",
                  }}
                >
                  ${outstandingTotal.toFixed(2)}
                </span>
              </span>
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
            </div>
            <p
              className="mt-1.5"
              style={{
                color: "var(--text-muted)",
                fontSize: 12.5,
                lineHeight: 1.45,
              }}
            >
              Purchase orders to your suppliers — track expected delivery, partial receipts, and outstanding spend.
            </p>
          </div>
          <button
            type="button"
            disabled
            title="POs ship in a future update"
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
              fontWeight: 600,
              borderRadius: 8,
              opacity: 0.55,
              cursor: "not-allowed",
            }}
          >
            New PO
          </button>
        </div>
      </div>

      {/* PO table. */}
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
              <th className="px-4 py-3 text-left"  style={hStyle}>PO #</th>
              <th className="px-4 py-3 text-left"  style={hStyle}>Supplier</th>
              <th className="px-4 py-3 text-left"  style={hStyle}>Status</th>
              <th className="px-4 py-3 text-left"  style={hStyle}>Items</th>
              <th className="px-4 py-3 text-right" style={hStyle}>Total</th>
              <th className="px-4 py-3 text-left"  style={hStyle}>Expected</th>
            </tr>
          </thead>
          <tbody>
            {EXAMPLES.map((p) => {
              const meta = STATUS_META[p.status];
              return (
                <tr key={p.id} style={{ borderTop: "1px solid var(--border-subtle)" }}>
                  <td
                    className="px-4 py-3"
                    style={{
                      color: "var(--text-default)",
                      fontSize: 13,
                      fontWeight: 600,
                      fontFamily: "var(--font-mono, ui-monospace, monospace)",
                      fontFeatureSettings: "'tnum' 1",
                    }}
                  >
                    {p.number}
                  </td>
                  <td
                    className="px-4 py-3"
                    style={{
                      color: "var(--text-default)",
                      fontSize: 13,
                      fontWeight: 500,
                    }}
                  >
                    {p.supplier}
                    <div
                      className="mt-0.5"
                      style={{ color: "var(--text-faint)", fontSize: 11 }}
                    >
                      Issued {p.issuedAt}
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
                        }}
                      />
                      {meta.label}
                    </span>
                  </td>
                  <td
                    className="px-4 py-3"
                    style={{ color: "var(--text-muted)", fontSize: 12.5 }}
                  >
                    {p.itemsLabel}
                  </td>
                  <td
                    className="px-4 py-3 text-right"
                    style={{
                      color: "var(--text-default)",
                      fontSize: 13,
                      fontWeight: 600,
                      fontFeatureSettings: "'tnum' 1",
                    }}
                  >
                    ${p.total.toFixed(2)}
                  </td>
                  <td
                    className="px-4 py-3"
                    style={{
                      color:
                        p.expectedAt.startsWith("in 1") || p.expectedAt.startsWith("in 2")
                          ? "var(--amber-500)"
                          : "var(--text-muted)",
                      fontSize: 12.5,
                      fontWeight: 500,
                    }}
                  >
                    {p.expectedAt}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

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
            Purchase orders ship in a future update. Rows above demonstrate the full PO workflow: draft → issued → partial → received → closed, with expected delivery, line items, and outstanding spend totals.
          </div>
        </div>
      </div>
    </div>
  );
}

const hStyle = {
  fontSize: 10.5,
  fontWeight: 700,
  letterSpacing: "0.08em",
  textTransform: "uppercase" as const,
};
