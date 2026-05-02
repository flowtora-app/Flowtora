import {
  upsertTaxExemption,
  verifyTaxExemption,
  revokeTaxExemption,
} from "@/app/actions/platform-tax";
import type { TaxExemptionType } from "@prisma/client";

// Page 21 — Tax-Exempt Tenants tab.

export interface ExemptionRow {
  id: string;
  tenant: { id: string; name: string; slug: string };
  exemptionType: TaxExemptionType;
  taxId: string | null;
  jurisdictions: string[];
  certificateUrl: string | null;
  certificateName: string | null;
  verifiedAt: Date | null;
  verifiedByName: string | null;
  expiresAt: Date | null;
  notes: string | null;
}

const TYPE_LABEL: Record<TaxExemptionType, string> = {
  RESALE: "Resale (B2B)",
  GOVERNMENT: "Government",
  NONPROFIT: "Nonprofit",
  EDUCATION: "Education",
  REVERSE_CHARGE: "Reverse-charge (EU B2B)",
  OTHER: "Other",
};

export function ExemptionsTab({
  exemptions, tenants, canManage,
}: {
  exemptions: ExemptionRow[];
  tenants: { id: string; name: string; slug: string }[];
  canManage: boolean;
}) {
  return (
    <div className="space-y-5">
      {canManage && <ComposerForm tenants={tenants} />}
      <ExemptionsList exemptions={exemptions} canManage={canManage} />
    </div>
  );
}

function ComposerForm({ tenants }: { tenants: { id: string; name: string; slug: string }[] }) {
  return (
    <section className="rounded-lg border" style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)" }}>
      <div className="border-b px-4 py-3" style={{ borderColor: "var(--border-subtle)" }}>
        <h2 className="text-[14px] font-semibold" style={{ color: "var(--text-default)" }}>
          Add exemption
        </h2>
        <p className="text-[12px]" style={{ color: "var(--text-muted)" }}>
          Cert URL points at storage (S3 or similar). The exemption only applies to invoices once
          a platform admin verifies it.
        </p>
      </div>
      <form action={upsertTaxExemption} className="grid grid-cols-1 gap-3 p-4 md:grid-cols-3">
        <label className="block">
          <span className="block text-[11px] font-medium uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>
            Tenant *
          </span>
          <select name="tenantId" required
                  className="ts-focus mt-1 w-full rounded-md border px-3 py-2 text-[13px]"
                  style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)", color: "var(--text-default)" }}>
            <option value="">— Pick tenant —</option>
            {tenants.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </label>
        <label className="block">
          <span className="block text-[11px] font-medium uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>
            Exemption type *
          </span>
          <select name="exemptionType" required
                  className="ts-focus mt-1 w-full rounded-md border px-3 py-2 text-[13px]"
                  style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)", color: "var(--text-default)" }}>
            {Object.entries(TYPE_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </label>
        <Field label="Tax ID / cert number" name="taxId" maxLength={80}
               placeholder="EIN, VAT, resale cert #" />
        <Field label="Jurisdictions" name="jurisdictions" maxLength={200}
               placeholder="US-CA, US-TX, GB · blank = all" />
        <Field label="Certificate URL" name="certificateUrl" maxLength={500}
               placeholder="https://…" />
        <Field label="Certificate name" name="certificateName" maxLength={200}
               placeholder="Resale_Certificate.pdf" />
        <Field label="Expires" name="expiresAt" type="date" />
        <Field label="Notes" name="notes" maxLength={500} wide />
        <div className="md:col-span-3 flex items-end justify-end">
          <button type="submit"
                  className="ts-focus rounded-md px-4 py-2 text-[13px] font-medium"
                  style={{ background: "var(--accent-primary)", color: "var(--accent-on-primary)" }}>
            Add exemption
          </button>
        </div>
      </form>
    </section>
  );
}

