// Page 33 §SLA settings — per priority + plan SLA matrix.
//
// 4 priorities × 4 plans = 16 cells. Each cell expands into a small
// edit form when clicked. Empty cells fall back to the global default
// (rendered as "—") and surfacing them is up to the runtime evaluator
// (server/platform/support-sla); this page is the matrix admin tool.

import Link from "next/link";
import { requirePlatformStaff } from "@/lib/platform";
import { db } from "@/lib/db";
import {
  upsertSlaTarget,
  deleteSlaTarget,
} from "@/app/actions/platform-support-sla";
import type { SupportTicketPriority, Plan, SupportSlaTarget } from "@prisma/client";
import { FormError, FormOk } from "../_components/shared";

export const dynamic = "force-dynamic";

const PRIORITIES: SupportTicketPriority[] = ["URGENT", "HIGH", "NORMAL", "LOW"];
const PLANS: Plan[] = ["STARTER", "GROWTH", "PRO", "ENTERPRISE"];

const PRIORITY_TONE: Record<SupportTicketPriority, { bg: string; fg: string }> = {
  URGENT: { bg: "var(--danger-surface, var(--surface-2))",  fg: "var(--danger-fg)"      },
  HIGH:   { bg: "var(--warning-surface)", fg: "var(--warning-fg)"     },
  NORMAL: { bg: "var(--accent-surface)",  fg: "var(--accent-primary)" },
  LOW:    { bg: "var(--surface-2)",       fg: "var(--text-muted)"     },
};

