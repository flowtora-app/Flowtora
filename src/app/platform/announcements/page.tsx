import Link from "next/link";
import { requirePlatformStaff } from "@/lib/platform";
import { Card, CardHeader } from "@/components/ui";

// Phase L — Announcements / platform-wide communications.
//
// Stub page. The `Announcement` model is not in the Prisma schema yet,
// so this page documents the intended shape of the feature and points
// platform staff at the existing comms surfaces they can use today.
//
// When the model lands, flip this to a real CRUD page with:
//   • List of published / scheduled / draft announcements
//   • New announcement composer (title, body, audience, severity, schedule)
//   • Per-tenant read receipts
//   • In-app banner + email fanout

export default async function PlatformAnnouncementsPage() {
  await requirePlatformStaff();

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold">Announcements</h1>
        <p
          className="mt-1 text-sm"
          style={{ color: "var(--text-muted)" }}
        >
          Platform-wide broadcasts for all customers. Use this to ship
          release notes, scheduled maintenance windows, and pricing
          changes.
        </p>
      </div>

      <Card>
        <CardHeader
          title="Not yet wired up"
          description="The Announcement model is on the roadmap but not in the Prisma schema."
        />
        <div className="px-5 py-4 text-sm" style={{ color: "var(--text-default)" }}>
          <p>
            Once added, this page will list every announcement (draft,
            scheduled, published, archived), let platform admins write a
            new one, and surface it in-app via a dismissible banner plus
            an optional email fan-out.
          </p>
          <p className="mt-3" style={{ color: "var(--text-muted)" }}>
            The model should carry: title, body (markdown), severity
            (info / warning / critical), audience (all / specific plans /
            specific tenants), publishAt / expireAt, and a per-tenant
            AnnouncementRead join for dismiss tracking.
          </p>
        </div>
      </Card>

      <Card>
        <CardHeader
          title="What to use today"
          description="Until the broadcast model ships, reach customers through these channels."
        />
        <ul>
          <StubLink
            href="/platform/support"
            label="Open a support conversation"
            desc="For one-off messages to a single tenant."
          />
          <StubLink
            href="/platform/feedback"
            label="Watch incoming feedback"
            desc="See what customers are already asking for."
          />
          <StubLink
            href="/platform/feature-flags"
            label="Toggle features per-tenant or globally"
            desc="Rolling out a change? Use a flag with a note."
          />
          <StubLink
            href="/platform/tenants"
            label="Email tenants individually"
            desc="Tenant detail page surfaces contact info."
          />
        </ul>
      </Card>

      <Card>
        <CardHeader
          title="Draft examples"
          description="A preview of what the composer will look like once it ships."
        />
        <div className="space-y-3 px-5 py-4">
          <ExampleBanner
            severity="info"
            title="Scheduled maintenance · Sunday 2026-04-26 02:00–04:00 UTC"
            body="Read-only mode during window. Proofs and portal remain up."
          />
          <ExampleBanner
            severity="warning"
            title="Pricing update effective 2026-06-01"
            body="GROWTH moves from $99 → $109 on renewal. Existing trials grandfather at $99 for 90 days."
          />
          <ExampleBanner
            severity="critical"
            title="Security advisory · rotate API keys"
            body="A third-party dependency disclosed CVE-2026-XXXX. Rotate any API keys created before 2026-04-10."
          />
        </div>
      </Card>
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────── */

function StubLink({
  href, label, desc,
}: { href: string; label: string; desc: string }) {
  return (
    <li style={{ borderTop: "1px solid var(--border-subtle)" }}>
      <Link
        href={href}
        className="flex items-center justify-between gap-4 px-5 py-3 transition-colors hover:opacity-80"
      >
        <div>
          <div className="text-sm font-medium">{label}</div>
          <div className="text-xs" style={{ color: "var(--text-muted)" }}>{desc}</div>
        </div>
        <span style={{ color: "var(--text-faint)" }}>→</span>
      </Link>
    </li>
  );
}

function ExampleBanner({
  severity, title, body,
}: { severity: "info" | "warning" | "critical"; title: string; body: string }) {
  const tone: Record<typeof severity, { bg: string; bd: string; fg: string; label: string }> = {
    info:     { bg: "var(--surface-2)", bd: "var(--border-subtle)", fg: "var(--text-default)", label: "INFO" },
    warning:  { bg: "#3a2a0d",          bd: "#5a3f12",              fg: "#fbbf24",               label: "WARNING" },
    critical: { bg: "#3a1517",          bd: "#5b2024",              fg: "#ff8b8b",               label: "CRITICAL" },
  };
  const t = tone[severity];
  return (
    <div
      className="rounded-md px-4 py-3 text-sm"
      style={{ background: t.bg, border: `1px solid ${t.bd}` }}
    >
      <div
        className="mb-1 text-[10px] font-semibold uppercase tracking-wider"
        style={{ color: t.fg }}
      >
        {t.label}
      </div>
      <div className="font-medium" style={{ color: "var(--text-default)" }}>{title}</div>
      <div className="mt-0.5 text-xs" style={{ color: "var(--text-muted)" }}>{body}</div>
    </div>
  );
}
