// Page 47 — Doc page editor (three-pane).
//
// Left: tree sidebar (links back to other pages)
// Center: Save Draft form with title + slug + body textarea + live preview toggle
// Right: metadata, version history, comments

import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requirePlatformStaff } from "@/lib/platform";
import {
  loadDocPageDetail,
  loadDocTree,
  renderMdxPreview,
  diffLines,
  SECTION_LABELS,
  SECTION_ICONS,
  type DocPageDetail,
  type DocTreeSection,
} from "@/server/platform/developer-docs";
import {
  saveDocPageDraft,
  publishDocPage,
  scheduleDocPage,
  clearScheduledPublish,
  rollbackDocPage,
  updateDocPageStatus,
  deleteDocPage,
  addDocComment,
  resolveDocComment,
} from "@/app/actions/platform-developer-docs";
import type { DocSectionKey } from "@prisma/client";
import { StatusPill, FormError, FormOk, Field, relativeFromNow } from "../_shared";

export const dynamic = "force-dynamic";

const SECTIONS: DocSectionKey[] = [
  "GETTING_STARTED", "AUTHENTICATION", "CONCEPTS", "RESOURCES", "WEBHOOKS",
  "SDKS", "RECIPES", "MIGRATION_GUIDES", "CHANGELOG", "ERRORS_REFERENCE",
  "RATE_LIMITS", "GLOSSARY",
];

type SP = Record<string, string | string[] | undefined>;
const asString = (v: string | string[] | undefined): string | undefined =>
  typeof v === "string" && v.length > 0 ? v : undefined;

const VIEWS = ["edit", "preview", "diff"] as const;
type View = typeof VIEWS[number];

export default async function DocPageEditor({
  params, searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<SP>;
}) {
  const ctx = await requirePlatformStaff();
  const { slug } = await params;
  const sp = await searchParams;
  const ok = asString(sp.ok);
  const error = asString(sp.error);
  const canWrite = ctx.can("docs.write");
  const canPublish = ctx.can("docs.publish");
  const view: View = (asString(sp.view) as View | undefined) && (VIEWS as readonly string[]).includes(asString(sp.view)!)
    ? (asString(sp.view) as View) : "edit";

  const [detail, tree, possibleParents] = await Promise.all([
    loadDocPageDetail(slug),
    loadDocTree(),
    db.docPage.findMany({
      where: { isFolder: true },
      select: { id: true, slug: true, title: true, section: true },
      orderBy: [{ section: "asc" }, { title: "asc" }],
    }),
  ]);
  if (!detail) notFound();

  return (
    <div className="space-y-4">
      <Header detail={detail} canPublish={canPublish} />

      {ok && <FormOk msg={ok} />}
      {error && <FormError msg={error} />}

      <ViewToggle active={view} hasUnpublished={detail.hasUnpublishedChanges} />

      <div className="grid grid-cols-12 gap-4">
        <aside className="col-span-12 lg:col-span-2">
          <MiniTree tree={tree} currentSlug={detail.slug} />
        </aside>
        <main className="col-span-12 lg:col-span-7 space-y-4">
          {view === "edit" && (
            <EditorPane
              detail={detail}
              canWrite={canWrite}
              parents={possibleParents}
            />
          )}
          {view === "preview" && (
            <PreviewPane body={detail.bodyDraft ?? detail.body} />
          )}
          {view === "diff" && (
            <DiffPane before={detail.body} after={detail.bodyDraft ?? detail.body} />
          )}
        </main>
        <aside className="col-span-12 lg:col-span-3 space-y-3">
          <PublishingActions detail={detail} canPublish={canPublish} canWrite={canWrite} />
          <MetadataCard detail={detail} />
          <VersionHistory detail={detail} canPublish={canPublish} />
          <CommentsCard detail={detail} canWrite={canWrite} />
          {canPublish && <DangerZone detail={detail} />}
        </aside>
      </div>
    </div>
  );
}

/* ── Header ─────────────────────────────────────── */

