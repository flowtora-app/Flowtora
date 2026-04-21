import * as React from "react";
import Link from "next/link";
import { NewsletterForm } from "./NewsletterForm";
import { Logomark } from "@/components/brand/BrandMark";
import { MarketingThemeToggle } from "./MarketingThemeToggle";

// Phase 8 — MarketingFooter.
//
// 4-col grid: Product · Solutions · Company · Newsletter. The
// newsletter lives in its own column (not jammed into the brand
// block) so the form gets the width it needs to breathe on desktop.
//
// Bottom bar: brand lockup (logomark + wordmark) + copyright on the
// left, socials + theme toggle on the right. A second theme toggle
// down here mirrors a common premium-SaaS pattern — the user who
// scrolls past the hero no longer has the header toggle in view, so
// they should find one where their eye already is.
//
// Every link here is verified against the routes that actually exist
// in /app — a footer littered with 404s is a trust-destroyer.

const COLUMNS: { title: string; links: { label: string; href: string }[] }[] = [
  {
    title: "Product",
    links: [
      { label: "Features", href: "/features" },
      { label: "Pricing", href: "/pricing" },
      { label: "Changelog", href: "/changelog" },
      { label: "Security", href: "/security" },
    ],
  },
  {
    title: "Solutions",
    links: [
      { label: "For sign shops", href: "/for-sign-shops" },
      { label: "For print shops", href: "/for-print-shops" },
      { label: "Book a demo", href: "/book-demo" },
    ],
  },
  {
    title: "Company",
    links: [
      { label: "About", href: "/about" },
      { label: "Contact", href: "/contact" },
      { label: "Privacy", href: "/legal/privacy" },
      { label: "Terms", href: "/legal/terms" },
    ],
  },
];

// Placeholder social handles — swap to real URLs when the accounts
// are live. Using routes that don't exist yet would break the "never
// link to 404s" rule, so these currently point at the homepage
// fragment with a note; when handles land, flip them to the real URLs.
const SOCIALS: { label: string; href: string; icon: React.ReactNode }[] = [
  {
    label: "X / Twitter",
    href: "https://x.com/flowtora",
    icon: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
        <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
      </svg>
    ),
  },
  {
    label: "LinkedIn",
    href: "https://www.linkedin.com/company/flowtora",
    icon: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
        <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 0 1-2.063-2.065 2.063 2.063 0 1 1 2.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
      </svg>
    ),
  },
  {
    label: "GitHub",
    href: "https://github.com/flowtora",
    icon: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
        <path d="M12 .5C5.65.5.5 5.65.5 12c0 5.08 3.29 9.38 7.86 10.9.58.11.79-.25.79-.56v-2c-3.2.7-3.88-1.37-3.88-1.37-.52-1.33-1.27-1.69-1.27-1.69-1.04-.71.08-.7.08-.7 1.15.08 1.76 1.18 1.76 1.18 1.02 1.75 2.68 1.25 3.33.96.1-.74.4-1.25.72-1.54-2.56-.29-5.26-1.28-5.26-5.7 0-1.26.45-2.29 1.18-3.09-.12-.29-.51-1.46.11-3.04 0 0 .97-.31 3.17 1.18a11.1 11.1 0 0 1 5.77 0c2.2-1.49 3.17-1.18 3.17-1.18.62 1.58.23 2.75.11 3.04.73.8 1.18 1.83 1.18 3.09 0 4.43-2.7 5.41-5.27 5.69.41.35.78 1.04.78 2.1v3.11c0 .31.21.67.8.56A10.5 10.5 0 0 0 23.5 12C23.5 5.65 18.35.5 12 .5z" />
      </svg>
    ),
  },
];

export function MarketingFooter() {
  const year = new Date().getFullYear();
  return (
    <footer
      className="mt-16"
      style={{
        borderTop: "1px solid var(--border-subtle)",
        background: "var(--surface-1)",
      }}
    >
      <div className="mx-auto w-full max-w-6xl px-6 py-14">
        {/* Top: 4-column link grid. The newsletter column is widest
            on desktop (col-span-2 of 5) so the form doesn't feel
            cramped; the three link columns share the remaining space. */}
        <div className="grid grid-cols-2 gap-10 md:grid-cols-5">
          {COLUMNS.map((col) => (
            <div key={col.title}>
              <div
                className="text-[10px] font-semibold uppercase tracking-[0.12em]"
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

          {/* Newsletter column — wider to accommodate the form. */}
          <div className="col-span-2">
            <div
              className="text-[10px] font-semibold uppercase tracking-[0.12em]"
              style={{ color: "var(--text-faint)" }}
            >
              Newsletter
            </div>
            <p
              className="mt-3 text-sm leading-relaxed"
              style={{ color: "var(--text-muted)" }}
            >
              Monthly shop-floor tips and what we shipped. No spam, no
              product-launch fireworks.
            </p>
            <div className="mt-4">
              <NewsletterForm />
            </div>
          </div>
        </div>

        {/* Bottom bar */}
        <div
          className="mt-12 flex flex-col items-start gap-4 pt-6 text-xs md:flex-row md:items-center md:justify-between"
          style={{
            borderTop: "1px solid var(--border-subtle)",
            color: "var(--text-faint)",
          }}
        >
          <div className="flex items-center gap-3">
            <Logomark size={24} />
            <span style={{ color: "var(--text-muted)" }}>
              © {year} Flowtora, Inc. · Built for shops that make real things.
            </span>
          </div>
          <div className="flex items-center gap-4">
            <ul className="flex items-center gap-3">
              {SOCIALS.map((s) => (
                <li key={s.label}>
                  <a
                    href={s.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={s.label}
                    className="inline-flex h-8 w-8 items-center justify-center rounded-md transition-colors hover:brightness-125"
                    style={{
                      background: "var(--surface-0)",
                      border: "1px solid var(--border-subtle)",
                      color: "var(--text-muted)",
                    }}
                  >
                    {s.icon}
                  </a>
                </li>
              ))}
            </ul>
            <div
              aria-hidden
              className="h-4 w-px"
              style={{ background: "var(--border-subtle)" }}
            />
            <MarketingThemeToggle />
          </div>
        </div>
      </div>
    </footer>
  );
}
