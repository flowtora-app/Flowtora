import { savePlatformTaxConfig, upsertTaxRate, deleteTaxRate } from "@/app/actions/platform-tax";
import type { PlatformTaxConfig } from "@prisma/client";

// Page 21 — Tax Configuration tab.
//
// Top form: provider selector + EU/UK/AU registration IDs + reverse-
// charge toggle. Bottom: manual rate table per jurisdiction.

export interface RateRow {
  id: string;
  country: string;
  region: string | null;
  label: string;
  ratePct: number;
  nexusThreshold: number;
  taxId: string | null;
  effectiveAt: Date;
  notes: string | null;
}

export function ConfigurationTab({
  config, rates, canManage,
}: {
  config: PlatformTaxConfig | null;
  rates: RateRow[];
  canManage: boolean;
}) {
  return (
    <div className="space-y-5">
      <ProviderForm config={config} canManage={canManage} />
      <RatesTable rates={rates} canManage={canManage} />
      <NewRateForm canManage={canManage} />
      <HonestDeferral />
    </div>
  );
}

function ProviderForm({ config, canManage }: { config: PlatformTaxConfig | null; canManage: boolean }) {
  const provider = config?.provider ?? "NONE";
  return (
    <section className="rounded-lg border" style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)" }}>
      <div className="border-b px-4 py-3" style={{ borderColor: "var(--border-subtle)" }}>
        <h2 className="text-[14px] font-semibold" style={{ color: "var(--text-default)" }}>
          Auto-tax provider
        </h2>
        <p className="text-[12px]" style={{ color: "var(--text-muted)" }}>
          Pick a provider to compute tax automatically. Manual rates below are used when provider = None.
        </p>
      </div>
      <form action={savePlatformTaxConfig} className="grid grid-cols-1 gap-3 p-4 md:grid-cols-3">
        <Select label="Provider" name="provider" defaultValue={provider} disabled={!canManage}
                options={[
                  { value: "NONE",    label: "None — manual rate table" },
                  { value: "STRIPE",  label: "Stripe Tax" },
                  { value: "AVALARA", label: "Avalara AvaTax" },
                  { value: "TAXJAR",  label: "TaxJar" },
                ]} />
        <ReadOnly label="Provider status" value={config?.providerStatus ?? "Not configured"} />
        <ReadOnly label="Last sync" value={config?.providerLastSyncAt
          ? config.providerLastSyncAt.toLocaleString()
          : "—"} />

        <Field label="EU OSS registration" name="euOssRegistration"
               defaultValue={config?.euOssRegistration ?? ""} disabled={!canManage}
               placeholder="e.g. EU372000064" maxLength={100} />
        <Field label="UK MTD registration" name="ukMtdRegistration"
               defaultValue={config?.ukMtdRegistration ?? ""} disabled={!canManage}
               placeholder="UK VAT number" maxLength={100} />
        <Field label="AU GST registration" name="auGstRegistration"
               defaultValue={config?.auGstRegistration ?? ""} disabled={!canManage}
               placeholder="ABN" maxLength={100} />

        <label className="md:col-span-3 flex items-center gap-2 text-[12px]"
               style={{ color: "var(--text-default)" }}>
          <input type="checkbox" name="reverseChargeEU"
                 defaultChecked={config?.reverseChargeEU ?? true} disabled={!canManage} />
          <span>Apply EU B2B reverse-charge automatically when a valid VAT number is on file</span>
        </label>

        {canManage && (
          <div className="md:col-span-3 flex items-end justify-end">
            <button type="submit"
                    className="ts-focus rounded-md px-4 py-2 text-[13px] font-medium"
                    style={{ background: "var(--accent-primary)", color: "var(--accent-on-primary)" }}>
              Save configuration
            </button>
          </div>
        )}
      </form>
    </section>
  );
}