function Header({ detail }: { detail: DocPageDetail; canPublish: boolean }) {
  return (
    <div className="space-y-1">
      <nav className="text-[11px]" aria-label="Breadcrumbs">
        <Link href="/platform/integrations" className="ts-focus underline" style={{ color: "var(--text-muted)" }}>
          Integrations Catalog
        </Link>
        <span className="mx-1.5" style={{ color: "var(--text-faint)" }}>/</span>
        <Link href="/platform/integrations/docs" className="ts-focus underline" style={{ color: "var(--text-muted)" }}>
          Developer Documentation
        </Link>
        <span className="mx-1.5" style={{ color: "var(--text-faint)" }}>/</span>
        <span className="inline-flex items-center gap-1">
          <span>{SECTION_ICONS[detail.section]}</span>
          <span style={{ color: "var(--text-muted)" }}>{SECTION_LABELS[detail.section]}</span>
        </span>
        <span className="mx-1.5" style={{ color: "var(--text-faint)" }}>/</span>
        <span style={{ color: "var(--text-default)" }}>{detail.title}</span>
      </nav>

      <div className="flex flex-wrap items-center gap-2">
        <h1 className="text-[20px] font-semibold leading-tight" style={{ color: "var(--text-default)" }}>
          {detail.title}
        </h1>
        <StatusPill status={detail.status} />
        {detail.deprecated && (
          <span className="rounded-full px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
                style={{ background: "var(--rose-50, var(--surface-2))", color: "var(--danger-fg)" }}>
            deprecated
          </span>
        )}
        {detail.hasUnpublishedChanges && (
          <span className="rounded-full px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
                style={{ background: "var(--warning-surface)", color: "var(--warning-fg)" }}>
            unpublished changes
          </span>
        )}
      </div>
      <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>
        Slug: <code>{detail.slug}</code>
        {" · "}v{detail.version}
        {detail.publishedVersion && ` · published v${detail.publishedVersion}`}
        {" · "}edited {relativeFromNow(detail.updatedAt)}
        {detail.lastEditedByName && ` by ${detail.lastEditedByName}`}
      </p>
    </div>
  );
}

/* ── View toggle ─────────────────────────────────── */

function ViewToggle({ active, hasUnpublished }: { active: View; hasUnpublished: boolean }) {
  const items: Array<{ key: View; label: string; disabled?: boolean }> = [
    { key: "edit", label: "Edit" },
    { key: "preview", label: "Preview" },
    { key: "diff", label: "Diff vs Live", disabled: !hasUnpublished },
  ];
  return (
    <nav className="flex items-center gap-1 border-b" style={{ borderColor: "var(--border-subtle)" }}>
      {items.map((i) => {
        const isActive = i.key === active;
        if (i.disabled) {
          return (
            <span key={i.key}
                  className="inline-flex items-center px-3 py-2 text-[12px] font-medium opacity-50"
                  style={{ color: "var(--text-faint)", borderBottom: "2px solid transparent", marginBottom: "-1px" }}
                  title="No unpublished changes">
              {i.label}
            </span>
          );
        }
        return (
          <Link key={i.key} href={`?view=${i.key}`} scroll={false}
                className="ts-focus inline-flex items-center px-3 py-2 text-[12px] font-medium"
                style={{
                  color: isActive ? "var(--text-default)" : "var(--text-muted)",
                  borderBottom: isActive ? "2px solid var(--accent-primary)" : "2px solid transparent",
                  marginBottom: "-1px",
                }}>
            {i.label}
          </Link>
        );
      })}
    </nav>
  );
}

/* ── Mini tree ───────────────────────────────────── */

