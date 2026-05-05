// Page 38 §Form submissions — triage incoming form posts.

import Link from "next/link";
import { requirePlatformStaff } from "@/lib/platform";
import { loadSubmissions } from "@/server/platform/landing-pages";
import { setSubmissionStatus } from "@/app/actions/platform-landing-pages";
import { FormError, FormOk, relativeFromNow } from "../_components/shared";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 30;
const STATUSES = ["all", "new", "reviewed", "spam", "converted"] as const;

const STATUS_TONE: Record<string, { bg: string; fg: string }> = {
  new:       { bg: "var(--accent-surface)",  fg: "var(--accent-primary)" },
  reviewed:  { bg: "var(--surface-2)",       fg: "var(--text-muted)" },
  spam:      { bg: "var(--rose-50, var(--surface-2))", fg: "var(--danger-fg)" },
  converted: { bg: "var(--success-surface)", fg: "var(--success-fg)" },
};

export default async function SubmissionsPage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; error?: string; status?: string; page?: string }>;
}) {
  const ctx = await requirePlatformStaff();
  const sp = await searchParams;
  const canWrite = ctx.can("announcement.write");
  const status = (STATUSES as readonly string[]).includes(sp.status ?? "") ? (sp.status as string) : "new";
  const pageNum = Math.max(1, parseInt(sp.page ?? "1", 10) || 1);

  const list = await loadSubmissions({ status, page: pageNum, pageSize: PAGE_SIZE });
  const totalPages = Math.max(1, Math.ceil(list.filteredTotal / PAGE_SIZE));

  return (
    <div className="space-y-5">
      <div className="text-[11px]" style={{ color: "var(--text-muted)" }}>
        <Link href="/platform/marketing/landing-pages" className="underline" style={{ color: "var(--text-muted)" }}>
          Landing pages
        </Link>
        <span className="mx-1.5">/</span>
        <span style={{ color: "var(--text-default)" }}>Form submissions</span>
      </div>

      <h1 className="text-[22px] font-semibold leading-tight" style={{ color: "var(--text-default)" }}>
        Form submissions
      </h1>

      <FormOk msg={sp.ok} />
      <FormError msg={sp.error} />

      <div className="flex flex-wrap items-center gap-1 rounded-lg border p-1"
           style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)" }}>
        {STATUSES.map((s) => {
          const selected = status === s;
          return (
            <Link
              key={s}
              href={s === "new" ? "/platform/marketing/landing-pages/submissions" : `?status=${s}`}
              className="ts-focus rounded-md px-3 py-1.5 text-[12px] font-medium capitalize"
              style={{
                background: selected ? "var(--surface-2)" : "transparent",
                color: selected ? "var(--text-default)" : "var(--text-muted)",
              }}
            >
              {s}
            </Link>
          );
        })}
      </div>

      {list.rows.length === 0 ? (
        <div
          className="rounded-lg border p-10 text-center text-[12px]"
          style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)", color: "var(--text-muted)" }}
        >
          <div className="mb-1 text-2xl" aria-hidden>📮</div>
          <div className="font-medium" style={{ color: "var(--text-default)" }}>
            No submissions in this view.
          </div>
        </div>
      ) : (
        <ul
          className="overflow-hidden rounded-lg"
          style={{ background: "var(--surface-1)", border: "1px solid var(--border-subtle)" }}
        >
          {list.rows.map((r, idx) => {
            const tone = STATUS_TONE[r.status] ?? STATUS_TONE.new!;
            return (
              <li
                key={r.id}
                className="px-4 py-3"
                style={{ borderTop: idx === 0 ? "none" : "1px solid var(--border-subtle)" }}
              >
                <div className="flex flex-wrap items-baseline justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="rounded-full px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
                            style={{ background: tone.bg, color: tone.fg }}>
                        {r.status}
                      </span>
                      <Link
                        href={`/platform/marketing/landing-pages/${r.pageId}`}
                        className="ts-focus text-[12px] font-mono underline"
                        style={{ color: "var(--text-muted)" }}
                      >
                        {r.pagePath}
                      </Link>
                      <span className="text-[10px]" style={{ color: "var(--text-faint)" }}>
                        {relativeFromNow(r.createdAt)}
                      </span>
                    </div>
                    {r.email && (
                      <div className="mt-1 text-[12px] font-semibold" style={{ color: "var(--text-default)" }}>
                        {r.email}
                      </div>
                    )}
                    <pre className="mt-1 whitespace-pre-wrap text-[11px] font-mono" style={{ color: "var(--text-muted)" }}>
                      {JSON.stringify(r.payload, null, 2)}
                    </pre>
                    {r.source && (
                      <div className="mt-1 text-[10px]" style={{ color: "var(--text-faint)" }}>
                        Source: {r.source}
                      </div>
                    )}
                    {r.reviewedByName && r.reviewedAt && (
                      <div className="mt-1 text-[10px]" style={{ color: "var(--text-faint)" }}>
                        Reviewed by {r.reviewedByName} {relativeFromNow(r.reviewedAt)}
                      </div>
                    )}
                  </div>
                  {canWrite && (
                    <div className="flex flex-col items-end gap-1.5">
                      {(["new", "reviewed", "converted", "spam"] as const).filter((s) => s !== r.status).map((s) => (
                        <form key={s} action={setSubmissionStatus}>
                          <input type="hidden" name="id" value={r.id} />
                          <input type="hidden" name="status" value={s} />
                          <button type="submit"
                                  className="ts-focus rounded-md px-2 py-1 text-[10px] font-medium"
                                  style={{
                                    background: "var(--surface-1)",
                                    color: STATUS_TONE[s]?.fg ?? "var(--text-default)",
                                    border: `1px solid ${STATUS_TONE[s]?.fg ?? "var(--border-default)"}`,
                                  }}>
                            → {s}
                          </button>
                        </form>
                      ))}
                    </div>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-between text-[11px]" style={{ color: "var(--text-muted)" }}>
          <span>
            Page <b style={{ color: "var(--text-default)" }}>{pageNum}</b> of {totalPages} ·{" "}
            {list.filteredTotal.toLocaleString()} submission{list.filteredTotal === 1 ? "" : "s"}
          </span>
          <div className="flex items-center gap-1">
            <PageLink href={pageNum > 1 ? `?status=${status}&page=${pageNum - 1}` : null}>‹ Prev</PageLink>
            <PageLink href={pageNum < totalPages ? `?status=${status}&page=${pageNum + 1}` : null}>Next ›</PageLink>
          </div>
        </div>
      )}
    </div>
  );
}

function PageLink({ href, children }: { href: string | null; children: React.ReactNode }) {
  if (!href) {
    return (
      <span className="rounded-md px-2 py-1"
            style={{ color: "var(--text-faint)", border: "1px solid var(--border-subtle)", opacity: 0.5 }}>
        {children}
      </span>
    );
  }
  return (
    <Link href={href} className="ts-focus rounded-md px-2 py-1"
          style={{ color: "var(--text-default)", border: "1px solid var(--border-default)" }}>
      {children}
    </Link>
  );
}
