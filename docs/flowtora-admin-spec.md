# Flowtora Admin Portal — Complete Architectural & Design Specification

**Product:** Flowtora — Multi-tenant SaaS platform for the sign and print shop industry
**Portal:** Flowtora Admin (Super Admin / Site Owner Control Center)
**Document type:** Source-of-truth build specification
**Tech stack:** Next.js 15 (App Router), React 19, TypeScript, Tailwind CSS v4, shadcn/ui, Recharts/Tremor, Lucide, TanStack Table, React Hook Form + Zod, PostgreSQL (RLS), Redis, Clerk/Auth.js, Stripe, Resend, S3/R2, Algolia/Meilisearch, Pusher, Sentry, PostHog

---

# H1 — DESIGN SYSTEM (Page 0)

## 0.1 Brand Foundations

### Logo

- **Full logo (horizontal):** Wordmark "Flowtora" in custom geometric sans-serif (Geist Bold or Inter Display 700) preceded by mark; min width 120px web, 24mm print
- **Mark only (square):** Abstract glyph — overlapping pair of curved chevrons forming a stylized "F" + flow arrow; min size 16px; usable as favicon, app icon, social avatar
- **Monochrome variants:** Pure black, pure white (for dark backgrounds), one-color brand-primary-600
- **Inverse / on-color:** White wordmark + white mark for use over brand-primary-600 and brand-primary-900 backgrounds
- **Clearspace:** 1× cap-height of "F" on all sides
- **Misuse rules:** No stretching, no recoloring outside approved palette, no drop shadow, no outline, no gradient overlay, no rotation
- **Favicon set:** 16px, 32px, 48px ICO; 180px Apple touch icon; 192px / 512px PWA; SVG masked icon
- **OG image:** 1200×630 with mark on brand-primary-900 background and "Flowtora" wordmark + tagline "Run your sign & print shop on autopilot"

### Brand voice and tone (admin portal)

- **Voice attributes:** Confident, technical, crisp, direct, warm-but-not-cute, never apologetic-by-default
- **Microcopy principles:** Verb-led button labels ("Create tenant" not "New tenant created"), present tense, sentence case for everything except product names, no exclamation points outside celebratory empty states
- **Avoid:** Marketing fluff, internal jargon ("Let's go!" / "Awesome!" / "Oops!"), emoji in production UI (allowed only in announcements module)

### Naming conventions

- **Product references:** Always "Flowtora" or "Flowtora Admin" (never "the admin," "the portal," "FT Admin")
- **Tenant noun:** "Tenant" in admin UI; "Workspace" in tenant-facing UI; never mix
- **Customer noun:** "Customer" = the tenant's end-customer (the print shop's client); never use "user" for customers
- **User noun:** "User" = a person with login credentials
- **Date format:** ISO-style "Apr 29, 2026, 3:42 PM PDT" in admin tables; "2026-04-29" in exports
- **Money format:** Currency code + space + amount, e.g., "USD 1,249.00"; always show currency code in admin

---

## 0.2 Color System

All values shown as HEX / Tailwind CSS variable name. Each scale is 50–950 (11 stops). Light-mode tokens listed first; dark-mode mappings follow in the **Theme Mapping** subsection.

### Brand Primary (Flowtora Indigo-Violet)

| Stop | HEX | RGB | HSL | Tailwind var |
|------|-----|-----|-----|--------------|
| 50 | #F5F3FF | 245,243,255 | 250 100% 98% | `--brand-50` |
| 100 | #EDE9FE | 237,233,254 | 251 91% 95% | `--brand-100` |
| 200 | #DDD6FE | 221,214,254 | 251 95% 92% | `--brand-200` |
| 300 | #C4B5FD | 196,181,253 | 252 95% 85% | `--brand-300` |
| 400 | #A78BFA | 167,139,250 | 255 92% 76% | `--brand-400` |
| 500 | #8B5CF6 | 139,92,246 | 258 90% 66% | `--brand-500` |
| 600 | #7C3AED | 124,58,237 | 262 83% 58% | `--brand-600` |
| 700 | #6D28D9 | 109,40,217 | 263 70% 50% | `--brand-700` |
| 800 | #5B21B6 | 91,33,182 | 263 69% 42% | `--brand-800` |
| 900 | #4C1D95 | 76,29,149 | 264 67% 35% | `--brand-900` |
| 950 | #2E1065 | 46,16,101 | 264 73% 23% | `--brand-950` |

### Brand Secondary (Cyan — used for highlights, links inside data viz)

| Stop | HEX |
|------|-----|
| 50 | #ECFEFF |
| 100 | #CFFAFE |
| 200 | #A5F3FC |
| 300 | #67E8F9 |
| 400 | #22D3EE |
| 500 | #06B6D4 |
| 600 | #0891B2 |
| 700 | #0E7490 |
| 800 | #155E75 |
| 900 | #164E63 |
| 950 | #083344 |

### Accent (Amber — used sparingly for "VIP," "Pinned," "New")

| Stop | HEX |
|------|-----|
| 50 | #FFFBEB |
| 100 | #FEF3C7 |
| 200 | #FDE68A |
| 300 | #FCD34D |
| 400 | #FBBF24 |
| 500 | #F59E0B |
| 600 | #D97706 |
| 700 | #B45309 |
| 800 | #92400E |
| 900 | #78350F |
| 950 | #451A03 |

### Neutrals / Grays (Slate-based, slightly cool)

| Stop | HEX |
|------|-----|
| 50 | #F8FAFC |
| 100 | #F1F5F9 |
| 200 | #E2E8F0 |
| 300 | #CBD5E1 |
| 400 | #94A3B8 |
| 500 | #64748B |
| 600 | #475569 |
| 700 | #334155 |
| 800 | #1E293B |
| 900 | #0F172A |
| 950 | #020617 |

### Semantic — Success (Emerald)

| Stop | HEX |
|------|-----|
| 50 | #ECFDF5 |
| 100 | #D1FAE5 |
| 200 | #A7F3D0 |
| 300 | #6EE7B7 |
| 400 | #34D399 |
| 500 | #10B981 |
| 600 | #059669 |
| 700 | #047857 |
| 800 | #065F46 |
| 900 | #064E3B |
| 950 | #022C22 |

### Semantic — Warning (Amber identical to accent above; reused with semantic alias `--warning-*`)

### Semantic — Error / Destructive (Rose-Red)

| Stop | HEX |
|------|-----|
| 50 | #FFF1F2 |
| 100 | #FFE4E6 |
| 200 | #FECDD3 |
| 300 | #FDA4AF |
| 400 | #FB7185 |
| 500 | #F43F5E |
| 600 | #E11D48 |
| 700 | #BE123C |
| 800 | #9F1239 |
| 900 | #881337 |
| 950 | #4C0519 |

### Semantic — Info (Sky)

| Stop | HEX |
|------|-----|
| 50 | #F0F9FF |
| 100 | #E0F2FE |
| 200 | #BAE6FD |
| 300 | #7DD3FC |
| 400 | #38BDF8 |
| 500 | #0EA5E9 |
| 600 | #0284C7 |
| 700 | #0369A1 |
| 800 | #075985 |
| 900 | #0C4A6E |
| 950 | #082F49 |

### Background Tokens (Light theme)

| Token | HEX | Use |
|-------|-----|-----|
| `--bg-base` | #FFFFFF | Page background |
| `--bg-subtle` | #F8FAFC | Cards on page, sidebar |
| `--bg-muted` | #F1F5F9 | Hover states, code blocks |
| `--bg-elevated` | #FFFFFF | Modals, popovers (with shadow-lg) |
| `--bg-overlay` | rgba(15,23,42,0.6) | Modal backdrop |
| `--bg-inverse` | #0F172A | Tooltips, dark inline elements |

### Surface Tokens

| Token | HEX | Use |
|-------|-----|-----|
| `--surface-1` | #FFFFFF | Card |
| `--surface-2` | #F8FAFC | Nested card |
| `--surface-3` | #F1F5F9 | Selected row |
| `--surface-accent` | #F5F3FF | Brand-tinted info card |

### Border Tokens

| Token | HEX | Use |
|-------|-----|-----|
| `--border-subtle` | #F1F5F9 | Dividers in cards |
| `--border-default` | #E2E8F0 | Card borders, inputs at rest |
| `--border-strong` | #CBD5E1 | Hover state, separators |
| `--border-focus` | #7C3AED | Focus ring (brand-600) |
| `--border-error` | #E11D48 | Invalid input border |

### Text Tokens

| Token | HEX | Use |
|-------|-----|-----|
| `--text-primary` | #0F172A | Headings, primary body |
| `--text-secondary` | #475569 | Subtitles, metadata |
| `--text-tertiary` | #64748B | Hints, helper text |
| `--text-disabled` | #94A3B8 | Disabled controls |
| `--text-inverse` | #FFFFFF | On dark backgrounds |
| `--text-link` | #7C3AED | Inline links |
| `--text-link-hover` | #5B21B6 | Hover state |
| `--text-success` | #047857 | Positive trends |
| `--text-warning` | #B45309 | Caution copy |
| `--text-error` | #BE123C | Validation, destructive |

### Chart Palette — Categorical (10 series)

1. `#7C3AED` brand-600 (purple)
2. `#06B6D4` cyan-500
3. `#10B981` emerald-500
4. `#F59E0B` amber-500
5. `#F43F5E` rose-500
6. `#3B82F6` blue-500
7. `#8B5CF6` violet-500
8. `#EC4899` pink-500
9. `#14B8A6` teal-500
10. `#F97316` orange-500

### Chart Palette — Sequential (single-hue, 7 stops, brand-based)

`#F5F3FF → #DDD6FE → #C4B5FD → #A78BFA → #8B5CF6 → #7C3AED → #5B21B6`

### Chart Palette — Diverging (red ↔ neutral ↔ green, 9 stops)

`#BE123C #E11D48 #F43F5E #FDA4AF #F1F5F9 #6EE7B7 #34D399 #10B981 #047857`

### Theme Mapping — Dark Mode

| Token | Light | Dark |
|-------|-------|------|
| `--bg-base` | #FFFFFF | #0B1120 |
| `--bg-subtle` | #F8FAFC | #0F172A |
| `--bg-muted` | #F1F5F9 | #1E293B |
| `--bg-elevated` | #FFFFFF | #1E293B |
| `--surface-1` | #FFFFFF | #111827 |
| `--surface-2` | #F8FAFC | #1F2937 |
| `--border-default` | #E2E8F0 | #1E293B |
| `--border-strong` | #CBD5E1 | #334155 |
| `--text-primary` | #0F172A | #F8FAFC |
| `--text-secondary` | #475569 | #CBD5E1 |
| `--text-tertiary` | #64748B | #94A3B8 |
| `--text-link` | #7C3AED | #A78BFA |
| Brand primary action | brand-600 #7C3AED | brand-500 #8B5CF6 |
| Success | emerald-600 | emerald-400 |
| Error | rose-600 | rose-400 |

---

## 0.3 Typography

- **UI font:** Inter (variable). Fallback: `ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`
- **Display font:** Inter Display (used for page H1 and dashboard KPIs only). Fallback: same as Inter
- **Monospace:** JetBrains Mono. Fallback: `ui-monospace, SFMono-Regular, Menlo, Monaco, "Cascadia Mono", monospace`
- **Numeric font feature:** `font-variant-numeric: tabular-nums` always-on for tables and KPIs
- **Weights used:** 400 (regular), 500 (medium), 600 (semibold), 700 (bold). Display font also uses 800 for hero metrics

### Type scale

| Token | Size | Line-height | Weight | Letter-spacing | Use case |
|-------|------|-------------|--------|----------------|----------|
| display-xl | 48px / 3rem | 1.05 | 700 | -0.02em | Welcome row big number |
| display-l | 36px / 2.25rem | 1.1 | 700 | -0.02em | Hero KPI metric |
| h1 | 30px / 1.875rem | 1.2 | 700 | -0.015em | Page title |
| h2 | 24px / 1.5rem | 1.25 | 600 | -0.01em | Section heading |
| h3 | 20px / 1.25rem | 1.3 | 600 | -0.005em | Card heading |
| h4 | 18px / 1.125rem | 1.35 | 600 | 0 | Sub-section |
| h5 | 16px / 1rem | 1.4 | 600 | 0 | Inline emphasis heading |
| h6 | 14px / 0.875rem | 1.4 | 600 | 0.01em | Tab label, table header (uppercase variant) |
| body-l | 16px / 1rem | 1.5 | 400 | 0 | Long-form copy in modals |
| body-m | 14px / 0.875rem | 1.5 | 400 | 0 | Default UI body |
| body-s | 13px / 0.8125rem | 1.45 | 400 | 0 | Dense table cells |
| caption | 12px / 0.75rem | 1.4 | 400 | 0 | Helper text, timestamps |
| overline | 11px / 0.6875rem | 1.4 | 600 | 0.08em uppercase | Section dividers in sidebar |
| label | 13px / 0.8125rem | 1.4 | 500 | 0 | Form labels |
| code | 13px / 0.8125rem | 1.5 | 400 (mono) | 0 | Inline `code` and code blocks |

---

## 0.4 Spacing & Layout

- **Base unit:** 4px
- **Spacing scale (rem):** 0, 0.25 (1=4px), 0.5 (2=8), 0.75 (3=12), 1 (4=16), 1.25 (5=20), 1.5 (6=24), 2 (8=32), 2.5 (10=40), 3 (12=48), 4 (16=64), 5 (20=80), 6 (24=96), 8 (32=128), 10 (40=160)
- **Container widths:** `--container-sm 640`, `--container-md 768`, `--container-lg 1024`, `--container-xl 1280`, `--container-2xl 1536`. Admin app shell content max-width: 1440px centered with 24px gutters
- **Grid:** 12 columns; gutter 24px; outer padding 24px (desktop), 16px (mobile)
- **Breakpoints:** sm 640, md 768, lg 1024, xl 1280, 2xl 1536
- **Density modes:** Comfortable (default, 14px body, 44px row), Compact (13px body, 36px row), Cozy (14px body, 56px row) — global setting persisted per admin

### Border radius

| Token | Value | Use |
|-------|-------|-----|
| radius-none | 0 | Tables (header), full-bleed |
| radius-sm | 4px | Tags, badges |
| radius-md | 6px | Inputs, buttons (default) |
| radius-lg | 8px | Cards |
| radius-xl | 12px | Modals, dropdowns |
| radius-2xl | 16px | Hero cards |
| radius-full | 9999px | Avatars, pills |

### Shadows

| Token | Value | Use |
|-------|-------|-----|
| shadow-xs | `0 1px 2px 0 rgba(15,23,42,0.04)` | Inputs |
| shadow-sm | `0 1px 3px 0 rgba(15,23,42,0.08), 0 1px 2px -1px rgba(15,23,42,0.06)` | Cards |
| shadow-md | `0 4px 6px -1px rgba(15,23,42,0.08), 0 2px 4px -2px rgba(15,23,42,0.06)` | Dropdowns |
| shadow-lg | `0 10px 15px -3px rgba(15,23,42,0.10), 0 4px 6px -4px rgba(15,23,42,0.08)` | Popovers |
| shadow-xl | `0 20px 25px -5px rgba(15,23,42,0.12), 0 8px 10px -6px rgba(15,23,42,0.10)` | Modals |
| shadow-2xl | `0 25px 50px -12px rgba(15,23,42,0.25)` | Slide-overs |
| shadow-inner | `inset 0 2px 4px 0 rgba(15,23,42,0.05)` | Pressed states |
| shadow-focus | `0 0 0 3px rgba(124,58,237,0.40)` | Focus ring |

### Z-index scale

| Token | Value |
|-------|-------|
| z-base | 0 |
| z-elevated | 10 |
| z-sticky | 20 |
| z-dropdown | 1000 |
| z-fixed | 1030 |
| z-modal-backdrop | 1040 |
| z-modal | 1050 |
| z-slideover | 1060 |
| z-popover | 1070 |
| z-tooltip | 1080 |
| z-toast | 1090 |
| z-impersonation-banner | 1100 |
| z-command-palette | 1200 |


---

## 0.5 Component Library

For every component: **Variants**, **Sizes**, **States**, **Anatomy**, **Notable props**.

### 1. Button
- **Variants:** `primary` (brand-600 bg, white text), `secondary` (white bg, border-default, text-primary), `tertiary` (transparent bg, text-primary, hover bg-muted), `outline` (transparent bg, border-strong, text-primary), `ghost` (transparent, text-secondary, hover bg-muted), `destructive` (rose-600 bg, white text), `link` (text-link, underline on hover)
- **Sizes:** `xs` (24px h, 12px text, 8px px), `sm` (32px h, 13px text, 12px px), `md` (36px h, 14px text, 14px px) **default**, `lg` (40px h, 14px text, 16px px), `xl` (48px h, 16px text, 20px px)
- **States:** default, hover (-1 luminosity step), focus (shadow-focus ring), active (-2 luminosity), disabled (opacity 0.5, cursor-not-allowed), loading (spinner replaces leading icon, label dimmed, button non-clickable)
- **Anatomy:** `[leading-icon? 16px][label][trailing-icon? 16px][kbd? shortcut chip]`
- **Props:** `variant`, `size`, `leadingIcon`, `trailingIcon`, `loading`, `disabled`, `fullWidth`, `kbd`, `tooltip`

### 2. Icon Button
- **Variants:** same as Button minus `link`
- **Sizes:** `xs` 24px, `sm` 28px, `md` 32px, `lg` 36px, `xl` 40px (square)
- **Required:** `aria-label`
- **States:** identical to Button

### 3. Input (Text)
- **Subtypes:** text, email, password (with show/hide toggle), number (with stepper), search (with magnifier prefix + clear button), tel, url
- **Sizes:** sm 32px, md 36px (default), lg 40px
- **Anatomy:** `[label?][input wrapper: prefix-icon? · prefix-addon? · input · trailing-content · suffix-addon? · suffix-icon?][helper-or-error]`
- **States:** default, hover (border-strong), focus (border-focus + shadow-focus), filled, disabled (bg-muted, text-disabled), readonly, invalid (border-error, error-text, error-icon trailing), warning (amber border)
- **Validation behaviors:** validate on blur by default, on every keystroke once an error has surfaced, display Zod error message
- **Density:** auto-resizes leading icon to 16px regardless of size

### 4. Textarea
- **Sizes:** auto-grow with min-rows / max-rows props; explicit sm (3 rows) / md (5 rows) / lg (8 rows)
- **Resize handle:** vertical only, 12px corner indicator
- **Char counter:** optional, bottom-right, turns warning amber at 90%, error rose at 100%
- **States:** as Input

### 5. Select / Combobox / Multi-select
- **Select:** native or custom; custom variant uses Radix Select primitives; supports option groups, separators, descriptions per option, leading icons
- **Combobox:** searchable, async load, debounced 250ms, keyboard arrow navigation, "create new" option when no match, recent selections section
- **Multi-select:** chips inside the input, each with X to remove; "Select all" / "Clear all"; max-display N then "+ X more"
- **Sizes:** sm/md/lg matching Input
- **Empty state:** "No results — try different keywords" with secondary "Create [query]" CTA

### 6. Date Picker / Date Range Picker
- **Date Picker:** Single-date popover calendar, today button, keyboard nav, weekday header, min/max date, disabled dates, time picker optional
- **Range Picker:** Two-month side-by-side, hover preview range, presets sidebar (Today, Yesterday, Last 7d, Last 30d, MTD, QTD, YTD, Last 12m, Custom)
- **Display format:** "Apr 29, 2026" or "Apr 29 – May 5, 2026"; localized
- **Inline variant:** always-visible calendar
- **States:** default, focus, value-set (chip removable)

### 7. Time Picker
- **Format:** 12h or 24h based on locale; hour/minute spinners with up/down arrows; AM/PM toggle in 12h mode
- **Step:** prop `minuteStep` (default 5)
- **Combined with Date:** unified popover with date on left, time on right

### 8. File Upload
- **Variants:** Single button-style, drag-drop zone (96px min height with dashed border), avatar-style circle, multi-file gallery
- **States:** idle, drag-over (brand-100 bg, brand-600 border solid), uploading (per-file progress bar), success (green check), error (red icon + retry), partial (some failed)
- **Constraints:** maxSize, accept (mime types + extensions), maxFiles
- **Preview:** image thumbnail 64px, document icon for non-images, file name truncated, size, remove X
- **Chunked upload:** for files >20MB, with pause/resume and retry-failed-chunks

### 9. Checkbox / Radio / Switch
- **Checkbox:** 16×16px, brand-600 fill on check, indeterminate state with horizontal bar, label right
- **Radio:** 16×16px, brand-600 inner dot
- **Switch:** 32×18px track, white knob, brand-600 when on, gray-300 when off, animated 150ms; sizes sm 24×14, md 32×18, lg 40×22
- **States:** all support disabled, focus (shadow-focus), invalid (rose-600 ring)

### 10. Slider
- **Single thumb / Range (two thumbs)**
- **Track:** 4px height, gray-200 background, brand-600 fill
- **Thumb:** 16px, white with brand-600 border, shadow-sm; on focus 20px with shadow-focus
- **Marks:** optional ticks with labels; tooltip on drag

### 11. Tags / Chips Input
- **Anatomy:** Comma/Enter to commit; existing chips with X; paste-multiple supported (comma/newline split)
- **Sizes:** sm chip 20px, md 24px (default)
- **Validation:** per-chip validator (e.g., email format) with red ring + tooltip on invalid
- **Suggestions:** dropdown of existing options as you type

### 12. OTP Input
- **6 separate boxes**, 40×48px each, monospace, auto-advance, paste support spreads digits, Backspace moves back
- **States:** focus (border-focus), filled, error (rose), success (emerald)

### 13. Color Picker
- **Trigger:** swatch button 24×24 + hex input
- **Popover:** Saturation/value square, hue slider, alpha slider, hex input, RGB, HSL, recent colors row, eyedropper (browser-supported)

### 14. Avatar
- **Sizes:** xs 20, sm 24, md 32 (default), lg 40, xl 48, 2xl 64, 3xl 96
- **Content:** image, initials (auto-generated colored bg from name hash), fallback icon
- **Status dot:** bottom-right; colors: emerald (online), amber (away), rose (offline-error), gray (offline), brand (impersonating)
- **Group:** stacked, max display N then "+X" pill, ring-2 white between avatars

### 15. Badge
- **Variants:** `solid` (filled bg + white text), `soft` (tinted bg + dark text), `outline`, `dot` (pre-pended 6px dot)
- **Colors:** neutral, brand, success, warning, error, info, accent
- **Sizes:** xs 16px h / 10px text, sm 20px / 11px, md 24px / 12px (default)
- **With count:** numeric, max display "99+"
- **With icon:** leading 12px

### 16. Tooltip / Popover
- **Tooltip:** Dark bg (`--bg-inverse`), white text, 12px radius, 8/12 padding, max-width 240px, 200ms delay open, 0ms close, arrow optional, placements top/right/bottom/left + start/center/end variants
- **Popover:** light bg (`--bg-elevated`), shadow-lg, radius-xl, padding 16px, focus-trapped, dismiss on esc / outside click

### 17. Dropdown Menu / Context Menu
- **Items:** label, leading icon (16px), trailing kbd shortcut, trailing chevron for submenu, destructive variant (rose text), disabled
- **Sections:** header label, separator divider
- **Width:** auto with min-width 200px, max-width 360px
- **Keyboard:** ArrowUp/Down nav, Home/End jump, type-ahead, Enter to activate, Esc to close

### 18. Card
- **Variants:** default (border + bg-base), elevated (shadow-sm, no border), interactive (hover shadow-md, cursor-pointer), gradient (brand soft tint)
- **Anatomy:** `[Header: title + description + actions][Body][Footer: meta + actions]`
- **Padding:** sm 12, md 16 (default), lg 24

### 19. Stat Card / KPI Card
- **Anatomy:**
  - Top row: label (caption uppercase) + tooltip icon + 3-dot menu
  - Center: metric (display-l) + unit
  - Below metric: delta pill ("+12.4% vs last 30d", green/red/gray) + comparison label
  - Bottom: 32px sparkline (line or bar) full-width inside card
  - Optional: footer link "View report →"
- **Variants:** primary (brand left accent bar), neutral, success, warning, error
- **Loading:** skeleton metric block + skeleton sparkline
- **Click:** drills down to underlying report

### 20. Table
- **Anatomy:** Toolbar (search + filters + view + columns + density + export) → Header (sticky, sortable, filterable per column, resizable, reorderable) → Body rows (selectable, expandable, hoverable) → Footer (pagination + bulk action bar when rows selected)
- **Header:** uppercase overline 11px, neutral-600, bg-subtle, 40px height, sort indicator, optional column filter popover (per-column type-aware filter)
- **Row:** 44px (comfortable) / 36px (compact); hover bg-muted; selected bg-surface-accent + left brand accent bar; striped variant available; sticky first column for wide tables
- **Cell types:** text, number (right-aligned tabular), money, date, badge/status pill, avatar+text, link, action menu (3-dot trailing), inline edit (pencil)
- **Expandable row:** chevron prefix; expansion area inline with detail or sub-table
- **Selection:** checkbox column, "select all on page" + "select all matching filter" link
- **Empty state:** centered illustration + heading + body + CTA
- **Loading:** 10 skeleton rows
- **Error:** banner with retry

### 21. Pagination
- **Variants:** numbered (1 2 3 ... N), prev/next with X-Y of Z, load more button, infinite scroll with sentinel
- **Per-page selector:** 10/25/50/100/250
- **Jump-to-page input** when >20 pages
- **Server-side support** mandatory for >1000 rows

### 22. Tabs
- **Variants:**
  - `line` (underline indicator, 2px, animated; ideal for in-page navigation)
  - `pill` (rounded-md filled active, gray inactive)
  - `segmented` (single border container, dividers between tabs, active filled)
- **Sizes:** sm 32px, md 36px (default), lg 40px
- **With badge counts** (e.g., "Open · 24")
- **Overflow:** horizontal scroll with chevron buttons; or "More" dropdown
- **Keyboard:** arrow nav, Home/End

### 23. Accordion
- **Variants:** single-open, multi-open
- **Anatomy:** trigger row (chevron + label + optional helper), animated panel (height transition 200ms)
- **Variants:** boxed (each item in card), bordered (full-width with dividers), ghost

### 24. Stepper / Wizard
- **Orientation:** horizontal (top), vertical (left rail)
- **Step:** number circle (filled emerald when complete + check, brand-600 ring when current, gray when upcoming) + label + description
- **Connector:** line or dashed; turns brand-600 when crossed
- **Errors:** rose ring + ! icon

### 25. Breadcrumb
- **Separator:** `/` slash, neutral-300
- **Truncation:** when >4 levels, collapse middle into "..." dropdown
- **Last item:** non-link, text-primary; previous items text-link
- **With dropdowns:** each segment optionally opens sibling list

