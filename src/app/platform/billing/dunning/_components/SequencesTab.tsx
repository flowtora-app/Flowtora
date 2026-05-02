import {
  deleteDunningSequence,
  deleteDunningStage,
  upsertDunningSequence,
  upsertDunningStage,
} from "@/app/actions/platform-dunning";
import type { SequenceRow } from "@/server/platform/dunning";

const ACTION_OPTIONS = [
  "SEND_EMAIL", "SEND_SMS", "IN_APP_BANNER",
  "RETRY_PAYMENT", "NOTIFY_CSM", "SURRENDER",
] as const;

const ACTION_LABEL: Record<typeof ACTION_OPTIONS[number], string> = {
  SEND_EMAIL: "Send email",
  SEND_SMS: "Send SMS",
  IN_APP_BANNER: "In-app banner",
  RETRY_PAYMENT: "Retry payment",
  NOTIFY_CSM: "Notify CSM",
  SURRENDER: "Surrender",
};

export function SequencesTab({
  sequences, canManage,
}: {
  sequences: SequenceRow[];
  canManage: boolean;
}) {
  return (
    <div className="space-y-5">
      {canManage && <NewSequenceForm />}

      {sequences.length === 0 ? (
        <div className="rounded-lg border p-8 text-center text-[13px]"
             style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)", color: "var(--text-muted)" }}>
          No sequences yet. Create one above to start recovering failed payments.
        </div>
      ) : (
        sequences.map((s) => (
          <SequenceCard key={s.id} sequence={s} canManage={canManage} />
        ))
      )}
    </div>
  );
}

function NewSequenceForm() {
  return (
    <details className="rounded-lg border"
             style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)" }}>
      <summary className="cursor-pointer border-b px-4 py-3 text-[13px] font-medium"
               style={{ borderColor: "var(--border-subtle)", color: "var(--text-default)" }}>
        + New sequence
      </summary>
      <form action={upsertDunningSequence} className="grid grid-cols-1 gap-3 p-4 md:grid-cols-2">
        <Field label="Name" name="name" required maxLength={120} placeholder="Default monthly" />
        <Field label="Plan slug (optional)" name="planSlug" maxLength={60}
               placeholder="essentials, professional, enterprise — blank = any" />
        <Field label="Description" name="description" maxLength={500} wide />
        <label className="flex items-center gap-2 text-[12px]" style={{ color: "var(--text-default)" }}>
          <input type="checkbox" name="active" defaultChecked />
          <span>Active</span>
        </label>
        <label className="flex items-center gap-2 text-[12px]" style={{ color: "var(--text-default)" }}>
          <input type="checkbox" name="smartRetries" />
          <span>Stripe Smart Retries (deferred — flag only)</span>
        </label>
        <div className="md:col-span-2 flex items-end justify-end">
          <button type="submit"
                  className="ts-focus rounded-md px-4 py-2 text-[13px] font-medium"
                  style={{ background: "var(--accent-primary)", color: "var(--accent-on-primary)" }}>
            Create sequence
          </button>
        </div>
      </form>
    </details>
  );
}

