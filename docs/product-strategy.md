# Flowtora — Product Strategy & Premium Transformation Plan

**Input:** `docs/product-audit.md` (135 routes, 9 tenant roles, 3 platform roles).
**Lens:** Treat this like a $100/month production SaaS competing with Shopify, Stripe, and Linear. No generic advice.
**Author framing:** Founder-mode. Opinionated. Every recommendation is concrete.

---

## 1. System Overview

### 1.1 What Flowtora actually is (reconstructed)

Flowtora is a **sales-to-cash operating system for sign and print shops**. It replaces the stack that most small sign shops cobble together today: HubSpot (CRM) + QuickBooks (AR) + a whiteboard (production) + Dropbox (proofs) + text messages (install coordination). It is deeper than a CRM and wider than a job-board tool — a small shop can run their entire business inside one URL.

Concretely, the product is organized around five operational surfaces:

| Surface | Domain | Key objects |
|---|---|---|
| **Inbox** | Triage and communication | Notifications, Attention feed, Approvals, Messages (portal), Tasks |
| **Sell** | Pre-sale and proposal | Leads (pipeline), Customers, Quotes, Templates |
| **Produce** | Job execution | Orders, Proofs, Production board, Installs, Field mode |
| **Collect** | Cash capture | Invoices, Payments, Refunds, Credits, Write-offs |
| **Manage** | Catalog + finance + insight | Products, Packages, Vendors, Expenses, Reports |

Underneath that surface are three support systems: **Settings** (20+ pages of configuration), **Onboarding** (a 6-step wizard gated for owners/admins), and **Platform admin** (SaaS-staff tools for running the business of selling Flowtora itself).

### 1.2 Data flow (the spine)

```
Lead ───► Customer ───► Quote ─► Order ─► (Proof × n) ─► Production stages ─► Install ─► Invoice ─► Payment ─► Revenue reports
                │                          │                                                            │
                └──────► Tasks             └──────► Material usage + Defects + Time tracking             └──────► A/R aging
                │                          │                                                            │
                └──────► Portal access ────┴──────► Customer portal sees proofs, invoices, installs ────┘
```

Two **ambient data layers** cross-cut the spine:

1. **Identity & access** — NextAuth v5 JWT + `sessionVersion` revocation, 9 tenant roles with 37 permission slugs, multi-branch scoping (`membership.locationIds[]` + `applyBranchScope()`), platform-staff impersonation with synthetic ADMIN.
2. **Notifications & activity** — every mutation emits to `AuditLog` + per-user `Notification` + per-membership `notifPrefs`, with a central `/messages` inbox for portal-originated customer threads and a `/notifications` pane for in-app alerts.

### 1.3 Where the product is genuinely strong

- **Permission model is first-class.** ~290 server-side `requirePermission` calls, one authoritative enum, redirect-on-denial. This is better than most $100/mo SaaS tools. Do not touch.
- **Branch scoping is real.** `applyBranchScope()` on every list query, cross-view as an explicit permission. Multi-location shops can onboard without a custom build.
- **Token-based customer access is elegant.** Three models (`/portal`, `/q`, `/share`), all tenant-suspension-aware, all with a nice "expired" redirect. This is a competitive moat vs. competitors that force customers to create accounts.
- **Empty states are consistent.** Every list page has a first-run teaching card, a filtered-no-results state, and clear-filters. This is a polish signal.
- **Production board dwell-time colouring + READY badge** is smart. Shows operational intelligence most competitors skip.
- **2FA + session revocation + lockout** — security posture is enterprise-grade for a product this young.
- **Audit log exists and is queryable.** Most competitors in this market have nothing.

### 1.4 Where the product feels fragmented

- **Settings sprawl.** 20+ cards across 6 groups. Duplicated with onboarding. Duplicated within itself (tax/terms on `financial` + `workflow`).
- **Three "template" nouns.** Quote templates, checklist templates, message templates — three different lists under three different routes. The mental model never clicks.
- **Portal messages live in two places.** `/t/[slug]/messages` and Customer-detail Communication tab. Same rows. No signpost.
- **Order detail is a container for three workflows** (order status, production stage, install schedule) with no visual hierarchy. Users have to learn the object model to operate it.
- **The Dashboard has 8 personas but one shape.** Persona-swapped KPIs are good; but the frame is a grid of cards with no narrative — it shows data but doesn't tell a story.
- **No AI anywhere.** In 2026 this is conspicuous. Competitors using it even as a veneer will win migration battles.
- **Mobile is half-shipped.** `/installs/[id]/field` is mobile-first; the Production Board is unusable on phones; the Dashboard is desktop-assumed.
- **Bulk actions are missing everywhere.** No multi-select on Customers, Quotes, Orders, Invoices, Expenses. A shop with 400 open invoices cannot operate at scale.
- **CSV export is missing on staff list pages.** Reports have it, but the objects users actually want to export don't.

The product is about 75% of the way to "premium." The remaining 25% is the difference between "we'll consider it" and "we'll switch this quarter."

---

## 2. Major Problems (be honest)

### 2.1 Cognitive load problems (UX)

1. **Customer detail has 8 tabs.** Overview / Work / Contacts / Communication / Tasks / Files / Activity / Edit. That's a second navigation inside a detail page. Two of those (Activity + Communication) are near-duplicates. Contacts is three fields. Tasks is a micro-app. Collapse or re-shape.
2. **Settings hub has two visual forms** — grid + sidebar. Both show the same 20+ items. Discoverability is fine; the *number of items* is the problem.
3. **Settings fields are scattered by taxonomy instead of grouped by user intent.** If I want to set "what a new customer sees in their invoice," I have to visit Profile (logo) + Documents (footer) + Financial (tax + deposit) + Message Templates (send copy) + Workflow (proof flow). Five pages to set up one external experience.
4. **Order detail is a brick.** Line items + job specs + blockers + proofs + install + stages + material usage + defects + time tracking + tasks — on one page, only partially tabbed. PMs use it daily. This is the single highest-leverage page to redesign.
5. **Production Board on mobile is broken.** Swimlanes assume a 1400px viewport. Field users open it on phones and bounce.
6. **Search is three surfaces.** `/t/[slug]/search`, `/platform/search`, ⌘K command palette. Each scopes differently. Users don't know which to use.
7. **"Needs Attention" and "Notifications" are different concepts, co-located in the sidebar.** Attention = business objects past SLA. Notifications = events I should know about. Users don't distinguish.
8. **Pipeline "stage" is a dropdown, not drag-drop.** It looks like a filter. Users don't realise it's the action.
9. **Quote editor uses a mix of autosave and explicit-save.** Line-item edits save inline; pricing settings require Save. No indicator of which is which.
10. **Attention feed has nine categories on one page.** No grouping, no collapse, no snooze. It's a list of lists.

