// Page 40 — Step kind catalog + per-kind config schema.
//
// Each step kind has a typed `config` shape, a default factory, a
// human-readable label, and a 1-line summary used by the canvas.

import type { SequenceStepKind, SequenceTriggerType } from "@prisma/client";

export const STEP_LABEL: Record<SequenceStepKind, string> = {
  SEND_EMAIL:    "Send email",
  SEND_SMS:      "Send SMS",
  SEND_IN_APP:   "Send in-app message",
  NOTIFY_CSM:    "Notify CSM",
  ADD_TAG:       "Add tag",
  REMOVE_TAG:    "Remove tag",
  MOVE_TO_PLAN:  "Move to plan",
  APPLY_COUPON:  "Apply coupon",
  WEBHOOK_OUT:   "Webhook out",
  BRANCH:        "Branch (if/else)",
  WAIT:          "Wait",
  SPLIT:         "Random split",
};

export const STEP_DESCRIPTION: Record<SequenceStepKind, string> = {
  SEND_EMAIL:    "Email rendered from a template + Markdown body",
  SEND_SMS:      "SMS via the configured provider",
  SEND_IN_APP:   "In-app message in the tenant's notification center",
  NOTIFY_CSM:    "Page the assigned CSM with context",
  ADD_TAG:       "Tag the tenant for downstream segmentation",
  REMOVE_TAG:    "Remove a tag from the tenant",
  MOVE_TO_PLAN:  "Switch the tenant's plan",
  APPLY_COUPON:  "Mint a coupon and attach it to the tenant",
  WEBHOOK_OUT:   "Outbound webhook with enrollee context",
  BRANCH:        "Conditional split (yes / no children)",
  WAIT:          "Pause for a duration or until an event",
  SPLIT:         "A/B split — random percentage routing",
};

export const TRIGGER_LABEL: Record<SequenceTriggerType, string> = {
  SIGNUP:            "On signup",
  PLAN_STARTED:      "On plan started",
  PLAN_CHANGED:      "On plan changed",
  FAILED_PAYMENT:    "On failed payment",
  TRIAL_ENDING:      "Trial ending in N days",
  DAYS_INACTIVE:     "After N days inactive",
  FEATURE_FIRST_USE: "On first feature use",
  CUSTOM_EVENT:      "On custom event",
  TAG_ADDED:         "When tag is added",
  WEBHOOK:           "Inbound webhook",
};

export const TRIGGER_DESCRIPTION: Record<SequenceTriggerType, string> = {
  SIGNUP:            "Fires once per tenant the moment they sign up.",
  PLAN_STARTED:      "Fires when a tenant starts a paid plan.",
  PLAN_CHANGED:      "Fires when a tenant up- or downgrades.",
  FAILED_PAYMENT:    "Stripe webhook + dunning state.",
  TRIAL_ENDING:      "N days before trialEndsAt — config = { daysBefore }.",
  DAYS_INACTIVE:     "Last login > N days ago — config = { days }.",
  FEATURE_FIRST_USE: "Internal feature usage event — config = { featureKey }.",
  CUSTOM_EVENT:      "App-emitted custom event — config = { eventName }.",
  TAG_ADDED:         "Tenant.adminTags acquires the tag — config = { tag }.",
  WEBHOOK:           "External webhook hits /api/seq/trigger/[secret] — config = { secret }.",
};

/* ── Per-kind config types ─────────────────────────────── */

export interface SendEmailConfig {
  templateId?: string;
  subject?: string;
  bodyMarkdown?: string;
  fromName?: string;
  fromEmail?: string;
}

export interface SendSmsConfig {
  body: string;
}

export interface SendInAppConfig {
  title: string;
  body: string;
  ctaLabel?: string;
  ctaHref?: string;
}

export interface NotifyCsmConfig {
  message: string;
  /** Free-form CSM user id; defaults to tenant.accountManagerId. */
  userId?: string;
}

export interface AddTagConfig { tag: string }
export interface RemoveTagConfig { tag: string }
export interface MoveToPlanConfig { plan: "STARTER" | "GROWTH" | "PRO" | "ENTERPRISE" }
export interface ApplyCouponConfig { couponCode: string }
export interface WebhookOutConfig { url: string; method?: "POST" | "GET"; payloadTemplate?: string }