function MiniTree({ tree, currentSlug }: { tree: DocTreeSection[]; currentSlug: string }) {
  return (
    <div className="rounded-lg border p-2 max-h-[600px] overflow-y-auto"
         style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)" }}>
      <ul className="space-y-2">
        {tree.map((s) => {
          if (s.totalCount === 0) return null;
          return (
            <li key={s.section}>
              <div className="text-[10px] font-semibold uppercase tracking-wide mb-0.5"
                   style={{ color: "var(--text-muted)" }}>
                <span>{SECTION_ICONS[s.section]}</span> {SECTION_LABELS[s.section]}
              </div>
              <ul className="space-y-0.5">
                {flattenNodes(s.nodes).map((n) => (
                  <li key={n.id}>
                    {n.externalUrl ? (
                      <a href={n.externalUrl} target="_blank" rel="noopener noreferrer"
                         className="block truncate text-[11px]" style={{ color: "var(--text-muted)" }}>
                        ↗ {n.title}
                      </a>
                    ) : (
                      <Link href={`/platform/integrations/docs/${n.slug}`}
                            className="ts-focus block truncate text-[11px]"
                            style={{
                              color: n.slug === currentSlug ? "var(--accent-primary)" : "var(--text-default)",
                              fontWeight: n.slug === currentSlug ? 600 : 400,
                              paddingLeft: n.depth * 8,
                            }}>
                        {n.isFolder ? "📁 " : "📄 "}{n.title}
                      </Link>
                    )}
                  </li>
                ))}
              </ul>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function flattenNodes(nodes: DocTreeSection["nodes"], depth = 0): Array<{
  id: string; slug: string; title: string; isFolder: boolean; externalUrl: string | null; depth: number;
}> {
  const out: Array<{ id: string; slug: string; title: string; isFolder: boolean; externalUrl: string | null; depth: number }> = [];
  for (const n of nodes) {
    out.push({ id: n.id, slug: n.slug, title: n.title, isFolder: n.isFolder, externalUrl: n.externalUrl, depth });
    if (n.children.length > 0) out.push(...flattenNodes(n.children, depth + 1));
  }
  return out;
}

/* ── Editor pane ─────────────────────────────────── */

function EditorPane({
  detail, canWrite, parents,
}: {
  detail: DocPageDetail;
  canWrite: boolean;
  parents: Array<{ id: string; slug: string; title: string; section: DocSectionKey }>;
}) {
  return (
    <form action={saveDocPageDraft}
          className="rounded-lg border p-3 space-y-3"
          style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)" }}>
      <fieldset disabled={!canWrite} className="contents">
        <input type="hidden" name="id" value={detail.id} />
        <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
          <Field label="Title">
            <input type="text" name="title" required maxLength={200} defaultValue={detail.title}
                   className="ts-focus w-full rounded-md border px-2 py-1 text-[12px]"
                   style={{ borderColor: "var(--border-default)", background: "var(--surface-1)" }} />
          </Field>
          <Field label="Slug">
            <input type="text" name="slug" required maxLength={120} pattern="[a-z0-9-]+"
                   defaultValue={detail.slug}
                   className="ts-focus w-full rounded-md border px-2 py-1 text-[12px] font-mono"
                   style={{ borderColor: "var(--border-default)", background: "var(--surface-1)" }} />
          </Field>
          <Field label="Section">
            <select name="section" defaultValue={detail.section}
                    className="ts-focus w-full rounded-md border px-2 py-1 text-[12px]"
                    style={{ borderColor: "var(--border-default)", background: "var(--surface-1)" }}>
              {SECTIONS.map((s) => <option key={s} value={s}>{SECTION_LABELS[s]}</option>)}
            </select>
          </Field>
          <Field label="Parent (optional folder)">
            <select name="parentId" defaultValue={detail.parentId ?? ""}
                    className="ts-focus w-full rounded-md border px-2 py-1 text-[12px]"
                    style={{ borderColor: "var(--border-default)", background: "var(--surface-1)" }}>
              <option value="">— Root —</option>
              {parents.map((p) => (
                <option key={p.id} value={p.id}>
                  {SECTION_LABELS[p.section]} / {p.title}
                </option>
              ))}
            </select>
          </Field>
          <Field label="External URL (optional — turns this into a link node)">
            <input type="url" name="externalUrl" maxLength={500} defaultValue={detail.externalUrl ?? ""}
                   className="ts-focus w-full rounded-md border px-2 py-1 text-[12px]"
                   style={{ borderColor: "var(--border-default)", background: "var(--surface-1)" }} />
          </Field>
          <div className="flex items-end gap-3">
            <label className="inline-flex items-center gap-2 text-[12px]" style={{ color: "var(--text-default)" }}>
              <input type="checkbox" name="isFolder" defaultChecked={detail.isFolder} className="ts-focus h-4 w-4" />
              Folder
            </label>
            <label className="inline-flex items-center gap-2 text-[12px]" style={{ color: "var(--text-default)" }}>
              <input type="checkbox" name="deprecated" defaultChecked={detail.deprecated} className="ts-focus h-4 w-4" />
              Deprecated
            </label>
          </div>
        </div>

        <div>
          <div className="mb-1 flex items-center justify-between">
            <span className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>
              MDX body (draft)
            </span>
            <span className="text-[10px]" style={{ color: "var(--text-muted)" }}>
              Custom tags: &lt;Callout&gt; &lt;Endpoint&gt; &lt;Param&gt; &lt;Response&gt; &lt;CodeTabs&gt; &lt;Diagram&gt;
            </span>
          </div>
          <textarea name="bodyDraft" rows={24} maxLength={200_000}
                    defaultValue={detail.bodyDraft ?? detail.body}
                    className="ts-focus w-full rounded-md border px-3 py-2 text-[12px] font-mono leading-snug"
                    style={{ borderColor: "var(--border-default)", background: "var(--surface-2)" }} />
        </div>

        <details>
          <summary className="cursor-pointer text-[11px] font-semibold uppercase tracking-wide"
                   style={{ color: "var(--text-muted)" }}>
            SEO &amp; metadata
          </summary>
          <div className="mt-2 grid grid-cols-1 gap-2 md:grid-cols-2">
            <Field label="Owner team">
              <input type="text" name="ownerTeam" maxLength={80} defaultValue={detail.ownerTeam ?? ""}
                     className="ts-focus w-full rounded-md border px-2 py-1 text-[12px]"
                     style={{ borderColor: "var(--border-default)", background: "var(--surface-1)" }} />
            </Field>
            <Field label="Reviewers (user ids, comma-separated)">
              <input type="text" name="reviewersRaw" maxLength={2000}
                     defaultValue={detail.reviewers.map((r) => r.id).join(", ")}
                     className="ts-focus w-full rounded-md border px-2 py-1 text-[12px] font-mono"
                     style={{ borderColor: "var(--border-default)", background: "var(--surface-1)" }} />
            </Field>
            <Field label="SEO title">
              <input type="text" name="seoTitle" maxLength={200} defaultValue={detail.seoTitle ?? ""}
                     className="ts-focus w-full rounded-md border px-2 py-1 text-[12px]"
                     style={{ borderColor: "var(--border-default)", background: "var(--surface-1)" }} />
            </Field>
            <Field label="Canonical URL">
              <input type="url" name="canonical" maxLength={500} defaultValue={detail.canonical ?? ""}
                     className="ts-focus w-full rounded-md border px-2 py-1 text-[12px]"
                     style={{ borderColor: "var(--border-default)", background: "var(--surface-1)" }} />
            </Field>
            <Field label="SEO description" full>
              <textarea name="seoDescription" rows={2} maxLength={500} defaultValue={detail.seoDescription ?? ""}
                        className="ts-focus w-full rounded-md border px-2 py-1 text-[12px]"
                        style={{ borderColor: "var(--border-default)", background: "var(--surface-1)" }} />
            </Field>
            <Field label="Tags (comma-separated)">
              <input type="text" name="tagsRaw" maxLength={500}
                     defaultValue={detail.tags.join(", ")}
                     className="ts-focus w-full rounded-md border px-2 py-1 text-[12px]"
                     style={{ borderColor: "var(--border-default)", background: "var(--surface-1)" }} />
            </Field>
            <Field label="Related slugs (comma-separated)">
              <input type="text" name="relatedRaw" maxLength={2000}
                     defaultValue={detail.relatedSlugs.join(", ")}
                     className="ts-focus w-full rounded-md border px-2 py-1 text-[12px] font-mono"
                     style={{ borderColor: "var(--border-default)", background: "var(--surface-1)" }} />
            </Field>
          </div>
        </details>

        <div className="flex justify-end pt-1">
          <button type="submit"
                  className="ts-focus rounded-md px-3 py-1.5 text-[12px] font-medium"
                  style={{ background: "var(--accent-primary)", color: "white" }}>
            Save draft
          </button>
        </div>
      </fieldset>
    </form>
  );
}

/* ── Preview pane ────────────────────────────────── */

function PreviewPane({ body }: { body: string }) {
  const html = renderMdxPreview(body);
  return (
    <div className="rounded-lg border p-4"
         style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)" }}>
      <div className="mb-2 flex items-center gap-2">
        <span className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>
          Live preview
        </span>
        <span className="text-[10px]" style={{ color: "var(--text-faint)" }}>
          (rendered from current draft)
        </span>
      </div>
      <div dangerouslySetInnerHTML={{ __html: html }} />
    </div>
  );
}

/* ── Diff pane ───────────────────────────────────── */

function DiffPane({ before, after }: { before: string; after: string }) {
  const diff = diffLines(before, after);
  return (
    <div className="rounded-lg border p-3 space-y-2 overflow-x-auto"
         style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)" }}>
      <h2 className="text-[12px] font-semibold" style={{ color: "var(--text-default)" }}>
        Diff vs published
      </h2>
      {diff.length === 0 ? (
        <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>No changes vs published.</p>
      ) : (
        <pre className="text-[11px] font-mono leading-snug"
             style={{ color: "var(--text-default)" }}>
          {diff.map((line, i) => {
            const tone =
              line.kind === "add" ? { bg: "var(--success-surface)", fg: "var(--success-fg)", prefix: "+" } :
              line.kind === "del" ? { bg: "var(--rose-50, var(--surface-2))", fg: "var(--danger-fg)", prefix: "-" } :
                                     { bg: "transparent", fg: "var(--text-muted)", prefix: " " };
            return (
              <div key={i} style={{
                background: tone.bg,
                color: tone.fg,
                padding: "1px 6px",
                whiteSpace: "pre-wrap",
              }}>
                {tone.prefix} {line.text}
              </div>
            );
          })}
        </pre>
      )}
    </div>
  );
}

/* ── Right rail ─────────────────────────────────── */

function PublishingActions({
  detail, canPublish, canWrite,
}: {
  detail: DocPageDetail;
  canPublish: boolean;
  canWrite: boolean;
}) {
  return (
    <div className="rounded-lg border p-3 space-y-2"
         style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)" }}>
      <h2 className="text-[12px] font-semibold" style={{ color: "var(--text-default)" }}>Publishing</h2>
      {canPublish && !detail.isFolder && (
        <form action={publishDocPage} className="flex items-center gap-1">
          <input type="hidden" name="id" value={detail.id} />
          <input type="text" name="changeNote" placeholder="Change note (optional)" maxLength={500}
                 className="ts-focus min-w-[140px] flex-1 rounded-md border px-2 py-1 text-[11px]"
                 style={{ borderColor: "var(--border-default)", background: "var(--surface-1)" }} />
          <button type="submit"
                  className="ts-focus rounded-md px-2.5 py-1 text-[11px] font-medium"
                  style={{ background: "var(--success-fg)", color: "white" }}>
            Publish
          </button>
        </form>
      )}
      {canPublish && (
        <form action={scheduleDocPage} className="flex items-center gap-1">
          <input type="hidden" name="id" value={detail.id} />
          <input type="datetime-local" name="scheduledFor" required
                 defaultValue={detail.scheduledPublishAt
                   ? detail.scheduledPublishAt.toISOString().slice(0, 16) : ""}
                 className="ts-focus rounded-md border px-2 py-1 text-[11px]"
                 style={{ borderColor: "var(--border-default)", background: "var(--surface-1)" }} />
          <button type="submit"
                  className="ts-focus rounded-md px-2.5 py-1 text-[11px] font-medium"
                  style={{ background: "var(--surface-2)", color: "var(--text-default)", border: "1px solid var(--border-default)" }}>
            Schedule
          </button>
        </form>
      )}
      {detail.scheduledPublishAt && canPublish && (
        <form action={clearScheduledPublish}>
          <input type="hidden" name="id" value={detail.id} />
          <p className="rounded-md border-l-2 px-2 py-1 text-[11px]"
             style={{ borderColor: "var(--accent-primary)", background: "var(--surface-2)", color: "var(--text-default)" }}>
            Scheduled for {detail.scheduledPublishAt.toLocaleString()}
          </p>
          <button type="submit"
                  className="ts-focus mt-1 rounded-md px-2 py-1 text-[10px] font-medium"
                  style={{ background: "var(--surface-2)", color: "var(--text-muted)", border: "1px solid var(--border-default)" }}>
            Clear schedule
          </button>
        </form>
      )}
      {canWrite && (
        <form action={updateDocPageStatus} className="flex items-center gap-1">
          <input type="hidden" name="id" value={detail.id} />
          <select name="status" defaultValue={detail.status}
                  className="ts-focus flex-1 rounded-md border px-2 py-1 text-[11px]"
                  style={{ borderColor: "var(--border-default)", background: "var(--surface-1)" }}>
            <option value="DRAFT">Draft</option>
            <option value="REVIEW">In Review</option>
            <option value="PUBLISHED">Published</option>
            <option value="ARCHIVED">Archived</option>
          </select>
          <button type="submit"
                  className="ts-focus rounded-md px-2 py-1 text-[10px] font-medium"
                  style={{ background: "var(--surface-2)", color: "var(--text-default)", border: "1px solid var(--border-default)" }}>
            Set
          </button>
        </form>
      )}
      <Link href={`/docs/${detail.slug}`} target="_blank" rel="noopener noreferrer"
            className="ts-focus block text-center rounded-md px-2.5 py-1 text-[11px] font-medium"
            style={{ background: "var(--surface-2)", color: "var(--text-default)", border: "1px solid var(--border-default)" }}>
        View public page →
      </Link>
    </div>
  );
}

function MetadataCard({ detail }: { detail: DocPageDetail }) {
  return (
    <div className="rounded-lg border p-3 space-y-1.5"
         style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)" }}>
      <h2 className="text-[12px] font-semibold" style={{ color: "var(--text-default)" }}>Metadata</h2>
      <Row label="Section">
        <span className="inline-flex items-center gap-1">
          <span>{SECTION_ICONS[detail.section]}</span> {SECTION_LABELS[detail.section]}
        </span>
      </Row>
      <Row label="Owner">{detail.ownerTeam ?? "—"}</Row>
      <Row label="Author">{detail.authorName ?? "—"}</Row>
      <Row label="Last edited">
        {detail.lastEditedByName ?? "—"} · {relativeFromNow(detail.updatedAt)}
      </Row>
      <Row label="Version">v{detail.version}{detail.publishedVersion ? ` · published v${detail.publishedVersion}` : ""}</Row>
      <Row label="Reviewers">
        {detail.reviewers.length === 0
          ? <span style={{ color: "var(--text-faint)" }}>—</span>
          : detail.reviewers.map((r) => r.name ?? r.email).join(", ")}
      </Row>
      <Row label="Tags">
        {detail.tags.length === 0
          ? <span style={{ color: "var(--text-faint)" }}>—</span>
          : (
            <div className="flex flex-wrap gap-0.5">
              {detail.tags.map((t) => (
                <span key={t}
                      className="rounded-full px-1.5 py-0.5 text-[9px]"
                      style={{ background: "var(--surface-2)", color: "var(--text-muted)" }}>
                  {t}
                </span>
              ))}
            </div>
          )}
      </Row>
      {detail.canonical && <Row label="Canonical">{detail.canonical}</Row>}
      {detail.relatedSlugs.length > 0 && (
        <Row label="Related">
          <div className="flex flex-wrap gap-1">
            {detail.relatedSlugs.map((s) => (
              <Link key={s} href={`/platform/integrations/docs/${s}`}
                    className="ts-focus underline text-[11px]" style={{ color: "var(--accent-primary)" }}>
                {s}
              </Link>
            ))}
          </div>
        </Row>
      )}
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-2 text-[11px]">
      <dt style={{ color: "var(--text-muted)" }}>{label}</dt>
      <dd className="text-right" style={{ color: "var(--text-default)" }}>{children}</dd>
    </div>
  );
}

