// Registry of every notification kind the platform can emit.
//
// Why it exists:
//   • The dispatcher needs to know which tokens are valid for each
//     kind so it can validate at publish time and resolve at send.
//   • The admin UI reads this at render time to list categories and
//     surface per-kind token chips.
//   • The `isCritical` flag gates the enabled toggle so admins can't
//     accidentally silence an auth or security email.
//   • Every kind has a compile-time default — the fallback when no
//     DB row exists or the row is still DRAFT.
//
// Adding a new kind:
//   1. Add a default in defaults.ts.
//   2. Register it here with its category, description, tokens.
//   3. Seed a DB row in prisma/seed-notifications.ts (M2 adds this).
//   4. Call sendNotification({ kind: "…", tokens: { … } }) from code.

import type { NotificationRegistration, TokenSchema } from "./types";
import * as defaults from "./defaults";

// Common tokens available to every kind — resolved from the
// NotificationBrand singleton at render time, not passed by callers.
// Listed here so they don't have to be repeated per-kind and so the
// admin UI can surface them as "global tokens" separately.
export const GLOBAL_TOKENS: TokenSchema = {
  product_name: { type: "string", sample: "Flowtora", description: "Platform product name (brand settings)." },
  support_email: { type: "string", sample: "help@flowtora.com", description: "Support email (brand settings)." },
  current_year: { type: "number", sample: "2026", description: "Four-digit year at send time." },
};

