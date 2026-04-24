import Link from "next/link";
import type { QuoteStatus } from "@prisma/client";
import { formatDate, formatMoney } from "@/lib/format";
import { statusColor, statusLabel } from "@/lib/quotes";
import { Icon } from "@/components/shell/icons";

// Portal-style read-only preview of the current quote. Two render
// shapes, one component:
//
//   • `mode="drawer"` (default / legacy) — right-anchored dialog
//     triggered by `?preview=1` on the detail page. Has a dimmer
//     behind it + a close button; `closeHref` is required.
//
//   • `mode="inline"` (Phase 6) — the right-pane live preview on the
//     single-page quote editor. No dimmer, no fixed positioning, no
//     close chrome. Caller is responsible for outer sizing; the
//     component includes its own sticky scroll container.
//
// Either way the body is identical: line items grouped by section,
// totals block, optional-adds panel, deposit panel, terms. "Live" here
// means server-side live — every save revalidates the detail page,
// so the preview catches the new state on the next render.

export type QuotePortalPreviewItem = {
  id: string;
  name: string;
  description: string | null;
  subtotal: number;
  isOptional: boolean;
  sectionId: string | null;
  optionSummary: string | null;
};

export type QuotePortalPreviewSection = {
  id: string;
  title: string;
  description: string | null;
};

export interface QuotePortalPreviewProps {
  /** "drawer" renders the fixed right-anchored modal (legacy);
   *  "inline" renders a sticky scrolling pane. Defaults to "drawer"
   *  so existing callers keep working unchanged. */
  mode?: "drawer" | "inline";
  /** Required in "drawer" mode. Ignored in "inline". */
  closeHref?: string;
  tenantName: string;
  number: string;
  status: QuoteStatus;
  customerName: string;
  expiresAt: Date | null;
  currency: string;
  subtotal: number;
  discountType: "NONE" | "FIXED" | "PERCENT";
  discountValue: number;
  discountAmount: number;
  taxRate: number;
  taxAmount: number;
  total: number;
  optionalSubtotal: number;
  depositType: "NONE" | "FIXED" | "PERCENT";
  depositValue: number;
  depositAmount: number;
  customerNote: string | null;
  terms: string | null;
  items: QuotePortalPreviewItem[];
  sections: QuotePortalPreviewSection[];
}

