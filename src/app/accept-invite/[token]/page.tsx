import Link from "next/link";
import { db } from "@/lib/db";
import { auth } from "@/auth";
import { acceptInviteAsExistingUser, acceptInviteAsNewUser } from "@/app/actions/accept-invite";
import { Button, Field } from "@/components/Field";
import { Card, CardHeader } from "@/components/Card";

const ERROR_MESSAGES: Record<string, string> = {
  invite_not_found: "This invitation no longer exists.",
  invite_expired: "This invitation has expired. Ask for a new one.",
  invite_already_accepted: "This invitation has already been used.",
  invalid_input: "Please enter a name and a password (8+ characters).",
};

export default async function AcceptInvitePage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { token } = await params;
  const sp = await searchParams;

  const invite = await db.invite.findUnique({
    where: { token },
    include: { tenant: true },
  });

  if (!invite) return <Frame><Message title="Invite not found" body="This link is invalid." /></Frame>;
  if (invite.expiresAt < new Date()) return <Frame><Message title="Invite expired" body="Ask the shop owner to send a new one." /></Frame>;
  if (invite.acceptedAt) return <Frame><Message title="Already accepted" body={<>Sign in to access <Link href="/login" className="underline">your workspace</Link>.</>} /></Frame>;

  const session = await auth();
  const errorMessage = sp.error ? (ERROR_MESSAGES[sp.error] ?? decodeURIComponent(sp.error)) : null;

  // Existing user — one-click accept.
  if (session?.user?.email === invite.email) {
    const accept = acceptInviteAsExistingUser.bind(null, token);
    return (
      <Frame>
        <Card>
          <CardHeader title={`Join ${invite.tenant.name}`} description={`As ${invite.role.replace(/_/g, " ").toLowerCase()}.`} />
          <form action={accept} className="px-5 py-5">
            <Button type="submit">Accept invitation</Button>
          </form>
        </Card>
      </Frame>
    );
  }

  // Existing user, but signed in as someone else.
  if (session?.user?.email && session.user.email !== invite.email) {
    return (
      <Frame>
        <Message
          title="Wrong account"
          body={<>This invite was sent to <strong>{invite.email}</strong>. Sign out and sign in as that user to accept.</>}
        />
      </Frame>
    );
  }

  // New user — collect name + password and create the account.
  const accept = acceptInviteAsNewUser.bind(null, token);
  return (
    <Frame>
      <Card>
        <CardHeader title={`Join ${invite.tenant.name}`} description={`Create an account for ${invite.email}.`} />
        <form action={accept} className="space-y-4 px-5 py-5">
          <Field label="Your name" name="name" required />
          <Field label="Choose a password" name="password" type="password" minLength={8} required />
          {errorMessage && <p className="text-sm" style={{ color: "#ff6b6b" }}>{errorMessage}</p>}
          <Button type="submit">Accept and continue</Button>
          <p className="text-xs" style={{ color: "var(--muted)" }}>
            Already have an account? <Link href={`/login?next=/accept-invite/${token}`} className="underline">Sign in</Link>
          </p>
        </form>
      </Card>
    </Frame>
  );
}

function Frame({ children }: { children: React.ReactNode }) {
  return <main className="mx-auto max-w-md px-6 py-16">{children}</main>;
}

function Message({ title, body }: { title: string; body: React.ReactNode }) {
  return (
    <Card>
      <div className="px-5 py-5">
        <div className="text-sm font-semibold">{title}</div>
        <p className="mt-2 text-sm" style={{ color: "var(--muted)" }}>{body}</p>
      </div>
    </Card>
  );
}
