import Link from "next/link";
import { notFound } from "next/navigation";
import { requireTenant } from "@/lib/tenant";
import {
  loadArticleByPath,
  loadArticleSummariesByIds,
} from "@/server/tenant/help";
import {
  logArticleView,
  submitArticleFeedback,
} from "@/app/actions/help";
import { renderMarkdown } from "@/lib/md-to-html";
import { formatDate } from "@/lib/format";

// Help article detail page (T-105).
//
// Renders a published KbArticle. Logs the view (best-effort, on the
// server) and exposes a "Was this helpful?" feedback form. Related
// articles surface at the bottom if the author linked any.

export const dynamic = "force-dynamic";

type Source = "category" | "search" | "in-product" | "direct" | "popular";

const VALID_SOURCES: Source[] = ["category", "search", "in-product", "direct", "popular"];

function parseSource(raw: string | undefined): Source {
  if (raw && (VALID_SOURCES as string[]).includes(raw)) return raw as Source;
  return "direct";
}

export default async function HelpArticlePage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string; categorySlug: string; articleSlug: string }>;
  searchParams: Promise<{ from?: string; fb?: string }>;
}) {
  const { slug, categorySlug, articleSlug } = await params;
  const sp = await searchParams;
  await requireTenant(slug);

  const article = await loadArticleByPath(categorySlug, articleSlug);
  if (!article) notFound();

  // Log the view as fire-and-forget. Don't await — the reader sees the
  // article instantly; the analytics row lands a beat later. We do
  // need to call it from a server context so we use a top-level
  // `void` to make the intent explicit.
  void logArticleView(slug, article.id, parseSource(sp.from));

  // Related articles — author-curated list of ids. Hidden / archived
  // ones get filtered out by the loader.
  const related = await loadArticleSummariesByIds(article.relatedArticleIds);

  const bodyHtml = renderMarkdown(article.bodyMarkdown);

  const articlePath = `/t/${slug}/help/${categorySlug}/${articleSlug}`;
  const feedbackAction = submitArticleFeedback.bind(null, slug);

  const totalFeedback = article.helpfulUp + article.helpfulDown;
  const helpfulPct =
    totalFeedback > 0
      ? Math.round((article.helpfulUp / totalFeedback) * 100)
      : null;

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <nav style={{ fontSize: 12 }} aria-label="Breadcrumb">
        <Link
          href={`/t/${slug}/help`}
          className="ts-focus transition-colors hover:text-[var(--text-default)]"
          style={{ color: "var(--text-muted)" }}
        >
          Help center
        </Link>
        <span style={{ color: "var(--text-faint)" }}> / </span>
        <Link
          href={`/t/${slug}/help/${categorySlug}`}
          className="ts-focus transition-colors hover:text-[var(--text-default)]"
          style={{ color: "var(--text-muted)" }}
        >
          {article.categoryName ?? categorySlug}
        </Link>
      </nav>

      <article
        className="relative overflow-hidden rounded-2xl"
        style={{
          padding: "30px 36px",
          background:
            "linear-gradient(180deg, color-mix(in oklab, var(--surface-1) 92%, white 8%) 0%, var(--surface-1) 100%)",
          border: "1px solid var(--border-subtle)",
          boxShadow:
            "inset 0 1px 0 0 color-mix(in oklab, white 4%, transparent), " +
            "0 1px 2px 0 rgba(0,0,0,0.18)",
        }}
      >
        <h1
          className="font-semibold"
          style={{
            color: "var(--text-default)",
            fontSize: 28,
            letterSpacing: "-0.022em",
            lineHeight: 1.2,
          }}
        >
          {article.title}
        </h1>
        {article.summary && (
          <p
            className="mt-2"
            style={{
              color: "var(--text-muted)",
              fontSize: 14.5,
              lineHeight: 1.55,
            }}
          >
            {article.summary}
          </p>
        )}
        <div
          className="mt-3 flex flex-wrap items-center gap-2"
          style={{
            color: "var(--text-faint)",
            fontSize: 11.5,
            fontFeatureSettings: "'tnum' 1",
          }}
        >
          <span>{article.readMinutes} min read</span>
          <span style={{ color: "color-mix(in oklab, var(--text-faint) 50%, transparent)" }}>·</span>
          <span>Updated {formatDate(article.updatedAt)}</span>
          {helpfulPct !== null && (
            <>
              <span style={{ color: "color-mix(in oklab, var(--text-faint) 50%, transparent)" }}>·</span>
              <span>
                {helpfulPct}% found this helpful ({totalFeedback.toLocaleString()})
              </span>
            </>
          )}
        </div>

        <hr
          className="my-6"
          style={{
            border: "none",
            borderTop: "1px solid var(--border-subtle)",
          }}
        />

        {/* Rendered markdown body. The styles live inline so we don't
            need a typography plugin. */}
        <div
          className="md-body"
          dangerouslySetInnerHTML={{ __html: bodyHtml }}
        />
      </article>

      {/* Feedback. */}
      {sp.fb === "ok" ? (
        <div
          className="rounded-xl px-4 py-3 text-center"
          style={{
            background:
              "color-mix(in oklab, var(--emerald-500) 12%, transparent)",
            border:
              "1px solid color-mix(in oklab, var(--emerald-500) 28%, transparent)",
            color: "var(--text-default)",
            fontSize: 13,
          }}
        >
          Thanks — your feedback helps us improve this article.
        </div>
      ) : (
        <form
          action={feedbackAction}
          className="rounded-xl"
          style={{
            padding: "18px 22px",
            background:
              "linear-gradient(180deg, color-mix(in oklab, var(--surface-1) 92%, white 8%) 0%, var(--surface-1) 100%)",
            border: "1px solid var(--border-subtle)",
            boxShadow:
              "inset 0 1px 0 0 color-mix(in oklab, white 4%, transparent), " +
              "0 1px 2px 0 rgba(0,0,0,0.18)",
          }}
        >
          <input type="hidden" name="articleId" value={article.id} />
          <input type="hidden" name="returnTo" value={articlePath} />
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div
                style={{
                  color: "var(--text-default)",
                  fontSize: 13.5,
                  fontWeight: 600,
                  letterSpacing: "-0.005em",
                }}
              >
                Was this article helpful?
              </div>
              <div
                className="mt-0.5"
                style={{ color: "var(--text-faint)", fontSize: 11.5 }}
              >
                Optional comment helps us improve it.
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="submit"
                name="helpful"
                value="yes"
                className="ts-focus inline-flex h-9 items-center gap-1.5 rounded-lg font-semibold"
                style={{
                  padding: "0 14px",
                  background:
                    "linear-gradient(180deg, color-mix(in oklab, var(--emerald-500) 96%, white 4%) 0%, var(--emerald-500) 100%)",
                  color: "white",
                  border: "1px solid color-mix(in oklab, var(--emerald-500) 80%, black 20%)",
                  fontSize: 12.5,
                }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M7 22V10M2 12h5l3-9a2 2 0 0 1 4 0l-2 6h8a2 2 0 0 1 2 2l-3 9H7" />
                </svg>
                Yes
              </button>
              <button
                type="submit"
                name="helpful"
                value="no"
                className="ts-focus inline-flex h-9 items-center gap-1.5 rounded-lg"
                style={{
                  padding: "0 14px",
                  background: "color-mix(in oklab, var(--surface-2) 70%, transparent)",
                  color: "var(--text-default)",
                  border: "1px solid var(--border-subtle)",
                  fontSize: 12.5,
                  fontWeight: 500,
                }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M17 2v12M22 12h-5l-3 9a2 2 0 0 1-4 0l2-6H4a2 2 0 0 1-2-2l3-9h12" />
                </svg>
                No
              </button>
            </div>
          </div>
          <textarea
            name="comment"
            rows={2}
            placeholder="What could be better? (optional)"
            className="mt-3"
            style={{
              width: "100%",
              padding: "8px 12px",
              borderRadius: 8,
              background: "var(--surface-1)",
              border: "1px solid var(--border-subtle)",
              color: "var(--text-default)",
              fontSize: 13,
              outline: "none",
              resize: "vertical",
              lineHeight: 1.5,
            }}
          />
          {sp.fb === "err" && (
            <p
              className="mt-2"
              style={{ color: "var(--rose-500)", fontSize: 12 }}
            >
              Sorry — that didn&apos;t go through. Please try again.
            </p>
          )}
        </form>
      )}

      {/* Related. */}
      {related.length > 0 && (
        <section>
          <div className="flex items-center gap-1.5 mb-3">
            <span
              aria-hidden
              style={{ width: 3, height: 3, borderRadius: 1, background: "var(--accent-primary)" }}
            />
            <h2
              style={{
                color: "var(--text-default)",
                fontSize: 11,
                fontWeight: 700,
                textTransform: "uppercase",
                letterSpacing: "0.1em",
              }}
            >
              Related articles
            </h2>
          </div>
          <ul className="grid gap-2 md:grid-cols-2">
            {related.map((r) => (
              <li key={r.id}>
                <Link
                  href={
                    r.categorySlug
                      ? `/t/${slug}/help/${r.categorySlug}/${r.slug}?from=in-product`
                      : "#"
                  }
                  className="ts-focus block rounded-xl transition-colors hover:bg-[color-mix(in_oklab,var(--surface-3)_45%,transparent)]"
                  style={{
                    padding: "14px 16px",
                    background:
                      "color-mix(in oklab, var(--surface-1) 80%, transparent)",
                    border: "1px solid var(--border-subtle)",
                    textDecoration: "none",
                  }}
                >
                  <div
                    style={{
                      color: "var(--text-default)",
                      fontSize: 13,
                      fontWeight: 600,
                      letterSpacing: "-0.005em",
                    }}
                  >
                    {r.title}
                  </div>
                  <div
                    className="mt-0.5"
                    style={{ color: "var(--text-faint)", fontSize: 11 }}
                  >
                    {r.categoryName ?? "—"} · {r.readMinutes} min read
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Inline styles for the markdown body. Living in a global stylesheet
          would be nicer but keeping them here scopes them to the help
          surface without polluting unrelated workspace pages. */}
      <style>{`
        .md-body { color: var(--text-default); font-size: 14.5px; line-height: 1.7; }
        .md-body h1, .md-body h2, .md-body h3, .md-body h4, .md-body h5, .md-body h6 {
          color: var(--text-default); font-weight: 600; letter-spacing: -0.012em;
          margin-top: 1.8em; margin-bottom: 0.5em; line-height: 1.3;
        }
        .md-body h1 { font-size: 24px; }
        .md-body h2 { font-size: 19px; }
        .md-body h3 { font-size: 16px; }
        .md-body h4 { font-size: 14.5px; }
        .md-body p { margin: 0 0 1em; }
        .md-body a { color: var(--accent-primary); text-decoration: underline; text-underline-offset: 2px; }
        .md-body a:hover { text-decoration-thickness: 2px; }
        .md-body strong { color: var(--text-default); font-weight: 600; }
        .md-body em { color: var(--text-default); }
        .md-body ul, .md-body ol { padding-left: 1.5em; margin: 0 0 1em; }
        .md-body ul li { list-style: disc; margin-bottom: 0.35em; }
        .md-body ol li { list-style: decimal; margin-bottom: 0.35em; }
        .md-body code {
          background: color-mix(in oklab, var(--surface-2) 80%, transparent);
          border: 1px solid var(--border-subtle);
          padding: 1px 6px; border-radius: 4px; font-size: 0.9em;
          font-family: var(--font-mono, ui-monospace, monospace);
          color: var(--text-default);
        }
        .md-body pre.md-code {
          background: color-mix(in oklab, var(--surface-2) 80%, transparent);
          border: 1px solid var(--border-subtle); border-radius: 10px;
          padding: 14px 16px; overflow-x: auto; font-size: 12.5px; line-height: 1.55;
          margin: 0 0 1em;
        }
        .md-body pre.md-code code { background: transparent; border: 0; padding: 0; }
        .md-body blockquote {
          border-left: 3px solid color-mix(in oklab, var(--accent-primary) 55%, transparent);
          background: color-mix(in oklab, var(--accent-surface) 60%, transparent);
          padding: 8px 14px; margin: 0 0 1em; border-radius: 0 8px 8px 0;
          color: var(--text-muted);
        }
        .md-body hr {
          border: 0; border-top: 1px solid var(--border-subtle); margin: 1.6em 0;
        }
        .md-body img { max-width: 100%; border-radius: 8px; margin: 1em 0; }
        .md-body .md-callout {
          padding: 12px 14px; border-radius: 10px; margin: 0 0 1em;
          border: 1px solid var(--border-subtle);
          background: color-mix(in oklab, var(--surface-2) 60%, transparent);
        }
        .md-body .md-callout--warning {
          border-color: color-mix(in oklab, var(--amber-500) 40%, transparent);
          background: color-mix(in oklab, var(--amber-500) 12%, transparent);
        }
        .md-body .md-callout--danger {
          border-color: color-mix(in oklab, var(--rose-500) 40%, transparent);
          background: color-mix(in oklab, var(--rose-500) 12%, transparent);
        }
        .md-body .md-callout--success {
          border-color: color-mix(in oklab, var(--emerald-500) 40%, transparent);
          background: color-mix(in oklab, var(--emerald-500) 12%, transparent);
        }
        .md-body details {
          border: 1px solid var(--border-subtle); border-radius: 10px;
          padding: 10px 14px; margin: 0 0 1em;
          background: color-mix(in oklab, var(--surface-1) 80%, transparent);
        }
        .md-body details summary { cursor: pointer; font-weight: 600; color: var(--text-default); }
        .md-body .md-empty { color: var(--text-muted); font-style: italic; }
      `}</style>
    </div>
  );
}
