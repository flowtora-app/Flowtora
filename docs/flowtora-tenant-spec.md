# Flowtora — Complete Architectural & Design Specification
## Public Site, Authentication, Trial & Purchase, and Shop Owner Workspace

**Product:** Flowtora — Multi-tenant SaaS platform for the sign and print shop industry
**Surfaces covered by this document:**
1. **Marketing site** (www.flowtora.com) — landing, product, pricing, customers, resources, company, legal
2. **Authentication** — sign up, sign in, MFA, password recovery, magic links, SSO, invite acceptance
3. **Trial & purchase flows** — free trial, paid checkout, plan switch, add-ons, downgrade, cancel
4. **Workspace** (app.flowtora.com) — the shop owner / staff portal; the full operating system of a sign & print shop
5. **Customer storefront** (shop.flowtora.com/{slug} or custom domain) — the tenant's customer-facing ordering experience
6. **Tenant-installable mobile app shell** — companion mobile experience for owners and production staff

**Companion document:** *Flowtora Admin Portal — Complete Architectural & Design Specification* (v1.0.0). All design tokens, brand foundations, and component primitives defined in that document are inherited here. This document calls out only deltas, additions, and tenant-specific applications.

**Document type:** Source-of-truth build specification

**Tech stack (mirrors admin):** Next.js 15 (App Router), React 19, TypeScript, Tailwind CSS v4, shadcn/ui, Recharts/Tremor, Lucide, TanStack Table, React Hook Form + Zod, PostgreSQL (RLS per tenant), Redis, Clerk/Auth.js, Stripe, Resend, S3/R2, Algolia/Meilisearch, Pusher, Sentry, PostHog, Mux (video), Cloudflare (CDN + Turnstile), Twilio (SMS), Mapbox (storefront maps), Plaid (optional ACH), QuickBooks/Xero SDK (accounting sync), ShipStation/EasyPost (shipping), HelloSign/DocuSeal (e-sign on quotes), Loom (embedded support recordings)

---

# H1 — DESIGN SYSTEM DELTA (Page T-0)

The full design system (colors, typography, spacing, shadows, z-index, component library) defined in the Admin Spec **applies in full** to this document. The deltas below are tenant-specific extensions.

## T-0.1 Brand voice (tenant-facing)

The voice **softens** from the admin portal. Tenant-facing surfaces still avoid marketing fluff, but warmth, encouragement, and partnership tone increase.

- **Voice attributes:** Confident, practical, encouraging, expert, warm. Speaks like a senior shop manager who's seen it all — never condescending, never "rah-rah."
- **Microcopy principles:**
  - Verb-led button labels remain ("Send quote" not "Quote sent")
  - Empty states allowed to be slightly playful ("Nothing here yet — let's fix that")
  - Celebratory micro-moments at: first quote sent, first invoice paid, first job marked produced, first 5-star review, $1k/$10k/$100k revenue milestones, 1-year anniversary
  - Errors are honest and actionable: "Card declined — your bank rejected the charge. Try another card, or contact your bank." (never "Oops!")
  - Loading states use specific verbs ("Calculating price…", "Generating proof…", "Reserving inventory…") not generic spinners where avoidable
