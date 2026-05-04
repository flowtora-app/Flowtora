// Tab content for the article editor. Each tab is a simple form-driven
// view; mutations all go through the same saveKbArticle / transition
// server actions wired in the parent page.

import Link from "next/link";
import type { KbArticleDetail, CategoryTreeNode } from "@/server/platform/knowledge-base";
import {
  saveKbArticle,
  transitionKbArticle,
  cloneKbArticleToLocale,
  transitionKbFeedback,
} from "@/app/actions/platform-knowledge-base";
import {
  STATUS_LABEL,
  STATUS_TONE,
  VISIBILITY_LABEL,
  relativeFromNow,
} from "./shared";
import type { KbArticleStatus, KbVisibility } from "@prisma/client";
import { MarkdownEditor } from "./MarkdownEditor";
import { RelatedArticlesPicker } from "./RelatedArticlesPicker";
import { renderDiff } from "./RevisionDiff";
import { PlanRestrictionPicker } from "./PlanRestrictionPicker";

const STATUSES: KbArticleStatus[] = ["DRAFT", "REVIEW", "PUBLISHED", "ARCHIVED"];
const VISIBILITIES: KbVisibility[] = ["PUBLIC", "INTERNAL", "PLAN_RESTRICTED"];

function flattenCategories(tree: CategoryTreeNode[]): { id: string; label: string }[] {
  const out: { id: string; label: string }[] = [];
  const walk = (nodes: CategoryTreeNode[], prefix: string) => {
    for (const n of nodes) {
      out.push({ id: n.id, label: `${prefix}${n.name}` });
      walk(n.children, prefix + "— ");
    }
  };
  walk(tree, "");
  return out;
}

/* ── Content tab ──────────────────────────────────────── */

export function ContentTab({
  article, categoryTree, canWrite,
}: {
  article: KbArticleDetail;
  categoryTree: CategoryTreeNode[];
  canWrite: boolean;
}) {
  const cats = flattenCategories(categoryTree);
  return (
    <form action={saveKbArticle} className="flex flex-col gap-4">
      <input type="hidden" name="id" value={article.id} />
      {/* Hidden fields keep SEO + Settings values intact when only Content tab is submitted. */}
      <input type="hidden" name="visibility"      value={article.visibility} />
      <input type="hidden" name="metaTitle"       value={article.metaTitle ?? ""} />
      <input type="hidden" name="metaDescription" value={article.metaDescription ?? ""} />
      <input type="hidden" name="canonicalUrl"    value={article.canonicalUrl ?? ""} />
      <input type="hidden" name="ogImageUrl"      value={article.ogImageUrl ?? ""} />
      <input type="hidden" name="tags"            value={article.tags.join(", ")} />
      <input type="hidden" name="visibilityPlans"  value={article.visibilityPlans.join(", ")} />
      <input type="hidden" name="relatedArticleIds" value={article.relatedArticleIds.join(", ")} />
      <input type="hidden" name="inProductPaths"    value={article.inProductPaths.join(", ")} />
      {article.featured && <input type="hidden" name="featured" value="on" />}

      <div className="grid gap-3 md:grid-cols-2">
        <Field label="Category">
          <Select name="categoryId" defaultValue={article.categoryId ?? ""} disabled={!canWrite}>
            <option value="">— None —</option>
            {cats.map((c) => (
              <option key={c.id} value={c.id}>{c.label}</option>
            ))}
          </Select>
        </Field>
        <Field label="Locale">
          <input
            name="locale"
            defaultValue={article.locale}
            maxLength={8}
            disabled={!canWrite}
            className="ts-focus w-[120px] rounded-md px-2 py-1.5 text-[12px] outline-none"
            style={inputStyle()}
          />
        </Field>
      </div>

      {/* Live editor with toolbar + preview + SEO score */}
      <MarkdownEditor
        initial={{
          id: article.id,
          slug: article.slug,
          locale: article.locale,
          title: article.title,
          summary: article.summary ?? "",
          bodyMarkdown: article.bodyMarkdown,
          metaTitle: article.metaTitle ?? "",
          metaDescription: article.metaDescription ?? "",
          canonicalUrl: article.canonicalUrl ?? "",
          ogImageUrl: article.ogImageUrl ?? "",
        }}
      />

      <Field label="Revision note" help="Optional — captured in the version history.">
        <input
          name="revisionNote"
          maxLength={280}
          disabled={!canWrite}
          placeholder="What changed?"
          className="ts-focus w-full rounded-md px-3 py-2 text-[12px] outline-none"
          style={inputStyle()}
        />
      </Field>

      {canWrite && (
        <div className="flex items-center justify-end gap-2">
          <button
            type="submit"
            className="ts-focus rounded-md px-4 py-2 text-[12px] font-semibold"
            style={{ background: "var(--accent-primary)", color: "var(--accent-fg)" }}
          >
            Save draft
          </button>
        </div>
      )}
    </form>
  );
}

