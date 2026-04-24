# Flowtora — Full Page & Role Audit

**App:** Flowtora (fka Tracksign) — multi-tenant SaaS for sign shops and print shops.
**Stack:** Next.js 15 App Router • Prisma • Postgres (Neon) • NextAuth v5 • Resend • Stripe • Sentry.
**Scope of this audit:** every page under `src/app/**/page.tsx`, grouped by surface:

- Staff workspace: `/t/[slug]/*`
- Customer portal: `/portal/[token]/*`
- Public entity shares: `/q/[token]`, `/share/[token]`
- Platform admin (SaaS staff): `/platform/*`
- Auth + identity: `/(auth)/*`, `/accept-invite/[token]`, `/verify/[token]`, `/account-suspended`
- Marketing site: `/(marketing)/*`

Everywhere below, `src/app/...` paths are the actual Next.js route files.

---

## Table of contents

1. Role inventory
2. Permission matrix
3. Auth & session model
4. Onboarding gate
5. Staff app — Inbox pages
6. Staff app — Sell pages
7. Staff app — Produce pages
8. Staff app — Collect pages
9. Staff app — Manage pages
10. Staff app — Settings
11. Staff app — Onboarding
12. Customer portal pages
13. Public share pages (`/q`, `/share`)
14. Auth pages
15. Marketing pages
16. Platform admin pages
17. Complete route list
18. Cross-cutting observations
19. Final summary (the requested 10 items)

---

## 1. Role inventory

### 1.1 Tenant-level roles (`TenantRole` enum, `prisma/schema.prisma:529-540`)

| Role | One-line purpose | Default landing | Sidebar visible |
|---|---|---|---|
| **OWNER** | Workspace founder; unrestricted. Only role with `tenant:billing`. | `/t/[slug]/dashboard` | All 5 sections |
| **ADMIN** | Manager. All permissions EXCEPT `tenant:billing`. | `/t/[slug]/dashboard` | All 5 sections |
| **SALES_REP** | Pre-sale + quoting. | `/t/[slug]/dashboard` | Inbox, Sell, Reports |
| **CSR** | Customer service & order processing. | `/t/[slug]/dashboard` | Inbox, Customers, Quotes (r/o), Orders, Proofs |
| **DESIGNER** | Proof approval + files. | `/t/[slug]/dashboard` | Orders, Proofs |
| **PRODUCTION_MANAGER** | Shop floor + scheduling. Has `locations:cross_view`. | `/t/[slug]/dashboard` | Inbox, Orders, Production, Proofs, Reports |
| **INSTALLER** | Field install & completion. | `/t/[slug]/dashboard` | Orders, Installs |
| **ACCOUNTING** | AR, AP, refunds/credits/writeoffs. Has `locations:cross_view`. | `/t/[slug]/dashboard` | Invoices, Payments, Reports (inc. financial) |
| **EMPLOYEE** | Minimal read-only staff role. | `/t/[slug]/dashboard` | Dashboard, Orders |
| **CUSTOMER_PORTAL** | Enum exists but **never assigned** — portal is token-based. | — | — |

### 1.2 Platform-level roles (`PlatformRole` enum, `prisma/schema.prisma:491-495`)

| Role | Can impersonate tenants? | What they can do |
|---|:-:|---|
| **SUPER_ADMIN** | ✓ | Everything in `/platform/*`; synthetic ADMIN membership in any tenant they visit. |
| **SITE_MANAGER** | ✓ | Same operational powers as SUPER_ADMIN. |
| **SUPPORT_AGENT** | ✗ | Read-only platform admin; cannot silently enter tenants. |

- Impersonation check: `canImpersonate()` in `src/lib/rbac.ts:153`.
- Platform-staff bypass: `src/lib/tenant.ts:65-89` issues a synthetic ADMIN membership with `locationIds: []` when platform staff visit any tenant (including SUSPENDED/CANCELED/ARCHIVED).

### 1.3 Customer (not a user)

Customers have **no accounts**. Access is purely URL-token:

- `/portal/[token]` — persistent per-customer portal (`CustomerPortalToken`).
- `/q/[token]` — per-quote share link (`Quote.shareToken`).
- `/share/[token]` — polymorphic ephemeral shares (`ShareToken.kind = PROOF | INVOICE`).
- `/accept-invite/[token]`, `/verify/[token]`, `/reset/[token]` — one-shot onboarding/reset tokens.

All token flows call `requirePortalToken` / `requireShareToken` in `src/lib/portal.ts` + `src/lib/share.ts`: row must exist, not revoked, not expired, tenant must not be SUSPENDED/CANCELED.

### 1.4 Guest / public

Whitelisted in `src/middleware.ts:26-61`:

- Exact matches: `/`, `/login`, `/signup`, `/account-suspended`, `/about`, `/book-demo`, `/changelog`, `/contact`, `/features`, `/for-print-shops`, `/for-sign-shops`, `/pricing`, `/security`, `/robots.txt`, `/sitemap.xml`.
- Prefix matches: `/api/auth`, `/api/webhooks`, `/api/signup`, `/accept-invite`, `/_next`, `/favicon`, `/legal`, `/reset`, `/verify`, `/q/`, `/share/`.

---

## 2. Permission matrix (condensed)

Pulled from `src/lib/rbac.ts`. ✓ = granted, ✗ = denied.

| Permission | OWN | ADM | SR | CSR | DSG | PM | INS | ACC | EMP |
|---|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|
| tenant:manage | ✓ | ✓ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ |
| tenant:billing | ✓ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ |
| staff:manage | ✓ | ✓ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ |
| staff:view | ✓ | ✓ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ |
| customers:view | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| customers:create | ✓ | ✓ | ✓ | ✓ | ✗ | ✗ | ✗ | ✗ | ✗ |
| customers:edit | ✓ | ✓ | ✓ | ✓ | ✗ | ✗ | ✗ | ✗ | ✗ |
| customers:delete | ✓ | ✓ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ |
| products:view | ✓ | ✓ | ✓ | ✓ | ✗ | ✗ | ✗ | ✗ | ✗ |
| products:manage | ✓ | ✓ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ |
| quotes:view | ✓ | ✓ | ✓ | ✓ | ✗ | ✗ | ✗ | ✗ | ✗ |
| quotes:manage | ✓ | ✓ | ✓ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ |
| quotes:approve_exceptions | ✓ | ✓ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ |
| orders:view | ✓ | ✓ | ✓ | ✓ | ✗ | ✓ | ✓ | ✗ | ✓ |
| orders:manage | ✓ | ✓ | ✗ | ✓ | ✗ | ✓ | ✗ | ✗ | ✗ |
| invoices:view | ✓ | ✓ | ✓ | ✗ | ✗ | ✗ | ✗ | ✓ | ✗ |
| invoices:manage | ✓ | ✓ | ✗ | ✗ | ✗ | ✗ | ✗ | ✓ | ✗ |
| payments:record | ✓ | ✓ | ✗ | ✗ | ✗ | ✗ | ✗ | ✓ | ✗ |
| refunds:issue | ✓ | ✓ | ✗ | ✗ | ✗ | ✗ | ✗ | ✓ | ✗ |
| credits:issue | ✓ | ✓ | ✗ | ✗ | ✗ | ✗ | ✗ | ✓ | ✗ |
| writeoffs:record | ✓ | ✓ | ✗ | ✗ | ✗ | ✗ | ✗ | ✓ | ✗ |
| expenses:view | ✓ | ✓ | ✗ | ✗ | ✗ | ✓ | ✗ | ✓ | ✗ |
| expenses:manage | ✓ | ✓ | ✗ | ✗ | ✗ | ✓ | ✗ | ✓ | ✗ |
| vendors:view | ✓ | ✓ | ✗ | ✗ | ✗ | ✓ | ✗ | ✓ | ✗ |
| vendors:manage | ✓ | ✓ | ✗ | ✗ | ✗ | ✗ | ✗ | ✓ | ✗ |
| production:view | ✓ | ✓ | ✗ | ✗ | ✗ | ✓ | ✗ | ✗ | ✗ |
| production:manage | ✓ | ✓ | ✗ | ✗ | ✗ | ✓ | ✗ | ✗ | ✗ |
| installs:view | ✓ | ✓ | ✗ | ✗ | ✗ | ✗ | ✓ | ✗ | ✗ |
| installs:manage | ✓ | ✓ | ✗ | ✗ | ✗ | ✗ | ✓ | ✗ | ✗ |
| proofs:view | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✗ | ✗ | ✗ |
| proofs:manage | ✓ | ✓ | ✗ | ✗ | ✓ | ✗ | ✗ | ✗ | ✗ |
| files:upload | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✗ | ✓ |
| reports:view | ✓ | ✓ | ✓ | ✗ | ✗ | ✓ | ✗ | ✓ | ✗ |
| reports:financial | ✓ | ✓ | ✗ | ✗ | ✗ | ✗ | ✗ | ✓ | ✗ |
| templates:manage | ✓ | ✓ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ |
| locations:view | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| locations:manage | ✓ | ✓ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ |
| locations:cross_view | ✓ | ✓ | ✗ | ✗ | ✗ | ✓ | ✗ | ✓ | ✗ |

