import { requirePlatformStaff } from "@/lib/platform";
import {
  Breadcrumb,
  Card,
  PageHeader,
} from "@/components/ui";
import {
  loadIpBlocks,
  loadSessionFilterOptions,
  loadSessionsKpi,
  loadSessionsList,
  loadSessionsMap,
  type SessionsFilters,
} from "@/server/platform/sessions";
import { SessionsFiltersBar } from "./_components/SessionsFiltersBar";
import { SessionsTable } from "./_components/SessionsTable";
import { SessionsMap } from "./_components/SessionsMap";
import { IpBlocksPanel } from "./_components/IpBlocksPanel";
import { BlockIpButton } from "./_components/BlockIpButton";

export const dynamic = "force-dynamic";

type SearchParams = Record<string, string | string[] | undefined>;

const MFA_VALUES = new Set(["any", "totp", "webauthn", "sms", "none"]);

function parseFilters(sp: SearchParams): SessionsFilters {
  const f: SessionsFilters = {};
  if (typeof sp.admin === "string" && sp.admin) f.adminId = sp.admin;
  if (typeof sp.device === "string" && sp.device) f.deviceType = sp.device;
  if (typeof sp.browser === "string" && sp.browser) f.browser = sp.browser;
  if (typeof sp.os === "string" && sp.os) f.os = sp.os;
  if (typeof sp.ip === "string" && sp.ip) f.ip = sp.ip.trim();
  if (typeof sp.country === "string" && sp.country) f.country = sp.country.toUpperCase();
  if (typeof sp.lastSince === "string" && sp.lastSince) {
    const d = new Date(sp.lastSince); if (!Number.isNaN(d.getTime())) f.lastActiveSince = d;
  }
  if (typeof sp.lastUntil === "string" && sp.lastUntil) {
    const d = new Date(sp.lastUntil); if (!Number.isNaN(d.getTime())) f.lastActiveUntil = d;
  }
  if (typeof sp.mfa === "string" && MFA_VALUES.has(sp.mfa)) {
    f.mfa = sp.mfa as SessionsFilters["mfa"];
  }
  return f;
}

export default async function SessionsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const ctx = await requirePlatformStaff();
  const sp = await searchParams;
  const canEdit = ctx.can("users.ban");

  const [kpi, rows, mapBubbles, options, ipBlocks] = await Promise.all([
    loadSessionsKpi(),
    loadSessionsList(parseFilters(sp)),
    loadSessionsMap(),
    loadSessionFilterOptions(),
    loadIpBlocks(),
  ]);

  return (
    <div className="min-w-0 space-y-5">
      <div>
        <Breadcrumb items={[
          { label: "Platform", href: "/platform" },
          { label: "Access" },
          { label: "Sessions & Devices" },
        ]} />
        <div className="mt-3">
          <PageHeader
            title="Sessions & Devices"
            description="Active platform-admin sessions with security oversight + IP-blocklist controls."
            actions={canEdit ? <BlockIpButton /> : null}
          />
        </div>
      </div>

      {/* KPI strip */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi label="Active sessions"        value={kpi.active.toString()} />
        <Kpi label="Unique admins"          value={kpi.uniqueAdmins.toString()} />
        <Kpi label="Suspicious networks"    value={kpi.suspicious.toString()}
             tone={kpi.suspicious > 0 ? "danger" : "default"} />
        <Kpi label="MFA-active sessions"    value={`${kpi.active === 0 ? 0 : Math.round((kpi.withMfa / kpi.active) * 100)}%`}
             sub={`${kpi.withMfa} of ${kpi.active}`}
             tone={kpi.active > 0 && kpi.withMfa / kpi.active < 0.8 ? "warning" : "good"} />
      </div>

      {/* Map + IP blocks */}
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <SessionsMap bubbles={mapBubbles} />
        </div>
        <IpBlocksPanel rows={ipBlocks} canEdit={canEdit} />
      </div>

      {/* Filters */}
      <Card padding="md">
        <SessionsFiltersBar options={options} />
      </Card>

      {/* Table */}
      <SessionsTable rows={rows} canEdit={canEdit} />

      <Card padding="sm" style={{ borderColor: "var(--amber-200)", background: "var(--amber-50)" }}>
        <p className="text-[11px]" style={{ color: "var(--amber-700)" }}>
          <strong>What's surfaced:</strong> NextAuth database-strategy sessions for users with a non-null
          platformRole (or custom platform role). JWT-strategy sessions don&apos;t store rows here — invalidate
          them via <span className="font-mono">Sign out all sessions</span> on the user detail page (bumps
          sessionVersion, invalidates every JWT for that user).
        </p>
      </Card>
    </div>
  );
}

function Kpi({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: "default" | "good" | "warning" | "danger" }) {
  const palette =
    tone === "good"    ? { borderColor: "var(--emerald-200)" } :
    tone === "warning" ? { borderColor: "var(--amber-200)" } :
    tone === "danger"  ? { borderColor: "var(--rose-200)" } :
                          undefined;
  return (
    <Card padding="md" className="h-full" style={palette}>
      <div className="flex h-full flex-col gap-1">
        <span className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>
          {label}
        </span>
        <div className="text-[24px] font-semibold leading-none tabular-nums" style={{ color: "var(--text-default)" }}>
          {value}
        </div>
        {sub && <div className="text-[11px]" style={{ color: "var(--text-muted)" }}>{sub}</div>}
      </div>
    </Card>
  );
}
