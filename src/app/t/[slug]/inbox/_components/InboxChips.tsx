import Link from "next/link";

// Primary chip navigation for the unified Inbox.
//
// One chip per sub-surface — All (summary), Attention, Messages, Approvals,
// Notifications, Tasks. Each carries an unread/pending count when > 0.
//
// The component is deliberately thin: it owns only the chip row, not the
// sub-filter row (which is per-chip and lives inside each view). That keeps
// the chip bar stable across navigations.

export type InboxChip =
  | "all"
  | "attention"
  | "messages"
  | "approvals"
  | "notifications"
  | "tasks";

export const INBOX_CHIPS: { value: InboxChip; label: string }[] = [
  { value: "all",           label: "All" },
  { value: "attention",     label: "Attention" },
  { value: "messages",      label: "Messages" },
  { value: "approvals",     label: "Approvals" },
  { value: "notifications", label: "Notifications" },
  { value: "tasks",         label: "Tasks" },
];

export function parseChip(raw: string | undefined): InboxChip {
  return INBOX_CHIPS.some((c) => c.value === raw) ? (raw as InboxChip) : "all";
}

export function InboxChips({
  slug,
  active,
  counts,
}: {
  slug: string;
  active: InboxChip;
  counts: Partial<Record<InboxChip, number>>;
}) {
  return (
    <nav className="flex flex-wrap gap-1 text-sm" aria-label="Inbox sections">
      {INBOX_CHIPS.map((c) => {
        const isActive = active === c.value;
        const count = counts[c.value] ?? 0;
        // "All" never shows a count — the summary line below handles the
        // grand total; a number next to "All" would double-count.
        const showCount = c.value !== "all" && count > 0;
        return (
          <Link
            key={c.value}
            href={
              c.value === "all"
                ? `/t/${slug}/inbox`
                : `/t/${slug}/inbox?chip=${c.value}`
            }
            className="ts-focus rounded-md px-3 py-1.5 transition-colors"
            style={{
              background: isActive ? "var(--surface-2)" : "transparent",
              border: `1px solid ${isActive ? "var(--border-default)" : "var(--border-subtle)"}`,
              color: isActive ? "var(--text-default)" : "var(--text-muted)",
              fontWeight: isActive ? 600 : 500,
            }}
          >
            {c.label}
            {showCount && (
              <span
                className="ml-2 inline-flex h-5 min-w-[20px] items-center justify-center rounded-full px-1.5 text-[10px] font-semibold"
                style={{
                  background: isActive ? "var(--surface-0)" : "var(--surface-1)",
                  color: "var(--text-muted)",
                  border: "1px solid var(--border-subtle)",
                }}
              >
                {count > 99 ? "99+" : count}
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}
