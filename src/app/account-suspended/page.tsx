import Link from "next/link";
import { auth, signOut } from "@/auth";
import { db } from "@/lib/db";

export default async function AccountSuspendedPage() {
  // Phase 17 Slice A — if the signed-in user belongs to any suspended
  // tenant, surface whatever reason platform staff wrote when they
  // suspended it. Multiple suspended tenants render as a list.
  const session = await auth();
  // Phase 1 — ARCHIVED joins SUSPENDED / CANCELED as a blocked state.
  // Archive carries its own explanatory copy so the user understands it
  // differs from a billing suspension (data preserved, needs platform
  // action to restore, permanent deletion scheduled).
  const blockedTenants = session?.user?.id
    ? await db.tenant.findMany({
        where: {
          status: { in: ["SUSPENDED", "CANCELED", "ARCHIVED"] },
          memberships: { some: { userId: session.user.id } },
        },
        select: {
          id: true,
          name: true,
          status: true,
          suspensionReason: true,
          archiveReason: true,
          scheduledDeletionAt: true,
        },
      })
    : [];

  // Phase 2 — an individually-suspended membership also lands here.
  // List those separately so the user understands whose workspace is
  // live but denying them (vs. a tenant-wide billing/archive issue).
  const suspendedMemberships = session?.user?.id
    ? await db.membership.findMany({
        where: {
          userId: session.user.id,
          status: "SUSPENDED",
          tenant: { status: { notIn: ["SUSPENDED", "CANCELED", "ARCHIVED"] } },
        },
        include: {
          tenant: { select: { id: true, name: true } },
        },
      })
    : [];

  return (
    <main className="mx-auto max-w-md px-6 py-24">
      <h1 className="text-2xl font-semibold">Account unavailable</h1>
      <p className="mt-2 text-sm" style={{ color: "var(--muted)" }}>
        Your workspace is not accessible right now. Please contact support for help restoring access.
      </p>

      {blockedTenants.length > 0 && (
        <div className="mt-6 space-y-3">
          {blockedTenants.map((t) => {
            const isArchived = t.status === "ARCHIVED";
            const tone = isArchived
              ? { bg: "var(--surface-2)",       fg: "var(--text-muted)",   border: "var(--border-subtle)" }
              : { bg: "var(--warning-surface)", fg: "var(--warning-fg)",   border: "var(--warning-fg)" };
            const reason = isArchived ? t.archiveReason : t.suspensionReason;
            return (
              <div
                key={t.id}
                className="rounded-md px-4 py-3 text-sm"
                style={{ background: tone.bg, color: tone.fg, border: `1px solid ${tone.border}` }}
              >
                <div className="font-medium">{t.name} · {t.status}</div>
                {reason ? (
                  <div className="mt-1 text-xs">{reason}</div>
                ) : (
                  <div className="mt-1 text-xs" style={{ color: "var(--text-muted)" }}>
                    No reason was provided. Reach out to support.
                  </div>
                )}
                {isArchived && t.scheduledDeletionAt && (
                  <div className="mt-2 text-xs" style={{ color: "var(--text-muted)" }}>
                    Data is retained until {t.scheduledDeletionAt.toISOString().slice(0, 10)} — contact support to restore.
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {suspendedMemberships.length > 0 && (
        <div className="mt-6 space-y-3">
          {suspendedMemberships.map((m) => (
            <div
              key={m.id}
              className="rounded-md px-4 py-3 text-sm"
              style={{
                background: "var(--warning-surface)",
                color: "var(--warning-fg)",
                border: "1px solid var(--warning-fg)",
              }}
            >
              <div className="font-medium">{m.tenant.name} · Membership suspended</div>
              <div className="mt-1 text-xs">
                An owner or admin paused your access to this workspace. Reach
                out to them to be reinstated.
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="mt-8 flex gap-3 text-sm">
        <Link href="/" className="underline" style={{ color: "var(--muted)" }}>
          Back to home
        </Link>
        {session?.user && (
          <form action={async () => { "use server"; await signOut({ redirectTo: "/" }); }}>
            <button type="submit" className="underline" style={{ color: "var(--muted)" }}>
              Sign out
            </button>
          </form>
        )}
      </div>
    </main>
  );
}
