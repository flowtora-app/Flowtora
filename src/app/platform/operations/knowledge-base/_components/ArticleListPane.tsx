// Center pane — KB article list + filter toolbar + new-article form.

import Link from "next/link";
import type {
  KbArticleListRow,
  KbFilterOptions,
  CategoryTreeNode,
} from "@/server/platform/knowledge-base";
import type { KbArticleStatus, KbVisibility } from "@prisma/client";
import { createKbArticle } from "@/app/actions/platform-knowledge-base";
import {
  STATUS_LABEL,
  STATUS_TONE,
  VISIBILITY_LABEL,
  relativeFromNow,
} from "./shared";

const STATUSES: KbArticleStatus[] = ["DRAFT", "REVIEW", "PUBLISHED", "ARCHIVED"];
const VISIBILITIES: KbVisibility[] = ["PUBLIC", "INTERNAL", "PLAN_RESTRICTED"];

export function ArticleListPane({
  rows,
  page,
  totalPages,
  filteredTotal,
  filters,
  options,
  categoriesFlat,
  buildHref,
  resetHref,
  hasFiltersApplied,
  canWrite,
}: {
  rows: KbArticleListRow[];
  page: number;
  totalPages: number;
  filteredTotal: number;
  filters: {
    q?: string;
    status?: KbArticleStatus;
    visibility?: KbVisibility;
    authorId?: string;
    locale?: string;
  };
  options: KbFilterOptions;
  categoriesFlat: { id: string; label: string }[];
  buildHref: (overrides: Record<string, string | undefined>) => string;
  resetHref: string;
  hasFiltersApplied: boolean;
  canWrite: boolean;
}) {
  return (
    <div className="flex flex-col gap-3">
      {/* Toolbar */}
      <form
        method="get"
        className="flex flex-wrap items-end gap-2 rounded-lg border p-3"
        style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)" }}
      >
        <Field label="Search">
          <input
            name="q"
            defaultValue={filters.q ?? ""}
            placeholder="Title, summary, slug, tag…"
            className="ts-focus w-[260px] rounded-md px-2 py-1.5 text-[12px] outline-none"
            style={{
              background: "var(--surface-1)",
              border: "1px solid var(--border-default)",
              color: "var(--text-default)",
            }}
          />
        </Field>
        <Field label="Status">
          <Select name="status" defaultValue={filters.status ?? ""}>
            <option value="">Any</option>
            {STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
          </Select>
        </Field>
        <Field label="Visibility">
          <Select name="visibility" defaultValue={filters.visibility ?? ""}>
            <option value="">Any</option>
            {VISIBILITIES.map((v) => <option key={v} value={v}>{VISIBILITY_LABEL[v]}</option>)}
          </Select>
        </Field>
        <Field label="Author">
          <Select name="author" defaultValue={filters.authorId ?? ""}>
            <option value="">Anyone</option>
            {options.authors.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}
          </Select>
        </Field>
        <Field label="Locale">
          <Select name="locale" defaultValue={filters.locale ?? ""}>
            <option value="">Any</option>
            {options.locales.map((l) => <option key={l} value={l}>{l}</option>)}
          </Select>
        </Field>
        <button
          type="submit"
          className="ts-focus rounded-md px-3 py-1.5 text-[12px] font-medium"
          style={{ background: "var(--accent-primary)", color: "var(--accent-fg)" }}
        >
          Apply
        </button>
        {hasFiltersApplied && (
          <a
            href={resetHref}
            className="self-center text-[11px] underline"
            style={{ color: "var(--text-muted)" }}
          >
            Clear filters
          </a>
        )}
      </form>

      {/* New article */}
      {canWrite && (
        <form
          action={createKbArticle}
          className="flex flex-wrap items-end gap-2 rounded-lg border p-3"
          style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)" }}
        >
          <Field label="New article title">
            <input
              name="title"
              required
              placeholder="e.g. How to set up your first storefront"
              className="ts-focus w-[300px] rounded-md px-2 py-1.5 text-[12px] outline-none"
              style={{
                background: "var(--surface-1)",
                border: "1px solid var(--border-default)",
                color: "var(--text-default)",
              }}
            />
          </Field>
          <Field label="Category">
            <Select name="categoryId" defaultValue="">
              <option value="">— None —</option>
              {categoriesFlat.map((c) => (
                <option key={c.id} value={c.id}>{c.label}</option>
              ))}
            </Select>
          </Field>
          <Field label="Locale">
            <input
              name="locale"
              defaultValue="en"
              maxLength={8}
              className="ts-focus w-[80px] rounded-md px-2 py-1.5 text-[12px] outline-none"
              style={{
                background: "var(--surface-1)",
                border: "1px solid var(--border-default)",
                color: "var(--text-default)",
              }}
            />
          </Field>
          <button
            type="submit"
            className="ts-focus rounded-md px-3 py-1.5 text-[12px] font-medium"
            style={{ background: "var(--accent-primary)", color: "var(--accent-fg)" }}
          >
            + New article
          </button>
        </form>
      )}

      {/* List */}
      {rows.length === 0 ? (
        <div
          className="rounded-lg border p-10 text-center text-[12px]"
          style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)", color: "var(--text-muted)" }}
        >
          <div className="mb-1 text-2xl" aria-hidden>📚</div>
          <div className="font-medium" style={{ color: "var(--text-default)" }}>
            No articles match the current filters.
          </div>
        </div>
      ) : (
        <div
          className="overflow-hidden rounded-lg"
          style={{ background: "var(--surface-1)", border: "1px solid var(--border-subtle)" }}
        >
          <div
            className="hidden grid-cols-[minmax(0,1fr)_140px_140px_70px_70px_100px] gap-3 border-b px-3 py-2 text-[10px] font-semibold uppercase tracking-wide md:grid"
            style={{
              borderColor: "var(--border-subtle)",
              background: "var(--surface-2)",
              color: "var(--text-muted)",
            }}
          >
            <div>Title</div>
            <div>Category</div>
            <div>Author</div>
            <div className="text-right">Views</div>
            <div className="text-right">Helpful</div>
            <div className="text-right">Updated</div>
          </div>
          <ul>
            {rows.map((r, idx) => {
              const tone = STATUS_TONE[r.status];
              return (
                <li
                  key={r.id}
                  style={{ borderTop: idx === 0 ? "none" : "1px solid var(--border-subtle)" }}
                >
                  <Link
                    href={`/platform/operations/knowledge-base/${r.id}`}
                    className="grid items-start gap-3 px-3 py-3 md:grid-cols-[minmax(0,1fr)_140px_140px_70px_70px_100px]"
                    style={{ color: "var(--text-default)" }}
                  >
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span
                          className="rounded-full px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
                          style={{ background: tone.bg, color: tone.fg }}
                        >
                          {STATUS_LABEL[r.status]}
                        </span>
                        {r.featured && (
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
                        <span
                          className="rounded-full px-1.5 py-0.5 text-[10px] font-medium"
                          style={{ background: "var(--surface-2)", color: "var(--text-muted)" }}
                        >
                          {VISIBILITY_LABEL[r.visibility]}
                        </span>
                        <span
                          className="rounded-full px-1.5 py-0.5 text-[10px] font-medium"
                          style={{ background: "var(--surface-2)", color: "var(--text-muted)" }}
                        >
                          {r.locale}
                        </span>
                        {r.localeVariants > 1 && (
                          <span
                            className="text-[10px]"
                            style={{ color: "var(--text-muted)" }}
                          >
                            +{r.localeVariants - 1} other locale{r.localeVariants - 1 === 1 ? "" : "s"}
                          </span>
                        )}
                      </div>
                      <div className="mt-1 truncate text-[13px] font-semibold">{r.title}</div>
                      <div className="mt-0.5 truncate text-[11px]" style={{ color: "var(--text-muted)" }}>
                        /{r.slug}
                      </div>
                    </div>
                    <div className="text-[12px]" style={{ color: "var(--text-muted)" }}>
                      {r.categoryName ?? <span style={{ color: "var(--text-faint)" }}>—</span>}
                    </div>
                    <div className="truncate text-[12px]" style={{ color: "var(--text-muted)" }}>
                      {r.authorName ?? <span style={{ color: "var(--text-faint)" }}>—</span>}
                    </div>
                    <div className="text-right text-[12px] tabular-nums" style={{ color: "var(--text-muted)" }}>
                      {r.views.toLocaleString()}
                    </div>
                    <div className="text-right text-[12px] tabular-nums" style={{ color: "var(--text-muted)" }}>
                      {r.helpfulnessPct == null
                        ? "—"
                        : `${Math.round(r.helpfulnessPct * 100)}%`}
                    </div>
                    <div className="text-right text-[11px]" style={{ color: "var(--text-muted)" }}>
                      {relativeFromNow(r.updatedAt)}
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div
          className="flex items-center justify-between text-[11px]"
          style={{ color: "var(--text-muted)" }}
        >
          <span>
            Page <b style={{ color: "var(--text-default)" }}>{page}</b> of {totalPages} ·{" "}
            {filteredTotal.toLocaleString()} article{filteredTotal === 1 ? "" : "s"}
          </span>
          <div className="flex items-center gap-1">
            <PageLink href={page > 1 ? buildHref({ page: String(page - 1) }) : null}>‹ Prev</PageLink>
            <PageLink href={page < totalPages ? buildHref({ page: String(page + 1) }) : null}>Next ›</PageLink>
          </div>
        </div>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[10px] font-medium uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>
        {label}
      </span>
      {children}
    </label>
  );
}

function Select({
  name, defaultValue, children,
}: {
  name: string;
  defaultValue: string;
  children: React.ReactNode;
}) {
  return (
    <select
      name={name}
      defaultValue={defaultValue}
      className="ts-focus rounded-md px-2 py-1.5 text-[12px] outline-none"
      style={{
        background: "var(--surface-1)",
        border: "1px solid var(--border-default)",
        color: "var(--text-default)",
      }}
    >
      {children}
    </select>
  );
}

function PageLink({ href, children }: { href: string | null; children: React.ReactNode }) {
  if (!href) {
    return (
      <span
        className="rounded-md px-2 py-1"
        style={{
          color: "var(--text-faint)",
          border: "1px solid var(--border-subtle)",
          opacity: 0.5,
        }}
      >
        {children}
      </span>
    );
  }
  return (
    <Link
      href={href}
      className="ts-focus rounded-md px-2 py-1"
      style={{ color: "var(--text-default)", border: "1px solid var(--border-default)" }}
    >
      {children}
    </Link>
  );
}
