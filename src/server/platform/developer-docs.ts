// Page 47 — Developer Documentation data layer.

import { db } from "@/lib/db";
import type {
  DocPageStatus,
  DocSectionKey,
} from "@prisma/client";

const DAY = 86_400_000;

/* ── KPI strip ──────────────────────────────────────────── */

export interface DocsKpis {
  totalPages: number;
  draftPages: number;
  reviewPages: number;
  publishedPages: number;
  scheduled: number;
  /** Pages updated in last 7 days. */
  updated7d: number;
  /** Open comments awaiting response. */
  openComments: number;
  hasPublishedOpenApi: boolean;
  latestOpenApiVersion: string | null;
}

export async function loadDocsKpis(): Promise<DocsKpis> {
  const since7 = new Date(Date.now() - 7 * DAY);
  const [byStatus, scheduled, updated7d, openComments, latestSpec] = await Promise.all([
    db.docPage.groupBy({ by: ["status"], _count: { _all: true } }),
    db.docPage.count({ where: { scheduledPublishAt: { gt: new Date() } } }),
    db.docPage.count({ where: { updatedAt: { gte: since7 } } }),
    db.docPageComment.count({ where: { resolvedAt: null } }),
    db.openApiSpec.findFirst({
      where: { publishedAt: { not: null } },
      orderBy: { publishedAt: "desc" },
      select: { version: true },
    }),
  ]);
  const map = new Map<DocPageStatus, number>();
  for (const r of byStatus) map.set(r.status, r._count._all);
  return {
    totalPages: Array.from(map.values()).reduce((s, n) => s + n, 0),
    draftPages: map.get("DRAFT") ?? 0,
    reviewPages: map.get("REVIEW") ?? 0,
    publishedPages: map.get("PUBLISHED") ?? 0,
    scheduled,
    updated7d,
    openComments,
    hasPublishedOpenApi: !!latestSpec,
    latestOpenApiVersion: latestSpec?.version ?? null,
  };
}

/* ── Section-grouped tree for the sidebar ──────────────── */

export interface DocTreeNode {
  id: string;
  slug: string;
  title: string;
  status: DocPageStatus;
  isFolder: boolean;
  externalUrl: string | null;
  deprecated: boolean;
  position: number;
  children: DocTreeNode[];
}

export interface DocTreeSection {
  section: DocSectionKey;
  nodes: DocTreeNode[];
  totalCount: number;
}

export async function loadDocTree(): Promise<DocTreeSection[]> {
  const rows = await db.docPage.findMany({
    orderBy: [{ section: "asc" }, { parentId: "asc" }, { position: "asc" }, { title: "asc" }],
  });
  const bySection = new Map<DocSectionKey, typeof rows>();
  for (const r of rows) {
    const list = bySection.get(r.section) ?? [];
    list.push(r);
    bySection.set(r.section, list);
  }

  const order: DocSectionKey[] = [
    "GETTING_STARTED", "AUTHENTICATION", "CONCEPTS", "RESOURCES", "WEBHOOKS",
    "SDKS", "RECIPES", "MIGRATION_GUIDES", "CHANGELOG", "ERRORS_REFERENCE",
    "RATE_LIMITS", "GLOSSARY",
  ];

  return order.map((section) => {
    const sectionRows = bySection.get(section) ?? [];
    const byId = new Map<string, DocTreeNode>();
    const roots: DocTreeNode[] = [];
    // First pass — create nodes.
    for (const r of sectionRows) {
      byId.set(r.id, {
        id: r.id,
        slug: r.slug,
        title: r.title,
        status: r.status,
        isFolder: r.isFolder,
        externalUrl: r.externalUrl,
        deprecated: r.deprecated,
        position: r.position,
        children: [],
      });
    }
    // Second pass — link parents.
    for (const r of sectionRows) {
      const node = byId.get(r.id)!;
      if (r.parentId && byId.has(r.parentId)) {
        byId.get(r.parentId)!.children.push(node);
      } else {
        roots.push(node);
      }
    }
    // Sort children by position.
    const sortRecursive = (nodes: DocTreeNode[]) => {
      nodes.sort((a, b) => a.position - b.position || a.title.localeCompare(b.title));
      for (const n of nodes) sortRecursive(n.children);
    };
    sortRecursive(roots);
    return { section, nodes: roots, totalCount: sectionRows.length };
  });
}

/* ── Page detail ───────────────────────────────────────── */

export interface DocPageDetail {
  id: string;
  slug: string;
  title: string;
  section: DocSectionKey;
  parentId: string | null;
  parentTitle: string | null;
  status: DocPageStatus;
  isFolder: boolean;
  externalUrl: string | null;
  deprecated: boolean;

  body: string;
  bodyDraft: string | null;
  hasUnpublishedChanges: boolean;

