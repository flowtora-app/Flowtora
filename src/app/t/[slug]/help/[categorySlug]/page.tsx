import Link from "next/link";
import { notFound } from "next/navigation";
import { requireTenant } from "@/lib/tenant";
import { loadArticlesByCategorySlug } from "@/server/tenant/help";
import { formatDate } from "@/lib/format";

// Help category landing — lists every published article in the category.

export const dynamic = "force-dynamic";

export default async function HelpCategoryPage({
  params,
}: {
  params: Promise<{ slug: string; categorySlug: string }>;
}) {
  const { slug, categorySlug } = await params;
  await requireTenant(slug);

  const { category, articles } = await loadArticlesByCategorySlug(categorySlug);
  if (!category) notFound();

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <div style={{ fontSize: 12 }}>
        <Link
          href={`/t/${slug}/help`}
          className="ts-focus inline-flex items-center gap-1 transition-colors hover:text-[var(--text-default)]"
          style={{ color: "var(--text-muted)" }}
        >
          ← Help center
        </Link>
      </div>

      <header
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
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div
              style={{
                color: "var(--text-faint)",
                fontSize: 10.5,
                fontWeight: 700,
                letterSpacing: "0.08em",
                textTransform: "uppercase",
              }}
            >
              Help category
            </div>
            <h1
              className="mt-1 font-semibold"
              style={{
                color: "var(--text-default)",
                fontSize: 26,
                letterSpacing: "-0.02em",
                lineHeight: 1.2,
              }}
            >
              {category.name}
            </h1>
            <p
              className="mt-1.5"
              style={{
                color: "var(--text-muted)",
                fontSize: 12.5,
                lineHeight: 1.45,
              }}
            >
              {articles.length} {articles.length === 1 ? "article" : "articles"}
            </p>
          </div>
          <form
            method="get"
            action={`/t/${slug}/help/search`}
            className="flex items-center"
            style={{
              height: 36,
              padding: "0 12px",
              borderRadius: 10,
              background: "color-mix(in oklab, var(--surface-2) 75%, transparent)",
              border: "1px solid var(--border-subtle)",
              minWidth: 260,
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ color: "var(--text-faint)", flexShrink: 0 }}>
              <circle cx="11" cy="11" r="7" />
              <path d="m21 21-4.3-4.3" />
            </svg>
            <input
              type="text"
              name="q"
              autoComplete="off"
              placeholder="Search…"
              style={{
                flex: 1,
                marginLeft: 8,
                background: "transparent",
                border: 0,
                outline: "none",
                color: "var(--text-default)",
                fontSize: 12.5,
              }}
            />
          </form>
        </div>
      </header>

      {articles.length === 0 ? (
        <EmptyState slug={slug} />
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
          {articles.map((a, i) => (
            <li
              key={a.id}
              style={{
                borderTop: i === 0 ? undefined : "1px solid var(--border-subtle)",
              }}
            >
              <Link
                href={`/t/${slug}/help/${category.slug}/${a.slug}?from=category`}
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
                      <span>{a.readMinutes} min read</span>
                      <span style={{ color: "color-mix(in oklab, var(--text-faint) 50%, transparent)" }}>·</span>
                      <span>Updated {formatDate(a.updatedAt)}</span>
                      {a.viewCount > 0 && (
                        <>
                          <span style={{ color: "color-mix(in oklab, var(--text-faint) 50%, transparent)" }}>·</span>
                          <span>{a.viewCount.toLocaleString()} views</span>
                        </>
                      )}
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

function EmptyState({ slug }: { slug: string }) {
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
          <rect x="4" y="3" width="16" height="18" rx="2" />
          <path d="M9 8h6M9 12h6M9 16h4" />
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
        No articles in this category yet
      </h2>
      <p
        className="mx-auto mt-1.5 max-w-md"
        style={{ color: "var(--text-muted)", fontSize: 12.5, lineHeight: 1.5 }}
      >
        We&apos;re still writing this section. Try searching the whole help
        center, or contact support for help right now.
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
          Back to help
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
