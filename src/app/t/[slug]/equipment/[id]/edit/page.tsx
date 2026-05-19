import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePermission } from "@/lib/tenant";
import { db } from "@/lib/db";
import { updateEquipment } from "@/app/actions/equipment";
import { Card } from "@/components/Card";

// Equipment edit page (T-8).
//
// Mirrors /new but with all maintenance + assignment fields and
// dropdowns populated from the tenant's members and active orders.

export const dynamic = "force-dynamic";

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

/** Format a Date as YYYY-MM-DD for <input type="date"> defaultValue. */
function dateInputValue(d: Date | null | undefined): string {
  if (!d) return "";
  return d.toISOString().slice(0, 10);
}

export default async function EditEquipmentPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string; id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { slug, id } = await params;
  const sp = await searchParams;
  const ctx = await requirePermission(slug, "customers:view");

  const [equipment, members, openOrders] = await Promise.all([
    db.equipment.findFirst({
      where: { id, tenantId: ctx.tenant.id },
    }),
    // Operators are pulled from the tenant's active member list.
    db.membership.findMany({
      where: { tenantId: ctx.tenant.id, status: "ACTIVE" },
      include: { user: { select: { id: true, name: true, email: true } } },
      orderBy: { user: { name: "asc" } },
      take: 200,
    }),
    // Only show orders that could realistically be on the machine.
    // COMPLETED / CANCELED don't make sense as "currently running".
    db.order.findMany({
      where: {
        tenantId: ctx.tenant.id,
        status: { in: ["NEW", "IN_PRODUCTION", "READY"] },
      },
      orderBy: { createdAt: "desc" },
      select: { id: true, number: true, status: true },
      take: 100,
    }),
  ]);

  if (!equipment) notFound();

  const action = updateEquipment.bind(null, slug, equipment.id);

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <div style={{ fontSize: 12 }}>
        <Link
          href={`/t/${slug}/equipment/${equipment.id}`}
          className="ts-focus inline-flex items-center gap-1 transition-colors hover:text-[var(--text-default)]"
          style={{ color: "var(--text-muted)" }}
        >
          ← {equipment.name}
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
              Edit equipment
            </h1>
            <p
              className="mt-1.5"
              style={{
                color: "var(--text-muted)",
                fontSize: 12.5,
                lineHeight: 1.45,
              }}
            >
              Update status, reassign the operator, log service dates, or attach the order currently running.
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
        <form action={action} className="space-y-5 px-5 py-5">
          {/* Identification. */}
          <div className="grid gap-4 sm:grid-cols-2">
            <label>
              <span style={labelStyle}>Name</span>
              <input
                type="text"
                name="name"
                required
                defaultValue={equipment.name}
                style={inputStyle}
              />
            </label>
            <label>
              <span style={labelStyle}>Kind</span>
              <input
                type="text"
                name="kind"
                required
                defaultValue={equipment.kind}
                style={inputStyle}
              />
            </label>
            <label>
              <span style={labelStyle}>Model</span>
              <input
                type="text"
                name="model"
                defaultValue={equipment.model ?? ""}
                style={inputStyle}
              />
            </label>
            <label>
              <span style={labelStyle}>Serial number</span>
              <input
                type="text"
                name="serialNumber"
                defaultValue={equipment.serialNumber ?? ""}
                style={inputStyle}
              />
            </label>
          </div>

          {/* Status + assignment. */}
          <div
            className="rounded-xl px-4 py-4"
            style={{
              background:
                "color-mix(in oklab, var(--surface-2) 40%, transparent)",
              border: "1px solid var(--border-subtle)",
            }}
          >
            <h3
              style={{
                color: "var(--text-default)",
                fontSize: 12.5,
                fontWeight: 700,
                letterSpacing: "0.04em",
                textTransform: "uppercase",
                marginBottom: 12,
              }}
            >
              Status &amp; assignment
            </h3>
            <div className="grid gap-4 sm:grid-cols-2">
              <label>
                <span style={labelStyle}>Status</span>
                <select
                  name="status"
                  defaultValue={equipment.status}
                  style={inputStyle}
                >
                  <option value="IDLE">Idle</option>
                  <option value="RUNNING">Running</option>
                  <option value="MAINTENANCE">Maintenance</option>
                  <option value="DOWN">Down</option>
                </select>
              </label>
              <label>
                <span style={labelStyle}>Operator</span>
                <select
                  name="operatorId"
                  defaultValue={equipment.operatorId ?? ""}
                  style={inputStyle}
                >
                  <option value="">Unassigned</option>
                  {members.map((m) => (
                    <option key={m.user.id} value={m.user.id}>
                      {m.user.name || m.user.email?.split("@")[0]}
                    </option>
                  ))}
                </select>
              </label>
              <label className="sm:col-span-2">
                <span style={labelStyle}>Current order</span>
                <select
                  name="currentOrderId"
                  defaultValue={equipment.currentOrderId ?? ""}
                  style={inputStyle}
                >
                  <option value="">None</option>
                  {openOrders.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.number} · {o.status.replaceAll("_", " ").toLowerCase()}
                    </option>
                  ))}
                </select>
                <span
                  className="mt-1.5 block"
                  style={{ color: "var(--text-faint)", fontSize: 11.5 }}
                >
                  Only open orders (new / in production / ready) are listed.
                </span>
              </label>
              <label className="sm:col-span-2">
                <span style={labelStyle}>Down reason</span>
                <input
                  type="text"
                  name="downReason"
                  defaultValue={equipment.downReason ?? ""}
                  placeholder="Awaiting bit replacement, head clog, etc."
                  style={inputStyle}
                />
                <span
                  className="mt-1.5 block"
                  style={{ color: "var(--text-faint)", fontSize: 11.5 }}
                >
                  Saved only when status is <strong>Down</strong>; cleared automatically when the machine comes back up.
                </span>
              </label>
            </div>
          </div>

          {/* Maintenance schedule. */}
          <div
            className="rounded-xl px-4 py-4"
            style={{
              background:
                "color-mix(in oklab, var(--surface-2) 40%, transparent)",
              border: "1px solid var(--border-subtle)",
            }}
          >
            <h3
              style={{
                color: "var(--text-default)",
                fontSize: 12.5,
                fontWeight: 700,
                letterSpacing: "0.04em",
                textTransform: "uppercase",
                marginBottom: 12,
              }}
            >
              Maintenance
            </h3>
            <div className="grid gap-4 sm:grid-cols-2">
              <label>
                <span style={labelStyle}>Last serviced</span>
                <input
                  type="date"
                  name="lastServicedAt"
                  defaultValue={dateInputValue(equipment.lastServicedAt)}
                  style={inputStyle}
                />
              </label>
              <label>
                <span style={labelStyle}>Next service due</span>
                <input
                  type="date"
                  name="nextServiceDueAt"
                  defaultValue={dateInputValue(equipment.nextServiceDueAt)}
                  style={inputStyle}
                />
              </label>
            </div>
          </div>

          {/* Notes. */}
          <label className="block">
            <span style={labelStyle}>Internal notes</span>
            <textarea
              name="internalNotes"
              rows={4}
              defaultValue={equipment.internalNotes ?? ""}
              placeholder="Operating quirks, calibration notes, who to call for repair, etc."
              style={{
                ...inputStyle,
                height: "auto",
                paddingTop: 10,
                paddingBottom: 10,
                resize: "vertical",
                lineHeight: 1.5,
              }}
            />
          </label>

          <div
            className="flex items-center justify-end gap-2 pt-4"
            style={{ borderTop: "1px solid var(--border-subtle)" }}
          >
            <Link
              href={`/t/${slug}/equipment/${equipment.id}`}
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