  ownerTeam: string | null;
  reviewers: Array<{ id: string; name: string | null; email: string }>;
  version: number;
  publishedVersion: number | null;
  scheduledPublishAt: Date | null;

  seoTitle: string | null;
  seoDescription: string | null;
  canonical: string | null;
  tags: string[];
  relatedSlugs: string[];

  authorName: string | null;
  lastEditedByName: string | null;
  publishedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;

  versions: Array<{
    id: string;
    versionNumber: number;
    authorName: string | null;
    changeNote: string | null;
    publishedAt: Date | null;
    createdAt: Date;
    isCurrent: boolean;
  }>;

  comments: Array<{
    id: string;
    authorName: string | null;
    body: string;
    resolvedAt: Date | null;
    createdAt: Date;
  }>;
}

export async function loadDocPageDetail(slug: string): Promise<DocPageDetail | null> {
  const page = await db.docPage.findUnique({
    where: { slug },
    include: {
      versions: { orderBy: { versionNumber: "desc" }, take: 30 },
      comments: { orderBy: { createdAt: "desc" }, take: 30 },
    },
  });
  if (!page) return null;

  const parent = page.parentId
    ? await db.docPage.findUnique({ where: { id: page.parentId }, select: { title: true } })
    : null;

  const reviewerIds = page.reviewers ?? [];
  const reviewerUsers = reviewerIds.length === 0 ? [] : await db.user.findMany({
    where: { id: { in: reviewerIds } },
    select: { id: true, name: true, email: true },
  });

  const userIds = Array.from(new Set([
    page.authorId,
    page.lastEditedById,
    ...page.versions.map((v) => v.authorId),
    ...page.comments.map((c) => c.authorId),
  ].filter((x): x is string => Boolean(x))));
  const allUsers = userIds.length === 0 ? [] : await db.user.findMany({
    where: { id: { in: userIds } },
    select: { id: true, name: true, email: true },
  });
  const userMap = new Map(allUsers.map((u) => [u.id, u]));

  const labelFor = (id: string | null): string | null => {
    if (!id) return null;
    const u = userMap.get(id);
    return u?.name ?? u?.email ?? null;
  };

  const draft = page.bodyDraft ?? page.body;
  const hasUnpublishedChanges = (page.bodyDraft != null && page.bodyDraft !== page.body)
    || page.status !== "PUBLISHED";

  return {
    id: page.id,
    slug: page.slug,
    title: page.title,
    section: page.section,
    parentId: page.parentId,
    parentTitle: parent?.title ?? null,
    status: page.status,
    isFolder: page.isFolder,
    externalUrl: page.externalUrl,
    deprecated: page.deprecated,
    body: page.body,
    bodyDraft: draft,
    hasUnpublishedChanges,
    ownerTeam: page.ownerTeam,
    reviewers: reviewerUsers,
    version: page.version,
    publishedVersion: page.publishedVersion,
    scheduledPublishAt: page.scheduledPublishAt,
    seoTitle: page.seoTitle,
    seoDescription: page.seoDescription,
    canonical: page.canonical,
    tags: page.tags,
    relatedSlugs: page.relatedSlugs,
    authorName: labelFor(page.authorId),
    lastEditedByName: labelFor(page.lastEditedById),
    publishedAt: page.publishedAt,
    createdAt: page.createdAt,
    updatedAt: page.updatedAt,
    versions: page.versions.map((v) => ({
      id: v.id,
      versionNumber: v.versionNumber,
      authorName: labelFor(v.authorId),
      changeNote: v.changeNote,
      publishedAt: v.publishedAt,
      createdAt: v.createdAt,
      isCurrent: page.publishedVersion === v.versionNumber,
    })),
    comments: page.comments.map((c) => ({
      id: c.id,
      authorName: labelFor(c.authorId),
      body: c.body,
      resolvedAt: c.resolvedAt,
      createdAt: c.createdAt,
    })),
  };
}

/* ── OpenAPI specs ─────────────────────────────────────── */

export interface OpenApiSpecRow {
  id: string;
  version: string;
  format: string;
  validatedAt: Date | null;
  validationErrors: string[];
  autoPublish: boolean;
  publishedAt: Date | null;
  uploadedByName: string | null;
  createdAt: Date;
  updatedAt: Date;
  byteSize: number;
}

