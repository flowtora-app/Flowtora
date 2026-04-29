// Email provider: Resend (resend.com). Configure RESEND_API_KEY and
// RESEND_FROM_EMAIL in your environment. Falls back to console logging in
// development if the key is absent so local dev works without credentials.

import { Resend } from "resend";

type SendArgs = {
  to: string;
  subject: string;
  html: string;
  text?: string;
  replyTo?: string;
  // Phase 21 Slice A — display name override. The envelope domain must stay
  // on RESEND_FROM_EMAIL (DKIM/SPF reasons), so this only rewrites the
  // human-readable name. Accepts "Shop Name" → becomes "Shop Name <domain>".
  fromName?: string;
};

let _resend: Resend | null = null;
function getResend(): Resend | null {
  if (!process.env.RESEND_API_KEY) return null;
  if (!_resend) _resend = new Resend(process.env.RESEND_API_KEY);
  return _resend;
}

const fromAddress =
  process.env.RESEND_FROM_EMAIL ?? "Flowtora <noreply@flowtora.app>";

// Strip the display-name portion from a "Name <addr@domain>" line, keeping
// only the angle-bracketed address. We reuse the domain for custom fromName
// rewrites so DKIM stays intact.
function bareFromAddress(line: string): string {
  const match = line.match(/<([^>]+)>/);
  return match ? match[1] : line;
}

