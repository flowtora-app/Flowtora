// Page 34 §Search analytics — top searches + zero-result rate +
// most-clicked articles + deflection signal.

import Link from "next/link";
import { requirePlatformStaff } from "@/lib/platform";
import { loadSearchAnalytics } from "@/server/platform/kb-search-analytics";
import { Kpi } from "../_components/shared";

export const dynamic = "force-dynamic";

export default async function SearchAnalyticsPage() {
  await requirePlatformStaff();
  const data = await loadSearchAnalytics(30);
  const maxBar = Math.max(1, ...data.dailyTrend.map((d) => d.total));

  return (
    <div className="space-y-5">
      <div className="text-[11px]" style={{ color: "var(--text-muted)" }}>
        <Link href="/platform/operations/knowledge-base" className="underline" style={{ color: "var(--text-muted)" }}>
          Knowledge base
        </Link>
        <span className="mx-1.5">/</span>
        <span style={{ color: "var(--text-default)" }}>Search analytics</span>
      </div>

      <h1 className="text-[22px] font-semibold leading-tight" style={{ color: "var(--text-default)" }}>
        Search analytics · last 30 days
      </h1>
      <p className="mt-1 text-[12px]" style={{ color: "var(--text-muted)" }}>
        What customers are searching for, where the gaps are, and which articles are doing the heavy lifting.
      </p>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Kpi label="Searches" value={data.totalSearches.toLocaleString()} />
        <Kpi
          label="Zero-result rate"
          value={`${data.zeroResultRatePct.toFixed(1)}%`}
          sub={`${data.zeroResultCount.toLocaleString()} of ${data.totalSearches.toLocaleString()}`}
          tone={data.zeroResultRatePct > 25 ? "danger" : data.zeroResultRatePct > 10 ? "warning" : "good"}
        />
        <Kpi
          label="Click-through rate"
          value={`${data.ctrPct.toFixed(1)}%`}
          sub={`${data.clickedCount.toLocaleString()} clicked through`}
          tone={data.ctrPct >= 50 ? "good" : data.ctrPct >= 30 ? "warning" : "danger"}
        />
        <Kpi
          label="Top article picks"
          value={data.mostClickedArticles.length.toLocaleString()}
          sub="Distinct articles clicked"
        />
      </div>

      <div
        className="rounded-lg border p-3"
        style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)" }}
      >
        <h2 className="mb-2 text-[12px] font-semibold" style={{ color: "var(--text-default)" }}>
          Daily volume
        </h2>
        <div className="flex h-24 items-end gap-[2px]">
          {data.dailyTrend.map((d) => {
            const totalH = (d.total / maxBar) * 100;
            const zeroH = (d.zero / maxBar) * 100;
            return (
              <div key={d.date} className="flex flex-1 flex-col-reverse" title={`${d.date}: ${d.total} searches · ${d.zero} zero-result · ${d.clicked} clicked`}>
                <div className="rounded-t-sm" style={{ background: "var(--accent-primary)", height: `${Math.max(1, totalH - zeroH)}%` }} />
                <div style={{ background: "var(--danger-fg)", height: `${Math.max(0, zeroH)}%` }} />
              </div>
            );
          })}
        </div>
        <div className="mt-2 flex items-center gap-3 text-[10px]" style={{ color: "var(--text-muted)" }}>
          <span><span className="inline-block h-2 w-2 rounded-sm align-middle" style={{ background: "var(--accent-primary)" }} /> Successful</span>
          <span><span className="inline-block h-2 w-2 rounded-sm align-middle" style={{ background: "var(--danger-fg)" }} /> Zero-result</span>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div
          className="rounded-lg border p-3"
          style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)" }}
        >
          <h2 className="mb-2 text-[12px] font-semibold" style={{ color: "var(--text-default)" }}>
            Top searches
          </h2>
          {data.topSearches.length === 0 ? (
            <p className="text-[12px]" style={{ color: "var(--text-muted)" }}>No searches yet.</p>
          ) : (
            <ul className="flex flex-col gap-1">
              {data.topSearches.map((s) => (
                <li key={s.query} className="flex items-baseline justify-between text-[12px]">
                  <span style={{ color: "var(--text-default)" }}>{s.query || <em>(empty)</em>}</span>
                  <span className="text-[11px] tabular-nums" style={{ color: "var(--text-muted)" }}>
                    {s.count} · {s.zeroResultCount > 0 && (<span style={{ color: "var(--danger-fg)" }}>{s.zeroResultCount} zero</span>)}{" "}
                    {s.clickedCount > 0 && (<span style={{ color: "var(--success-fg)" }}>{s.clickedCount} clicked</span>)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div
          className="rounded-lg border p-3"
          style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)" }}
        >
          <h2 className="mb-2 text-[12px] font-semibold" style={{ color: "var(--text-default)" }}>
            Zero-result queries (content gaps)
          </h2>
          {data.zeroResultQueries.length === 0 ? (
            <p className="text-[12px]" style={{ color: "var(--text-muted)" }}>No zero-result searches — nice.</p>
          ) : (
            <ul className="flex flex-col gap-1">
              {data.zeroResultQueries.map((q) => (
                <li key={q.query} className="flex items-baseline justify-between text-[12px]">
                  <span style={{ color: "var(--text-default)" }}>{q.query || <em>(empty)</em>}</span>
                  <span className="text-[11px] tabular-nums" style={{ color: "var(--danger-fg)" }}>{q.count}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <div
        className="rounded-lg border p-3"
        style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)" }}
      >
        <h2 className="mb-2 text-[12px] font-semibold" style={{ color: "var(--text-default)" }}>
          Most-clicked articles
        </h2>
        {data.mostClickedArticles.length === 0 ? (
          <p className="text-[12px]" style={{ color: "var(--text-muted)" }}>No article clicks yet.</p>
        ) : (
          <ul className="flex flex-col gap-1">
            {data.mostClickedArticles.map((a) => (
              <li key={a.articleId} className="flex items-baseline justify-between gap-3 text-[12px]">
                <Link
                  href={`/platform/operations/knowledge-base/${a.articleId}`}
                  className="ts-focus truncate underline"
                  style={{ color: "var(--text-default)" }}
                >
                  {a.title}
                </Link>
                <span className="tabular-nums" style={{ color: "var(--text-muted)" }}>{a.clicks}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
