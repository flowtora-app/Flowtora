// Page 34 — Article editor.
//
// URL-driven tab system: ?tab=content|seo|translations|settings|
// analytics|versions|feedback. The Translations + Analytics tabs
// are placeholders showing what's deferred.

import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePlatformStaff } from "@/lib/platform";
import {
  loadCategoryTree,
  loadKbArticleDetail,
  loadCategoryLookup,
  loadRelatedArticleOptions,
  loadArticleAnalytics,
} from "@/server/platform/knowledge-base";
import {
  STATUS_TONE,
  STATUS_LABEL,
  VISIBILITY_LABEL,
  FormError,
  FormOk,
  relativeFromNow,
} from "../_components/shared";
import { TabsBar, isEditorTab, type EditorTab } from "../_components/TabsBar";
import {
  ContentTab,
  SeoTab,
  SettingsTab,
  VersionsTab,
  FeedbackTab,
  AnalyticsTab,
  TranslationsTab,
  StatusTransitions,
} from "../_components/EditorTabs";

export const dynamic = "force-dynamic";

export default async function KbArticleEditorPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string; ok?: string; error?: string; compareTo?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const ctx = await requirePlatformStaff();
  const canWrite = ctx.can("support.macro_manage");

  const tab: EditorTab = isEditorTab(sp.tab) ? sp.tab : "content";

  const [article, tree, categoryLookup, relatedOptions, analytics] = await Promise.all([
    loadKbArticleDetail(id),
    loadCategoryTree(),
    loadCategoryLookup(),
    loadRelatedArticleOptions(id),
    loadArticleAnalytics(id, 30),
  ]);
  if (!article) notFound();

  const breadcrumb = buildCategoryBreadcrumb(article.categoryId, categoryLookup);
  const status = STATUS_TONE[article.status];
  const hrefFor = (t: EditorTab) =>
    `/platform/operations/knowledge-base/${article.id}${t === "content" ? "" : `?tab=${t}`}`;

  return (
    <div className="space-y-5">
      {/* Breadcrumb */}
      <div className="text-[11px]" style={{ color: "var(--text-muted)" }}>
        <Link href="/platform/operations/knowledge-base" className="underline" style={{ color: "var(--text-muted)" }}>
          Knowledge base
        </Link>
        {breadcrumb.length > 0 && breadcrumb.map((b) => (
          <span key={b.id}>
            <span className="mx-1.5">/</span>
            <Link
              href={`/platform/operations/knowledge-base?category=${b.id}`}
              className="underline"
              style={{ color: "var(--text-muted)" }}
            >
              {b.name}
            </Link>
          </span>
        ))}
        <span className="mx-1.5">/</span>
        <span style={{ color: "var(--text-default)" }}>{article.title}</span>
      </div>

      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-1.5">
            <span
              className="rounded-full px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
              style={{ background: status.bg, color: status.fg }}
            >
              {STATUS_LABEL[article.status]}
            </span>
            <span
              className="rounded-full px-1.5 py-0.5 text-[10px] font-medium"
              style={{ background: "var(--surface-2)", color: "var(--text-muted)" }}
            >
              {VISIBILITY_LABEL[article.visibility]}
            </span>
            <span
              className="rounded-full px-1.5 py-0.5 text-[10px] font-medium"
              style={{ background: "var(--surface-2)", color: "var(--text-muted)" }}
            >
              {article.locale}
            </span>
            {article.featured && (
              <span
                className="rounded-full px-1.5 py-0.5 text-[10px] font-medium"
                style={{
                  background: "var(--amber-50, var(--surface-2))",
                  color: "var(--warning-fg)",
                  border: "1px solid var(--amber-200, var(--border-default))",
                }}
              >
                ★ Featured
              </span>
            )}
          </div>
          <h1
            className="mt-1.5 truncate text-[22px] font-semibold leading-tight"
            style={{ color: "var(--text-default)" }}
          >
            {article.title}
          </h1>
          <p className="mt-1 text-[11px]" style={{ color: "var(--text-muted)" }}>
            <span className="font-mono">/{article.slug}</span>
            {article.authorName && ` · by ${article.authorName}`}
            {" · updated "}
            {relativeFromNow(article.updatedAt)}
            {article.publishedAt && (
              <>
                {" · published "}
                {relativeFromNow(article.publishedAt)}
              </>
            )}
          </p>
        </div>
        <StatusTransitions article={article} canWrite={canWrite} />
      </div>

      <FormOk msg={sp.ok} />
      <FormError msg={sp.error} />

      {/* Tabs */}
      <TabsBar active={tab} hrefFor={hrefFor} />

      <div
        className="rounded-lg border p-4"
        style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)" }}
      >
        {tab === "content"      && <ContentTab article={article} categoryTree={tree} canWrite={canWrite} />}
        {tab === "seo"          && <SeoTab article={article} canWrite={canWrite} />}
        {tab === "settings"     && <SettingsTab article={article} canWrite={canWrite} relatedOptions={relatedOptions} />}
        {tab === "versions"     && <VersionsTab article={article} compareId={typeof sp.compareTo === "string" ? sp.compareTo : null} />}
        {tab === "feedback"     && <FeedbackTab article={article} canWrite={canWrite} />}
        {tab === "translations" && <TranslationsTab article={article} canWrite={canWrite} />}
        {tab === "analytics"    && <AnalyticsTab article={article} analytics={analytics} />}
      </div>
    </div>
  );
}

function buildCategoryBreadcrumb(
  categoryId: string | null,
  lookup: Map<string, { id: string; name: string; parentId: string | null }>,
): { id: string; name: string }[] {
  if (!categoryId) return [];
  const out: { id: string; name: string }[] = [];
  let cursor: string | null = categoryId;
  let safety = 0;
  while (cursor && safety < 6) {
    const c = lookup.get(cursor);
    if (!c) break;
    out.unshift({ id: c.id, name: c.name });
    cursor = c.parentId;
    safety += 1;
  }
  return out;
}