const REGISTRY: NotificationRegistration[] = [
  // ── Auth ────────────────────────────────────────────────────────
  {
    kind: "auth.email_verification",
    category: "auth",
    label: "Email verification",
    description:
      "Sent on signup and when a user requests a fresh confirmation link.",
    isCritical: true,
    sortOrder: 10,
    channels: ["EMAIL"],
    tokens: {
      user_name: { type: "string", sample: "Alex Chen" },
      verification_url: { type: "url", sample: "https://flowtora.com/verify/abc123", required: true },
    },
    defaultContent: { EMAIL: defaults.defaultEmailVerification },
  },
  {
    kind: "auth.email_change_confirmation",
    category: "auth",
    label: "Email change confirmation",
    description:
      "Sent to the NEW address when a user changes the email on their account.",
    isCritical: true,
    sortOrder: 20,
    channels: ["EMAIL"],
    tokens: {
      user_name: { type: "string", sample: "Alex Chen" },
      verification_url: { type: "url", sample: "https://flowtora.com/verify/abc123", required: true },
    },
    defaultContent: { EMAIL: defaults.defaultEmailChangeConfirmation },
  },
  {
    kind: "auth.password_reset",
    category: "auth",
    label: "Password reset",
    description:
      "Sent when a user requests a password reset from the login page.",
    isCritical: true,
    sortOrder: 30,
    channels: ["EMAIL"],
    tokens: {
      user_name: { type: "string", sample: "Alex" },
      reset_url: { type: "url", sample: "https://flowtora.com/reset/abc", required: true },
      expires_minutes: { type: "number", sample: "60" },
    },
    defaultContent: { EMAIL: defaults.defaultPasswordReset },
  },
  {
    kind: "auth.security_alert",
    category: "auth",
    label: "Security alert",
    description:
      "Sent after sensitive account events (password changed, 2FA enabled, email change requested).",
    isCritical: true,
    sortOrder: 40,
    channels: ["EMAIL"],
    tokens: {
      event_label: { type: "string", sample: "Your password was changed", required: true },
      when: { type: "string", sample: "Apr 22, 2026 at 3:14 PM" },
      ip: { type: "string", sample: "203.0.113.42" },
      user_agent: { type: "string", sample: "Chrome 142 on macOS" },
    },
    defaultContent: { EMAIL: defaults.defaultSecurityAlert },
  },
  {
    kind: "auth.welcome",
    category: "auth",
    label: "Welcome email",
    description:
      "Optional onboarding email. Not wired up yet — will send N minutes after signup in a later milestone.",
    sortOrder: 50,
    channels: ["EMAIL"],
    tokens: {
      user_name: { type: "string", sample: "Alex" },
      workspace_name: { type: "string", sample: "Acme Signs" },
      workspace_url: { type: "url", sample: "https://flowtora.com/t/acme/dashboard", required: true },
    },
    defaultContent: { EMAIL: defaults.defaultWelcome },
  },

  // ── Team ────────────────────────────────────────────────────────
  {
    kind: "team.invite_received",
    category: "team",
    label: "Team invitation",
    description:
      "Sent to a prospective member when someone invites them to a workspace.",
    sortOrder: 10,
    channels: ["EMAIL"],
    tokens: {
      inviter_name: { type: "string", sample: "Jamie Park" },
      workspace_name: { type: "string", sample: "Acme Signs" },
      accept_url: { type: "url", sample: "https://flowtora.com/invite/abc", required: true },
    },
    defaultContent: { EMAIL: defaults.defaultInviteReceived },
  },

  // ── Billing ─────────────────────────────────────────────────────
  {
    kind: "billing.trial_started",
    category: "billing",
    label: "Trial started",
    description:
      "Sent when a new tenant lands on a free trial. Currently manually triggered; wire-up in M4.",
    sortOrder: 10,
    channels: ["EMAIL"],
    tokens: {
      user_name: { type: "string", sample: "Alex" },
      plan_name: { type: "string", sample: "Pro", required: true },
      trial_days: { type: "number", sample: "14" },
      trial_ends_at: { type: "string", sample: "May 6, 2026" },
      workspace_url: { type: "url", sample: "https://flowtora.com/t/acme/dashboard" },
    },
    defaultContent: { EMAIL: defaults.defaultTrialStarted },
  },
  {
    kind: "billing.trial_ending_soon",
    category: "billing",
    label: "Trial ending soon",
    description:
      "Sent 3 days before a trial ends, reminding the user to add billing details.",
    sortOrder: 20,
    channels: ["EMAIL"],
    tokens: {
      user_name: { type: "string", sample: "Alex" },
      plan_name: { type: "string", sample: "Pro", required: true },
      days_remaining: { type: "number", sample: "3", required: true },
      trial_ends_at: { type: "string", sample: "May 6, 2026" },
      billing_url: { type: "url", sample: "https://flowtora.com/t/acme/settings/billing", required: true },
    },
    defaultContent: { EMAIL: defaults.defaultTrialEndingSoon },
  },
  {
    kind: "billing.subscription_confirmation",
    category: "billing",
    label: "Subscription confirmation",
    description:
      "Sent after a successful checkout — confirms the new subscription and next invoice date.",
    sortOrder: 30,
    channels: ["EMAIL"],
    tokens: {
      plan_name: { type: "string", sample: "Pro", required: true },
      billing_cycle: { type: "string", sample: "monthly" },
      amount: { type: "string", sample: "$49.00" },
      next_billing_date: { type: "string", sample: "May 22, 2026" },
      billing_url: { type: "url", sample: "https://flowtora.com/t/acme/settings/billing", required: true },
    },
    defaultContent: { EMAIL: defaults.defaultSubscriptionConfirmation },
  },
  {
    kind: "billing.payment_succeeded",
    category: "billing",
    label: "Payment succeeded",
    description:
      "Sent each time Stripe reports a successful invoice payment after the first subscription charge.",
    sortOrder: 40,
    channels: ["EMAIL"],
    tokens: {
      plan_name: { type: "string", sample: "Pro" },
      amount: { type: "string", sample: "$49.00", required: true },
      invoice_number: { type: "string", sample: "INV-2026-0042" },
      next_billing_date: { type: "string", sample: "May 22, 2026" },
      invoice_url: { type: "url", sample: "https://stripe.com/invoice/abc" },
    },
    defaultContent: { EMAIL: defaults.defaultPaymentSucceeded },
  },
  {
    kind: "billing.payment_failed",
    category: "billing",
    label: "Payment failed",
    description:
      "Sent when Stripe reports a failed charge — prompts the user to update their card.",
    isCritical: true,
    sortOrder: 50,
    channels: ["EMAIL"],
    tokens: {
      user_name: { type: "string", sample: "Alex" },
      plan_name: { type: "string", sample: "Pro" },
      amount: { type: "string", sample: "$49.00", required: true },
      billing_url: { type: "url", sample: "https://flowtora.com/t/acme/settings/billing", required: true },
    },
    defaultContent: { EMAIL: defaults.defaultPaymentFailed },
  },
  {
    kind: "billing.subscription_canceled",
    category: "billing",
    label: "Subscription canceled",
    description:
      "Sent when a subscription ends (admin cancel, user cancel, or terminal payment failure).",
    sortOrder: 60,
    channels: ["EMAIL"],
    tokens: {
      plan_name: { type: "string", sample: "Pro", required: true },
      canceled_at: { type: "string", sample: "April 22, 2026" },
      billing_url: { type: "url", sample: "https://flowtora.com/t/acme/settings/billing" },
    },
    defaultContent: { EMAIL: defaults.defaultSubscriptionCanceled },
  },
  {
    kind: "billing.plan_changed",
    category: "billing",
    label: "Plan changed",
    description:
      "Sent on any plan upgrade or downgrade — confirms the new plan and next billing date.",
    sortOrder: 70,
    channels: ["EMAIL"],
    tokens: {
      previous_plan_name: { type: "string", sample: "Starter" },
      new_plan_name: { type: "string", sample: "Pro", required: true },
      billing_cycle: { type: "string", sample: "monthly" },
      changed_at: { type: "string", sample: "April 22, 2026" },
      next_billing_date: { type: "string", sample: "May 22, 2026" },
      billing_url: { type: "url", sample: "https://flowtora.com/t/acme/settings/billing" },
    },
    defaultContent: { EMAIL: defaults.defaultPlanChanged },
  },

  // ── Support ─────────────────────────────────────────────────────
  {
    kind: "support.staff_reply",
    category: "support",
    label: "Staff reply on support ticket",
    description:
      "Notifies a customer when a staff member posts a public reply to their ticket.",
    sortOrder: 10,
    channels: ["EMAIL"],
    tokens: {
      ticket_subject: { type: "string", sample: "Invoice is stuck in draft", required: true },
      staff_name: { type: "string", sample: "Jamie" },
      reply_preview: { type: "string", sample: "Thanks for flagging — we've rolled out a fix…", required: true },
      workspace_name: { type: "string", sample: "Acme Signs" },
      ticket_url: { type: "url", sample: "https://flowtora.com/t/acme/support/123", required: true },
    },
    defaultContent: { EMAIL: defaults.defaultSupportStaffReply },
  },

  // ── Activity ─────────────────────────────────────────────────────
  {
    kind: "activity.reminder_digest",
    category: "activity",
    label: "Reminder digest",
    description:
      "Fired by the reminders cron for tripped quote/proof/invoice/task reminders.",
    sortOrder: 10,
    channels: ["EMAIL"],
    tokens: {
      reminder_title: { type: "string", sample: "Invoice #INV-2026-0042 is overdue", required: true },
      reminder_detail: { type: "string", sample: "Due April 20. Balance $1,240." },
      reminder_kind: { type: "string", sample: "Invoice" },
      reminder_url: { type: "url", sample: "https://flowtora.com/t/acme/invoices/abc", required: true },
      workspace_name: { type: "string", sample: "Acme Signs" },
    },
    defaultContent: { EMAIL: defaults.defaultReminderDigest },
  },
];

const byKind = new Map<string, NotificationRegistration>();
for (const r of REGISTRY) byKind.set(r.kind, r);

export function getRegistration(kind: string): NotificationRegistration | null {
  return byKind.get(kind) ?? null;
}

export function listRegistrations(): NotificationRegistration[] {
  return REGISTRY.slice();
}

// Union-type literal of all registered kinds. Rebuilt by hand for now
// because TS can't infer string-literal unions from a runtime array —
// callers that want strict typing import from here rather than passing
// raw strings.
export type NotificationKind =
  | "auth.email_verification"
  | "auth.email_change_confirmation"
  | "auth.password_reset"
  | "auth.security_alert"
  | "auth.welcome"
  | "team.invite_received"
  | "billing.trial_started"
  | "billing.trial_ending_soon"
  | "billing.subscription_confirmation"
  | "billing.payment_succeeded"
  | "billing.payment_failed"
  | "billing.subscription_canceled"
  | "billing.plan_changed"
  | "support.staff_reply"
  | "activity.reminder_digest";
