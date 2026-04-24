// Phase 15 Slice E — customer-facing email templates + unified send helper.
//
// The existing `sendEmail` stub (src/lib/email.ts) takes { to, subject, html, text }
// and the existing `recordEmailEvent` writes a timeline row. Every customer
// send-site was doing *only* the second half; we now hand them a single
// `sendCustomerEmail(...)` that:
//
//   1. renders a branded template (subject + html + text),
//   2. fires the actual send (stubbed in dev; provider-wired in Phase 16),
//   3. records the EmailEvent with a meaningful bodyPreview so the portal
//      activity timeline shows the first sentence instead of a blank row.
//
// Templates are intentionally plain — no inline images, no external CSS —
// because shops forward portal links via Gmail / Outlook / whatever and the
// text-only fallback is often what the customer actually sees.

import { sendEmail } from "@/lib/email";
import { recordEmailEvent } from "@/lib/email-events";
import { db } from "@/lib/db";
import type { EmailEventKind } from "@prisma/client";

// ───────────────────────────────────────────────────────────────────────────
// Template shape
// ───────────────────────────────────────────────────────────────────────────

type Rendered = {
  subject: string;
  html:    string;
  text:    string;
};

type CommonBrand = {
  shopName: string;
  shopPhone?: string | null;
  shopWebsite?: string | null;
  // Phase 21 Slice B — optional per-doc extras. Passed in by the caller
  // from tenant fields; the templates decide where to render them.
  quoteFooterText?: string | null;
  invoiceFooterText?: string | null;
  paymentInstructions?: string | null;
};

// ───────────────────────────────────────────────────────────────────────────
// Individual templates
// ───────────────────────────────────────────────────────────────────────────

export function quoteReadyEmail(opts: CommonBrand & {
  customerName: string;
  quoteNumber:  string;
  total:        string; // pre-formatted money
  expiresAt?:   string | null;
  url?:         string | null; // portal or share URL; omitted when no link exists
  notes?:       string | null;
}): Rendered {
  const expiresLine = opts.expiresAt ? `\n\nThis quote is valid through ${opts.expiresAt}.` : "";
  const notesBlock  = opts.notes ? `\n\n"${opts.notes}"` : "";
  const urlLine     = opts.url ? `\n\nReview and respond: ${opts.url}` : "";
  const footerBlock = opts.quoteFooterText ? `\n\n${opts.quoteFooterText}` : "";
  const text = [
    `Hi ${opts.customerName},`,
    ``,
    `Your quote ${opts.quoteNumber} from ${opts.shopName} is ready for review. The total is ${opts.total}.${urlLine}${expiresLine}${notesBlock}${footerBlock}`,
    ``,
    signoff(opts),
  ].join("\n");
  const html = wrapHtml(opts, `
    <h1 style="margin:0 0 12px 0;font-size:20px">Your quote is ready</h1>
    <p>Hi ${esc(opts.customerName)},</p>
    <p>Your quote <strong>${esc(opts.quoteNumber)}</strong> from <strong>${esc(opts.shopName)}</strong> is ready for review. The total is <strong>${esc(opts.total)}</strong>.</p>
    ${opts.url ? button(opts.url, "Review quote") : ""}
    ${opts.expiresAt ? `<p style="color:#666;font-size:13px">Valid through ${esc(opts.expiresAt)}.</p>` : ""}
    ${opts.notes ? `<blockquote style="border-left:3px solid #eee;padding:4px 12px;color:#444;margin:16px 0">${esc(opts.notes)}</blockquote>` : ""}
  `, opts.quoteFooterText);
  return { subject: `Quote ${opts.quoteNumber} from ${opts.shopName}`, html, text };
}