Enforcement pattern: every protected server action calls either `await requireTenant(slug)` (auth only) or `await requirePermission(slug, "perm:name")` (auth + permission). Denial redirects to `/t/[slug]/dashboard?error=forbidden`. Branch scope is applied separately via `applyBranchScope()` based on `membership.locationIds` (empty or `locations:cross_view` ⇒ all branches).

---

## 3. Auth & session model

- **Login** (`src/auth.ts:52-184`): Credentials provider. 5 bad attempts → 15-minute lockout. Optional 2FA via TOTP or recovery code. Short-lived `TwoFactorPendingLogin` token flow.
- **Session revocation**: global sign-out everywhere bumps `User.sessionVersion`. Every request re-reads DB version — stale JWT is invalidated (`src/auth.ts:213-230`).
- **Middleware** (`src/middleware.ts`): decodes JWT (edge-safe, `src/auth.config.ts`), checks public allowlist, redirects to `/login` otherwise, and gates `/platform/*` to `session.user.platformRole`.

---

## 4. Onboarding gate

`src/app/t/[slug]/layout.tsx:70-76`:

```
if (!tenant.onboardingCompletedAt && !inOnboarding &&
    (role === "OWNER" || role === "ADMIN")) {
  redirect(`/t/${slug}/onboarding`);
}
```

- Only OWNER and ADMIN are force-routed through onboarding. Other roles see a banner: "Workspace setup isn't finished yet."
- Steps: Business → Branding → Defaults → Team → Sample Data → Done.
- `tenant.onboardingCompletedAt` is **write-once** — no way to re-enter onboarding once complete.

---

## 5. Staff app — Inbox pages

### Page: Dashboard
**Route:** `/t/[slug]/dashboard` • **File:** `src/app/t/[slug]/dashboard/page.tsx` • **Access:** any member.
**Purpose:** role-specific KPI overview + attention feed + activity timeline.

- **Sections:** DashboardHeader (branch filter), ActivationWidget (Owner/Admin only, auto-hides at "established" tier), QuickActions, EmptyStateCard (first-run teaching), PersonaView (one of 8), AttentionPanel, ActivityFeed (8 most-recent), TrialBanner (if `status === "TRIAL"`).
- **PersonaView variants:** Executive (OWNER/ADMIN), Sales, Csr, Designer, Production (PM + production), Installer, Finance, Employee — each swaps the KPI grid and the set of quick-action buttons.
- **Actions:** branch filter via `?branch=`; quick-action buttons are persona-configured; attention item click → detail page.
- **Role differences:** activation widget is Owner/Admin-only; attention feed shows team-wide items for exec/production/finance personas and self-filtered items for others.
- **Complete:** 8 personas, branch scoping, activation tiering.
- **Missing:** dashboard export/PDF, user-configurable widget order.
- **Confusing:** per-persona attention filter scope not surfaced in UI.

### Page: Needs attention
**Route:** `/t/[slug]/attention` • **File:** `src/app/t/[slug]/attention/page.tsx` • **Access:** any.
**Purpose:** triage feed across nine categories.

- **Nine sections:** quotes past expiration, quotes expiring soon, stale SENT quotes, proofs awaiting response, invoices past due, old draft invoices, orders past due, unconfirmed installs (next N hours), overdue tasks.
- **Actions (GET-only filters):** `scope=me|team`, `branch`. Every row links to its detail page.
- **Role differences:** team scope tab is visible only to OWNER/ADMIN/PRODUCTION_MANAGER.
- **Missing:** per-type collapse, snooze, bulk mark-reviewed.

### Page: Approvals
**Route:** `/t/[slug]/approvals` • **File:** `src/app/t/[slug]/approvals/page.tsx` • **Access:** any; decision forms gated on `quotes:approve_exceptions`.
**Purpose:** inbox for approval requests (primarily quote exceptions).

- **Sections:** Pending decisions (approvers only), Pending approvals + Your requests (non-approvers), Recent decisions toggle (`?filter=decided`).
- **Forms:** approveRequest, rejectRequest, cancelRequest — each accepts optional note ≤500 chars.
- **Missing:** bulk approve, delegation, threshold/rule editor UI.
- **Confusing:** "Your requests" card is hidden for approvers even if they personally raised a request.

### Page: Messages (centralized inbox)
**Route:** `/t/[slug]/messages` • **File:** `src/app/t/[slug]/messages/page.tsx` • **Access:** `customers:view`.
**Purpose:** Gmail-style split-pane inbox for customer portal messages (shipped in commits `aafad2e` + `898bc5b`).

- **Sections:** view tabs (Unread / All / Archived), entity filter chips (All / General / Proofs / Orders / Invoices / Quotes), search, left conversation list, right thread + reply form.
- **Forms:** search (GET — `q`, `view`, `entity`, `c`); `replyToPortalMessage` (customerId, toAddress, subject ≤300, body ≤4000); archive/unarchive; `markAllPortalMessagesRead`.
- **Keyboard (`src/components/messages/InboxShortcuts.tsx`):** j/k next/prev, r focus reply, e archive, / focus search, esc deselect.
- **Empty states:** "Inbox zero 🎉", "No portal messages yet", "Nothing archived".
- **Confusing:** tab unread count is global — not filtered by the entity chip you selected.
- **Missing:** attachments, quick-reply templates, forward-to-colleague.

### Page: Notifications
**Route:** `/t/[slug]/notifications` • **File:** `src/app/t/[slug]/notifications/page.tsx` • **Access:** any.
**Purpose:** personal in-app notification inbox.

- **Filter chips (9 domains):** All, Customer, Proofs, Production, Installs, Financial, Reminders, Mentions, Support.
- **View tabs:** Unread / All. **Max list:** 100 items.
- **Actions:** markNotificationRead, dismissNotification, markAllNotificationsRead, clearReadNotifications.
- **Missing:** grouping by domain, per-domain mute, snooze.

### Page: Tasks
**Route:** `/t/[slug]/tasks` • **File:** `src/app/t/[slug]/tasks/page.tsx` • **Access:** `customers:view`; write requires `customers:edit`.
**Purpose:** shared task list.

- **Filter tabs:** My open / All open / Completed.
- **Forms:** createTask (title, customerId, assignedTo, dueDate, priority LOW/NORMAL/HIGH, description ≤rows 2); toggleTask; deleteTask.
- **Missing:** bulk assign/delete, subtasks, recurring tasks, due-date notifications.

---

## 6. Staff app — Sell pages

### Page: Pipeline (Leads)
**Route:** `/t/[slug]/leads` • **File:** `src/app/t/[slug]/leads/page.tsx` • **Access:** `customers:view`.
**Purpose:** kanban view of customer opportunities.

- **Columns:** SUSPECT → PROSPECT → QUALIFIED → NEGOTIATION → PROPOSAL → WON / LOST.
- **Card content:** name, health badge, est. value, owner, stage dropdown (if `customers:edit`).
- **Header:** at-risk count linked to `?health=at-risk`, lead-source analytics panel.
- **Missing:** true drag-drop (currently form-submit dropdown), inline value edit, source/owner/stage filters, bulk next-stage.

