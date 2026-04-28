import { requirePlatformStaff } from "@/lib/platform";
import { db } from "@/lib/db";
import { Card, CardHeader } from "@/components/Card";
import { LiveMap, type LiveDot } from "@/components/platform/LiveMap";
import { AnalyticsAutoRefresh } from "@/components/platform/AnalyticsAutoRefresh";

// Marketing-site visitor analytics — first-party, GDPR-friendly.
//
// Reads PageView rows produced by the /api/track beacon (which only
// fires for visitors who clicked "Accept" on the cookie banner).
// Page is force-dynamic so each request hits the DB fresh; the small
// AnalyticsAutoRefresh client component triggers a router.refresh()
// every 15s so the dashboard feels live without WebSockets.

export const dynamic = "force-dynamic";

const LIVE_WINDOW_MS = 5 * 60 * 1000; // a session counts as "live" if active in the last 5 min
const TODAY_WINDOW_MS = 24 * 60 * 60 * 1000;

function ago(ms: number): Date {
  return new Date(Date.now() - ms);
}

function emojiForCountry(code: string | null | undefined): string {
  if (!code || code.length !== 2) return "🌐";
  // Country flag emoji = regional indicator A-Z offset.
  const A = 0x1f1e6;
  const upper = code.toUpperCase();
  return String.fromCodePoint(
    A + upper.charCodeAt(0) - 65,
    A + upper.charCodeAt(1) - 65,
  );
}

