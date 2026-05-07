// Page 47 — Developer Documentation (tree / index).
//
// Sidebar tree of all 12 doc sections. Click a page → /[slug] editor.
// Three-pane editor lives on the detail route.

import Link from "next/link";
import { requirePlatformStaff } from "@/lib/platform";
import {
  loadDocsKpis,
  loadDocTree,
  SECTION_LABELS,
  SECTION_ICONS,
  type DocsKpis,
  type DocTreeSection,
  type DocTreeNode,
} from "@/server/platform/developer-docs";
import { createDocPage } from "@/app/actions/platform-developer-docs";
import type { DocSectionKey, DocPageStatus } from "@prisma/client";
import { Kpi, StatusPill, FormError, FormOk, Field } from "./_shared";

export const dynamic = "force-dynamic";

type SP = Record<string, string | string[] | undefined>;
const asString = (v: string | string[] | undefined): string | undefined =>
  typeof v === "string" && v.length > 0 ? v : undefined;

const SECTIONS: DocSectionKey[] = [
  "GETTING_STARTED", "AUTHENTICATION", "CONCEPTS", "RESOURCES", "WEBHOOKS",
  "SDKS", "RECIPES", "MIGRATION_GUIDES", "CHANGELOG", "ERRORS_REFERENCE",
  "RATE_LIMITS", "GLOSSARY",
];

export default async function DeveloperDocsPage({
  searchParams,
}: { searchParams: Promise<SP> }) {
  const ctx = await requirePlatformStaff();
  const sp = await searchParams;
  const canWrite = ctx.can("docs.write");
  const canPublish = ctx.can("docs.publish");
  const ok = asString(sp.ok);
  const error = asString(sp.error);

  const [kpis, tree] = await Promise.all([
    loadDocsKpis(),
    loadDocTree(),
  ]);

  return (
    <div className="space-y-5">
      <Header canPublish={canPublish} />
      {ok && <FormOk msg={ok} />}
      {error && <FormError msg={error} />}

      <KpiBar kpis={kpis} />

      <div className="grid grid-cols-12 gap-4">
        <aside className="col-span-12 lg:col-span-3 space-y-3">
          <SidebarTree tree={tree} />
        </aside>
        <main className="col-span-12 lg:col-span-9 space-y-4">
          {canWrite && <NewPageForm />}
          <RecentlyUpdated tree={tree} />
        </main>
      </div>
    </div>
  );
}

/* ── Header ───────────────────────────────────────── */

function Header({ canPublish }: { canPublish: boolean }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div>
        <nav className="text-[11px]" aria-label="Breadcrumbs">
          <Link href="/platform/integrations" className="ts-focus underline" style={{ color: "var(--text-muted)" }}>
            Integrations Catalog
          </Link>
          <span className="mx-1.5" style={{ color: "var(--text-faint)" }}>/</span>
          <span style={{ color: "var(--text-default)" }}>Developer Documentation</span>
        </nav>
        <h1 className="mt-1 text-[22px] font-semibold leading-tight" style={{ color: "var(--text-default)" }}>
          Developer Documentation
        </h1>
        <p className="mt-1 max-w-3xl text-[12px]" style={{ color: "var(--text-muted)" }}>
          Author + publish the public Flowtora developer docs and OpenAPI reference. Three-pane
          editor with version history, scheduled publishing, and roll-back.
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Link href="/platform/integrations/docs/openapi"
              className="ts-focus rounded-md px-3 py-1.5 text-[12px] font-medium"
              style={{ background: "var(--surface-2)", color: "var(--text-default)", border: "1px solid var(--border-default)" }}>
          OpenAPI specs
        </Link>
        <Link href="/platform/integrations/docs/code-samples"
              className="ts-focus rounded-md px-3 py-1.5 text-[12px] font-medium"
              style={{ background: "var(--surface-2)", color: "var(--text-default)", border: "1px solid var(--border-default)" }}>
          Code samples
        </Link>
        <a href="https://flowtora.com/docs" target="_blank" rel="noopener noreferrer"
           className="ts-focus rounded-md px-3 py-1.5 text-[12px] font-medium"
           style={{ background: "var(--surface-2)", color: "var(--text-default)", border: "1px solid var(--border-default)" }}
           title={canPublish ? "Open public docs site" : "Public docs site"}>
          View public →
        </a>
      </div>
    </div>
  );
}

/* ── KPI bar ──────────────────────────────────────── */

