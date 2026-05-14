// Help Center registry.
//
// One entry per admin page: what it's for, who uses it, how to use the
// key features, and gotchas. Edit values in this file to update the
// rendered help content — no DB needed.

import type { IconName } from "@/components/shell/icons";

export type HelpSection = {
  /** Heading rendered above the body. */
  heading: string;
  /** Plain-text body (paragraphs separated by blank lines). */
  body: string;
};

export type HelpEntry = {
  /** Stable slug used as the URL key. */
  slug: string;
  /** What it shows in the sidebar list. */
  label: string;
  /** Icon next to the label. */
  icon: IconName;
  /** Group id, must match a HELP_GROUPS entry below. */
  group: HelpGroupId;
  /** Spec page number (or null for cross-cutting topics). */
  page?: number;
  /** Where the actual admin surface lives. */
  route: string;
  /** One-sentence summary shown in the sidebar + at the top of the detail pane. */
  summary: string;
  /** Permissions a user needs to interact with the page. Informational only. */
  permissions?: string[];
  /** Audience — bullets describing who typically owns this page day-to-day. */
  audience?: string[];
  /** Structured help body — section heading + 1-3 paragraphs each. */
  sections: HelpSection[];
  /** Quick "How do I …" Q&A pairs. */
  faq?: { q: string; a: string }[];
};

export type HelpGroupId =
  | "observability" | "tenants" | "access" | "billing"
  | "catalog" | "operations" | "marketing" | "integrations"
  | "security" | "system" | "configuration" | "personal";

export const HELP_GROUPS: { id: HelpGroupId; label: string; description: string }[] = [
  { id: "observability", label: "Observability",
    description: "Dashboards, activity log, reports — the windows into what the platform is doing right now." },
  { id: "tenants", label: "Tenants",
    description: "Tenant lifecycle: onboarding, health, churn watch, impersonation for support." },
  { id: "access", label: "Access & Audit",
    description: "Users, roles, teams, invitations, sessions, audit trail." },
  { id: "billing", label: "Billing & Revenue",
    description: "Subscriptions, invoices, payments, refunds, plans, coupons, tax, payouts." },
  { id: "catalog", label: "Catalog",
    description: "The master product, material, equipment, pricing-formula, and template libraries seeded into new tenants." },
  { id: "operations", label: "Operations",
    description: "Production health, support tickets, knowledge base, announcements, feature requests, bug reports." },
  { id: "marketing", label: "Marketing",
    description: "Landing pages, campaigns, drip sequences, referrals, affiliates, SEO, lead inbox." },
  { id: "integrations", label: "Integrations",
    description: "Third-party connectors, developer API + webhook endpoints, marketplace, SSO." },
  { id: "security", label: "Security & Compliance",
    description: "Security findings, compliance program, privacy requests, backups, incidents, network rules." },
  { id: "system", label: "System & Infrastructure",
    description: "Service status, queues, email deliverability, storage, database, rate limits, flags, env vars, logs." },
  { id: "configuration", label: "Configuration",
    description: "Platform-wide settings: branding, localization, webhooks, custom domains, legal documents." },
  { id: "personal", label: "Personal",
    description: "Your own admin profile, notification preferences, API keys, keyboard shortcuts." },
];