### 2.2 Redundancy problems

1. **Onboarding duplicates Settings.** Every onboarding step writes to the same fields that exist in Settings. Users who re-enter the product later will find two places to edit the same thing with no indication they are connected.
2. **Proof-requires-approval flag lives on both `settings/financial` and `settings/workflow`.**
3. **Tax & terms scattered across `settings/financial`, `settings/workflow`, and `onboarding/defaults`.**
4. **Numbering prefixes on `settings/numbering` + `onboarding/defaults`.**
5. **Portal messages surface is duplicated** (`/messages` + Customer Comm tab).
6. **Settings index vs. Settings sidebar — same cards, two layouts.**
7. **Three "templates" nouns** (quote / checklist / message) in three different routes.

### 2.3 Missing pages

From the audit:

- **No standalone staff Proof detail page.** Designers can't focus on a single proof conversation without opening the parent Order.
- **No Payments list page.** `/t/[slug]/payments` is KPIs + chase list, not a searchable ledger.
- **No Customer merge / dedupe tool.** Duplicate customers are inevitable.
- **No Product variants / SKU matrix.**
- **No Team member detail page.** Can't see "what has Sarah actually done this month?"
- **No Staff Support ticket view.** Users file tickets and then can't see their own thread.
- **No `/platform/notifications/[kind]` editor audit** (exists but unverified).
- **No Announcements feature** (stub only).
- **No Cost-of-goods / Job profitability page.** Shops need to know per-job margin and the product gestures at it (material usage, labor time) but never reports it.
- **No Crew schedule page.** Installs are listed per-event; there's no weekly crew-load view.
- **No Inventory page.** Material usage is logged but no stock management.
- **No PO / purchase order page.** Vendors are listed but POs aren't tracked.

### 2.4 Weak areas that will hurt adoption and retention

1. **Integrations page is "coming soon" for QuickBooks, Xero, Zapier, Slack.** This is a deal-breaker for shops evaluating. A shop with an existing QB file will not migrate to a tool that can't sync.
2. **No iCal export for installs.** Installers and subcontractors can't subscribe from their phone calendar.
3. **No photo upload in field mode's offline state.** Lose signal on site → lose photos.
4. **No proof markup tool.** Customers reply "the R is crooked" in plain text. Competitors ship annotation.
5. **No PDF rendering** for invoices or quotes in-product (users rely on browser print).
6. **No templated quote-follow-up sequences.** A quote going stale just sits there with an "expiring soon" badge.
7. **200-row caps on platform list pages.** Will break once the product scales past a few hundred tenants.
8. **No invoice "pay with card" conversion funnel.** The portal has a pay form but the marketing to customers (embedded video, "90% of shops collect 3x faster with one-click" microcopy) isn't there.
9. **Dashboard is data, not guidance.** It answers "what are my numbers" but not "what should I do today."
10. **Attention feed is triage, not a to-do.** You can click in but not bulk-dismiss.

### 2.5 MVP-ish / unfinished

- `/platform/announcements` — explicit stub.
- Franchise child attachment — manual support process only.
- QR code for TOTP — otpauth URI only.
- Avatar upload — URL field only.
- Home-page testimonial still labelled "Placeholder Name."
- Timezone fields on Locations are free text.
- Pipeline drag-drop missing.
- Bulk actions missing everywhere.
- CSV export missing on staff list pages.
- Attention, Approvals, Notifications, Messages — four separate Inbox-like pages. Pick a model.

---

## 3. Feature Gap Analysis

### 3.1 CRM (Sell surface)

**Missing for 2026 standards:**

- **Customer merge / dedupe.** With duplicate detection on email + phone fuzzy match.
- **Custom fields per tenant** (industry, referral source, custom tags beyond the free-text system).
- **Contact-level activity.** Today all interactions live on Customer. Real CRMs track per-contact (e.g., last call with John vs. with Mary at the same company).
- **Email sync (send/receive through Gmail/Outlook).** Today emails must be logged manually.
- **LinkedIn / website enrichment.** One-click fetch company size, logo, address from domain.
- **Deal-level forecasting.** Est. value × close prob. × time-decay, rolled up into a weighted pipeline number and trended.
- **Lost-reason analytics.** Enum exists; dashboard doesn't use it.
- **Sequences / drip campaigns.** Auto follow-up on cold leads and unread quotes.
- **Referral tracking.** Customer → how they came in → lifetime value.

**High-impact to ship:**

- **"Draft a quote from this email thread"** — AI button on the customer Communication tab that reads the thread and proposes a quote with line items.
- **Quote view-through analytics.** "Customer opened this quote 4 times, spent 3 minutes on the Pricing section." Close rate goes up.
- **Auto-reminder sequences** on SENT quotes: +3d, +7d, +14d, expire.

### 3.2 Quotes & Pricing

**Missing:**

- **Interactive quote builder with drag-drop sections and line items.** Today it's form-submit.
- **Option-builder pricing** (customer can toggle options in the portal and the total recalculates).
- **Tiered packages with "Good / Better / Best"** presented side-by-side in the customer share view.
- **E-signature on the quote share page.** (Currently: Approve/Decline button; not a legal signature.)
- **Deposit collection at approval.** Approve flow should optionally trigger a Stripe deposit payment in the same session.
- **Margin guardrails.** If line-item margin drops below threshold, warn the rep before send.
- **Quote analytics.** Views, time-on-page, declines vs. abandoned.
- **Quote revisions diff.** Today revise creates a new version; there's no visual "what changed" for the customer.

**High-impact:**

- **AI quote drafting from uploaded images / scopes.** Upload a customer's rough site photo + the work description → AI proposes sections, materials, hours, and price using the shop's own product catalog.
- **Pricing rules engine.** Discount rules, volume breaks, customer-class pricing, rush surcharges — stored as rules, not free-text fields.

### 3.3 Production Workflow

**Missing:**

- **Gantt / timeline view** for stage dependencies per job.
- **Drag-drop stage reorder.** Today form-only.
- **Bill-of-materials auto-capture from the quote.** When a quote line item ties to a product, the order auto-generates the BOM; today BOM is manually logged via material usage.
- **Material stock tracking.** Track on-hand per material, decrement on use, reorder alerts.
- **Labor-rate costing.** Time tracking exists per stage but no roll-up into labor cost per order.
- **Job profitability panel.** The product has all the data (quote revenue, material cost from expenses linked to orders, labor time × labor rate, install cost) — a profitability widget is one join away.
- **Capacity planning.** Weekly shop load (total hours scheduled vs. available per department).
- **Shop-floor touch UI.** A dedicated large-touch view for a table tablet on the shop floor: one job per row, one-tap Start / Done / Block.
- **Printer / cutter queue integration.** Today production is manual status; integration with Onyx, Caldera, Summa, Roland opens a real moat.

