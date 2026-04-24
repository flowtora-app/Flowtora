import * as React from "react";

// Phase 3 (transformation) — single-scroll customer detail frame.
//
// Replaces the old 7-tab layout. Read top-to-bottom the page now tells
// one story:
//
//   1. Breadcrumb                              ← `breadcrumb`
//   2. Banners (lost-reason, errors)           ← `banners`
//   3. Sticky status row (name/stage/health/   ← `statusRow`
//      owner/value/primary CTA)
//   4. Guided next-action + stage-change       ← `guidance`
//   5. Two-column body:
//      • Left rail (contact, contacts,         ← `leftRail`
//        addresses, tags, files summary)
//      • Center stack (timeline, work,         ← `children`
//        tasks, portal link mgmt, etc.)
//
// Each section in `children` should carry its own anchor id (#overview,
// #activity, #work, #files). The shell doesn't enforce ordering beyond
// the vertical stack — the page decides what "overview" means per tenant.
//
// The left rail is sticky on lg+ screens so the contact/address info
// stays visible while the reader scrolls through the timeline. On
// smaller screens it collapses to the top of the column stack.

export type CustomerDetailShellProps = {
  breadcrumb:  React.ReactNode;
  banners?:    React.ReactNode;
  statusRow:   React.ReactNode;
  guidance?:   React.ReactNode;
  leftRail:    React.ReactNode;
  children:    React.ReactNode;
};

export function CustomerDetailShell({
  breadcrumb,
  banners,
  statusRow,
  guidance,
  leftRail,
  children,
}: CustomerDetailShellProps) {
  return (
    <div className="space-y-5">
      {breadcrumb}
      {banners}
      {statusRow}
      {guidance}

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[320px_minmax(0,1fr)]">
        <aside className="space-y-4 lg:sticky lg:top-[92px] lg:self-start">
          {leftRail}
        </aside>
        <div className="space-y-6 min-w-0">{children}</div>
      </div>
    </div>
  );
}

// ─── Section helper ───────────────────────────────────────────────
//
// Anchorable section header. Pages use it to stamp `#overview`,
// `#activity`, `#work`, `#files` targets on the page. The anchor sits
// above the visible heading by the height of the sticky status row so
// clicking a nav link doesn't hide the heading behind the sticky bar.

export function DetailSection({
  id,
  title,
  description,
  right,
  children,
}: {
  id:           string;
  title:        string;
  description?: string;
  right?:       React.ReactNode;
  children:     React.ReactNode;
}) {
  return (
    <section className="space-y-3">
      {/* Scroll offset anchor: a zero-size element 92px above the
          heading so fragment navigation clears the sticky status row. */}
      <span id={id} aria-hidden className="block" style={{ scrollMarginTop: 92 }} />
      <header className="flex items-end justify-between gap-4">
        <div>
          <h2
            className="text-xs font-semibold uppercase tracking-wider"
            style={{ color: "var(--text-faint)" }}
          >
            {title}
          </h2>
          {description && (
            <p className="mt-0.5 text-sm" style={{ color: "var(--muted)" }}>
              {description}
            </p>
          )}
        </div>
        {right && <div className="shrink-0">{right}</div>}
      </header>
      <div>{children}</div>
    </section>
  );
}

// ─── Section-nav chip row ─────────────────────────────────────────
//
// Lightweight anchor-link row for the four main sections. Renders
// under the status row on pages that opt-in — helps the reader jump
// without scrolling, and substitutes for the old tab bar without
// reintroducing mode-switching.

export type SectionAnchor = { id: string; label: string; count?: number };

export function SectionNav({ anchors }: { anchors: SectionAnchor[] }) {
  return (
    <nav
      aria-label="Sections"
      className="flex flex-wrap items-center gap-2 rounded-md px-3 py-2"
      style={{ background: "var(--panel)", border: "1px solid var(--border)" }}
    >
      {anchors.map((a) => (
        <a
          key={a.id}
          href={`#${a.id}`}
          className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs"
          style={{ background: "var(--surface-2)", color: "var(--text)" }}
        >
          {a.label}
          {typeof a.count === "number" && (
            <span className="tabular-nums" style={{ color: "var(--muted)" }}>
              {a.count}
            </span>
          )}
        </a>
      ))}
    </nav>
  );
}