function timeAgo(d: Date): string {
  const sec = Math.floor((Date.now() - d.getTime()) / 1000);
  if (sec < 5) return "just now";
  if (sec < 60) return `${sec}s ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const d2 = Math.floor(hr / 24);
  return `${d2}d ago`;
}

export default async function PlatformAnalyticsPage() {
  await requirePlatformStaff();

  const liveCutoff = ago(LIVE_WINDOW_MS);
  const todayCutoff = ago(TODAY_WINDOW_MS);

  // One round-trip per metric — most are aggregates over different
  // windows and group-bys, so a single Promise.all keeps the page
  // snappy. Each query is index-supported (createdAt + sessionId +
  // path are all indexed on PageView).
  const [
    liveSessions,
    todayCount,
    todayUnique,
    topPagesRows,
    topReferrersRows,
    countryRows,
    recentRows,
  ] = await Promise.all([
    // Distinct sessionIds active in the last 5 min — these become the dots on the map.
    db.pageView.findMany({
      where: { createdAt: { gte: liveCutoff } },
      select: {
        sessionId: true,
        latitude: true,
        longitude: true,
        country: true,
        city: true,
        path: true,
        createdAt: true,
      },
      orderBy: { createdAt: "desc" },
      take: 500,
    }),
    db.pageView.count({ where: { createdAt: { gte: todayCutoff } } }),
    db.pageView.findMany({
      where: { createdAt: { gte: todayCutoff } },
      select: { sessionId: true },
      distinct: ["sessionId"],
    }),
    db.pageView.groupBy({
      by: ["path"],
      where: { createdAt: { gte: todayCutoff } },
      _count: { _all: true },
      orderBy: { _count: { path: "desc" } },
      take: 10,
    }),
    db.pageView.groupBy({
      by: ["referrerHost"],
      where: { createdAt: { gte: todayCutoff } },
      _count: { _all: true },
      orderBy: { _count: { referrerHost: "desc" } },
      take: 10,
    }),
    db.pageView.groupBy({
      by: ["country"],
      where: { createdAt: { gte: todayCutoff } },
      _count: { _all: true },
      orderBy: { _count: { country: "desc" } },
      take: 10,
    }),
    db.pageView.findMany({
      where: { createdAt: { gte: todayCutoff } },
      select: {
        id: true,
        path: true,
        country: true,
        city: true,
        referrerHost: true,
        createdAt: true,
      },
      orderBy: { createdAt: "desc" },
      take: 25,
    }),
  ]);

  // Distinct sessionId map → one dot per session, using the most
  // recent geo + label for that session.
  const liveDotsBySession = new Map<string, LiveDot & { recordedAt: Date }>();
  for (const r of liveSessions) {
    if (liveDotsBySession.has(r.sessionId)) continue; // already saw a newer row
    if (r.latitude == null || r.longitude == null) continue;
    liveDotsBySession.set(r.sessionId, {
      key: r.sessionId,
      coordinates: [r.longitude, r.latitude],
      label: `${r.city ?? "Unknown city"} · ${r.country ?? "??"} · ${r.path}`,
      recordedAt: r.createdAt,
    });
  }
  const liveDots: LiveDot[] = Array.from(liveDotsBySession.values()).map(
    ({ recordedAt: _r, ...d }) => d,
  );
  const liveCount = new Set(liveSessions.map((r) => r.sessionId)).size;

  return (
    <div className="space-y-6">
      <AnalyticsAutoRefresh />

      <header className="flex items-baseline justify-between">
        <div>
          <h1 className="text-2xl font-semibold" style={{ color: "var(--text-default)" }}>
            Analytics
          </h1>
          <p className="mt-1 text-sm" style={{ color: "var(--text-muted)" }}>
            Live visitor activity on the public marketing site. Authenticated app
            and platform pages are not tracked.
          </p>
        </div>
        <div className="text-xs" style={{ color: "var(--text-faint)" }}>
          Auto-refreshes every 15s
        </div>
      </header>

      {/* ── Top stat strip ─────────────────────────────────────── */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatTile
          label="Live now"
          value={liveCount}
          hint={`${liveDots.length} pinned to map · last ${LIVE_WINDOW_MS / 60000} min`}
          tone="accent"
        />
        <StatTile
          label="Page views (24h)"
          value={todayCount}
          hint="All recorded views from consented visitors."
        />
        <StatTile
          label="Unique visitors (24h)"
          value={todayUnique.length}
          hint="Distinct sessions with at least one page view."
        />
      </div>

      {/* ── Live map ───────────────────────────────────────────── */}
      <Card>
        <CardHeader
          title="Live map"
          description={
            liveCount === 0
              ? "Nobody on the site right now."
              : `${liveCount} visitor${liveCount === 1 ? "" : "s"} on the site right now.`
          }
        />
        <div className="px-5 py-4">
          <LiveMap dots={liveDots} height={400} />
        </div>
      </Card>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* ── Top pages ──────────────────────────────────────── */}
        <Card>
          <CardHeader
            title="Top pages"
            description="Last 24 hours · by page views"
          />
          <ul className="divide-y" style={{ borderColor: "var(--border-subtle)" }}>
            {topPagesRows.length === 0 && (
              <li className="px-5 py-4 text-sm" style={{ color: "var(--text-muted)" }}>
                No pages viewed in the last 24 hours.
              </li>
            )}
            {topPagesRows.map((r) => (
              <li
                key={r.path}
                className="flex items-center justify-between gap-3 px-5 py-3 text-sm"
              >
                <code style={{ color: "var(--text-default)" }}>{r.path || "/"}</code>
                <span className="tabular-nums" style={{ color: "var(--text-muted)" }}>
                  {r._count._all}
                </span>
              </li>
            ))}
          </ul>
        </Card>

        {/* ── Top referrers ──────────────────────────────────── */}
        <Card>
          <CardHeader
            title="Top referrers"
            description="Last 24 hours · where visitors came from"
          />
          <ul className="divide-y" style={{ borderColor: "var(--border-subtle)" }}>
            {topReferrersRows.length === 0 && (
              <li className="px-5 py-4 text-sm" style={{ color: "var(--text-muted)" }}>
                No referrers in the last 24 hours.
              </li>
            )}
            {topReferrersRows.map((r) => (
              <li
                key={r.referrerHost ?? "__direct__"}
                className="flex items-center justify-between gap-3 px-5 py-3 text-sm"
              >
                <span style={{ color: "var(--text-default)" }}>
                  {r.referrerHost ?? "Direct / typed-in"}
                </span>
                <span className="tabular-nums" style={{ color: "var(--text-muted)" }}>
                  {r._count._all}
                </span>
              </li>
            ))}
          </ul>
        </Card>

        {/* ── Top countries ──────────────────────────────────── */}
        <Card>
          <CardHeader
            title="Top countries"
            description="Last 24 hours · by page views"
          />
          <ul className="divide-y" style={{ borderColor: "var(--border-subtle)" }}>
            {countryRows.length === 0 && (
              <li className="px-5 py-4 text-sm" style={{ color: "var(--text-muted)" }}>
                No country data in the last 24 hours.
              </li>
            )}
            {countryRows.map((r) => (
              <li
                key={r.country ?? "__none__"}
                className="flex items-center justify-between gap-3 px-5 py-3 text-sm"
              >
                <span style={{ color: "var(--text-default)" }}>
                  <span className="mr-2">{emojiForCountry(r.country)}</span>
                  {r.country ?? "Unknown"}
                </span>
                <span className="tabular-nums" style={{ color: "var(--text-muted)" }}>
                  {r._count._all}
                </span>
              </li>
            ))}
          </ul>
        </Card>

        {/* ── Live feed ──────────────────────────────────────── */}
        <Card>
          <CardHeader
            title="Recent activity"
            description="Latest 25 page views"
          />
          <ul className="divide-y" style={{ borderColor: "var(--border-subtle)" }}>
            {recentRows.length === 0 && (
              <li className="px-5 py-4 text-sm" style={{ color: "var(--text-muted)" }}>
                No activity yet.
              </li>
            )}
            {recentRows.map((r) => (
              <li key={r.id} className="px-5 py-3 text-sm">
                <div className="flex items-center justify-between gap-3">
                  <code style={{ color: "var(--text-default)" }}>{r.path || "/"}</code>
                  <span style={{ color: "var(--text-faint)" }}>{timeAgo(r.createdAt)}</span>
                </div>
                <div className="mt-1 text-xs" style={{ color: "var(--text-muted)" }}>
                  <span>{emojiForCountry(r.country)}</span>{" "}
                  <span>
                    {[r.city, r.country].filter(Boolean).join(", ") || "Unknown location"}
                  </span>
                  {r.referrerHost && (
                    <>
                      {" · via "}
                      <span style={{ color: "var(--text-default)" }}>{r.referrerHost}</span>
                    </>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </div>
  );
}

function StatTile({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: number;
  hint?: string;
  tone?: "accent";
}) {
  return (
    <div
      className="rounded-lg p-4"
      style={{
        background: tone === "accent" ? "var(--accent-surface)" : "var(--surface-1)",
        border: `1px solid ${tone === "accent" ? "var(--accent-primary)" : "var(--border-subtle)"}`,
      }}
    >
      <div
        className="text-xs uppercase tracking-wide"
        style={{ color: tone === "accent" ? "var(--accent-primary)" : "var(--text-muted)" }}
      >
        {label}
      </div>
      <div
        className="mt-2 text-3xl font-semibold tabular-nums"
        style={{ color: "var(--text-default)" }}
      >
        {value.toLocaleString()}
      </div>
      {hint && (
        <div className="mt-1 text-xs" style={{ color: "var(--text-faint)" }}>
          {hint}
        </div>
      )}
    </div>
  );
}