export async function loadOpenApiSpecs(): Promise<{
  rows: OpenApiSpecRow[];
  current: OpenApiSpecRow | null;
}> {
  const specs = await db.openApiSpec.findMany({
    orderBy: { createdAt: "desc" },
    take: 30,
  });
  const userIds = Array.from(new Set(specs.map((s) => s.uploadedById).filter((x): x is string => Boolean(x))));
  const users = userIds.length === 0 ? [] : await db.user.findMany({
    where: { id: { in: userIds } },
    select: { id: true, name: true, email: true },
  });
  const userMap = new Map(users.map((u) => [u.id, u]));

  const rows: OpenApiSpecRow[] = specs.map((s) => ({
    id: s.id,
    version: s.version,
    format: s.format,
    validatedAt: s.validatedAt,
    validationErrors: s.validationErrors,
    autoPublish: s.autoPublish,
    publishedAt: s.publishedAt,
    uploadedByName: s.uploadedById
      ? userMap.get(s.uploadedById)?.name ?? userMap.get(s.uploadedById)?.email ?? null
      : null,
    createdAt: s.createdAt,
    updatedAt: s.updatedAt,
    byteSize: Buffer.byteLength(s.body, "utf8"),
  }));
  const current = rows.find((r) => r.publishedAt) ?? null;
  return { rows, current };
}

export async function loadOpenApiSpecBody(version: string): Promise<{ version: string; body: string; format: string } | null> {
  const spec = await db.openApiSpec.findUnique({
    where: { version },
    select: { version: true, body: true, format: true },
  });
  return spec;
}

/* ── Code samples ──────────────────────────────────────── */

export interface CodeSampleRow {
  id: string;
  endpointKey: string;
  language: string;
  body: string;
  lintedAt: Date | null;
  lintStatus: string | null;
  lintMessage: string | null;
  updatedAt: Date;
}

export async function loadCodeSamples(opts: { endpointKey?: string; language?: string } = {}): Promise<CodeSampleRow[]> {
  const where: Record<string, unknown> = {};
  if (opts.endpointKey) where.endpointKey = opts.endpointKey;
  if (opts.language) where.language = opts.language;
  const rows = await db.codeSample.findMany({
    where,
    orderBy: [{ endpointKey: "asc" }, { language: "asc" }],
    take: 500,
  });
  return rows.map((r) => ({
    id: r.id,
    endpointKey: r.endpointKey,
    language: r.language,
    body: r.body,
    lintedAt: r.lintedAt,
    lintStatus: r.lintStatus,
    lintMessage: r.lintMessage,
    updatedAt: r.updatedAt,
  }));
}

/* ── Helpers ──────────────────────────────────────────── */

export const SECTION_LABELS: Record<DocSectionKey, string> = {
  GETTING_STARTED:   "Getting Started",
  AUTHENTICATION:    "Authentication",
  CONCEPTS:          "Concepts",
  RESOURCES:         "Resources",
  WEBHOOKS:          "Webhooks",
  SDKS:              "SDKs",
  RECIPES:           "Recipes",
  MIGRATION_GUIDES:  "Migration Guides",
  CHANGELOG:         "Changelog",
  ERRORS_REFERENCE:  "Errors Reference",
  RATE_LIMITS:       "Rate Limits",
  GLOSSARY:          "Glossary",
};

export const SECTION_ICONS: Record<DocSectionKey, string> = {
  GETTING_STARTED:   "🚀",
  AUTHENTICATION:    "🔐",
  CONCEPTS:          "📘",
  RESOURCES:         "📦",
  WEBHOOKS:          "🪝",
  SDKS:              "🧩",
  RECIPES:           "🍳",
  MIGRATION_GUIDES:  "🔄",
  CHANGELOG:         "📜",
  ERRORS_REFERENCE:  "🚨",
  RATE_LIMITS:       "⚡",
  GLOSSARY:          "📖",
};

export const STATUS_TONE: Record<DocPageStatus, { bg: string; fg: string }> = {
  DRAFT:     { bg: "var(--surface-2)",       fg: "var(--text-muted)" },
  REVIEW:    { bg: "var(--warning-surface)", fg: "var(--warning-fg)" },
  PUBLISHED: { bg: "var(--success-surface)", fg: "var(--success-fg)" },
  ARCHIVED:  { bg: "var(--rose-50, var(--surface-2))", fg: "var(--danger-fg)" },
};

export const SUPPORTED_LANGUAGES = [
  "curl", "node", "python", "ruby", "php", "go", "java", "csharp", "swift", "kotlin", "postman",
] as const;

export function languageLabel(lang: string): string {
  switch (lang) {
    case "curl":     return "cURL";
    case "node":     return "Node.js";
    case "python":   return "Python";
    case "ruby":     return "Ruby";
    case "php":      return "PHP";
    case "go":       return "Go";
    case "java":     return "Java";
    case "csharp":   return "C#";
    case "swift":    return "Swift";
    case "kotlin":   return "Kotlin";
    case "postman":  return "Postman";
    default:         return lang;
  }
}

/** Tiny MDX → safe HTML renderer for the live preview pane. Handles
 *  headings, paragraphs, code blocks, callout-style blockquotes, and
 *  the custom `<Callout>`, `<Endpoint>`, `<Param>`, `<Response>`,
 *  `<CodeTabs>`, `<Diagram>` tags by extracting their text content. */
