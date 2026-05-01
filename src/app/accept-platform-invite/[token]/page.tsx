import { notFound } from "next/navigation";
import { Card, CardBody, CardHeader } from "@/components/ui";
import { loadInviteLanding } from "@/server/platform/platform-invites";
import { stampInviteOpened } from "@/app/actions/platform-invites";
import { AcceptForm } from "./_components/AcceptForm";

export const dynamic = "force-dynamic";

const PLATFORM_ROLE_LABEL: Record<string, string> = {
  SUPER_ADMIN: "Super admin", SITE_MANAGER: "Site manager", SUPPORT_AGENT: "Support agent",
  ADMIN: "Admin", MANAGER: "Manager", SUPPORT_LEAD: "Support lead",
  BILLING_MANAGER: "Billing manager", DEVELOPER: "Developer",
  MARKETING_MANAGER: "Marketing manager", CONTENT_MANAGER: "Content manager",
  ANALYST: "Analyst", READ_ONLY_VIEWER: "Read-only viewer",
};

// Public landing page for accepting a platform-admin invite.
// Distinct from the legacy /accept-invite/[token] route that handles
// tenant-side workspace invitations.

export default async function AcceptPlatformInvitePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const invite = await loadInviteLanding(token);
  if (!invite) notFound();

  // Stamp openedAt — fire-and-forget. The user-facing path is fine
  // even if the audit row misses.
  void stampInviteOpened(token).catch(() => undefined);

  const isExpired = invite.expiresAt < new Date();
  const isResolved = invite.status === "ACCEPTED" || invite.status === "REVOKED";

  return (
    <div className="mx-auto max-w-xl px-4 py-12">
      <Card>
        <CardHeader
          title="You're invited to Flowtora"
          description={`${invite.invitedByName?.trim() || invite.invitedByEmail} added you as a platform admin.`}
        />
        <CardBody>
          {invite.status === "REVOKED" ? (
            <Banner tone="error">This invite was revoked. Ask the inviter to send a new one.</Banner>
          ) : invite.status === "ACCEPTED" ? (
            <Banner tone="ok">This invite has already been accepted.</Banner>
          ) : isExpired ? (
            <Banner tone="error">This invite has expired. Ask the inviter to resend it.</Banner>
          ) : (
            <div className="flex flex-col gap-4">
              <dl className="grid grid-cols-[140px_1fr] gap-y-1.5 text-[13px]">
                <Row label="Email"   value={invite.email} />
                <Row label="Role"    value={PLATFORM_ROLE_LABEL[invite.platformRole] ?? invite.platformRole} />
                {invite.customRoleName && <Row label="Custom role" value={invite.customRoleName} />}
                {invite.teamNames.length > 0 && (
                  <Row label="Teams" value={invite.teamNames.join(" · ")} />
                )}
                <Row label="Expires" value={invite.expiresAt.toLocaleString()} />
                {invite.mfaRequired && (
                  <Row label="MFA" value="Required at first sign-in" />
                )}
              </dl>
              {invite.customMessage && (
                <div className="rounded-md border p-3 text-[12px]"
                     style={{ borderColor: "var(--border-subtle)", background: "var(--surface-2)", color: "var(--text-default)" }}>
                  <div className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: "var(--text-faint)" }}>
                    Note from {invite.invitedByName?.trim() || invite.invitedByEmail}
                  </div>
                  <p className="mt-1 whitespace-pre-wrap">{invite.customMessage}</p>
                </div>
              )}
              <AcceptForm token={token} email={invite.email} />
            </div>
          )}
          {isResolved && (
            <p className="mt-3 text-[11px]" style={{ color: "var(--text-faint)" }}>
              Already a Flowtora admin? <a href="/login" className="hover:underline" style={{ color: "var(--accent-primary)" }}>Sign in</a>.
            </p>
          )}
        </CardBody>
      </Card>
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <>
      <dt style={{ color: "var(--text-muted)" }}>{label}</dt>
      <dd style={{ color: "var(--text-default)" }}>{value}</dd>
    </>
  );
}

function Banner({ tone, children }: { tone: "ok" | "error"; children: React.ReactNode }) {
  return (
    <div className="rounded-md border p-3 text-[12px]"
         style={{
           borderColor: tone === "ok" ? "var(--emerald-200)" : "var(--rose-200)",
           background: tone === "ok" ? "var(--emerald-50)" : "var(--rose-50)",
           color: tone === "ok" ? "var(--emerald-700)" : "var(--rose-700)",
         }}>
      {children}
    </div>
  );
}