/* ── SEO tab ──────────────────────────────────────────── */

export function SeoTab({ article, canWrite }: { article: KbArticleDetail; canWrite: boolean }) {
  return (
    <form action={saveKbArticle} className="flex flex-col gap-3">
      <input type="hidden" name="id" value={article.id} />
      <input type="hidden" name="title"        value={article.title} />
      <input type="hidden" name="summary"      value={article.summary ?? ""} />
      <input type="hidden" name="bodyMarkdown" value={article.bodyMarkdown} />
      <input type="hidden" name="categoryId"   value={article.categoryId ?? ""} />
      <input type="hidden" name="locale"       value={article.locale} />
      <input type="hidden" name="visibility"   value={article.visibility} />
      <input type="hidden" name="tags"         value={article.tags.join(", ")} />
      {article.featured && <input type="hidden" name="featured" value="on" />}

      <Field label="Meta title" help="Shown in search engine results. Falls back to the article title.">
        <input
          name="metaTitle"
          defaultValue={article.metaTitle ?? ""}
          maxLength={200}
          disabled={!canWrite}
          className="ts-focus w-full rounded-md px-3 py-2 text-[12px] outline-none"
          style={inputStyle()}
        />
      </Field>
      <Field label="Meta description" help="Falls back to the summary.">
        <textarea
          name="metaDescription"
          defaultValue={article.metaDescription ?? ""}
          maxLength={400}
          rows={3}
          disabled={!canWrite}
          className="ts-focus w-full rounded-md px-3 py-2 text-[12px] outline-none"
          style={inputStyle()}
        />
      </Field>
      <div className="grid gap-3 md:grid-cols-2">
        <Field label="Canonical URL">
          <input
            name="canonicalUrl"
            defaultValue={article.canonicalUrl ?? ""}
            placeholder="https://flowtora.com/help/…"
            disabled={!canWrite}
            className="ts-focus w-full rounded-md px-3 py-2 text-[12px] outline-none"
            style={inputStyle()}
          />
        </Field>
        <Field label="OG image URL">
          <input
            name="ogImageUrl"
            defaultValue={article.ogImageUrl ?? ""}
            placeholder="https://…/og.png"
            disabled={!canWrite}
            className="ts-focus w-full rounded-md px-3 py-2 text-[12px] outline-none"
            style={inputStyle()}
          />
        </Field>
      </div>
      {article.ogImageUrl && (
        <div className="flex flex-col gap-1">
          <span className="text-[10px] font-medium uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>
            OG image preview
          </span>
          <div
            className="overflow-hidden rounded-md border"
            style={{
              background: "var(--surface-1)",
              borderColor: "var(--border-subtle)",
              maxWidth: 600,
              aspectRatio: "1.91 / 1",
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={article.ogImageUrl}
              alt="OG preview"
              style={{ width: "100%", height: "100%", objectFit: "cover" }}
            />
          </div>
        </div>
      )}
      {canWrite && (
        <div className="flex justify-end">
          <button
            type="submit"
            className="ts-focus rounded-md px-4 py-2 text-[12px] font-semibold"
            style={{ background: "var(--accent-primary)", color: "var(--accent-fg)" }}
          >
            Save SEO
          </button>
        </div>
      )}
    </form>
  );
}

/* ── Settings tab ─────────────────────────────────────── */

export function SettingsTab({
  article, canWrite, relatedOptions,
}: {
  article: KbArticleDetail;
  canWrite: boolean;
  relatedOptions: { id: string; title: string; status: string; locale: string; slug: string }[];
}) {
  return (
    <form action={saveKbArticle} className="flex flex-col gap-3">
      <input type="hidden" name="id" value={article.id} />
      <input type="hidden" name="title"           value={article.title} />
      <input type="hidden" name="summary"         value={article.summary ?? ""} />
      <input type="hidden" name="bodyMarkdown"    value={article.bodyMarkdown} />
      <input type="hidden" name="categoryId"      value={article.categoryId ?? ""} />
      <input type="hidden" name="locale"          value={article.locale} />
      <input type="hidden" name="metaTitle"       value={article.metaTitle ?? ""} />
      <input type="hidden" name="metaDescription" value={article.metaDescription ?? ""} />
      <input type="hidden" name="canonicalUrl"    value={article.canonicalUrl ?? ""} />
      <input type="hidden" name="ogImageUrl"      value={article.ogImageUrl ?? ""} />

      <Field label="Visibility">
        <Select name="visibility" defaultValue={article.visibility} disabled={!canWrite}>
          {VISIBILITIES.map((v) => (
            <option key={v} value={v}>{VISIBILITY_LABEL[v]}</option>
          ))}
        </Select>
      </Field>
      <Field label="Plan restriction" help="When visibility = Plan-restricted, only these plans see the article.">
        <PlanRestrictionPicker
          initialPlans={article.visibilityPlans}
          name="visibilityPlans"
          disabled={!canWrite}
        />
      </Field>
      <Field label="Featured" help="Pinned to the top of category and home pages.">
        <label className="flex items-center gap-2 text-[12px]" style={{ color: "var(--text-default)" }}>
          <input
            type="checkbox"
            name="featured"
            defaultChecked={article.featured}
            disabled={!canWrite}
            className="ts-focus h-3.5 w-3.5"
          />
          Mark as featured
        </label>
      </Field>
      <Field label="Tags" help="Comma-separated. Lowercased on save.">
        <input
          name="tags"
          defaultValue={article.tags.join(", ")}
          disabled={!canWrite}
          className="ts-focus w-full rounded-md px-3 py-2 text-[12px] outline-none"
          style={inputStyle()}
        />
      </Field>
      <Field label="Related articles" help="Surfaced as 'See also' on the public page.">
        <RelatedArticlesPicker
          options={relatedOptions}
          initialIds={article.relatedArticleIds}
          name="relatedArticleIds"
          disabled={!canWrite}
        />
      </Field>
      <Field label="In-product help triggers" help="Comma-separated tenant-app routes (e.g. /orders, /settings/billing). The help-tip widget on those pages will surface this article.">
        <input
          name="inProductPaths"
          defaultValue={article.inProductPaths.join(", ")}
          disabled={!canWrite}
          placeholder="/orders, /settings/billing"
          className="ts-focus w-full rounded-md px-3 py-2 text-[12px] outline-none"
          style={inputStyle()}
        />
      </Field>
      {canWrite && (
        <div className="flex justify-end">
          <button
            type="submit"
            className="ts-focus rounded-md px-4 py-2 text-[12px] font-semibold"
            style={{ background: "var(--accent-primary)", color: "var(--accent-fg)" }}
          >
            Save settings
          </button>
        </div>
      )}
    </form>
  );
}

/* ── Versions tab ─────────────────────────────────────── */

export function VersionsTab({
  article, compareId,
}: {
  article: KbArticleDetail;
  compareId: string | null;
}) {
  // Diff target is the requested revision id, falling back to the most
  // recent. The "current" body is article.bodyMarkdown.
  const target = compareId
    ? article.revisions.find((r) => r.id === compareId) ?? article.revisions[0]
    : article.revisions[0];

  return (
    <div className="flex flex-col gap-4">
      {article.revisions.length === 0 ? (
        <div
          className="rounded-lg border p-6 text-center text-[12px]"
          style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)", color: "var(--text-muted)" }}
        >
          No revisions yet — every save records one.
        </div>
      ) : (
        <>
          <ul
            className="overflow-hidden rounded-lg"
            style={{ background: "var(--surface-1)", border: "1px solid var(--border-subtle)" }}
          >
            {article.revisions.map((r, idx) => {
              const tone = STATUS_TONE[r.status];
              const isActive = target?.id === r.id;
              return (
                <li
                  key={r.id}
                  style={{
                    borderTop: idx === 0 ? "none" : "1px solid var(--border-subtle)",
                    background: isActive ? "var(--surface-2)" : undefined,
                  }}
                >
                  <Link
                    href={`?tab=versions&compareTo=${r.id}`}
                    className="flex items-start gap-3 px-3 py-2.5 transition-colors"
                  >
                    <span
                      className="mt-0.5 shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
                      style={{ background: tone.bg, color: tone.fg }}
                    >
                      {STATUS_LABEL[r.status]}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[12px] font-medium" style={{ color: "var(--text-default)" }}>
                        {r.title}
                      </div>
                      <div className="mt-0.5 text-[11px]" style={{ color: "var(--text-muted)" }}>
                        {relativeFromNow(r.createdAt)} · {r.savedByName ?? "system"}
                        {r.note ? ` · ${r.note}` : ""}
                      </div>
                    </div>
                    {isActive && (
                      <span className="text-[10px] uppercase tracking-wide" style={{ color: "var(--accent-primary)" }}>
                        ▶ comparing
                      </span>
                    )}
                  </Link>
                </li>
              );
            })}
          </ul>

          {target && (
            <div className="flex flex-col gap-2">
              <div className="flex items-baseline justify-between">
                <h3 className="text-[12px] font-semibold" style={{ color: "var(--text-default)" }}>
                  Diff — {target.title} → current
                </h3>
                <span className="text-[10px]" style={{ color: "var(--text-muted)" }}>
                  Lines added are green, removed are red, context is muted.
                </span>
              </div>
              {renderDiff(target.bodyMarkdown, article.bodyMarkdown)}
            </div>
          )}
        </>
      )}
    </div>
  );
}

/* ── Feedback tab ─────────────────────────────────────── */

export function FeedbackTab({ article, canWrite }: { article: KbArticleDetail; canWrite: boolean }) {
  const total = article.helpfulUp + article.helpfulDown;
  const pct = total === 0 ? null : article.helpfulUp / total;
  const pending = article.feedback.filter((f) => f.status === "PENDING");
  const resolved = article.feedback.filter((f) => f.status !== "PENDING");
  return (
    <div className="flex flex-col gap-3">
      <div
        className="grid grid-cols-4 gap-3 rounded-lg border p-3"
        style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)" }}
      >
        <Stat label="Helpful" value={article.helpfulUp.toLocaleString()} tone="good" />
        <Stat label="Not helpful" value={article.helpfulDown.toLocaleString()} tone={article.helpfulDown > 0 ? "danger" : "default"} />
        <Stat label="Helpfulness" value={pct == null ? "—" : `${Math.round(pct * 100)}%`} tone={pct == null ? "default" : pct >= 0.8 ? "good" : pct >= 0.5 ? "warning" : "danger"} />
        <Stat label="Pending triage" value={pending.length.toLocaleString()} tone={pending.length > 0 ? "warning" : "default"} />
      </div>

      <FeedbackList title="Pending triage" items={pending} canWrite={canWrite} articleId={article.id} />
      {resolved.length > 0 && (
        <FeedbackList title="Resolved & dismissed" items={resolved} canWrite={false} articleId={article.id} />
      )}
    </div>
  );
}

