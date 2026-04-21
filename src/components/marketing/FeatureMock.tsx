import * as React from "react";

// FeatureMock — lightweight, label-driven screenshot mock used inside
// FeatureShowcase blocks. ProductMock (the hero mock) is a pixel-
// perfect quote detail. This one is deliberately more abstract: a
// titled card with a stylized body that evokes a specific screen
// without pretending to be a real screenshot.
//
// The goal is "the visual reads as a UI" at a glance — nothing more.
// When real screenshots are ready, swap this for an <img>.
//
// Three presets:
//   • "quote" — a quote builder with line items and a total
//   • "production" — a kanban board with 4 lanes of cards
//   • "invoice" — an invoice with line items and paid/due states
//
// All three share the same outer chrome (header + body) so the
// alternating L/R layout feels cohesive.

export type FeatureMockKind = "quote" | "production" | "invoice";

export function FeatureMock({
  kind,
  className,
}: {
  kind: FeatureMockKind;
  className?: string;
}) {
  return (
    <div
      className={className}
      style={{
        background: "var(--surface-1)",
        borderRadius: "var(--radius-2xl)",
        boxShadow:
          "0 0 0 1px var(--border-subtle), var(--shadow-lg), inset 0 1px 0 0 color-mix(in oklab, var(--text-default) 8%, transparent)",
        overflow: "hidden",
      }}
    >
      <Chrome title={titleFor(kind)} badge={badgeFor(kind)} />
      <div className="relative">
        {kind === "quote" && <QuoteBody />}
        {kind === "production" && <ProductionBody />}
        {kind === "invoice" && <InvoiceBody />}
      </div>
    </div>
  );
}

function titleFor(kind: FeatureMockKind) {
  return {
    quote: "Quote Q-1042 · Harbor Eats",
    production: "Production · This week",
    invoice: "Invoice INV-0287 · Harbor Eats",
  }[kind];
}

function badgeFor(kind: FeatureMockKind): { label: string; tone: "success" | "info" | "warning" } {
  return {
    quote: { label: "Sent for approval", tone: "info" as const },
    production: { label: "4 active", tone: "warning" as const },
    invoice: { label: "Paid", tone: "success" as const },
  }[kind];
}

function Chrome({
  title,
  badge,
}: {
  title: string;
  badge: { label: string; tone: "success" | "info" | "warning" };
}) {
  const tone =
    badge.tone === "success"
      ? { bg: "var(--success-surface)", fg: "var(--success-fg)" }
      : badge.tone === "info"
        ? { bg: "var(--info-surface)", fg: "var(--info-fg)" }
        : { bg: "var(--warning-surface)", fg: "var(--warning-fg)" };
  return (
    <>
      {/* Fake window chrome */}
      <div
        className="flex items-center gap-2 px-4 py-2.5"
        style={{
          borderBottom: "1px solid var(--border-subtle)",
          background:
            "color-mix(in oklab, var(--surface-1) 60%, var(--surface-0))",
        }}
      >
        <span className="h-2.5 w-2.5 rounded-full" style={{ background: "var(--danger)", opacity: 0.55 }} />
        <span className="h-2.5 w-2.5 rounded-full" style={{ background: "var(--warning)", opacity: 0.55 }} />
        <span className="h-2.5 w-2.5 rounded-full" style={{ background: "var(--success)", opacity: 0.55 }} />
      </div>
      {/* Record header */}
      <div
        className="flex items-center justify-between gap-3 px-5 py-3.5"
        style={{ borderBottom: "1px solid var(--border-subtle)" }}
      >
        <div className="min-w-0">
          <div className="text-[11px] uppercase tracking-wider" style={{ color: "var(--text-faint)" }}>
            Record
          </div>
          <div
            className="mt-0.5 truncate text-sm font-semibold"
            style={{ color: "var(--text-default)" }}
          >
            {title}
          </div>
        </div>
        <span
          className="flex-shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold"
          style={{ background: tone.bg, color: tone.fg }}
        >
          {badge.label}
        </span>
      </div>
    </>
  );
}

function QuoteBody() {
  return (
    <div className="grid grid-cols-1 gap-0 md:grid-cols-[1fr_180px]">
      <div className="p-5">
        <div className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: "var(--text-faint)" }}>
          Line items
        </div>
        <ul className="mt-3 space-y-2">
          <QuoteRow name="Storefront channel letters" detail="28 ft · white LED" amount="$5,920" />
          <QuoteRow name="Proof & artwork" detail="Round 2 · approved" amount="$380" />
          <QuoteRow name="Install crew + permit" detail="1 day · lift included" amount="$1,440" />
        </ul>
        <div
          className="mt-5 grid grid-cols-2 gap-3 rounded-md p-3 text-xs"
          style={{ background: "var(--surface-2)" }}
        >
          <div>
            <div style={{ color: "var(--text-faint)" }}>Subtotal</div>
            <div className="mt-0.5 text-sm" style={{ color: "var(--text-default)" }}>
              $7,740
            </div>
          </div>
          <div>
            <div style={{ color: "var(--text-faint)" }}>Total</div>
            <div className="mt-0.5 text-sm font-semibold" style={{ color: "var(--accent-primary)" }}>
              $8,417
            </div>
          </div>
        </div>
      </div>
      <aside
        className="p-5"
        style={{
          borderLeft: "1px solid var(--border-subtle)",
          background: "var(--surface-2)",
        }}
      >
        <div className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: "var(--text-faint)" }}>
          Activity
        </div>
        <ul className="mt-3 space-y-2 text-xs" style={{ color: "var(--text-muted)" }}>
          <li>Proof sent · Mon</li>
          <li>Round 1 feedback · Tue</li>
          <li>Proof approved · Wed</li>
          <li style={{ color: "var(--accent-primary)" }}>Awaiting deposit</li>
        </ul>
      </aside>
    </div>
  );
}

