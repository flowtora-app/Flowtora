import * as React from "react";

// ProductMock — a hand-drawn SVG/HTML mock of a Flowtora screen.
//
// We don't have a real production screenshot pipeline yet, and stock
// SaaS dashboard stock imagery reads as generic. So this is a
// deliberately-stylized but *accurate* mock of a quote detail view —
// the same layout a real Flowtora user actually sees — built with
// div + text rather than an image so it scales crisp at every
// breakpoint and stays in our dark token palette.
//
// If/when we add real product screenshots, swap this component's
// implementation without touching any caller.

export function ProductMock({ className }: { className?: string }) {
  return (
    <div
      className={className}
      style={{
        background: "var(--surface-1)",
        border: "1px solid var(--border-subtle)",
        borderRadius: "14px",
        boxShadow: "0 24px 60px rgba(0, 0, 0, 0.35)",
        overflow: "hidden",
      }}
    >
      {/* Mock title bar */}
      <div
        className="flex items-center gap-2 px-4 py-3"
        style={{ borderBottom: "1px solid var(--border-subtle)", background: "var(--surface-2)" }}
      >
        <span className="h-2.5 w-2.5 rounded-full" style={{ background: "#ff5f57" }} />
        <span className="h-2.5 w-2.5 rounded-full" style={{ background: "#febc2e" }} />
        <span className="h-2.5 w-2.5 rounded-full" style={{ background: "#28c840" }} />
        <div
          className="ml-3 flex h-6 flex-1 items-center rounded-md px-3 text-xs"
          style={{ background: "var(--surface-0)", color: "var(--text-faint)" }}
        >
          flowtora.app/t/signshop/quotes/Q-1087
        </div>
      </div>

      {/* Sub-header — record breadcrumb + status */}
      <div
        className="flex items-center justify-between px-6 py-4"
        style={{ borderBottom: "1px solid var(--border-subtle)" }}
      >
        <div>
          <div className="text-xs" style={{ color: "var(--text-muted)" }}>
            Quotes / Q-1087
          </div>
          <div className="mt-0.5 text-base font-semibold" style={{ color: "var(--text-default)" }}>
            Harbor Eats · Storefront ID sign
          </div>
        </div>
        <span
          className="rounded-full px-3 py-1 text-xs font-semibold"
          style={{ background: "var(--success-surface)", color: "var(--success-fg)" }}
        >
          Approved
        </span>
      </div>

      {/* Body */}
      <div className="grid grid-cols-1 gap-0 md:grid-cols-[1fr_220px]">
        <div className="p-6">
          <div className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--text-faint)" }}>
            Line items
          </div>
          <ul className="mt-3 space-y-2">
            <LineItem name="Front-lit channel letters" detail="23 linear ft · Acrylic face · White LED" amount="$4,850.00" />
            <LineItem name="Aluminum backer" detail="4×8 ft · Powder-coated black" amount="$620.00" />
            <LineItem name="Install + permit" detail="Crew of 2 · Scissor lift · City permit included" amount="$1,200.00" />
          </ul>

          <div
            className="mt-6 grid grid-cols-3 gap-3 rounded-md p-4 text-xs"
            style={{ background: "var(--surface-2)", color: "var(--text-muted)" }}
          >
            <div>
              <div style={{ color: "var(--text-faint)" }}>Subtotal</div>
              <div className="mt-0.5 text-sm" style={{ color: "var(--text-default)" }}>
                $6,670.00
              </div>
            </div>
            <div>
              <div style={{ color: "var(--text-faint)" }}>Tax (8.75%)</div>
              <div className="mt-0.5 text-sm" style={{ color: "var(--text-default)" }}>
                $583.63
              </div>
            </div>
            <div>
              <div style={{ color: "var(--text-faint)" }}>Total</div>
              <div className="mt-0.5 text-sm font-semibold" style={{ color: "var(--accent-primary)" }}>
                $7,253.63
              </div>
            </div>
          </div>
        </div>

        <aside
          className="p-6"
          style={{ borderLeft: "1px solid var(--border-subtle)", background: "var(--surface-2)" }}
        >
          <div className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--text-faint)" }}>
            Next steps
          </div>
          <ul className="mt-3 space-y-3 text-sm">
            <NextStep done label="Quote approved" meta="Today, 9:41am" />
            <NextStep label="Collect 50% deposit" meta="$3,626.82 due" />
            <NextStep label="Start production" meta="Flatbed queue" />
            <NextStep label="Schedule install" meta="Crew A, 1 day" />
          </ul>

          <button
            className="mt-5 w-full rounded-md px-3 py-2 text-xs font-semibold"
            style={{ background: "var(--accent-primary)", color: "var(--accent-fg)" }}
          >
            Convert to order
          </button>
        </aside>
      </div>
    </div>
  );
}

function LineItem({ name, detail, amount }: { name: string; detail: string; amount: string }) {
  return (
    <li
      className="flex items-start justify-between gap-4 rounded-md p-3"
      style={{ background: "var(--surface-2)" }}
    >
      <div>
        <div className="text-sm font-medium" style={{ color: "var(--text-default)" }}>
          {name}
        </div>
        <div className="mt-0.5 text-xs" style={{ color: "var(--text-muted)" }}>
          {detail}
        </div>
      </div>
      <div className="text-sm font-medium" style={{ color: "var(--text-default)" }}>
        {amount}
      </div>
    </li>
  );
}

function NextStep({ label, meta, done }: { label: string; meta: string; done?: boolean }) {
  return (
    <li className="flex items-start gap-3">
      <span
        className="mt-0.5 flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-full text-[9px] font-bold"
        style={{
          background: done ? "var(--success-fg)" : "var(--surface-0)",
          color: done ? "var(--accent-fg)" : "var(--text-faint)",
          border: done ? "none" : "1px solid var(--border-default)",
        }}
      >
        {done ? "✓" : ""}
      </span>
      <div className="min-w-0">
        <div
          className="text-xs font-medium"
          style={{
            color: done ? "var(--text-muted)" : "var(--text-default)",
            textDecoration: done ? "line-through" : "none",
          }}
        >
          {label}
        </div>
        <div className="mt-0.5 text-[11px]" style={{ color: "var(--text-faint)" }}>
          {meta}
        </div>
      </div>
    </li>
  );
}
