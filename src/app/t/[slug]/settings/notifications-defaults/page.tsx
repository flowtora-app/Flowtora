import { requireTenant } from "@/lib/tenant";
import { db } from "@/lib/db";
import { resolvePrefs, getPref, PREF_GROUPS } from "@/lib/notif-prefs";
import { saveNotifDefaults } from "@/app/actions/notif-prefs";
import { Card, CardHeader } from "@/components/Card";

// Phase 21 Slice C — tenant-wide notification defaults.
//
// Admins set a house default that new members inherit when they accept
// their invite. Existing members keep whatever they've already chosen —
// we don't retroactively overwrite personal prefs when the org default
// changes.

export default async function NotificationDefaultsPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ ok?: string; error?: string }>;
}) {
  const { slug } = await params;
  const sp = await searchParams;
  const ctx = await requireTenant(slug);

  const canEdit = ctx.can("tenant:manage");

  const tenant = await db.tenant.findUnique({
    where: { id: ctx.tenant.id },
    select: { defaultNotifPrefs: true },
  });

  const prefs = resolvePrefs(tenant?.defaultNotifPrefs);
  const emailEnabled = !!process.env.RESEND_API_KEY;

  return (
    <div className="space-y-6">
      <div>
        <h2
          className="text-base font-semibold"
          style={{ color: "var(--text-default)" }}
        >
          Notification defaults
        </h2>
        <p className="mt-1 text-sm" style={{ color: "var(--text-muted)" }}>
          Starting point for new members when they accept their invite. Existing
          members keep their personal choices — these defaults don&apos;t
          retroactively change anyone&apos;s preferences.
        </p>
        {!canEdit && (
          <div
            className="mt-3 rounded-lg px-4 py-3 text-sm"
            style={{
              background: "var(--warning-surface, #fefce8)",
              border: "1px solid var(--warning-border, #fde047)",
              color: "var(--warning-text, #713f12)",
            }}
          >
            Only owners and managers can edit defaults. You can review the
            current values below.
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
          Defaults saved.
        </div>
      )}
      {sp.error && (
        <div
          className="rounded-lg px-4 py-3 text-sm font-medium"
          style={{
            background: "var(--danger-surface)",
            color: "var(--danger-fg)",
            border: "1px solid var(--danger-fg)",
          }}
        >
          {sp.error}
        </div>
      )}

      <form action={saveNotifDefaults.bind(null, slug)}>
        <fieldset disabled={!canEdit} className="space-y-4">
          {PREF_GROUPS.map((group) => (
            <Card key={group.label}>
              <CardHeader title={group.label} />
              <div className="divide-y" style={{ borderColor: "var(--border-subtle)" }}>
                <div
                  className="grid grid-cols-[1fr_80px_80px] gap-4 px-5 py-2 text-xs font-semibold uppercase tracking-wide"
                  style={{ color: "var(--text-faint)" }}
                >
                  <span>Event</span>
                  <span className="text-center">In-app</span>
                  <span className="text-center">Email</span>
                </div>
                {group.items.map(({ type, label }) => {
                  const pref = getPref(prefs, type);
                  return (
                    <div
                      key={type}
                      className="grid grid-cols-[1fr_80px_80px] items-center gap-4 px-5 py-3"
                    >
                      <span className="text-sm" style={{ color: "var(--text-default)" }}>
                        {label}
                      </span>
                      <div className="flex justify-center">
                        <input
                          type="checkbox"
                          name={`inApp:${type}`}
                          defaultChecked={pref.inApp}
                          className="h-4 w-4 cursor-pointer rounded accent-[var(--accent)]"
                        />
                      </div>
                      <div className="flex justify-center">
                        <input
                          type="checkbox"
                          name={`email:${type}`}
                          defaultChecked={pref.email}
                          disabled={!emailEnabled || !canEdit}
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
        </fieldset>

        {canEdit && (
          <div className="mt-6 flex items-center gap-3">
            <button
              type="submit"
              className="rounded-lg px-5 py-2 text-sm font-semibold text-white transition-opacity hover:opacity-90"
              style={{ background: "var(--accent)" }}
            >
              Save defaults
            </button>
            <p className="text-xs" style={{ color: "var(--text-faint)" }}>
              Applied to new members only.
            </p>
          </div>
        )}
      </form>
    </div>
  );
}
