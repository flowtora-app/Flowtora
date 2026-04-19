"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { signIn, auth } from "@/auth";
import { logAudit } from "@/lib/audit";

async function consumeInvite(token: string, userId: string) {
  const invite = await db.invite.findUnique({ where: { token } });
  if (!invite) throw new Error("invite_not_found");
  if (invite.acceptedAt) throw new Error("invite_already_accepted");
  if (invite.expiresAt < new Date()) throw new Error("invite_expired");

  // Phase 21 Slice C — seed tenant notification defaults so first-time
  // members inherit the admin's house setup. On re-accept (upsert update
  // branch) we don't overwrite personal prefs someone may already have set.
  const tenant = await db.tenant.findUnique({
    where: { id: invite.tenantId },
    select: { defaultNotifPrefs: true },
  });
  const seedPrefs = tenant?.defaultNotifPrefs ?? {};

  return db.$transaction(async (tx) => {
    const membership = await tx.membership.upsert({
      where: { userId_tenantId: { userId, tenantId: invite.tenantId } },
      update: { role: invite.role, status: "ACTIVE" },
      create: {
        userId,
        tenantId: invite.tenantId,
        role: invite.role,
        notifPrefs: seedPrefs as never,
      },
    });
    await tx.invite.update({
      where: { id: invite.id },
      data: { acceptedAt: new Date() },
    });
    return { membership, invite };
  });
}

export async function acceptInviteAsExistingUser(token: string) {
  const session = await auth();
  if (!session?.user?.id) redirect(`/login?next=/accept-invite/${token}`);

  try {
    const { invite } = await consumeInvite(token, session.user.id);
    const tenant = await db.tenant.findUnique({ where: { id: invite.tenantId } });
    await logAudit({ tenantId: invite.tenantId, userId: session.user.id, action: "team.invite_accepted" });
    redirect(`/t/${tenant!.slug}/dashboard`);
  } catch (err) {
    if ((err as { digest?: string }).digest?.startsWith("NEXT_REDIRECT")) throw err;
    redirect(`/accept-invite/${token}?error=${(err as Error).message}`);
  }
}

const signupAndAcceptSchema = z.object({
  name: z.string().min(1).max(120),
  password: z.string().min(8).max(200),
});

export async function acceptInviteAsNewUser(token: string, formData: FormData) {
  const parsed = signupAndAcceptSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) redirect(`/accept-invite/${token}?error=invalid_input`);

  const invite = await db.invite.findUnique({ where: { token } });
  if (!invite) redirect(`/accept-invite/${token}?error=invite_not_found`);
  if (invite.acceptedAt) redirect(`/accept-invite/${token}?error=invite_already_accepted`);
  if (invite.expiresAt < new Date()) redirect(`/accept-invite/${token}?error=invite_expired`);

  const existing = await db.user.findUnique({ where: { email: invite.email } });
  if (existing) {
    redirect(`/login?next=/accept-invite/${token}&error=${encodeURIComponent("Sign in to accept this invite.")}`);
  }

  const passwordHash = await bcrypt.hash(parsed.data.password, 12);
  const user = await db.user.create({
    data: {
      email: invite.email,
      name: parsed.data.name,
      passwordHash,
      emailVerified: new Date(),
    },
  });

  await consumeInvite(token, user.id);
  await logAudit({ tenantId: invite.tenantId, userId: user.id, action: "team.invite_accepted" });

  const tenant = await db.tenant.findUnique({ where: { id: invite.tenantId } });
  await signIn("credentials", {
    email: invite.email,
    password: parsed.data.password,
    redirectTo: `/t/${tenant!.slug}/dashboard`,
  });
}
