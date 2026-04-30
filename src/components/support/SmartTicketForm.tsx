"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { openSupportTicket } from "@/app/actions/support";

// Smart ticket form for /support/new. Designed to feel less like a
// form and more like a guided report:
//
//   1. Category cards (visual choice, not a dropdown)
//   2. Severity picker (color-keyed, plain-language labels)
//   3. Single-line subject
//   4. Body textarea
//   5. "We auto-attached this context" panel (read-only)
//
// On submit, the captured browser/page context is appended as a
// structured postscript to the body so the platform team sees it
// immediately on the first message — no schema change needed.
//
// The page-of-origin is passed in via `from` query param (set by the
// floating Help FAB or any link). On mount we read window.location
// extras (user agent, viewport, timezone) and stash them in state.

type CategoryKey = "BUG" | "QUESTION" | "BILLING" | "FEATURE_REQUEST" | "OTHER";
type PriorityKey = "LOW" | "NORMAL" | "HIGH" | "URGENT";

interface CategoryDef {
  key: CategoryKey;
  label: string;
  hint: string;
  icon: string;
}
const CATEGORIES: CategoryDef[] = [
  { key: "BUG",             label: "Something's broken",      hint: "Errors, wrong numbers, blank screens",   icon: "🐞" },
  { key: "QUESTION",        label: "How do I…?",              hint: "Quick how-tos, walkthroughs",            icon: "💬" },
  { key: "BILLING",         label: "Billing & subscription",  hint: "Charges, plans, refunds",                icon: "💳" },
  { key: "FEATURE_REQUEST", label: "Feature request",         hint: "Something we should build",              icon: "✨" },
  { key: "OTHER",           label: "Other",                   hint: "Doesn't fit the buckets above",          icon: "•••" },
];

interface PriorityDef {
  key: PriorityKey;
  label: string;
  hint: string;
  fg: string;
  bg: string;
  border: string;
}
const PRIORITIES: PriorityDef[] = [
  { key: "LOW",    label: "Low",    hint: "Whenever you get to it",       fg: "var(--text-muted)",    bg: "var(--surface-2)",       border: "var(--border-default)" },
  { key: "NORMAL", label: "Normal", hint: "A response within a day or two", fg: "var(--text-default)",  bg: "var(--surface-2)",       border: "var(--border-default)" },
  { key: "HIGH",   label: "High",   hint: "Blocking work today",          fg: "var(--warning-fg)",    bg: "var(--warning-surface)", border: "var(--warning-fg)"     },
  { key: "URGENT", label: "Urgent", hint: "Shop is down, can't operate",  fg: "var(--danger-fg)",     bg: "var(--danger-surface)",  border: "var(--danger-fg)"      },
];

interface SmartTicketFormProps {
  slug: string;
  /** Page the user came from (passed via ?from=). Used for context. */
  fromPath: string | null;
  /** Initial category preselect — passed via ?kind= from the FAB. */
  initialCategory: CategoryKey;
}

