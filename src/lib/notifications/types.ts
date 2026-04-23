// Shared types for the notification system (M6 — platform-managed
// transactional templates). These live one level above the Prisma
// generated types because we want:
//   • a narrow, channel-agnostic "content shape" that both the DB row
//     and the code-side default conform to
//   • strongly-typed tokens without leaking Prisma's Json type to
//     callers
//   • a place to evolve the shape (add subheading, add locale
//     fallbacks) without touching every consumer

import type { NotificationChannel, NotificationStatus } from "@prisma/client";

export type NotificationCategory =
  | "auth"
  | "team"
  | "billing"
  | "support"
  | "activity";

// Structured fields that make up a renderable template. Both the
// DB row (NotificationTemplate) and the compile-time default
// (registry.defaultContent) satisfy this shape so the renderer is
// indifferent to the source.
export interface TemplateContent {
  subject: string;
  preheader?: string | null;
  headline: string;
  subheading?: string | null;
  body: string; // markdown-lite (see markdown.ts)
  ctaLabel?: string | null;
  ctaUrlToken?: string | null; // "{{verify_url}}" or an absolute URL
  footerNote?: string | null;
}

// Token registration metadata. Declared per-kind in registry.ts.
// `sample` values drive the admin preview so unresolved `{{…}}`
// never reaches a human. `type: "url"` affects escaping — url-typed
// tokens go through encodeURI rather than HTML escape when they
// land in href attributes.
export type TokenType = "string" | "url" | "number";

export interface TokenSpec {
  type: TokenType;
  sample: string; // realistic placeholder for preview + test sends
  required?: boolean;
  description?: string; // shown as help-text in the admin UI
}

export type TokenSchema = Record<string, TokenSpec>;
// Resolved tokens at send time. Accepts string|number|null so
// callers don't have to pre-stringify everything; the renderer
// coerces.
export type TokenValues = Record<string, string | number | null | undefined>;

// A full registration for one notification kind. The renderer reads
// `defaultContent` when no DB row exists; the dispatcher reads
// `isCritical` to lock the enabled toggle; the admin UI reads
// `tokens` + `category` + `description` to drive the editor.
export interface NotificationRegistration {
  kind: string; // "auth.email_verification"
  category: NotificationCategory;
  // Human name shown in the admin catalog — "Email verification".
  label: string;
  // One-line explanation shown under the label in the overview.
  description: string;
  // Kinds that, for compliance/user safety, can have their copy
  // edited but cannot be globally disabled. Auth + security +
  // payment_failed are the canonical examples.
  isCritical?: boolean;
  // Sort index within `category`. Lower = higher in the list.
  sortOrder?: number;
  // Channels this kind fires on. M1 only ships EMAIL; later
  // registrations can add IN_APP / SMS without schema changes.
  channels: NotificationChannel[];
  tokens: TokenSchema;
  // Per-channel code-side defaults. Channel keys mirror the enum.
  // The renderer falls back here when the DB row is missing.
  defaultContent: Partial<Record<NotificationChannel, TemplateContent>>;
}

// Result returned by the dispatcher so callers can log / branch
// without inspecting exceptions.
export interface DispatchResult {
  sent: boolean;
  reason?:
    | "disabled"
    | "unknown_kind"
    | "no_channel_content"
    | "missing_required_token"
    | "provider_error";
  providerMessageId?: string | null;
  // Resolved subject so audit logs + event rows can store the final
  // rendered headline, not the template with tokens.
  subject?: string;
}

// Re-exported for convenience so callers don't need two imports.
export type { NotificationChannel, NotificationStatus };
