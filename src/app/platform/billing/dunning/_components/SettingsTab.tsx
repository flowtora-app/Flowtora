import { saveDunningConfig } from "@/app/actions/platform-dunning";
import type { DunningConfig } from "@prisma/client";
import { DeferredNote } from "./shared";

export function SettingsTab({
  config, sequences, canManage,
}: {
  config: DunningConfig | null;
  sequences: { id: string; name: string; planSlug: string | null }[];
  canManage: boolean;
}) {
  return (
    <div className="space-y-5">
      <section className="rounded-lg border" style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)" }}>
        <div className="border-b px-4 py-3" style={{ borderColor: "var(--border-subtle)" }}>
          <h2 className="text-[14px] font-semibold" style={{ color: "var(--text-default)" }}>
            Global dunning settings
          </h2>
          <p className="text-[12px]" style={{ color: "var(--text-muted)" }}>
            Per-plan sequence assignment is set on each Sequence directly via its{" "}
            <span className="font-mono">planSlug</span>. The default below covers any plan
            without an explicit match.
          </p>
        </div>
        <form action={saveDunningConfig} className="grid grid-cols-1 gap-3 p-4 md:grid-cols-2">
          <label className="block md:col-span-2">
            <span className="block text-[11px] font-medium uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>
              Default sequence
            </span>
            <select name="defaultSequenceId" defaultValue={config?.defaultSequenceId ?? ""}
                    disabled={!canManage}
                    className="ts-focus mt-1 w-full rounded-md border px-3 py-2 text-[13px]"
                    style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)", color: "var(--text-default)" }}>
              <option value="">— None —</option>
              {sequences.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}{s.planSlug ? ` (plan: ${s.planSlug})` : ""}
                </option>
              ))}
            </select>
          </label>
          <Field label="Max retries" name="maxRetries" type="number"
                 defaultValue={String(config?.maxRetries ?? 4)} disabled={!canManage} />
          <Field label="Auto-cancel after (days)" name="autoCancelAfterDays" type="number"
                 defaultValue={String(config?.autoCancelAfterDays ?? 30)} disabled={!canManage} />
          <Field label="Max retries per day (0 = no cap)" name="maxRetriesPerDay" type="number"
                 defaultValue={String(config?.maxRetriesPerDay ?? 2)} disabled={!canManage} />
          <label className="flex items-end gap-2 pb-2 text-[12px]" style={{ color: "var(--text-default)" }}>
            <input type="checkbox" name="ccBillingEmail"
                   defaultChecked={config?.ccBillingEmail ?? true} disabled={!canManage} />
            <span>CC billing email on every retry attempt</span>
          </label>
          <label className="flex items-end gap-2 pb-2 text-[12px] md:col-span-2"
                 style={{ color: "var(--text-default)" }}>
            <input type="checkbox" name="smartRetriesEnabled"
                   defaultChecked={config?.smartRetriesEnabled ?? false} disabled={!canManage} />
            <span>Stripe Smart Retries platform-wide kill switch (deferred — flag only until SDK lands)</span>
          </label>

          {canManage && (
            <div className="md:col-span-2 flex items-end justify-end">
              <button type="submit"
                      className="ts-focus rounded-md px-4 py-2 text-[13px] font-medium"
                      style={{ background: "var(--accent-primary)", color: "var(--accent-on-primary)" }}>
                Save settings
              </button>
            </div>
          )}
        </form>
      </section>

      <DeferredNote>
        <strong>Tenant-level dunning (account suspension after final notice)</strong> still lives
        on <span className="font-mono">Tenant.dunningStage</span> via the legacy
        <span className="font-mono"> startDunning / advanceDunning</span> actions. Those handle
        account state across the whole subscription; the queue here handles the failed-payment
        recovery cycle. Both will converge once the Stripe webhook ingestor + smart-retry SDK
        are wired.
      </DeferredNote>
    </div>
  );
}

function Field({
  label, name, type = "text", defaultValue, disabled,
}: {
  label: string; name: string; type?: string; defaultValue?: string; disabled?: boolean;
}) {
  return (
    <label className="block">
      <span className="block text-[11px] font-medium uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>
        {label}
      </span>
      <input type={type} name={name} defaultValue={defaultValue} disabled={disabled}
             className="ts-focus mt-1 w-full rounded-md border px-3 py-2 text-[13px]"
             style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)", color: "var(--text-default)" }} />
    </label>
  );
}
