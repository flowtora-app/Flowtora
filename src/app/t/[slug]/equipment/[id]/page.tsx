import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePermission } from "@/lib/tenant";
import { db } from "@/lib/db";
import {
  archiveEquipment,
  unarchiveEquipment,
} from "@/app/actions/equipment";
import { formatDate } from "@/lib/format";

// Equipment detail page (T-8).
//
// Shows the full record + maintenance metadata + assignment context.
// The list view is summary-only — this is where staff drill in to
// reassign an operator, change status, schedule service, or read the
// "why is it DOWN" note.

export const dynamic = "force-dynamic";

type EquipmentStatus = "RUNNING" | "IDLE" | "MAINTENANCE" | "DOWN";

const STATUS_META: Record<
  EquipmentStatus,
  { label: string; tone: string; copy: string }
> = {
  RUNNING:     { label: "Running",     tone: "#10b981", copy: "Actively producing a job." },
  IDLE:        { label: "Idle",        tone: "#6b7280", copy: "Powered on and available to schedule." },
  MAINTENANCE: { label: "Maintenance", tone: "#f59e0b", copy: "Service in progress — not bookable." },
  DOWN:        { label: "Down",        tone: "#ef4444", copy: "Out of service. Resolve before scheduling." },
};

export default async function EquipmentDetailPage({
  params,
}: {
  params: Promise<{ slug: string; id: string }>;
}) {
  const { slug, id } = await params;
  const ctx = await requirePermission(slug, "customers:view");

  const equipment = await db.equipment.findFirst({
    where: { id, tenantId: ctx.tenant.id },
    include: {
      operator:     { select: { id: true, name: true, email: true } },
      currentOrder: { select: { id: true, number: true, status: true, dueDate: true } },
    },
  });
  if (!equipment) notFound();

  const status   = equipment.status as EquipmentStatus;
  const meta     = STATUS_META[status];
  const archived = !!equipment.archivedAt;

  const archiveAction   = archiveEquipment.bind(null, slug, equipment.id);
  const unarchiveAction = unarchiveEquipment.bind(null, slug, equipment.id);

  return (
    <div className="space-y-5">
      <div style={{ fontSize: 12 }}>
        <Link
          href={`/t/${slug}/equipment`}
          className="ts-focus inline-flex items-center gap-1 transition-colors hover:text-[var(--text-default)]"
          style={{ color: "var(--text-muted)" }}
        >
          ← Equipment
        </Link>
      </div>

      {/* Header card. */}
      <header
        className="relative overflow-hidden rounded-2xl"
        style={{
          padding: "20px 24px",
          background:
            `radial-gradient(720px circle at -8% -40%, color-mix(in oklab, ${meta.tone} 14%, transparent), transparent 55%), ` +
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
                <rect x="3" y="6" width="18" height="13" rx="2" />
                <path d="M8 6v-2M16 6v-2M6 19v2M18 19v2M3 11h18" />
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
                  {equipment.name}
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
                    color: meta.tone,
                    background: `color-mix(in oklab, ${meta.tone} 16%, transparent)`,
                    border: `1px solid color-mix(in oklab, ${meta.tone} 30%, transparent)`,
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
                      background: meta.tone,
                      boxShadow: `0 0 0 2px color-mix(in oklab, ${meta.tone} 25%, transparent)`,
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
                {equipment.kind}
                {equipment.model ? ` · ${equipment.model}` : ""}
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
                href={`/t/${slug}/equipment/${equipment.id}/edit`}
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

      <div className="grid gap-4 lg:grid-cols-3">
        {/* Left rail — current assignment + maintenance schedule. */}
        <div className="space-y-4 lg:col-span-2">
          {/* Current assignment. */}
          <SectionCard
            title="Current assignment"
            tag={equipment.currentOrder ? "Active" : "—"}
            tagColor={equipment.currentOrder ? "#10b981" : undefined}
          >
            {equipment.currentOrder ? (
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Running order">
                  <Link
                    href={`/t/${slug}/orders/${equipment.currentOrder.id}`}
                    className="ts-focus underline-offset-2 hover:underline"
                    style={{
                      color: "var(--accent-primary)",
                      fontSize: 13,
                      fontWeight: 600,
                      letterSpacing: "-0.005em",
                    }}
                  >
                    {equipment.currentOrder.number}
                  </Link>
                  <div
                    className="mt-0.5"
                    style={{ color: "var(--text-muted)", fontSize: 11.5 }}
                  >
                    Status {equipment.currentOrder.status.replaceAll("_", " ").toLowerCase()}
                    {equipment.currentOrder.dueDate && (
                      <> · due {formatDate(equipment.currentOrder.dueDate)}</>
                    )}
                  </div>
                </Field>
                <Field label="Operator">
                  {equipment.operator ? (
                    <>
                      <div
                        style={{
                          color: "var(--text-default)",
                          fontSize: 13,
                          fontWeight: 600,
                        }}
                      >
                        {equipment.operator.name || equipment.operator.email?.split("@")[0]}
                      </div>
                      <div
                        className="mt-0.5"
                        style={{ color: "var(--text-faint)", fontSize: 11.5 }}
                      >
                        {equipment.operator.email}
                      </div>
                    </>
                  ) : (
                    <span style={{ color: "var(--text-muted)", fontSize: 13 }}>
                      Unassigned
                    </span>
                  )}
                </Field>
              </div>
            ) : (
              <p style={{ color: "var(--text-muted)", fontSize: 13, lineHeight: 1.5 }}>
                No order is currently running on this machine. Open the edit
                screen to assign one, or schedule it from the production board.
              </p>
            )}
          </SectionCard>

          {/* Maintenance schedule. */}
          <SectionCard
            title="Maintenance"
            tag={maintenanceTag(equipment.nextServiceDueAt)?.label}
            tagColor={maintenanceTag(equipment.nextServiceDueAt)?.color}
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Last serviced">
                {equipment.lastServicedAt ? (
                  <span style={{ color: "var(--text-default)", fontSize: 13 }}>
                    {formatDate(equipment.lastServicedAt)}
                  </span>
                ) : (
                  <span style={{ color: "var(--text-muted)", fontSize: 13 }}>
                    Never recorded
                  </span>
                )}
              </Field>
              <Field label="Next service due">
                {equipment.nextServiceDueAt ? (
                  <span style={{ color: "var(--text-default)", fontSize: 13 }}>
                    {formatDate(equipment.nextServiceDueAt)}
                  </span>
                ) : (
                  <span style={{ color: "var(--text-muted)", fontSize: 13 }}>
                    Not scheduled
                  </span>
                )}
              </Field>
            </div>
            {status === "DOWN" && equipment.downReason && (
              <div
                className="mt-4 rounded-lg px-3.5 py-3"
                style={{
                  background:
                    "color-mix(in oklab, var(--rose-500) 12%, transparent)",
                  border:
                    "1px solid color-mix(in oklab, var(--rose-500) 30%, transparent)",
                }}
              >
                <div
                  style={{
                    color: "var(--rose-500)",
                    fontSize: 10.5,
                    fontWeight: 700,
                    letterSpacing: "0.08em",
                    textTransform: "uppercase",
                  }}
                >
                  Down reason
                </div>
                <div
                  className="mt-1"
                  style={{
                    color: "var(--text-default)",
                    fontSize: 13,
                    lineHeight: 1.5,
                  }}
                >
                  {equipment.downReason}
                </div>
              </div>
            )}
          </SectionCard>

          {/* Internal notes. */}
          {equipment.internalNotes && (
            <SectionCard title="Internal notes">
              <p
                style={{
                  color: "var(--text-default)",
                  fontSize: 13,
                  lineHeight: 1.55,
                  whiteSpace: "pre-wrap",
                }}
              >
                {equipment.internalNotes}
              </p>
            </SectionCard>
          )}
        </div>

        {/* Right rail — identification + timestamps. */}
        <div className="space-y-4">
          <SectionCard title="Identification">
            <Field label="Model">
              <span style={{ color: "var(--text-default)", fontSize: 13 }}>
                {equipment.model || "—"}
              </span>
            </Field>
            <Field label="Serial number">
              <span
                style={{
                  color: "var(--text-default)",
                  fontSize: 13,
                  fontFamily: "var(--font-mono, ui-monospace, monospace)",
                }}
              >
                {equipment.serialNumber || "—"}
              </span>
            </Field>
            <Field label="Kind">
              <span style={{ color: "var(--text-default)", fontSize: 13 }}>
                {equipment.kind}
              </span>
            </Field>
          </SectionCard>

          <SectionCard title="Record">
            <Field label="Added">
              <span style={{ color: "var(--text-default)", fontSize: 13 }}>
                {formatDate(equipment.createdAt)}
              </span>
            </Field>
            <Field label="Updated">
              <span style={{ color: "var(--text-default)", fontSize: 13 }}>
                {formatDate(equipment.updatedAt)}
              </span>
            </Field>
            {equipment.archivedAt && (
              <Field label="Archived">
                <span style={{ color: "var(--text-default)", fontSize: 13 }}>
                  {formatDate(equipment.archivedAt)}
                </span>
              </Field>
            )}
          </SectionCard>
        </div>
      </div>
    </div>
  );
}

// ── Helpers ──────────────────────────────────────────────────────────

/** Render a tag for the maintenance card based on how close the next
 *  service date is. Returns null when no date is scheduled. */
function maintenanceTag(nextServiceDueAt: Date | null) {
  if (!nextServiceDueAt) return null;
  const days = Math.round(
    (nextServiceDueAt.getTime() - Date.now()) / 86_400_000,
  );
  if (days < 0)  return { label: "Overdue",  color: "#ef4444" };
  if (days <= 7) return { label: "Soon",     color: "#f59e0b" };
  return { label: "Scheduled", color: "#10b981" };
}

function SectionCard({
  title,
  tag,
  tagColor,
  children,
}: {
  title: string;
  tag?: string | null;
  tagColor?: string;
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
              display: "inline-flex",
              alignItems: "center",
              gap: 4,
              fontSize: 9.5,
              fontWeight: 700,
              letterSpacing: "0.06em",
              textTransform: "uppercase",
              color: tagColor ?? "var(--text-muted)",
              background: tagColor
                ? `color-mix(in oklab, ${tagColor} 14%, transparent)`
                : "color-mix(in oklab, var(--surface-2) 60%, transparent)",
              border: tagColor
                ? `1px solid color-mix(in oklab, ${tagColor} 30%, transparent)`
                : "1px solid var(--border-subtle)",
              padding: "2px 7px",
              borderRadius: 999,
              lineHeight: 1,
            }}
          >
            {tagColor && (
              <span
                aria-hidden
                style={{
                  width: 4,
                  height: 4,
                  borderRadius: 999,
                  background: tagColor,
                  boxShadow: `0 0 0 1.5px color-mix(in oklab, ${tagColor} 25%, transparent)`,
                }}
              />
            )}
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
