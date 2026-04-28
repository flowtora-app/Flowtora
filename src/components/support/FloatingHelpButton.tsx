"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

// Global "?" help button — fixed bottom-right, lives in the tenant
// layout so it's reachable from every workspace page.
//
// Click (or ⌘+Shift+H) → small popover with three actions:
//   • Report an issue       → /support/new with context pre-filled
//   • Ask a question        → /support/new with category=QUESTION
//   • Browse my tickets     → /support
//
// Closes on outside click / Escape. Doesn't render on the support
// pages themselves (would be redundant) or on onboarding.

const HIDDEN_PATTERNS = [
  /\/support($|\/)/,
  /\/onboarding($|\/)/,
];

export function FloatingHelpButton({ slug }: { slug: string }) {
  const pathname = usePathname();
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef<HTMLDivElement>(null);

  // Hide on support / onboarding routes — context is already obvious there.
  const hidden = HIDDEN_PATTERNS.some((re) => re.test(pathname));

  React.useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (!ref.current) return;
      if (ref.current.contains(e.target as Node)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  // Global keyboard shortcut. Picked ⌘+Shift+H so it doesn't collide
  // with the browser's command-history binding.
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === "h") {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  if (hidden) return null;

  // Build the deep-link with the current page captured. The new-ticket
  // form picks `from` out of the query and pre-fills the context block.
  const reportHref =
    `/t/${slug}/support/new?from=${encodeURIComponent(pathname)}&kind=BUG`;
  const askHref =
    `/t/${slug}/support/new?from=${encodeURIComponent(pathname)}&kind=QUESTION`;

  return (
    <div ref={ref} className="fixed bottom-5 right-5 z-50">
      {open && (
        <div
          role="menu"
          aria-label="Help & support"
          className="mb-2 w-72 overflow-hidden rounded-xl"
          style={{
            background: "var(--surface-2)",
            border: "1px solid var(--border-default)",
            boxShadow: "var(--shadow-lg)",
          }}
        >
          <div
            className="px-4 py-3"
            style={{ borderBottom: "1px solid var(--border-subtle)" }}
          >
            <div className="text-sm font-semibold" style={{ color: "var(--text-default)" }}>
              How can we help?
            </div>
            <div className="mt-0.5 text-xs" style={{ color: "var(--text-muted)" }}>
              We auto-capture this page so we can dig in faster.
            </div>
          </div>

          <MenuItem
            href={reportHref}
            icon="🐞"
            title="Report an issue"
            subtitle="Something's broken or behaving oddly"
            onClick={() => setOpen(false)}
          />
          <MenuItem
            href={askHref}
            icon="💬"
            title="Ask a question"
            subtitle="How-to or general help"
            onClick={() => setOpen(false)}
          />
          <MenuItem
            href={`/t/${slug}/support`}
            icon="📥"
            title="My tickets"
            subtitle="See everything you've sent"
            onClick={() => setOpen(false)}
            divider
          />

          <div
            className="flex items-center justify-between px-4 py-2 text-[10px] uppercase tracking-wide"
            style={{ background: "var(--surface-1)", color: "var(--text-faint)" }}
          >
            <span>shortcut</span>
            <kbd
              className="rounded px-1.5 py-0.5 font-mono"
              style={{ background: "var(--surface-2)", color: "var(--text-muted)", border: "1px solid var(--border-subtle)" }}
            >
              ⌘ + Shift + H
            </kbd>
          </div>
        </div>
      )}

      <button
        type="button"
        aria-label="Help"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="ts-focus inline-flex h-12 w-12 items-center justify-center rounded-full text-xl font-semibold transition-transform hover:scale-105"
        style={{
          background: "var(--accent-primary)",
          color: "var(--accent-fg)",
          boxShadow: "var(--shadow-lg)",
        }}
        title="Help — ⌘+Shift+H"
      >
        ?
      </button>
    </div>
  );
}

function MenuItem({
  href,
  icon,
  title,
  subtitle,
  onClick,
  divider,
}: {
  href: string;
  icon: string;
  title: string;
  subtitle: string;
  onClick?: () => void;
  divider?: boolean;
}) {
  return (
    <Link
      href={href}
      role="menuitem"
      onClick={onClick}
      className="flex items-start gap-3 px-4 py-3 transition-colors hover:opacity-90"
      style={{
        color: "var(--text-default)",
        borderTop: divider ? "1px solid var(--border-subtle)" : undefined,
      }}
    >
      <span className="text-base" aria-hidden>{icon}</span>
      <div className="min-w-0">
        <div className="text-sm font-medium">{title}</div>
        <div className="mt-0.5 text-xs" style={{ color: "var(--text-muted)" }}>
          {subtitle}
        </div>
      </div>
    </Link>
  );
}
