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
  process.env.RESEND_FROM_EMAIL ?? "Tracksign <noreply@tracksign.app>";

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
  const text = `${opts.inviterName} invited you to join ${opts.shopName} on Tracksign.\n\nAccept the invitation: ${opts.acceptUrl}\n\nThis link expires in 7 days.`;
  const html = `<p>${escape(opts.inviterName)} invited you to join <strong>${escape(opts.shopName)}</strong> on Tracksign.</p>
<p><a href="${opts.acceptUrl}">Accept the invitation</a></p>
<p style="color:#888;font-size:12px">This link expires in 7 days.</p>`;
  return { subject: `You're invited to ${opts.shopName}`, html, text };
}

// ── Phase 2 — security emails ──

export function passwordResetEmail(opts: { resetUrl: string; expiresInMinutes: number }) {
  const text = `Someone (hopefully you) asked to reset your Tracksign password.\n\nReset your password: ${opts.resetUrl}\n\nThis link expires in ${opts.expiresInMinutes} minutes. If you didn't request this, you can ignore this email — your account stays secure.`;
  const html = `<p>Someone (hopefully you) asked to reset your Tracksign password.</p>
<p><a href="${opts.resetUrl}">Reset your password</a></p>
<p style="color:#888;font-size:12px">This link expires in ${opts.expiresInMinutes} minutes. If you didn't request this, ignore this email.</p>`;
  return { subject: "Reset your Tracksign password", html, text };
}

export function emailVerificationEmail(opts: { verifyUrl: string; isChange: boolean }) {
  const verb = opts.isChange ? "Confirm your new email address" : "Confirm your email address";
  const text = `${verb} to finish setting up Tracksign.\n\nConfirm: ${opts.verifyUrl}\n\nThis link expires in 24 hours.`;
  const html = `<p>${verb} to finish setting up Tracksign.</p>
<p><a href="${opts.verifyUrl}">Confirm email</a></p>
<p style="color:#888;font-size:12px">This link expires in 24 hours.</p>`;
  return { subject: verb, html, text };
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
  return { subject: `Tracksign security notice: ${opts.eventLabel}`, html, text };
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
  const text = `${body}\n\nOpen in Tracksign: ${opts.url}\n\n— ${opts.tenantName} (via Tracksign reminders)`;
  const html = `<p><strong>${escape(opts.title)}</strong></p>
${opts.detail ? `<p style="color:#444">${escape(opts.detail)}</p>` : ""}
<p><a href="${opts.url}">Open in Tracksign</a></p>
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
