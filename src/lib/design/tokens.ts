// TypeScript mirror of the CSS custom properties defined in globals.css.
//
// Prefer `var(--surface-1)` etc. directly in JSX style props — this file
// exists for the rare cases where a value is needed in a computed
// expression (e.g. building an inline gradient, animating a color,
// exporting token values to a downstream tool).
//
// Keep in lockstep with globals.css. If you add a variable there, mirror
// it here.

export const surface = {
  0: "var(--surface-0)",
  1: "var(--surface-1)",
  2: "var(--surface-2)",
  3: "var(--surface-3)",
  inverse: "var(--surface-inverse)",
} as const;

export const border = {
  subtle: "var(--border-subtle)",
  default: "var(--border-default)",
  strong: "var(--border-strong)",
} as const;

export const text = {
  default: "var(--text-default)",
  muted: "var(--text-muted)",
  faint: "var(--text-faint)",
  inverse: "var(--text-inverse)",
} as const;

export const accent = {
  primary: "var(--accent-primary)",
  hover: "var(--accent-hover)",
  active: "var(--accent-active)",
  fg: "var(--accent-fg)",
  surface: "var(--accent-surface)",
  surfaceStrong: "var(--accent-surface-strong)",
} as const;

export const semantic = {
  success: {
    base: "var(--success)",
    fg: "var(--success-fg)",
    surface: "var(--success-surface)",
  },
  warning: {
    base: "var(--warning)",
    fg: "var(--warning-fg)",
    surface: "var(--warning-surface)",
  },
  danger: {
    base: "var(--danger)",
    fg: "var(--danger-fg)",
    surface: "var(--danger-surface)",
    border: "var(--danger-border)",
  },
  info: {
    base: "var(--info)",
    fg: "var(--info-fg)",
    surface: "var(--info-surface)",
  },
} as const;

export const radius = {
  xs: "var(--radius-xs)",
  sm: "var(--radius-sm)",
  md: "var(--radius-md)",
  lg: "var(--radius-lg)",
  xl: "var(--radius-xl)",
  "2xl": "var(--radius-2xl)",
  pill: "var(--radius-pill)",
} as const;

export const shadow = {
  sm: "var(--shadow-sm)",
  md: "var(--shadow-md)",
  lg: "var(--shadow-lg)",
  ring: "var(--shadow-ring)",
  focus: "var(--shadow-focus)",
} as const;

export const motion = {
  easeOut: "var(--ease-out)",
  easeIn: "var(--ease-in)",
  fast: "var(--duration-fast)",
  base: "var(--duration-base)",
  slow: "var(--duration-slow)",
} as const;

export const z = {
  dropdown: "var(--z-dropdown)",
  sticky: "var(--z-sticky)",
  overlay: "var(--z-overlay)",
  modal: "var(--z-modal)",
  toast: "var(--z-toast)",
  tooltip: "var(--z-tooltip)",
} as const;