export interface BranchConfig {
  /**
   * Free-form expression evaluated against the enrollee + trigger payload.
   * Examples:
   *   "tenant.plan == 'GROWTH'"
   *   "payload.amount > 100"
   *   "tenant.adminTags includes 'pilot'"
   */
  condition: string;
  yesLabel?: string;
  noLabel?: string;
}

export interface WaitConfig {
  /** Either durationMinutes OR untilEvent must be set. */
  durationMinutes?: number;
  untilEvent?: string;
  /** Hard cap when waiting on event. */
  maxDurationMinutes?: number;
}

export interface SplitConfig {
  /** Each branch label gets a weight; weights sum to 100. */
  branches: { key: string; weight: number; label?: string }[];
}

export type StepConfig =
  | SendEmailConfig | SendSmsConfig | SendInAppConfig | NotifyCsmConfig
  | AddTagConfig    | RemoveTagConfig | MoveToPlanConfig | ApplyCouponConfig
  | WebhookOutConfig | BranchConfig | WaitConfig | SplitConfig;

/* ── Defaults / summary helpers ─────────────────────── */

export function defaultStepConfig(kind: SequenceStepKind): StepConfig {
  switch (kind) {
    case "SEND_EMAIL":   return { subject: "Hello {{firstName}}", bodyMarkdown: "Write your message here.\n\n[Open dashboard](https://flowtora.com/dashboard)" };
    case "SEND_SMS":     return { body: "Quick check-in from Flowtora — reply STOP to opt out." };
    case "SEND_IN_APP":  return { title: "We have a tip for you", body: "Try the new production board.", ctaLabel: "Open board", ctaHref: "/orders" };
    case "NOTIFY_CSM":   return { message: "Enrollee hit a milestone — follow up." };
    case "ADD_TAG":      return { tag: "engaged" };
    case "REMOVE_TAG":   return { tag: "cold" };
    case "MOVE_TO_PLAN": return { plan: "GROWTH" };
    case "APPLY_COUPON": return { couponCode: "WELCOME15" };
    case "WEBHOOK_OUT":  return { url: "https://example.com/hook", method: "POST" };
    case "BRANCH":       return { condition: "tenant.plan == 'GROWTH'", yesLabel: "Yes", noLabel: "No" };
    case "WAIT":         return { durationMinutes: 60 * 24 };
    case "SPLIT":        return { branches: [{ key: "A", weight: 50 }, { key: "B", weight: 50 }] };
  }
}

export function summarizeStep(kind: SequenceStepKind, config: StepConfig | unknown): string {
  if (!config || typeof config !== "object") return STEP_DESCRIPTION[kind];
  const c = config as Record<string, unknown>;
  switch (kind) {
    case "SEND_EMAIL":   return `Subject: "${String(c.subject ?? "(empty)").slice(0, 40)}"`;
    case "SEND_SMS":     return `SMS: "${String(c.body ?? "").slice(0, 50)}"`;
    case "SEND_IN_APP":  return `In-app: ${String(c.title ?? "")}`;
    case "NOTIFY_CSM":   return `Page CSM: ${String(c.message ?? "").slice(0, 50)}`;
    case "ADD_TAG":      return `Tag → ${String(c.tag ?? "")}`;
    case "REMOVE_TAG":   return `Untag ← ${String(c.tag ?? "")}`;
    case "MOVE_TO_PLAN": return `Plan → ${String(c.plan ?? "")}`;
    case "APPLY_COUPON": return `Coupon: ${String(c.couponCode ?? "")}`;
    case "WEBHOOK_OUT":  return `${String(c.method ?? "POST")} ${String(c.url ?? "")}`;
    case "BRANCH":       return `If: ${String(c.condition ?? "")}`;
    case "WAIT":
      if (typeof c.durationMinutes === "number") return `Wait ${formatMinutes(c.durationMinutes)}`;
      if (typeof c.untilEvent === "string")     return `Wait until "${c.untilEvent}"`;
      return "Wait";
    case "SPLIT": {
      const branches = Array.isArray(c.branches) ? c.branches as { key: string; weight: number }[] : [];
      return branches.map((b) => `${b.key} ${b.weight}%`).join(" · ");
    }
  }
}