export function SmartTicketForm({
  slug,
  fromPath,
  initialCategory,
}: SmartTicketFormProps) {
  const router = useRouter();
  const [category, setCategory] = React.useState<CategoryKey>(initialCategory);
  const [priority, setPriority] = React.useState<PriorityKey>("NORMAL");
  // Page 3 §Bug Volume by Module — fine-grained module tag the
  // platform-side report buckets by. Optional from the user's POV
  // (defaults to OTHER if they leave it).
  const [module_, setModule] = React.useState<string>("OTHER");
  const [subject, setSubject] = React.useState("");
  const [body, setBody] = React.useState("");
  const [pending, setPending] = React.useState(false);

  // Browser-only context. Captured once on mount; never re-rendered so
  // the textarea below stays stable.
  const [ctx, setCtx] = React.useState<TicketContext | null>(null);
  React.useEffect(() => {
    setCtx(captureContext(fromPath));
  }, [fromPath]);

  const submit = openSupportTicket.bind(null, slug);

  const onSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (pending) return;
    if (!subject.trim() || !body.trim()) return;

    const fd = new FormData();
    fd.set("subject", subject.trim());
    fd.set("category", category);
    fd.set("module", module_);
    fd.set("priority", priority);
    fd.set("body", composeBody(body, ctx));
    setPending(true);
    try {
      await submit(fd);
      // The action redirects on success; if we get here without a redirect,
      // assume success and bounce home. Errors land back on this page with
      // ?error= which the wrapping page surfaces.
      router.refresh();
    } catch {
      setPending(false);
    }
  };

  const submitDisabled = pending || subject.trim().length === 0 || body.trim().length === 0;

  return (
    <form onSubmit={onSubmit} className="space-y-6">
      {/* ── Category cards ──────────────────────────────────── */}
      <fieldset>
        <legend className="mb-2 text-sm font-semibold" style={{ color: "var(--text-default)" }}>
          What kind of help do you need?
        </legend>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {CATEGORIES.map((c) => {
            const active = c.key === category;
            return (
              <button
                key={c.key}
                type="button"
                onClick={() => setCategory(c.key)}
                aria-pressed={active}
                className="ts-focus flex items-start gap-3 rounded-lg p-3 text-left transition-colors"
                style={{
                  background: active ? "var(--accent-surface)" : "var(--surface-1)",
                  border: `1px solid ${active ? "var(--accent-primary)" : "var(--border-default)"}`,
                  boxShadow: active ? "var(--shadow-sm)" : undefined,
                }}
              >
                <span className="text-xl" aria-hidden>{c.icon}</span>
                <div className="min-w-0 flex-1">
                  <div
                    className="text-sm font-medium"
                    style={{ color: active ? "var(--accent-primary)" : "var(--text-default)" }}
                  >
                    {c.label}
                  </div>
                  <div className="mt-0.5 text-xs" style={{ color: "var(--text-muted)" }}>
                    {c.hint}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </fieldset>

      {/* ── Module ─────────────────────────────────────────── */}
      {category === "BUG" && (
        <fieldset>
          <legend className="mb-2 text-sm font-semibold" style={{ color: "var(--text-default)" }}>
            Which area is affected?
          </legend>
          <select
            value={module_}
            onChange={(e) => setModule(e.target.value)}
            className="ts-focus w-full rounded-lg border bg-transparent px-3 py-2 text-sm"
            style={{ background: "var(--surface-1)", borderColor: "var(--border-default)", color: "var(--text-default)" }}
          >
            <option value="BILLING">Billing</option>
            <option value="AUTH">Sign-in / accounts</option>
            <option value="PROOFS">Proofs</option>
            <option value="ORDERS">Orders</option>
            <option value="INVOICES">Invoices</option>
            <option value="QUOTES">Quotes</option>
            <option value="PRODUCTS">Products / pricing</option>
            <option value="REPORTS">Reports</option>
            <option value="INTEGRATIONS">Integrations</option>
            <option value="PORTAL">Customer portal</option>
            <option value="EMAIL">Email delivery</option>
            <option value="ADMIN">Admin / settings</option>
            <option value="OTHER">Something else</option>
          </select>
        </fieldset>
      )}

      {/* ── Severity ─────────────────────────────────────────── */}
      <fieldset>
        <legend className="mb-2 text-sm font-semibold" style={{ color: "var(--text-default)" }}>
          How urgent is it?
        </legend>
        <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
          {PRIORITIES.map((p) => {
            const active = p.key === priority;
            return (
              <button
                key={p.key}
                type="button"
                onClick={() => setPriority(p.key)}
                aria-pressed={active}
                className="ts-focus flex flex-col items-start gap-1 rounded-lg p-3 text-left transition-colors"
                style={{
                  background: active ? p.bg : "var(--surface-1)",
                  border: `1px solid ${active ? p.border : "var(--border-default)"}`,
                  boxShadow: active ? "var(--shadow-sm)" : undefined,
                }}
              >
                <span
                  className="text-sm font-semibold"
                  style={{ color: active ? p.fg : "var(--text-default)" }}
                >
                  {p.label}
                </span>
                <span className="text-xs" style={{ color: "var(--text-muted)" }}>
                  {p.hint}
                </span>
              </button>
            );
          })}
        </div>
      </fieldset>

      {/* ── Subject ──────────────────────────────────────────── */}
      <label className="block">
        <span className="mb-1 block text-sm font-semibold" style={{ color: "var(--text-default)" }}>
          One-line summary
        </span>
        <input
          type="text"
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          required
          maxLength={200}
          placeholder={
            category === "BUG"
              ? 'e.g. "Tax rate not applying on out-of-state quotes"'
              : category === "BILLING"
              ? 'e.g. "Charged twice this month"'
              : category === "FEATURE_REQUEST"
              ? 'e.g. "Bulk update customer contact info"'
              : 'e.g. "How do I add a second installer?"'
          }
          className="ts-focus w-full rounded-md px-3 py-2 text-sm outline-none"
          style={{
            background: "var(--surface-1)",
            border: "1px solid var(--border-default)",
            color: "var(--text-default)",
          }}
        />
      </label>

      {/* ── Body ─────────────────────────────────────────────── */}
      <label className="block">
        <span className="mb-1 block text-sm font-semibold" style={{ color: "var(--text-default)" }}>
          What's happening?
        </span>
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          required
          rows={8}
          maxLength={8000}
          placeholder={[
            category === "BUG"
              ? "Walk us through what you were trying to do and what happened instead."
              : "Add as much detail as you can. The more specific, the faster we can help.",
            "",
            "• What screen were you on?",
            "• What did you click?",
            "• What did you see (error, wrong number, blank page)?",
          ].join("\n")}
          className="ts-focus w-full rounded-md px-3 py-2 text-sm outline-none"
          style={{
            background: "var(--surface-1)",
            border: "1px solid var(--border-default)",
            color: "var(--text-default)",
          }}
        />
        <div className="mt-1 flex items-center justify-between text-xs">
          <span style={{ color: "var(--text-muted)" }}>
            Markdown links (`[text](url)`) work in replies.
          </span>
          <span className="tabular-nums" style={{ color: "var(--text-faint)" }}>
            {body.length} / 8000
          </span>
        </div>
      </label>

      {/* ── Auto-captured context ─────────────────────────────── */}
      <ContextPanel ctx={ctx} />

      {/* ── Submit row ───────────────────────────────────────── */}
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs" style={{ color: "var(--text-muted)" }}>
          You'll get an email + in-app notification when we reply.
        </p>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => router.push(`/t/${slug}/support`)}
            className="ts-focus rounded-md px-4 py-2 text-sm"
            style={{ color: "var(--text-muted)" }}
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={submitDisabled}
            className="ts-focus rounded-md px-4 py-2 text-sm font-medium transition-opacity disabled:opacity-50"
            style={{ background: "var(--accent-primary)", color: "var(--accent-fg)" }}
          >
            {pending ? "Submitting…" : "Submit ticket"}
          </button>
        </div>
      </div>
    </form>
  );
}

// ────────────────────────────────────────────────────────────────
// Context capture
// ────────────────────────────────────────────────────────────────

interface TicketContext {
  fromPath: string | null;
  url: string;
  userAgent: string;
  viewport: string;
  timezone: string;
  locale: string;
  capturedAt: string;
}

function captureContext(fromPath: string | null): TicketContext {
  if (typeof window === "undefined") {
    return {
      fromPath,
      url: "",
      userAgent: "",
      viewport: "",
      timezone: "",
      locale: "",
      capturedAt: "",
    };
  }
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || "";
  return {
    fromPath,
    url: window.location.href,
    userAgent: navigator.userAgent,
    viewport: `${window.innerWidth}×${window.innerHeight}`,
    timezone: tz,
    locale: navigator.language || "",
    capturedAt: new Date().toISOString(),
  };
}

// Append a structured context block to the message body so the
// platform team sees the full picture in the first message — no need
// to ask "what page were you on, what browser?" before triage.
function composeBody(body: string, ctx: TicketContext | null): string {
  if (!ctx) return body;
  const lines = [
    body.trim(),
    "",
    "---",
    "Context (auto-attached):",
    ctx.fromPath ? `• Reported from page: ${ctx.fromPath}` : null,
    ctx.url      ? `• Full URL: ${ctx.url}` : null,
    ctx.userAgent ? `• Browser: ${shortUserAgent(ctx.userAgent)}` : null,
    ctx.viewport  ? `• Viewport: ${ctx.viewport}` : null,
    ctx.timezone  ? `• Timezone: ${ctx.timezone}` : null,
    ctx.locale    ? `• Locale: ${ctx.locale}` : null,
    ctx.capturedAt ? `• Captured at: ${ctx.capturedAt}` : null,
  ].filter(Boolean);
  return lines.join("\n");
}

// Compact UA — keeps the body readable while preserving the bits
// support actually needs (browser family + OS).
function shortUserAgent(ua: string): string {
  const browser = ua.match(/(Chrome|Firefox|Safari|Edge)\/([\d.]+)/);
  const os =
    /Windows NT/.test(ua) ? "Windows" :
    /Mac OS X/.test(ua)   ? "macOS"   :
    /Linux/.test(ua)      ? "Linux"   :
    /iPhone|iPad/.test(ua) ? "iOS"    :
    /Android/.test(ua)    ? "Android" : "Unknown OS";
  if (browser) return `${browser[1]} ${browser[2].split(".")[0]} on ${os}`;
  return `${os}`;
}

function ContextPanel({ ctx }: { ctx: TicketContext | null }) {
  return (
    <fieldset
      className="rounded-lg p-4"
      style={{
        background: "var(--surface-2)",
        border: "1px solid var(--border-subtle)",
      }}
    >
      <legend className="px-1 text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>
        Auto-attached
      </legend>
      <p className="text-xs" style={{ color: "var(--text-muted)" }}>
        We'll include this with your ticket so support doesn't have to ask.
      </p>
      <ul className="mt-2 space-y-1 text-xs" style={{ color: "var(--text-default)" }}>
        <ContextItem label="Page" value={ctx?.fromPath ?? <em style={{ color: "var(--text-faint)" }}>this page</em>} />
        <ContextItem label="Browser" value={ctx ? shortUserAgent(ctx.userAgent) : "—"} />
        <ContextItem label="Viewport" value={ctx?.viewport ?? "—"} />
        <ContextItem label="Timezone" value={ctx?.timezone ?? "—"} />
      </ul>
    </fieldset>
  );
}

function ContextItem({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <li className="grid grid-cols-[80px_1fr] gap-2">
      <span style={{ color: "var(--text-muted)" }}>{label}</span>
      <span className="break-all font-mono">{value}</span>
    </li>
  );
}
