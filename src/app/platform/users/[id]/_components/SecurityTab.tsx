import { Card, CardBody, CardHeader } from "@/components/ui";
import type { UserProfile, UserSecurityEvent } from "@/server/platform/users-list";

const SUSPICIOUS = new Set([
  "LOGIN_FAILED", "LOGIN_LOCKED", "PASSWORD_RESET_REQUESTED",
]);

export function SecurityTab({
  events,
  profile,
}: {
  events: UserSecurityEvent[];
  profile: UserProfile;
}) {
  return (
    <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
      <Card className="lg:col-span-1">
        <CardHeader title="MFA" />
        <CardBody>
          <dl className="grid grid-cols-2 gap-y-1.5 text-[12px]">
            <Row label="Status" value={profile.twoFactorEnabled ? "Enabled" : "Disabled"} />
            <Row label="Recovery codes" value={profile.twoFactorEnabled ? "Generated" : "—"} />
            <Row label="WebAuthn keys" value="—" />
            <Row label="SMS factor"   value="—" />
          </dl>
          <p className="mt-2 text-[11px]" style={{ color: "var(--text-faint)" }}>
            Today only TOTP is wired. WebAuthn + SMS factors are a roadmap item.
          </p>
        </CardBody>
      </Card>

      <Card className="lg:col-span-2">
        <CardHeader title={`Recent security events (${events.length})`}
                    description="Login attempts, password changes, and MFA events." />
        <CardBody>
          {events.length === 0 ? (
            <div className="rounded-md border border-dashed py-8 text-center text-[12px]"
                 style={{ borderColor: "var(--border-subtle)", color: "var(--text-faint)" }}>
              No events logged.
            </div>
          ) : (
            <ul className="divide-y" style={{ borderColor: "var(--border-subtle)" }}>
              {events.map((e) => (
                <li key={e.id} className="flex items-start justify-between gap-3 py-2 text-[12px]">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-mono" style={{ color: "var(--text-default)" }}>{e.kind}</span>
                      {SUSPICIOUS.has(e.kind) && (
                        <span className="inline-flex items-center rounded-full px-1.5 text-[9px] font-semibold uppercase"
                              style={{ background: "var(--rose-50)", color: "var(--rose-700)" }}>
                          Suspicious
                        </span>
                      )}
                    </div>
                    <div className="text-[10px] font-mono" style={{ color: "var(--text-faint)" }}>
                      {e.ipAddress ?? "—"} · {e.userAgent ?? "—"}
                    </div>
                  </div>
                  <span className="shrink-0 tabular-nums" style={{ color: "var(--text-muted)" }}>
                    {e.createdAt.toLocaleString()}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <>
      <dt className="text-[11px]" style={{ color: "var(--text-muted)" }}>{label}</dt>
      <dd className="text-[12px]" style={{ color: "var(--text-default)" }}>{value}</dd>
    </>
  );
}
