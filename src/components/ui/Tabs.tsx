import * as React from "react";
import Link from "next/link";
import { cn } from "@/lib/cn";

// Tabs — Spec Page 0 §0.5.22.
//
// Variants:
//   line       — underline indicator (default; ideal for in-page nav)
//   pill       — rounded-md filled active, gray inactive
//   segmented  — single border container, dividers between tabs
// Sizes: sm 32, md 36 (default), lg 40.
// With badge counts.
// Overflow: horizontal scroll on the parent nav.
//
// Link-based for server components. The parent page decides what
// "active" means via `activeHref`/`prefixMatch`, which keeps Tabs
// stateless and lets it slot anywhere.
//
//   <Tabs
//     variant="pill"
//     items={[
//       { label: "Profile", href: `/t/${slug}/settings/profile` },
//       { label: "Team",    href: `/t/${slug}/settings/team`, badge: 3 },
//     ]}
//     activeHref={currentPath}
//   />

type Variant = "line" | "pill" | "segmented";
type Size = "sm" | "md" | "lg";

export interface TabItem {
  label: React.ReactNode;
  href: string;
  badge?: React.ReactNode;
  disabled?: boolean;
}

export interface TabsProps {
  items: TabItem[];
  activeHref?: string;
  className?: string;
  /** Spec §0.5.22 variants. Default: line. */
  variant?: Variant;
  /** Spec sizes. Default: md (36px). */
  size?: Size;
  /** When true, the active tab is detected by prefix match instead of
   *  exact. Useful for parent "Settings" routes where the URL deepens. */
  prefixMatch?: boolean;
}

const SIZE_HEIGHT: Record<Size, string> = {
  sm: "h-8  px-2.5 text-[12px]",
  md: "h-9  px-3   text-[13px]",
  lg: "h-10 px-3.5 text-[14px]",
};

export function Tabs({
  items,
  activeHref,
  className,
  variant = "line",
  size = "md",
  prefixMatch = false,
}: TabsProps) {
  const ariaLabel = "Section tabs";

  // Variant-driven container styling. Segmented gets a border + radius
  // around the whole strip; line gets an underline; pill is just gap.
  const navStyle: React.CSSProperties =
    variant === "segmented"
      ? {
          background: "var(--surface-1)",
          border: "1px solid var(--border-default)",
          borderRadius: "var(--radius-md, 6px)",
          padding: "2px",
        }
      : variant === "line"
      ? { borderBottom: "1px solid var(--border-subtle)" }
      : {};

  return (
    <nav
      className={cn(
        "flex items-end overflow-x-auto",
        variant === "line" && "gap-0.5",
        variant === "pill" && "gap-1.5",
        variant === "segmented" && "gap-0",
        className,
      )}
      style={navStyle}
      aria-label={ariaLabel}
      role="tablist"
    >
      {items.map((tab) => {
        const isActive =
          activeHref != null &&
          (prefixMatch
            ? activeHref === tab.href || activeHref.startsWith(tab.href + "/")
            : activeHref === tab.href);
        return (
          <TabRender
            key={tab.href}
            tab={tab}
            active={!!isActive}
            variant={variant}
            size={size}
          />
        );
      })}
    </nav>
  );
}

function TabRender({
  tab,
  active,
  variant,
  size,
}: {
  tab: TabItem;
  active: boolean;
  variant: Variant;
  size: Size;
}) {
  const sizeClass = SIZE_HEIGHT[size];
  const baseClass = cn(
    "ts-focus relative inline-flex shrink-0 items-center gap-2 transition-colors",
    sizeClass,
  );

  // Variant-specific styling.
  const variantStyle: React.CSSProperties = (() => {
    if (variant === "line") {
      return {
        color: active ? "var(--text-default)" : "var(--text-muted)",
        fontWeight: active ? 600 : 500,
      };
    }
    if (variant === "pill") {
      return {
        color: active ? "var(--text-default)" : "var(--text-muted)",
        fontWeight: active ? 600 : 500,
        background: active ? "var(--surface-2)" : "transparent",
        borderRadius: "var(--radius-md, 6px)",
      };
    }
    // segmented
    return {
      color: active ? "var(--text-default)" : "var(--text-muted)",
      fontWeight: active ? 600 : 500,
      background: active ? "var(--surface-2)" : "transparent",
      borderRadius: "calc(var(--radius-md, 6px) - 2px)",
    };
  })();

  const variantClass = (() => {
    if (variant === "pill") {
      return active ? "" : "hover:bg-[var(--surface-1)] hover:text-[var(--text-default)]";
    }
    if (variant === "segmented") {
      return active ? "" : "hover:text-[var(--text-default)]";
    }
    // line
    return active ? "" : "hover:bg-[var(--surface-1)] hover:text-[var(--text-default)]";
  })();

  if (tab.disabled) {
    return (
      <span
        className={cn(baseClass, "opacity-50")}
        style={{ ...variantStyle, color: "var(--text-muted)" }}
        aria-disabled
      >
        {tab.label}
        {tab.badge != null && <TabBadge active={active}>{tab.badge}</TabBadge>}
      </span>
    );
  }

  return (
    <Link
      href={tab.href}
      role="tab"
      aria-selected={active}
      aria-current={active ? "page" : undefined}
      className={cn(baseClass, variantClass)}
      style={variantStyle}
    >
      {tab.label}
      {tab.badge != null && <TabBadge active={active}>{tab.badge}</TabBadge>}
      {variant === "line" && active && (
        <span
          aria-hidden
          className="absolute left-0 right-0 bottom-[-1px] h-[2px]"
          style={{ background: "var(--accent-primary)" }}
        />
      )}
    </Link>
  );
}

function TabBadge({ children, active }: { children: React.ReactNode; active: boolean }) {
  return (
    <span
      className="inline-flex h-4 min-w-[1rem] items-center justify-center rounded-full px-1 text-[10px] font-medium"
      style={{
        background: active ? "var(--accent-surface)" : "var(--surface-2)",
        color: active ? "var(--accent-primary)" : "var(--text-muted)",
        border: active ? "1px solid var(--accent-primary)" : "1px solid var(--border-subtle)",
      }}
    >
      {children}
    </span>
  );
}
