import {
  deleteEquipmentMaintenanceTask,
  upsertEquipmentMaintenanceTask,
} from "@/app/actions/platform-equipment";
import type { EquipmentDetail } from "@/server/platform/equipment";
import { FREQUENCY_LABEL } from "../../_components/shared";
import type { MasterMaintenanceFrequency } from "@prisma/client";

const FREQUENCIES = Object.keys(FREQUENCY_LABEL) as MasterMaintenanceFrequency[];

export function MaintenanceTab({
  detail, canManage,
}: {
  detail: EquipmentDetail;
  canManage: boolean;
}) {
  return (
    <div className="space-y-5">
      <section className="rounded-lg border" style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)" }}>
        <div className="border-b px-4 py-3" style={{ borderColor: "var(--border-subtle)" }}>
          <h2 className="text-[14px] font-semibold" style={{ color: "var(--text-default)" }}>
            Maintenance schedule template ({detail.maintenance.length})
          </h2>
          <p className="text-[12px]" style={{ color: "var(--text-muted)" }}>
            Tasks copied to a tenant&apos;s maintenance calendar when they adopt this equipment.
          </p>
        </div>

        {detail.maintenance.length === 0 ? (
          <div className="px-4 py-8 text-center text-[13px]" style={{ color: "var(--text-muted)" }}>
            No tasks defined yet. Add the first one below — daily clean, weekly head check, etc.
          </div>
        ) : (
          <ul className="divide-y" style={{ borderColor: "var(--border-subtle)" }}>
            {detail.maintenance.map((t) => (
              <li key={t.id} className="grid grid-cols-1 gap-2 px-4 py-3 md:grid-cols-[1fr_180px_140px_auto]">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-baseline gap-2">
                    <span className="text-[13px] font-semibold" style={{ color: "var(--text-default)" }}>
                      {t.taskName}
                    </span>
                    <span className="text-[10px]" style={{ color: "var(--text-muted)" }}>
                      sort {t.sortOrder}
                    </span>
                  </div>
                  {t.description && (
                    <p className="mt-0.5 text-[12px]" style={{ color: "var(--text-muted)" }}>
                      {t.description}
                    </p>
                  )}
                  {t.toolsNeeded.length > 0 && (
                    <p className="mt-1 text-[11px]" style={{ color: "var(--text-muted)" }}>
                      Tools: {t.toolsNeeded.join(", ")}
                    </p>
                  )}
                  {t.notes && (
                    <p className="mt-1 text-[11px]" style={{ color: "var(--text-muted)" }}>
                      {t.notes}
                    </p>
                  )}
                </div>
                <div className="text-[12px]" style={{ color: "var(--text-default)" }}>
                  <div className="font-medium">{FREQUENCY_LABEL[t.frequency]}</div>
                  {t.intervalCount != null && (
                    <div className="text-[11px]" style={{ color: "var(--text-muted)" }}>
                      every {t.intervalCount}
                    </div>
                  )}
                </div>
                <div className="text-[12px] tabular-nums" style={{ color: "var(--text-muted)" }}>
                  ~{t.estimatedMinutes}m
                </div>
                {canManage && (
                  <form action={deleteEquipmentMaintenanceTask.bind(null, t.id)}>
                    <button type="submit"
                            className="ts-focus rounded-md border px-2.5 py-1.5 text-[11px] font-medium"
                            style={{ borderColor: "var(--border-subtle)", color: "var(--danger-fg)", background: "var(--surface-1)" }}>
                      Remove
                    </button>
                  </form>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      {canManage && (
        <details className="rounded-lg border"
                 style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)" }}>
          <summary className="cursor-pointer border-b px-4 py-3 text-[13px] font-medium"
                   style={{ borderColor: "var(--border-subtle)", color: "var(--text-default)" }}>
            + Add task
          </summary>
          <form action={upsertEquipmentMaintenanceTask} className="grid grid-cols-1 gap-3 p-4 md:grid-cols-3">
            <input type="hidden" name="equipmentId" value={detail.id} />
            <Field label="Task name *" name="taskName" maxLength={120}
                   placeholder='e.g. "Capping station clean"' />
            <label className="block">
              <span className="block text-[11px] font-medium uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>
                Frequency *
              </span>
              <select name="frequency" required defaultValue="DAILY"
                      className="ts-focus mt-1 w-full rounded-md border px-3 py-2 text-[13px]"
                      style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)", color: "var(--text-default)" }}>
                {FREQUENCIES.map((f) => <option key={f} value={f}>{FREQUENCY_LABEL[f]}</option>)}
              </select>
            </label>
            <Field label="Interval count" name="intervalCount" type="number"
                   placeholder="(only for HOURS_OF_USE / CYCLES)" />
            <Field label="Estimated minutes" name="estimatedMinutes" type="number" defaultValue="15" />
            <Field label="Sort order" name="sortOrder" type="number"
                   defaultValue={String(detail.maintenance.length)} />
            <Field label="Tools needed (comma-separated)" name="toolsNeeded" maxLength={500}
                   placeholder='e.g. "lint-free wipes, distilled water"' />
            <Field label="Description" name="description" maxLength={500} wide />
            <Field label="Notes" name="notes" maxLength={500} wide />
            <div className="md:col-span-3 flex items-end justify-end">
              <button type="submit"
                      className="ts-focus rounded-md px-4 py-2 text-[13px] font-medium"
                      style={{ background: "var(--accent-primary)", color: "var(--accent-on-primary)" }}>
                Save task
              </button>
            </div>
          </form>
        </details>
      )}
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
      <input type={type} name={name} placeholder={placeholder}
             maxLength={maxLength} defaultValue={defaultValue}
             className="ts-focus mt-1 w-full rounded-md border px-3 py-2 text-[13px]"
             style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)", color: "var(--text-default)" }} />
    </label>
  );
}
