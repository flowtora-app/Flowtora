import * as React from "react";

// Minimal inline SVG icon set. We intentionally avoid a dependency like
// lucide-react or heroicons — 14 icons aren't worth a package, and
// inline SVGs are easy to tweak. Each icon is 16x16, uses currentColor,
// and accepts a `size` prop for one-off resizing.
//
// If the set grows past ~40, consider pulling in an icon library. Until
// then, add new ones here.

type IconProps = React.SVGAttributes<SVGSVGElement> & { size?: number };

function Svg({ size = 16, children, ...rest }: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      {...rest}
    >
      {children}
    </svg>
  );
}

export const Icon = {
  Dashboard: (p: IconProps) => (
    <Svg {...p}>
      <rect x="2" y="2" width="5" height="6" />
      <rect x="9" y="2" width="5" height="3" />
      <rect x="9" y="7" width="5" height="7" />
      <rect x="2" y="10" width="5" height="4" />
    </Svg>
  ),
  Attention: (p: IconProps) => (
    <Svg {...p}>
      <path d="M8 1.5l6.5 11.5H1.5z" />
      <path d="M8 6v3.5" />
      <circle cx="8" cy="11.5" r="0.5" fill="currentColor" />
    </Svg>
  ),
  Pipeline: (p: IconProps) => (
    <Svg {...p}>
      <rect x="2" y="3" width="3.5" height="10" rx="1" />
      <rect x="6.5" y="3" width="3" height="7" rx="1" />
      <rect x="10.5" y="3" width="2.5" height="4" rx="1" />
    </Svg>
  ),
  Customers: (p: IconProps) => (
    <Svg {...p}>
      <circle cx="8" cy="5" r="2.5" />
      <path d="M2.5 13.5c0-2.5 2.5-4.5 5.5-4.5s5.5 2 5.5 4.5" />
    </Svg>
  ),
  Tasks: (p: IconProps) => (
    <Svg {...p}>
      <rect x="2" y="3" width="12" height="10" rx="1.5" />
      <path d="M5 6l1.5 1.5 3-3" />
      <path d="M5 11h6" />
    </Svg>
  ),
  Products: (p: IconProps) => (
    <Svg {...p}>
      <path d="M8 2l5.5 2.5v6L8 13 2.5 10.5v-6z" />
      <path d="M2.5 4.5L8 7l5.5-2.5" />
      <path d="M8 7v6" />
    </Svg>
  ),
  Quotes: (p: IconProps) => (
    <Svg {...p}>
      <path d="M3 2h7l3 3v9H3z" />
      <path d="M10 2v3h3" />
      <path d="M5.5 8.5h5M5.5 10.5h5" />
    </Svg>
  ),
  Orders: (p: IconProps) => (
    <Svg {...p}>
      <path d="M2 4h12l-1.5 8.5h-9z" />
      <path d="M5 4V2.5h6V4" />
      <circle cx="6" cy="14" r="0.75" fill="currentColor" />
      <circle cx="11" cy="14" r="0.75" fill="currentColor" />
    </Svg>
  ),
  Installs: (p: IconProps) => (
    <Svg {...p}>
      <path d="M2 13h12" />
      <path d="M3.5 13V8l4.5-4 4.5 4v5" />
      <rect x="6.5" y="9.5" width="3" height="3.5" />
    </Svg>
  ),
  // Production — swimlane-ish bars to signal the board UI.
  Production: (p: IconProps) => (
    <Svg {...p}>
      <rect x="1.5" y="3" width="4" height="10" rx="1" />
      <rect x="6" y="5" width="4" height="6" rx="1" />
      <rect x="10.5" y="2" width="4" height="12" rx="1" />
    </Svg>
  ),
  Invoices: (p: IconProps) => (
    <Svg {...p}>
      <path d="M3 2h10v12l-2-1.25-2 1.25-2-1.25-2 1.25-2-1.25z" />
      <path d="M5.5 6h5M5.5 8.5h5M5.5 11h3" />
    </Svg>
  ),
  Reports: (p: IconProps) => (
    <Svg {...p}>
      <path d="M2 13V3" />
      <path d="M2 13h12" />
      <path d="M5 10V7M8 10V5M11 10V8" />
    </Svg>
  ),
  Support: (p: IconProps) => (
    <Svg {...p}>
      <path d="M3 12l-.5 2L5 13h6.5a2 2 0 002-2V5a2 2 0 00-2-2h-7a2 2 0 00-2 2v6a2 2 0 00.5 1z" />
    </Svg>
  ),
  Settings: (p: IconProps) => (
    <Svg {...p}>
      <circle cx="8" cy="8" r="2" />
      <path d="M8 1.5v2M8 12.5v2M1.5 8h2M12.5 8h2M3.5 3.5l1.5 1.5M11 11l1.5 1.5M3.5 12.5L5 11M11 5l1.5-1.5" />
    </Svg>
  ),
  Search: (p: IconProps) => (
    <Svg {...p}>
      <circle cx="7" cy="7" r="4.5" />
      <path d="M10.5 10.5L14 14" />
    </Svg>
  ),
  Bell: (p: IconProps) => (
    <Svg {...p}>
      <path d="M4 7a4 4 0 018 0v3l1 2H3l1-2z" />
      <path d="M6.5 12.5a1.5 1.5 0 003 0" />
    </Svg>
  ),
  Plus: (p: IconProps) => (
    <Svg {...p}>
      <path d="M8 3v10M3 8h10" />
    </Svg>
  ),
  ChevronDown: (p: IconProps) => (
    <Svg {...p}>
      <path d="M3 6l5 4 5-4" />
    </Svg>
  ),
  ChevronRight: (p: IconProps) => (
    <Svg {...p}>
      <path d="M6 3l4 5-4 5" />
    </Svg>
  ),
  ChevronsLeft: (p: IconProps) => (
    <Svg {...p}>
      <path d="M9 4L5 8l4 4M13 4L9 8l4 4" />
    </Svg>
  ),
  ChevronsRight: (p: IconProps) => (
    <Svg {...p}>
      <path d="M3 4l4 4-4 4M7 4l4 4-4 4" />
    </Svg>
  ),
  Check: (p: IconProps) => (
    <Svg {...p}>
      <path d="M3 8l3.5 3.5L13 4.5" />
    </Svg>
  ),
  // Phase 22 — approval inbox. Shield + check = "sign-off gate".
  Approvals: (p: IconProps) => (
    <Svg {...p}>
      <path d="M8 1.5l5.5 2v4.5c0 3.5-2.5 6-5.5 6.5-3-.5-5.5-3-5.5-6.5V3.5z" />
      <path d="M5.5 8l2 2 3.5-3.5" />
    </Svg>
  ),
  SignOut: (p: IconProps) => (
    <Svg {...p}>
      <path d="M7 3H4a1 1 0 00-1 1v8a1 1 0 001 1h3" />
      <path d="M10 5l3 3-3 3" />
      <path d="M13 8H6" />
    </Svg>
  ),
  User: (p: IconProps) => (
    <Svg {...p}>
      <circle cx="8" cy="6" r="2.5" />
      <path d="M3 13.5c0-2.25 2.25-4 5-4s5 1.75 5 4" />
    </Svg>
  ),
  Building: (p: IconProps) => (
    <Svg {...p}>
      <rect x="3" y="2" width="10" height="12" />
      <path d="M5.5 5h1M7.5 5h1M9.5 5h1M5.5 7.5h1M7.5 7.5h1M9.5 7.5h1M5.5 10h1M7.5 10h1M9.5 10h1" />
    </Svg>
  ),
  Sparkles: (p: IconProps) => (
    <Svg {...p}>
      <path d="M8 2l1 3 3 1-3 1-1 3-1-3-3-1 3-1z" />
      <path d="M12 9.5l.5 1.5 1.5.5-1.5.5-.5 1.5-.5-1.5-1.5-.5 1.5-.5z" />
    </Svg>
  ),
  MessageSquare: (p: IconProps) => (
    <Svg {...p}>
      <path d="M2.5 3h11v8h-7l-3 2.5z" />
    </Svg>
  ),
  // Phase 14 — vendors & expenses.
  Vendors: (p: IconProps) => (
    <Svg {...p}>
      <path d="M2 6l1.5-3h9L14 6" />
      <path d="M2 6h12v7.5H2z" />
      <path d="M6 13.5V9h4v4.5" />
    </Svg>
  ),
  Expenses: (p: IconProps) => (
    <Svg {...p}>
      <rect x="2" y="3.5" width="12" height="9" rx="1.5" />
      <path d="M2 6.5h12" />
      <path d="M5 10h2M9 10h2.5" />
    </Svg>
  ),
  // Phase 3 additions.
  Bookmark: (p: IconProps) => (
    <Svg {...p}>
      <path d="M4 2h8v12l-4-3-4 3z" />
    </Svg>
  ),
  BookmarkFilled: (p: IconProps) => (
    <Svg {...p}>
      <path d="M4 2h8v12l-4-3-4 3z" fill="currentColor" />
    </Svg>
  ),
  ArrowRight: (p: IconProps) => (
    <Svg {...p}>
      <path d="M3 8h10" />
      <path d="M9 4l4 4-4 4" />
    </Svg>
  ),
  Keyboard: (p: IconProps) => (
    <Svg {...p}>
      <rect x="1.5" y="4" width="13" height="8" rx="1.5" />
      <path d="M4 7h.01M6 7h.01M8 7h.01M10 7h.01M12 7h.01M4.5 9.5h7" />
    </Svg>
  ),
  X: (p: IconProps) => (
    <Svg {...p}>
      <path d="M4 4l8 8M12 4l-8 8" />
    </Svg>
  ),
  // Theme toggle icons.
  Sun: (p: IconProps) => (
    <Svg {...p}>
      <circle cx="8" cy="8" r="2.5" />
      <path d="M8 1.5v1.5M8 13v1.5M1.5 8h1.5M13 8h1.5M3.2 3.2l1.1 1.1M11.7 11.7l1.1 1.1M3.2 12.8l1.1-1.1M11.7 4.3l1.1-1.1" />
    </Svg>
  ),
  Moon: (p: IconProps) => (
    <Svg {...p}>
      <path d="M13.5 9.5A5.5 5.5 0 1 1 6.5 2.5a4.5 4.5 0 0 0 7 7z" />
    </Svg>
  ),
  Monitor: (p: IconProps) => (
    <Svg {...p}>
      <rect x="1.5" y="2.5" width="13" height="9" rx="1.5" />
      <path d="M5 14h6M8 11.5V14" />
    </Svg>
  ),
  // Platform admin additions.
  Shield: (p: IconProps) => (
    <Svg {...p}>
      <path d="M8 1.5l5.5 2v4.5c0 3.5-2.5 6-5.5 6.5-3-.5-5.5-3-5.5-6.5V3.5z" />
    </Svg>
  ),
  Revenue: (p: IconProps) => (
    <Svg {...p}>
      <path d="M8 2.5v11" />
      <path d="M11 5H6.5a1.75 1.75 0 100 3.5h3a1.75 1.75 0 110 3.5H5" />
    </Svg>
  ),
  Activity: (p: IconProps) => (
    <Svg {...p}>
      <path d="M1.5 8h3l2-5 3 10 2-5h3" />
    </Svg>
  ),
  Globe: (p: IconProps) => (
    <Svg {...p}>
      <circle cx="8" cy="8" r="6" />
      <path d="M2 8h12" />
      <path d="M8 2c2 2 3 4 3 6s-1 4-3 6c-2-2-3-4-3-6s1-4 3-6z" />
    </Svg>
  ),
  Target: (p: IconProps) => (
    <Svg {...p}>
      <circle cx="8" cy="8" r="5.5" />
      <circle cx="8" cy="8" r="2.5" />
    </Svg>
  ),
  Package: (p: IconProps) => (
    <Svg {...p}>
      <path d="M8 2l5.5 2.5v6L8 13 2.5 10.5v-6z" />
      <path d="M2.5 4.5L8 7l5.5-2.5" />
      <path d="M8 7v6" />
      <path d="M5.25 3.25l5.5 2.5" />
    </Svg>
  ),
  Rocket: (p: IconProps) => (
    <Svg {...p}>
      <path d="M9.5 2.5c2 0 3.5 1.5 3.5 3.5L8 11 5 8z" />
      <path d="M5 8l-2 .5L4 11l2.5-1" />
      <path d="M10 6a1 1 0 100-2 1 1 0 000 2z" fill="currentColor" />
      <path d="M4 12.5l-1 1.5" />
    </Svg>
  ),
  Megaphone: (p: IconProps) => (
    <Svg {...p}>
      <path d="M3 6v4l9 3V3z" />
      <path d="M3 6H2a1 1 0 00-1 1v2a1 1 0 001 1h1" />
      <path d="M5 10.5v2.5" />
    </Svg>
  ),
  Heartbeat: (p: IconProps) => (
    <Svg {...p}>
      <path d="M1.5 8h2.5l1.5-3 2.5 6 1.5-3h4.5" />
    </Svg>
  ),
  FileText: (p: IconProps) => (
    <Svg {...p}>
      <path d="M3.5 2h6l3 3v9h-9z" />
      <path d="M9.5 2v3h3" />
      <path d="M5.5 8h5M5.5 10.5h5M5.5 6h2" />
    </Svg>
  ),
  Scale: (p: IconProps) => (
    <Svg {...p}>
      <path d="M8 2v12" />
      <path d="M4 14h8" />
      <path d="M3 4h10" />
      <path d="M3 4l-2 4.5a2.5 2.5 0 005 0z" />
      <path d="M13 4l-2 4.5a2.5 2.5 0 005 0z" />
    </Svg>
  ),
  Flag: (p: IconProps) => (
    <Svg {...p}>
      <path d="M3 14V2" />
      <path d="M3 2.5h9l-2 3 2 3H3" />
    </Svg>
  ),
  Palette: (p: IconProps) => (
    <Svg {...p}>
      <path d="M8 1.5a6.5 6.5 0 100 13c1 0 1.5-.5 1.5-1.25S9 12 9 11.25c0-.75.5-1.25 1.5-1.25h1.5a2.5 2.5 0 002.5-2.5A6.5 6.5 0 008 1.5z" />
      <circle cx="5" cy="7" r="0.75" fill="currentColor" />
      <circle cx="8" cy="4.5" r="0.75" fill="currentColor" />
      <circle cx="11" cy="7" r="0.75" fill="currentColor" />
    </Svg>
  ),
  ArrowLeft: (p: IconProps) => (
    <Svg {...p}>
      <path d="M13 8H3" />
      <path d="M7 4L3 8l4 4" />
    </Svg>
  ),
  // Proofs — design doc with a check (approval). Groups with Orders
  // and Installs visually in the sidebar.
  Proofs: (p: IconProps) => (
    <Svg {...p}>
      <path d="M3.5 2h6l3 3v9h-9z" />
      <path d="M9.5 2v3h3" />
      <path d="M5.5 9.5l1.5 1.5 3-3" />
    </Svg>
  ),
  // Payments — a card with a dollar mark. Differentiates from Invoices
  // (document glyph) at nav glance.
  Payments: (p: IconProps) => (
    <Svg {...p}>
      <rect x="1.5" y="4" width="13" height="9" rx="1.5" />
      <path d="M1.5 7h13" />
      <path d="M8 10h1.5a1 1 0 100-2h-1a1 1 0 110-2H11" />
      <path d="M9 5v6" />
    </Svg>
  ),
};

export type IconName = keyof typeof Icon;
