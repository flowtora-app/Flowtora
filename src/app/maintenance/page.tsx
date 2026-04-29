import Link from "next/link";
import { getPlatformSettings } from "@/lib/platform-settings";

// /maintenance — destination page when maintenance mode is on.
//
// Tenant-layout enforcement redirects every non-platform-admin tenant
// request here. Platform staff see a banner instead of being redirected
// so they can flip the toggle off.
//
// We keep this page deliberately barebones: no shell chrome, no nav,
// no tenant context — it's a graceful "we'll be right back" surface.

export const dynamic = "force-dynamic";

export default async function MaintenancePage() {
  const settings = await getPlatformSettings();

  return (
    <main className="mx-auto max-w-lg px-6 py-24 text-center">
      <div className="text-5xl" aria-hidden>🛠</div>
      <h1
        className="mt-4 text-2xl font-semibold tracking-tight"
        style={{ color: "var(--text-default)" }}
      >
        We're upgrading the platform
      </h1>
      <p className="mt-3 text-sm" style={{ color: "var(--text-muted)" }}>
        Flowtora is in maintenance mode. Workspaces will be available again
        shortly. Your data is safe — nothing is being changed during this
        window.
      </p>

      {settings.maintenanceMessage && (
        <div
          className="mx-auto mt-6 max-w-md rounded-md px-4 py-3 text-left text-sm"
          style={{
            background: "var(--warning-surface)",
            color: "var(--warning-fg)",
            border: "1px solid var(--warning-fg)",
          }}
        >
          <div className="text-[10px] font-semibold uppercase tracking-wide">
            From the team
          </div>
          <div className="mt-1 whitespace-pre-wrap" style={{ color: "var(--text-default)" }}>
            {settings.maintenanceMessage}
          </div>
        </div>
      )}

      <div className="mt-8 flex flex-wrap items-center justify-center gap-3 text-xs">
        <Link
          href="/"
          className="rounded-md px-3 py-1.5 underline"
          style={{ color: "var(--text-muted)" }}
        >
          Back to home
        </Link>
        <a
          href="https://flowtora.com/help"
          target="_blank"
          rel="noreferrer"
          className="rounded-md px-3 py-1.5 underline"
          style={{ color: "var(--text-muted)" }}
        >
          Help center ↗
        </a>
      </div>

      <p className="mt-12 text-xs" style={{ color: "var(--text-faint)" }}>
        Status updates: {settings.updatedAt && settings.updatedAt.getTime() > 0
          ? `last touched ${settings.updatedAt.toISOString().slice(0, 16).replace("T", " ")} UTC`
          : "—"}
      </p>
    </main>
  );
}