### Page: Customers (list)
**Route:** `/t/[slug]/customers` • **File:** `src/app/t/[slug]/customers/page.tsx` • **Access:** `customers:view`.

- **Filters:** q, status, stage, health, branch, tag (top-6 tag chips).
- **Table columns:** Name, Kind (RESIDENTIAL/COMMERCIAL), Status, Stage, Owner, Est. value, Email, Phone, Tags, Health.
- **Empty states:** first-run teaching card vs. "No customers match these filters" + clear-filters link.
- **Confusing:** health filter applied in-memory AFTER the 200-row DB cap → can miss valid rows.
- **Missing:** bulk actions, CSV export, column customisation.

### Page: Customers — New
**Route:** `/t/[slug]/customers/new` • **Access:** `customers:create`.
Shared `CustomerForm`: name, email, phone, website, kind, status, stage, owner, estValue, closeProb, billing + install addresses, notes. Errors via `?error=` redirect (not inline).

### Page: Customers — Detail
**Route:** `/t/[slug]/customers/[id]` • **Access:** `customers:view`.

- **Sticky header:** name, stage, health, status, estValue, closeProb, "New quote" (if `quotes:manage`).
- **Secondary row:** Timeline, Edit, Delete.
- **NextActionPanel + StageChangeCard** (guided transition; LOST forces `lostReason` enum).
- **Tabs (8):** Overview, Work, Contacts, Communication, Tasks, Files, Activity.
  - Overview — contact/tags, health, addresses, notes, portal tokens (issue/revoke).
  - Work — quotes / invoices / orders rollup.
  - Contacts — add form (firstName, lastName, title, email, phone, isPrimary).
  - Communication — CustomerCommsTimeline, Log activity form (type NOTE/CALL/EMAIL/MEETING/TEXT), SendMessageWidget, portal reply.
  - Tasks — list + create form.
  - Files — FilesCard drag-drop upload.
  - Activity — CommentThread + ActivityTimeline.
- **Confusing:** portal messages appear both here AND in the central `/messages` inbox — users see no pointer explaining they're the same data.
- **Missing:** customer merge, custom fields, contact CSV import, edit-history diff.

### Page: Customers — Edit
**Route:** `/t/[slug]/customers/[id]/edit` • **Access:** `customers:edit`. Reuses CustomerForm. No inline validation errors.

### Page: Customers — Timeline
**Route:** `/t/[slug]/customers/[id]/timeline` • **Access:** `customers:view`. Read-only 300-entry blended log (comments, interactions, email events, portal messages). No filter / export / search.

### Page: Quotes (list)
**Route:** `/t/[slug]/quotes` • **Access:** `quotes:view`.

- Split pane. Left: search + status + branch + view tabs (All / Open / Attention / Won / Lost). Right: QuotePanel (Overview / Comments / Activity).
- Age indicators ("3d" orange 3–7 days, "today" muted); expiring-soon badge (≤3 days + SENT/VIEWED); superseded marker.
- **Missing:** bulk status change, side-by-side compare, keyboard new-quote.

### Page: Quote — New
**Route:** `/t/[slug]/quotes/new` • **Access:** `quotes:manage`. Fresh mode (CustomerPicker + createQuote) vs Template mode (createQuoteFromTemplate).

### Page: Quote — Detail
**Route:** `/t/[slug]/quotes/[id]` • **Access:** `quotes:view`; mutations gated on `quotes:manage` / `quotes:approve_exceptions`.

- Tabs: Details (items + sections), Pricing (discount/tax/margin), Notes, Sharing (portal link), Activity.
- 20+ server actions: `addQuoteItem`, `updateQuoteItem`, `removeQuoteItem`, `duplicateQuoteItem`, `addQuoteSection`, `moveQuoteItemToSection`, `toggleQuoteItemOptional`, `changeQuoteStatus`, `approveQuoteForSending` (raises ApprovalRequest above threshold), `reviseQuote`, `duplicateQuote`, `saveQuoteAsTemplate`, `applyRushFee`, `saveQuoteDeposit`, `mintQuoteShareToken`, `revokeQuoteShareToken`, etc.
- **Missing:** true drag-drop reordering, batch quantity/price edit, line-item bundles, autosave indicator.

### Pages: Quote templates
- `/t/[slug]/quotes/templates` — list.
- `/t/[slug]/quotes/templates/new` — create.
- `/t/[slug]/quotes/templates/[id]` — edit.

All `quotes:manage`. Feed `/quotes/new` template mode.

---

## 7. Staff app — Produce pages

### Page: Orders (list)
**Route:** `/t/[slug]/orders` • **Access:** `orders:view`.

- Split pane. Views: All / Production queue / Blocked / Hotlist (HIGH|RUSH) / Overdue. Filters: status, assignee (mine / any), branch.
- Right panel tabs: Overview, Production, Invoicing, Comments, Activity.
- **Confusing:** Blocked view doesn't show blocker reason on list rows — you must open detail.

### Page: Order — Detail
**Route:** `/t/[slug]/orders/[id]` • **Access:** `orders:view`.

- Overview tab — line items, job specs, blockers, proofs, install.
- Production tab — custom stages + checklist + material usage + defects + time tracking + stage transitions (start/pause/resume/skip/complete/block).
- Invoicing tab — invoices list, payments, outstanding, deposit, Create invoice.
- Comments + Activity tabs.
- ~30 server actions: updateOrderMeta, changeOrderStatus, updateOrderPriority, addOrderBlocker, resolveOrderBlocker, saveOrderJobSpecs, startStage/completeStage/blockStage/pauseStage/reopenStage/skipStage, createStage, deleteStage, logMaterialUsage, reportDefect, resolveDefect, createOrderTask, addSubtask, toggleTaskComplete, createInstallEvent, applyStageTemplate…
- **Missing:** Gantt view, drag-drop stages, BOM auto-logging, defect photo uploads.

### Page: Proofs (list)
**Route:** `/t/[slug]/proofs` • **Access:** `proofs:view`.

- Views: All / Open / Needs attention / Approved. Status chips with counts.
- Overdue + stale badges on rows.
- Proof **detail** has no dedicated staff route — it lives inside Order detail. The customer-facing proof page is `/share/[token]`.
- **Missing:** bulk "remind customer", version history view, preview thumbnails, snooze.

### Page: Production Board
**Route:** `/t/[slug]/production` • **Access:** `production:view`; write `production:manage`.

- Swimlanes per department. Stage cards grouped by ACTIVE / BLOCKED / PENDING / DONE / SKIPPED.
- **Lens chips:** All / Due today / Overdue / Blocked / Ready to run / Rush or High / Mine.
- **Secondary filters:** department, assignee, branch, show closed.
- Dwell-time colouring (<2h muted / 2–8h amber / 8h+ red). READY badge on pending stages whose upstream is done.
- Action buttons per card: Start, Done, Block (with reason), Pause, Skip.
- **Missing:** inline note on stage, multi-select, time-on-stage humanised, rework-from-DONE.

### Page: Installs (calendar)
**Route:** `/t/[slug]/installs` • **Access:** `installs:view`; schedule-new gated on `installs:manage`.

- Week grid Mon–Sun. Event cards: time range, badges (blockers / issues / evidence), title, status, customer, installer. Left-border colour per kind (INSTALL / SURVEY / SERVICE).
- Filters: status, kind, Mine only, Needs attention (badge), branch.
- Upcoming panel: next 5 open events.
- **Missing:** month view, drag-drop reschedule, iCal export, recurring events, real crew picker.

### Page: Install — Detail
**Route:** `/t/[slug]/installs/[id]` • **Access:** `installs:view`; write `installs:manage`.

- Day-of banner (green today / red past due).
- Header: title, kind, status, blocker count, order + customer links, date/time/duration, address + "Open in maps", call-customer.
- **Readiness card** — ✓/⚠/✗ checks with overall status.
- **Status transitions:** Confirm / Back to scheduled / On site / Mark completed / Cancel / No-show.
- **Three-column layout** with: Event details, Logistics, Site survey, Checklist, Issues, Photos (BEFORE / DURING / AFTER / ISSUE / SURVEY), Signatures, Wrap-up, Send update, Comments. Right rail: Customer, Order, Crew, Timeline.
- **Missing:** before/after auto-compare, geofence arrival, route optimisation, material checkout.

