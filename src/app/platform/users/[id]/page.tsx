import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requirePlatformStaff } from "@/lib/platform";
import { Icon } from "@/components/shell/icons";
import {
  banUser,
  unbanUser,
  mergeUsers,
} from "@/app/actions/platform-trust-safety";
import type { TenantRole, MembershipStatus } from "@prisma/client";

// /platform/users/[id] — drill-down for a single end user.
//
// Shows: identity, status (banned / merged / clean), tenant memberships
// across all workspaces, ban history, merge history, ban + merge action
// surfaces.

export const dynamic = "force-dynamic";

type SP = { ok?: string; error?: string };

const MESSAGES: Record<string, string> = {
  banned:        "User banned. Active sessions revoked.",
  unbanned:      "Ban lifted.",
  already_banned: "User was already banned.",
  not_banned:    "User wasn't banned.",
  merged:        "Users merged. Source soft-deleted with mergedIntoId pointer.",
};

export default async function UserDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<SP>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const ctx = await requirePlatformStaff();
  const canBan   = ctx.can("users.ban");
  const canMerge = ctx.can("users.merge");

  const user = await db.user.findUnique({
    where: { id },
    select: {
      id: true,
      email: true,
      name: true,
      image: true,
      platformRole: true,
      lastLoginAt: true,
      twoFactorEnabled: true,
      createdAt: true,
      bannedAt: true,
      bannedReason: true,
      mergedIntoId: true,
      mergedAt: true,
      memberships: {
        select: {
          id: true,
          role: true,
          status: true,
          tenantId: true,
          createdAt: true,
          tenant: { select: { id: true, name: true, slug: true, status: true, plan: true } },
        },
      },
      banRecords: {
        orderBy: { issuedAt: "desc" },
        select: {
          id: true,
          reason: true,
          issuedAt: true,
          expiresAt: true,
          liftedAt: true,
          liftReason: true,
          issuedBy: { select: { email: true } },
          liftedBy: { select: { email: true } },
        },
      },
    },
  });
  if (!user) notFound();

  const [mergedInto, mergedFrom, similarUsers] = await Promise.all([
    user.mergedIntoId
      ? db.user.findUnique({ where: { id: user.mergedIntoId }, select: { id: true, email: true, name: true } })
      : null,
    db.user.findMany({
      where: { mergedIntoId: user.id },
      select: { id: true, email: true, name: true, mergedAt: true },
      orderBy: { mergedAt: "desc" },
    }),
    findSimilarUsers(user.email, user.name, user.id),
  ]);

  const display = user.name?.trim() || user.email;

  return (
    <div className="space-y-6">
      <Header user={user} display={display} />
      {sp.ok    ? <Toast tone="ok"    msg={MESSAGES[sp.ok] ?? "Done"} /> : null}
      {sp.error ? <Toast tone="error" msg={sp.error} /> : null}

      <Identity user={user} display={display} mergedInto={mergedInto} />

      <Memberships memberships={user.memberships} />

      {!user.mergedIntoId && (
        <BanCard user={user} canBan={canBan} />
      )}

      {user.banRecords.length > 0 && (
        <BanHistory rows={user.banRecords} />
      )}

      {!user.mergedIntoId && (
        <MergeCard
          targetUserId={user.id}
          targetEmail={user.email}
          similarUsers={similarUsers}
          canMerge={canMerge}
        />
      )}

      {mergedFrom.length > 0 && (
        <MergedFrom rows={mergedFrom} />
      )}
    </div>
  );
}

async function findSimilarUsers(
  email: string,
  name: string | null,
  excludeId: string,
) {
  const stem = email.split("@")[0]!.toLowerCase();
  const nameTrimmed = name?.trim();
  return db.user.findMany({
    where: {
      id: { not: excludeId },
      mergedIntoId: null,
      bannedAt: null,
      OR: [
        { email: { contains: stem, mode: "insensitive" } },
        ...(nameTrimmed && nameTrimmed.length >= 3
          ? [{ name: { contains: nameTrimmed, mode: "insensitive" } as const }]
          : []),
      ],
    },
    select: {
      id: true,
      email: true,
      name: true,
      _count: { select: { memberships: true } },
    },
    take: 10,
  });
}