export function proofReadyEmail(opts: CommonBrand & {
  customerName: string;
  proofTitle:   string; // "Proof v2" or free-form
  orderNumber:  string;
  url?:         string | null;
  dueAt?:       string | null;
  notes?:       string | null;
}): Rendered {
  // ── Plain-text version (mirrors the HTML structure) ──────────────────────
  const textLines: string[] = [
    `Hi ${opts.customerName},`,
    ``,
    `${opts.proofTitle} for order ${opts.orderNumber} is ready for your review.`,
    ``,
    `From the secure review link you can:`,
    `  • Approve the artwork and send it to production`,
    `  • Request changes with notes on what to adjust`,
    `  • Leave a comment or question for our team`,
  ];
  if (opts.url)   textLines.push(``, `Review your proof:`, opts.url);
  if (opts.dueAt) textLines.push(``, `Please respond by ${opts.dueAt} so we can keep production on schedule.`);
  if (opts.notes) textLines.push(``, `A note from the team:`, `"${opts.notes}"`);
  textLines.push(``, signoff(opts));

  // ── HTML version ─────────────────────────────────────────────────────────
  // Email-safe markup only: inline styles, table-free card layout, no web
  // fonts, no background images. Tested against Gmail / Outlook / Apple
  // Mail default rendering.
  const hero = `
    <div style="background:linear-gradient(135deg,#111 0%,#2a2a33 100%);color:#fff;border-radius:10px;padding:22px 24px;margin:0 0 20px">
      <div style="font-size:12px;letter-spacing:0.08em;text-transform:uppercase;color:#c8c8d0;margin:0 0 6px">
        Proof ready for review
      </div>
      <div style="font-size:22px;font-weight:700;line-height:1.25;margin:0">
        ${esc(opts.proofTitle)}
      </div>
      <div style="font-size:13px;color:#c8c8d0;margin:6px 0 0">
        Order ${esc(opts.orderNumber)} · ${esc(opts.shopName)}
      </div>
    </div>
  `;

  const actionsPanel = `
    <div style="margin:22px 0 4px;padding:14px 16px;background:#f6f7fb;border:1px solid #eaeaef;border-radius:10px">
      <div style="font-size:13px;font-weight:600;color:#111;margin:0 0 8px">
        What you can do from the review link
      </div>
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;width:100%">
        <tr>
          <td style="padding:4px 0;font-size:13px;color:#333;vertical-align:top;width:22px">✓</td>
          <td style="padding:4px 0;font-size:13px;color:#333"><strong>Approve</strong> the artwork and send it to production</td>
        </tr>
        <tr>
          <td style="padding:4px 0;font-size:13px;color:#333;vertical-align:top;width:22px">✎</td>
          <td style="padding:4px 0;font-size:13px;color:#333"><strong>Request changes</strong> with notes on what to adjust</td>
        </tr>
        <tr>
          <td style="padding:4px 0;font-size:13px;color:#333;vertical-align:top;width:22px">💬</td>
          <td style="padding:4px 0;font-size:13px;color:#333"><strong>Leave a comment</strong> or question for our team</td>
        </tr>
      </table>
    </div>
  `;

  const dueBlock = opts.dueAt
    ? `<div style="margin:16px 0 0;padding:10px 14px;background:#fff8e1;border:1px solid #f3e3a8;border-radius:8px;font-size:13px;color:#5a4a00">
         <strong>Please respond by ${esc(opts.dueAt)}</strong> so we can keep production on schedule.
       </div>`
    : "";

  const notesBlock = opts.notes
    ? `<div style="margin:18px 0 0;padding:12px 14px;border-left:3px solid #111;background:#fafafa;color:#333;font-size:13px;white-space:pre-wrap">
         <div style="font-size:11px;letter-spacing:0.06em;text-transform:uppercase;color:#888;margin:0 0 4px">A note from the team</div>
         ${esc(opts.notes)}
       </div>`
    : "";

  const fallbackLink = opts.url
    ? `<p style="color:#888;font-size:12px;margin:18px 0 0;word-break:break-all">
         If the button above doesn’t work, paste this link into your browser:<br/>
         <a href="${esc(opts.url)}" style="color:#555">${esc(opts.url)}</a>
       </p>`
    : "";

  const html = wrapHtml(opts, `
    ${hero}
    <p style="margin:0 0 10px 0">Hi ${esc(opts.customerName)},</p>
    <p style="margin:0 0 6px 0">
      <strong>${esc(opts.proofTitle)}</strong> for order <strong>${esc(opts.orderNumber)}</strong>
      is ready for your review. Please take a look and let us know how it looks — your feedback is
      what keeps this job moving.
    </p>
    ${opts.url ? button(opts.url, "Review & respond to proof") : ""}
    ${actionsPanel}
    ${dueBlock}
    ${notesBlock}
    ${fallbackLink}
  `);

  return {
    subject: `Action needed: review ${opts.proofTitle} for order ${opts.orderNumber}`,
    html,
    text: textLines.join("\n"),
  };
}

