import { requirePlatformStaff } from "@/lib/platform";
import { SectionPage } from "@/components/platform/SectionPage";

// /platform/integrations — preview stub. Surface for the third-party
// services we depend on (status + config) plus the catalog of
// integrations tenants can enable per-workspace.

export default async function IntegrationsPage() {
  await requirePlatformStaff();

  // Live status of the integrations that matter today, derived from
  // env-var presence. Not perfect (a key being set doesn't mean the
  // service is reachable) but useful at a glance.
  const statuses = [
    { name: "Stripe",  configured: !!process.env.STRIPE_SECRET_KEY,  purpose: "Subscription billing + manual invoicing" },
    { name: "Resend",  configured: !!process.env.RESEND_API_KEY,     purpose: "Transactional email + magic-link sign-in" },
    { name: "Sentry",  configured: !!process.env.SENTRY_DSN,         purpose: "Error tracking + performance monitoring" },
    { name: "Cloudflare R2", configured: !!process.env.R2_ACCESS_KEY_ID, purpose: "File storage (proofs, install photos)" },
    { name: "Vercel",  configured: !!process.env.VERCEL_URL,         purpose: "Hosting + Edge runtime" },
    { name: "Neon",    configured: !!process.env.DATABASE_URL,       purpose: "PostgreSQL database" },
  ];

  return (
    <SectionPage
      eyebrow="Integrations"
      eyebrowIcon="Activity"
      title="Integrations"
      description="Third-party services Flowtora depends on, plus the catalog of per-tenant integrations admins can enable. Configuration today happens via env vars on Vercel; this surface will move that into an admin-editable interface."
      preview
      roadmap={[
        {
          title: "Per-tenant integration catalog",
          body: "QuickBooks / Xero accounting sync, Slack notifications, Zapier webhooks, Google Calendar sync. Tenants enable + authorize from /t/[slug]/settings/integrations.",
        },
        {
          title: "Connector health dashboard",
          body: "Real-time status of every webhook + API integration — Stripe webhooks, Resend webhooks, R2 uploads. Currently in /platform/health under 'Integrations'; will graduate here.",
        },
        {
          title: "OAuth credential manager",
          body: "Edit Google / Slack / GitHub OAuth client IDs + secrets with rotate-key workflow.",
        },
        {
          title: "API key management",
          body: "Issue + rotate Flowtora API keys for tenants who want to script their workspace. See /platform/audit for the API key issuance trail.",
        },
      ]}
      callout={{
        title: "Service status (env-derived)",
        body: statuses.map((s) => `${s.configured ? "✓" : "✗"} ${s.name} — ${s.purpose}`).join(" · "),
      }}
    />
  );
}