export function QuotePortalPreview(p: QuotePortalPreviewProps) {
  const sectionById = new Map(p.sections.map((s) => [s.id, s]));
  const ungrouped = p.items.filter(
    (it) => !it.sectionId || !sectionById.has(it.sectionId),
  );
  const bySection = new Map<string, QuotePortalPreviewItem[]>();
  for (const s of p.sections) bySection.set(s.id, []);
  for (const it of p.items) {
    if (it.sectionId && sectionById.has(it.sectionId)) {
      bySection.get(it.sectionId)!.push(it);
    }
  }

  const discountLabel =
    p.discountType === "PERCENT"
      ? `Discount (${Number(p.discountValue)}%)`
      : p.discountType === "FIXED"
        ? "Discount (flat)"
        : "Discount";

  const mode = p.mode ?? "drawer";

  // The body that both render modes share.
  const content = (
    <>
      {/* Brand strip */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <div
            className="text-[11px] uppercase tracking-wide"
            style={{ color: "var(--text-muted)" }}
          >
            Quote from
          </div>
          <div className="text-lg font-semibold">{p.tenantName}</div>
        </div>
        <div className="text-right">
          <div className="flex items-center justify-end gap-2">
            <h2 className="text-xl font-semibold">{p.number}</h2>
            <span
              className="rounded-full px-2 py-0.5 text-xs"
              style={{ background: statusColor(p.status), color: "white" }}
            >
              {statusLabel(p.status)}
            </span>
          </div>
          <div
            className="mt-0.5 text-xs"
            style={{ color: "var(--text-muted)" }}
          >
            For {p.customerName}
            {p.expiresAt && (
              <> · Expires {formatDate(p.expiresAt)}</>
            )}
          </div>
        </div>
      </div>

      {p.customerNote && (
        <div
          className="rounded-md px-3 py-2 text-sm"
          style={{
            background: "var(--surface-1)",
            border: "1px solid var(--border-subtle)",
            color: "var(--text-default)",
          }}
        >
          {p.customerNote}
        </div>
      )}

      {/* Line items grouped by section */}
      <div className="space-y-4">
        {ungrouped.length > 0 && (
          <PreviewItemBlock
            title={p.sections.length > 0 ? "Items" : null}
            description={null}
            items={ungrouped}
            currency={p.currency}
          />
        )}
        {p.sections.map((s) => {
          const rows = bySection.get(s.id) ?? [];
          if (rows.length === 0) return null;
          return (
            <PreviewItemBlock
              key={s.id}
              title={s.title}
              description={s.description}
              items={rows}
              currency={p.currency}
            />
          );
        })}
        {p.items.length === 0 && (
          <div
            className="rounded-md px-4 py-6 text-center text-sm"
            style={{
              background: "var(--surface-1)",
              border: "1px dashed var(--border-subtle)",
              color: "var(--text-muted)",
            }}
          >
            No line items yet — the customer would see an empty list.
          </div>
        )}
      </div>

      {/* Totals */}
      <div
        className="rounded-md px-4 py-3 text-sm"
        style={{
          background: "var(--surface-1)",
          border: "1px solid var(--border-subtle)",
        }}
      >
        <TotalRow
          label="Subtotal"
          value={formatMoney(p.subtotal, p.currency)}
        />
        {p.discountAmount > 0 && (
          <TotalRow
            label={discountLabel}
            value={`− ${formatMoney(p.discountAmount, p.currency)}`}
            muted
          />
        )}
        <TotalRow
          label={`Tax (${(p.taxRate * 100).toFixed(p.taxRate * 100 < 1 ? 3 : 2)}%)`}
          value={formatMoney(p.taxAmount, p.currency)}
          muted
        />
        <div
          className="mt-2 pt-2"
          style={{ borderTop: "1px solid var(--border-subtle)" }}
        >
          <TotalRow
            label="Total"
            value={formatMoney(p.total, p.currency)}
            bold
          />
        </div>
      </div>

      {p.optionalSubtotal > 0 && (
        <div
          className="rounded-md px-4 py-3 text-sm"
          style={{
            background: "var(--accent-surface)",
            border: "1px solid var(--accent-primary)",
          }}
        >
          <div
            className="text-xs font-medium uppercase tracking-wide"
            style={{ color: "var(--accent-primary)" }}
          >
            Optional add-ons
          </div>
          <TotalRow
            label="Available to add"
            value={formatMoney(p.optionalSubtotal, p.currency)}
          />
          <div
            className="mt-1 text-xs"
            style={{ color: "var(--text-muted)" }}
          >
            Customers can pick any of these from the share link. Accepted
            add-ons flip to required and the total updates.
          </div>
        </div>
      )}

      {p.depositType !== "NONE" && p.depositAmount > 0 && (
        <div
          className="rounded-md px-4 py-3 text-sm"
          style={{
            background: "var(--surface-1)",
            border: "1px solid var(--border-subtle)",
          }}
        >
          <div
            className="text-xs font-medium uppercase tracking-wide"
            style={{ color: "var(--text-muted)" }}
          >
            Deposit required
          </div>
          <TotalRow
            label={
              p.depositType === "PERCENT"
                ? `Deposit (${Number(p.depositValue)}% of total)`
                : "Deposit (flat)"
            }
            value={formatMoney(p.depositAmount, p.currency)}
            bold
          />
          <TotalRow
            label="Balance on completion"
            value={formatMoney(
              Math.max(0, p.total - p.depositAmount),
              p.currency,
            )}
            muted
          />
        </div>
      )}

      {p.terms && (
        <div className="space-y-1.5">
          <div
            className="text-[11px] font-semibold uppercase tracking-wide"
            style={{ color: "var(--text-muted)" }}
          >
            Terms
          </div>
          <div
            className="rounded-md px-3 py-2 text-xs whitespace-pre-wrap"
            style={{
              background: "var(--surface-1)",
              border: "1px solid var(--border-subtle)",
              color: "var(--text-muted)",
            }}
          >
            {p.terms}
          </div>
        </div>
      )}
    </>
  );

  if (mode === "inline") {
    // Sticky right-rail pane: scrolls independently, stays visible
    // while the editor column scrolls. Caller can hide it on narrow
    // viewports (it's already in a lg:sticky grid column).
    return (
      <div
        className="rounded-lg overflow-hidden flex flex-col lg:sticky lg:top-24"
        style={{
          background: "var(--surface-0)",
          border: "1px solid var(--border-subtle)",
          maxHeight: "calc(100vh - 7rem)",
        }}
      >
        <div
          className="flex shrink-0 items-center justify-between gap-2 px-4 py-2"
          style={{
            background: "var(--surface-1)",
            borderBottom: "1px solid var(--border-subtle)",
          }}
        >
          <div
            className="text-[10px] font-semibold uppercase tracking-wider"
            style={{ color: "var(--text-muted)" }}
          >
            Customer preview · {p.tenantName}
          </div>
          <span
            className="rounded-full px-2 py-0.5 text-[10px]"
            style={{ background: "var(--surface-2)", color: "var(--text-muted)" }}
            title="Every save revalidates this page, so the preview stays in sync."
          >
            Live
          </span>
        </div>
        <div className="flex-1 space-y-5 overflow-y-auto px-4 py-4">
          {content}
        </div>
      </div>
    );
  }

  // Default: fixed-drawer mode (legacy).
  const closeHref = p.closeHref ?? "#";
  return (
    <>
      {/* Dimmer — a link so clicking outside the drawer closes it. */}
      <Link
        href={closeHref}
        aria-label="Close preview"
        className="fixed inset-0"
        style={{
          background: "rgb(0 0 0 / 0.45)",
          zIndex: "var(--z-overlay, 800)" as unknown as number,
        }}
      />
      <aside
        role="dialog"
        aria-label="Customer-facing preview"
        className="fixed right-0 top-0 flex h-full w-full max-w-[720px] flex-col"
        style={{
          background: "var(--surface-0)",
          borderLeft: "1px solid var(--border-default)",
          boxShadow: "var(--shadow-lg, -8px 0 24px rgb(0 0 0 / 0.25))",
          zIndex: "var(--z-modal, 900)" as unknown as number,
        }}
      >
        <header
          className="flex shrink-0 items-center justify-between gap-3 px-5 py-3"
          style={{ borderBottom: "1px solid var(--border-subtle)" }}
        >
          <div className="min-w-0">
            <div
              className="text-[11px] uppercase tracking-wide"
              style={{ color: "var(--text-muted)" }}
            >
              Preview — as customer sees it
            </div>
            <div className="truncate text-sm font-semibold">
              {p.tenantName} · {p.number}
            </div>
          </div>
          <Link
            href={closeHref}
            aria-label="Close preview"
            className="ts-focus shrink-0 rounded-md p-1.5"
            style={{ color: "var(--text-muted)" }}
          >
            <Icon.X size={16} />
          </Link>
        </header>

        <div className="flex-1 space-y-5 overflow-y-auto px-5 py-5">
          {content}
        </div>

        <footer
          className="flex shrink-0 items-center justify-between gap-2 px-5 py-3"
          style={{
            borderTop: "1px solid var(--border-subtle)",
            background: "var(--surface-1)",
          }}
        >
          <div className="text-xs" style={{ color: "var(--text-muted)" }}>
            This is a staff preview — the decide buttons are suppressed. The
            customer-facing share link shows the same view, plus Approve /
            Decline.
          </div>
          <Link
            href={closeHref}
            className="ts-focus rounded-md px-3 py-1.5 text-sm"
            style={{
              background: "var(--surface-2)",
              border: "1px solid var(--border-default)",
              color: "var(--text-default)",
            }}
          >
            Close
          </Link>
        </footer>
      </aside>
    </>
  );
}

function PreviewItemBlock({
  title,
  description,
  items,
  currency,
}: {
  title: string | null;
  description: string | null;
  items: QuotePortalPreviewItem[];
  currency: string;
}) {
  const nonOptional = items.filter((it) => !it.isOptional);
  const optional = items.filter((it) => it.isOptional);
  const sectionTotal = nonOptional.reduce((s, it) => s + it.subtotal, 0);
  return (
    <section
      className="rounded-md"
      style={{
        background: "var(--surface-0)",
        border: "1px solid var(--border-subtle)",
      }}
    >
      {title && (
        <header
          className="flex items-center justify-between gap-3 px-4 py-2.5"
          style={{
            background: "var(--surface-1)",
            borderBottom: "1px solid var(--border-subtle)",
          }}
        >
          <div className="min-w-0">
            <div className="text-sm font-semibold">{title}</div>
            {description && (
              <div
                className="text-xs"
                style={{ color: "var(--text-muted)" }}
              >
                {description}
              </div>
            )}
          </div>
          <div
            className="text-sm font-semibold tabular-nums"
            style={{ color: "var(--text-default)" }}
          >
            {formatMoney(sectionTotal, currency)}
          </div>
        </header>
      )}
      <ul>
        {items.map((it) => (
          <li
            key={it.id}
            className="flex items-start justify-between gap-3 px-4 py-3"
            style={{
              borderTop: title ? "none" : undefined,
              // Only draw a divider between rows inside a block.
              borderBottom: "1px solid var(--border-subtle)",
            }}
          >
            <div className="min-w-0 flex-1">
              <div
                className="flex flex-wrap items-center gap-1.5 text-sm font-medium"
                style={{ color: "var(--text-default)" }}
              >
                {it.name}
                {it.isOptional && (
                  <span
                    className="rounded-full px-1.5 py-0.5 text-[10px] font-medium"
                    style={{
                      background: "var(--accent-surface)",
                      color: "var(--accent-primary)",
                    }}
                  >
                    Optional
                  </span>
                )}
              </div>
              {it.description && (
                <div
                  className="mt-0.5 text-xs"
                  style={{ color: "var(--text-muted)" }}
                >
                  {it.description}
                </div>
              )}
              {it.optionSummary && (
                <div
                  className="mt-0.5 text-xs"
                  style={{ color: "var(--text-muted)" }}
                >
                  {it.optionSummary}
                </div>
              )}
            </div>
            <div
              className={
                "shrink-0 text-sm tabular-nums " +
                (it.isOptional ? "" : "font-semibold")
              }
              style={{
                color: it.isOptional
                  ? "var(--text-muted)"
                  : "var(--text-default)",
              }}
            >
              {formatMoney(it.subtotal, currency)}
            </div>
          </li>
        ))}
      </ul>
      {/* Trim the final row border so the block doesn't double-line up
          against its footer/siblings. */}
      <style>{`ul > li:last-child { border-bottom: 0 !important; }`}</style>
      {optional.length > 0 && nonOptional.length > 0 && (
        <div
          className="px-4 py-2 text-[11px]"
          style={{
            background: "var(--surface-1)",
            borderTop: "1px solid var(--border-subtle)",
            color: "var(--text-muted)",
          }}
          title="Optional rows aren't included in the section subtotal above."
        >
          Optional rows are listed in-line but excluded from the subtotal.
        </div>
      )}
    </section>
  );
}

function TotalRow({
  label,
  value,
  muted,
  bold,
}: {
  label: string;
  value: string;
  muted?: boolean;
  bold?: boolean;
}) {
  return (
    <div className="flex items-center justify-between py-0.5">
      <span
        style={{
          color: muted ? "var(--text-muted)" : "var(--text-default)",
        }}
      >
        {label}
      </span>
      <span className={bold ? "text-base font-semibold tabular-nums" : "tabular-nums"}>
        {value}
      </span>
    </div>
  );
}
