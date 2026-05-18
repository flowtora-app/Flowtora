import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { randomBytes } from "node:crypto";
import { db } from "@/lib/db";

// Customer-side auth — completely separate from staff auth.
//
// Staff auth uses NextAuth + the User table. Customers are stored in
// CustomerAccount (per-tenant) and authenticated via magic links
// stored in CustomerMagicLink. Sessions are server-side rows in
// CustomerSession identified by a random token kept in a cookie.
//
// Cookie naming: `cs_<tenantId>` so a single browser can be signed in
// to multiple shops at once. Each cookie is HTTP-only, Secure in prod,
// SameSite=Lax, with a 30-day expiry that rolls forward on use.
//
// The cookie value is the raw session token — we look it up in the
// DB on every request to verify and read out the linked account.

const SESSION_TTL_MS  = 30 * 24 * 60 * 60 * 1000; // 30 days
const MAGIC_LINK_TTL  = 15 * 60 * 1000;            // 15 minutes

function cookieName(tenantId: string): string {
  return `cs_${tenantId}`;
}

function newToken(): string {
  return randomBytes(32).toString("hex");
}

/** Tenant lookup keyed by slug. Cached for the request via the
 *  Prisma client's normal caching. */
async function tenantBySlug(slug: string) {
  return db.tenant.findUnique({
    where: { slug },
    select: { id: true, name: true, slug: true },
  });
}

/** Look up the signed-in customer for a given storefront request.
 *  Returns null if there's no session cookie, the token is invalid,
 *  or the session has expired. Rolls the lastActiveAt timestamp. */
export async function getCustomerSession(slug: string): Promise<{
  account: {
    id: string;
    email: string;
    firstName: string | null;
    lastName: string | null;
    customerId: string | null;
  };
  tenantId: string;
} | null> {
  const tenant = await tenantBySlug(slug);
  if (!tenant) return null;

  const jar = await cookies();
  const cookie = jar.get(cookieName(tenant.id))?.value;
  if (!cookie) return null;

  const session = await db.customerSession.findUnique({
    where: { token: cookie },
    include: {
      account: {
        select: {
          id: true,
          tenantId: true,
          email: true,
          firstName: true,
          lastName: true,
          customerId: true,
        },
      },
    },
  });
  if (!session || session.account.tenantId !== tenant.id) return null;
  if (session.expiresAt.getTime() < Date.now()) return null;

  // Roll the lastActive timestamp — cheap and gives us an inactivity
  // signal for future cleanup crons.
  await db.customerSession.update({
    where: { id: session.id },
    data: { lastActiveAt: new Date() },
  }).catch(() => { /* non-fatal */ });

  return {
    account: {
      id: session.account.id,
      email: session.account.email,
      firstName: session.account.firstName,
      lastName: session.account.lastName,
      customerId: session.account.customerId,
    },
    tenantId: tenant.id,
  };
}

/** Convenience: gate a server component on a signed-in customer,
 *  redirecting to /shop/{slug}/account/signin when absent. */
export async function requireCustomer(slug: string) {
  const sess = await getCustomerSession(slug);
  if (!sess) redirect(`/shop/${slug}/account/signin`);
  return sess;
}

/** Find or create a CustomerAccount for the given tenant+email pair.
 *  On first sign-in we try to attach to an existing Customer (CRM)
 *  row with the same email so the customer's history shows up. */
export async function findOrCreateAccount(tenantId: string, email: string) {
  const normalized = email.trim().toLowerCase();
  if (!normalized) throw new Error("Email is required");

  const existing = await db.customerAccount.findUnique({
    where: { tenantId_email: { tenantId, email: normalized } },
  });
  if (existing) return existing;

  // Look for an existing CRM Customer to attach to.
  const customer = await db.customer.findFirst({
    where: { tenantId, email: { equals: normalized, mode: "insensitive" } },
    select: { id: true, name: true },
  });

  // Split the Customer.name into first/last when we have one — a
  // surprisingly good heuristic for personal-ish names.
  let firstName: string | null = null;
  let lastName: string | null = null;
  if (customer?.name) {
    const parts = customer.name.trim().split(/\s+/);
    firstName = parts[0] ?? null;
    if (parts.length > 1) lastName = parts.slice(1).join(" ");
  }

  return db.customerAccount.create({
    data: {
      tenantId,
      email: normalized,
      customerId: customer?.id ?? null,
      firstName,
      lastName,
    },
  });
}

/** Generate a magic link row + URL. Caller is responsible for
 *  sending the email; we only mint the token. */
export async function createMagicLink(
  accountId: string,
  opts?: { redirectTo?: string },
): Promise<{ token: string; expiresAt: Date }> {
  const token = newToken();
  const expiresAt = new Date(Date.now() + MAGIC_LINK_TTL);
  await db.customerMagicLink.create({
    data: {
      accountId,
      token,
      redirectTo: opts?.redirectTo ?? null,
      expiresAt,
    },
  });
  return { token, expiresAt };
}

/** Consume a magic-link token. On success, mints a session and sets
 *  the cookie. Returns the redirect target (the link's `redirectTo`
 *  or null when unset). */
export async function consumeMagicLink(
  tenantId: string,
  token: string,
): Promise<{ redirectTo: string | null } | { error: string }> {
  const link = await db.customerMagicLink.findUnique({
    where: { token },
    include: {
      account: { select: { id: true, tenantId: true } },
    },
  });
  if (!link)                                  return { error: "Link not found" };
  if (link.account.tenantId !== tenantId)     return { error: "Link is for a different shop" };
  if (link.consumedAt)                        return { error: "Link already used" };
  if (link.expiresAt.getTime() < Date.now())  return { error: "Link expired — request a new one" };

  // Mark the link consumed + create a session in one go.
  const now = new Date();
  const sessionToken = newToken();
  const expiresAt = new Date(now.getTime() + SESSION_TTL_MS);

  await db.$transaction([
    db.customerMagicLink.update({
      where: { id: link.id },
      data: { consumedAt: now },
    }),
    db.customerSession.create({
      data: {
        accountId: link.account.id,
        token: sessionToken,
        expiresAt,
      },
    }),
    db.customerAccount.update({
      where: { id: link.account.id },
      data: { lastSignInAt: now },
    }),
  ]);

  // Drop the cookie.
  const jar = await cookies();
  jar.set(cookieName(tenantId), sessionToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });

  return { redirectTo: link.redirectTo };
}

/** Clear the customer session cookie + invalidate the session row. */
export async function signOutCustomer(tenantId: string): Promise<void> {
  const jar = await cookies();
  const name = cookieName(tenantId);
  const cookie = jar.get(name)?.value;
  if (cookie) {
    await db.customerSession.deleteMany({ where: { token: cookie } }).catch(() => { /* noop */ });
    jar.delete(name);
  }
}
