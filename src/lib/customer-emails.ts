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
  const dueLine = opts.dueAt ? `\n\nWe'd love a response by ${opts.dueAt} to keep production on schedule.` : "";
  const notesBlock = opts.notes ? `\n\n"${opts.notes}"` : "";
  const urlLine   = opts.url   ? `\n\nReview proof: ${opts.url}` : "";
  const text = [
    `Hi ${opts.customerName},`,
    ``,
    `${opts.proofTitle} for order ${opts.orderNumber} is ready for your review. Approve the artwork or let us know what needs to change.${urlLine}${dueLine}${notesBlock}`,
    ``,
    signoff(opts),
  ].join("\n");
  const html = wrapHtml(opts, `
    <h1 style="margin:0 0 12px 0;font-size:20px">${esc(opts.proofTitle)} ready for review</h1>
    <p>Hi ${esc(opts.customerName)},</p>
    <p><strong>${esc(opts.proofTitle)}</strong> for order <strong>${esc(opts.orderNumber)}</strong> is ready for your review. Approve the artwork or let us know what needs to change.</p>
    ${opts.url ? button(opts.url, "Review proof") : ""}
    ${opts.dueAt ? `<p style="color:#666;font-size:13px">Please respond by <strong>${esc(opts.dueAt)}</strong> so we can keep production on schedule.</p>` : ""}
    ${opts.notes ? `<blockquote style="border-left:3px solid #eee;padding:4px 12px;color:#444;margin:16px 0">${esc(opts.notes)}</blockquote>` : ""}
  `);
  return { subject: `${opts.proofTitle} for ${opts.orderNumber}`, html, text };
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
      select: { emailFromName: true, emailReplyTo: true },
    });
    fromName = tenant?.emailFromName ?? undefined;
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
