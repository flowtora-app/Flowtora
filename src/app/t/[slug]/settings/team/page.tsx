import { requirePermission } from "@/lib/tenant";
import { db } from "@/lib/db";
import {
  inviteMember, revokeInvite, resendInvite,
  changeMemberRole, removeMember, updateMemberBranches,
  suspendMembership, reinstateMembership, transferOwnership,
} from "@/app/actions/team";
import { Button, Field, SelectField } from "@/components/Field";
import { Card, CardHeader } from "@/components/Card";
import { listActiveLocations } from "@/lib/locations";

// Phase 2 — team page upgraded.
//
// The prior version exposed role + branch management. This version adds
// the operational surfaces every shop asks for once they pass ~10 users:
//
//   • Last-login timestamp per member, so owners can spot stale seats.
//   • 2FA badge per member, so an owner can require 2FA by rotating out
//     unprotected users (and eventually pair with a "require 2FA for
//     admins" toggle).
//   • Suspend / reinstate a membership without deleting it (leave of
//     absence, contractor off-boarding with re-onboard expected).
//   • Transfer ownership with a hard confirm (type-to-confirm email).
//   • Split active vs. suspended members so the main list stays clean.

const ROLE_OPTIONS = [
  { value: "OWNER", label: "Owner" },
  { value: "ADMIN", label: "Admin" },
  { value: "SALES_REP", label: "Sales rep" },
  { value: "CSR", label: "Customer service" },
  { value: "DESIGNER", label: "Designer" },
  { value: "PRODUCTION_MANAGER", label: "Production manager" },
  { value: "INSTALLER", label: "Installer" },
  { value: "ACCOUNTING", label: "Accounting" },
  { value: "EMPLOYEE", label: "Employee" },
];
const INVITE_ROLES = ROLE_OPTIONS.filter((o) => o.value !== "OWNER");