### Page: Install — Field mode
**Route:** `/t/[slug]/installs/[id]/field` • **Access:** `installs:view`.

- Mobile-optimised single column.
- Primary CTA depends on status: "I'm on site" (SCHEDULED/CONFIRMED) / "Done" (IN_PROGRESS, disabled if blockers exist) / "Already wrapped up".
- **Tabs:** Overview / Photos / Issues / Sign.
- **Missing:** offline cache, voice dictation, barcode scanning, swipe between tabs.

---

## 8. Staff app — Collect pages

### Page: Invoices (list)
**Route:** `/t/[slug]/invoices` • **Access:** `invoices:view`; `invoices:manage` shows create button; `payments:record` enables payment tab.

- Left rail: search, status dropdown, branch filter, view chips (All / Open / Overdue / Paid), aging bucket chips (CURRENT, 1-30d, 31-60d, 61-90d, 90+).
- Right rail: InvoicePanel Details tab when selected.
- **Missing:** bulk actions, CSV export, batch reminders.

### Page: Invoice — New
**Route:** `/t/[slug]/invoices/new` • **Access:** `invoices:manage`.
Form: customer (req), order (opt), kind (STANDARD / DEPOSIT / BALANCE). **Missing:** prefill from referring page (no `?customerId=` / `?orderId=`).

### Page: Invoice — Detail
**Route:** `/t/[slug]/invoices/[id]` • **Access:** `invoices:view`; `invoices:manage`, `payments:record`, `refunds:issue`, `credits:issue`, `writeoffs:record` gate sub-actions.

- Sticky header (number, status, kind, aging, balance, primary CTA).
- Status banners (VOID, WRITTEN_OFF).
- **Two-column layout:** left — line items + tabs (Details / Payments / Refunds / Credits / Write-offs / Notes / Sharing / Activity); right — financials sidebar.
- **Forms:** editLineItem (qty, unitPrice, taxable, desc), addLineItem, saveDetails (issued, due, terms, tax, discount), recordPayment (amount, method, reference, receivedAt, note), markPaymentFailed/Void (reason), issueRefund, applyCredit, writeOff (amount, reason), reverseWriteOff, saveNotes, sendReminder, status transitions.
- **Sharing tab:** ShareLinkPanel — create/revoke `/share/[token]` with optional expiry/label.
- **Missing:** invoice preview/PDF, duplicate, batch edit.

### Page: Payments (dashboard)
**Route:** `/t/[slug]/payments` • **Access:** `invoices:view`; `invoices:manage` enables reminder buttons; `payments:record` enables "Record a payment" link.

- KPI cards: Outstanding, Overdue, Collected last 7d.
- **A/R aging bucket tiles** toggle a filter on the chase list.
- Left: "Needs chasing" table (most-overdue first) with per-row Send reminder button.
- Right: Recent payments list (25 items).
- **Missing:** payment-method breakdown, top-10 debtors, reminder campaign history, "promise to pay".

---

## 9. Staff app — Manage pages

### Page: Products (list)
**Route:** `/t/[slug]/products` • **Access:** `products:view`; write `products:manage`.

- Filters: q, category, kind, active status.
- Columns: Name (+ inherited tag), Kind, Category, Pricing model, Base price (formula hint), Margin % (colour-coded — red <20, amber 20–40, green 40+), Usage count, Status.
- Buttons: "Packages" → `/products/packages`, "New product".
- **Missing:** bulk edit, variants, cost history, photos/thumbnails.

### Pages: Products — New / Detail / Edit
- `/t/[slug]/products/new`
- `/t/[slug]/products/[id]`
- `/t/[slug]/products/[id]/edit`

All gated on `products:manage`. Inherited products (franchise parent) are read-only on the detail page.

### Pages: Product packages
- `/t/[slug]/products/packages`
- `/t/[slug]/products/packages/new`
- `/t/[slug]/products/packages/[id]`

Manage bundled/tiered product packages used by quote templates.

### Page: Vendors (list)
**Route:** `/t/[slug]/vendors` • **Access:** `vendors:view`; write `vendors:manage`.
Scope tabs Active / Archived / All; columns Name, Category, Contact, Email, Phone, Expense count, Lifetime spend.
**Missing:** vendor rating, contract terms, performance metrics, "preferred vendor" star.

### Pages: Vendors — New / Detail
- `/t/[slug]/vendors/new`
- `/t/[slug]/vendors/[id]`

### Page: Expenses (list)
**Route:** `/t/[slug]/expenses` • **Access:** `expenses:view`; write `expenses:manage`.

- Flag chips: All / Job-linked / Billable.
- Filters: q, from/to (defaults to current month if none), vendor, category.
- Columns: Date, Vendor, Category, Method, Order (+ billable badge), Memo, Tax, Amount.
- **Missing:** grouped view, recurring expenses, approval workflow, receipt OCR, budget tracking.

### Pages: Expenses — New / Detail
- `/t/[slug]/expenses/new`
- `/t/[slug]/expenses/[id]`

### Page: Reports hub
**Route:** `/t/[slug]/reports` • **Access:** `reports:view`.

Tiles: Pipeline, Quote conversion, Production, Installs, Products & services, Financial (`reports:financial`), Branch comparison (`locations:cross_view`). All reports export routes live under `src/app/api/t/[slug]/reports/*/export/route.ts` (CSV).

### Pages: Report sub-dashboards
- `/t/[slug]/reports/pipeline`
- `/t/[slug]/reports/quotes`
- `/t/[slug]/reports/production`
- `/t/[slug]/reports/installs`
- `/t/[slug]/reports/products`
- `/t/[slug]/reports/financial` (owner/admin/accounting)
- `/t/[slug]/reports/branches` (requires `locations:cross_view`)

### Page: Search (full-page)
**Route:** `/t/[slug]/search` • **Access:** any signed-in member.

- Kind tabs: All / Customers / Quotes / Orders / Invoices / Tasks / Products / Locations.
- Grouped result lists with "Only [Kind]" links.
- **Confusing:** Tasks result links to `/tasks` (not task detail); Locations results link to settings.
- **Missing:** advanced syntax, saved searches, faceted filters.

