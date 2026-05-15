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
    <nav
      className="flex flex-wrap gap-1.5"
      aria-label="Inbox sections"
    >
      {INBOX_CHIPS.map((c) => {
        const isActive = active === c.value;
        const count = counts[c.value] ?? 0;
        // "All" never shows a count — the summary line above handles the
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
            className="ts-focus inline-flex items-center gap-1.5 rounded-lg transition-colors"
            style={{
              background: isActive
                ? "var(--accent-surface)"
                : "color-mix(in oklab, var(--surface-2) 60%, transparent)",
              border: isActive
                ? "1px solid color-mix(in oklab, var(--accent-primary) 28%, transparent)"
                : "1px solid var(--border-subtle)",
              color: isActive ? "var(--accent-primary)" : "var(--text-muted)",
              fontWeight: isActive ? 700 : 500,
              fontSize: 12,
              letterSpacing: "-0.005em",
              padding: "6px 12px",
              height: 30,
            }}
          >
            {c.label}
            {showCount && (
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  minWidth: 18,
                  height: 18,
                  padding: "0 5px",
                  borderRadius: 4,
                  fontSize: 10,
                  fontWeight: 700,
                  fontFeatureSettings: "'tnum' 1",
                  lineHeight: 1,
                  color: isActive ? "var(--accent-primary)" : "var(--text-faint)",
                  background: isActive
                    ? "color-mix(in oklab, var(--accent-primary) 12%, transparent)"
                    : "var(--surface-1)",
                  border: isActive
                    ? "1px solid color-mix(in oklab, var(--accent-primary) 22%, transparent)"
                    : "1px solid var(--border-subtle)",
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