function QuoteRow({ name, detail, amount }: { name: string; detail: string; amount: string }) {
  return (
    <li
      className="flex items-start justify-between gap-3 rounded-md p-2.5"
      style={{ background: "var(--surface-2)" }}
    >
      <div>
        <div className="text-xs font-medium" style={{ color: "var(--text-default)" }}>
          {name}
        </div>
        <div className="mt-0.5 text-[11px]" style={{ color: "var(--text-muted)" }}>
          {detail}
        </div>
      </div>
      <div className="text-xs font-medium" style={{ color: "var(--text-default)" }}>
        {amount}
      </div>
    </li>
  );
}

function ProductionBody() {
  const lanes: { title: string; tone: "info" | "warning" | "success" | "accent"; jobs: string[] }[] = [
    { title: "Queue", tone: "info", jobs: ["Harbor Eats · ID sign", "Sunrise Bakery · menu"] },
    { title: "Print / cut", tone: "warning", jobs: ["Maker Co · banners"] },
    { title: "Finishing", tone: "accent", jobs: ["Reef Dental · window", "Arbor Yoga · floor"] },
    { title: "Ready to ship", tone: "success", jobs: ["Field Roast · POS"] },
  ];
  return (
    <div className="grid grid-cols-2 gap-3 p-4 md:grid-cols-4">
      {lanes.map((lane, i) => (
        <Lane key={i} title={lane.title} tone={lane.tone} jobs={lane.jobs} />
      ))}
    </div>
  );
}

function Lane({
  title,
  tone,
  jobs,
}: {
  title: string;
  tone: "info" | "warning" | "success" | "accent";
  jobs: string[];
}) {
  const toneColor =
    tone === "info"
      ? "var(--info-fg)"
      : tone === "warning"
        ? "var(--warning-fg)"
        : tone === "success"
          ? "var(--success-fg)"
          : "var(--accent-primary)";
  return (
    <div
      className="rounded-md p-2.5"
      style={{ background: "var(--surface-2)" }}
    >
      <div className="mb-2 flex items-center gap-1.5">
        <span
          className="inline-block h-1.5 w-1.5 rounded-full"
          style={{ background: toneColor }}
        />
        <span className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>
          {title}
        </span>
      </div>
      <div className="space-y-1.5">
        {jobs.map((j, i) => (
          <div
            key={i}
            className="rounded px-2 py-1.5 text-[11px]"
            style={{
              background: "var(--surface-1)",
              border: "1px solid var(--border-subtle)",
              color: "var(--text-default)",
            }}
          >
            {j}
          </div>
        ))}
      </div>
    </div>
  );
}

function InvoiceBody() {
  return (
    <div className="p-5">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <div className="text-[11px] uppercase tracking-wider" style={{ color: "var(--text-faint)" }}>
            Billed to
          </div>
          <div className="mt-0.5 text-sm font-medium" style={{ color: "var(--text-default)" }}>
            Harbor Eats
          </div>
          <div className="text-[11px]" style={{ color: "var(--text-muted)" }}>
            ap@harborgrp.com
          </div>
        </div>
        <div className="text-right">
          <div className="text-[11px] uppercase tracking-wider" style={{ color: "var(--text-faint)" }}>
            Amount
          </div>
          <div className="mt-0.5 text-base font-semibold" style={{ color: "var(--accent-primary)" }}>
            $8,417.00
          </div>
          <div className="text-[11px]" style={{ color: "var(--success-fg)" }}>
            Paid Apr 18
          </div>
        </div>
      </div>

      <ul className="mt-4 space-y-1.5">
        <InvoiceRow label="Deposit (50%)" meta="Apr 02 · Card" amount="$4,208.50" paid />
        <InvoiceRow label="Balance (50%)" meta="Apr 18 · ACH" amount="$4,208.50" paid />
      </ul>

      <div
        className="mt-4 flex items-center justify-between rounded-md px-3 py-2 text-xs"
        style={{ background: "var(--success-surface)", color: "var(--success-fg)" }}
      >
        <span className="font-semibold">All payments reconciled</span>
        <span>2 of 2</span>
      </div>
    </div>
  );
}

function InvoiceRow({
  label,
  meta,
  amount,
  paid,
}: {
  label: string;
  meta: string;
  amount: string;
  paid?: boolean;
}) {
  return (
    <li
      className="flex items-center justify-between gap-3 rounded-md p-2.5"
      style={{ background: "var(--surface-2)" }}
    >
      <div>
        <div className="text-xs font-medium" style={{ color: "var(--text-default)" }}>
          {label}
        </div>
        <div className="mt-0.5 text-[11px]" style={{ color: "var(--text-muted)" }}>
          {meta}
        </div>
      </div>
      <div className="flex items-center gap-2">
        {paid && (
          <span
            className="rounded-full px-2 py-0.5 text-[10px] font-semibold"
            style={{
              background: "var(--success-surface)",
              color: "var(--success-fg)",
            }}
          >
            Paid
          </span>
        )}
        <div className="text-xs font-medium" style={{ color: "var(--text-default)" }}>
          {amount}
        </div>
      </div>
    </li>
  );
}
