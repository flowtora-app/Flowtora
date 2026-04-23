// Template renderer — turns a `TemplateContent` + resolved tokens +
// brand into the final `{ subject, html, text }` triplet that sendEmail()
// expects.
//
// Why a separate module from dispatch.ts:
//   • The admin preview panel (M2) renders templates without sending
//     anything. It imports `renderTemplate()` directly with sample
//     tokens and displays the HTML in an iframe.
//   • The dispatcher layers on top of this: it loads the DB row,
//     loads the brand, then calls this to produce the email body,
//     then hands off to sendEmail().

import { brandedEmailLayout, brandedTextLayout, type BrandedContentSection, type EmailBrand } from "@/lib/email";
import { renderMarkdownLite, renderMarkdownPlain } from "./markdown";
import { resolveTokens, resolveTokensPlain } from "./tokens";
import type { BrandSnapshot } from "./brand";
import type { TemplateContent, TokenValues } from "./types";

export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
  // Resolved values surfaced so dispatch.ts can audit-log or include
  // the headline in the audit trail without re-resolving.
  headline: string;
  preheader: string;
}

// The IN_APP channel strips everything except the title + body + link.
// Bell UIs have no room for a preheader, no surface for markdown, and
// the brand chrome doesn't apply — so we flatten aggressively. Title
// comes from the resolved headline (subject is too long for a bell
// row), body from the first ~280 chars of the plain-text render, and
// the link resolves from ctaUrlToken so the row is clickable.
export interface RenderedInApp {
  title: string;
  body: string;
  link: string | null;
}

// Helper — brand is what the layout wants; BrandSnapshot is what the
// loader returns. Shapes overlap 1:1 minus the "productName" helper
// fields, so this is a direct copy.
function toEmailBrand(brand: BrandSnapshot): EmailBrand {
  return {
    productName: brand.productName,
    tagline: brand.tagline,
    accentColor: brand.accentColor,
    buttonRadiusPx: brand.buttonRadiusPx,
    supportEmail: brand.supportEmail,
    footerHtml: brand.footerHtml,
  };
}

// Render a template into the final email pair. Tokens are resolved
// per-field with the right escape mode: subject/preheader/headline as
// plain text, body as markdown-lite (which HTML-escapes on its own),
// CTA URL as a URL, footer note as markdown-lite.
//
// The caller is responsible for merging any global tokens (product_name,
// support_email, current_year) into `tokens` before handing them off.
export function renderTemplate(opts: {
  content: TemplateContent;
  tokens: TokenValues;
  brand: BrandSnapshot;
}): RenderedEmail {
  const { content, tokens, brand } = opts;

  // Plain-text resolutions (no HTML escaping) for subject + preheader
  // — these land in the <title>/preheader slots which themselves get
  // HTML-escaped inside the layout.
  const subject = resolveTokensPlain(content.subject, tokens).trim();
  const preheader = resolveTokensPlain(content.preheader ?? "", tokens).trim();
  const headline = resolveTokensPlain(content.headline, tokens).trim();
  const subheading = content.subheading
    ? resolveTokensPlain(content.subheading, tokens).trim()
    : undefined;

  // Body tokens resolve inside markdown-lite source (raw text, not yet
  // HTML). The markdown renderer will HTML-escape everything.
  const bodyMarkdown = resolveTokensPlain(content.body, tokens);
  const bodyHtml = renderMarkdownLite(bodyMarkdown);
  const bodyPlain = renderMarkdownPlain(bodyMarkdown);

  // CTA — label is plain text, URL goes through URL escape mode.
  const ctaLabel = content.ctaLabel
    ? resolveTokensPlain(content.ctaLabel, tokens).trim()
    : undefined;
  const ctaUrl = content.ctaUrlToken
    ? resolveTokens(content.ctaUrlToken, tokens, "url").trim()
    : undefined;

  // Footer note is markdown-lite (admins often want to bold "Didn't
  // request this?" inside the note).
  const footerNoteMarkdown = content.footerNote
    ? resolveTokensPlain(content.footerNote, tokens)
    : "";
  const footerNoteHtml = footerNoteMarkdown
    ? renderMarkdownLite(footerNoteMarkdown)
    : "";
  const footerNotePlain = footerNoteMarkdown
    ? renderMarkdownPlain(footerNoteMarkdown)
    : "";

  // Assemble layout sections in the canonical order: body → CTA →
  // fallback link → divider → note.
  const sections: BrandedContentSection[] = [];
  if (bodyHtml) sections.push({ kind: "text", html: bodyHtml });
  if (ctaLabel && ctaUrl) {
    sections.push({ kind: "button", label: ctaLabel, href: ctaUrl });
    sections.push({
      kind: "fallbackLink",
      label: "Button not working? Copy and paste this link into your browser:",
      href: ctaUrl,
    });
  }
  if (footerNoteHtml) {
    sections.push({ kind: "divider" });
    sections.push({ kind: "note", html: footerNoteHtml });
  }

  const emailBrand = toEmailBrand(brand);
  const html = brandedEmailLayout({
    previewText: preheader || headline,
    heading: headline,
    subheading,
    sections,
    brand: emailBrand,
  });

  const text = brandedTextLayout({
    heading: headline,
    body: bodyPlain,
    ctaLabel,
    ctaUrl,
    footerNote: footerNotePlain,
    brand: emailBrand,
  });

  return { subject, html, text, headline, preheader };
}

// Render a template for the IN_APP channel. Mirrors renderTemplate()
// but produces the minimal shape the bell/inbox needs. No brand —
// per-channel branding doesn't apply to a DB row that the UI styles
// itself. Keeping this separate from renderTemplate keeps the email
// code simple and lets the admin UI preview each channel distinctly.
export function renderInAppTemplate(opts: {
  content: TemplateContent;
  tokens: TokenValues;
}): RenderedInApp {
  const { content, tokens } = opts;

  const title = resolveTokensPlain(content.headline, tokens).trim();
  const bodyMarkdown = resolveTokensPlain(content.body, tokens);
  const bodyPlain = renderMarkdownPlain(bodyMarkdown).trim();
  // Clip to 280 — bell rows show a 2-3 line preview; anything longer
  // just gets truncated in CSS anyway and inflates the DB row.
  const body = bodyPlain.length > 280 ? bodyPlain.slice(0, 279) + "…" : bodyPlain;

  const link = content.ctaUrlToken
    ? resolveTokens(content.ctaUrlToken, tokens, "url").trim() || null
    : null;

  return { title, body, link };
}