### 26. Sidebar Navigation
- **States:** expanded (240px), collapsed (64px, icon-only with tooltips), pinned/unpinned toggle
- **Item anatomy:** `[icon 18px][label][badge?][chevron-for-submenu?]`
- **Active state:** filled icon, text-primary, bg-surface-accent, 3px left brand-600 accent bar
- **Hover:** bg-muted
- **Section dividers:** 11px overline label, neutral-500, with horizontal rule above
- **Submenu:** indent 32px, no icon, dot indicator
- **Pinned items area:** at top, drag-handle visible on hover
- **Sidebar footer:** environment switcher mini, "v3.4.2" build, status indicator dot

### 27. Top Navigation Bar
- **Height:** 56px
- **Sections:** left (logo + product name + env badge), center (global search 480px), right (action cluster: create, notifications, help, theme, profile)
- **Sticky:** yes, with shadow-sm on scroll
- **Mobile:** logo + hamburger + search icon + profile

### 28. Modal / Dialog
- **Sizes:** sm 400px, md 560px (default), lg 720px, xl 960px, 2xl 1200px, full (100% minus 64px gutter)
- **Anatomy:** Header (title + description + close X) → Body (scrollable, max-height 70vh) → Footer (left: cancel/secondary, right: primary + destructive, with kbd hints)
- **Variants:** standard, confirmation (icon + heading + body + 2 buttons), destructive (rose icon, type-to-confirm input)
- **Behavior:** focus trap, return focus, esc to close, click backdrop to close (configurable), prevent close while submitting

### 29. Slide-Over Drawer
- **Sides:** right (default), left
- **Widths:** sm 400px, md 520px, lg 720px, xl 960px
- **Anatomy:** Header (sticky, title + actions + close), Tabs optional (sticky), Body scroll, Footer sticky
- **Use cases:** quick view, edit, multi-step forms, comments

### 30. Toast / Notification
- **Position:** top-right (default; configurable)
- **Variants:** info (blue), success (emerald), warning (amber), error (rose), loading (with spinner), promise (chains pending → resolved/rejected)
- **Anatomy:** icon + title + description (optional) + action button (optional) + close X
- **Behavior:** auto-dismiss after 5s (10s for error), pause on hover, swipe to dismiss, max stack 5
- **Promise toast:** persistent until resolved

### 31. Banner / Alert (in-page)
- **Variants:** info, success, warning, error, neutral
- **Layouts:** inline (compact, icon + text), full (icon + title + body + CTA + dismiss)
- **Use cases:** maintenance notices, plan limits, security alerts
- **Dismissible:** stored in user prefs to not re-show

### 32. Empty State
- **Anatomy:** SVG illustration (240×180), heading (h3), body (body-m, max 480px), primary CTA, secondary link, optional "Learn more in docs"
- **Tones:** neutral (most), celebratory (first action complete), error (something went wrong)

### 33. Skeleton Loaders
- **Animation:** shimmer 1.6s ease-in-out infinite, gray-100→gray-200→gray-100
- **Variants:** text (single/multi-line with last line 60% width), avatar (circle), thumbnail (rectangle), card composite, table-row, KPI card
- **Use whenever data >150ms** (perceived flash threshold)

### 34. Progress Bar / Progress Ring
- **Bar:** 4px (sm), 6px (md), 8px (lg) height; brand-600 fill on neutral-200 track; striped/animated variant for in-progress
- **Ring:** 24px (sm), 40px (md), 64px (lg); stroke 4px; with center number/percent label
- **Indeterminate:** ping wave animation

### 35. Spinner
- **Sizes:** xs 12, sm 16, md 20, lg 24, xl 32
- **Style:** circular dashed, brand-600 stroke, 600ms rotation
- **Use:** inline button loading; never as full-page loader (use skeletons instead)

### 36. Code Block
- **Anatomy:** language tab + filename (optional) + copy button + lines
- **Syntax highlighting:** Shiki with `github-light` / `github-dark` themes
- **Line numbers:** optional, neutral-400
- **Diff highlighting:** added (emerald-50 bg + emerald-700 text), removed (rose-50 bg + rose-700 text), strikethrough on removed
- **Wrap toggle**

### 37. Kbd Shortcut Display
- **Style:** monospace, 11px, neutral-700, bg-muted, border-default, radius-sm, padding 2px 6px
- **Joiner:** ` + ` between modifier and key, e.g., `⌘ K`, `Shift N`
- **Mac vs Win:** auto-detect platform; show ⌘ vs Ctrl

### 38. Diff Viewer
- **Variants:** unified (single column), split (two columns)
- **Hunks:** collapse unchanged regions with "+ N unchanged lines" expander
- **Inline highlights:** within-line diff
- **Line numbers + change markers** ( + / − )

### 39. Calendar
- **Variants:** date-picker calendar, scheduling calendar (day/week/month/agenda views), event chips
- **Event chip:** colored bar, title truncated, click for popover with details
- **Today indicator:** brand-600 ring around date

### 40. Charts (Recharts/Tremor)

For **every chart type**, the following are standardized:

**Standardization (applies to all):**
- Default height: 240px (sm), 320px (md, default), 480px (lg), 640px (xl)
- Axis label color: neutral-500, font-size 11px, font-weight 500
- Gridlines: horizontal only, neutral-100 1px, no vertical gridlines
- Axis ticks: every Nth label to prevent overlap; rotate 30° if x-labels truncate
- Tooltip: dark bg-inverse, white text, radius-md, shadow-lg, padding 12px; shows series swatch + name + formatted value; arrow pointer
- Legend: bottom by default; toggle series on click; right-side variant for dashboards
- Empty data: centered illustration "No data for this range" + alternate range CTA
- Animation: 400ms ease-out on mount; 200ms on data update
- Hover crosshair: vertical dashed line, neutral-300
- Time-range selector: 24h / 7d / 30d / 90d / 12m / Custom (above chart, segmented control)
- Comparison toggle: "vs previous period" — overlays prior series at 50% opacity, dashed line
- Download: PNG / SVG / CSV from chart 3-dot menu
- Number format: K/M/B abbreviation, 2 decimals max in tooltip; full number in CSV

**Chart types:**

| Type | Use case |
|------|----------|
| Line | Trend over time (MRR, signups) |
| Area | Stacked composition over time (MRR by plan) |
| Bar (vertical) | Category comparison ≤ 12 categories |
| Stacked Bar | Composition per category |
| Horizontal Bar | Category comparison >12 or long labels |
| Pie | Composition ≤6 slices, simple |
| Donut | Composition ≤8 slices with center metric |
| Radial / Gauge | Single KPI vs goal |
| Sparkline | In-line micro-trend in KPI cards (32px h, no axes) |
| Heatmap | Cohort retention, day-of-week × hour density |
| Scatter | Correlation analysis (LTV vs CAC) |
| Funnel | Conversion stages (onboarding) |
| Treemap | Hierarchical revenue, storage by tenant |
| Map / Geo | Tenants by country (choropleth) + bubble overlay |
| Combo | Bar + line dual-axis (revenue + count) |

### 41. Data Grid (advanced table)
- **Extends Table** with: virtualized rows, frozen columns (left/right), grouping, aggregation rows, conditional formatting, cell formulas, drag-to-reorder, multi-row inline edit, copy-paste from spreadsheet, undo/redo
- **Use:** financial reconciliation, audit log advanced view

### 42. Command Palette (CMD+K)
- **Trigger:** ⌘K / Ctrl+K, also keyboard `/` from anywhere except text inputs
- **Anatomy:** modal centered top-1/3 (640px wide); input field with magnifier; results list below; footer with kbd hints (↑↓ navigate, ↵ select, Esc close)
- **Categories (in order):** Recent (last 5), Suggested (AI), Navigation (jump to page), Tenants, Users, Invoices, Tickets, Audit log entries, Settings, Actions (Create…)
- **Actions section:** "Create new tenant," "Create coupon," "Send announcement," "Toggle dark mode," "Sign out"
- **Result item:** category icon + label + meta (e.g., tenant slug) + kbd shortcut if assigned
- **Mouse + keyboard fully supported**, fuzzy search, debounce 80ms, category filter via prefix `t:` for tenant, `u:` for user, etc.

### 43. Filter Bar
- **Anatomy:** Search input + Filter chips area (existing) + "+ Add filter" button (opens menu of filterable fields) + "Reset" link + "Save view" button
- **Filter chip:** field name + operator + value(s) + X to remove; click to edit
- **Operators per type:** text (is, contains, starts with, ends with, regex), number (=, ≠, >, <, between), date (is, before, after, between, last N days, this week/month), boolean, enum (is one of, is not one of)

### 44. Search With Suggestions
- **As-you-type dropdown** with categorized results, recent searches, "no results" empty
- **Keyboard:** ↑↓ navigate, ↵ go to first result or jump to typed result page
- **Highlights match** in result label (bold matched substring)

### 45. Tag/Pill Filter Chips
- **Single-select group:** clicking selects + deselects others
- **Multi-select group:** clicking toggles
- **Visual:** unselected (border-default, transparent), selected (brand-50 bg, brand-700 text, brand-200 border)
- **With count badge** trailing

### 46. Notification Center Panel
- **Slide-over right, 400px wide**
- **Header:** "Notifications" + tabs (All, Unread, Mentions) + "Mark all read" + settings icon
- **Body:** grouped by date (Today, Yesterday, Earlier this week, Older); each item: avatar/icon + title + body + timestamp + actions (mark read, snooze, dismiss)
- **Empty:** "You're all caught up" with check illustration
- **Footer:** "View all notifications" link

### 47. User Menu Dropdown
- **Header:** avatar + name + email + role + tenant context
- **Items:** View profile, Account settings, Switch organization (submenu), View as tenant (impersonation), Notifications preferences, API keys, Theme (Light/Dark/System), Keyboard shortcuts, Documentation, Sign out (red)
- **Footer:** version + status dot + "What's new" badge

### 48. Tenant Switcher / Org Picker
- **Trigger:** chip in top bar (when impersonating) or in user dropdown
- **Popover:** searchable list of tenants admin can access; recent at top; "Create new tenant" footer link

### 49. Status Pill
- **Anatomy:** 6px colored dot + label, optional tooltip
- **Status mapping:**
  - Active → emerald
  - Trialing → sky
  - Past Due → amber
  - Suspended → orange-600
  - Cancelled → neutral-500
  - Pending → violet
  - Failed → rose
  - Draft → neutral
- **Variants:** dot-only (table cells), dot+label, solid filled

### 50. Quote / Pull Quote
- Used in "What's new" and announcements; large left brand-600 bar, italic body, attribution

### 51. Diff/Change Indicator
- Inline `+`/`−` icons; tooltip on hover with old vs new value; used in Audit Log

### 52. Timeline
- **Vertical:** left rail with dots; each entry: icon + actor + action + timestamp + expandable detail
- **Horizontal:** Gantt-like for incidents and rollouts
- **Markers:** today line (brand), milestones (filled circles), incidents (rose triangle)

### 53. Activity Feed Item
- **Anatomy:** actor avatar + verb-led summary + target (link) + timestamp + meta chips (tenant, IP) + 3-dot menu (subscribe, view in audit log)
- **Density:** condensed (1 line) vs expanded (with diff/preview)

### 54. Comment Thread
- **Anatomy:** avatar + author + role badge + timestamp + body (markdown) + reactions row + reply button + 3-dot menu (edit, delete, copy link)
- **Reply:** indented 32px
- **Mentions:** `@user` highlights brand-600, triggers notification

### 55. Mention Input (@user)
- **Trigger:** typing `@`
- **Popover:** searchable user/team list; shows avatar + name + role; ↵ inserts as chip
- **Also supports `#`** for tags, `/` for commands

### 56. Rich Text Editor Toolbar
- **Groups:** text style (B/I/U/S), heading (H1-H3), lists (ul/ol/check), link, code (inline/block), quote, image, table, divider, mention, emoji
- **Floating toolbar** on selection
- **Slash menu** at line start
- **Markdown shortcuts** parsed (`**bold**`, `# heading`)

### 57. Markdown Preview
- **Rendered with Tailwind Typography prose**, brand link colors, code blocks via Shiki
- **Side-by-side editor:** writing pane + live preview pane

### 58. Image / File Preview
- **Lightbox:** full-screen overlay, prev/next, zoom, rotate, download, copy link, fit/actual, keyboard nav
- **Inline:** thumbnail with hover zoom

### 59. Audit Log Row
- **Columns:** timestamp · actor (avatar+name) · action (verb badge) · resource link · status (success/failure dot) · IP · tenant chip · 3-dot
- **Click row:** opens slide-over with full event JSON, before/after diff, related events timeline

### 60. Webhook Event Row
- **Columns:** timestamp · event type · status (200/4xx/5xx) · attempts · destination URL · response time · 3-dot (replay, view payload)

### 61. JSON Viewer
- **Collapsible** nested keys, line numbers, search, copy node, copy path, syntax-color (key brand-700, string emerald-700, number amber-700, boolean rose-700, null neutral-500)

### 62. Diff Editor (Monaco)
- **Side-by-side:** original (left) vs modified (right); minimap; navigate next/prev change; word-level highlighting
- **Used in:** legal documents, notification templates, formula editor


---

## 0.6 Iconography

- **Library:** Lucide React, ~1,400+ icons
- **Sizes:** 12, 14, 16 (default for inline), 18 (sidebar nav), 20, 24 (page icons), 32 (empty states/illustrations), 48 (hero)
- **Stroke width:** 1.5 default, 2 for emphasis (active sidebar item, alerts), 1.25 for decorative XL
- **Color:** inherit from text token by default; semantic colors when communicating status
- **Custom icons (industry-specific):** banner-roll, vinyl-roll, screen-press, dtg-press, embroidery-hoop, heat-press, plotter-cutter, vinyl-cutter, channel-letter, ada-sign, yard-sign, vehicle-wrap, business-card, brochure, sticker, magnet, t-shirt-template, hoodie-template, cap-template, color-swatch-fan, pantone-chip, proof-stamp
- **File format:** SVG, single-color (currentColor stroke), 24×24 viewBox; provided as React components

---

## 0.7 Motion & Animation

- **Easing tokens:**
  - `ease-out` `cubic-bezier(0, 0, 0.2, 1)` — entrances, opens
  - `ease-in` `cubic-bezier(0.4, 0, 1, 1)` — exits, closes
  - `ease-in-out` `cubic-bezier(0.4, 0, 0.2, 1)` — movement, scrolls
  - `ease-bounce` `cubic-bezier(0.68, -0.55, 0.27, 1.55)` — celebratory only
- **Duration tokens:** 75ms (micro hover), 150ms (button states), 200ms (most transitions, default), 300ms (modals, drawers), 500ms (page reveals), 700ms (skeleton shimmer half-cycle)
- **Common transitions:**
  - Fade: opacity 0↔1, 200ms ease-out
  - Slide-in (drawer): translateX 100%↔0, 300ms ease-out
  - Scale (modal): scale 0.96↔1 + opacity, 200ms ease-out
  - Accordion: height auto with FLIP technique, 200ms ease-out
  - Toast: slide-in-from-top + fade, 200ms; auto-dismiss with progress bar
- **Reduced motion:** `prefers-reduced-motion: reduce` disables all transforms; opacity transitions kept ≤100ms; no auto-playing animations or shimmer; loading states fall back to static "Loading…" text

---

## 0.8 Interaction & States

- **Focus rings:** 2px solid brand-600, 2px offset (transparent), shadow-focus halo; never `outline: none` without replacement
- **Hover depth shifts:** non-interactive surfaces: bg shift one tier (subtle→muted); interactive cards: shadow-sm→shadow-md + 1px translateY
- **Active depth:** translateY +1px, shadow reduces to none (pressed feel)
- **Disabled:** opacity 0.5, `cursor: not-allowed`, no hover/focus styling, `aria-disabled="true"`
- **Loading:** prefer skeletons over spinners for content; spinners only inside buttons or for <500ms operations
- **Error states:** rose ring + icon + message below; never block entire page on field-level error
- **Selection states:** brand-50 bg + 3px brand-600 left accent for table rows; ring-2 brand-500 for cards
- **Drag states:** dragging element 50% opacity + brand-600 dashed outline; drop target brand-50 bg + brand-300 border solid

---

## 0.9 Data Visualization Standards

- **Chart heights:** 240/320/480/640px (sm/md/lg/xl)
- **Padding:** 16px top, 24px right, 32px bottom (axis labels), 48px left (axis labels)
- **Axis style:** neutral-500 11px tabular-nums, with 11px label, no axis line by default (ticks only)
- **Tooltip:** dark bg-inverse, 12px padding, 4px gap between rows, swatch dot 8px, tabular-nums values
- **Legend placement:** bottom-center for ≤4 series; right-side scrollable for >4
- **Color-blind safety:** every color pairing tested with deuteranopia / protanopia; never rely on red-vs-green alone — pair with shape/icon
- **Number format:** `Intl.NumberFormat`; abbreviate ≥10K as 12.3K, ≥1M as 1.2M, ≥1B as 1.2B; always show full in tooltip; currency: `Intl.NumberFormat(locale, {style:'currency', currency})`; percent: 1 decimal default
- **Date format on axes:** auto-density "Apr 29" / "Apr" / "2026 Q2" / "2026" depending on range

---

## 0.10 Accessibility

- **Standard:** WCAG 2.2 AA minimum, AAA targeted for text where possible
- **Contrast ratios required:**
  - Body text on bg-base: ≥7:1 (AAA) — primary text neutral-900 on white = 18.7:1 ✓
  - Secondary text on bg-base: ≥4.5:1 (AA) — neutral-600 on white = 7.7:1 ✓
  - Disabled text: not required to meet contrast, but ≥3:1 ideal
  - Interactive borders: ≥3:1 against adjacent surfaces
  - Focus rings: ≥3:1 against any background
- **Keyboard navigation:**
  - Every interactive element reachable via Tab; logical tab order
  - Skip-to-content link (visible on focus) at top of every page
  - All shortcuts documented and customizable in `/admin/me/shortcuts`
  - Esc closes any open modal/popover/dropdown; arrow keys navigate menus
  - Tables: arrow keys move cells (data-grid mode), Space toggles row select, Shift+Click range select
- **ARIA patterns:**
  - Modals: `role="dialog"`, `aria-modal="true"`, `aria-labelledby`/`aria-describedby`, focus trap, return focus
  - Tables: `<table>` semantics with `<th scope>`, `aria-sort` on sortable columns, `aria-rowcount`/`aria-rowindex` for virtualized
  - Tabs: `role="tablist"`, `role="tab"`, `aria-selected`, `aria-controls`
  - Live regions: `aria-live="polite"` for toasts, `aria-live="assertive"` for errors, `role="status"` for status pills
  - Forms: every input has `<label>` or `aria-label`; errors via `aria-describedby` and `aria-invalid="true"`
- **Screen reader announcements:**
  - Page load: page title announced via document title change
  - Toasts: announced via live region
  - Async loads: "Loading [resource]" → "[resource] loaded"
  - Sort/filter changes: "Sorted by X ascending. Showing N results"

---

## 0.11 Voice & Microcopy

- **Button labels:** verb + object, sentence case ("Save changes," "Delete tenant," "Send invite"); never "OK"/"Yes"/"Submit" alone
- **Empty states:** explain absence + suggest first action ("No tenants yet — invite your first sign shop to get started"); friendly, not whimsical
- **Error messages:** state what happened + how to fix; never blame user. Bad: "Invalid email." Good: "Add an @ and domain (e.g., name@company.com)."
- **Confirmation copy template:**
  - Title: "Delete [resource]?"
  - Body: "This action permanently removes [resource name]. [Consequences sentence: e.g., "60 invoices and all related data will be retained for 7 years for compliance, but the tenant will lose access immediately."] Type the tenant's slug to confirm."
  - Confirm button label: matches verb (e.g., "Delete tenant")
- **Tone for sensitive areas:** Billing copy is precise and neutral; security copy is calm and clear; data privacy copy is warm and reassuring
- **Pluralization:** always use proper plurals via `Intl.PluralRules`; "1 user" / "2 users"

---

## 0.12 Layout Templates

### App Shell
- **Structure:**
  - Top bar (56px, sticky)
  - Below top bar: flex row
    - Sidebar (240px / 64px collapsed, sticky, scrollable)
    - Main content (flex-1, overflow auto)
  - Optional impersonation banner pinned above top bar (40px h, full-width, brand-600 bg)
  - Optional environment banner (Staging/Sandbox) below top bar (28px h, amber bg)

### List Page Template
1. Breadcrumb (24px h)
2. Page title row (64px h): H1 + subtitle on left, action buttons on right
3. KPI strip (optional, 96px h): 4–6 stat cards
4. Tab bar (optional)
5. Filter/Toolbar (56px h): search · filter chips · view selector · density · columns · export · saved views
6. Selection bar (only when rows selected): "N selected" + bulk action buttons + clear
7. Data table (flex-1)
8. Pagination footer (56px h): "Showing X-Y of Z" + per-page + nav

### Detail Page Template
1. Breadcrumb
2. Page title row: subject avatar + name (H1) + status pill + key meta chips · right: action buttons + 3-dot
3. Optional alert banners (e.g., "Past due — payment retried in 2 days")
4. Tab bar (sticky)
5. Two-column body: main 2/3 + right rail 1/3 with summary, quick actions, related links
6. Tab content panels

### Settings Page Template
- Two-column: left nav (settings categories, sticky) · right content panel (24px gutter)
- Each setting card: heading + description + control + helper + save inline (auto-save with toast confirmation)

### Wizard Template
- Stepper top (or left rail)
- Content panel center, max-width 720px
- Footer: Cancel · Save draft · Back · Next/Finish

### Empty/Zero State Template
- Centered content, max-width 480px
- 240×180 illustration
- H3 heading
- body-m description
- Primary CTA + secondary "Learn more"

### Error Page Template
- 404: "Page not found" + illustration of misplaced sign + back / home / contact support
- 403: "You don't have access" + lock illustration + request access form + log out
- 500: "Something went wrong" + retry button + status page link + reference ID
- 503: "Maintenance in progress" + ETA + status page link
- Network error: inline retry component

---

# Section: Overview

## Page 1. Dashboard

- **Route:** `/admin/dashboard`
- **Purpose:** Daily-driver landing page; gives the platform owner an at-a-glance view of revenue, growth, tenant health, support load, and system status with one-click drill-downs into detailed reports.
- **Layout grid:**
  - Row 1 (welcome): full-width, 80px h
  - Row 2 (KPI primary): 6 cards, 12-col grid, 2 cols each, 132px h
  - Row 3 (KPI secondary): 4 cards, 12-col grid, 3 cols each, 132px h
  - Row 4: MRR/ARR area chart (8 cols, 360px h) + Tenant Growth bar chart (4 cols, 360px h)
  - Row 5: Revenue by Plan donut (4 cols, 320px h) + Top 10 Tenants table (8 cols, 320px h)
  - Row 6: Tenants at Risk widget (6 cols, 320px h) + Activity Feed (6 cols, 320px h)
  - Row 7: System Health (4 cols, 280px h) + Geographic distribution map (8 cols, 280px h)
  - Row 8: Recent Signups (6 cols, 320px h) + Recent Cancellations (6 cols, 320px h)

### Header / Page title row
- **Welcome row:** Greeting "Good morning, [Admin first name]" (display-l), subtitle "Wednesday, April 29, 2026 · 9:42 AM PDT" (body-m, neutral-600), right-aligned: environment pill + "What's new" mini-changelog widget (clickable, shows latest 3 release notes)
- **Page title row:** H1 "Dashboard" hidden if welcome row present; right-aligned controls:
  - Date range picker (default Last 30d)
  - Comparison toggle (vs. previous period / vs. same period last year / off)
  - Refresh button (icon-only, with auto-refresh dropdown: Off, 30s, 1m, 5m)
  - "Customize layout" button (opens drag-drop edit mode)
  - Export dashboard button (PDF, share link, scheduled email)
  - 3-dot menu: Reset layout, Save current as default, Share dashboard, Embed

### KPI primary cards (row 2)
1. **MRR**
   - Metric: `$XXX,XXX` (USD)
   - Delta: vs. previous period, e.g., `+8.3%` (emerald) or `−2.1%` (rose) or `0.0%` (neutral)
   - Sparkline: 32px h line chart, last 30 data points, brand-600 stroke
   - Tooltip on metric: "Monthly Recurring Revenue · Sum of all active subscription monthly amounts"
   - Click → `/admin/billing/analytics` filtered to MRR
2. **ARR** — same structure; metric in $; tooltip "Annual Recurring Revenue = MRR × 12"
3. **Active Tenants** — count of tenants with status = active OR trialing; sparkline = daily active count; click → `/admin/tenants?status=active`
4. **New Tenants (this period)** — count signed up in window; sparkline = daily new
5. **Churn Rate** — `X.X%`; tooltip explains formula (cancelled MRR / starting MRR for period); click → `/admin/tenants/churn`
6. **Total Revenue (this period)** — sum of paid invoices; sparkline = daily revenue; click → `/admin/billing/payments`

### KPI secondary cards (row 3)
1. **Open Support Tickets** — count split into priority breakdown bar (P1/P2/P3/P4 segments) + SLA breach count badge; tooltip "X breaching SLA"; click → `/admin/operations/tickets`
2. **Active Users (DAU/WAU/MAU)** — toggle inside card; metric = current DAU/WAU/MAU; sparkline; tooltip explains; click → `/admin/users`
3. **Trial → Paid Conversion %** — `X.X%`; sparkline of monthly conversion rates; click → `/admin/tenants/onboarding`
4. **Net Revenue Retention** — `XXX%`; benchmark indicator (>100% green check, <100% amber alert)

### Charts / Visualizations

#### MRR/ARR Area Chart (row 4 left)
- **Type:** Area chart, single or stacked-by-plan toggle
- **X-axis:** dates (auto-density based on range)
- **Y-axis:** USD with K/M abbreviation, gridlines every quarter
- **Series:** when stacked: one per plan (Starter, Growth, Pro, Enterprise) using categorical palette
- **Comparison:** dashed prior-period overlay (when toggle on)
- **Tooltip:** date · total · per-plan breakdown
- **Time-range selector:** above chart (24h / 7d / 30d / 90d / 12m / Custom) — synced with global date range
- **Legend:** bottom, click to toggle series
- **Goal line:** optional dashed brand-300 line at user-set goal value
- **Annotations:** vertical lines on big events (price change, marketing campaign launch) — set in `/admin/marketing/campaigns`
- **Download:** PNG, SVG, CSV

