"use server";

// Phase 5 — marketing lead-capture actions.
//
// Every public form on the marketing site pipes through a server
// action in this file. The actions themselves are thin: parse + validate
// → `recordLead()` → return form state. All the policy (dedup, rate
// limit, IP hashing, CRM forwarding) lives in `lib/marketing/leads.ts`.
//
// Shape: each action takes `(prev, formData)` so the client can call
// `useActionState()` and show inline field errors / success panels
// without spinning up a full form library.

import { headers } from "next/headers";
import { z } from "zod";
import { recordLead, hashIp, extractAttribution } from "@/lib/marketing/leads";

// ── Shared types ──

export interface InquiryState {
  ok: boolean;
  message?: string;
  fieldErrors?: Partial<Record<"name" | "email" | "company" | "role" | "employees" | "message", string>>;
}

export interface DemoRequestState {
  ok: boolean;
  message?: string;
  fieldErrors?: Partial<Record<
    | "name"
    | "email"
    | "company"
    | "role"
    | "employees"
    | "preferredTime"
    | "timezone"
    | "message",
    string
  >>;
}

export interface NewsletterState {
  ok: boolean;
  message?: string;
  fieldError?: string;
}

// ── Schemas ──
// Kept strict: we'd rather flag a garbage submission than store it.
// Honeypot field `website` must be empty — bots fill it, real users
// don't see it.

const EMPLOYEE_ENUM = z.enum(["1-5", "6-25", "26-100", "100+"]).optional();

const inquirySchema = z.object({
  name:      z.string().min(2, "Tell us your name.").max(120),
  email:     z.string().email("That doesn't look like a valid email."),
  company:   z.string().min(1, "What's your company called?").max(160),
  role:      z.string().max(120).optional().or(z.literal("")),
  employees: EMPLOYEE_ENUM.or(z.literal("")),
  message:   z.string().min(10, "A sentence or two — what are you hoping to solve?").max(4000),
  website:   z.string().max(0).optional(), // honeypot
});

const demoSchema = z.object({
  name:          z.string().min(2, "Tell us your name.").max(120),
  email:         z.string().email("That doesn't look like a valid email."),
  company:       z.string().min(1, "What's your company called?").max(160),
  role:          z.string().max(120).optional().or(z.literal("")),
  employees:     EMPLOYEE_ENUM.or(z.literal("")),
  preferredTime: z.enum(["morning", "afternoon", "evening", "flexible"], {
    errorMap: () => ({ message: "Pick a time window that usually works." }),
  }),
  timezone:      z.string().min(1, "We need your timezone to propose times.").max(80),
  businessType:  z.enum(["SIGN_SHOP", "PRINT_SHOP", "HYBRID", "OTHER"]).optional().or(z.literal("")),
  message:       z.string().max(4000).optional().or(z.literal("")),
  website:       z.string().max(0).optional(),
});

const newsletterSchema = z.object({
  email:   z.string().email("That doesn't look like a valid email."),
  website: z.string().max(0).optional(),
});

// ── Helpers ──

async function gatherRequestMeta() {
  const h = await headers();
  // Next's header helper does not expose request IP. Trust the platform
  // proxy headers (Vercel/Fly/AWS all set these). Fall back to null if
  // none are present — better to drop the rate-limit signal than to
  // hash a garbage value.
  const ip =
    h.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    h.get("x-real-ip") ||
    h.get("cf-connecting-ip") ||
    null;
  return {
    ipHash: hashIp(ip),
    userAgent: h.get("user-agent")?.slice(0, 500) ?? null,
  };
}

function fieldErrorsFrom<E extends Record<string, string>>(zErr: z.ZodError): Partial<E> {
  const out: Record<string, string> = {};
  for (const issue of zErr.issues) {
    const path = issue.path[0];
    if (typeof path === "string" && path !== "website") {
      // Only keep the first error per field; the form shows one.
      if (!out[path]) out[path] = issue.message;
    }
  }
  return out as Partial<E>;
}

// ── /contact form ──

export async function submitInquiry(
  _prev: InquiryState,
  formData: FormData,
): Promise<InquiryState> {
  const parsed = inquirySchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    return {
      ok: false,
      message: "Please fix the highlighted fields and try again.",
      fieldErrors: fieldErrorsFrom<NonNullable<InquiryState["fieldErrors"]>>(parsed.error),
    };
  }

  // Honeypot trip — return "success" silently so the bot doesn't retry.
  if (parsed.data.website) return { ok: true, message: "Thanks — we'll be in touch." };

  const meta = await gatherRequestMeta();
  const attr = extractAttribution(formData, "/contact");

  await recordLead({
    kind: "INQUIRY",
    email: parsed.data.email,
    name: parsed.data.name,
    company: parsed.data.company,
    role: parsed.data.role || null,
    teamSize: parsed.data.employees || null,
    message: parsed.data.message,
    ...attr,
    ...meta,
  });

  return {
    ok: true,
    message:
      "Thanks — we've received your note. Someone from our team will reach out within one business day.",
  };
}

// ── /book-demo form ──

export async function submitDemoRequest(
  _prev: DemoRequestState,
  formData: FormData,
): Promise<DemoRequestState> {
  const parsed = demoSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    return {
      ok: false,
      message: "Please fix the highlighted fields and try again.",
      fieldErrors: fieldErrorsFrom<NonNullable<DemoRequestState["fieldErrors"]>>(parsed.error),
    };
  }
  if (parsed.data.website) return { ok: true, message: "Booked." };

  const meta = await gatherRequestMeta();
  const attr = extractAttribution(formData, "/book-demo");

  await recordLead({
    kind: "DEMO",
    email: parsed.data.email,
    name: parsed.data.name,
    company: parsed.data.company,
    role: parsed.data.role || null,
    teamSize: parsed.data.employees || null,
    preferredTime: parsed.data.preferredTime,
    timezone: parsed.data.timezone,
    businessType: parsed.data.businessType || null,
    message: parsed.data.message || null,
    ...attr,
    ...meta,
  });

  return {
    ok: true,
    message:
      "Booked — we'll confirm a specific time by email within one business day. Check your inbox shortly.",
  };
}

// ── Footer newsletter ──

export async function submitNewsletter(
  _prev: NewsletterState,
  formData: FormData,
): Promise<NewsletterState> {
  const parsed = newsletterSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    return {
      ok: false,
      fieldError:
        parsed.error.issues[0]?.message ?? "Please enter a valid email.",
    };
  }
  if (parsed.data.website) return { ok: true, message: "Subscribed." };

  const meta = await gatherRequestMeta();
  const attr = extractAttribution(formData, "/newsletter");

  await recordLead({
    kind: "NEWSLETTER",
    email: parsed.data.email,
    ...attr,
    ...meta,
  });

  return {
    ok: true,
    message: "You're in — thanks for following along. Unsubscribe any time.",
  };
}
