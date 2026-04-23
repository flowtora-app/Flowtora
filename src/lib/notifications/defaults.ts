// Compile-time default content for every notification kind.
//
// Every `NotificationRegistration` in registry.ts points at one of these
// `TemplateContent` objects as its `defaultContent[EMAIL]` value. The
// dispatcher falls back to these whenever:
//   • the DB row is missing (fresh install, or the admin deleted it)
//   • the DB row exists but `status !== PUBLISHED` (still a draft)
//   • the DB row is DISABLED but `isCritical` forces a send
//
// So these defaults are the load-bearing copy. Editing a default here
// changes the baseline for every deploy. Admins can override any of
// them from /platform/notifications, but the defaults remain the
// "factory" that `Reset to default` restores.
//
// Token references use `{{name}}` and resolve through tokens.ts.
// For URL contexts inside HTML (which the branded layout handles for
// us because the CTA uses `ctaUrlToken` as an href), the token is
// passed through sanitizeUrl. Nothing in this file needs `{{url:…}}`
// because the layout always places ctaUrlToken in an href context.

import type { TemplateContent } from "./types";

// ── Auth ────────────────────────────────────────────────────────

export const defaultEmailVerification: TemplateContent = {
  subject: "Confirm your email to activate Flowtora",
  preheader:
    "Confirm your email to finish setting up Flowtora — takes one click.",
  headline: "One click to activate your account",
  subheading:
    "You're almost in. Confirm your email to finish setting up your Flowtora workspace.",
  body:
    "Hi {{user_name}},\n\n" +
    "Thanks for signing up. Tap the button below to verify it's really you and finish activating your Flowtora account.",
  ctaLabel: "Confirm my email",
  ctaUrlToken: "{{verification_url}}",
  footerNote:
    "**Didn't sign up for Flowtora?** You can safely ignore this email — no account will be created without this confirmation. For your security, this link expires in 24 hours and can only be used once.",
};

export const defaultEmailChangeConfirmation: TemplateContent = {
  subject: "Confirm your new email address",
  preheader:
    "Confirm the new email on your Flowtora account — link expires in 24 hours.",
  headline: "Confirm your new email",
  subheading:
    "We need to verify this address before we can move your Flowtora sign-in to it.",
  body:
    "Hi {{user_name}},\n\n" +
    "Tap the button below to confirm that this inbox belongs to you. We won't move your sign-in email until you do.",
  ctaLabel: "Confirm new email",
  ctaUrlToken: "{{verification_url}}",
  footerNote:
    "**Didn't request an email change?** You can safely ignore this — your current email and sign-in stay exactly as they are. Link expires in 24 hours.",
};

export const defaultPasswordReset: TemplateContent = {
  subject: "Reset your Flowtora password",
  preheader: "Someone asked to reset your password. Link expires soon.",
  headline: "Reset your Flowtora password",
  subheading:
    "Someone — hopefully you — requested a password reset. Tap below to pick a new one.",
  body:
    "Hi {{user_name}},\n\n" +
    "Click the button below to choose a new password. If you didn't request this, you can ignore this email — your account stays secure.",
  ctaLabel: "Reset my password",
  ctaUrlToken: "{{reset_url}}",
  footerNote:
    "This link expires in {{expires_minutes}} minutes and can only be used once. If you didn't ask for a password reset, ignore this email — no change was made.",
};

export const defaultSecurityAlert: TemplateContent = {
  subject: "Flowtora security notice: {{event_label}}",
  preheader: "A change to your account was just made.",
  headline: "Security notice",
  subheading:
    "We're letting you know about a change to your Flowtora account.",
  body:
    "**{{event_label}}**\n\n" +
    "When: {{when}}\n" +
    "IP: {{ip}}\n" +
    "Device: {{user_agent}}",
  ctaLabel: null,
  ctaUrlToken: null,
  footerNote:
    "**If this wasn't you**, reset your password immediately and contact support. Your account's session has already been bumped so any active logins are invalidated.",
};