export const HELP_ENTRIES: HelpEntry[] = [
  // ── Personal pages (the 4 we just shipped) ────────────────
  {
    slug: "my-profile",
    label: "My Profile",
    icon: "User",
    group: "personal",
    page: 72,
    route: "/platform/me/profile",
    summary: "Personal profile, security posture, sessions, connected accounts, UI preferences, and recovery codes.",
    audience: ["Every signed-in admin (self only — other admins can't edit yours)"],
    permissions: ["Self-only — no special permission required"],
    sections: [
      { heading: "What this page is for",
        body: "This is your personal home base. Every admin has one. It collects everything that's about *you* — display name and contact info, MFA setup, sessions on your devices, theme and density preferences, and the recovery codes you'll need if you lose your phone.\n\nOther admins cannot see or edit your profile from here. If an admin needs to be onboarded, banned, or have a role changed, that lives on the Users page (Access & Audit → Users) instead." },
      { heading: "Tabs at a glance",
        body: "Profile — name, pronouns, title, department, phone, Slack handle, timezone, language, date/time format, bio. Save once and it propagates to every page that shows your identity.\n\nSecurity — change your password (we check it against breached-credential lists), set up TOTP MFA (Authy, 1Password, Google Authenticator), or sign out everywhere if you suspect a device is compromised.\n\nSessions — every device currently signed in as you. Each row shows the browser, IP, and last-active time. Sign out everywhere from the Security tab if anything looks wrong.\n\nConnected Accounts — external identities (Google, GitHub, Slack) linked to your account. Useful if your team signs in via SSO.\n\nPreferences — UI tuning. Theme (light/dark/system), density, sidebar default, default landing page after sign-in, dashboard auto-refresh, currency display, beta-feature opt-in.\n\nRecovery Codes — 10 single-use codes used to recover the account if you lose your MFA device. Regenerate to invalidate the old set." },
      { heading: "Why it matters",
        body: "Two reasons. First: forced MFA is a hard requirement for the SUPER_ADMIN and SITE_MANAGER roles. If you can't get past the MFA setup, you'll be locked out on next sign-in.\n\nSecond: changing your password rotates your sessionVersion. Every other device signs you out within a minute. That's intentional — if you suspect compromise, just change the password and you've kicked everyone else." },
    ],
    faq: [
      { q: "I lost my MFA device. Now what?",
        a: "Use any of the 10 recovery codes you saved from the Recovery Codes tab. Each code is single-use. Once you're in, disable MFA from the Security tab, reset it on a new device, and regenerate new recovery codes." },
      { q: "How do I change my primary email?",
        a: "The primary email is your sign-in identity and is locked here for safety. Contact a SUPER_ADMIN to change it via the Users page (Access & Audit → Users)." },
      { q: "Why is the password field rejecting my password?",
        a: "We check new passwords against the HIBP breached-passwords list. If yours has been seen in a public breach (even years ago), it's rejected. Pick something else." },
    ],
  },
  {
    slug: "my-notifications",
    label: "My Notifications",
    icon: "Megaphone",
    group: "personal",
    page: 73,
    route: "/platform/me/notifications",
    summary: "Per-channel notification preferences. Pick the frequency you want for each event category across email, in-app, Slack, SMS, and push.",
    audience: ["Every signed-in admin (self only)"],
    permissions: ["Self-only"],
    sections: [
      { heading: "The matrix",
        body: "Rows are event categories (Tenants, Billing, Support, Security, System, Marketing, Personal). Columns are channels (Email, In-app, Slack, SMS, Push). Each cell is a dropdown: Real-time / Hourly digest / Daily digest / Weekly digest / Off.\n\nDefaults: every cell starts at Off, except a few critical ones (Security alerts → Email Real-time, Billing failures → Email Real-time). Once you save a cell, that override sticks." },
      { heading: "Quiet hours, Slack, SMS, digests",
        body: "Below the matrix you can set Quiet hours (start/end times, 24-hour format) which mute every channel during the window — useful for nights and weekends.\n\nSlack workspace + channel pairs your Flowtora identity with a specific Slack DM or channel for the Slack column.\n\nSMS phone needs to be verified before SMS notifications fire. Email digest schedule controls when the daily/weekly digests get sent (e.g. \"Mon/Wed/Fri 08:00\")." },
      { heading: "Snooze",
        body: "Need a focused stretch? Click 1h / 4h / Until tomorrow / 1 week to silence every channel for that window. Click Unsnooze to lift it. Snooze respects critical security alerts — those always punch through." },
    ],
    faq: [
      { q: "Why am I still getting Security emails when I set them to Off?",
        a: "Some alerts are designated 'critical' and always fire — your password being changed, a new admin role being granted to you, sign-ins from new countries. Those override the matrix and Snooze." },
      { q: "Can I import these preferences from another teammate?",
        a: "Not yet. Preferences are stored per-user. A team-wide notification policy is on the roadmap." },
    ],
  },
  {
    slug: "my-api-keys",
    label: "My API Keys",
    icon: "Shield",
    group: "personal",
    page: 74,
    route: "/platform/me/api-keys",
    summary: "Personal API tokens scoped to your role's permissions. Use for CLI/CI/local scripts that act as you.",
    audience: ["Engineers, SRE, anyone scripting against the admin API"],
    permissions: ["Self-only. Org admins can revoke any admin's keys from the Users page."],
    sections: [
      { heading: "What a personal token is",
        body: "A 32-byte token (rendered as fk_...) that the API accepts as proof you signed the request. Personal tokens inherit a *subset* of your role's permissions — you cannot mint a token that does more than you can.\n\nThe full token is only revealed once at creation. We store a SHA-256 hash; if you lose the secret, rotate the token to mint a fresh one." },
      { heading: "Creating a token",
        body: "Pick a name (\"CI deployment\", \"Local dev\"), pick which scopes you need (must be a subset of your role), set an expiry (90 days is a sensible default; 0 = never, not recommended), and optionally set an IP allowlist for tokens that should only fire from a known machine (CI runner, office VPN).\n\nWhen you submit, the page redirects with the full token in the URL hash — copy it into your password manager or CI secret store immediately. Refresh the page and it's gone forever." },
      { heading: "Rotating + revoking",
        body: "Rotate keeps the same scopes + IP allowlist but mints a new secret and immediately revokes the old one. Use it when a CI machine is compromised, when a teammate leaves, or just on a 90-day schedule.\n\nRevoke marks the token REVOKED without minting a replacement. The token row stays in the table for audit but it can no longer authenticate." },
    ],
    faq: [
      { q: "What's the difference between this and the platform-wide API Keys & Webhooks page?",
        a: "Those are platform-level / tenant-level integration keys (third-party services receiving webhooks, etc.). Personal tokens here are scoped to your own admin identity and never expose data outside your role." },
      { q: "I can see my token's prefix in the table. Is that a security problem?",
        a: "No. The prefix is the first 11 characters and is meant to be a label, like a short identifier. Logs and dashboards use it to identify which token made a call without exposing the full secret." },
    ],
  },
  {
    slug: "keyboard-shortcuts",
    label: "Keyboard Shortcuts",
    icon: "Sparkles",
    group: "personal",
    page: 75,
    route: "/platform/me/shortcuts",
    summary: "Reference for every admin shortcut, plus per-user rebinding.",
    audience: ["Power users who want to never touch the mouse"],
    permissions: ["Self-only"],
    sections: [
      { heading: "Where shortcuts live",
        body: "Press ? on any admin page to pop up a cheat sheet with your current bindings. This page is the full reference + the place to remap.\n\nThe registry has 43 actions across 9 groups: Navigation, Search, Create, Tables, Detail pages, Forms, Notifications, Help, Account. Each one has a default that ships with the product; your personal overrides replace the default for you only." },
      { heading: "Customizing a binding",
        body: "Click Edit on any row, type the new combo (e.g. \"Cmd+Shift+P\" or \"G then D\" for a chord), save. Bad bindings (conflicts, undefined keys) are flagged before save.\n\nReset wipes your override and falls back to the default. The Reset button only appears once you've set a custom binding." },
    ],
    faq: [
      { q: "Can I disable a shortcut entirely?",
        a: "Set the binding to \"None\" (literally type the word). The dispatcher treats it as a no-op for your user." },
      { q: "Do shortcuts work across the tenant app too?",
        a: "No. These bindings only apply to the platform admin surface (/platform/*). Tenant-side shortcuts have their own (smaller) registry." },
    ],
  },

  // ── Configuration pages (Pages 65-71) ────────────────────
  {
    slug: "branding",
    label: "Branding & White-Label",
    icon: "Palette",
    group: "configuration",
    page: 66,
    route: "/platform/settings/branding",
    summary: "Flowtora's own brand kit + reseller / white-label profiles + per-tenant brand application.",
    audience: ["Marketing Ops, Brand Admin, Founder, Resellers' CSMs"],
    permissions: ["branding.read (everyone), branding.manage (Marketing/Developer/Admin), branding.tenant_manage (CSM)"],
    sections: [
      { heading: "Three layers — brand, profile, tenant",
        body: "The Brand tab is Flowtora's own paint job: logos, color palette, fonts, the email footer that goes on every transactional message. Editing here changes how *Flowtora-branded* surfaces look — the marketing site, the default login page, default email footer.\n\nThe Profiles tab is a registry of *reseller* and *white-label* paint jobs. Each profile has its own logos, colors, fonts, domain, email from-name, login-page copy, and a 'removeFlowtoraMentions' flag for true white-label. PrintShop Pro, Signaire, etc. live here.\n\nThe Tenants tab applies a profile to a specific tenant. You can override individual fields (primary color, login headline) per tenant without forking the whole profile. The Powered-By policy on the Brand tab decides whether tenants get the 'Powered by Flowtora' badge." },
      { heading: "Editing flow",
        body: "Tweak something on the Brand tab → save → check the live preview card (typeset heading, body, primary/accent buttons). The same primitives feed the email footer, login page, and PWA install screen.\n\nFor a new reseller: create a Profile, fill in their assets, optionally set a custom domain + from-name. Activate the profile, then go to Tenants and apply it to their accounts. Want one tenant to override the reseller's primary color? Edit just that row." },
    ],
  },
  {
    slug: "localization",
    label: "Localization",
    icon: "Globe",
    group: "configuration",
    page: 67,
    route: "/platform/settings/localization",
    summary: "Locales (BCP 47), currencies (ISO 4217), translation keys, glossary, FX policy, and per-locale stats.",
    audience: ["Localization Manager (Marketing), in-house translators, founder"],
    permissions: ["localization.read (everyone), localization.manage (Marketing), localization.translate (Support Lead)"],
    sections: [
      { heading: "Seven tabs, one source of truth",
        body: "Languages: register each locale (en-US, es-MX, ar-SA, etc.) with its regional formats (date pattern, decimal separator, paper size, phone format, address template) and an RTL flag.\n\nCurrencies & FX: ISO 4217 codes with FX source (ECB / Open Exchange Rates / Fixer / Manual), rate, optional manual override, margin %, and an Active/Inactive switch.\n\nRegional Formats: read-only roll-up of every locale's format settings. Edit on the Languages tab.\n\nTranslation Editor: split-pane editor. Left is the key list (filter by module + search); right is the per-locale text input. We auto-extract {variable} placeholders from the source and refuse to save a translation that's missing any of them.\n\nString Stats: per-locale coverage bar with TRANSLATED / PENDING / OUTDATED / NEEDS_REVIEW counts. Re-runs the rollup after every save.\n\nGlossary: brand terms (Flowtora, AI, CRM) with do-not-translate flags + per-locale alternates for ambiguous terms (Quote → Cotización, Devis, Angebot).\n\nSettings: ICU MessageFormat toggle, fallback chain (en-US is always the source), pseudo-localization for visual QA, FX auto-update cron." },
      { heading: "When source text changes",
        body: "Edit a key's English source on the Translation Editor → save. Every existing translation for that key auto-flips to OUTDATED (its sourceHash no longer matches). Translators see the OUTDATED state in their queue and re-translate or confirm.\n\nThis is intentional: a translation that was correct yesterday is suspect the moment the English changed underneath it." },
    ],
  },
  {
    slug: "notifications-admin",
    label: "Notification Templates",
    icon: "Megaphone",
    group: "configuration",
    page: 68,
    route: "/platform/notifications",
    summary: "Author + version transactional templates (email/SMS/push/in-app) with approval workflow, A/B variants, and per-locale rows.",
    audience: ["Marketing Ops, Lifecycle Manager, Founder"],
    permissions: ["notifications.read (everyone), notifications.manage (Marketing Ops, Lifecycle), notifications.review (sign-off)"],
    sections: [
      { heading: "Three views into the catalog",
        body: "Categories (legacy): the old per-category grouping. Still useful for quick scans.\n\nTable (Page 68 spec): the canonical view — Template / Trigger / Channels / Locales / Approval / Active / Sent 24h / Open % / Click % / Last edit. Sortable + filterable.\n\nTree by trigger: groups templates by trigger taxonomy (Tenant Lifecycle, Subscription, Invoice, Payment, User, Job, Marketing, System, Security, Support)." },
      { heading: "The approval workflow",
        body: "Every template walks: Draft → In Review → Approved → Live. Draft is just an author's working copy. Submit for review (notifications.manage) hands it to a reviewer. Approve (notifications.review) marks it ready. Promote to Live (notifications.review) flips publish state — that's the moment users start seeing the new copy.\n\nA reviewer can also Reject with a required reason, which sends the template back to Draft. The full transition history is preserved in the Review Timeline card.\n\nThis is one of the few places where 'one person can't ship the thing' is enforced by the schema. Marketing Ops can author; only Lifecycle Manager (or higher) can promote to Live." },
      { heading: "Variants, locales, metrics",
        body: "A/B Variants: each template's own content row is implicit Variant A. Add a B-Variant with a sampling weight (0–100). The dispatcher picks at send time. Variant stats are cached on the row so the page renders without a separate query.\n\nLocales: kind+channel+locale is unique. Provisioning a new locale clones the English content as a starting point — translators edit from there. Each locale has its own approval workflow.\n\n30-day Metrics: sent / delivered / opened / clicked / bounced / unsubscribed rolled up per template per day. Powers the sparkline on the editor + the columns on the Table view." },
    ],
  },
  {
    slug: "webhooks-catalog",
    label: "Webhooks Catalog",
    icon: "Pipeline",
    group: "configuration",
    page: 69,
    route: "/platform/settings/webhooks",
    summary: "Developer-facing catalog of every webhook event Flowtora emits — schemas, sample payloads, receiver code, version history.",
    audience: ["Engineers integrating against Flowtora, DevRel, Support"],
    permissions: ["webhooks.read (everyone), webhooks.manage (Developer/Admin) for test-send"],
    sections: [
      { heading: "What the catalog is for",
        body: "Customers building on Flowtora need to know what events we emit, what each payload looks like, and how to receive them safely. This page is the canonical source of all of that.\n\nIt is a READ-ONLY catalog for non-developers. The only write surface is the Test Send form on each event detail page (gated by webhooks.manage)." },
      { heading: "Per-event detail",
        body: "Click any event in the sidebar tree (grouped by category — Tenant Lifecycle, Subscription, Invoice, etc.).\n\nHeader: stability badge (Stable / Beta / Deprecated), since-version, latest schema version.\n\nSchema: the event envelope ({ id, type, created, data }) with `data` shape shown.\n\nSample payload: realistic JSON that exactly matches the schema.\n\nTrigger conditions: when this event fires and what guarantees we give (at-least-once delivery, idempotency notes, ordering — events are NOT ordered across types).\n\nReceiver code: drop-in HTTP handlers in Node / Python / Ruby / PHP / Go / curl with HMAC-SHA256 signature verification.\n\nSubscribers: top 10 active endpoints subscribed to this event + last-delivery timestamp.\n\nVersion history: changelog per schema version with breaking-change badges." },
      { heading: "Test Send",
        body: "Engineers can fire a sample payload to any active endpoint (even if it's not currently subscribed to that event). The envelope is marked `\"test\": true` so receivers can route test events away from production handlers. The delivery goes through the same retry/backoff path as real events — it's a true integration test." },
    ],
  },
  {
    slug: "domains",
    label: "Domains",
    icon: "Globe",
    group: "configuration",
    page: 70,
    route: "/platform/settings/domains",
    summary: "Custom-domain provisioning for tenants: DNS records, SSL issuance, apex / subdomain helpers, certificate management.",
    audience: ["SRE, CSMs, Support (re-verify only)"],
    permissions: ["domains.read (everyone), domains.manage (SRE/Admin), domains.verify (Support re-verify)"],
    sections: [
      { heading: "The wizard, step by step",
        body: "On the Custom Domains tab, click 'Add custom domain'. Pick a tenant, type the domain (validated as a real FQDN), choose APEX vs SUBDOMAIN.\n\nStep 1 — DNS: the page generates the exact record type + value the customer needs to add at their DNS provider. CNAME for subdomains; ALIAS/ANAME (or A as fallback) for apex.\n\nStep 2 — Verification: a TXT record proves ownership. Once both records resolve, status flips from PENDING_DNS → VERIFYING → ISSUING_SSL.\n\nStep 3 — SSL: we trigger ACME with Let's Encrypt by default. Customers can pick ZeroSSL, Google Trust Services, or upload a paid cert. ACME challenge can be HTTP-01 (file) or DNS-01 (TXT).\n\nStep 4 — Activation: mark as the tenant's primary domain, configure redirect-from-www, HSTS, force-https." },
      { heading: "The five tabs",
        body: "Custom Domains: the main table + wizard.\n\nDNS Templates: copy-able TXT/CNAME records for verification + setup. Edit if your platform endpoint changes.\n\nSSL Certificates: every cert across every domain. Filter by issuer, expiry, status.\n\nApex Helpers: provider-specific instructions for Cloudflare, Route 53, GoDaddy, Namecheap, Squarespace. Markdown bodies, edit-in-place.\n\nSettings: default issuer, ACME account email, CA fallback chain, HSTS defaults, cert revocation procedure." },
    ],
  },
  {
    slug: "legal",
    label: "Legal Documents",
    icon: "Scale",
    group: "configuration",
    page: 71,
    route: "/platform/settings/legal",
    summary: "Versioned editor for ToS / Privacy / DPA / SLA with approval pipeline, tenant acceptance tracking, and per-locale translations.",
    audience: ["Legal, General Counsel, Compliance (read), Support (read)"],
    permissions: ["legal.read (everyone), legal.write (edit drafts), legal.publish (Counsel sign-off), legal.acceptance.read (audit trail)"],
    sections: [
      { heading: "Six tabs",
        body: "Documents: the catalog of every legal doc we maintain — ToS, Privacy, AUP, DPA, Sub-Processor Addendum, SLA, Cookie Policy, Refund Policy, MSA, Affiliate Agreement, etc.\n\nVersions: per-document version history. Each version walks Draft → Legal Review → Counsel Sign-Off → Published. The Markdown editor supports placeholders ({{platform_name}}, {{effective_date}}, {{company_name}}, {{jurisdiction}}) that get substituted at render time.\n\nAcceptance Tracking: audit log of every clickwrap acceptance — user, tenant, IP, user-agent, method, timestamp. Gated by legal.acceptance.read.\n\nLocales: per-language translations of each doc with completeness percent and sync-from-version indicator.\n\nMandatory Re-acceptance: activate a banner that forces specific tenants (by plan or ID) to accept a new version within a grace period. Optional enforce-block toggle.\n\nSettings: jurisdiction, governing law, arbitration provider, venue, effective-date offset days, cookie banner copy." },
      { heading: "Approval rigor",
        body: "Two roles, two responsibilities. legal.write can edit and submit. legal.publish can approve and promote.\n\nThe write role authors a draft and submits for review. The publish role reviews, approves, then promotes to PUBLISHED — this is the version tenants see in clickwrap.\n\nRejection requires a reason and bounces the draft back to the author. The full transition timeline is preserved in the version's audit metadata." },
    ],
    faq: [
      { q: "What happens to tenants on an old version when we publish a new one?",
        a: "Nothing automatically. Their acceptance for v1 is still on file. To force them to accept v2, activate a Mandatory Re-acceptance campaign on the new version with a grace period and (optionally) an enforce-block flag." },
      { q: "Can the same person submit AND approve?",
        a: "Technically yes if they have both permissions. Best practice is to assign legal.write to legal staff and legal.publish to General Counsel only — separation of duties." },
    ],
  },

  // ── Cross-cutting (not page-specific) ────────────────────
  {
    slug: "platform-settings",
    label: "Platform Settings",
    icon: "Settings",
    group: "configuration",
    page: 65,
    route: "/platform/settings/general",
    summary: "Platform-wide identity (name, tagline, support email), default timezone/currency, business hours, signup/trial policy, session policy.",
    audience: ["Founder, Site Manager, SRE"],
    permissions: ["system.read_settings (everyone), system.write_settings (Site Manager/Developer)"],
    sections: [
      { heading: "What lives here",
        body: "This is the platform's identity card. Anything that's true for all tenants and all users defaults from here: support email, tagline, mailing address, default timezone for new tenants, default currency, system-wide banners, public-signup toggle, default trial length.\n\nIt's a singleton — there's only one row. Every change writes an audit event into the PlatformSettingsChange history visible at the bottom of the page." },
      { heading: "Sections",
        body: "Identity: platform name, tagline, support/sales/press emails, mailing address, phone.\n\nDefaults: timezone, language, currency, date/time format, first day of week, measurement system.\n\nBusiness hours: per-weekday schedule + a list of holidays new tenants inherit.\n\nMaintenance: read-only mode toggle, ETA message, IP allowlist (for SRE access during maintenance).\n\nSignup: public signup toggle, default trial length, require-card-for-trial flag, default signup plan, disposable-email blocker.\n\nSession + MFA: admin session lifetime, idle timeout, max concurrent sessions, force-MFA-for-admins toggle.\n\nCommunication: default sender name, default reply-to, system banner copy + variant + expiration.\n\nAudit: retention days, PII anonymization window.\n\nFeature defaults: AI quotes, realtime collab, etc. — applied to brand-new tenants." },
    ],
  },
];