**High-impact:**

- **Defect photo → AI classification and root-cause suggestion.** "This looks like moisture under lamination; recommend adjusting laminator rollers." Adds material intelligence.
- **Printable shop-floor job ticket PDF** generated from the order with QR code → click → order detail.

### 3.4 Financial / AR / Reporting

**Missing:**

- **Payments list** (separate from Invoices list) — search, filter, export by method, processor, date.
- **Dunning / automated reminder sequences.** Today "Send reminder" is one button; shops need auto-chains (d+7, d+14, d+30, d+60).
- **Promise-to-pay.** Let a customer mark "I'll pay by Friday"; reminder pauses until then.
- **ACH / bank-transfer collection.** Stripe exists; pull Plaid for ACH to avoid card fees on big invoices.
- **Recurring invoices / subscription billing** (for clients on maintenance plans — real need for shops that service digital menu boards).
- **Deposit / retainer ledger.** Track unapplied customer credits across quotes and invoices.
- **Multi-currency.** Today hardcoded 5 currencies, one per tenant — a shop with cross-border B2B customers can't operate.
- **P&L view.** Revenue - COGS - Expenses - Labor = profit, per month per branch.
- **Cash-flow forecast.** Given sent invoices, expected payment dates, scheduled expenses — predict cash on hand next 30/60/90.
- **QuickBooks / Xero two-way sync.** Stub today; ship real bi-directional.

**High-impact:**

- **"Expected cash this week"** widget on dashboard. Shops run paycheck-to-paycheck on receivables; knowing next Friday's cash is the highest-leverage number in the business.
- **Auto-reconciliation of bank imports** against invoices (Plaid transaction match).

### 3.5 Customer Portal Experience

**Missing:**

