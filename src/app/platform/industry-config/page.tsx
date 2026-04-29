import { requirePlatformStaff } from "@/lib/platform";
import { SectionPage } from "@/components/platform/SectionPage";

// /platform/industry-config — preview stub. Sign + print shop
// industry-specific configuration (default product catalogs,
// install workflows, default tax behavior, regional defaults).

export default async function IndustryConfigPage() {
  await requirePlatformStaff();
  return (
    <SectionPage
      eyebrow="Industry Config"
      eyebrowIcon="Target"
      title="Industry Config"
      description="Industry-specific defaults that ship to every new tenant: product catalogs, install workflow templates, regional tax defaults, currency presets. Today new tenants seed with hard-coded defaults from /lib/sample-data — this surface will move that into editable presets."
      preview
      roadmap={[
        {
          title: "Default product catalog presets",
          body: "Curated catalogs per business type (sign shop / print shop / hybrid) used as the seed when a new tenant skips bring-your-own.",
        },
        {
          title: "Default workflow templates",
          body: "Production checklist + install workflow scaffolds — sign shops differ meaningfully from print shops on QC + install steps.",
        },
        {
          title: "Regional tax + currency presets",
          body: "Pre-baked defaults for US/CA/AU/UK/EU so a new tenant lands with sensible defaults without an admin call.",
        },
        {
          title: "Industry feature gates",
          body: "Some features (install events, large-format proofing) only matter for sign shops — let admins keep them dark for print-only tenants by default.",
        },
      ]}
    />
  );
}
