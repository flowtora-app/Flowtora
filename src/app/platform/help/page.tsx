// Help Center.
//
// Sidebar tree of every admin page (grouped by section) on the left;
// detail pane with structured help content on the right. Search across
// labels, summaries, sections, and FAQs.

import * as React from "react";
import Link from "next/link";
import { requirePlatformStaff } from "@/lib/platform";
import { Icon, type IconName } from "@/components/shell/icons";
import {
  HELP_GROUPS, HELP_ENTRIES, entriesByGroup, getEntry, searchEntries,
  type HelpGroupId,
} from "@/server/platform/help-registry";

export const dynamic = "force-dynamic";

type SP = Record<string, string | string[] | undefined>;
const asString = (v: string | string[] | undefined): string | undefined =>
  typeof v === "string" && v.length > 0 ? v : undefined;

export default async function HelpCenterPage({
  searchParams,
}: { searchParams: Promise<SP> }) {
  await requirePlatformStaff();
  const sp = await searchParams;
  const slug = asString(sp.page);
  const query = asString(sp.q);

  const selected = slug ? getEntry(slug) : null;
  const matches = query ? searchEntries(query) : [];
  const grouped = entriesByGroup();

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight" style={{ color: "var(--text-default)" }}>
            Help Center
          </h1>
          <p className="mt-1 text-sm" style={{ color: "var(--text-muted)" }}>
            What every admin page is for, who uses it, and how to drive it. Pick a page on the left,
            or search for a feature.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <span className="rounded-md px-2 py-1 text-[10px] uppercase tracking-wide"
            style={{ background: "var(--surface-2)", color: "var(--text-muted)" }}>
            {HELP_ENTRIES.length} pages documented
          </span>
        </div>
      </header>

      {/* Search */}
      <form method="get" className="flex flex-wrap items-end gap-3">
        <label className="block flex-1 max-w-lg">
          <span className="block text-[10px] uppercase tracking-wide" style={{ color: "var(--text-faint)" }}>
            Search
          </span>
          <input
            type="text"
            name="q"
            defaultValue={query ?? ""}
            placeholder="Search for a page, feature, or how-to"
            className="w-full rounded-md px-3 py-2 text-sm outline-none"
            style={{ background: "var(--surface-1)", border: "1px solid var(--border-default)", color: "var(--text-default)" }}
          />
        </label>
        {slug && <input type="hidden" name="page" value={slug} />}
        <button type="submit" className="rounded-md px-3 py-2 text-xs font-medium"
          style={{ background: "var(--surface-1)", color: "var(--text-default)", border: "1px solid var(--border-default)" }}>
          Search
        </button>
        {query && (
          <Link
            href={slug ? `/platform/help?page=${slug}` : "/platform/help"}
            className="rounded-md px-3 py-2 text-xs"
            style={{ color: "var(--text-muted)" }}
          >
            Clear
          </Link>
        )}
      </form>

      {/* Search results banner */}
      {query && (
        <section
          className="overflow-hidden rounded-xl"
          style={{ background: "var(--surface-1)", border: "1px solid var(--border-subtle)", boxShadow: "var(--shadow-sm)" }}
        >
          <header className="px-5 py-3" style={{ borderBottom: "1px solid var(--border-subtle)" }}>
            <h2 className="text-sm font-semibold">
              {matches.length} result{matches.length === 1 ? "" : "s"} for &ldquo;{query}&rdquo;
            </h2>
          </header>
          {matches.length === 0 ? (
            <p className="px-5 py-4 text-sm" style={{ color: "var(--text-muted)" }}>
              No matches. Try a different term, or browse the sidebar below.
            </p>
          ) : (
            <ul>
              {matches.map((e) => {
                const Ic = Icon[e.icon];
                return (
                  <li key={e.slug} style={{ borderTop: "1px solid var(--border-subtle)" }}>
                    <Link
                      href={`/platform/help?page=${e.slug}`}
                      className="flex items-start gap-3 px-5 py-3 hover:bg-[var(--surface-2)]"
                    >
                      <Ic size={16} style={{ marginTop: 2, color: "var(--text-muted)" }} />
                      <div className="min-w-0">
                        <div className="text-sm font-medium" style={{ color: "var(--text-default)" }}>
                          {e.label}
                          {e.page && (
                            <span className="ml-2 text-[10px] uppercase tracking-wide" style={{ color: "var(--text-faint)" }}>
                              Page {e.page}
                            </span>
                          )}
                        </div>
                        <div className="mt-0.5 text-xs" style={{ color: "var(--text-muted)" }}>{e.summary}</div>
                      </div>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      )}

      <div className="grid gap-6 lg:grid-cols-[280px_1fr]">
        {/* ── Sidebar tree ────────────────────────────────── */}
        <aside
          className="overflow-hidden rounded-xl"
          style={{ background: "var(--surface-1)", border: "1px solid var(--border-subtle)", boxShadow: "var(--shadow-sm)" }}
        >
          <header className="px-4 py-3" style={{ borderBottom: "1px solid var(--border-subtle)" }}>
            <h2 className="text-sm font-semibold">Pages by section</h2>
          </header>
          <nav>
            {HELP_GROUPS.map((g) => {
              const entries = grouped.get(g.id) ?? [];
              if (entries.length === 0) return null;
              const activeInside = entries.some((e) => e.slug === slug);
              return (
                <details key={g.id} open={activeInside || !slug} className="text-sm">
                  <summary
                    className="cursor-pointer list-none px-4 py-2 text-xs font-semibold uppercase tracking-wide"
                    style={{
                      background: activeInside ? "var(--surface-2)" : "transparent",
                      color: activeInside ? "var(--text-default)" : "var(--text-muted)",
                    }}
                  >
                    {g.label}
                    <span className="ml-2 text-[10px] font-normal normal-case" style={{ color: "var(--text-faint)" }}>
                      · {entries.length}
                    </span>
                  </summary>
                  <ul>
                    {entries.map((e) => {
                      const Ic = Icon[e.icon];
                      const isSelected = e.slug === slug;
                      return (
                        <li key={e.slug}>
                          <Link
                            href={`/platform/help?page=${e.slug}`}
                            className="flex items-center gap-2 px-4 py-1.5 text-sm"
                            style={{
                              background: isSelected ? "var(--accent-surface)" : "transparent",
                              color: isSelected ? "var(--accent-primary)" : "var(--text-default)",
                              borderTop: "1px solid var(--border-subtle)",
                            }}
                          >
                            <Ic size={14} />
                            <span className="truncate">{e.label}</span>
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                </details>
              );
            })}
          </nav>
        </aside>

        {/* ── Main: entry detail OR landing pane ─────────── */}
        <main className="space-y-4">
          {!selected ? (
            <LandingPane />
          ) : (
            <EntryDetail entry={selected} />
          )}
        </main>
      </div>
    </div>
  );
}

/* ── Landing pane ─────────────────────────────────────────── */

function LandingPane() {
  const grouped = entriesByGroup();
  return (
    <>
      <section
        className="rounded-xl p-6"
        style={{ background: "var(--surface-1)", border: "1px solid var(--border-subtle)", boxShadow: "var(--shadow-sm)" }}
      >
        <h2 className="text-base font-semibold">Welcome to the Flowtora admin Help Center</h2>
        <p className="mt-2 text-sm" style={{ color: "var(--text-muted)" }}>
          Every page in this admin portal has a short reference that explains what it&apos;s for, who
          owns it day-to-day, and how to drive its key features. Pick one on the left to start
          reading.
        </p>
        <p className="mt-3 text-sm" style={{ color: "var(--text-muted)" }}>
          New to the platform? Start with{" "}
          <Link href="/platform/help?page=my-profile" className="underline" style={{ color: "var(--accent-primary)" }}>
            My Profile
          </Link>{" "}
          to set up your account, then jump into the section that matches your role.
        </p>
      </section>

      {/* Group overview tiles */}
      <section className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
        {HELP_GROUPS.map((g) => {
          const entries = grouped.get(g.id) ?? [];
          if (entries.length === 0) return null;
          return (
            <article
              key={g.id}
              className="rounded-xl p-4"
              style={{ background: "var(--surface-1)", border: "1px solid var(--border-subtle)", boxShadow: "var(--shadow-sm)" }}
            >
              <h3 className="text-sm font-semibold">{g.label}</h3>
              <p className="mt-1 text-xs" style={{ color: "var(--text-muted)" }}>{g.description}</p>
              <ul className="mt-3 space-y-1">
                {entries.slice(0, 5).map((e) => (
                  <li key={e.slug}>
                    <Link
                      href={`/platform/help?page=${e.slug}`}
                      className="text-xs hover:underline"
                      style={{ color: "var(--accent-primary)" }}
                    >
                      {e.label}
                    </Link>
                  </li>
                ))}
                {entries.length > 5 && (
                  <li className="text-[10px]" style={{ color: "var(--text-faint)" }}>
                    +{entries.length - 5} more
                  </li>
                )}
              </ul>
            </article>
          );
        })}
      </section>
    </>
  );
}

/* ── Entry detail ─────────────────────────────────────────── */

function EntryDetail({ entry }: { entry: ReturnType<typeof getEntry> & object }) {
  const Ic = Icon[entry.icon];
  return (
    <>
      {/* Header */}
      <section
        className="rounded-xl p-5"
        style={{ background: "var(--surface-1)", border: "1px solid var(--border-subtle)", boxShadow: "var(--shadow-sm)" }}
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-start gap-3 min-w-0">
            <span
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md"
              style={{ background: "var(--accent-surface)", color: "var(--accent-primary)" }}
            >
              <Ic size={18} />
            </span>
            <div className="min-w-0">
              <h2 className="text-lg font-semibold" style={{ color: "var(--text-default)" }}>
                {entry.label}
              </h2>
              <p className="mt-1 text-sm" style={{ color: "var(--text-muted)" }}>
                {entry.summary}
              </p>
            </div>
          </div>
          <Link
            href={entry.route}
            className="rounded-md px-3 py-2 text-xs font-medium"
            style={{ background: "var(--accent-primary)", color: "var(--accent-fg)" }}
          >
            Open page →
          </Link>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Meta label="Route" value={entry.route} mono />
          {entry.page && <Meta label="Spec page" value={`#${entry.page}`} mono />}
          {entry.audience && entry.audience.length > 0 && (
            <Meta label="Owners" value={entry.audience.join(" · ")} />
          )}
          {entry.permissions && entry.permissions.length > 0 && (
            <Meta label="Permissions" value={entry.permissions.join(" · ")} />
          )}
        </div>
      </section>

      {/* Sections */}
      {entry.sections.map((s, i) => (
        <section
          key={i}
          className="rounded-xl"
          style={{ background: "var(--surface-1)", border: "1px solid var(--border-subtle)", boxShadow: "var(--shadow-sm)" }}
        >
          <header className="px-5 py-3" style={{ borderBottom: "1px solid var(--border-subtle)" }}>
            <h3 className="text-sm font-semibold">{s.heading}</h3>
          </header>
          <div className="px-5 py-4 text-sm leading-relaxed" style={{ color: "var(--text-default)" }}>
            {s.body.split("\n\n").map((para, p) => (
              <p key={p} className={p === 0 ? "" : "mt-3"}>{para}</p>
            ))}
          </div>
        </section>
      ))}

      {/* FAQ */}
      {entry.faq && entry.faq.length > 0 && (
        <section
          className="rounded-xl"
          style={{ background: "var(--surface-1)", border: "1px solid var(--border-subtle)", boxShadow: "var(--shadow-sm)" }}
        >
          <header className="px-5 py-3" style={{ borderBottom: "1px solid var(--border-subtle)" }}>
            <h3 className="text-sm font-semibold">FAQ</h3>
          </header>
          <ul>
            {entry.faq.map((f, i) => (
              <li
                key={i}
                className="px-5 py-4 text-sm"
                style={{ borderTop: i === 0 ? "none" : "1px solid var(--border-subtle)" }}
              >
                <div className="font-medium" style={{ color: "var(--text-default)" }}>{f.q}</div>
                <div className="mt-1.5" style={{ color: "var(--text-muted)" }}>{f.a}</div>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}

/* ── UI helpers ───────────────────────────────────────────── */

function Meta({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="rounded-md px-3 py-2"
      style={{ background: "var(--surface-2)", border: "1px solid var(--border-subtle)" }}>
      <div className="text-[10px] uppercase tracking-wide" style={{ color: "var(--text-faint)" }}>
        {label}
      </div>
      <div
        className={`mt-0.5 truncate text-xs ${mono ? "font-mono" : ""}`}
        style={{ color: "var(--text-default)" }}
        title={value}
      >
        {value}
      </div>
    </div>
  );
}
