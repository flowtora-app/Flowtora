import {
  deletePartnerPayoutMethod,
  upsertPartnerPayoutMethod,
} from "@/app/actions/platform-payouts";
import type { MethodRow } from "@/server/platform/payouts";
import type { PartnerPayoutMethodType } from "@prisma/client";
import { DeferredNote } from "./shared";

const TYPE_LABEL: Record<PartnerPayoutMethodType, string> = {
  STRIPE_CONNECT: "Stripe Connect",
  ACH:            "ACH",
  PAYPAL:         "PayPal",
  WISE:           "Wise",
  WIRE:           "Wire transfer",
};

export function MethodsTab({
  methods, affiliates, canManage,
}: {
  methods: MethodRow[];
  affiliates: { id: string; name: string; code: string }[];
  canManage: boolean;
}) {
  return (
    <div className="space-y-5">
      {canManage && <NewMethodForm affiliates={affiliates} />}

      <section className="rounded-lg border" style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)" }}>
        <div className="border-b px-4 py-3" style={{ borderColor: "var(--border-subtle)" }}>
          <h2 className="text-[14px] font-semibold" style={{ color: "var(--text-default)" }}>
            Payout methods ({methods.length})
          </h2>
          <p className="text-[12px]" style={{ color: "var(--text-muted)" }}>
            One row per partner-method pair. Mark one as primary and it&apos;ll be used by manual payouts.
          </p>
        </div>
        {methods.length === 0 ? (
          <div className="px-4 py-8 text-center text-[13px]" style={{ color: "var(--text-muted)" }}>
            No payout methods configured. Add one above.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead style={{ color: "var(--text-muted)", background: "var(--surface-2)" }}>
                <tr className="text-left">
                  <th className="px-4 py-2 font-medium">Partner</th>
                  <th className="px-4 py-2 font-medium">Type</th>
                  <th className="px-4 py-2 font-medium">Label</th>
                  <th className="px-4 py-2 font-medium">Account</th>
                  <th className="px-4 py-2 font-medium">Status</th>
                  <th className="px-4 py-2 text-right font-medium">Payouts</th>
                  <th className="px-4 py-2 font-medium">Primary</th>
                  {canManage && <th className="px-4 py-2 font-medium" />}
                </tr>
              </thead>
              <tbody>
                {methods.map((m) => (
                  <tr key={m.id} style={{ borderTop: "1px solid var(--border-subtle)" }}>
                    <td className="px-4 py-2" style={{ color: "var(--text-default)" }}>{m.affiliateName}</td>
                    <td className="px-4 py-2" style={{ color: "var(--text-default)" }}>{TYPE_LABEL[m.type]}</td>
                    <td className="px-4 py-2" style={{ color: "var(--text-default)" }}>{m.label}</td>
                    <td className="px-4 py-2 font-mono text-[11px]" style={{ color: "var(--text-muted)" }}>
                      {m.accountSnippet ?? "—"}
                    </td>
                    <td className="px-4 py-2 text-[12px]" style={{ color: "var(--text-muted)" }}>
                      {m.status ?? "—"}
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums" style={{ color: "var(--text-muted)" }}>
                      {m.payoutCount}
                    </td>
                    <td className="px-4 py-2 text-[12px]"
                        style={{ color: m.isPrimary ? "var(--success-fg)" : "var(--text-muted)" }}>
                      {m.isPrimary ? "★ primary" : "—"}
                    </td>
                    {canManage && (
                      <td className="px-4 py-2 text-right">
                        <form action={deletePartnerPayoutMethod.bind(null, m.id)}>
                          <button type="submit"
                                  className="ts-focus rounded-md border px-2 py-1 text-[11px] font-medium"
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

      <DeferredNote>
        <strong>Stripe Connect onboarding flow is deferred.</strong> Today the row is configuration
        only — when the integration is wired, picking{" "}
        <span className="font-mono">STRIPE_CONNECT</span> kicks off the OAuth + Express
        onboarding from this row.
      </DeferredNote>
    </div>
  );
}

function NewMethodForm({ affiliates }: { affiliates: { id: string; name: string; code: string }[] }) {
  return (
    <details className="rounded-lg border"
             style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)" }}>
      <summary className="cursor-pointer border-b px-4 py-3 text-[13px] font-medium"
               style={{ borderColor: "var(--border-subtle)", color: "var(--text-default)" }}>
        + Add payout method
      </summary>
      <form action={upsertPartnerPayoutMethod} className="grid grid-cols-1 gap-3 p-4 md:grid-cols-3">
        <label className="block">
          <span className="block text-[11px] font-medium uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>
            Partner *
          </span>
          <select name="affiliateId" required
                  className="ts-focus mt-1 w-full rounded-md border px-3 py-2 text-[13px]"
                  style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)", color: "var(--text-default)" }}>
            <option value="">— Pick partner —</option>
            {affiliates.map((a) => (
              <option key={a.id} value={a.id}>{a.name} ({a.code})</option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="block text-[11px] font-medium uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>
            Type *
          </span>
          <select name="type" required defaultValue="ACH"
                  className="ts-focus mt-1 w-full rounded-md border px-3 py-2 text-[13px]"
                  style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)", color: "var(--text-default)" }}>
            {Object.entries(TYPE_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </label>
        <Field label="Label *" name="label" required maxLength={120} placeholder="Chase business checking" />
        <Field label="Account snippet" name="accountSnippet" maxLength={120}
               placeholder="•••• 4242 / alex@example.com" />
        <Field label="External account ID" name="externalAccountId" maxLength={200}
               placeholder="acct_… / payer-id / IBAN ref" />
        <Field label="Status" name="status" maxLength={60} placeholder="verified" />
        <label className="flex items-center gap-2 text-[12px]" style={{ color: "var(--text-default)" }}>
          <input type="checkbox" name="isPrimary" />
          <span>Mark as primary method</span>
        </label>
        <Field label="Notes" name="notes" maxLength={500} wide />
        <div className="md:col-span-3 flex items-end justify-end">
          <button type="submit"
                  className="ts-focus rounded-md px-4 py-2 text-[13px] font-medium"
                  style={{ background: "var(--accent-primary)", color: "var(--accent-on-primary)" }}>
            Save method
          </button>
        </div>
      </form>
    </details>
  );
}

function Field({
  label, name, type = "text", required, placeholder, maxLength, wide,
}: {
  label: string; name: string; type?: string; required?: boolean;
  placeholder?: string; maxLength?: number; wide?: boolean;
}) {
  return (
    <label className={"block " + (wide ? "md:col-span-3" : "")}>
      <span className="block text-[11px] font-medium uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>
        {label}
      </span>
      <input type={type} name={name} required={required} placeholder={placeholder} maxLength={maxLength}
             className="ts-focus mt-1 w-full rounded-md border px-3 py-2 text-[13px]"
             style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)", color: "var(--text-default)" }} />
    </label>
  );
}