function FeedbackList({
  title, items, canWrite, articleId,
}: {
  title: string;
  items: KbArticleDetail["feedback"];
  canWrite: boolean;
  articleId: string;
}) {
  if (items.length === 0) {
    return (
      <div
        className="rounded-lg border p-6 text-center text-[12px]"
        style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)", color: "var(--text-muted)" }}
      >
        <div className="mb-1 text-[11px] font-semibold uppercase tracking-wider">{title}</div>
        Nothing here.
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-1">
      <h3 className="px-1 text-[11px] font-semibold uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>
        {title}
      </h3>
      <ul
        className="overflow-hidden rounded-lg"
        style={{ background: "var(--surface-1)", border: "1px solid var(--border-subtle)" }}
      >
        {items.map((f, idx) => {
          const statusTone =
            f.status === "RESOLVED"  ? { bg: "var(--success-surface)", fg: "var(--success-fg)" } :
            f.status === "DISMISSED" ? { bg: "var(--surface-2)",       fg: "var(--text-faint)" } :
                                        { bg: "var(--accent-surface)",  fg: "var(--accent-primary)" };
          return (
            <li
              key={f.id}
              className="px-3 py-2.5"
              style={{ borderTop: idx === 0 ? "none" : "1px solid var(--border-subtle)" }}
            >
              <div className="flex items-center gap-2">
                <span
                  className="rounded-full px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
                  style={f.helpful
                    ? { background: "var(--success-surface)", color: "var(--success-fg)" }
                    : { background: "var(--surface-2)",       color: "var(--danger-fg)" }}
                >
                  {f.helpful ? "Helpful" : "Not helpful"}
                </span>
                <span
                  className="rounded-full px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide"
                  style={{ background: statusTone.bg, color: statusTone.fg }}
                >
                  {f.status}
                </span>
                <span className="text-[10px]" style={{ color: "var(--text-faint)" }}>
                  {relativeFromNow(f.createdAt)}
                </span>
              </div>
              {f.comment && (
                <div className="mt-1 whitespace-pre-wrap text-[12px]" style={{ color: "var(--text-default)" }}>
                  {f.comment}
                </div>
              )}
              {f.resolutionNote && (
                <div className="mt-1 text-[11px]" style={{ color: "var(--text-muted)" }}>
                  Resolution: {f.resolutionNote}
                </div>
              )}
              {canWrite && (
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <FeedbackTriageForm
                    feedbackId={f.id}
                    articleId={articleId}
                    to="RESOLVED"
                    label="Mark resolved"
                    tone="good"
                  />
                  <FeedbackTriageForm
                    feedbackId={f.id}
                    articleId={articleId}
                    to="DISMISSED"
                    label="Dismiss"
                    tone="muted"
                  />
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function FeedbackTriageForm({
  feedbackId, articleId, to, label, tone,
}: {
  feedbackId: string;
  articleId: string;
  to: "RESOLVED" | "DISMISSED" | "PENDING";
  label: string;
  tone: "good" | "muted" | "danger";
}) {
  const palette =
    tone === "good"   ? { bg: "var(--success-surface)", fg: "var(--success-fg)", border: "var(--emerald-200, var(--border-default))" } :
    tone === "danger" ? { bg: "var(--rose-50, var(--surface-2))", fg: "var(--danger-fg)", border: "var(--rose-200, var(--border-default))" } :
                         { bg: "var(--surface-1)", fg: "var(--text-muted)", border: "var(--border-default)" };
  return (
    <form action={transitionKbFeedback}>
      <input type="hidden" name="feedbackId" value={feedbackId} />
      <input type="hidden" name="articleId"  value={articleId} />
      <input type="hidden" name="to"         value={to} />
      <button
        type="submit"
        className="ts-focus rounded-md px-2 py-1 text-[11px] font-medium"
        style={{ background: palette.bg, color: palette.fg, border: `1px solid ${palette.border}` }}
      >
        {label}
      </button>
    </form>
  );
}

/* ── Translations tab ─────────────────────────────────── */

const COMMON_LOCALES = ["en", "es", "fr", "de", "pt-BR", "ja", "zh-CN"];

export function TranslationsTab({
  article, canWrite,
}: {
  article: KbArticleDetail;
  canWrite: boolean;
}) {
  const usedLocales = new Set([article.locale, ...article.localeVariants.map((v) => v.locale)]);
  const suggestedLocales = COMMON_LOCALES.filter((l) => !usedLocales.has(l));

  return (
    <div className="flex flex-col gap-3">
      {article.localeVariants.length === 0 ? (
        <div
          className="rounded-lg border p-6 text-center text-[12px]"
          style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)", color: "var(--text-muted)" }}
        >
          No other locales for this slug yet.{" "}
          {canWrite && <>Use the &quot;Clone to locale&quot; form below to spin up a placeholder copy.</>}
        </div>
      ) : (
        <ul
          className="overflow-hidden rounded-lg"
          style={{ background: "var(--surface-1)", border: "1px solid var(--border-subtle)" }}
        >
          {article.localeVariants.map((v, idx) => {
            const tone = STATUS_TONE[v.status];
            return (
              <li
                key={v.id}
                className="flex items-center justify-between gap-3 px-3 py-2.5"
                style={{ borderTop: idx === 0 ? "none" : "1px solid var(--border-subtle)" }}
              >
                <div className="flex items-center gap-2">
                  <span
                    className="rounded-full px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
                    style={{ background: tone.bg, color: tone.fg }}
                  >
                    {STATUS_LABEL[v.status]}
                  </span>
                  <span className="text-[12px] font-medium" style={{ color: "var(--text-default)" }}>
                    {v.locale}
                  </span>
                </div>
                <Link
                  href={`/platform/operations/knowledge-base/${v.id}`}
                  className="ts-focus text-[12px] underline"
                  style={{ color: "var(--accent-primary)" }}
                >
                  Open →
                </Link>
              </li>
            );
          })}
        </ul>
      )}

      {canWrite && (
        <form
          action={cloneKbArticleToLocale}
          className="flex flex-wrap items-end gap-2 rounded-lg border p-3"
          style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)" }}
        >
          <input type="hidden" name="id" value={article.id} />
          <label className="flex flex-col gap-1">
            <span className="text-[10px] font-medium uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>
              Clone to locale
            </span>
            <select
              name="locale"
              required
              defaultValue=""
              className="ts-focus rounded-md px-2 py-1.5 text-[12px] outline-none"
              style={inputStyle()}
            >
              <option value="" disabled>— Pick a locale —</option>
              {suggestedLocales.map((l) => <option key={l} value={l}>{l}</option>)}
              <option value="custom">Other (free-form)…</option>
            </select>
          </label>
          <button
            type="submit"
            className="ts-focus rounded-md px-3 py-1.5 text-[12px] font-semibold"
            style={{ background: "var(--accent-primary)", color: "var(--accent-fg)" }}
          >
            Clone draft
          </button>
          <span className="text-[11px]" style={{ color: "var(--text-faint)" }}>
            Body is copied as a placeholder for the translator to overwrite.
          </span>
        </form>
      )}
    </div>
  );
}

/* ── Analytics tab ────────────────────────────────────── */

export function AnalyticsTab({
  article, analytics,
}: {
  article: KbArticleDetail;
  analytics: {
    viewTrend: { date: string; views: number }[];
    feedbackTrend: { date: string; helpful: number; not: number }[];
    topSearches: { query: string; count: number }[];
    totalLoggedViews: number;
  };
}) {
  const total = article.helpfulUp + article.helpfulDown;
  const pct = total === 0 ? null : article.helpfulUp / total;
  const maxView = Math.max(1, ...analytics.viewTrend.map((p) => p.views));
  const maxFb = Math.max(1, ...analytics.feedbackTrend.map((p) => p.helpful + p.not));
  return (
    <div className="flex flex-col gap-3">
      <div
        className="grid grid-cols-2 gap-3 rounded-lg border p-3 md:grid-cols-4"
        style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)" }}
      >
        <Stat label="Lifetime views" value={article.viewCount.toLocaleString()} />
        <Stat label="Logged views · 30d" value={analytics.totalLoggedViews.toLocaleString()} />
        <Stat label="Helpfulness" value={pct == null ? "—" : `${Math.round(pct * 100)}%`} />
        <Stat
          label="Last published"
          value={article.publishedAt ? relativeFromNow(article.publishedAt) : "—"}
        />
      </div>

      <div
        className="rounded-lg border p-3"
        style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)" }}
      >
        <h3 className="mb-2 text-[12px] font-semibold" style={{ color: "var(--text-default)" }}>
          View trend · last 30 days
        </h3>
        <div className="flex h-24 items-end gap-[2px]">
          {analytics.viewTrend.map((p) => (
            <div
              key={p.date}
              className="flex-1 rounded-t-sm"
              style={{
                background: "var(--accent-primary)",
                opacity: 0.85,
                height: `${Math.max(2, (p.views / maxView) * 100)}%`,
              }}
              title={`${p.date}: ${p.views} views`}
            />
          ))}
        </div>
      </div>

      <div
        className="rounded-lg border p-3"
        style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)" }}
      >
        <h3 className="mb-2 text-[12px] font-semibold" style={{ color: "var(--text-default)" }}>
          Helpfulness · last 30 days
        </h3>
        <div className="flex h-20 items-end gap-[2px]">
          {analytics.feedbackTrend.map((p) => {
            const total = p.helpful + p.not;
            const helpfulPart = total === 0 ? 0 : (p.helpful / maxFb) * 100;
            const notPart = total === 0 ? 0 : (p.not / maxFb) * 100;
            return (
              <div key={p.date} className="flex flex-1 flex-col-reverse" title={`${p.date}: 👍 ${p.helpful} · 👎 ${p.not}`}>
                <div className="rounded-t-sm" style={{ background: "var(--success-fg)", height: `${helpfulPart}%`, minHeight: total === 0 ? 0 : 1 }} />
                <div style={{ background: "var(--danger-fg)", height: `${notPart}%`, minHeight: total === 0 ? 0 : 1 }} />
              </div>
            );
          })}
        </div>
        <div className="mt-2 flex items-center gap-3 text-[10px]" style={{ color: "var(--text-muted)" }}>
          <span><span className="inline-block h-2 w-2 rounded-sm align-middle" style={{ background: "var(--success-fg)" }} /> Helpful</span>
          <span><span className="inline-block h-2 w-2 rounded-sm align-middle" style={{ background: "var(--danger-fg)" }} /> Not helpful</span>
        </div>
      </div>

      <div
        className="rounded-lg border p-3"
        style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)" }}
      >
        <h3 className="mb-2 text-[12px] font-semibold" style={{ color: "var(--text-default)" }}>
          Top searches that landed here · last 30 days
        </h3>
        {analytics.topSearches.length === 0 ? (
          <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>
            No search clicks recorded.
          </p>
        ) : (
          <ul className="flex flex-col gap-1">
            {analytics.topSearches.map((s) => (
              <li key={s.query} className="flex items-baseline justify-between text-[11px]">
                <span style={{ color: "var(--text-default)" }}>{s.query || <em>(empty)</em>}</span>
                <span className="tabular-nums" style={{ color: "var(--text-muted)" }}>{s.count}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="text-[11px]" style={{ color: "var(--text-muted)" }}>
        In-product help triggers active on:{" "}
        {article.inProductPaths.length === 0
          ? <span style={{ color: "var(--text-faint)" }}>none</span>
          : article.inProductPaths.map((p) => (
              <code key={p} className="ml-1 rounded-sm px-1.5 py-0.5" style={{ background: "var(--surface-2)", color: "var(--text-default)" }}>
                {p}
              </code>
            ))}
      </div>
    </div>
  );
}

/* ── Status transition controls ──────────────────────── */

export function StatusTransitions({
  article, canWrite,
}: {
  article: KbArticleDetail;
  canWrite: boolean;
}) {
  if (!canWrite) {
    return (
      <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>
        You don&apos;t have permission to change the article status.
      </p>
    );
  }
  // Allowed transitions per spec: Author → Draft → Review → Published → Archived.
  const allowed = ((): KbArticleStatus[] => {
    switch (article.status) {
      case "DRAFT":     return ["REVIEW", "PUBLISHED", "ARCHIVED"];
      case "REVIEW":    return ["DRAFT", "PUBLISHED", "ARCHIVED"];
      case "PUBLISHED": return ["DRAFT", "ARCHIVED"];
      case "ARCHIVED":  return ["DRAFT"];
      default:          return STATUSES;
    }
  })();
  return (
    <div className="flex flex-wrap items-center gap-2">
      {allowed.map((to) => (
        <form key={to} action={transitionKbArticle}>
          <input type="hidden" name="id" value={article.id} />
          <input type="hidden" name="to" value={to} />
          <button
            type="submit"
            className="ts-focus rounded-md px-3 py-1.5 text-[11px] font-semibold"
            style={transitionButtonStyle(to)}
          >
            {transitionLabel(to)}
          </button>
        </form>
      ))}
    </div>
  );
}

function transitionLabel(to: KbArticleStatus): string {
  switch (to) {
    case "DRAFT":     return "← Back to draft";
    case "REVIEW":    return "Submit for review";
    case "PUBLISHED": return "Publish";
    case "ARCHIVED":  return "Archive";
  }
}

function transitionButtonStyle(to: KbArticleStatus): React.CSSProperties {
  switch (to) {
    case "PUBLISHED": return { background: "var(--accent-primary)", color: "var(--accent-fg)" };
    case "REVIEW":    return { background: "var(--warning-surface)", color: "var(--warning-fg)", border: "1px solid var(--amber-200, var(--border-default))" };
    case "ARCHIVED":  return { background: "var(--surface-1)", color: "var(--danger-fg)", border: "1px solid var(--rose-200, var(--border-default))" };
    case "DRAFT":     return { background: "var(--surface-1)", color: "var(--text-default)", border: "1px solid var(--border-default)" };
  }
}

/* ── Field helpers ────────────────────────────────────── */

function Field({
  label, help, children,
}: {
  label: string;
  help?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[10px] font-medium uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>
        {label}
      </span>
      {children}
      {help && <span className="text-[11px]" style={{ color: "var(--text-faint)" }}>{help}</span>}
    </label>
  );
}

function Select({
  name, defaultValue, disabled, children,
}: {
  name: string;
  defaultValue: string;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <select
      name={name}
      defaultValue={defaultValue}
      disabled={disabled}
      className="ts-focus rounded-md px-2 py-1.5 text-[12px] outline-none"
      style={inputStyle()}
    >
      {children}
    </select>
  );
}

function Stat({
  label, value, tone = "default",
}: {
  label: string;
  value: string;
  tone?: "default" | "good" | "warning" | "danger";
}) {
  const colour =
    tone === "good"    ? "var(--success-fg)" :
    tone === "warning" ? "var(--warning-fg)" :
    tone === "danger"  ? "var(--danger-fg)"  :
                          "var(--text-default)";
  return (
    <div>
      <div className="text-[10px] font-medium uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>
        {label}
      </div>
      <div className="mt-0.5 text-[18px] font-semibold leading-none tabular-nums" style={{ color: colour }}>
        {value}
      </div>
    </div>
  );
}

function inputStyle(): React.CSSProperties {
  return {
    background: "var(--surface-1)",
    border: "1px solid var(--border-default)",
    color: "var(--text-default)",
  };
}
