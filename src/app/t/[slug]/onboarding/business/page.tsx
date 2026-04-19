import { requirePermission } from "@/lib/tenant";
import { saveBusinessStep } from "@/app/actions/onboarding";
import { Button, Checkbox } from "@/components/Field";
import { Card, CardHeader } from "@/components/Card";
import { BusinessTypeRadios } from "@/components/onboarding/BusinessTypeRadios";
import { businessDefaultsFor } from "@/lib/business-defaults";

// Phase 4 Slice A — business step with business-type-aware presets.
//
// When a user picks a business type we want the services checkbox list
// AND the rationale line below the fieldset to update immediately. That
// requires a client component for the radio group; everything else stays
// server-rendered.

// Master list of every service we offer — order matters because the UI
// reads top-to-bottom. Items with no pre-selection for any business type
// still need to be in the list; they just start unchecked across the
// board.
const SERVICES = [
  "Vinyl banners",
  "Channel letters",
  "Vehicle wraps",
  "Window graphics",
  "Wayfinding signs",
  "Trade-show graphics",
  "Yard signs",
  "ADA signs",
  "Wide-format printing",
  "Business cards",
  "Brochures & flyers",
  "Apparel printing",
  "Packaging",
  "Stickers & labels",
  "Installation services",
  "Design services",
];

export default async function BusinessStep({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const { tenant } = await requirePermission(slug, "tenant:manage");
  const action = saveBusinessStep.bind(null, slug);
  const selected = new Set(tenant.services);

  // Default selection when the user has not yet chosen — matches the
  // radio default (SIGN_SHOP) so the initial render doesn't disagree
  // with the client-side filtering.
  const initialType = tenant.businessType ?? "SIGN_SHOP";
  const initialPresetServices = new Set(businessDefaultsFor(initialType).services);

  // If no services have been saved yet, pre-check the preset for the
  // default business type. If the user has already saved, we respect
  // their picks (don't overwrite).
  const hasStoredServices = tenant.services.length > 0;
  const effectiveSelected = hasStoredServices
    ? selected
    : initialPresetServices;

  return (
    <Card>
      <CardHeader
        title="Tell us about your business"
        description="We'll tailor your services, numbering, deposits, and defaults so you finish setup faster."
      />
      <form action={action} className="space-y-6 px-5 py-5">
        <BusinessTypeRadios
          initialType={initialType}
          hasStoredServices={hasStoredServices}
        />

        <fieldset data-services-fieldset>
          <legend className="mb-2 text-sm font-medium">Services you offer</legend>
          <p
            className="mb-3 text-xs"
            style={{ color: "var(--text-muted)" }}
          >
            We&apos;ve pre-checked common ones for your shop type — uncheck anything
            that doesn&apos;t fit or add more.
          </p>
          <div className="grid grid-cols-2 gap-2">
            {SERVICES.map((s) => (
              <Checkbox
                key={s}
                name="services"
                value={s}
                label={s}
                defaultChecked={effectiveSelected.has(s)}
                data-service={s}
              />
            ))}
          </div>
        </fieldset>

        <div className="flex justify-end">
          <Button type="submit">Continue</Button>
        </div>
      </form>
    </Card>
  );
}
