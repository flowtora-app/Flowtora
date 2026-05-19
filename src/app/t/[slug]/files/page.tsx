import Link from "next/link";
import { requirePermission } from "@/lib/tenant";
import { db } from "@/lib/db";
import type { FileKind, Prisma } from "@prisma/client";
import {
  ACTIVE_FILE_KINDS,
  fileKindLabel,
  formatSize,
  isImage,
} from "@/lib/proofs";
import { formatDateTime } from "@/lib/format";

// Tenant-wide files library.
//
// Browse every File row in the workspace with filters (kind, parent
// type, search across filename + notes) and a thumbnail grid for image
// kinds. Archived rows are hidden by default; toggle to include them.

export const dynamic = "force-dynamic";

const PAGE_SIZE = 60;

type SP = Record<string, string | string[] | undefined>;
const asString = (v: string | string[] | undefined): string | undefined =>
  typeof v === "string" && v.length > 0 ? v : undefined;

const PARENT_OPTIONS = [
  { value: "any",      label: "Any parent" },
  { value: "customer", label: "On a customer" },
  { value: "quote",    label: "On a quote" },
  { value: "order",    label: "On an order" },
  { value: "proof",    label: "On a proof" },
] as const;

export default async function FilesLibraryPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<SP>;
}) {
  const { slug } = await params;
  const sp = await searchParams;
  const ctx = await requirePermission(slug, "customers:view");

  const q          = asString(sp.q);
  const kindFilter = asString(sp.kind);
  const parentFilter = asString(sp.parent) as (typeof PARENT_OPTIONS)[number]["value"] | undefined;
  const includeArchived = asString(sp.archived) === "1";
  const page = Math.max(1, parseInt(asString(sp.page) ?? "1", 10) || 1);

  const where: Prisma.FileWhereInput = { tenantId: ctx.tenant.id };
  if (!includeArchived) where.archivedAt = null;
  if (kindFilter && (ACTIVE_FILE_KINDS as { value: string }[]).some((k) => k.value === kindFilter)) {
    where.kind = kindFilter as FileKind;
  }
  if (parentFilter === "customer") where.customerId = { not: null };
  if (parentFilter === "quote")    where.quoteId    = { not: null };
  if (parentFilter === "order")    where.orderId    = { not: null };
  if (parentFilter === "proof")    where.proofId    = { not: null };
  if (q) {
    where.OR = [
      { filename: { contains: q, mode: "insensitive" } },
      { notes:    { contains: q, mode: "insensitive" } },
    ];
  }

  const [rows, total, kpis] = await Promise.all([
    db.file.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take:  PAGE_SIZE,
      skip:  (page - 1) * PAGE_SIZE,
      include: {
        customer: { select: { id: true, name: true } },
        quote:    { select: { id: true, number: true } },
        order:    { select: { id: true, number: true } },
        proof:    { select: { id: true, orderId: true, version: true } },
      },
    }),
    db.file.count({ where }),
    db.file.aggregate({
      where: { tenantId: ctx.tenant.id, archivedAt: null },
      _count: { _all: true },
      _sum:   { sizeBytes: true },
    }),
  ]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const totalBytes = Number(kpis._sum.sizeBytes ?? 0);

  const buildHref = (overrides: Record<string, string | undefined>): string => {
    const u = new URLSearchParams();
    if (q) u.set("q", q);
    if (kindFilter) u.set("kind", kindFilter);
    if (parentFilter) u.set("parent", parentFilter);
    if (includeArchived) u.set("archived", "1");
    if (page > 1) u.set("page", String(page));
    for (const [k, v] of Object.entries(overrides)) {
      if (v === undefined || v === "") u.delete(k);
      else u.set(k, v);
    }
    const qs = u.toString();
    return qs ? `/t/${slug}/files?${qs}` : `/t/${slug}/files`;
  };

  return (
    <div className="space-y-5">
      {/* Header. */}
      <div
        className="relative overflow-hidden rounded-2xl"
        style={{
          padding: "20px 24px",
          background:
            "radial-gradient(880px circle at -10% -50%, var(--accent-surface), transparent 55%), " +
            "linear-gradient(180deg, color-mix(in oklab, var(--surface-1) 92%, white 8%) 0%, var(--surface-1) 100%)",
          border: "1px solid var(--border-subtle)",
          boxShadow:
            "inset 0 1px 0 0 color-mix(in oklab, white 4%, transparent), " +
            "0 1px 2px 0 rgba(0,0,0,0.18)",
        }}
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2.5">
              <h1
                className="font-semibold"
                style={{
                  color: "var(--text-default)",
                  fontSize: 24,
                  letterSpacing: "-0.02em",
                  lineHeight: 1.15,
                }}
              >
                Files
              </h1>
              <span
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  letterSpacing: "0.04em",
                  color: "var(--accent-primary)",
                  background: "var(--accent-surface)",
                  border:
                    "1px solid color-mix(in oklab, var(--accent-primary) 22%, transparent)",
                  padding: "3px 8px",
                  borderRadius: 999,
                  fontFeatureSettings: "'tnum' 1",
                  lineHeight: 1,
                }}
              >
                {kpis._count._all.toLocaleString()}
              </span>
            </div>
            <p
              className="mt-1.5"
              style={{
                color: "var(--text-muted)",
                fontSize: 12.5,
                lineHeight: 1.45,
              }}
            >
              Every file you&apos;ve uploaded across customers, quotes, orders, and proofs.
              Filter by type or parent to find what you need.
            </p>
          </div>
          <div className="text-right">
            <div
              style={{
                color: "var(--text-faint)",
                fontSize: 10.5,
                fontWeight: 700,
                letterSpacing: "0.08em",
                textTransform: "uppercase",
              }}
            >
              Storage used
            </div>
            <div
              className="mt-1"
              style={{
                color: "var(--text-default)",
                fontSize: 22,
                fontWeight: 600,
                fontFeatureSettings: "'tnum' 1",
                letterSpacing: "-0.018em",
              }}
            >
              {formatSize(totalBytes)}
            </div>
          </div>
        </div>
      </div>

      {/* Filter bar. */}
      <form
        method="get"
        action={`/t/${slug}/files`}
        className="rounded-xl"
        style={{
          padding: "12px 14px",
          background:
            "linear-gradient(180deg, color-mix(in oklab, var(--surface-1) 92%, white 8%) 0%, var(--surface-1) 100%)",
          border: "1px solid var(--border-subtle)",
          boxShadow:
            "inset 0 1px 0 0 color-mix(in oklab, white 4%, transparent), " +
            "0 1px 2px 0 rgba(0,0,0,0.18)",
        }}
      >
        <div className="flex flex-wrap items-end gap-2">
          <label className="flex-1 min-w-[180px]">
            <span style={smallLabel}>Search</span>
            <input
              type="text"
              name="q"
              defaultValue={q ?? ""}
              placeholder="Filename or notes…"
              style={inputStyle}
            />
          </label>
          <label className="min-w-[160px]">
            <span style={smallLabel}>Type</span>
            <select name="kind" defaultValue={kindFilter ?? ""} style={inputStyle}>
              <option value="">All types</option>
              {ACTIVE_FILE_KINDS.map((k) => (
                <option key={k.value} value={k.value}>
                  {k.label}
                </option>
              ))}
            </select>
          </label>
          <label className="min-w-[160px]">
            <span style={smallLabel}>Parent</span>
            <select name="parent" defaultValue={parentFilter ?? "any"} style={inputStyle}>
              {PARENT_OPTIONS.map((p) => (
                <option key={p.value} value={p.value}>
                  {p.label}
                </option>
              ))}
            </select>
          </label>
          <label
            className="inline-flex items-center gap-1.5"
            style={{ alignSelf: "center", marginBottom: 2, paddingBottom: 2 }}
          >
            <input
              type="checkbox"
              name="archived"
              value="1"
              defaultChecked={includeArchived}
              style={{ accentColor: "var(--accent-primary)" }}
            />
            <span style={{ color: "var(--text-muted)", fontSize: 12 }}>
              Include archived
            </span>
          </label>
          <button
            type="submit"
            className="ts-focus inline-flex h-9 items-center rounded-lg font-semibold"
            style={{
              padding: "0 16px",
              background:
                "linear-gradient(180deg, color-mix(in oklab, var(--accent-primary) 96%, white 4%) 0%, var(--accent-primary) 100%)",
              color: "var(--accent-fg)",
              border:
                "1px solid color-mix(in oklab, var(--accent-primary) 80%, black 20%)",
              fontSize: 12.5,
              alignSelf: "flex-end",
            }}
          >
            Apply
          </button>
          {(q || kindFilter || parentFilter || includeArchived) && (
            <Link
              href={`/t/${slug}/files`}
              className="ts-focus inline-flex h-9 items-center rounded-lg"
              style={{
                padding: "0 12px",
                color: "var(--text-muted)",
                fontSize: 12,
                fontWeight: 500,
                alignSelf: "flex-end",
              }}
            >
              Clear
            </Link>
          )}
        </div>
      </form>

      {/* Results grid. */}
      {rows.length === 0 ? (
        <EmptyState hasFilters={!!(q || kindFilter || parentFilter)} />
      ) : (
        <div className="grid gap-3 grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {rows.map((f) => {
            const showThumb = isImage(f) && f.thumbnailUrl;
            return (
              <a
                key={f.id}
                href={f.storageUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="ts-focus group relative block overflow-hidden rounded-xl transition-all hover:-translate-y-px"
                style={{
                  background:
                    "linear-gradient(180deg, color-mix(in oklab, var(--surface-1) 92%, white 8%) 0%, var(--surface-1) 100%)",
                  border: "1px solid var(--border-subtle)",
                  boxShadow:
                    "inset 0 1px 0 0 color-mix(in oklab, white 4%, transparent), " +
                    "0 1px 2px 0 rgba(0,0,0,0.18)",
                  textDecoration: "none",
                }}
              >
                <div
                  style={{
                    aspectRatio: "4 / 3",
                    background: "color-mix(in oklab, var(--surface-2) 60%, transparent)",
                    borderBottom: "1px solid var(--border-subtle)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    overflow: "hidden",
                  }}
                >
                  {showThumb ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={f.thumbnailUrl ?? f.storageUrl}
                      alt={f.filename}
                      loading="lazy"
                      style={{
                        width: "100%",
                        height: "100%",
                        objectFit: "cover",
                        display: "block",
                      }}
                    />
                  ) : (
                    <FileTypeBadge mime={f.mimeType} />
                  )}
                </div>
                <div className="p-3">
                  <div
                    style={{
                      color: "var(--text-default)",
                      fontSize: 12.5,
                      fontWeight: 600,
                      letterSpacing: "-0.005em",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                    title={f.filename}
                  >
                    {f.filename}
                  </div>
                  <div
                    className="mt-1 flex items-center gap-1.5"
                    style={{
                      color: "var(--text-faint)",
                      fontSize: 10.5,
                      fontFeatureSettings: "'tnum' 1",
                    }}
                  >
                    <KindChip kind={f.kind} />
                    {f.sizeBytes ? <span>· {formatSize(f.sizeBytes)}</span> : null}
                  </div>
                  <div
                    className="mt-1.5"
                    style={{ color: "var(--text-muted)", fontSize: 11, lineHeight: 1.4 }}
                  >
                    {parentLink(slug, f)}
                  </div>
                  <div
                    className="mt-1"
                    style={{ color: "var(--text-faint)", fontSize: 10.5 }}
                  >
                    {formatDateTime(f.createdAt)}
                  </div>
                  {f.archivedAt && (
                    <div className="mt-2">
                      <span
                        style={{
                          fontSize: 9.5,
                          fontWeight: 700,
                          letterSpacing: "0.06em",
                          textTransform: "uppercase",
                          color: "var(--text-muted)",
                          background:
                            "color-mix(in oklab, var(--surface-2) 80%, transparent)",
                          border: "1px solid var(--border-subtle)",
                          padding: "1px 6px",
                          borderRadius: 999,
                        }}
                      >
                        Archived
                      </span>
                    </div>
                  )}
                </div>
              </a>
            );
          })}
        </div>
      )}

      {/* Pagination. */}
      {totalPages > 1 && (
        <div
          className="flex items-center justify-between"
          style={{ color: "var(--text-muted)", fontSize: 12 }}
        >
          <span>
            Page {page} of {totalPages} · {total.toLocaleString()} files
          </span>
          <div className="flex items-center gap-2">
            {page > 1 && (
              <Link
                href={buildHref({ page: page === 2 ? undefined : String(page - 1) })}
                className="ts-focus inline-flex h-8 items-center rounded-md px-3"
                style={{
                  color: "var(--text-default)",
                  background: "color-mix(in oklab, var(--surface-2) 60%, transparent)",
                  border: "1px solid var(--border-subtle)",
                  fontSize: 12,
                  fontWeight: 500,
                }}
              >
                ← Newer
              </Link>
            )}
            {page < totalPages && (
              <Link
                href={buildHref({ page: String(page + 1) })}
                className="ts-focus inline-flex h-8 items-center rounded-md px-3"
                style={{
                  color: "var(--text-default)",
                  background: "color-mix(in oklab, var(--surface-2) 60%, transparent)",
                  border: "1px solid var(--border-subtle)",
                  fontSize: 12,
                  fontWeight: 500,
                }}
              >
                Older →
              </Link>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Helpers ──────────────────────────────────────────────────────────

const smallLabel = {
  display: "block" as const,
  marginBottom: 4,
  color: "var(--text-default)",
  fontSize: 11.5,
  fontWeight: 600 as const,
  letterSpacing: "-0.005em",
};

const inputStyle = {
  width: "100%",
  height: 36,
  padding: "0 10px",
  borderRadius: 8,
  background: "var(--surface-1)",
  border: "1px solid var(--border-subtle)",
  color: "var(--text-default)",
  fontSize: 12.5,
  outline: "none",
} as const;

function parentLink(
  slug: string,
  f: {
    customer: { id: string; name: string } | null;
    quote:    { id: string; number: string } | null;
    order:    { id: string; number: string } | null;
    proof:    { id: string; orderId: string; version: number } | null;
  },
): React.ReactNode {
  if (f.customer)
    return (
      <Link
        href={`/t/${slug}/customers/${f.customer.id}`}
        className="ts-focus underline-offset-2 hover:underline"
        style={{ color: "var(--accent-primary)" }}
      >
        {f.customer.name}
      </Link>
    );
  if (f.quote)
    return (
      <Link
        href={`/t/${slug}/quotes/${f.quote.id}`}
        className="ts-focus underline-offset-2 hover:underline"
        style={{ color: "var(--accent-primary)" }}
      >
        Quote {f.quote.number}
      </Link>
    );
  if (f.order)
    return (
      <Link
        href={`/t/${slug}/orders/${f.order.id}`}
        className="ts-focus underline-offset-2 hover:underline"
        style={{ color: "var(--accent-primary)" }}
      >
        Order {f.order.number}
      </Link>
    );
  if (f.proof)
    return (
      <Link
        href={`/t/${slug}/orders/${f.proof.orderId}/proofs/${f.proof.id}`}
        className="ts-focus underline-offset-2 hover:underline"
        style={{ color: "var(--accent-primary)" }}
      >
        Proof v{f.proof.version}
      </Link>
    );
  return <span style={{ color: "var(--text-faint)" }}>Unattached</span>;
}

function KindChip({ kind }: { kind: FileKind }) {
  return (
    <span
      style={{
        fontSize: 9.5,
        fontWeight: 700,
        letterSpacing: "0.06em",
        textTransform: "uppercase",
        color: "var(--accent-primary)",
        background: "var(--accent-surface)",
        border: "1px solid color-mix(in oklab, var(--accent-primary) 22%, transparent)",
        padding: "1px 6px",
        borderRadius: 999,
        lineHeight: 1.2,
      }}
    >
      {fileKindLabel(kind)}
    </span>
  );
}

function FileTypeBadge({ mime }: { mime: string | null }) {
  // For non-image files, show a chunky type token. We don't need exact
  // mime-to-extension mapping — the few we care about cover most uploads.
  const ext = (() => {
    if (!mime) return "FILE";
    if (mime === "application/pdf") return "PDF";
    if (mime.startsWith("video/")) return "VID";
    if (mime.startsWith("audio/")) return "AUD";
    if (mime.includes("photoshop")) return "PSD";
    if (mime.includes("illustrator")) return "AI";
    if (mime === "application/zip") return "ZIP";
    if (mime.startsWith("text/"))   return "TXT";
    if (mime.includes("spreadsheet") || mime.includes("excel")) return "XLS";
    if (mime.includes("word") || mime.includes("document")) return "DOC";
    return mime.split("/")[1]?.slice(0, 4).toUpperCase() || "FILE";
  })();
  return (
    <div
      aria-hidden
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 8,
        color: "var(--text-muted)",
      }}
    >
      <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <path d="M14 2v6h6M9 14h6M9 18h4" />
      </svg>
      <span
        style={{
          fontSize: 10,
          fontWeight: 700,
          letterSpacing: "0.1em",
          color: "var(--text-faint)",
        }}
      >
        {ext}
      </span>
    </div>
  );
}

function EmptyState({ hasFilters }: { hasFilters: boolean }) {
  return (
    <div
      className="rounded-xl text-center"
      style={{
        padding: "48px 24px",
        background: "color-mix(in oklab, var(--surface-2) 50%, transparent)",
        border: "1px solid var(--border-subtle)",
      }}
    >
      <div
        aria-hidden
        className="mx-auto flex items-center justify-center"
        style={{
          width: 56,
          height: 56,
          borderRadius: 14,
          background:
            "linear-gradient(135deg, var(--accent-surface-strong), var(--accent-surface))",
          color: "var(--accent-primary)",
          border: "1px solid color-mix(in oklab, var(--accent-primary) 22%, transparent)",
        }}
      >
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <path d="M14 2v6h6" />
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
        {hasFilters ? "No files match those filters" : "No files yet"}
      </h2>
      <p
        className="mx-auto mt-1.5 max-w-md"
        style={{ color: "var(--text-muted)", fontSize: 12.5, lineHeight: 1.5 }}
      >
        {hasFilters
          ? "Try widening the search or clearing the filters."
          : "Upload from a customer, quote, order, or proof page. They'll all show up here."}
      </p>
    </div>
  );
}
