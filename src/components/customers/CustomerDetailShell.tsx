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
        <div className="flex min-w-0 items-center gap-2">
          {/* Accent indicator — matches the sidebar section header dot. */}
          <span
            aria-hidden
            style={{
              width: 4,
              height: 4,
              borderRadius: 1,
              background: "var(--accent-primary)",
              flexShrink: 0,
            }}
          />
          <h2
            style={{
              color: "var(--text-default)",
              fontSize: 11,
              fontWeight: 700,
              textTransform: "uppercase",
              letterSpacing: "0.1em",
              lineHeight: 1.2,
            }}
          >
            {title}
          </h2>
          {description && (
            <span
              style={{
                color: "var(--text-muted)",
                fontSize: 12,
                fontWeight: 500,
              }}
            >
              {description}
            </span>
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
// Premium anchor-link row for the main sections. Renders under the
// status row on pages that opt-in — helps the reader jump without
// scrolling, and substitutes for the old tab bar without reintroducing
// mode-switching.

export type SectionAnchor = { id: string; label: string; count?: number };

export function SectionNav({ anchors }: { anchors: SectionAnchor[] }) {
  return (
    <nav
      aria-label="Sections"
      className="flex flex-wrap items-center gap-1.5"
      style={{
        padding: "8px 12px",
        background:
          "linear-gradient(180deg, color-mix(in oklab, var(--surface-1) 60%, transparent) 0%, transparent 100%)",
        border: "1px solid var(--border-subtle)",
        borderRadius: 10,
      }}
    >
      {anchors.map((a) => (
        <a
          key={a.id}
          href={`#${a.id}`}
          className="ts-focus inline-flex items-center gap-1.5 transition-colors"
          style={{
            padding: "5px 11px",
            background: "color-mix(in oklab, var(--surface-2) 60%, transparent)",
            border: "1px solid var(--border-subtle)",
            color: "var(--text-muted)",
            fontSize: 11.5,
            fontWeight: 600,
            letterSpacing: "-0.005em",
            borderRadius: 999,
            lineHeight: 1.2,
          }}
        >
          {a.label}
          {typeof a.count === "number" && (
            <span
              style={{
                color: "var(--accent-primary)",
                background: "var(--accent-surface)",
                border:
                  "1px solid color-mix(in oklab, var(--accent-primary) 22%, transparent)",
                fontSize: 10,
                fontWeight: 700,
                padding: "1px 5px",
                borderRadius: 4,
                fontFeatureSettings: "'tnum' 1",
                marginLeft: 2,
                lineHeight: 1,
              }}
            >
              {a.count}
            </span>
          )}
        </a>
      ))}
    </nav>
  );
}
