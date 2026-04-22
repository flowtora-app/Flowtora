import { redirect } from "next/navigation";
import Link from "next/link";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { requireTenant } from "@/lib/tenant";
import { saveUserProfile } from "@/app/actions/account-profile";
import { Button, Field } from "@/components/Field";
import { Card, CardHeader } from "@/components/Card";
import { formatDateTime } from "@/lib/format";

// Me › Profile — personal, user-scoped settings.
//
// Lives inside /t/[slug]/settings for URL consistency, but every field
// on this page writes to the User row (not the Tenant row). A user sees
// the same values no matter which tenant they're currently viewing.
//
// Today's scope is intentionally tight: name + avatar URL + read-only
// facts about the account (email, 2FA status, last login). Deeper prefs
// (locale, timezone, per-event notifications) live on adjacent pages to
// avoid a kitchen-sink form.

export const dynamic = "force-dynamic";

type SP = { error?: string; ok?: string };

export default async function MeProfilePage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<SP>;
}) {
  const { slug } = await params;
  const sp = await searchParams;
  await requireTenant(slug);

  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const user = await db.user.findUnique({
    where: { id: session.user.id },
    select: {
      email: true,
      name: true,
      image: true,
      twoFactorEnabled: true,
      emailVerified: true,
      lastLoginAt: true,
      createdAt: true,
    },
  });
  if (!user) redirect("/login");

  const action = saveUserProfile.bind(null, slug);

  return (
    <div className="space-y-6">
      {sp.ok && (
        <div
          className="rounded-md px-4 py-2 text-sm"
          style={{
            background: "var(--success-surface)",
            color: "var(--success-fg)",
            border: "1px solid var(--success-fg)",
          }}
        >
          {decodeURIComponent(sp.ok)}
        </div>
      )}
      {sp.error && (
        <div
          className="rounded-md px-4 py-2 text-sm"
          style={{
            background: "var(--danger-surface)",
            color: "var(--danger-fg)",
            border: "1px solid var(--danger-fg)",
          }}
        >
          {decodeURIComponent(sp.error)}
        </div>
      )}

      {/* Editable profile — the only mutable card on this page. */}
      <Card>
        <CardHeader
          title="Profile"
          description="Your name and avatar, shown to your teammates across Flowtora."
        />
        <form action={action} className="space-y-4 px-5 py-5">
          <Field
            label="Display name"
            name="name"
            defaultValue={user.name ?? ""}
            placeholder="What should teammates call you?"
            maxLength={80}
          />
          <Field
            label="Avatar URL"
            name="image"
            type="url"
            defaultValue={user.image ?? ""}
            placeholder="https://…"
            hint="Paste a direct link to an image (square, 256×256 or larger). Leave blank to use your initials."
          />
          <div className="flex justify-end">
            <Button type="submit">Save profile</Button>
          </div>
        </form>
      </Card>

      {/* Read-only account facts. Each row points at the canonical page
          that can actually change it, so this card doesn't grow a
          second Save button. */}
      <Card>
        <CardHeader
          title="Account"
          description="Account-level facts. Use the linked pages to change them."
        />
        <dl className="divide-y text-sm" style={{ borderColor: "var(--border-subtle)" }}>
          <Row
            label="Email"
            value={user.email}
            extra={
              user.emailVerified
                ? null
                : <span style={{ color: "var(--warning-fg)" }}>Unverified</span>
            }
            link={{ href: `/t/${slug}/settings/security`, label: "Change" }}
          />
          <Row
            label="Two-factor authentication"
            value={user.twoFactorEnabled ? "Enabled" : "Disabled"}
            link={{
              href: `/t/${slug}/settings/security`,
              label: user.twoFactorEnabled ? "Manage" : "Enable",
            }}
          />
          <Row
            label="Last sign-in"
            value={user.lastLoginAt ? formatDateTime(user.lastLoginAt) : "Never"}
          />
          <Row
            label="Account created"
            value={formatDateTime(user.createdAt)}
          />
        </dl>
      </Card>
    </div>
  );
}

function Row({
  label,
  value,
  extra,
  link,
}: {
  label: string;
  value: string;
  extra?: React.ReactNode;
  link?: { href: string; label: string };
}) {
  return (
    <div className="flex items-center justify-between gap-4 px-5 py-3">
      <div>
        <dt className="text-xs uppercase tracking-wide" style={{ color: "var(--text-faint)" }}>
          {label}
        </dt>
        <dd className="mt-0.5 flex items-center gap-2" style={{ color: "var(--text-default)" }}>
          <span>{value}</span>
          {extra}
        </dd>
      </div>
      {link && (
        <Link
          href={link.href}
          className="text-xs underline"
          style={{ color: "var(--accent-primary)" }}
        >
          {link.label}
        </Link>
      )}
    </div>
  );
}
