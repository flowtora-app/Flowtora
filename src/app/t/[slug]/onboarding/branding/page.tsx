import { requirePermission } from "@/lib/tenant";
import { saveBrandingStep } from "@/app/actions/onboarding";
import { Button, Field, SelectField } from "@/components/Field";
import { Card, CardHeader } from "@/components/Card";
import { LogoUploader } from "@/components/onboarding/LogoUploader";

const TIMEZONES = [
  "UTC", "America/New_York", "America/Chicago", "America/Denver",
  "America/Los_Angeles", "America/Phoenix", "America/Anchorage",
  "Europe/London", "Europe/Paris", "Australia/Sydney",
];

const CURRENCIES = ["USD", "CAD", "EUR", "GBP", "AUD"];

export default async function BrandingStep({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const { tenant } = await requirePermission(slug, "tenant:manage");
  const action = saveBrandingStep.bind(null, slug);

  return (
    <Card>
      <CardHeader title="Branding & contact" description="What customers will see on quotes, invoices, and your portal." />
      <form action={action} className="space-y-4 px-5 py-5">
        <LogoUploader slug={slug} initialUrl={tenant.logoUrl} />
        <div className="grid grid-cols-2 gap-3">
          <Field label="Phone" name="phone" defaultValue={tenant.phone ?? ""} />
          <Field label="Website" name="website" type="url" defaultValue={tenant.website ?? ""} />
        </div>
        <Field label="Address" name="addressLine1" defaultValue={tenant.addressLine1 ?? ""} />
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
        <div className="flex justify-end">
          <Button type="submit">Continue</Button>
        </div>
      </form>
    </Card>
  );
}
