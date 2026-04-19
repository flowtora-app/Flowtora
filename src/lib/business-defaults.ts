// Phase 4 Slice A — smart defaults by business type.
//
// Sign shops and print shops don't quote the same way. A sign shop sells a
// few big jobs a month — vehicle wraps, channel letters, trade-show booths —
// with heavy deposits (50 %) and mandatory proofs because the customer
// usually can't "undo" a channel letter install. A print shop runs dozens
// of small jobs a week — business cards, flyers, packaging — with smaller
// deposits (30 %) and faster payment terms because the turnover is too
// high to wait on net-30 for everyone.
//
// Rather than force the owner to learn what to pick, we read the business
// type they chose on step 1 and pre-fill step 2 (branding is neutral) and
// step 3 (financial defaults) with the preset the industry actually uses.
// They can still override every field — this just puts a sensible cursor
// on the page so a shop can finish onboarding without googling "what should
// my deposit percent be".
//
// The presets also carry service pre-selections so the services-offered
// checkbox list on step 1 already has the most common ones ticked.

import type { BusinessType, PaymentTerms } from "@prisma/client";

export interface BusinessDefaults {
  /** Services pre-checked on the business-type step. */
  services: string[];
  /** Financial defaults applied to the tenant on business-step save. */
  financial: {
    defaultDepositPercent: number;
    defaultPaymentTerms: PaymentTerms;
    proofRequiresApproval: boolean;
    requireProofBeforeProduction: boolean;
    requireDepositBeforeProduction: boolean;
    requireDepositBeforeInstall: boolean;
    quoteNumberPrefix: string;
    orderNumberPrefix: string;
    invoiceNumberPrefix: string;
    rushFeePercent: number;
  };
  /** Short one-liner shown under the services list as a rationale. */
  rationale: string;
}

// Service catalog — keep in sync with SERVICES in onboarding/business/page.tsx.
// Duplicated here on purpose: these literals drive UI pre-selection, and
// importing across server/client route files adds ceremony with no payoff.
const SIGN_SERVICES = [
  "Vinyl banners",
  "Channel letters",
  "Vehicle wraps",
  "Window graphics",
  "Wayfinding signs",
  "Trade-show graphics",
  "Yard signs",
  "ADA signs",
  "Installation services",
  "Design services",
];

const PRINT_SERVICES = [
  "Wide-format printing",
  "Business cards",
  "Brochures & flyers",
  "Apparel printing",
  "Packaging",
  "Stickers & labels",
  "Design services",
];

// Every tenant starts with a 50 % deposit (the global default in the
// schema). We restate it here so the preset is fully self-describing.
const SIGN_SHOP: BusinessDefaults = {
  services: SIGN_SERVICES,
  financial: {
    defaultDepositPercent: 50,
    defaultPaymentTerms: "NET_30",
    proofRequiresApproval: true,
    requireProofBeforeProduction: true,
    requireDepositBeforeProduction: true,
    requireDepositBeforeInstall: true,
    quoteNumberPrefix: "Q-",
    orderNumberPrefix: "JOB-",
    invoiceNumberPrefix: "INV-",
    rushFeePercent: 25,
  },
  rationale:
    "Sign shops typically collect 50 % upfront, lock production behind an approved proof, and charge a 25 % rush fee when a customer needs something faster than standard lead time.",
};

const PRINT_SHOP: BusinessDefaults = {
  services: PRINT_SERVICES,
  financial: {
    defaultDepositPercent: 30,
    defaultPaymentTerms: "NET_15",
    proofRequiresApproval: true,
    requireProofBeforeProduction: false,
    requireDepositBeforeProduction: false,
    requireDepositBeforeInstall: false,
    quoteNumberPrefix: "EST-",
    orderNumberPrefix: "PO-",
    invoiceNumberPrefix: "INV-",
    rushFeePercent: 15,
  },
  rationale:
    "Print shops run a higher volume of smaller jobs, so defaults lean toward faster turnaround — 30 % deposits, net-15 terms, and a lighter 15 % rush surcharge.",
};

const HYBRID: BusinessDefaults = {
  services: [...new Set([...SIGN_SERVICES, ...PRINT_SERVICES])],
  financial: {
    defaultDepositPercent: 40,
    defaultPaymentTerms: "NET_30",
    proofRequiresApproval: true,
    requireProofBeforeProduction: true,
    requireDepositBeforeProduction: true,
    requireDepositBeforeInstall: true,
    quoteNumberPrefix: "Q-",
    orderNumberPrefix: "JOB-",
    invoiceNumberPrefix: "INV-",
    rushFeePercent: 20,
  },
  rationale:
    "A mixed shop gets the cautious middle — 40 % deposits, net-30 terms, proof gate on, rush fee at 20 %.",
};

const OTHER: BusinessDefaults = {
  services: [],
  financial: {
    defaultDepositPercent: 50,
    defaultPaymentTerms: "NET_30",
    proofRequiresApproval: true,
    requireProofBeforeProduction: false,
    requireDepositBeforeProduction: false,
    requireDepositBeforeInstall: false,
    quoteNumberPrefix: "Q-",
    orderNumberPrefix: "O-",
    invoiceNumberPrefix: "INV-",
    rushFeePercent: 0,
  },
  rationale:
    "We'll keep defaults conservative — you can tune anything on the next step or later under Settings.",
};

const PRESETS: Record<BusinessType, BusinessDefaults> = {
  SIGN_SHOP,
  PRINT_SHOP,
  HYBRID,
  OTHER,
};

export function businessDefaultsFor(type: BusinessType): BusinessDefaults {
  return PRESETS[type];
}

/**
 * Returns whether a given service should appear pre-checked on the
 * business-type step for the supplied business type. Safe to call during
 * render — it's a constant lookup.
 */
export function isServicePrechecked(type: BusinessType | null, service: string): boolean {
  if (!type) return false;
  return PRESETS[type].services.includes(service);
}