#### Tenant Growth chart (row 4 right)
- **Type:** Stacked vertical bar (positive: new tenants, negative: churned tenants) + line overlay (net new)
- **X-axis:** Last 12 months (or selected range)
- **Y-axis left:** count; Y-axis right: net new line
- **Colors:** new = emerald-500, churned = rose-500, net = brand-600
- **Tooltip:** month · new · churned · net
- **Click bar:** drills to tenants list filtered to that month/event

#### Revenue by Plan Donut (row 5 left)
- **Type:** Donut, center metric = total revenue, sub-label = "this period"
- **Slices:** Starter, Growth, Pro, Enterprise, Add-ons, Overages — categorical palette
- **Legend:** right side with $ + % per slice, click to highlight slice (others fade to 30%)
- **Tooltip:** plan · revenue · % of total · # of subscriptions

### Tables

#### Top 10 Tenants by Revenue (row 5 right)
- **Columns:**

| Column | Type | Notes |
|--------|------|-------|
| Rank | number | 1–10 |
| Tenant | avatar + name | clickable |
| Plan | badge | colored by plan |
| MRR | currency | tabular |
| Last activity | relative time | "2h ago" |
| Health score | circular badge 0–100 | colored emerald ≥80, amber 50–79, rose <50 |
| Status | status pill | |

- **Row click:** opens tenant detail page in new tab modifier or same tab
- **Footer link:** "View all tenants →"

#### Recent Signups (row 8 left)
- **Columns:** Tenant · Plan (or "Trial") · Owner email · Country · Signed up (relative)
- **Click row:** tenant detail
- **Footer:** "View onboarding pipeline →"

#### Recent Cancellations (row 8 right)
- **Columns:** Tenant · Was on plan · MRR lost · Reason category · Cancelled date · Open in tenant detail
- **Footer:** "View churn report →"

### Widgets

#### Tenants at Risk (row 6 left)
- **List:** up to 10 tenants flagged by churn risk model
- **Per row:** logo + tenant name + risk reasons chips (e.g., "No login >30d," "Payment failed 2x," "Low NPS") + risk score 0–100 (rose) + actions (Send email, Schedule call, Assign CSM, Mark as engaged)
- **Footer:** "View all at-risk →"

#### Activity Feed (row 6 right)
- **Items:** last 20 events; live-streamed via WebSocket
- **Per item:** actor avatar + verb summary + tenant chip + timestamp + click → audit log entry
- **Filters:** chip group at top (All, Signups, Upgrades, Downgrades, Cancellations, Big payments, Support escalations)
- **Footer:** "Open full activity feed →"

#### System Health (row 7 left)
- **Mini-stat list with status dots:**
  - Uptime (last 30d): `XX.XX%` (emerald if ≥99.95)
  - API p95 latency: `XXX ms` (emerald <300, amber 300–800, rose >800)
  - Error rate: `0.0X%` (emerald <0.5%, amber 0.5–2%, rose >2%)
  - Queue depth: count (emerald <100, amber 100–1000, rose >1000)
  - DB connections: used/total
- **Footer:** "View system status →"

#### Geographic distribution map (row 7 right)
- **Type:** World map (vector), choropleth of tenant count + bubble overlay sized by revenue
- **Legend:** count gradient + bubble size key
- **Tooltip on country:** country · tenant count · MRR · top 3 tenants
- **Click country:** filters all dashboard widgets to that country (or opens drilldown)

### Date range selector
- Top-right: Today · Yesterday · Last 7d · Last 30d (default) · Last 90d · Last 12m · YTD · Custom (opens range picker)

### Customization
- Each widget has hover-revealed: drag handle, resize handles (when in edit mode), 3-dot menu (Hide widget, Settings, Pin to top, Move to…)
- "Customize layout" enters edit mode: dotted grid overlay; widgets become draggable cards with resize handles (snaps to 12-col grid); save / cancel toolbar pinned bottom
- Layout is persisted per admin (Postgres `admin_dashboard_layouts`)

### Refresh / real-time
- Auto-refresh interval selector (Off, 30s, 1m, 5m)
- WebSocket subscription for: Activity Feed, Tenants at Risk score updates, System Health metrics, KPI deltas (debounced 5s)
- Manual refresh button

### Export
- "Export PDF" generates branded report with all widgets in current state + date range header
- "Share link" creates read-only token URL (expires in 24h, configurable)
- "Schedule email" opens modal: recipients, frequency (daily/weekly/monthly), time, format (PDF/inline HTML)

### Permissions
- Visible to: Super Admin, Admin, Finance Manager, CSM (limited to non-financial widgets), Read-Only Auditor
- Customization disabled for Read-Only Auditor

### Empty state
- For brand-new platform with no data: "Welcome to Flowtora Admin. Once tenants sign up, your dashboard will populate. In the meantime, try out the Demo Data toggle in Settings."

---

## Page 2. Activity Feed

- **Route:** `/admin/activity`
- **Purpose:** Live, infinite-scroll event stream of every meaningful platform event with rich filtering, grouping, and subscription.
- **Layout grid:** 12-col with 8-col main feed + 4-col right rail (filters & subscriptions)

### Header
- H1 "Activity Feed" + subtitle "Live event stream across all tenants"
- Right: "Subscribe to filter" (creates email/Slack subscription for current filter set), "Export" (CSV/JSON of current filtered view), "Pause live" toggle

### Filters / Toolbar
- Search by event content
- **Filter chips:**
  - Event type (multi-select): Tenant created, Tenant suspended, Tenant cancelled, Subscription started/upgraded/downgraded/canceled, Payment succeeded/failed/refunded, User signed up/login/logout, MFA enabled/disabled, SSO config changed, Feature flag toggled, Coupon applied, Big payment (>$X), Support ticket escalated, Webhook failed, API key rotated, Impersonation started/ended, Data export requested, Backup completed, Incident declared, etc.
  - Severity (multi): Info, Notice, Warning, Critical
  - Tenant (combobox)
  - User / actor (combobox)
  - Date range
  - IP/CIDR
  - Country
  - Source (Web, API, Webhook, System, Background job)
- "Save current view" → adds to saved views; "Reset filters"
- View selector: Saved views dropdown (My views, Team views)

### Grouping options
- Toggle: Flat / Grouped by hour / Grouped by tenant / Grouped by event type

### Feed body
- **Item anatomy:** actor avatar (24) → verb-led summary (e.g., "**Acme Signs** upgraded from Growth to Pro") → meta line (timestamp · tenant chip · IP · user agent abbrev · source pill) → expandable diff button
- **Click expand:** reveals before/after JSON diff in collapsed code block
- **Inline actions:** open audit entry, open tenant, copy event ID, subscribe to similar
- **Live indicator:** small pulsing dot at top + "X new events" pill (click to scroll to top)
- **Infinite scroll:** load 50 at a time; sentinel triggers load
- **Date dividers:** sticky "Today" / "Yesterday" / "Tuesday Apr 28" headings

### Right rail
- **Active subscriptions panel:** list of email/Slack subscriptions you've created (filter description + delivery channel + edit/delete)
- **Quick filter presets:** "Big payments today," "Failed payments," "Cancellations this week," "Suspicious logins"
- **Mini-chart:** events per minute for last 60 minutes (sparkline area)

### Empty state
- "No events match these filters. Try clearing filters or expanding the date range."

### Real-time
- WebSocket stream; debounced UI updates 1s; pause/resume; auto-pauses if user scrolled away from top

### Export
- CSV / JSON / NDJSON of current filtered set; max 100k rows; >100k must use scheduled email export with link

### Permissions
- Super Admin sees all; Admin sees all; Support Agent sees Tenant + Support events; Finance sees Billing events; Auditor sees all read-only


---

## Page 3. Reports & Insights

- **Route:** `/admin/reports`
- **Purpose:** Library of saved and pre-built reports with drill-down, scheduling, and exports.
- **Layout:** Two-column — left rail (report categories) + main content (report library or selected report)

### Header
- H1 "Reports & Insights" · subtitle "Build, save, and schedule reports"
- Actions: "New report" (primary, opens builder), "Browse templates" (secondary), "Scheduled reports" (link to manage schedules)

### Left rail — categories
- All reports
- My reports
- Team reports
- Pinned
- Categories: Financials, Subscriptions, Tenants, Cohorts, Funnels, Feature adoption, Engagement, Industry benchmarks, Support, Operations, Security, Custom
- Each with count badge

### Library view (when no report selected)
- **Toolbar:** search reports, filter by category/owner/last run, sort (Recently run, Recently created, Most viewed, A–Z)
- **Grid:** report cards (3 cols on desktop). Each card: report icon + name + description + chart preview thumbnail + last run timestamp + favorited star + 3-dot menu (Open, Duplicate, Schedule, Share, Delete)
- **Pre-built reports list (always shown):**
  1. MRR Movement Waterfall
  2. ARR Trend (12m)
  3. Churn Analysis (gross, net, revenue, logo)
  4. Cohort Retention Heatmap
  5. Onboarding Funnel
  6. Trial Conversion Funnel
  7. Feature Adoption Matrix (feature × plan × usage)
  8. NPS Trend
  9. Top Customer Lifetime Value
  10. Plan Migration Sankey
  11. Revenue by Region
  12. Tax Liability by Jurisdiction
  13. Support Ticket SLA Compliance
  14. Bug Report Volume by Module
  15. API Usage by Tenant
  16. Storage Growth by Tenant
  17. Failed Payment Recovery Funnel
  18. Coupon Performance
  19. Affiliate Earnings
  20. Industry Vertical Benchmarks (sign vs print vs apparel vs promo)

### Selected report view
- **Header:** report name (editable inline) + description + favorited star + last run + owner avatar; right: "Run now," "Schedule," "Share," "Export," "Duplicate," 3-dot
- **Filter bar:** date range + comparison + dimensions (tenant, plan, region, etc.) + measures
- **Visualization area:** primary chart (per report type) + supporting charts
- **Data table below:** raw rows with sort/export
- **Insights panel right:** auto-generated callouts ("MRR grew 8.3% — fastest growth in 6 months," "Churn spike from 3 enterprise tenants in March")

### Report builder
- **3-pane editor:** Data sources → Configure (filters, dimensions, measures, time grain) → Visualize (chart type chooser, formatting)
- **Save options:** name, description, category, share with team(s), pin to dashboard, tags
- **Versioning:** every save is versioned; revert button

### Scheduled deliveries
- **Modal:** recipients (email chips, Slack channels), format (PDF, CSV, inline HTML), frequency (daily, weekly with day picker, monthly with date, custom CRON), time, timezone, attached filter snapshot
- **Active schedules** listed in a tab on this page

### Empty state
- "No reports yet. Start with a template or build from scratch."

### Permissions
- All admins see pre-built; Editor (Admin/Finance) can create; Auditor can run but not edit; sharing scoped per-team


---

# Section: Tenants

## Page 4. Tenants — List

- **Route:** `/admin/tenants`
- **Purpose:** Master directory of every sign/print shop tenant on the platform with deep filtering, bulk actions, and quick navigation to detail.
- **Layout grid:** Standard list page template

### Header
- H1 "Tenants" · subtitle "All sign & print shop accounts on Flowtora"
- Right actions: "+ New tenant" (primary, opens manual provisioning wizard) · "Import CSV" (secondary) · "Export" (CSV/Excel/JSON) · 3-dot (Bulk email, Bulk tag, Bulk plan change, Refresh health scores)

### KPI strip (4 cards)
1. Total tenants — count + delta vs prior period + sparkline
2. Active — count + % of total
3. Trialing — count + median days remaining
4. Past due — count + total $ at risk

### Tabs (saved views)
- All · Active · Trial · At-Risk · Past Due · Cancelled · Enterprise · My CSM book · Recently created (last 30d) · Custom views (user-saved)
- Tab right of the bar: "+ Save current as view"

### Filter / Toolbar
- Search by name, slug, domain, owner email, billing email, ID
- **Filter chips (add via "+ Add filter"):**
  - Plan (multi: Starter, Growth, Pro, Enterprise, Custom)
  - Status (multi: Active, Trialing, Past Due, Suspended, Cancelled, Pending verification)
  - Country (multi)
  - Industry vertical (Sign shop, Print shop, Apparel/screen-print, Embroidery, Promo products, Trade printer, Wide-format only, Multi-discipline)
  - Created (date range)
  - MRR range ($ slider)
  - Health score range (0–100 slider)
  - Has past-due (boolean)
  - Has integrations (any/specific)
  - Trial expires within (N days)
  - Owner email contains
  - Has custom domain (boolean)
  - SSO enabled (boolean)
  - MFA enforced (boolean)
  - Last activity (date range / relative)
  - Account manager (combobox)
  - Tags (multi)
  - Storage used (range)
  - Users count (range)
  - Jobs/month (range)
- View selector · Density toggle · Columns toggle · Saved views

### Bulk actions (appear when rows selected)
- Email selected · Add tag · Remove tag · Suspend · Reactivate · Move plan · Apply coupon · Assign CSM · Export selected · Delete (typed confirmation)

### Table columns (default)

| Column | Type | Behavior |
|--------|------|----------|
| Checkbox | selection | bulk select |
| Logo/Avatar | image | initials fallback |
| Tenant name | text | sortable, searchable, click → detail |
| Slug | text | monospace, copy-on-click |
| Plan | badge | sortable, filterable |
| Status | status pill | sortable, filterable |
| MRR | currency | sortable, right-aligned |
| Users | number | sortable |
| Jobs (this month) | number | sortable |
| Health score | circular badge 0–100 | sortable, color-coded |
| Created | date | sortable |
| Last activity | relative time | sortable, tooltip exact |
| Owner email | text | mailto link |
| Country | flag + ISO | filterable |
| Tags | chips | overflow "+N" |
| Account manager | avatar+name | filterable |
| Actions | 3-dot menu | per-row |

- **Optional columns (toggle visible):** Trial ends, Currency, Custom domain, SSO provider, Last invoice $, Lifetime value, Storage used, API calls (30d), NPS, Industry, Source (referral/paid/organic), Notes count
- **Inline 3-dot menu actions:** Open · Impersonate · Send email · Edit plan · Apply credit · Suspend · Add note · Add tag · Copy ID · Open in Stripe

### Row interactions
- Click row → tenant detail page
- Cmd/Ctrl-click → open in new tab
- Hover → reveal "Quick view" (eye) icon → opens slide-over preview

### Quick view slide-over
- Header: logo + name + status pill + "Open detail" link
- Sections: Key metrics (MRR, users, jobs, health), Recent activity (last 5), Owner contact, Quick actions (Impersonate, Email, Note)

### Empty state
- "No tenants yet. Add your first sign or print shop manually, or wait for signups."

### Real-time
- Live MRR / Active counts in KPI strip; new signups push to top of list (with subtle highlight 3s)

### Export
- CSV (all visible columns), Excel (multi-sheet with users sub-sheet), JSON; respects current filters

### Permissions
- Super Admin / Admin: full
- CSM: read all + impersonate + notes
- Support Agent: read all + impersonate (with reason)
- Finance: read all + billing actions
- Auditor: read all

---

## Page 4a. Tenant Detail

- **Route:** `/admin/tenants/[id]`
- **Purpose:** Comprehensive 360° view of a single tenant with every operational, financial, and relational detail accessible.
- **Layout grid:** Detail page template (header + tabs + 2/3 main + 1/3 right rail)

### Header / Page title row
- Logo (48px) + tenant name (H1) + slug (monospace caption with copy) + status pill + plan badge + key meta chips (MRR, Users, Country) + "VIP" star (if flagged)
- Right actions: "Impersonate" (primary, brand-600 with reason modal) · "Send email" (secondary) · "Add note" (secondary) · "Create ticket" (secondary) · 3-dot (Apply credit, Issue refund, Schedule call, Mark VIP, Suspend, Cancel, Transfer ownership, Delete tenant)

### Right rail (sticky)
- **At-a-glance card:** Plan · MRR · LTV · Health score (with mini-bar) · Trial ends (if trialing)
- **Quick actions:** Impersonate · Send email · Add note · Create ticket · Schedule call · Apply credit · Mark VIP · Open Stripe · Open Intercom
- **CSM card:** assigned manager avatar + reassign + last touch
- **Tags card:** chips + "+ Add tag"
- **Linked records:** Stripe customer · HubSpot company · Intercom user · GitHub org (if integrated)
- **Recently viewed by team** (last 3 admins who looked at this tenant + timestamps)

### Tabs

#### Tab 1: Overview
- **Sections:**
  - Profile card: legal name, DBA, address (Google Places autocomplete on edit), phone, website, primary domain, custom domains list with status, time zone, currency, tax ID
  - Account ownership: owner contact (avatar, name, email, phone, role), billing email, technical contact, account manager (admin team), reseller/partner if applicable
  - Plan & subscription summary: plan name, billing cycle, next renewal, payment method (last 4), MRR, ARR, lifetime value, trial info
  - Key metrics tiles: Users, Active customers (their clients), Jobs YTD, Storage used vs limit, API calls (30d) vs limit, Integrations connected count
  - Health score breakdown: total + sub-scores (login, feature adoption, payment health, support sentiment, NPS, integration usage) — each with mini progress bar
  - Recent activity timeline: last 30 events scoped to tenant
  - Notes panel: pinned notes (sticky) + recent notes; "+ Add note" (rich text + @mentions)
  - Tags
  - Source / acquisition: signup source, referrer, campaign, first-touch attribution