/* ── Indexed lookup helpers ──────────────────────────────── */

export function getEntry(slug: string): HelpEntry | undefined {
  return HELP_ENTRIES.find((e) => e.slug === slug);
}

export function entriesByGroup(): Map<HelpGroupId, HelpEntry[]> {
  const map = new Map<HelpGroupId, HelpEntry[]>();
  for (const g of HELP_GROUPS) map.set(g.id, []);
  for (const e of HELP_ENTRIES) {
    map.get(e.group)?.push(e);
  }
  // Sort within each group by label.
  for (const list of map.values()) list.sort((a, b) => a.label.localeCompare(b.label));
  return map;
}

export function searchEntries(query: string): HelpEntry[] {
  const q = query.toLowerCase().trim();
  if (!q) return [];
  return HELP_ENTRIES.filter((e) => {
    if (e.label.toLowerCase().includes(q)) return true;
    if (e.summary.toLowerCase().includes(q)) return true;
    if (e.route.toLowerCase().includes(q)) return true;
    if (e.sections.some((s) => s.heading.toLowerCase().includes(q) || s.body.toLowerCase().includes(q))) return true;
    if (e.faq?.some((f) => f.q.toLowerCase().includes(q) || f.a.toLowerCase().includes(q))) return true;
    return false;
  });
}
