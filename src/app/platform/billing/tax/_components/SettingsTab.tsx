import { savePlatformTaxSettings } from "@/app/actions/platform-tax";
import type { PlatformTaxConfig } from "@prisma/client";

// Page 21 — Settings tab.
//
// Default behavior (inclusive vs exclusive), default rounding rule, and
// default tax codes by product type (free-form JSON object). The
// settings here drive what happens when an invoice doesn't carry
// per-line tax overrides.

export function SettingsTab({
  config, canManage,
}: {
  config: PlatformTaxConfig | null;
  canManage: boolean;
}) {
  const codesValue = config?.defaultTaxCodes
    ? JSON.stringify(config.defaultTaxCodes, null, 2)
    : "";

  return (
    <div className="space-y-5">
      <section className="rounded-lg border" style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)" }}>
        <div className="border-b px-4 py-3" style={{ borderColor: "var(--border-subtle)" }}>
          <h2 className="text-[14px] font-semibold" style={{ color: "var(--text-default)" }}>
            Default tax behavior
          </h2>
          <p className="text-[12px]" style={{ color: "var(--text-muted)" }}>
            Used by manual invoices that don&apos;t set their own behavior. Plans pages can override
            per-tier on the Plans &amp; Pricing &gt; Lifecycle &amp; tax tab.
          </p>
        </div>
        <form action={savePlatformTaxSettings} className="grid grid-cols-1 gap-4 p-4 md:grid-cols-2">
          <Select label="Tax behavior" name="defaultBehavior"
                  defaultValue={config?.defaultBehavior ?? "EXCLUSIVE"} disabled={!canManage}
                  options={[
                    { value: "EXCLUSIVE", label: "Exclusive — added at checkout" },
                    { value: "INCLUSIVE", label: "Inclusive — baked into price" },
                  ]} />
          <Select label="Rounding rule" name="defaultRounding"
                  defaultValue={config?.defaultRounding ?? "ROUND_HALF_UP"} disabled={!canManage}
                  options={[
                    { value: "ROUND_HALF_UP", label: "Round half up (standard)" },
                    { value: "ROUND_DOWN",    label: "Round down (truncate cents)" },
                    { value: "ROUND_BANKERS", label: "Banker's rounding (half-to-even)" },
                  ]} />

          <label className="md:col-span-2 block">
            <span className="block text-[11px] font-medium uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>
              Default tax codes by product type
            </span>
            <span className="mt-0.5 block text-[10px]" style={{ color: "var(--text-muted)" }}>
              JSON object mapping product type → Stripe Tax code (or Avalara / TaxJar code).
              Example: {`{ "subscription": "txcd_10000000", "metered": "txcd_10103001" }`}
            </span>
            <textarea name="defaultTaxCodes" defaultValue={codesValue}
                      rows={6} disabled={!canManage}
                      placeholder='{ "subscription": "txcd_10000000" }'
                      className="ts-focus mt-1 w-full rounded-md border px-3 py-2 font-mono text-[12px]"
                      style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)", color: "var(--text-default)" }} />
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

      <div className="rounded-md border px-3 py-2 text-[11px]"
           style={{ borderColor: "var(--amber-200)", background: "var(--amber-50)", color: "var(--amber-700)" }}>
        <strong>Tax-code lookup is honestly deferred.</strong> Codes you save here are stored on the
        config row but the new-invoice composer doesn&apos;t auto-tag line items yet. Once
        the Stripe Tax SDK is wired, line items will pick the code by product type at issue time.
      </div>
    </div>
  );
}

function Select({
  label, name, defaultValue, options, disabled,
}: {
  label: string; name: string; defaultValue?: string;
  options: { value: string; label: string }[]; disabled?: boolean;
}) {
  return (
    <label className="block">
      <span className="block text-[11px] font-medium uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>
        {label}
      </span>
      <select name={name} defaultValue={defaultValue} disabled={disabled}
              className="ts-focus mt-1 w-full rounded-md border px-3 py-2 text-[13px]"
              style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)", color: "var(--text-default)" }}>
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </label>
  );
}