/* ────────────────────────────────────────────────────────────── */

function Header({ user, display }: { user: { id: string; email: string }; display: string }) {
  return (
    <div className="flex items-end justify-between gap-4">
      <div>
        <Link href="/platform/users" className="text-[12px] underline" style={{ color: "var(--text-muted)" }}>
          ← All users
        </Link>
        <h1 className="mt-1 text-[26px] font-semibold leading-tight" style={{ color: "var(--text-default)" }}>
          {display}
        </h1>
        <p className="mt-1 text-[13px]" style={{ color: "var(--text-muted)" }}>
          {user.email}
        </p>
      </div>
      <Link
        href={`/platform/audit?entity=User&entityId=${user.id}`}
        className="ts-focus inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-[12px] font-medium"
        style={{ borderColor: "var(--border-subtle)", color: "var(--text-default)", background: "var(--surface-1)" }}
      >
        <Icon.FileText size={14} /> Audit trail
      </Link>
    </div>
  );
}

function Toast({ tone, msg }: { tone: "ok" | "error"; msg: string }) {
  const palette = tone === "ok"
    ? { bg: "var(--accent-surface)", fg: "var(--accent-primary)", icon: "✓" }
    : { bg: "var(--danger-surface)", fg: "var(--danger-fg)",      icon: "!" };
  return (
    <div className="flex items-center gap-2 rounded-md border px-3 py-2 text-[13px]" style={{ background: palette.bg, color: palette.fg, borderColor: palette.fg }}>
      <span aria-hidden className="font-bold">{palette.icon}</span>
      <span>{msg}</span>
    </div>
  );
}