// Sanitize an arbitrary "fromName" — no angle brackets (would break the
// header), no CR/LF (header injection). Collapse to a safe inline string.
function sanitizeFromName(raw: string): string {
  return raw.replace(/[<>\r\n"]/g, "").trim().slice(0, 120);
}

// Returns the provider message ID (for delivery tracking), or null in dev.
export async function sendEmail(args: SendArgs): Promise<string | null> {
  const resend = getResend();

  if (!resend) {
    // Dev fallback — log so developers can see what would have sent.
    console.log("\n[email → dev stub]", args.to, "—", args.subject);
    if (args.text) console.log(args.text.slice(0, 400));
    return null;
  }

  const effectiveFrom = args.fromName
    ? `${sanitizeFromName(args.fromName)} <${bareFromAddress(fromAddress)}>`
    : fromAddress;

  const { data, error } = await resend.emails.send({
    from:     effectiveFrom,
    to:       args.to,
    subject:  args.subject,
    html:     args.html,
    text:     args.text,
    replyTo: args.replyTo,
  });

  if (error) {
    // Log but don't throw — callers use sendCustomerEmail which swallows
    // errors and still writes the EmailEvent timeline row.
    console.error("[email] Resend error:", error);
    throw new Error(error.message);
  }

  return data?.id ?? null;
}

export function inviteEmail(opts: {
  shopName: string;
  inviterName: string;
  acceptUrl: string;
}) {
  const text = `${opts.inviterName} invited you to join ${opts.shopName} on Flowtora.\n\nAccept the invitation: ${opts.acceptUrl}\n\nThis link expires in 7 days.`;
  const html = `<p>${escape(opts.inviterName)} invited you to join <strong>${escape(opts.shopName)}</strong> on Flowtora.</p>
<p><a href="${opts.acceptUrl}">Accept the invitation</a></p>
<p style="color:#888;font-size:12px">This link expires in 7 days.</p>`;
  return { subject: `You're invited to ${opts.shopName}`, html, text };
}

// ── Phase 2 — security emails ──

export function passwordResetEmail(opts: { resetUrl: string; expiresInMinutes: number }) {
  const text = `Someone (hopefully you) asked to reset your Flowtora password.\n\nReset your password: ${opts.resetUrl}\n\nThis link expires in ${opts.expiresInMinutes} minutes. If you didn't request this, you can ignore this email — your account stays secure.`;
  const html = `<p>Someone (hopefully you) asked to reset your Flowtora password.</p>
<p><a href="${opts.resetUrl}">Reset your password</a></p>
<p style="color:#888;font-size:12px">This link expires in ${opts.expiresInMinutes} minutes. If you didn't request this, ignore this email.</p>`;
  return { subject: "Reset your Flowtora password", html, text };
}

// ────────────────────────────────────────────────────────────
// Branded email shell
// ────────────────────────────────────────────────────────────
//
// Reusable HTML layout for transactional emails. Designed for:
//   • Cross-client compatibility (Gmail, Outlook, Apple Mail, mobile)
//     — table-based structure, inline styles on every element that
//     matters, a conservative subset of CSS.
//   • Light + dark mode — the <style> block at the top of the doc
//     holds `@media (prefers-color-scheme: dark)` overrides and
//     mobile tweaks. Clients that ignore <style> (older Outlook)
//     still render the inline-styled fallback perfectly.
//   • Preheader text — the 70-90 char preview line that appears
//     next to the subject in most inboxes. Hidden inside the body
//     with zero height + color so it doesn't visually render.
//
// New email templates should use this instead of hand-rolling HTML.

export type BrandedContentSection =
  | { kind: "text"; html: string }
  | { kind: "button"; label: string; href: string }
  | { kind: "fallbackLink"; label: string; href: string }
  | { kind: "note"; html: string }
  | { kind: "divider" };

// Minimal brand shape consumed by the layout. Mirrors the fields on
// NotificationBrand but stays a plain interface so callers can pass a
// compile-time default without hitting the DB (see notifications/brand.ts).
export interface EmailBrand {
  productName: string;
  tagline: string;
  /**
   * Absolute URL to the brand logo image rendered in the email header.
   * When omitted (null), we fall back to a colored chip with the
   * product's first letter — keeps emails working when no logo is set
   * (fresh install, custom branding incomplete, etc.).
   */
  logoUrl: string | null;
  accentColor: string; // hex
  buttonRadiusPx: number; // 0–16
  supportEmail: string | null;
  footerHtml: string | null;
}

// Default brand for callers that use the legacy verification template
// path without threading the brand through. Matches the values in
// notifications/brand.ts DEFAULT_BRAND so rendered output is
// byte-identical whether the brand came from DB or code.
const FALLBACK_BRAND: EmailBrand = {
  productName: "Flowtora",
  tagline: "A calm ops platform for sign & print shops.",
  // Absolute URL — emails are read offline / from external clients,
  // so the image must be reachable from anywhere. The light-bg
  // variant reads well against the typical white email canvas.
  logoUrl: "https://flowtora.com/flowtora-logo.png",
  accentColor: "#4f8cff",
  buttonRadiusPx: 10,
  supportEmail: null,
  footerHtml: null,
};

export function brandedEmailLayout(opts: {
  previewText: string;
  heading: string;
  subheading?: string;
  sections: BrandedContentSection[];
  footerNote?: string;
  brand?: EmailBrand;
}): string {
  const { previewText, heading, subheading, sections, footerNote } = opts;
  const brand = opts.brand ?? FALLBACK_BRAND;
  const accent = brand.accentColor;
  const radius = Math.max(0, Math.min(16, brand.buttonRadiusPx));
  // Button shadow derived from accent — hand-tuned rgba that matches
  // the visual weight we shipped with the blue default.
  const accentShadow = accentRgba(accent, 0.28);
  const productInitial = (brand.productName.trim()[0] ?? "F").toUpperCase();

  const year = new Date().getFullYear();

  // Render each content section as a table row. Tables are the only
  // layout primitive Outlook renders reliably, so we lean into them.
  const sectionsHtml = sections
    .map((s) => {
      if (s.kind === "text") {
        return `
          <tr>
            <td style="padding:0 40px 20px 40px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;font-size:16px;line-height:1.6;color:#374151" class="ft-text">
              ${s.html}
            </td>
          </tr>`;
      }
      if (s.kind === "button") {
        // Bulletproof button pattern: outer VML for Outlook, <a> fallback
        // for everything else. The inline styles on the <a> duplicate the
        // <style> block so clients stripping <style> still get the look.
        return `
          <tr>
            <td align="center" style="padding:8px 40px 28px 40px">
              <!--[if mso]>
              <v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word" href="${escapeAttr(s.href)}" style="height:52px;v-text-anchor:middle;width:320px;" arcsize="14%" stroke="f" fillcolor="${accent}">
                <w:anchorlock/>
                <center style="color:#ffffff;font-family:Arial,sans-serif;font-size:16px;font-weight:600;letter-spacing:0.2px;">${escape(s.label)}</center>
              </v:roundrect>
              <![endif]-->
              <!--[if !mso]> <!-->
              <a href="${escapeAttr(s.href)}" target="_blank" class="ft-button" style="display:inline-block;background:${accent};color:#ffffff !important;text-decoration:none;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;font-size:16px;font-weight:600;letter-spacing:0.2px;line-height:1;padding:18px 40px;border-radius:${radius}px;box-shadow:0 4px 14px ${accentShadow};mso-hide:all">${escape(s.label)}</a>
              <!-- <![endif]-->
            </td>
          </tr>`;
      }
      if (s.kind === "fallbackLink") {
        return `
          <tr>
            <td style="padding:0 40px 24px 40px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;font-size:13px;line-height:1.6;color:#6b7280" class="ft-text-muted">
              <p style="margin:0 0 8px 0">${escape(s.label)}</p>
              <p style="margin:0;word-break:break-all">
                <a href="${escapeAttr(s.href)}" target="_blank" style="color:${accent};text-decoration:underline" class="ft-link">${escape(s.href)}</a>
              </p>
            </td>
          </tr>`;
      }
      if (s.kind === "note") {
        return `
          <tr>
            <td style="padding:0 40px 24px 40px">
              <div style="background:#f3f4f6;border-left:3px solid ${accent};border-radius:8px;padding:14px 16px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;font-size:13px;line-height:1.6;color:#4b5563" class="ft-note">
                ${s.html}
              </div>
            </td>
          </tr>`;
      }
      // divider
      return `
        <tr>
          <td style="padding:0 40px 24px 40px">
            <div style="height:1px;background:#e5e7eb;line-height:1px;font-size:0" class="ft-divider">&nbsp;</div>
          </td>
        </tr>`;
    })
    .join("\n");

  return `<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html xmlns="http://www.w3.org/1999/xhtml" lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <meta http-equiv="X-UA-Compatible" content="IE=edge" />
  <meta name="color-scheme" content="light dark" />
  <meta name="supported-color-schemes" content="light dark" />
  <title>${escape(heading)}</title>
  <!--[if mso]>
  <noscript>
    <xml>
      <o:OfficeDocumentSettings xmlns:o="urn:schemas-microsoft-com:office:office">
        <o:PixelsPerInch>96</o:PixelsPerInch>
      </o:OfficeDocumentSettings>
    </xml>
  </noscript>
  <![endif]-->
  <style type="text/css">
    /* Client resets */
    body,table,td,a { -webkit-text-size-adjust:100%; -ms-text-size-adjust:100%; }
    table,td { mso-table-lspace:0pt; mso-table-rspace:0pt; }
    img { -ms-interpolation-mode:bicubic; border:0; outline:none; text-decoration:none; }
    body { margin:0 !important; padding:0 !important; width:100% !important; }

    /* Brand hover */
    a.ft-button:hover { filter:brightness(1.06); }
    a.ft-link:hover { text-decoration:none !important; }

    /* Mobile */
    @media screen and (max-width:620px) {
      .ft-container { width:100% !important; max-width:100% !important; border-radius:0 !important; }
      .ft-header, .ft-text, .ft-text-muted, .ft-note-wrap, .ft-footer { padding-left:24px !important; padding-right:24px !important; }
      .ft-heading { font-size:22px !important; line-height:1.25 !important; }
      .ft-button { width:100% !important; box-sizing:border-box !important; padding:18px 20px !important; }
    }

    /* Dark mode */
    @media (prefers-color-scheme: dark) {
      body, .ft-bg { background:#0b1020 !important; }
      .ft-container { background:#141a2e !important; border-color:#1f2742 !important; }
      .ft-heading { color:#f5f7fb !important; }
      .ft-subheading { color:#9aa4c2 !important; }
      .ft-text { color:#c8d0e7 !important; }
      .ft-text-muted { color:#8892b0 !important; }
      .ft-note { background:#1a2140 !important; color:#c8d0e7 !important; border-left-color:#6aa0ff !important; }
      .ft-divider { background:#1f2742 !important; }
      .ft-footer { color:#6b7591 !important; }
      .ft-footer a { color:#8fb4ff !important; }
      .ft-header-bar { background:#141a2e !important; border-bottom-color:#1f2742 !important; }
      .ft-wordmark { color:#f5f7fb !important; }
    }

    /* Outlook.com / some webmail clients use these class hooks */
    [data-ogsc] body, [data-ogsc] .ft-bg { background:#0b1020 !important; }
    [data-ogsc] .ft-container { background:#141a2e !important; border-color:#1f2742 !important; }
    [data-ogsc] .ft-heading { color:#f5f7fb !important; }
    [data-ogsc] .ft-subheading { color:#9aa4c2 !important; }
    [data-ogsc] .ft-text { color:#c8d0e7 !important; }
    [data-ogsc] .ft-text-muted { color:#8892b0 !important; }
    [data-ogsc] .ft-note { background:#1a2140 !important; color:#c8d0e7 !important; }
    [data-ogsc] .ft-footer { color:#6b7591 !important; }
    [data-ogsc] .ft-wordmark { color:#f5f7fb !important; }
  </style>
</head>
<body class="ft-bg" style="margin:0;padding:0;background:#f5f7fb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;color:#111827">
  <!-- Preheader: visible preview text next to the subject in the inbox,
       hidden visually inside the message body. -->
  <div style="display:none;font-size:1px;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;mso-hide:all;color:transparent">
    ${escape(previewText)}
    &nbsp;&#847; &nbsp;&#847; &nbsp;&#847; &nbsp;&#847; &nbsp;&#847; &nbsp;&#847; &nbsp;&#847; &nbsp;&#847; &nbsp;&#847; &nbsp;&#847; &nbsp;&#847; &nbsp;&#847; &nbsp;&#847;
  </div>

  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" class="ft-bg" style="background:#f5f7fb">
    <tr>
      <td align="center" style="padding:32px 16px">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" class="ft-container" style="width:600px;max-width:600px;background:#ffffff;border:1px solid #e5e7eb;border-radius:16px;overflow:hidden;box-shadow:0 1px 2px rgba(15,23,42,0.04)">
          <!-- Header bar -->
          <tr>
            <td class="ft-header ft-header-bar" style="padding:28px 40px 24px 40px;background:#ffffff;border-bottom:1px solid #f1f3f7">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td align="left" valign="middle">
                    <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                      <tr>
                        <td valign="middle" style="padding-right:10px">
                          ${
                            brand.logoUrl
                              ? `<img src="${escape(brand.logoUrl)}" alt="${escape(brand.productName)}" width="32" height="32" style="display:block;width:32px;height:32px;border-radius:8px;border:0" />`
                              : `<div style="width:32px;height:32px;background:${accent};border-radius:8px;color:#ffffff;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;font-weight:700;font-size:15px;text-align:center;line-height:32px">${escape(productInitial)}</div>`
                          }
                        </td>
                        <td valign="middle">
                          <span class="ft-wordmark" style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;font-size:17px;font-weight:600;color:#111827;letter-spacing:-0.2px">${escape(brand.productName)}</span>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Title -->
          <tr>
            <td style="padding:36px 40px 10px 40px">
              <h1 class="ft-heading" style="margin:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;font-size:26px;line-height:1.25;font-weight:700;color:#0f172a;letter-spacing:-0.4px">
                ${escape(heading)}
              </h1>
              ${
                subheading
                  ? `<p class="ft-subheading" style="margin:10px 0 0 0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;font-size:15px;line-height:1.55;color:#64748b">${escape(subheading)}</p>`
                  : ""
              }
            </td>
          </tr>
          <tr><td style="height:20px;line-height:20px;font-size:0">&nbsp;</td></tr>

          ${sectionsHtml}

          <!-- Footer -->
          <tr>
            <td class="ft-footer" style="padding:28px 40px 32px 40px;border-top:1px solid #f1f3f7;background:#fafbff;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;font-size:12px;line-height:1.6;color:#8a94a6">
              ${
                footerNote
                  ? `<p style="margin:0 0 10px 0">${footerNote}</p>`
                  : ""
              }
              ${brand.footerHtml ? `<p style="margin:0 0 10px 0">${brand.footerHtml}</p>` : ""}
              <p style="margin:0">
                ${escape(brand.productName)} — ${escape(brand.tagline)}<br />
                You&apos;re receiving this because an action on your ${escape(brand.productName)} account was requested.${
                  brand.supportEmail
                    ? ` Questions? <a href="mailto:${escapeAttr(brand.supportEmail)}" style="color:${accent};text-decoration:none">${escape(brand.supportEmail)}</a>`
                    : ""
                }
              </p>
              <p style="margin:12px 0 0 0;color:#a0a8b8">&copy; ${year} ${escape(brand.productName)}. All rights reserved.</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

// Plain-text preamble + closer that mirror the HTML shell so the text
// alternative feels branded too (some recipients — or spam filters —
// read text/plain first).
export function brandedTextLayout(opts: {
  heading: string;
  body: string;
  ctaLabel?: string;
  ctaUrl?: string;
  footerNote?: string;
  brand?: EmailBrand;
}): string {
  const brand = opts.brand ?? FALLBACK_BRAND;
  const lines: string[] = [];
  lines.push(brand.productName);
  lines.push("=".repeat(40));
  lines.push("");
  lines.push(opts.heading);
  lines.push("");
  lines.push(opts.body);
  if (opts.ctaUrl) {
    lines.push("");
    if (opts.ctaLabel) lines.push(`${opts.ctaLabel}:`);
    lines.push(opts.ctaUrl);
  }
  if (opts.footerNote) {
    lines.push("");
    lines.push(opts.footerNote);
  }
  lines.push("");
  lines.push("—");
  lines.push(`${brand.productName} · ${brand.tagline}`);
  return lines.join("\n");
}

// Convert "#rrggbb" or "#rgb" + alpha into an rgba() string for shadow
// layers. Falls back to a neutral blue shadow if parsing fails so we
// never emit invalid CSS.
function accentRgba(hex: string, alpha: number): string {
  const m3 = hex.match(/^#([0-9a-fA-F])([0-9a-fA-F])([0-9a-fA-F])$/);
  const m6 = hex.match(/^#([0-9a-fA-F]{2})([0-9a-fA-F]{2})([0-9a-fA-F]{2})$/);
  let r = 79, g = 140, b = 255; // default to #4f8cff
  if (m6) {
    r = parseInt(m6[1], 16);
    g = parseInt(m6[2], 16);
    b = parseInt(m6[3], 16);
  } else if (m3) {
    r = parseInt(m3[1] + m3[1], 16);
    g = parseInt(m3[2] + m3[2], 16);
    b = parseInt(m3[3] + m3[3], 16);
  }
  return `rgba(${r},${g},${b},${alpha})`;
}

// Used by brandedEmailLayout for any caller-supplied HTML attribute
// values (href, etc.) to block attribute-injection via unescaped quotes.
function escapeAttr(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!,
  );
}

export function emailVerificationEmail(opts: {
  verifyUrl: string;
  isChange: boolean;
  userName?: string | null;
}) {
  const firstName = (opts.userName ?? "").trim().split(/\s+/)[0] ?? "";
  const greeting = firstName ? `Hi ${firstName},` : "Hi there,";

  const subject = opts.isChange
    ? "Confirm your new email address"
    : "Confirm your email to activate Flowtora";

  const heading = opts.isChange
    ? "Confirm your new email"
    : "One click to activate your account";

  const subheading = opts.isChange
    ? "We need to verify this address before we can move your Flowtora sign-in to it."
    : "You're almost in. Confirm your email to finish setting up your Flowtora workspace.";

  const preview = opts.isChange
    ? "Confirm the new email on your Flowtora account — link expires in 24 hours."
    : "Confirm your email to finish setting up Flowtora — takes one click.";

  const introParagraph = opts.isChange
    ? `${escape(greeting)} Tap the button below to confirm that this inbox belongs to you. We won't move your sign-in email until you do.`
    : `${escape(greeting)} Thanks for signing up. Tap the button below to verify it's really you and finish activating your Flowtora account.`;

  const securityNote = opts.isChange
    ? `<strong style="color:inherit">Didn't request an email change?</strong> You can safely ignore this — your current email and sign-in stay exactly as they are.`
    : `<strong style="color:inherit">Didn't sign up for Flowtora?</strong> You can safely ignore this email — no account will be created without this confirmation.`;

  const html = brandedEmailLayout({
    previewText: preview,
    heading,
    subheading,
    sections: [
      { kind: "text", html: `<p style="margin:0">${introParagraph}</p>` },
      { kind: "button", label: opts.isChange ? "Confirm new email" : "Confirm my email", href: opts.verifyUrl },
      {
        kind: "fallbackLink",
        label: "Button not working? Copy and paste this link into your browser:",
        href: opts.verifyUrl,
      },
      { kind: "divider" },
      { kind: "note", html: securityNote },
      {
        kind: "text",
        html: `<p style="margin:0;color:#6b7280;font-size:13px">For your security, this link expires in <strong>24 hours</strong> and can only be used once.</p>`,
      },
    ],
    footerNote: `If you need help, just reply to this email — a human will get back to you.`,
  });

  const text = brandedTextLayout({
    heading,
    body:
      `${greeting}\n\n` +
      (opts.isChange
        ? "Confirm that this inbox belongs to you so we can move your Flowtora sign-in to it. If you didn't request this, ignore this email — your current email stays the way it is."
        : "Thanks for signing up for Flowtora. Confirm your email to finish activating your workspace. If you didn't sign up, just ignore this email."),
    ctaLabel: opts.isChange ? "Confirm new email" : "Confirm my email",
    ctaUrl: opts.verifyUrl,
    footerNote: "This link expires in 24 hours and can only be used once.",
  });

  return { subject, html, text };
}

// Phase 1 follow-up — magic-link sign-in email. NextAuth's Resend
// provider calls this from `sendVerificationRequest`; we generate the
// branded HTML + text shell and the Resend send happens via our usual
// `sendEmail` path so message-IDs land in the same observability hole
// as everything else.
export function magicLinkEmail(opts: {
  signInUrl: string;
  /** ISO host of the request, e.g. "flowtora.com". Shown so the user
   *  can sanity-check they're signing in to the right environment. */
  host: string;
  /** Token TTL in minutes (NextAuth default is 24h). Used in the
   *  "expires in X" copy. */
  expiresInMinutes: number;
}) {
  const subject = `Sign in to ${opts.host}`;
  const heading = "Your sign-in link";
  const subheading =
    "Tap the button below to sign in to Flowtora. No password needed — this link is good once and expires shortly.";
  const preview = `One-click sign-in to ${opts.host}. Link expires in ${opts.expiresInMinutes} minutes.`;

  const html = brandedEmailLayout({
    previewText: preview,
    heading,
    subheading,
    sections: [
      {
        kind: "text",
        html: `<p style="margin:0">Hi there, you (or someone using your email) asked to sign in to <strong>${escape(opts.host)}</strong>. Tap the button to finish signing in.</p>`,
      },
      { kind: "button", label: "Sign me in", href: opts.signInUrl },
      {
        kind: "fallbackLink",
        label: "Button not working? Copy and paste this link into your browser:",
        href: opts.signInUrl,
      },
      { kind: "divider" },
      {
        kind: "note",
        html:
          `<strong style="color:inherit">Didn't try to sign in?</strong> Ignore this email — without clicking the link nothing happens. ` +
          `If you keep getting these and didn't request them, contact support.`,
      },
      {
        kind: "text",
        html: `<p style="margin:0;color:#6b7280;font-size:13px">For your security, this link expires in <strong>${opts.expiresInMinutes} minutes</strong> and can only be used once.</p>`,
      },
    ],
    footerNote: "If you need help, just reply to this email — a human will get back to you.",
  });

  const text = brandedTextLayout({
    heading,
    body:
      `You asked to sign in to ${opts.host}. Use this link (good once):\n\n` +
      `${opts.signInUrl}\n\n` +
      `If you didn't request this, ignore the email — without clicking the link nothing happens.`,
    ctaLabel: "Sign me in",
    ctaUrl: opts.signInUrl,
    footerNote: `This link expires in ${opts.expiresInMinutes} minutes and can only be used once.`,
  });

  return { subject, html, text };
}

export function securityAlertEmail(opts: {
  eventLabel: string;
  ip: string | null;
  userAgent: string | null;
  when: Date;
}) {
  const ipLine = opts.ip ? `IP: ${opts.ip}\n` : "";
  const uaLine = opts.userAgent ? `Device: ${opts.userAgent}\n` : "";
  const text = `Security notice: ${opts.eventLabel}\n\nWhen: ${opts.when.toISOString()}\n${ipLine}${uaLine}\nIf this wasn't you, reset your password immediately and contact support.`;
  const html = `<p><strong>Security notice</strong></p>
<p>${escape(opts.eventLabel)}</p>
<p style="color:#555">When: ${opts.when.toISOString()}<br />${opts.ip ? "IP: " + escape(opts.ip) + "<br />" : ""}${opts.userAgent ? "Device: " + escape(opts.userAgent) + "<br />" : ""}</p>
<p style="color:#888;font-size:12px">If this wasn't you, reset your password and contact support.</p>`;
  return { subject: `Flowtora security notice: ${opts.eventLabel}`, html, text };
}

// ── Phase 22 Slice B — reminder digest-row emails ──
//
// One email per tripped reminder (kept simple — we're not batching into a
// digest yet; a staff member who opts into email for a reminder kind
// usually wants it as the cron fires so the signal is timely). The
// suppression window in notifyOnce ensures we don't spam.

export function reminderEmail(opts: {
  title:      string;
  detail:     string | null;
  kindLabel:  string;
  url:        string;
  tenantName: string;
}) {
  const body = [opts.title, opts.detail ?? ""].filter(Boolean).join("\n\n");
  const text = `${body}\n\nOpen in Flowtora: ${opts.url}\n\n— ${opts.tenantName} (via Flowtora reminders)`;
  const html = `<p><strong>${escape(opts.title)}</strong></p>
${opts.detail ? `<p style="color:#444">${escape(opts.detail)}</p>` : ""}
<p><a href="${opts.url}">Open in Flowtora</a></p>
<p style="color:#888;font-size:12px">${escape(opts.kindLabel)} reminder · ${escape(opts.tenantName)}</p>`;
  return { subject: opts.title, html, text };
}

// ── Phase 20 Slice B — support ticket notifications ──

export function supportStaffReplyEmail(opts: {
  subject:    string;
  ticketUrl:  string;
  preview:    string;
  staffName:  string;
  tenantName: string;
}) {
  const clipped = opts.preview.length > 600 ? opts.preview.slice(0, 600) + "…" : opts.preview;
  const text = `${opts.staffName} replied to your support ticket "${opts.subject}" for ${opts.tenantName}.\n\n${clipped}\n\nView the thread: ${opts.ticketUrl}`;
  const html = `<p><strong>${escape(opts.staffName)}</strong> replied to your support ticket <em>${escape(opts.subject)}</em>.</p>
<blockquote style="border-left:3px solid #ccc;padding:4px 12px;color:#444;white-space:pre-wrap">${escape(clipped)}</blockquote>
<p><a href="${opts.ticketUrl}">Open the ticket</a></p>
<p style="color:#888;font-size:12px">Workspace: ${escape(opts.tenantName)}</p>`;
  return { subject: `Support reply: ${opts.subject}`, html, text };
}

function escape(s: string) {
  return s.replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!,
  );
}
