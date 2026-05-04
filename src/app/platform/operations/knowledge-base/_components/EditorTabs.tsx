// Tab content for the article editor. Each tab is a simple form-driven
// view; mutations all go through the same saveKbArticle / transition
// server actions wired in the parent page.

import Link from "next/link";
import type { KbArticleDetail, CategoryTreeNode } from "@/server/platform/knowledge-base";
import { saveKbArticle, transitionKbArticle } from "@/app/actions/platform-knowledge-base";
import {
  STATUS_LABEL,
  STATUS_TONE,
  VISIBILITY_LABEL,
  DeferredNote,
  relativeFromNow,
} from "./shared";
import type { KbArticleStatus, KbVisibility } from "@prisma/client";

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
      {article.featured && <input type="hidden" name="featured" value="on" />}

      <Field label="Title">
        <input
          name="title"
          required
          defaultValue={article.title}
          disabled={!canWrite}
          className="ts-focus w-full rounded-md px-3 py-2 text-[14px] font-semibold outline-none"
          style={inputStyle()}
        />
      </Field>

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

      <Field label="Summary" help="One-line preview shown in lists, search, and SEO meta description fallback.">
        <input
          name="summary"
          defaultValue={article.summary ?? ""}
          maxLength={400}
          disabled={!canWrite}
          className="ts-focus w-full rounded-md px-3 py-2 text-[12px] outline-none"
          style={inputStyle()}
        />
      </Field>

      <Field label="Body (Markdown)" help="Plain Markdown. Slash-menu embeds, side-by-side preview, and the live SEO score are deferred.">
        <textarea
          name="bodyMarkdown"
          defaultValue={article.bodyMarkdown}
          rows={20}
          disabled={!canWrite}
          className="ts-focus w-full rounded-md px-3 py-2 font-mono text-[12px] outline-none"
          style={{ ...inputStyle(), lineHeight: 1.5 }}
        />
      </Field>

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
      <DeferredNote>
        <strong>Live SEO score, schema generator, and the OG image preview</strong> are deferred.
      </DeferredNote>
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
  article, canWrite,
}: {
  article: KbArticleDetail;
  canWrite: boolean;
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
      <DeferredNote>
        <strong>Plan-restriction picker and related-articles selector are deferred.</strong>{" "}
        Visibility = <code>PLAN_RESTRICTED</code> reads as &quot;hidden&quot; until the plan picker ships.
      </DeferredNote>
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

export function VersionsTab({ article }: { article: KbArticleDetail }) {
  return (
    <div className="flex flex-col gap-3">
      <DeferredNote>
        <strong>Side-by-side diff is deferred.</strong> The list below shows every saved revision; the
        full body is captured but not yet rendered as a diff.
      </DeferredNote>
      {article.revisions.length === 0 ? (
        <div
          className="rounded-lg border p-6 text-center text-[12px]"
          style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)", color: "var(--text-muted)" }}
        >
          No revisions yet — every save records one.
        </div>
      ) : (
        <ul
          className="overflow-hidden rounded-lg"
          style={{ background: "var(--surface-1)", border: "1px solid var(--border-subtle)" }}
        >
          {article.revisions.map((r, idx) => {
            const tone = STATUS_TONE[r.status];
            return (
              <li
                key={r.id}
                className="flex items-start gap-3 px-3 py-2.5"
                style={{ borderTop: idx === 0 ? "none" : "1px solid var(--border-subtle)" }}
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
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

/* ── Feedback tab ─────────────────────────────────────── */

export function FeedbackTab({ article }: { article: KbArticleDetail }) {
  const total = article.helpfulUp + article.helpfulDown;
  const pct = total === 0 ? null : article.helpfulUp / total;
  return (
    <div className="flex flex-col gap-3">
      <div
        className="grid grid-cols-3 gap-3 rounded-lg border p-3"
        style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)" }}
      >
        <Stat label="Helpful" value={article.helpfulUp.toLocaleString()} tone="good" />
        <Stat label="Not helpful" value={article.helpfulDown.toLocaleString()} tone={article.helpfulDown > 0 ? "danger" : "default"} />
        <Stat label="Helpfulness" value={pct == null ? "—" : `${Math.round(pct * 100)}%`} tone={pct == null ? "default" : pct >= 0.8 ? "good" : pct >= 0.5 ? "warning" : "danger"} />
      </div>
      <DeferredNote>
        <strong>Triage workflow (resolve, escalate, ignore) is deferred.</strong> Comments are
        captured but no actions are wired up.
      </DeferredNote>
      {article.feedback.length === 0 ? (
        <div
          className="rounded-lg border p-6 text-center text-[12px]"
          style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)", color: "var(--text-muted)" }}
        >
          No reader feedback yet.
        </div>
      ) : (
        <ul
          className="overflow-hidden rounded-lg"
          style={{ background: "var(--surface-1)", border: "1px solid var(--border-subtle)" }}
        >
          {article.feedback.map((f, idx) => (
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
                <span className="text-[10px]" style={{ color: "var(--text-faint)" }}>
                  {relativeFromNow(f.createdAt)}
                </span>
              </div>
              {f.comment && (
                <div className="mt-1 whitespace-pre-wrap text-[12px]" style={{ color: "var(--text-default)" }}>
                  {f.comment}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/* ── Translations tab ─────────────────────────────────── */

export function TranslationsTab({ article }: { article: KbArticleDetail }) {
  return (
    <div className="flex flex-col gap-3">
      <DeferredNote>
        <strong>Translation memory and auto-translate are deferred.</strong> Below is the list of
        existing locale variants for this slug; you can open each to author it independently.
      </DeferredNote>
      {article.localeVariants.length === 0 ? (
        <div
          className="rounded-lg border p-6 text-center text-[12px]"
          style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)", color: "var(--text-muted)" }}
        >
          No other locales for this slug yet. Create a new article and reuse the slug{" "}
          <code>{article.slug}</code> with a different locale.
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
    </div>
  );
}

/* ── Analytics tab ────────────────────────────────────── */

export function AnalyticsTab({ article }: { article: KbArticleDetail }) {
  const total = article.helpfulUp + article.helpfulDown;
  const pct = total === 0 ? null : article.helpfulUp / total;
  return (
    <div className="flex flex-col gap-3">
      <DeferredNote>
        <strong>Charts deferred:</strong> view trend, helpfulness over time, avg time on page,
        in-product help triggers, search queries that led here. The KPIs below are lifetime
        counters; the charts ship in the analytics rollout.
      </DeferredNote>
      <div
        className="grid grid-cols-3 gap-3 rounded-lg border p-3"
        style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)" }}
      >
        <Stat label="Lifetime views" value={article.viewCount.toLocaleString()} />
        <Stat label="Helpfulness" value={pct == null ? "—" : `${Math.round(pct * 100)}%`} />
        <Stat
          label="Last published"
          value={article.publishedAt ? relativeFromNow(article.publishedAt) : "—"}
        />
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