export const defaultWelcome: TemplateContent = {
  subject: "Welcome to Flowtora",
  preheader: "Your shop is set up. Here's how to get your first win today.",
  headline: "Welcome, {{user_name}}",
  subheading:
    "Your {{workspace_name}} workspace is ready. Here's the 60-second tour.",
  body:
    "You just joined Flowtora — a calmer way to run a sign or print shop.\n\n" +
    "Most new workspaces do three things in their first day:\n\n" +
    "**1.** Add your first customer or import a spreadsheet.\n" +
    "**2.** Create a quote and send it with one click.\n" +
    "**3.** Turn the accepted quote into a job and watch it move through production.\n\n" +
    "When you're ready to customize billing, team, and automation, everything lives under Settings.",
  ctaLabel: "Open my workspace",
  ctaUrlToken: "{{workspace_url}}",
  footerNote:
    "Questions? Just reply to this email — a real human will get back to you.",
};

// ── Team ────────────────────────────────────────────────────────

export const defaultInviteReceived: TemplateContent = {
  subject: "You're invited to {{workspace_name}}",
  preheader: "{{inviter_name}} wants to add you to their Flowtora workspace.",
  headline: "You're invited to {{workspace_name}}",
  subheading: null,
  body:
    "{{inviter_name}} invited you to join **{{workspace_name}}** on Flowtora.\n\n" +
    "Accepting takes about ten seconds — you'll set a password and land in the workspace.",
  ctaLabel: "Accept the invitation",
  ctaUrlToken: "{{accept_url}}",
  footerNote:
    "This invitation expires in 7 days. If you weren't expecting it, you can safely ignore this email.",
};

// ── Billing ─────────────────────────────────────────────────────

export const defaultTrialStarted: TemplateContent = {
  subject: "Your Flowtora trial has started",
  preheader: "{{trial_days}} days on us — here's what to try first.",
  headline: "Your {{plan_name}} trial is live",
  subheading:
    "You have {{trial_days}} days to run Flowtora on the full {{plan_name}} plan.",
  body:
    "Hi {{user_name}},\n\n" +
    "Your trial of Flowtora **{{plan_name}}** started today and runs through **{{trial_ends_at}}**. No card is charged during the trial.\n\n" +
    "If you love it, you can add payment details any time from Settings → Subscription. If you don't, the account quietly pauses at the end of the trial.",
  ctaLabel: "Open my workspace",
  ctaUrlToken: "{{workspace_url}}",
  footerNote:
    "Want help getting set up? Reply to this email and we'll walk you through it.",
};

export const defaultTrialEndingSoon: TemplateContent = {
  subject: "Your Flowtora trial ends in {{days_remaining}} days",
  preheader: "Add billing details to keep everything running.",
  headline: "Your trial ends in {{days_remaining}} days",
  subheading:
    "Your {{plan_name}} trial wraps up on {{trial_ends_at}}. Here's how to keep going.",
  body:
    "Hi {{user_name}},\n\n" +
    "You've been on Flowtora **{{plan_name}}** for a couple of weeks now. In {{days_remaining}} days the trial ends — adding a card from Settings → Subscription keeps your workspace running without interruption.\n\n" +
    "No pressure: if you'd rather not continue, the workspace simply pauses and your data stays safe for 30 days in case you change your mind.",
  ctaLabel: "Add billing details",
  ctaUrlToken: "{{billing_url}}",
  footerNote:
    "Questions about plans or pricing? Just hit reply — we're happy to help.",
};

export const defaultSubscriptionConfirmation: TemplateContent = {
  subject: "You're on Flowtora {{plan_name}}",
  preheader: "Your subscription is active. Here's the receipt.",
  headline: "You're on Flowtora {{plan_name}}",
  subheading: "Thanks for subscribing — here's what just happened.",
  body:
    "Your subscription to **Flowtora {{plan_name}}** is now active on the {{billing_cycle}} cycle.\n\n" +
    "The next invoice of **{{amount}}** is scheduled for **{{next_billing_date}}**. You can update payment details, switch plans, or cancel at any time from Settings → Subscription.",
  ctaLabel: "Manage subscription",
  ctaUrlToken: "{{billing_url}}",
  footerNote:
    "Need a receipt or invoice copy? The billing settings page has your full history.",
};

