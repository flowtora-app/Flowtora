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
      <section className="grid grid-cols-2 gap-3">
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
        <Field label="Name" name="name" required defaultValue={c.name ?? ""} hint="Company name, or person's full name." />
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
          options={[{ value: "", label: "Unassigned" }, ...members.map((m) => ({ value: m.userId, label: m.name }))]}
        />
        <SelectField
          label="Lead source"
          name="source"
          defaultValue={c.source ?? ""}
          options={[{ value: "", label: "—" }, ...DEFAULT_LEAD_SOURCES.map((s) => ({ value: s, label: s }))]}
        />
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
          hint="Pre-fills a percent discount on new quotes for this customer. 0 disables."
        />
      </section>

      <section className="grid grid-cols-3 gap-3">
        <Field label="Email" name="email" type="email" defaultValue={c.email ?? ""} />
        <Field label="Phone" name="phone" defaultValue={c.phone ?? ""} />
        <Field label="Website" name="website" type="url" defaultValue={c.website ?? ""} />
      </section>

      <section className="grid grid-cols-1 gap-3">
        <Field label="Tags" name="tags" defaultValue={c.tags?.join(", ") ?? ""} hint="Comma-separated." />
        <TextArea label="Notes" name="notes" rows={3} defaultValue={c.notes ?? ""} />
      </section>

      <details>
        <summary className="cursor-pointer text-sm font-medium">Billing address</summary>
        <div className="mt-3 grid grid-cols-2 gap-3">
          <Field label="Address line 1" name="billingAddressLine1" defaultValue={c.billingAddressLine1 ?? ""} />
          <Field label="Address line 2" name="billingAddressLine2" defaultValue={c.billingAddressLine2 ?? ""} />
          <Field label="City" name="billingCity" defaultValue={c.billingCity ?? ""} />
          <Field label="State / Region" name="billingRegion" defaultValue={c.billingRegion ?? ""} />
          <Field label="Postal code" name="billingPostalCode" defaultValue={c.billingPostalCode ?? ""} />
          <Field label="Country" name="billingCountry" defaultValue={c.billingCountry ?? ""} />
        </div>
      </details>

      <details>
        <summary className="cursor-pointer text-sm font-medium">Install / shipping address</summary>
        <div className="mt-3 grid grid-cols-2 gap-3">
          <Field label="Address line 1" name="installAddressLine1" defaultValue={c.installAddressLine1 ?? ""} />
          <Field label="Address line 2" name="installAddressLine2" defaultValue={c.installAddressLine2 ?? ""} />
          <Field label="City" name="installCity" defaultValue={c.installCity ?? ""} />
          <Field label="State / Region" name="installRegion" defaultValue={c.installRegion ?? ""} />
          <Field label="Postal code" name="installPostalCode" defaultValue={c.installPostalCode ?? ""} />
          <Field label="Country" name="installCountry" defaultValue={c.installCountry ?? ""} />
        </div>
      </details>
    </div>
  );
}
