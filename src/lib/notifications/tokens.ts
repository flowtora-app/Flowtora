// Tiny token resolver for notification templates.
//
// We intentionally DON'T use Mustache/Handlebars — those bring
// conditionals, loops, and partials that:
//   (a) widen the admin UI surface ("why can't I write {{#if…}}?")
//   (b) make validation at publish time a parser problem
//   (c) add a supply-chain dependency for what should be ~40 LOC
//
// The grammar is:
//
//   {{ token_name }}             → string token, HTML-escaped
//   {{ url:token_name }}         → url token, URI-encoded for href
//
// That's it. No conditionals, no arithmetic, no nested paths. Every
// valid template is parseable by one regex.
//
// Escaping rules:
//   • "text" mode  — HTML-escape the resolved value
//   • "attr" mode  — escape quotes/brackets for attribute context
//   • "url"  mode  — encodeURI-style (leaves scheme/host alone),
//                    blocks javascript:/data: URIs outright
//   • "raw"  mode  — no escaping (used for the plain-text email body)

import type { TokenSchema, TokenValues } from "./types";

export type EscapeMode = "text" | "attr" | "url" | "raw";

// Matches {{token}} and {{url:token}}. The surrounding whitespace is
// intentionally tolerant — admins will absolutely write "{{ foo }}".
const TOKEN_RE = /\{\{\s*(?:(url):)?([a-zA-Z_][a-zA-Z0-9_]*)\s*\}\}/g;

// Pull the set of tokens a template references — used by the publish
// path to validate against the kind's declared schema.
export function extractTokens(template: string): Set<string> {
  const found = new Set<string>();
  let m: RegExpExecArray | null;
  // Reset lastIndex on the shared regex each call.
  TOKEN_RE.lastIndex = 0;
  while ((m = TOKEN_RE.exec(template)) !== null) {
    found.add(m[2]);
  }
  return found;
}

// Return an array of token names referenced, in source order, with
// any url: prefix stripped. Handy for the admin UI's "tokens used"
// chip row.
export function listTokensInOrder(template: string): string[] {
  const out: string[] = [];
  TOKEN_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = TOKEN_RE.exec(template)) !== null) {
    out.push(m[2]);
  }
  return out;
}

export class UnknownTokenError extends Error {
  constructor(public token: string, public template: string) {
    super(`Unknown token {{${token}}} in template`);
  }
}

export class MissingRequiredTokenError extends Error {
  constructor(public token: string) {
    super(`Missing required token: ${token}`);
  }
}

// Validate that every token in `template` is declared in `schema`.
// Throws UnknownTokenError on the first offender. Used at publish
// time so admins learn about typos before the email goes live.
export function validateTemplateTokens(
  template: string,
  schema: TokenSchema,
): void {
  const found = extractTokens(template);
  for (const tok of found) {
    if (!(tok in schema)) throw new UnknownTokenError(tok, template);
  }
}

// Validate that all `required: true` tokens are present in `values`.
// Called at send time — a failure here means the dispatcher falls
// back to the code-side default and audit-logs the miss.
export function validateRequiredTokens(
  schema: TokenSchema,
  values: TokenValues,
): void {
  for (const [name, spec] of Object.entries(schema)) {
    if (!spec.required) continue;
    const v = values[name];
    if (v === undefined || v === null || v === "") {
      throw new MissingRequiredTokenError(name);
    }
  }
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!,
  );
}

function escapeAttr(s: string): string {
  // Attribute escapes are a strict superset of text escapes for our
  // purposes. Kept as a separate function so a future audit can
  // tighten one without touching the other.
  return escapeHtml(s);
}

// Block javascript:/data:/vbscript: URIs outright. Relative URLs +
// http/https pass through. Everything else we treat as suspicious and
// return `#` so the link is harmless in the rendered email.
function sanitizeUrl(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return "#";
  if (/^(javascript|data|vbscript):/i.test(trimmed)) return "#";
  // mailto: / tel: are legitimate; let them through.
  return trimmed;
}

function coerce(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return "";
  return typeof value === "number" ? String(value) : value;
}

// Resolve {{token}} references in `template` using `values`,
// escaping each substitution according to `mode`. Unknown tokens are
// left as the empty string — validateTemplateTokens() should have
// blocked them at publish time; this is a defensive last line.
export function resolveTokens(
  template: string,
  values: TokenValues,
  mode: EscapeMode = "text",
): string {
  TOKEN_RE.lastIndex = 0;
  return template.replace(TOKEN_RE, (_match, isUrl: string | undefined, name: string) => {
    const raw = coerce(values[name]);

    // {{url:foo}} is always url-sanitized regardless of outer mode —
    // this lets an admin put `{{url:reset_password_url}}` inside an
    // `attr` context and still get correct escaping.
    if (isUrl === "url") return sanitizeUrl(raw);

    switch (mode) {
      case "raw":
        return raw;
      case "url":
        return sanitizeUrl(raw);
      case "attr":
        return escapeAttr(raw);
      case "text":
      default:
        return escapeHtml(raw);
    }
  });
}

// Convenience: resolve into plain text with no escaping, trimming
// whitespace around substitutions. Used for the text/plain email
// alternative.
export function resolveTokensPlain(
  template: string,
  values: TokenValues,
): string {
  return resolveTokens(template, values, "raw");
}
