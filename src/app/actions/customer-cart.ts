"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import {
  addCartItem,
  removeCartItem,
  resolveOrCreateCart,
  updateCartItemQty,
} from "@/lib/cart";

// Storefront cart server actions.

const addSchema = z.object({
  productId: z.string().min(1),
  quantity:  z.coerce.number().positive().default(1),
});

/** Add a configured product to the shopper's cart and redirect to
 *  /cart. Called from the S-3 configurator's "Submit for quote" /
 *  "Add to cart" action. */
export async function addToCart(slug: string, formData: FormData) {
  const parsed = addSchema.safeParse({
    productId: formData.get("productId"),
    quantity:  formData.get("quantity") ?? "1",
  });
  if (!parsed.success) {
    redirect(`/shop/${slug}/order?error=${encodeURIComponent("Invalid item")}`);
  }

  const { cartId, tenantId } = await resolveOrCreateCart(slug);

  const product = await db.product.findFirst({
    where: { id: parsed.data.productId, tenantId, active: true },
    select: {
      id: true,
      name: true,
      description: true,
      unit: true,
      basePrice: true,
      pricingModel: true,
    },
  });
  if (!product) {
    redirect(`/shop/${slug}/order?error=${encodeURIComponent("Product not found")}`);
  }

  await addCartItem(cartId, {
    productId:   product.id,
    name:        product.name,
    description: product.description,
    quantity:    parsed.data.quantity,
    unit:        product.unit ?? "ea",
    unitPrice:   product.pricingModel === "CUSTOM_QUOTE" ? 0 : Number(product.basePrice),
  });

  revalidatePath(`/shop/${slug}/cart`);
  redirect(`/shop/${slug}/cart`);
}

const updateQtySchema = z.object({
  qty: z.coerce.number().positive(),
});

export async function updateCartLine(slug: string, itemId: string, formData: FormData) {
  const parsed = updateQtySchema.safeParse({ qty: formData.get("qty") });
  if (!parsed.success) {
    redirect(`/shop/${slug}/cart?error=${encodeURIComponent("Quantity must be greater than 0")}`);
  }
  const { cartId } = await resolveOrCreateCart(slug);
  await updateCartItemQty(cartId, itemId, parsed.data.qty);
  revalidatePath(`/shop/${slug}/cart`);
  redirect(`/shop/${slug}/cart`);
}

export async function removeCartLine(slug: string, itemId: string) {
  const { cartId } = await resolveOrCreateCart(slug);
  await removeCartItem(cartId, itemId);
  revalidatePath(`/shop/${slug}/cart`);
  redirect(`/shop/${slug}/cart`);
}