export function renderMdxPreview(body: string): string {
  if (!body) return "<p style=\"color: var(--text-muted)\">(empty page)</p>";
  const escapeHtml = (s: string) =>
    s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

  const lines = body.replace(/\r\n/g, "\n").split("\n");
  const out: string[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i]!;

    // Fenced code blocks.
    const fence = /^```(\w*)/.exec(line);
    if (fence) {
      const lang = fence[1] || "";
      const code: string[] = [];
      i++;
      while (i < lines.length && !lines[i]!.startsWith("```")) {
        code.push(lines[i]!);
        i++;
      }
      i++;
      out.push(
        `<pre style="background:var(--surface-2);padding:8px;border-radius:6px;overflow-x:auto;font-size:11px"><code data-lang="${escapeHtml(lang)}">${escapeHtml(code.join("\n"))}</code></pre>`,
      );
      continue;
    }

    // Custom callouts.
    if (line.startsWith("<Callout")) {
      const inner: string[] = [];
      i++;
      while (i < lines.length && !lines[i]!.includes("</Callout>")) {
        inner.push(lines[i]!);
        i++;
      }
      i++;
      out.push(
        `<div style="border-left:3px solid var(--accent-primary);background:var(--accent-surface);padding:6px 10px;margin:6px 0;font-size:12px">${escapeHtml(inner.join(" "))}</div>`,
      );
      continue;
    }

    // Other custom MDX tags — render as a labeled block.
    if (/^<(Endpoint|Param|Response|CodeTabs|Diagram)\b/.exec(line)) {
      out.push(
        `<div style="border:1px solid var(--border-subtle);background:var(--surface-2);padding:6px 10px;margin:6px 0;font-size:11px;font-family:monospace">${escapeHtml(line.trim())}</div>`,
      );
      i++;
      continue;
    }

    // Headings.
    const h = /^(#{1,4})\s+(.*)$/.exec(line);
    if (h) {
      const level = h[1]!.length;
      const text = h[2]!;
      const fontSize = level === 1 ? 20 : level === 2 ? 16 : level === 3 ? 14 : 12;
      out.push(
        `<h${level} style="font-size:${fontSize}px;font-weight:600;margin:8px 0 4px;color:var(--text-default)">${escapeHtml(text)}</h${level}>`,
      );
      i++;
      continue;
    }

    // Blockquote.
    if (line.startsWith("> ")) {
      out.push(
        `<blockquote style="border-left:2px solid var(--border-default);padding:2px 8px;margin:4px 0;color:var(--text-muted);font-size:12px">${escapeHtml(line.slice(2))}</blockquote>`,
      );
      i++;
      continue;
    }

    // List items.
    if (/^[-*]\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^[-*]\s+/.test(lines[i]!)) {
        items.push(lines[i]!.replace(/^[-*]\s+/, ""));
        i++;
      }
      out.push(
        `<ul style="padding-left:18px;margin:4px 0;font-size:12px;color:var(--text-default)">${
          items.map((t) => `<li>${escapeHtml(t)}</li>`).join("")
        }</ul>`,
      );
      continue;
    }

    // Empty line.
    if (line.trim() === "") {
      i++;
      continue;
    }

    // Paragraph.
    out.push(`<p style="margin:4px 0;font-size:12px;color:var(--text-default)">${escapeHtml(line)}</p>`);
    i++;
  }

  return out.join("");
}

/** LCS-ish line diff used for the "Diff vs Live" panel. */
export function diffLines(before: string, after: string): Array<{ kind: "same" | "add" | "del"; text: string }> {
  const a = before.replace(/\r\n/g, "\n").split("\n");
  const b = after.replace(/\r\n/g, "\n").split("\n");
  const m = a.length;
  const n = b.length;
  // Build LCS matrix.
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = m - 1; i >= 0; i--) {
    for (let j = n - 1; j >= 0; j--) {
      if (a[i] === b[j]) dp[i]![j] = dp[i + 1]![j + 1]! + 1;
      else dp[i]![j] = Math.max(dp[i + 1]![j]!, dp[i]![j + 1]!);
    }
  }
  // Walk.
  const out: Array<{ kind: "same" | "add" | "del"; text: string }> = [];
  let i = 0, j = 0;
  while (i < m && j < n) {
    if (a[i] === b[j]) {
      out.push({ kind: "same", text: a[i]! });
      i++; j++;
    } else if (dp[i + 1]![j]! >= dp[i]![j + 1]!) {
      out.push({ kind: "del", text: a[i]! });
      i++;
    } else {
      out.push({ kind: "add", text: b[j]! });
      j++;
    }
  }
  while (i < m) { out.push({ kind: "del", text: a[i++]! }); }
  while (j < n) { out.push({ kind: "add", text: b[j++]! }); }
  return out;
}