function formatMinutes(m: number): string {
  if (m < 60) return `${m}m`;
  if (m < 60 * 24) return `${Math.round(m / 60)}h`;
  return `${Math.round(m / (60 * 24))}d`;
}

/** Branch arms a parent step exposes (for child step branchKey). */
export function branchArmsFor(kind: SequenceStepKind, config: StepConfig | unknown): string[] {
  if (kind === "BRANCH") {
    const c = (config ?? {}) as { yesLabel?: string; noLabel?: string };
    return [c.yesLabel ?? "yes", c.noLabel ?? "no"];
  }
  if (kind === "SPLIT") {
    const c = (config ?? {}) as { branches?: { key: string }[] };
    return Array.isArray(c.branches) ? c.branches.map((b) => b.key) : [];
  }
  return [];
}

/* ── Pre-built blueprints (cloned by createFromTemplate) ── */

export const PREBUILT_TEMPLATES: {
  name: string;
  description: string;
  category: string;
  triggerType: SequenceTriggerType;
  triggerConfig: Record<string, unknown>;
  blueprint: { kind: SequenceStepKind; title?: string; config: StepConfig; branchKey?: string }[];
}[] = [
  {
    name: "Onboarding (5 emails)",
    description: "Day 0 / 1 / 3 / 7 / 14 nudges to get a new shop fully set up.",
    category: "Onboarding",
    triggerType: "SIGNUP",
    triggerConfig: {},
    blueprint: [
      { kind: "SEND_EMAIL", title: "Day 0 · Welcome", config: { subject: "Welcome to Flowtora, {{firstName}}", bodyMarkdown: "Glad to have you. Here's how to set up your first quote." } },
      { kind: "WAIT",       title: "Wait 1 day",      config: { durationMinutes: 60 * 24 } },
      { kind: "SEND_EMAIL", title: "Day 1 · Branding", config: { subject: "Brand your storefront in 5 minutes", bodyMarkdown: "Logo + accent color + a custom domain — and you're live." } },
      { kind: "WAIT",       title: "Wait 2 days",     config: { durationMinutes: 60 * 48 } },
      { kind: "SEND_EMAIL", title: "Day 3 · Quotes",  config: { subject: "Send your first quote", bodyMarkdown: "Templates, options, approval links — start here." } },
      { kind: "WAIT",       title: "Wait 4 days",     config: { durationMinutes: 60 * 24 * 4 } },
      { kind: "SEND_EMAIL", title: "Day 7 · Production", config: { subject: "Move jobs through your shop", bodyMarkdown: "The production board lives here." } },
      { kind: "WAIT",       title: "Wait 7 days",     config: { durationMinutes: 60 * 24 * 7 } },
      { kind: "SEND_EMAIL", title: "Day 14 · Habits", config: { subject: "How established shops use Flowtora", bodyMarkdown: "Three patterns we see in shops 12+ months in." } },
    ],
  },
  {
    name: "Trial conversion (3)",
    description: "T-7 / T-3 / T-1 nudges to convert a trial.",
    category: "Conversion",
    triggerType: "TRIAL_ENDING",
    triggerConfig: { daysBefore: 7 },
    blueprint: [
      { kind: "SEND_EMAIL", title: "Trial ends in 7 days", config: { subject: "Your trial wraps up in a week", bodyMarkdown: "Pick a plan to keep your data + workflows." } },
      { kind: "WAIT",       title: "Wait 4 days",          config: { durationMinutes: 60 * 24 * 4 } },
      { kind: "BRANCH",     title: "Did they upgrade?",     config: { condition: "tenant.plan != 'STARTER'", yesLabel: "yes", noLabel: "no" } },
      { kind: "ADD_TAG",    title: "Tag converted",         config: { tag: "trial-converted" }, branchKey: "yes" },
      { kind: "SEND_EMAIL", title: "Trial ends in 3 days",  config: { subject: "3 days left — pick a plan", bodyMarkdown: "Quick links to the pricing page." }, branchKey: "no" },
      { kind: "WAIT",       title: "Wait 2 days",           config: { durationMinutes: 60 * 24 * 2 }, branchKey: "no" },
      { kind: "APPLY_COUPON", title: "Offer 15% off",       config: { couponCode: "TRIAL15" }, branchKey: "no" },
      { kind: "SEND_EMAIL", title: "Trial ends tomorrow",   config: { subject: "Last day — 15% off if you upgrade today", bodyMarkdown: "Coupon: TRIAL15." }, branchKey: "no" },
    ],
  },
  {
    name: "Win-back (4)",
    description: "Re-engage tenants inactive for 30+ days with a 4-email cadence.",
    category: "Win-back",
    triggerType: "DAYS_INACTIVE",
    triggerConfig: { days: 30 },
    blueprint: [
      { kind: "SEND_EMAIL", title: "We miss you",      config: { subject: "We miss you, {{firstName}}", bodyMarkdown: "What changed? We'd love to hear." } },
      { kind: "WAIT",       title: "Wait 5 days",      config: { durationMinutes: 60 * 24 * 5 } },
      { kind: "SEND_EMAIL", title: "What you missed",  config: { subject: "Three improvements you missed", bodyMarkdown: "We've shipped a lot since you left." } },
      { kind: "WAIT",       title: "Wait 7 days",      config: { durationMinutes: 60 * 24 * 7 } },
      { kind: "APPLY_COUPON", title: "Welcome back coupon", config: { couponCode: "WELCOMEBACK20" } },
      { kind: "SEND_EMAIL", title: "Welcome back · 20% off", config: { subject: "20% off if you come back this month", bodyMarkdown: "Your data is intact." } },
      { kind: "WAIT",       title: "Wait 5 days",      config: { durationMinutes: 60 * 24 * 5 } },
      { kind: "SEND_EMAIL", title: "Final goodbye",    config: { subject: "We'll archive your account in 30 days", bodyMarkdown: "If we don't hear from you we'll archive in 30 days. Easy reactivation." } },
    ],
  },
  {
    name: "Feature adoption",
    description: "Triggered the first time a tenant uses a key feature; nudges deeper usage.",
    category: "Adoption",
    triggerType: "FEATURE_FIRST_USE",
    triggerConfig: { featureKey: "production_board" },
    blueprint: [
      { kind: "SEND_IN_APP", title: "Tip · Drag to reorder", config: { title: "Pro tip", body: "Drag jobs between columns on the production board.", ctaLabel: "Open board", ctaHref: "/orders" } },
      { kind: "WAIT",        title: "Wait 1 day",            config: { durationMinutes: 60 * 24 } },
      { kind: "SEND_EMAIL",  title: "Common patterns",       config: { subject: "How shops actually use the production board", bodyMarkdown: "Three patterns from your peers." } },
      { kind: "WAIT",        title: "Wait 3 days",           config: { durationMinutes: 60 * 24 * 3 } },
      { kind: "ADD_TAG",     title: "Tag · production-active", config: { tag: "production-active" } },
    ],
  },
  {
    name: "Renewal reminder (3)",
    description: "30 / 7 / 1 day before annual renewal — confirm + cross-sell.",
    category: "Renewal",
    triggerType: "TRIAL_ENDING", // reuses the same shape — daysBefore based off subscription
    triggerConfig: { daysBefore: 30 },
    blueprint: [
      { kind: "SEND_EMAIL",  title: "Renewal in 30 days",    config: { subject: "Your annual plan renews in 30 days", bodyMarkdown: "Your plan auto-renews on …" } },
      { kind: "WAIT",        title: "Wait 23 days",          config: { durationMinutes: 60 * 24 * 23 } },
      { kind: "SEND_EMAIL",  title: "Renewal in 7 days",     config: { subject: "Renewal in a week", bodyMarkdown: "Anything you'd like to change?" } },
      { kind: "WAIT",        title: "Wait 6 days",           config: { durationMinutes: 60 * 24 * 6 } },
      { kind: "SEND_EMAIL",  title: "Renewal tomorrow",      config: { subject: "Your plan renews tomorrow", bodyMarkdown: "Receipt incoming." } },
      { kind: "NOTIFY_CSM",  title: "Notify CSM",            config: { message: "Tenant up for renewal — confirm details." } },
    ],
  },
];
