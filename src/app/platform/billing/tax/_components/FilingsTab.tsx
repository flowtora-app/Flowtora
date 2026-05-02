import { upsertTaxFiling, deleteTaxFiling } from "@/app/actions/platform-tax";
import type { TaxFilingStatus } from "@prisma/client";

// Page 21 — Filings tab.
//
// Calendar of jurisdictional due dates, listed newest-first by status.
// "Add filing" form below for upcoming periods. PDF upload → URL field
// (uses platform storage; the upload UI piggybacks on the existing
// signed-URL flow used elsewhere).

const STATUS_PALETTE: Record<TaxFilingStatus, { bg: string; fg: string }> = {
  DRAFT:     { bg: "var(--surface-2)",      fg: "var(--text-muted)" },
  SUBMITTED: { bg: "var(--accent-surface)", fg: "var(--accent-primary)" },
  ACCEPTED:  { bg: "var(--success-surface)",fg: "var(--success-fg)" },
  AMENDED:   { bg: "var(--warning-surface)",fg: "var(--warning-fg)" },
  REJECTED:  { bg: "var(--danger-surface)", fg: "var(--danger-fg)" },
};

export interface FilingRow {
  id: string;
  jurisdiction: string;
  period: string;
  taxableSales: number;
  taxCollected: number;
  dueAt: Date;
  submittedAt: Date | null;
  externalRef: string | null;
  pdfUrl: string | null;
  status: TaxFilingStatus;
  notes: string | null;
}

