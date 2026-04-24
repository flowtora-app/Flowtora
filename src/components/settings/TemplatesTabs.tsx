"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

// Phase 4 (transformation) — one Templates section, three kinds.
//
// Before: "Checklists" and "Canned messages" were separate sidebar
// items, and quote templates lived on a totally different route
// (`/quotes/templates`) with no cross-navigation. Operators had to
// know the full menu tree to go from "I want to customize the email
// we send when a proof is approved" to the right place.
//
// After: both settings pages render this chip row at the top so they
// read as tabs inside one section. Quote templates stay where they
// are (they're quote-centric, not a settings concern) but get a
// cross-link here so the Templates section feels complete.

export interface TemplatesTabsProps {
  slug: string;
}

export function TemplatesTabs({ slug }: TemplatesTabsProps) {
  const pathname = usePathname() ?? "";
  const settingsBase = `/t/${slug}/settings`;

  const tabs = [
    {
      href: `${settingsBase}/templates`,
      label: "Checklists",
      active:
        pathname === `${settingsBase}/templates` ||
        pathname.startsWith(`${settingsBase}/templates/`),
      external: false,
    },
    {
      href: `${settingsBase}/message-templates`,
      label: "Messages",
      active:
        pathname === `${settingsBase}/message-templates` ||
        pathname.startsWith(`${settingsBase}/message-templates/`),
      external: false,
    },
    {
      // Quote templates live under /quotes because they belong to the
      // quoting surface (edited with a line-item editor). Link out so
      // the Templates section still reads "everything reusable lives
      // here" without us having to relocate the module.
      href: `/t/${slug}/quotes/templates`,
      label: "Quote templates",
      active: false,
      external: true,
    },
  ];

  return (
    <div
      className="mb-4 flex items-center gap-1 overflow-x-auto whitespace-nowrap"
      role="tablist"
      aria-label="Template kind"
      style={{ borderBottom: "1px solid var(--border)" }}
    >
      {tabs.map((t) => (
        <Link
          key={t.href}
          href={t.href}
          role="tab"
          aria-selected={t.active}
          className="inline-flex items-center gap-1 border-b-2 px-3 py-2 text-sm transition-colors"
          style={{
            borderColor: t.active ? "var(--accent-primary)" : "transparent",
            color: t.active ? "var(--text-default)" : "var(--text-muted)",
            fontWeight: t.active ? 600 : 500,
          }}
        >
          {t.label}
          {t.external && (
            <span
              aria-hidden
              style={{ color: "var(--text-faint)" }}
              className="text-xs"
            >
              ↗
            </span>
          )}
        </Link>
      ))}
    </div>
  );
}
