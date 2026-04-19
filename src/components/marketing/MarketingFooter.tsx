import * as React from "react";
import Link from "next/link";
import { NewsletterForm } from "./NewsletterForm";

// Phase 5 — MarketingFooter.
//
// Five-column footer with a brand/newsletter block and four link
// columns (Product, Industries, Company, Legal). Every link here
// points at a route that exists — a footer littered with 404s is a
// trust-destroyer on a sales page.
//
// Newsletter lives in the brand column so footer scan → CTA is a
// single glance. Feature parity with what a serious SaaS footer
// looks like in 2026 without overreaching (no language switcher, no
// app store badges, no sub-brand). We'll add a status page link
// when we have one.

const COLUMNS: { title: string; links: { label: string; href: string }[] }[] = [
  {
    title: "Product",
    links: [
      { label: "Features", href: "/features" },
      { label: "Pricing", href: "/pricing" },
      { label: "Changelog", href: "/changelog" },
      { label: "Book a demo", href: "/book-demo" },
    ],
  },
  {
    title: "Industries",
    links: [
      { label: "Sign shops", href: "/for-sign-shops" },
      { label: "Print shops", href: "/for-print-shops" },
    ],
  },
  {
    title: "Company",
    links: [
      { label: "About", href: "/about" },
      { label: "Contact", href: "/contact" },
      { label: "Security", href: "/security" },
    ],
  },
  {
    title: "Legal",
    links: [
      { label: "Privacy policy", href: "/legal/privacy" },
      { label: "Terms of service", href: "/legal/terms" },
    ],
  },
];

export function MarketingFooter() {
  const year = new Date().getFullYear();
  return (
    <footer
      className="mt-16"
      style={{ borderTop: "1px solid var(--border-subtle)", background: "var(--surface-1)" }}
    >
      <div className="mx-auto w-full max-w-6xl px-6 py-14">
        <div className="grid grid-cols-2 gap-10 md:grid-cols-6">
          {/* Brand + newsletter */}
          <div className="col-span-2 md:col-span-2">
            <div className="flex items-center gap-2">
              <span
                className="flex h-7 w-7 items-center justify-center rounded-md text-xs font-bold"
                style={{ background: "var(--accent-primary)", color: "var(--accent-fg)" }}
              >
                T
              </span>
              <span className="text-sm font-semibold" style={{ color: "var(--text-default)" }}>
                Flowtora
              </span>
            </div>
            <p className="mt-3 max-w-sm text-xs leading-relaxed" style={{ color: "var(--text-muted)" }}>
              The operating system for sign shops, print shops, and custom-fab studios.
              CRM, quoting, proofing, production, installs, and invoicing — one record,
              end to end.
            </p>
            <div className="mt-6">
              <div
                className="mb-3 text-[10px] font-semibold uppercase tracking-wider"
                style={{ color: "var(--text-faint)" }}
              >
                Get monthly updates
              </div>
              <NewsletterForm />
            </div>
          </div>

          {COLUMNS.map((col) => (
            <div key={col.title}>
              <div
                className="text-[10px] font-semibold uppercase tracking-wider"
                style={{ color: "var(--text-faint)" }}
              >
                {col.title}
              </div>
              <ul className="mt-3 space-y-2">
                {col.links.map((l) => (
                  <li key={l.href}>
                    <Link
                      href={l.href}
                      className="text-sm transition-colors hover:brightness-125"
                      style={{ color: "var(--text-muted)" }}
                    >
                      {l.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div
          className="mt-12 flex flex-col items-start justify-between gap-3 pt-6 text-xs md:flex-row md:items-center"
          style={{ borderTop: "1px solid var(--border-subtle)", color: "var(--text-faint)" }}
        >
          <span>© {year} Flowtora, Inc. All rights reserved.</span>
          <span>Built for shops that make real things.</span>
        </div>
      </div>
    </footer>
  );
}
