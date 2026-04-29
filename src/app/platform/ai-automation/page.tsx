import { requirePlatformStaff } from "@/lib/platform";
import { SectionPage } from "@/components/platform/SectionPage";

// /platform/ai-automation — preview stub. AI-powered features
// (drafting, summarization, classification) and rule-based workflow
// automation across the platform.

export default async function AiAutomationPage() {
  await requirePlatformStaff();
  return (
    <SectionPage
      eyebrow="AI & Automation"
      eyebrowIcon="Sparkles"
      title="AI & Automation"
      description="AI-assisted features (proof draft, customer-message tone polish, lead qualification) and rule-based workflow automation. Today the platform has no AI features wired in — this surface lights up when we plug a model in."
      preview
      roadmap={[
        {
          title: "Lead-qualification model",
          body: "Auto-classify incoming /book-demo + /contact submissions: hot / warm / cold + suggested next action. Saves the sales lead in /platform/leads with a confidence score.",
        },
        {
          title: "Customer-message tone polish",
          body: "When a tenant member drafts a customer-portal reply, an AI assist pass tightens grammar and adjusts tone (friendly / professional / firm). Opt-in per shop.",
        },
        {
          title: "Proof-draft auto-generation",
          body: "Given the customer's order spec + uploaded reference images, generate a first-pass proof for the designer to refine. Reduces designer turnaround.",
        },
        {
          title: "Rule-based automation",
          body: "Visual flow builder for shop owners: 'when an order moves to PAID, send the deposit thank-you template + nudge production.' Today these are hard-coded; the surface here would expose them.",
        },
        {
          title: "Anomaly detection",
          body: "Flag unusual usage patterns — sudden burst of failed sign-ins from one IP, tenant's MRR drop &gt; 50% in a billing cycle, support ticket volume spike. Pages a Slack channel.",
        },
      ]}
      callout={{
        title: "AI policy",
        body: "Any AI feature that processes tenant data will be opt-in per workspace, fully auditable, and never train upstream models with shop or customer data. Feature gates wired through /platform/feature-flags.",
        href: "/platform/feature-flags",
        cta: "Feature flags",
      }}
    />
  );
}
