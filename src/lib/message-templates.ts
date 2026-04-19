import type { MessageTemplateKind } from "@prisma/client";

// Phase 14 Slice D — message template helpers.
//
// A template's subject + body can reference bits of the entities involved in
// the send with `{{path.to.field}}` placeholders. The placeholder list is
// intentionally short: we're filling in canned customer updates, not building
// a marketing automation engine.

export type TemplateBag = {
  tenant?:   { name?: string | null };
  customer?: { name?: string | null; email?: string | null };
  contact?:  { firstName?: string | null; lastName?: string | null };
  quote?:    { number?: string | null; total?: string | null };
  order?:    { number?: string | null; dueDate?: string | null };
  proof?:    { version?: number | string | null };
  invoice?:  { number?: string | null; total?: string | null; balance?: string | null; dueDate?: string | null };
  install?:  { scheduledAt?: string | null };
  user?:     { name?: string | null };
};

// Flatten the bag into a `dot.path → value` lookup. Null / undefined values
// stay out so missing fields surface as "{{customer.email}}" in the preview
// (rather than an empty string that hides the problem).
function flatten(bag: TemplateBag): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [ns, fields] of Object.entries(bag)) {
    if (!fields || typeof fields !== "object") continue;
    for (const [key, value] of Object.entries(fields as Record<string, unknown>)) {
      if (value == null) continue;
      out[`${ns}.${key}`] = String(value);
    }
  }
  return out;
}

const PLACEHOLDER_RE = /\{\{\s*([a-zA-Z][\w]*(?:\.[a-zA-Z][\w]*)+)\s*\}\}/g;

// Replace every `{{path}}` that we have a value for. Leave unknown / missing
// ones untouched so the sender can spot them in the preview before sending.
export function renderTemplate(text: string, bag: TemplateBag): string {
  const map = flatten(bag);
  return text.replace(PLACEHOLDER_RE, (whole, path) => {
    const val = map[path];
    return val != null ? val : whole;
  });
}

// Enumerate every placeholder used by a template. Used by the editor UI
// to warn "this template references {{quote.number}} but you're sending it
// from a customer page without a quote in context".
export function extractPlaceholders(text: string): string[] {
  const found = new Set<string>();
  for (const match of text.matchAll(PLACEHOLDER_RE)) {
    found.add(match[1]);
  }
  return [...found].sort();
}

// The full list of supported placeholders — surfaced as help text in the
// template editor. Keep this in sync with `TemplateBag`.
export const TEMPLATE_VARIABLES: { path: string; description: string }[] = [
  { path: "tenant.name",         description: "Your shop's name" },
  { path: "customer.name",       description: "Customer name" },
  { path: "customer.email",      description: "Customer email" },
  { path: "contact.firstName",   description: "Primary contact first name" },
  { path: "contact.lastName",    description: "Primary contact last name" },
  { path: "quote.number",        description: "Quote number (e.g. Q-000123)" },
  { path: "quote.total",         description: "Quote total" },
  { path: "order.number",        description: "Order number" },
  { path: "order.dueDate",       description: "Order due date" },
  { path: "proof.version",       description: "Proof version number" },
  { path: "invoice.number",      description: "Invoice number" },
  { path: "invoice.total",       description: "Invoice total" },
  { path: "invoice.balance",     description: "Invoice balance due" },
  { path: "invoice.dueDate",     description: "Invoice due date" },
  { path: "install.scheduledAt", description: "Install date/time" },
  { path: "user.name",           description: "Sender's name" },
];

export const MESSAGE_TEMPLATE_KINDS: { value: MessageTemplateKind; label: string }[] = [
  { value: "CUSTOMER_UPDATE", label: "Customer update" },
  { value: "QUOTE_UPDATE",    label: "Quote update" },
  { value: "ORDER_UPDATE",    label: "Order update" },
  { value: "INSTALL_UPDATE",  label: "Install update" },
];

export function messageTemplateKindLabel(k: MessageTemplateKind): string {
  switch (k) {
    case "CUSTOMER_UPDATE": return "Customer update";
    case "QUOTE_UPDATE":    return "Quote update";
    case "ORDER_UPDATE":    return "Order update";
    case "INSTALL_UPDATE":  return "Install update";
  }
}
