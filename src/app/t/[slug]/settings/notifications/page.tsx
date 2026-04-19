import { requireTenant } from "@/lib/tenant";
import { db } from "@/lib/db";
import { resolvePrefs, resolveEffectivePref, PREF_GROUPS } from "@/lib/notif-prefs";
import { saveNotifPrefs, resetNotifPrefsToDefaults } from "@/app/actions/notif-prefs";
import { Card, CardHeader } from "@/components/Card";

export default async function NotificationPrefsPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ ok?: string }>;
}) {
  const { slug } = await params;
  const sp = await searchParams;
  const ctx = await requireTenant(slug);

  const [membership, user, tenant] = await Promise.all([
    db.membership.findFirst({
      where: { userId: ctx.userId, tenantId: ctx.tenant.id },
      select: { notifPrefs: true },
    }),
    db.user.findUnique({
      where: { id: ctx.userId },
      select: { email: true },
    }),
    db.tenant.findUnique({
      where: { id: ctx.tenant.id },
      select: { defaultNotifPrefs: true },
    }),
  ]);

  const prefs = resolvePrefs(membership?.notifPrefs);
  const tenantDefaults = resolvePrefs(tenant?.defaultNotifPrefs);

  const emailEnabled = !!process.env.RESEND_API_KEY;

  return (
    <div className="space-y-6">
      <div>
        <h2
          className="text-base font-semibold"
          style={{ color: "var(--text-default)" }}
        >
          Notification preferences
        </h2>
        <p className="mt-1 text-sm" style={{ color: "var(--text-muted)" }}>
          Choose how you want to be notified. In-app notifications appear in the
          bell icon. Email notifications are sent to{" "}
          <span className="font-medium" style={{ color: "var(--text-default)" }}>
            {user?.email}
          </span>
          .
        </p>
        {!emailEnabled && (
          <div
            className="mt-3 rounded-lg px-4 py-3 text-sm"
            style={{
              background: "var(--warning-surface, #fefce8)",
              border: "1px solid var(--warning-border, #fde047)",
              color: "var(--warning-text, #713f12)",
            }}
          >
            Email notifications are disabled — add{" "}
            <code className="font-mono text-xs">RESEND_API_KEY</code> to your
            environment to enable them.
          </div>
        )}
      </div>

      {sp.ok && (
        <div
          className="rounded-lg px-4 py-3 text-sm font-medium"
          style={{
            background: "var(--success-surface)",
            color: "var(--success-text)",
            border: "1px solid var(--success-border)",
          }}
        >
          Preferences saved.
        </div>
      )}

      <form action={saveNotifPrefs.bind(null, slug)}>
        <div className="space-y-4">
          {PREF_GROUPS.map((group) => (
            <Card key={group.label}>
              <CardHeader title={group.label} />
              <div className="divide-y" style={{ borderColor: "var(--border-subtle)" }}>
                {/* Column headers */}
                <div
                  className="grid grid-cols-[1fr_80px_80px] gap-4 px-5 py-2 text-xs font-semibold uppercase tracking-wide"
                  style={{ color: "var(--text-faint)" }}
                >
                  <span>Event</span>
                  <span className="text-center">In-app</span>
                  <span className="text-center">Email</span>
                </div>
                {group.items.map(({ type, label }) => {
                  const pref = resolveEffectivePref(prefs, tenantDefaults, type);
                  return (
                    <div
                      key={type}
                      className="grid grid-cols-[1fr_80px_80px] items-center gap-4 px-5 py-3"
                    >
                      <span className="text-sm" style={{ color: "var(--text-default)" }}>
                        {label}
                      </span>
                      {/* In-app toggle */}
                      <div className="flex justify-center">
                        <input
                          type="checkbox"
                          name={`inApp:${type}`}
                          defaultChecked={pref.inApp}
                          className="h-4 w-4 cursor-pointer rounded accent-[var(--accent)]"
                        />
                      </div>
                      {/* Email toggle */}
                      <div className="flex justify-center">
                        <input
                          type="checkbox"
                          name={`email:${type}`}
                          defaultChecked={pref.email}
                          disabled={!emailEnabled}
                          className="h-4 w-4 cursor-pointer rounded accent-[var(--accent)] disabled:opacity-40"
                          title={
                            emailEnabled
                              ? undefined
                              : "Email provider not configured"
                          }
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </Card>
          ))}
        </div>

        <div className="mt-6 flex items-center gap-3">
          <button
            type="submit"
            className="rounded-lg px-5 py-2 text-sm font-semibold text-white transition-opacity hover:opacity-90"
            style={{ background: "var(--accent)" }}
          >
            Save preferences
          </button>
          <p className="text-xs" style={{ color: "var(--text-faint)" }}>
            Preferences are personal — they only affect your account.
          </p>
        </div>
      </form>

      <form action={resetNotifPrefsToDefaults.bind(null, slug)}>
        <button
          type="submit"
          className="text-xs underline"
          style={{ color: "var(--text-muted)" }}
        >
          Reset to workspace defaults
        </button>
      </form>
    </div>
  );
}