function KpiBar({ kpis }: { kpis: DocsKpis }) {
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
      <Kpi label="Total pages" value={kpis.totalPages.toLocaleString()} />
      <Kpi label="Published" value={kpis.publishedPages.toLocaleString()}
           tone={kpis.publishedPages > 0 ? "good" : "default"} />
      <Kpi label="In review" value={kpis.reviewPages.toLocaleString()}
           tone={kpis.reviewPages > 0 ? "warning" : "default"} />
      <Kpi label="Drafts" value={kpis.draftPages.toLocaleString()} />
      <Kpi label="Updated · 7d" value={kpis.updated7d.toLocaleString()} />
      <Kpi label="Open comments" value={kpis.openComments.toLocaleString()}
           tone={kpis.openComments > 5 ? "warning" : "default"} sub={kpis.scheduled > 0 ? `· ${kpis.scheduled} scheduled` : undefined} />
    </div>
  );
}

/* ── Sidebar tree ─────────────────────────────────── */

function SidebarTree({ tree }: { tree: DocTreeSection[] }) {
  return (
    <div className="rounded-lg border p-3"
         style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)" }}>
      <h2 className="mb-2 text-[12px] font-semibold" style={{ color: "var(--text-default)" }}>
        Documentation tree
      </h2>
      <ul className="space-y-3">
        {tree.map((s) => (
          <li key={s.section}>
            <details open={s.totalCount > 0 && s.totalCount < 8}>
              <summary className="cursor-pointer text-[11px] font-semibold uppercase tracking-wide"
                       style={{ color: "var(--text-muted)" }}>
                <span className="mr-1">{SECTION_ICONS[s.section]}</span>
                {SECTION_LABELS[s.section]}
                <span className="ml-1.5 rounded-full px-1.5 py-0.5 text-[9px] font-semibold"
                      style={{ background: "var(--surface-2)", color: "var(--text-muted)" }}>
                  {s.totalCount}
                </span>
              </summary>
              {s.nodes.length === 0 ? (
                <p className="mt-1 pl-4 text-[11px]" style={{ color: "var(--text-faint)" }}>
                  No pages
                </p>
              ) : (
                <TreeList nodes={s.nodes} depth={0} />
              )}
            </details>
          </li>
        ))}
      </ul>
    </div>
  );
}

function TreeList({ nodes, depth }: { nodes: DocTreeNode[]; depth: number }) {
  return (
    <ul className="mt-1 space-y-0.5" style={{ paddingLeft: depth * 12 + 8 }}>
      {nodes.map((n) => (
        <li key={n.id}>
          {n.externalUrl ? (
            <a href={n.externalUrl} target="_blank" rel="noopener noreferrer"
               className="ts-focus flex items-center gap-1.5 text-[11px] hover:underline"
               style={{ color: "var(--text-muted)" }}>
              <span>↗</span>
              <span className="truncate">{n.title}</span>
            </a>
          ) : (
            <Link href={`/platform/integrations/docs/${n.slug}`}
                  className="ts-focus flex items-center gap-1.5 text-[11px] hover:underline"
                  style={{ color: n.deprecated ? "var(--text-faint)" : "var(--text-default)" }}>
              <span>{n.isFolder ? "📁" : "📄"}</span>
              <span className="truncate">{n.title}</span>
              {n.deprecated && <span className="ml-1 text-[9px]" style={{ color: "var(--danger-fg)" }}>deprecated</span>}
              {n.status === "DRAFT" && (
                <span className="ml-auto text-[9px] uppercase" style={{ color: "var(--text-muted)" }}>draft</span>
              )}
              {n.status === "REVIEW" && (
                <span className="ml-auto text-[9px] uppercase" style={{ color: "var(--warning-fg)" }}>review</span>
              )}
            </Link>
          )}
          {n.children.length > 0 && <TreeList nodes={n.children} depth={depth + 1} />}
        </li>
      ))}
    </ul>
  );
}

/* ── New page form ────────────────────────────────── */