const fmt = (cents: number) => cents === 0
  ? "—"
  : `$${(cents / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export function FilingsTab({
  filings, canManage,
}: {
  filings: FilingRow[];
  canManage: boolean;
}) {
  const day = 86_400_000;
  const upcoming = filings
    .filter((f) => f.status !== "ACCEPTED" && f.status !== "REJECTED")
    .filter((f) => f.dueAt.getTime() - Date.now() < 90 * day)
    .sort((a, b) => a.dueAt.getTime() - b.dueAt.getTime())
    .slice(0, 6);

  return (
    <div className="space-y-5">
      {upcoming.length > 0 && (
        <UpcomingCalendar rows={upcoming} />
      )}

      {canManage && <ComposerForm />}

      <FilingsList filings={filings} canManage={canManage} />
    </div>
  );
}

function UpcomingCalendar({ rows }: { rows: FilingRow[] }) {
  return (
    <section className="rounded-lg border" style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)" }}>
      <div className="border-b px-4 py-3" style={{ borderColor: "var(--border-subtle)" }}>
        <h2 className="text-[14px] font-semibold" style={{ color: "var(--text-default)" }}>
          Upcoming due dates
        </h2>
        <p className="text-[12px]" style={{ color: "var(--text-muted)" }}>
          Open filings due within 90 days. Earliest first.
        </p>
      </div>
      <ul className="divide-y" style={{ borderColor: "var(--border-subtle)" }}>
        {rows.map((f) => {
          const days = Math.ceil((f.dueAt.getTime() - Date.now()) / 86_400_000);
          const overdue = days < 0;
          const tone =
            overdue ? "var(--danger-fg)" :
            days <= 7 ? "var(--warning-fg)" :
            "var(--text-muted)";
          return (
            <li key={f.id} className="grid grid-cols-1 gap-2 px-4 py-3 md:grid-cols-[1fr_1fr_120px_120px]">
              <div>
                <span className="text-[14px] font-semibold" style={{ color: "var(--text-default)" }}>
                  {f.jurisdiction}
                </span>
                <span className="ml-2 text-[12px]" style={{ color: "var(--text-muted)" }}>
                  · {f.period}
                </span>
              </div>
              <div className="text-[12px]" style={{ color: "var(--text-muted)" }}>
                {fmt(f.taxCollected)} tax · {fmt(f.taxableSales)} sales
              </div>
              <div className="text-[12px]" style={{ color: tone }}>
                {overdue ? `Overdue ${Math.abs(days)}d` : `Due in ${days}d`}
              </div>
              <div className="text-[12px]" style={{ color: "var(--text-muted)" }}>
                {f.dueAt.toLocaleDateString()}
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function ComposerForm() {
  return (
    <section className="rounded-lg border" style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)" }}>
      <div className="border-b px-4 py-3" style={{ borderColor: "var(--border-subtle)" }}>
        <h2 className="text-[14px] font-semibold" style={{ color: "var(--text-default)" }}>
          Add / update filing
        </h2>
        <p className="text-[12px]" style={{ color: "var(--text-muted)" }}>
          Period strings are free-form ("2026-Q1", "2026-04", "2026"). Reuse a (jurisdiction + period)
          combo to update an existing filing.
        </p>
      </div>
      <form action={upsertTaxFiling} className="grid grid-cols-1 gap-3 p-4 md:grid-cols-3">
        <Field label="Jurisdiction" name="jurisdiction" required maxLength={20}
               placeholder="US-CA, GB, EU-OSS" />
        <Field label="Period" name="period" required maxLength={20}
               placeholder="2026-Q1" />
        <Select label="Status" name="status" defaultValue="DRAFT"
                options={[
                  { value: "DRAFT", label: "Draft" },
                  { value: "SUBMITTED", label: "Submitted" },
                  { value: "ACCEPTED", label: "Accepted" },
                  { value: "AMENDED", label: "Amended" },
                  { value: "REJECTED", label: "Rejected" },
                ]} />
        <Field label="Taxable sales (cents)" name="taxableSales" type="number"
               defaultValue="0" />
        <Field label="Tax collected (cents)" name="taxCollected" type="number"
               defaultValue="0" />
        <Field label="Due at" name="dueAt" type="date" required />
        <Field label="Submitted at" name="submittedAt" type="date" />
        <Field label="External ref" name="externalRef" maxLength={80}
               placeholder="Filing reference number" />
        <Field label="PDF URL" name="pdfUrl" maxLength={500}
               placeholder="https://…" />
        <Field label="Notes" name="notes" maxLength={500} wide />
        <div className="md:col-span-3 flex items-end justify-end">
          <button type="submit"
                  className="ts-focus rounded-md px-4 py-2 text-[13px] font-medium"
                  style={{ background: "var(--accent-primary)", color: "var(--accent-on-primary)" }}>
            Save filing
          </button>
        </div>
      </form>
    </section>
  );
}

function FilingsList({ filings, canManage }: {
  filings: FilingRow[]; canManage: boolean;
}) {
  return (
    <section className="rounded-lg border" style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)" }}>
      <div className="border-b px-4 py-3" style={{ borderColor: "var(--border-subtle)" }}>
        <h2 className="text-[14px] font-semibold" style={{ color: "var(--text-default)" }}>
          Filings ({filings.length})
        </h2>
      </div>
      {filings.length === 0 ? (
        <div className="px-4 py-8 text-center text-[13px]" style={{ color: "var(--text-muted)" }}>
          No filings yet.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead style={{ color: "var(--text-muted)", background: "var(--surface-2)" }}>
              <tr className="text-left">
                <th className="px-4 py-2 font-medium">Jurisdiction</th>
                <th className="px-4 py-2 font-medium">Period</th>
                <th className="px-4 py-2 text-right font-medium">Tax collected</th>
                <th className="px-4 py-2 text-right font-medium">Taxable sales</th>
                <th className="px-4 py-2 font-medium">Due</th>
                <th className="px-4 py-2 font-medium">Submitted</th>
                <th className="px-4 py-2 font-medium">Status</th>
                <th className="px-4 py-2 font-medium">PDF</th>
                {canManage && <th className="px-4 py-2 font-medium" />}
              </tr>
            </thead>
            <tbody>
              {filings.map((f) => {
                const palette = STATUS_PALETTE[f.status];
                return (
                  <tr key={f.id} style={{ borderTop: "1px solid var(--border-subtle)" }}>
                    <td className="px-4 py-2" style={{ color: "var(--text-default)" }}>{f.jurisdiction}</td>
                    <td className="px-4 py-2" style={{ color: "var(--text-default)" }}>{f.period}</td>
                    <td className="px-4 py-2 text-right tabular-nums" style={{ color: "var(--text-default)" }}>
                      {fmt(f.taxCollected)}
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums" style={{ color: "var(--text-muted)" }}>
                      {fmt(f.taxableSales)}
                    </td>
                    <td className="px-4 py-2 text-[12px]" style={{ color: "var(--text-muted)" }}>
                      {f.dueAt.toLocaleDateString()}
                    </td>
                    <td className="px-4 py-2 text-[12px]" style={{ color: "var(--text-muted)" }}>
                      {f.submittedAt ? f.submittedAt.toLocaleDateString() : "—"}
                    </td>
                    <td className="px-4 py-2">
                      <span className="rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
                            style={{ background: palette.bg, color: palette.fg, border: `1px solid ${palette.fg}` }}>
                        {f.status}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-[12px]">
                      {f.pdfUrl
                        ? <a href={f.pdfUrl} target="_blank" rel="noopener"
                             className="hover:underline" style={{ color: "var(--accent-primary)" }}>
                            View →
                          </a>
                        : <span style={{ color: "var(--text-faint)" }}>—</span>}
                    </td>
                    {canManage && (
                      <td className="px-4 py-2 text-right">
                        <form action={deleteTaxFiling.bind(null, f.id)}>
                          <button type="submit"
                                  className="ts-focus rounded-md border px-2 py-1 text-[11px] font-medium"
                                  style={{ borderColor: "var(--border-subtle)", color: "var(--danger-fg)", background: "var(--surface-1)" }}>
                            Remove
                          </button>
                        </form>
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
  label, name, type = "text", required, placeholder, maxLength, defaultValue, wide,
}: {
  label: string; name: string; type?: string; required?: boolean;
  placeholder?: string; maxLength?: number; defaultValue?: string; wide?: boolean;
}) {
  return (
    <label className={"block " + (wide ? "md:col-span-3" : "")}>
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

function Select({
  label, name, defaultValue, options,
}: {
  label: string; name: string; defaultValue?: string;
  options: { value: string; label: string }[];
}) {
  return (
    <label className="block">
      <span className="block text-[11px] font-medium uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>
        {label}
      </span>
      <select name={name} defaultValue={defaultValue}
              className="ts-focus mt-1 w-full rounded-md border px-3 py-2 text-[13px]"
              style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)", color: "var(--text-default)" }}>
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </label>
  );
}
