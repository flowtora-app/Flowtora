import Link from "next/link";
import { requirePlatformStaff } from "@/lib/platform";
import { Card, CardHeader } from "@/components/ui";

// Phase O — platform-wide configuration hub.
//
// Most platform config lives in env vars and code, not a DB table. This
// page surfaces what those knobs are (so a new admin can orient quickly)
// and links out to the dedicated surfaces that *do* have writable UI.
//
// Kept read-only on purpose — making env vars mutable from a web
// surface is a foot-gun. If a setting genuinely needs runtime
// reconfiguration, give it a first-class page.

type EnvRow = {
  key: string;
  label: string;
  status: "set" | "missing" | "n/a";
  hint?: string;
};

export default async function PlatformSettingsPage() {
  const ctx = await requirePlatformStaff();

  const envRows: EnvRow[] = [
    { key: "DATABASE_URL",       label: "Database",              status: boolStatus(process.env.DATABASE_URL) },
    { key: "DIRECT_URL",         label: "Direct DB (migrations)",status: boolStatus(process.env.DIRECT_URL) },
    { key: "NEXTAUTH_SECRET",    label: "Session secret",        status: boolStatus(process.env.NEXTAUTH_SECRET) },
    { key: "NEXTAUTH_URL",       label: "Canonical URL",         status: boolStatus(process.env.NEXTAUTH_URL), hint: process.env.NEXTAUTH_URL },
    { key: "RESEND_API_KEY",     label: "Email provider",        status: boolStatus(process.env.RESEND_API_KEY), hint: "Resend" },
    { key: "EMAIL_FROM",         label: "Email from address",    status: boolStatus(process.env.EMAIL_FROM), hint: process.env.EMAIL_FROM },
    { key: "STRIPE_SECRET_KEY",  label: "Stripe secret",         status: boolStatus(process.env.STRIPE_SECRET_KEY) },
    { key: "STRIPE_WEBHOOK_SECRET", label: "Stripe webhooks",    status: boolStatus(process.env.STRIPE_WEBHOOK_SECRET) },
    { key: "BLOB_READ_WRITE_TOKEN", label: "Blob storage",       status: boolStatus(process.env.BLOB_READ_WRITE_TOKEN) },
    { key: "SENTRY_DSN",         label: "Error tracking",        status: boolStatus(process.env.SENTRY_DSN) },
  ];

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold">Platform settings</h1>
        <p
          className="mt-1 text-sm"
          style={{ color: "var(--text-muted)" }}
        >
          Configuration that applies to every tenant. Env vars are
          managed through the hosting provider — only their presence is
          shown here. For tenant-specific settings, open the tenant
          detail page.
        </p>
      </div>

      <Card>
        <CardHeader
          title="Environment"
          description="Whether each required secret / setting is present in this deployment."
        />
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead style={{ color: "var(--text-muted)" }}>
              <tr className="text-left">
                <th className="px-5 py-3 font-normal">Setting</th>
                <th className="px-5 py-3 font-normal">Env key</th>
                <th className="px-5 py-3 font-normal">Status</th>
                <th className="px-5 py-3 font-normal">Notes</th>
              </tr>
            </thead>
            <tbody>
              {envRows.map((row) => (
                <tr key={row.key} style={{ borderTop: "1px solid var(--border-subtle)" }}>
                  <td className="px-5 py-3 font-medium">{row.label}</td>
                  <td
                    className="px-5 py-3 font-mono text-xs"
                    style={{ color: "var(--text-muted)" }}
                  >
                    {row.key}
                  </td>
                  <td className="px-5 py-3"><EnvStatusPill status={row.status} /></td>
                  <td
                    className="px-5 py-3 text-xs"
                    style={{ color: "var(--text-muted)" }}
                  >
                    {row.hint ?? ""}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <LinkCard
          title="Plans &amp; pricing"
          body="Canonical plan list, prices, and feature matrix."
          href="/platform/plans"
        />
        <LinkCard
          title="Feature flags"
          body="Per-tenant and global overrides for entitlements."
          href="/platform/feature-flags"
        />
        <LinkCard
          title="Announcements (preview)"
          body="Roadmap stub — the Announcement model isn't in Prisma yet; the page describes the intended shape and current alternatives."
          href="/platform/announcements"
        />
        <LinkCard
          title="Compliance"
          body="Data exports, deletion requests, retention windows."
          href="/platform/compliance"
        />
        <LinkCard
          title="Audit log"
          body="Every write action across tenants and platform staff."
          href="/platform/audit"
        />
        <LinkCard
          title="Readiness"
          body="Pre-launch checklist of things that must be in place."
          href="/platform/readiness"
        />
      </div>

      <Card>
        <CardHeader
          title="Your platform access"
          description="Read-only view of your own session context."
        />
        <dl className="grid grid-cols-1 gap-3 px-5 py-4 text-sm md:grid-cols-2">
          <ContextRow label="Email" value={ctx.email} />
          <ContextRow label="Role"  value={ctx.role} />
          <ContextRow
            label="Can write"
            value={ctx.canWrite ? "yes" : "no (read-only)"}
            tone={ctx.canWrite ? undefined : "var(--text-muted)"}
          />
          <ContextRow
            label="Can impersonate"
            value={ctx.canImpersonate ? "yes" : "no"}
            tone={ctx.canImpersonate ? undefined : "var(--text-muted)"}
          />
        </dl>
      </Card>

      <p className="text-xs" style={{ color: "var(--text-faint)" }}>
        Changing environment variables requires a redeploy. See your
        hosting provider&rsquo;s dashboard.
      </p>
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────── */

function boolStatus(v: string | undefined): EnvRow["status"] {
  return v && v.length > 0 ? "set" : "missing";
}

function EnvStatusPill({ status }: { status: EnvRow["status"] }) {
  const tone =
    status === "set"     ? { bg: "#0f2b1b", fg: "#7dd688", label: "Set" } :
    status === "missing" ? { bg: "#3a1517", fg: "#ff8b8b", label: "Missing" } :
                           { bg: "var(--surface-2)", fg: "var(--text-muted)", label: "—" };
  return (
    <span
      className="rounded-full px-2 py-0.5 text-xs font-medium"
      style={{ background: tone.bg, color: tone.fg }}
    >
      {tone.label}
    </span>
  );
}

function LinkCard({
  title, body, href,
}: { title: string; body: string; href: string }) {
  return (
    <Link
      href={href}
      className="block rounded-lg p-5 transition-colors"
      style={{
        background: "var(--surface-1)",
        border: "1px solid var(--border-subtle)",
      }}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="text-sm font-semibold">{title}</div>
        <span style={{ color: "var(--text-faint)" }}>→</span>
      </div>
      <p className="mt-1 text-xs" style={{ color: "var(--text-muted)" }}>
        {body}
      </p>
    </Link>
  );
}

function ContextRow({
  label, value, tone,
}: { label: string; value: string; tone?: string }) {
  return (
    <div>
      <dt className="text-xs" style={{ color: "var(--text-muted)" }}>{label}</dt>
      <dd style={{ color: tone ?? "var(--text-default)" }}>{value}</dd>
    </div>
  );
}