- **Branded / white-label portal** per tenant (custom subdomain: `acmesigns.flowtora.com` or full CNAME to `portal.acmesigns.com`).
- **Proof markup tool** (annotate the proof image with arrows, text, color picker).
- **Approve with e-signature.**
- **Customer can self-schedule install** from suggested windows.
- **Customer can upload reference files** without staff help.
- **Notifications settings for customers** (today they can reply, but can't say "don't email me about proof version 7").
- **Multi-contact portal.** Today the portal is per-customer token. A commercial customer has a procurement contact, a design contact, and an AP contact — each needs their own view.
- **Mobile-optimised portal.** Audit doesn't call it out but the portal was built desktop-first.

**High-impact:**

- **Shopify-level first impression.** Portal landing today is lists. Redesign as a "Your projects with Acme Signs" dashboard with job cards, photo strip, countdown to install, big "Pay balance" CTA.
- **In-portal chat widget.** Less email, more thread.

### 3.6 Collaboration

**Missing:**

- **Real-time presence.** "Mike is editing this quote right now."
- **@mentions** in comments (exists in partial form? — audit not explicit).
- **Live updates** on shared views (Production Board should live-refresh when a coworker starts a stage).
- **Internal notes vs. customer-visible notes.** Audit implies they're conflated.
- **Approval delegation.** When I'm OOO, my approvals auto-route to my manager.
- **Shared inbox assignment.** Route portal messages to a specific rep.

**High-impact:**

- **@mention in any comment thread** → drops into the recipient's Notifications.
- **"Following" model on any object.** Watch a customer / order / quote for updates without owning it.

### 3.7 Revenue / retention high-impact bets

Sorted by expected lift:

| Feature | Expected impact |
|---|---|
| AI quote drafting from customer email | +20% win rate on incoming leads (faster response = closed deal) |
| Online payment (ACH + card) with saved payment methods | +15% A/R collected same week |
| Automated dunning sequences | -30% days-sales-outstanding |
| Real QuickBooks / Xero sync | Unblocks 40% of prospects who bounce on "not compatible with QB" |
| Branded customer portal | Boosts perceived value — supports a higher price tier |
| Proof markup tool | Cuts proof-iteration time 50%; customers love it |
| Cash-flow forecast widget | Becomes the "daily-open app" — retention lock |
| Shop-floor tablet UI | Adoption by non-admin production staff — the seat-count multiplier |
| Inventory / stock | New $$ reason to stay; opens Materials add-on tier |
| Deposit-at-quote-approval | +25% deposit capture; changes cash profile of the shop |

---

## 4. UX Redesign Plan

### 4.1 Navigation — collapse 5 sections to a cleaner primary IA

**Today** the sidebar is five sections (Inbox / Sell / Produce / Collect / Manage) with 20+ settings items in a sub-area.

**Proposed:** A two-tier IA — a thin primary rail + contextual sub-nav.

```
Primary rail (left, 56px icons):
┌──────┐
│ 🏠   │  Home          (Dashboard — renamed)
│ 📥   │  Inbox         (merges Attention + Notifications + Messages + Approvals + Tasks)
│ 👥   │  Customers     (list + pipeline as a view toggle)
│ 📝   │  Quotes
│ 📦   │  Orders        (orders + production board as a view toggle)
│ 🔧   │  Installs      (calendar + crew + field)
│ 💳   │  Billing       (invoices + payments as a view toggle)
│ 📊   │  Reports
│ 🛒   │  Catalog       (products + packages + vendors + expenses)
│      │
│ ⚙️   │  Settings      (bottom-pinned)
│ 👤   │  Profile menu
└──────┘
```

This cuts the top-level from **~25 labels** to **9**. The view-toggle pattern (List ↔ Pipeline, List ↔ Board) eliminates redundant routes.

**Rationale:**

- Work surfaces (Sell/Produce/Collect) are less meaningful than the object type. Users don't think "I'm in Collect mode"; they think "I need to send an invoice."
- Merging Attention + Notifications + Messages + Approvals + Tasks into a single Inbox (with filter chips) is the single biggest cognitive-load win. Gmail proved this.
- Catalog consolidates static back-office data (products / vendors / expenses).

### 4.2 The Inbox (the hero of this redesign)

One Inbox. Four chip filters at the top:

**Chips:** `All` · `Attention` · `Messages` · `Approvals`

**Sub-chips (second row, contextual to the first):**

- Attention: `Quotes` · `Proofs` · `Invoices` · `Orders` · `Installs` · `Tasks`
- Messages: `Unread` · `All` · `Archived`
- Approvals: `Mine to decide` · `My requests` · `Decided`

**Layout:** Gmail-style split pane (already shipped for `/messages` — extend to the whole Inbox).

**Keyboard:** `j/k` navigate, `e` archive, `r` reply, `a` approve, `x` snooze, `⌘K` command palette.

**One-line "you're clear" state** at the top: "3 things need attention · 2 waiting on you · 5 unread" — click through to scoped view.

**Kill:** Separate `/attention`, `/notifications`, `/approvals`, `/messages`, `/tasks` pages collapse into one. Keep the routes as query-string filters so existing links don't 404.

### 4.3 Customer page redesign

**Today:** 8 tabs (Overview, Work, Contacts, Communication, Tasks, Files, Activity, Edit).

**Proposed:** One scrollable page with intelligent sectioning. Notion / Linear style.

```
┌──────────────────────────────────────────────────────────────────┐
│ Acme Signs                    [edit] [portal] [new quote ▾]       │
│ COMMERCIAL · 👤 Sarah · $48k est · PROSPECT · healthy              │
├──────────────────────────────────────────────────────────────────┤
│ Health score 82 · Last touched 3d ago · Next action: follow up    │
├──────────────┬───────────────────────────────────────────────────┤
│ Contact      │ 2 quotes open · 1 order in production · $12k AR    │
│ 403 Main St  │ ┌──────────────────────────────────────────────┐  │
│ 555-123-4567 │ │ Activity stream (inline, mixed types)        │  │
│ acme.com     │ │ · Sarah logged a call 2h ago                 │  │
│              │ │ · Customer replied in portal 5h ago          │  │
│ Contacts (3) │ │ · Quote #Q-0189 marked APPROVED yesterday    │  │
│ ┌──────────┐ │ │ · ...                                        │  │
│ │ John Doe │ │ └──────────────────────────────────────────────┘  │
│ │ Mary ... │ │                                                   │
│ └──────────┘ │ [Reply to thread] [Log a call] [New task]         │
│              │                                                   │
│ Files (8)    │                                                   │
│ Tags         │                                                   │
│ Addresses    │                                                   │
└──────────────┴───────────────────────────────────────────────────┘
```

- **Left rail: facts.** Contact info, contacts, addresses, tags, files — collapsible cards. Stable.
- **Center: story.** One blended timeline (comments + interactions + portal messages + system events) with a quick-compose at top. Like a Stripe customer page.
- **Top row: status.** Lead stage + health + owner + next action — single truth.
- **No tabs.** Everything is scrollable and anchor-linkable (`/customers/[id]#activity`).

**Kill:**

- Separate Communication tab (merged into center timeline).
- Separate Activity tab (merged).
- Separate Timeline page (`/customers/[id]/timeline`) — redirect to `#activity`.
- Separate Edit page — inline-edit the left rail cards.

**Outcome:** From 8 clicks to find something → 1 scroll.

### 4.4 Order page redesign

Today the Order is the center of gravity for production + invoicing + install + proofs. It's the hardest page in the product.

**Proposed:** A "job operating room" layout.

```
┌──────────────────────────────────────────────────────────────────┐
│ Order #ORD-0047 · Acme Signs · Due Fri Apr 28 · PRIORITY          │
│ [STATUS: IN PRODUCTION]  40% complete ████▓▓▓▓▓▓                  │
│ Progress: Design ✓ · Print ●●○ · Cut ○ · Laminate ○ · Install     │
├──────────────────────────────────────────────────────────────────┤
│                                                                  │
│  MAIN PANE (tabs, but only 3):                                   │
│  [ Work ] [ Money ] [ Conversation ]                             │
│                                                                  │
│  Work tab = line items · proofs · production stages · installs   │
│             (stacked cards, collapsible, draggable order)        │
│                                                                  │
│  Money tab = deposit · invoices · payments · profitability       │
│                                                                  │
│  Conversation tab = blended customer + internal thread           │
│                                                                  │
├──────────────────────────────────────────────────────────────────┤
│ RIGHT RAIL: Status transitions, assignees, due date, priority,    │
│ blockers, tags, files, activity feed.                            │
└──────────────────────────────────────────────────────────────────┘
```

- **Progress bar** in the header is the most important UX addition. Today the order status is a badge; the stage progression is buried. Surface it as a big visual (Shopify-style).
- **Work tab** is 80% of what users do. Collapsible cards for line items, proofs, stages, installs, in that order. Each card has inline actions.
- **Money tab** consolidates invoicing.
- **Conversation tab** merges internal comments + portal messages + email events.
- **Right rail** has the metadata that doesn't change per tab.

**Kill:**

- Separate "Overview" and "Production" and "Invoicing" and "Comments" and "Activity" tabs. 5 → 3.
- Reopen / skip / pause buttons inline on each stage card, not in a fly-out menu.

### 4.5 Quote builder redesign (the money page)

Today: tabs for Details / Pricing / Notes / Sharing / Activity.

**Proposed:** Single-page editor, autosave, live preview.

```
┌──────────────────────────────────────────────────────────────────┐
│ ← Q-0234 · DRAFT · Autosaved 2s ago                    [Send ▾]  │
├──────────────────────────────────────────────┬───────────────────┤
│ Customer: [Acme Signs ▾]  Owner: [Sarah ▾]   │                   │
│ Expires: [May 15]         Terms: [Net 30 ▾]  │  LIVE PREVIEW     │
│                                              │  (customer view)  │
│ + Section                                    │  ┌─────────────┐  │
│ ▼ Installation                               │  │             │  │
│   • 3× aluminum panel 24×36    $ 840  [--]   │  │  Quote for  │  │
│   • 1× vinyl overlay           $ 220  [--]   │  │  Acme Signs │  │
│   + Add line                                 │  │             │  │
│                                              │  │  ...        │  │
│ ▼ Hardware                                   │  │             │  │
│   ...                                        │  │             │  │
│                                              │  └─────────────┘  │
│ Subtotal           $ 1,060                   │                   │
│ Discount   [10%]    -$ 106                   │                   │
│ Tax         [8.5%]  +$ 81                    │                   │
│ ─────────────────────────────                │                   │
│ Total              $ 1,035                   │                   │
│ Deposit req. [30%]  $ 311                    │                   │
│                                              │                   │
│ Internal notes ▾                             │                   │
│ Customer notes ▾                             │                   │
└──────────────────────────────────────────────┴───────────────────┘
```

- **One page.** Like Linear's issue page. Like Stripe's invoice editor. Tabs disappear.
- **Live preview pane** on the right shows the customer-facing rendered view. Eliminates the "Sharing tab" — sharing is a button in the header.
- **Drag-drop sections and line items** (vertical). Today the product relies on form buttons.
- **Autosave** with timestamp. Eliminates "mix of autosave and explicit save."
- **Inline commands** for discount / tax / rush fee / deposit — no separate Pricing tab.
- **Activity** and **template save** are buttons in a header dropdown, not tabs.

### 4.6 Install workflow redesign

Today the install has a calendar + detail + field mode. Field mode is the strong one.

**Proposed rethink:**

- **Calendar as the hero.** Today it's a week grid. Add month view, drag-drop reschedule, colour-per-crew.
- **Replace detail page with side panel.** Clicking a calendar event opens a right-side drawer (no navigation). Full detail is still one click away as "Open full page."
- **Split detail into tabs** (from audit recommendation): `Details` · `Site` · `Photos` · `Comms`. Today it's one long scroll of 12 sections.
- **Field mode stays mobile-first** but becomes a PWA installable from the install detail page ("Install on phone") with offline photo queue + site-survey forms.
- **New: Crew schedule view** — week calendar grouped by installer, showing load. PMs assign drag-drop.
- **New: Route map** — view today's installs on a map, with "optimise route" button.

### 4.7 Install detail — specific cleanup

From audit: "~12 sections stacked linearly on left column." Split:

| Tab | Contents |
|---|---|
| **Details** | Event info, logistics, readiness checks, status transitions |
| **Site** | Address, site survey, checklist |
| **Photos** | BEFORE / DURING / AFTER / ISSUE / SURVEY galleries |
| **Comms** | Signatures, wrap-up, send-update form, comments |

Each tab is short enough to grok. Status transitions stay in the top header, not in a tab.

### 4.8 Feel & motion

Across every redesigned page, three design commitments:

1. **Speed budget ≤ 200ms for perceived interactions.** Optimistic UI on every mutation (we have React). The backend catches up.
2. **No modal for anything reversible.** Inline edits, inline confirms, inline "undo" toast.
3. **One primary colour per page.** Today the product uses many status chips (green/amber/red/blue/violet). Restrict to one accent per page surface — Customers green, Orders amber, Invoices blue — so users know *where* they are by glance.

---

## 5. Dashboard Redesign

### 5.1 The problem with today's Dashboard

- 8 personas, same grid-of-cards shape.
- No narrative — you see KPIs but not "what should I do."
- Activation widget is the only storytelling; it auto-hides.
- No sparklines, no trends, no weekly pacing.

### 5.2 Proposed Dashboard layout (Stripe-class)

```
┌─────────────────────────────────────────────────────────────────────────┐
│ Good morning, Sarah. Here's Acme Signs today.   [All branches ▾] [7d ▾] │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  REVENUE            PROFIT             OPEN A/R         NEXT 7D CASH    │
│  $ 42,300 ↑8%       $ 14,120 ↑3%       $ 28,500         $ 18,200 ▼      │
│  ██▂▃▅▇▆▅▇ 7d       40% margin         18 invoices      5 expected pays │
│                                                                         │
├─────────────────────────────────────────────────────────────────────────┤
│  NEEDS YOUR ATTENTION  (top of fold — the hero widget)                  │
│  ┌───────────────────────────────────────────────────────────────────┐  │
│  │ 🔴 Invoice #INV-0123 · Acme · $2,400 · 45 days overdue  [remind]  │  │
│  │ 🟡 Proof #P-0088 · Delta Mfg · awaiting response 4d    [nudge]    │  │
│  │ 🟡 Quote #Q-0221 · $8k · expires tomorrow              [extend]   │  │
│  │ 🔵 Install tomorrow · 3 crew unconfirmed               [assign]   │  │
│  │ +6 more                                                           │  │
│  └───────────────────────────────────────────────────────────────────┘  │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  REVENUE TREND                        PIPELINE                          │
│  ┌───────────────────────────┐        $ 134k weighted                   │
│  │                           │        ┌──┬──┬──┬──┬──┬──┬──┐            │
│  │    █████   ██████         │        │S │P │Q │N │Pr│W │L │            │
│  │   ███████████████████     │        │20│15│8 │4 │3 │5 │2 │            │
│  │  ██████████████████████   │        └──┴──┴──┴──┴──┴──┴──┘            │
│  └───────────────────────────┘        Conv rate 38% (Q→W)               │
│                                                                         │
│  PRODUCTION LOAD (this week)          TOP SERVICES (30d)                │
│  ██████████ 82% booked                Banners          $ 18k            │
│  Print: 110h of 120h                  Channel letters  $ 14k            │
│  Install: 34h of 80h                  Vehicle wraps    $ 11k            │
│                                                                         │
├─────────────────────────────────────────────────────────────────────────┤
│  QUICK ACTIONS               RECENT ACTIVITY                            │
│  [New quote] [New order]     · Mike completed INSTALL #I-0045           │
│  [Record payment]            · Sarah sent Q-0225                        │
│  [Add customer]              · Jen paid $4,200 on INV-0119              │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### 5.3 Top metrics (hero band, 4 cards)

1. **Revenue** — today / week / month toggle, sparkline, WoW delta.
2. **Profit** — margin %, vs last period.
3. **Open A/R** — total + invoice count, flash red if overdue% > 30.
4. **Next 7 days expected cash** — the killer widget. Sum of invoices with due-date in window, weighted by historical on-time-payment rate. This is the *single* number a shop owner cares about.

### 5.4 Graphs

- **Revenue trend** — stacked bar (paid / outstanding / overdue), 90-day default.
- **Pipeline funnel** — 7-stage funnel with counts and $ value, click to filter.
- **Production load** — horizontal bar per department, capacity vs. booked hours this week.
- **Top services** — list with $ revenue + unit count + margin.
- **(Role-dependent)** Install calendar preview, Designer's proofs awaiting, etc.

### 5.5 Widgets

- **Needs Attention** — moves from `/attention` to the hero widget on the dashboard. Scrollable list, 10 default, `[View all]` link.
- **Recent activity** — 8 items, same as today.
- **Quick actions** — 4 buttons max, persona-aware (today's pattern, keep).
- **Activation widget** — collapsible, hideable, keeps teaching gamification during first 30 days (today's pattern, keep).

### 5.6 Hierarchy & feel

- **Above the fold is story.** Greeting + 4 metric cards + Needs Attention. That's all most owners scroll to.
- **Below is context.** Trends and load — used for planning, not daily ops.
- **Footer is doing.** Quick actions + activity — for starting new work.

**Feel:** Stripe overview page (big numbers + small sparklines + simple graphs). Shopify home ("here's what you need to do today"). Linear ("get to work fast").

### 5.7 Persona variance

Keep the 8-persona pattern but swap only the **Attention widget content** and **Quick actions**. Do NOT swap the entire page shape — that's why today's dashboard feels fragmented. The frame is constant, the content is role-contextual.

---

## 6. New Page Structure

### 6.1 Top-level (9 entries, down from ~25)

```
🏠 Home
📥 Inbox              (merged: Attention + Notifications + Messages + Approvals + Tasks)
👥 Customers          (list + pipeline view toggle; customer detail no tabs)
📝 Quotes             (list; new single-page editor)
📦 Orders             (list + board view toggle; 3-tab order detail)
🔧 Installs           (calendar + crew + field)
💳 Billing            (invoices + payments + refunds + credits view toggle)
📊 Reports
🛒 Catalog            (products + packages + vendors + expenses)

⚙️ Settings           (collapsed to 6 tabs, see below)
```

### 6.2 Settings — collapse 20+ cards to 6 tabs

```
Settings
├── Profile & branding   (merges: profile + documents + numbering — "what customers see")
├── Money                (merges: financial + workflow + billing — "how we charge")
├── Workflow             (merges: automation + production + templates/checklists + message-templates — "how we run jobs")
├── Team                 (merges: team + locations + notifications-defaults + invites)
├── Me                   (me + security + notifications — personal)
└── Advanced             (integrations + franchise + audit-log + sample-data + danger — rarely touched)
```

**Rules:**

- Each tab has a left sidebar of sub-sections and a right content pane. Linear style.
- Deep-link to sub-sections (`/settings/money#tax`).
- Hide Advanced unless scrolled to or searched.

### 6.3 Pages to merge

| Today | Proposed | Why |
|---|---|---|
| `/attention` + `/notifications` + `/messages` + `/approvals` + `/tasks` | `/inbox` (with chips) | Five flavours of the same thing |
| `/customers/[id]/timeline` + Overview's Activity tab + Communication tab | Single scrollable customer page | Duplicate data |
| `/settings/financial` + `/settings/workflow` (proof flag) | `/settings/money` | Duplicate toggle |
| `/settings/profile` + `/settings/documents` + `/settings/numbering` | `/settings/profile-branding` | One "customer-facing identity" surface |
| `/onboarding/branding` vs `/settings/profile` | Onboarding writes into Settings, then *sends the user to Settings with highlights* | No more duplicate forms |
| Orders / Production board | `/orders?view=board` | Same data, view toggle |
| Customers / Leads pipeline | `/customers?view=pipeline` | Same data, view toggle |
| Invoices / Payments / Refunds / Credits | `/billing` with tabs | Same object graph |
| `/quotes/templates` + `/settings/templates` + `/settings/message-templates` | `/settings/workflow` → Templates sub-section (3 kinds in one place) | "Templates" should be a single mental model |

### 6.4 Pages to add

| New route | Purpose |
|---|---|
| `/t/[slug]/proofs/[id]` | Dedicated proof detail for designers |
| `/t/[slug]/billing/payments` | Payments ledger (list + filter + export) |
| `/t/[slug]/customers/[id]/merge` | Dedupe/merge flow |
| `/t/[slug]/products/[id]/variants` | SKU variants matrix |
| `/t/[slug]/team/[membershipId]` | Team-member profile with their work |
| `/t/[slug]/support/[id]` | Staff sees their own submitted tickets |
| `/t/[slug]/orders/[id]/profitability` | Per-job P&L |
| `/t/[slug]/installs/crew` | Crew week view |
| `/t/[slug]/inventory` | Stock tracking (new module) |
| `/t/[slug]/purchase-orders` | PO management (new module) |
| `/t/[slug]/forecast` | Cash-flow + capacity forecast |
| `/t/[slug]/ai` | AI co-pilot ("ask Flowtora") |

### 6.5 Pages to remove / collapse

- `/t/[slug]/settings/numbering` — merge fields into Profile & branding.
- `/t/[slug]/settings/documents` — merge into Profile & branding.
- `/t/[slug]/settings/workflow` — merge into Money and Workflow tabs.
- `/t/[slug]/customers/[id]/timeline` — redirect to customer detail #activity.
- `/t/[slug]/customers/[id]/edit` — inline editing on customer detail.
- `/platform/announcements` — ship or cut.
- `CUSTOMER_PORTAL` enum — remove from TenantRole; it's dead code.

---

## 7. Simplification Strategy

### 7.1 What to REMOVE

1. The `CUSTOMER_PORTAL` enum value — never assigned.
2. The onboarding pages that duplicate settings — *rewrite as inline cards that land in Settings* (see §7.3).
3. `/customers/[id]/timeline` as a separate route — anchor on the detail page.
4. `/customers/[id]/edit` as a separate page — inline edit.
5. The "Settings index card grid" — keep only the sidebar.
6. `/platform/announcements` — build or delete.
7. "Coming soon" integration rows (QuickBooks / Xero / Zapier / Slack) — hide until they ship, or ship them.
8. Free-text timezone on Locations — replace with a select.
9. Hardcoded currency list (5 options) — expand to ISO 4217 full.
10. The second "Settings" surface in `/settings` (cards) — redirect to the sidebar layout.

### 7.2 What to MERGE

1. All five Inbox-like pages → `/inbox`.
2. Customer detail's 8 tabs → single scroll + left rail.
3. Order detail's 5 tabs → 3 tabs (Work / Money / Conversation).
4. Settings' 20+ cards → 6 tabs.
5. Orders + Production board → view toggle.
6. Customers + Leads → view toggle.
7. Invoices + Payments + Refunds + Credits → Billing with tabs.
8. Three "templates" routes → one Templates section inside Settings / Workflow.

### 7.3 What to AUTOMATE

1. **Onboarding writes into Settings.** Instead of a 6-step wizard that duplicates fields, make the onboarding a thin overlay that deep-links into the same Settings tabs with contextual highlights: "Let's set your logo → [open Settings → Profile]." One source of truth.
2. **Numbering prefixes** auto-propose from the business name ("ACS-0001") on first save.
3. **Tax rate** auto-suggests from billing address ZIP via tax service.
4. **Deposit %** defaults based on industry norm by business type (configured in Platform Settings).
5. **"Proof requires approval"** auto-enables when the first proof is uploaded, with a one-time prompt.
6. **Invoice follow-ups** (d+7 / d+14 / d+30) schedule themselves on invoice send.
7. **Stale quote nudges** auto-send at configured intervals (3/7/14 days).
8. **Production READY badge** → auto-start when upstream stages complete and assignee is on shift.
9. **Commercial lead enrichment.** On customer create with a domain, fetch logo, employee count, address via Clearbit-style service.
10. **Expense auto-categorisation** from OCR + vendor name match.
11. **Material auto-log from quote line items** on order create. Stop asking the shop to log BOM manually.
12. **Portal token auto-issue** on first customer save. Default-on, revocable.

### 7.4 What to HIDE until needed

1. **Advanced settings** (integrations / franchise / audit log / sample data / danger) collapse under a single Advanced tab that requires a click.
2. **Reports sub-dashboards** — show the hub; sub-reports open in modal or lazy-load.
3. **Platform admin screens** are already correctly hidden behind role — verify no leakage.
4. **Approval thresholds & exception rules** — show only when a decision is about to be needed, not on every quote edit.
5. **Bulk actions UI** — don't show the "Select" checkbox column until a user selects a row (hover to reveal checkbox).
6. **Franchise group sharing** — hide the setting until a tenant is on Enterprise. Today it's gated but visible; make it invisible.
7. **Unused persona dashboards** — if a user has never acted as the Installer role, don't keep rendering the Installer widgets (feature flag by role usage).
8. **Search surfaces** — hide `/platform/search` and `/t/[slug]/search` links; elevate ⌘K as the single search UX.

### 7.5 Fewer clicks, more keyboard

Adopt Linear-level keyboard coverage:

- `⌘K` — command palette (create quote, jump to customer, assign task).
- `C` — create, context-aware (`C` on /customers → new customer, `C` on /orders → new order).
- `G then Q` — go to quotes.
- `N` / `P` — next / prev record in list detail.
- `E` — edit current record inline.
- `?` — show shortcut overlay.

---

## 8. 10X Product Strategy — Becoming the Best Sign-Shop Software in the Industry

### 8.1 The strategic thesis

Most competitors (Shop-VOX, Cyrious, CoreBridge, signtracker, PrintIQ) are **20-year-old desktop-era products with web skins**. They're deeply featured but feel like filing cabinets. The opening is to be the **Linear / Stripe / Shopify of the sign trade**: fast, opinionated, AI-native, delightful.

Three durable moats:

1. **Best-in-class customer portal** (branded, mobile, signable). Customers experience Flowtora before the shop does.
2. **AI throughout the workflow** (not bolted on). Quoting, proofing, scheduling, dunning.
3. **Shop-floor UX for non-admins.** Tablets on the floor, phones in the field, simple 1-tap interactions.

### 8.2 Competitive advantages to build

#### A. AI co-pilot (a real one — not a chatbot)

Ship an AI layer named **"Flow"** or similar. Not a separate product. Integrated into every page.

- **Quote Flow:** "Draft a quote from this email" — reads the customer thread + any attached brief + site photo, proposes line items using the shop's product catalog, estimates materials and hours, applies margin guardrails, shows a diff before the rep hits Send.
- **Reply Flow:** In the Inbox, "Suggest reply" on portal messages. Uses tone from the shop's past messages.
- **Scope Flow:** Upload an artwork file or site photo → AI extracts dimensions, material suggestions, labor estimate.
- **Price Flow:** "Why is this quote 15% below margin?" Explains contribution by line item.
- **Proof Flow:** Customer replies "make the logo bigger" — AI generates three variants automatically.
- **Schedule Flow:** "What's the best day this week to schedule Acme install?" Balances crew availability + drive time + weather forecast.
- **Dunning Flow:** "Write a friendly reminder for this 45-day-overdue invoice." Adapts tone by customer history.
- **Defect Flow:** Upload a defect photo → AI proposes root cause + fix.
- **Revenue Flow:** Daily summary email to the owner: "Yesterday: $X booked, $Y collected, $Z at risk. Today focus on ..."

AI usage metered per plan. Enterprise gets agentic workflows (unattended dunning, proof generation).

#### B. Branded customer portal

White-label tier on Pro plan ($149/mo):

- Custom subdomain (`portal.acmesigns.com` via CNAME).
- Full logo, colour, typography control.
- Custom domain email sending (Resend branded senders).
- Mobile-installable PWA so the customer adds the shop's portal icon to their phone.
- In-portal chat widget (WhatsApp-style) replaces email thread.
- Customer-side mobile signatures.
- "Powered by Flowtora" toggleable (off on Enterprise).

This one feature moves shops from "we use Flowtora internally" to "our customers use Flowtora." That's how you 10x MRR per tenant through plan upgrades.

#### C. Shop-floor tablet mode

A dedicated `/floor` URL, large-touch design, intended for a shared tablet on the shop floor:

- Today's jobs as 1-row-per-card, colour-coded by status.
- One tap to Start / Complete / Block a stage.
- Camera button → defect photo upload.
- Timer swipe to log material or hours.
- Team handoff — "I'm done; next station claim it."

This converts the production role from "trained admin user" to "anyone in the shop." Seat count grows and adoption sticks.

#### D. Native e-sign + deposit capture on quote approval

The moment a customer clicks Approve on a quote:

1. Legally-binding e-signature captured (IP + timestamp + device).
2. Stripe checkout for the deposit amount appears in the same flow.
3. On payment, the Order is auto-created with the deposit applied.

Today: Approve/Decline button, no e-sign, no deposit. This single flow transforms the customer experience from "PDF and chase" to "sign and pay." Shops who offer this see 25% better deposit capture.

#### E. Real QuickBooks / Xero two-way sync

Not a stub. A real bi-directional sync:

- Customers, invoices, payments push to QB.
- Payments recorded in QB sync back to Flowtora.
- Chart-of-accounts mapping UI.
- Reconciliation conflict resolver.

Implementation cost is real (2 engineers, 3 months) but unblocks 40% of the market that will not migrate without QB.

#### F. Inventory + Materials module

A Pro-plan add-on ($40/mo):

- Material master with on-hand stock.
- Auto-decrement on production stage completion (via BOM from quote).
- Reorder points + purchase-order generation.
- Cost history per vendor → true COGS.
- Ties into Profitability page.

Turns Flowtora from a workflow tool into an ERP-lite, at 10% the price of Acumatica or Sage.

#### G. Install crew app (PWA, offline-first)

Today's `/installs/[id]/field` is good. Promote it to a full PWA:

- Home screen icon: "Flowtora Field."
- Offline cache of today's installs + yesterday's installs.
- Photo queue uploads when signal returns.
- Voice-dictated wrap-up notes.
- Geofence arrival detection.
- Signature-on-device.
- In-app route directions.

Installers are the hardest-to-train user persona. Nail this and shop-wide adoption follows.

#### H. Proof markup tool

Canvas overlay on the proof image:

- Arrows, boxes, text notes, colour picker.
- Version history scrubber.
- "Approve with comments" vs "Request changes" distinction.
- Real-time: customer and designer see each other's markup.
- Audit trail on every markup.

This is table stakes in print and a competitive void in sign-specific SaaS.

#### I. Cash-flow forecast + profitability intelligence

Two pages, one mental model: **financial foresight**.

- `/forecast` — 30/60/90 day expected cash in / expected cash out / running balance, with drill-down by invoice.
- `/orders/[id]/profitability` — revenue - material - labor - overhead = profit, per job, colour-coded.
- Dashboard widget — "At current pace, you'll bank $X this month (± $Y)."

This is the killer feature for retention. Shop owners don't run their business on Gantt charts; they run it on "can I make payroll Friday."

#### J. Industry benchmarks (anonymised aggregate data)

At tenant scale (100+ shops), anonymise and aggregate:

- Average close rate on quotes (your 38% vs. industry 33%).
- Average days-to-pay (your 41 vs. 36).
- Typical gross margin on channel letters (your 52% vs. 48%).
- Average project cycle time.

Frame as "How do I stack up?" Exclusive to Pro. This creates viral loops (shops share comparisons) and deepens retention (no other tool has it).

### 8.3 AI / automation opportunities (by module)

| Module | AI/automation move |
|---|---|
| Sell | Draft quote from email; enrich customer from domain; forecast lead close prob |
| Quote | Auto-extract specs from uploaded brief; margin guardrails; suggest sections |
| Order | Auto-create BOM from quote; ready-to-run detection; stage-time prediction |
| Proof | Generate variants from text prompts ("make logo 30% larger"); auto-classify defects |
| Install | Route optimisation; weather + traffic-aware scheduling; readiness checklist prediction |
| Invoice | Auto-reminder drafting; payment-risk scoring; auto-dunning cadence |
| Dashboard | Morning brief: what changed overnight, what to focus on today |
| Support | Canned-reply best-match suggestion; ticket triage |
| Reports | Natural-language query ("Show me margin by service over the last 6 months") |

### 8.4 Customer experience upgrades

From "vendor portal" to "client dashboard":

- **Onboarding email series** to the customer when a portal link is first sent (not just the staff).
- **Birthday / anniversary touches** (purchase anniversary: "You ordered 1 year ago — 10% off your next job").
- **Referral links** (customer-specific URL that earns store credit).
- **Google Review prompt** after install wrap-up signature.
- **Project photo book** — at install completion, auto-compile before/during/after photos into a shareable album URL.
- **NPS survey** at order completion, with score rolled into dashboard.
- **Customer-visible health score** ("Your shop's on-time rate is 96%") — turn operational excellence into a marketing asset.

### 8.5 Pricing / packaging rethink

Today (inferred): trial → subscription, with franchise behind Enterprise.

Proposed tiering:

| Plan | $/mo | Key unlocks |
|---|---:|---|
| **Starter** | $49 | Up to 3 users, core CRM+quotes+orders+invoices+installs |
| **Pro** | $149 | Unlimited users, AI co-pilot, branded portal, QB/Xero sync, inventory |
| **Scale** | $349 | Multi-branch, forecasting, benchmarks, advanced automation |
| **Enterprise** | $ call | Franchise group-sharing, SSO, custom SLA |

**Add-ons:** Shop-floor tablet seats ($10/seat), Inventory module ($40/mo), SMS + dunning ($30/mo), AI tokens top-up.

The audit implies the product is currently underpriced for what it does. Bundle AI into Pro and the price jump is justified day one.

### 8.6 Three milestone bets (6 / 12 / 24 months)

**6 months — "Every day in Flowtora" (retention)**

- AI co-pilot (quote drafting + reply suggestions).
- Cash-flow forecast + profitability.
- Inbox consolidation (kill 5 routes, one surface).
- Dashboard redesign.
- Real QuickBooks sync.

**12 months — "Our customers use Flowtora" (expansion)**

- Branded customer portal.
- E-sign + deposit at quote approval.
- Proof markup.
- Field PWA with offline.
- Shop-floor tablet mode.

**24 months — "The sign-shop OS" (moat)**

- Inventory / materials ERP.
- Crew scheduling + route optimisation.
- Industry benchmarks.
- Printer queue integrations (Onyx, Caldera, Roland).
- Public API + app marketplace (accounting, CAD, RIP).

### 8.7 What makes this a "no-brainer" for a shop owner?

The emotional pitch, stated plainly:

> *"You'll know at a glance what's booked, what's paid, and what to worry about. Your customers will pay deposits the moment they approve a quote. Your installers will show up with the right tools. Your AI drafts the boring email. And at the end of the month, you know exactly how much you made per job."*

None of today's competitors can say that sentence. Flowtora can — after this roadmap.

---

## Appendix: Prioritised execution order

**Quarter 1 (simplification + dashboard + foundation)**

1. Inbox consolidation (`/inbox`).
2. Settings collapse (20+ → 6 tabs).
3. Dashboard redesign (story-first).
4. Customer detail reshape (single scroll).
5. Onboarding-writes-into-Settings pattern.
6. Remove dead code (`CUSTOMER_PORTAL` enum, stub Announcements).
7. Rate limits on public token endpoints.
8. Bulk actions on 5 list pages (Customers, Quotes, Orders, Invoices, Expenses).
9. CSV export everywhere.

**Quarter 2 (AI + money)**

10. AI co-pilot MVP (quote drafting, reply suggestions, morning brief).
11. Cash-flow forecast + profitability pages.
12. Quote editor redesign (single page, live preview).
13. Invoice PDF render, dunning sequences, promise-to-pay.
14. E-sign + Stripe deposit on quote approval.
15. Real QuickBooks sync.

**Quarter 3 (customer experience + mobile)**

16. Branded customer portal (Pro-plan tier).
17. Proof markup tool.
18. Install PWA + offline.
19. Shop-floor tablet mode.
20. Order detail reshape (Work / Money / Conversation).

**Quarter 4 (depth + defensibility)**

21. Inventory + materials module.
22. Crew schedule + route optimisation.
23. Industry benchmarks.
24. Public API + first 3 marketplace integrations.
25. Franchise group-sharing invite flow.

---

*End of strategy. Read together with `docs/product-audit.md`.*
