import Link from "next/link";
import { requireTenant } from "@/lib/tenant";
import { searchHelpArticles } from "@/server/tenant/help";
import { logSearchQuery } from "@/app/actions/help";
import { formatDate } from "@/lib/format";

// Help-center search results.
//
// GET ?q=string. Naive ILIKE search across published articles, ranked
// by viewCount + recency. Logs the query (fire-and-forget) so the
// platform-side analytics page can surface top searches / zero-result
// queries.

export const dynamic = "force-dynamic";

export default async function HelpSearchPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ q?: string }>;
}) {
  const { slug } = await params;
  const sp = await searchParams;
  await requireTenant(slug);

  const query = (sp.q ?? "").trim();
  const results = query ? await searchHelpArticles(query, 50) : [];

  // Fire-and-forget search instrumentation.
  if (query) {
    void logSearchQuery(slug, query, results.length, null);
  }

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div style={{ fontSize: 12 }}>
        <Link
          href={`/t/${slug}/help`}
          className="ts-focus inline-flex items-center gap-1 transition-colors hover:text-[var(--text-default)]"
          style={{ color: "var(--text-muted)" }}
        >
          ← Help center
        </Link>
      </div>

      {/* Search header. */}
      <form
        method="get"
        action={`/t/${slug}/help/search`}
        className="relative overflow-hidden rounded-2xl"
        style={{
          padding: "22px 24px",
          background:
            "radial-gradient(720px circle at -8% -40%, var(--accent-surface), transparent 55%), " +
            "linear-gradient(180deg, color-mix(in oklab, var(--surface-1) 92%, white 8%) 0%, var(--surface-1) 100%)",
          border: "1px solid var(--border-subtle)",
          boxShadow:
            "inset 0 1px 0 0 color-mix(in oklab, white 4%, transparent), " +
            "0 1px 2px 0 rgba(0,0,0,0.18)",
        }}
      >
        <div
          style={{
            color: "var(--text-faint)",
            fontSize: 10.5,
            fontWeight: 700,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
          }}
        >
          Search the help center
        </div>
        <div
          className="mt-2 flex items-center"
          style={{
            height: 44,
            padding: "0 16px",
            borderRadius: 11,
            background: "color-mix(in oklab, var(--surface-2) 75%, transparent)",
            border: "1px solid var(--border-subtle)",
          }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ color: "var(--text-faint)", flexShrink: 0 }}>
            <circle cx="11" cy="11" r="7" />
            <path d="m21 21-4.3-4.3" />
          </svg>
          <input
            type="text"
            name="q"
            defaultValue={query}
            autoFocus
            autoComplete="off"
            placeholder="Search for an article…"
            style={{
              flex: 1,
              marginLeft: 10,
              background: "transparent",
              border: 0,
              outline: "none",
              color: "var(--text-default)",
              fontSize: 13.5,
              letterSpacing: "-0.005em",
            }}
          />
          <button
            type="submit"
            className="ts-focus rounded-md px-3 py-1"
            style={{
              fontSize: 11,
              fontWeight: 700,
              color: "var(--accent-primary)",
              background: "var(--accent-surface)",
              border: "1px solid color-mix(in oklab, var(--accent-primary) 30%, transparent)",
              marginLeft: 8,
              letterSpacing: "0.04em",
            }}
          >
            Search
          </button>
        </div>
        {query && (
          <p
            className="mt-3"
            style={{ color: "var(--text-muted)", fontSize: 12.5 }}
          >
            {results.length === 0
              ? `No results for `
              : `${results.length} result${results.length === 1 ? "" : "s"} for `}
            <strong style={{ color: "var(--text-default)" }}>“{query}”</strong>
          </p>
        )}
      </form>

      {/* Results / empty state. */}
      {!query ? (
        <BlankPrompt slug={slug} />
      ) : results.length === 0 ? (
        <NoResults slug={slug} query={query} />
      ) : (
        <ul
          className="rounded-xl overflow-hidden"
          style={{
            background:
              "linear-gradient(180deg, color-mix(in oklab, var(--surface-1) 92%, white 8%) 0%, var(--surface-1) 100%)",
            border: "1px solid var(--border-subtle)",
            boxShadow:
              "inset 0 1px 0 0 color-mix(in oklab, white 4%, transparent), " +
              "0 1px 2px 0 rgba(0,0,0,0.18)",
          }}
        >
          {results.map((a, i) => (
            <li
              key={a.id}
              style={{
                borderTop: i === 0 ? undefined : "1px solid var(--border-subtle)",
              }}
            >
              <Link
                href={
                  a.categorySlug
                    ? `/t/${slug}/help/${a.categorySlug}/${a.slug}?from=search`
                    : "#"
                }
                className="ts-focus block transition-colors hover:bg-[color-mix(in_oklab,var(--surface-3)_45%,transparent)]"
                style={{
                  padding: "16px 20px",
                  textDecoration: "none",
                }}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <div
                      style={{
                        color: "var(--text-default)",
                        fontSize: 14,
                        fontWeight: 600,
                        letterSpacing: "-0.005em",
                        lineHeight: 1.35,
                      }}
                    >
                      {a.title}
                    </div>
                    {a.summary && (
                      <p
                        className="mt-1"
                        style={{
                          color: "var(--text-muted)",
                          fontSize: 12,
                          lineHeight: 1.5,
                        }}
                      >
                        {a.summary}
                      </p>
                    )}
                    <div
                      className="mt-2 flex items-center gap-2"
                      style={{
                        color: "var(--text-faint)",
                        fontSize: 11,
                        fontFeatureSettings: "'tnum' 1",
                      }}
                    >
                      {a.categoryName && (
                        <span
                          style={{
                            color: "var(--accent-primary)",
                            fontWeight: 600,
                          }}
                        >
                          {a.categoryName}
                        </span>
                      )}
                      {a.categoryName && (
                        <span style={{ color: "color-mix(in oklab, var(--text-faint) 50%, transparent)" }}>·</span>
                      )}
                      <span>{a.readMinutes} min read</span>
                      <span style={{ color: "color-mix(in oklab, var(--text-faint) 50%, transparent)" }}>·</span>
                      <span>Updated {formatDate(a.updatedAt)}</span>
                    </div>
                  </div>
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    style={{ color: "var(--text-faint)", flexShrink: 0, marginTop: 4 }}
                  >
                    <path d="M9 18l6-6-6-6" />
                  </svg>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function BlankPrompt({ slug }: { slug: string }) {
  return (
    <div
      className="rounded-xl text-center"
      style={{
        padding: "40px 22px",
        background: "color-mix(in oklab, var(--surface-2) 50%, transparent)",
        border: "1px solid var(--border-subtle)",
      }}
    >
      <p style={{ color: "var(--text-muted)", fontSize: 13 }}>
        Type a search term above to find help articles.
      </p>
      <Link
        href={`/t/${slug}/help`}
        className="mt-3 inline-flex items-center rounded-lg transition-colors hover:bg-[var(--surface-3)]"
        style={{
          height: 32,
          padding: "0 12px",
          color: "var(--text-default)",
          background: "color-mix(in oklab, var(--surface-1) 70%, transparent)",
          border: "1px solid var(--border-subtle)",
          fontSize: 12.5,
          fontWeight: 500,
        }}
      >
        Browse categories
      </Link>
    </div>
  );
}

function NoResults({ slug, query }: { slug: string; query: string }) {
  return (
    <div
      className="rounded-xl text-center"
      style={{
        padding: "40px 22px",
        background: "color-mix(in oklab, var(--surface-2) 50%, transparent)",
        border: "1px solid var(--border-subtle)",
      }}
    >
      <div
        aria-hidden
        className="mx-auto flex items-center justify-center"
        style={{
          width: 48,
          height: 48,
          borderRadius: 12,
          background: "linear-gradient(135deg, var(--accent-surface-strong), var(--accent-surface))",
          color: "var(--accent-primary)",
          border: "1px solid color-mix(in oklab, var(--accent-primary) 22%, transparent)",
        }}
      >
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <circle cx="11" cy="11" r="7" />
          <path d="m21 21-4.3-4.3" />
        </svg>
      </div>
      <h2
        className="mt-3 font-semibold"
        style={{
          color: "var(--text-default)",
          fontSize: 16,
          letterSpacing: "-0.012em",
        }}
      >
        No articles matched “{query}”
      </h2>
      <p
        className="mx-auto mt-1.5 max-w-md"
        style={{ color: "var(--text-muted)", fontSize: 12.5, lineHeight: 1.5 }}
      >
        Try a different keyword, browse by category, or contact our support
        team — they&apos;ll usually answer within a few hours.
      </p>
      <div className="mt-4 flex justify-center gap-2">
        <Link
          href={`/t/${slug}/help`}
          className="ts-focus inline-flex items-center rounded-lg transition-colors hover:bg-[var(--surface-3)]"
          style={{
            height: 32,
            padding: "0 12px",
            color: "var(--text-default)",
            background: "color-mix(in oklab, var(--surface-1) 70%, transparent)",
            border: "1px solid var(--border-subtle)",
            fontSize: 12.5,
            fontWeight: 500,
          }}
        >
          Browse categories
        </Link>
        <Link
          href={`/t/${slug}/support/new`}
          className="ts-focus inline-flex items-center gap-1.5 rounded-lg font-semibold"
          style={{
            height: 32,
            padding: "0 14px",
            background:
              "linear-gradient(180deg, color-mix(in oklab, var(--accent-primary) 96%, white 4%) 0%, var(--accent-primary) 100%)",
            color: "var(--accent-fg)",
            border: "1px solid color-mix(in oklab, var(--accent-primary) 80%, black 20%)",
            fontSize: 12.5,
          }}
        >
          Contact support
        </Link>
      </div>
    </div>
  );
}
