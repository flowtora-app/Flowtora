import Link from "next/link";
import { db } from "@/lib/db";
import { requirePlatformStaff } from "@/lib/platform";
import { Icon } from "@/components/shell/icons";
import {
  banIp,
  banEmailDomain,
  liftBanRecord,
} from "@/app/actions/platform-trust-safety";
import type { BanKind } from "@prisma/client";

// /platform/abuse — ban list management.
//
// Three sections, one per kind:
//   1. Banned users — link out to /platform/users/[id] (lifting goes there).
//   2. Banned IPs   — inline ban + lift form.
//   3. Banned email domains — inline ban + lift form.
//
// Active bans are listed first; lifted/expired bans show in a collapsed
// history section.

export const dynamic = "force-dynamic";

type SP = { ok?: string; error?: string };

const MESSAGES: Record<string, string> = {
  ip_banned:            "IP banned. New sign-ups + sign-ins from this address will be refused.",
  ip_already_banned:    "IP was already on the active ban list.",
  domain_banned:        "Domain banned. Anyone @that-domain will be refused on sign-in.",
  domain_already_banned: "Domain was already on the active ban list.",
  lifted:               "Ban lifted.",
  already_lifted:       "Ban was already lifted.",
};

export default async function AbusePage({
  searchParams,
}: {
  searchParams: Promise<SP>;
}) {
  const ctx = await requirePlatformStaff();
  const sp = await searchParams;
  const canBan = ctx.can("users.ban");

  const now = new Date();
  const [activeUsers, activeIps, activeDomains, history] = await Promise.all([
    // Banned users: User rows with bannedAt set + their freshest active record.
    db.user.findMany({
      where: { bannedAt: { not: null } },
      select: {
        id: true, email: true, name: true, bannedAt: true, bannedReason: true,
        banRecords: {
          where: {
            liftedAt: null,
            OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
          },
          orderBy: { issuedAt: "desc" },
          take: 1,
          select: {
            id: true, expiresAt: true,
            issuedBy: { select: { email: true } },
          },
        },
      },
      orderBy: { bannedAt: "desc" },
      take: 100,
    }),
    db.banRecord.findMany({
      where: {
        kind: "IP",
        liftedAt: null,
        OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
      },
      orderBy: { issuedAt: "desc" },
      include: { issuedBy: { select: { email: true } } },
    }),
    db.banRecord.findMany({
      where: {
        kind: "EMAIL_DOMAIN",
        liftedAt: null,
        OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
      },
      orderBy: { issuedAt: "desc" },
      include: { issuedBy: { select: { email: true } } },
    }),
    db.banRecord.findMany({
      where: {
        kind: { in: ["IP", "EMAIL_DOMAIN"] },
        OR: [{ liftedAt: { not: null } }, { expiresAt: { lt: now } }],
      },
      orderBy: { issuedAt: "desc" },
      take: 30,
      include: {
        issuedBy: { select: { email: true } },
        liftedBy: { select: { email: true } },
      },
    }),
  ]);

  return (
    <div className="space-y-6">
      <Header />
      {sp.ok    ? <Toast tone="ok"    msg={MESSAGES[sp.ok] ?? "Done"} /> : null}
      {sp.error ? <Toast tone="error" msg={sp.error} /> : null}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
        <Kpi label="Banned users"     value={String(activeUsers.length)} />
        <Kpi label="Banned IPs"       value={String(activeIps.length)} />
        <Kpi label="Banned domains"   value={String(activeDomains.length)} />
      </div>

      <BannedUsersList rows={activeUsers} />
      <BannedIpsCard rows={activeIps} canBan={canBan} />
      <BannedDomainsCard rows={activeDomains} canBan={canBan} />
      {history.length > 0 && <BanHistory rows={history} />}
    </div>
  );
}

/* ────────────────────────────────────────────────────────────── */

