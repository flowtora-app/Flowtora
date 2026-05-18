import "server-only";
import { cookies } from "next/headers";
import { randomBytes } from "node:crypto";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { getCustomerSession } from "@/lib/customer-auth";

// Shopping cart resolution + mutation.
//
// Anonymous visitors get a session id stored in a `csess_{tenantId}`
// cookie. Signed-in customers use their CustomerAccount.id. The
// cookie persists across page loads, so adding an item then signing
// in doesn't lose the cart.
//
// On every `resolveOrCreateCart` call we also check whether a signed-
// in customer has an orphan anonymous cart attached to their cookie
// session id, and merge it into their account cart.

const COOKIE_PREFIX = "csess_";
const COOKIE_TTL_MS = 60 * 24 * 60 * 60 * 1000; // 60 days

function cookieName(tenantId: string): string {
  return `${COOKIE_PREFIX}${tenantId}`;
}

function newSessionId(): string {
  return randomBytes(24).toString("hex");
}

/** Get-or-create the cart for the current shopper on this storefront.
 *  Sets the session cookie on first call. Idempotent. */
export async function resolveOrCreateCart(slug: string): Promise<{
  cartId: string;
  tenantId: string;
  signedIn: boolean;
}> {
  const tenant = await db.tenant.findUnique({
    where: { slug },
    select: { id: true },
  });
  if (!tenant) throw new Error("Tenant not found");

  const sess = await getCustomerSession(slug);
  const jar = await cookies();

  // Ensure we have a session id either way — anonymous shoppers need
  // it to find their cart on the next page load.
  let sessionId = jar.get(cookieName(tenant.id))?.value ?? null;
  if (!sessionId) {
    sessionId = newSessionId();
    jar.set(cookieName(tenant.id), sessionId, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      expires: new Date(Date.now() + COOKIE_TTL_MS),
    });
  }

  // Signed-in branch: prefer the account cart. If the session cookie
  // also points at a different cart, merge its items in.
  if (sess) {
    let accountCart = await db.cart.findFirst({
      where: { tenantId: tenant.id, accountId: sess.account.id },
      select: { id: true },
    });
    if (!accountCart) {
      accountCart = await db.cart.create({
        data: { tenantId: tenant.id, accountId: sess.account.id, sessionId },
        select: { id: true },
      });
    }

    // Merge any orphan anonymous cart belonging to this session id.
    const orphan = await db.cart.findFirst({
      where: {
        tenantId: tenant.id,
        sessionId,
        accountId: null,
        id: { not: accountCart.id },
      },
      include: { items: true },
    });
    if (orphan && orphan.items.length > 0) {
      await db.$transaction([
        ...orphan.items.map((it) =>
          db.cartItem.update({
            where: { id: it.id },
            data: { cartId: accountCart!.id },
          }),
        ),
        db.cart.delete({ where: { id: orphan.id } }),
      ]);
    } else if (orphan) {
      // Empty orphan — just delete.
      await db.cart.delete({ where: { id: orphan.id } }).catch(() => { /* noop */ });
    }

    return { cartId: accountCart.id, tenantId: tenant.id, signedIn: true };
  }

  // Anonymous branch.
  let cart = await db.cart.findFirst({
    where: { tenantId: tenant.id, sessionId, accountId: null },
    select: { id: true },
  });
  if (!cart) {
    cart = await db.cart.create({
      data: { tenantId: tenant.id, sessionId },
      select: { id: true },
    });
  }
  return { cartId: cart.id, tenantId: tenant.id, signedIn: false };
}

export interface CartLineDraft {
  productId?:   string | null;
  name:         string;
  description?: string | null;
  configJson?:  Prisma.JsonValue | null;
  quantity:     number;
  unit?:        string;
  unitPrice:    number;
}

/** Add a line item to a cart + touch lastActiveAt. */
export async function addCartItem(cartId: string, line: CartLineDraft): Promise<void> {
  const total = line.quantity * line.unitPrice;
  await db.$transaction([
    db.cartItem.create({
      data: {
        cartId,
        productId:   line.productId ?? null,
        name:        line.name,
        description: line.description ?? null,
        configJson:  line.configJson ?? undefined,
        quantity:    line.quantity,
        unit:        line.unit ?? "ea",
        unitPrice:   line.unitPrice,
        total,
      },
    }),
    db.cart.update({
      where: { id: cartId },
      data: { lastActiveAt: new Date() },
    }),
  ]);
}

/** Update a cart line's quantity (and recompute total). */
export async function updateCartItemQty(
  cartId: string,
  itemId: string,
  qty: number,
): Promise<void> {
  const item = await db.cartItem.findFirst({
    where: { id: itemId, cartId },
    select: { id: true, unitPrice: true },
  });
  if (!item) return;
  const total = qty * Number(item.unitPrice);
  await db.cartItem.update({
    where: { id: item.id },
    data: { quantity: qty, total },
  });
  await db.cart.update({
    where: { id: cartId },
    data: { lastActiveAt: new Date() },
  });
}

/** Remove a single line. */
export async function removeCartItem(cartId: string, itemId: string): Promise<void> {
  await db.cartItem.deleteMany({ where: { id: itemId, cartId } });
  await db.cart.update({
    where: { id: cartId },
    data: { lastActiveAt: new Date() },
  });
}

/** Empty the cart. Used after the order is submitted. */
export async function clearCart(cartId: string): Promise<void> {
  await db.cartItem.deleteMany({ where: { cartId } });
}

/** Read the cart's items + computed subtotal. */
export async function getCartSummary(cartId: string): Promise<{
  items: Array<{
    id: string;
    name: string;
    description: string | null;
    quantity: number;
    unit: string;
    unitPrice: number;
    total: number;
    productId: string | null;
  }>;
  subtotal: number;
  itemCount: number;
}> {
  const rows = await db.cartItem.findMany({
    where: { cartId },
    orderBy: { createdAt: "asc" },
  });
  const items = rows.map((r) => ({
    id: r.id,
    name: r.name,
    description: r.description,
    quantity: Number(r.quantity),
    unit: r.unit,
    unitPrice: Number(r.unitPrice),
    total: Number(r.total),
    productId: r.productId,
  }));
  const subtotal = items.reduce((s, it) => s + it.total, 0);
  const itemCount = items.reduce((n, it) => n + it.quantity, 0);
  return { items, subtotal, itemCount };
}