### Page: Support — New ticket
**Route:** `/t/[slug]/support/new` • **Access:** any.
Subject (≤200), category (Question / Bug / Billing / Feature request / Other), priority (Low / Normal / High / Urgent), body (≤8000).
**Missing:** attachments, ticket status tracking (user can't see their own tickets after submit), browser/OS autoinclude.

---

## 10. Staff app — Settings (under `/t/[slug]/settings/*`)

The settings index is a card grid; the settings layout (`src/app/t/[slug]/settings/layout.tsx`) shows the same items in a sticky sidebar. Both filter by per-card RBAC.

### Page: Settings Index (hub)
**Route:** `/t/[slug]/settings` • **Access:** per-card RBAC.
Six groups (~20 cards): **Me** (Profile, Security, Notifications), **Business** (Business profile, Documents, Numbering, Workflow, Automation, Production), **Money** (Tax & terms, Subscription), **Workspace** (Team & roles, Invite defaults, Locations, Checklists, Canned messages, Group sharing), **Platform** (Integrations, Audit log), **Account** (Demo data, Danger zone).
Admins get a "last settings change" banner.

### Page: Settings — Me (profile)
**Route:** `/t/[slug]/settings/me` • **Access:** any. Fields: name ≤80, image URL. Avatar is URL-only (no upload).

### Page: Settings — Security
**Route:** `/t/[slug]/settings/security` • **Access:** any.
Sections: Account email (requestEmailChange — newEmail + currentPassword), Password (changePassword — current/new/confirm, strength meter, signs out all devices), 2FA (start/verify/disable, regenerate recovery codes, otpauth URI — **no QR code**), Active sessions (revokeAllSessions), Recent security activity (15-event cap, no pagination).

### Page: Settings — Notifications (personal)
**Route:** `/t/[slug]/settings/notifications` • **Access:** any.
Per-event-type in-app + email checkboxes (stored on `membership.notifPrefs`). Email column disabled if `RESEND_API_KEY` not configured. Reset-to-defaults button.

### Page: Settings — Notifications Defaults
**Route:** `/t/[slug]/settings/notifications-defaults` • **Access:** visible to `staff:manage`; editable only with `tenant:manage`.
Saves house-wide defaults for new members on invite acceptance. **Does not retroactively update existing members.**

### Page: Settings — Profile (shop)
**Route:** `/t/[slug]/settings/profile` • **Access:** `tenant:manage`.
Branding, contact, address, timezone, currency, email sender. Fields: name (req), logoUrl, brandPrimaryColor, phone, website, taxId, address lines, city, region, postalCode, country, timezone (hardcoded ~10), currency (hardcoded 5), dateFormat (US/EU/ISO), weekStartsOn, emailFromName, emailReplyTo.
**Overlaps with:** onboarding/branding.

### Page: Settings — Documents
**Route:** `/t/[slug]/settings/documents` • **Access:** `tenant:manage`.
Quote footer, invoice footer, payment instructions (each plain text ≤2000).

### Page: Settings — Numbering
**Route:** `/t/[slug]/settings/numbering` • **Access:** `tenant:manage`.
Quote / order / invoice number prefixes (read-only counters shown). **Overlaps with:** onboarding/defaults.

### Page: Settings — Workflow
**Route:** `/t/[slug]/settings/workflow` • **Access:** `tenant:manage`. Status lifecycle tweaks + proof-approval gate toggles. **Proof-requires-approval flag duplicated in** Financial settings + onboarding/defaults.

### Page: Settings — Automation
**Route:** `/t/[slug]/settings/automation` • **Access:** `tenant:manage`.
Default sales rep, default production manager, default order checklist template, default install checklist template. Deactivated members silently become null on save.

### Page: Settings — Production
**Route:** `/t/[slug]/settings/production` • **Access:** `production:manage`.
CRUD production departments + work stations. Seed-defaults by business type. Colour is free-text hex; no palette UI.

### Page: Settings — Financial (tax & terms)
**Route:** `/t/[slug]/settings/financial` • **Access:** `tenant:manage`.
defaultTaxRate (0–1), defaultDepositPercent (0–100), defaultPaymentTerms (DUE_ON_RECEIPT / NET_15 / 30 / 45 / 60), proofRequiresApproval.
**Overlaps with:** onboarding/defaults + workflow.

### Page: Settings — Billing (subscription)
**Route:** `/t/[slug]/settings/billing` • **Access:** `tenant:billing` (OWNER only).
Current subscription, payment method, change plan, billing history. Actions: `startCheckout`, `cancelSubscriptionAtPeriodEnd`, `resumeSubscription`, `openBillingPortal`. Only shows last 12 invoices.

### Page: Settings — Team
**Route:** `/t/[slug]/settings/team` • **Access:** `staff:manage`.
Sections: Invite, Members, Suspended, Transfer ownership (OWNER only), Pending invites.
Forms: `inviteMember` (email + role, OWNER excluded), `changeMemberRole`, `suspendMembership`, `reinstateMember`, `removeMember`, `transferOwnership` (membershipId + confirm email), branch assignment (locationIds[] only if >1 location).
2FA + email-verification badges shown per row. Growing feature density may warrant tabs.

### Page: Settings — Invite defaults
Lives on the notifications-defaults page — invite-time seeding of member notification prefs.

### Page: Settings — Locations
**Route:** `/t/[slug]/settings/locations` • **Access:** `locations:manage`.
CRUD branches: name, code, address, phone, email, timezone (free text — typo risk), isDefault, active. Auto-heals to "Main" if none present.

### Page: Settings — Templates (checklists)
- `/t/[slug]/settings/templates` — list (split by kind: ORDER, INSTALL).
- `/t/[slug]/settings/templates/[id]` — detail (metadata + items). Inherited-from-parent-group templates are read-only.
Access: `templates:manage`. No drag-to-reorder; no inline item edit.

### Page: Settings — Message templates (canned emails)
- `/t/[slug]/settings/message-templates` — list.
- `/t/[slug]/settings/message-templates/[id]` — detail.
Access: `templates:manage`. Fields: name, kind, description, subject, body (+ placeholder support — unknown placeholders render literally). No preview.

### Page: Settings — Franchise (group sharing)
**Route:** `/t/[slug]/settings/franchise` • **Access:** `tenant:manage` + `isEntitled("franchiseGroup")` (Enterprise-plan gate).
Three states: root / standalone / child. Step-down blocked if children exist. **Child attachment is manual / support-gated — no invite-token flow yet.**

### Page: Settings — Integrations
**Route:** `/t/[slug]/settings/integrations` • **Access:** `tenant:manage`.
Connector rows: Stripe, Email (Resend), QuickBooks/Xero (stub), Zapier (stub), Slack (stub). Webhook staleness threshold hardcoded 24h. No manual test-webhook button.

### Page: Settings — Audit log
**Route:** `/t/[slug]/settings/audit-log` • **Access:** OWNER or ADMIN (double-gated).
Search (action prefix) + cursor pagination (50/page). No time-range filter; no CSV export.

### Page: Settings — Sample data
**Route:** `/t/[slug]/settings/sample-data` • **Access:** `tenant:manage`.
loadSampleData (disabled after first load — intentional), clearSampleData. Also reachable during onboarding.

### Page: Settings — Danger zone
**Route:** `/t/[slug]/settings/danger` • **Access:** OWNER only.
- requestDataExport (async fulfilment, 1 business day, 7-day download expiry).
- requestAccountDeletion (reason ≤500, confirm=slug required).
- cancelAccountDeletionAsTenant.
Non-owners see an "ask your owner" message.

---

## 11. Staff app — Onboarding

Gated flow for OWNER / ADMIN until `tenant.onboardingCompletedAt` is set.

### Page: Onboarding — Index
**Route:** `/t/[slug]/onboarding`. Four-step overview + "Let's get started" CTA → `/onboarding/business`.

### Page: Onboarding — Business
**Route:** `/t/[slug]/onboarding/business` • **Access:** `tenant:manage`.
Business type radios (updates services presets client-side); services checkboxes (hardcoded — no CRUD).

### Page: Onboarding — Branding
**Route:** `/t/[slug]/onboarding/branding` • **Access:** `tenant:manage`.
LogoUploader + contact + address + timezone/currency. Duplicates settings/profile by design.

### Page: Onboarding — Defaults
**Route:** `/t/[slug]/onboarding/defaults` • **Access:** `tenant:manage`.
Numbering prefixes, default tax rate, deposit %, payment terms, proof-requires-approval. Duplicates settings/numbering + settings/financial.

### Page: Onboarding — Team
**Route:** `/t/[slug]/onboarding/team` • **Access:** `staff:manage`.
Optional invites step. No back button — linear flow.

### Page: Onboarding — Sample
**Route:** `/t/[slug]/onboarding/sample` • **Access:** `tenant:manage`.
One-shot demo data loader OR skip via `completeOnboarding` → `/onboarding/done`.

### Page: Onboarding — Done
**Route:** `/t/[slug]/onboarding/done`. Celebration + "Tweak settings" / "Go to dashboard".

---

## 12. Customer portal pages (all token-gated, zero auth)

### Page: Portal Landing
**Route:** `/portal/[token]` • **File:** `src/app/portal/[token]/page.tsx`.
Hero (pending count + outstanding $), four lists (Quotes / Proofs / Invoices / Orders), activity preview.

### Page: Portal Activity History
**Route:** `/portal/[token]/history`. Unified 180-day / 80-event stream across emails, payments, proofs, installs.

### Page: Portal Messages
**Route:** `/portal/[token]/messages`.
Thread (inbound left / outbound right). Compose form: subject + message (req, ≤4000). Always visible.
Action: `sendPortalMessage` fans notifications to OWNER / ADMIN / SALES_REP / CSR members (see `src/app/actions/portal-messages.ts`).

### Page: Portal Quotes
**Route:** `/portal/[token]/quotes`. Lists customer quotes (DRAFT hidden).

### Page: Portal Quote — Detail
**Route:** `/portal/[token]/quotes/[id]`. Interactive quote view. Customer can approve/decline from here if status SENT / VIEWED.

### Page: Portal Invoices
**Route:** `/portal/[token]/invoices`. Header with account balance; DRAFT + VOID hidden.

### Page: Portal Invoice — Detail
**Route:** `/portal/[token]/invoices/[id]`. Line items + payment form.

### Page: Portal Orders
**Route:** `/portal/[token]/orders`. Full list with status / due / total.

### Page: Portal Order — Detail
**Route:** `/portal/[token]/orders/[id]`. Proofs + installs rollup.

### Page: Portal Proofs
**Route:** `/portal/[token]/proofs`. List with sent/response dates + version. DRAFT hidden.

### Page: Portal Proof — Detail
**Route:** `/portal/[token]/proofs/[id]`. Approve / request changes / leave comment.

### Page: Portal Installs
**Route:** `/portal/[token]/installs`. Upcoming + past split.

### Page: Portal Expired
**Route:** `/portal/expired`. Friendly page for revoked/expired tokens. Deliberately does not reveal what was at the old token.

---

## 13. Public share pages

### Page: Public Quote Share
**Route:** `/q/[token]` • **Access:** public (via `Quote.shareToken`).
- Status-gated:
  - DRAFT — "not ready yet" holding screen.
  - SENT / VIEWED — decidable (approve / decline).
  - Other — read-only.
- Auto-stamps `viewedAt` on first load.
- Form: `respondToQuoteShare` (decision = APPROVED | DECLINED).

### Page: Public Share (Proof or Invoice)
**Route:** `/share/[token]` • **Access:** public (via `ShareToken`, polymorphic).
Dispatches to PublicProofView or PublicInvoiceView based on `token.kind`. Proof approval form / invoice pay balance form inline.

### Page: Share Expired
**Route:** `/share/expired`. Friendly copy card.

### Page: Share Invalid
**Route:** `/share/invalid`. Friendly copy card.

---

## 14. Auth pages

### Page: Login
**Route:** `/(auth)/login` • Public.
- Fields: email, password. Pre-filled email on error.
- Actions: Sign in → `next` or workspace; Forgot password; Create account.
- 5 bad attempts → 15-minute lockout with user-visible message.

### Page: Forgot password
**Route:** `/(auth)/forgot` • Public.
- Two states: (1) email form; (2) "check inbox" — always shown even for unknown emails (timing-safe).
- Token expiry 30 minutes.

### Page: Two-factor
**Route:** `/(auth)/two-factor` • Cookie-gated (pending 2FA).
- Form: TOTP 6-digit OR recovery code (`ABCDE-FGHJK`).
- 10-minute expiry countdown.
- "Lost codes" link → `/support`.

### Page: Reset password
**Route:** `/reset/[token]` • Public (token-gated). Form: newPassword + confirm. Redirect to login on success.

### Page: Accept invite
**Route:** `/accept-invite/[token]` • Context-aware public route.
Six possible states: not found / expired / already used / wrong account / existing user (one-click accept) / new user (name + password ≥8).

### Page: Email verification
**Route:** `/verify/[token]` • Public server thunk — no UI; redirects to `/select-tenant` on success or `/verify/invalid` on failure.

### Page: Verify invalid
**Route:** `/verify/invalid` • Public copy card.

### Page: Account suspended
**Route:** `/account-suspended` • Authenticated, blocked.
Two cards: tenant-wide suspensions, membership suspensions. Sign-out button. ARCHIVED tenants show deletion-window hint.

---

## 15. Marketing pages (`src/app/(marketing)/*` — all public)

All shipped under the "Marketing Redesign Plan" (commits `63c194e` → `20e2cc3`, 2026-04-21). Theme toggle + split hero, mobile slide-over nav, 4-col footer with Flowtora logomark.

| Route | File | Purpose |
|---|---|---|
| `/` | `(marketing)/page.tsx` | 14-section narrative: Hero, Logo cloud, Product orbit, How it works, 3 feature spotlights, Industry split, Outcomes, Testimonial, Pricing preview, FAQ, Final CTA, sticky demo CTA. |
| `/about` | `(marketing)/about/page.tsx` | Hero, stats row, 3 values, origin story, "What we won't build", CTA. |
| `/book-demo` | `(marketing)/book-demo/page.tsx` | DemoForm left + trust/value panel right. Submits as `MarketingLead kind=DEMO`. |
| `/pricing` | `(marketing)/pricing/page.tsx` | Tier cards, comparison table (6 categories), Enterprise/franchise strip, FAQ, final CTA. Monthly/annual toggle (client state). |
| `/features` | `(marketing)/features/page.tsx` | Feature bento. |
| `/for-sign-shops` | `(marketing)/for-sign-shops/page.tsx` | 8-section industry narrative. |
| `/for-print-shops` | `(marketing)/for-print-shops/page.tsx` | 8-section industry narrative. |
| `/contact` | `(marketing)/contact/page.tsx` | Trust strip + contact form. |
| `/changelog` | `(marketing)/changelog/page.tsx` | Release history. |
| `/security` | `(marketing)/security/page.tsx` | Security posture, infra summary. |
| `/legal/privacy` | `(marketing)/legal/privacy/page.tsx` | Privacy policy. |
| `/legal/terms` | `(marketing)/legal/terms/page.tsx` | Terms of service. |

Notes:
- Home page testimonial still shows "Placeholder Name".
- DemoForm internals weren't fully audited — the submit flow lands in `MarketingLead` and surfaces in `/platform/leads`.

---

## 16. Platform admin pages (`src/app/platform/*` — super-admin only)

### Page: Platform Overview
**Route:** `/platform` • **Access:** SUPER_ADMIN / SITE_MANAGER / SUPPORT_AGENT (staff read; admin for writes).
Sections: Alert rail, Hero revenue (MRR / ARR / trend), Health gauge, KPI strip (Active tenants, Signups, Trial→paid, ARPU, Churn, Past-due), Ops vitals, Revenue trend (stacked by plan), Growth funnel, Churn reasons, Triage tabs, Activity feed (12), Quick actions.
Range selector 7d / 30d / YTD / custom.

### Page: Tenants
**Route:** `/platform/tenants`. Search q, status, env, cohort, showArchived. **200-row cap** — no pagination.

### Page: Marketing Leads
**Route:** `/platform/leads`. Inbox for contact / book-demo / newsletter. **200 cap**.

### Page: Launch Readiness
**Route:** `/platform/readiness`. Pre-launch checklist per tenant, sorted blocked-first. **300 cap**.

### Page: Feedback
**Route:** `/platform/feedback`. Cross-tenant feedback with CSV export (`/platform/feedback/export/route.ts`). **300 cap**. List body truncated to 400 chars.

### Page: Support Queue
**Route:** `/platform/support`. Tabs ACTIVE / ALL / RESOLVED / CLOSED. "Mine only" toggle. **200 cap**.

### Page: Support Ticket — Detail
**Route:** `/platform/support/[id]`. Full ticket thread + reply composer (canned-reply picker with `{{tenantName}}` / `{{ticketSubject}}` interpolation), triage card (status, priority, assignee). Silent "Open workspace" button if `canImpersonate`. Satisfaction + first-response-time shown inline.

### Page: Canned Reply Templates
**Route:** `/platform/support/templates`. Grouped by category (Any / Billing / Bug / Feature / Question / Other). Archive + restore. **No preview render.**

### Page: Feature Flags
**Route:** `/platform/feature-flags`. Plan defaults table, global overrides card, per-tenant overrides card. Mutations admin-only server-side even though buttons visible.

### Page: Compliance Queue
**Route:** `/platform/compliance`. Open data exports, recent completed exports, scheduled deletions, recent deletion outcomes. `fulfillDataExport`, `cancelAccountDeletionAsStaff`, `executeAccountDeletion` (disabled until grace elapsed — client-side gate; server also enforces).

### Page: Platform Audit Log
**Route:** `/platform/audit`. Filters: tenantId, userId, action prefix, scope (all / platform / tenant), since, until. 100/page. Invalid dates silently ignored.

### Page: Design System
**Route:** `/platform/design`. Live component reference (buttons, inputs, badges, cards, headers, breadcrumb, tabs, EmptyState, Skeleton, Dialog, token swatches). For regression testing.

### Page: Announcements
**Route:** `/platform/announcements`. **Stub** — no DB model yet. Shows a not-wired notice + roadmap copy.

### Page: Global Search
**Route:** `/platform/search`. Cross-entity search (tenants, users, customers, tickets, leads). 10/kind hard cap, no "see all".

### Page: Platform Settings
**Route:** `/platform/settings`. Read-only env/config status + link cards. 10 env vars surfaced; only changeable via redeploy.

### Page: Platform Notifications
**Route:** `/platform/notifications`. Transactional email template catalog grouped by category (Auth, Team, Billing, Support, Activity). States DRAFT / PUBLISHED / DISABLED / DEFAULT. `seedMissing` admin action. DISABLED hidden for critical kinds.

### Page: Platform Notifications — Editor
**Route:** `/platform/notifications/[kind]`. Single-template editor (draft → publish). *(Not fully audited.)*

---

## 17. Complete route list

### Public / marketing (15)
`/`, `/about`, `/book-demo`, `/changelog`, `/contact`, `/features`, `/for-sign-shops`, `/for-print-shops`, `/pricing`, `/security`, `/legal/privacy`, `/legal/terms`, `/account-suspended`, `/robots.txt`, `/sitemap.xml`

### Auth (7)
`/(auth)/login`, `/(auth)/forgot`, `/(auth)/two-factor`, `/reset/[token]`, `/accept-invite/[token]`, `/verify/[token]`, `/verify/invalid`

### Public-share / portal (17)
`/q/[token]`, `/share/[token]`, `/share/expired`, `/share/invalid`, `/portal/expired`, `/portal/[token]`, `/portal/[token]/history`, `/portal/[token]/messages`, `/portal/[token]/quotes`, `/portal/[token]/quotes/[id]`, `/portal/[token]/invoices`, `/portal/[token]/invoices/[id]`, `/portal/[token]/orders`, `/portal/[token]/orders/[id]`, `/portal/[token]/proofs`, `/portal/[token]/proofs/[id]`, `/portal/[token]/installs`

### Staff — Inbox (6)
`/t/[slug]/dashboard`, `/t/[slug]/attention`, `/t/[slug]/approvals`, `/t/[slug]/messages`, `/t/[slug]/notifications`, `/t/[slug]/tasks`

### Staff — Sell (12)
`/t/[slug]/leads`, `/t/[slug]/customers`, `/t/[slug]/customers/new`, `/t/[slug]/customers/[id]`, `/t/[slug]/customers/[id]/edit`, `/t/[slug]/customers/[id]/timeline`, `/t/[slug]/quotes`, `/t/[slug]/quotes/new`, `/t/[slug]/quotes/[id]`, `/t/[slug]/quotes/templates`, `/t/[slug]/quotes/templates/new`, `/t/[slug]/quotes/templates/[id]`

### Staff — Produce (7)
`/t/[slug]/orders`, `/t/[slug]/orders/[id]`, `/t/[slug]/proofs`, `/t/[slug]/production`, `/t/[slug]/installs`, `/t/[slug]/installs/[id]`, `/t/[slug]/installs/[id]/field`

### Staff — Collect (3)
`/t/[slug]/invoices`, `/t/[slug]/invoices/new`, `/t/[slug]/invoices/[id]`, plus `/t/[slug]/payments` (dashboard only)

### Staff — Manage (17)
`/t/[slug]/products`, `/t/[slug]/products/new`, `/t/[slug]/products/[id]`, `/t/[slug]/products/[id]/edit`, `/t/[slug]/products/packages`, `/t/[slug]/products/packages/new`, `/t/[slug]/products/packages/[id]`, `/t/[slug]/vendors`, `/t/[slug]/vendors/new`, `/t/[slug]/vendors/[id]`, `/t/[slug]/expenses`, `/t/[slug]/expenses/new`, `/t/[slug]/expenses/[id]`, `/t/[slug]/reports` (+ 7 sub-reports), `/t/[slug]/search`, `/t/[slug]/support/new`

Report sub-routes:
`/reports/financial`, `/reports/quotes`, `/reports/pipeline`, `/reports/installs`, `/reports/branches`, `/reports/production`, `/reports/products`.

### Staff — Settings (24)
`/settings`, `/settings/me`, `/settings/security`, `/settings/notifications`, `/settings/notifications-defaults`, `/settings/profile`, `/settings/documents`, `/settings/numbering`, `/settings/workflow`, `/settings/automation`, `/settings/production`, `/settings/financial`, `/settings/billing`, `/settings/team`, `/settings/locations`, `/settings/templates`, `/settings/templates/[id]`, `/settings/message-templates`, `/settings/message-templates/[id]`, `/settings/franchise`, `/settings/integrations`, `/settings/audit-log`, `/settings/sample-data`, `/settings/danger`

### Staff — Onboarding (6)
`/onboarding`, `/onboarding/business`, `/onboarding/branding`, `/onboarding/defaults`, `/onboarding/team`, `/onboarding/sample`, `/onboarding/done`

### Platform (15)
`/platform`, `/platform/tenants`, `/platform/leads`, `/platform/readiness`, `/platform/feedback`, `/platform/support`, `/platform/support/[id]`, `/platform/support/templates`, `/platform/feature-flags`, `/platform/compliance`, `/platform/audit`, `/platform/design`, `/platform/announcements`, `/platform/search`, `/platform/settings`, `/platform/notifications` (+ `/platform/notifications/[kind]` editor)

### API routes (15)
`/api/auth/[...nextauth]`, `/api/search`, `/api/webhooks/resend`, `/api/webhooks/stripe`, `/api/signup/slug-check`, `/api/cron/reminders`, `/api/exports/[id]`, `/api/t/[slug]/reports/financial/export`, `/api/t/[slug]/reports/installs/export`, `/api/t/[slug]/reports/pipeline/export`, `/api/t/[slug]/reports/branches/export`, `/api/t/[slug]/reports/quotes/export`, `/api/t/[slug]/reports/production/export`, `/api/t/[slug]/reports/products/export`, `/platform/feedback/export` (route.ts)

**Approximate totals:** ~135 pages + 15 API routes.

---

## 18. Cross-cutting observations

1. **Server actions are the main control surface.** ~290 calls to `requirePermission` / `requireTenant` across `src/app/actions/*`. Denial always redirects or 404s — no silent pass-through.

2. **Single permission-enum source.** `src/lib/rbac.ts` is the authoritative permission list. All pages and actions import from it. Easy to audit, easy to extend.

3. **Branch scoping is real.** `applyBranchScope()` and `assertBranchAccess()` run on every list/detail query for tenants with >1 location. `locations:cross_view` acts as an escape hatch for PM + Accounting.

4. **Settings duplication.** The same tenant fields are edited in at least three places each:
   - Tax/deposit/terms — `settings/financial` + `onboarding/defaults` + partial in `settings/workflow`.
   - Numbering prefixes — `settings/numbering` + `onboarding/defaults`.
   - Branding/address/timezone — `settings/profile` + `onboarding/branding`.
   This is intentional (onboarding is a curated subset) but undocumented to users; mixed save behaviour can surprise.

5. **Platform list pages cap instead of paginate.** Tenants 200, Leads 200, Readiness 300, Feedback 300, Support 200, Audit 100/page. Workable at current scale; will hurt once customer count exceeds each cap.

6. **Empty states are consistent.** Every list page has first-run teaching copy + filtered-no-results + clear-filters link. UX polish is high.

7. **No CSV export in staff list pages.** Reports sub-pages have CSV exports (`/api/t/[slug]/reports/*/export`), but customers, quotes, orders, invoices, expenses, etc., cannot be exported.

8. **Portal messages surface is duplicated.** Same data appears in `/t/[slug]/messages` (centralized) and in the Communication tab of `/t/[slug]/customers/[id]`. No visible signpost explaining they're the same thread.

9. **Three customer-facing token models.**
   - `/portal/[token]` — long-lived, customer's whole workspace.
   - `/q/[token]` — per-quote, shareable.
   - `/share/[token]` — polymorphic (PROOF | INVOICE), ephemeral.
   All reject SUSPENDED / CANCELED tenants. No rate limits visible on any of these routes — see security follow-ups below.

10. **Mobile adaptation uneven.** Install Field Mode is explicitly mobile-first. Dashboards, most list pages, and the Production Board assume desktop — some list pages hide the right rail below a breakpoint but the Production Board (swimlanes) is unusable on phones.

### Security follow-ups (from role-permission audit)

- **No rate limits on public share / portal endpoints.** Token entropy is high (cuid25) so brute force is impractical, but logging or backup leakage would expose them.
- **No rate limits on bulk actions.** inviteMember, changeMemberRole, etc. are unthrottled.
- **Portal-token revocations aren't timestamped with reason** (`revokedAt` only, no `revokedBy` / `reason`).
- **Platform-staff impersonation isn't branch-scoped** — synthetic ADMIN gets `locationIds: []`. Correct for support but no audit trail of which branches were viewed.
- **Announcements is a stub** (roadmap copy, no model).
- **CUSTOMER_PORTAL role in enum is never assigned** — safe but confusing; either remove or document as reserved.

---

## 19. Final summary

### 1. Complete list of all routes
See section 17 above.

### 2. Complete list of all roles
- Tenant: OWNER, ADMIN, SALES_REP, CSR, DESIGNER, PRODUCTION_MANAGER, INSTALLER, ACCOUNTING, EMPLOYEE, (CUSTOMER_PORTAL — unused).
- Platform: SUPER_ADMIN, SITE_MANAGER, SUPPORT_AGENT.
- Customer: token-based, no role.
- Guest: public allowlist.

### 3. Role permission matrix
See section 2 above.

### 4. Missing pages
- **No standalone staff Proof detail page.** Proof detail lives inside Order detail + on public `/share/[token]`. A dedicated `/t/[slug]/proofs/[id]` would help designers working proof-first.
- **No Payments list page.** `/t/[slug]/payments` is a KPI dashboard; there is no searchable list of all payment transactions with filters.
- **No Customer merge / dedupe page.** Duplicate customer records are a common CRM issue with no tool.
- **No Product variants / SKU matrix page.**
- **No Team member detail page.** `/t/[slug]/settings/team` shows rows; there's no per-member drill-down with their activity / orders / comments.
- **No per-conversation detail page for tenant-facing support tickets.** Staff submit via `/support/new` but cannot see what they submitted afterwards; `/platform/support/[id]` is admin-only.
- **No `/features` sub-routing.** Feature bento is a single page — no deep link to an individual feature.
- **No `/platform/notifications/[kind]` editor audited.** Schema says it exists but this audit didn't open the file.
- **Announcements feature is a stub.**

### 5. Duplicate / confusing pages
- **Tax & terms / numbering / branding** are editable in both Settings and Onboarding without visual cue.
- **Portal messages** appear in both `/messages` (central) and `/customers/[id]` Communication tab.
- **Proof-requires-approval flag** is on both `/settings/financial` and `/settings/workflow`.
- **Settings index vs sidebar** show the same items in card vs. sidebar form — redundant, but OK for discoverability.
- **Message Templates (canned emails)** vs **Checklist Templates** vs **Quote Templates** — three different "templates" routes, each under a different noun.
- `/platform/search` and `/t/[slug]/search` and command palette (⌘K) — three search surfaces with different scoping rules.

### 6. Pages that need UX improvement
- **Customer detail** — 8 tabs is dense; portal token form is buried in Overview.
- **Order detail** — multiple nested workflow systems (order status, production stage, install) with no clear visual hierarchy.
- **Team settings** — invite / members / suspended / transfer / pending all on one page; needs tabs as the org grows.
- **Production Board** — mobile unusable; "Ready to run" lens needs explanation.
- **Quote detail** — mix of auto-save and explicit-save behaviours is unclear.
- **Notifications page** — flat list across 9 domains; grouping would help.
- **Platform list pages** — 200-row hard caps instead of pagination.
- **Proofs list** — no preview thumbnails; version/round info is buried in the title.
- **Install calendar** — no drag-drop reschedule; "Needs attention" count ≠ blocker count.

### 7. Forms that are too cluttered
- **Team settings** — invite + members + suspend + transfer + pending invites in one page.
- **Install detail** — ~12 sections stacked linearly on left column (event details, logistics, site survey, checklist, issues, photos, signatures, wrap-up, send update, comments). Would benefit from tabs.
- **Quote detail Pricing tab** — discount / tax / margin / rush fee / deposit / approval thresholds mixed.
- **Customer edit form** — single flat form; no stepper or sectioning.
- **Order detail Production tab** — stages, material usage, defects, time tracking all inline.

### 8. Buttons / actions that are unclear
- **Quote editor** — "Save row" button on line-item edit is confusable with Cancel.
- **Attention feed** — sections appear/disappear based on dynamic windows; no threshold label.
- **Needs-attention install filter** — counts ALL issues, not just blockers, despite label implying blockers.
- **Production Board "Ready to run"** — computed state (upstream stages DONE) not labelled for new users.
- **Invoice header primary CTA** switches between "Mark sent" and "Record payment" based on status — intentional but jumpy.
- **Pipeline stage change** is a dropdown, not drag-drop — looks like a filter.

### 9. Features that appear unfinished
- **`/platform/announcements`** — explicit stub, no DB model.
- **Franchise group sharing** — child attachment is manual/support-gated; no invite-token flow.
- **Integrations page** — QuickBooks/Xero, Zapier, Slack are "coming soon" rows.
- **Platform notifications editor** (`/platform/notifications/[kind]`) — not fully audited; schema present but completeness unverified.
- **Home-page testimonial** still labelled "Placeholder Name".
- **Reset password page** (`/reset/[token]`) — referenced but not covered in this audit pass.
- **Email avatar upload** — settings/me accepts URL only.
- **TOTP onboarding** — otpauth URI shown without QR code.
- **Bulk actions everywhere** — no multi-select on list pages.
- **CSV export on staff list pages** — only reports have it.

### 10. Recommended page-cleanup plan

**Priority 1 (ship before launch):**
- Add a clear "Proofs" detail route at `/t/[slug]/proofs/[id]` so designers can work proof-first.
- Remove or document the `CUSTOMER_PORTAL` enum value (confusing dead code).
- Add QR-code rendering for TOTP setup.
- Replace "Placeholder Name" testimonial on marketing home.
- Collapse the duplicated proof-approval toggle to one canonical location (recommend `/settings/workflow`; keep a read-only mirror on `/settings/financial`).
- Add rate limits to `/portal/[token]`, `/q/[token]`, `/share/[token]`, and bulk admin actions.

**Priority 2 (next iteration):**
- Convert 200-row / 300-row platform page caps to proper pagination.
- Split `/settings/team` into three tabs (Members, Invites, Ownership).
- Split `/t/[slug]/installs/[id]` into tabs (Details, Site, Evidence, Comms) — currently one long scroll.
- Add "View proofs list from this customer" / "View inbox conversations with this customer" shortcut cards on customer detail.
- Add CSV export to Customers, Quotes, Orders, Invoices, Expenses list pages.
- Add a Team member detail page at `/t/[slug]/settings/team/[membershipId]`.
- Add a Customer merge flow.
- Add a Payments list page under `/t/[slug]/payments/all` or similar (keep current dashboard, add detail).

**Priority 3 (nice to have):**
- Surface the onboarding/settings duplication with a "This is also configurable from Settings" hint during onboarding.
- Add a standalone staff surface for viewing their own support tickets after submission.
- Complete the Announcements feature or remove the stub page.
- Replace the Pipeline stage dropdown with true drag-drop.
- Add a timezone select (not free text) on `/settings/locations`.
- Add a preview pane for Message Templates and Document Footers.
- Add grouping in `/t/[slug]/notifications` (group by domain, with collapse).
- Flesh out the Integrations page with real "disconnect / reconnect / test" for Stripe + Resend, and remove the three "coming soon" rows or ship them.
- Add offline cache to `/installs/[id]/field` (site data + photo queue).

---

*End of audit. ~135 page routes audited across staff, portal, platform, auth, and marketing surfaces.*