function SequenceCard({ sequence, canManage }: {
  sequence: SequenceRow; canManage: boolean;
}) {
  return (
    <section className="rounded-lg border" style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)" }}>
      <div className="flex flex-wrap items-start justify-between gap-3 border-b px-4 py-3"
           style={{ borderColor: "var(--border-subtle)" }}>
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-[14px] font-semibold" style={{ color: "var(--text-default)" }}>
              {sequence.name}
            </h3>
            {sequence.active ? (
              <span className="rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
                    style={{ background: "var(--success-surface)", color: "var(--success-fg)", border: "1px solid var(--success-fg)" }}>
                Active
              </span>
            ) : (
              <span className="rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
                    style={{ background: "var(--surface-2)", color: "var(--text-muted)", border: "1px solid var(--border-subtle)" }}>
                Inactive
              </span>
            )}
            {sequence.smartRetries && (
              <span className="rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
                    style={{ background: "var(--accent-surface)", color: "var(--accent-primary)", border: "1px solid var(--accent-primary)" }}
                    title="Stripe Smart Retries flagged on (deferred — no SDK round-trip yet)">
                Smart retries
              </span>
            )}
          </div>
          {sequence.description && (
            <p className="mt-1 text-[12px]" style={{ color: "var(--text-muted)" }}>
              {sequence.description}
            </p>
          )}
          <div className="mt-1 flex flex-wrap gap-2 text-[11px]" style={{ color: "var(--text-muted)" }}>
            <span>Plan: {sequence.planSlug ?? "any"}</span>
            <span>· {sequence.eventCount} event{sequence.eventCount === 1 ? "" : "s"} on file</span>
            <span>· {sequence.stages.length} stage{sequence.stages.length === 1 ? "" : "s"}</span>
          </div>
        </div>
        {canManage && (
          <form action={deleteDunningSequence.bind(null, sequence.id)}>
            <button type="submit"
                    className="ts-focus rounded-md border px-2.5 py-1.5 text-[11px] font-medium"
                    style={{ borderColor: "var(--border-subtle)", color: "var(--danger-fg)", background: "var(--surface-1)" }}>
              Delete sequence
            </button>
          </form>
        )}
      </div>

      <div className="p-4">
        {sequence.stages.length === 0 ? (
          <p className="text-[12px]" style={{ color: "var(--text-muted)" }}>
            No stages yet — add the first one below.
          </p>
        ) : (
          <ol className="space-y-2">
            {sequence.stages.map((s) => (
              <li key={s.id}
                  className="flex items-center justify-between gap-3 rounded-md border px-3 py-2"
                  style={{ borderColor: "var(--border-subtle)" }}>
                <div>
                  <div className="text-[12px] font-medium" style={{ color: "var(--text-default)" }}>
                    Stage {s.position} · {s.label ?? ACTION_LABEL[s.action as typeof ACTION_OPTIONS[number]] ?? s.action}
                  </div>
                  <div className="text-[11px]" style={{ color: "var(--text-muted)" }}>
                    +{s.triggerDays}d · {s.action}
                    {s.templateKind && <> · template <span className="font-mono">{s.templateKind}</span></>}
                    {s.notes && <> · {s.notes}</>}
                  </div>
                </div>
                {canManage && (
                  <form action={deleteDunningStage.bind(null, s.id)}>
                    <button type="submit"
                            className="ts-focus rounded-md border px-2 py-1 text-[10px] font-medium"
                            style={{ borderColor: "var(--border-subtle)", color: "var(--danger-fg)", background: "var(--surface-1)" }}>
                      Remove
                    </button>
                  </form>
                )}
              </li>
            ))}
          </ol>
        )}

        {canManage && <NewStageForm sequenceId={sequence.id} nextPosition={sequence.stages.length + 1} />}
      </div>
    </section>
  );
}

function NewStageForm({ sequenceId, nextPosition }: { sequenceId: string; nextPosition: number }) {
  return (
    <details className="mt-3">
      <summary className="cursor-pointer text-[12px] font-medium"
               style={{ color: "var(--accent-primary)" }}>
        + Add stage
      </summary>
      <form action={upsertDunningStage} className="mt-2 grid grid-cols-1 gap-3 md:grid-cols-3">
        <input type="hidden" name="sequenceId" value={sequenceId} />
        <Field label="Position" name="position" type="number" required defaultValue={String(nextPosition)} />
        <Field label="Trigger days" name="triggerDays" type="number" required defaultValue="3" />
        <label className="block">
          <span className="block text-[11px] font-medium uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>
            Action *
          </span>
          <select name="action" required
                  className="ts-focus mt-1 w-full rounded-md border px-3 py-2 text-[13px]"
                  style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)", color: "var(--text-default)" }}>
            {ACTION_OPTIONS.map((a) => <option key={a} value={a}>{ACTION_LABEL[a]}</option>)}
          </select>
        </label>
        <Field label="Template kind" name="templateKind" maxLength={120}
               placeholder="billing.dunning_reminder_1" />
        <Field label="Label" name="label" maxLength={120} placeholder="First reminder" />
        <Field label="Notes" name="notes" maxLength={500} />
        <div className="md:col-span-3 flex items-end justify-end">
          <button type="submit"
                  className="ts-focus rounded-md px-4 py-2 text-[13px] font-medium"
                  style={{ background: "var(--accent-primary)", color: "var(--accent-on-primary)" }}>
            Save stage
          </button>
        </div>
      </form>
    </details>
  );
}

function Field({
  label, name, type = "text", required, placeholder, maxLength, defaultValue, wide,
}: {
  label: string; name: string; type?: string; required?: boolean;
  placeholder?: string; maxLength?: number; defaultValue?: string; wide?: boolean;
}) {
  return (
    <label className={"block " + (wide ? "md:col-span-2" : "")}>
      <span className="block text-[11px] font-medium uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>
        {label}{required ? " *" : ""}
      </span>
      <input type={type} name={name} required={required} placeholder={placeholder}
             maxLength={maxLength} defaultValue={defaultValue}
             className="ts-focus mt-1 w-full rounded-md border px-3 py-2 text-[13px]"
             style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)", color: "var(--text-default)" }} />
    </label>
  );
}
