import { togglePin } from "@/app/actions/palette";
import { Icon } from "@/components/shell/icons";
import type { PalettePinKind } from "@/app/actions/palette";

// Phase 3 — detail-page pin toggle.
//
// Renders as a small star button. Two variants:
//   - unpinned: outline icon, "Pin to palette"
//   - pinned:   filled icon,  "Pinned"
//
// Callers pass the current `isPinned` state (loaded via lib/palette)
// plus the snapshot fields. Server action flips the PalettePin row and
// revalidates the tenant layout, which refreshes the palette feed.

export function PinButton({
  slug,
  entityKind,
  entityId,
  label,
  sub,
  href,
  isPinned,
  size = "md",
}: {
  slug: string;
  entityKind: PalettePinKind;
  entityId: string;
  label: string;
  sub?: string;
  href: string;
  isPinned: boolean;
  size?: "sm" | "md";
}) {
  const action = togglePin.bind(null, slug);
  const iconSize = size === "sm" ? 12 : 14;
  return (
    <form action={action}>
      <input type="hidden" name="entityKind" value={entityKind} />
      <input type="hidden" name="entityId" value={entityId} />
      <input type="hidden" name="label" value={label} />
      {sub && <input type="hidden" name="sub" value={sub} />}
      <input type="hidden" name="href" value={href} />
      <button
        type="submit"
        title={isPinned ? "Remove from palette" : "Pin to palette"}
        aria-pressed={isPinned}
        className="ts-focus inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs transition-colors hover:brightness-110"
        style={{
          background: isPinned ? "var(--accent-surface)" : "var(--surface-1)",
          border: `1px solid ${isPinned ? "var(--accent-primary)" : "var(--border-subtle)"}`,
          color: isPinned ? "var(--accent-primary)" : "var(--text-muted)",
          fontWeight: isPinned ? 600 : 500,
        }}
      >
        {isPinned ? (
          <Icon.BookmarkFilled size={iconSize} />
        ) : (
          <Icon.Bookmark size={iconSize} />
        )}
        {size === "md" && (isPinned ? "Pinned" : "Pin")}
      </button>
    </form>
  );
}
