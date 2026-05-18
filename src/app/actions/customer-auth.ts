"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { headers } from "next/headers";
import { db } from "@/lib/db";
import { sendEmail } from "@/lib/email";
import {
  createMagicLink,
  findOrCreateAccount,
  signOutCustomer,
} from "@/lib/customer-auth";

// Server actions powering the customer storefront sign-in flow.

const requestSchema = z.object({
  email: z.string().email("Enter a valid email"),
});

/** Request a magic link. Looks up the tenant, finds-or-creates the
 *  CustomerAccount, mints a token, and emails the link. Redirects
 *  to a "check your inbox" confirmation route either way. */
export async function requestMagicLink(slug: string, formData: FormData) {
  const parsed = requestSchema.safeParse({
    email: formData.get("email"),
  });
  if (!parsed.success) {
    const msg = parsed.error.issues[0]?.message ?? "Invalid email";
    redirect(`/shop/${slug}/account/signin?error=${encodeURIComponent(msg)}`);
  }

  const tenant = await db.tenant.findUnique({
    where: { slug },
    select: { id: true, name: true },
  });
  if (!tenant) {
    redirect(`/shop/${slug}/account/signin?error=${encodeURIComponent("Shop not found")}`);
  }

  const account = await findOrCreateAccount(tenant.id, parsed.data.email);
  const { token, expiresAt } = await createMagicLink(account.id);

  // Best-effort absolute URL — falls back to host header when env var
  // isn't set. We won't fail the request if neither resolves; the
  // dev-stub email logs the relative URL.
  const hdrs = await headers();
  const host = process.env.NEXT_PUBLIC_APP_URL
    ?? `https://${hdrs.get("host") ?? "flowtora.com"}`;
  const link = `${host.replace(/\/$/, "")}/shop/${slug}/account/verify/${token}`;

  // Compose the email. sendEmail() falls back to console logging in
  // dev when RESEND_API_KEY isn't set, so we can test the flow locally.
  const minutes = Math.round((expiresAt.getTime() - Date.now()) / 60_000);
  await sendEmail({
    to:      parsed.data.email,
    subject: `Your sign-in link for ${tenant.name}`,
    fromName: tenant.name,
    text:
      `Hi,\n\n` +
      `Click the link below to sign in to ${tenant.name}:\n\n` +
      `${link}\n\n` +
      `This link expires in ${minutes} minutes. If you didn't ask for this, you can ignore this email.\n`,
    html:
      `<p>Hi,</p>` +
      `<p>Click the link below to sign in to <strong>${escapeHtml(tenant.name)}</strong>:</p>` +
      `<p><a href="${link}" style="display:inline-block;padding:10px 16px;background:#7C3AED;color:white;` +
      `text-decoration:none;border-radius:8px;font-weight:600">Sign in to ${escapeHtml(tenant.name)}</a></p>` +
      `<p style="color:#6b7280;font-size:13px">Or copy this URL into your browser:<br>` +
      `<a href="${link}">${link}</a></p>` +
      `<p style="color:#6b7280;font-size:13px">This link expires in ${minutes} minutes. If you didn't ask for this, you can ignore this email.</p>`,
  }).catch((e) => {
    // Don't fail the request on email send error — log + keep going so
    // the user lands on "check your inbox" and can retry.
    console.error("[customer-auth] sendEmail failed:", e);
  });

  // Redirect to the "check inbox" page. We pass the email so we can
  // echo it back in the confirmation copy.
  redirect(
    `/shop/${slug}/account/signin/sent?email=${encodeURIComponent(parsed.data.email)}`,
  );
}

/** Sign out the customer for this tenant + redirect to storefront. */
export async function customerSignOut(slug: string) {
  const tenant = await db.tenant.findUnique({
    where: { slug },
    select: { id: true },
  });
  if (tenant) await signOutCustomer(tenant.id);
  redirect(`/shop/${slug}`);
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
