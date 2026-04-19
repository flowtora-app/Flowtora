import type { OnboardingStepperStep } from "@/components/onboarding/OnboardingStepper";

// Phase 18 Slice D — single source of truth for onboarding step copy.
//
// Layout, welcome, and done pages all pull from this list so wording
// stays consistent. Keeping it as a plain module (not re-exported from
// the layout) means we can import it from any route without pulling
// server-only layout code along for the ride.

export const ONBOARDING_STEPS: OnboardingStepperStep[] = [
  {
    slug: "business",
    label: "Business",
    description: "Tell us what you make and who you serve.",
  },
  {
    slug: "branding",
    label: "Branding",
    description: "Logo, contact info, and where you operate.",
  },
  {
    slug: "defaults",
    label: "Defaults",
    description: "Numbering, tax, deposits, and payment terms.",
  },
  {
    slug: "team",
    label: "Team",
    description: "Invite the people who'll use Flowtora with you.",
  },
  {
    slug: "sample",
    label: "Sample data",
    description: "Optional — load a demo shop you can poke around.",
  },
];
