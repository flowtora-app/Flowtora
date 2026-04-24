import { Field, SelectField, TextArea } from "@/components/Field";
import { PIPELINE_STAGES, DEFAULT_LEAD_SOURCES } from "@/lib/crm";
import type { Customer } from "@prisma/client";

type Member = { userId: string; name: string };

export function CustomerForm({
  customer,
  members,
}: {
  customer?: Partial<Customer> | null;
  members: Member[];
}) {
  const c = customer ?? {};
  return (
    <div className="space-y-6">
      <section className="space-y-4">
        <SectionHeader
          step={1}
          title="Who is this?"
          description="Business or person, owner, and lead source."
        />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <SelectField
            label="Type"
            name="kind"
            defaultValue={c.kind ?? "BUSINESS"}
            options={[
              { value: "BUSINESS", label: "Business" },
              { value: "INDIVIDUAL", label: "Individual" },
            ]}
          />
          <SelectField
            label="Status"
            name="status"
            defaultValue={c.status ?? "ACTIVE"}
            options={[
              { value: "ACTIVE", label: "Active" },
              { value: "INACTIVE", label: "Inactive" },
              { value: "ARCHIVED", label: "Archived" },
            ]}
          />
          <div className="sm:col-span-2">
            <Field
              label="Name"
              name="name"
              required
              defaultValue={c.name ?? ""}
              hint="Company name, or person's full name."
            />
          </div>
          <SelectField
            label="Pipeline stage"
            name="stage"
            defaultValue={c.stage ?? "NEW_LEAD"}
            options={PIPELINE_STAGES.map((s) => ({ value: s.value, label: s.label }))}
          />
          <SelectField
            label="Owner"
            name="ownerId"
            defaultValue={c.ownerId ?? ""}
            options={[
              { value: "", label: "Unassigned" },
              ...members.map((m) => ({ value: m.userId, label: m.name })),
            ]}
          />
          <SelectField
            label="Lead source"
            name="source"
            defaultValue={c.source ?? ""}
            options={[
              { value: "", label: "—" },
              ...DEFAULT_LEAD_SOURCES.map((s) => ({ value: s, label: s })),
            ]}
          />
        </div>
      </section>

      <section className="space-y-4">
        <SectionHeader
          step={2}
          title="Contact info"
          description="How to reach them — email, phone, website."
        />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Field label="Email" name="email" type="email" defaultValue={c.email ?? ""} />
          <Field label="Phone" name="phone" defaultValue={c.phone ?? ""} />
          <Field label="Website" name="website" type="url" defaultValue={c.website ?? ""} />
        </div>
      </section>

      <section className="space-y-4">
        <SectionHeader
          step={3}
          title="Value & forecast"
          description="Pipeline estimates and default pricing behavior."
        />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Field
            label="Estimated value"
            name="estimatedValue"
            type="number"
            step="0.01"
            min="0"
            defaultValue={c.estimatedValue ? String(c.estimatedValue) : ""}
          />
          <Field
            label="Close probability (%)"
            name="closeProbability"
            type="number"
            min="0"
            max="100"
            defaultValue={c.closeProbability != null ? String(c.closeProbability) : ""}
          />
          <Field
            label="Default discount (%)"
            name="defaultDiscountPct"
            type="number"
            min="0"
            max="100"
            defaultValue={c.defaultDiscountPct != null ? String(c.defaultDiscountPct) : ""}
            hint="Pre-fills on new quotes. 0 disables."
          />
        </div>
      </section>

      <section className="space-y-4">
        <SectionHeader
          step={4}
          title="Tags & notes"
          description="Internal labels and context visible across the CRM."
        />
        <Field
          label="Tags"
          name="tags"
          defaultValue={c.tags?.join(", ") ?? ""}
          hint="Comma-separated."
        />
        <TextArea label="Notes" name="notes" rows={3} defaultValue={c.notes ?? ""} />
      </section>

      <section className="space-y-4">
        <SectionHeader
          step={5}
          title="Addresses"
          description="Optional — used on quotes, invoices, and install sheets."
        />
        <details
          className="rounded-md"
          style={{
            background: "var(--surface-0)",
            border: "1px solid var(--border-subtle)",
          }}
        >
          <summary
            className="cursor-pointer select-none px-4 py-2.5 text-sm font-medium"
            style={{ color: "var(--text-default)" }}
          >
            Billing address
          </summary>
          <div
            className="grid grid-cols-1 gap-3 px-4 py-4 sm:grid-cols-2"
            style={{ borderTop: "1px solid var(--border-subtle)" }}
          >
            <Field label="Address line 1" name="billingAddressLine1" defaultValue={c.billingAddressLine1 ?? ""} />
            <Field label="Address line 2" name="billingAddressLine2" defaultValue={c.billingAddressLine2 ?? ""} />
            <Field label="City" name="billingCity" defaultValue={c.billingCity ?? ""} />
            <Field label="State / Region" name="billingRegion" defaultValue={c.billingRegion ?? ""} />
            <Field label="Postal code" name="billingPostalCode" defaultValue={c.billingPostalCode ?? ""} />
            <Field label="Country" name="billingCountry" defaultValue={c.billingCountry ?? ""} />
          </div>
        </details>

        <details
          className="rounded-md"
          style={{
            background: "var(--surface-0)",
            border: "1px solid var(--border-subtle)",
          }}
        >
          <summary
            className="cursor-pointer select-none px-4 py-2.5 text-sm font-medium"
            style={{ color: "var(--text-default)" }}
          >
            Install / shipping address
          </summary>
          <div
            className="grid grid-cols-1 gap-3 px-4 py-4 sm:grid-cols-2"
            style={{ borderTop: "1px solid var(--border-subtle)" }}
          >
            <Field label="Address line 1" name="installAddressLine1" defaultValue={c.installAddressLine1 ?? ""} />
            <Field label="Address line 2" name="installAddressLine2" defaultValue={c.installAddressLine2 ?? ""} />
            <Field label="City" name="installCity" defaultValue={c.installCity ?? ""} />
            <Field label="State / Region" name="installRegion" defaultValue={c.installRegion ?? ""} />
            <Field label="Postal code" name="installPostalCode" defaultValue={c.installPostalCode ?? ""} />
            <Field label="Country" name="installCountry" defaultValue={c.installCountry ?? ""} />
          </div>
        </details>
      </section>
    </div>
  );
}

function SectionHeader({
  step,
  title,
  description,
}: {
  step: number;
  title: string;
  description: string;
}) {
  return (
    <div className="flex items-start gap-3">
      <div
        aria-hidden
        className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold"
        style={{
          background: "var(--surface-2)",
          border: "1px solid var(--border-subtle)",
          color: "var(--text-muted)",
        }}
      >
        {step}
      </div>
      <div className="min-w-0">
        <h3 className="text-sm font-semibold" style={{ color: "var(--text-default)" }}>
          {title}
        </h3>
        <p className="mt-0.5 text-xs" style={{ color: "var(--text-muted)" }}>
          {description}
        </p>
      </div>
    </div>
  );
}