function ExemptionsList({ exemptions, canManage }: {
  exemptions: ExemptionRow[]; canManage: boolean;
}) {
  return (
    <section className="rounded-lg border" style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)" }}>
      <div className="border-b px-4 py-3" style={{ borderColor: "var(--border-subtle)" }}>
        <h2 className="text-[14px] font-semibold" style={{ color: "var(--text-default)" }}>
          Exemptions ({exemptions.length})
        </h2>
      </div>
      {exemptions.length === 0 ? (
        <div className="px-4 py-8 text-center text-[13px]" style={{ color: "var(--text-muted)" }}>
          No exemptions on file.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead style={{ color: "var(--text-muted)", background: "var(--surface-2)" }}>
              <tr className="text-left">
                <th className="px-4 py-2 font-medium">Tenant</th>
                <th className="px-4 py-2 font-medium">Type</th>
                <th className="px-4 py-2 font-medium">Tax ID</th>
                <th className="px-4 py-2 font-medium">Jurisdictions</th>
                <th className="px-4 py-2 font-medium">Cert</th>
                <th className="px-4 py-2 font-medium">Verified</th>
                <th className="px-4 py-2 font-medium">Expires</th>
                {canManage && <th className="px-4 py-2 font-medium" />}
              </tr>
            </thead>
            <tbody>
              {exemptions.map((e) => {
                const expired = e.expiresAt ? e.expiresAt < new Date() : false;
                return (
                  <tr key={e.id} style={{ borderTop: "1px solid var(--border-subtle)" }}>
                    <td className="px-4 py-2" style={{ color: "var(--text-default)" }}>
                      <a href={`/platform/tenants/${e.tenant.id}`}
                         className="hover:underline" style={{ color: "var(--text-default)" }}>
                        {e.tenant.name}
                      </a>
                    </td>
                    <td className="px-4 py-2" style={{ color: "var(--text-default)" }}>{TYPE_LABEL[e.exemptionType]}</td>
                    <td className="px-4 py-2 font-mono text-[11px]" style={{ color: "var(--text-muted)" }}>
                      {e.taxId ?? "—"}
                    </td>
                    <td className="px-4 py-2" style={{ color: "var(--text-muted)" }}>
                      {e.jurisdictions.length === 0 ? "All" : e.jurisdictions.join(", ")}
                    </td>
                    <td className="px-4 py-2 text-[12px]">
                      {e.certificateUrl
                        ? <a href={e.certificateUrl} target="_blank" rel="noopener"
                             className="hover:underline" style={{ color: "var(--accent-primary)" }}>
                            {e.certificateName ?? "View"}
                          </a>
                        : <span style={{ color: "var(--text-faint)" }}>—</span>}
                    </td>
                    <td className="px-4 py-2 text-[12px]">
                      {e.verifiedAt ? (
                        <div>
                          <span style={{ color: "var(--success-fg)" }}>✓ {e.verifiedAt.toLocaleDateString()}</span>
                          {e.verifiedByName && (
                            <div style={{ color: "var(--text-muted)" }}>by {e.verifiedByName}</div>
                          )}
                        </div>
                      ) : (
                        <span style={{ color: "var(--text-muted)" }}>Pending</span>
                      )}
                    </td>
                    <td className="px-4 py-2 text-[12px]"
                        style={{ color: expired ? "var(--rose-700)" : "var(--text-muted)" }}>
                      {e.expiresAt ? e.expiresAt.toLocaleDateString() : "—"}
                    </td>
                    {canManage && (
                      <td className="px-4 py-2 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <form action={verifyTaxExemption.bind(null, e.id)}>
                            <button type="submit"
                                    className="ts-focus rounded-md border px-2 py-1 text-[11px] font-medium"
                                    style={{ borderColor: "var(--border-subtle)", color: "var(--text-default)", background: "var(--surface-1)" }}>
                              {e.verifiedAt ? "Unverify" : "Verify"}
                            </button>
                          </form>
                          <form action={revokeTaxExemption.bind(null, e.id)}>
                            <button type="submit"
                                    className="ts-focus rounded-md border px-2 py-1 text-[11px] font-medium"
                                    style={{ borderColor: "var(--border-subtle)", color: "var(--danger-fg)", background: "var(--surface-1)" }}>
                              Revoke
                            </button>
                          </form>
                        </div>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function Field({
  label, name, type = "text", placeholder, maxLength, wide,
}: {
  label: string; name: string; type?: string;
  placeholder?: string; maxLength?: number; wide?: boolean;
}) {
  return (
    <label className={"block " + (wide ? "md:col-span-3" : "")}>
      <span className="block text-[11px] font-medium uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>
        {label}
      </span>
      <input type={type} name={name} placeholder={placeholder} maxLength={maxLength}
             className="ts-focus mt-1 w-full rounded-md border px-3 py-2 text-[13px]"
             style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)", color: "var(--text-default)" }} />
    </label>
  );
}
