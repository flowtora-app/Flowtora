import Link from "next/link";
import type { TenantBanner } from "@/lib/tenant-banners";

// Phase 1 — shell banners.
//
// Dumb renderer for the list from lib/tenant-banners.ts. Kept as a
// component (rather than inlined in the layout) so settings pages can
// optionally re-render the same chrome inside a specific surface too.

const TONE_STYLES: Record<TenantBanner["tone"], { bg: string; fg: string; border: string }> = {
  info:    { bg: "var(--surface-1)",       fg: "var(--text-default)",   border: "var(--border-subtle)" },
  accent:  { bg: "var(--accent-surface)",  fg: "var(--accent-primary)", border: "var(--accent-primary)" },
  warning: { bg: "var(--warning-surface)", fg: "var(--warning-fg)",     border: "var(--warning-fg)" },
  danger:  { bg: "var(--danger-surface)",  fg: "var(--danger-fg)",      border: "var(--danger-fg)" },
};

export function TenantBanners({ banners }: { banners: TenantBanner[] }) {
  if (banners.length === 0) return null;
  return (
    <div className="mb-6 space-y-2">
      {banners.map((b) => {
        const tone = TONE_STYLES[b.tone];
        return (
          <div
            key={b.id}
            className="flex items-start justify-between gap-4 rounded-md px-4 py-3 text-sm"
            style={{ background: tone.bg, color: tone.fg, border: `1px solid ${tone.border}` }}
          >
            <div className="min-w-0">
              <div className="font-medium">{b.title}</div>
              {b.body && (
                <div className="mt-0.5 text-xs" style={{ color: "var(--text-muted)" }}>
                  {b.body}
                </div>
              )}
            </div>
            {b.href && b.ctaLabel && (
              <Link
                href={b.href}
                className="shrink-0 rounded-md px-3 py-1.5 text-xs font-medium"
                style={{ background: tone.border, color: "white", border: `1px solid ${tone.border}` }}
              >
                {b.ctaLabel}
              </Link>
            )}
          </div>
        );
      })}
    </div>
  );
}
