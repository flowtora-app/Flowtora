"use client";

import * as React from "react";
import Link from "next/link";
import {
  getQuotePreview,
  type QuotePreviewPayload,
} from "@/app/actions/quotes";
import { Icon } from "@/components/shell/icons";

// QuotePreviewDrawer — right-side panel that opens when a quote row is
// clicked on the list page. Shows number, status, customer, line items
// grouped by section, totals, and shortcuts to the full detail page and
// customer record.
//
// Loads lazily. We don't hydrate every visible quote's line items into
// the list query — the list can show 200 rows and that'd balloon the
// payload for a feature most users will trigger zero or one time per
// page view. Instead, when the drawer opens for a specific quote we
// call `getQuotePreview` and cache the result by quote id for the rest
// of the session; re-opening the same drawer is instant.
//
// Why inline instead of reaching for the shared Dialog primitive:
// Dialog uses native <dialog> + showModal(), which centers and makes
// the background inert. A drawer needs to sit over the right edge of
// the page without a full-screen modal feel, while still dimming the
// rest of the list via a click-catching overlay. That's a different
// visual contract, so it gets its own wrapper.

export interface QuotePreviewDrawerProps {
  slug: string;
  /** Quote to show; null closes the drawer. */
  quoteId: string | null;
  /** Header info we already have from the list row — rendered instantly
      so the drawer feels responsive while the full preview loads. */
  header: {
    number: string;
    statusLabel: string;
    statusColor: string;
    customerName: string;
    total: string;
  } | null;
  onClose: () => void;
  canEdit: boolean;
}

type LoadState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "ready"; data: QuotePreviewPayload }
  | { kind: "missing" }
  | { kind: "error"; message: string };