function VersionHistory({ detail, canPublish }: { detail: DocPageDetail; canPublish: boolean }) {
  return (
    <div className="rounded-lg border p-3 space-y-1.5"
         style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)" }}>
      <h2 className="text-[12px] font-semibold" style={{ color: "var(--text-default)" }}>
        Version history · {detail.versions.length}
      </h2>
      {detail.versions.length === 0 ? (
        <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>
          No versions yet — publish the page to create a version snapshot.
        </p>
      ) : (
        <ul className="space-y-1.5">
          {detail.versions.map((v) => (
            <li key={v.id} className="rounded-md border p-2 text-[11px]"
                style={{ borderColor: "var(--border-subtle)", background: "var(--surface-2)" }}>
              <div className="flex items-center justify-between">
                <span className="font-mono font-semibold" style={{ color: "var(--text-default)" }}>
                  v{v.versionNumber}
                  {v.isCurrent && (
                    <span className="ml-1 rounded px-1 py-0.5 text-[9px] uppercase"
                          style={{ background: "var(--success-surface)", color: "var(--success-fg)" }}>
                      current
                    </span>
                  )}
                </span>
                <span style={{ color: "var(--text-muted)" }}>{relativeFromNow(v.createdAt)}</span>
              </div>
              {v.changeNote && (
                <div className="mt-0.5" style={{ color: "var(--text-default)" }}>{v.changeNote}</div>
              )}
              {v.authorName && (
                <div style={{ color: "var(--text-muted)" }}>by {v.authorName}</div>
              )}
              {canPublish && !v.isCurrent && (
                <form action={rollbackDocPage} className="mt-1">
                  <input type="hidden" name="pageId" value={detail.id} />
                  <input type="hidden" name="versionId" value={v.id} />
                  <button type="submit"
                          className="ts-focus rounded-md px-2 py-1 text-[10px] font-medium"
                          style={{ background: "var(--warning-surface)", color: "var(--warning-fg)", border: "1px solid var(--amber-200)" }}>
                    Roll back to v{v.versionNumber}
                  </button>
                </form>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function CommentsCard({ detail, canWrite }: { detail: DocPageDetail; canWrite: boolean }) {
  const open = detail.comments.filter((c) => !c.resolvedAt);
  const resolved = detail.comments.filter((c) => c.resolvedAt);
  return (
    <div className="rounded-lg border p-3 space-y-2"
         style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)" }}>
      <h2 className="text-[12px] font-semibold" style={{ color: "var(--text-default)" }}>
        Comments · {open.length} open
      </h2>
      {canWrite && (
        <form action={addDocComment} className="space-y-1">
          <input type="hidden" name="pageId" value={detail.id} />
          <textarea name="body" required rows={2} maxLength={5000}
                    placeholder="Leave a review comment…"
                    className="ts-focus w-full rounded-md border px-2 py-1 text-[11px]"
                    style={{ borderColor: "var(--border-default)", background: "var(--surface-1)" }} />
          <div className="flex justify-end">
            <button type="submit"
                    className="ts-focus rounded-md px-2 py-1 text-[10px] font-medium"
                    style={{ background: "var(--accent-primary)", color: "white" }}>
              Add comment
            </button>
          </div>
        </form>
      )}
      {open.length === 0 ? (
        <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>No open comments.</p>
      ) : (
        <ul className="space-y-1.5">
          {open.map((c) => (
            <li key={c.id} className="rounded-md border p-2 text-[11px]"
                style={{ borderColor: "var(--border-subtle)", background: "var(--surface-2)" }}>
              <div className="flex items-center justify-between">
                <span style={{ color: "var(--text-default)" }}>
                  {c.authorName ?? "—"}
                </span>
                <span style={{ color: "var(--text-muted)" }}>{relativeFromNow(c.createdAt)}</span>
              </div>
              <p className="mt-0.5 whitespace-pre-wrap" style={{ color: "var(--text-default)" }}>{c.body}</p>
              {canWrite && (
                <form action={resolveDocComment} className="mt-1">
                  <input type="hidden" name="id" value={c.id} />
                  <input type="hidden" name="pageId" value={detail.id} />
                  <button type="submit"
                          className="ts-focus rounded-md px-2 py-1 text-[10px] font-medium"
                          style={{ background: "var(--success-surface)", color: "var(--success-fg)", border: "1px solid var(--emerald-200)" }}>
                    Resolve
                  </button>
                </form>
              )}
            </li>
          ))}
        </ul>
      )}
      {resolved.length > 0 && (
        <details>
          <summary className="cursor-pointer text-[10px]" style={{ color: "var(--text-muted)" }}>
            Resolved ({resolved.length})
          </summary>
          <ul className="mt-1 space-y-0.5">
            {resolved.map((c) => (
              <li key={c.id} className="text-[10px]" style={{ color: "var(--text-muted)" }}>
                {c.authorName ?? "—"} · {c.body.slice(0, 60)}{c.body.length > 60 ? "…" : ""}
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

function DangerZone({ detail }: { detail: DocPageDetail }) {
  return (
    <div className="rounded-lg border p-3 space-y-2"
         style={{ background: "var(--surface-1)", borderColor: "var(--rose-200)" }}>
      <h2 className="text-[12px] font-semibold" style={{ color: "var(--danger-fg)" }}>Danger zone</h2>
      <form action={deleteDocPage}>
        <input type="hidden" name="id" value={detail.id} />
        <button type="submit"
                className="ts-focus w-full rounded-md px-2 py-1 text-[11px] font-medium"
                style={{ background: "var(--rose-50, var(--surface-2))", color: "var(--danger-fg)", border: "1px solid var(--rose-200)" }}>
          Delete page (cascades versions + comments)
        </button>
      </form>
    </div>
  );
}
