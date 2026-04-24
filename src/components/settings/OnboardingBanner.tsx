"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";

// Phase 4 (transformation) — onboarding now deep-links into settings.
//
// Each step in /onboarding is a link that navigates here with
// ?hl=<stepId>. The banner surfaces the onboarding context at the top
// of whatever settings page the user lands on so they know they're in
// a flow (not just wandering settings) and can jump back to the
// checklist when they're done with this card.
//
// Client component because it reads the URL via useSearchParams — no
// server-side read would survive without plumbing the param through
// every settings page's props.

interface BannerCopy {
  title: string;
  body: string;
}

const COPY: Record<string, BannerCopy> = {
  business: {
    title: "Onboarding · Business",
    body: "Set your shop name, brand color, and customer-facing identity.",
  },
  branding: {
    title: "Onboarding · Branding",
    body: "Upload your logo and add contact + location info customers will see.",
  },
  defaults: {
    title: "Onboarding · Defaults",
    body: "Numbering, tax, deposits, and payment terms used on new quotes.",
  },
  team: {
    title: "Onboarding · Team",
    body: "Invite the people who'll run Flowtora alongside you.",
  },
  sample: {
    title: "Onboarding · Demo data",
    body: "Load a demo shop so you can see the full product before real data exists.",
  },
};

export function OnboardingBanner({ slug }: { slug: string }) {
  const sp = useSearchParams();
  const hl = sp?.get("hl");
  if (!hl) return null;
  const copy = COPY[hl];
  if (!copy) return null;

  return (
    <div
      className="mb-4 flex items-start gap-3 rounded-md px-4 py-3"
      style={{
        background: "var(--accent-surface)",
        border: "1px solid var(--accent-surface-strong, var(--accent-primary))",
      }}
      role="status"
    >
      <div className="flex-1">
        <div
          className="text-xs font-semibold uppercase tracking-wider"
          style={{ color: "var(--accent-primary)" }}
        >
          {copy.title}
        </div>
        <div className="mt-0.5 text-sm" style={{ color: "var(--text-default)" }}>
          {copy.body}
        </div>
      </div>
      <Link
        href={`/t/${slug}/onboarding`}
        className="shrink-0 text-xs underline"
        style={{ color: "var(--accent-primary)" }}
      >
        Back to checklist
      </Link>
    </div>
  );
}