- **Avoid:** Industry condescension ("Don't worry, we'll explain"), startup-speak ("Boom!", "Magic ✨"), excessive exclamations, emoji outside Announcements module and reactions
- **Customer-facing storefront voice** (the shop's customer sees this, branded as the shop): neutral, professional, friendly — defaults provided by Flowtora but fully overridable by the tenant in Page T-92 (Storefront Customizer)

## T-0.2 Naming conventions delta

| Term | Used in tenant UI | Notes |
|------|------------------|-------|
| Workspace | The tenant's Flowtora account | Same entity admin calls "tenant" |
| Customer | The shop's end-customer | Never "user", never "client" in UI; "client" is acceptable in CRM-style copy where it fits |
| Job | A unit of production work | quote → work order → produced → delivered |
| Quote | Pre-acceptance pricing document | Becomes a Job when accepted |
| Work order | Internal production document derived from accepted Quote | |
| Proof | Design proof sent for customer approval | |
| Estimate | Synonym for Quote, configurable per workspace (industry preference) | |
| Invoice | Finalized billing document for the customer | |
| Storefront | The customer-facing online order page | |
| Equipment | Physical machine (printer/cutter/press/embroidery/CNC) | |
| Material | Vinyl, substrate, ink, thread, blank, finished good | |
| Operator | Staff user with production-floor role | |
| Designer | Staff user with design role | |
| Sales | Staff user with quote/CRM role | |
| Owner | Workspace administrator (default top role) | |
| Pricing formula | Configurable expression that computes a quoted price | |
| Catalog item | A sellable product/service template | |
| Touch | A unit of work effort recorded against a job | |

## T-0.3 Color extensions

The tenant workspace inherits the **brand-primary indigo-violet** scale. Two additions:

### Production status palette (cross-cutting in the workspace)

Used on job status pills, Kanban columns, calendar chips, and notification icons. Maps semantically; uses tokens (`--status-{slug}-{shade}`) not raw HEX in components.

| Status | Slug | Bg-50 | Text-700 | Border-200 | Used on |
|--------|------|-------|----------|------------|---------|
| Draft | `draft` | #F1F5F9 | #334155 | #E2E8F0 | Quotes/Jobs not yet sent |
| Sent (awaiting customer) | `sent` | #E0F2FE | #0369A1 | #BAE6FD | Quotes/Proofs waiting on customer |
| Accepted | `accepted` | #ECFDF5 | #047857 | #A7F3D0 | Quote accepted, not yet started |
| In production | `production` | #EDE9FE | #6D28D9 | #DDD6FE | Brand-tinted to signal "active work" |
| On hold | `hold` | #FEF3C7 | #B45309 | #FDE68A | Material pending, customer info needed |
| Ready for pickup / ship | `ready` | #FFFBEB | #92400E | #FDE68A | Completed but not delivered |
| Delivered | `delivered` | #D1FAE5 | #065F46 | #6EE7B7 | Fulfilled |
| Invoiced | `invoiced` | #ECFEFF | #155E75 | #A5F3FC | Billed |
| Paid | `paid` | #DCFCE7 | #15803D | #86EFAC | Fully collected |
| Overdue | `overdue` | #FEE2E2 | #B91C1C | #FECACA | Past due > terms |
| Cancelled | `cancelled` | #F1F5F9 | #475569 | #CBD5E1 | Withdrawn |
| Refunded | `refunded` | #FFE4E6 | #BE123C | #FECDD3 | Returned |

### Tenant brand override (white-label)

Workspaces with the Pro plan or above can override **two** brand colors that propagate to:
- Storefront
- Customer emails (quote/invoice/proof)
- PDFs (quote/invoice/work order)
- Customer-facing kiosk/QR pages

| Token | Default (Flowtora) | Override surface |
|-------|---------------------|------------------|
| `--tenant-brand` | brand-600 #7C3AED | Storefront primary CTA, email headers, PDF accent |
| `--tenant-accent` | cyan-500 #06B6D4 | Storefront secondary, table headers, badge highlights |

Constraints: contrast must pass WCAG AA at 4.5:1 against white. The customizer (Page T-92) enforces this with live preview and an auto-suggest "nearest accessible color."

## T-0.4 Component additions

These extend the admin library; full prop tables follow the admin's patterns.

### T-C-1. Quote/Invoice Document Header
- **Anatomy:** Tenant logo (top-left) + Doc type tag ("QUOTE" / "INVOICE" / "WORK ORDER" — h6 overline) + doc number + issued date + valid-until or due date + status pill (top-right) + customer block (right column under status) + total amount (display-l, right-aligned)
- **Print-safe variant:** removes interactive controls, optimizes contrast, uses tenant brand tokens
- **PDF variant:** generated server-side via Puppeteer/Chromium pool, fonts embedded, paper size A4 or US Letter (workspace setting)

### T-C-2. Pricing Formula Token
- **Anatomy:** Pill with monospace label (e.g., `width × height × $material_rate + setup_fee`), copy-to-input button, "Test" button (opens calculator)
- **States:** valid (border-success), invalid (border-error + ! icon), unsaved (border-warning)

### T-C-3. Product Configurator (storefront primitive, also used in quote builder)
- **Anatomy:** Stepper at top (Size → Material → Finishing → Quantity → Upload) → live preview card (right column, 320px wide) → step body (left column) → sticky footer with running price + Continue button
- **Mobile:** vertical stepper collapses to accordion; preview moves above fold

### T-C-4. Production Calendar Chip
- **Anatomy:** colored vertical bar (status color) + job # + customer name (truncated) + size chip + due time
- **Sizes:** sm (single line, 28px), md (two-line, 48px), lg (three-line with thumbnail, 72px)
- **States:** hover lift, dragging (rotated 2°, shadow-xl), conflict (red dashed border when overlapping equipment booking)

### T-C-5. Inventory Level Bar
- **Anatomy:** Material name + thumbnail + horizontal bar (current/reorder/max segments, colored emerald/amber/rose) + numeric "32 yd / 100 yd" + reorder button
- **States:** above reorder (emerald), at reorder (amber pulsing), below reorder (rose with action banner)

### T-C-6. Customer Avatar Stack
- **Anatomy:** circular avatars (initials or photo) overlapping by 8px, max 3 visible + "+N more" pill
- **Use:** showing all customer contacts on a quote/job

### T-C-7. Proof Approval Strip
- **Anatomy:** Thumbnail row (proof versions horizontal scroll) + active version center stage (large preview) + sidebar (customer info + status timeline + comments + approve/request changes buttons)
- **Customer-facing variant:** removes admin chrome, full-screen viewer, signature pad, approve/reject CTA

### T-C-8. Receipt / Payment Confirmation
- **Anatomy:** Checkmark animation (320ms ease-out scale 0→1) + amount paid (display-l) + method + date + invoice link + email-receipt CTA + download PDF CTA
- **Storefront variant:** branded with tenant colors

### T-C-9. Trust Bar (marketing)
- **Anatomy:** "Trusted by 4,200+ shops" + 6 grayscale customer logos (saturate to color on hover) + 3 review stars with avg rating + "Read 380 reviews →"
- **Use:** marketing landing, pricing page, checkout reassurance

### T-C-10. Pricing Tier Card (marketing + in-app upgrade)
- **Anatomy:** Plan name (h3) + tagline + price (display-l with /mo suffix) + "billed annually" toggle hint + feature list (8-12 checks with tooltips) + CTA button + "Most popular" / "Best value" ribbon optional
- **Variants:** marketing (4 stops side-by-side), comparison (table cell), in-app upgrade modal (single card)

### T-C-11. Trial Countdown Banner
- **Anatomy:** Top-of-app sticky banner (44px) — sun/moon icon + "12 days left in your free trial of Pro" + progress bar + "Add payment method" CTA + dismiss (X)
- **States:** >7 days (info-blue), 3-7 days (warning-amber), 0-2 days (rose), expired (rose persistent, blocks key actions)

### T-C-12. Quick-add Floating Action Button
- **Anatomy:** Brand-600 circle 56px with `+` icon, fixed bottom-right with 24px margin on mobile; on desktop replaced by `Cmd+N` and global Create menu
- **Tap:** opens speed-dial of "New quote / New customer / New job / Log payment / Take photo"

### T-C-13. Marketing Hero Animation
- **Anatomy:** WebGL/Lottie animation of an abstract flow of a sign job moving through quote → production → delivery; respects prefers-reduced-motion (falls back to static SVG)

### T-C-14. Live Customer Chat Pill
- **Anatomy:** Floating bottom-right (above FAB on workspace; standalone on marketing/storefront), shows tenant logo on storefront variant
- **States:** offline (icon only), online (green dot), unread (red badge with count)
- **Anchor:** opens Intercom-like panel; on storefront, scoped to that tenant's support

## T-0.5 Layout patterns (tenant-specific)

### App shell (workspace)
- **Topbar:** 56px height; left: workspace switcher (logo + name + ⌄) + global search (480px); center: production status indicator (live count of in-production jobs); right: New menu + notifications bell + help (?) + theme + profile
- **Sidebar:** 240px expanded / 64px collapsed (state persists per user); same anatomy as admin sidebar but with tenant-relevant sections
- **Content area:** max-width 1440px centered on desktop, full-bleed for calendar/kanban/dashboard
- **Right rail (contextual):** 320px collapsible — used on quote/job/customer detail for activity, comments, related items

### Marketing site shell
- **Topbar:** 72px on desktop, 56px on mobile; transparent over hero, solid on scroll (opacity transition 200ms); left: Flowtora wordmark; center: Product / Pricing / Customers / Resources / Company (mega-menus); right: Sign in + "Start free trial" (primary)
- **Footer:** 8-column grid; columns: Product (links) · Solutions (industry pages) · Resources (blog/help/docs/changelog/community) · Company (about/careers/press/contact) · Legal · Plus full address, status badge, language switcher, social icons, newsletter capture

### Storefront shell (customer-facing)
- **Topbar:** 64px; tenant logo left + storefront nav (Order, About, Contact, My Account, Cart) + Cart badge right
- **Footer:** tenant address, hours, contact, social, "Powered by Flowtora" small (toggleable on Pro+; required on Starter)

## T-0.6 Theming & density

- Marketing site: light theme only (one approved dark variant for blog code samples)
- Workspace: Light · Dark · System (matches admin)
- Storefront: tenant-controlled; light is default; tenant may force dark per Page T-92
- Density: Comfortable (default) · Compact · Cozy — workspace setting, per user

## T-0.7 Motion guidelines

- Page transitions: instant route change with skeleton; never a full-page spinner
- Modal open: 180ms ease-out scale 0.96→1 + fade
- Drawer open: 220ms ease-out translateX
- Toast: 280ms slide-down-fade
- Status pill change: 240ms color crossfade + 1px scale pulse
- Job moves on Kanban: 320ms spring-cubic
- Confetti (only on first paid invoice, $10k milestone, 1-year anniversary): canvas-confetti 2s burst, respects prefers-reduced-motion

## T-0.8 Accessibility commitments (tenant surfaces)

- WCAG 2.2 AA across all logged-in and marketing pages
- Keyboard navigation parity (every interactive element reachable without mouse)
- Screen reader: all data tables have proper `<th scope>`, status pills use aria-label, charts include data-table alternative behind "View as table" link
- Focus visible at all times — never hidden by branding
- Contrast: 4.5:1 minimum text, 3:1 minimum large text and UI components
- Reduced motion: respected globally
- Captions on all marketing/help videos
- Time-out warnings before session expiry with "stay signed in" extender

---

# H1 — MARKETING SITE (www.flowtora.com)

Public-facing site. Goal: convert print/sign shop owners (typically 1–50 employees) into trial signups. Voice = practical, expert, encouraging. Heavy use of real workflow screenshots — never abstract metaphors.

## Page M-1. Home / Landing

- **Route:** `/`
- **Purpose:** Convert cold and warm traffic to trial signup. Communicate what Flowtora is, who it's for, and why it's different in <8 seconds.
- **Audience:** Sign shop owners (vinyl, vehicle wraps, banners, channel letters), screen printers, embroidery shops, large-format print shops, promo product distributors. Sub-audiences: solo owners, 2-10 person shops, multi-location shops.
- **Layout grid (sections, top to bottom):**

### Section 1 — Hero (above fold)
- **Height:** 720px desktop, 600px mobile
- **Background:** subtle radial gradient (brand-50 center → white edges) + animated mesh pattern of dotted vinyl-roll graphics at 8% opacity
- **Left column (60%):**
  - Eyebrow tag: "FOR SIGN & PRINT SHOPS" (overline 11px, brand-700, letter-spacing wide)
  - H1: "Run your sign and print shop on autopilot." (display-xl, 60px, 700, leading-tight)
  - Subhead: "Flowtora is the all-in-one operating system for your shop — quotes, production, payments, and customers — without the spreadsheet chaos." (body-l, 18px, neutral-600, max-width 540px)
  - CTA cluster (gap-3):
    - Primary: "Start 14-day free trial" (button-xl, brand-600) + small text below "No credit card required"
    - Secondary: "Watch 2-min demo" (button-xl outline, plays inline video modal)
  - Trust strip: "4,200+ shops · 4.8/5 on Capterra · SOC 2 Type II" (caption, neutral-500)
- **Right column (40%):**
  - **Hero composition:** layered product screenshot — main shot is the production calendar at an angle (-2° rotation, shadow-xl) with two floating cards in front: a "Quote accepted" toast and a payment confirmation card. Subtle continuous parallax on scroll (max 24px movement).
  - On mobile: replaces with single straight screenshot

### Section 2 — Logo trust bar
- 40px tall strip, neutral-50 bg
- Centered: "Trusted by independent shops to franchise networks" (caption neutral-600) above 8 customer logos (grayscale, 40px h, opacity 0.7)
- Logos cycle on a 6s loop with 1s fade (max 24 brands in pool); pause on hover; show full color on hover

### Section 3 — The 4 pillars (problem reframing)
- **Layout:** 2×2 grid on desktop, stacked on mobile
- **Section heading:** "Everything your shop needs in one place" (h2, centered)
- **Section subhead:** "Stop juggling QuickBooks, spreadsheets, group chats, and sticky notes. Flowtora connects every step from first quote to final payment." (body-m, neutral-600, centered, max-width 640px)
- **Each pillar card (radius-2xl, surface-1, border-default, padding-8):**
  1. **Win more jobs** — icon (chat bubble with checkmark), title (h3), body (3 lines): "Send pro quotes from any device. Customers approve and pay in two clicks." + screenshot thumbnail (quote PDF)
  2. **Run production smoothly** — icon (gear stack), body: "See every job's status, who's working on what, and what's due — all on one screen." + screenshot thumbnail (production kanban)
  3. **Collect payments faster** — icon (card with arrow), body: "Auto-invoice, accept cards and ACH, and chase late payments without lifting a finger." + screenshot thumbnail (invoice)
  4. **Delight every customer** — icon (heart with chart), body: "Branded storefront, automated proofs, review requests, repeat-order links — they'll never leave you." + screenshot thumbnail (storefront)
- Each card hoverable — lifts -4px with shadow-md transition, screenshot zooms to 1.04, "Learn more →" link reveals

### Section 4 — Inline product walkthrough
- **Heading:** "From quote to cash, in one workflow." (h2, centered)
- **Interactive stepper:** horizontal 5-step progress bar — Quote → Approve → Produce → Deliver → Get paid. Each step click-to-reveal a feature panel with annotated screenshot + 2-3 bullets.
  - Step 1 (Quote): screenshot of quote builder with materials/pricing formula highlights
  - Step 2 (Approve): screenshot of customer-facing approval with proof
  - Step 3 (Produce): screenshot of production calendar + operator mobile view
  - Step 4 (Deliver): screenshot of pickup/shipping screen + customer notification
  - Step 5 (Get paid): screenshot of invoice + payment received
- **Auto-advance:** 8s per step unless user interacts; pause on hover
- **Mobile:** swipeable carousel with bullets below

### Section 5 — Built for your shop (industry segmentation)
- **Heading:** "Built for the work you actually do" (h2, centered)
- **Subhead:** "Pick your shop type and we'll show you the workflow already configured for you."
- **Card grid (3×2 on desktop, 2×3 on tablet, 1-col on mobile):**
  - Vinyl & vehicle wraps
  - Wide-format & banners
  - Channel letters & dimensional signage
  - Screen printing & DTG apparel
  - Embroidery
  - Promotional products & swag
- **Each card:** illustration (custom flat-line, brand colors), name (h4), one-line description, "See workflow →" link to `/solutions/{slug}`
- **Hover:** illustration animates (subtle), card lifts

### Section 6 — Real numbers / outcomes
- **Heading:** "Shops on Flowtora work less and earn more" (h2)
- **Layout:** 4-column stat strip on dark brand-900 panel, full-bleed
- **Stats (display-l, white):**
  - **3.2×** faster quote turnaround (caption: "vs. spreadsheet workflows")
  - **42%** fewer overdue invoices (caption: "auto-dunning + ACH option")
  - **27hrs** saved per month (caption: "average across 4-person shops")
  - **$4,800** avg additional MRR per shop (caption: "from reactivated customers")
- Footer line: "Based on aggregate data from 1,200+ Flowtora customers, 2025."

### Section 7 — Customer story spotlight
- **Layout:** asymmetric split — left 50% = portrait photo of shop owner (real, not stock), right 50% = quote
- **Quote (h3, max 280 chars):** "We replaced 4 tools with Flowtora. Quotes that took us a day now go out in 20 minutes — and we got paid 2 weeks sooner on every job in Q3." (italic, leading-relaxed)
- **Attribution:** Name + Title + Shop name + city
- **CTA:** "Read [Shop Name]'s story →" links to `/customers/{slug}`
- **Variant rotation:** 3 stories cycle on every page load (server-side random)

### Section 8 — Integrations strip
- **Heading:** "Plays nice with what you already use" (h3)
- **Logo grid:** 6×2 grid of integrations — QuickBooks, Xero, Stripe, Shopify, ShipStation, Mailchimp, Google Calendar, Outlook, Zapier, Dropbox, Adobe CC, Square — grayscale, on hover show color + tooltip with one-line integration value
- **Link:** "See all 40+ integrations →" → `/integrations`

### Section 9 — Pricing teaser
- **Heading:** "Plans that scale with you" (h2)
- **Layout:** 3 compressed plan cards (Starter, Growth, Pro) — see Page M-4 for full plans
- **Each card:** name, starting price ("from $49/mo"), 3 hero features, "View full pricing →"
- **Bottom CTA:** "Start with a free trial — pick a plan later" (button-lg brand-600)

### Section 10 — FAQ
- **Heading:** "Questions we hear a lot" (h2)
- **Accordion (boxed variant, single-open):**
  1. Do I need to install anything?
  2. Will it work for my industry?
  3. Can I import my customers from QuickBooks?
  4. What if I cancel?
  5. Is my data safe?
  6. Do you offer phone support?
  7. Can my team use it on a phone or tablet?
  8. How long does setup take?
- **Below FAQ:** "More questions? Read the full FAQ →" + "Or chat with us →" (opens chat widget)

### Section 11 — Final CTA
- **Bg:** brand-900 with subtle pattern overlay
- **Heading (display-l, white, centered):** "Your shop, on autopilot."
- **Sub (body-l, neutral-300, centered):** "Free for 14 days. No credit card. Cancel anytime."
- **CTA cluster:** Primary "Start free trial" (white bg, brand-700 text, button-xl) + Secondary "Talk to sales" (outline white, button-xl)
- **Footer note:** "Already a customer? Sign in" link

### Section 12 — Footer (global, see footer spec)

### SEO / metadata
- **Title:** "Flowtora — The operating system for sign & print shops"
- **Description (160 chars):** "Run quotes, production, invoicing, and customers from one app. Built for sign makers, screen printers, wide-format, and embroidery shops. Free 14-day trial."
- **OG image:** 1200×630 with hero composition + tagline
- **Structured data:** Organization + SoftwareApplication + AggregateRating (Capterra) schemas
- **Canonical:** `https://www.flowtora.com/`
- **hreflang:** en-US (default), es-US, es-MX, en-CA, fr-CA (when localized)

### Performance budget
- LCP < 2.0s · CLS < 0.05 · INP < 200ms
- Hero image: AVIF + WebP fallback, blurred placeholder, responsive srcset
- Total JS bundle: <120KB gzipped above-the-fold; rest split-loaded
- Lighthouse target: ≥95 on all categories

---

## Page M-2. Product overview (`/product`)

- **Route:** `/product`
- **Purpose:** Deep tour of the entire product, organized by job-to-be-done. Visitors who land here have decided Flowtora is plausibly relevant and want to see what's inside.
- **Layout:**

### Section 1 — Header / nav (same global topbar)

### Section 2 — Sub-hero
- **Heading:** "Every part of your shop, connected." (h1)
- **Subhead:** "Tour the modules that replace your stack of tools."
- **Nav anchor pills (sticky on scroll):** Quotes · CRM · Production · Inventory · Payments · Storefront · Reporting · Integrations — clicking scrolls smoothly to that section

### Section 3-10 — Module sections (one each)

**Each module section follows this template:**
- 2-column split (image left or right alternating)
- Eyebrow tag (overline) with module name
- H2 module title
- 2-paragraph body
- Feature list (4-6 items with checkmark icons)
- Primary CTA "Start free trial" + secondary "See pricing"
- Image: annotated product screenshot with callout pins (numbered 1-4) that on hover reveal labels

**Modules:**
1. **Quotes & estimates** — pricing formulas, materials, finishing, templates, send via email/SMS, e-sign, payment-on-acceptance
2. **CRM & customers** — profiles, communication history, tags, segments, repeat-order links, lifetime value
3. **Production & scheduling** — calendar, kanban, equipment booking, operator assignments, real-time status
4. **Inventory & materials** — stock levels, reorder points, supplier orders, lot tracking, waste tracking
5. **Payments & invoicing** — ACH/card/check, auto-charge on completion, dunning, statements, deposits
6. **Storefront** — branded customer page, product configurator, online orders, repeat-order links
7. **Reporting & analytics** — revenue, jobs, customers, materials, operator productivity, profitability per job
8. **Integrations & API** — list of top integrations, API docs link, Zapier templates, webhooks

### Section 11 — "It all works together" diagram
- **Heading:** "One system. Zero double entry."
- **Visualization:** animated flow diagram showing data moving between modules (SVG with subtle animated dashes)

### Section 12 — Final CTA + Footer

---

## Page M-3. Solutions pages (`/solutions/{industry}`)

Six industry-specific landing pages. Each follows the same structure with industry-specific content.

### Industries (slugs):
- `/solutions/vinyl-signs` — Vinyl & vehicle wraps
- `/solutions/wide-format` — Wide-format & banners
- `/solutions/channel-letters` — Dimensional & illuminated signage
- `/solutions/screen-printing` — Screen printing & DTG apparel
- `/solutions/embroidery` — Embroidery
- `/solutions/promo-products` — Promotional products & swag

### Per-page structure:

### Section 1 — Industry hero
- Eyebrow: industry name
- H1: "Flowtora for [industry]" + tagline (e.g., "Built for the realities of vinyl work — substrates, install jobs, and recurring fleet accounts.")
- CTA + screenshot showcasing industry-relevant view (e.g., vinyl shop quote with material calculator)

### Section 2 — Industry-specific pain points
- 3-card row: "You're tired of..." pain statements with checkmarks (e.g., "Re-pricing the same wrap 5 times this week", "Customers asking for proofs you sent in a thread last month")

### Section 3 — How Flowtora fits this industry
- Feature highlights specific to industry (e.g., for vinyl: square-footage calculator, lamination options, install scheduling, fleet account management)

### Section 4 — Industry template preview
- Showcase pre-configured catalog items / pricing formulas / quote templates available out of the box

### Section 5 — Customer story from that industry

### Section 6 — Industry FAQ (5 questions specific to that industry)

### Section 7 — Final CTA + Footer

---

## Page M-4. Pricing (`/pricing`)

- **Route:** `/pricing`
- **Purpose:** Convert. Make plan choice frictionless and reassuring.
- **Above fold focus:** plan comparison must be visible without scrolling on a 1080p screen.

### Section 1 — Header / nav

### Section 2 — Sub-hero
- **Heading:** "Simple pricing that grows with you." (h1 centered)
- **Subhead:** "Pick a plan. Try free for 14 days. Change or cancel anytime — no contract."
- **Billing toggle:** segmented control (Monthly / Annually — Save 20%) centered, 320px wide, 44px tall
- **Currency toggle:** small dropdown right of billing toggle (USD default; CAD, GBP, EUR, AUD, MXN available; tied to IP geolocation default)

### Section 3 — Plan comparison cards
- **Layout:** 4-card row on desktop (1280+), 2×2 on tablet, single-column stack on mobile
- **Cards:** Starter · Growth · Pro · Enterprise (Enterprise card has "Custom" instead of price)

**Per card anatomy:**
- Card width: 280px, height: 720px (matches across all four)
- Background: surface-1, border-default; "Most popular" plan (Growth) has brand-600 ring + 2px border + ribbon top-right
- Top: plan name (h3) + tagline (caption neutral-600, one line, 28 char max)
- Price block: large number (display-l, e.g., "$49") + "/month" (body-m neutral-500); below: "billed annually · $588/yr" or "billed monthly" (caption)
- Annual savings inline: "$120/yr saved" (text-success, caption)
- Primary CTA: "Start free trial" (button-lg primary on Growth, secondary on others); Enterprise → "Talk to sales"
- Divider
- "Best for:" line in italic
- Feature list (8-12 items with check icons; some items have tooltip ⓘ for explanation):
  - Users / seats included
  - Quotes per month (or "Unlimited")
  - Active customers (or "Unlimited")
  - Storefront (limited customization / full white-label)
  - Storage (GB)
  - Branded emails / domain
  - Integrations tier
  - Support level (email / priority / phone / dedicated CSM)
  - API access (no / read-only / full)
  - Multi-location (no / yes)
  - SSO (no / yes)
  - SLA (no / 99.9% / 99.99%)

**Plan details:**

| Feature | Starter ($49/mo) | Growth ($129/mo) | Pro ($299/mo) | Enterprise (Custom) |
|---------|------|------|------|------|
| Seats | 2 | 5 | 15 | Unlimited |
| Quotes/mo | 100 | 1,000 | Unlimited | Unlimited |
| Active customers | 250 | 2,000 | Unlimited | Unlimited |
| Storefront | Flowtora branded | Light customization | Full white-label | Full white-label + custom domain |
| Storage | 10 GB | 100 GB | 1 TB | Unlimited |
| Integrations | Stripe, QuickBooks | + ShipStation, Mailchimp | + Shopify, Xero, Zapier, Custom webhooks | All + custom |
| Support | Email | Priority email + chat | Phone + chat | Dedicated CSM, SLA |
| API access | No | Read-only | Full | Full + sandbox |
| Multi-location | No | No | Up to 3 | Unlimited |
| SSO | No | No | Yes | Yes + SCIM |
| Audit log | 30 days | 90 days | 1 year | 7 years |
| White-label PDFs | No | Logo only | Full theme | Full + custom templates |
| Reporting | Standard | Standard + cohorts | Advanced + custom | Advanced + warehouse export |
| Add-ons available | All | All | All | All |

### Section 4 — Add-ons strip
- **Heading:** "Add-ons (any plan)" (h3)
- **Card row:** Extra seat (+$15/mo), Extra location ($49/mo), Extra storage ($10/100GB), Premium support ($99/mo on plans < Pro), Branded SMS ($29/mo + usage), Premium integrations ($25/each/mo)
- **Each card:** icon + name + price + 1-line description + "Add to plan" CTA (in-app)

### Section 5 — Full feature comparison table
- **Heading:** "Compare every feature" (h2)
- **Sticky column:** feature name (left); columns: 4 plans (right)
- **Cell types:** check (emerald), X (neutral-300), text value, tooltip ⓘ
- **Categories (collapsible groups):** Core workflow · Customer & CRM · Production · Inventory · Storefront · Payments & invoicing · Reporting · Team & permissions · Branding · Security · Integrations · Support
- **Sticky header:** plan names re-stick on scroll; columns highlight on hover
- **Mobile:** transforms into accordion per category, plan tabs at top

### Section 6 — ROI calculator
- **Heading:** "See your shop's ROI" (h2)
- **Inputs (left, body-m):**
  - Avg quotes per month (slider 0-500)
  - Avg hours per quote (slider 0.25-4 hr)
  - Avg revenue per job ($)
  - Hourly cost of staff time
- **Output panel (right, branded card):**
  - "Estimated time saved: **X hrs/mo**"
  - "Estimated extra jobs won: **N/mo**"
  - "Estimated additional revenue: **$Y/mo**"
  - "Flowtora pays for itself in **D days**"
- Disclaimer: "Estimates based on aggregate customer data."
- CTA: "Start free trial" + "Share these results" (copy link)

### Section 7 — Pricing FAQ
- **Accordion (15 questions):**
  - Is there a contract?
  - What happens after 14 days?
  - Do I need a credit card to start?
  - Can I change plans later?
  - What if I exceed my plan limits?
  - Do you offer discounts for non-profits / multi-shop owners?
  - Do you offer annual contracts with savings?
  - Can I get a custom quote?
  - What integrations cost extra?
  - How are seats counted?
  - What happens if I cancel?
  - Do you offer migration help?
  - Is there a setup fee?
  - Do you charge for support?
  - How do I get a tax-exempt invoice?

### Section 8 — Reassurance trust bar
- Money-back guarantee · SOC 2 Type II · GDPR/CCPA compliant · Cancel anytime · 24/7 status page

### Section 9 — Final CTA + Footer

---

## Page M-5. Customers (`/customers`)

- **Route:** `/customers`
- **Purpose:** Social proof at scale. Showcase variety of real shops.
- **Layout:**

### Section 1 — Hero
- **Heading:** "Stories from shops like yours" (h1)
- **Subhead:** "Read how independent shops, franchise networks, and 100-year-old print houses run on Flowtora."

### Section 2 — Featured stories grid
- **Filter chips:** All · Vinyl · Wide-format · Channel letters · Screen printing · Embroidery · Promo · Franchise · Independent · Multi-location (multi-select)
- **Grid (3 columns desktop, 2 tablet, 1 mobile):**
- **Story card anatomy:** Cover image (16:9 shop photo, lazy-loaded, blur-up) + shop logo overlay top-left + headline metric badge top-right (e.g., "3.2× faster quoting") + content area: shop name (h4) + city + 1-line industry + 2-line quote excerpt + "Read story →"
- **Card hover:** image scales 1.04, headline metric badge bounces, "Read story" arrow nudges right

### Section 3 — Featured testimonial carousel
- Large carousel: 3 visible cards desktop, swipe-enabled, auto-advance 7s
- Quote (h3 italic) + portrait photo + attribution

### Section 4 — Trust strip with G2/Capterra badges + review screenshots

### Section 5 — Final CTA + Footer

---

## Page M-5a. Individual customer story (`/customers/{slug}`)

- **Route:** `/customers/[slug]`
- **Layout:**

### Section 1 — Story hero
- **Left column:** eyebrow ("CUSTOMER STORY") + H1 (the headline, e.g., "How Brightline Signs replaced 4 tools with one") + 3-line lede + "Read time: 5 min" + share buttons
- **Right column:** square hero photo of shop / owner

### Section 2 — Stat strip
- 3-stat card row: hero metrics from this customer (e.g., "23 hrs saved/week" · "Zero overdue invoices in 4 months" · "$18k extra MRR")

### Section 3 — Story body
- 2-column layout: left = main article (h2-h3 headers, body text, pull quotes, in-line images, captions), right sticky sidebar with "At a glance" panel (industry, location, size, plan, year founded, year on Flowtora, integrations used)

### Section 4 — Featured workflow callout
- Annotated screenshot showing the specific feature this customer relies on most

### Section 5 — Related stories (3-card row from same industry)

### Section 6 — CTA card: "Want results like [Customer name]'s?" + Start free trial

### Section 7 — Footer

---

## Page M-6. Resources hub (`/resources`)

- **Route:** `/resources`
- **Purpose:** Top-of-funnel content hub.

### Sub-pages:
- `/blog` — Editorial articles (industry trends, business advice, product news)
- `/help` — Help Center (links to in-app help system)
- `/guides` — Long-form playbooks (Pricing a vinyl job, Hiring your first installer, etc.)
- `/templates` — Free downloadable templates (quote PDFs, work orders, contracts)
- `/calculators` — Public calculators (square footage, pricing for common jobs, ROI)
- `/webinars` — Live and recorded webinars
- `/community` — Link to Flowtora Community forum (Discourse or Circle)
- `/changelog` — Public product changelog
- `/api-docs` — Developer docs

### Resources landing layout:
- Hero with universal search bar (resource-wide; powered by Algolia)
- Featured cards per resource type (4 cards)
- Latest blog posts (6-card grid)
- Popular guides (3-card row)
- Newsletter signup (footer-of-section card)
- Final CTA + Footer

---

## Page M-6a. Blog index (`/blog`)

### Layout:
- Hero: "The Flowtora Blog" + subhead + search bar
- Filter chips: All · Operations · Pricing · Marketing · Hiring · Industry trends · Product news
- Featured post: full-width card with cover image (16:9), category, title (h2), 3-line excerpt, author avatar + name + date + reading time, "Read article →"
- Grid (3-col): article cards — cover, category tag, title (h4), 2-line excerpt, author + date + read time
- Pagination: numbered (1 2 3 ... 12), per-page 12 articles
- Sidebar (sticky right on desktop, hidden mobile): newsletter signup, top categories, recent posts, featured guide

### Article card states:
- Hover: image scales 1.04, title underlines, card lifts -2px

---

## Page M-6b. Blog article (`/blog/{slug}`)

### Layout:
- **Hero:** category tag + title (h1) + lede + author block (avatar + name + role + date + read time + share buttons)
- **Body:** 2-column — left article (max-width 720px), right sticky table-of-contents (auto-built from H2/H3); body uses prose styles: h2, h3, body, blockquote (brand-left-bar), code, image (full-bleed within article), figure caption, callout (info/warning), embed (YouTube, Loom, tweet via oEmbed), table
- **In-article CTAs:** every 1000 words inject a card CTA ("Try Flowtora free for 14 days")
- **End of article:** author bio card + "Related articles" 3-card row + comment section optional (Disqus or custom)
- **Footer:** newsletter signup + Footer

---

## Page M-6c. Guides (`/guides` and `/guides/{slug}`)

- Index page similar to blog index but with longer cards (guide cards 320×440 with TOC preview)
- Guide page is long-form with hero, downloadable PDF version, in-line forms for "unlock the full guide" (gated content optional), interactive checklists, related guides

---

## Page M-6d. Templates (`/templates`)

- **Layout:**
- Hero with search + filter chips by template type (quote, invoice, work order, contract, email template, pricing list)
- Grid of template cards: preview thumbnail (PDF page) + title + format (PDF/DOCX/XLSX) + "Free download" button (triggers email gate first download per session, then ungated)
- Inline preview modal on click

---

## Page M-6e. Calculators (`/calculators` and `/calculators/{slug}`)

Public-facing calculators that drive trial signups.

### Available calculators:
- Sign square footage calculator
- Vinyl roll-yield calculator
- Banner pricing estimator
- T-shirt screen print pricing estimator
- Embroidery stitch count estimator
- ROI calculator (mirror of pricing page)

### Per-calculator page:
- **Hero:** title + brief description + use case
- **Calculator widget:** inputs left, output right, "Save my estimate" CTA (requires email → triggers trial signup flow)
- **Below calculator:** "How this is calculated" explainer + "Powered by the same formula engine in Flowtora" CTA

---

## Page M-6f. Webinars (`/webinars`)

- **Layout:** Upcoming webinars (calendar-style), past webinars (video library grid), featured webinar (hero player)
- **Webinar detail page:** title + date/time + presenter bios + registration form OR video player if past
- **Registration:** captures name, email, shop name, role; triggers email confirmation + calendar invite + reminder emails (24h, 1h, 5min before)

---

## Page M-6g. Changelog (`/changelog`)

- **Layout:** Reverse chronological timeline
- **Per entry:** date · version · category tags (New, Improved, Fixed, Changed) · title (h3) · body (markdown) · screenshots/loom embeds · "Learn more" link
- **RSS feed** at `/changelog/rss.xml`
- **Subscribe by email** capture

---

## Page M-6h. API docs (`/api-docs` or `developers.flowtora.com`)

- **Layout:** Stripe-style 3-column — left sidebar nav, center content with code examples, right column with live code panel (cURL/Node/Python/Ruby tabs)
- **Sections:** Getting started, Authentication, Customers, Quotes, Jobs, Invoices, Payments, Webhooks, Errors, Rate limits, Changelog
- **Interactive API playground:** authenticated users can hit sandbox endpoints from the docs
- **Search:** Algolia DocSearch
- **Mirrors:** content also available as OpenAPI 3.1 spec download

---

## Page M-7. About (`/about`)

- **Hero:** Company mission statement + founding story lede + team photo
- **Section: Our story** — narrative of how Flowtora was founded
- **Section: Values** — 4-5 values with icons and explanations
- **Section: Team** — leadership grid (photo + name + title + LinkedIn)
- **Section: Investors / advisors** (if applicable)
- **Section: Stats** — employees, customers, revenue (where shareable), countries served
- **Section: Press / "as seen in"** — media logos
- **Final CTA + Footer**

---

## Page M-8. Careers (`/careers`)

- **Hero:** "Build the future of small-shop software" + team photo
- **Section: Why work here** — benefits, culture, perks (remote/hybrid policy, time off, healthcare, equipment, parental leave)
- **Section: Open roles** — filterable list by department + location + remote/onsite; each role card → detail page with full JD, apply button (Greenhouse/Lever integration)
- **Section: Life at Flowtora** — photo gallery, employee quotes
- **Section: Hiring process** — 5-step timeline from application → offer
- **Footer**

### Per-role page:
- Job title (h1) + department + location + employment type
- Role description, what you'll do, what we're looking for, nice-to-haves, compensation range (per local law), benefits
- "Apply for this job" form OR redirect to ATS

---

## Page M-9. Press (`/press`)

- **Hero:** "Press & media"
- **Section: Press releases** — chronological list
- **Section: Media kit** — logo downloads (SVG, PNG light/dark), brand guidelines PDF, product screenshots ZIP, executive headshots, fact sheet
- **Section: In the news** — logos + clipped quotes + article links
- **Section: Press contact** — name, email, phone
- **Footer**

---

## Page M-10. Contact (`/contact`)

- **Layout:** 2-column
- **Left:** Form (name, email, shop name, phone, reason dropdown [Sales, Support, Partnerships, Press, Other], message); reCAPTCHA / Turnstile
- **Right:** Contact cards — Sales (phone + email + Calendly link to book a demo), Support (link to Help Center + chat), Press (email), Mailing address, social links, support hours
- **Below:** Map of HQ (Mapbox embed) optional
- **Footer**

---

## Page M-11. Integrations directory (`/integrations`)

- **Layout:**
- Hero: "Flowtora connects to the tools you already use" + search bar + filter chips by category
- **Categories:** Accounting · Payments · Shipping · Marketing · E-commerce · Productivity · Design · Communications · Data & Analytics · CRM · Other
- **Grid:** integration cards (logo + name + 1-line desc + category tag) — 4 columns desktop
- **Per-integration page (`/integrations/{slug}`):**
  - Hero: integration logo + name + "Built by Flowtora" or "Third-party" badge
  - "What this integration does" body
  - Setup steps (numbered)
  - Screenshots of integration in action
  - Pricing impact (free / add-on)
  - "Connect [integration]" CTA (deep-link into workspace `/integrations/{slug}/connect` if logged in, or to signup if not)
  - Related integrations

---

## Page M-12. Security (`/security`)

- **Hero:** "Your data is safe at Flowtora"
- **Section: Compliance badges** — SOC 2 Type II, GDPR, CCPA, HIPAA (if applicable), PCI DSS
- **Section: How we protect your data** — encryption (in transit/at rest), access controls, audit logging, backups, disaster recovery
- **Section: Your controls** — MFA, SSO, role-based access, IP allowlist, audit log, data export, account deletion
- **Section: Vulnerability disclosure** — bug bounty program + link to report a vulnerability
- **Section: Security FAQ**
- **Section: Trust report link** — link to live status + SOC 2 report download (gated)

---

## Page M-13. Trust / Status (`/trust` and `status.flowtora.com`)

- **Trust page:** quick overview + links to security, compliance, privacy, terms, DPA template, sub-processors list
- **Status page (subdomain):** live system status (Statuspage.io or similar)
  - Component status (API, app, storefront, payments, integrations) — operational / degraded / partial outage / major outage
  - Active incidents list
  - Past incidents (last 90 days) with postmortems
  - Uptime metrics (30d / 90d)
  - Subscribe by email / SMS / Slack / RSS

---

## Page M-14. Legal pages

### `/legal/terms` — Terms of service
- Standard MSA structure; versioned with version history accessible
- Last updated date prominent at top
- TOC sidebar
- "Download as PDF" link

### `/legal/privacy` — Privacy policy
- GDPR/CCPA compliant
- Categories of data collected, purposes, third parties, retention, user rights, contact DPO
- Cookie list table

### `/legal/dpa` — Data Processing Agreement (downloadable)

### `/legal/cookies` — Cookie policy
- Cookie list with category, purpose, retention
- Cookie consent preferences (re-open consent banner)

### `/legal/acceptable-use` — Acceptable Use Policy

### `/legal/sub-processors` — List of sub-processors with name, purpose, location, link

### `/legal/sla` — Service-Level Agreement (Pro+ plans)

### `/legal/security` — Security overview (technical detail)

### `/legal/cancellation` — Cancellation & refund policy

### Layout for legal pages:
- 2-column: TOC left (sticky), content right (max-width 720px)
- Header: title (h1) + last-updated badge + "Download PDF"
- Body in prose styles
- Footer with "Questions? Contact legal@flowtora.com"

---

## Page M-15. 404 (`/404`)

- **Centered layout:**
- Illustrated SVG (a cut vinyl roll unspooled or a misprinted poster — playful but on-brand)
- H1: "We can't find that page."
- Body: "It may have moved or you may have followed a bad link."
- CTAs: "Go to homepage" + "Search the site"
- Search bar
- "Popular pages" link chips

---

## Page M-16. 500 / Error pages

- Similar layout to 404
- Includes error ID (request ID) for support
- "Try again" CTA + "Contact support"

---

## Page M-17. Cookie consent banner

- Bottom-of-page banner (sticky), 88px tall
- Left: "We use cookies to improve your experience and analyze traffic. Read our [Cookie policy]." (body-s)
- Right: "Reject all" (tertiary), "Manage preferences" (secondary), "Accept all" (primary)
- Manage preferences opens modal: toggles per category (Necessary [always on], Functional, Analytics, Marketing) + Save + Cancel
- Stored in `cookieConsent` cookie; respected by analytics/marketing scripts before firing

---

## Page M-18. Global footer (all marketing pages)

- **Background:** neutral-900 (dark on light theme; switches in dark mode)
- **Layout:** 6 columns on desktop, 2-col stacked on mobile
- **Columns:**
  1. Product — Overview · Pricing · Customers · Integrations · Changelog · API · Mobile app
  2. Solutions — by industry (6 links)
  3. Resources — Blog · Help · Guides · Templates · Calculators · Webinars · Community
  4. Company — About · Careers · Press · Contact
  5. Legal — Terms · Privacy · DPA · Cookies · Sub-processors · Security · SLA
  6. Stay connected — newsletter form (email + Subscribe button) + social icons (X, LinkedIn, Facebook, Instagram, YouTube, GitHub for API)
- **Bottom strip:** Flowtora logo (white) + "© 2026 Flowtora, Inc." + language switcher + status badge ("All systems operational" green dot, links to status page)
- **Tertiary links:** Site map · Accessibility statement · Do not sell my info (California) · Modern slavery statement (UK)

---

## Marketing site — Cross-cutting requirements

### Analytics & tracking
- PostHog product analytics (autocapture + custom events for CTA clicks, form starts, video plays, scroll depth)
- Google Analytics 4 (optional, gated by cookie consent)
- Server-side conversion tracking for Google Ads, Facebook Ads (privacy-friendly via Conversions API)
- UTM parameter capture and persistence into trial signup attribution

### Live chat
- Default: Intercom or HelpScout widget bottom-right
- Bot first-line ("Hi! What brings you to Flowtora today?")
- Auto-route by URL context (pricing page → sales queue; help/docs → support)
- Disabled during off-hours with "Leave us a message" form

### Newsletter
- Captured via footer + several inline CTAs
- Synced to Customer.io or HubSpot
- Double opt-in
- 6-email welcome sequence (industry-specific based on signup context)

### A/B testing
- Use PostHog feature flags + experiments
- Variants on: hero headline/CTA, pricing page billing-toggle default, plan card "Most popular" position, sticky pricing CTA, calculator gating

### Internationalization
- Default: en-US
- Supported: en-CA, en-GB, en-AU, es-US, es-MX, es-ES, fr-CA, pt-BR (phase 2)
- Auto-detect via Accept-Language; user can switch in footer; persists in `locale` cookie
- All content authored in `next-intl` with namespace per page

### Performance budget (entire marketing site)
- LCP < 2.0s · CLS < 0.05 · INP < 200ms · TTFB < 600ms
- All images AVIF/WebP, responsive, blur-up
- Fonts: woff2, preload critical, font-display swap
- No third-party scripts blocking render
- Cloudflare edge caching with stale-while-revalidate

### SEO
- Each page has unique title, description, OG/Twitter card, canonical, JSON-LD
- Sitemap.xml auto-generated, segmented (pages, blog, customers, solutions, integrations)
- robots.txt — allow all except `/admin`, `/app`, `/api`, `/_next`
- Breadcrumbs with schema markup on inner pages
- Image alt text mandatory; enforced in CMS

### CMS / content workflow
- Marketing content (blog, customers, guides) authored in headless CMS (Sanity, Contentful, or Payload)
- Roles: Author · Editor · Publisher · Admin
- Preview links for drafts
- Scheduled publishing
- Versioning + rollback
- All copy reviewed for accessibility (alt text, heading order, contrast)

---

# H1 — AUTHENTICATION

All authentication routes live on `auth.flowtora.com` (separate subdomain for CSRF isolation and shared SSO with workspace). Routes accept `?return_to=` parameter to redirect back after auth.

## Page A-1. Sign up (`/signup`)

- **Route:** `auth.flowtora.com/signup`
- **Purpose:** Convert a marketing visitor into a trial account in under 90 seconds.
- **Conversion design principles:** Minimize fields. Defer non-essential info to onboarding. Show progress. Reassure on security and "no credit card."

### Layout
- **Page background:** brand-50 with subtle dotted grid pattern
- **Centered card:** surface-1, radius-2xl, shadow-lg, 480px wide on desktop, full-width on mobile with 16px gutters
- **Above card:** Flowtora wordmark (centered, 120px) linking to `/`
- **Below card:** "Already have an account? Sign in" link

### Card content — Step 1 of 2: Account
- **Header:**
  - H2: "Start your 14-day free trial"
  - Subtext (caption neutral-600): "No credit card required. Cancel anytime."
- **Form fields:**
  - Full name (text input, required, validates ≥ 2 chars, autofocus)
  - Work email (email input, required, real-time validation, block disposable domains via list, "We'll use this for sign in")
  - Password (password input, required, ≥ 12 chars, complexity meter inline: weak/fair/good/strong, show/hide toggle, validate against HIBP API at blur)
  - Phone (optional, with country picker, used for MFA later)
- **Below fields:**
  - SSO buttons (3 large buttons stacked or row):
    - "Continue with Google" (with Google logo)
    - "Continue with Microsoft" (with Microsoft logo)
    - "Continue with Apple" (with Apple logo)
  - Divider: "or"
  - Primary CTA: "Create account" (button-xl primary, full-width)
- **Below CTA:**
  - Caption: "By creating an account, you agree to our [Terms] and [Privacy policy]." (links inline)
  - "Need a Single Sign-On (SAML)?" link → opens contact form modal
- **Loading state:** CTA shows spinner + "Creating your account…"
- **Success:** transition to Step 2 with 200ms slide
- **Error states:**
  - Email already exists: inline error + "Sign in instead" link
  - Weak password: real-time meter; submit blocked until ≥ "good"
  - Server error: toast (error) + retry

### Card content — Step 2 of 2: Workspace
- **Header:**
  - H2: "Tell us about your shop"
  - Subtext: "We'll customize Flowtora for your business."
- **Form fields:**
  - Shop name (text input, required, "Used on your invoices, quotes, and storefront")
  - Shop type (dropdown, required, options: Vinyl & vehicle wraps · Wide-format & banners · Channel letters · Screen printing · Embroidery · Promo products · Mixed / Other)
  - Team size (segmented control: Just me · 2-5 · 6-15 · 16-50 · 50+)
  - Where did you hear about us? (dropdown, optional: Google · Word of mouth · Industry forum · Social media · Trade show · Other)
- **CTA:** "Create my workspace" (button-xl primary, full-width)
- **Skip:** "Skip for now — I'll fill this in later" small link (sets defaults; routes to onboarding wizard which collects again)
- **Microcopy:** "This helps us pre-load templates and recommendations."

### Post-submit
- **Backend:**
  - Create user record (status: unverified)
  - Create workspace (status: trialing, plan: Growth by default, trial ends 14d from now)
  - Assign user as Owner of workspace
  - Provision storefront subdomain (`{slugified-shop-name}.flowtora-shops.com`)
  - Pre-load industry-specific catalog, pricing formulas, equipment templates, email templates (Page T-26 industry templates)
  - Send verification email (Resend) with magic-link token (10-min expiry)
  - Send welcome email (separate, queued)
  - Create PostHog identity, Customer.io subscription
- **Redirect:** `/onboarding` (Page A-3)
- **Edge cases:**
  - Failed email verification send: account remains, banner appears in onboarding "Resend verification email"
  - Duplicate workspace name: append numeric suffix or prompt for alternative

### Form security
- Cloudflare Turnstile invisible challenge (no friction)
- Rate limit: 5 signup attempts per IP per hour
- Honeypot field hidden from users
- Disposable email blocklist
- All field values sanitized server-side
- Password sent over TLS only, never logged
- HIBP password check (k-anonymity API) at blur

---

## Page A-2. Sign in (`/signin`)

- **Route:** `auth.flowtora.com/signin`
- **Purpose:** Fast, frictionless sign in for returning users.

### Layout
- Mirror of signup page (same outer chrome) but card is 400px wide
- Above card: Flowtora wordmark
- Below card: "New to Flowtora? Start free trial" link

### Card content
- **Header:**
  - H2: "Welcome back"
  - Subtext: "Sign in to your workspace."
- **SSO buttons (top):**
  - Continue with Google · Microsoft · Apple (same as signup)
- **Divider:** "or"
- **Email field** (or username; remembered via localStorage and pre-filled)
- **Password field** (with show/hide)
- **Below fields:**
  - "Forgot password?" link (right-aligned)
  - "Remember me for 30 days" checkbox (left-aligned)
- **Primary CTA:** "Sign in" (button-lg primary, full-width)
- **Below CTA:**
  - "Sign in with magic link instead" link → triggers Page A-2b
  - "Use SSO" link → routes to `/signin/sso`
- **Footer caption:** "Need help signing in? [Contact support]"

### Authentication flow
- **Step 1:** validate credentials
  - On success with no MFA: issue session, redirect to `app.flowtora.com` (or `return_to`)
  - On success with MFA: continue to Page A-4
  - On failure: inline error "Email or password is incorrect" — generic message, do not reveal which is wrong; rate-limit after 5 attempts per email per 15 min, show captcha after 3 failures
- **Session:** stored in HttpOnly Secure SameSite=Lax cookie; 30d if Remember Me, 12h otherwise; bound to device fingerprint + coarse IP
- **Sign-in event audit:** logged (IP, device, location, success/fail, MFA used)
- **Suspicious sign-in:** if from new device or unusual location, send email notification with "this was me / this wasn't me" links

### Edge cases
- **Account locked:** "Your account is temporarily locked. Try again in 15 minutes or [reset your password]." (after 10 failed attempts within 15 min)
- **Workspace suspended:** sign-in succeeds, but redirects to a "Your workspace is suspended" page with reason + contact-support CTA
- **Email unverified:** banner above app shell prompts to verify; some destructive actions blocked until verified
- **User belongs to multiple workspaces:** post sign-in, show workspace picker (Page A-5)

---

## Page A-2b. Sign in with magic link (`/signin/magic`)

- **Route:** `auth.flowtora.com/signin/magic`
- **Layout:** simpler card
- **Content:**
  - H2: "Sign in with a magic link"
  - Body: "Enter your email and we'll send you a one-time sign-in link. No password needed."
  - Email input
  - "Send magic link" button
- **Post-submit:** Show success screen — "Check your inbox at [email]. We sent you a link that expires in 10 minutes." with "Resend link" (10s cooldown) and "Try a different email" links
- **Email content:** Branded email with one-tap "Sign in to Flowtora" button (deep link with signed token); token: HMAC-signed JWT, single-use, 10-min expiry, bound to IP and user agent at request time
- **Token validation:** on click, validate token, issue session, redirect to workspace; if expired or used, show "This link expired or was already used" page with "Send a new link" CTA

---

## Page A-2c. SSO sign-in (`/signin/sso`)

- **Route:** `auth.flowtora.com/signin/sso`
- **Purpose:** SAML/OIDC SSO entry for Pro+ workspaces.
- **Content:**
  - H2: "Sign in with SSO"
  - Body: "Enter your workspace domain or email."
  - Input field: email or domain (e.g., "yourcompany.com")
  - "Continue" button
- **Lookup:** server matches input to a configured SSO provider; if found, redirect to IdP; if not, show "We couldn't find an SSO setup for this domain. [Try regular sign in]"
- **IdP redirect:** SAML AuthnRequest or OIDC authorize redirect with `RelayState` carrying `return_to`
- **Callback:** validate SAML Response / OIDC token, just-in-time provision user if needed (per IdP settings), issue session, redirect

---

## Page A-3. Onboarding wizard (`/onboarding`)

- **Route:** `app.flowtora.com/onboarding` (workspace shell with minimal nav)
- **Purpose:** Take a freshly-signed-up user from zero to "first quote sent in 10 minutes."
- **Layout:** Full-screen wizard, left progress rail (vertical stepper), right content (centered card max 720px)
- **Pre-skip behavior:** all steps skippable; setup completion % shown in workspace welcome banner on dashboard; user can return any time

### Step 1 of 8 — Verify your email
- **Content:**
  - Header: "Verify your email"
  - Body: "We sent a verification link to **{email}**. Click it to continue."
  - Status indicator: animated spinner "Waiting for verification…" (polls every 3s; auto-advances on detection)
  - "Resend email" button (with 30s cooldown after click)
  - "Change email" link → returns to a mini-edit form
- **Skip-able:** No — but user can continue past in "limited mode" with persistent banner

### Step 2 of 8 — Your shop's brand
- **Content:**
  - Header: "Make it yours"
  - Body: "Upload your logo and pick your colors. We'll apply them to your storefront, quotes, and invoices."
  - Logo upload (drag-drop, PNG/JPG/SVG, max 5MB, suggested 512×512+)
  - Brand color picker (2 colors: primary + accent, with live preview tile beside the picker)
  - Live preview panel (right side, sticky): tiny mock quote PDF with the logo and colors
- **CTA:** "Continue" (primary) + "Skip for now" (tertiary)

### Step 3 of 8 — Where do you operate?
- Header: "Where's your shop?"
- Address autocomplete (Mapbox Places API): address line 1, line 2, city, state, ZIP/postal, country
- Time zone (auto-detected, editable)
- Currency (auto-detected based on country, editable, locked after first invoice issued)
- Tax registration (optional toggle: "I collect sales tax" → state + tax ID fields)
- CTA: Continue / Skip

### Step 4 of 8 — Pick what you sell
- Header: "Tell us what you offer"
- Multi-select grid of common product types for the chosen industry (e.g., for vinyl: vehicle wraps, vinyl banners, decals, window graphics, channel letter faces, magnets, yard signs, etc.) — each option is a tile with icon + name
- CTA: Continue — pre-loads master catalog items for selected types
- "Add a custom product type" inline button

### Step 5 of 8 — Pricing
- Header: "Set your default pricing"
- Tabs by product type selected in step 4
- Per tab: 3-5 key pricing formula inputs (e.g., for banners: $/sq ft for material, $/sq ft for printing, finishing add-on per side, minimum charge)
- "Use industry defaults" toggle — pre-fills based on Flowtora research
- Live calculator preview: "A 4×8 ft banner with hem & grommets = **$XXX**"
- CTA: Continue / Skip

### Step 6 of 8 — Import your customers (optional)
- Header: "Bring in your customers"
- Options grid (3 cards):
  - Upload CSV (drag-drop + template download link)
  - Connect QuickBooks (OAuth)
  - Connect Google Contacts (OAuth)
  - Connect Mailchimp (OAuth)
  - Start fresh — I'll add them as I go
- CSV import flow: upload → column mapping (auto-match common headers) → preview first 10 → "Import N customers" → progress + completion summary
- Skip if not ready

### Step 7 of 8 — Invite your team
- Header: "Add your team"
- Email input + role dropdown + "Add another" repeater (up to 5 quick adds)
- Roles dropdown: Owner · Manager · Sales · Designer · Operator · Bookkeeper · Read-only
- "Send invitations" button — fires invite emails (Page A-7 acceptance flow)
- Skip available

### Step 8 of 8 — Connect payments
- Header: "Get paid online"
- Body: "Connect Stripe so your customers can pay invoices online. We don't take a cut."
- "Connect Stripe" button — opens Stripe Connect OAuth in popup → returns with account linked
- "I'll do this later" skip link
- Below: small explainer "What about ACH?" → opens info card describing ACH availability with Stripe

### Completion screen
- Full-screen celebration: confetti burst (respects prefers-reduced-motion)
- H1: "You're all set, {name}!"
- Subtitle: "Welcome to Flowtora. Your 14-day free trial is active until **{date}**."
- 3-card next-action grid:
  - "Send your first quote" (with mini-walkthrough modal)
  - "Add a customer" 
  - "Customize your storefront"
- "Go to my workspace" CTA (primary, large)
- "Schedule a free 30-min onboarding call" link (Calendly embed)

### Wizard mechanics
- Each step saves on continue (atomic)
- Back button preserved
- "Skip all and go to app" link in top-right corner (with confirmation modal)
- Progress indicator updates in real-time (e.g., "Step 3 of 8 · 38% complete")
- All steps re-accessible from Workspace Settings > Onboarding (returns to in-progress)
- Audit log captures completion of each step

---

## Page A-4. MFA challenge (`/signin/mfa`)

- **Route:** `auth.flowtora.com/signin/mfa`
- **Purpose:** Second factor after password.

### Content
- H2: "Two-step verification"
- Body: indicates the method chosen by user (varies):
  - **TOTP (Authenticator app):** "Enter the 6-digit code from your authenticator app." — 6-digit code input (auto-advance between digits, paste-friendly)
  - **SMS:** "We sent a code to ****-***-1234." — 6-digit input + "Resend code" (30s cooldown) + "Use a different method"
  - **WebAuthn (security key):** "Insert your security key and tap it." — browser triggers WebAuthn ceremony
  - **Backup code:** "Enter one of your backup codes." — 10-char input
- **"Try another method" dropdown:** lists user's enrolled methods
- **"I lost access to my methods" link** → recovery flow (Page A-8)
- **Primary CTA:** "Verify" (button-lg)
- **Remember this device for 30 days** checkbox

### Behavior
- 5 attempts allowed; account locked + alert email after limit
- On success: session upgraded with `mfa_verified=true`, redirect
- WebAuthn supports multiple keys; user picks during ceremony

---

## Page A-5. Workspace picker (`/workspaces`)

- **Route:** `auth.flowtora.com/workspaces` or `app.flowtora.com/workspaces`
- **Purpose:** When a user belongs to multiple workspaces, let them choose.

### Content
- H2: "Choose a workspace"
- Search bar (filters list as you type) — visible when >5 workspaces
- List of workspace cards:
  - Workspace logo + name + plan badge + user's role + "Last visited: 2h ago"
  - Click → enters that workspace
- "Create a new workspace" button at bottom (for serial entrepreneurs / agencies)
- "Sign out" link in top-right

### Behavior
- Default workspace settable per user (preferences); auto-routes to it unless `?show_picker=true`

---

## Page A-6. Password reset

### Page A-6a. Request reset (`/forgot-password`)

- **Layout:** centered card, similar to signin
- **Header:** H2 "Reset your password"
- **Body:** "Enter the email you signed up with. We'll send you a reset link."
- **Email input** + **Send reset link** button
- **Below CTA:** "Back to sign in" link
- **Post-submit:** Success screen — "If an account exists for **{email}**, you'll receive an email with reset instructions within a few minutes." (always shows success regardless of whether email exists — prevents account enumeration)
- **Resend cooldown:** 60s
- **Email content:** "We received a request to reset your Flowtora password. If you didn't make this request, you can safely ignore this email. Otherwise, click below to set a new password. This link expires in 1 hour." + "Reset password" button
- **Token:** signed, single-use, 1-hour expiry, scoped to email

### Page A-6b. Set new password (`/reset-password?token=...`)

- **Token validation on page load:** if invalid or expired, show "This link is invalid or has expired. [Request a new one]" page
- **Layout:** centered card
- **Header:** "Set a new password"
- **Body:** "For **{masked_email}**"
- **Fields:**
  - New password (with complexity meter, HIBP check on blur)
  - Confirm new password (must match)
- **CTA:** "Update password" (button-lg primary)
- **On success:** Auto-sign-in (issue session); redirect to workspace with success toast; send confirmation email "Your password was just changed. If this wasn't you, [contact support]."
- **Security:** all existing sessions for this user are invalidated; user must re-sign-in on all other devices

---

## Page A-7. Invite acceptance (`/invite/{token}`)

- **Route:** `auth.flowtora.com/invite/{token}`
- **Purpose:** Onboard an invited teammate to a workspace.

### Token validation
- If expired (>14d), show "This invitation has expired. Ask **{inviter}** to send a new one."
- If revoked, show "This invitation has been revoked."

### Layout
- Centered card, 480px
- **Header:** Inviter avatar + "**{inviter}** invited you to join **{workspace_name}** on Flowtora as **{role}**."
- **Body:** Workspace logo (large), workspace name, plan, "Created by {owner_name}, currently has {N} team members"
- **If user already has Flowtora account (detected by email):**
  - CTA: "Join workspace" (single click; if not signed in, prompts password; adds membership)
- **If new to Flowtora:**
  - Inline mini-signup form: Full name (pre-filled if available) + Password fields
  - CTA: "Create account & join workspace"
- **Below CTA:** "Decline invitation" link (sets status to declined, notifies inviter)
- **Microcopy:** "By accepting, you agree to Flowtora's Terms and Privacy Policy."

### On accept
- Create user (if new) or add membership (if existing)
- Set user as Verified (invite acts as email verification)
- Redirect to workspace with welcome modal: "Welcome to {workspace}! Here's where to start." + role-specific quick tour

---

## Page A-8. Account recovery (`/recover`)

- **Route:** `auth.flowtora.com/recover`
- **Purpose:** User has lost access to all MFA methods.

### Flow
- **Step 1:** Email + "Last successful sign-in details" (e.g., "When did you last sign in? Where were you?") — soft signals
- **Step 2:** Identity verification options (any one):
  - Backup code (re-prompt)
  - Email a recovery code to a previously-verified secondary email
  - SMS to a previously-verified backup phone
  - Submit a manual recovery request (escalates to support; 24-48h response; requires government ID upload)
- **Step 3:** On success, prompt to set up new MFA before continuing
- **Audit:** every step logged with high severity; security team alerted on manual recovery

---

## Page A-9. Email verification (`/verify-email?token=...`)

- **Route:** `auth.flowtora.com/verify-email`
- **Token validation:** signed, single-use, 24h expiry
- **Success:** marks user verified, signs in if not already, redirect to workspace with toast "Email verified!"
- **Failure:** "This link is invalid or expired. [Send me a new one]"

---

## Page A-10. Email change verification

- When a user changes their email in Settings, both old and new emails receive emails:
  - Old: "Your email is being changed to {new}. If this wasn't you, [secure your account]."
  - New: "Confirm your new email." with verification link
- Old email remains as login until new is confirmed
- Both verification flows route through `/verify-email?token=...`

---

## Page A-11. Sign out

- **Trigger:** explicit sign-out from app, or session expiry
- **Behavior:** invalidate session server-side, clear cookies, redirect to `auth.flowtora.com/signin?signed_out=true`
- **Show toast** on signin page: "You're signed out."
- **Optional "Sign out everywhere"** button in Settings > Sessions (Page T-101) invalidates all sessions for the user across all devices

---

## Page A-12. Session-expired interstitial

- **Trigger:** API returns 401 during active session
- **Behavior:** show full-screen modal in workspace: "Your session expired. Please sign in to continue."
- **Sign-in inline:** email pre-filled (read-only), password input, SSO buttons
- **On success:** dismiss modal, retry queued API requests, restore unsaved state where possible

---

## Authentication — Cross-cutting requirements

### Password policy
- Min 12 chars
- HIBP check (k-anonymity API) at signup, password change, and reset
- No max length cap (server hashes via Argon2id with appropriate parameters)
- Encourage passphrases; no complex composition rules (per NIST 800-63B)
- Reuse prevention: last 5 hashes stored per user
- Expiry: never forced unless workspace policy enforces (Pro+)

### MFA enrollment
- After first sign-in: prompt user to enroll TOTP or WebAuthn (non-blocking nudge)
- Workspace Owners may enforce MFA for all members (Pro+)
- Methods supported: TOTP (Google Authenticator, 1Password, Authy), WebAuthn (security keys + platform authenticators incl. Touch ID/Face ID/Windows Hello), SMS (fallback only, never primary on Enterprise), 10 backup codes generated on enrollment

### Session management
- Cookie-based sessions (HttpOnly, Secure, SameSite=Lax)
- Server-side session store in Redis with per-session refresh + revocation
- Sliding expiration: extended on activity; absolute max 30d remember-me, 12h regular
- Device fingerprinting (coarse: browser, OS, screen, timezone) — bound to session
- Significant changes (IP country, fingerprint mismatch) → forced re-auth on next request
- Concurrent sessions allowed (managed in Settings > Sessions, Page T-101)
- Sign out cascades across all admin tools (if SSO)

### Rate limiting (per IP and per email)
- Signup: 5/hr/IP
- Sign-in: 10/15min/email
- Password reset request: 3/hr/email
- Magic link request: 5/hr/email
- MFA code attempts: 5/code, 10/hr/account
- Captcha (Turnstile) shown after 3 failed attempts

### Audit events
- Every auth event logged: sign-up, sign-in (success/fail), sign-out, password change, MFA enrollment, MFA challenge (success/fail), email change, account recovery, invite accept/decline, SSO authentication, session creation, session revocation
- Each event includes: actor, IP, user agent, location (coarse), result, request ID
- Auth events stream to workspace audit log (Page T-103) AND admin audit log (admin Page 14)

### Security headers (all auth pages)
- CSP strict (no inline scripts/styles except via nonces)
- HSTS preload
- X-Frame-Options: DENY
- X-Content-Type-Options: nosniff
- Referrer-Policy: strict-origin-when-cross-origin
- Permissions-Policy: minimal

### Branded vs neutral auth
- Default: Flowtora-branded auth pages
- White-label option (Enterprise): tenant can host auth at `auth.{tenant-domain}.com` with their branding (logo, colors, copy); SSO-only

---

# H1 — TRIAL, BILLING & PURCHASE FLOWS

## Page B-1. Trial state model

Trials are managed entirely in-app. Every new workspace enters trial automatically. Plan selection happens during or after trial — never required upfront.

### Trial parameters (defaults)
- **Duration:** 14 days (extensible by Customer Success to 21 or 30 days)
- **Default plan during trial:** Growth (all features unlocked; clearly limit-capped)
- **Soft limits during trial:** quotes (unlimited), customers (unlimited), seats (5), storage (10GB)
- **Hard limits during trial:** total invoiced revenue capped at $5,000 collected (above which user must add a payment method to continue collecting payments)
- **Trial extension:** self-serve "Need more time? Extend by 7 days" CTA in account, available once per workspace, no card required
- **Trial-to-paid conversion:** can convert at any point; if not converted by end of trial, workspace transitions to "trial_expired" state — see Page B-7

### Trial state visible elements
- **Top banner (T-C-11):** sticky, with progress bar, days remaining, CTA "Add payment method" + dismiss
- **Sidebar footer:** small "Trial · 9 days left" with link to billing
- **Workspace name badge:** discreet "Trial" pill next to name
- **Email cadence (orchestrated via Customer.io):**
  - Day 0: Welcome + onboarding tips
  - Day 1: "Send your first quote in 5 minutes"
  - Day 3: "Set up your storefront"
  - Day 5: "Connect QuickBooks"
  - Day 7: "Halfway through your trial — here's what's possible"
  - Day 10: "4 days left — get the most out of Flowtora"
  - Day 12: "Your trial ends Friday — pick a plan"
  - Day 14 (morning): "Last day — add payment method to keep your data"
  - Day 14 (evening): "Trial ended — your workspace is paused" (see B-7)
  - Day 17: "We miss you — extend your trial or downgrade to free"
  - Day 30: "We'll be archiving your data soon — last chance to keep it"

---

## Page B-2. Choose a plan (`/billing/plans`)

- **Route:** `app.flowtora.com/billing/plans`
- **Purpose:** Convert trial to paid, or switch plans.
- **Access:** Workspace Owner or Billing Manager role

### Layout
- Page header: "Choose your plan" (h1) + subtitle "Your trial ends in 6 days · {date}"
- Right-aligned: "Annual / Monthly" billing toggle (with "Save 20% annually" callout)
- Plan cards: 4 across desktop (Starter, Growth, Pro, Enterprise) — mirrors marketing pricing
- Each card:
  - Plan name + tagline
  - Price + period
  - "Current plan" pill (on current plan card)
  - Primary CTA: "Choose Growth" or "Upgrade to Pro" or "Downgrade to Starter" (state-aware label)
  - Feature list (collapsible "See all features" link)
- **Below cards:**
  - "Compare all features" link → expands inline table or opens modal
  - "Need a custom plan?" → "Talk to sales" CTA → Calendly modal
- **Right rail (sticky on desktop):**
  - "What happens when I change?" explainer
  - "What about my data?" reassurance
  - "Get help choosing" → chat widget trigger

### On plan selection
- Click "Choose plan" → opens Page B-3 (checkout) modal/sheet
- For downgrades: opens Page B-5 (downgrade confirmation)
- For Enterprise: opens "Contact sales" form modal

---

## Page B-3. Checkout (`/billing/checkout?plan=growth&period=annual`)

- **Route:** `app.flowtora.com/billing/checkout`
- **Purpose:** Collect payment method and activate paid plan.
- **Layout:** Slide-over drawer (right, lg 720px wide) over the plans page, or full-page on mobile.

### Drawer header
- Title: "Subscribe to **Growth**"
- Period toggle (Monthly / Annually) — re-confirms or lets user switch within drawer
- Close X (with unsaved-changes confirmation if data entered)

### Drawer body — sections

#### Section 1 — Order summary (top)
- Plan name + period + price (e.g., "Growth annual · $1,548.00/yr")
- Per-seat add-ons selector (e.g., "5 seats included · +$X for additional seats")
- Optional add-ons checkboxes:
  - Branded SMS (+$29/mo)
  - Premium support (+$99/mo) — hidden on Pro+
  - Extra location (+$49/mo)
- Coupon / promo code input (collapsible "Have a code?" link)
- Tax line: "Sales tax (calculated at next step) — $TBD"
- Total: "Total today: **$X,XXX**" (display-l, brand-700)

#### Section 2 — Billing details
- **Company / shop name** (pre-filled from workspace; editable)
- **Billing email** (pre-filled with Owner email; editable; "We'll send invoices and receipts here")
- **Billing address** (autocompleted, full address fields)
- **Tax ID / VAT** (optional, with country-aware validation; for B2B reverse charge or sales tax exemption)
- **"Save these details for future" toggle** (default on)

#### Section 3 — Payment method
- **Payment method picker (segmented control):**
  - Credit / debit card (default)
  - ACH bank debit (US only)
  - SEPA debit (EU only)
  - PayPal (optional)
  - Invoice / wire (annual only; min $5k/yr; requires manual approval)
- **Card form (Stripe Elements):**
  - Card number, expiry, CVC, ZIP/postal
  - Cardholder name
  - Real-time validation (Stripe Elements provides)
- **ACH form (Plaid Link):**
  - "Connect your bank" button opens Plaid
  - Manual fallback: routing + account number + verification via micro-deposits
- **Save card** toggle (default on for subscriptions, required)

#### Section 4 — Review & confirm
- Final line items
- Tax calculated (via Stripe Tax or TaxJar)
- Acceptance checkbox: "I authorize Flowtora to charge my payment method for this subscription. I've read the [Terms of Service]." (required to enable Pay button)
- **Pay button:** "Pay $X,XXX.XX and start" (button-xl primary, full-width)
- Below button: trust strip — "Secured by Stripe · 256-bit encryption · PCI DSS Level 1"

### Drawer footer
- Sticky: "Pay $X,XXX.XX and start" (button-xl primary)
- "Cancel" link

### On submit
- **Step 1:** Create Stripe Subscription with proration_behavior=none (first charge); attach payment method
- **Step 2:** Confirm payment intent client-side (3DS challenge if required — modal in-flow)
- **Step 3:** On success:
  - Workspace status → `active`
  - Plan → selected plan; period → selected
  - Trial status → `converted` (audit-tracked)
  - Stripe invoice created and finalized
  - Receipt email sent
  - Show confirmation screen (Page B-4)
- **Step 4:** On failure (card declined, 3DS failed, etc.):
  - Inline error message with specific reason (Stripe decline code translated to user-friendly text)
  - Suggest "Try another card" or "Use ACH instead"
  - Audit log entry
  - No subscription created

### Edge cases
- **Card declined:** show actionable error ("Your bank declined this card. Try another method or contact your bank.") with "Try again" and "Use a different method"
- **3DS abandoned/failed:** retry option, no subscription created
- **Tax calculation error:** fall back to "Tax will be calculated on your invoice" — still allow checkout
- **Duplicate submission:** idempotency key prevents double charge

---

## Page B-4. Checkout success (`/billing/checkout/success`)

- **Layout:** Full-screen takeover
- **Animation:** Checkmark animation (320ms ease-out scale), confetti burst (respects prefers-reduced-motion)
- **Content:**
  - H1: "You're on Growth 🎉"
  - Subtitle: "Welcome to your full Flowtora workspace. Your next renewal is **{date}**."
  - Receipt summary card: plan, period, amount, next renewal, "Download receipt PDF" link, "View invoice" link
  - 3 next-action cards:
    - "Invite your team" → Settings > Team
    - "Customize your storefront" → Storefront customizer
    - "Connect QuickBooks" → Integrations
  - "Go to workspace" primary CTA
  - Below: small "Your trial banner is now removed. Welcome to Flowtora."

---

## Page B-5. Plan change / downgrade

### Page B-5a. Upgrade flow

- Same as Checkout (Page B-3) but pre-fills plan and shows:
  - Prorated charge calculation: "Today you'll pay $X (prorated for {remaining days} on Growth)"
  - Effective immediately upon successful payment
  - Confirmation toast: "You're now on Pro"

### Page B-5b. Downgrade flow

- Triggered from plan picker by selecting a lower plan
- **Modal opens:**
  - Title: "Downgrade to Starter?"
  - Body: lists impacts:
    - "You'll lose access to: [list features the higher plan has]"
    - "Your team will be reduced from 5 seats to 2 — please remove members first" (if applicable)
    - "Your active customers exceed the new limit — read-only above limit until you upgrade or remove some"
    - "Storefront customization will revert to Flowtora-branded"
  - "This change takes effect at your next renewal on **{date}**. Until then, you'll keep your current plan and features."
- Checkbox: "I understand the impact of this downgrade"
- Reason dropdown (required, audit-bound): "Too expensive · Don't use most features · Found alternative · Going out of business · Other"
- Open-text feedback field (optional but encouraged)
- CTAs: "Confirm downgrade" (destructive variant since this affects billing) + "Cancel"
- **On confirm:**
  - Schedule plan change at period end
  - Audit log entry
  - Email confirmation: "Downgrade confirmed. Your plan changes to Starter on {date}."
  - "Undo downgrade" link valid until period end

---

## Page B-6. Cancel subscription (`/billing/cancel`)

- **Route:** `app.flowtora.com/billing/cancel`
- **Access:** Workspace Owner only
- **Purpose:** Cancel paid subscription. Workspace transitions to "cancelled" status; data retained 90 days for restore.

### Cancel flow (multi-step modal)

#### Step 1 — Tell us why
- Header: "We're sorry to see you go"
- Reason selector (single select, required):
  - Too expensive
  - Missing features I need
  - Found a better alternative (text field: which one?)
  - Going out of business / closing shop
  - Not using it enough
  - Technical issues
  - Other (text field)
- "We listen — your feedback helps us improve" subtext

#### Step 2 — Save offer (if reason = "too expensive" or "not using enough")
- Conditional save offer:
  - "Would 50% off for 3 months change your mind?"
  - Or: "Would pausing your subscription for up to 3 months help?"
  - Or: "Switch to Starter ($49/mo) to keep your essentials"
- Accept → applies discount/pause and exits flow; Decline → continue

#### Step 3 — What you'll lose
- Bulleted impact list:
  - "Storefront will be taken offline on **{date}**"
  - "Quote acceptance and payment links will stop working"
  - "Your team will lose access on **{date}**"
  - "Your data will be retained for 90 days, then permanently deleted"
- "Export your data" link → triggers data export job (Page T-99)

#### Step 4 — Confirm cancellation
- Reason summary
- Effective date (defaults to period end; checkbox "Cancel immediately and forfeit remaining time" for special cases)
- Final confirmation: type "CANCEL" to confirm
- Reason field (required, audit-bound)
- "Confirm cancellation" button (destructive variant)
- "Keep my subscription" (primary, escape route)

### On confirmation
- Stripe subscription cancellation at period end
- Workspace status → `cancelling` (effective at period end)
- Workspace status at period end → `cancelled`
- Email: "Your Flowtora subscription is cancelled. Your workspace will be paused on {date}."
- Audit log entry
- Reactivation link valid for 90 days from cancellation

---

## Page B-7. Trial expired / Workspace paused state

- **Trigger:** trial ends without payment method, or subscription lapses (failed dunning)
- **Behavior:**
  - Workspace status → `paused` (or `trial_expired`)
  - On sign-in, full-screen takeover page (cannot bypass):
    - H1: "Your workspace is paused"
    - Body: "Your trial ended on **{date}**. Add a payment method to continue, or export your data."
    - CTAs: "Choose a plan" (primary, opens Page B-2) + "Export my data" (secondary) + "Talk to support" (tertiary)
  - Underlying data preserved; storefront offline; API keys disabled; outgoing emails paused
  - Owner can still access billing pages to reactivate
  - Other team members see a different message: "Your team's workspace is paused. Ask **{Owner name}** to reactivate."
- **Data retention:** 90 days from pause; warning emails at 30, 60, 75, 89 days; permanent deletion at 90 days (with reversible cooldown via support 7 days post-delete)

---

## Page B-8. Reactivate workspace

- **Trigger:** paused workspace; Owner clicks "Reactivate"
- **Flow:** Mini-checkout (mirrors Page B-3 but pre-fills last plan)
- **On success:** workspace returns to `active`, storefront comes back online (with brief banner "Your storefront is back online"), email "Welcome back!" sent

---

## Page B-9. Billing overview (`/billing`)

- **Route:** `app.flowtora.com/billing`
- **Purpose:** Single source of truth for billing.

### Layout
- Tabs: Overview · Invoices · Payment methods · Plan & add-ons · Tax & address · Usage · History

### Overview tab
- **Hero card (full-width):** Current plan + period + price + next renewal date + "Manage plan" CTA
- **2-card row:** Next invoice (amount + date + breakdown) · Active add-ons
- **Usage panel:** seats used / included, storage used / included, quotes this period / included (visual bars)
- **Quick links:** Update payment method · Download last invoice · View invoice history · Cancel subscription

### Invoices tab
- Table: Invoice # · Date · Period · Amount · Status (Paid/Open/Past due/Voided) · Download · Pay (if open)
- Filters: date range, status
- Per-row actions: download PDF, view in modal, pay now
- Export all invoices CSV

### Payment methods tab
- List of saved methods (card last 4 + expiry + brand · ACH bank name)
- "Set default" radio
- "Remove" action (blocked for default; force-set new default first)
- "Add payment method" button → opens add-payment-method modal

### Plan & add-ons tab
- Current plan summary + change button → Page B-2
- Add-ons table: Add-on · Quantity · Price · Status · Manage
- "Add add-on" button → modal with available add-ons

### Tax & address tab
- Billing address (editable)
- Tax IDs (editable; with validation)
- Tax exemption certificate upload (for US sales tax exempt orgs)
- Currency (read-only; locked after first invoice)

### Usage tab
- Charts: seats over time, storage over time, quotes over time, API calls over time
- Per-month usage table
- Overage charges (if any)

### History tab
- Activity feed: plan changes, payment method changes, refunds, credits, discount applications, cancellations — all timestamped, audit-bound

---

## Page B-10. Failed payment / dunning

- **Trigger:** Stripe webhook `invoice.payment_failed`
- **Behavior:**
  - Email to Owner + Billing Manager: "Your payment failed — please update your card"
  - In-app banner (rose) at top of every page: "Your payment failed on {date}. Update your payment method to keep your workspace active. [Update now]"
  - Retry schedule (Stripe Smart Retries): 3, 5, 7, 10, 14 days after first failure
  - At 14 days: workspace status → `past_due` (still usable, but storefront shows "Temporarily unavailable" banner)
  - At 21 days: workspace status → `paused` (Page B-7)
- **Dunning preferences:** Owner can configure retry days and email tone in billing settings

---

## Page B-11. Refunds & credits

- Refund requests handled through support (no self-serve refund flow)
- Admin issues refund via admin portal → appears in user's billing > history with "Refunded: $X, reason: {reason}"
- Account credits (applied during disputes, downtime SLA breaches, save offers) shown in billing overview "Credit balance: $XX.XX (applied to next invoice automatically)"

---

# H1 — WORKSPACE (app.flowtora.com)

The shop owner's portal. This is where Flowtora's product value is delivered. Designed for daily use by mixed roles: owners, sales, designers, operators, bookkeepers.

## App shell architecture

### Topbar (56px, sticky, shadow-sm on scroll)

Left to right:
- **Workspace switcher:** logo + workspace name + ⌄; click → popover with: search bar, workspace list (with current marked), "Create new workspace", "Manage workspaces"
- **Global search (480px):** input with `⌘K` hint; opens command palette (Page T-104)
- **Center / status indicator:** small "Production · 12 jobs in progress" pill, click → Production Dashboard
- **New menu:** primary button "+ New" (brand-600) with dropdown (Quote, Customer, Job, Invoice, Payment, Material order, Expense, Note); also accessible via `N` key
- **Notifications bell:** with unread count badge (rose); opens drawer (Page T-100)
- **Help (?):** opens menu (Help center · Keyboard shortcuts · Contact support · Live chat · Submit feedback · Status page · What's new)
- **Theme toggle:** sun/moon icon, cycles Light → Dark → System
- **Profile menu:** avatar; dropdown with name + workspace role + (My profile · Settings · Switch workspace · Sign out)

### Sidebar (240px expanded, 64px collapsed)

Top to bottom:

**Workspace home**
- Dashboard (Home icon)

**Sales**
- Customers
- Quotes
- Invoices
- Payments

**Production**
- Jobs
- Calendar
- Kanban board
- Equipment
- Material orders

**Catalog**
- Products & services
- Materials
- Pricing formulas
- Templates

**Customers & Marketing**
- Storefront
- Reviews
- Marketing
- Forms & lead capture

**Reports**
- Reports & analytics

**Settings (bottom area)**
- Team & roles
- Integrations
- Billing
- Workspace settings

**Sidebar footer:**
- Trial pill (if applicable) · "Help" link · build version · system status dot

### Right rail (320px, contextual)

Appears on detail pages (quote, job, customer, invoice). Tabs: Activity · Comments · Files · Related. Sticky scroll; can be collapsed to icon strip 48px wide.

### Mobile shell
- Topbar collapses: hamburger + logo + search icon + profile
- Sidebar becomes drawer (slide-in from left)
- Right rail becomes bottom sheet
- Tables become card lists
- Hover actions become long-press → action sheet

---

## Page T-1. Workspace dashboard

- **Route:** `/dashboard` (default landing on sign-in)
- **Purpose:** At-a-glance view of the shop's state — today's jobs, recent quotes, payments due, alerts.
- **Customizable layout** (per user)
- **Default layout grid:**
  - Row 1 (welcome): full-width, 80px h
  - Row 2 (KPI primary): 4 cards × 3 cols, 132px h
  - Row 3: Today's production (8 cols, 400px) + Quotes to follow up (4 cols, 400px)
  - Row 4: Cash this month chart (6 cols, 320px) + Overdue invoices list (6 cols, 320px)
  - Row 5: Customer activity feed (6 cols, 320px) + Material alerts (6 cols, 320px)

### Header / welcome row
- "Good morning, {first name}" (display-l)
- Subtitle: "It's Wednesday, April 29 · 9:42 AM"
- Right: date range picker (Last 30d) · "+ New" menu

### KPI cards
1. **Open quotes value** — sum of draft + sent quotes, click → quotes list filtered
2. **In production** — count of active jobs, with status breakdown sparkline, click → jobs list
3. **Cash this month** — sum of paid invoices this month, click → payments
4. **Overdue invoices** — count + total $, click → invoices filtered

### Today's production widget
- Title: "Today's production" + "View calendar →"
- List of jobs scheduled for today: job # · customer · product · operator · status · due time
- Per-row: status pill, quick-action menu (Start, Mark complete, Reassign)
- Empty state: "Nothing scheduled today. Add a job →"

### Quotes to follow up widget
- Title: "Follow up" + "All quotes →"
- List of sent-but-not-accepted quotes age > 3 days
- Per-row: customer · quote # · amount · age · last touched
- Quick actions: Send reminder · Call customer · Mark accepted · Mark lost

### Cash this month chart
- Type: bar (daily) + line overlay (cumulative)
- Comparison toggle vs. previous month
- Click bar → drills to that day's payments

### Overdue invoices list
- Sortable table
- Per-row: customer · invoice # · amount · days overdue · last reminder · next reminder date
- Quick actions: Send reminder · Mark paid · Call

### Customer activity feed
- WebSocket-driven, latest 20 events
- Per item: actor (customer or staff) · verb · entity · time
- Examples: "Sarah from Acme accepted Quote #1042" · "Tom paid Invoice #2103 ($1,250)"

### Material alerts widget
- List of materials at or below reorder point
- Per item: material · stock level visual bar · supplier · "Reorder now" button
- Empty: "Stock levels look good."

### Customization controls
- "Customize layout" → enters edit mode: drag widgets to rearrange, resize, add/remove widgets from a panel of available widgets, save layout (per user)
- "Reset to default"
- "Share my layout with team" (Owner)

### Empty / first-time state
- Hides KPI numbers; shows checklist: "Complete your setup" with 5 tasks (verify email, add logo, create first quote, invite team, connect Stripe)
- Each checkbox is a deep link to the relevant page; persistent until 100% complete or user dismisses

---

## Page T-2. Quotes — List

- **Route:** `/quotes`
- **Purpose:** All quotes in one place. Find, filter, follow up.

### Header
- H1: "Quotes" + count pill (e.g., "Quotes 142")
- Right: filters · saved views · density · columns · export · "+ New quote" (primary)

### Toolbar
- Search (by quote #, customer name, content)
- Status filter chips: All · Draft · Sent · Viewed · Accepted · Declined · Expired · Converted
- Date range filter (created / sent / accepted / expires)
- Customer filter (multi-select with type-ahead)
- Tag filter
- Owner filter (sales person)
- "More filters" popover: amount range, has-deposit, has-proof, value-tier

### Table columns (default)
- Checkbox (multi-select)
- Quote # (link)
- Customer (avatar + name)
- Title (truncated, e.g., "Vinyl banners for retail rollout")
- Amount (currency, right-aligned tabular)
- Status (pill)
- Owner (avatar)
- Created (relative)
- Expires (relative; rose if soon)
- Last activity (relative)
- Actions (3-dot menu)

### Row actions (3-dot menu)
- View · Edit · Duplicate · Send · Mark accepted · Mark declined · Convert to job · Download PDF · Send reminder · Add comment · Archive

### Bulk actions (sticky bar appears when rows selected)
- Send (re-send to customers) · Tag · Assign owner · Export · Archive · Delete

### Empty state
- Illustration: blank quote
- Heading: "No quotes yet"
- Body: "Send your first quote in under 5 minutes."
- CTA: "Create a quote"

### Saved views (built-in)
- All quotes (default)
- My quotes
- Drafts
- Sent (awaiting response)
- Won this month
- Lost / declined
- Expiring soon

### Performance
- Server-side pagination (50/page default); cursor-based
- TanStack Table virtualized rows (handles 100k+)

---

## Page T-3. Quote — Detail / Builder

- **Route:** `/quotes/{id}`
- **Purpose:** Build, edit, send, track a single quote.
- **Layout:** Full-width with right rail (Activity / Comments / Files)

### Header (sticky)
- Breadcrumb: Quotes > Quote #1042
- Title: "Quote #1042 · {customer name}" (editable inline)
- Status pill
- Action cluster: "Save draft" · "Preview" · "Send" (primary) · 3-dot menu (Duplicate, Convert to job, Archive, Delete, Print, Download PDF, Send reminder, Generate proof, Add note)
- Right rail toggle

### Body — sections

#### Section 1 — Customer & header info
- **Customer block:** avatar + name + email + phone, "Change customer" link, "+ Add contact"; if no customer, big "Add customer" CTA opens customer picker (search existing or create new inline)
- **Quote details strip:**
  - Quote # (auto-generated, editable per workspace prefix setting)
  - Issued date
  - Valid until (date picker; default = +30d)
  - Reference / PO # (optional)
  - Project (optional, link to project if multi-quote)
  - Tags (chip multi-select)
  - Assigned to (user picker)

#### Section 2 — Line items
- **Table-style editor:**

| # | Item | Description | Qty | Unit | Rate | Discount | Tax | Amount |
|---|------|-------------|-----|------|------|----------|-----|--------|

- Each row:
  - Item picker: type-ahead search of catalog items; "+ Add new item" inline
  - Description: rich text (size, colors, finishing details) — multi-line
  - Quantity: number input with unit selector (each, sq ft, linear ft, hour, etc.)
  - Rate: currency input; auto-fills from catalog; manually override
  - Discount: amount or % toggle
  - Tax: tax rate dropdown (per-line override; default from workspace tax setting)
  - Amount: calculated (read-only)
  - Row actions: duplicate, remove, drag-reorder, "Open pricing formula" (if catalog item has a formula attached)
- "Add line" button below table
- "Add from catalog" button (opens slide-over catalog picker)
- Group sections support: line items can be grouped under section headers (e.g., "Materials", "Labor", "Installation")
- **Pricing formula resolver:**
  - For items linked to a formula (e.g., banner sq ft × material rate + setup), opens a slide-over editor with the formula inputs (width, height, material, finishing, etc.) and shows the calculation breakdown
  - Inputs sync to the line; line description auto-generates from formula context

#### Section 3 — Totals
- **Right-aligned summary block:**
  - Subtotal
  - Discount (workspace-wide, separate from per-line)
  - Tax (auto-calculated from line items, with breakdown popover showing tax rates)
  - Shipping (optional)
  - Other fees (rush, install, etc.)
  - **Total**
  - Deposit required (toggle; $ or %; default per workspace)
  - Balance due (auto-calculated)
- All currency uses workspace currency; tabular nums; large totals in display-l

#### Section 4 — Terms & notes
- **Public notes / message to customer** (rich text; defaults from workspace template)
- **Terms & conditions** (rich text; defaults from workspace template, editable per quote; collapsed by default with "Edit terms" toggle)
- **Internal notes** (visible only to staff; collapsed)

#### Section 5 — Attachments
- **File upload area:** drag-drop, multi-file, supports common formats (PDF, JPG, PNG, AI, PSD, EPS, SVG, DXF, ZIP)
- Files appear as thumbnails with name + size + remove + "Send to customer" toggle (whether attached to outgoing email)
- "Generate proof from this file" quick action (opens proof builder)

#### Section 6 — Send settings (collapsed by default; expands on Send click)
- **To:** customer email(s) + cc (additional contacts)
- **From:** workspace from-name + from-email (or send-as-shop verified domain)
- **Subject:** auto-generated, editable
- **Email body:** rich text editor, pre-filled from template, with merge tags ({customer.first_name}, {quote.total}, {quote.link})
- **Attachments included:** quote PDF (auto), files marked "send to customer"
- **Options:**
  - "Require electronic signature" (e-sign via HelloSign/DocuSeal)
  - "Require payment on acceptance" (deposit %)
  - "Track when viewed" (default on)
  - "Auto-reminder if not accepted after N days" (workspace default 5d)
  - "Send a copy to me" (default on)

### Send action
- Click "Send" → validates required fields (customer email present, line items not empty) → opens Send modal (or expands Send section) → "Confirm & send" → triggers:
  - Email queued via Resend
  - PDF generated server-side and stored
  - Quote status → Sent
  - Audit log entry
  - Activity feed event
  - Customer-facing public quote link generated (unique URL with signed token)
  - Tracking pixel embedded in email; status updates to "Viewed" on open

### Customer-facing public quote view
- URL: `quotes.flowtora.com/{token}` or branded domain
- Layout: tenant-branded header + quote document (PDF-style layout, responsive HTML)
- Actions:
  - "Accept quote" → if e-sign required, signature pad; else single-click
  - "Request changes" → opens text box, sends back to staff with notes
  - "Pay deposit" → if required, opens Stripe Checkout; on success, quote moves to Accepted + deposit recorded as payment
  - "Decline" → optional reason text; quote → Declined
  - "Download PDF" link
  - "Ask a question" → opens chat thread that posts to staff's quote activity

### Status transitions
- Draft → Sent (on send)
- Sent → Viewed (on email open or link visit)
- Viewed → Accepted / Declined (on customer action)
- Accepted → Converted (on conversion to job)
- Any → Expired (when valid-until passes)
- Auto-reminder: at 3d (configurable) if no action, auto-send reminder email

### Right rail
- **Activity tab:** chronological event log (created, edited, sent, opened, viewed, downloaded, accepted/declined, deposit paid, converted, etc.)
- **Comments tab:** internal threaded comments + @mentions
- **Files tab:** all attachments
- **Related tab:** customer profile link, original lead source, related jobs/invoices

---

## Page T-4. Customers — List

- **Route:** `/customers`
- **Purpose:** Master customer directory + CRM lite.

### Header
- H1: "Customers"
- Right: search · filters · "+ New customer" (primary) · Import (opens CSV import modal)

### Filters
- Status: Active · Inactive · Lead · Prospect · Customer · VIP · Tagged
- Type: Individual · Business
- Tag (multi-select)
- Owner
- Created date range
- Has open quotes / has overdue invoices / lifetime value range

### Table columns (default)
- Checkbox
- Name (with avatar; clickable)
- Type (Individual / Business)
- Email · Phone
- Tags (chips)
- Last activity (relative)
- Open quotes (count)
- Open invoices (count + $)
- Lifetime value (currency)
- Created (relative)
- Owner (avatar)
- 3-dot actions

### Row actions
- View · Edit · New quote · New invoice · Email · Call · Add note · Add tag · Merge duplicate · Archive · Delete

### Bulk actions
- Tag · Assign owner · Email campaign · Export · Archive

### Empty state
- "No customers yet. [Import from CSV] or [Add your first customer]"

---

## Page T-4a. Customer detail (`/customers/{id}`)

- **Layout:** Right rail layout
- **Header:**
  - Avatar (large 64px) + name + type pill + tag chips + status pill
  - Action cluster: "+ New quote" · "+ New invoice" · 3-dot (Edit, Email, Call, Add note, Archive, Delete, Merge)
- **Tabs:** Overview · Quotes (N) · Jobs (N) · Invoices (N) · Payments · Files · Activity · Notes · Communications

### Overview tab
- **2-column layout:**
- **Left column (main):**
  - **Summary card:** company/individual name, primary contact (name, title, email, phone), primary address, billing address (toggle different), website, social, source ("How they found us"), preferred contact method, language preference, time zone
  - **Stats row:** Lifetime value · Avg job size · Job count · First job date · Last job date · Days since last contact · NPS score (if collected) · Payment terms set
  - **Health bar:** customer engagement score (0-100) with reasons (chips: "Active jobs", "No contact in 90d", "Unpaid invoice 30+d", etc.)
- **Right column (sidebar):**
  - **Contacts list:** multiple contacts per customer (each with role/title); "+ Add contact" button
  - **Tags** (editable chip group)
  - **Custom fields** (per-workspace custom fields)
  - **Payment terms:** Net 30 / Due on receipt / etc.
  - **Default tax setting**
  - **Credit limit** (optional, blocks new quotes when exceeded)
  - **Marketing opt-ins:** transactional emails (forced on), marketing emails (toggle), SMS (toggle)

### Quotes / Jobs / Invoices tabs
- Filtered list of each entity tied to this customer
- "+ New" button at top of each

### Files tab
- All files attached to this customer's jobs/quotes plus uploaded directly
- Filter by source (quote, job, manual upload)

### Activity tab
- Full event timeline: every interaction (quote sent, payment received, comment, email, call logged, etc.)

### Notes tab
- Rich text notes with @mentions, attachments
- "Pin note to top" option
- Created by + date stamps

### Communications tab
- **Email history** (synced from connected mailbox; or logged via send-from-Flowtora)
- **Call log** (manual entry; with optional Twilio recording integration)
- **SMS history** (if SMS enabled)
- **In-app chat history**

---

## Page T-5. Jobs — List

- **Route:** `/jobs`
- **Purpose:** All active and historical jobs.

### Toolbar
- Search · Status filter chips (All · Backlog · Scheduled · In production · On hold · Ready · Delivered · Cancelled) · Date filter · Customer · Owner · Equipment · Tags · "More filters"

### Table columns
- Job # · Customer · Title · Status · Due date · Assigned operator · Equipment · Progress (bar) · Total · Created · Actions

### Views available
- List (default)
- Kanban board (Page T-6)
- Calendar (Page T-7)
- Gantt (timeline; for multi-day jobs)

### "+ New job" actions
- Create from scratch
- Create from accepted quote (default flow)
- Duplicate existing job

---

## Page T-5a. Job detail (`/jobs/{id}`)

Similar layout to Quote detail with these tabs:
- **Overview** — customer, line items, totals (read-only or editable based on status), proofs, files
- **Production** — schedule slot, assigned operator(s), equipment, estimated time, actual time, materials reserved, status timeline
- **Time tracking** — operator clock-in/out events, total hours, labor cost
- **Materials** — materials used (from inventory) with reservations; auto-deduction on job complete
- **Proofs** — proof versions with customer approval status
- **Invoices** — invoices generated from this job
- **Activity** · **Comments** · **Files**

### Key job actions
- Schedule (opens scheduler modal with calendar view)
- Assign operator (single or multi)
- Reserve materials
- Generate proof
- Mark complete (triggers inventory deduction + invoice prompt)
- Generate invoice
- Print work order
- Print packing slip

### Work order PDF
- Print-optimized layout: job # + customer + delivery date + line items + production notes + materials list + assigned operator + signature lines
- Generated server-side; downloadable; printable

---

## Page T-6. Kanban board

- **Route:** `/jobs/kanban`
- **Purpose:** Visual workflow board for jobs.
- **Layout:** Horizontal scrolling columns

### Columns (configurable per workspace)
Default: Backlog · Scheduled · In production · On hold · Ready · Delivered

### Per-column anatomy
- Header: status name + count + "Add job to column" button + column 3-dot menu (rename, set limit, archive column)
- WIP limit indicator (e.g., "5/8") — rose when exceeded
- Job cards (T-C-4):
  - Draggable
  - Status color stripe + Job # + customer + title + assigned operator avatars + due date pill + thumbnail (if proof attached) + tags

### Drag-drop
- Drag job between columns → updates status; emits event
- Drag within column → reorders priority within status (saved per workspace)
- Conflict modal if dragging to a column with WIP limit hit

### Filters
- Customer · Operator · Equipment · Date range · Tag
- "Save filter as view"

### Compact / dense mode
- Toggle to reduce card size to single-line (for very busy boards)

---

## Page T-7. Production calendar

- **Route:** `/calendar`
- **Purpose:** Schedule and visualize production across time and resources.
- **Views:** Day · Week (default) · Month · Resource (equipment as rows) · Agenda (list)

### Layout
- Top bar: view switcher · date navigator · "Today" jump · filter chips (operator, equipment, customer, status) · "+ New event" button · settings (calendar customization)
- Body: standard calendar grid with job chips (T-C-4)

### Day / Week view
- Time scale 6am - 10pm (configurable)
- Equipment columns or operator columns (toggle)
- Job chip drag-to-resize (changes duration)
- Drag chip to new slot → reschedules
- Click empty slot → create new job event

### Month view
- Each day shows up to 4 chips + "X more" pill
- Click day → opens day detail panel

### Resource view
- Rows = equipment, columns = days
- Useful for scheduling printer time / cutter time / press time
- Conflict detection: red dashed border if two jobs assigned to same equipment overlap

### Conflict & validation
- Equipment double-booking: blocks save with reason
- Operator double-booking: warns but allows (operator can have multiple jobs)
- Outside business hours: warns
- Material not in stock: warns with "Reserve more" link

### Sync
- Export calendar to ICS feed (per-user subscribe URL)
- Two-way sync with Google Calendar / Outlook (Integration setting)
- Pinch-zoom on mobile

### Filters / saved views
- "My jobs" · "Today's deliveries" · "This week" · custom views

---

## Page T-8. Equipment

- **Route:** `/equipment`
- **Purpose:** Manage printers, cutters, presses, embroidery machines, etc.

### List view
- Cards or table view
- Per-equipment card: name + type + status (Available / In use / Maintenance) + utilization % this week + current job + "View details"

### Equipment detail
- **Tabs:** Overview · Schedule · Maintenance · Materials compatible · Pricing rules
- **Overview:** name, type, manufacturer, model, year, serial #, location, status, capacity (e.g., "max width 64in"), notes, photos
- **Schedule:** mini calendar showing current and upcoming bookings
- **Maintenance:** scheduled maintenance log + reminders + last service + next due
- **Materials compatible:** which materials can run on this equipment (used for pricing formula validation)
- **Pricing rules:** per-equipment hourly rate, setup time, run time formulas

### "+ Add equipment" wizard
- Type picker (Printer / Cutter / Press / Embroidery / Heat press / CNC / Laser / Other)
- Industry templates pre-populate common fields
- Custom fields supported

---

## Page T-9. Invoices — List

- **Route:** `/invoices`

### Toolbar
- Search · Status filter (Draft · Sent · Partial · Paid · Overdue · Voided · Refunded) · Date range · Customer · Amount range · "More filters"

### Columns
- Invoice # · Customer · Issued · Due · Amount · Paid · Balance · Status · Actions

### Bulk actions
- Send · Mark paid · Send reminder · Export · Void

### Quick stats top of page
- Total outstanding · Overdue · Paid this month · Average days to pay

---

## Page T-9a. Invoice detail (`/invoices/{id}`)

Similar to quote detail but with payment-tracking emphasis.

### Header
- Invoice #, status, due date prominent
- Actions: Send · Mark paid · Record payment · Send reminder · Void · Download PDF · 3-dot (Duplicate, Refund, Print, Convert to credit note)

### Body
- Same line-item structure as quote
- **Payments section:** list of payments received with date, method, amount, reference, "Apply", "Void", "Refund" actions
- **Reminders log:** auto-reminders sent + manual

### Customer-facing invoice view
- URL: `invoices.flowtora.com/{token}`
- Pay button → Stripe Checkout (card, ACH, etc.)
- Partial payment support: customer can pay any amount up to balance
- Receipt auto-issued post-payment

---

## Page T-10. Payments

- **Route:** `/payments`
- **Purpose:** All payment transactions.

### Filters
- Method (Card / ACH / Check / Cash / Wire / Stripe Link / Other) · Status (Succeeded / Pending / Failed / Refunded) · Customer · Date range · Amount

### Columns
- Date · Customer · Invoice # · Amount · Method · Status · Reference · Actions

### Stats
- Total received (period) · By method donut · Refunded · Pending payouts to bank

### "+ Record payment" modal
- Customer picker · Invoice picker (optional) · Amount · Method · Date · Reference / check # · Notes · "Save"
- Auto-applies to oldest unpaid invoice if invoice not specified

---

## Page T-11. Inventory / Materials

- **Route:** `/materials`

### List view
- Filter chips: All · Low stock · Out of stock · By category (Vinyl, Ink, Substrate, Thread, Blank, Finishing supply)
- Toolbar: Search · "+ New material" · Import CSV

### Columns
- Material · Category · SKU · Current stock (visual bar T-C-5) · Reorder point · Unit · Cost per unit · Supplier · Last received · Actions

### Material detail
- **Tabs:** Overview · Stock log · Suppliers · Used in (catalog items / jobs) · Files
- **Stock log:** every in/out transaction with date, qty, source (job ID, manual adjustment, supplier receipt), running balance
- **Reorder:** "Create supplier order" button (opens Page T-11a)

---

## Page T-11a. Supplier orders / POs

- **Route:** `/materials/orders`
- Manage purchase orders to material suppliers
- Per PO: supplier · order date · line items · expected delivery · status (Draft / Sent / Confirmed / Partial / Received / Cancelled) · received qty per line · invoice match

---

## Page T-12. Storefront customizer

- **Route:** `/storefront`
- **Purpose:** Configure the customer-facing storefront.
- **Layout:** Split view — left = customization panel (300px), right = live preview (iframe, refreshes on change)

### Customization panel sections
- **General:** Storefront name, tagline, hero image, hero CTA text
- **Theme:** brand color, accent color, font (limited options), button radius
- **Header:** logo, nav links, contact info display
- **Sections:** drag-drop sections to enable (Hero · About · Products · How it works · Reviews · Contact · Custom HTML)
- **Products:** select catalog items to feature; reorder
- **Contact:** address, hours, phone, email, social
- **Footer:** customizable links, "Powered by Flowtora" toggle (locked on Starter)
- **SEO:** meta title, description, OG image
- **Code:** custom CSS / JS injection (Pro+)
- **Domain:** subdomain + custom domain setup (Pro+; CNAME + auto-SSL)

### Publish
- "Preview" link opens new tab with un-published changes
- "Publish" button writes to live storefront with version history

---

## Page T-13. Public storefront (customer-facing)

- **Route:** `{slug}.flowtora-shops.com` or custom domain
- **Layout:** as customized by tenant
- **Default pages:**
  - **Home** — hero + featured products + about + reviews + contact
  - **Order** — product catalog with configurator (T-C-3) → add to quote → checkout / send to shop
  - **Cart / Quote request** — review items, customer info form, submit
  - **My account** (after signup) — past orders, repeat orders, saved designs, address book
  - **About / Contact / Hours**
- **Online ordering flow:**
  - Customer browses storefront
  - Configures product (size, material, finishing, quantity, upload artwork)
  - Adds to cart
  - Multi-item cart supports
  - Checkout: enter contact info (or sign in to customer account), shipping address, "Request quote" (creates a quote in tenant workspace) OR if instant-pricing enabled and customer accepts terms, "Pay & order" (creates job + invoice + collects payment)
- **Customer accounts:**
  - Optional sign-up (passwordless via email magic link or password)
  - Stores design files for repeat orders
  - One-click reorder of past jobs
  - Notification preferences

---

## Page T-14. Marketing module

- **Route:** `/marketing`
- **Tabs:** Email campaigns · Automations · Forms · Reviews · Referrals · Loyalty

### Email campaigns
- List of campaigns (Draft, Scheduled, Sent)
- Composer: subject, from, audience segment, body (rich + merge tags), send/schedule
- Templates library
- Stats per campaign: sent, opened, clicked, unsubscribed, revenue attributed

### Automations
- Pre-built workflows toggleable:
  - "Send review request 3 days after delivery"
  - "Send win-back to customers inactive 90+ days"
  - "Send birthday/anniversary discount"
  - "Send quote follow-up at 3, 7, 14 days"
- Custom workflow builder (Pro+): trigger → conditions → actions (email/SMS/task/tag)

### Forms & lead capture
- Embeddable forms (HTML snippet or hosted form pages)
- Form builder (drag-drop fields)
- Lead landing → customer record creation

### Reviews
- Configurable post-job review requests
- Aggregated review feed (Google, Facebook, internal)
- "Reply to review" composer
- Featured reviews on storefront (auto-syndicate)

### Referrals
- Referral program toggle
- Reward structure (% discount or $ credit)
- Customer-facing referral page on storefront
- Tracking of referral attribution + payouts

### Loyalty
- Punch-card or points-based loyalty
- Configurable rewards
- Customer-facing loyalty dashboard on storefront

---

## Page T-15. Reports & analytics

- **Route:** `/reports`
- **Layout:** Dashboard-style with multiple charts; saved reports

### Pre-built reports
- **Revenue:** by day/week/month/year, by customer, by product, by category, by sales rep
- **Profitability:** by job (revenue − materials − labor)
- **Sales pipeline:** quotes by status, win rate, avg deal size, avg time to close
- **Customer:** lifetime value, retention, churn, top customers, dormant customers
- **Production:** jobs completed, avg cycle time, on-time delivery rate, by equipment, by operator
- **Inventory:** material consumption, waste, supplier performance, reorder frequency
- **Cash flow:** receivables aging, days sales outstanding (DSO), payment method mix
- **Team:** quotes per rep, conversion rate, hours logged per operator

### Each report
- Filters: date range, customer, product, etc.
- Chart + data table
- Export CSV/Excel/PDF
- "Save as report" with custom name
- "Schedule email" (daily/weekly/monthly auto-send to specified emails)

### Custom report builder (Pro+)
- Pick data source · choose dimensions · choose measures · choose chart type · apply filters · save

---

## Page T-16. Team & roles

- **Route:** `/settings/team`
- **Tabs:** Members · Invitations · Roles · Activity

### Members table
- Avatar · Name · Email · Role · Status (Active, Pending, Suspended) · Last active · Actions (Edit role, Suspend, Remove, Resend invite, Reset password)
- "+ Invite member" button

### Invitation modal
- Email(s) — multi-line for bulk · Role · Optional personal message · "Send invitations"

### Roles
- Built-in: Owner · Manager · Sales · Designer · Operator · Bookkeeper · Read-only · Custom (Pro+)
- Per-role permission matrix (granular: Quotes, Customers, Jobs, Invoices, Payments, Reports, Settings, Storefront, etc., with View/Create/Edit/Delete checkboxes)

---

## Page T-17. Integrations

- **Route:** `/settings/integrations`
- **Layout:** Grid of available integrations + "Connected" filter chip

### Per-integration card
- Logo, name, category, "Connect" or "Manage" button (state-aware)

### Common integrations to support
- **Accounting:** QuickBooks Online, QuickBooks Desktop, Xero, FreshBooks, Wave
- **Payments:** Stripe (built-in), Square, PayPal, Authorize.net
- **Shipping:** ShipStation, EasyPost, USPS, FedEx, UPS
- **E-commerce:** Shopify, WooCommerce, BigCommerce
- **Marketing:** Mailchimp, Constant Contact, HubSpot, ActiveCampaign, Customer.io
- **CRM:** Salesforce, HubSpot, Pipedrive, Zoho
- **Calendar:** Google Calendar, Outlook, Apple Calendar (CalDAV)
- **Communication:** Twilio (SMS), Slack, Microsoft Teams, Gmail, Outlook
- **Design:** Adobe Creative Cloud, Canva, Dropbox, Google Drive, OneDrive
- **Productivity:** Zapier, Make, n8n, Trello, Asana, Monday
- **POS:** Square POS, Clover, Lightspeed
- **Tax:** TaxJar, Avalara
- **Forms:** Typeform, Jotform, Google Forms
- **Storage:** AWS S3, Backblaze
- **Custom:** REST API + Webhooks (configured in Page T-18)

### Per-integration detail
- Connect flow: OAuth (where available) or API key
- Mapping settings (e.g., QuickBooks: which Flowtora field maps to which QB field)
- Sync settings (one-way or two-way; what entities sync; frequency)
- Activity log
- Disconnect button (with confirmation)

---

## Page T-18. Developer / API

- **Route:** `/settings/developer`
- **Access:** Pro+ plans
- **Tabs:** API keys · Webhooks · Logs · Docs

### API keys
- Create / view / rotate / revoke
- Scopes (read-only or scoped to entities)
- Per-key rate limit & usage stats

### Webhooks
- Endpoint URL + secret + events selection + retries config + recent deliveries log (last 100) with payload + signature + status + retry button

### Logs
- API call log (last 30 days): timestamp · endpoint · method · status · response time · IP · API key
- Search & filter

---

## Page T-19. Workspace settings

- **Route:** `/settings`
- **Tabs:** General · Branding · Locale · Documents · Notifications · Security · Custom fields · Workflow automation · Audit log · Data & privacy · Migrations · Domains · Plan & billing (link to B-9)

### General
- Workspace name, logo, tagline, industry, time zone, week start day, fiscal year start

### Branding
- Logo (light & dark variants)
- Primary + accent colors (Pro+)
- Default fonts (limited)
- PDF template selection (quote, invoice, work order — pick from gallery or upload custom HTML+CSS template)
- Email signature
- Storefront "Powered by Flowtora" toggle (locked on Starter)

### Locale
- Language · Currency · Number format · Date format · Time format · Tax inclusive/exclusive display

### Documents
- Quote/Invoice numbering scheme (prefix, padding, year-prefix, restart annually)
- Default validity (quotes)
- Default payment terms (invoices)
- Tax settings (default rates, multi-rate support)
- Standard terms templates per doc type

### Notifications
- Per-event notification preferences (in-app, email, SMS): quote accepted, quote declined, payment received, payment failed, new chat message, etc.
- Quiet hours
- Per-team-member overrides

### Security
- Require MFA for all members (Pro+)
- Session timeout (configurable)
- IP allowlist (Enterprise)
- SSO setup (Pro+; Page A-2c admin)
- Password policy (length, expiry, reuse)
- Device approval (require new device approval for admins)
- Login alert preferences

### Custom fields
- Add custom fields to: Customer, Quote, Job, Invoice, Product, Material
- Field types: text, number, currency, date, dropdown, multi-select, checkbox, URL, file
- Required / optional
- Visible in storefront (yes/no for customer fields)

### Workflow automation
- Workflow builder (Pro+): IF-THEN rules across entities
- Examples: "If job marked complete AND customer has paid → send review request email"
- Library of pre-built workflows

### Audit log (Page T-103)
- See own activity + team activity log
- Filters by user, entity, action, date
- Export

### Data & privacy
- Export workspace data (full export as ZIP — CSV/JSON for each entity + files)
- Delete workspace (Owner only; multi-step with type-to-confirm + 30-day grace period)
- GDPR data requests (customer-side: respond to data access/deletion requests from end-customers)

### Migrations
- Import wizards for: QuickBooks customer/invoice import, ShopVOX migration, Cyrious migration, generic CSV
- Step-by-step migration guide with progress tracking

### Domains
- Storefront custom domain setup (CNAME verification + auto-SSL via Let's Encrypt)
- Email send-from domain (SPF/DKIM verification)

---

## Page T-20. Profile (`/profile`)

- **Tabs:** General · Security · Notifications · API keys (personal)
- **General:** name, email, phone, avatar, role, time zone, language, theme, density
- **Security:** password change, MFA setup (TOTP/WebAuthn/SMS/backup codes), active sessions, login history
- **Notifications:** personal preferences (overrides workspace defaults)
- **API keys:** personal access tokens

---

## Page T-100. Notification center

- **Trigger:** bell icon in topbar
- **Layout:** Slide-over drawer (right, 400px)
- **Tabs:** All · Unread · Mentions · Mine
- **Per-notification:** icon + actor + verb + entity + time + click → entity
- **Bulk actions:** Mark all read · Snooze · Clear
- **Settings link:** opens Notifications preferences
- **Live updates:** WebSocket; toast for high-priority while in app

---

## Page T-101. Sessions & devices

- **Route:** `/profile/security/sessions`
- Lists active sessions: device, browser, IP, location, last active, current marker
- "Sign out" per session
- "Sign out everywhere" button

---

## Page T-102. Keyboard shortcuts (`/help/shortcuts`)

- Modal or page listing all shortcuts
- Categories: Global · Navigation · Tables · Editor
- Searchable
- "Customize" link (Pro+)

### Default shortcuts
- `?` — open shortcuts help
- `⌘K` — open command palette
- `G then D` — go to Dashboard
- `G then Q` — go to Quotes
- `G then C` — go to Customers
- `G then J` — go to Jobs
- `G then I` — go to Invoices
- `N` — new (opens new menu)
- `/` — focus search
- `T` — toggle theme
- `Esc` — close modals/drawers
- In tables: `J/K` — next/prev row · `Enter` — open · `X` — select · `Shift+X` — select range

---

## Page T-103. Workspace audit log

- **Route:** `/settings/audit`
- **Access:** Owner / Manager
- **Filters:** actor, entity, action, date range, severity
- **Columns:** Timestamp · Actor · Action · Entity · Changes (diff) · IP · Result
- **Click row:** detail drawer with full before/after JSON diff
- **Export:** CSV
- **Retention:** 30d Starter / 90d Growth / 1y Pro / 7y Enterprise

---

## Page T-104. Command palette

- **Trigger:** `⌘K` / `Ctrl+K`
- **Layout:** centered modal (640px wide, max-height 60vh)
- **Input:** search bar with placeholder "Search or jump to…"
- **Result categories (grouped):**
  - **Jump to** — pages, settings, entities
  - **Recent** — recently visited
  - **Customers** — type-ahead customer search
  - **Quotes / Jobs / Invoices** — type-ahead by # or title
  - **Actions** — "Create new quote", "Add customer", "Mark invoice paid"
  - **Help** — knowledge base articles
- **Keyboard nav:** arrow keys, enter, tab between categories
- **Recent searches** stored locally
- **No results:** offer "Search help docs for '{query}'"

---

## Page T-105. Help center (in-app)

- **Trigger:** ? icon in topbar
- **Layout:** Slide-over (right, 480px)
- **Sections:**
  - Search bar (Algolia)
  - "What's new" — recent changelog entries
  - Popular articles
  - "Get help" — Contact support form, live chat trigger
  - Tutorials (video library, Loom embeds)
  - "Submit feedback" — short form (category + body) → routes to admin feature requests / bug reports
  - "Refer a shop" — referral program link

---

## Page T-106. Mobile companion app

- **Platforms:** iOS + Android (React Native)
- **Auth:** uses same workspace credentials; biometric unlock
- **Optimized views:**
  - **Today** — jobs scheduled for today (operator focus)
  - **Quotes inbox** — incoming quote requests
  - **Customer lookup** — quick search + new customer
  - **Quick quote** — minimal form, photo attach
  - **Camera capture** — take photos of completed work, attach to job
  - **Time clock** — operator clock-in/out per job (replaces touches in some shops)
  - **Notifications**
  - **Sign for delivery** — customer signs on screen at delivery
- **Push notifications** for: new quote, quote accepted, payment received, customer message, job assigned, urgent alerts
- **Offline mode:** view cached data, queue actions to sync when online

---

# H1 — STOREFRONT (customer-facing surfaces)

The tenant's customer experience. Branded, simple, friction-free.

## Page S-1. Storefront home

(Defined per-tenant via Storefront Customizer Page T-12. Includes hero, featured products, about, reviews, contact.)

## Page S-2. Online ordering — product catalog

- **Layout:** category nav + product grid; each tile = product image + name + starting price + "Order" CTA
- **Search & filter:** by category, price range, attribute

## Page S-3. Product configurator (customer)

- Uses T-C-3 primitive
- Steps: Size → Material → Finishing → Quantity → Upload artwork → Review
- Right rail shows live price update
- File upload: drag-drop, virus scan, preview, AI proof preview (optional Pro+)

## Page S-4. Cart

- Multi-item cart
- Edit qty per item, remove, save for later
- Promo code input
- Estimated shipping (if applicable)
- "Continue to checkout" CTA

## Page S-5. Customer checkout

- Step 1: contact info (email, name, phone) — sign in option for returning customers
- Step 2: shipping address (if shipped) / pickup details
- Step 3: review + comments to shop
- Step 4: choose Pay now (Stripe checkout for instant orders) OR Request quote (creates pending quote in shop's workspace)
- Confirmation screen with order # + email confirmation

## Page S-6. Customer account portal

- Sign in / sign up
- Pages: My orders · Open quotes · Pending proofs · Files · Reorder · Account · Saved designs · Addresses · Payment methods (saved cards for repeat orders)

## Page S-7. Proof approval (customer-facing)

- URL: `proofs.flowtora.com/{token}` (or branded)
- Layout: full-screen viewer
- **Body:** large proof preview (zoom, pan, multi-page navigation)
- **Sidebar:** customer info, status, comments panel, version history
- **Actions:** Approve (with signature) · Request changes (text feedback + optional markup tool) · Download
- Mobile-friendly; signature pad on touch

## Page S-8. Customer-facing quote view

- See Page T-3 customer-facing quote view (defined above)

## Page S-9. Customer-facing invoice view & pay

- See Page T-9a customer-facing invoice view (defined above)

## Page S-10. Storefront SEO

- Each storefront has its own SEO settings (in Page T-12)
- Auto-sitemap per tenant
- Schema.org markup: LocalBusiness, Product, Review

---

# H1 — CROSS-CUTTING & GLOBAL CONCERNS

## Saved views & personalization

Mirrors admin pattern: every list page supports per-user saved views capturing filters, sort, columns, density, page size. Sharing: Private · Team · Workspace-wide. Default view per page in profile.

## Comments, @mentions, notes

Universal threaded comment primitive across Quotes, Jobs, Customers, Invoices. Rich text editor with @mentions (resolves to workspace members), reactions, threaded replies (1 level), edit history with diffs, internal-only flag (vs. customer-visible).

## Data export standards

All list pages support CSV / Excel / JSON / PDF export. Large exports run as background jobs; user receives email + in-app notification with signed URL (7-day expiry). PII-aware exports require reason + audit entry.

## Real-time behavior

- Dashboards: WebSocket-driven; live counters update without flicker
- Lists: new items insert with slide-down + fade
- Live indicators: small green pulsing dot on connected status; tooltip with last sync timestamp
- Reconnect: exponential backoff; banner during reconnect; flush queued invalidations

## Tiered confirmation patterns (mirrors admin)

- **Tier 1 (mild):** single modal — archive job, dismiss banner
- **Tier 2 (moderate):** checkbox ack — void invoice, refund, remove team member
- **Tier 3 (destructive):** type-to-confirm + reason — delete customer, delete workspace
- **Tier 4 (catastrophic):** Tier 3 + fresh MFA + cooldown + Owner-only — bulk delete data, transfer workspace ownership, terminate active subscription

## Audit trail

Every state-changing action emits a structured audit event. Streams to workspace audit log (Page T-103) and admin audit log. Schema: actor, action, resource, before, after, diff, result, IP, user_agent, request_id, signature (HMAC chain).

## Security defaults

- TLS 1.3 only · HSTS preload · CSP strict · CSRF tokens · rate limits per endpoint and actor · all secrets via KMS · server-side validation primary · step-up auth for sensitive actions (delete workspace, transfer ownership, reveal API key, change billing) · session binding to device + IP

## Theming & density

Light · Dark · System (default System) · High-contrast mode (AA+) · Density: Comfortable / Compact / Cozy. All theme tokens swap via CSS variables; SSR reads cookie to avoid flash.

## Internationalization

All strings extracted via `next-intl`. Numbers via Intl.NumberFormat. Currencies per workspace setting. Dates per user setting. ICU plurals. RTL-aware layouts using logical properties.

## Search architecture

- Algolia/Meilisearch primary; Postgres FTS fallback
- Per-resource indexes (customers, quotes, jobs, invoices, materials, files)
- Permission filters at query time (workspace scope + role)
- Synonyms per industry (e.g., shirt ⇄ tee, banner ⇄ flag, vinyl ⇄ wrap)
- Personal recency boost + click-through ranking

## API & webhook conventions

Same conventions as admin: `/v1/...`, deprecation headers, idempotency keys, cursor pagination, RFC 7807 errors with request_id. Public API docs at Page M-6h. Webhooks support events for every major entity (customer.created, quote.sent, quote.accepted, job.completed, invoice.paid, etc.).

## Performance budget

- Workspace LCP < 2.5s on first load · INP < 200ms · CLS < 0.05
- Routes split-loaded · prefetch on hover
- Background revalidation (SWR)
- Worker offload for large exports, JSON serialization, chart datasets > 10k points
- Image optimization: AVIF/WebP, responsive srcset, blur-up placeholders

## Observability

- Web vitals via PostHog + Sentry
- Per-route LCP dashboards
- OpenTelemetry tracing on server actions
- Slow-page alarms

## Onboarding the user themselves (first run)

After workspace onboarding wizard completes, on first dashboard visit:
- 5-step product tour:
  1. Welcome + role summary
  2. Sidebar tour
  3. Command palette demo (⌘K)
  4. Notification preferences quick-set
  5. Pin favorite pages
- Skip / dismiss persists; can re-launch from Help menu

## Empty states (philosophy)

Every list, dashboard widget, and section has a designed empty state with: illustration · h3 heading · body explaining context · primary CTA · "Learn more" link to help article. Tones: neutral (default), celebratory (first action complete), instructional (setup needed).

## Loading states

Skeletons for any data > 150ms perceived. Never full-page spinners. Inline spinners only on buttons during async actions.

## Error handling

All async operations have error boundaries. User-friendly error messages with action items ("Try again" / "Contact support") + request_id for support reference. Sentry captures all unhandled errors.

## Accessibility commitments

WCAG 2.2 AA across all surfaces. Tested with axe-core in CI, manual screen reader testing each release. Includes captions for video, transcripts for audio, alt text on all images.

---

## Glossary (used throughout this document)

- **Workspace** — a single tenant account (one print/sign shop business)
- **Owner** — the workspace administrator (top role; only one is the billing payer by default)
- **End-customer / Customer** — the shop's client (the people the shop sells to)
- **Quote** — pre-acceptance pricing document
- **Job** — production work derived from accepted quote
- **Work order** — internal production document for the floor
- **Proof** — design artifact sent to customer for approval
- **Invoice** — finalized billing document
- **Storefront** — the customer-facing online presence of a workspace
- **Equipment** — physical machine in the shop
- **Material** — consumable inventory used in production
- **Operator** — staff with production-floor role
- **Designer** — staff with design role
- **Catalog item** — sellable product/service template
- **Pricing formula** — configurable expression that computes a price
- **Touch** — a unit of recorded work effort against a job
- **Trial** — 14-day initial period; full Growth-plan access
- **Plan** — subscription tier (Starter, Growth, Pro, Enterprise)
- **Add-on** — paid extension to a plan (extra seat, extra location, premium support, etc.)

---

## Document status

- **Version:** 1.0.0 — Source of truth for Flowtora marketing site, authentication, billing, workspace, and storefront
- **Companion to:** Flowtora Admin Portal v1.0.0
- **Owner:** Flowtora Platform Engineering · Design · Product
- **Last updated:** Generated as the foundational architecture document for the tenant-facing surfaces
- **Next review:** After each major release; design tokens reviewed quarterly

