import { Card, CardBody, CardHeader } from "@/components/ui";
import type { UserProfile } from "@/server/platform/users-list";

const SIGN_IN_LABEL: Record<string, string> = {
  credentials: "Password",
  google: "Google",
  microsoft: "Microsoft",
  sso: "SAML / OIDC SSO",
  other: "Other",
};

export function ProfileTab({
  profile,
  membershipCount,
}: {
  profile: UserProfile;
  membershipCount: number;
}) {
  return (
    <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
      <Card>
        <CardHeader title="Identity" />
        <CardBody>
          <dl className="grid grid-cols-[140px_1fr] gap-y-1.5 text-[12px]">
            <Row label="Name"  value={profile.name ?? "—"} />
            <Row label="Email" value={
              <span className="flex items-center gap-1.5">
                {profile.email}
                {profile.emailVerified ? (
                  <span title="verified" className="inline-flex h-3 w-3 items-center justify-center rounded-full text-[8px] font-bold"
                        style={{ background: "var(--emerald-50)", color: "var(--emerald-700)" }}>✓</span>
                ) : (
                  <span title="unverified" className="inline-flex h-3 w-3 items-center justify-center rounded-full text-[8px] font-bold"
                        style={{ background: "var(--amber-50)", color: "var(--amber-700)" }}>!</span>
                )}
              </span>
            } />
            <Row label="Phone" value={
              profile.phone ? (
                <span className="flex items-center gap-1.5">
                  <span className="font-mono">{profile.phone}</span>
                  {profile.phoneVerifiedAt ? (
                    <span title="verified" className="inline-flex h-3 w-3 items-center justify-center rounded-full text-[8px] font-bold"
                          style={{ background: "var(--emerald-50)", color: "var(--emerald-700)" }}>✓</span>
                  ) : null}
                </span>
              ) : <span style={{ color: "var(--text-faint)" }}>—</span>
            } />
            <Row label="Language" value={profile.language ?? "—"} mono />
            <Row label="Timezone" value={profile.timezone ?? "—"} mono />
            <Row label="Country"  value={profile.country ?? "—"} />
            <Row label="Bio"      value={profile.bio ?? "—"} />
          </dl>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Account" />
        <CardBody>
          <dl className="grid grid-cols-[140px_1fr] gap-y-1.5 text-[12px]">
            <Row label="User ID"      value={<span className="font-mono">{profile.id}</span>} />
            <Row label="Created"      value={profile.createdAt.toLocaleString()} />
            <Row label="Last login"   value={profile.lastLoginAt ? profile.lastLoginAt.toLocaleString() : "never"} />
            <Row label="Tenants"      value={`${membershipCount}`} />
            <Row label="MFA"          value={profile.twoFactorEnabled ? "Enabled" : "Disabled"} />
            <Row label="Failed logins" value={`${profile.failedLoginCount}`} />
            {profile.lockedUntil && (
              <Row label="Locked until" value={profile.lockedUntil.toLocaleString()} />
            )}
            <Row label="Sign-in methods" value={
              profile.signInMethods.length === 0
                ? <span style={{ color: "var(--text-faint)" }}>none</span>
                : (
                  <div className="flex flex-wrap gap-1">
                    {profile.signInMethods.map((m) => (
                      <span key={m} className="inline-flex items-center rounded-full px-1.5 text-[10px]"
                            style={{ background: "var(--surface-2)", color: "var(--text-muted)" }}>
                        {SIGN_IN_LABEL[m] ?? m}
                      </span>
                    ))}
                  </div>
                )
            } />
          </dl>
        </CardBody>
      </Card>

      {profile.oauthIdentities.length > 0 && (
        <Card className="lg:col-span-2">
          <CardHeader title="Linked OAuth identities" />
          <CardBody>
            <ul className="divide-y" style={{ borderColor: "var(--border-subtle)" }}>
              {profile.oauthIdentities.map((id, i) => (
                <li key={i} className="flex items-center justify-between gap-2 py-2 text-[12px]">
                  <span className="font-medium" style={{ color: "var(--text-default)" }}>{id.provider}</span>
                  <span className="font-mono text-[11px]" style={{ color: "var(--text-muted)" }}>{id.providerAccountId}</span>
                </li>
              ))}
            </ul>
          </CardBody>
        </Card>
      )}

      {(profile.deactivatedAt || profile.bannedAt) && (
        <Card className="lg:col-span-2"
              style={{ borderColor: profile.bannedAt ? "var(--rose-300)" : "var(--amber-300)" }}>
          <CardHeader title={profile.bannedAt ? "Banned" : "Deactivated"} />
          <CardBody>
            <dl className="grid grid-cols-[140px_1fr] gap-y-1.5 text-[12px]">
              <Row label="At" value={(profile.bannedAt ?? profile.deactivatedAt)!.toLocaleString()} />
              <Row label="Reason" value={profile.bannedReason ?? profile.deactivatedReason ?? "—"} />
            </dl>
          </CardBody>
        </Card>
      )}
    </div>
  );
}

function Row({ label, value, mono }: { label: string; value: React.ReactNode; mono?: boolean }) {
  return (
    <>
      <dt className="text-[11px]" style={{ color: "var(--text-muted)" }}>{label}</dt>
      <dd className={mono ? "font-mono text-[11px]" : "text-[12px]"} style={{ color: "var(--text-default)" }}>
        {value}
      </dd>
    </>
  );
}