export const defaultPaymentSucceeded: TemplateContent = {
  subject: "Payment received — thank you",
  preheader: "Your Flowtora {{plan_name}} payment went through.",
  headline: "Payment received",
  subheading: null,
  body:
    "Thanks for your payment of **{{amount}}** toward your Flowtora {{plan_name}} subscription.\n\n" +
    "Invoice **{{invoice_number}}** has been marked paid. Your next scheduled invoice is **{{next_billing_date}}**.",
  ctaLabel: "View invoice",
  ctaUrlToken: "{{invoice_url}}",
  footerNote:
    "A copy of this receipt is always available under Settings → Subscription.",
};

export const defaultPaymentFailed: TemplateContent = {
  subject: "Action needed: Flowtora payment failed",
  preheader:
    "We couldn't charge your card for Flowtora {{plan_name}} — update details to avoid interruption.",
  headline: "Your payment didn't go through",
  subheading:
    "Your card was declined for the **{{amount}}** {{plan_name}} invoice.",
  body:
    "Hi {{user_name}},\n\n" +
    "We tried to charge **{{amount}}** against your card on file for your Flowtora {{plan_name}} subscription, and the charge was declined.\n\n" +
    "Stripe will automatically retry over the next few days, but updating your payment details now is the fastest way to keep your workspace running without interruption.",
  ctaLabel: "Update payment method",
  ctaUrlToken: "{{billing_url}}",
  footerNote:
    "If the card on file is correct, your bank may have flagged the charge — reaching out to them usually clears it. Reply to this email if you'd like help.",
};

export const defaultSubscriptionCanceled: TemplateContent = {
  subject: "Your Flowtora subscription has ended",
  preheader: "Your {{plan_name}} subscription has been canceled.",
  headline: "Your subscription has ended",
  subheading: null,
  body:
    "Your Flowtora **{{plan_name}}** subscription was canceled on {{canceled_at}}.\n\n" +
    "Your workspace and data remain available for 30 days in case you change your mind — just re-subscribe from the same billing page and everything picks up where it left off.",
  ctaLabel: "Re-subscribe",
  ctaUrlToken: "{{billing_url}}",
  footerNote:
    "We'd love feedback on why you canceled — a quick reply helps us improve Flowtora for everyone.",
};

export const defaultPlanChanged: TemplateContent = {
  subject: "Your Flowtora plan has changed",
  preheader: "You're now on {{new_plan_name}}.",
  headline: "You're now on {{new_plan_name}}",
  subheading:
    "Your plan switched from {{previous_plan_name}} to {{new_plan_name}} on {{changed_at}}.",
  body:
    "Your subscription changed to **Flowtora {{new_plan_name}}** on the {{billing_cycle}} cycle.\n\n" +
    "Any proration appears on your next invoice, scheduled for **{{next_billing_date}}**. Plan features update immediately — no action needed on your end.",
  ctaLabel: "View subscription",
  ctaUrlToken: "{{billing_url}}",
  footerNote:
    "If this wasn't you, contact support immediately and we'll roll it back.",
};

// ── Support ─────────────────────────────────────────────────────

export const defaultSupportStaffReply: TemplateContent = {
  subject: "Support reply: {{ticket_subject}}",
  preheader: "{{staff_name}} replied to your support ticket.",
  headline: "{{staff_name}} replied to your ticket",
  subheading:
    "Re: **{{ticket_subject}}** — for workspace {{workspace_name}}.",
  body: "{{reply_preview}}",
  ctaLabel: "Open the ticket",
  ctaUrlToken: "{{ticket_url}}",
  footerNote: "Workspace: {{workspace_name}}",
};

// ── Activity (reminders cron, generic) ──────────────────────────

export const defaultReminderDigest: TemplateContent = {
  subject: "{{reminder_title}}",
  preheader: "{{reminder_kind}} reminder for {{workspace_name}}.",
  headline: "{{reminder_title}}",
  subheading: null,
  body: "{{reminder_detail}}",
  ctaLabel: "Open in Flowtora",
  ctaUrlToken: "{{reminder_url}}",
  footerNote: "{{reminder_kind}} reminder · {{workspace_name}}",
};