function Header() {
  return (
    <div className="flex items-end justify-between gap-4">
      <div>
        <div className="flex items-center gap-2 text-[12px] font-medium uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>
          <Icon.Shield size={14} />
          <span>Phase 4 · Trust &amp; Safety</span>
        </div>
        <h1 className="mt-1 text-[26px] font-semibold leading-tight" style={{ color: "var(--text-default)" }}>
          Abuse &amp; bans
        </h1>
        <p className="mt-1 text-[13px]" style={{ color: "var(--text-muted)" }}>
          Active ban list across users, IP addresses, and email domains.
          Bans can have an auto-expiry or be open-ended; lift any time.
        </p>
      </div>
      <Link
        href="/platform/users"
        className="ts-focus inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-[12px] font-medium"
        style={{ borderColor: "var(--border-subtle)", color: "var(--text-default)", background: "var(--surface-1)" }}
      >
        <Icon.Customers size={14} /> Users directory →
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

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border px-4 py-3" style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)" }}>
      <div className="text-[11px] font-medium uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>{label}</div>
      <div className="mt-1 text-[22px] font-semibold leading-none" style={{ color: "var(--text-default)" }}>{value}</div>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────── */

function BannedUsersList({
  rows,
}: {
  rows: {
    id: string;
    email: string;
    name: string | null;
    bannedAt: Date | null;
    bannedReason: string | null;
    banRecords: { id: string; expiresAt: Date | null; issuedBy: { email: string } }[];
  }[];
}) {
  return (
    <section className="rounded-lg border" style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)" }}>
      <div className="border-b px-4 py-3" style={{ borderColor: "var(--border-subtle)" }}>
        <h2 className="text-[14px] font-semibold" style={{ color: "var(--text-default)" }}>
          Banned users ({rows.length})
        </h2>
        <p className="text-[12px]" style={{ color: "var(--text-muted)" }}>
          Click through to lift the ban or review the audit trail.
        </p>
      </div>
      {rows.length === 0 ? (
        <div className="px-4 py-6 text-center text-[12px]" style={{ color: "var(--text-muted)" }}>
          No banned users.
        </div>
      ) : (
        <ul className="divide-y" style={{ borderColor: "var(--border-subtle)" }}>
          {rows.map((u) => {
            const r = u.banRecords[0];
            return (
              <li key={u.id} className="flex flex-wrap items-center gap-3 px-4 py-3 text-[13px]">
                <Link
                  href={`/platform/users/${u.id}`}
                  className="ts-focus min-w-0 flex-1 truncate font-medium hover:underline"
                  style={{ color: "var(--text-default)" }}
                >
                  {u.name || u.email}
                  <span className="ml-2 text-[11px]" style={{ color: "var(--text-muted)" }}>{u.email}</span>
                </Link>
                <span className="text-[11px]" style={{ color: "var(--text-muted)" }}>
                  banned {u.bannedAt?.toLocaleDateString()} by {r?.issuedBy.email ?? "—"}
                </span>
                {r?.expiresAt && (
                  <span className="text-[11px]" style={{ color: "var(--text-muted)" }}>
                    expires {r.expiresAt.toLocaleDateString()}
                  </span>
                )}
                {u.bannedReason && (
                  <span className="basis-full text-[11px] italic" style={{ color: "var(--text-muted)" }}>
                    “{u.bannedReason}”
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

/* ────────────────────────────────────────────────────────────── */

function BannedIpsCard({
  rows,
  canBan,
}: {
  rows: {
    id: string;
    ipAddress: string | null;
    reason: string;
    issuedAt: Date;
    expiresAt: Date | null;
    issuedBy: { email: string };
  }[];
  canBan: boolean;
}) {
  return (
    <section className="rounded-lg border" style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)" }}>
      <div className="border-b px-4 py-3" style={{ borderColor: "var(--border-subtle)" }}>
        <h2 className="text-[14px] font-semibold" style={{ color: "var(--text-default)" }}>
          Banned IPs ({rows.length})
        </h2>
        <p className="text-[12px]" style={{ color: "var(--text-muted)" }}>
          Single host (e.g. <code>203.0.113.4</code>) or CIDR range
          (e.g. <code>203.0.113.0/24</code>). Sign-in refuses any
          address that exact-matches or falls inside one of these
          ranges, evaluated server-side on the credentials authorize().
        </p>
      </div>
      <form action={banIp} className="grid grid-cols-1 gap-3 border-b p-4 md:grid-cols-[1.5fr_2fr_1fr_auto]" style={{ borderColor: "var(--border-subtle)" }}>
        <Field label="IP or CIDR" required>
          <input
            type="text" name="ipAddress" required disabled={!canBan}
            placeholder="203.0.113.4 or 203.0.113.0/24"
            className="ts-focus w-full rounded-md border px-3 py-2 text-[13px]"
            style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)", color: "var(--text-default)" }}
          />
        </Field>
        <Field label="Reason" required>
          <input
            type="text" name="reason" required disabled={!canBan}
            placeholder="Brute-force on /login, scraper, etc."
            className="ts-focus w-full rounded-md border px-3 py-2 text-[13px]"
            style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)", color: "var(--text-default)" }}
          />
        </Field>
        <Field label="Expires" hint="Blank = never">
          <input
            type="date" name="expiresAt" disabled={!canBan}
            className="ts-focus w-full rounded-md border px-3 py-2 text-[13px]"
            style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)", color: "var(--text-default)" }}
          />
        </Field>
        <div className="flex items-end">
          <button
            type="submit" disabled={!canBan}
            className="ts-focus h-[38px] rounded-md px-4 text-[13px] font-medium disabled:cursor-not-allowed disabled:opacity-50"
            style={{ background: "var(--danger-fg)", color: "var(--surface-1)" }}
          >
            Ban IP
          </button>
        </div>
      </form>
      {rows.length === 0 ? (
        <div className="px-4 py-6 text-center text-[12px]" style={{ color: "var(--text-muted)" }}>
          No active IP bans.
        </div>
      ) : (
        <ul className="divide-y" style={{ borderColor: "var(--border-subtle)" }}>
          {rows.map((r) => (
            <BanRow key={r.id} kind="IP" row={r} target={r.ipAddress ?? "—"} canBan={canBan} />
          ))}
        </ul>
      )}
    </section>
  );
}

function BannedDomainsCard({
  rows,
  canBan,
}: {
  rows: {
    id: string;
    emailDomain: string | null;
    reason: string;
    issuedAt: Date;
    expiresAt: Date | null;
    issuedBy: { email: string };
  }[];
  canBan: boolean;
}) {
  return (
    <section className="rounded-lg border" style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)" }}>
      <div className="border-b px-4 py-3" style={{ borderColor: "var(--border-subtle)" }}>
        <h2 className="text-[14px] font-semibold" style={{ color: "var(--text-default)" }}>
          Banned email domains ({rows.length})
        </h2>
        <p className="text-[12px]" style={{ color: "var(--text-muted)" }}>
          Refuses sign-in for any address ending in <code>@domain</code>.
          Useful against disposable-email providers used for fraud signups.
        </p>
      </div>
      <form action={banEmailDomain} className="grid grid-cols-1 gap-3 border-b p-4 md:grid-cols-[1.5fr_2fr_1fr_auto]" style={{ borderColor: "var(--border-subtle)" }}>
        <Field label="Domain" required>
          <input
            type="text" name="domain" required disabled={!canBan}
            placeholder="example.com"
            className="ts-focus w-full rounded-md border px-3 py-2 text-[13px]"
            style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)", color: "var(--text-default)" }}
          />
        </Field>
        <Field label="Reason" required>
          <input
            type="text" name="reason" required disabled={!canBan}
            placeholder="Disposable email service, fraud signal"
            className="ts-focus w-full rounded-md border px-3 py-2 text-[13px]"
            style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)", color: "var(--text-default)" }}
          />
        </Field>
        <Field label="Expires" hint="Blank = never">
          <input
            type="date" name="expiresAt" disabled={!canBan}
            className="ts-focus w-full rounded-md border px-3 py-2 text-[13px]"
            style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)", color: "var(--text-default)" }}
          />
        </Field>
        <div className="flex items-end">
          <button
            type="submit" disabled={!canBan}
            className="ts-focus h-[38px] rounded-md px-4 text-[13px] font-medium disabled:cursor-not-allowed disabled:opacity-50"
            style={{ background: "var(--danger-fg)", color: "var(--surface-1)" }}
          >
            Ban domain
          </button>
        </div>
      </form>
      {rows.length === 0 ? (
        <div className="px-4 py-6 text-center text-[12px]" style={{ color: "var(--text-muted)" }}>
          No active domain bans.
        </div>
      ) : (
        <ul className="divide-y" style={{ borderColor: "var(--border-subtle)" }}>
          {rows.map((r) => (
            <BanRow key={r.id} kind="EMAIL_DOMAIN" row={r} target={r.emailDomain ?? "—"} canBan={canBan} />
          ))}
        </ul>
      )}
    </section>
  );
}

function BanRow({
  row,
  target,
  canBan,
}: {
  kind: BanKind;
  row: {
    id: string;
    reason: string;
    issuedAt: Date;
    expiresAt: Date | null;
    issuedBy: { email: string };
  };
  target: string;
  canBan: boolean;
}) {
  return (
    <li className="grid grid-cols-1 gap-2 px-4 py-3 text-[12px] md:grid-cols-[1fr_2fr_1fr_auto]">
      <code className="rounded px-1.5 py-0.5 self-start font-mono" style={{ background: "var(--surface-2)", color: "var(--text-default)", border: "1px solid var(--border-subtle)" }}>
        {target}
      </code>
      <div>
        <div style={{ color: "var(--text-default)" }}>“{row.reason}”</div>
        <div className="text-[11px]" style={{ color: "var(--text-muted)" }}>
          by {row.issuedBy.email} · {row.issuedAt.toLocaleDateString()}
        </div>
      </div>
      <div className="text-[11px]" style={{ color: "var(--text-muted)" }}>
        {row.expiresAt ? `expires ${row.expiresAt.toLocaleDateString()}` : "no expiry"}
      </div>
      {canBan && (
        <form action={liftBanRecord.bind(null, row.id)} className="flex items-start gap-2 justify-self-end">
          <input
            type="text" name="liftReason" placeholder="Lift reason (optional)"
            className="ts-focus rounded-md border px-2 py-1 text-[11px]"
            style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)", color: "var(--text-default)" }}
          />
          <button
            type="submit"
            className="ts-focus rounded-md border px-2.5 py-1 text-[11px] font-medium"
            style={{ borderColor: "var(--border-subtle)", color: "var(--accent-primary)", background: "var(--surface-1)" }}
          >
            Lift
          </button>
        </form>
      )}
    </li>
  );
}