function NewPageForm() {
  return (
    <details className="rounded-lg border p-3"
             style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)" }}>
      <summary className="cursor-pointer text-[12px] font-semibold" style={{ color: "var(--text-default)" }}>
        + Add page or folder
      </summary>
      <form action={createDocPage} className="mt-2 grid grid-cols-1 gap-2 md:grid-cols-2">
        <Field label="Title">
          <input type="text" name="title" required maxLength={200}
                 placeholder="Authenticate with API keys"
                 className="ts-focus w-full rounded-md border px-2 py-1 text-[12px]"
                 style={{ borderColor: "var(--border-default)", background: "var(--surface-1)" }} />
        </Field>
        <Field label="Slug">
          <input type="text" name="slug" required maxLength={120}
                 pattern="[a-z0-9-]+" placeholder="auth-api-keys"
                 className="ts-focus w-full rounded-md border px-2 py-1 text-[12px] font-mono"
                 style={{ borderColor: "var(--border-default)", background: "var(--surface-1)" }} />
        </Field>
        <Field label="Section">
          <select name="section" defaultValue="CONCEPTS"
                  className="ts-focus w-full rounded-md border px-2 py-1 text-[12px]"
                  style={{ borderColor: "var(--border-default)", background: "var(--surface-1)" }}>
            {SECTIONS.map((s) => (
              <option key={s} value={s}>{SECTION_LABELS[s]}</option>
            ))}
          </select>
        </Field>
        <Field label="External URL (turns this into a link node)">
          <input type="url" name="externalUrl" maxLength={500}
                 className="ts-focus w-full rounded-md border px-2 py-1 text-[12px]"
                 style={{ borderColor: "var(--border-default)", background: "var(--surface-1)" }} />
        </Field>
        <label className="md:col-span-2 inline-flex items-center gap-2 text-[12px]"
               style={{ color: "var(--text-default)" }}>
          <input type="checkbox" name="isFolder" className="ts-focus h-4 w-4" />
          Folder (groups child pages — has no body)
        </label>
        <div className="md:col-span-2 flex justify-end">
          <button type="submit"
                  className="ts-focus rounded-md px-3 py-1.5 text-[12px] font-medium"
                  style={{ background: "var(--accent-primary)", color: "white" }}>
            Create page
          </button>
        </div>
      </form>
    </details>
  );
}

/* ── Recently updated list ─────────────────────────── */

function RecentlyUpdated({ tree }: { tree: DocTreeSection[] }) {
  // Flatten and pick the 12 most recently changed.
  const all: Array<{ node: DocTreeNode; section: DocSectionKey }> = [];
  const walk = (nodes: DocTreeNode[], section: DocSectionKey) => {
    for (const n of nodes) {
      all.push({ node: n, section });
      if (n.children.length > 0) walk(n.children, section);
    }
  };
  for (const s of tree) walk(s.nodes, s.section);

  return (
    <div className="rounded-lg border p-3"
         style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)" }}>
      <h2 className="mb-2 text-[12px] font-semibold" style={{ color: "var(--text-default)" }}>
        All pages · {all.length}
      </h2>
      {all.length === 0 ? (
        <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>
          No documentation pages yet — click "Add page" to start.
        </p>
      ) : (
        <table className="w-full text-[12px]">
          <thead>
            <tr style={{ color: "var(--text-muted)" }}>
              <th className="px-2 py-1.5 text-left text-[10px] font-semibold uppercase tracking-wide">Title</th>
              <th className="px-2 py-1.5 text-left text-[10px] font-semibold uppercase tracking-wide">Section</th>
              <th className="px-2 py-1.5 text-left text-[10px] font-semibold uppercase tracking-wide">Slug</th>
              <th className="px-2 py-1.5 text-left text-[10px] font-semibold uppercase tracking-wide">Status</th>
            </tr>
          </thead>
          <tbody>
            {all.map((row) => (
              <DocListRow key={row.node.id} row={row} />
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function DocListRow({ row }: { row: { node: DocTreeNode; section: DocSectionKey } }) {
  const { node, section } = row;
  return (
    <tr className="border-t" style={{ borderColor: "var(--border-subtle)" }}>
      <td className="px-2 py-1.5">
        <Link href={`/platform/integrations/docs/${node.slug}`}
              className="ts-focus underline"
              style={{ color: node.deprecated ? "var(--text-faint)" : "var(--text-default)" }}>
          {node.isFolder ? "📁 " : node.externalUrl ? "↗ " : "📄 "}
          {node.title}
        </Link>
        {node.deprecated && (
          <span className="ml-2 text-[10px]" style={{ color: "var(--danger-fg)" }}>deprecated</span>
        )}
      </td>
      <td className="px-2 py-1.5">
        <span className="inline-flex items-center gap-1 text-[11px]" style={{ color: "var(--text-muted)" }}>
          <span>{SECTION_ICONS[section]}</span>
          <span>{SECTION_LABELS[section]}</span>
        </span>
      </td>
      <td className="px-2 py-1.5">
        <code className="rounded px-1 py-0.5 text-[10px]"
              style={{ background: "var(--surface-2)", color: "var(--text-muted)" }}>
          {node.slug}
        </code>
      </td>
      <td className="px-2 py-1.5">
        <DocStatusPill status={node.status} />
      </td>
    </tr>
  );
}

function DocStatusPill({ status }: { status: DocPageStatus }) {
  return <StatusPill status={status} />;
}