export default async function TeamSettings({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ error?: string; ok?: string }>;
}) {
  const { slug } = await params;
  const sp = await searchParams;
  const ctx = await requirePermission(slug, "staff:manage");
  const inviteAction = inviteMember.bind(null, slug);
  const changeRole = changeMemberRole.bind(null, slug);
  const updateBranches = updateMemberBranches.bind(null, slug);
  const transfer = transferOwnership.bind(null, slug);

  const [members, pending, branches] = await Promise.all([
    db.membership.findMany({
      where: { tenantId: ctx.tenant.id },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            name: true,
            lastLoginAt: true,
            emailVerified: true,
            twoFactorEnabled: true,
          },
        },
      },
      orderBy: { createdAt: "asc" },
    }),
    db.invite.findMany({
      where: { tenantId: ctx.tenant.id, acceptedAt: null },
      orderBy: { createdAt: "desc" },
    }),
    listActiveLocations(ctx.tenant.id),
  ]);
  const showBranches = branches.length > 1;

  const active = members.filter((m) => m.status === "ACTIVE");
  const suspended = members.filter((m) => m.status === "SUSPENDED");
  const isCurrentOwner = ctx.role === "OWNER";
  const transferableActive = active.filter((m) => m.userId !== ctx.userId);

  return (
    <div className="space-y-4">
      {sp.ok && (
        <div
          role="status"
          className="rounded-md px-4 py-3 text-sm"
          style={{
            background: "var(--success-surface)",
            color: "var(--success-fg)",
            border: "1px solid var(--success-fg)",
          }}
        >
          {decodeURIComponent(sp.ok)}
        </div>
      )}

      <Card>
        <CardHeader title="Invite a teammate" />
        <form action={inviteAction} className="grid grid-cols-[1fr_180px_auto] gap-3 px-5 py-5">
          <Field label="Email" name="email" type="email" required />
          <SelectField label="Role" name="role" defaultValue="SALES_REP" options={INVITE_ROLES} />
          <div className="flex items-end">
            <Button type="submit">Send invite</Button>
          </div>
        </form>
        {sp.error && (
          <p className="px-5 pb-5 text-sm" style={{ color: "var(--danger-fg)" }}>{decodeURIComponent(sp.error)}</p>
        )}
      </Card>

      <Card>
        <CardHeader
          title="Members"
          description={`${active.length} active${suspended.length ? ` · ${suspended.length} suspended` : ""}`}
        />
        <ul>
          {active.map((m) => {
            const isSelf = m.userId === ctx.userId;
            const remove = removeMember.bind(null, slug, m.id);
            const suspend = suspendMembership.bind(null, slug, m.id);
            const memberBranchSet = new Set(m.locationIds);
            const allBranches = m.locationIds.length === 0;
            return (
              <li
                key={m.id}
                className="px-5 py-3"
                style={{ borderTop: "1px solid var(--border-subtle)" }}
              >
                <div className="flex items-center justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <div className="text-sm font-medium" style={{ color: "var(--text-default)" }}>
                        {m.user.name ?? m.user.email}
                      </div>
                      {isSelf && (
                        <span className="text-xs" style={{ color: "var(--text-faint)" }}>(you)</span>
                      )}
                      {m.user.twoFactorEnabled ? (
                        <Chip tone="success" title="Two-factor auth enabled">2FA</Chip>
                      ) : (
                        <Chip tone="warning" title="No two-factor auth">No 2FA</Chip>
                      )}
                      {!m.user.emailVerified && (
                        <Chip tone="warning" title="Email address unverified">Unverified</Chip>
                      )}
                    </div>
                    <div className="mt-0.5 text-xs" style={{ color: "var(--text-muted)" }}>
                      {m.user.email} · Last signed in{" "}
                      {m.user.lastLoginAt
                        ? m.user.lastLoginAt.toLocaleString()
                        : "never"}
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <form action={changeRole} className="flex items-center gap-2">
                      <input type="hidden" name="membershipId" value={m.id} />
                      <select
                        name="role"
                        defaultValue={m.role}
                        className="rounded-md px-2 py-1 text-sm"
                        style={{ background: "var(--surface-0)", border: "1px solid var(--border-default)", color: "var(--text-default)" }}
                        disabled={isSelf}
                      >
                        {ROLE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                      </select>
                      <button type="submit" className="text-xs underline" style={{ color: "var(--text-muted)" }} disabled={isSelf}>
                        Update
                      </button>
                    </form>
                    {!isSelf && (
                      <>
                        <form action={suspend}>
                          <button type="submit" className="text-xs underline" style={{ color: "var(--warning-fg)" }}>
                            Suspend
                          </button>
                        </form>
                        <form action={remove}>
                          <button type="submit" className="text-xs underline" style={{ color: "var(--danger-fg)" }}>
                            Remove
                          </button>
                        </form>
                      </>
                    )}
                  </div>
                </div>

                {showBranches && (
                  <form action={updateBranches} className="mt-3 flex flex-wrap items-center gap-2 text-xs">
                    <input type="hidden" name="membershipId" value={m.id} />
                    <span style={{ color: "var(--text-muted)" }}>Branches:</span>
                    {branches.map((b) => (
                      <label key={b.id} className="flex items-center gap-1 rounded px-2 py-0.5"
                        style={{ background: "var(--surface-0)", border: "1px solid var(--border-subtle)", color: "var(--text-default)" }}>
                        <input
                          type="checkbox"
                          name="locationIds"
                          value={b.id}
                          defaultChecked={memberBranchSet.has(b.id)}
                        />
                        {b.name}
                      </label>
                    ))}
                    <span style={{ color: "var(--text-faint)" }}>
                      {allBranches ? "(none checked = all branches)" : ""}
                    </span>
                    <button type="submit" className="ml-auto rounded px-2 py-0.5 underline"
                      style={{ color: "var(--text-muted)" }}>
                      Save branches
                    </button>
                  </form>
                )}
              </li>
            );
          })}
        </ul>
      </Card>

      {suspended.length > 0 && (
        <Card>
          <CardHeader
            title="Suspended"
            description="These members can't access the workspace until reinstated."
          />
          <ul>
            {suspended.map((m) => {
              const reinstate = reinstateMembership.bind(null, slug, m.id);
              const remove = removeMember.bind(null, slug, m.id);
              return (
                <li
                  key={m.id}
                  className="flex items-center justify-between gap-4 px-5 py-3"
                  style={{ borderTop: "1px solid var(--border-subtle)" }}
                >
                  <div>
                    <div className="text-sm" style={{ color: "var(--text-muted)" }}>
                      {m.user.name ?? m.user.email}
                    </div>
                    <div className="text-xs" style={{ color: "var(--text-faint)" }}>
                      {m.user.email} · {m.role.replace(/_/g, " ").toLowerCase()}
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <form action={reinstate}>
                      <button type="submit" className="text-xs underline" style={{ color: "var(--accent-primary)" }}>
                        Reinstate
                      </button>
                    </form>
                    <form action={remove}>
                      <button type="submit" className="text-xs underline" style={{ color: "var(--danger-fg)" }}>
                        Remove
                      </button>
                    </form>
                  </div>
                </li>
              );
            })}
          </ul>
        </Card>
      )}

      {isCurrentOwner && transferableActive.length > 0 && (
        <Card>
          <CardHeader
            title="Transfer ownership"
            description="Promote another active member to Owner. You'll be demoted to Admin automatically."
          />
          <form action={transfer} className="grid grid-cols-1 gap-3 px-5 py-5 sm:grid-cols-[1fr_1fr_auto]">
            <SelectField
              label="New owner"
              name="membershipId"
              options={transferableActive.map((m) => ({
                value: m.id,
                label: `${m.user.name ?? m.user.email} (${m.user.email})`,
              }))}
            />
            <Field
              label="Confirm new owner's email"
              name="confirmEmail"
              type="email"
              required
              hint="Retype to prevent accidental transfers."
            />
            <div className="flex items-end">
              <Button variant="danger" type="submit">Transfer ownership</Button>
            </div>
          </form>
        </Card>
      )}

      {pending.length > 0 && (
        <Card>
          <CardHeader title="Pending invites" />
          <ul>
            {pending.map((inv) => {
              const revoke = revokeInvite.bind(null, slug, inv.id);
              const resend = resendInvite.bind(null, slug, inv.id);
              return (
                <li key={inv.id} className="flex items-center justify-between px-5 py-3" style={{ borderTop: "1px solid var(--border-subtle)" }}>
                  <div className="text-sm" style={{ color: "var(--text-default)" }}>
                    {inv.email}
                    <span className="ml-2 text-xs" style={{ color: "var(--text-muted)" }}>
                      {inv.role.replace(/_/g, " ").toLowerCase()} · expires {inv.expiresAt.toISOString().slice(0, 10)}
                    </span>
                  </div>
                  <div className="flex items-center gap-3">
                    <form action={resend}>
                      <button type="submit" className="text-xs underline" style={{ color: "var(--text-muted)" }}>Resend</button>
                    </form>
                    <form action={revoke}>
                      <button type="submit" className="text-xs underline" style={{ color: "var(--danger-fg)" }}>Revoke</button>
                    </form>
                  </div>
                </li>
              );
            })}
          </ul>
        </Card>
      )}
    </div>
  );
}

function Chip({
  tone,
  title,
  children,
}: {
  tone: "success" | "warning";
  title?: string;
  children: React.ReactNode;
}) {
  const styles =
    tone === "success"
      ? { bg: "var(--success-surface)", fg: "var(--success-fg)", border: "var(--success-fg)" }
      : { bg: "var(--warning-surface)", fg: "var(--warning-fg)", border: "var(--warning-fg)" };
  return (
    <span
      title={title}
      className="rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide"
      style={{
        background: styles.bg,
        color: styles.fg,
        border: `1px solid ${styles.border}`,
      }}
    >
      {children}
    </span>
  );
}
