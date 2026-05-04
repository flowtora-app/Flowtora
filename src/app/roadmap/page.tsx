// Public roadmap — read-only column view of every public feature
// request whose status is in PUBLIC_ROADMAP_COLUMNS.

import Link from "next/link";
import {
  loadPublicRoadmap,
  PUBLIC_ROADMAP_COLUMNS,
} from "@/server/platform/feature-requests";
import { renderMarkdown } from "@/lib/md-to-html";
import type { FeatureRequestStatus } from "@prisma/client";

export const dynamic = "force-dynamic";

const COLUMN_LABEL: Record<FeatureRequestStatus, string> = {
  SUBMITTED:    "Submitted",
  BACKLOG:      "Backlog",
  UNDER_REVIEW: "Under review",
  PLANNED:      "Coming up",
  IN_PROGRESS:  "Building now",
  BETA:         "In beta",
  SHIPPED:      "Shipped",
  WONT_DO:      "Won't do",
};

const COLUMN_TONE: Record<FeatureRequestStatus, { bg: string; fg: string }> = {
  SUBMITTED:    { bg: "var(--surface-2)",       fg: "var(--text-muted)"     },
  BACKLOG:      { bg: "var(--surface-2)",       fg: "var(--text-muted)"     },
  UNDER_REVIEW: { bg: "var(--warning-surface)", fg: "var(--warning-fg)"     },
  PLANNED:      { bg: "var(--accent-surface)",  fg: "var(--accent-primary)" },
  IN_PROGRESS:  { bg: "var(--warning-surface)", fg: "var(--warning-fg)"     },
  BETA:         { bg: "var(--success-surface)", fg: "var(--success-fg)"     },
  SHIPPED:      { bg: "var(--success-surface)", fg: "var(--success-fg)"     },
  WONT_DO:      { bg: "var(--surface-2)",       fg: "var(--text-faint)"     },
};

export const metadata = {
  title: "Roadmap — Flowtora",
  description: "What we're building, what's in beta, and what just shipped.",
};

export default async function PublicRoadmapPage() {
  const items = await loadPublicRoadmap();
  const byCol = new Map<FeatureRequestStatus, typeof items>();
  for (const c of PUBLIC_ROADMAP_COLUMNS) byCol.set(c, []);
  for (const it of items) {
    const list = byCol.get(it.status) ?? [];
    list.push(it);
    byCol.set(it.status, list);
  }

  return (
    <main
      className="mx-auto min-h-screen max-w-6xl px-4 py-10"
      style={{ background: "var(--surface-0, var(--surface-1))", color: "var(--text-default)" }}
    >
      <header className="mb-10">
        <p className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: "var(--accent-primary)" }}>
          Flowtora roadmap
        </p>
        <h1 className="mt-1 text-[34px] font-semibold leading-tight">
          What we&apos;re building next
        </h1>
        <p className="mt-2 max-w-2xl text-[14px]" style={{ color: "var(--text-muted)" }}>
          A live look at the work in flight, what&apos;s in beta with early-access shops,
          and what we just shipped. Subscribe via{" "}
          <Link href="/roadmap/rss.xml" className="underline" style={{ color: "var(--accent-primary)" }}>
            RSS
          </Link>{" "}
          to follow along.
        </p>
      </header>

      <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-4">
        {PUBLIC_ROADMAP_COLUMNS.map((col) => {
          const list = byCol.get(col) ?? [];
          const tone = COLUMN_TONE[col];
          return (
            <section
              key={col}
              className="rounded-lg border p-4"
              style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)" }}
            >
              <div className="flex items-baseline justify-between gap-2">
                <h2 className="text-[15px] font-semibold" style={{ color: tone.fg }}>
                  {COLUMN_LABEL[col]}
                </h2>
                <span className="text-[11px] tabular-nums" style={{ color: "var(--text-muted)" }}>
                  {list.length} item{list.length === 1 ? "" : "s"}
                </span>
              </div>
              <ul className="mt-3 flex flex-col gap-3">
                {list.length === 0 && (
                  <li className="text-[12px]" style={{ color: "var(--text-faint)" }}>
                    Nothing here yet — check back.
                  </li>
                )}
                {list.map((item) => {
                  const html = renderMarkdown(
                    item.description.length > 240
                      ? item.description.slice(0, 240) + "…"
                      : item.description,
                  );
                  return (
                    <li
                      key={item.id}
                      className="rounded-md border p-3"
                      style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)" }}
                    >
                      <div className="text-[13px] font-semibold" style={{ color: "var(--text-default)" }}>
                        {item.title}
                      </div>
                      {item.plannedRelease && col !== "SHIPPED" && (
                        <div className="mt-0.5 text-[10px] uppercase tracking-wide" style={{ color: tone.fg }}>
                          Target · {item.plannedRelease}
                        </div>
                      )}
                      {item.shippedAt && (
                        <div className="mt-0.5 text-[10px]" style={{ color: "var(--text-muted)" }}>
                          Shipped {item.shippedAt.toLocaleDateString()}
                        </div>
                      )}
                      <div
                        className="md-preview mt-2 text-[11px]"
                        style={{ color: "var(--text-muted)" }}
                        dangerouslySetInnerHTML={{ __html: html }}
                      />
                      <div className="mt-2 text-[10px]" style={{ color: "var(--text-faint)" }}>
                        ▲ {item.voteCount} {item.voteCount === 1 ? "vote" : "votes"}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </section>
          );
        })}
      </div>
    </main>
  );
}