export function invoiceReadyEmail(opts: CommonBrand & {
  customerName:   string;
  invoiceNumber:  string;
  total:          string;
  balanceDue:     string;
  dueDate?:       string | null;
  url?:           string | null;
}): Rendered {
  const dueLine = opts.dueDate ? `\n\nPayment is due by ${opts.dueDate}.` : "";
  const urlLine = opts.url ? `\n\nView and pay: ${opts.url}` : "";
  const payBlock = opts.paymentInstructions ? `\n\nPayment instructions:\n${opts.paymentInstructions}` : "";
  const footerBlock = opts.invoiceFooterText ? `\n\n${opts.invoiceFooterText}` : "";
  const text = [
    `Hi ${opts.customerName},`,
    ``,
    `Invoice ${opts.invoiceNumber} for ${opts.total} is ready. The outstanding balance is ${opts.balanceDue}.${urlLine}${dueLine}${payBlock}${footerBlock}`,
    ``,
    signoff(opts),
  ].join("\n");
  const payHtml = opts.paymentInstructions
    ? `<div style="margin-top:18px;padding:12px 14px;background:#f3f4f6;border-radius:8px;color:#333;font-size:13px;white-space:pre-wrap"><strong style="display:block;margin-bottom:4px">Payment instructions</strong>${esc(opts.paymentInstructions)}</div>`
    : "";
  const html = wrapHtml(opts, `
    <h1 style="margin:0 0 12px 0;font-size:20px">Invoice ${esc(opts.invoiceNumber)}</h1>
    <p>Hi ${esc(opts.customerName)},</p>
    <p>Invoice <strong>${esc(opts.invoiceNumber)}</strong> for <strong>${esc(opts.total)}</strong> is ready. The outstanding balance is <strong>${esc(opts.balanceDue)}</strong>.</p>
    ${opts.url ? button(opts.url, "View invoice") : ""}
    ${opts.dueDate ? `<p style="color:#666;font-size:13px">Payment is due by <strong>${esc(opts.dueDate)}</strong>.</p>` : ""}
    ${payHtml}
  `, opts.invoiceFooterText);
  return { subject: `Invoice ${opts.invoiceNumber} from ${opts.shopName}`, html, text };
}

export function paymentReceivedEmail(opts: CommonBrand & {
  customerName:   string;
  invoiceNumber:  string;
  amount:         string;
  balanceDue:     string; // remaining after this payment — "0" when paid off
  url?:           string | null;
}): Rendered {
  const settled = opts.balanceDue === "0" || opts.balanceDue.replace(/[^\d]/g, "") === "0";
  const followup = settled
    ? `\n\nThis invoice is now paid in full — thank you!`
    : `\n\nRemaining balance: ${opts.balanceDue}.`;
  const linkLine = opts.url ? `\n\nView receipt: ${opts.url}` : "";
  const text = [
    `Hi ${opts.customerName},`,
    ``,
    `We received your payment of ${opts.amount} for invoice ${opts.invoiceNumber}.${followup}${linkLine}`,
    ``,
    signoff(opts),
  ].join("\n");
  const html = wrapHtml(opts, `
    <h1 style="margin:0 0 12px 0;font-size:20px">Payment received</h1>
    <p>Hi ${esc(opts.customerName)},</p>
    <p>We received your payment of <strong>${esc(opts.amount)}</strong> for invoice <strong>${esc(opts.invoiceNumber)}</strong>.</p>
    ${settled
      ? `<p style="color:#10b981"><strong>Paid in full — thank you!</strong></p>`
      : `<p>Remaining balance: <strong>${esc(opts.balanceDue)}</strong>.</p>`}
    ${opts.url ? button(opts.url, "View receipt") : ""}
  `, opts.invoiceFooterText);
  return { subject: `Payment received — invoice ${opts.invoiceNumber}`, html, text };
}

export function invoiceReminderEmail(opts: CommonBrand & {
  customerName:   string;
  invoiceNumber:  string;
  balanceDue:     string;
  dueDate?:       string | null;
  url?:           string | null;
  overdue:        boolean;
}): Rendered {
  const leadIn = opts.overdue
    ? `Invoice ${opts.invoiceNumber} is past due. The outstanding balance is ${opts.balanceDue}.`
    : `Friendly reminder: invoice ${opts.invoiceNumber} has an outstanding balance of ${opts.balanceDue}${opts.dueDate ? `, due ${opts.dueDate}` : ""}.`;
  const text = [
    `Hi ${opts.customerName},`,
    ``,
    leadIn,
    opts.url ? `\nPay invoice: ${opts.url}` : "",
    ``,
    signoff(opts),
  ].filter(Boolean).join("\n");
  const payHtml = opts.paymentInstructions
    ? `<div style="margin-top:18px;padding:12px 14px;background:#f3f4f6;border-radius:8px;color:#333;font-size:13px;white-space:pre-wrap"><strong style="display:block;margin-bottom:4px">Payment instructions</strong>${esc(opts.paymentInstructions)}</div>`
    : "";
  const html = wrapHtml(opts, `
    <h1 style="margin:0 0 12px 0;font-size:20px">${opts.overdue ? "Past-due reminder" : "Friendly reminder"}</h1>
    <p>Hi ${esc(opts.customerName)},</p>
    <p>${esc(leadIn)}</p>
    ${opts.url ? button(opts.url, "Pay invoice") : ""}
    ${payHtml}
  `, opts.invoiceFooterText);
  return {
    subject: opts.overdue
      ? `Past due: invoice ${opts.invoiceNumber}`
      : `Reminder: invoice ${opts.invoiceNumber}`,
    html, text,
  };
}

