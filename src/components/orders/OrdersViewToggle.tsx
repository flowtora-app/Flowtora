import Link from "next/link";

// Phase 5 (transformation) — [ List | Board ] toggle.
//
// Same orders, two shapes. "List" is the searchable split-panel view
// at /orders — good for finding a specific order or filtering by
// saved view. "Board" is the department-swimlane stage view at
// /production — good for the shop floor driving the day's work.
//
// Server-rendered (plain Links) so the toggle works without client JS
// and the two pages can keep their existing independent layouts.

export type OrdersViewMode = "list" | "board";

export function OrdersViewToggle({
  slug,
  active,
}: {
  slug: string;
  active: OrdersViewMode;
}) {
  const listHref  = `/t/${slug}/orders`;
  const boardHref = `/t/${slug}/production`;
  return (
    <div
      role="tablist"
      className="inline-flex rounded-md p-0.5"
      style={{ background: "var(--surface-1)", border: "1px solid var(--border-subtle)" }}
    >
      <Pill
        href={listHref}
        label="List"
        hint="Search, filter and open orders side-by-side."
        active={active === "list"}
      />
      <Pill
        href={boardHref}
        label="Board"
        hint="Shop-floor swimlanes: drag cards to move work forward."
        active={active === "board"}
      />
    </div>
  );
}

function Pill({
  href,
  label,
  hint,
  active,
}: {
  href: string;
  label: string;
  hint: string;
  active: boolean;
}) {
  return (
    <Link
      href={href}
      title={hint}
      aria-selected={active}
      role="tab"
      className="rounded px-3 py-1 text-xs transition-colors"
      style={{
        background:   active ? "var(--surface-0)" : "transparent",
        color:        active ? "var(--accent-primary)" : "var(--text-muted)",
        fontWeight:   active ? 600 : 500,
        boxShadow:    active ? "0 1px 2px rgb(0 0 0 / 0.06)" : undefined,
      }}
    >
      {label}
    </Link>
  );
}
