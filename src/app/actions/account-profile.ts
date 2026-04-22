"use server";

// Personal profile mutations — user-scoped, not tenant-scoped.
//
// Lives alongside account-security but split out because this file deals
// with displayable profile info (name, avatar) rather than auth material
// (password, 2FA, email). Keeps each file focused and the imports short.

import { redirect } from "next/navigation";
import { z } from "zod";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { revalidatePath } from "next/cache";
import { logAudit } from "@/lib/audit";

const PROFILE_SCHEMA = z.object({
  name: z
    .string()
    .trim()
    .max(80, "Name must be 80 characters or fewer")
    .optional(),
  image: z
    .string()
    .trim()
    .url("Avatar must be a valid URL")
    .or(z.literal(""))
    .optional(),
});

export async function saveUserProfile(slug: string, formData: FormData) {
  const session = await auth();
  if (!session?.user?.id) redirect(`/login?next=/t/${slug}/settings/me`);

  const parsed = PROFILE_SCHEMA.safeParse({
    name: formData.get("name")?.toString() ?? "",
    image: formData.get("image")?.toString() ?? "",
  });

  if (!parsed.success) {
    const msg = parsed.error.issues[0]?.message ?? "Invalid input";
    redirect(`/t/${slug}/settings/me?error=${encodeURIComponent(msg)}`);
  }

  const data = parsed.data;
  const name = data.name?.length ? data.name : null;
  // Empty string on the avatar input means "clear my avatar".
  const image = data.image?.length ? data.image : null;

  await db.user.update({
    where: { id: session.user.id },
    data: { name, image },
  });

  // User-scoped audit — we log it against the current tenant so admins
  // can see "someone updated their profile while using our workspace",
  // but the action name makes clear it's personal, not shop-wide.
  try {
    const tenant = await db.tenant.findUnique({ where: { slug } });
    if (tenant) {
      await logAudit({
        tenantId: tenant.id,
        userId: session.user.id,
        action: "account.profile_updated",
        metadata: { name: !!name, image: !!image },
      });
    }
  } catch {
    // audit failure shouldn't block the user-visible save
  }

  revalidatePath(`/t/${slug}/settings/me`);
  redirect(`/t/${slug}/settings/me?ok=${encodeURIComponent("Profile updated")}`);
}