export default async function SlaSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; error?: string; cell?: string }>;
}) {
  const ctx = await requirePlatformStaff();
  const sp = await searchParams;
  const canWrite = ctx.can("support.macro_manage");

  const targets = await db.supportSlaTarget.findMany();
  const matrix = new Map<string, SupportSlaTarget>();
  for (const t of targets) {
    matrix.set(`${t.priority}_${t.plan}`, t);
  }

  const editingCell = typeof sp.cell === "string" ? sp.cell : null;

  return (
    <div className="space-y-5">
      {/* Breadcrumb */}
      <div className="text-[11px]" style={{ color: "var(--text-muted)" }}>
        <Link href="/platform/operations/tickets" className="underline" style={{ color: "var(--text-muted)" }}>
          Support tickets
        </Link>
        <span className="mx-1.5">/</span>
        <span style={{ color: "var(--text-default)" }}>SLA settings</span>
      </div>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-[22px] font-semibold leading-tight" style={{ color: "var(--text-default)" }}>
            SLA settings
          </h1>
          <p className="mt-1 text-[12px]" style={{ color: "var(--text-muted)" }}>
            Per-priority + per-plan first-response and resolution targets, plus business-hours
            scoping and escalation policies. The runtime evaluator picks the matching cell when
            a ticket is opened or replied to.
          </p>
        </div>
        <Link
          href="/platform/operations/tickets"
          className="ts-focus rounded-md px-3 py-1.5 text-[11px] font-medium"
          style={{
            background: "var(--surface-1)",
            color: "var(--text-default)",
            border: "1px solid var(--border-default)",
          }}
        >
          ← Back to inbox
        </Link>
      </div>

      <FormOk msg={sp.ok} />
      <FormError msg={sp.error} />

      {/* Matrix */}
      <div
        className="overflow-x-auto rounded-lg border"
        style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)" }}
      >
        <table className="w-full text-[12px]">
          <thead style={{ background: "var(--surface-2)" }}>
            <tr>
              <th className="sticky left-0 px-3 py-2 text-left font-semibold" style={{ background: "var(--surface-2)", color: "var(--text-muted)" }}>
                Priority \ Plan
              </th>
              {PLANS.map((p) => (
                <th key={p} className="px-3 py-2 text-left font-semibold" style={{ color: "var(--text-muted)" }}>
                  {p}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {PRIORITIES.map((prio) => {
              const tone = PRIORITY_TONE[prio];
              return (
                <tr key={prio} style={{ borderTop: "1px solid var(--border-subtle)" }}>
                  <td className="sticky left-0 px-3 py-3"
                      style={{ background: "var(--surface-1)", borderRight: "1px solid var(--border-subtle)" }}>
                    <span
                      className="rounded-full px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
                      style={{ background: tone.bg, color: tone.fg }}
                    >
                      {prio}
                    </span>
                  </td>
                  {PLANS.map((plan) => {
                    const key = `${prio}_${plan}`;
                    const t = matrix.get(key);
                    const isEditing = editingCell === key;
                    return (
                      <td key={plan} className="align-top px-3 py-3" style={{ minWidth: 220 }}>
                        {isEditing ? (
                          <SlaCellForm
                            priority={prio}
                            plan={plan}
                            target={t}
                            canWrite={canWrite}
                          />
                        ) : (
                          <SlaCellSummary
                            priority={prio}
                            plan={plan}
                            target={t}
                            canWrite={canWrite}
                          />
                        )}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>
        Click any cell to edit. Empty cells fall back to the global default (24h first response,
        72h resolution) until configured.
      </p>
    </div>
  );
}

function SlaCellSummary({
  priority, plan, target, canWrite,
}: {
  priority: SupportTicketPriority;
  plan: Plan;
  target: SupportSlaTarget | undefined;
  canWrite: boolean;
}) {
  const cellKey = `${priority}_${plan}`;
  if (!target) {
    return canWrite ? (
      <Link
        href={`?cell=${cellKey}`}
        className="ts-focus block rounded-md border border-dashed px-3 py-2 text-[11px]"
        style={{ borderColor: "var(--border-default)", color: "var(--text-muted)" }}
      >
        + Add target
      </Link>
    ) : (
      <span className="text-[11px]" style={{ color: "var(--text-faint)" }}>
        — uses default —
      </span>
    );
  }
  return (
    <Link
      href={canWrite ? `?cell=${cellKey}` : "#"}
      className="ts-focus block rounded-md border px-3 py-2"
      style={{
        background: "var(--surface-1)",
        borderColor: "var(--border-subtle)",
        color: "var(--text-default)",
      }}
    >
      <div className="text-[11px]">
        First reply: <b className="tabular-nums">{target.firstResponseTargetHrs}h</b>
      </div>
      <div className="text-[11px]" style={{ color: "var(--text-muted)" }}>
        Resolve: <b className="tabular-nums" style={{ color: "var(--text-default)" }}>{target.resolutionTargetHrs}h</b>
      </div>
      {target.businessHoursOnly && (
        <div className="mt-1 text-[10px]" style={{ color: "var(--accent-primary)" }}>
          Business hours only
        </div>
      )}
      {target.escalateAtBreach.length > 0 && (
        <div className="mt-1 text-[10px]" style={{ color: "var(--warning-fg)" }}>
          Escalation set
        </div>
      )}
    </Link>
  );
}

function SlaCellForm({
  priority, plan, target, canWrite,
}: {
  priority: SupportTicketPriority;
  plan: Plan;
  target: SupportSlaTarget | undefined;
  canWrite: boolean;
}) {
  return (
    <form
      action={upsertSlaTarget}
      className="flex flex-col gap-1.5 rounded-md border p-2"
      style={{ background: "var(--surface-2)", borderColor: "var(--accent-primary)" }}
    >
      <input type="hidden" name="priority" value={priority} />
      <input type="hidden" name="plan" value={plan} />
      <Mini label="First reply (hrs)">
        <input
          type="number"
          name="firstResponseTargetHrs"
          defaultValue={target?.firstResponseTargetHrs ?? defaultFirst(priority)}
          min={1}
          max={720}
          required
          disabled={!canWrite}
          className="ts-focus w-full rounded-sm px-1.5 py-1 text-[11px] tabular-nums outline-none"
          style={inputStyle()}
        />
      </Mini>
      <Mini label="Resolve (hrs)">
        <input
          type="number"
          name="resolutionTargetHrs"
          defaultValue={target?.resolutionTargetHrs ?? defaultResolve(priority)}
          min={1}
          max={2000}
          required
          disabled={!canWrite}
          className="ts-focus w-full rounded-sm px-1.5 py-1 text-[11px] tabular-nums outline-none"
          style={inputStyle()}
        />
      </Mini>
      <Mini label="Warning (hrs before)">
        <input
          type="number"
          name="warningHrsBefore"
          defaultValue={target?.warningHrsBefore ?? 2}
          min={0}
          max={168}
          disabled={!canWrite}
          className="ts-focus w-full rounded-sm px-1.5 py-1 text-[11px] tabular-nums outline-none"
          style={inputStyle()}
        />
      </Mini>
      <label className="flex items-center gap-1.5 text-[10px]" style={{ color: "var(--text-default)" }}>
        <input
          type="checkbox"
          name="businessHoursOnly"
          defaultChecked={target?.businessHoursOnly ?? false}
          disabled={!canWrite}
          className="ts-focus h-3 w-3"
        />
        Business hours only
      </label>
      <Mini label="Holiday calendar id">
        <input
          name="holidayCalendar"
          defaultValue={target?.holidayCalendar ?? ""}
          maxLength={60}
          disabled={!canWrite}
          placeholder="us-federal"
          className="ts-focus w-full rounded-sm px-1.5 py-1 text-[11px] outline-none"
          style={inputStyle()}
        />
      </Mini>
      <Mini label="Warning escalation user ids">
        <input
          name="escalateAtWarning"
          defaultValue={(target?.escalateAtWarning ?? []).join(", ")}
          disabled={!canWrite}
          placeholder="user_1, user_2"
          className="ts-focus w-full rounded-sm px-1.5 py-1 text-[11px] outline-none"
          style={inputStyle()}
        />
      </Mini>
      <Mini label="Breach escalation user ids">
        <input
          name="escalateAtBreach"
          defaultValue={(target?.escalateAtBreach ?? []).join(", ")}
          disabled={!canWrite}
          placeholder="user_oncall"
          className="ts-focus w-full rounded-sm px-1.5 py-1 text-[11px] outline-none"
          style={inputStyle()}
        />
      </Mini>
      <div className="mt-1 flex items-center justify-between gap-1">
        <Link
          href="?"
          className="text-[10px] underline"
          style={{ color: "var(--text-muted)" }}
        >
          cancel
        </Link>
        {canWrite && (
          <button
            type="submit"
            className="ts-focus rounded-sm px-2 py-1 text-[10px] font-semibold"
            style={{ background: "var(--accent-primary)", color: "var(--accent-fg)" }}
          >
            Save
          </button>
        )}
      </div>
      {target && canWrite && (
        <DeleteForm priority={priority} plan={plan} />
      )}
    </form>
  );
}

function DeleteForm({ priority, plan }: { priority: SupportTicketPriority; plan: Plan }) {
  return (
    <form action={deleteSlaTarget} className="mt-1">
      <input type="hidden" name="priority" value={priority} />
      <input type="hidden" name="plan" value={plan} />
      <button
        type="submit"
        className="text-[10px] underline"
        style={{ color: "var(--danger-fg)" }}
      >
        Delete this target
      </button>
    </form>
  );
}

function Mini({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex items-center justify-between gap-2 text-[10px]" style={{ color: "var(--text-muted)" }}>
      <span>{label}</span>
      <span style={{ width: 90 }}>{children}</span>
    </label>
  );
}

function defaultFirst(p: SupportTicketPriority): number {
  switch (p) { case "URGENT": return 1; case "HIGH": return 4; case "NORMAL": return 24; case "LOW": return 72; }
}
function defaultResolve(p: SupportTicketPriority): number {
  switch (p) { case "URGENT": return 6; case "HIGH": return 24; case "NORMAL": return 72; case "LOW": return 240; }
}

function inputStyle(): React.CSSProperties {
  return {
    background: "var(--surface-1)",
    border: "1px solid var(--border-default)",
    color: "var(--text-default)",
  };
}