function RatesTable({ rates, canManage }: { rates: RateRow[]; canManage: boolean }) {
  return (
    <section className="rounded-lg border" style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)" }}>
      <div className="border-b px-4 py-3" style={{ borderColor: "var(--border-subtle)" }}>
        <h2 className="text-[14px] font-semibold" style={{ color: "var(--text-default)" }}>
          Manual rate table ({rates.length})
        </h2>
        <p className="text-[12px]" style={{ color: "var(--text-muted)" }}>
          Per-jurisdiction overrides. Only used when provider = None or as a fallback.
        </p>
      </div>
      {rates.length === 0 ? (
        <div className="px-4 py-8 text-center text-[13px]" style={{ color: "var(--text-muted)" }}>
          No rates yet. Add one below.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead style={{ color: "var(--text-muted)", background: "var(--surface-2)" }}>
              <tr className="text-left">
                <th className="px-4 py-2 font-medium">Country</th>
                <th className="px-4 py-2 font-medium">Region</th>
                <th className="px-4 py-2 font-medium">Label</th>
                <th className="px-4 py-2 text-right font-medium">Rate</th>
                <th className="px-4 py-2 text-right font-medium">Nexus threshold</th>
                <th className="px-4 py-2 font-medium">Tax ID</th>
                <th className="px-4 py-2 font-medium">Effective</th>
                {canManage && <th className="px-4 py-2 font-medium" />}
              </tr>
            </thead>
            <tbody>
              {rates.map((r) => (
                <tr key={r.id} style={{ borderTop: "1px solid var(--border-subtle)" }}>
                  <td className="px-4 py-2" style={{ color: "var(--text-default)" }}>{r.country}</td>
                  <td className="px-4 py-2" style={{ color: "var(--text-muted)" }}>{r.region ?? "—"}</td>
                  <td className="px-4 py-2" style={{ color: "var(--text-default)" }}>{r.label}</td>
                  <td className="px-4 py-2 text-right tabular-nums" style={{ color: "var(--text-default)" }}>
                    {r.ratePct.toFixed(2)}%
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums" style={{ color: "var(--text-muted)" }}>
                    {r.nexusThreshold > 0 ? `$${(r.nexusThreshold / 100).toLocaleString()}` : "—"}
                  </td>
                  <td className="px-4 py-2 font-mono text-[11px]" style={{ color: "var(--text-muted)" }}>
                    {r.taxId ?? "—"}
                  </td>
                  <td className="px-4 py-2 text-[12px]" style={{ color: "var(--text-muted)" }}>
                    {r.effectiveAt.toLocaleDateString()}
                  </td>
                  {canManage && (
                    <td className="px-4 py-2 text-right">
                      <form action={deleteTaxRate.bind(null, r.id)}>
                        <button type="submit"
                                className="ts-focus rounded-md border px-2.5 py-1 text-[11px] font-medium"
                                style={{ borderColor: "var(--border-subtle)", color: "var(--danger-fg)", background: "var(--surface-1)" }}>
                          Remove
                        </button>
                      </form>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function NewRateForm({ canManage }: { canManage: boolean }) {
  if (!canManage) return null;
  return (
    <section className="rounded-lg border" style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)" }}>
      <div className="border-b px-4 py-3" style={{ borderColor: "var(--border-subtle)" }}>
        <h2 className="text-[14px] font-semibold" style={{ color: "var(--text-default)" }}>
          Add manual rate
        </h2>
      </div>
      <form action={upsertTaxRate} className="grid grid-cols-1 gap-3 p-4 md:grid-cols-4">
        <Field label="Country (ISO-2)" name="country" required maxLength={2} placeholder="US" />
        <Field label="Region (ISO-3166-2)" name="region" maxLength={8} placeholder="US-CA" />
        <Field label="Label" name="label" required maxLength={120}
               placeholder="California state sales tax" />
        <Field label="Rate (%)" name="ratePct" type="number" required step={0.0001}
               placeholder="8.75" />
        <Field label="Nexus threshold (cents)" name="nexusThreshold" type="number"
               defaultValue="0" placeholder="0" />
        <Field label="Tax ID" name="taxId" maxLength={60} placeholder="EIN / VAT number" />
        <Field label="Notes" name="notes" maxLength={500} wide />
        <div className="md:col-span-4 flex items-end justify-end">
          <button type="submit"
                  className="ts-focus rounded-md px-4 py-2 text-[13px] font-medium"
                  style={{ background: "var(--accent-primary)", color: "var(--accent-on-primary)" }}>
            Add rate
          </button>
        </div>
      </form>
    </section>
  );
}

function HonestDeferral() {
  return (
    <div className="rounded-md border px-3 py-2 text-[11px]"
         style={{ borderColor: "var(--amber-200)", background: "var(--amber-50)", color: "var(--amber-700)" }}>
      <strong>Provider integrations are deferred.</strong> Saving a provider above flips the local config
      so this page renders the right state, but no Stripe Tax / Avalara / TaxJar SDK call is made yet —
      tax on issued invoices comes from the manual rate table or the platform default. We log a
      <span className="font-mono"> platform.tax_config_updated</span> audit row each time so the
      transition is auditable.
    </div>
  );
}

/* ── Tiny helpers ───────────────────────────────────────── */

function Field({
  label, name, type = "text", required, placeholder, maxLength, defaultValue, disabled, wide, step,
}: {
  label: string; name: string; type?: string; required?: boolean;
  placeholder?: string; maxLength?: number; defaultValue?: string;
  disabled?: boolean; wide?: boolean; step?: number;
}) {
  return (
    <label className={"block " + (wide ? "md:col-span-4" : "")}>
      <span className="block text-[11px] font-medium uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>
        {label}{required ? " *" : ""}
      </span>
      <input type={type} name={name} required={required}
             placeholder={placeholder} maxLength={maxLength}
             defaultValue={defaultValue} disabled={disabled} step={step}
             className="ts-focus mt-1 w-full rounded-md border px-3 py-2 text-[13px]"
             style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)", color: "var(--text-default)" }} />
    </label>
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

function ReadOnly({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <span className="block text-[11px] font-medium uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>
        {label}
      </span>
      <div className="mt-1 rounded-md border px-3 py-2 text-[13px]"
           style={{ background: "var(--surface-2)", borderColor: "var(--border-subtle)", color: "var(--text-muted)" }}>
        {value}
      </div>
    </div>
  );
}