// ───────────────────────────────────────────────────────────────────────────
// Unified send helper
// ───────────────────────────────────────────────────────────────────────────

type SendOpts = {
  tenantId:     string;
  customerId?:  string | null;
  senderUserId?: string | null;
  kind:         EmailEventKind;
  to:           string;
  fromAddress?: string;
  relatedEntityType?: string;
  relatedEntityId?:   string;
  rendered:     Rendered;
};

/**
 * Render + send + record in one call.
 *
 * Never throws. The real send is currently a console.log in dev (see
 * src/lib/email.ts) — Phase 16 swaps in a provider. The recordEmailEvent
 * call is best-effort and also never throws.
 */
export async function sendCustomerEmail(args: SendOpts): Promise<void> {
  let providerId: string | null = null;

  // Phase 21 Slice A — pull tenant's custom "From name" + Reply-To. One
  // lookup per email is fine; these rows are already in the tenant's hot
  // cache from the caller's auth/requireTenant check. Failures fall through
  // to platform defaults rather than blocking the send.
  let fromName: string | undefined;
  let replyTo: string | undefined;
  try {
    const tenant = await db.tenant.findUnique({
      where: { id: args.tenantId },
      select: { name: true, emailFromName: true, emailReplyTo: true },
    });
    // Prefer the tenant's explicit display name override. When they haven't
    // set one, fall back to their shop name so customers still see the
    // email come from "Acme Signs" instead of our platform brand. The
    // envelope domain on RESEND_FROM_EMAIL is unchanged either way —
    // DKIM/SPF stays intact.
    fromName = tenant?.emailFromName?.trim() || tenant?.name?.trim() || undefined;
    replyTo  = tenant?.emailReplyTo  ?? undefined;
  } catch { /* fall through with platform defaults */ }

  await sendEmail({
    to:      args.to,
    subject: args.rendered.subject,
    html:    args.rendered.html,
    text:    args.rendered.text,
    fromName,
    replyTo,
  })
    .then((id) => { providerId = id; })
    .catch(() => { /* swallow; we still write the timeline row below */ });

  await recordEmailEvent({
    tenantId:          args.tenantId,
    customerId:        args.customerId ?? null,
    senderUserId:      args.senderUserId ?? null,
    kind:              args.kind,
    toAddress:         args.to,
    fromAddress:       args.fromAddress,
    subject:           args.rendered.subject,
    bodyPreview:       args.rendered.text,
    relatedEntityType: args.relatedEntityType,
    relatedEntityId:   args.relatedEntityId,
    provider:          providerId ? "resend" : undefined,
    providerId:        providerId ?? undefined,
  });
}

// ───────────────────────────────────────────────────────────────────────────
// Internal rendering helpers
// ───────────────────────────────────────────────────────────────────────────

function wrapHtml(opts: CommonBrand, body: string, customFooter?: string | null): string {
  const footer = [
    opts.shopName,
    opts.shopPhone,
    opts.shopWebsite,
  ].filter(Boolean).map((s) => esc(s as string)).join(" · ");
  // Phase 21 Slice B — optional per-doc footer block above the contact line.
  // Preserves line breaks via <br/> so short paragraphs survive intact.
  const customBlock = customFooter && customFooter.trim()
    ? `<p style="color:#555;font-size:13px;margin:16px 0 0;white-space:pre-wrap">${esc(customFooter)}</p>`
    : "";
  return `<!doctype html>
<html><body style="margin:0;padding:24px;background:#f7f7f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#222">
  <div style="max-width:560px;margin:0 auto;background:#fff;padding:28px 28px 24px;border-radius:12px;border:1px solid #eaeaef">
    ${body}
    ${customBlock}
    <hr style="border:none;border-top:1px solid #eee;margin:24px 0 12px"/>
    <p style="color:#888;font-size:12px;margin:0">${footer}</p>
  </div>
</body></html>`;
}

function button(href: string, label: string): string {
  return `<p style="margin:20px 0"><a href="${esc(href)}" style="display:inline-block;background:#111;color:#fff;text-decoration:none;padding:11px 20px;border-radius:8px;font-weight:600">${esc(label)}</a></p>`;
}

function signoff(opts: CommonBrand): string {
  return `— ${opts.shopName}${opts.shopPhone ? ` · ${opts.shopPhone}` : ""}`;
}

function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!,
  );
}