function BanHistory({
  rows,
}: {
  rows: {
    id: string;
    kind: BanKind;
    ipAddress: string | null;
    emailDomain: string | null;
    reason: string;
    issuedAt: Date;
    liftedAt: Date | null;
    expiresAt: Date | null;
    issuedBy: { email: string };
    liftedBy: { email: string } | null;
  }[];
}) {
  return (
    <section className="rounded-lg border" style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)" }}>
      <div className="border-b px-4 py-3" style={{ borderColor: "var(--border-subtle)" }}>
        <h2 className="text-[14px] font-semibold" style={{ color: "var(--text-default)" }}>
          Recent ban history ({rows.length})
        </h2>
      </div>
      <ul className="divide-y" style={{ borderColor: "var(--border-subtle)" }}>
        {rows.map((r) => (
          <li key={r.id} className="px-4 py-2 text-[11px]" style={{ color: "var(--text-muted)" }}>
            <span
              className="mr-2 rounded px-1.5 py-0.5 text-[9px] font-bold uppercase"
              style={{ background: "var(--surface-2)", color: "var(--text-muted)" }}
            >
              {r.kind}
            </span>
            <code className="mr-2 font-mono" style={{ color: "var(--text-default)" }}>
              {r.ipAddress ?? r.emailDomain}
            </code>
            <span style={{ color: "var(--text-default)" }}>“{r.reason}”</span>
            {" — "}
            {r.liftedAt
              ? <>lifted {r.liftedAt.toLocaleDateString()} by {r.liftedBy?.email ?? "system"}</>
              : <>auto-expired {r.expiresAt?.toLocaleDateString() ?? ""}</>}
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
