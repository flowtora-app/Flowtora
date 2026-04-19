import { requirePermission } from "@/lib/tenant";
import { saveProfile } from "@/app/actions/settings";
import { Button, Field, SelectField } from "@/components/Field";
import { Card, CardHeader } from "@/components/Card";

const TIMEZONES = [
  "UTC", "America/New_York", "America/Chicago", "America/Denver",
  "America/Los_Angeles", "America/Phoenix", "America/Anchorage",
  "Europe/London", "Europe/Paris", "Australia/Sydney",
];
const CURRENCIES = ["USD", "CAD", "EUR", "GBP", "AUD"];

export default async function ProfileSettings({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { slug } = await params;
  const sp = await searchParams;
  const { tenant } = await requirePermission(slug, "tenant:manage");
  const action = saveProfile.bind(null, slug);

  return (
    <Card>
      <CardHeader title="Shop profile" description="Shown on quotes, invoices, and the customer portal." />
      <form action={action} className="space-y-4 px-5 py-5">
        <Field label="Shop name" name="name" required defaultValue={tenant.name} />
        <Field label="Logo URL" name="logoUrl" type="url" defaultValue={tenant.logoUrl ?? ""} />
        {/* Phase 15 Slice D — brand accent color drives the portal & share
            link accent. Stored as #RRGGBB; the portal layout ignores anything
            that doesn't match the hex shape so a typo can't break layout. */}
        <div className="grid grid-cols-2 gap-3">
          <Field
            label="Brand accent color (hex)"
            name="brandPrimaryColor"
            placeholder="#1e40af"
            defaultValue={tenant.brandPrimaryColor ?? ""}
          />
          <div
            className="flex items-end pb-1 text-xs"
            style={{ color: "var(--text-muted)" }}
          >
            Shown on the customer portal and share links. Leave blank for default.
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Phone" name="phone" defaultValue={tenant.phone ?? ""} />
          <Field label="Website" name="website" type="url" defaultValue={tenant.website ?? ""} />
        </div>
        <Field label="Tax ID / EIN" name="taxId" defaultValue={tenant.taxId ?? ""} />
        <Field label="Address line 1" name="addressLine1" defaultValue={tenant.addressLine1 ?? ""} />
        <Field label="Address line 2" name="addressLine2" defaultValue={tenant.addressLine2 ?? ""} />
        <div className="grid grid-cols-2 gap-3">
          <Field label="City" name="city" defaultValue={tenant.city ?? ""} />
          <Field label="State / Region" name="region" defaultValue={tenant.region ?? ""} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Postal code" name="postalCode" defaultValue={tenant.postalCode ?? ""} />
          <Field label="Country" name="country" defaultValue={tenant.country ?? ""} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <SelectField label="Timezone" name="timezone" defaultValue={tenant.timezone}
            options={TIMEZONES.map((t) => ({ value: t, label: t }))} />
          <SelectField label="Currency" name="currency" defaultValue={tenant.currency}
            options={CURRENCIES.map((c) => ({ value: c, label: c }))} />
        </div>

        {/* Phase 21 Slice D — date format and week start. Customer-facing
            screens (portal, emails) use this; internal staff views stay ISO. */}
        <div className="grid grid-cols-2 gap-3">
          <SelectField
            label="Date format (customer-facing)"
            name="dateFormat"
            defaultValue={tenant.dateFormat ?? "US"}
            options={[
              { value: "US",  label: "MM/DD/YYYY" },
              { value: "EU",  label: "DD/MM/YYYY" },
              { value: "ISO", label: "YYYY-MM-DD" },
            ]}
          />
          <SelectField
            label="Week starts on"
            name="weekStartsOn"
            defaultValue={String(tenant.weekStartsOn ?? 0)}
            options={[
              { value: "0", label: "Sunday" },
              { value: "1", label: "Monday" },
              { value: "6", label: "Saturday" },
            ]}
          />
        </div>

        {/* Phase 21 Slice A — email sender customization. Display name shows
            up in the recipient's inbox; Reply-To is where their "Reply"
            button goes. Envelope sender stays on our domain for DKIM. */}
        <div
          className="rounded-md px-4 py-3 text-xs"
          style={{ background: "var(--panel-alt, var(--panel))", border: "1px solid var(--border)", color: "var(--muted)" }}
        >
          Customer-facing emails are sent from <code>noreply@tracksign.app</code> (verified sender) with the display name and reply address below.
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field
            label="Email sender name"
            name="emailFromName"
            placeholder={tenant.name}
            defaultValue={tenant.emailFromName ?? ""}
          />
          <Field
            label="Reply-to address"
            name="emailReplyTo"
            type="email"
            placeholder="hello@yourshop.com"
            defaultValue={tenant.emailReplyTo ?? ""}
          />
        </div>

        {sp.error && <p className="text-sm" style={{ color: "var(--danger-fg)" }}>{decodeURIComponent(sp.error)}</p>}
        <div className="flex justify-end">
          <Button type="submit">Save</Button>
        </div>
      </form>
    </Card>
  );
}