export function QuotePreviewDrawer({
  slug,
  quoteId,
  header,
  onClose,
  canEdit,
}: QuotePreviewDrawerProps) {
  const [state, setState] = React.useState<LoadState>({ kind: "idle" });
  // Simple in-component cache: reopening the same quote skips the round trip.
  const cacheRef = React.useRef<Map<string, QuotePreviewPayload>>(new Map());

  // Load whenever quoteId changes while the drawer is mounted open.
  React.useEffect(() => {
    if (!quoteId) {
      setState({ kind: "idle" });
      return;
    }
    const cached = cacheRef.current.get(quoteId);
    if (cached) {
      setState({ kind: "ready", data: cached });
      return;
    }
    let cancelled = false;
    setState({ kind: "loading" });
    (async () => {
      try {
        const data = await getQuotePreview(slug, quoteId);
        if (cancelled) return;
        if (!data) {
          setState({ kind: "missing" });
          return;
        }
        cacheRef.current.set(quoteId, data);
        setState({ kind: "ready", data });
      } catch (err) {
        if (cancelled) return;
        console.error("[QuotePreviewDrawer] load failed:", err);
        setState({
          kind: "error",
          message: "Couldn't load this quote. Try again.",
        });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [quoteId, slug]);

  // ESC closes the drawer; mirror the browser back-button feel.
  React.useEffect(() => {
    if (!quoteId) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [quoteId, onClose]);

  const open = !!quoteId;

  return (
    <>
      {/* Click-catching overlay. Keeps the list underneath visible (as a
          "preview" should) but dims it so the drawer has visual priority. */}
      <div
        aria-hidden={!open}
        onClick={onClose}
        className="fixed inset-0 transition-opacity"
        style={{
          background: "rgba(0,0,0,0.35)",
          opacity: open ? 1 : 0,
          pointerEvents: open ? "auto" : "none",
          zIndex: "var(--z-overlay)",
        }}
      />
      <aside
        role="dialog"
        aria-modal="true"
        aria-label="Quote preview"
        aria-hidden={!open}
        className="fixed right-0 top-0 flex h-dvh w-full flex-col transition-transform sm:max-w-[560px]"
        style={{
          background: "var(--surface-1)",
          borderLeft: "1px solid var(--border-default)",
          boxShadow: "var(--shadow-lg)",
          transform: open ? "translateX(0)" : "translateX(100%)",
          zIndex: "var(--z-modal)",
        }}
      >
        {open && header && (
          <DrawerContent
            slug={slug}
            quoteId={quoteId!}
            header={header}
            state={state}
            onClose={onClose}
            canEdit={canEdit}
          />
        )}
      </aside>
    </>
  );
}

function DrawerContent({
  slug,
  quoteId,
  header,
  state,
  onClose,
  canEdit,
}: {
  slug: string;
  quoteId: string;
  header: NonNullable<QuotePreviewDrawerProps["header"]>;
  state: LoadState;
  onClose: () => void;
  canEdit: boolean;
}) {
  return (
    <>
      {/* Header band — mirrors the row you clicked so the drawer feels
          like an inline expansion, not a disconnected modal. */}
      <div
        className="flex items-start justify-between gap-3 px-5 py-4"
        style={{ borderBottom: "1px solid var(--border-subtle)" }}
      >
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span
              className="text-base font-semibold"
              style={{ color: "var(--text-default)" }}
            >
              {header.number}
            </span>
            <span
              className="rounded-full px-2 py-0.5 text-[11px]"
              style={{ background: header.statusColor, color: "white" }}
            >
              {header.statusLabel}
            </span>
          </div>
          <p
            className="mt-0.5 truncate text-sm"
            style={{ color: "var(--text-muted)" }}
          >
            {header.customerName}
          </p>
        </div>
        <div className="flex items-center gap-1">
          <Link
            href={`/t/${slug}/quotes/${quoteId}`}
            className="ts-focus inline-flex items-center gap-1 rounded-md px-2.5 py-1.5 text-xs font-medium"
            style={{
              background: "var(--accent-primary)",
              color: "var(--accent-fg)",
            }}
          >
            {canEdit ? "Open" : "View"}
            <Icon.ArrowRight size={12} />
          </Link>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close preview"
            className="ts-focus inline-flex h-7 w-7 items-center justify-center rounded-md"
            style={{ color: "var(--text-muted)" }}
          >
            <Icon.X size={14} />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-5 py-4">
        {state.kind === "loading" || state.kind === "idle" ? (
          <PreviewSkeleton fallbackTotal={header.total} />
        ) : state.kind === "missing" ? (
          <MissingState />
        ) : state.kind === "error" ? (
          <ErrorState message={state.message} />
        ) : (
          <PreviewBody data={state.data} />
        )}
      </div>
    </>
  );
}

function PreviewBody({ data }: { data: QuotePreviewPayload }) {
  return (
    <div className="space-y-5 text-sm">
      <MetaRow data={data} />

      {data.sections.length === 0 ? (
        <div
          className="rounded-lg px-4 py-8 text-center text-xs"
          style={{
            background: "var(--surface-0)",
            border: "1px dashed var(--border-subtle)",
            color: "var(--text-muted)",
          }}
        >
          No line items yet.
        </div>
      ) : (
        data.sections.map((section, idx) => (
          <div key={section.id ?? `ungrouped-${idx}`} className="space-y-2">
            {section.title && (
              <div>
                <h3
                  className="text-xs font-semibold uppercase tracking-wider"
                  style={{ color: "var(--text-muted)" }}
                >
                  {section.title}
                </h3>
                {section.description && (
                  <p
                    className="mt-0.5 text-xs"
                    style={{ color: "var(--text-faint)" }}
                  >
                    {section.description}
                  </p>
                )}
              </div>
            )}
            <ul
              className="divide-y overflow-hidden rounded-lg"
              style={{
                background: "var(--surface-0)",
                border: "1px solid var(--border-subtle)",
                borderColor: "var(--border-subtle)",
              }}
            >
              {section.items.map((item) => (
                <li
                  key={item.id}
                  className="flex items-start justify-between gap-3 px-3 py-2.5"
                  style={{ borderColor: "var(--border-subtle)" }}
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span
                        className="truncate font-medium"
                        style={{ color: "var(--text-default)" }}
                      >
                        {item.name}
                      </span>
                      {item.isOptional && (
                        <span
                          className="rounded-full px-1.5 py-0.5 text-[10px]"
                          style={{
                            background: "var(--surface-2)",
                            border: "1px solid var(--border-subtle)",
                            color: "var(--text-muted)",
                          }}
                        >
                          Optional
                        </span>
                      )}
                    </div>
                    <p
                      className="mt-0.5 truncate text-xs"
                      style={{ color: "var(--text-faint)" }}
                    >
                      {item.inputsLabel
                        ? `${item.inputsLabel} · ${item.pricingModelLabel}`
                        : item.pricingModelLabel}
                    </p>
                    {item.description && (
                      <p
                        className="mt-1 text-xs"
                        style={{ color: "var(--text-muted)" }}
                      >
                        {item.description}
                      </p>
                    )}
                  </div>
                  <span
                    className="shrink-0 text-sm tabular-nums"
                    style={{
                      color: item.isOptional
                        ? "var(--text-muted)"
                        : "var(--text-default)",
                    }}
                  >
                    {item.subtotal}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ))
      )}

      <TotalsBlock data={data} />

      {(data.customerNote || data.notes) && (
        <div className="space-y-3">
          {data.customerNote && (
            <NoteBlock
              label="Note to customer"
              body={data.customerNote}
              tone="customer"
            />
          )}
          {data.notes && (
            <NoteBlock
              label="Internal note"
              body={data.notes}
              tone="internal"
            />
          )}
        </div>
      )}
    </div>
  );
}

function MetaRow({ data }: { data: QuotePreviewPayload }) {
  const items: Array<{ label: string; value: string }> = [];
  if (data.sentLabel) items.push({ label: "Sent", value: data.sentLabel });
  if (data.expiresLabel)
    items.push({ label: "Expires", value: data.expiresLabel });
  if (items.length === 0) return null;
  return (
    <dl
      className="grid grid-cols-2 gap-3 rounded-lg px-3 py-2.5 text-xs"
      style={{
        background: "var(--surface-0)",
        border: "1px solid var(--border-subtle)",
      }}
    >
      {items.map((it) => (
        <div key={it.label}>
          <dt style={{ color: "var(--text-faint)" }}>{it.label}</dt>
          <dd
            className="mt-0.5"
            style={{ color: "var(--text-default)" }}
          >
            {it.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}

function TotalsBlock({ data }: { data: QuotePreviewPayload }) {
  return (
    <div
      className="rounded-lg px-3 py-3"
      style={{
        background: "var(--surface-0)",
        border: "1px solid var(--border-subtle)",
      }}
    >
      <TotalsRow label="Subtotal" value={data.totals.subtotal} />
      {data.totals.discount && (
        <TotalsRow label="Discount" value={data.totals.discount} />
      )}
      <TotalsRow
        label={`Tax (${data.totals.taxRatePercent}%)`}
        value={data.totals.tax}
      />
      <div
        className="mt-2 flex items-center justify-between pt-2 text-sm"
        style={{ borderTop: "1px solid var(--border-subtle)" }}
      >
        <span
          className="font-semibold"
          style={{ color: "var(--text-default)" }}
        >
          Total
        </span>
        <span
          className="font-semibold tabular-nums"
          style={{ color: "var(--text-default)" }}
        >
          {data.totals.total}
        </span>
      </div>
      {data.totals.deposit && (
        <TotalsRow
          label="Deposit required"
          value={data.totals.deposit}
          subtle
        />
      )}
      {data.totals.optionalSubtotal && (
        <TotalsRow
          label="Optional add-ons"
          value={data.totals.optionalSubtotal}
          subtle
        />
      )}
    </div>
  );
}

function TotalsRow({
  label,
  value,
  subtle,
}: {
  label: string;
  value: string;
  subtle?: boolean;
}) {
  return (
    <div
      className="flex items-center justify-between py-0.5 text-xs"
      style={{
        color: subtle ? "var(--text-muted)" : "var(--text-default)",
      }}
    >
      <span>{label}</span>
      <span className="tabular-nums">{value}</span>
    </div>
  );
}

function NoteBlock({
  label,
  body,
  tone,
}: {
  label: string;
  body: string;
  tone: "customer" | "internal";
}) {
  return (
    <div
      className="rounded-lg px-3 py-2.5 text-xs"
      style={{
        background:
          tone === "customer" ? "var(--accent-surface)" : "var(--surface-0)",
        border: `1px solid ${
          tone === "customer"
            ? "var(--accent-primary)"
            : "var(--border-subtle)"
        }`,
        color: "var(--text-default)",
      }}
    >
      <div
        className="mb-1 text-[10px] font-semibold uppercase tracking-wider"
        style={{
          color:
            tone === "customer"
              ? "var(--accent-primary)"
              : "var(--text-faint)",
        }}
      >
        {label}
      </div>
      <p style={{ whiteSpace: "pre-wrap" }}>{body}</p>
    </div>
  );
}

function PreviewSkeleton({ fallbackTotal }: { fallbackTotal: string }) {
  return (
    <div className="space-y-4">
      <div
        className="h-14 animate-pulse rounded-lg"
        style={{
          background: "var(--surface-0)",
          border: "1px solid var(--border-subtle)",
        }}
      />
      <div className="space-y-2">
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className="h-16 animate-pulse rounded-lg"
            style={{
              background: "var(--surface-0)",
              border: "1px solid var(--border-subtle)",
            }}
          />
        ))}
      </div>
      {/* Keep the total we already know visible so the user has at least
          one confirmed number while line items stream in. */}
      <div
        className="flex items-center justify-between rounded-lg px-3 py-3 text-sm"
        style={{
          background: "var(--surface-0)",
          border: "1px solid var(--border-subtle)",
        }}
      >
        <span style={{ color: "var(--text-muted)" }}>Total</span>
        <span
          className="font-semibold tabular-nums"
          style={{ color: "var(--text-default)" }}
        >
          {fallbackTotal}
        </span>
      </div>
    </div>
  );
}

function MissingState() {
  return (
    <div
      className="rounded-lg px-4 py-10 text-center text-xs"
      style={{
        background: "var(--surface-0)",
        border: "1px dashed var(--border-subtle)",
        color: "var(--text-muted)",
      }}
    >
      This quote is no longer available. It may have been deleted or moved
      out of your branch scope.
    </div>
  );
}

function ErrorState({ message }: { message: string }) {
  return (
    <div
      className="rounded-lg px-4 py-8 text-center text-xs"
      style={{
        background: "var(--surface-0)",
        border: "1px solid var(--danger-fg)",
        color: "var(--danger-fg)",
      }}
    >
      {message}
    </div>
  );
}