function Identity({
  user,
  display,
  mergedInto,
}: {
  user: {
    id: string;
    email: string;
    name: string | null;
    image: string | null;
    platformRole: string | null;
    lastLoginAt: Date | null;
    twoFactorEnabled: boolean;
    createdAt: Date;
    bannedAt: Date | null;
    bannedReason: string | null;
    mergedAt: Date | null;
  };
  display: string;
  mergedInto: { id: string; email: string; name: string | null } | null;
}) {
  return (
    <section className="rounded-lg border" style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)" }}>
      <div className="grid grid-cols-1 gap-4 p-4 md:grid-cols-[auto_1fr_1fr]">
        <span
          className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-full text-[20px] font-semibold"
          style={{ background: "var(--accent-surface)", color: "var(--accent-primary)", border: "1px solid var(--border-subtle)" }}
        >
          {user.image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={user.image} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
          ) : (
            deriveInitials(display)
          )}
        </span>
        <div className="space-y-1 text-[13px]">
          <div><span style={{ color: "var(--text-muted)" }}>Email · </span>{user.email}</div>
          <div><span style={{ color: "var(--text-muted)" }}>Name · </span>{user.name || "—"}</div>
          <div><span style={{ color: "var(--text-muted)" }}>Joined · </span>{user.createdAt.toLocaleDateString()}</div>
          <div><span style={{ color: "var(--text-muted)" }}>Last login · </span>{user.lastLoginAt ? user.lastLoginAt.toLocaleString() : "Never"}</div>
          <div><span style={{ color: "var(--text-muted)" }}>2FA · </span>{user.twoFactorEnabled ? "Enabled" : "Off"}</div>
          {user.platformRole && (
            <div style={{ color: "var(--accent-primary)" }}>
              Platform staff · {user.platformRole.replace(/_/g, " ").toLowerCase()}
            </div>
          )}
        </div>
        <div className="space-y-2 text-[12px]">
          {user.bannedAt && (
            <div className="rounded-md border p-2" style={{ background: "var(--danger-surface)", borderColor: "var(--danger-fg)", color: "var(--danger-fg)" }}>
              <div className="font-semibold">BANNED</div>
              <div className="mt-0.5 text-[11px]">
                {user.bannedAt.toLocaleString()}
              </div>
              {user.bannedReason && (
                <div className="mt-1 italic">“{user.bannedReason}”</div>
              )}
            </div>
          )}
          {mergedInto && (
            <div className="rounded-md border p-2" style={{ background: "var(--surface-2)", borderColor: "var(--border-subtle)", color: "var(--text-default)" }}>
              <div className="font-semibold">MERGED</div>
              <div className="mt-0.5 text-[11px]" style={{ color: "var(--text-muted)" }}>
                {user.mergedAt?.toLocaleString() ?? ""}
              </div>
              <div className="mt-1">
                Records consolidated into{" "}
                <Link href={`/platform/users/${mergedInto.id}`} className="ts-focus underline" style={{ color: "var(--accent-primary)" }}>
                  {mergedInto.name || mergedInto.email}
                </Link>
              </div>
            </div>
          )}
          {!user.bannedAt && !mergedInto && (
            <div className="rounded-md border p-2" style={{ background: "var(--accent-surface)", borderColor: "var(--accent-primary)", color: "var(--accent-primary)" }}>
              <div className="font-semibold">ACTIVE</div>
              <div className="mt-0.5 text-[11px]">No active ban or merge.</div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

function Memberships({
  memberships,
}: {
  memberships: {
    id: string;
    role: TenantRole;
    status: MembershipStatus;
    tenantId: string;
    createdAt: Date;
    tenant: { id: string; name: string; slug: string; status: string; plan: string };
  }[];
}) {
  return (
    <section className="rounded-lg border" style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)" }}>
      <div className="border-b px-4 py-3" style={{ borderColor: "var(--border-subtle)" }}>
        <h2 className="text-[14px] font-semibold" style={{ color: "var(--text-default)" }}>
          Tenant memberships ({memberships.length})
        </h2>
      </div>
      {memberships.length === 0 ? (
        <div className="px-4 py-6 text-center text-[13px]" style={{ color: "var(--text-muted)" }}>
          No tenant memberships.
        </div>
      ) : (
        <ul className="divide-y" style={{ borderColor: "var(--border-subtle)" }}>
          {memberships.map((m) => (
            <li key={m.id} className="flex flex-wrap items-center gap-3 px-4 py-3 text-[13px]">
              <Link
                href={`/platform/tenants/${m.tenant.id}`}
                className="ts-focus min-w-0 flex-1 truncate font-medium hover:underline"
                style={{ color: "var(--text-default)" }}
              >
                {m.tenant.name}
              </Link>
              <span className="text-[11px]" style={{ color: "var(--text-muted)" }}>
                {m.tenant.plan} · {m.tenant.status}
              </span>
              <span
                className="rounded px-1.5 py-0.5 text-[11px] font-medium"
                style={{ background: "var(--surface-2)", color: "var(--text-default)", border: "1px solid var(--border-subtle)" }}
              >
                {m.role}
              </span>
              <span
                className="rounded px-1.5 py-0.5 text-[10px] font-bold uppercase"
                style={{
                  background: m.status === "ACTIVE" ? "var(--accent-surface)" : "var(--surface-2)",
                  color: m.status === "ACTIVE" ? "var(--accent-primary)" : "var(--text-muted)",
                }}
              >
                {m.status}
              </span>
              <span className="text-[11px]" style={{ color: "var(--text-muted)" }}>
                since {m.createdAt.toLocaleDateString()}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/* ────────────────────────────────────────────────────────────── */

function BanCard({
  user,
  canBan,
}: {
  user: { id: string; bannedAt: Date | null };
  canBan: boolean;
}) {
  const isBanned = !!user.bannedAt;
  return (
    <section className="rounded-lg border" style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)" }}>
      <div className="border-b px-4 py-3" style={{ borderColor: "var(--border-subtle)" }}>
        <h2 className="text-[14px] font-semibold" style={{ color: "var(--text-default)" }}>
          {isBanned ? "Lift ban" : "Ban this user"}
        </h2>
        <p className="text-[12px]" style={{ color: "var(--text-muted)" }}>
          {isBanned
            ? "Lifting clears the ban + restores sign-in. The historical record stays."
            : "Refuses sign-in immediately and revokes all active sessions. Reversible."}
        </p>
      </div>
      <form
        action={(isBanned ? unbanUser : banUser).bind(null, user.id)}
        className="grid grid-cols-1 gap-3 p-4 md:grid-cols-[2fr_1fr_auto]"
      >
        <Field label="Reason" required={!isBanned}>
          <input
            type="text"
            name={isBanned ? "liftReason" : "reason"}
            disabled={!canBan}
            required={!isBanned}
            placeholder={isBanned ? "Why is this ban being lifted?" : "Spam, abuse, ToS violation…"}
            className="ts-focus w-full rounded-md border px-3 py-2 text-[13px]"
            style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)", color: "var(--text-default)" }}
          />
        </Field>
        {!isBanned && (
          <Field label="Expires" hint="Blank = never">
            <input
              type="date" name="expiresAt" disabled={!canBan}
              className="ts-focus w-full rounded-md border px-3 py-2 text-[13px]"
              style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)", color: "var(--text-default)" }}
            />
          </Field>
        )}
        <div className={(isBanned ? "md:col-start-3 " : "") + "flex items-end"}>
          <button
            type="submit" disabled={!canBan}
            className="ts-focus h-[38px] rounded-md px-4 text-[13px] font-medium disabled:cursor-not-allowed disabled:opacity-50"
            style={
              isBanned
                ? { background: "var(--accent-primary)", color: "var(--accent-on-primary)" }
                : { background: "var(--danger-fg)", color: "var(--surface-1)" }
            }
          >
            {isBanned ? "Lift ban ✓" : "Ban user"}
          </button>
        </div>
      </form>
    </section>
  );
}

function BanHistory({
  rows,
}: {
  rows: {
    id: string;
    reason: string;
    issuedAt: Date;
    expiresAt: Date | null;
    liftedAt: Date | null;
    liftReason: string | null;
    issuedBy: { email: string };
    liftedBy: { email: string } | null;
  }[];
}) {
  return (
    <section className="rounded-lg border" style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)" }}>
      <div className="border-b px-4 py-3" style={{ borderColor: "var(--border-subtle)" }}>
        <h2 className="text-[14px] font-semibold" style={{ color: "var(--text-default)" }}>
          Ban history ({rows.length})
        </h2>
      </div>
      <ul className="divide-y" style={{ borderColor: "var(--border-subtle)" }}>
        {rows.map((r) => (
          <li key={r.id} className="px-4 py-3 text-[12px]">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span
                  className="rounded px-1.5 py-0.5 text-[10px] font-bold uppercase"
                  style={
                    r.liftedAt
                      ? { background: "var(--surface-2)", color: "var(--text-muted)" }
                      : r.expiresAt && r.expiresAt < new Date()
                      ? { background: "var(--surface-2)", color: "var(--text-muted)" }
                      : { background: "var(--danger-surface)", color: "var(--danger-fg)" }
                  }
                >
                  {r.liftedAt ? "Lifted" : r.expiresAt && r.expiresAt < new Date() ? "Expired" : "Active"}
                </span>
                <span style={{ color: "var(--text-default)" }}>
                  {r.issuedAt.toLocaleString()}
                </span>
              </div>
              <span style={{ color: "var(--text-muted)" }}>
                by {r.issuedBy.email}
              </span>
            </div>
            <div className="mt-1 italic" style={{ color: "var(--text-default)" }}>“{r.reason}”</div>
            {r.expiresAt && (
              <div className="mt-0.5 text-[11px]" style={{ color: "var(--text-muted)" }}>
                Auto-expires {r.expiresAt.toLocaleString()}
              </div>
            )}
            {r.liftedAt && (
              <div className="mt-0.5 text-[11px]" style={{ color: "var(--text-muted)" }}>
                Lifted {r.liftedAt.toLocaleString()} by {r.liftedBy?.email ?? "system"}
                {r.liftReason && ` — “${r.liftReason}”`}
              </div>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

/* ────────────────────────────────────────────────────────────── */

function MergeCard({
  targetUserId,
  targetEmail,
  similarUsers,
  canMerge,
}: {
  targetUserId: string;
  targetEmail: string;
  similarUsers: { id: string; email: string; name: string | null; _count: { memberships: number } }[];
  canMerge: boolean;
}) {
  return (
    <section className="rounded-lg border" style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)" }}>
      <div className="border-b px-4 py-3" style={{ borderColor: "var(--border-subtle)" }}>
        <h2 className="text-[14px] font-semibold" style={{ color: "var(--text-default)" }}>
          Merge another account into <strong>{targetEmail}</strong>
        </h2>
        <p className="text-[12px]" style={{ color: "var(--text-muted)" }}>
          Pick a source account. Its memberships and auth links transfer to
          this user. The source is soft-deleted (audit history kept). Cannot
          be undone — confirm the right direction before clicking.
        </p>
      </div>
      <form action={mergeUsers.bind(null, targetUserId)} className="grid grid-cols-1 gap-3 p-4 md:grid-cols-[2fr_2fr_auto]">
        <Field label="Source user" required>
          <select
            name="sourceUserId" required disabled={!canMerge}
            className="ts-focus w-full rounded-md border px-3 py-2 text-[13px]"
            style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)", color: "var(--text-default)" }}
          >
            <option value="">— pick a candidate —</option>
            {similarUsers.map((u) => (
              <option key={u.id} value={u.id}>
                {u.email} ({u._count.memberships} tenants)
              </option>
            ))}
          </select>
        </Field>
        <Field label="Reason" required hint="Audit trail">
          <input
            type="text" name="reason" required disabled={!canMerge}
            placeholder="Same person, two accounts (corp + personal email)"
            className="ts-focus w-full rounded-md border px-3 py-2 text-[13px]"
            style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)", color: "var(--text-default)" }}
          />
        </Field>
        <div className="flex items-end">
          <button
            type="submit" disabled={!canMerge || similarUsers.length === 0}
            className="ts-focus h-[38px] rounded-md px-4 text-[13px] font-medium disabled:cursor-not-allowed disabled:opacity-50"
            style={{ background: "var(--accent-primary)", color: "var(--accent-on-primary)" }}
          >
            Merge into this user
          </button>
        </div>
      </form>
      {similarUsers.length === 0 && (
        <div className="border-t px-4 py-2 text-[11px]" style={{ borderColor: "var(--border-subtle)", color: "var(--text-muted)" }}>
          No candidate matches found by email stem or name. Search by email
          on /platform/users to find the right source.
        </div>
      )}
    </section>
  );
}

function MergedFrom({
  rows,
}: {
  rows: { id: string; email: string; name: string | null; mergedAt: Date | null }[];
}) {
  return (
    <section className="rounded-lg border" style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)" }}>
      <div className="border-b px-4 py-3" style={{ borderColor: "var(--border-subtle)" }}>
        <h2 className="text-[14px] font-semibold" style={{ color: "var(--text-default)" }}>
          Accounts merged into this user ({rows.length})
        </h2>
      </div>
      <ul className="divide-y" style={{ borderColor: "var(--border-subtle)" }}>
        {rows.map((r) => (
          <li key={r.id} className="flex flex-wrap items-center gap-3 px-4 py-3 text-[12px]">
            <Link
              href={`/platform/users/${r.id}`}
              className="ts-focus min-w-0 flex-1 truncate font-medium hover:underline"
              style={{ color: "var(--text-default)" }}
            >
              {r.name || r.email}
            </Link>
            <span style={{ color: "var(--text-muted)" }}>{r.email}</span>
            <span style={{ color: "var(--text-muted)" }}>
              {r.mergedAt ? r.mergedAt.toLocaleString() : ""}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

/* ────────────────────────────────────────────────────────────── */

function Field({
  label,
  required,
  hint,
  children,
}: {
  label: string;
  required?: boolean;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="block text-[11px] font-medium uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>
        {label}{required ? " *" : ""}
      </span>
      {hint && <span className="block text-[10px]" style={{ color: "var(--text-muted)" }}>{hint}</span>}
      <span className="mt-1 block">{children}</span>
    </label>
  );
}

function deriveInitials(source: string): string {
  const trimmed = source.trim();
  if (!trimmed) return "?";
  const stem = trimmed.includes("@") ? trimmed.split("@")[0]! : trimmed;
  const parts = stem.split(/[\s._-]+/).filter(Boolean);
  if (parts.length === 0) return stem.slice(0, 2).toUpperCase();
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return (parts[0]![0]! + parts[parts.length - 1]![0]!).toUpperCase();
}
