// Page 74 — My API Keys.
//
// Personal API tokens scoped to the signed-in admin's permissions.
// Table of tokens + create modal-style form + reveal-once banner.

import * as React from "react";
import { db } from "@/lib/db";
import { requirePlatformStaff } from "@/lib/platform";
import {
  createPersonalToken, revokePersonalToken, rotatePersonalToken,
} from "@/app/actions/platform-me";

export const dynamic = "force-dynamic";

type SP = Record<string, string | string[] | undefined>;
const asString = (v: string | string[] | undefined): string | undefined =>
  typeof v === "string" && v.length > 0 ? v : undefined;

const STATUS_TONE: Record<string, { bg: string; fg: string; label: string }> = {
  ACTIVE:  { bg: "var(--emerald-100)", fg: "var(--emerald-700)", label: "Active" },
  EXPIRED: { bg: "var(--rose-100)",    fg: "var(--rose-700)",    label: "Expired" },
  REVOKED: { bg: "var(--surface-2)",   fg: "var(--text-muted)",  label: "Revoked" },
};

export default async function MyApiKeysPage({
  searchParams,
}: { searchParams: Promise<SP> }) {
  const ctx = await requirePlatformStaff();
  const sp = await searchParams;
  const ok = asString(sp.ok);
  const error = asString(sp.error);
  const revealedRaw = asString(sp.reveal);
  const revealedId = asString(sp.id);

  const tokens = await db.personalApiToken.findMany({
    where: { userId: ctx.userId },
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
  });

  // Per-token call count over the last 24h for the table's "Last 24h" column.
  const since = new Date(Date.now() - 86_400_000);
  const usageGroups = await db.personalApiTokenUsageEvent.groupBy({
    by: ["tokenId"],
    where: { token: { userId: ctx.userId }, createdAt: { gte: since } },
    _count: { _all: true },
  });
  const usageByToken = new Map(usageGroups.map((u) => [u.tokenId, u._count._all]));

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight" style={{ color: "var(--text-default)" }}>
          My API keys
        </h1>
        <p className="mt-1 text-sm" style={{ color: "var(--text-muted)" }}>
          Personal admin tokens. Scopes inherit from your role — you can&apos;t mint a token with
          permissions you don&apos;t already have. Tokens are revealed once at creation and never again.
        </p>
      </header>

      {ok && <Banner tone="success">{decodeURIComponent(ok)}</Banner>}
      {error && <Banner tone="danger">{decodeURIComponent(error)}</Banner>}

      {/* Reveal-once banner. */}
      {revealedRaw && revealedId && (
        <section
          className="rounded-xl p-5"
          style={{ background: "var(--amber-100)", border: "1px solid var(--amber-300)", color: "var(--amber-700)" }}
        >
          <h3 className="text-sm font-semibold">Save this token now</h3>
          <p className="mt-1 text-xs">
            This is the only time the full secret will be shown. Copy it into a password manager
            or your CI secret store.
          </p>
          <pre
            className="mt-3 overflow-x-auto rounded-md px-3 py-2 font-mono text-xs"
            style={{ background: "var(--surface-1)", color: "var(--text-default)", border: "1px solid var(--border-subtle)" }}
          >
            {decodeURIComponent(revealedRaw)}
          </pre>
        </section>
      )}

      {/* Table */}
      <section
        className="overflow-x-auto rounded-xl"
        style={{ background: "var(--surface-1)", border: "1px solid var(--border-subtle)", boxShadow: "var(--shadow-sm)" }}
      >
        <table className="w-full text-sm">
          <thead style={{ background: "var(--surface-2)" }}>
            <tr>
              <Th>Name</Th>
              <Th>Prefix</Th>
              <Th>Scopes</Th>
              <Th>Created</Th>
              <Th>Last used</Th>
              <Th>Expiry</Th>
              <Th>Status</Th>
              <Th className="text-right">Last 24h</Th>
              <Th />
            </tr>
          </thead>
          <tbody>
            {tokens.length === 0 && (
              <tr>
                <td colSpan={9} className="px-4 py-8 text-center text-sm" style={{ color: "var(--text-muted)" }}>
                  No personal tokens yet. Create one below.
                </td>
              </tr>
            )}
            {tokens.map((t) => {
              const tone = STATUS_TONE[t.status] ?? STATUS_TONE.REVOKED;
              return (
                <tr key={t.id} style={{ borderTop: "1px solid var(--border-subtle)" }}>
                  <td className="px-3 py-2 align-top">
                    <div className="font-medium">{t.name}</div>
                    {t.description && (
                      <div className="mt-0.5 text-xs" style={{ color: "var(--text-muted)" }}>{t.description}</div>
                    )}
                  </td>
                  <td className="px-3 py-2 align-top font-mono text-[12px]">{t.prefix}…</td>
                  <td className="px-3 py-2 align-top text-xs">
                    <div className="flex max-w-[280px] flex-wrap gap-1">
                      {t.scopes.slice(0, 6).map((s) => (
                        <code
                          key={s}
                          className="rounded px-1.5 py-0.5 font-mono text-[10px]"
                          style={{
                            background: "var(--surface-2)",
                            color: "var(--text-default)",
                            border: "1px solid var(--border-subtle)",
                          }}
                        >
                          {s}
                        </code>
                      ))}
                      {t.scopes.length > 6 && (
                        <span className="text-[10px]" style={{ color: "var(--text-faint)" }}>
                          +{t.scopes.length - 6} more
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-3 py-2 align-top text-xs">{relativeFromNow(t.createdAt)}</td>
                  <td className="px-3 py-2 align-top text-xs">{relativeFromNow(t.lastUsedAt)}</td>
                  <td className="px-3 py-2 align-top text-xs">
                    {t.expiresAt ? relativeFromNow(t.expiresAt) : "never"}
                  </td>
                  <td className="px-3 py-2 align-top">
                    <span
                      className="rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider"
                      style={{ background: tone.bg, color: tone.fg, border: `1px solid ${tone.fg}` }}
                    >
                      {tone.label}
                    </span>
                  </td>
                  <td className="px-3 py-2 align-top text-right tabular-nums">
                    {usageByToken.get(t.id) ?? 0}
                  </td>
                  <td className="px-3 py-2 align-top">
                    <div className="flex flex-wrap gap-1.5">
                      {t.status === "ACTIVE" && (
                        <>
                          <form action={rotatePersonalToken}>
                            <input type="hidden" name="id" value={t.id} />
                            <button type="submit" className="text-xs" style={{ color: "var(--accent-primary)" }}>
                              Rotate
                            </button>
                          </form>
                          <form action={revokePersonalToken}>
                            <input type="hidden" name="id" value={t.id} />
                            <button type="submit" className="text-xs" style={{ color: "var(--danger-fg)" }}>
                              Revoke
                            </button>
                          </form>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>

      {/* Create form */}
      <Card title="Create personal token" description="Scopes are a subset of your platform role. IP allowlist is optional but recommended for CI/CD machines.">
        <form action={createPersonalToken} className="space-y-3 px-5 py-5">
          <div className="grid gap-3 md:grid-cols-2">
            <FormField label="Name" name="name" required maxLength={120} placeholder="CI deployment" />
            <FormField label="Expires in (days)" name="expiresInDays" type="number" required defaultValue="90" hint="Use 0 for never (not recommended)." />
          </div>
          <FormField label="Description" name="description" maxLength={500} placeholder="What this token is used for" />
          <FormField label="Scopes (comma-separated)" name="scopes" required maxLength={2000} placeholder="tenant.read, billing.read" hint="Must be a subset of your platform role permissions." />
          <FormField label="IP allowlist (comma-separated)" name="ipAllowlist" maxLength={500} placeholder="203.0.113.10, 198.51.100.0/24" hint="Optional but recommended — restricts the token to these IPs." />
          <div className="flex justify-end">
            <button type="submit" className="rounded-md px-3 py-2 text-xs font-medium"
              style={{ background: "var(--accent-primary)", color: "var(--accent-fg)" }}>
              Create token
            </button>
          </div>
        </form>
      </Card>
    </div>
  );
}

/* ── UI helpers ───────────────────────────────────────────── */

function Card({ title, description, children }: { title?: string; description?: string; children: React.ReactNode }) {
  return (
    <section className="overflow-hidden rounded-xl"
      style={{ background: "var(--surface-1)", border: "1px solid var(--border-subtle)", boxShadow: "var(--shadow-sm)" }}>
      {title && (
        <header className="px-5 py-3" style={{ borderBottom: "1px solid var(--border-subtle)" }}>
          <h3 className="text-sm font-semibold">{title}</h3>
          {description && <p className="mt-0.5 text-xs" style={{ color: "var(--text-muted)" }}>{description}</p>}
        </header>
      )}
      {children}
    </section>
  );
}

function Th({ children, className = "" }: { children?: React.ReactNode; className?: string }) {
  return (
    <th className={`px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wide ${className}`}
      style={{ color: "var(--text-muted)" }}>
      {children}
    </th>
  );
}

function FormField({ label, name, type = "text", defaultValue, required, placeholder, maxLength, hint }: {
  label: string; name: string; type?: string; defaultValue?: string; required?: boolean;
  placeholder?: string; maxLength?: number; hint?: string;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm">{label}{required && <span style={{ color: "var(--danger-fg)" }}> *</span>}</span>
      <input type={type} name={name} defaultValue={defaultValue} required={required} placeholder={placeholder} maxLength={maxLength}
        className="w-full rounded-md px-3 py-2 text-sm outline-none"
        style={{ background: "var(--panel)", border: "1px solid var(--border)", color: "var(--text)" }} />
      {hint && <span className="mt-1 block text-xs" style={{ color: "var(--text-muted)" }}>{hint}</span>}
    </label>
  );
}

function Banner({ tone, children }: { tone: "success" | "danger"; children: React.ReactNode }) {
  const palette = tone === "success"
    ? { bg: "var(--emerald-100)", fg: "var(--emerald-700)", border: "var(--emerald-300)" }
    : { bg: "var(--rose-100)", fg: "var(--rose-700)", border: "var(--rose-300)" };
  return (
    <div className="rounded-md px-4 py-3 text-sm"
      style={{ background: palette.bg, color: palette.fg, border: `1px solid ${palette.border}` }}>
      {children}
    </div>
  );
}

function relativeFromNow(d: Date | null | undefined): string {
  if (!d) return "—";
  const ms = Date.now() - d.getTime();
  const future = ms < 0;
  const abs = Math.abs(ms);
  const mins = Math.round(abs / 60_000);
  const fmt = (s: string) => future ? `in ${s}` : `${s} ago`;
  if (mins < 1)  return future ? "soon" : "just now";
  if (mins < 60) return fmt(`${mins}m`);
  const hrs = Math.round(mins / 60);
  if (hrs < 24)  return fmt(`${hrs}h`);
  const days = Math.round(hrs / 24);
  if (days < 30) return fmt(`${days}d`);
  const months = Math.round(days / 30);
  return fmt(`${months}mo`);
}