#### Tab 2: Users
- **Toolbar:** search, filter (role, status, MFA, last login), "+ Invite user" (sends invite on tenant's behalf)
- **Table columns:**

| Column | Type |
|--------|------|
| Avatar + Name | text |
| Email | text + mailto |
| Role | badge (Owner, Admin, Sales, Production, Designer, Accounting, Customer Service, Custom) |
| Status | pill (Active, Invited, Suspended) |
| MFA | dot (enabled/disabled) |
| Last login | relative |
| Sessions | count |
| Jobs created | count |
| Created | date |
| Actions | 3-dot |

- **Per-row actions:** Impersonate this user · Reset password · Force MFA setup · Resend invite · Revoke session · Change role · Deactivate · View activity
- **Bulk actions:** Force MFA, Reset passwords, Email selected, Deactivate

#### Tab 3: Billing
- **Sub-sections:**
  - Current subscription: plan, cycle (monthly/annual), seats, next renewal $, next renewal date, proration preview if changes pending, scheduled changes ("Plan downgrades to Growth on Jun 1")
  - Payment method: card brand+last 4, expiry, billing address, "Update card on file" link, alternate methods (ACH, wire, invoice billing)
  - Upcoming invoice preview: line items, taxes, discounts, total
  - Invoice history table: # · status pill · amount · issued · due · paid · PDF download · Send/Resend · Void · Mark uncollectible
  - Usage metering chart: API calls, storage, custom domains, jobs — each with limit line and overage warning
  - Credits balance + ledger: positive credits and used credits
  - Coupons applied: active + history
  - Tax handling: tax ID, tax-exempt status, jurisdiction-specific rates
  - Actions: Change plan (opens proration preview modal), Apply coupon (search + apply), Issue credit (amount + reason + note), Refund last payment (full/partial + reason), Retry failed payment, Pause subscription (with date), Cancel subscription (immediate or end of term + reason categorization), Reactivate

#### Tab 4: Usage & Limits
- **Per-feature usage card** (one per metered feature):
  - Storage: used (GB) vs limit (GB), bar chart with overage threshold, monthly trend line, top 10 largest files
  - API calls: per-day bar chart (30d), top endpoints, current rate vs rate-limit
  - Users seats: used vs included
  - Jobs/month: trend, average $ per job
  - Custom domains: count vs allowed, list with status
  - Integrations enabled: count vs allowed, list
  - Webhooks: subscriptions count, deliveries (30d), failures
  - Email sends (transactional, marketing): count vs allowance
- **Overage alerts:** banner if any feature >80% / >100%
- **"Adjust limits" action:** override per-tenant limits

#### Tab 5: Jobs / Orders (read-only with PII redaction unless impersonating)
- Aggregate metrics tiles: total quotes, work orders, completed jobs, average ticket, jobs in production, late jobs
- **Table:** job # · type (quote/order/work order/invoice) · customer (redacted as "C-XXXX" unless impersonating) · status · total · created · last activity
- Filters: type, status, date range
- **Click row:** opens redacted summary slide-over (line items count, total, status timeline) — to see full job, "Impersonate to view"

#### Tab 6: Customers (their end-clients, read-only counts)
- Total customers · new this month · top 10 by lifetime spend (anonymized when not impersonating)
- Trend chart of customer growth

#### Tab 7: Catalog
- **Sub-tabs:** Products · Materials · Equipment · Pricing formulas
- Per sub-tab: count + table (read-only) of what tenant has configured; visual badges showing which were created from master templates vs custom
- "Push update from master template" action available for items derived from master catalog

#### Tab 8: Integrations
- Cards for each integration: logo, name, status (Connected/Disconnected/Error), last sync, sync stats (records synced, errors), tenant scope (which sub-feature), "Open settings" / "Force resync" / "Disconnect" actions
- Master integrations: QuickBooks, Xero, Stripe, Square, Shopify, WooCommerce, Etsy, Amazon, Twilio, Mailchimp, HubSpot, Salesforce, Slack, MS Teams, Google Workspace, M365, ShipStation, EasyPost, FedEx, UPS, USPS, DHL, Avalara, TaxJar, DocuSign, PandaDoc

#### Tab 9: Feature Flags
- Table of feature flags with per-tenant override:

| Flag | Default | This tenant override | Set by | Set at | Actions |
|------|---------|---------------------|--------|--------|---------|

- Toggle override on/off (with reason field), revert to default
- Bulk actions for plan-tier defaults

#### Tab 10: Branding
- Uploaded logo (light + dark variants), favicon, brand colors, custom email footer, custom domain status (DNS records, verification, SSL)
- White-label settings: "Powered by Flowtora" toggle, custom email from address, sender DKIM/SPF status
- Preview pane: rendered storefront/login screen with tenant branding

#### Tab 11: Communications
- **Sub-tabs:** Emails sent, SMS, In-app notifications, Support history, NPS responses
- **Emails sent:** table of subject · template · sent at · status (sent/delivered/opened/clicked/bounced) · recipient
- **NPS responses:** score over time chart + individual responses with verbatim comments and tags

#### Tab 12: Audit Log
- Embedded audit log scoped to tenant; same filters and detail panel as the global audit log page
- Export this tenant's audit log

#### Tab 13: Security
- MFA enforcement status (% of users with MFA, "Enforce MFA platform-wide" toggle)
- SSO config: enabled/disabled, provider, IdP metadata URL, SCIM endpoint, recent provisioning events
- IP allowlist/blocklist: CIDR entries, last triggered
- Recent suspicious events (rate-limit hits, failed login spikes, geo anomalies)
- Password policy override
- Session policy (max session duration, idle timeout)

#### Tab 14: Health Score
- **Top:** total score (large display-l, 0–100, ring chart)
- **Sub-scores breakdown table:** factor (login frequency, feature breadth, feature depth, payment health, support sentiment, NPS, integration usage, ticket volume, DAU/MAU ratio) · score · weight · trend (sparkline) · notes
- **Trend chart:** 12m line of overall health
- **Driver insights:** "Score dropped 12 points after last bill failed" auto-generated
- "Recompute score" action (with reason)

#### Tab 15: Notes
- CRM-style notes log: rich text + @mentions + file attachments + reactions; pinned section; filter by author/date/topic; convert to ticket; mark private (only this admin sees)

#### Tab 16: Settings / Danger Zone
- General settings: rename, change slug (with redirect retention), change owner (transfer ownership flow)
- Status overrides: Force into trial extension, Mark as VIP, Lock account
- Migration tools: Reset onboarding, Force database migration to latest, Trigger backup, Restore from backup
- **Danger zone (red panel, separator above):**
  - Suspend tenant (typed confirmation, reason)
  - Cancel subscription immediately (typed)
  - Transfer to another reseller/partner
  - Hard delete tenant (typed slug + 2FA, retains data per retention policy, schedules purge)
- Each destructive action: 2-step confirmation modal with consequences explainer + audit-trail note

### Permissions
- Super Admin: all tabs incl. Danger Zone
- Admin: all except hard delete
- CSM: Overview, Users (limited), Communications, Notes, Health Score, Tags
- Support Agent: Overview, Users, Communications, Notes (impersonate with reason)
- Finance: Overview, Billing, Usage, Audit Log
- Auditor: read-only all tabs

---

## Page 5. Onboarding Pipeline

- **Route:** `/admin/tenants/onboarding`
- **Purpose:** Track every signup through activation milestones, identify stuck tenants, and intervene to lift conversion.
- **Layout:** Tab bar (Funnel, Kanban, List), main panel

### Header
- H1 "Onboarding Pipeline" · subtitle "Track signups from creation to activation"
- Actions: "Send nudge campaign" (selects stuck tenants) · "Export funnel" · "Edit funnel definition"

### Funnel definition (default stages)
1. Signed Up
2. Email Verified
3. Workspace Created
4. First Invite Sent
5. First Catalog Item Configured
6. First Customer Added
7. First Quote Created
8. First Job Created
9. First Payment Received
10. Activated (defined by tenant reaching 5 jobs and 2 paying customers)

### KPI strip
- Trials this month · Conversions · Conversion rate % · Avg days to activation · Stuck tenants count

### Funnel tab (default)
- **Funnel chart** (vertical bars stepped, drop-off % shown between stages)
- **Stage detail on click:** opens drawer with list of tenants currently at this stage, days at stage, last activity, send nudge button
- **Comparison overlay:** previous period dashed
- **Filter:** plan, signup source, country, industry vertical, date range

### Kanban tab
- Columns = stages; cards = tenants
- **Card anatomy:** logo + name + days in stage (yellow ≥7, red ≥14) + owner email + small action menu (impersonate, send email, mark stuck, override stage)
- **WIP limits configurable** per column
- Drag to manually advance stage (rare; mostly automated)

### List tab
- Standard table: tenant · stage · days in stage · last activity · health · stuck flag · actions
- Filter: stuck only, current stage

### Stuck tenant alerts
- Banner if >X tenants stuck >7 days
- One-click "Send onboarding nudge sequence" enrolls into drip campaign

### Permissions
- Admin, CSM, Sales

---

## Page 6. Tenant Health Scores

- **Route:** `/admin/tenants/health`
- **Purpose:** Centralized view of tenant health with distribution, trend, and CSM assignment.

### Header
- H1 "Tenant Health Scores" · subtitle "Predict and prioritize tenants needing attention"
- Actions: "Recompute all scores" · "Edit scoring model" · "Export"

### KPI strip
- Avg score · % healthy (≥80) · % at-risk (50–79) · % critical (<50) · scoring model version

### Charts
- **Score distribution histogram:** x-axis 0–100 in bins of 10, y-axis count
- **Score trend over time:** line chart, last 90d
- **Segment heatmap:** rows = plans, columns = score buckets, cell = tenant count

### Toolbar
- Search · filter (plan, segment, CSM, score range, trend direction) · sort

### Table
- Columns: Tenant · Plan · MRR · Score · Score change (Δ vs last week, arrow) · Top risk factor · Last activity · CSM · Actions
- Sort by score asc/desc, change desc

### Scoring model editor (modal)
- Factors with weight sliders (sum to 100), formula preview, version history, A/B test mode
- Factors include: login recency, feature adoption breadth, feature adoption depth, payment health, NPS, ticket sentiment, ticket volume, integration count, monthly active users %, jobs growth, custom factor (SQL)

### Permissions
- Super Admin / Admin: edit model
- CSM: view + manual adjustments with reason
- Auditor: read

---

## Page 7. Churned & At-Risk

- **Route:** `/admin/tenants/churn`
- **Purpose:** Manage tenants predicted to churn and analyze cancellations to drive retention.
- **Layout:** Tabs (At-Risk, Churned, Win-back campaigns)

### Tab: At-Risk
- KPIs: predicted churn next 30/60/90 days · MRR at risk
- Filters: risk window (30/60/90/180), risk score, plan, reason factor
- Table: Tenant · Plan · MRR · Risk score · Days to predicted churn · Top reasons (chips: "no login 35d", "payment failed 2x") · CSM · Actions (Save with retention offer, Schedule call, Apply discount coupon, Mark engaged, Suppress alert)
- "Bulk enroll in retention campaign"

### Tab: Churned
- KPIs: Churn count this period · Churn $ · Voluntary vs involuntary split · % won back
- Cancellation reason donut: Price, Missing feature, Switched competitor (with name), Business closed, Difficult to use, Poor support, Bug/reliability, Other
- Table: Tenant · Plan · MRR lost · Reason · Cancelled date · Verbatim quote · Won back? · Actions (Open detail, Send win-back, Add to anti-churn report)
- Filter: reason category, date range, plan

### Tab: Win-back Campaigns
- Cards for each campaign with status (Draft, Active, Paused, Ended), audience size, opens, replies, won-back count
- "+ New campaign" → opens email/sequence builder

### Permissions
- Admin, CSM, Marketing

---

## Page 8. Impersonation Sessions

- **Route:** `/admin/tenants/impersonation`
- **Purpose:** Audit and govern admin-as-tenant sessions for compliance.
- **Layout:** Tabs (Active, History, Compliance settings)

### Tab: Active
- Live list of currently active impersonation sessions: admin avatar+name · tenant name · started at · duration (live) · reason · IP · "End now" button
- WebSocket live updates

### Tab: History
- Table: Admin · Tenant · Started · Ended · Duration · Reason · Actions taken count · Recording link · Status (Completed, Force-ended, Expired)
- Filters: admin, tenant, date, duration range, has-recording
- Detail drawer: full session with timeline of every action (page navigated, button clicked, mutation made), keystrokes redacted; export as PDF for compliance

### Tab: Compliance settings
- Max session duration (default 60 min)
- Auto-end on idle (15 min)
- Reason required (always)
- Require approval (toggle, plan-tiered or always)
- Approval workflow (designated approvers list)
- Banner copy customization
- Recording retention (90 days default)
- Allowed actions whitelist (e.g., disable destructive actions during impersonation)
- Audit-only mode (read-only impersonation)

### Impersonation flow (everywhere)
- Triggered by "Impersonate" on tenant or user
- Modal: reason (required, freetext + categories: Support investigation, Customer-requested fix, Bug repro, Onboarding assistance, Compliance audit, Other), expected duration, MFA challenge, optional approver selection
- On confirm: 40px persistent banner top of every page (z-impersonation-banner): brand-600 bg, "You are impersonating [Tenant]. Started [time] · [duration] elapsed. [End impersonation] [Add note]"
- Every action is logged to audit + impersonation recording
- Tenant-side: tenant owner receives email "Flowtora support accessed your workspace at [time]"

### Permissions
- Anyone with `tenants.impersonate` permission; logs visible to all admins; settings only Super Admin


---

# Section: Users & Access

## Page 9. All Users

- **Route:** `/admin/users`
- **Purpose:** Cross-tenant directory of every end user with security posture and activity insights.

### Header
- H1 "All Users" · subtitle "Every user across every Flowtora tenant"
- Actions: "Export" · "Bulk MFA enforce" · 3-dot (Force password reset, Reset MFA, Sign out all sessions)

### KPI strip
- Total users · Active (30d) · MFA enabled % · Pending invites · Suspicious activity (24h)

### Filters / Toolbar
- Search by name, email, ID
- Filters: Tenant, Role, Status, MFA enabled, Last login (range), Email verified, Country, Sign-in method (password/Google/Microsoft/SSO)
- Saved views

### Table columns
- Avatar+Name · Email · Tenant(s) (overflow chip) · Role(s) · Status · MFA dot · Last login · Country · Created · Actions
- Inline 3-dot: View profile · Impersonate · Reset password · Reset MFA · Sign out all sessions · Deactivate · Send email · Copy ID

### User detail page (`/admin/users/[id]`)

#### Tabs
1. **Profile:** avatar, name, email (with verified badge), phone (verified), language, timezone, signup method, OAuth identities linked
2. **Tenants:** every tenant they belong to with role, joined date, last active in tenant, actions (remove from tenant, change role)
3. **Sessions:** active sessions (browser, OS, IP, location, last active, "Revoke" button), historical
4. **Activity:** event timeline scoped to user (logins, actions, mutations) with filter
5. **Owned resources:** quotes, jobs, customers they created (count + drill-down)
6. **Security:** MFA methods (TOTP, WebAuthn, SMS), recovery codes status, security keys, recent password changes, suspicious events flagged
7. **Support history:** tickets they've opened or are mentioned in
8. **Notes:** internal CRM notes about this user

### Permissions
- Super Admin / Admin: full
- Support Agent: view + impersonate (with reason)
- CSM: view
- Auditor: read

---

## Page 10. Roles & Permissions

- **Route:** `/admin/access/roles`
- **Purpose:** Manage platform-wide RBAC — both built-in admin roles and tenant-side role templates that ship as defaults.

### Header
- H1 "Roles & Permissions" · subtitle "Built-in and custom roles, with permission matrices"
- Actions: "+ New role" · "Clone role" · "Import role" · "Audit role assignments"

### Tabs
- Platform Admin Roles · Tenant Default Roles · Custom Roles · Permission Catalog

### Tab: Platform Admin Roles
- List with: name · description · # of admins assigned · last modified · variant (Built-in / Custom) · actions
- Built-in roles: Super Admin, Admin, Support Agent, Billing Manager, Read-Only Auditor, Engineer, Sales, CSM
- Click role → detail page

### Role detail page
- Header: role name + description (editable for custom) + assigned admins count
- **Permission matrix grid:** rows = resources (Tenants, Users, Subscriptions, Invoices, Refunds, Plans, Coupons, Tickets, Audit Log, Security, Feature Flags, Integrations, Settings, etc.); columns = actions (Create, Read, Update, Delete, Manage, Export, Impersonate, Approve)
- Cell = checkbox or dot; "Manage" implies all subordinate
- **Inheritance:** "Inherits from" selector (e.g., Custom inherits Admin); inherited cells show in lighter shade
- **Conditions:** per-permission conditions (e.g., "Only own team's tenants," "Only when MFA active in last 24h")
- **Assigned admins** list: avatar+name + remove button
- **Audit history** of permission changes
- Actions: Save · Discard · Clone · Delete (if custom & unassigned) · Export JSON

### Tab: Tenant Default Roles
- Same UI but scoped to roles tenants get (Owner, Admin, Sales, Production, Designer, Accounting, Customer Service, Custom)
- Editing here changes the platform default; tenants can override per-workspace

### Tab: Permission Catalog
- Searchable list of every permission key with description and which roles include it
- "Add custom permission" (engineering-only)

### Permissions
- Edit: Super Admin only
- View: Admin, Auditor

---

## Page 11. Teams

- **Route:** `/admin/access/teams`
- **Purpose:** Internal admin teams (Engineering, Support, Sales, Finance, CSM) with on-call rotations and team mentions.

### Header
- H1 "Teams" · subtitle "Organize platform admins into functional teams"
- Action: "+ New team"

### Table
- Team name · description · members count · permissions inherited · on-call rotation (yes/no) · created · actions

### Team detail page
- Tabs: Members · Permissions · On-call · Activity · Settings
- **Members:** add/remove admins, role within team (Lead, Member)
- **Permissions:** team-level role assignments; team can have multiple roles applied to all members
- **On-call:** rotation calendar (week/2-week schedule), escalation policy (primary, secondary, tertiary), override slots, current on-call (live), notify channels (PagerDuty, Slack, SMS)
- **Activity:** team-attributed events
- **Settings:** name, description, color (for tagging), Slack channel link, email distro list

---

## Page 12. Invitations

- **Route:** `/admin/access/invitations`
- **Purpose:** Manage pending admin invitations to the platform.

### Header
- H1 "Invitations" · "+ Invite admin"

### Filters
- Status (Sent, Opened, Accepted, Expired, Revoked) · Role · Date

### Table
- Invitee email · Role · Team · Invited by · Sent · Expires · Status · Actions (Resend, Change role, Copy link, Revoke)

### Invite admin modal
- Email · Role · Team(s) · Custom message · Expiry (default 7d) · MFA required (default yes) · Send
- Option to invite multiple emails (chip input, comma-separated)

---

## Page 13. Sessions & Devices

- **Route:** `/admin/access/sessions`
- **Purpose:** Visibility into all active platform-admin sessions for security oversight.

### KPI strip
- Active sessions · Unique admins · Sessions on suspicious networks · MFA-active sessions

### Filters
- Admin · Device type · Browser · OS · IP · Country · Last active range · MFA status

### Table
- Admin (avatar+name) · Device (browser+OS icon+version) · IP · Location (city, country, flag) · Started · Last active · MFA method used · Actions (Sign out, Sign out all sessions for this admin, Block IP, Force MFA re-prompt)

### Map widget
- World map with bubbles per session location

### Bulk actions
- Sign out selected · Block IPs

---

## Page 14. Audit Log

- **Route:** `/admin/access/audit`
- **Purpose:** Tamper-evident, append-only log of every admin action for compliance and forensics.

### Header
- H1 "Audit Log" · "Export" · "Subscribe via webhook" · "Configure retention"

### Toolbar / Filters
- Search by event content / actor / target ID
- Filters: Actor (combobox), Tenant, Resource (entity type), Action (verb), Severity, IP / CIDR, Date range, Success/Failure, Source (Web/API/CLI/System)
- Saved views: Sensitive (deletes/permission changes), Failed actions, My actions, This week's super-admin actions

### Table
- Timestamp · Actor (avatar+name+role) · Action (verb badge) · Resource (link to entity) · Status dot · Tenant chip · IP · 3-dot
- Compact density default; row click opens slide-over

### Slide-over detail
- Header: action title + status + close
- **Sections:**
  - Metadata: event ID (copy), correlation ID, request ID, source, user agent, IP, geo, MFA used, session ID
  - Before/after JSON diff (Monaco diff viewer)
  - Related events timeline (other events in same correlation)
  - Permission check trail (which permission allowed this action)
  - Webhook deliveries triggered
  - Replay (engineer-only, with reason; only for idempotent reads)

### Tamper-evidence
- Each row shows hash chain badge; verification via `/admin/access/audit/verify` (compares chain integrity); breaks alert engineering

### Retention configuration modal
- Default 7 years; per-event-type overrides; legal hold flag (prevents deletion)

### Webhook subscription
- Event type filter · destination URL · signing secret · test send

### Export
- CSV / JSON / NDJSON; large exports queued and emailed; signed URL with TTL

### Permissions
- Read: all admins (filtered to authorized scope)
- Webhook subscription mgmt: Super Admin
- Verify hash chain: Super Admin / Engineer

---

# Section: Billing & Revenue

## Page 15. Subscriptions

- **Route:** `/admin/billing/subscriptions`
- **Purpose:** Single source of truth for every subscription on the platform.

### KPI strip
- Active subscriptions · Trialing · Past due · MRR · Avg subscription age · Net new this period

### Filters / Toolbar
- Search (tenant, sub ID)
- Filters: Status (active/trialing/past_due/canceled/paused/incomplete), Plan, Cycle (monthly/annual), Currency, Created range, Trial expiring within, Cancellation scheduled, Has discount, Owner

### Table
- Tenant (logo+name) · Subscription ID (mono, copy) · Plan · Cycle · Status · MRR · Started · Current period end · Trial end · Cancel at period end? · Actions
- Inline 3-dot: Open in tenant detail · Change plan · Apply coupon · Pause · Resume · Cancel · Reactivate · Open in Stripe

### Subscription detail (`/admin/billing/subscriptions/[id]`)
- Header: tenant + plan + status + MRR
- Tabs: Overview (current state, scheduled changes, proration preview), Items (line items, quantities), Discounts & Credits, Invoices, Usage (metered), Activity (subscription events), Settings (cancellation policy, billing anchor, tax behavior)
- Actions: Change plan (proration preview), Apply coupon, Add one-time charge, Issue credit, Pause (until date), Cancel (now or end of period, with reason), Update payment method (sends customer portal link)

### Permissions
- Super Admin / Admin / Finance: full
- CSM: view + apply coupons + retry payments
- Support: view + retry payments
- Auditor: read

---

## Page 16. Invoices

- **Route:** `/admin/billing/invoices`
- **Purpose:** Manage every invoice across all tenants.

### KPI strip
- Total this period · Paid · Open · Past due · Voided · Avg DSO (days sales outstanding)

### Filters
- Search (invoice #, tenant)
- Filters: Status (draft, open, paid, void, uncollectible), Tenant, Plan, Currency, Issued range, Due range, Paid range, Amount range, Has tax, Has discount

### Table
- Invoice # (link) · Tenant · Status pill · Amount · Currency · Issued · Due · Paid date · Source (subscription/manual) · Actions
- Inline 3-dot: View, Download PDF, Send/Resend, Void, Mark paid, Mark uncollectible, Issue credit note, Open in Stripe

### Invoice detail (`/admin/billing/invoices/[id]`)
- Header: invoice # + status + amount + tenant link
- **Sections:**
  - Bill to (tenant address, tax ID)
  - Line items: description · qty · unit price · subtotal · tax · total
  - Subtotal, discounts, tax breakdown by jurisdiction, total
  - Payment history: attempts with status, gateway, fee, net
  - Notes (internal + customer-visible)
  - PDF preview pane (right side)
  - Audit timeline
- Actions: Send/Resend (with custom message), Download PDF, Void with reason, Mark paid (manual offline), Mark uncollectible, Apply credit note, Refund payment, Edit (only if draft)

### Bulk actions
- Send selected · Mark paid · Void · Export

---

## Page 17. Payments & Transactions

- **Route:** `/admin/billing/payments`
- **Purpose:** Every payment attempt, with success/failure analysis.

### KPI strip
- Volume this period · Success rate · Failed count · Avg fee · Net revenue

### Filters
- Status (succeeded, failed, pending, refunded, partial refund, disputed) · Gateway (Stripe, etc.) · Method (card, ACH, wire, SEPA, BACS) · Currency · Tenant · Date range · Amount range · Failure reason code

### Table
- Created · Tenant · Method (card brand+last4 / ACH bank / etc.) · Amount · Currency · Fee · Net · Status · Gateway ID (mono copy) · Invoice link · Failure reason · Actions

### Payment detail drawer
- Full gateway response, risk score, AVS/CVV results, 3DS info, decline code (if failed), refund options, related disputes

### Failed-payment recovery
- "Retry now" button on row
- Bulk retry selected
- Send "Update payment method" email (uses Stripe customer portal link)

### Charts (top of page)
- Payment volume by day (combo: bar = volume, line = success rate)
- Failure reason breakdown donut

---

## Page 18. Refunds & Disputes

- **Route:** `/admin/billing/refunds`
- **Purpose:** Process refunds, manage chargebacks/disputes, track outcomes.
- **Layout:** Tabs (Refunds, Disputes, Chargeback Evidence Library)

### Tab: Refunds
- KPI: refunds this period count + $; refund rate %
- Table: Refund ID · Tenant · Original payment · Refund amount · Reason code (Customer request, Fraud, Duplicate, Subscription mistake, Service issue, Other) · Status (Pending, Succeeded, Failed) · Created · Initiator (admin) · Actions
- "+ New refund" → modal: select payment, full or partial amount, reason, internal note, customer-visible note, "Refund as credit" option, confirm

### Tab: Disputes
- KPI: open disputes · won · lost · win rate % · $ at risk · evidence due soon
- Table: Dispute ID · Tenant · Original payment · Disputed amount · Reason · Status (Needs response, Under review, Won, Lost) · Evidence due · Days remaining · Actions
- Detail page: dispute reason, gateway info, payment context, customer history, transaction logs, "Submit evidence" form (description, supporting docs upload, customer comm export), "Accept dispute" (acknowledge loss), countdown to deadline

### Tab: Chargeback Evidence Library
- Reusable evidence templates and stored documents
- "+ New template" with placeholders for variables (tenant, amount, date)

---

## Page 19. Plans & Pricing

- **Route:** `/admin/billing/plans`
- **Purpose:** Author and version every subscription plan with all features, limits, and pricing.

### Header
- H1 "Plans & Pricing" · "+ New plan" · "Pricing changelog" · "Preview public pricing page"

### Plan list
- Cards or table: plan name · description · monthly price · annual price · status (Active, Draft, Archived, Private) · # of subscriptions · MRR · created · last edited · actions
- Drag-to-reorder (display order on public pricing page)

### Plan editor (`/admin/billing/plans/[id]`)
- **Header:** name (edit) · slug · status pill · "Save" · "Save as draft" · "Archive" · "Duplicate"
- **Tabs:**
  1. **General:** name, slug, public description (markdown), private internal note, target segment, badge ("Most popular," "New," "Custom")
  2. **Pricing:** monthly $, annual $ with annual discount %, currency variants list (USD, EUR, GBP, CAD, AUD, INR, etc.), regional price overrides table, free trial length (days), trial requires card (yes/no), grandfathering rules
  3. **Features:** checklist of feature flags included, with limit values per feature (e.g., 50 GB storage, 10 users, 1000 API/day, 5 custom domains); compare side-by-side with other plans
  4. **Usage limits & overages:** per metered feature: included quantity, overage rate, hard cap toggle, soft alert thresholds (80%, 100%, 120%)
  5. **Add-ons available:** which add-ons can attach to this plan (e.g., extra users, extra storage, premium support)
  6. **Trial settings:** length, included feature gating, conversion CTA copy
  7. **Migration rules:** what happens on upgrade (immediate prorate vs end of period), on downgrade, default cycle
  8. **Visibility:** Public on pricing page, Private (link only), Hidden (only admin can assign), Sales-quoted only
  9. **Tax behavior:** inclusive / exclusive, tax codes (Stripe Tax)
  10. **Versions:** version history list with diff viewer; revert; "What changed" notes
  11. **Audit log:** plan-scoped events
- **Right rail preview:** live pricing card preview as it would appear on the marketing site

### Pricing changelog page
- Timeline of all plan changes; revert capability

---

## Page 20. Coupons & Promotions

- **Route:** `/admin/billing/coupons`
- **Purpose:** Create and track coupons, promo codes, and bundled promotion campaigns.

### Tabs
- Coupons · Promotions · Code Performance

### Tab: Coupons
- KPI: active coupons · redemptions this period · $ discounted
- Table: Code · Name · Type (% off / $ off / free trial extension / free months) · Amount · Duration (Once, Repeating N months, Forever) · Status (Active, Expired, Disabled) · Redeemed / Limit · Expires · Actions
- "+ New coupon"

### Coupon editor
- **Fields:**
  - Code (auto-generate or custom, uppercase, no special chars except - and _)
  - Internal name + description
  - Discount type · Amount (with currency selector if $)
  - Duration: Once / Repeating (months) / Forever
  - Max redemptions (total) · Max redemptions per customer
  - Applicable plans (multi-select; default all)
  - Applicable tenants (combobox; default all)
  - Minimum subscription amount
  - First-time customers only (toggle)
  - New tenants only (within X days of signup)
  - Currency restriction
  - Stackable with other coupons (toggle)
  - Start date · Expiry date
  - Show on public pricing page (toggle, only if marketing-eligible)
  - Notes (internal)

### Tab: Promotions
- Bundled campaigns linking coupons to landing pages, email sends, dates
- "+ New promotion": name, dates, audience, coupon, landing page link, email template, success metric goals

### Tab: Code Performance
- Table of codes ranked by redemption count, $ discounted, conversion lift; click for funnel

---

## Page 21. Tax & Compliance

- **Route:** `/admin/billing/tax`
- **Purpose:** Manage tax rates and reporting across jurisdictions.

### Tabs
- Tax Configuration · Tax-Exempt Tenants · Tax Reports · Filings · Settings

### Tab: Tax Configuration
- Auto-tax provider (Stripe Tax / Avalara / TaxJar) toggle + connection status
- Manual rate table per jurisdiction (region/state/country) with rate, threshold for nexus, tax ID, last updated
- VAT/GST settings (EU OSS, UK MTD, AU GST)
- Reverse charge handling toggle (for B2B EU)

### Tab: Tax-Exempt Tenants
- Table: Tenant · Tax ID · Exemption type · Certificate (uploaded file) · Verified · Expires · Actions
- "Add exemption": upload doc, validate, set expiry, jurisdiction scope

### Tab: Tax Reports
- Period selector
- Reports: Tax collected by jurisdiction, Tax collected by month, Tax-exempt sales, Reverse-charge sales, Refunds & adjustments
- Each: chart + table + CSV export + accountant-ready packet (PDF)

### Tab: Filings
- Filing reminders calendar (jurisdictions with due dates highlighted)
- Status: Draft, Submitted, Accepted, Amended
- Attached filings (PDFs)

### Tab: Settings
- Default tax behavior · Default tax codes by product type · Round-up rules · Inclusive vs exclusive default

---

## Page 22. Revenue Analytics

- **Route:** `/admin/billing/analytics`
- **Purpose:** Deep SaaS revenue analytics for the operator.
- **Layout:** Tab bar of report sections; each shows charts + breakdowns

### Tabs
- MRR Movement · ARR Trend · Churn · Retention · ARPU/ARPA · LTV · CAC & Payback · Quick Ratio / Magic Number · Cohort Analysis · Plan Migration · Forecasting

### Tab: MRR Movement
- **Stacked bar chart:** monthly bars, segments = New MRR (emerald) / Expansion MRR (cyan) / Contraction MRR (amber, negative) / Churned MRR (rose, negative); net MRR line overlay
- **KPI tiles above:** Net new MRR · New · Expansion · Contraction · Churned · Reactivated
- **Drill-down:** click segment → list of subscriptions making up that segment
- Filter by plan, segment, region, currency

### Tab: ARR Trend
- Line chart, last 24 months, with goal line, comparison vs last year overlay
- Annotations (campaigns, price changes)

### Tab: Churn
- Sub-views: Gross MRR Churn, Net MRR Churn, Logo Churn, Voluntary vs Involuntary, By Plan
- Charts: line + bar; cohort heatmap

### Tab: Retention
- **Cohort retention heatmap:** rows = signup month, cols = months since signup, cell = % retained MRR; color sequential brand
- **Net Revenue Retention** trend line + target line (>110% green target)
- **Gross Retention** comparison
- **Drill-down:** click cohort cell → list

### Tab: ARPU / ARPA
- Average Revenue Per User and Per Account trend; segmented by plan

### Tab: LTV
- LTV by plan, by acquisition channel; LTV:CAC ratio gauge

### Tab: CAC & Payback
- CAC trend (requires marketing spend integration); payback months trend

### Tab: Quick Ratio / Magic Number
- Quick Ratio = (New + Expansion) / (Churn + Contraction); gauge + trend
- Magic Number, Burn Multiple

### Tab: Cohort Analysis
- Beyond retention: cohort revenue contribution heatmap, cohort feature adoption

### Tab: Plan Migration
- **Sankey diagram:** showing flow from plan A → plan B over period
- Click flow → list of tenants

### Tab: Forecasting
- 12-month MRR forecast: model selector (linear, ARIMA, Prophet), confidence interval band, scenario sliders ("if churn drops to 2%, MRR in 12m = …")

### Permissions
- Finance, Super Admin, Admin

---

## Page 23. Dunning & Failed Payments

- **Route:** `/admin/billing/dunning`
- **Purpose:** Recover failed payments via configurable email cadences and smart retries.

### KPI strip
- Failed payments this period · Recovered $ · Recovery rate % · Avg days to recover · Active dunning sequences

### Tabs
- Dunning Queue · Sequences · Performance · Settings

### Tab: Dunning Queue
- Table: Tenant · Invoice · Amount · Failure reason code · Last retry · Next retry · Sequence stage · Status (In progress, Recovered, Surrendered) · Actions (Retry now, Skip, Send custom email, Surrender, Pause)

### Tab: Sequences
- Cards for each sequence: name · stages count · who's in it · performance summary
- "+ New sequence" → visual editor
- **Stage editor:** trigger (X days after fail), action (email template, SMS, in-app banner, retry payment, notify CSM, surrender), branching (if recovered then exit; if soft-decline retry; if hard-decline skip ahead)
- **Smart retry:** Stripe Smart Retries toggle; custom schedules (1d, 3d, 5d, 7d, 14d typical)

### Tab: Performance
- Funnel: Failed → Email sent → Email opened → Payment updated → Recovered
- Recovery rate by failure reason
- A/B test results

### Tab: Settings
- Default sequence per plan tier · Max retries · Auto-cancel after X days · CC billing email on retries · Cap retry charges to avoid bank fees

---

## Page 24. Payouts

- **Route:** `/admin/billing/payouts`
- **Purpose:** If marketplace/affiliate model — payouts to partners and resellers.

### Tabs
- Schedule · Statements · Methods · History

### Tab: Schedule
- Upcoming payout calendar; per-partner/affiliate breakdown
- Manual trigger payout

### Tab: Statements
- Per partner: line items (commissions earned, holds, deductions, net) with PDF export

### Tab: Methods
- Stripe Connect, ACH, PayPal, Wise, Wire — per partner config

### Tab: History
- Table of completed payouts: Partner · Amount · Method · Date · Reference · Status (Paid, In transit, Failed) · Actions


---

# Section: Product & Catalog Management

## Page 25. Master Product Catalog

- **Route:** `/admin/catalog/products`
- **Purpose:** Curated library of sign/print product templates that tenants can clone into their own catalogs as starting points.

### Header
- H1 "Master Product Catalog" · "+ New product" · "Import" (CSV / JSON) · "Export" · 3-dot (Reorder categories, Bulk republish, Versions)

### KPI strip
- Total products · Categories · Tenant adoption rate (avg # used per tenant) · Updated this month

### Filters / Toolbar
- Search by name, SKU, category, tag
- Filters: Category (Banners, Yard Signs, Vehicle Wraps, Window Graphics, Wall Decals, Trade Show Displays, A-Frames, Channel Letters, ADA Signs, Apparel — Screen Print, Apparel — DTG, Apparel — DTF, Apparel — Embroidery, Caps, Hoodies, Business Cards, Brochures, Posters, Stickers, Labels, Magnets, Promo Products, Trade Print, Wide Format, Architectural, Wayfinding, Custom), Status (Draft, Published, Archived), Industry vertical, Adoption (low/mid/high), Last updated, Tag
- View toggle: Grid (cards) · Table

### Grid view
- Card per product: hero image (default mockup), name, category chip, price-from, lead-time, "Used by N tenants" badge, status pill, edit pencil
- Hover: quick actions (Duplicate, Push update, Archive)

### Table view
- SKU · Image thumb · Name · Category · Default price formula · Default lead time · Adoption % · Status · Updated · Actions

### Product editor (`/admin/catalog/products/[id]`)
- **Tabs:**
  1. **Details:** name, slug, category (cascading), description (rich text), short description, internal note, tags
  2. **Attributes:** dynamic schema builder
     - Attribute types: number (with min/max/step/unit: width, height, sides, quantity, copies, hours, sq ft), select (size, finish, material, ink, color, fold type, paper weight), multi-select, color (with Pantone library), boolean (rush, lamination, install), date, file upload (artwork)
     - Per attribute: label, key, default value, required, validation, conditional visibility (show only if X), help text, customer-visible
     - **Sample for Banner:** Width (in/ft), Height (in/ft), Sides (1/2), Material (13oz vinyl, 18oz blockout, mesh, fabric), Finish (hemmed, grommets every X ft, pole pocket top, pole pocket top+bottom), Quantity, Rush
  3. **Pricing:** formula selector (link to library) or custom expression; preview with sample inputs; discount tiers
  4. **Materials:** required materials with default consumption (e.g., 13oz vinyl: 1.05 × area); cost defaults; preferred suppliers
  5. **Equipment & Production:** required equipment (printer + cutter + finisher), expected run time formula, capacity unit (sq ft/hr or pcs/hr), waste %
  6. **Lead time:** base + per-unit modifier + rush modifier
  7. **Mockup templates:** uploaded mockup images with placeholder areas; assigned per attribute combination
  8. **SEO:** meta title, description, OG image
  9. **Images & assets:** gallery, primary image, hover image, lifestyle shots
  10. **Add-ons:** related upsells (lamination, install, design fee)
  11. **Compliance:** material certifications (CPSIA, OEKO-TEX, fire-rated), regulatory notes
  12. **Versions:** version history with diff; "Push to all tenants using this template" with approval workflow
  13. **Adoption:** how many tenants use this template, top users, opt-out tenants
  14. **Audit log**

### Bulk actions
- Push update · Archive · Duplicate · Change category · Export

### Permissions
- Edit: Super Admin, Admin (with `catalog.write`)
- Read: all admins
- Push update: Super Admin only

---

## Page 26. Material Library

- **Route:** `/admin/catalog/materials`
- **Purpose:** Master list of materials that tenants can adopt, including physical specs, cost defaults, and supplier links.

### Header
- H1 "Material Library" · "+ New material" · "Import CSV" · "Export"

### KPI strip
- Total materials · Categories · Avg adoption per tenant · Outdated supplier prices count

### Filters
- Search by SKU, name, supplier
- Filters: Category (Vinyl, Substrates, Inks, Threads, Blanks, Hardware, Tools), Subcategory (Cast, Calendared, Reflective, Perforated, Translucent, Window Film; Coroplast, Aluminum, ACM/Dibond, Acrylic, Foam Board, MDO, PVC; Eco-solvent, Latex, UV, Sublimation, DTG, Pigment; Polyester, Cotton, Metallic; T-shirts, Hoodies, Caps, Bags), Indoor/Outdoor, Durability (1/3/5/7+ year), Finish (Matte, Gloss, Satin), Color, Width sizes, Roll length, Status (Active, Discontinued)

### Table columns
- SKU · Image thumb · Name · Category · Sub · Indoor/Outdoor · Durability · Width × Length · Default cost · Default markup % · Suppliers (chip overflow) · Status · Adoption % · Updated · Actions

### Material editor
- **Tabs:**
  1. **Specs:** name, SKU, category, subcategory, dimensions (width, length, thickness, gsm), color (with hex/Pantone), finish, indoor/outdoor, durability rating, fire rating, recyclable, opacity, adhesive type
  2. **Cost & pricing:** default cost per unit (sq ft, sq m, yard, lb), markup %, waste % default, minimum order qty
  3. **Suppliers:** supplier name, SKU at supplier, lead time, MOQ, link to portal, last price update; multiple suppliers per material with primary/backup designation
  4. **Compatible products:** products that use this material
  5. **Equipment compatibility:** which printers/cutters work with this
  6. **Color swatches:** image + hex + Pantone for color materials
  7. **Datasheet:** uploaded PDF
  8. **Versions / Audit log**

---

## Page 27. Equipment Templates

- **Route:** `/admin/catalog/equipment`
- **Purpose:** Pre-built equipment templates with productivity defaults for capacity planning.

### Header
- H1 "Equipment Templates" · "+ New equipment"

### Filters
- Category (Printer, Cutter, Press, Embroidery, CNC, Laser, Heat Press, Lamination, Workstation, Finishing) · Brand · Model · Status

### Table
- Image · Brand · Model · Category · Capacity unit · Rated speed · Adoption % · Status · Actions

### Equipment editor
- **Tabs:**
  1. **Specs:** brand, model, category, max width, max length, color modes, ink types supported, resolution
  2. **Productivity defaults:** rated speed (sq ft/hr, prints/hr, stitches/min), warm-up time, changeover time, default uptime %, default waste %
  3. **Costs:** default purchase cost, depreciation life, hourly operating cost (energy + supplies + labor)
  4. **Materials compatibility:** linked materials list
  5. **Maintenance schedule template:** task templates with frequency
  6. **Sample brands & models:** Roland TrueVIS VG3, HP Latex 700/800, Mimaki JV/CJV/UCJV/CG, Mutoh ValueJet, Epson SureColor S/F/T series, Graphtec FC/CE, Summa S One, Ryobi/Heidelberg presses, ROQ/M&R/Riley Hopkins screen presses, Brother/Tajima/SWF embroidery, ColDesi DTF, Kornit DTG, Trotec/Epilog laser, ShopBot/AXYZ CNC

---

## Page 28. Pricing Formulas Library

- **Route:** `/admin/catalog/pricing`
- **Purpose:** Pre-built and custom pricing formula templates that tenants can use or extend.

### Header
- H1 "Pricing Formulas" · "+ New formula" · "Test sandbox"

### Table
- Name · Category (sq-ft, per-piece, tiered qty, setup+run, install hourly, bundle, custom) · Inputs · Used by N tenants · Updated · Actions

### Formula editor
- **Variable definitions panel:** declared inputs (width, height, sides, quantity, etc.) with type and default
- **Constants panel:** material cost, labor rate, markup %, setup fee, minimum charge
- **Function library:** if/else, min, max, round, ceil, floor, lookup-table, tier(), area(), perimeter(), volume()
- **Code editor (Monaco):** JS-like expression syntax with autocomplete
- **Tester pane:** input fields → live calculated price, margin, breakdown
- **Tier table editor:** quantity → unit price tiers
- **Formula preview:** human-readable summary
- **Versions:** publish drafts; tenants on auto-update receive new version

### Sample formulas (built-in)
- Banner SqFt: `materialCost * area * waste + finishingCost(perimeter) + setupFee + (laborRate * runTime) * (1 + markup)`
- Tiered Quantity: `lookup(qty, tiers).unitPrice * qty + setupFee`
- Apparel Screen Print: `(blank.cost + (colors * inkCost) + (laborPerPiece) ) * qty * (1+markup) + screenSetupFee * colors`

---

## Page 29. Industry Templates

- **Route:** `/admin/catalog/templates`
- **Purpose:** Document templates (storefronts, quotes, work orders, invoices, proofs) tenants can adopt.

### Tabs
- Storefronts · Quote PDFs · Work Orders · Invoices · Proof Emails · Customer-Facing Emails

### Per tab
- Card list of templates with thumbnail preview
- Editor: WYSIWYG for HTML/PDF + variable browser (e.g., `{{tenant.name}}`, `{{customer.name}}`, `{{job.lineItems}}`)
- Versioning, preview with sample data, multi-language

---

## Page 30. Design Asset Library

- **Route:** `/admin/catalog/assets`
- **Purpose:** Licensed stock assets — fonts, vectors, mockups, palettes — available to tenants on eligible plans.

### Tabs
- Fonts · Icons · Mockups · Palettes · Patterns · Photos · Templates

### Per tab
- Searchable grid of assets with license info
- "Add asset" upload + license attestation
- Per-tenant usage tracking


---

# Section: Operations

## Page 31. Job Queue Monitor

- **Route:** `/admin/operations/jobs`
- **Purpose:** Cross-tenant production job throughput visibility (anonymized) for platform health and benchmarking.

### KPI strip
- Jobs in production (live) · Jobs completed today · Avg cycle time · Late jobs · Capacity utilization %

### Filters
- Tenant (combobox; aggregate by default) · Job type (Sign, Print, Apparel, Embroidery, Promo) · Status (Quoted, Approved, In production, Shipped, Delivered, Cancelled) · Date range · Region · Plan tier

### Charts
- **Throughput over time:** line, jobs/day, last 30d
- **Status distribution donut**
- **Bottleneck identification:** stacked bar showing time-in-status per job type (Quoting, Approval wait, Production, Shipping)
- **Capacity utilization gauge** per equipment category

### Table (anonymized rows when not impersonating)
- Job ref (redacted) · Tenant · Type · Status · Created · Last status change · Days in current status · Late flag · Actions (Open in tenant, Mark for review)

### Real-time
- WebSocket updates as jobs progress

---

## Page 32. Production Health

- **Route:** `/admin/operations/production`
- **Purpose:** Aggregated production metrics for benchmarking offered back to tenants.

### Sections
- **Industry-wide KPIs:** Avg equipment uptime · Avg material waste rate · Avg rework rate · On-time delivery rate · Avg job margin
- **Charts:** trend lines per metric; segmented by industry vertical; box-plot to show distribution per metric so individual tenants can self-compare
- **Anomaly detection:** auto-flagged tenants with metrics 2σ outside norm
- **Benchmark publishing:** "Publish to tenant dashboards" toggle per metric (after privacy review)

---

## Page 33. Support Tickets

- **Route:** `/admin/operations/tickets`
- **Purpose:** Helpdesk inbox for platform support across all tenants.
- **Layout:** Three-pane: left views/folders, center ticket list, right preview pane (or full ticket page on click)

### Header
- H1 "Support Tickets" · "+ New ticket" · "Macros" · "SLA settings"

### KPI strip
- Open · Pending customer · Solved today · Breaching SLA · Avg first response time · CSAT this period

### Left rail: Views
- **Saved views:** Unassigned, Mine, My team's, Open, Pending, Solved today, Breaching SLA, VIP tenants, Bugs, Feature requests, NPS detractors, Custom
- **Folders:** by channel (Email, Chat, In-app, Phone, Forum), by category, by tag

### Toolbar
- Search by content / requester / ticket # / tenant
- Filters: Priority (P1/P2/P3/P4), Status (New, Open, Pending, On-hold, Solved, Closed), Assignee, Team, Tenant, Plan, Channel, Tags, Category, Created range, Last updated, SLA state, CSAT score, Language
- Bulk actions: Assign, Change status, Add tag, Merge, Mark as spam, Apply macro, Delete

### Ticket list table
- Priority (chip) · # · Subject (with first message excerpt) · Requester (avatar+name) · Tenant · Assignee · Status · SLA timer (countdown chip — green/amber/red based on time remaining) · Channel icon · Created · Last reply · Actions
- Multi-select for bulk

### Ticket detail page (`/admin/operations/tickets/[id]`)
- **Header:** ticket # · subject (editable) · status pill · priority · assignee selector · SLA timer · 3-dot (Merge, Split, Mark spam, Print, Export, Delete)
- **Body — main pane:** conversation thread
  - Each message: avatar + author + role + timestamp + body (rich) + attachments + delivery status (sent/delivered/read)
  - Toggle: Public reply / Internal note (yellow tinted background)
  - Reply composer: rich text editor with macros, suggested AI replies (3 suggestions ranked, accept/edit), attachments, save draft, schedule send, "send and solve," "send and pending"
  - Macros library with search and per-macro variables
- **Right rail:**
  - Requester card: avatar, name, email, phone, language; "View user," "Open in tenant," past tickets count
  - Tenant context card: plan, MRR, health score, account manager, integrations
  - Customer history: previous tickets list with status
  - Linked records: bug reports, feature requests, audit log entries
  - Tags + custom fields (Category, Severity, Module, Resolution code)
  - SLA panel: current SLA target, time remaining, breach reason if breached, escalation policy
  - Internal collaborators @-mentions + watchers
  - CSAT result if returned
- **Footer toolbar:** keyboard shortcuts hint, status quick-set chips

### Macros editor
- List of macros: name, body, category, attached actions (set status, set tag, assign team)
- Variables in macros: `{{requester.firstName}}`, `{{tenant.name}}`, `{{ticket.id}}`

### SLA settings
- Per priority + plan combo: first response target, resolution target, business-hours toggle, holiday calendar
- Escalation policy: who/what triggers when SLA at 80%, 100%

### AI suggested replies
- Powered by past resolved tickets + KB; cites sources; admin can accept/edit; learns from edits

### Permissions
- Support, Admin, Super Admin: full
- CSM: view and reply on assigned tenants
- Engineer: view linked tickets

### Real-time
- WebSocket for new messages, status changes, assignments; live typing indicators on the same ticket; collision detection ("Sarah is also viewing this ticket")

---

## Page 34. Knowledge Base / Help Center Editor

- **Route:** `/admin/operations/knowledge-base`
- **Purpose:** Author and manage public KB articles for tenants.

### Layout
- Left rail: categories tree (drag to reorder, nested up to 3 levels)
- Center: article list or selected article
- Right: article meta + analytics

### Article list
- Filters: Status (Draft, Review, Published, Archived), Category, Author, Updated range, Locale
- Table: Title · Category · Author · Status · Views (30d) · Helpfulness score · Updated · Locale variants · Actions

### Article editor
- **Top bar:** title (inline edit) · status pill · category breadcrumb · "Save draft" · "Submit for review" · "Publish" · 3-dot
- **Tabs:**
  1. **Content:** rich text editor (markdown + WYSIWYG) with toolbar; slash menu for embeds (videos, code, callouts, table, image, file, embed iframe, button, accordion); side-by-side preview; SEO live score
  2. **SEO:** meta title, description, slug, canonical, schema, OG image
  3. **Translations:** per-locale variants with completeness indicator; translation memory; auto-translate suggestion (manual approval)
  4. **Settings:** visibility (Public, Internal, Plan-restricted), labels, featured toggle, related articles
  5. **Analytics:** views trend, helpfulness up/down, avg time on page, search queries that led to article, in-product help triggers
  6. **Versions:** revision history with diff
  7. **Comments / feedback:** reader feedback queue

### Search analytics page
- Top searches (with no-result rate), zero-result queries (drives content gaps), most-clicked articles per query, deflection rate (% who didn't open ticket after viewing)

### Permissions
- Author: write drafts; Editor: publish; Translator: translation tab only

---

## Page 35. Announcements & Changelog

- **Route:** `/admin/operations/announcements`
- **Purpose:** Compose announcements pushed to tenants (banners, modals, emails, changelog posts).

### Tabs
- All Announcements · Drafts · Scheduled · Live · Archived · Changelog · Templates

### Header actions
- "+ New announcement" · "+ New changelog entry" · "Templates"

### Announcement editor
- **Targeting:** all tenants / by plan / by status / by segment / specific tenants
- **Channels (multi-select):**
  - In-app banner (top of tenant app)
  - In-app modal (one-time)
  - In-app inbox (notification center entry)
  - Email blast (with template)
  - Changelog entry (public + RSS)
  - Push notification (mobile app)
- **Content per channel:** title, body (rich), image/illustration, CTA label + URL, dismiss behavior, frequency cap
- **Schedule:** send now / at date+time / recurring
- **Tracking:** views, clicks, dismissals, conversions
- **A/B test:** copy variants, traffic split

### Changelog page editor
- Version, date, category (Feature, Improvement, Fix, Security, Deprecation), markdown body, image/screenshot, audience filter (Public, Customers only)

### Performance dashboard (per announcement)
- View rate, click rate, dismissal rate, conversion (defined per announcement)

---

## Page 36. Feature Requests

- **Route:** `/admin/operations/feature-requests`
- **Purpose:** Roadmap board with voting, prioritization, and tenant linkage.
- **Layout:** Tabs (Board, List, Roadmap timeline, Submitted)

### Tab: Board (Kanban)
- Columns: Backlog · Under Review · Planned · In Progress · Beta · Shipped · Won't Do
- Card: title · vote count · submitter · ICE score · linked tickets count · planned release · tags · 3-dot
- WIP limits

### Tab: List
- Table: Title · Status · Votes · ICE score · Effort · Impact · Assignee · Tag · Submitted · Actions

### Tab: Roadmap timeline
- Gantt-like timeline with quarters, swim-lanes by team, milestones, dependencies

### Tab: Submitted
- Inbound requests pending triage; merge similar; convert to bug if defect

### Request detail page
- Title, description (rich), submitter (tenant + user), votes (upvote/downvote), comments, related requests (auto-suggested), linked tickets, linked bug, ICE scoring fields (Impact, Confidence, Ease — computed score), engineering estimate (S/M/L/XL), planned release, public/private toggle, status timeline

### Public roadmap (read by tenants)
- Configure which columns show publicly, hide private items, RSS feed

---

## Page 37. Bug Reports

- **Route:** `/admin/operations/bugs`
- **Purpose:** Bug tracker integrated with engineering workflows.

### Header
- "+ New bug" · "Sync with Linear/Jira" status · "Sentry integration"

### Filters
- Severity (SEV1/SEV2/SEV3/SEV4) · Status (New, Triaged, In Progress, In Review, Resolved, Released, Won't Fix, Duplicate) · Module · Environment (Production/Staging/Sandbox) · Reporter · Assignee · Linked Sentry issue · Tags · Date

### Table
- # · Title · Severity · Status · Module · Reporter (admin or tenant) · Tenant impacted · Assignee · Linked Sentry · Created · Updated · Actions

### Bug detail page
- **Header:** title · severity · status · assignee · 3-dot
- **Tabs:**
  1. **Details:** description, repro steps, expected vs actual, screenshots/video attachments, browser/OS, account context, environment, frequency, business impact
  2. **Linked issues:** Sentry stack trace + breadcrumbs, Linear/Jira issue, customer ticket(s)
  3. **Activity:** comments, status changes, assignment changes
  4. **Tenants impacted:** list of affected tenants (auto-correlated via Sentry)
  5. **Resolution:** root cause, fix description, verified by, postmortem link (for SEV1/SEV2)

---

# Section: Marketing & Growth

## Page 38. Landing Pages

- **Route:** `/admin/marketing/landing-pages`
- **Purpose:** CMS for marketing site pages with A/B testing.

### Header
- "+ New page" · "Templates" · "Domains" · "Form submissions"

### Page list
- Path · Title · Status (Draft, Live, Archived) · Last edited · Author · Sessions (30d) · Conversions · Conv rate · Actions

### Page editor
- **Visual block-based builder** (header, hero, features, testimonials, pricing card, CTA, FAQ, footer)
- **Code mode** (HTML/CSS/JS for power users)
- **SEO panel** (meta, OG, schema)
- **A/B test:** create variants, traffic split %, primary metric (signup, click, scroll depth, time on page), winner declaration
- **Analytics:** sessions, sources, devices, bounce, scroll depth, conversions, funnel
- **Publishing:** preview link, schedule publish, rollback

---

## Page 39. Email Campaigns

- **Route:** `/admin/marketing/campaigns`
- **Purpose:** One-off and recurring email campaigns to tenants and leads.

### Tabs
- Campaigns · Templates · Audiences · Performance

### Campaign list
- Name · Type (one-off, recurring) · Status (Draft, Scheduled, Sending, Sent, Paused) · Audience size · Open rate · CTR · Bounce · Unsubscribe · Conversions · Sent at · Actions

### Campaign editor (wizard)
1. **Setup:** name, type, language
2. **Audience:** segment builder (filter by plan, status, behavior, signup date, tags, last login, MRR range, region)
3. **Content:** subject lines (with A/B variants up to 3), preview text, from name + email, reply-to, template (block editor or HTML), personalization variables, dynamic content blocks
4. **Send time:** send now / schedule / send-time optimization (per-recipient timezone)
5. **Tracking:** UTM params, conversion goals
6. **Review & send:** preflight checks (deliverability, dead links, spam score, image alt, dark mode preview, mobile preview), confirm

### Performance per campaign
- Funnel: sent → delivered → opened → clicked → converted → unsubscribed → complained
- Heatmap of clicks within email
- Per-recipient drill-down table

---

## Page 40. Lifecycle / Drip Sequences

- **Route:** `/admin/marketing/sequences`
- **Purpose:** Behavioral email/in-app sequences triggered by tenant events.

### Sequence list
- Name · Status · Trigger · Active enrollees · Total enrolled · Conversion goal · Conv rate · Actions

### Sequence builder (visual flow)
- **Triggers:** Signup, Plan started, Plan changed, Failed payment, Trial ending in N days, X days inactive, Feature first use, Custom event, Tag added, Webhook
- **Actions:** Send email, Send SMS, Send in-app message, Notify CSM, Add tag, Remove tag, Move to plan, Apply coupon, Webhook out, Branch (if/else condition), Wait (duration or until event), Random split (% test)
- **Goals:** define conversion event(s); auto-exit on goal
- **Per-step performance:** sent, opened, clicked, converted, exit

### Templates
- Pre-built sequences: Onboarding (5 emails), Trial conversion (3), Win-back (4), Feature adoption (variable), Renewal reminder (3)

---

## Page 41. Referral Program

- **Route:** `/admin/marketing/referrals`
- **Purpose:** Manage tenant-to-tenant referrals.

### Header
- "Settings" · "Top referrers" · "Fraud review queue"

### KPI strip
- Active referrers · Referrals this period · Conversions · Conv rate · $ rewards paid · Avg LTV per referred tenant

### Sections
- **Reward structure editor:** referrer reward (e.g., $100 credit / 1 free month / cash), referee reward (e.g., 20% off first 3 months); minimum spend before reward releases
- **Top referrers leaderboard:** rank · tenant · referrals · conversions · earned $
- **Referral funnel:** clicked link → signed up → trialed → paid; drop-off
- **Fraud detection:** self-referrals, suspicious patterns flagged for review with approve/deny

---

## Page 42. Affiliate Program

- **Route:** `/admin/marketing/affiliates`
- **Purpose:** Affiliate sign-ups, tracking, commissions, payouts.

### Tabs
- Affiliates · Applications · Commissions · Creative Library · Settings

### Affiliates table
- Affiliate · Email · Status (Pending, Active, Suspended) · Tier · Tracking link · Clicks · Conversions · Conv rate · Earned · Pending payout · Actions

### Affiliate detail
- Profile, payout method, traffic sources, commission history, marketing assets used, communication

### Commission tiers editor
- Tier name · qualification (e.g., 10+ conversions/qtr) · commission % or flat · recurring (Y/N) · capped duration

### Creative Library
- Banners, text links, email templates, social posts, ad creative — all with tracking links

---

## Page 43. SEO & Content

- **Route:** `/admin/marketing/seo`
- **Purpose:** SEO oversight for the marketing site.

### Sections
- **Site-wide settings:** robots.txt editor, sitemap.xml regen, canonical defaults, hreflang, meta defaults
- **Keyword rankings:** integrated SEMrush/Ahrefs API; tracked keyword table with position, change, volume, intent
- **Backlink monitoring:** referring domains, anchor text distribution, new/lost links
- **Broken link checker:** scheduled crawl, queue of broken links per page with fix suggestions
- **Content gaps:** keyword opportunities not yet ranking
- **Page speed:** Core Web Vitals per page (LCP, INP, CLS) with trend

---

## Page 44. Lead Inbox

- **Route:** `/admin/marketing/leads`
- **Purpose:** Inbound leads from forms with scoring and assignment.

### KPI strip
- Leads this period · Qualified · MQL→SQL conv rate · Avg time to first touch

### Filters
- Source (Demo request, Contact form, Pricing inquiry, Newsletter, Webinar, Trial signup) · Status (New, Working, Qualified, Disqualified, Converted) · Owner · Score range · Created range · Region · Industry · Tags

### Table
- Lead name · Company · Email · Phone · Source · Score (0–100) · Status · Owner · Created · Last touch · Actions
- Bulk: Assign, Email, Tag, Convert to trial, Disqualify

### Lead detail
- **Sections:** Profile, Activity timeline (page views, form submits, emails opened, clicks), Notes, Tasks, Linked tenant if converted, Email thread, Score breakdown, MQL/SQL routing rules history
- Actions: Convert to tenant trial · Send email · Schedule meeting (Calendar integration) · Add to sequence · Disqualify with reason


---

# Section: Integrations & API

## Page 45. Third-Party Integrations

- **Route:** `/admin/integrations`
- **Purpose:** Master catalog of every third-party integration available to tenants on the Flowtora platform, with adoption metrics and configuration management.

### Layout grid
- 12 columns: full-width header strip · KPI row · category filter rail (left, 240px) · integration grid cards (right)

### Header / Page title row
- **Title:** Integrations Catalog
- **Subtitle:** Manage third-party services available to Flowtora tenants
- **Actions:** `+ Add Integration` (Primary) · `Import OpenAPI Spec` (Secondary) · `Bulk Update` (Outline) · Overflow: Export catalog · Sync availability · View deprecation report

### KPI strip (4 cards)
- **Total integrations** · count · delta vs last quarter
- **Active integrations** · count with active tenant connections · sparkline (90d)
- **Most adopted** · integration name · % tenants connected
- **Health score** · average uptime across all integrations · color pill

### Tabs
- **All** · **Active** · **Beta** · **Coming Soon** · **Deprecated** · **Internal Only**

### Filter rail (left)
- **Category checkbox tree:**
  - Accounting (QuickBooks Online, QuickBooks Desktop, Xero, FreshBooks, Wave, Sage)
  - Payments (Stripe, Square, PayPal, Authorize.net, Braintree, Adyen)
  - E-commerce (Shopify, WooCommerce, BigCommerce, Wix, Squarespace, Etsy)
  - Marketplaces (Amazon, eBay, Walmart)
  - Automation (Zapier, Make/Integromat, n8n, Workato, Tray.io)
  - Communication (Twilio SMS, Twilio Voice, Plivo, Bandwidth, RingCentral)
  - Email Marketing (Mailchimp, Klaviyo, ConvertKit, ActiveCampaign, Constant Contact)
  - CRM (HubSpot, Salesforce, Pipedrive, Zoho, Copper)
  - Team Collaboration (Slack, Microsoft Teams, Discord, Google Chat)
  - Productivity (Google Workspace, Microsoft 365, Dropbox, Box, OneDrive)
  - Shipping (ShipStation, EasyPost, Shippo, Pirate Ship, ShipBob)
  - Carriers (FedEx, UPS, USPS, DHL, Canada Post, Australia Post)
  - Design (Adobe Creative Cloud, Figma, Canva, Affinity, CorelDRAW)
  - File Transfer (WeTransfer, Smash, Hightail, Dropbox Transfer)
  - Print Industry (Onyx Hub, Caldera, GMG ColorProof, EFI Fiery, Wasatch SoftRIP)
  - Equipment (Roland Cloud, HP PrintOS, Mimaki Cloud, Esko Automation Engine)
  - Analytics (Google Analytics 4, Mixpanel, Heap, Amplitude)
  - Telephony (Aircall, Dialpad, JustCall, OpenPhone)
  - Calendar (Google Calendar, Outlook Calendar, Calendly, Cal.com)
  - Reviews (Google Business, Yelp, Trustpilot, Birdeye, Podium)
- **Status:** Active · Beta · Coming Soon · Deprecated
- **Auth type:** OAuth 2.0 · API Key · Basic Auth · SAML · Custom
- **Pricing tier required:** Starter · Pro · Business · Enterprise · All
- **Region availability:** US · CA · EU · UK · APAC · Global
- **Adoption:** High (>50% tenants) · Medium (10–50%) · Low (<10%)

### Integration grid card (per integration)
- Logo (40×40) · Name · Category badge · Status pill · Short description (1 line, max 80 chars)
- Stats row: `Connected: 142 tenants · Last 7d syncs: 3,421 · Health: 99.4%`
- Actions: View · Configure · View Adoption · Disable

### Integration detail page (`/admin/integrations/[slug]`)
- **Tabs:**
  - **Overview** — logo, name, vendor URL, support contact, description (rich text), screenshots gallery, capabilities matrix (Read/Write/Sync/Webhook for each entity)
  - **Configuration Schema** — JSON schema editor (Monaco), required env vars, OAuth scopes list, redirect URI, webhook endpoint
  - **Adoption** — line chart of connections over time · table of top 100 tenants connected (Tenant · Plan · Connected on · Last sync · Status · Errors 30d)
  - **Health & Monitoring** — uptime % (30d / 90d), average sync duration, error rate, dead-letter count, recent incidents, response time p50/p95/p99 charts, rate-limit consumption
  - **Versions** — version history table (Version · Released · Changes · Tenants on this version · Action: Set as default · Deprecate)
  - **Documentation** — markdown editor for tenant-facing docs, code samples, FAQ
  - **Permissions & Scopes** — required OAuth scopes per capability, justification text shown to tenant during connect
  - **Pricing & Billing** — does this integration require Flowtora plan upgrade? Per-call cost? Pass-through fees?
  - **Webhooks** — outbound webhooks emitted by Flowtora to this integration · inbound webhooks consumed
  - **Field Mappings** — default mappings between Flowtora entities and partner entities (e.g., Job → Invoice line items in QuickBooks); editor with drag-drop
  - **Test Sandbox** — connect to vendor sandbox, run sample sync, view request/response
  - **Audit Log** — every config change, version bump, disable/enable
  - **Danger Zone** — Deprecate (sets sunset date and notifies tenants) · Force Disconnect All · Delete

### Permissions
- **Engineer · Admin:** Full · **Support:** Read + view adoption · **CSM:** Read · **Read-Only Auditor:** Read

### Empty state
- Illustration of broken plug · "No integrations match your filters" · CTA: Reset filters · Browse marketplace

### Real-time
- Adoption counts · health metrics · WebSocket push for newly connected tenants

### Export
- CSV (catalog), JSON (full schemas), PDF (vendor due-diligence pack)

---

## Page 46. API Keys & Webhooks

- **Route:** `/admin/integrations/api`
- **Purpose:** Manage platform-level API keys (system-to-system), the Flowtora webhook event catalog, and webhook delivery logs.

### Tabs
- **API Keys** · **Webhook Endpoints** · **Event Catalog** · **Deliveries** · **Signing Secrets** · **Rate Limits** · **Settings**

### Tab: API Keys
- Top actions: `+ Create API Key` (opens modal) · Rotate All · Export
- **Filters:** Owner team · Scope · Status (Active/Revoked/Expired) · Last used range · Created range · Environment
- **Table columns:** Name · Key prefix (first 8 chars + `...`) · Owner team · Scopes (chips) · Created by · Created · Last used · IP allowlist · Expiry · Status · Actions (Rotate · Revoke · View usage)
- **Create modal fields:** Name *(text)*, Description *(textarea)*, Owner team *(select)*, Scopes *(multi-select tree: tenants:read, tenants:write, billing:read, billing:write, users:read, users:write, audit:read, system:admin, …)*, Environment *(Production/Staging/Sandbox)*, Expiry *(none / 30d / 90d / 1y / custom date)*, IP allowlist *(tags input — CIDR ranges)*, Rate limit override *(number/min)*. On create: full key shown ONCE in copy-once modal with QR.

### Tab: Webhook Endpoints
- Top: `+ Add Endpoint`
- **Table:** Endpoint URL · Description · Subscribed events (count + chip) · Status (Active/Paused/Failing) · Success rate 24h · Last delivery · Last error · Retry config · Actions
- **Add/Edit endpoint form:**
  - **URL** *(URL, https only, must respond to challenge ping)*
  - **Description** *(text)*
  - **Subscribed events** *(searchable multi-select with categories: Tenant, Billing, User, Job, System)*
  - **Signing secret** *(generated, copy-once, rotate)*
  - **Custom headers** *(key/value pairs)*
  - **Retry policy** *(exponential / linear / custom)* · max attempts *(1–10)*
  - **Timeout** *(1–30s)*
  - **Filter expression** *(optional; CEL/JSONLogic expression to fire only if condition met)*
  - **Disable on N consecutive failures** *(toggle + threshold)*

### Tab: Event Catalog
- **Group headers per category:** Tenant Lifecycle, Subscription, Invoice, Payment, User, Job, Integration, System, Security, Marketing
- **Per event row:** Event name (e.g., `tenant.created`) · Description · Schema link · Sample payload (JSON viewer) · First introduced version · Stability (Stable / Beta / Deprecated) · Subscribers count
- Click row → slide-over with full schema, sample payload, code examples (Node, Python, Ruby, PHP, Go, cURL), version history, deprecation notice if any

### Tab: Deliveries
- **Filters:** Endpoint · Event type · Status (Succeeded/Failed/Pending/Dead-letter) · HTTP code · Date range · Tenant · Has retries
- **Table:** Delivery ID · Event · Endpoint · Tenant · Attempted at · Status · HTTP code · Latency · Attempts · Next retry · Actions (View · Replay · Mark resolved)
- Click row → slide-over with full request/response, payload diff if replayed
- Bulk actions: Replay selected · Mark as resolved · Move to dead-letter · Drop

### Tab: Signing Secrets
- Per-endpoint secret rotation. Old + new active during grace period (24h). Force rotate-all button (with typed confirmation).

### Tab: Rate Limits
- API key rate limits with current consumption gauge, top consumers, throttled requests counter.

### Tab: Settings
- Default retry policy · Default timeout · Dead-letter retention (days) · Auto-disable threshold · Webhook IP whitelist (Flowtora egress IPs shown for tenant firewalling) · Encryption-at-rest verification badge

### Permissions
- **Engineer · Admin:** Full · **Support:** Read endpoints + deliveries · **Read-Only Auditor:** Read

---

## Page 47. Developer Documentation

- **Route:** `/admin/integrations/docs`
- **Purpose:** Author and publish the public Flowtora developer docs and OpenAPI reference.

### Layout
- Three-pane: left (sidebar tree of docs), center (Monaco MDX editor with live preview toggle), right (frontmatter + metadata)

### Header actions
- `Publish` (Primary, green) · `Save Draft` · `Preview` · `Diff vs Live` · `Schedule Publish` · Overflow: Roll back to version · View public page · Open in new tab

### Sidebar tree
- **Sections:** Getting Started · Authentication · Concepts · Resources (per resource) · Webhooks · SDKs · Recipes · Migration Guides · Changelog · Errors Reference · Rate Limits · Glossary
- Per-node icons: page · folder · external link · deprecated · draft

### Editor pane
- **Monaco MDX editor** with syntax highlighting, autocomplete, custom components palette (`<Endpoint />`, `<Param />`, `<Response />`, `<CodeTabs />`, `<Callout />`, `<Diagram />`)
- Live preview toggle (split view)
- Inline image/video upload to S3
- Code block language picker, copy button preview, run-in-sandbox toggle (for runnable examples)

### Right rail (metadata)
- Title · Slug · Status (Draft/Published/Archived) · SEO meta · Canonical · Owner team · Reviewers · Last updated · Version · Tags · Related pages

### OpenAPI sub-page (`/admin/integrations/docs/openapi`)
- Upload OpenAPI 3.1 YAML/JSON · Schema validator · Diff vs previous · Generate per-endpoint docs · Auto-publish toggle

### Code Sample Manager
- Per-endpoint snippets in: cURL, Node.js, Python, Ruby, PHP, Go, Java, C#, Swift, Kotlin, Postman collection
- Lint/test snippets against sandbox API on save

### Permissions
- **Engineer · DevRel · Admin:** Full · **Support:** Comment · **Read-Only Auditor:** Read

---

## Page 48. Marketplace

- **Route:** `/admin/integrations/marketplace`
- **Purpose:** Manage third-party apps that tenants can install into their Flowtora workspaces (extensibility platform).

### Tabs
- **All Apps** · **Pending Review** · **Published** · **Suspended** · **Featured** · **Categories** · **Reviews** · **Revenue Share** · **Submission Settings**

### Tab: All Apps — table
- App icon · Name · Developer · Category · Version · Status (Draft/In Review/Approved/Suspended) · Installs · Rating · MRR contribution · Actions
- **Filters:** Status · Category · Free vs Paid · Pricing model (one-time / subscription / usage) · Submitted range · Approval reviewer · Risk score

### App detail page (`/admin/integrations/marketplace/[appId]`)
- **Tabs:**
  - **Submission** — manifest.json (JSON viewer), repo URL, security checklist (CSP, sandboxing, scopes), screenshots, demo video, EULA, support contact
  - **Permissions Requested** — list of OAuth scopes with risk pill (Low/Med/High/Critical)
  - **Listing** — name, tagline, long description (MDX), pricing, screenshots, video URL, support URL, privacy URL
  - **Versions** — version history with changelog, ability to roll forward/back installed tenants
  - **Adoption** — installs over time, top tenants, churn from app, drop-off events
  - **Reviews** — moderation queue, reply, hide/flag, ban reviewer
  - **Revenue Share** — tier (70/30, 80/20, 85/15 per tier), monthly statements, payout method, 1099 status
  - **Compliance** — SOC2 attestation upload, sub-processor declaration, data residency
  - **Risk Score** — auto-calculated based on scopes, code scan results, complaint volume
  - **Audit Log**
  - **Danger Zone** — Suspend (with reason) · Unpublish · Force-uninstall from all tenants · Ban developer

### Approval workflow
- Stages: Submitted → Automated checks → Security review → Listing review → Approved/Rejected
- Per stage: assignee, SLA, comments, checklist
- Reviewer dashboard with kanban

### Permissions
- **Marketplace Admin · Engineer · Admin:** Full · **Support:** Read + reply to reviews · **Finance:** Revenue Share tab · **Read-Only Auditor:** Read

---

## Page 49. SSO Providers

- **Route:** `/admin/integrations/sso`
- **Purpose:** Configure Single Sign-On (SAML 2.0, OIDC) and SCIM provisioning for Enterprise tenants.

### Tabs
- **Providers** · **Per-Tenant Configurations** · **SCIM Logs** · **Identity Provider Templates** · **Settings**

### Tab: Providers
- **Catalog tiles:** Okta · Azure AD / Entra ID · Google Workspace · OneLogin · JumpCloud · Ping Identity · Auth0 · Duo · Microsoft AD FS · Generic SAML · Generic OIDC
- Per tile: connected tenant count · status · default scopes

### Tab: Per-Tenant Configurations — table
- Tenant · Provider · Type (SAML/OIDC) · Status (Active/Pending/Failed/Test) · ACS URL configured · Metadata refresh · SCIM enabled · Last login · Last sync · Actions

### Tenant SSO config form
- **Identity provider** *(dropdown)*
- **Display name** *(text — shown on login button)*
- **Type** *(SAML 2.0 / OIDC)*
- **SAML fields:** IdP metadata URL or upload XML · Entity ID · ACS URL (Flowtora-side, copy) · Single Logout URL · Signature algorithm · Encryption cert · Attribute mappings (email, given_name, family_name, groups) · Default role mapping · Group → role rules
- **OIDC fields:** Issuer · Client ID · Client secret · Discovery URL · Authorize / Token / UserInfo endpoints · Scopes · PKCE *(toggle)*
- **JIT provisioning** *(toggle)* — auto-create users on first login
- **Force SSO** *(toggle)* — disables password login for tenant
- **Allowed email domains** *(tags)*
- **Test login** button (opens flow in popup, shows decoded assertion)

### Tab: SCIM Logs
- **Filters:** Tenant · Operation (Create/Update/Delete user, Create/Update/Delete group, Patch) · Status · Date range
- **Table:** Time · Tenant · Operation · Resource · External ID · Status · HTTP code · Payload (JSON popover) · Error · Actions (Retry · View raw)

### Tab: Identity Provider Templates
- Pre-filled SAML/OIDC profiles for common IdPs (Okta, Azure AD) so tenants can copy-paste
- Editable XML/JSON snippets, screenshots of IdP UI

### Tab: Settings
- Global enforce MFA-with-SSO toggle · IdP-initiated SSO allowed *(toggle)* · Session lifetime override · Just-in-time-deprovision *(toggle)*

### Permissions
- **Security Engineer · Admin:** Full · **Support:** Read + test login (with reason) · **Read-Only Auditor:** Read

---

# Section: Compliance & Security

## Page 50. Security Center

- **Route:** `/admin/security/center`
- **Purpose:** Single-pane-of-glass view of Flowtora platform security posture.

### Layout
- Hero strip with overall **Security Score** (0–100, large gauge) and posture grade (A+/A/B/C/D)
- Below: 4-card KPI strip · 3-column widget grid

### KPI strip
- **MFA enforced** · % of platform admins with MFA · target ≥100%
- **Tenant SSO adoption** · % of Enterprise tenants on SSO
- **Open security findings** · count by severity (Critical/High/Med/Low)
- **Mean time to remediate** · days

### Widgets
- **Suspicious activity feed** — failed logins (>5), unusual geo, concurrent sessions, brute-force, leaked-credential matches
- **Vulnerability scanner** — last scan timestamp, results table (CVE · severity · component · fix version · status)
- **Penetration test reports** — list of pen-tests (vendor, date, executive summary PDF link, retest status)
- **Bug bounty** — open reports from HackerOne/Intigriti, severity breakdown, payout YTD
- **Password policy compliance** — % of admins compliant; per-policy stats (length, complexity, age, history, breach check)
- **Encryption status** — at-rest (AES-256-GCM), in-transit (TLS 1.3), key rotation last performed, KMS status
- **Secret scanning** — repo scan results, exposed secrets dashboard
- **Dependency vulnerabilities** — Dependabot/Snyk feed
- **Cloud security** — AWS Config / GCP SCC / Azure Defender findings
- **Recent admin actions of interest** — privileged role grants, impersonation sessions, role changes

### Permissions
- **Security Engineer · CISO · Admin:** Full · **Support:** Read suspicious activity · **Read-Only Auditor:** Read

### Real-time
- Suspicious activity feed pushes via WebSocket; high-severity finding triggers banner.

---

## Page 51. Compliance

- **Route:** `/admin/security/compliance`
- **Purpose:** Compliance program management for SOC2, ISO 27001, GDPR, CCPA, HIPAA, PCI DSS.

### Tabs
- **Frameworks** · **Controls** · **Evidence** · **Policies** · **Sub-Processors** · **DPAs** · **Risk Register** · **Vendor Reviews** · **Reports**

### Tab: Frameworks
- Cards per framework: SOC 2 Type II, ISO 27001, GDPR, CCPA/CPRA, HIPAA, PCI DSS, FERPA, FedRAMP (planned)
- Per card: status pill (In Scope/Audit-Ready/Not in Scope), last audit date, next audit, % controls passing, auditor

### Tab: Controls
- **Filters:** Framework · Status (Passing/Failing/N/A) · Owner · Domain (Access · Change Mgmt · Incident · BCP · Vendor · etc.) · Risk
- **Table:** Control ID · Title · Framework(s) · Status · Owner · Last tested · Next test · Evidence count · Actions
- Detail: control description, mapped controls in other frameworks, test procedure, automated check status, manual evidence list

### Tab: Evidence
- Evidence library: screenshots, exports, logs, attestation forms — auto-collected via integrations + manual upload
- **Filters:** Type · Control · Date · Source (Auto/Manual)
- Auto-collection sources: AWS CloudTrail, GitHub, Okta, Datadog, Vanta-style automated checks

### Tab: Policies
- Policy library (Information Security, Access Control, Acceptable Use, Incident Response, BCP/DR, Data Retention, Encryption, Vendor Mgmt, Secure SDLC, Vulnerability Mgmt)
- Per policy: Markdown editor, version, owner, last reviewed, next review, distribution list, acknowledgment tracking (% of staff acknowledged)

### Tab: Sub-Processors
- Public sub-processor list (AWS, Stripe, Resend, Sentry, …) · per row: name, purpose, data location, DPA on file, certifications (SOC2/ISO/GDPR), risk tier, last reviewed
- Public-facing /sub-processors page generator

### Tab: DPAs
- Tenant DPA signing status table · request DPA workflow · counter-signature support

### Tab: Risk Register
- Risks list (ID, title, owner, likelihood × impact = risk score, mitigation status, residual risk, review date)
- Heatmap matrix view

### Tab: Vendor Reviews
- Vendor onboarding workflow with security questionnaire (CAIQ-Lite), data flow, SOC2 upload, approval

### Tab: Reports
- Auto-generated audit packages (Type I, Type II, GDPR Article 30 record, HIPAA risk assessment) — PDF + ZIP download

### Permissions
- **Compliance Officer · CISO · Admin:** Full · **Read-Only Auditor:** Read · **Support:** Sub-Processors and Policies (read)

---

## Page 52. Data Privacy Requests

- **Route:** `/admin/security/privacy-requests`
- **Purpose:** Process GDPR/CCPA/CPRA Subject Access Requests (export, delete, restrict, object, rectify, port).

### Tabs
- **Inbox** · **In Progress** · **Awaiting Verification** · **Completed** · **Rejected** · **All**

### Filters
- Type (Access/Export, Deletion, Rectification, Restriction, Objection, Portability, Opt-Out of Sale) · Jurisdiction (GDPR/UK GDPR/CCPA/CPRA/LGPD/PIPEDA) · Source (Tenant portal/Email/Web form/Phone) · Tenant · Status · Verification status · SLA timer · Created range · Assignee

### Table
- Request ID · Type · Subject (email/name) · Tenant · Source · Jurisdiction · Status · SLA remaining · Created · Assignee · Actions

### Request detail
- **Sections:**
  - **Subject info:** name, email, identifiers, verification documents
  - **Verification:** ID upload, security questions, MFA challenge, verification status (Pending/Verified/Failed)
  - **Scope discovery:** systems queried (Postgres, S3, Sentry, Mailchimp, Stripe, …), result counts per system
  - **Action workflow:**
    - For **Export**: build ZIP (JSON + CSV), encryption + password, secure delivery link, expiry
    - For **Deletion**: confirm legal basis to retain (contract, legal obligation), redaction list, two-step confirm, irreversible
    - For **Rectification**: diff before/after, ticket to owning team
  - **SLA timer:** 30 days (GDPR) / 45 days (CCPA) with extension request
  - **Communication thread:** all messages with subject (templated)
  - **Audit trail:** every action timestamped, actor, immutable
  - **Final report:** generated PDF for the subject
- Permissions: typed confirmation for deletion ("DELETE-{subjectId}")

### Permissions
- **DPO · Compliance Officer · Admin:** Full · **Support:** Triage and intake only · **Read-Only Auditor:** Read

---

## Page 53. Backups & Restore

- **Route:** `/admin/security/backups`
- **Purpose:** Backup oversight and point-in-time recovery for the Flowtora platform.

### KPI strip
- **Last successful backup** · timestamp · age pill (green if <24h)
- **Backup size** · TB · trend
- **Successful jobs (30d)** · % · vs target 100%
- **RPO / RTO** · current · target

### Tabs
- **Schedules** · **Backup Jobs** · **Restore Tests** · **Per-Tenant Restore** · **Storage** · **Settings**

### Tab: Schedules
- Postgres continuous WAL · daily snapshot · weekly full · monthly archive · retention (7/30/90/365/forever)
- S3/R2 versioning + cross-region replication
- Redis snapshot
- Per row: Schedule · Frequency · Last run · Next run · Retention · Encryption · Region · Actions

### Tab: Backup Jobs
- **Filters:** Type · Status · Source · Date range · Region
- **Table:** Job ID · Type · Started · Duration · Size · Status · Region · Encryption · Verification (hash) · Actions (Download manifest · View logs)

### Tab: Restore Tests
- Scheduled monthly restore-to-isolated-env tests · last run · result · sample query checks · drill report PDF

### Tab: Per-Tenant Restore
- Initiate point-in-time restore for a single tenant
- Wizard: Select tenant → select timestamp (with hourly granularity past 7d, daily past 30d, monthly older) → preview affected tables → confirm with typed tenant slug → run in shadow → diff → apply or discard
- Restoration audit immutable

### Tab: Storage
- Storage location (AWS S3 / R2) · bucket health · CRR status · Glacier tier sizes · cost trend · total storage chart

### Tab: Settings
- Encryption keys (KMS) · key rotation · cross-account replication · backup vendor (Druva/AWS Backup/Velero)

### Permissions
- **SRE · Admin:** Full · **Support:** Read · **Read-Only Auditor:** Read

---

## Page 54. Incident Log

- **Route:** `/admin/security/incidents`
- **Purpose:** Incident response and postmortem tracking.

### Layout
- Top KPI strip · Tabs · Incident table

### KPI strip
- **Open incidents** · count by SEV
- **MTTR (30d)** · hours · trend
- **MTTD (30d)** · minutes · trend
- **Incidents (90d)** · count · sparkline by SEV

### Tabs
- **Active** · **Resolved** · **Postmortems** · **Status Page** · **Runbooks** · **On-Call Schedule**

### Filters
- Severity (SEV1/SEV2/SEV3/SEV4) · Status (Investigating/Identified/Monitoring/Resolved) · Service · Started range · Tags · Assignee · Postmortem due

### Table
- Incident ID · Title · SEV · Status · Started · Detected by · Commander · Affected services · Affected tenants · Duration · Postmortem · Actions

### Incident detail (`/admin/security/incidents/[id]`)
- **Header:** title, SEV, status pill, IC name, scribe, comms lead, time started, time identified, time resolved, duration
- **Tabs:**
  - **Timeline** — chronological events feed (auto from Slack/PagerDuty + manual entries) with actor and time
  - **Affected** — services, regions, tenant list (with notification status)
  - **Comms** — drafted updates for status page and email; Twitter/X post; tenant emails sent
  - **Mitigation** — actions taken, deploys involved, feature flags toggled
  - **Postmortem** — Markdown editor with template (What happened · Impact · Root cause · 5 Whys · Action items · Lessons learned · Customer-facing summary) — blameless tone enforced via copy guardrails
  - **Action items** — table linked to Linear/Jira (ID · Title · Owner · Due · Status)
  - **Metrics** — error-rate chart during window, request-rate chart, deploy markers, comparison vs normal
  - **Audit Log**
- Right rail: Quick actions — Update status · Page on-call · Post status update · Mark resolved · Schedule retro

### On-Call Schedule
- Calendar view with rotations, primary/secondary, hand-off times, escalation policies, override mechanism

### Status Page tab
- Public components list, current status, sub-status (Operational/Degraded/Partial Outage/Major Outage), maintenance windows, subscriber counts

### Permissions
- **SRE · Engineer on-call · Admin:** Full · **Support:** Read · **Read-Only Auditor:** Read

---

## Page 55. IP Allowlist / Geo Restrictions

- **Route:** `/admin/security/network`
- **Purpose:** Manage global and per-tenant network restrictions.

### Tabs
- **Global Allow** · **Global Block** · **Per-Tenant** · **Geo Restrictions** · **Tor / VPN / Proxy** · **Bot Mitigation** · **DDoS Events** · **WAF Rules**

### Tab: Global Allow / Block — table
- CIDR · Description · Tag · Created by · Created · Hits 24h · Last hit · Actions
- Add form: CIDR (IPv4/IPv6), description, tag, expiry

### Tab: Per-Tenant
- Tenant · Mode (Allowlist only / Blocklist / Disabled) · Rule count · Last edit · Actions

### Tab: Geo Restrictions
- World map (interactive) — click country to allow/block; table view with country, ISO, status, last hit, hits 24h
- Sanctions list auto-loaded (OFAC, EU)

### Tab: Tor / VPN / Proxy
- Toggle to block known Tor exits / commercial VPN / open proxies (3rd-party feed)
- Per-feed source, last update, override allowlist for legitimate users

### Tab: Bot Mitigation
- Cloudflare/AWS WAF integration · bot score thresholds · challenge config · rate-limit rules

### Tab: DDoS Events
- Timeline of mitigated attacks · peak Mbps/Mpps · duration · vector · attribution

### Tab: WAF Rules
- Custom rule editor (managed + custom) · OWASP CRS toggle · rate limits · regex match · action (Allow/Challenge/Block/Log)

### Permissions
- **Security Engineer · SRE · Admin:** Full · **Support:** Read · **Read-Only Auditor:** Read

---

# Section: System & Infrastructure

## Page 56. System Status

- **Route:** `/admin/system/status`
- **Purpose:** Real-time platform health across all internal services.

### Layout
- Top hero: overall status pill + uptime % (90d) for the platform
- Service grid (cards) · Dependency graph · Latency / Error charts · Status page editor

### Service grid (each card)
- Service name (API · Web · Auth · DB Primary · DB Replicas · Redis · Queue Workers · Object Storage · Search · Email · Webhooks · CDN · WebSocket · AI Services)
- Status pill (Operational/Degraded/Partial Outage/Major Outage/Maintenance)
- Uptime 30d %, latency p50/p95/p99 sparkline, error rate, throughput
- Click → service detail

### Service detail
- Time-series charts (1h/6h/24h/7d/30d): request rate, error rate, latency p50/p95/p99, saturation (CPU/Mem)
- Recent deploys overlay
- Active alerts
- Runbook link

### Dependency graph
- Interactive node-link diagram showing inter-service calls and current health colors

### Status Page Editor (sub-tab)
- Public status page builder: components, groups, subscriber list, manual incident posting (linked to Page 54), maintenance window scheduler, subscriber notifications (email/SMS/RSS/Atom)

### Permissions
- **SRE · Engineer · Admin:** Full · **Support:** Read · **Read-Only Auditor:** Read

### Real-time
- All charts and statuses stream via WebSocket; auto-refresh 10s

---

## Page 57. Background Jobs / Queues

- **Route:** `/admin/system/queues`
- **Purpose:** Inspect and manage background job queues (BullMQ/SQS/Cloud Tasks).

### KPI strip
- **Total queue depth** · count · trend
- **Throughput (jobs/min)** · trend
- **Error rate (24h)** · % · vs target
- **Dead-letter count** · count · CTA: View

### Tabs
- **Overview** · **Queues** · **Workers** · **Failed Jobs** · **Dead-Letter** · **Schedules** · **Slowest** · **Settings**

### Tab: Queues — table
- Queue name · Concurrency · Active · Waiting · Completed (24h) · Failed (24h) · Delayed · Throughput · Avg duration · p95 · Status · Actions (Pause · Resume · Drain · Flush · Replay failed)

### Tab: Workers
- Worker ID · Pool · Queues consumed · Last heartbeat · Active jobs · Memory · CPU · Version · Actions

### Tab: Failed Jobs
- **Filters:** Queue · Job name · Tenant · Date range · Error class
- **Table:** Job ID · Queue · Job name · Tenant · Failed at · Attempts · Error message · Actions (Retry · Skip · Delete · Move to DLQ)

### Tab: Dead-Letter
- DLQ table similar to Failed; bulk replay; export

### Tab: Schedules (cron)
- Cron jobs registry: name · expression · next run · last run · status · timezone · owner · enabled toggle

### Tab: Slowest
- Top 100 slowest jobs by p95 with sample payloads (PII redacted)

### Permissions
- **SRE · Engineer · Admin:** Full · **Support:** Read · **Read-Only Auditor:** Read

---

## Page 58. Email Deliverability

- **Route:** `/admin/system/email`
- **Purpose:** Monitor email sending health and reputation.

### KPI strip
- **Sent (24h)** · count · trend
- **Bounce rate** · % · target <2%
- **Complaint rate** · % · target <0.1%
- **Domain reputation** · Google Postmaster + Microsoft SNDS pull · grade

### Tabs
- **Overview** · **Volume** · **Bounces** · **Complaints** · **Suppression** · **Domain Authentication** · **Templates** · **Providers**

### Tab: Volume
- Time-series chart of sends, deliveries, opens, clicks, bounces, complaints, unsubscribes
- Per-template volume table

### Tab: Bounces
- **Filters:** Type (Hard/Soft/Block/Unknown) · Provider · Domain · Date range
- **Table:** Recipient · Type · Reason · SMTP code · Provider · Time · Tenant · Template · Actions (Suppress · Unsuppress · Investigate)

### Tab: Complaints
- Similar to bounces; auto-suppress on complaint

### Tab: Suppression List
- Searchable list · add manually · upload CSV · expiration management · audit trail of who added/removed

### Tab: Domain Authentication
- Per sending domain: SPF (record + status), DKIM (selectors + status), DMARC (record + alignment + reporting URI), BIMI (record + VMC cert), MX, hostname, last verified
- "Re-verify" button per record
- DMARC report viewer (aggregate XML decoded with sources, alignment, dispositions)

### Tab: Templates
- Per-template send count, open/click/bounce rates · A/B variants · suspended templates

### Tab: Providers
- Multi-provider routing (Resend primary, SendGrid backup, SES bulk) · per-provider health · automatic failover toggle · cost per provider

### Permissions
- **Engineer · Marketing Ops · Admin:** Full · **Support:** Read · **Read-Only Auditor:** Read

---

## Page 59. Storage & CDN

- **Route:** `/admin/system/storage`
- **Purpose:** Storage and CDN operations.

### KPI strip
- **Total storage** · TB · trend (12 mo)
- **Bandwidth (24h)** · GB · trend
- **CDN hit rate** · % · target ≥95%
- **Cost (MTD)** · $ · vs budget gauge

### Tabs
- **Overview** · **Per-Tenant** · **Buckets** · **CDN** · **Image Optimization** · **Lifecycle Policies** · **Egress Cost**

### Tab: Per-Tenant
- Top 100 tenants by storage · columns: Tenant · Plan · Storage used · Limit · % · Bandwidth (30d) · Files · Largest folder · Actions
- Anomaly detection: tenants with sudden storage growth highlighted

### Tab: Buckets
- Per bucket: Name · Region · Encryption · Versioning · Public access · Object count · Size · Lifecycle · Actions

### Tab: CDN
- POP map · cache hit rate per region · bandwidth per region · top URLs by bandwidth · purge tool (URL/prefix/tag)

### Tab: Image Optimization
- Sharp/Imgix metrics: total transformations · saved bytes · format conversion (WebP/AVIF) breakdown · top transforms

### Tab: Lifecycle Policies
- Rules per bucket: archive to Glacier after N days, delete after N days, version retention

### Tab: Egress Cost
- Daily egress GB and $ · top tenants by egress · suspected hotlinking detector

### Permissions
- **SRE · Admin:** Full · **Finance:** Egress Cost · **Support:** Read · **Read-Only Auditor:** Read

---

## Page 60. Database Health

- **Route:** `/admin/system/database`
- **Purpose:** PostgreSQL operational health.

### Layout
- KPI strip · Tabs · Charts and tables per tab

### KPI strip
- **Connections** · used / max · gauge
- **Replication lag (max)** · seconds · status
- **Slow queries (24h)** · count · trend
- **Disk usage** · % · gauge

### Tabs
- **Overview** · **Slow Queries** · **Index Usage** · **Tables & Bloat** · **Replication** · **Locks** · **Cache Hit Ratio** · **Vacuum / Analyze** · **Backups** · **Connections**

### Tab: Slow Queries
- pg_stat_statements feed: Query text (truncated, click for full) · Calls · Mean (ms) · Max · Total time · Rows · Plan link · Last seen · Actions (Analyze plan · Suggest index · Open in Linear)

### Tab: Index Usage
- Table · Index · Scans · Tuples read · Tuples fetched · Size · Hit ratio · Unused indexes flagged

### Tab: Tables & Bloat
- Table sizes · row counts · bloat % · last vacuum · last analyze · sequential scans vs index scans

### Tab: Replication
- Primary + replicas with lag, WAL position, sync state, restart history

### Tab: Locks
- Active locks, blocking sessions, longest waits, kill button (with typed confirmation)

### Tab: Cache Hit Ratio
- Buffer hit %, index hit %, target ≥99%

### Tab: Vacuum / Analyze
- Schedule and history · auto-vacuum stats · manual run

### Tab: Connections
- Active sessions · per-app/user · idle in transaction · CTA terminate stale

### Permissions
- **DBA · SRE · Admin:** Full · **Read-Only Auditor:** Read · others: hidden

---

## Page 61. Rate Limits & Quotas

- **Route:** `/admin/system/rate-limits`
- **Purpose:** Manage API rate limits, plan-based quotas, and abuse alerts.

### Tabs
- **Limits Editor** · **Per-Plan Quotas** · **Per-Tenant Overrides** · **Top Consumers** · **Throttled Requests** · **Abuse Alerts** · **Settings**

### Tab: Limits Editor
- Per endpoint pattern (e.g., `/v1/jobs`): RPS · Burst · Daily cap · Per-key vs per-IP vs per-tenant scope · Algorithm (Token bucket / Sliding window) · Actions

### Tab: Per-Plan Quotas
- Plan · API calls/month · Storage · Users · Webhooks/month · Overage rate · Soft/Hard cap

### Tab: Per-Tenant Overrides
- Tenant · Endpoint · Override · Reason · Expires · Granted by · Actions

### Tab: Top Consumers (24h)
- Tenant · API key · Endpoint · Requests · % of plan quota · Throttled count · Action (Inspect · Throttle further · Email)

### Tab: Throttled Requests
- Time-series chart · top throttled endpoints · top throttled tenants

### Tab: Abuse Alerts
- Anomaly detection (sudden 10× spike, suspicious patterns) · severity · suggested actions

### Permissions
- **SRE · Engineer · Admin:** Full · **Support:** Read · **Read-Only Auditor:** Read

---

## Page 62. Feature Flags

- **Route:** `/admin/system/feature-flags`
- **Purpose:** Centralized feature flag management.

### Layout
- Top: flags table with inline rollout strategy editor · slide-over for full detail

### Filters
- Status (On/Off/Partial) · Environment · Tag · Owner · Updated range · Search

### Table columns
- Flag key · Description · Default · Production rollout · Staging rollout · Sandbox · Type (Boolean / Multivariate / String / Number / JSON) · Owner · Last updated · Dependents · Actions

### Flag detail panel
- **Sections:**
  - **Targeting:** rule editor — IF (tenant in segment X) AND (plan = Pro) AND (random < 10%) THEN value = ON; multiple ordered rules · default
  - **Variants** (for multivariate): list with weights summing to 100
  - **Segments:** named tenant/user lists referenced by rules
  - **Schedule:** start time, ramp schedule (e.g., 0% → 25% → 50% → 100% over 7 days)
  - **Dependencies:** flags this depends on; flags depending on this
  - **Change history:** every edit with diff, actor, time, rollback button
  - **Code references:** auto-scanned repo references (file, line, last seen commit)
  - **Metrics:** evaluations/sec, % each variant, conversion impact (if PostHog/A-B linked)
  - **Kill switch:** big red button to immediately set OFF in production
  - **Audit Log**

### Permissions
- **Engineer · PM · Admin:** Full · **Support:** Read · **Read-Only Auditor:** Read

### Real-time
- Flag value changes apply within 5s via long-poll/WebSocket; UI shows "Propagated" status per environment.

---

## Page 63. Environment Variables

- **Route:** `/admin/system/env`
- **Purpose:** Read-only summary of platform configuration across environments (secrets redacted).

### Layout
- Filterable table; secret values shown as `••••••••••` with copy disabled and reveal requiring re-auth + reason

### Filters
- Environment (Production · Staging · Sandbox · Preview) · Service · Type (Secret/Config) · Sync status · Updated range · Search

### Columns
- Variable name · Value (redacted/visible) · Type · Service · Environments (chip showing where set) · Last updated · Updated by · Source (Vault/Doppler/AWS Secrets Manager) · Actions

### Diff view
- Side-by-side comparison: Production vs Staging · highlights differences

### Detail panel
- Variable history (each change masked, only metadata: who, when, source) · referencing services/code · rotation policy

### Permissions
- **SRE · Engineer · Admin (with re-auth):** Full · **Support:** Hidden · **Read-Only Auditor:** Read names only

---

## Page 64. Logs & Errors

- **Route:** `/admin/system/logs`
- **Purpose:** Searchable structured logs and error grouping.

### Tabs
- **Live Tail** · **Search** · **Errors (Sentry-like)** · **Saved Queries** · **Alerts**

### Tab: Live Tail
- Streaming log lines with severity color-coding (DEBUG/INFO/WARN/ERROR/FATAL); pause/play; level filter; service filter; auto-scroll lock
- Each line: timestamp · severity · service · trace ID · message; click for structured fields panel

### Tab: Search
- Query bar (Lucene-style + saved snippets); date range; severity; service; tenant; trace ID; user ID
- Histogram of matches over time
- Result table with expandable rows
- Field facets sidebar (top values per field with counts)

### Tab: Errors (Sentry-like)
- **Filters:** Status (Unresolved/Resolved/Ignored) · Project · Environment · First seen · Last seen · Frequency · Assignee · Tag (browser, device, region)
- **Table:** Issue · First seen · Last seen · Events · Users affected · Tenants affected · Status · Assignee · Actions
- Issue detail: stacktrace with source maps, breadcrumbs, request, user, device, related issues, similar issues, assign, link to Linear, mark resolved, ignore until version X / N events / N days

### Tab: Saved Queries
- Per-team saved queries with notification settings

### Tab: Alerts
- Define alert (e.g., error count > X in Y min) · channels (Slack, PagerDuty, Email, Webhook) · status

### Permissions
- **Engineer · SRE · Support · Admin:** Full · **Read-Only Auditor:** Read


---

# Section: Configuration

## Page 65. Platform Settings

- **Route:** `/admin/settings/general`
- **Purpose:** Global Flowtora platform configuration controls.

### Layout
- Two-column form layout (label left, control right) grouped into card sections.

### Sections

#### Identity
- **Platform name** *(text)* default "Flowtora"
- **Platform short name** *(text)* default "Flowtora" — used in compact UI
- **Tagline** *(text)*
- **Support email** *(email)*
- **No-reply email** *(email)*
- **Sales email** *(email)*
- **Press email** *(email)*
- **Mailing address** *(textarea)* — used in email footers
- **Phone number** *(tel)*

#### Defaults
- **Default timezone** *(IANA tz select, default America/Los_Angeles)*
- **Default language** *(select)*
- **Default currency** *(select, ISO 4217)*
- **Default date format** *(select; e.g., MM/DD/YYYY · DD/MM/YYYY · YYYY-MM-DD)*
- **Default time format** *(12h / 24h)*
- **Default first day of week** *(Sun/Mon)*
- **Default measurement** *(Imperial / Metric)*

#### Business hours
- **Business hours** *(per weekday, open/close times, observed holidays)*
- **Holiday calendar** *(import .ics, manual list)*

#### Maintenance
- **Maintenance mode** *(toggle)* — when ON, tenants see status banner; admins still have access
- **Maintenance message** *(textarea, Markdown)*
- **Maintenance ETA** *(datetime)*
- **Allowed admin IPs during maintenance** *(tags)*

#### Signup & Trial
- **Public signup enabled** *(toggle)*
- **Default trial length (days)** *(number, 0–60)*
- **Require credit card for trial** *(toggle)*
- **Default plan on signup** *(select)*
- **Block disposable email domains** *(toggle)*

#### Session & Security
- **Admin session lifetime** *(duration)*
- **Idle timeout** *(duration)*
- **Concurrent admin sessions** *(number)*
- **Force MFA for admins** *(toggle)*

#### Communication preferences
- **Default sender name** *(text)*
- **Default reply-to** *(email)*
- **System banner** *(text + variant + dismissable toggle + expiry)*

#### Audit & Compliance
- **Audit retention (days)** *(number)*
- **Anonymize PII in audit log after** *(days, optional)*

#### Feature defaults
- **Default plan features visibility** *(toggle list)*

#### Save behavior
- Sticky footer with "Save changes" (Primary) and "Discard"; unsaved-changes warning on navigation; full audit log on save

### Permissions
- **Admin · Super Admin:** Full · **Support:** Read · **Read-Only Auditor:** Read

---

## Page 66. Branding & White-Label

- **Route:** `/admin/settings/branding`
- **Purpose:** Manage Flowtora's own branding and white-label options for resellers and Enterprise tenants.

### Tabs
- **Flowtora Brand** · **White-Label Profiles** · **Per-Tenant Branding** · **Email Footer** · **Login Pages** · **Powered-By**

### Tab: Flowtora Brand
- Logo full color · monochrome · favicon · social card (Open Graph) · app icon (PWA)
- Brand colors (link to design tokens) · accent options
- Typography overrides
- Marketing site brand kit download (ZIP)

### Tab: White-Label Profiles
- A profile is a brand a reseller offers. List of profiles · Create profile.
- Profile editor:
  - Profile name · Reseller (link)
  - Logo (light/dark) · favicon · email logo
  - Color palette overrides · font overrides (Google Fonts allowlist)
  - Custom domain · subdomain
  - Email "from" name and domain
  - Login page URL slug
  - Footer text · social links
  - Removed mentions of Flowtora? *(toggle, requires Enterprise reseller)*
  - SMS sender name (alphanumeric where supported)
  - Custom favicon for PWA
- Apply to tenant(s) (multi-select)

### Tab: Per-Tenant Branding
- Table of tenants and their applied profile · custom overrides flag · last edit
- Force-revert to default action

### Tab: Email Footer
- Template editor (MJML/React Email) for the global email footer; supports per-profile variables; preview pane

### Tab: Login Pages
- Per-profile login page builder: hero image, headline, sub-text, background image/color, CTA, marketing copy, social proof
- Preview at provisioned domain

### Tab: Powered-By
- Toggle "Powered by Flowtora" badge ON/OFF per plan or per profile (Enterprise only)
- Badge variants

### Permissions
- **Brand Admin · Admin:** Full · **CSM:** Per-Tenant Branding · **Read-Only Auditor:** Read

---

## Page 67. Localization

- **Route:** `/admin/settings/localization`
- **Purpose:** Languages, currencies, regional formats, and translation workflow.

### Tabs
- **Languages** · **Currencies & FX** · **Regional Formats** · **Translation Editor** · **String Stats** · **Glossary** · **Settings**

### Tab: Languages
- **Table:** Language · Locale (e.g., en-US, es-MX, fr-FR, de-DE, pt-BR, it-IT, ja-JP, zh-CN, ar-SA, …) · Status (Enabled/Beta/Hidden) · % translated · Source · Owner · RTL flag · Actions
- Top action: `+ Add Language`

### Tab: Currencies & FX
- **Table:** Code · Name · Symbol · Decimals · FX rate (vs USD) · FX source (ECB/Open Exchange Rates/Fixer) · Last updated · Status · Actions
- **Settings:** Auto-update rate (cron) · Manual override · Margin %

### Tab: Regional Formats
- Per locale: date format · time format · number format (decimal/thousand separators) · paper size (Letter/A4) · phone format · address format

### Tab: Translation Editor
- Three-column layout: keys list (left) · source string (center) · target translation (right)
- **Filters:** Locale · Module (Admin/Tenant App/Email/SMS) · Status (Translated/Pending/Outdated/Needs Review) · Has variables · Plurals
- Keyboard shortcuts: J/K next/prev · CMD+S save · CMD+ENTER save & next
- Inline diff with source on outdated entries
- Suggestion engine (DeepL/GPT) with one-click accept
- Variable validation (e.g., `{count}` must appear in target)
- Comments / context per key
- Bulk import/export (XLIFF, JSON, PO/POT, CSV)
- Translator role assignment per locale

### Tab: String Stats
- Per locale: total keys · translated · pending · outdated · review · top contributors · trend chart (30d)

### Tab: Glossary
- Term list with translations per locale, do-not-translate flag, gender, plural forms

### Tab: Settings
- ICU MessageFormat support · plural rules per locale · fallback chain · pseudolocalization toggle (test)

### Permissions
- **Localization Manager · Admin:** Full · **Translator (per locale):** Edit own locale · **Read-Only Auditor:** Read

---

## Page 68. Notification Templates

- **Route:** `/admin/settings/notifications`
- **Purpose:** Author and version transactional email, SMS, push, and in-app notification templates.

### Layout
- Three-pane: tree of templates (left) · editor (center) · preview + metadata (right)

### Sidebar tree
- **By trigger:** Tenant Lifecycle · Subscription · Invoice · Payment · User · Job · Marketing · System · Security · Support
- Each leaf shows a template (name + channel icon + active/inactive)

### Channels per template
- **Email** (subject, preheader, MJML/React Email body) · **SMS** (text, GSM-7 char counter) · **Push** (title, body, deep link) · **In-app** (title, body, CTA, icon, color)

### Editor pane (Email)
- React Email JSX editor with Monaco · component palette · live preview pane · device toggle (Desktop/Mobile/Outlook) · Litmus integration test · spam-score check
- Variables drawer (autocomplete from event payload schema)
- A/B variants
- Conditional sections (`{#if user.firstName}` blocks)

### Right rail metadata
- Template ID · Trigger event · Channel · Subject · Preheader · From · Reply-to · Tags · Locales (per-locale tabs) · Active toggle · Owner · Last edit · Test send (recipient input + variables)
- Version history with diff and rollback

### List view (when nothing selected)
- Table: Template · Trigger · Channels · Locales · Active · Send rate (24h) · Open rate · Click rate · Last edit · Actions

### Approval workflow
- Draft → In review → Approved → Live
- Reviewer sign-off required for high-volume templates

### Permissions
- **Marketing Ops · Lifecycle Manager · Admin:** Full · **Support:** Read + comment · **Read-Only Auditor:** Read

---

## Page 69. Webhooks Catalog

- **Route:** `/admin/settings/webhooks`
- **Purpose:** Public catalog of every webhook event Flowtora emits — schemas, samples, deprecation notices.

### Layout
- Sidebar tree (event categories) · main content (event detail)

### Per event detail
- **Header:** Event name · Stability (Stable/Beta/Deprecated) · Since version · Latest schema version
- **Sections:**
  - **Description** (Markdown)
  - **Schema** (JSON schema viewer with collapsible nodes)
  - **Sample payload** (full JSON viewer with copy button)
  - **Trigger conditions** (when this fires; idempotency notes)
  - **Delivery semantics** (at-least-once, ordering guarantees)
  - **Versions** (changelog per version with diff)
  - **Subscribers** (count, top tenants if applicable)
  - **Code samples** (Node, Python, Ruby, PHP, Go, cURL receiver examples + signature verification snippet)
  - **Test event** sender (admin can fire a test to a chosen endpoint)

### Permissions
- **Engineer · DevRel · Admin:** Full · **Support:** Read · **Read-Only Auditor:** Read

---

## Page 70. Domain Management

- **Route:** `/admin/settings/domains`
- **Purpose:** Custom-domain provisioning for tenants, including DNS, SSL, and apex/subdomain handling.

### Tabs
- **Custom Domains** · **DNS Templates** · **SSL Certificates** · **Apex Setup Helpers** · **Settings**

### Tab: Custom Domains
- **Filters:** Tenant · Status (Pending DNS/Verifying/Active/Issuing SSL/Expiring/Failed/Disabled) · Type (Apex/Subdomain) · Created range · Expiring within (30/60/90d)
- **Table:** Domain · Tenant · Type · Status · DNS records correct · SSL issuer (Let's Encrypt / paid) · SSL expiry · Created · Last verified · Actions (Re-verify · Reissue cert · Disable · Delete)

### Custom-domain detail / wizard
- Step 1: Enter domain · validate format · check ownership against trademark blocklist
- Step 2: DNS instructions — show CNAME / ALIAS / A record to copy; per-popular-DNS provider screenshots (Cloudflare, Route 53, GoDaddy, Namecheap, Squarespace)
- Step 3: Verification — auto-poll DNS, status pill updates
- Step 4: SSL issuance — Let's Encrypt (default) or upload custom cert; SAN list; ACME challenge type (HTTP-01 / DNS-01)
- Step 5: Activation — set as primary, toggle redirect from www, HSTS preload, force HTTPS
- Detail page also shows: cert chain viewer, CAA records check, MX (warn if domain has email), redirect rules editor

### Tab: DNS Templates
- Per environment, copy-able TXT/CNAME records for verification
- Wildcard subdomain config

### Tab: SSL Certificates
- All certs with issuer, expiry, SAN list, auto-renew status, last renewal, renewal log

### Tab: Apex Setup Helpers
- Provider-specific guides for ALIAS/ANAME, with diagrams

### Tab: Settings
- Default issuer · ACME account email · CA fallback list · HSTS defaults · Cert revocation procedure

### Permissions
- **SRE · CSM · Admin:** Full · **Support:** Read + re-verify · **Read-Only Auditor:** Read

---

## Page 71. Legal Documents

- **Route:** `/admin/settings/legal`
- **Purpose:** Versioned editor for legal documents with tenant acceptance tracking.

### Tabs
- **Documents** · **Versions** · **Acceptance Tracking** · **Locales** · **Mandatory Re-acceptance** · **Settings**

### Tab: Documents — list
- Terms of Service · Privacy Policy · Acceptable Use Policy · DPA · Sub-Processor Addendum · SLA · Cookie Policy · Cookie Consent Categories · Refund Policy · Anti-Spam Policy · Master Service Agreement · Order Form Template · Reseller Agreement · Affiliate Agreement · Marketplace Developer Agreement
- Each row: doc · current version · published date · tenants accepted % · pending re-accept count · status

### Document editor
- **Monaco diff editor** (Markdown)
- Left pane: Markdown source with versioning · Right pane: rendered preview (Tailwind prose typography matching public site)
- Variables: `{{platform_name}}`, `{{effective_date}}`, `{{company_name}}`, `{{jurisdiction}}` etc.
- Linting (heading hierarchy, broken anchors, dangerous clauses flagged)
- Track changes mode (lawyer-style redlines)
- Comment threads inline
- Approval workflow: Draft → Legal review → Counsel sign-off → Published

### Tab: Versions
- Per document version history with effective date, prior version, redline diff, who approved, reason for change

### Tab: Acceptance Tracking
- **Filters:** Document · Version · Tenant plan · Acceptance status · Date range
- **Table:** Tenant · User who accepted · IP · User agent · Version · Accepted at · Method (clickwrap/email/signed PDF) · Actions

### Tab: Locales
- Per-locale translations of each document with translation status

### Tab: Mandatory Re-acceptance
- Trigger re-acceptance for selected tenants/users on next login · banner copy editor · grace period · enforcement (block app until accepted)

### Tab: Settings
- Default jurisdiction · governing law · arbitration provider · venue · effective-date generation

### Permissions
- **Legal · General Counsel · Admin:** Full · **Compliance Officer:** Read · **Support:** Read · **Read-Only Auditor:** Read

---

# Section: Personal

## Page 72. My Profile

- **Route:** `/admin/me/profile`
- **Purpose:** The signed-in admin's personal profile and security settings.

### Tabs
- **Profile** · **Security** · **Sessions** · **Connected Accounts** · **Preferences** · **Recovery Codes**

### Tab: Profile
- Avatar (upload/remove · gravatar fallback) · Display name · First name · Last name · Pronouns · Title · Department · Bio · Phone · Slack handle · Email (primary) · Email (secondary) · Timezone · Language · Date/time formats

### Tab: Security
- Change password (current + new + confirm; strength meter; breach check via HIBP API)
- MFA setup: TOTP authenticator (QR + secret), SMS, WebAuthn/Passkey, recovery codes
- Trusted devices list with revoke
- Last password change · Password expiry · Force re-auth on sensitive ops toggle

### Tab: Sessions
- Active sessions: device · browser · OS · IP · location · created · last active · current pill · Sign out / Sign out everywhere

### Tab: Connected Accounts
- Linked SSO providers · GitHub · Google · Microsoft · Slack identity · Linear · Disconnect

### Tab: Preferences
- Theme (Light/Dark/System) · Density (Comfortable/Compact) · Sidebar default (Expanded/Collapsed) · Default landing page · Auto-refresh defaults · Currency display · Beta features opt-in

### Tab: Recovery Codes
- Generate / regenerate 10 single-use codes (download · print · copy)

### Permissions
- **Self only.** Other admins cannot edit (see Page 9 user detail for admin-of-admin actions).

---

## Page 73. My Notifications

- **Route:** `/admin/me/notifications`
- **Purpose:** Per-channel notification preferences for the signed-in admin.

### Layout
- Matrix table: rows = event categories, columns = channels (Email · In-app · Slack · SMS · Push)
- Each cell: toggle + frequency dropdown (Real-time / Hourly digest / Daily digest / Weekly digest / Off)

### Categories
- Tenants (signups, churn, suspensions, upgrades, downgrades, big payments)
- Billing (failed payments, dunning, refunds, disputes)
- Support (assigned ticket, mentions, SLA breach, escalations)
- Security (suspicious login, MFA disabled, role changes, impersonation requests)
- System (incidents SEV1/2, deploys, alerts)
- Marketing (campaign results)
- Personal (digests, weekly summary)

### Below matrix
- **Quiet hours** (per weekday start/end)
- **Slack workspace and channel** binding
- **SMS phone** (verified)
- **Email digest schedule**
- **Snooze all** (1h / 4h / Until tomorrow / Custom)

### Permissions
- **Self only.**

---

## Page 74. My API Keys

- **Route:** `/admin/me/api-keys`
- **Purpose:** Personal API tokens for admin use (audit-scoped).

### Layout
- Toolbar: `+ Create personal token` · Filter by scope/status
- **Table:** Name · Prefix · Scopes · Created · Last used · Expiry · Status · Actions (Rotate · Revoke · View usage)
- Detail: usage chart (calls/day), top endpoints, IP allowlist, expiry, audit (every operation made with this key)

### Create modal
- Name · scopes (subset of admin's role) · expiry · IP allowlist · description
- Reveal-once token modal

### Permissions
- **Self only.** Org admins can revoke any admin's keys (see Page 9).

---

## Page 75. Keyboard Shortcuts

- **Route:** `/admin/me/shortcuts`
- **Purpose:** Reference and customization of keyboard shortcuts.

### Layout
- Search bar at top · grouped list of shortcuts · per shortcut: action label · current binding (Kbd display) · default binding · "Edit" pencil opens recorder

### Default shortcut groups

| Group | Action | Default |
|---|---|---|
| Navigation | Open command palette | `Cmd/Ctrl+K` |
| Navigation | Go to Dashboard | `G then D` |
| Navigation | Go to Tenants | `G then T` |
| Navigation | Go to Users | `G then U` |
| Navigation | Go to Billing | `G then B` |
| Navigation | Go to Audit Log | `G then A` |
| Navigation | Go to Settings | `G then S` |
| Navigation | Go to Support Tickets | `G then I` |
| Navigation | Toggle sidebar | `[` |
| Navigation | Toggle theme | `Shift+T` |
| Search | Focus global search | `/` |
| Search | Recent searches | `Cmd/Ctrl+Shift+K` |
| Create | New tenant | `C then T` |
| Create | New user | `C then U` |
| Create | New ticket | `C then I` |
| Create | New announcement | `C then A` |
| Create | New feature flag | `C then F` |
| Create | New coupon | `C then C` |
| Tables | Next row | `J` |
| Tables | Prev row | `K` |
| Tables | Open row | `Enter` |
| Tables | Select row | `X` |
| Tables | Select all | `Cmd/Ctrl+A` |
| Tables | Bulk action menu | `B` |
| Tables | Refresh | `R` |
| Tables | Toggle filters | `F` |
| Tables | Toggle columns | `Shift+C` |
| Detail pages | Next tab | `Cmd/Ctrl+Right` |
| Detail pages | Prev tab | `Cmd/Ctrl+Left` |
| Detail pages | Edit | `E` |
| Detail pages | Add note | `N` |
| Detail pages | Impersonate | `I` |
| Detail pages | Pin | `P` |
| Forms | Save | `Cmd/Ctrl+S` |
| Forms | Save and continue | `Cmd/Ctrl+Shift+S` |
| Forms | Cancel | `Esc` |
| Forms | Submit | `Cmd/Ctrl+Enter` |
| Notifications | Open notification center | `N` |
| Notifications | Mark all read | `Shift+N` |
| Help | Open shortcut help | `?` |
| Help | Open documentation | `Shift+/` |
| Account | Sign out | `Cmd/Ctrl+Shift+Q` |

### Customization
- Click "Edit" to open recorder modal: press desired combo · check for conflicts · save
- Reset all to defaults
- Export as JSON · Import JSON

### Permissions
- **Self only.**

---

# Global UX Specifications

## Command Palette (CMD+K)

- **Trigger:** `Cmd+K` (macOS) / `Ctrl+K` (Windows/Linux), or click global search bar in top bar
- **Placement:** centered modal · 640px wide · 480px max-height · 16px from top of viewport on mobile
- **Animation:** fade + scale 0.96→1 over 150ms ease-out

### Anatomy
- Search input with leading magnifying-glass icon and trailing `Esc` Kbd hint
- Result list grouped by category with sticky group headers
- Footer hint strip: `↑↓ navigate · ↵ select · Esc close · Tab actions`

### Result categories (in this priority order)
1. **Suggested actions** (context-aware: "Impersonate Acme Signs", "View this tenant's invoices")
2. **Recent items** (last 10 things visited, with timestamp)
3. **Tenants** (name, slug, plan, MRR · matched substring)
4. **Users** (name, email, tenant)
5. **Invoices** (number, tenant, amount, status)
6. **Subscriptions** (tenant, plan, status)
7. **Tickets** (number, subject, requester)
8. **Jobs** (number, tenant, status)
9. **Audit events** (search by actor, action, resource)
10. **Documents / KB articles**
11. **Pages / Navigation** (every admin page)
12. **Settings** (every settings sub-page and toggle)
13. **Feature flags** (search by key)
14. **Create new ...** (Tenant, User, Coupon, Announcement, Flag, Ticket, Plan)
15. **Quick toggles** (Toggle theme · Toggle sidebar · Sign out · Switch environment)
16. **Help** (Open docs · Keyboard shortcuts · Status page · Contact engineering)

### Behaviors
- **Fuzzy search** (Algolia/Meilisearch); typo tolerance; weighted by recency and role-relevance
- **Keyboard:** ↑↓ navigates, Enter executes, `Tab` reveals contextual actions for highlighted item (Impersonate, Open, Copy ID, Copy URL, Open in new tab)
- **Slash commands:** typing `>` switches to "Run command" mode (e.g., `> toggle dark mode`); typing `?` invokes help search
- **Pin to top:** users can pin items (per-user)
- **Keyboard shortcut help:** `?` from anywhere opens it
- **Recent searches:** stored client-side; private to user
- **AI mode toggle (`Tab`):** routes the query through an AI assistant that can answer about platform state (read-only) — uses Claude API via internal proxy with full audit
- **Permissions filter:** results respect role permissions; restricted items hidden
- **Environments scope:** results constrained to current environment; switching env is one of the quick toggles

### Empty state
- Recent searches and suggested actions only

### Error state
- "Search is temporarily unavailable" with retry CTA + status page link

---

## Notification Center

- **Trigger:** Bell icon in top bar; red dot when unread; numeric badge for >9
- **Placement:** right-side slide-over · 400px wide · full height
- **Hotkey:** `N` to open

### Header
- Title "Notifications" · Tabs (All · Unread · Mentions · System · Billing · Security · Tenants · Tickets) · Mark all read · Settings (links to Page 73)

### List
- Grouped by date: Today · Yesterday · This week · Older
- Each notification card:
  - Icon (category-colored dot)
  - Title (one line)
  - Snippet (two lines max)
  - Actor avatar + name
  - Timestamp ("2m ago" with absolute on hover)
  - Inline actions (per type): Open · Mark read · Snooze · Mute thread · Reply (for mentions)
  - Unread state: bolder text, subtle background, blue dot
- **Snooze options:** 1h, 4h, Tomorrow 8am, Next week, Custom
- Infinite scroll with virtualized list

### Filters
- Severity (Info/Success/Warning/Error/Critical)
- Source (System/Tenant/Billing/Security/Marketing)
- Date range

### Footer
- "View all" link to `/admin/me/notifications/history` full-page archive
- "Notification preferences" link

### Real-time
- WebSocket pushes; toast preview for new high-severity items even if Notification Center is closed; sound toggle in preferences

### Empty states per tab
- All: "You're all caught up." (illustration + last refresh time)
- Mentions: "No mentions yet."

---

## Impersonation Banner

- **Visibility:** Persistent across the entire admin portal whenever an impersonation session is active
- **Placement:** top of viewport, full width, sticky, z-1100 (above top bar)
- **Height:** 40px desktop · 56px mobile (wraps onto two lines)
- **Color:** amber-500 background, slate-900 text (high contrast warning)
- **Animation:** subtle pulse on the leading icon every 3s

### Anatomy (left to right)
- **Eye icon** (filled, slate-900)
- **Label:** `Impersonating {tenant.name} as {target_user.email}`
- **Tenant logo** (16px) — clickable to open tenant detail in new tab
- **Time elapsed** (live, mm:ss · turns red after 50% of max duration)
- **Reason chip** (truncated; click to view full reason)
- **Action buttons:**
  - `Add note` (records a note attached to this session)
  - `Take screenshot` (records UI screenshot to session evidence)
  - `Pause` (halts session timer for the impersonator's interactions; tenant unaffected)
  - `End impersonation` (Primary — destructive amber)

### Behavior
- Cannot be dismissed
- Banner is also rendered to the impersonated tenant's UI if the policy is "Notify tenant" (controlled per page-8 rule)
- All clicks/network calls during session are tagged with `actor.real_id`, `actor.impersonated_id`, `session_id` and written to immutable audit
- Auto-end on max duration; warning toast at 80% remaining

### Mobile
- Banner stacks the meta line under the label; the End button remains primary and full-width on small screens

---

## Empty States (Global Pattern)

- **Composition:** centered illustration (24% of column width, max 320px) · H3 title · body subtext (max 56ch) · primary CTA (and optional secondary tertiary link)
- **Tone:** friendly, never blaming the user; offer one obvious next step

### Per-page-type defaults

| Page type | Title | Body | CTA |
|---|---|---|---|
| Tenants list (no data) | No tenants yet | Once shops sign up, they'll appear here. You can also onboard one manually. | + New Tenant |
| Tenants list (filtered) | No tenants match | Try clearing some filters or expanding your date range. | Clear filters |
| Invoices | No invoices to show | Invoices will appear when subscriptions bill. | View subscriptions |
| Tickets | No tickets in this view | Nice — your queue is clean. | Switch view |
| Audit log | No matching events | Adjust filters or pick a wider date range. | Reset filters |
| Webhooks | No endpoints | Receive Flowtora events at your URL. | + Add endpoint |
| Feature flags | No flags yet | Create your first flag to start gradual rollouts. | + Create flag |
| Custom domains | No domains | Tenants who add custom domains show up here. | View guide |
| Backups list | No backups visible | Backups run on schedule — check your schedules tab. | Open Schedules |
| Charts (no data) | Not enough data | Once activity starts, this chart will populate. | — |
| Search results | No results | Try a different query or use a filter. | Clear search |
| Settings page (no overrides) | Using defaults | Override a setting to customize behavior here. | Edit |

### Illustrations
- Two consistent line-art styles: minimal monochrome (default) and brand-accent flat
- Industry-flavored options: vinyl-roll, banner, screen-press, embroidery hoop (used in Catalog/Operations sections)

---

## Error States (Global Patterns)

### 404 — Not Found
- Hero illustration · "We couldn't find that page." · subtext "It may have moved or been deleted." · CTAs: Go to Dashboard · Search · Contact support · Status page · Footer: error ID, time, request ID

### 403 — Forbidden / Insufficient Permissions
- "You don't have permission to view this." · subtext explains required role/permission · CTAs: Request access (opens role-request modal) · Switch organization · Sign in as another user · Footer: shows current role and what role is needed

### 500 — Server Error
- "Something went wrong on our end." · friendly subtext · auto-reported with error ID · CTAs: Retry · Report a bug (opens prefilled form) · Status page · Sign out · Footer: error ID copy button

### 503 — Maintenance / Service Unavailable
- "We're undergoing scheduled maintenance." · ETA from Platform Settings · CTAs: Status page · Subscribe to updates · Footer: maintenance window time

### Network / Offline
- Top banner ("You're offline · Reconnect attempts in 12s · Retry now") · graceful queue of writes when feasible · last-synced timestamps shown across UI

### Permission elevation required
- Inline modal: "This action requires re-authentication" · password + MFA prompt · reason field · audit captured

### Rate-limited
- Toast + page banner: "You've hit a rate limit. Try again in 12s." · friendly explanation · contact link

### Validation summary
- Top-of-form alert summarizing N errors with anchor links to each invalid field

---

## Mobile Responsiveness

### Breakpoints
- `sm` 640 · `md` 768 · `lg` 1024 · `xl` 1280 · `2xl` 1536

### Layout
- **Sidebar:** below `md`, sidebar is hidden by default; replaced by a hamburger button in top bar opening a left-side drawer; bottom-sheet variant for `<sm` with sticky search input
- **Top bar:** condenses to logo + search (compact) + bell + avatar; "Create" dropdown moves into avatar menu; environment switcher moves into avatar menu
- **Tables:** below `md`, list pages render rows as **stacked cards** with primary identifier, key metadata, status pill, and a kebab actions menu; column visibility decided by priority weighting
- **Detail pages:** tab bar becomes horizontally scrollable (snap), sticky on scroll; right rails (quick actions) slide-over via FAB or bottom sheet
- **Charts:** stack vertically; tooltip becomes pin-on-tap; legend collapses to chip list
- **Modals:** `<sm` go full-screen; `>=md` standard centered
- **Forms:** single column; sticky save bar at bottom
- **Filter bars:** turn into a "Filters (3)" button opening a bottom sheet

### Touch targets
- ≥44×44 px

### Performance
- Critical CSS inlined; route-level code splitting; image lazy-load with `loading="lazy"`; intersection-observer pre-fetch on hover/focus

### PWA
- Installable; offline shell for read-only views (Dashboard cached snapshot, last-viewed tenant cards); push notifications for assigned tickets / SEV1+ incidents

### Mobile shortcuts
- Pull-to-refresh on list pages
- Swipe-left on row → quick actions (Mark read · Snooze · Archive)
- Long-press → multi-select mode

---

## Accessibility (Extended)

### Compliance target
- WCAG 2.2 AA · Section 508 · EN 301 549 · ADA Title III informed

### Foundations
- Semantic HTML always; landmark roles (`header`, `main`, `nav`, `aside`, `footer`); single `<h1>` per page; logical heading order
- All interactive elements keyboard-reachable in a logical order; visible focus ring (2px brand-500 with 2px offset)
- Skip-to-content link as first focusable element
- "Skip to filters" / "Skip to results" links on list pages
- Modal focus trap with restoration on close; ESC always closes
- ARIA live regions for toasts, real-time counters, queue depths

### Color & contrast
- All text ≥4.5:1 against backgrounds (≥3:1 for ≥18pt)
- Status pills accompany color with icons and text labels
- Charts: color-blind safe palette (Okabe-Ito); pattern fills available; data tables companion

### Motion
- Respect `prefers-reduced-motion` — disable parallax, autoplay, large transitions
- No flashing >3 Hz

### Forms
- Every field has an associated `<label>`; required fields announced; error messages linked via `aria-describedby`; inline guidance text
- `autocomplete` attributes on personal info fields

### Tables
- `<th scope="col">`, `<caption>`, sticky header announced; row selection state via `aria-selected`; sort state via `aria-sort`

### Charts
- Each chart has a textual description (`aria-label`) and an "Open data table" link providing equivalent info

### Internationalization & RTL
- Logical CSS properties (`margin-inline-start` etc.); RTL-aware icons (chevrons mirror); BiDi-safe data formatting

### Testing
- axe-core in CI; pa11y per page; keyboard-only smoke tests; screen-reader matrix (NVDA, JAWS, VoiceOver, TalkBack)

---

## Performance Standards

### Budgets
- **TTFB ≤ 200ms (p75)** for SSR'd admin pages
- **LCP ≤ 2.0s** desktop · **≤ 2.5s** mobile
- **INP ≤ 200ms** (p75)
- **CLS ≤ 0.05**
- **JS payload (initial)** ≤ 220KB gz per route
- **API p95 ≤ 250ms** for read endpoints; ≤ 750ms for write endpoints

### Patterns
- React Server Components for data fetching where possible
- Suspense boundaries with skeletons (never spinners alone) on every async section
- TanStack Query for client-side caching with sensible `staleTime` per resource
- Server-driven pagination + cursor for tables; virtualize >1000 rows (TanStack Virtual)
- Recharts charts code-split and lazy-loaded; chart data prefetched on hover
- Optimistic updates for low-risk mutations (tag toggle, mark read, pin)
- Background revalidation; SWR-style stale-while-revalidate for dashboards
- Idle pre-fetch of likely next routes (link hover + intent)
- Image optimization: AVIF/WebP, responsive srcset, blur-up placeholders
- Worker offload for CSV export, JSON serialization, and chart datasets >10k points

### Observability
- Web vitals captured via PostHog/Sentry; per-route dashboards
- Tracing (OpenTelemetry) on all server actions and API routes
- Slow page alarms (LCP regression alerts)

---

## Audit Trail Integration (Global)

- **Every** state-changing action across the admin portal must emit a structured audit event:
  - `actor.id` · `actor.type` (admin/system/api_key) · `actor.real_id` (when impersonating)
  - `action` (verb noun, e.g., `tenant.suspend`)
  - `resource.type` · `resource.id` · `tenant.id` (when scoped)
  - `before` JSON · `after` JSON · `diff`
  - `result` (success/fail) · `error`
  - `ip` · `user_agent` · `request_id` · `session_id`
  - `severity` · `tags` · `reason` (when required)
  - `signature` — HMAC of preceding event's hash + this event payload (tamper-evident chain)
- Events stream to Page 14 (Audit Log) and to subscribed webhooks; long-term archive to immutable storage (S3 Object Lock / Glacier Vault Lock)
- Read-only views explicitly mark "no audit on reads" except for sensitive resources (privacy requests, secrets reveal, impersonation start/end) where reads are also logged

---

## Two-Step / Tiered Confirmation Patterns

### Tier 1 — Mild
- Single confirmation modal: title, description, Cancel + Confirm; no typed input
- Examples: pause subscription, dismiss banner, archive ticket

### Tier 2 — Moderate
- Modal requires checkbox acknowledgment ("I understand this will…") before Confirm enabled
- Examples: void invoice, refund payment, deactivate user, disable integration

### Tier 3 — Destructive
- Typed confirmation: type the resource name or `DELETE`
- Reason field (required, audit-bound)
- Confirm button stays disabled until typed value matches and reason is non-empty
- Examples: delete tenant, force-disconnect all integrations of a marketplace app, drop dead-letter queue, terminate background jobs

### Tier 4 — Catastrophic
- Tier-3 plus **fresh MFA challenge** (TOTP/WebAuthn) immediately before action
- Cool-down delay (15s) with visible countdown to prevent panic-clicking
- Two-admin approval (Maker/Checker): one admin proposes, second admin approves within 24h
- Examples: drop database table, mass-delete tenants, force-rotate all secrets, restore-over-production

### Visuals
- Destructive Confirm button is rose-600
- Modals use rose tinting at the icon and an outlined danger banner inside
- Audit log entries for these actions are flagged "high-severity" and surface to Notification Center for Security team

---

## Saved Views & Personalization (Global)

- Every list page supports **Saved Views** (per-user and shared)
- A view captures: filters · sort · column visibility · column order · grouping · density · page size · custom name · icon · color
- Sharing: Private · Team (select team) · Org-wide (admin-only)
- Default view per page selectable in user preferences
- View switcher is a popover at the top-left of the table with search, "Manage views", reorder, pin

---

## Comments, @Mentions, and Notes (Global)

- A unified comments primitive used in: Tenant detail Notes, Ticket replies, Incident postmortems, Feature requests, Bug reports, Privacy requests, Document review
- Rich text editor: bold/italic/underline/strikethrough, link, inline code, code block, blockquote, ordered/unordered lists, headings (H3–H4), checkbox tasks, attachments, image paste/drag-drop, table, mention, emoji
- @mentions resolve users (filtered by tenant scope where applicable) and trigger notifications via Page 73 preferences
- Internal-only flag (visible only to admins) vs visible to tenant
- Edit history retained with diffs
- Reactions (👍 ✅ ❤️ 🚀 👀)
- Threaded replies (1 level deep)

---

## Data Export Standards

- All list pages expose: CSV, Excel (.xlsx), JSON, PDF (formatted) export
- Large exports run as background jobs; user receives email + in-app notification when ready; download is signed URL with 7-day expiry
- PII-aware exports: warn before exporting; require reason; audit captured; option to redact configurable PII columns
- Scheduled exports: daily/weekly/monthly to S3, SFTP, email; with delivery confirmation and failure retries

---

## Real-Time Behavior Standards

- Dashboards: WebSocket-driven counters and status pills auto-update without flicker
- Charts: cumulative metrics append latest point on a fixed interval; non-cumulative metrics replace last bucket
- List pages: insertion of new rows uses subtle slide-down with fade; removed rows fade-out
- Live indicators: small green pulsing dot near page title to indicate connection state; tooltip shows last sync timestamp
- Reconnection: exponential backoff with capped retry; banner informs user of reconnecting and queues read invalidations to flush on reconnect

---

## Security Defaults (Cross-Cutting)

- All admin actions over TLS 1.3 only; HSTS preload
- CSP strict (`script-src 'self'`); no inline scripts/styles except via nonces
- Subresource Integrity for any third-party assets
- Cookies: `Secure`, `HttpOnly`, `SameSite=Lax` (or `Strict` for high-risk routes)
- CSRF tokens on every mutating route; double-submit cookie + SameSite
- Rate limits per endpoint and per-actor with adaptive throttling on suspicious patterns
- All secrets via environment + KMS; never in client bundles; runtime check on boot
- All forms server-validated; client validation is convenience only
- Reason-required on every Tier 2+ destructive action; reason copy guidance shown
- Step-up auth on: secrets reveal, deletion of tenants, role grants for Super Admin, payouts, restore-over-production, legal document publish, impersonation start
- Session binding: device fingerprint + IP coarse match; significant changes force re-auth

---

## Theming & Density

- **Themes:** Light · Dark · System (default System)
- **High-contrast** mode (separate token set) for AA+ users
- **Density:** Comfortable (default) · Compact (rows reduce 8px height)
- All theme tokens swap via CSS variables on the `:root` element; persistence via cookie + localStorage; SSR reads cookie to avoid flash

---

## Internationalization (Beyond Page 67)

- All strings extracted via `next-intl` keys; no hard-coded copy
- Numbers via `Intl.NumberFormat`; currencies via `Intl.NumberFormat({style:'currency'})` keyed off tenant/user setting
- Dates via `Intl.DateTimeFormat`; relative times via `Intl.RelativeTimeFormat`
- Plurals via ICU MessageFormat
- RTL-aware layouts using logical properties; mirror chevrons; preserve numerals direction

---

## Search Architecture (Cross-Cutting)

- Algolia/Meilisearch primary; Postgres full-text fallback
- Per-resource indexes (tenants, users, invoices, tickets, jobs, audit, kb)
- Index updates via outbox pattern; eventually consistent
- Permission filters at query time (tenant scope, role)
- Synonyms list (e.g., shop ⇄ tenant; print ⇄ job)
- Personal recency boost; click-through ranking

---

## Onboarding the Admin Themselves (First Run)

- On first login of a new platform admin: a 5-step product tour
  1. Welcome · role summary · what they can do
  2. Sidebar tour with tooltips on each section
  3. Command Palette demo (`Cmd+K`)
  4. Notification preferences quick-set (Page 73 inline)
  5. Pin favorite pages
- Skip / dismiss persists; can re-launch from Help menu

---

## API & Webhook Conventions

- All public endpoints are versioned: `/v1/...`, with deprecation headers (`Sunset`, `Deprecation`) and timeline
- Idempotency keys supported on all mutating endpoints (`Idempotency-Key` header)
- Pagination: cursor-based by default with `has_more`, `next_cursor`
- Filtering: stable, documented operators (`eq`, `neq`, `gt`, `gte`, `lt`, `lte`, `in`, `nin`, `contains`, `prefix`)
- Time fields ISO-8601 UTC; timezone metadata included where applicable
- Errors: RFC 7807 Problem Details JSON with `type`, `title`, `status`, `detail`, `instance`, `errors[]` (per-field), and `request_id`

---

## Glossary (Used Throughout the Portal)

- **Tenant** — a sign/print shop business that subscribes to Flowtora
- **End-customer** — a customer of a tenant (the people the shop sells to)
- **Job** — a unit of production work in a tenant's shop (quote → work order → produced)
- **Plan** — a Flowtora subscription tier
- **Seat / User** — an individual login within a tenant
- **Equipment** — a printer/cutter/press/embroidery machine etc. configured by a tenant
- **Material** — vinyl, substrate, ink, thread, blank, etc.
- **Pricing formula** — a configurable expression that computes a quoted price
- **Storefront** — a tenant's customer-facing online order page
- **Proof** — a design proof sent to the end-customer for approval
- **Health score** — composite numeric indicator (0–100) of tenant retention likelihood
- **MRR / ARR / NRR / GRR / LTV / CAC / Quick Ratio / Magic Number** — standard SaaS revenue metrics

---

## Document Status

- **Version:** 1.0.0 — Source of truth for Flowtora Admin Portal build
- **Owner:** Flowtora Platform Engineering · Design · Product
- **Last updated:** Generated as the foundational architecture document
- **Next review:** After each major release; design tokens reviewed quarterly

